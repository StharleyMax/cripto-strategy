"""The circuit breaker over a BLIND bucket: stop dispatching before the provider bans us."""

# `CA-F3-9` / plano 07 item 7.9 / `T-07.7`. `domain/local_quota_broker.py` already paces a blind
# bucket at a fixed, conservative interval — but a fixed interval alone still dispatches every
# single call, even the one right after the provider started answering `429`/`5xx`. Two of the
# three buckets this project spends are BLIND (`domain/quota_bucket.py`): no header tells us we
# are close to the edge, so the only signal we ever get IS the failure itself, and by the time it
# arrives the call has already been spent.
#
# ── WHY A STATE MACHINE AND NOT "JUST RETRY WITH BACKOFF" ──────────────────────────────────
#
# `domain/recoil_policy.py` already answers "how long do we wait after ONE `429`" for the ramp,
# which stops at the first throttle and never resumes. This broker's job is different: it runs IN
# REGIME, forever, and has to decide — before every call — whether to dispatch at all. Retrying
# forever with backoff still dispatches every call eventually; a circuit breaker refuses outright
# for a cooldown window, which is the only shape that protects a bucket that gives no warning.
#
# The three phases below are the textbook circuit-breaker vocabulary (Fowler, "CircuitBreaker",
# 2014) because this repository has no reason to invent new names for a well-known shape:
#
#   CLOSED     -> calls flow normally; failures are counted.
#   OPEN       -> calls are refused outright, without touching the network, until the cooldown
#                 elapses.
#   HALF_OPEN  -> exactly one probe call is allowed, to test whether the provider recovered.
#                 A success closes the circuit; a failure re-opens it immediately.
#
# ── WHY A 429/5XX TRIPS THE BREAKER REGARDLESS OF THE FAILURE COUNT ────────────────────────
#
# `N` consecutive failures is the generic trigger (transport errors, timeouts — noise that COULD
# be transient and unrelated to quota). A `429` or `5xx`, however, is the provider itself telling
# us to stop, and a bucket that is BLIND the rest of the time still spends this one bit of signal
# honestly: it is the ONLY authoritative word the bucket ever gives, and waiting for `N` of them
# before reacting would spend `N - 1` more calls we were explicitly told not to spend. So
# `FailureKind.RATE_LIMITED` and `FailureKind.SERVER_ERROR` open the circuit on the FIRST
# occurrence; `FailureKind.TRANSPORT_ERROR` only counts toward the generic threshold.
#
# ── WHY THIS FILE HAS NO CLOCK AND NO RANDOMNESS OF ITS OWN ────────────────────────────────
#
# `ADR-016`/`Natureza`: `domain` never reads a clock and never opens a socket. Every function
# below takes `now_monotonic` as a plain `float` argument instead of calling `time.monotonic()`
# — the caller (a use case or a test) supplies it, which is what makes "fechado -> aberto (apos
# falhas) -> half-open (apos cooldown) -> fechado de novo (apos sucesso)" a deterministic,
# instant test instead of a test that sleeps.

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class CircuitPhase(Enum):
    """The three phases of the breaker, in the vocabulary the pattern is known by."""

    CLOSED = "CLOSED"
    """Calls flow normally; failures are being counted toward the threshold."""

    OPEN = "OPEN"
    """Calls are refused outright until `cooldown_seconds` elapses since the trip."""

    HALF_OPEN = "HALF_OPEN"
    """The cooldown elapsed; exactly one probe call decides CLOSED or OPEN again."""


class FailureKind(Enum):
    """What kind of failure this was — because not every kind trips the breaker the same way."""

    TRANSPORT_ERROR = "TRANSPORT_ERROR"
    """The request never got a response (timeout, connection reset). Counts toward the threshold."""

    RATE_LIMITED = "RATE_LIMITED"
    """The provider answered `429`. Trips on the FIRST occurrence — see the module docstring."""

    SERVER_ERROR = "SERVER_ERROR"
    """The provider answered `5xx`. Trips on the FIRST occurrence, same reason as `429`."""

    @property
    def trips_immediately(self) -> bool:
        """Return whether a single occurrence of this kind opens the circuit outright."""
        return self is not FailureKind.TRANSPORT_ERROR


class InvalidCircuitBreakerError(Exception):
    """A policy or a state transition that could not describe a real circuit breaker."""


@dataclass(frozen=True)
class CircuitBreakerPolicy:
    """The two numbers that fully describe when the breaker trips and when it retries."""

    failure_threshold: int
    cooldown_seconds: float

    def __post_init__(self) -> None:
        """Reject a policy that could never trip, or never cool down."""
        if self.failure_threshold < 1:
            raise InvalidCircuitBreakerError(
                f"failure_threshold={self.failure_threshold}: a breaker that trips on fewer "
                "than one failure is not a threshold"
            )
        if self.cooldown_seconds <= 0:
            raise InvalidCircuitBreakerError(
                f"cooldown_seconds={self.cooldown_seconds}: a non-positive cooldown never lets "
                "the breaker retry"
            )


@dataclass(frozen=True)
class CircuitBreakerState:
    """Where the breaker is right now, and enough history to explain how it got there."""

    phase: CircuitPhase
    consecutive_failures: int
    opened_at_monotonic: float | None

    def __post_init__(self) -> None:
        """Reject a state whose fields contradict the phase they describe."""
        if self.consecutive_failures < 0:
            raise InvalidCircuitBreakerError(
                f"consecutive_failures={self.consecutive_failures}: a negative count of "
                "failures does not exist"
            )
        has_opened_at = self.opened_at_monotonic is not None
        if self.phase is CircuitPhase.CLOSED and has_opened_at:
            raise InvalidCircuitBreakerError("a CLOSED state cannot carry the moment it was opened")
        if self.phase is not CircuitPhase.CLOSED and not has_opened_at:
            raise InvalidCircuitBreakerError(
                f"a {self.phase.value} state must carry the moment it was opened"
            )

    @property
    def is_closed(self) -> bool:
        """Return whether calls currently flow normally."""
        return self.phase is CircuitPhase.CLOSED

    @property
    def is_open(self) -> bool:
        """Return whether calls are currently refused outright."""
        return self.phase is CircuitPhase.OPEN

    @property
    def is_half_open(self) -> bool:
        """Return whether the breaker is currently probing with a single call."""
        return self.phase is CircuitPhase.HALF_OPEN


def closed() -> CircuitBreakerState:
    """Return the initial state every breaker starts in: CLOSED, no history."""
    return CircuitBreakerState(
        phase=CircuitPhase.CLOSED,
        consecutive_failures=0,
        opened_at_monotonic=None,
    )


def _opened(now_monotonic: float, consecutive_failures: int) -> CircuitBreakerState:
    """Return the OPEN state a trip produces, naming the moment for the cooldown to measure."""
    return CircuitBreakerState(
        phase=CircuitPhase.OPEN,
        consecutive_failures=consecutive_failures,
        opened_at_monotonic=now_monotonic,
    )


@dataclass(frozen=True)
class CallDecision:
    """Whether the caller may dispatch right now, and the state that decision produced.

    `allowed=True` under `CircuitPhase.HALF_OPEN` means "this IS the one probe call" — the
    caller must report its outcome through `record_success`/`record_failure`. `allowed=False`
    means the call must not touch the network at all; `seconds_until_retry` is how much of the
    cooldown remains, so a caller can schedule its next check instead of busy-polling.
    """

    allowed: bool
    state: CircuitBreakerState
    seconds_until_retry: float | None = None

    def __post_init__(self) -> None:
        """Reject a decision whose fields contradict each other."""
        if self.allowed and self.seconds_until_retry is not None:
            raise InvalidCircuitBreakerError("an ALLOWED decision has nothing left to wait for")
        if not self.allowed and self.seconds_until_retry is None:
            raise InvalidCircuitBreakerError(
                "a REFUSED decision must say how long until the next retry"
            )


def decide_call(
    state: CircuitBreakerState,
    policy: CircuitBreakerPolicy,
    now_monotonic: float,
) -> CallDecision:
    """Decide whether a call may be dispatched right now, transitioning OPEN -> HALF_OPEN.

    CLOSED always allows. OPEN allows only once the cooldown has fully elapsed, and that single
    allowed call moves the STATE to HALF_OPEN — the probe itself is spent by asking. HALF_OPEN
    (already probing) refuses any further call until the outstanding probe reports its outcome,
    which is what keeps "exactly one probe call" true even under concurrent callers.
    """
    if state.is_closed:
        return CallDecision(allowed=True, state=state)
    if state.is_half_open:
        return CallDecision(
            allowed=False,
            state=state,
            seconds_until_retry=policy.cooldown_seconds,
        )
    # OPEN: allowed only once the cooldown has elapsed since the trip.
    opened_at = state.opened_at_monotonic
    if opened_at is None:
        # Unreachable given `CircuitBreakerState.__post_init__`: an OPEN state always carries
        # the moment it was opened. Raised, not asserted (`S101`), and it also narrows the type
        # for the arithmetic below instead of leaving it `float | None`.
        raise InvalidCircuitBreakerError("an OPEN state with no opened_at cannot be timed")
    elapsed = now_monotonic - opened_at
    remaining = policy.cooldown_seconds - elapsed
    if remaining > 0:
        return CallDecision(allowed=False, state=state, seconds_until_retry=remaining)
    half_open = CircuitBreakerState(
        phase=CircuitPhase.HALF_OPEN,
        consecutive_failures=state.consecutive_failures,
        opened_at_monotonic=opened_at,
    )
    return CallDecision(allowed=True, state=half_open)


def record_success(_previous_state: CircuitBreakerState) -> CircuitBreakerState:
    """Report a successful call, closing the circuit and resetting the failure count.

    `_previous_state` is accepted (and unused) so the call site reads symmetrically with
    `record_failure` — the caller passes the state it holds either way. Whatever the previous
    state was, a success always resolves to the same place: from CLOSED it resets a streak that
    had not yet tripped the breaker; from HALF_OPEN it is the recovery that closes the circuit.
    """
    return closed()


def record_failure(
    state: CircuitBreakerState,
    policy: CircuitBreakerPolicy,
    now_monotonic: float,
    kind: FailureKind,
) -> CircuitBreakerState:
    """Report a failed call, tripping the circuit when the kind or the count demands it.

    A HALF_OPEN probe that fails re-opens immediately, whatever `kind` says — the provider just
    answered the one call we risked, and the answer was no. A CLOSED breaker opens either because
    `kind.trips_immediately` (a `429`/`5xx`, the provider's own word) or because the streak of
    generic failures reached `policy.failure_threshold`.
    """
    if state.is_half_open:
        return _opened(now_monotonic, consecutive_failures=state.consecutive_failures + 1)
    consecutive_failures = state.consecutive_failures + 1
    if kind.trips_immediately or consecutive_failures >= policy.failure_threshold:
        return _opened(now_monotonic, consecutive_failures=consecutive_failures)
    return CircuitBreakerState(
        phase=CircuitPhase.CLOSED,
        consecutive_failures=consecutive_failures,
        opened_at_monotonic=None,
    )
