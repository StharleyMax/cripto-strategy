"""`compute_histogram` — `ADR-020/D2-D4`, and the falsifier the ADR names by number."""

from __future__ import annotations

import pytest

from src.modules.charts.domain.field_identity import FieldIdentity
from src.modules.charts.domain.histogram import (
    Bin,
    EmptyHistogramInputError,
    HistogramInvariantError,
    HistogramResult,
    Overflow,
    UniverseInfo,
    compute_histogram,
    percentile,
)
from src.modules.charts.domain.histogram_recipe import (
    DEFAULT_HISTOGRAM_RECIPE,
    HistogramRecipe,
    Interpolation,
)
from src.modules.sentimento.domain.series_key import Nature
from tests.helpers.charts_fixtures import (
    synthetic_funding_like_population,
    synthetic_taker_like_population,
)

TAKER_FIELD = FieldIdentity(metric="sum_taker_long_short_vol_ratio", unit="pct", denom="none")
FUNDING_FIELD = FieldIdentity(metric="interestRate", unit="rate", denom="none")


# ── the two defensive invariants — proof they REJECT, not just that they exist ─────────────


def test_overflow_refuses_a_nonzero_count_with_no_extreme() -> None:
    """`Overflow(count=1, extreme=None)` refuses — count and extreme must agree on emptiness."""
    with pytest.raises(HistogramInvariantError, match="disagree"):
        Overflow(count=1, share=0.1, extreme=None)


def test_overflow_refuses_a_zero_count_with_an_extreme() -> None:
    """The mirror case: `Overflow(count=0, extreme=<something>)` refuses too."""
    with pytest.raises(HistogramInvariantError, match="disagree"):
        Overflow(count=0, share=0.0, extreme=5.0)


def test_histogram_result_refuses_when_parts_do_not_sum_to_n_total() -> None:
    """`ADR-020`'s own falsifier, exercised directly.

    Bins + overflow + point masses that do NOT sum to `n_total` refuses construction — the
    exact defect `D4` names.
    """
    empty_overflow = Overflow(count=0, share=0.0, extreme=None)
    with pytest.raises(HistogramInvariantError, match="n_total"):
        HistogramResult(
            field=TAKER_FIELD,
            nature=Nature.RATIO,
            point_masses=(),
            bins=(Bin(lo=0.0, hi=1.0, count=3),),  # 3 counted, but n_total claims 10
            overflow_left=empty_overflow,
            overflow_right=empty_overflow,
            n_total=10,
            universe=UniverseInfo(declared="BTCUSDT", n_resolved=1),
        )


# ── `percentile` — hand-computed against the 5 declared interpolation methods ──────────────


def test_percentile_linear_interpolates_between_neighbours() -> None:
    """`n=4`, `q=25`: `rank=0.75` between index 0 (`10`) and 1 (`20`) -> `17.5`."""
    assert percentile([40, 10, 30, 20], 25.0, Interpolation.LINEAR) == 17.5


def test_percentile_lower_picks_the_lower_neighbour() -> None:
    """Same rank as above, `lower` -> the value AT index 0."""
    assert percentile([40, 10, 30, 20], 25.0, Interpolation.LOWER) == 10.0


def test_percentile_higher_picks_the_upper_neighbour() -> None:
    """Same rank, `higher` -> the value AT index 1."""
    assert percentile([40, 10, 30, 20], 25.0, Interpolation.HIGHER) == 20.0


def test_percentile_midpoint_averages_the_two_neighbours() -> None:
    """Same rank, `midpoint` -> `(10+20)/2`."""
    assert percentile([40, 10, 30, 20], 25.0, Interpolation.MIDPOINT) == 15.0


def test_percentile_nearest_breaks_a_tie_toward_the_lower_index() -> None:
    """`n=4`, `q=50`: `rank=1.5`, exactly equidistant between index 1 (`20`) and 2 (`30`)."""
    assert percentile([40, 10, 30, 20], 50.0, Interpolation.NEAREST) == 20.0


def test_percentile_of_a_single_value_is_that_value() -> None:
    """`n=1`: every interpolation method degenerates to the one value present."""
    assert percentile([7.5], 42.0, Interpolation.LINEAR) == 7.5


# ── `compute_histogram` — basic shape, hand-computed ────────────────────────────────────────


def test_compute_histogram_partitions_into_bins_and_overflow() -> None:
    """`values=1..10`, `quantiles=(20,80)`, no point mass -> hand-computed edges `(2.8, 8.2)`."""
    recipe = HistogramRecipe(
        spec_version=1,
        quantiles=(20.0, 80.0),
        interpolation=Interpolation.LINEAR,
        point_mass_min_share=1.0,  # nothing can reach share=1.0 with 10 distinct values
    )
    result = compute_histogram(
        [float(v) for v in range(1, 11)],
        field=TAKER_FIELD,
        nature=Nature.RATIO,
        universe_declared="BTCUSDT",
        n_universe_resolved=1,
        recipe=recipe,
    )
    assert result.point_masses == ()
    assert len(result.bins) == 1
    assert result.bins[0].lo == pytest.approx(2.8)
    assert result.bins[0].hi == pytest.approx(8.2)
    assert result.bins[0].count == 6  # {3,4,5,6,7,8}
    assert result.overflow_left.count == 2  # {1,2}
    assert result.overflow_right.count == 2  # {9,10}
    assert result.overflow_left.share == pytest.approx(0.2)
    assert result.overflow_right.share == pytest.approx(0.2)
    assert result.overflow_left.extreme == 1.0
    assert result.overflow_right.extreme == 10.0
    assert result.n_total == 10


def test_empty_input_refuses_rather_than_fabricating_a_result() -> None:
    """Zero eligible observations refuses — there is no histogram of nothing."""
    with pytest.raises(EmptyHistogramInputError):
        compute_histogram(
            [],
            field=TAKER_FIELD,
            nature=Nature.RATIO,
            universe_declared="BTCUSDT",
            n_universe_resolved=1,
            recipe=DEFAULT_HISTOGRAM_RECIPE,
        )


def test_universe_is_carried_through_unmodified() -> None:
    """`UniverseInfo.{declared, n_resolved}` echo exactly what the caller passed in."""
    result = compute_histogram(
        [1.0, 2.0, 3.0],
        field=TAKER_FIELD,
        nature=Nature.RATIO,
        universe_declared="top_500",
        n_universe_resolved=487,
        recipe=HistogramRecipe(
            spec_version=1,
            quantiles=(25.0, 75.0),
            interpolation=Interpolation.LINEAR,
            point_mass_min_share=1.0,
        ),
    )
    assert result.universe.declared == "top_500"
    assert result.universe.n_resolved == 487


# ── point mass (`D3`/`D8.7`) ─────────────────────────────────────────────────────────────


def test_point_mass_is_extracted_before_quantiles_and_never_double_counted() -> None:
    """`D8.7`'s shape: a dominant repeated value becomes ONE degenerate point mass.

    Never a member of a finite bin, an overflow tail, or double-counted anywhere.
    """
    values = synthetic_funding_like_population()
    result = compute_histogram(
        values,
        field=FUNDING_FIELD,
        nature=Nature.RATIO,
        universe_declared="funding_universe",
        n_universe_resolved=873,
        recipe=DEFAULT_HISTOGRAM_RECIPE,
    )
    assert len(result.point_masses) == 1
    assert result.point_masses[0].value == 0.0001
    assert result.point_masses[0].count == 1140
    assert result.n_total == 1500
    # The construction invariant (HistogramResult.__post_init__) already proves the partition
    # sums to n_total; this restates it explicitly as the SECOND witness ADR-020's own
    # falsifier asks for ("um teste de regressão tem de fixar" the exact sum).
    total = (
        sum(one_bin.count for one_bin in result.bins)
        + result.overflow_left.count
        + result.overflow_right.count
        + sum(mass.count for mass in result.point_masses)
    )
    assert total == result.n_total == 1500


# ── `ADR-020`'s own falsifier, `D8.6`: proportional overflow, not 47,2% ────────────────────


def test_d8_6_falsifier_overflow_is_proportional_not_47_percent() -> None:
    """The falsifier `ADR-020` names by number, over a SYNTHETIC reconstruction.

    Raw dataset is not versioned — see `tests/helpers/charts_fixtures.py`.

    `D8.6`: the OLD fixed 11-edge table (teto 50%) put 951 of 2013 observations (47,2%) in the
    right overflow. This fixture is built so a `q=99` recipe's own math GUARANTEES the count of
    values `>= edges[-1]` is `n - ceil(rank)` (proved in the fixture's own docstring) — for
    `n=2013`, `q=99`: `rank = 0.99*2012 = 1991.88`, `ceil(rank)=1992`, so the right overflow
    MUST be exactly `2013 - 1992 = 21` observations, deterministically, for ANY seed that draws
    from a continuous distribution (no ties at the boundary). `21/2013 ≈ 1,04%` — proportional
    to the 1% the recipe asked for, and nowhere near the 47,2% the fixed table produced.
    """
    values = synthetic_taker_like_population(extreme=2055.3)
    result = compute_histogram(
        values,
        field=TAKER_FIELD,
        nature=Nature.RATIO,
        universe_declared="taker_universe",
        n_universe_resolved=len(values),
        recipe=DEFAULT_HISTOGRAM_RECIPE,  # quantiles=(1, 99), the ADR's own declared default
    )
    assert result.n_total == 2013
    assert result.point_masses == ()  # continuous fixture: no accidental point mass

    assert result.overflow_right.count == 21
    assert result.overflow_right.share == pytest.approx(21 / 2013)
    assert result.overflow_right.share < 0.02  # proportional to 1%, not 47,2%
    assert result.overflow_right.extreme == 2055.3  # the planted maximum, reproduced exactly

    assert result.overflow_left.count == 21
    assert result.overflow_left.share == pytest.approx(21 / 2013)

    # The finite bin absorbs everything the two overflow tails and the (empty) point-mass set
    # did not: 2013 - 21 - 21 - 0 = 1971.
    assert len(result.bins) == 1
    assert result.bins[0].count == 1971
