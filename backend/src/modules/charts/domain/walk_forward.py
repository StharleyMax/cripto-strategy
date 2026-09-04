"""`WalkForwardRecipe`/`WalkForwardThresholdRecipe`/`partition_folds` — `ADR-023`.

`D8.2` measured that a `firing_rate` cell computed with `calibWindow == evalWindow` is
tautological: the interesting number is out-of-sample (OOS), calibrating a threshold on one
stretch of history and testing it on the NEXT one. `T-08.6`/`ADR-020/D5` fixed the TYPE
(`WalkForwardFiringRate` as a shell, no constructor); `ADR-023` is the RULE — how the window
splits into folds (`D-WF1`), which instant each side of each fold is read "as of" (`D-WF2`,
the anti-lookahead guard), and how a threshold calibrated on one population is frozen before it
ever touches the other (`D-WF3`).

This module owns the three pieces `ADR-023`'s own "Consequência" names for `domain/`:
`WalkForwardRecipe`, `WalkForwardThresholdRecipe`, the two refusal types, and the pure
partition function. It reads no clock and no store — `partition_folds` is arithmetic over the
`Window` the caller already resolved, exactly like `histogram.py`/`scan.py` consume an
already-eligible `Sequence[float]` rather than a store handle.
"""

from __future__ import annotations

from dataclasses import dataclass

from src.modules.charts.domain.firing_rate import Window
from src.modules.charts.domain.histogram_recipe import Interpolation
from src.modules.charts.domain.threshold_spec import (
    OPERATORS,
    Operator,
    PercentileSpec,
    ThresholdSpec,
)


class InvalidWalkForwardRecipeError(Exception):
    """A `WalkForwardRecipe` axis outside its declared bound — no axis defaults (`ADR-020/D6`)."""


class InvalidWalkForwardThresholdRecipeError(Exception):
    """A `WalkForwardThresholdRecipe` axis outside its declared bound."""


class InsufficientWindowForWalkForwardError(Exception):
    """A `window` too short to produce even one fold, or every fold excluded (`D-WF1`/`D-WF4`).

    `ADR-023`, literal: "população vazia é o mesmo fato, medido depois em vez de antes" — this
    one type covers both the guard BEFORE fold 0 is built (`D-WF1`: `window` shorter than
    `calibLengthMs + evalLengthMs`) and the guard AFTER every fold was excluded for
    insufficient population (`D-WF4`), because both are the same fact: zero usable folds.
    """


class NonCalibratableSpecError(Exception):
    """A `ThresholdSpec` with no population-derived parameter to freeze per fold (`D-WF3`).

    Only `PercentileSpec` narrows onto `WalkForwardThresholdRecipe` — `AbsoluteSpec` has
    nothing derived from a population to calibrate (there is no leak to guard against), and
    `RobustZSpec` would need TWO frozen numbers (median, MAD), a calibration `ADR-023` does not
    build (named, not decided).
    """


@dataclass(frozen=True)
class WalkForwardRecipe:
    """The partition recipe — `D-WF1`.

    `{specVersion, calibLengthMs, evalLengthMs, stepMs, minObsCalib, minObsEval}`.
    `calibLengthMs`/`evalLengthMs`/`stepMs` are DURATIONS in epoch milliseconds, never a bar
    count — `D-WF1`'s own reasoning: a bar-count axis would silently change meaning across
    instruments with different sampling cadence, and `D8.2`'s own `n=23` is only reproducible
    from a TIME span (`30d` total, `7d` calib, `1d` eval). `stepMs` has NO dataclass default
    (`ADR-020/D6`: "nenhum eixo com default silencioso") — `default_step_ms` below is the named,
    explicit helper a caller uses to opt into `ADR-023`'s declared default (`stepMs =
    evalLengthMs`) instead of a value the dataclass would supply on its own.
    """

    spec_version: int
    calib_length_ms: int
    eval_length_ms: int
    step_ms: int
    min_obs_calib: int
    min_obs_eval: int

    def __post_init__(self) -> None:
        """Refuse a non-positive duration or floor — every axis is a strictly positive count."""
        for name, value in (
            ("spec_version", self.spec_version),
            ("calib_length_ms", self.calib_length_ms),
            ("eval_length_ms", self.eval_length_ms),
            ("step_ms", self.step_ms),
            ("min_obs_calib", self.min_obs_calib),
            ("min_obs_eval", self.min_obs_eval),
        ):
            if value <= 0:
                raise InvalidWalkForwardRecipeError(
                    f"field '{name}' must be a positive integer, got {value!r}"
                )


def default_step_ms(eval_length_ms: int) -> int:
    """`D-WF1`'s DECLARED default for `WalkForwardRecipe.step_ms`: `= eval_length_ms`.

    Named and explicit rather than a silent dataclass default (`ADR-020/D6`) — a caller who
    wants the default calls this function; a caller who wants a different `step_ms` (e.g.
    sparser sampling for read cost, `D-WF2`'s own named non-blocking opinion) passes one
    directly to `WalkForwardRecipe`. With `step = evalLength`, every instant of the eval-span
    falls in EXACTLY one fold's eval — no gap, no double-count (`D-WF1`'s own falsifier for why
    the default is this value and not `calibLengthMs` or a free parameter).
    """
    return eval_length_ms


@dataclass(frozen=True)
class WalkForwardThresholdRecipe:
    """The calibration recipe — `D-WF3`: `{q, interpolation, op}`, percentile-only.

    A dedicated type, NOT `PercentileSpec` reused: `PercentileSpec.window`/`.min_obs` already
    mean "population size of one cross-sectional read" (`T-08.5`) — a different axis from this
    ADR's `calibLengthMs`/`minObsCalib` (population size of one fold's TIME span). Reusing
    `PercentileSpec` would leave `.window`/`.min_obs` present but ignored on this path, the
    exact "field present but ignored" trap `ADR-020/D6` already refused elsewhere.
    """

    q: float
    interpolation: Interpolation
    op: Operator

    def __post_init__(self) -> None:
        """Refuse an invalid axis — mirrors `PercentileSpec`'s own `q`/`op` guards."""
        if self.op not in OPERATORS:
            raise InvalidWalkForwardThresholdRecipeError(
                f"field 'op' must be one of {OPERATORS!r}, got {self.op!r}"
            )
        if not (0.0 < self.q < 100.0):
            raise InvalidWalkForwardThresholdRecipeError(
                f"field 'q' must satisfy 0 < q < 100, got {self.q!r}"
            )


def to_walk_forward_threshold_recipe(spec: ThresholdSpec) -> WalkForwardThresholdRecipe:
    """Narrow an already-chosen `ThresholdSpec` onto `D-WF3`'s percentile-only calibration.

    `AbsoluteSpec` has no population-derived parameter to calibrate (nothing leaks between
    calib and eval for a literal); `RobustZSpec` would need two frozen numbers (median, MAD),
    a calibration `ADR-023` names but does not build. Both refuse here, by name
    (`NonCalibratableSpecError`), rather than this function guessing at a freezing rule no
    measurement in this SPEC validates. Only `PercentileSpec` narrows losslessly: `window`,
    `min_obs`, and `scope` are dropped ON PURPOSE — `WalkForwardRecipe`'s own
    `calib_length_ms`/`min_obs_calib` replace them for the walk-forward path, and carrying the
    unused fields through would be the same "present but ignored" trap this ADR already refused
    for the reverse direction (`WalkForwardThresholdRecipe` docstring above).
    """
    if not isinstance(spec, PercentileSpec):
        raise NonCalibratableSpecError(
            f"{type(spec).__name__} cannot be calibrated walk-forward: only a percentile "
            f"threshold is decided (ADR-023/D-WF3) — {spec!r} has no population-derived "
            f"parameter to freeze per fold"
        )
    return WalkForwardThresholdRecipe(q=spec.q, interpolation=spec.interpolation, op=spec.op)


@dataclass(frozen=True)
class WalkForwardFold:
    """One `(calib_window, eval_window)` pair — `D-WF1`'s own pseudocode, `fold(i)`."""

    index: int
    calib_window: Window
    eval_window: Window


def partition_folds(window: Window, recipe: WalkForwardRecipe) -> tuple[WalkForwardFold, ...]:
    """Split `window` into rolling, non-overlapping-between-calib-and-eval folds — `D-WF1`.

    `fold(i).calib = [start + i*step, start + i*step + calibLen)`
    `fold(i).eval  = [fold(i).calib.end,                fold(i).calib.end + evalLen)`
    for `i = 0, 1, 2, ...` while `fold(i).eval.end_ms <= window.end_ms`.

    Refuses BEFORE fold 0 (`InsufficientWindowForWalkForwardError`) when `window` cannot fit
    even one fold — `D8.2`'s own arithmetic falsifier: `window` of 30 days, `calibLengthMs=7d`,
    `evalLengthMs=1d`, `stepMs=1d` MUST produce exactly 23 folds
    (`floor((30-7-1)/1)+1 == 23`), the same number `D8.2` already published.
    """
    total_span_ms = window.end_ms - window.start_ms
    min_span_ms = recipe.calib_length_ms + recipe.eval_length_ms
    if total_span_ms < min_span_ms:
        raise InsufficientWindowForWalkForwardError(
            f"window spans {total_span_ms}ms, below the {min_span_ms}ms a single fold needs "
            f"(calib_length_ms={recipe.calib_length_ms} + eval_length_ms={recipe.eval_length_ms}): "
            f"cannot produce n_windows >= 1"
        )

    folds: list[WalkForwardFold] = []
    index = 0
    while True:
        calib_start_ms = window.start_ms + index * recipe.step_ms
        calib_end_ms = calib_start_ms + recipe.calib_length_ms
        eval_start_ms = calib_end_ms
        eval_end_ms = eval_start_ms + recipe.eval_length_ms
        if eval_end_ms > window.end_ms:
            break
        folds.append(
            WalkForwardFold(
                index=index,
                calib_window=Window(start_ms=calib_start_ms, end_ms=calib_end_ms),
                eval_window=Window(start_ms=eval_start_ms, end_ms=eval_end_ms),
            )
        )
        index += 1
    return tuple(folds)
