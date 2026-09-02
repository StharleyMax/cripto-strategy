"""`classify_transitions`: the FIRST successful read is a baseline, never a sample."""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.availability_lag import (
    AvailabilityLagSample,
    classify_transitions,
)
from src.modules.sentimento.domain.availability_poll import (
    AvailabilityPollAttempt,
    AvailabilityPollOutcome,
)
from src.modules.sentimento.domain.provenance import AvailabilitySource

SOURCE = "binance-futures-data"
ENDPOINT = "openInterestHist"
SYMBOL = "BTCUSDT"
REGION = "unknown"


def _attempt(
    polled_at_ms: int,
    *,
    event_time_ms: int | None = None,
    status: int | None = 200,
    transport_error: str | None = None,
    symbol: str = SYMBOL,
    endpoint: str = ENDPOINT,
) -> AvailabilityPollAttempt:
    return AvailabilityPollAttempt(
        source=SOURCE,
        endpoint=endpoint,
        symbol=symbol,
        observer_region=REGION,
        polled_at_ms=polled_at_ms,
        outcome=AvailabilityPollOutcome(
            status=status, transport_error=transport_error, latest_event_time_ms=event_time_ms
        ),
    )


def test_the_first_successful_read_is_a_baseline_and_produces_no_sample() -> None:
    """The FIRST successful read of a target is a baseline, never a sample."""
    samples = classify_transitions([_attempt(1_000, event_time_ms=500_000)])

    assert samples == ()


def test_a_repeated_event_time_is_not_a_transition() -> None:
    """A repeated `event_time` across polls is not a transition."""
    attempts = [
        _attempt(1_000, event_time_ms=500_000),
        _attempt(2_000, event_time_ms=500_000),
        _attempt(3_000, event_time_ms=500_000),
    ]

    assert classify_transitions(attempts) == ()


def test_a_new_event_time_produces_exactly_one_sample_stamped_at_the_poll_that_saw_it() -> None:
    """A new `event_time` produces exactly one sample, stamped at the poll that saw it."""
    attempts = [
        _attempt(1_000, event_time_ms=500),
        _attempt(11_000, event_time_ms=8_000),
    ]

    samples = classify_transitions(attempts)

    assert len(samples) == 1
    sample = samples[0]
    assert sample.event_time_ms == 8_000
    assert sample.available_at_ms == 11_000
    assert sample.lag_ms == 11_000 - 8_000
    assert sample.availability_source is AvailabilitySource.OBSERVED
    assert sample.source == SOURCE
    assert sample.endpoint == ENDPOINT
    assert sample.symbol == SYMBOL
    assert sample.observer_region == REGION


def test_two_transitions_reproduce_the_predecessor_measurements_definition() -> None:
    """`docs/plataforma-superficies-e-faseamento.md:414`: "n=2 transicoes, 1 simbolo, 10 min"."""
    attempts = [
        _attempt(0, event_time_ms=0),
        _attempt(300_000, event_time_ms=295_000),
        _attempt(600_000, event_time_ms=595_000),
    ]

    samples = classify_transitions(attempts)

    assert len(samples) == 2
    assert [s.event_time_ms for s in samples] == [295_000, 595_000]


def test_a_failed_poll_is_skipped_and_does_not_reset_the_baseline() -> None:
    """A failed poll (status or transport error) is skipped and does not reset the baseline."""
    attempts = [
        _attempt(1_000, event_time_ms=500),
        _attempt(2_000, status=429),
        _attempt(3_000, status=None, transport_error="ConnectionResetError: reset"),
        _attempt(11_000, event_time_ms=8_000),
    ]

    samples = classify_transitions(attempts)

    assert len(samples) == 1
    assert samples[0].event_time_ms == 8_000
    assert samples[0].available_at_ms == 11_000


def test_a_200_with_nothing_to_read_yet_is_skipped_like_a_failure() -> None:
    """`latest_event_time_ms is None` on a `200` is a legitimate empty answer, not a transition."""
    attempts = [
        _attempt(1_000, event_time_ms=500),
        _attempt(2_000, status=200, event_time_ms=None),
        _attempt(11_000, event_time_ms=8_000),
    ]

    samples = classify_transitions(attempts)

    assert len(samples) == 1
    assert samples[0].available_at_ms == 11_000


def test_independent_targets_are_classified_independently() -> None:
    """Two independent targets are classified independently of each other."""
    attempts = [
        _attempt(1_000, event_time_ms=500, symbol="BTCUSDT"),
        _attempt(1_000, event_time_ms=900, symbol="ETHUSDT"),
        _attempt(11_000, event_time_ms=8_000, symbol="BTCUSDT"),
        _attempt(11_000, event_time_ms=900, symbol="ETHUSDT"),  # unchanged for ETH
    ]

    samples = classify_transitions(attempts)

    assert len(samples) == 1
    assert samples[0].symbol == "BTCUSDT"


def test_different_endpoints_do_not_share_a_baseline() -> None:
    """Two endpoints for the same symbol do not share a baseline."""
    attempts = [
        _attempt(1_000, event_time_ms=500_000, endpoint="openInterestHist"),
        _attempt(1_000, event_time_ms=500_000, endpoint="takerlongshortRatio"),
        _attempt(11_000, event_time_ms=500_000, endpoint="takerlongshortRatio"),
    ]

    # `takerlongshortRatio` saw its OWN baseline at 1_000, so the repeat at 11_000 is NOT new —
    # only `openInterestHist`'s single read exists, also a baseline. Zero samples either way.
    assert classify_transitions(attempts) == ()


def test_out_of_order_attempts_are_sorted_before_classification() -> None:
    """A caller owes this function no ordering — it sorts by `polled_at_ms` itself."""
    attempts = [
        _attempt(11_000, event_time_ms=8_000),
        _attempt(1_000, event_time_ms=500),
    ]

    samples = classify_transitions(attempts)

    assert len(samples) == 1
    assert samples[0].event_time_ms == 8_000


def test_classify_of_no_attempts_returns_nothing() -> None:
    """Classifying no attempts at all returns nothing."""
    assert classify_transitions([]) == ()


def test_a_sample_cannot_claim_knowledge_before_the_fact_happened() -> None:
    """A sample cannot claim knowledge before the fact happened."""
    with pytest.raises(ValueError, match="before the fact"):
        AvailabilityLagSample(
            source=SOURCE,
            endpoint=ENDPOINT,
            symbol=SYMBOL,
            observer_region=REGION,
            event_time_ms=1_000,
            available_at_ms=500,
            availability_source=AvailabilitySource.OBSERVED,
        )
