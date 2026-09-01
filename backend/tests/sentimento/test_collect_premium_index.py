"""One cycle at a time: transport, decode and payload failures never reach the sink."""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.premium_index_batch import PremiumIndexReading
from src.modules.sentimento.use_cases.collect_premium_index import (
    PremiumIndexCycleStage,
    RawPremiumIndexFetch,
    collect_premium_index_once,
)

_WEIGHT_HEADER = "x-mbx-used-weight-1m"

_VALID_BODY = (
    b'[{"symbol":"BTCUSDT","markPrice":"1","indexPrice":"1","estimatedSettlePrice":"1",'
    b'"lastFundingRate":"0.0001","interestRate":"0.0001","nextFundingTime":1,"time":1}]'
)


class _FakeFetcher:
    """Returns one scripted `RawPremiumIndexFetch`, never touching a socket."""

    def __init__(self, fetch: RawPremiumIndexFetch) -> None:
        """Bind the single response this fetcher will hand back."""
        self._fetch = fetch

    def fetch(self) -> RawPremiumIndexFetch:
        """Return the scripted fetch."""
        return self._fetch


class _RecordingSink:
    """Records every `write()` call instead of touching disk."""

    def __init__(self) -> None:
        """Start with an empty log."""
        self.calls: list[tuple[int, tuple[PremiumIndexReading, ...]]] = []

    def write(self, received_at: int, readings: tuple[PremiumIndexReading, ...]) -> None:
        """Record the call."""
        self.calls.append((received_at, readings))


# ── `RawPremiumIndexFetch.__post_init__` — the same control `ProbeObservation` has ──────────


def test_raw_fetch_rejects_both_status_and_transport_error() -> None:
    """A fetch cannot claim to have both succeeded and failed to dispatch."""
    with pytest.raises(ValueError, match="either an HTTP status or a transport_error"):
        RawPremiumIndexFetch(status=200, body=b"[]", transport_error="boom")


def test_raw_fetch_rejects_neither_status_nor_transport_error() -> None:
    """A fetch cannot be silent about whether it dispatched."""
    with pytest.raises(ValueError, match="either an HTTP status or a transport_error"):
        RawPremiumIndexFetch()


def test_raw_fetch_rejects_a_dispatched_call_with_no_body() -> None:
    """A dispatched fetch always carries SOME body, even if it is empty bytes."""
    with pytest.raises(ValueError, match="must carry a body"):
        RawPremiumIndexFetch(status=200, body=None)


def test_raw_fetch_header_lookup_is_case_insensitive() -> None:
    """Header names arrive lower-cased over HTTP/2; the lookup must not depend on casing."""
    fetch = RawPremiumIndexFetch(status=200, body=b"[]", headers={"X-Mbx-Used-Weight-1M": "41"})
    assert fetch.header("x-mbx-used-weight-1m") == "41"
    assert fetch.header("absent-header") is None


# ── `collect_premium_index_once` — one stage per failure, and success writes exactly once ───


def test_transport_error_never_reaches_the_sink() -> None:
    """A transport failure produces zero symbols and the sink is never called."""
    sink = _RecordingSink()
    fetcher = _FakeFetcher(RawPremiumIndexFetch(transport_error="TimeoutError: boom"))

    result = collect_premium_index_once(
        fetcher, sink, received_at=1_000, weight_header=_WEIGHT_HEADER
    )

    assert result.stage == PremiumIndexCycleStage.TRANSPORT
    assert result.n_symbols == 0
    assert result.succeeded is False
    assert sink.calls == []


def test_undecodable_body_stops_at_decode_and_never_reaches_the_sink() -> None:
    """Invalid JSON is a DECODE failure, distinct from a structurally invalid batch."""
    sink = _RecordingSink()
    fetcher = _FakeFetcher(RawPremiumIndexFetch(status=200, body=b"not json"))

    result = collect_premium_index_once(
        fetcher, sink, received_at=1_000, weight_header=_WEIGHT_HEADER
    )

    assert result.stage == PremiumIndexCycleStage.DECODE
    assert result.n_symbols == 0
    assert sink.calls == []


def test_valid_json_that_is_not_a_batch_stops_at_payload_and_never_reaches_the_sink() -> None:
    """Well-formed JSON that fails the domain's shape check is a PAYLOAD failure, not a crash."""
    sink = _RecordingSink()
    fetcher = _FakeFetcher(RawPremiumIndexFetch(status=200, body=b'{"not": "a list"}'))

    result = collect_premium_index_once(
        fetcher, sink, received_at=1_000, weight_header=_WEIGHT_HEADER
    )

    assert result.stage == PremiumIndexCycleStage.PAYLOAD
    assert result.n_symbols == 0
    assert sink.calls == []
    assert result.detail is not None and "not a list" in result.detail


def test_success_writes_once_and_reports_the_universe() -> None:
    """A valid batch is written exactly once, and the result carries `n_symbols` + weight."""
    sink = _RecordingSink()
    fetcher = _FakeFetcher(
        RawPremiumIndexFetch(status=200, body=_VALID_BODY, headers={_WEIGHT_HEADER: "41"})
    )

    result = collect_premium_index_once(
        fetcher, sink, received_at=1_700_000_000_000, weight_header=_WEIGHT_HEADER
    )

    assert result.stage == PremiumIndexCycleStage.WRITTEN
    assert result.succeeded is True
    assert result.n_symbols == 1
    assert result.weight_used == 41
    assert result.status == 200
    assert len(sink.calls) == 1
    received_at, readings = sink.calls[0]
    assert received_at == 1_700_000_000_000
    assert readings[0].symbol == "BTCUSDT"


def test_missing_weight_header_reports_none_not_zero() -> None:
    """A header that never arrived is `None`, and `None` must never be read as "zero weight"."""
    sink = _RecordingSink()
    fetcher = _FakeFetcher(RawPremiumIndexFetch(status=200, body=_VALID_BODY, headers={}))

    result = collect_premium_index_once(
        fetcher, sink, received_at=1_000, weight_header=_WEIGHT_HEADER
    )

    assert result.succeeded is True
    assert result.weight_used is None


def test_a_non_numeric_weight_header_is_reported_as_absent() -> None:
    """A header present but unparsable as an integer is treated the same as absent, never 0."""
    sink = _RecordingSink()
    fetcher = _FakeFetcher(
        RawPremiumIndexFetch(status=200, body=_VALID_BODY, headers={_WEIGHT_HEADER: "not-a-number"})
    )

    result = collect_premium_index_once(
        fetcher, sink, received_at=1_000, weight_header=_WEIGHT_HEADER
    )

    assert result.weight_used is None
