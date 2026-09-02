"""`p99`+`n`+`lag_resolution_s`+`lag_window` as COLUMNS, keyed by `(endpoint, observer_region)`."""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.availability_lag import AvailabilityLagSample
from src.modules.sentimento.domain.availability_lag_stats import (
    LAG_STAT_NAME,
    EmptyLagSampleError,
    LagSummaryRow,
    p99,
    summarize_lag,
)
from src.modules.sentimento.domain.availability_poll import (
    AvailabilityPollAttempt,
    AvailabilityPollOutcome,
)
from src.modules.sentimento.domain.provenance import AvailabilitySource

SOURCE = "binance-futures-data"
ENDPOINT = "openInterestHist"
REGION = "unknown"


def _sample(lag_ms: int, symbol: str = "BTCUSDT") -> AvailabilityLagSample:
    return AvailabilityLagSample(
        source=SOURCE,
        endpoint=ENDPOINT,
        symbol=symbol,
        observer_region=REGION,
        event_time_ms=1_000_000,
        available_at_ms=1_000_000 + lag_ms,
        availability_source=AvailabilitySource.OBSERVED,
    )


def _attempt(polled_at_ms: int, symbol: str = "BTCUSDT") -> AvailabilityPollAttempt:
    return AvailabilityPollAttempt(
        source=SOURCE,
        endpoint=ENDPOINT,
        symbol=symbol,
        observer_region=REGION,
        polled_at_ms=polled_at_ms,
        outcome=AvailabilityPollOutcome(status=200, latest_event_time_ms=1_000_000),
    )


def test_p99_of_a_single_value_is_that_value() -> None:
    """`p99` of a single value is that value."""
    assert p99([150]) == 150


def test_p99_uses_nearest_rank_not_interpolation() -> None:
    """100 values 1..100: `ceil(0.99*100)=99`th smallest, i.e. the value `99`."""
    assert p99(list(range(1, 101))) == 99


def test_p99_of_empty_raises() -> None:
    """`p99` of an empty sequence raises `EmptyLagSampleError`."""
    with pytest.raises(EmptyLagSampleError):
        p99([])


def test_summarize_groups_by_endpoint_and_observer_region_not_by_symbol() -> None:
    """`summarize_lag` groups by `(endpoint, observer_region)`, never by symbol."""
    samples = [_sample(100, "BTCUSDT"), _sample(200, "ETHUSDT")]
    attempts = [_attempt(0, "BTCUSDT"), _attempt(1, "BTCUSDT"), _attempt(0, "ETHUSDT")]

    rows = summarize_lag(samples, attempts, {SOURCE: 10.0})

    assert len(rows) == 1
    row = rows[0]
    assert row.endpoint == ENDPOINT
    assert row.observer_region == REGION
    assert row.lag_n == 2
    assert row.lag_stat == LAG_STAT_NAME == "p99"


def test_a_key_with_polls_but_zero_transitions_still_gets_a_row() -> None:
    """`D3.4`: the ratio has to be VISIBLE even where the probe learned nothing yet."""
    attempts = [_attempt(0), _attempt(10_000), _attempt(20_000)]

    rows = summarize_lag([], attempts, {SOURCE: 10.0})

    assert len(rows) == 1
    row = rows[0]
    assert row.lag_n == 0
    assert row.lag_p99_ms is None
    assert row.total_polls == 3
    assert row.observed_ratio == 0.0


def test_observed_ratio_divides_transitions_by_every_polled_line() -> None:
    """`observed_ratio` divides transitions by every polled line, not a sample of them."""
    samples = [_sample(50), _sample(60)]
    attempts = [_attempt(i * 1_000) for i in range(10)]

    rows = summarize_lag(samples, attempts, {SOURCE: 10.0})

    assert rows[0].lag_n == 2
    assert rows[0].total_polls == 10
    assert rows[0].observed_ratio == pytest.approx(0.2)


def test_lag_resolution_and_window_are_read_off_the_probe_not_derived_from_samples() -> None:
    """`lag_resolution_s`/`lag_window_s` are read off the probe, never derived from samples."""
    attempts = [_attempt(0), _attempt(30_000)]

    rows = summarize_lag([], attempts, {SOURCE: 10.0})

    assert rows[0].lag_resolution_s == 10.0
    assert rows[0].lag_window_s == 30


def test_no_attempts_at_all_produces_no_rows() -> None:
    """No attempts at all produces no rows."""
    assert summarize_lag([], [], {}) == ()


def test_a_row_cannot_disagree_with_itself_about_whether_anything_was_observed() -> None:
    """A row cannot disagree with itself about whether anything was observed."""
    with pytest.raises(ValueError, match="concordar"):
        LagSummaryRow(
            endpoint=ENDPOINT,
            observer_region=REGION,
            lag_stat="p99",
            lag_p99_ms=None,
            lag_n=1,
            lag_resolution_s=10.0,
            lag_window_s=10,
            total_polls=5,
        )


def test_a_row_cannot_claim_more_transitions_than_polls() -> None:
    """A row cannot claim more transitions than polls."""
    with pytest.raises(ValueError, match="nao ha mais transicao"):
        LagSummaryRow(
            endpoint=ENDPOINT,
            observer_region=REGION,
            lag_stat="p99",
            lag_p99_ms=100,
            lag_n=5,
            lag_resolution_s=10.0,
            lag_window_s=10,
            total_polls=3,
        )
