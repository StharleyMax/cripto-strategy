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
    FAPI_HOST,
    KLINE_FIELD_COUNT,
    KLINE_FIELD_NAMES,
    KLINES_PATH,
    MAX_LIMIT,
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
