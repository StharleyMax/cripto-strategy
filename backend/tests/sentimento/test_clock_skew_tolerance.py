"""`calibrate_clock_skew_tolerance`: `p99` of `|clock_skew_ms|`, REFUSED below `>= 7 dias`.

`D3.10`/`D7.18` name the real calibration window as `>= 7 dias de runs` — data this repository
does not have yet (only 5 short probe runs from one terminal session,
`docs/context/plataforma-dados/medicoes/T-03.8-ntp-skew/`). Every non-trivial distribution
below is explicitly SIMULATED and labelled as such; the one real distribution exercised here is
those 5 actual measured points, used to prove the refusal fires on the data that exists today.
"""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.clock_skew_tolerance import (
    MIN_CALIBRATION_SPAN_DAYS,
    TOLERANCE_STAT_NAME,
    ClockSkewObservation,
    InsufficientClockSkewCalibrationDataError,
    calibrate_clock_skew_tolerance,
)

_MS_PER_DAY = 24 * 60 * 60 * 1000

# The 5 REAL `clock_skew_ms` readings from `T-03.8`'s probe against `/fapi/v1/time`
# (`docs/context/plataforma-dados/medicoes/T-03.8-ntp-skew/01_ingest_health_query.jsonl`), and
# the real `started_at` each row carries — not simulated.
_REAL_T038_SKEW_MS = (-69, -69, -73, -66, -23)
_REAL_T038_STARTED_AT_MS = (
    1_788_303_924_951,  # 2026-09-01T23:05:24.951Z
    1_788_303_926_595,  # 2026-09-01T23:05:26.595Z
    1_788_303_928_271,  # 2026-09-01T23:05:28.271Z
    1_788_303_929_896,  # 2026-09-01T23:05:29.896Z
    1_788_303_931_565,  # 2026-09-01T23:05:31.565Z
)


def _simulated(skew_ms_values: list[int], *, span_days: float) -> list[ClockSkewObservation]:
    """Build a SIMULATED distribution: `skew_ms_values` spread evenly over `span_days`.

    Labelled here, and only here, as simulated — never presented as measured data.
    """
    span_ms = int(span_days * _MS_PER_DAY)
    n = len(skew_ms_values)
    denominator = max(n - 1, 1)
    # Multiply before dividing so the LAST index lands on exactly `span_ms` — `index * step`
    # with a pre-floored `step` truncates enough over 99 divisions to undershoot the minimum
    # span by fractions of a second, which is exactly the boundary this module refuses on.
    return [
        ClockSkewObservation(clock_skew_ms=skew, observed_at_ms=(index * span_ms) // denominator)
        for index, skew in enumerate(skew_ms_values)
    ]


def test_refuses_on_zero_observations() -> None:
    """Zero observations refuses outright — there is no span to even measure."""
    with pytest.raises(InsufficientClockSkewCalibrationDataError, match="zero observations"):
        calibrate_clock_skew_tolerance([])


def test_refuses_on_the_5_real_t038_probe_runs() -> None:
    """The falsifier: fed the REAL 5-run distribution this project has today, it REFUSES.

    Those 5 runs span ~6.6 seconds, not 7 days — this is exactly the case `D7.18` names as
    acceptable to refuse rather than fabricate a number from.
    """
    observations = [
        ClockSkewObservation(clock_skew_ms=skew, observed_at_ms=started_at)
        for skew, started_at in zip(_REAL_T038_SKEW_MS, _REAL_T038_STARTED_AT_MS, strict=True)
    ]

    with pytest.raises(InsufficientClockSkewCalibrationDataError, match="day.*history"):
        calibrate_clock_skew_tolerance(observations)


def test_refuses_one_tick_below_the_minimum_span() -> None:
    """`span_days` one millisecond short of the minimum still refuses — no rounding grace."""
    just_under = MIN_CALIBRATION_SPAN_DAYS * _MS_PER_DAY - 1
    observations = [
        ClockSkewObservation(clock_skew_ms=10, observed_at_ms=0),
        ClockSkewObservation(clock_skew_ms=20, observed_at_ms=just_under),
    ]

    with pytest.raises(InsufficientClockSkewCalibrationDataError):
        calibrate_clock_skew_tolerance(observations)


def test_calibrates_at_exactly_the_minimum_span() -> None:
    """`span_days == MIN_CALIBRATION_SPAN_DAYS` exactly is enough — the boundary is inclusive."""
    exactly_at = MIN_CALIBRATION_SPAN_DAYS * _MS_PER_DAY
    observations = [
        ClockSkewObservation(clock_skew_ms=10, observed_at_ms=0),
        ClockSkewObservation(clock_skew_ms=20, observed_at_ms=exactly_at),
    ]

    result = calibrate_clock_skew_tolerance(observations)

    assert result.sample_n == 2
    assert result.span_days == pytest.approx(MIN_CALIBRATION_SPAN_DAYS)


def test_calibrates_the_p99_of_absolute_skew_over_a_simulated_distribution() -> None:
    """SIMULATED: `clock_skew_ms` 1..100 spread over 7 days -> `p99` nearest-rank is `99`.

    Same nearest-rank arithmetic `test_p99_uses_nearest_rank_not_interpolation` already pins
    for `availability_lag_stats.p99` (`ceil(0.99*100)=99`th smallest) — reused, not
    reimplemented, so this test also proves the reuse did not silently change the algorithm.
    """
    observations = _simulated(list(range(1, 101)), span_days=7.0)

    result = calibrate_clock_skew_tolerance(observations)

    assert result.tolerance_ms == 99
    assert result.stat_name == TOLERANCE_STAT_NAME == "p99"
    assert result.sample_n == 100


def test_calibrates_using_the_absolute_value_of_a_negative_skew() -> None:
    """SIMULATED: negative skew (the clock running BEHIND, as `T-03.8` observed) uses magnitude.

    Calibration reads `|clock_skew_ms|` — a tolerance has to catch drift in either direction,
    and `T-03.8`'s real readings were all negative (`-73..-23`).
    """
    observations = _simulated([-100, -50, -10, -5, -1], span_days=7.0)

    result = calibrate_clock_skew_tolerance(observations)

    assert result.tolerance_ms > 0
    assert result.tolerance_ms in {1, 5, 10, 50, 100}


def test_default_minimum_span_matches_d718() -> None:
    """`D3.10`/`D7.18`, literal: `>= 7 dias`."""
    assert MIN_CALIBRATION_SPAN_DAYS == 7


def test_min_span_days_is_a_parameter_not_only_a_constant() -> None:
    """A caller can prove the boundary at a smaller span without waiting on calendar time."""
    observations = _simulated([1, 2, 3], span_days=2.0)

    result = calibrate_clock_skew_tolerance(observations, min_span_days=2)

    assert result.sample_n == 3

    with pytest.raises(InsufficientClockSkewCalibrationDataError):
        calibrate_clock_skew_tolerance(observations, min_span_days=3)
