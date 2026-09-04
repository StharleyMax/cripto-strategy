"""`compute_histogram` — quantile edges, point mass, and overflow as first-class bins.

`ADR-020/D2-D4`, over an ALREADY-ELIGIBLE population. `ADR-020/D2` names four steps. Step 1
(elegibilidade: "de todas as observações de `field` ...
mantém só as que a política de ausência de `nature` classifica como valor real") is a READ
concern — it decides what counts as a stored, real observation versus a carried-forward
(`LOCF`) value, which lives with whoever owns the storage read (`ADR-020/D7`: the concrete
query is out of scope for this task; `use_cases.compute_distribution.ObservationSource` names
the contract the caller must uphold). This module is `domain`: no file, no socket, no clock —
it CONSUMES an already-filtered `Sequence[float]` and performs steps 2-4 only (`ADR-020/D2`,
literal: "O motor de histograma consome essa política como pré-filtro; não a reescreve").

Step 2 (massa pontual, `D3`) removes point-mass values from the population BEFORE quantiles are
computed over the remainder — this is why `_extract_point_masses` runs first in
`compute_histogram` below, and why a value that qualifies as a point mass never also counts
toward a finite bin or an overflow bin: the three are a PARTITION of the input, not overlapping
views of it, which is what makes `HistogramResult.__post_init__`'s sum invariant hold by
construction rather than by luck.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

from src.modules.charts.domain.field_identity import FieldIdentity
from src.modules.charts.domain.histogram_recipe import HistogramRecipe, Interpolation
from src.modules.sentimento.domain.series_key import Nature


class EmptyHistogramInputError(Exception):
    """A histogram of zero observations does not exist.

    Refusing beats fabricating an empty result. Same posture as
    `sentimento.domain.availability_lag_stats.EmptyLagSampleError`: absence of input is a fact
    the caller needs to see and handle (`nTotal == 0` would otherwise silently divide
    `Overflow.share` by zero one function down), not a `HistogramResult` full of zeros that
    looks like "a field with nothing outside its bins" instead of "no data reached here".
    """


class HistogramInvariantError(Exception):
    """The construction invariant broke: bins + overflow + point masses do not sum to `n_total`.

    `ADR-020/D4`, literal: "um teste de regressão tem de fixar" this exact sum. It cannot
    actually fail given how `compute_histogram` partitions its input below — `_extract_point_
    masses` and `_bin_remainder` are a strict partition — but the check stays in
    `HistogramResult.__post_init__` as the second, independent witness `ADR-020`'s own
    falsifier asks for: "Um histograma cujos bins + overflow + massas pontuais não somem
    `nTotal` — quebra `D4` diretamente." A defense that only the code path itself could ever
    trip is still worth keeping, the same way `LagSummaryRow.__post_init__` re-checks an
    invariant its own caller already upholds.
    """


@dataclass(frozen=True)
class PointMass:
    """One value whose observed share meets `HistogramRecipe.point_mass_min_share` (`D3`)."""

    value: float
    count: int


@dataclass(frozen=True)
class Bin:
    """One finite bin `[lo, hi)` — `ADR-020/D2` step 4."""

    lo: float
    hi: float
    count: int


@dataclass(frozen=True)
class Overflow:
    """One overflow tail — `ADR-020/D4`: always computed, always exposed, never discarded."""

    count: int
    share: float
    extreme: float | None

    def __post_init__(self) -> None:
        """Refuse an overflow whose `extreme` and `count` disagree about whether it is empty."""
        if (self.count == 0) != (self.extreme is None):
            raise HistogramInvariantError(
                f"count={self.count} and extreme={self.extreme!r} disagree about whether this "
                f"overflow tail is empty (count=0 <=> extreme=None)"
            )


@dataclass(frozen=True)
class UniverseInfo:
    """`{declared, nResolved}` — `D8.8`: every cross-symbol metric carries its own `n`."""

    declared: str
    n_resolved: int


@dataclass(frozen=True)
class HistogramResult:
    """`ADR-020/D4`, literal — the motor's whole answer for one `(field, nature)` read."""

    field: FieldIdentity
    nature: Nature
    point_masses: tuple[PointMass, ...]
    bins: tuple[Bin, ...]
    overflow_left: Overflow
    overflow_right: Overflow
    n_total: int
    universe: UniverseInfo

    def __post_init__(self) -> None:
        """Refuse a result whose parts do not sum to `n_total` — `ADR-020`'s falsifier."""
        total = (
            sum(one_bin.count for one_bin in self.bins)
            + self.overflow_left.count
            + self.overflow_right.count
            + sum(mass.count for mass in self.point_masses)
        )
        if total != self.n_total:
            raise HistogramInvariantError(
                f"bins + overflow + point masses sum to {total}, not n_total={self.n_total} "
                f"(ADR-020/D4's own falsifier: this sum must always hold)"
            )


def percentile(values: Sequence[float], q: float, interpolation: Interpolation) -> float:
    """Return the `q`-th percentile of `values` (`0 <= q <= 100`).

    By `numpy.percentile`'s own five `interpolation` methods — reimplemented here because this
    backend declares zero numeric runtime dependency (`backend/pyproject.toml`), and `numpy`
    would be the first one.

    `values` MUST be non-empty; every caller in this package (`_quantile_edges` here, and
    `scan.py`'s `_median`/threshold resolution) already holds that invariant before calling in,
    so this function does not re-guard it — the same "guarded once, at the edge" shape
    `SeriesKey.__post_init__` uses for its own terms.
    """
    ordered = sorted(values)
    n = len(ordered)
    if n == 1:
        return ordered[0]
    rank = (q / 100.0) * (n - 1)
    lower_index = math.floor(rank)
    upper_index = math.ceil(rank)
    lower_value = ordered[lower_index]
    upper_value = ordered[upper_index]
    if interpolation is Interpolation.LOWER:
        return lower_value
    if interpolation is Interpolation.HIGHER:
        return upper_value
    if interpolation is Interpolation.NEAREST:
        return lower_value if (rank - lower_index) <= (upper_index - rank) else upper_value
    if interpolation is Interpolation.MIDPOINT:
        return (lower_value + upper_value) / 2.0
    # Interpolation.LINEAR — numpy's default: linear interpolation between the two neighbours.
    fraction = rank - lower_index
    return lower_value + fraction * (upper_value - lower_value)


def _extract_point_masses(
    values: Sequence[float], point_mass_min_share: float
) -> tuple[tuple[PointMass, ...], list[float]]:
    """`ADR-020/D3`: `share(v) = count(v)/|X| >= pointMassMinShare` becomes a degenerate bin.

    Returns the point masses (sorted by value, for a stable, deterministic result) and the
    REMAINDER — every input value that is not one of those point-mass values, preserving
    duplicates that did not clear the share threshold (a value at 0,9% share stays an ordinary
    point among the quantile population; only >= `point_mass_min_share` is pulled out).
    """
    n = len(values)
    counts: dict[float, int] = {}
    for value in values:
        counts[value] = counts.get(value, 0) + 1
    mass_values = {value for value, count in counts.items() if (count / n) >= point_mass_min_share}
    masses = tuple(
        sorted(
            (PointMass(value=value, count=counts[value]) for value in mass_values),
            key=lambda mass: mass.value,
        )
    )
    remainder = [value for value in values if value not in mass_values]
    return masses, remainder


def _quantile_edges(
    remainder: Sequence[float], quantiles: Sequence[float], interpolation: Interpolation
) -> tuple[float, ...]:
    """`ADR-020/D2` step 3 — the bin edges, one per `recipe.quantiles`, over the REMAINDER.

    An empty `remainder` (every observation was pulled into a point mass) has no distribution
    left to take a percentile of — this returns no edges at all rather than raising, because
    that is still a legitimate outcome (`compute_histogram` below folds it into zero finite
    bins and empty overflow tails, not a refusal): a field that is ENTIRELY point mass is a
    real, observable shape, not malformed input.
    """
    if not remainder:
        return ()
    return tuple(percentile(remainder, q, interpolation) for q in quantiles)


def _bin_remainder(
    remainder: Sequence[float], edges: Sequence[float], n_total: int
) -> tuple[tuple[Bin, ...], Overflow, Overflow]:
    """`ADR-020/D2` step 4 + `D4`: finite bins `[e_j, e_{j+1})`, plus the two overflow tails.

    `Overflow.share` divides by `n_total` (the FULL eligible population, point masses
    included), not by `len(remainder)` — `ADR-020`'s falsifier states the ratio as
    `overflowRight.count / nTotal`, and a share computed against the remainder alone would
    quietly inflate itself on any field with a non-trivial point mass (`D8.7`'s funding case).
    """
    if not edges:
        empty = Overflow(count=0, share=0.0, extreme=None)
        return (), empty, empty

    sorted_edges = tuple(sorted(edges))
    left_edge = sorted_edges[0]
    right_edge = sorted_edges[-1]
    ordered_values = sorted(remainder)

    left_values = [value for value in ordered_values if value < left_edge]
    right_values = [value for value in ordered_values if value >= right_edge]

    bins: list[Bin] = []
    for lo, hi in zip(sorted_edges, sorted_edges[1:], strict=False):
        count = sum(1 for value in ordered_values if lo <= value < hi)
        bins.append(Bin(lo=lo, hi=hi, count=count))

    overflow_left = Overflow(
        count=len(left_values),
        share=len(left_values) / n_total,
        extreme=min(left_values) if left_values else None,
    )
    overflow_right = Overflow(
        count=len(right_values),
        share=len(right_values) / n_total,
        extreme=max(right_values) if right_values else None,
    )
    return tuple(bins), overflow_left, overflow_right


def compute_histogram(
    values: Sequence[float],
    *,
    field: FieldIdentity,
    nature: Nature,
    universe_declared: str,
    n_universe_resolved: int,
    recipe: HistogramRecipe,
) -> HistogramResult:
    """`ADR-020/D2` steps 2-4 over an already-eligible population — the motor's entry point.

    `values` must already be the ELIGIBLE observations for `(field, nature)` — step 1 of `D2`
    (the `SPEC-001` §5.11 pre-filter) is the caller's job
    (`use_cases.compute_distribution.ObservationSource`), never re-derived here.
    """
    n_total = len(values)
    if n_total == 0:
        raise EmptyHistogramInputError(
            f"compute_histogram received zero eligible observations for field={field!r} "
            f"nature={nature!r}: refusing rather than returning a HistogramResult that would "
            f"look like 'nothing outside the bins' instead of 'no data reached here'"
        )
    point_masses, remainder = _extract_point_masses(values, recipe.point_mass_min_share)
    edges = _quantile_edges(remainder, recipe.quantiles, recipe.interpolation)
    bins, overflow_left, overflow_right = _bin_remainder(remainder, edges, n_total)
    return HistogramResult(
        field=field,
        nature=nature,
        point_masses=point_masses,
        bins=bins,
        overflow_left=overflow_left,
        overflow_right=overflow_right,
        n_total=n_total,
        universe=UniverseInfo(declared=universe_declared, n_resolved=n_universe_resolved),
    )
