"""`Window` + `FiringRateResult` — `ADR-020/D5`: `rate` absent by TYPE on `in_sample`."""

from __future__ import annotations

import pytest

from src.modules.charts.domain.firing_rate import (
    InSampleFiringRate,
    InvalidFiringRateError,
    InvalidWindowError,
    WalkForwardFiringRate,
    Window,
)


def test_window_must_span_forward() -> None:
    """`end_ms <= start_ms` refuses."""
    with pytest.raises(InvalidWindowError):
        Window(start_ms=1_000, end_ms=1_000)
    with pytest.raises(InvalidWindowError):
        Window(start_ms=2_000, end_ms=1_000)


def test_in_sample_firing_rate_carries_no_rate_by_type() -> None:
    """`InSampleFiringRate.rate` is `None` and no constructor argument can put a number there.

    `D8.2`'s trap, stated as a field: a caller cannot accidentally read a number out of an
    `in_sample` cell, because there is no code path in this dataclass that ever assigns one.
    """
    window = Window(start_ms=0, end_ms=1_000)
    result = InSampleFiringRate(calib_window=window, eval_window=window)
    assert result.mode == "in_sample"
    assert result.rate is None


def test_walk_forward_firing_rate_requires_a_positive_n_windows() -> None:
    """`n_windows <= 0` refuses — `D8.2`'s OOS discipline needs at least one window."""
    window = Window(start_ms=0, end_ms=1_000)
    with pytest.raises(InvalidFiringRateError, match="n_windows"):
        WalkForwardFiringRate(calib_window=window, eval_window=window, n_windows=0, rate=0.05)


@pytest.mark.parametrize("bad_rate", [-0.01, 1.01])
def test_walk_forward_firing_rate_refuses_rate_outside_zero_one(bad_rate: float) -> None:
    """`rate` must satisfy `0 <= rate <= 1` — it is a share of windows that fired."""
    window = Window(start_ms=0, end_ms=1_000)
    with pytest.raises(InvalidFiringRateError, match="rate"):
        WalkForwardFiringRate(calib_window=window, eval_window=window, n_windows=23, rate=bad_rate)


def test_walk_forward_firing_rate_reproduces_the_d8_2_oos_shape() -> None:
    """`D8.2`'s own number: `n=23`, `max 12,847%` — the SHAPE this type carries.

    Not a claim that `T-08.6` computed it (that rule is `T-08.8`'s).
    """
    calib = Window(start_ms=0, end_ms=1_000)
    later_eval = Window(start_ms=1_000, end_ms=2_000)
    result = WalkForwardFiringRate(
        calib_window=calib, eval_window=later_eval, n_windows=23, rate=0.12847
    )
    assert result.mode == "walk_forward"
    assert result.n_windows == 23
    assert result.rate == pytest.approx(0.12847)
