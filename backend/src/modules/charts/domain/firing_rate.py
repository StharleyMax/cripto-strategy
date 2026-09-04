"""`Window` + `FiringRateResult` — the type that blocks the `D8.2` trap by CONSTRUCTION.

`ADR-020/D5`. `D8.2` measured that a firing-rate cell computed with `calibWindow == evalWindow` is
tautological — the walk-forward OOS number (`n=23`: mean 1,404%, max 12,847% = 12,8x the
in-sample cell) is a DIFFERENT number from the in-sample one, and a UI that shows one where it
means the other is showing a false confidence. `ADR-020/D5` fixes the union type so that
`rate` DOES NOT EXIST on the `in_sample` branch — no caller can accidentally read a number out
of a cell that has none.

This module builds the TYPE only. `T-08.8` is the task that decides the RULE for computing a
walk-forward `rate` (window count, split, the honesty of the number) — this module's job ends
at "the shape refuses to let the trap compile", and `use_cases.compute_firing_rate` reflects
that boundary explicitly: it builds the `in_sample` branch (the one case already fully decided
by `D5`) and REFUSES, by name, the `walk_forward` branch until `T-08.8` exists.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


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
    """A `WalkForwardFiringRate` whose `rate`/`n_windows` axis is out of its declared bound."""


@dataclass(frozen=True)
class WalkForwardFiringRate:
    """`{mode: "walk_forward", calibWindow, evalWindow, nWindows, rate}` — `ADR-020/D5`.

    `T-08.6` (this task) only builds this SHAPE; no function in this module or in
    `use_cases.compute_firing_rate` constructs one yet — `T-08.8` is the task that decides how
    `n_windows`/`rate` are computed (the walk-forward split, the OOS discipline `D8.2` names).
    """

    calib_window: Window
    eval_window: Window
    n_windows: int
    rate: float
    mode: Literal["walk_forward"] = "walk_forward"

    def __post_init__(self) -> None:
        """Refuse a non-positive `n_windows` or a `rate` outside `[0, 1]`."""
        if self.n_windows <= 0:
            raise InvalidFiringRateError(
                f"n_windows must be a positive integer, got {self.n_windows!r}"
            )
        if self.rate < 0.0 or self.rate > 1.0:
            raise InvalidFiringRateError(f"rate must satisfy 0 <= rate <= 1, got {self.rate!r}")


#: `ADR-020/D5`'s sum type: `rate` exists ONLY on the `walk_forward` branch, by type.
FiringRateResult = InSampleFiringRate | WalkForwardFiringRate
