"""`ThresholdSpec` — the Python-side mirror of `frontend/src/app/threshold-spec-bundle.ts`.

`ADR-020/D7` names `run_scan.py`'s job as "reusa `ThresholdSpec` — não reimplementa union
type": the sum type itself (`Absolute{pct, op} | Percentile{q, window, scope, min_obs,
interpolation, op} | RobustZ{k, window, min_obs, op}`) was already fixed field-for-field by
`T-08.5`, and this module is the SAME three variants, same fields, same "no axis has a
default" discipline — a faithful port, not a second design. Python and TypeScript share no
module system, so "reuse" here means the SAME contract, transcribed, not an import:
`test_threshold_spec.py` pins the two transcriptions (this file, and `threshold-spec-bundle.ts`)
against each other by field name, the same defence `test_series_identity.py` already uses for
`SERIES_KEY_TERMS` vs the `SeriesKey` dataclass.

`Custom{expr}` is EXCLUDED here exactly as it is on the TypeScript side: `SPEC-001:292-295`
disables it by default, and no function in this module accepts, produces, or evaluates one.

What this module does NOT do: bundle encode/decode, hashing, or URL round-tripping. Those stay
a `web`/frontend concern (`ADR-020/D7`) — the Python side only needs to EVALUATE an
already-constructed spec against a population of observations (`run_scan.py`), never to build
one from a query string.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal

from src.modules.charts.domain.histogram_recipe import Interpolation

#: The closed set of comparison operators — `frontend/src/app/threshold-spec-bundle.ts:45`,
#: transcribed. `SPEC-001:303`: "`ThresholdSpec` sem default em nenhum eixo. O operador vale
#: 20x" — `|r| > 0.0001` fires 9/1500 windows, `|r| >= 0.0001` fires 184/1500, same data.
Operator = Literal[">", ">=", "<", "<="]
OPERATORS: tuple[Operator, ...] = (">", ">=", "<", "<=")


class InvalidThresholdSpecError(Exception):
    """A `ThresholdSpec` axis outside its declared bound, or a missing required axis."""


def _assert_operator(op: str, field: str) -> None:
    """Refuse an `op` outside the closed 4-symbol set."""
    if op not in OPERATORS:
        raise InvalidThresholdSpecError(f"field '{field}' must be one of {OPERATORS!r}, got {op!r}")


def _assert_finite(value: float, field: str) -> None:
    """Refuse a non-finite (`NaN`/`inf`) numeric axis."""
    if not math.isfinite(value):
        raise InvalidThresholdSpecError(f"field '{field}' must be a finite number, got {value!r}")


@dataclass(frozen=True)
class AbsoluteSpec:
    """`Absolute{pct, op}` — a fixed threshold on the raw value."""

    pct: float
    op: Operator

    def __post_init__(self) -> None:
        """Refuse an invalid `op` or a non-finite `pct`."""
        _assert_operator(self.op, "op")
        _assert_finite(self.pct, "pct")


@dataclass(frozen=True)
class PercentileSpec:
    """`Percentile{q, window, scope, min_obs, interpolation, op}`.

    A threshold expressed as a percentile of a rolling population. `scope` mirrors the
    TypeScript side's own choice (`threshold-spec-bundle.ts:70-75`): a non-empty string, not a
    closed enum — the corpus only ever exercises `"CrossSection"`, and closing the enum here
    would invent domain vocabulary neither side has fixed.
    """

    q: float
    window: int
    scope: str
    min_obs: int
    interpolation: Interpolation
    op: Operator

    def __post_init__(self) -> None:
        """Refuse an invalid axis — mirrors `assertValidThresholdSpec`'s `percentile` branch."""
        _assert_operator(self.op, "op")
        _assert_finite(self.q, "q")
        if not (0.0 < self.q < 100.0):
            raise InvalidThresholdSpecError(f"field 'q' must satisfy 0 < q < 100, got {self.q!r}")
        if self.window <= 0:
            raise InvalidThresholdSpecError(
                f"field 'window' must be a positive integer, got {self.window!r}"
            )
        if not self.scope.strip():
            raise InvalidThresholdSpecError("field 'scope' cannot be empty")
        if self.min_obs <= 0:
            raise InvalidThresholdSpecError(
                f"field 'min_obs' must be a positive integer, got {self.min_obs!r}"
            )
        if self.min_obs > self.window:
            raise InvalidThresholdSpecError(
                f"'min_obs' ({self.min_obs}) cannot exceed 'window' ({self.window}) — a window "
                f"can never observe more points than it holds (SPEC-001:304's own example: "
                f"rolling(2016, min_periods=576) has min_periods < window)"
            )


@dataclass(frozen=True)
class RobustZSpec:
    """`RobustZ{k, window, min_obs, op}` — a threshold on the robust z-score of the value."""

    k: float
    window: int
    min_obs: int
    op: Operator

    def __post_init__(self) -> None:
        """Refuse an invalid axis — mirrors `assertValidThresholdSpec`'s `robust_z` branch."""
        _assert_operator(self.op, "op")
        _assert_finite(self.k, "k")
        if not self.k > 0.0:
            raise InvalidThresholdSpecError(f"field 'k' must be > 0, got {self.k!r}")
        if self.window <= 0:
            raise InvalidThresholdSpecError(
                f"field 'window' must be a positive integer, got {self.window!r}"
            )
        if self.min_obs <= 0:
            raise InvalidThresholdSpecError(
                f"field 'min_obs' must be a positive integer, got {self.min_obs!r}"
            )
        if self.min_obs > self.window:
            raise InvalidThresholdSpecError(
                f"'min_obs' ({self.min_obs}) cannot exceed 'window' ({self.window})"
            )


#: The three enabled variants — `Custom{expr}` is part of the `SPEC-001:292-295` sum type but
#: deliberately excluded here, same as on the TypeScript side.
ThresholdSpec = AbsoluteSpec | PercentileSpec | RobustZSpec
