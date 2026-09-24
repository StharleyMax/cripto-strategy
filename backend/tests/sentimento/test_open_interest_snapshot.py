"""`T-03.1` domain: a `/fapi/v1/openInterest` body is read at the SOURCE's `time`, never ours.

Every body below was READ from Binance, not written by hand (reading the origin is not seeding —
nothing here touches any Postgres):

    curl -sS -D hdr.txt "https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT"
    -> 2026-09-24, request sent at epoch-ms 1790287796821 (`date +%s%3N` right before `curl`)
    -> HTTP/2 200, x-mbx-used-weight-1m: 1
    -> {"symbol":"BTCUSDT","openInterest":"96012.544","time":1790287793703}

    curl -sS -D hdr.txt "https://fapi.binance.com/fapi/v1/openInterest?symbol=ETHUSDT"
    -> {"symbol":"ETHUSDT","openInterest":"2273930.468","time":1790287791035}
"""

from __future__ import annotations

import json

import pytest

from src.modules.sentimento.domain.open_interest_snapshot import (
    InvalidOpenInterestSnapshotError,
    OpenInterestFetch,
    OpenInterestFetchOutcome,
    OpenInterestSnapshot,
    parse_open_interest_snapshot,
    read_used_weight,
)

REAL_BTC_BODY = b'{"symbol":"BTCUSDT","openInterest":"96012.544","time":1790287793703}'
REAL_ETH_BODY = b'{"symbol":"ETHUSDT","openInterest":"2273930.468","time":1790287791035}'
REAL_BTC_TIME_MS = 1_790_287_793_703
REAL_BTC_REQUEST_SENT_MS = 1_790_287_796_821


def _real_btc_payload() -> dict[str, object]:
    """Decode the captured BTCUSDT body afresh, so a test may mutate its copy."""
    decoded: dict[str, object] = json.loads(REAL_BTC_BODY)
    return decoded


def test_the_event_time_is_the_responses_time_and_not_the_request_instant() -> None:
    """The central rule of `T-03.1`: `event_time_ms` is `time`, which is OLDER than the request.

    The capture itself is the proof that the two instants differ: Binance served a reading taken
    3.1 s BEFORE the request left this machine. A parser that stamped "now" would have put this
    value one admission window (`T-03.2`, `[T, T + 20 s]`) away from where it belongs.
    """
    snapshot = parse_open_interest_snapshot(json.loads(REAL_BTC_BODY), "BTCUSDT")

    assert snapshot.event_time_ms == REAL_BTC_TIME_MS
    assert snapshot.event_time_ms < REAL_BTC_REQUEST_SENT_MS
    assert REAL_BTC_REQUEST_SENT_MS - snapshot.event_time_ms == 3_118


def test_the_value_travels_as_the_exact_string_the_source_sent() -> None:
    """`ADR-034/D7`: `value_raw` is the source's spelling, trailing zeros too, never `float`."""
    payload = _real_btc_payload()
    payload["openInterest"] = "96012.5440"

    snapshot = parse_open_interest_snapshot(payload, "BTCUSDT")

    assert snapshot.open_interest_raw == "96012.5440"
    assert snapshot.symbol == "BTCUSDT"


def test_an_answer_for_another_symbol_is_refused() -> None:
    """Four symbols share the collector's loop; ETH contracts must never land under BTC."""
    with pytest.raises(InvalidOpenInterestSnapshotError, match="ETHUSDT"):
        parse_open_interest_snapshot(json.loads(REAL_ETH_BODY), "BTCUSDT")


@pytest.mark.parametrize(
    "payload",
    [
        [],
        [{"symbol": "BTCUSDT", "openInterest": "1", "time": 1}],
        96012.544,
        None,
    ],
    ids=["empty-array", "array-of-one", "bare-number", "null"],
)
def test_a_body_that_is_not_an_object_is_refused(payload: object) -> None:
    """Only a JSON object is a reading; anything else is refused before any field is read."""
    with pytest.raises(InvalidOpenInterestSnapshotError, match="not a JSON object"):
        parse_open_interest_snapshot(payload, "BTCUSDT")


@pytest.mark.parametrize(
    "value",
    [96012.544, "", "   ", None],
    ids=["json-number", "empty", "blank", "missing"],
)
def test_an_open_interest_that_is_not_a_nonblank_string_is_refused(value: object) -> None:
    """A JSON number already lost digits to `float` on decode; the source sends a string."""
    payload = _real_btc_payload()
    if value is None:
        del payload["openInterest"]
    else:
        payload["openInterest"] = value

    with pytest.raises(InvalidOpenInterestSnapshotError, match="openInterest"):
        parse_open_interest_snapshot(payload, "BTCUSDT")


@pytest.mark.parametrize(
    "value",
    ["abc", "-1", "NaN", "Infinity"],
    ids=["not-a-decimal", "negative", "nan", "infinity"],
)
def test_an_open_interest_that_is_not_a_finite_nonnegative_decimal_is_refused(value: str) -> None:
    """A contract count is a finite decimal `>= 0`; anything else would reach `md.series` broken."""
    payload = _real_btc_payload()
    payload["openInterest"] = value

    with pytest.raises(InvalidOpenInterestSnapshotError, match="open_interest_raw"):
        parse_open_interest_snapshot(payload, "BTCUSDT")


def test_a_zero_contract_count_is_admitted() -> None:
    """Zero is a legitimate value (a delisted book), distinct from an absent reading (`RN-4`)."""
    payload = _real_btc_payload()
    payload["openInterest"] = "0.000"

    assert parse_open_interest_snapshot(payload, "BTCUSDT").open_interest_raw == "0.000"


@pytest.mark.parametrize(
    "value",
    [True, "1790287793703", 1790287793703.0, None],
    ids=["bool", "string", "float", "missing"],
)
def test_a_time_that_is_not_an_integer_is_refused(value: object) -> None:
    """`bool` is an `int` in Python, so it is refused by name; a string or float is not `time`."""
    payload = _real_btc_payload()
    if value is None:
        del payload["time"]
    else:
        payload["time"] = value

    with pytest.raises(InvalidOpenInterestSnapshotError, match="integer 'time'"):
        parse_open_interest_snapshot(payload, "BTCUSDT")


@pytest.mark.parametrize("event_time_ms", [0, -1], ids=["zero", "negative"])
def test_a_snapshot_needs_a_positive_event_time(event_time_ms: int) -> None:
    """Epoch 0 is the value an unset field defaults to, not an instant Binance measured."""
    with pytest.raises(InvalidOpenInterestSnapshotError, match="positive"):
        OpenInterestSnapshot(symbol="BTCUSDT", open_interest_raw="1", event_time_ms=event_time_ms)


def test_a_snapshot_needs_a_symbol() -> None:
    """A reading of no symbol cannot be routed to any of the four series."""
    with pytest.raises(InvalidOpenInterestSnapshotError, match="symbol"):
        OpenInterestSnapshot(symbol=" ", open_interest_raw="1", event_time_ms=1)


_SNAPSHOT = OpenInterestSnapshot(
    symbol="BTCUSDT", open_interest_raw="96012.544", event_time_ms=REAL_BTC_TIME_MS
)


@pytest.mark.parametrize(
    ("outcome", "status", "weight", "snapshot", "failure", "match"),
    [
        (OpenInterestFetchOutcome.READ, 200, 1, None, "x", "XOR"),
        (OpenInterestFetchOutcome.READ, 200, 1, _SNAPSHOT, "x", "XOR"),
        (OpenInterestFetchOutcome.HTTP_STATUS, 400, 1, _SNAPSHOT, None, "XOR"),
        (OpenInterestFetchOutcome.PAYLOAD, 200, 1, None, None, "XOR"),
        (OpenInterestFetchOutcome.TRANSPORT, 200, None, None, "x", "only a TRANSPORT"),
        (OpenInterestFetchOutcome.HTTP_STATUS, None, None, None, "x", "only a TRANSPORT"),
        (OpenInterestFetchOutcome.TRANSPORT, None, 1, None, "x", "cannot carry a weight"),
        (OpenInterestFetchOutcome.READ, 204, 1, _SNAPSHOT, None, "status 200"),
    ],
    ids=[
        "read-without-snapshot",
        "read-with-failure",
        "failure-with-snapshot",
        "failure-without-reason",
        "transport-with-status",
        "status-failure-without-status",
        "transport-with-weight",
        "read-not-200",
    ],
)
def test_a_fetch_that_contradicts_its_outcome_is_refused(
    outcome: OpenInterestFetchOutcome,
    status: int | None,
    weight: int | None,
    snapshot: OpenInterestSnapshot | None,
    failure: str | None,
    match: str,
) -> None:
    """Each outcome has exactly one legal shape, so a caller never meets a half-filled fetch."""
    with pytest.raises(ValueError, match=match):
        OpenInterestFetch(
            symbol="BTCUSDT",
            outcome=outcome,
            status=status,
            weight_used=weight,
            snapshot=snapshot,
            failure=failure,
        )


def test_a_fetch_cannot_carry_another_symbols_snapshot() -> None:
    """The fetch's symbol and its snapshot's symbol are the same, or the fetch is refused."""
    with pytest.raises(ValueError, match="carries a snapshot of 'BTCUSDT'"):
        OpenInterestFetch(
            symbol="ETHUSDT",
            outcome=OpenInterestFetchOutcome.READ,
            status=200,
            weight_used=1,
            snapshot=_SNAPSHOT,
            failure=None,
        )


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("1", 1), (" 19 ", 19), (None, None), ("", None), ("1.5", None), ("n/a", None)],
    ids=["plain", "padded", "absent", "empty", "fraction", "text"],
)
def test_the_used_weight_is_read_or_declared_unreadable(
    raw: str | None, expected: int | None
) -> None:
    """An unreadable header is `None` ("not observed"), never coerced into a count of zero."""
    assert read_used_weight(raw) == expected
