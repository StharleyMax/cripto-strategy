"""`BinanceKlinesClient` wired to a FAKE connection — no socket, per `test.sh`.

Same shape as `test_binance_oi_history_client.py`'s `FakeConnection`/`FakeResponse`.

The load-bearing test of this file is `test_dod_7_...`: it proves the 12 fields of the array
survive the parsing layer, NAMING index [9] (`takerBuyBaseVol`). That is `DoD` item 7 of phase
`01`, and it is what keeps phase `02` (CVD) from becoming a second HTTP integration. Its
falsifier is `test_a_row_with_fewer_than_twelve_fields_is_refused`: the guard is only worth
something if a truncated array is REJECTED instead of quietly accepted.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from decimal import Decimal
from urllib.parse import parse_qs, urlsplit

import pytest

from src.modules.sentimento.infra.binance_klines_client import (
    CLOSE_PRICE_INDEX,
    FAPI_HOST,
    HIGH_PRICE_INDEX,
    KLINE_FIELD_COUNT,
    KLINE_FIELD_NAMES,
    KLINES_PATH,
    LOW_PRICE_INDEX,
    MAX_LIMIT,
    OPEN_PRICE_INDEX,
    OPEN_TIME_INDEX,
    TAKER_BUY_BASE_VOLUME_INDEX,
    VOLUME_INDEX,
    BinanceKlinesClient,
    KlineArityError,
    KlineRow,
    LimitOutOfRangeError,
    UnexpectedPayloadShapeError,
)


class FakeResponse:
    """A canned response, read exactly once."""

    def __init__(self, status: int, body: bytes) -> None:
        """Take the status line and the raw body to hand back."""
        self.status = status
        self._body = body

    def read(self) -> bytes:
        """Return the canned body."""
        return self._body


class FakeConnection:
    """Never opens a socket; replays one scripted response and records the request."""

    def __init__(self, host: str, response: FakeResponse) -> None:
        """Take the host it pretends to serve and the response to replay."""
        self.host = host
        self._response = response
        self.requests: list[tuple[str, str, Mapping[str, str]]] = []
        self.closed = False

    def request(
        self, method: str, url: str, body: None = None, headers: Mapping[str, str] | None = None
    ) -> None:
        """Record the request; the response was scripted at construction time."""
        self.requests.append((method, url, dict(headers or {})))

    def getresponse(self) -> FakeResponse:
        """Hand back the scripted response."""
        return self._response

    def close(self) -> None:
        """Mark the connection closed."""
        self.closed = True


def _client_for(status: int, body: object) -> tuple[BinanceKlinesClient, list[FakeConnection]]:
    """Build a client whose every connection replays `(status, json.dumps(body))`."""
    opened: list[FakeConnection] = []
    encoded = json.dumps(body).encode("utf-8")

    def factory(host: str) -> FakeConnection:
        connection = FakeConnection(host, FakeResponse(status, encoded))
        opened.append(connection)
        return connection

    return BinanceKlinesClient(connection_factory=factory), opened


# One real-shaped BTCUSDT 1m array. The two decimals are the ones MEASURED in
# `docs/context/cinco-metricas-do-core/handoff/ACHADO-KLINES-CVD.md`
# `[MEDIDO 2026-09-10, BTCUSDT 1m]`: volume 29.757, takerBuyBaseVol 2.626, delta -24.505.
ONE_KLINE: list[object] = [
    1_757_500_000_000,
    "112000.10",
    "112050.00",
    "111980.00",
    "112010.50",
    "29.757",
    1_757_500_059_999,
    "3333333.33",
    1_234,
    "2.626",
    "294000.00",
    "0",
]


def test_the_request_carries_symbol_interval_and_limit() -> None:
    """The periodic cycle sends no bounds: only `symbol`, `interval` and `limit` go on the wire."""
    client, opened = _client_for(200, [])
    client.klines("BTCUSDT", "1m", limit=1500)

    method, url, _ = opened[0].requests[0]
    assert method == "GET"
    assert opened[0].host == FAPI_HOST
    path, _, query = url.partition("?")
    assert path == KLINES_PATH
    params = parse_qs(query)
    assert params["symbol"] == ["BTCUSDT"]
    assert params["interval"] == ["1m"]
    assert params["limit"] == ["1500"]
    assert "startTime" not in params
    assert "endTime" not in params


def test_the_backfill_window_puts_both_bounds_on_the_wire() -> None:
    """The boot backfill walks a window, so both bounds are sent when the caller gives them."""
    client, opened = _client_for(200, [])
    client.klines("BTCUSDT", "1m", limit=1500, start_time_ms=1_000, end_time_ms=2_000)

    _, url, _ = opened[0].requests[0]
    params = parse_qs(url.partition("?")[2])
    assert params["startTime"] == ["1000"]
    assert params["endTime"] == ["2000"]


def test_url_is_a_valid_url_with_the_expected_host_and_path() -> None:
    """Sanity-check the assembled path against `urlsplit`, not just string containment."""
    client, opened = _client_for(200, [])
    client.klines("BTCUSDT", "1m", limit=100)

    _, url, _ = opened[0].requests[0]
    split = urlsplit(f"https://{FAPI_HOST}{url}")
    assert split.path == KLINES_PATH


def test_dod_7_all_twelve_fields_survive_parsing_including_index_9_takerbuybasevol() -> None:
    """`DoD-7`: the raw array reaches the caller whole, index [9] included.

    A client that projected only index [5] (`volume`) would force phase `02` to repeat the HTTP
    call. This asserts the WHOLE tuple, element by element, not just the two indexes phase `01`
    and phase `02` happen to read today.
    """
    client, _ = _client_for(200, [ONE_KLINE])
    response = client.klines("BTCUSDT", "1m", limit=1)

    (row,) = response.rows
    assert len(row.raw) == KLINE_FIELD_COUNT == 12
    assert row.raw == tuple(ONE_KLINE)
    assert KLINE_FIELD_NAMES[TAKER_BUY_BASE_VOLUME_INDEX] == "takerBuyBaseVol"
    assert TAKER_BUY_BASE_VOLUME_INDEX == 9
    assert row.raw[TAKER_BUY_BASE_VOLUME_INDEX] == "2.626"
    assert row.taker_buy_base_volume == "2.626"
    assert VOLUME_INDEX == 5
    assert row.volume == "29.757"
    assert row.open_time_ms == 1_757_500_000_000
    assert row.close_time_ms == 1_757_500_059_999


def test_phase_02_can_compute_cvd_from_the_preserved_row_without_a_new_call() -> None:
    """`2 * takerBuyBaseVol - volume` is computable from ONE response — the point of `1.4b`.

    The expected delta is the measured one: `-24.505` `[MEDIDO 2026-09-10, BTCUSDT 1m]`.
    """
    client, opened = _client_for(200, [ONE_KLINE])
    (row,) = client.klines("BTCUSDT", "1m", limit=1).rows

    delta = 2 * Decimal(row.taker_buy_base_volume) - Decimal(row.volume)

    assert delta == Decimal("-24.505")
    assert len(opened) == 1


# ── The four prices of the candle (`SPEC-008`/`D1`, plan `01` item 1.3, `T-01.2`) ──────────────
#
# `PRICE_ACCESSORS` is the table these tests read instead of re-typing four near-identical cases.
# It pairs each accessor NAME with the field name of `KLINE_FIELD_NAMES` it claims to quote, which
# is the pairing the whole task exists to make checkable: a swap of HIGH and LOW is invisible to
# every type check and to the arity guard, because both are decimal strings of the same shape.
PRICE_ACCESSORS: list[tuple[str, str]] = [
    ("open_price", "open"),
    ("high_price", "high"),
    ("low_price", "low"),
    ("close_price", "close"),
]


def test_the_four_prices_are_read_by_name_from_the_array_that_was_already_paid_for() -> None:
    """`RF-1`: `open`/`high`/`low`/`close` reach the caller, from the SAME response as `volume`.

    Before this task the client had four named indexes and none of them was a price, so the four
    numbers the candle is made of arrived in every page and were discarded (`SPEC-008` §3.1).
    """
    client, opened = _client_for(200, [ONE_KLINE])
    (row,) = client.klines("BTCUSDT", "1m", limit=1).rows

    assert row.open_price == "112000.10"
    assert row.high_price == "112050.00"
    assert row.low_price == "111980.00"
    assert row.close_price == "112010.50"
    assert len(opened) == 1


@pytest.mark.parametrize(("accessor", "field_name"), PRICE_ACCESSORS)
def test_each_price_accessor_is_pinned_to_its_own_field_name(
    accessor: str, field_name: str
) -> None:
    """The falsifier of the four accessors: prove each one reads ITS field and not a neighbour.

    The row below carries, at every position, the NAME of that position. So the assertion binds
    the accessor to a field name rather than to a number, and it MORDE on exactly the mutation
    that no other gate here can see: swapping `HIGH_PRICE_INDEX` with `LOW_PRICE_INDEX` (or
    letting `open_price` slide onto index [0], `openTime`) keeps the arity, keeps the types, keeps
    `ruff` and `mypy` green — and fails this test.
    """
    row = KlineRow(raw=tuple(KLINE_FIELD_NAMES))

    assert getattr(row, accessor) == field_name


def test_the_four_price_indexes_are_one_through_four_and_collide_with_nothing() -> None:
    """`[1..4]` is the contract; and `open` is NOT `openTime`, which is the off-by-one to fear."""
    price_indexes = (OPEN_PRICE_INDEX, HIGH_PRICE_INDEX, LOW_PRICE_INDEX, CLOSE_PRICE_INDEX)

    assert price_indexes == (1, 2, 3, 4)
    named = (*price_indexes, OPEN_TIME_INDEX, VOLUME_INDEX, TAKER_BUY_BASE_VOLUME_INDEX)
    assert len(set(named)) == len(named)
    assert OPEN_PRICE_INDEX != OPEN_TIME_INDEX


def test_a_price_keeps_the_exact_decimal_the_exchange_quoted() -> None:
    """A price is handed over as the exact string, never a float — trailing zeros included.

    `"112050.00"` parsed as a float and re-rendered would be `112050.0`; the digit lost is the
    one that says how precisely the exchange quoted. Same property `volume` already defends
    (`binance_klines_client.py`, the header note on `KlineField`).
    """
    client, _ = _client_for(200, [ONE_KLINE])
    (row,) = client.klines("BTCUSDT", "1m", limit=1).rows

    assert row.high_price.endswith(".00")
    assert Decimal(row.high_price) > Decimal(row.low_price)
    assert Decimal(row.low_price) <= Decimal(row.open_price) <= Decimal(row.high_price)
    assert Decimal(row.low_price) <= Decimal(row.close_price) <= Decimal(row.high_price)


def test_a_truncated_array_cannot_hand_back_a_price_at_all() -> None:
    """The arity guard is what keeps a short row from answering `low_price` with a neighbour.

    Without `KlineArityError`, a row cut at index [3] would still have SOMETHING at
    `LOW_PRICE_INDEX` and the accessor would return it — a plausible decimal string, wrong by one
    position, with nothing to reject it.
    """
    truncated = ONE_KLINE[: LOW_PRICE_INDEX + 1]
    client, _ = _client_for(200, [truncated])

    with pytest.raises(KlineArityError):
        client.klines("BTCUSDT", "1m", limit=1)


def test_a_row_with_fewer_than_twelve_fields_is_refused() -> None:
    """The falsifier of `DoD-7`: a truncated array must FAIL, never be silently accepted.

    Without this, "the 12 fields are preserved" would be a claim no case can break — the row
    below is exactly what a client that projected the array down would hand its caller.
    """
    truncated = [value for index, value in enumerate(ONE_KLINE) if index in (0, VOLUME_INDEX)]
    client, _ = _client_for(200, [truncated])

    with pytest.raises(KlineArityError) as raised:
        client.klines("BTCUSDT", "1m", limit=1)

    assert "12 fields" in str(raised.value)


def test_a_row_with_more_than_twelve_fields_is_refused_too() -> None:
    """A 13th field means the contract moved; accepting it would hide a schema change."""
    with pytest.raises(KlineArityError):
        KlineRow(raw=(*[str(index) for index in range(KLINE_FIELD_COUNT)], "13th"))


def test_an_error_envelope_is_parsed_as_an_api_code_with_zero_rows() -> None:
    """`{"code": -1121, "msg": ...}` becomes `api_code=-1121`, never a fake empty success."""
    client, _ = _client_for(400, {"code": -1121, "msg": "Invalid symbol."})
    response = client.klines("NOSUCHUSDT", "1m", limit=1)

    assert response.status == 400
    assert response.api_code == -1121
    assert response.rows == ()


def test_a_list_body_is_parsed_as_rows_with_no_api_code() -> None:
    """A successful `[...]` body becomes rows, `api_code=None` — the XOR holds on both sides."""
    client, _ = _client_for(200, [ONE_KLINE, ONE_KLINE])
    response = client.klines("BTCUSDT", "1m", limit=2)

    assert response.api_code is None
    assert len(response.rows) == 2


def test_a_body_that_is_neither_envelope_nor_list_is_refused() -> None:
    """An unexpected shape raises instead of degrading to zero rows, which would read as 'empty'."""
    client, _ = _client_for(200, {"unexpected": "shape"})

    with pytest.raises(UnexpectedPayloadShapeError):
        client.klines("BTCUSDT", "1m", limit=1)


def test_a_kline_that_is_not_an_array_is_refused() -> None:
    """A list of objects is not a list of klines; parsing must say so, not guess."""
    client, _ = _client_for(200, [{"openTime": 1}])

    with pytest.raises(UnexpectedPayloadShapeError):
        client.klines("BTCUSDT", "1m", limit=1)


@pytest.mark.parametrize("bad_field", [1.5, True, None])
def test_a_field_of_a_type_the_endpoint_never_sends_is_refused(bad_field: object) -> None:
    """Refuse a JSON type this endpoint never sends.

    Floats, booleans and nulls never appear in a kline; silently keeping one would lose the exact
    decimal the exchange quoted.
    """
    payload = [[*ONE_KLINE[:VOLUME_INDEX], bad_field, *ONE_KLINE[VOLUME_INDEX + 1 :]]]
    client, _ = _client_for(200, payload)

    with pytest.raises(UnexpectedPayloadShapeError):
        client.klines("BTCUSDT", "1m", limit=1)


@pytest.mark.parametrize("limit", [0, -1, MAX_LIMIT + 1])
def test_a_limit_outside_the_endpoint_ceiling_costs_no_round_trip(limit: int) -> None:
    """`1..1500` is checked before a connection is opened — quota is not spent on a caller bug."""
    client, opened = _client_for(200, [])

    with pytest.raises(LimitOutOfRangeError):
        client.klines("BTCUSDT", "1m", limit=limit)

    assert opened == []


def test_the_ceiling_of_1500_is_accepted() -> None:
    """1500 is the documented maximum, so it is inside the range, not outside it."""
    client, opened = _client_for(200, [])
    client.klines("BTCUSDT", "1m", limit=MAX_LIMIT)

    assert len(opened) == 1


def test_each_call_opens_and_closes_its_own_connection() -> None:
    """No pool to leak or to serve a stale response — one connection per page."""
    client, opened = _client_for(200, [])
    client.klines("BTCUSDT", "1m", limit=1)
    client.klines("ETHUSDT", "1m", limit=1)

    assert len(opened) == 2
    assert all(connection.closed for connection in opened)


def test_the_connection_is_closed_even_when_parsing_raises() -> None:
    """A refused payload must not leak the socket the refusal was read from."""
    client, opened = _client_for(200, [[1, 2, 3]])

    with pytest.raises(KlineArityError):
        client.klines("BTCUSDT", "1m", limit=1)

    assert opened[0].closed


def test_user_agent_identifies_the_caller() -> None:
    """An honest `User-Agent`, same pattern as the sibling Binance clients."""
    client, opened = _client_for(200, [])
    client.klines("BTCUSDT", "1m", limit=1)

    user_agent = opened[0].requests[0][2]["User-Agent"]
    assert "T-01.2" in user_agent
