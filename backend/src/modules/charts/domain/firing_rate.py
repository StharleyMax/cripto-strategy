"""`Window` + `FiringRateResult` — the type that blocks the `D8.2` trap by CONSTRUCTION.

`ADR-020/D5`. `D8.2` measured that a firing-rate cell computed with `calibWindow == evalWindow` is
tautological — the walk-forward OOS number (`n=23`: mean 1,404%, max 12,847% = 12,8x the
in-sample cell) is a DIFFERENT number from the in-sample one, and a UI that shows one where it
means the other is showing a false confidence. `ADR-020/D5` fixes the union type so that
`rate` DOES NOT EXIST on the `in_sample` branch — no caller can accidentally read a number out
of a cell that has none.

`T-08.6` built the `walk_forward` branch as a SHELL only (`calib_window`, `eval_window`,
`n_windows`, a single `rate`) — no function constructed one yet. `ADR-023/D-WF5` (`T-08.8`) is
the amendment this module carries now: a single `rate` HIDES exactly the number `D8.2` calls
alarming — the mean OOS rate (1,404%) and the worst fold (12,847% = 12,8x the target) are two
different claims, and publishing only the mean repeats, one layer up, the same "one number
hides the outlier" defect `D8.5` already named for cross-symbol dispersion.
`WalkForwardFiringRate` now carries `total_window`/`recipe`/`threshold` (the RECIPE that
reproduces the fold set, not the folds themselves — `ADR-020/D6`'s own discipline) plus
`rates`/`rate`/`max_rate`/`excluded_windows`. The `in_sample` branch is untouched by this
amendment — it was never the `D8.2` problem; `T-08.8`'s rule lives in
`domain.walk_forward`/`use_cases.compute_walk_forward_firing_rate`, not here.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:
    from src.modules.charts.domain.walk_forward import WalkForwardRecipe, WalkForwardThresholdRecipe


class InvalidWindowError(Exception):
    """A `Window` whose `end_ms` does not come strictly after its `start_ms`."""


@dataclass(frozen=True)
class Window:
    """A half-open time window, in epoch milliseconds — `[start_ms, end_ms)`.

    Milliseconds and not a `date`/`datetime`: `backend/pyproject.toml`'s `Natureza` contract
    forbids `domain`/`use_cases` from reading a clock, so TIME has to arrive as a PARAMETER
    rather than something this layer asks for — an epoch-millisecond `int`, the same shape
    `sentimento`'s own decision-read functions already take `t`/`knowledge_time` in.
    """

    start_ms: int
    end_ms: int

    def __post_init__(self) -> None:
        """Refuse a window that does not span forward."""
        if self.end_ms <= self.start_ms:
            raise InvalidWindowError(
                f"end_ms={self.end_ms} must be strictly greater than start_ms={self.start_ms}"
            )


@dataclass(frozen=True)
class InSampleFiringRate:
    """`{mode: "in_sample", calibWindow, evalWindow, rate: null}` — `ADR-020/D5`.

    `rate` is fixed at `None` BY THE DATACLASS FIELD ITSELF (not merely by convention): there
    is no constructor argument that can put a number there, which is the type-level half of
    `D8.2`'s guard. The legend text `D8.2` requires ("tautológico — janelas idênticas") is a
    RENDERING concern (`charts`/`web`), not this type's job — this type only guarantees the
    renderer never has a number to show instead of that legend.
    """

    calib_window: Window
    eval_window: Window
    mode: Literal["in_sample"] = "in_sample"
    rate: None = None


class InvalidFiringRateError(Exception):
    """A `WalkForwardFiringRate` axis out of its declared bound, or an internal inconsistency.

    Between `rates`/`rate`/`max_rate`/`n_windows` — `ADR-023/D-WF5`'s own invariant.
    """


@dataclass(frozen=True)
class WalkForwardFiringRate:
    """`{mode, totalWindow, recipe, threshold, nWindows, excludedWindows, rates, rate, maxRate}`.

    `ADR-020/D5`, amended by `ADR-023/D-WF5` (`T-08.8`). `totalWindow` REPLACES the shell's
    `calibWindow`/`evalWindow` on this branch — a single pair of windows cannot describe `N`
    folds, and showing only the first or last fold would be arbitrary (`D-WF5`, literal).
    `recipe` + `threshold` are the RECIPE that regenerates the exact fold set
    (`domain.walk_forward.partition_folds`), not the folds themselves — the same "recipe, not
    frozen derived numbers" discipline `HistogramRecipe` already uses (`ADR-020/D6`).

    `rates` holds one entry per fold ACTUALLY computed (post-exclusion, `D-WF4`); `rate` is
    `statistics.mean(rates)`, kept as the headline number renderers already expect; `max_rate`
    is `max(rates)` — the number `D8.2` calls "12,8x the target" and that a mean alone would
    hide. `excluded_windows` counts folds dropped for insufficient population (`D-WF4`) — never
    a list of reasons, the same "count is enough, inspecting further is `S3`'s job" choice
    `ADR-023` states directly.
    """

    total_window: Window
    recipe: WalkForwardRecipe
    threshold: WalkForwardThresholdRecipe
    n_windows: int
    excluded_windows: int
    rates: tuple[float, ...]
    rate: float
    max_rate: float
    mode: Literal["walk_forward"] = "walk_forward"

    def __post_init__(self) -> None:
        """Refuse a non-positive `n_windows`, or `rates`/`rate`/`max_rate` disagreeing with it.

        `D-WF5`'s own invariant: `len(rates) == n_windows`, `rate == mean(rates)`, `max_rate ==
        max(rates)` — enforced HERE rather than trusted from the caller, the same "by
        construction, not by discipline of whoever writes the call" posture `D-WF3` already
        uses for the calibration freeze.
        """
        if self.n_windows <= 0:
            raise InvalidFiringRateError(
                f"n_windows must be a positive integer, got {self.n_windows!r}"
            )
        if self.excluded_windows < 0:
            raise InvalidFiringRateError(
                f"excluded_windows cannot be negative, got {self.excluded_windows!r}"
            )
        if len(self.rates) != self.n_windows:
            raise InvalidFiringRateError(
                f"len(rates)={len(self.rates)} must equal n_windows={self.n_windows}: rates "
                f"holds exactly one entry per fold actually computed"
            )
        for one_rate in self.rates:
            if one_rate < 0.0 or one_rate > 1.0:
                raise InvalidFiringRateError(
                    f"every entry of rates must satisfy 0 <= rate <= 1, got {one_rate!r} in "
                    f"{self.rates!r}"
                )
        expected_rate = statistics.mean(self.rates)
        if self.rate != expected_rate:
            raise InvalidFiringRateError(
                f"rate={self.rate!r} must equal statistics.mean(rates)={expected_rate!r}"
            )
        expected_max_rate = max(self.rates)
        if self.max_rate != expected_max_rate:
            raise InvalidFiringRateError(
                f"max_rate={self.max_rate!r} must equal max(rates)={expected_max_rate!r}"
            )


#: `ADR-020/D5`'s sum type: `rate` exists ONLY on the `walk_forward` branch, by type.
FiringRateResult = InSampleFiringRate | WalkForwardFiringRate
