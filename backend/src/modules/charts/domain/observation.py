"""`Observation` — identity + value + real support, the atomic unit `scan` reads (`ADR-022/D1`).

`T-08.6` shipped `evaluate_scan(values: Sequence[float], ...)`, and `Sequence[float]` cannot
express two things the anti-overfit mandate needs: WHO produced a number (`instrument_id`) and
HOW MANY real observations backed it (`n_obs`). `ADR-022`'s own falsifier names the failure this
fixes: `rolling(2016, min_periods=576)` never filled the window in the alts — a cross-sectional
population mixing BTC's full-window numbers with the alts' near-empty ones never denounces
itself when only the AGGREGATE size is checked, because the defect lives PER SYMBOL, PER POINT.

`Observation` amarra `(instrument_id, value, n_obs)` in one frozen record — the alternative (a
second `Sequence[int]` running parallel to `Sequence[float]`) is the exact failure mode this
repository already named for another pair of parallel sequences (`README`/`ADR-008`: columns
that desync under reordering). Reordering, filtering, or shuffling a `Sequence[Observation]`
can never separate an `n_obs` from the value it belongs to.

This type is used ONLY on the `scan` read path (`ADR-022/D1`): `distribution`/`histogram.py`
never gain `min_obs`/`n_obs` (`ADR-022/D5` — a `Bin.count` is an exact count, not a statistic
resolved from a possibly-too-small population, and `HistogramRecipe` never had those axes).
"""

from __future__ import annotations

from dataclasses import dataclass


class IncompleteObservationError(Exception):
    """An `Observation` with a blank `instrument_id` or a non-positive `n_obs`.

    Same posture `FieldIdentity`/`SeriesKey` already take for their own blank terms: a value
    with no identity, or a value claiming to rest on zero (or fewer) real observations, does not
    distinguish one observation from another and cannot be trusted by `min_obs` filtering.
    """


@dataclass(frozen=True)
class Observation:
    """`(instrument_id, value, n_obs)` — `ADR-022/D1`, literal.

    `instrument_id` reuses the name `sentimento.domain.series_key.SERIES_KEY_TERMS` already
    uses for the same concept. `n_obs` is the count of REAL (`SPEC-001` §5.11-eligible)
    observations that fed `value` inside the caller's `spec.window` — never recalculated inside
    `charts/domain` (which stays free of I/O, `ADR-003/FR-1`): the `ObservationSource` adapter
    that reads the population is the only thing that can know it. For a field that is already
    atomic (one point reading, no rolling aggregation), `n_obs = 1` — never inferred as `=
    window`, never invented.
    """

    instrument_id: str
    value: float
    n_obs: int

    def __post_init__(self) -> None:
        """Refuse a blank `instrument_id` or an `n_obs` that could not describe a real reading."""
        if not self.instrument_id.strip():
            raise IncompleteObservationError(
                "Observation.instrument_id is blank: a blank identity does not distinguish one "
                "observation from another"
            )
        if self.n_obs < 1:
            raise IncompleteObservationError(
                f"Observation.n_obs must be >= 1, got {self.n_obs!r}: a value with zero (or "
                f"fewer) real observations behind it is not a reading, it is a fabrication"
            )


@dataclass(frozen=True)
class Fired:
    """One observation that satisfied `spec` (`ADR-022/D3`).

    `z_or_percentile_value` is the quantity `_fires` actually compared against the resolved
    threshold: the raw `value` for `Absolute`/`Percentile`, the robust z-score itself for
    `RobustZ` — one field regardless of variant, because a table row renders one column either
    way.
    """

    instrument_id: str
    z_or_percentile_value: float
    n_obs: int


@dataclass(frozen=True)
class NotFired:
    """One observation that did NOT satisfy `spec` — same shape as `Fired`, opposite verdict."""

    instrument_id: str
    z_or_percentile_value: float
    n_obs: int


@dataclass(frozen=True)
class Insufficient:
    """One observation excluded because `n_obs < min_obs` (`ADR-022/D2`/`D3`).

    Deliberately carries NO value field: `SPEC-001:304` requires ABSENCE here, never a threshold
    or a z-score computed from too few points. A `low_confidence` flag on a value that stayed
    present was considered and rejected (`ADR-022`, alternativas recusadas) — any consumer that
    ignores the flag (an export, an accidental `sum()`) would read a number the spec forbids.
    Absence of the field is the only form that does not depend on a caller's discipline.
    """

    instrument_id: str
    n_obs: int
    min_obs_required: int


#: The discriminated union every observation resolves to — `ADR-022/D3`, same idiom
#: `firing_rate.py`'s `InSampleFiringRate.rate: None` already uses for absence-by-type.
ObservationVerdict = Fired | NotFired | Insufficient
