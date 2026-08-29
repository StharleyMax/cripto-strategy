"""The ledger of a rate-limit ramp, and the control that keeps its silence from lying."""

# ── THE DEFECT THIS MODULE EXISTS TO MAKE IMPOSSIBLE ───────────────────────────────────────
#
# "I did not receive a 429" and "I never got the request out" are DIFFERENT states that produce
# the SAME silence. A counter that stores only "429 seen: no" cannot tell them apart, and a ramp
# whose DNS failed on every rung would then publish a high ceiling for a bucket it never
# touched — a number with no universe behind it, in the exact shape of a measurement.
#
# So the ledger counts DISPATCH separately from OUTCOME, and `verdict()` refuses to name a
# ceiling whenever dispatch is incomplete. The two sides give DIFFERENT answers: n rungs that
# all completed yield `CEILING_NOT_REACHED` with a lower bound of n; n rungs that never left
# the machine yield `INCONCLUSIVE`. Both saw zero 429s.

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from enum import Enum

from src.modules.sentimento.domain.quota_bucket import QuotaBucket
from src.modules.sentimento.domain.recoil_policy import parse_retry_after

# A success is `2xx`. `3xx` is not folded in: a redirect this ramp does not follow spent the
# bucket without answering the question, which is exactly what `REJECTED` is for.
_SUCCESS_RANGE: range = range(200, 300)
_TOO_MANY_REQUESTS: int = 429


class RungOutcome(Enum):
    """What happened to ONE request of the ramp — dispatch first, status second."""

    NOT_DISPATCHED = "NOT_DISPATCHED"
    """The request never reached the provider: DNS, TLS, timeout, refused connection.

    This is the state that must never be read as "the limit was not reached".
    """

    ACCEPTED = "ACCEPTED"
    """The provider answered with a success status: the bucket had room for this request."""

    THROTTLED = "THROTTLED"
    """The provider answered `429`: this is the rung the ramp exists to find."""

    REJECTED = "REJECTED"
    """The provider answered some other non-success status — measured, but not a ceiling.

    A `418`, a `403` or a `5xx` says the request WAS dispatched and the bucket WAS spent, and
    it says nothing about the limit. Folding it into `ACCEPTED` would inflate the lower bound.
    """

    @property
    def was_dispatched(self) -> bool:
        """Return whether the provider actually saw this request."""
        return self is not RungOutcome.NOT_DISPATCHED


class RampConclusion(Enum):
    """What the ramp is entitled to claim once it stops."""

    THROTTLED = "THROTTLED"
    """A `429` was observed: the ceiling of this pass is a MEASURED point."""

    CEILING_NOT_REACHED = "CEILING_NOT_REACHED"
    """Every rung was dispatched and completed, and none was throttled.

    This is a LOWER BOUND and never a limit: the ramp ran out of rungs, not out of quota.
    """

    INCONCLUSIVE = "INCONCLUSIVE"
    """Dispatch was incomplete or absent: the silence carries no information about the limit."""


@dataclass(frozen=True)
class ProbeObservation:
    """What ONE call to the provider produced, before any interpretation.

    Exactly one of `status` and `transport_error` is set, and `__post_init__` enforces it. That
    is the whole control expressed as a type: an observation cannot be built that is silent
    about whether the request left the machine.
    """

    status: int | None = None
    headers: Mapping[str, str] = field(default_factory=dict)
    transport_error: str | None = None

    def __post_init__(self) -> None:
        """Reject an observation that is neither a dispatch nor a failure to dispatch."""
        if (self.status is None) == (self.transport_error is None):
            raise ValueError(
                "observacao tem de trazer status HTTP OU erro de transporte, nunca os dois "
                "nem nenhum: e essa distincao que separa 'nao levei 429' de 'nao requisitei'"
            )

    def header(self, name: str | None) -> str | None:
        """Read a header case-insensitively, returning `None` when it is absent."""
        if name is None:
            return None
        wanted = name.lower()
        for key, value in self.headers.items():
            if key.lower() == wanted:
                return value
        return None


@dataclass(frozen=True)
class RampRung:
    """One request of the ramp, with everything needed to reconstruct the pass.

    `observed_weight` is `None` for every rung of a BLIND bucket, and that `None` is evidence
    rather than a missing value: it is the blindness showing up in the data instead of only in
    the prose around it.
    """

    index: int
    outcome: RungOutcome
    status: int | None
    observed_weight: int | None
    retry_after_seconds: float | None
    elapsed_seconds: float
    detail: str | None = None

    def __post_init__(self) -> None:
        """Reject a rung whose status contradicts its dispatch state."""
        if self.outcome.was_dispatched and self.status is None:
            raise ValueError(f"degrau {self.index} despachado sem status HTTP")
        if not self.outcome.was_dispatched and self.status is not None:
            raise ValueError(f"degrau {self.index} nao despachado, mas carrega status HTTP")


def _classify(status: int) -> RungOutcome:
    """Map an HTTP status onto the outcome vocabulary of the ramp."""
    if status == _TOO_MANY_REQUESTS:
        return RungOutcome.THROTTLED
    if status in _SUCCESS_RANGE:
        return RungOutcome.ACCEPTED
    return RungOutcome.REJECTED


def _read_weight(bucket: QuotaBucket, observation: ProbeObservation) -> int | None:
    """Read the bucket's own counter, which a BLIND bucket never supplies.

    A non-numeric counter is reported as absent rather than as zero: zero is a legal
    consumption and would read as "the window just reset", which is a different claim.
    """
    raw = observation.header(bucket.counter_header)
    if raw is None:
        return None
    try:
        return int(raw.strip())
    except ValueError:
        return None


def observe_rung(
    index: int,
    bucket: QuotaBucket,
    observation: ProbeObservation,
    elapsed_seconds: float,
    now_epoch_seconds: float,
) -> RampRung:
    """Turn one raw observation into a rung, keeping dispatch and status independent."""
    if observation.status is None:
        return RampRung(
            index=index,
            outcome=RungOutcome.NOT_DISPATCHED,
            status=None,
            observed_weight=None,
            retry_after_seconds=None,
            elapsed_seconds=elapsed_seconds,
            detail=observation.transport_error,
        )
    return RampRung(
        index=index,
        outcome=_classify(observation.status),
        status=observation.status,
        observed_weight=_read_weight(bucket, observation),
        retry_after_seconds=parse_retry_after(observation.header("Retry-After"), now_epoch_seconds),
        elapsed_seconds=elapsed_seconds,
        detail=None,
    )


@dataclass(frozen=True)
class RampVerdict:
    """The conclusion of a pass, with the counters that justify it side by side.

    ── TWO FIELDS AND NOT ONE, AND THE FIRST LIVE PASS IS WHY ─────────────────────────────

    An earlier shape of this class carried a single `requests_before_throttle` holding the
    ORDINAL of the throttled rung. The first live pass returned `41` there, next to
    `accepted: 40` `[MEDIDO 2026-08-29, Coinalyze `/v1/exchanges`, n=41 requisicoes]`. Those
    are two different quantities: the 41st request was REFUSED, so what fits in the window is
    40. A broker calibrated on `41` would send exactly one request per window too many,
    forever, and would look like it was following a measurement while doing it.

    So the ordinal and the count are separate fields whose names cannot be swapped. Both are
    `None` unless a `429` was actually seen: an integer in either would read as a limit, and
    the whole point of `INCONCLUSIVE` is that no such integer exists.
    """

    conclusion: RampConclusion
    dispatched: int
    not_dispatched: int
    accepted: int
    throttled: int
    rejected: int
    throttled_at_request: int | None
    accepted_before_throttle: int | None
    reason: str

    @property
    def publishes_a_ceiling(self) -> bool:
        """Return whether this verdict entitles anyone to quote a number as the limit."""
        return self.conclusion is RampConclusion.THROTTLED


@dataclass(frozen=True)
class RampLedger:
    """Every rung of one pass, in the order it was attempted.

    ONE PASS IS THE UNIVERSE. The ledger holds no notion of merging passes, and that is a
    decision: two passes at different minutes against a rolling window are two measurements,
    not one with a larger `n`.
    """

    bucket_identifier: str
    rungs: tuple[RampRung, ...]

    def _count(self, outcome: RungOutcome) -> int:
        """Count the rungs that ended in `outcome`."""
        return sum(1 for rung in self.rungs if rung.outcome is outcome)

    @property
    def dispatched(self) -> int:
        """Count the requests the provider actually saw."""
        return sum(1 for rung in self.rungs if rung.outcome.was_dispatched)

    @property
    def not_dispatched(self) -> int:
        """Count the requests that never left this machine."""
        return self._count(RungOutcome.NOT_DISPATCHED)

    def first_throttled(self) -> RampRung | None:
        """Return the first throttled rung, which is the only one the ramp is looking for."""
        for rung in self.rungs:
            if rung.outcome is RungOutcome.THROTTLED:
                return rung
        return None

    def verdict(self) -> RampVerdict:
        """Conclude the pass, refusing to name a ceiling the dispatch counters do not support.

        The three branches are mutually exclusive and ordered by evidence: a `429` observed
        beats everything, incomplete dispatch beats an empty silence, and only a pass that
        was FULLY dispatched may publish a lower bound.
        """
        throttled = self.first_throttled()
        counters = {
            "dispatched": self.dispatched,
            "not_dispatched": self.not_dispatched,
            "accepted": self._count(RungOutcome.ACCEPTED),
            "throttled": self._count(RungOutcome.THROTTLED),
            "rejected": self._count(RungOutcome.REJECTED),
        }
        if throttled is not None:
            accepted_before = sum(
                1
                for rung in self.rungs
                if rung.index < throttled.index and rung.outcome is RungOutcome.ACCEPTED
            )
            return RampVerdict(
                conclusion=RampConclusion.THROTTLED,
                throttled_at_request=throttled.index,
                accepted_before_throttle=accepted_before,
                reason=(
                    f"429 na requisicao {throttled.index} desta passada; "
                    f"{accepted_before} foram ACEITAS antes dela. O que cabe na janela e "
                    f"{accepted_before}, nao {throttled.index}"
                ),
                **counters,
            )
        if self.dispatched == 0 or self.not_dispatched > 0:
            return RampVerdict(
                conclusion=RampConclusion.INCONCLUSIVE,
                throttled_at_request=None,
                accepted_before_throttle=None,
                reason=(
                    f"{self.not_dispatched} de {len(self.rungs)} requisicao(oes) nao chegou a "
                    "ser despachada: a ausencia de 429 nao mede o limite, mede a rede"
                ),
                **counters,
            )
        return RampVerdict(
            conclusion=RampConclusion.CEILING_NOT_REACHED,
            throttled_at_request=None,
            accepted_before_throttle=None,
            reason=(
                f"{self.dispatched} requisicao(oes) despachada(s), nenhum 429: LIMITE INFERIOR "
                f"de {self.dispatched}, nunca o limite. A rampa acabou, a cota nao"
            ),
            **counters,
        )

    def observed_weights(self) -> tuple[int | None, ...]:
        """Return the counter each rung read — all `None` when the bucket is blind."""
        return tuple(rung.observed_weight for rung in self.rungs)
