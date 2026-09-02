"""The composed broker: local pacing + jitter, refused outright while the circuit is open."""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.circuit_breaker import (
    CircuitBreakerPolicy,
    CircuitPhase,
    FailureKind,
    closed,
)
from src.modules.sentimento.domain.jitter import JitterPolicy
from src.modules.sentimento.domain.local_quota_broker import LocalQuotaBroker
from src.modules.sentimento.domain.quota_circuit_broker import QuotaCircuitBroker


def _broker(
    spread: float = 0.2,
    failure_threshold: int = 3,
    cooldown_seconds: float = 30.0,
) -> QuotaCircuitBroker:
    """Build a broker over a 40-calls/min bucket (the declared Coinalyze ceiling)."""
    return QuotaCircuitBroker(
        local_broker=LocalQuotaBroker(calls_per_window=40, window_seconds=60.0),
        jitter=JitterPolicy(spread=spread),
        circuit_policy=CircuitBreakerPolicy(
            failure_threshold=failure_threshold,
            cooldown_seconds=cooldown_seconds,
        ),
    )


def test_a_closed_circuit_allows_and_jitters_the_local_pace() -> None:
    """Closed circuit: dispatch is allowed, and the pause is the LOCAL interval, jittered."""
    broker = _broker(spread=0.2)

    decision = broker.decide(closed(), now_monotonic=0.0, sample=0.5)

    assert decision.allowed is True
    assert decision.pause_seconds == pytest.approx(1.5)  # 60/40, spread=0.2, sample=0.5 -> base
    assert decision.circuit_state == closed()
    assert decision.seconds_until_retry is None


def test_the_jittered_pause_moves_with_the_sample() -> None:
    """Two different samples against the same closed circuit produce two different pauses."""
    broker = _broker(spread=0.2)

    low = broker.decide(closed(), now_monotonic=0.0, sample=0.0)
    high = broker.decide(closed(), now_monotonic=0.0, sample=1.0)

    assert low.pause_seconds is not None
    assert high.pause_seconds is not None
    assert low.pause_seconds < high.pause_seconds
    assert low.pause_seconds == pytest.approx(1.5 * 0.8)
    assert high.pause_seconds == pytest.approx(1.5 * 1.2)


def test_an_open_circuit_refuses_regardless_of_the_jitter_sample() -> None:
    """An open circuit is a hard refusal — no pacing, no pause, jitter never even computed."""
    broker = _broker(failure_threshold=1, cooldown_seconds=30.0)
    circuit = broker.record_failure(closed(), now_monotonic=0.0, kind=FailureKind.RATE_LIMITED)
    assert circuit.phase is CircuitPhase.OPEN

    decision = broker.decide(circuit, now_monotonic=1.0, sample=0.5)

    assert decision.allowed is False
    assert decision.pause_seconds is None
    assert decision.seconds_until_retry == pytest.approx(29.0)


def test_the_circuit_reopens_from_the_broker_after_a_failed_probe() -> None:
    """End to end through the broker's own facade: trip, cooldown, probe, fail, re-open."""
    broker = _broker(failure_threshold=1, cooldown_seconds=10.0)
    circuit = broker.record_failure(closed(), now_monotonic=0.0, kind=FailureKind.SERVER_ERROR)
    assert circuit.phase is CircuitPhase.OPEN

    probe = broker.decide(circuit, now_monotonic=10.0, sample=0.5)
    assert probe.allowed is True
    assert probe.circuit_state.phase is CircuitPhase.HALF_OPEN

    reopened = broker.record_failure(
        probe.circuit_state, now_monotonic=10.0, kind=FailureKind.TRANSPORT_ERROR
    )
    assert reopened.phase is CircuitPhase.OPEN


def test_the_circuit_closes_from_the_broker_after_a_successful_probe() -> None:
    """End to end through the broker's own facade: trip, cooldown, probe, succeed, close."""
    broker = _broker(failure_threshold=1, cooldown_seconds=10.0)
    circuit = broker.record_failure(closed(), now_monotonic=0.0, kind=FailureKind.RATE_LIMITED)

    probe = broker.decide(circuit, now_monotonic=10.0, sample=0.5)
    recovered = broker.record_success(probe.circuit_state)

    assert recovered == closed()
    assert broker.decide(recovered, now_monotonic=11.0, sample=0.5).allowed is True
