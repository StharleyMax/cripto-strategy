"""Whether two path families share ONE quota bucket — read from the side that can be read."""

# ── THE TRICK, AND WHY IT IS THE ONLY CHEAP ONE AVAILABLE ──────────────────────────────────
#
# `/futures/data/*` publishes no counter, so its consumption cannot be read directly. But if it
# shares a bucket with `/fapi/v1/*` — which DOES publish `x-mbx-used-weight-1m` — then spending
# the blind family must move the observed family's counter. So: read the counter, spend the
# blind family n times, read the counter again.
#
# `SPEC-001` `CA-F4-17` hangs on this single bit: **2,85 min/varredura if the families are
# separate, 14,25 min if they share**, `CONTESTADO e nao testado`. In the shared case a 5-minute
# cross-section series can arrive 15 minutes late and the anti-lookahead guard written on
# `bucket_end` becomes real lookahead under `scope: CrossSection`.
#
# ── THE CONTROL, AND IT IS THE POINT ───────────────────────────────────────────────────────
#
# The observed reads COST WEIGHT THEMSELVES. Comparing a loaded delta against zero would
# "prove" sharing every single time — a control that gives the same answer on both sides. So the
# baseline is measured the same way with the load REMOVED, and the verdict compares the two
# deltas against each other. If the families are separate the two deltas are equal; if they
# share, the loaded one is larger by exactly the blind family's weight.

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class CouplingVerdict(Enum):
    """What the pair of deltas is entitled to conclude."""

    SHARED = "SHARED"
    """Spending the blind family moved the observed counter: one bucket."""

    SEPARATE = "SEPARATE"
    """The loaded delta matched the baseline exactly: the blind family cost nothing here."""

    INCONCLUSIVE = "INCONCLUSIVE"
    """A counter was missing, or the rolling window reset mid-measurement."""


class InvalidCouplingSampleError(Exception):
    """A sample whose parameters could not have produced a comparable pair of deltas."""


@dataclass(frozen=True)
class CouplingSample:
    """One baseline pair and one loaded pair of counter readings, plus the load size.

    `None` in any reading means the counter was not there — which for this measurement is a
    failure, not a zero. The two pairs MUST be taken with the same number of observed reads,
    or the deltas are not comparable and the whole thing is arithmetic theatre.
    """

    baseline_before: int | None
    baseline_after: int | None
    loaded_before: int | None
    loaded_after: int | None
    blind_requests: int

    def __post_init__(self) -> None:
        """Reject a sample with no load: without load the two pairs measure the same thing."""
        if self.blind_requests < 1:
            raise InvalidCouplingSampleError(
                "blind_requests < 1: without load, the two pairs are the SAME experiment and "
                "the control would yield 'separate' by construction"
            )


@dataclass(frozen=True)
class CouplingResult:
    """The verdict, with both deltas kept visible so the reader can redo the subtraction."""

    verdict: CouplingVerdict
    baseline_delta: int | None
    loaded_delta: int | None
    blind_requests: int
    weight_per_blind_request: float | None
    reason: str


def _delta(before: int | None, after: int | None) -> int | None:
    """Subtract two counter readings, refusing the pair when the rolling window reset.

    A negative delta is not a small number: it means the one-minute window rolled over between
    the two reads, so the pair spans two different windows and their difference is meaningless.
    """
    if before is None or after is None:
        return None
    difference = after - before
    return None if difference < 0 else difference


def measure_coupling(sample: CouplingSample) -> CouplingResult:
    """Compare the loaded delta against the baseline delta and name what follows."""
    baseline = _delta(sample.baseline_before, sample.baseline_after)
    loaded = _delta(sample.loaded_before, sample.loaded_after)
    if baseline is None or loaded is None:
        return CouplingResult(
            verdict=CouplingVerdict.INCONCLUSIVE,
            baseline_delta=baseline,
            loaded_delta=loaded,
            blind_requests=sample.blind_requests,
            weight_per_blind_request=None,
            reason=(
                "contador ausente ou janela de 1 min reiniciada entre as leituras: o par nao "
                "cobre a mesma janela, entao a subtracao nao mede nada"
            ),
        )
    attributable = loaded - baseline
    if attributable <= 0:
        return CouplingResult(
            verdict=CouplingVerdict.SEPARATE,
            baseline_delta=baseline,
            loaded_delta=loaded,
            blind_requests=sample.blind_requests,
            weight_per_blind_request=0.0,
            reason=(
                f"{sample.blind_requests} chamada(s) ao balde cego nao moveu o contador do "
                f"balde observado (delta carregado {loaded} = base {baseline}): baldes distintos"
            ),
        )
    return CouplingResult(
        verdict=CouplingVerdict.SHARED,
        baseline_delta=baseline,
        loaded_delta=loaded,
        blind_requests=sample.blind_requests,
        weight_per_blind_request=attributable / sample.blind_requests,
        reason=(
            f"delta carregado {loaded} contra base {baseline}: {attributable} de peso "
            f"atribuivel a {sample.blind_requests} chamada(s) cega(s) — os dois caminhos "
            "gastam o MESMO balde"
        ),
    )
