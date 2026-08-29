"""The shape of ONE ramp: how fast it climbs, and where it agrees to stop."""

# ── A RAMP, NOT A HAMMER ───────────────────────────────────────────────────────────────────
#
# The plan climbs by SHRINKING the pause between requests, never by firing in parallel. A
# parallel burst against a third-party API is indistinguishable from abuse and, worse, it is
# indistinguishable as a MEASUREMENT: with n requests in flight the ordinal of the first `429`
# stops being defined, and the ordinal is the number the whole exercise exists to produce.
#
# `max_requests` is a hard stop that exists even though the ramp normally ends at the first
# `429`. Without it, a bucket whose limit is above our patience would be hammered until somebody
# noticed — and "somebody noticed" is not a stopping condition.

from __future__ import annotations

from dataclasses import dataclass

from src.modules.sentimento.domain.quota_bucket import QuotaBucket


class InvalidRampPlanError(Exception):
    """A plan that would not climb, or would climb without a declared stop."""


@dataclass(frozen=True)
class RampPlan:
    """A monotonically accelerating sequence of single requests, with a declared ceiling."""

    bucket: QuotaBucket
    path: str
    max_requests: int
    initial_interval_seconds: float
    interval_factor: float
    min_interval_seconds: float

    def __post_init__(self) -> None:
        """Reject a plan that cannot accelerate, cannot stop, or would burst."""
        if self.max_requests < 1:
            raise InvalidRampPlanError("max_requests < 1: uma rampa sem degrau nao mede nada")
        if self.min_interval_seconds <= 0:
            raise InvalidRampPlanError(
                "min_interval_seconds <= 0 e rajada, nao rampa: sem intervalo minimo a ordem "
                "de chegada deixa de ser definida e o ordinal do primeiro 429 perde sentido"
            )
        if self.initial_interval_seconds < self.min_interval_seconds:
            raise InvalidRampPlanError(
                "initial_interval_seconds abaixo do piso: a rampa comecaria no topo"
            )
        if not 0.0 < self.interval_factor <= 1.0:
            raise InvalidRampPlanError(
                "interval_factor fora de (0, 1]: acima de 1 a rampa DESACELERA e o nome mente"
            )

    def interval_after(self, requests_done: int) -> float:
        """Return the pause that follows the `requests_done`-th request, 1-based.

        ONE-BASED, and the exponent is `requests_done - 1`, so that `interval_after(1)` is
        exactly `initial_interval_seconds`. A zero-based reading here would apply the decay
        BEFORE the first pause, which means `initial_interval_seconds` would never actually be
        used and the ramp would start one notch faster than it declares. That is the wrong
        direction to be off by one against a third party's quota.
        """
        if requests_done < 1:
            raise InvalidRampPlanError(
                f"requests_done = {requests_done}: a primeira pausa segue a PRIMEIRA "
                "requisicao, entao a contagem comeca em 1"
            )
        decayed = self.initial_interval_seconds * self.interval_factor ** (requests_done - 1)
        return max(self.min_interval_seconds, decayed)
