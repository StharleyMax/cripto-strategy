"""The circuit breaker's full cycle: CLOSED -> OPEN -> HALF_OPEN -> CLOSED, and its guard rails."""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.circuit_breaker import (
    CallDecision,
    CircuitBreakerPolicy,
    CircuitBreakerState,
    CircuitPhase,
    FailureKind,
    InvalidCircuitBreakerError,
    closed,
    decide_call,
    record_failure,
    record_success,
)


def _policy(failure_threshold: int = 3, cooldown_seconds: float = 30.0) -> CircuitBreakerPolicy:
    """Build a policy with sane defaults so each test only names what it varies."""
    return CircuitBreakerPolicy(
        failure_threshold=failure_threshold,
        cooldown_seconds=cooldown_seconds,
    )


# ── THE FULL CYCLE, THE ONE THE HANDOFF NAMES EXPLICITLY ───────────────────────────────────


def test_the_full_cycle_closed_to_open_to_half_open_to_closed_again() -> None:
    """Exactly the cycle `T-07.7`'s handoff asks to be tested, end to end."""
    policy = _policy(failure_threshold=3, cooldown_seconds=30.0)
    state = closed()
    assert state.phase is CircuitPhase.CLOSED

    # Two failures below the threshold: still closed.
    state = record_failure(state, policy, now_monotonic=0.0, kind=FailureKind.TRANSPORT_ERROR)
    state = record_failure(state, policy, now_monotonic=1.0, kind=FailureKind.TRANSPORT_ERROR)
    assert state.phase is CircuitPhase.CLOSED
    assert state.consecutive_failures == 2

    # The third failure reaches the threshold: the circuit trips OPEN.
    state = record_failure(state, policy, now_monotonic=2.0, kind=FailureKind.TRANSPORT_ERROR)
    assert state.phase is CircuitPhase.OPEN
    assert state.opened_at_monotonic == 2.0

    # Before the cooldown elapses, every call is refused.
    still_refused = decide_call(state, policy, now_monotonic=2.0 + 29.9)
    assert still_refused.allowed is False
    assert still_refused.seconds_until_retry == pytest.approx(0.1)
    assert still_refused.state.phase is CircuitPhase.OPEN

    # Once the cooldown elapses, exactly one probe call is allowed, moving to HALF_OPEN.
    probe = decide_call(state, policy, now_monotonic=2.0 + 30.0)
    assert probe.allowed is True
    assert probe.state.phase is CircuitPhase.HALF_OPEN
    assert probe.seconds_until_retry is None

    # While the probe is outstanding, no further call is allowed.
    concurrent = decide_call(probe.state, policy, now_monotonic=2.0 + 30.0)
    assert concurrent.allowed is False
    assert concurrent.seconds_until_retry == pytest.approx(policy.cooldown_seconds)

    # The probe succeeds: the circuit closes again, history reset.
    recovered = record_success(probe.state)
    assert recovered == closed()

    # Normal traffic flows again.
    assert decide_call(recovered, policy, now_monotonic=1_000.0).allowed is True


def test_a_failed_probe_re_opens_the_circuit_immediately() -> None:
    """HALF_OPEN failing does not wait for the generic threshold — it re-opens on the spot."""
    policy = _policy(failure_threshold=5, cooldown_seconds=10.0)
    state = CircuitBreakerState(
        phase=CircuitPhase.HALF_OPEN,
        consecutive_failures=1,
        opened_at_monotonic=0.0,
    )

    reopened = record_failure(state, policy, now_monotonic=10.0, kind=FailureKind.TRANSPORT_ERROR)

    assert reopened.phase is CircuitPhase.OPEN
    assert reopened.opened_at_monotonic == 10.0
    assert reopened.consecutive_failures == 2


# ── THE ALTERNATE TRIGGER: A 429/5XX TRIPS ON THE FIRST OCCURRENCE ─────────────────────────


@pytest.mark.parametrize("kind", [FailureKind.RATE_LIMITED, FailureKind.SERVER_ERROR])
def test_a_rate_limit_or_server_error_trips_on_the_first_occurrence(kind: FailureKind) -> None:
    """`CA-F3-9`: 'depois de N falhas consecutivas (OU um sinal de 429/5xx)' — the OR branch."""
    policy = _policy(failure_threshold=10, cooldown_seconds=5.0)

    state = record_failure(closed(), policy, now_monotonic=0.0, kind=kind)

    assert state.phase is CircuitPhase.OPEN
    assert state.consecutive_failures == 1


def test_a_transport_error_alone_does_not_trip_before_the_threshold() -> None:
    """The generic kind respects the threshold — only `RATE_LIMITED`/`SERVER_ERROR` bypass it."""
    policy = _policy(failure_threshold=10, cooldown_seconds=5.0)

    state = record_failure(closed(), policy, now_monotonic=0.0, kind=FailureKind.TRANSPORT_ERROR)

    assert state.phase is CircuitPhase.CLOSED
    assert state.consecutive_failures == 1


def test_a_success_while_closed_resets_a_partial_failure_streak() -> None:
    """A success breaks a run of failures that had not yet reached the threshold."""
    policy = _policy(failure_threshold=3, cooldown_seconds=5.0)
    state = record_failure(closed(), policy, now_monotonic=0.0, kind=FailureKind.TRANSPORT_ERROR)
    state = record_failure(state, policy, now_monotonic=1.0, kind=FailureKind.TRANSPORT_ERROR)

    recovered = record_success(state)

    assert recovered == closed()


# ── VALIDATION: A POLICY OR A STATE THAT CANNOT DESCRIBE A REAL BREAKER ────────────────────


@pytest.mark.parametrize("failure_threshold", [0, -1])
def test_a_policy_that_could_never_trip_is_refused(failure_threshold: int) -> None:
    """A threshold below one is not a threshold at all."""
    with pytest.raises(InvalidCircuitBreakerError, match="failure_threshold"):
        CircuitBreakerPolicy(failure_threshold=failure_threshold, cooldown_seconds=1.0)


@pytest.mark.parametrize("cooldown_seconds", [0.0, -1.0])
def test_a_policy_that_never_cools_down_is_refused(cooldown_seconds: float) -> None:
    """A non-positive cooldown would keep the breaker open forever."""
    with pytest.raises(InvalidCircuitBreakerError, match="cooldown_seconds"):
        CircuitBreakerPolicy(failure_threshold=1, cooldown_seconds=cooldown_seconds)


def test_a_closed_state_cannot_carry_an_opened_at() -> None:
    """A CLOSED breaker has nothing to date — carrying a moment would be a lie."""
    with pytest.raises(InvalidCircuitBreakerError, match="CLOSED"):
        CircuitBreakerState(
            phase=CircuitPhase.CLOSED,
            consecutive_failures=0,
            opened_at_monotonic=1.0,
        )


@pytest.mark.parametrize("phase", [CircuitPhase.OPEN, CircuitPhase.HALF_OPEN])
def test_a_non_closed_state_must_carry_an_opened_at(phase: CircuitPhase) -> None:
    """OPEN and HALF_OPEN both measure a cooldown against the moment they were opened."""
    with pytest.raises(InvalidCircuitBreakerError, match=phase.value):
        CircuitBreakerState(
            phase=phase,
            consecutive_failures=1,
            opened_at_monotonic=None,
        )


def test_a_state_cannot_carry_a_negative_failure_count() -> None:
    """A negative streak of failures does not exist."""
    with pytest.raises(InvalidCircuitBreakerError, match="negative"):
        CircuitBreakerState(
            phase=CircuitPhase.CLOSED,
            consecutive_failures=-1,
            opened_at_monotonic=None,
        )


def test_a_call_decision_cannot_be_allowed_and_carry_a_retry_wait() -> None:
    """An ALLOWED decision has nothing left to wait for — the two fields must not both be set."""
    with pytest.raises(InvalidCircuitBreakerError, match="ALLOWED"):
        CallDecision(allowed=True, state=closed(), seconds_until_retry=1.0)


def test_a_call_decision_cannot_be_refused_without_a_retry_wait() -> None:
    """A REFUSED decision must say how long until the next retry — no silent refusal."""
    with pytest.raises(InvalidCircuitBreakerError, match="REFUSED"):
        CallDecision(allowed=False, state=closed(), seconds_until_retry=None)


def test_failure_kind_trips_immediately_is_true_only_for_the_provider_signals() -> None:
    """The property the module's trip logic reads — asserted directly, not just through effect."""
    assert FailureKind.TRANSPORT_ERROR.trips_immediately is False
    assert FailureKind.RATE_LIMITED.trips_immediately is True
    assert FailureKind.SERVER_ERROR.trips_immediately is True
