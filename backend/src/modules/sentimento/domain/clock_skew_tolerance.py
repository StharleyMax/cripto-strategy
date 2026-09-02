"""`clock_skew_tolerance_ms`: CALIBRATED from a distribution, never a hardcoded number."""

# `T-07.10` (`CA-F3-13`, plan `07` item 7.12, DoD `D7.18`) reads the `clock_skew_ms` history
# `T-03.8` measures and persists (`domain/clock_skew.py`, `use_cases/persist_ntp_skew_run.py`)
# and decides what magnitude is tolerable. `D3.10`/`D7.18`, literal: `>= 7 dias de runs` is the
# real calibration window — and as of this task only 5 short probe runs from one terminal
# session exist (`docs/context/plataforma-dados/medicoes/T-03.8-ntp-skew/`). The DoD explicitly
# accepts refusing over building a fabricated number: this module is the MECHANISM, proved here
# with a simulated distribution and, separately, with the 5 real points that already exist —
# never with 7 days of data that has not been captured yet.
#
# `Natureza` (`ADR-016`): this module touches no clock and no socket — every timestamp it reads
# arrives already as an epoch-millisecond `int`, produced upstream (`ClockSkewSample`'s bracket
# fields are epoch ms too). Parsing `md.ingest_run.started_at` from its stored ISO-8601 string
# into that int is an `infra` concern (`infra/clock_skew_tolerance_reader.py`), the same split
# `infra/metrics_csv_reader.py` already draws for `daily/metrics` timestamps.

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Final

# Reused, not reimplemented: `p99` is already the nearest-rank percentile this repository
# picked for exactly this shape of question (`availability_lag_stats.LAG_STAT_NAME`). Computing
# a second percentile routine here would duplicate the one algorithmic choice that matters —
# nearest-rank over interpolation, so the tolerance is always a magnitude somebody actually
# observed, never a number manufactured between two real readings.
from src.modules.sentimento.domain.availability_lag_stats import p99

# `D3.10`/`D7.18`, literal: "`>= 7 dias de runs` e o padrao de calibracao real". Below this
# span, `calibrate_clock_skew_tolerance` refuses rather than guess.
MIN_CALIBRATION_SPAN_DAYS: Final[int] = 7

_MS_PER_DAY: Final[int] = 24 * 60 * 60 * 1000

# Same convention as `availability_lag_stats.LAG_STAT_NAME`: the statistic is a CONSTANT, named
# so a consumer can display what was computed instead of a bare, unlabelled integer.
TOLERANCE_STAT_NAME: Final[str] = "p99"


class InsufficientClockSkewCalibrationDataError(Exception):
    """Refuses to calibrate `clock_skew_tolerance_ms` from a distribution too thin to trust."""


@dataclass(frozen=True)
class ClockSkewObservation:
    """One already-computed `clock_skew_ms` reading, pulled from `md.ingest_run` history.

    This does NOT duplicate `domain.clock_skew.ClockSkewSample`: `ClockSkewSample` computes
    `skew_ms()` from a live round-trip bracket (`local_time_before_ms`/`local_time_after_ms`/
    `server_time_ms`) — the capability that measures skew in the first place. `md.ingest_run`
    never persists that bracket (`ADR-008/D3`'s 15 columns keep only the resulting
    `clock_skew_ms`), so calibrating from HISTORY needs a different, smaller type: the value
    already computed, plus when it happened. `observed_at_ms` is what lets this module measure
    the SPAN the sample covers — `n=100` readings taken in one afternoon is not the same
    evidence as `n=100` spread over `MIN_CALIBRATION_SPAN_DAYS`, even though the count matches.
    """

    clock_skew_ms: int
    observed_at_ms: int


@dataclass(frozen=True)
class ClockSkewTolerance:
    """A calibrated tolerance with the evidence that produced it — never a number on its own.

    `stat_name`, `sample_n` and `span_days` travel with `tolerance_ms` so nothing downstream
    can report the number without also being able to say what it was calibrated from —
    `CLAUDE.md`'s "nenhum numero sem o comando que o produziu" applied to a runtime value
    instead of a report line.
    """

    tolerance_ms: int
    stat_name: str
    sample_n: int
    span_days: float


def calibrate_clock_skew_tolerance(
    observations: Sequence[ClockSkewObservation],
    *,
    min_span_days: int = MIN_CALIBRATION_SPAN_DAYS,
) -> ClockSkewTolerance:
    """Calibrate `clock_skew_tolerance_ms` as the `p99` of `|clock_skew_ms|` over `observations`.

    Refuses (`InsufficientClockSkewCalibrationDataError`) unless the observations span at least
    `min_span_days` — `D3.10`/`D7.18`'s `>= 7 dias`. A tolerance calculated from a thinner
    window would be a number that LOOKS calibrated while resting on evidence the DoD names as
    insufficient; refusing here is the deliverable, not a shortcut around it.

    `min_span_days` is a parameter, not baked into the refusal message, so a test can prove the
    boundary (`span_days == min_span_days` calibrates; one tick below refuses) without waiting
    for real calendar time to pass.
    """
    if not observations:
        raise InsufficientClockSkewCalibrationDataError(
            f"cannot calibrate clock_skew_tolerance_ms from zero observations; "
            f"need >= {min_span_days} days of md.ingest_run clock_skew_ms history, not a guess"
        )
    observed_at_ms = [observation.observed_at_ms for observation in observations]
    span_days = (max(observed_at_ms) - min(observed_at_ms)) / _MS_PER_DAY
    if span_days < min_span_days:
        raise InsufficientClockSkewCalibrationDataError(
            f"only {span_days:.4f} day(s) of clock_skew_ms history (n={len(observations)}); "
            f"need >= {min_span_days} days for a real calibration, not a number without a "
            f"basis — the 5 short probe runs behind T-03.8 are proof the mechanism works, "
            f"never proof of the regime"
        )
    tolerance_ms = p99([abs(observation.clock_skew_ms) for observation in observations])
    return ClockSkewTolerance(
        tolerance_ms=tolerance_ms,
        stat_name=TOLERANCE_STAT_NAME,
        sample_n=len(observations),
        span_days=span_days,
    )
