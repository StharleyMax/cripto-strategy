"""`domain.walk_forward` — `ADR-023`'s partition, calibration recipe, and refusals."""

from __future__ import annotations

import pytest

from src.modules.charts.domain.firing_rate import Window
from src.modules.charts.domain.histogram_recipe import Interpolation
from src.modules.charts.domain.threshold_spec import AbsoluteSpec, PercentileSpec, RobustZSpec
from src.modules.charts.domain.walk_forward import (
    InsufficientWindowForWalkForwardError,
    InvalidWalkForwardRecipeError,
    InvalidWalkForwardThresholdRecipeError,
    NonCalibratableSpecError,
    WalkForwardRecipe,
    WalkForwardThresholdRecipe,
    default_step_ms,
    partition_folds,
    to_walk_forward_threshold_recipe,
)

DAY_MS = 86_400_000

D8_2_RECIPE = WalkForwardRecipe(
    spec_version=1,
    calib_length_ms=7 * DAY_MS,
    eval_length_ms=1 * DAY_MS,
    step_ms=1 * DAY_MS,
    min_obs_calib=1,
    min_obs_eval=1,
)


# ── `WalkForwardRecipe` — every axis is a strictly positive duration/floor ─────────────────


@pytest.mark.parametrize(
    "field_name",
    [
        "spec_version",
        "calib_length_ms",
        "eval_length_ms",
        "step_ms",
        "min_obs_calib",
        "min_obs_eval",
    ],
)
def test_walk_forward_recipe_refuses_a_non_positive_axis(field_name: str) -> None:
    """Every axis of `WalkForwardRecipe` must be a strictly positive integer."""
    kwargs = {
        "spec_version": 1,
        "calib_length_ms": 7 * DAY_MS,
        "eval_length_ms": 1 * DAY_MS,
        "step_ms": 1 * DAY_MS,
        "min_obs_calib": 30,
        "min_obs_eval": 5,
    }
    kwargs[field_name] = 0
    with pytest.raises(InvalidWalkForwardRecipeError, match=field_name):
        WalkForwardRecipe(**kwargs)


def test_default_step_ms_is_the_eval_length_d_wf1() -> None:
    """`D-WF1`'s DECLARED default: `stepMs = evalLengthMs` — folds tile the eval-span exactly."""
    assert default_step_ms(eval_length_ms=1 * DAY_MS) == 1 * DAY_MS
    assert default_step_ms(eval_length_ms=4 * 3_600_000) == 4 * 3_600_000


# ── `WalkForwardThresholdRecipe` — percentile-only, `q`/`op` bounded ───────────────────────


def test_walk_forward_threshold_recipe_refuses_an_invalid_op() -> None:
    """`op` must be one of the closed 4-symbol set — same discipline as `ThresholdSpec`."""
    with pytest.raises(InvalidWalkForwardThresholdRecipeError, match="op"):
        WalkForwardThresholdRecipe(
            q=99.0,
            interpolation=Interpolation.LINEAR,
            op="==",  # type: ignore[arg-type]
        )


@pytest.mark.parametrize("bad_q", [0.0, 100.0, -1.0, 101.0])
def test_walk_forward_threshold_recipe_refuses_q_outside_open_interval(bad_q: float) -> None:
    """`q` must satisfy `0 < q < 100` — a percentile at the boundary is not a percentile."""
    with pytest.raises(InvalidWalkForwardThresholdRecipeError, match="q"):
        WalkForwardThresholdRecipe(q=bad_q, interpolation=Interpolation.LINEAR, op=">=")


# ── `to_walk_forward_threshold_recipe` — only `PercentileSpec` narrows, `D-WF3` ────────────


def test_to_walk_forward_threshold_recipe_narrows_a_percentile_spec() -> None:
    """Only `q`/`interpolation`/`op` survive.

    `PercentileSpec.window`/`.min_obs`/`.scope` are DROPPED — `calib_length_ms`/
    `min_obs_calib` replace them on the walk-forward path.
    """
    spec = PercentileSpec(
        q=99.0,
        window=2016,
        scope="CrossSection",
        min_obs=576,
        interpolation=Interpolation.LINEAR,
        op=">=",
    )
    recipe = to_walk_forward_threshold_recipe(spec)
    assert recipe == WalkForwardThresholdRecipe(q=99.0, interpolation=Interpolation.LINEAR, op=">=")


def test_to_walk_forward_threshold_recipe_refuses_an_absolute_spec() -> None:
    """`AbsoluteSpec` has no population-derived parameter — nothing to calibrate."""
    with pytest.raises(NonCalibratableSpecError, match="AbsoluteSpec"):
        to_walk_forward_threshold_recipe(AbsoluteSpec(pct=5.0, op=">"))


def test_to_walk_forward_threshold_recipe_refuses_a_robust_z_spec() -> None:
    """`RobustZSpec` needs TWO frozen numbers (median, MAD) — `ADR-023` names it, not built here."""
    with pytest.raises(NonCalibratableSpecError, match="RobustZSpec"):
        to_walk_forward_threshold_recipe(RobustZSpec(k=3.0, window=2016, min_obs=576, op=">"))


# ── `partition_folds` — `D-WF1`'s structural falsifier ─────────────────────────────────────


def test_partition_produces_exactly_23_folds_for_the_d8_2_shape() -> None:
    """`D8.2`'s own arithmetic: `floor((30-7-1)/1)+1 = 23`.

    `ADR-023`'s structural falsifier — this holds with no store, no builder-computed rate, just
    the partition arithmetic over `(30d total, 7d calib, 1d eval, 1d step)`.
    """
    window = Window(start_ms=0, end_ms=30 * DAY_MS)
    folds = partition_folds(window, D8_2_RECIPE)
    assert len(folds) == 23


def test_partition_first_and_last_fold_land_on_the_window_boundaries() -> None:
    """Fold 0 starts calibrating at `window.start`; the last fold's eval ends at `window.end`."""
    window = Window(start_ms=0, end_ms=30 * DAY_MS)
    folds = partition_folds(window, D8_2_RECIPE)
    assert folds[0].calib_window == Window(start_ms=0, end_ms=7 * DAY_MS)
    assert folds[0].eval_window == Window(start_ms=7 * DAY_MS, end_ms=8 * DAY_MS)
    assert folds[-1].eval_window.end_ms == window.end_ms


def test_partition_eval_windows_tile_the_eval_span_without_gap_or_overlap() -> None:
    """`D-WF1`: `step = evalLength` makes every instant fall in EXACTLY one fold's eval."""
    window = Window(start_ms=0, end_ms=30 * DAY_MS)
    folds = partition_folds(window, D8_2_RECIPE)
    for earlier, later in zip(folds, folds[1:], strict=False):
        assert earlier.eval_window.end_ms == later.eval_window.start_ms


def test_partition_calib_windows_of_consecutive_folds_overlap_by_design() -> None:
    """Rolling calibration, not a bug — fold 1 calib=[0,7d), fold 2 calib=[1d,8d) (`D-WF1`)."""
    window = Window(start_ms=0, end_ms=30 * DAY_MS)
    folds = partition_folds(window, D8_2_RECIPE)
    assert folds[0].calib_window == Window(start_ms=0, end_ms=7 * DAY_MS)
    assert folds[1].calib_window == Window(start_ms=1 * DAY_MS, end_ms=8 * DAY_MS)


def test_partition_refuses_a_window_shorter_than_calib_plus_eval() -> None:
    """`window` spanning exactly `calibLengthMs` cannot fit even one fold's eval side."""
    window = Window(start_ms=0, end_ms=7 * DAY_MS)
    with pytest.raises(InsufficientWindowForWalkForwardError):
        partition_folds(window, D8_2_RECIPE)


def test_partition_produces_exactly_one_fold_at_the_minimum_span() -> None:
    """`window` spanning exactly `calibLengthMs + evalLengthMs` fits exactly one fold."""
    window = Window(start_ms=0, end_ms=8 * DAY_MS)
    folds = partition_folds(window, D8_2_RECIPE)
    assert len(folds) == 1
    assert folds[0].eval_window.end_ms == window.end_ms
