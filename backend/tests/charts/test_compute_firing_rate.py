"""`compute_firing_rate` — builds only the `in_sample` branch `ADR-020/D5` fully decides."""

from __future__ import annotations

import pytest

from src.modules.charts.domain.firing_rate import InSampleFiringRate, Window
from src.modules.charts.use_cases.compute_firing_rate import (
    WalkForwardRuleNotDecidedError,
    compute_firing_rate,
)


def test_equal_windows_build_the_in_sample_degenerate_case() -> None:
    """`calib_window == eval_window` -> `InSampleFiringRate` with `rate=None`, by `D5`."""
    window = Window(start_ms=0, end_ms=1_000)
    result = compute_firing_rate(calib_window=window, eval_window=window)
    assert isinstance(result, InSampleFiringRate)
    assert result.rate is None


def test_different_windows_refuse_because_t_08_8_owns_that_rule() -> None:
    """`calib_window != eval_window` needs a rule `T-08.8` has not written yet.

    This use case refuses BY NAME rather than guessing at `n_windows`/`rate`.
    """
    calib = Window(start_ms=0, end_ms=1_000)
    later_eval = Window(start_ms=1_000, end_ms=2_000)
    with pytest.raises(WalkForwardRuleNotDecidedError, match="T-08.8"):
        compute_firing_rate(calib_window=calib, eval_window=later_eval)
