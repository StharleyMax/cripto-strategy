"""`Window` + `FiringRateResult` — `ADR-020/D5`: `rate` absent by TYPE on `in_sample`.

`WalkForwardFiringRate`'s shape below is `ADR-023/D-WF5`'s amendment — `total_window`/
`recipe`/`threshold`/`rates`/`max_rate` replaced the shell's `calib_window`/`eval_window`/
single `rate`; the `in_sample` tests are untouched by that amendment.
"""

from __future__ import annotations

import statistics

import pytest

from src.modules.charts.domain.firing_rate import (
    InSampleFiringRate,
    InvalidFiringRateError,
    InvalidWindowError,
    WalkForwardFiringRate,
    Window,
)
from src.modules.charts.domain.histogram_recipe import Interpolation
from src.modules.charts.domain.walk_forward import WalkForwardRecipe, WalkForwardThresholdRecipe

DAY_MS = 86_400_000

RECIPE = WalkForwardRecipe(
    spec_version=1,
    calib_length_ms=7 * DAY_MS,
    eval_length_ms=1 * DAY_MS,
    step_ms=1 * DAY_MS,
    min_obs_calib=1,
    min_obs_eval=1,
)
THRESHOLD = WalkForwardThresholdRecipe(q=99.0, interpolation=Interpolation.LINEAR, op=">=")


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


def _build(**overrides: object) -> WalkForwardFiringRate:
    """Build a `WalkForwardFiringRate` with sane defaults, one field overridden at a time."""
    defaults: dict[str, object] = {
        "total_window": Window(start_ms=0, end_ms=30 * DAY_MS),
        "recipe": RECIPE,
        "threshold": THRESHOLD,
        "n_windows": 3,
        "excluded_windows": 0,
        "rates": (0.01, 0.02, 0.03),
        "rate": 0.02,
        "max_rate": 0.03,
    }
    defaults.update(overrides)
    return WalkForwardFiringRate(**defaults)  # type: ignore[arg-type]


def test_walk_forward_firing_rate_requires_a_positive_n_windows() -> None:
    """`n_windows <= 0` refuses — `D8.2`'s OOS discipline needs at least one window."""
    with pytest.raises(InvalidFiringRateError, match="n_windows"):
        _build(n_windows=0, rates=())


def test_walk_forward_firing_rate_refuses_a_negative_excluded_windows() -> None:
    """`excluded_windows` is a COUNT (`D-WF4`) — it cannot be negative."""
    with pytest.raises(InvalidFiringRateError, match="excluded_windows"):
        _build(excluded_windows=-1)


def test_walk_forward_firing_rate_refuses_rates_length_mismatching_n_windows() -> None:
    """`len(rates) != n_windows` refuses — `D-WF5`'s own invariant, enforced by construction."""
    with pytest.raises(InvalidFiringRateError, match="len\\(rates\\)"):
        _build(n_windows=5)  # rates has 3 entries, not 5


@pytest.mark.parametrize("bad_rate", [-0.01, 1.01])
def test_walk_forward_firing_rate_refuses_a_rate_outside_zero_one(bad_rate: float) -> None:
    """Every entry of `rates` must satisfy `0 <= rate <= 1` — it is a fold's share fired."""
    with pytest.raises(InvalidFiringRateError, match="rates"):
        _build(rates=(0.01, bad_rate, 0.03), rate=0.02, max_rate=max(0.03, bad_rate))


def test_walk_forward_firing_rate_refuses_a_rate_that_is_not_the_mean() -> None:
    """`rate` must equal `statistics.mean(rates)` exactly — `D-WF5`'s own invariant."""
    with pytest.raises(InvalidFiringRateError, match="rate"):
        _build(rate=0.5)


def test_walk_forward_firing_rate_refuses_a_max_rate_that_is_not_the_max() -> None:
    """`max_rate` must equal `max(rates)` exactly — the number `D8.2` calls "12,8x the target"."""
    with pytest.raises(InvalidFiringRateError, match="max_rate"):
        _build(max_rate=0.5)


def test_walk_forward_firing_rate_reproduces_the_d8_2_oos_shape() -> None:
    """`D8.2`'s own number: `n=23`, `max 12,847%` — the SHAPE this type carries.

    Not a claim that this type COMPUTES it (the rule lives in
    `use_cases.compute_walk_forward_firing_rate`) — only that the shape can carry it without
    the mean (1,404%) hiding the worst fold, which is `D-WF5`'s whole point.
    """
    rates = tuple([0.01404] * 22 + [0.12847])
    result = _build(
        total_window=Window(start_ms=0, end_ms=30 * DAY_MS),
        n_windows=23,
        excluded_windows=0,
        rates=rates,
        rate=statistics.mean(rates),
        max_rate=0.12847,
    )
    assert result.mode == "walk_forward"
    assert result.n_windows == 23
    assert result.rate == pytest.approx(statistics.mean(rates))
    assert result.max_rate == pytest.approx(0.12847)
    # The mean alone (≈1,89% for this fixture) would NOT show the 12,847% fold — `rates`
    # carries it, which is `D-WF5`'s whole point: a caller reading only `rate` still misses it.
    assert result.max_rate > result.rate
