"""The broker this task's title names: local pacing + jitter + circuit breaker, composed.

`CA-F3-9` / plano 07 item 7.9 / `T-07.7`. Composed, not duplicated, per the handoff's own
instruction: this module owns no counting logic of its own. It wires together three pieces that
already exist or were added by this same task —

  `domain/local_quota_broker.py` — the fixed, conservative interval for a BLIND bucket
                                    (`domain/quota_bucket.py`; two of the three known buckets
                                    are blind, and the contagem local this broker performs is
                                    the CASE GERAL, not an exception).
  `domain/jitter.py`              — spreads that interval so independent processes hitting the
                                    same blind bucket do not converge onto the same retry instant.
  `domain/circuit_breaker.py`     — refuses to dispatch at all once the bucket has told us (or
                                    strongly suggested, via a streak) that it is over capacity.

and answers the one question a caller actually has before every call: "may I dispatch, and if
so, how long do I wait first?" Everything below is pure — no clock read, no socket, no direct
`random.random()` call — the caller supplies `now_monotonic` and `sample`, same discipline as
`domain/recoil_policy.py` and `domain/circuit_breaker.py` before it.
"""

from __future__ import annotations

from dataclasses import dataclass

from src.modules.sentimento.domain.circuit_breaker import (
    CallDecision,
    CircuitBreakerPolicy,
    CircuitBreakerState,
    FailureKind,
    decide_call,
    record_failure,
    record_success,
)
from src.modules.sentimento.domain.jitter import JitterPolicy
from src.modules.sentimento.domain.local_quota_broker import LocalQuotaBroker


@dataclass(frozen=True)
class BrokerDecision:
    """Whether to dispatch right now, and — when yes — the jittered pause before doing so.

    `allowed=False` mirrors `CallDecision`: the caller must not touch the network, and
    `seconds_until_retry` says how long the circuit's cooldown still has left. `allowed=True`
    carries `pause_seconds`, the LOCAL pacing interval after jitter — this is what the caller
    waits BEFORE dispatching, exactly as `LocalQuotaBroker.interval_seconds` already meant
    before jitter existed.
    """

    allowed: bool
    circuit_state: CircuitBreakerState
    pause_seconds: float | None = None
    seconds_until_retry: float | None = None


@dataclass(frozen=True)
class QuotaCircuitBroker:
    """Compose local pacing, jitter and a circuit breaker over one BLIND bucket.

    Nothing here is mutable: every method takes the current `CircuitBreakerState` and returns
    the next one, the same functional shape `domain/circuit_breaker.py` already uses. The
    caller (a use case, not this module) is the one that holds state across calls, reads the
    clock, and draws the random sample — this module only ever computes.
    """

    local_broker: LocalQuotaBroker
    jitter: JitterPolicy
    circuit_policy: CircuitBreakerPolicy

    def decide(
        self,
        circuit_state: CircuitBreakerState,
        now_monotonic: float,
        sample: float,
    ) -> BrokerDecision:
        """Decide whether to dispatch now, jittering the local pace when the answer is yes.

        The circuit is consulted FIRST: a bucket the breaker has opened must not be paced at
        all, because pacing implies "wait, then call", and an open circuit means "do not call".
        """
        call_decision: CallDecision = decide_call(circuit_state, self.circuit_policy, now_monotonic)
        if not call_decision.allowed:
            return BrokerDecision(
                allowed=False,
                circuit_state=call_decision.state,
                seconds_until_retry=call_decision.seconds_until_retry,
            )
        pause_seconds = self.jitter.apply(self.local_broker.interval_seconds, sample)
        return BrokerDecision(
            allowed=True,
            circuit_state=call_decision.state,
            pause_seconds=pause_seconds,
        )

    def record_success(self, circuit_state: CircuitBreakerState) -> CircuitBreakerState:
        """Report that the dispatched call succeeded, closing the circuit."""
        return record_success(circuit_state)

    def record_failure(
        self,
        circuit_state: CircuitBreakerState,
        now_monotonic: float,
        kind: FailureKind,
    ) -> CircuitBreakerState:
        """Report that the dispatched call failed, tripping the circuit when `kind` demands it."""
        return record_failure(circuit_state, self.circuit_policy, now_monotonic, kind)
