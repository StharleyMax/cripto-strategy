"""`reduce_bucket(nature, reduction, values)` against the 8-pair table `ADR-040/D2` fixes.

`plano 03` item 3.1, `SPEC-008` §5.1. Scope is THIS function only — `T-03.2` owns the
catalog-level totality test over `/series-catalog`'s live 8 pairs; this file proves the pure
function underneath it is total over the SAME domain, fails high outside it, and — the
falsifier `ADR-040`'s own text demands — MORDE when one function is swapped for another rather
than passing green over a value that happens to coincide.
"""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.series_key import Nature, Reduction
from src.modules.sentimento.domain.series_reduction import (
    REDUCTION_TABLE,
    EmptyBucketError,
    UncoveredReductionPairError,
    reduce_bucket,
)

# ── THE DOMAIN, TRANSCRIBED A SECOND TIME, BY HAND ────────────────────────────────────────
#
# Same discipline as `test_series_identity.py::SPEC_001_2_1_TERMS`: comparing the table against
# an import of itself proves nothing. This is an independent copy of `SPEC-008` §5.1 /
# `JULGAMENTO-QUANT-ARCHITECT.md` §1, so a pair silently dropped (or added) from
# `REDUCTION_TABLE` shows up as a set mismatch instead of two views of the same drift.
SPEC_008_5_1_PAIRS: frozenset[tuple[Nature, Reduction]] = frozenset(
    {
        (Nature.FLOW, Reduction.SUM),
        (Nature.STOCK, Reduction.OPEN),
        (Nature.STOCK, Reduction.HIGH),
        (Nature.STOCK, Reduction.LOW),
        (Nature.STOCK, Reduction.CLOSE),
        (Nature.STOCK, Reduction.LAST),
        (Nature.STOCK, Reduction.POINT),
        (Nature.RATIO, Reduction.POINT),
    }
)


def test_the_table_covers_exactly_the_8_pairs_of_spec_008_5_1_no_more_no_less() -> None:
    """`n = 8`, and it is the SAME 8 — not a superset, not a subset."""
    assert set(REDUCTION_TABLE.keys()) == SPEC_008_5_1_PAIRS
    assert len(REDUCTION_TABLE) == 8


_SORTED_PAIRS = sorted(SPEC_008_5_1_PAIRS, key=lambda pair: pair[0].value + pair[1].value)


@pytest.mark.parametrize("nature, reduction", _SORTED_PAIRS)
def test_every_covered_pair_has_a_callable_and_answers_a_single_fact(
    nature: Nature, reduction: Reduction
) -> None:
    """Sanity: every one of the 8 pairs reduces `[42.0]` to `42.0`.

    No pair is missing a real function behind it (e.g. a stub that raises
    `NotImplementedError`).
    """
    assert reduce_bucket(nature, reduction, [42.0]) == 42.0


# ── THE FALSIFIER: MORDE WHEN ONE FUNCTION IS SWAPPED FOR ANOTHER ────────────────────────
#
# `ADR-040` falsifier #1, literal: "um teste que passe trocando `first` por `last` na
# implementação de `OPEN` não é falsificador; é decoração." Every sequence below is built so
# that AT LEAST TWO of {first, last, max, min, sum} disagree on it — an implementation that
# reached for the wrong one in `REDUCTION_TABLE` returns a DIFFERENT number, not the same one
# by coincidence.


def test_flow_sum_is_the_total_not_the_last_fact() -> None:
    """`(FLOW, SUM)`: `Σ([10, 20, 30]) = 60`.

    `last` would give `30`, `first` would give `10` — both wrong, both different from `60`.
    This is `ADR-034/D6`'s literal defect: one minute's worth of flow mislabelled as the whole
    bucket.
    """
    assert reduce_bucket(Nature.FLOW, Reduction.SUM, [10.0, 20.0, 30.0]) == 60.0


def test_stock_open_is_first_by_event_time_not_last() -> None:
    """`(STOCK, OPEN)`: `first([100, 200, 150]) = 100`, values in ascending `event_time`.

    `last` would give `150` — the bucket's CLOSE dressed as its OPEN, `ADR-040/D2`'s named
    failure mode.
    """
    assert reduce_bucket(Nature.STOCK, Reduction.OPEN, [100.0, 200.0, 150.0]) == 100.0


def test_stock_high_is_max_of_its_own_column_not_last() -> None:
    """`(STOCK, HIGH)`: `max([100, 105, 102]) = 105`.

    `last` would give `102` — understating the true high, the measured `11,7 bp` defect
    `JULGAMENTO-QUANT-ARCHITECT.md` §1 names.
    """
    assert reduce_bucket(Nature.STOCK, Reduction.HIGH, [100.0, 105.0, 102.0]) == 105.0


def test_stock_low_is_min_of_its_own_column_not_last() -> None:
    """`(STOCK, LOW)`: `min([100, 95, 98]) = 95`.

    `last` would give `98` — the mirror of the `HIGH` case above.
    """
    assert reduce_bucket(Nature.STOCK, Reduction.LOW, [100.0, 95.0, 98.0]) == 95.0


@pytest.mark.parametrize("reduction", [Reduction.CLOSE, Reduction.LAST, Reduction.POINT])
def test_stock_close_last_point_all_take_last_not_max(reduction: Reduction) -> None:
    """`(STOCK, CLOSE)`, `(STOCK, LAST)`, `(STOCK, POINT)`: `last([30, 10, 20]) = 20`.

    Values in ascending `event_time`. `max` would give `30` and `first` would give `30` too —
    both disagree with `last` here on purpose, so a swap in either direction morde.
    """
    assert reduce_bucket(Nature.STOCK, reduction, [30.0, 10.0, 20.0]) == 20.0


def test_stock_point_never_sums_the_48x_defect_rn_3_names() -> None:
    """`RN-3`, literal: `Σ` on `(STOCK, POINT)` returns `48×` the real OI in a `4h` bucket.

    Twelve equal facts of `100.0` (a flat OI level, as a `4h` bucket built from `5min` facts
    would carry) must reduce to `100.0` (`last`), never `1200.0` (`Σ`).
    """
    flat_oi = [100.0] * 12
    assert reduce_bucket(Nature.STOCK, Reduction.POINT, flat_oi) == 100.0


def test_ratio_point_is_last_the_closing_ratio_never_summed() -> None:
    """`(RATIO, POINT)`: `last([3.0, 1.0, 2.0]) = 2.0`.

    `Σ` would give `6.0` — the `3,3×` inflation `ADR-040/D4` measures on
    `count_long_short_ratio` (p50 `3,1809` against the true `0,9707`).
    """
    assert reduce_bucket(Nature.RATIO, Reduction.POINT, [3.0, 1.0, 2.0]) == 2.0


# ── FAILS HIGH ON AN UNCOVERED PAIR, NEVER A SILENT DEFAULT ──────────────────────────────


@pytest.mark.parametrize(
    "nature, reduction",
    [
        (Nature.STOCK, Reduction.SUM),
        (Nature.FLOW, Reduction.MEAN),
        (Nature.EVENT, Reduction.POINT),
        (Nature.TICK, Reduction.LAST),
        (Nature.RATIO, Reduction.SUM),
    ],
)
def test_an_uncovered_pair_raises_instead_of_falling_back_to_any_function(
    nature: Nature, reduction: Reduction
) -> None:
    """A pair outside the 8 raises `UncoveredReductionPairError`, never a number.

    Includes the dangerous-sounding-plausible `(STOCK, SUM)`, which would silently reproduce
    `RN-3`'s `48×` defect for a metric nobody decided a function for.
    """
    with pytest.raises(UncoveredReductionPairError) as excinfo:
        reduce_bucket(nature, reduction, [1.0, 2.0, 3.0])
    assert nature.value in str(excinfo.value)
    assert reduction.value in str(excinfo.value)


def test_a_ninth_pair_would_have_to_be_added_to_the_table_not_inferred() -> None:
    """The table's own size is the totality guard: 8 entries today.

    `REDUCTION_TABLE`'s `dict[...]` lookup has no `.get(..., default)` anywhere near it in
    `series_reduction.py` — `T-03.2` builds the catalog-level version of this same guard over
    the live `/series-catalog` entries; this is the unit-level half.
    """
    assert len(REDUCTION_TABLE) == len(SPEC_008_5_1_PAIRS)


# ── EMPTY BUCKET: A COVERAGE QUESTION, NOT A REDUCTION ONE ────────────────────────────────


def test_an_empty_bucket_raises_rather_than_guessing() -> None:
    """An empty bucket raises `EmptyBucketError` for both a `Σ` pair and a non-`Σ` pair.

    `sum([]) == 0.0` would be right for `(FLOW, SUM)` and wrong for every other pair;
    `max([])`/`values[0]` on empty raise different builtin exceptions for different pairs. Both
    are silence dressed as an answer — `reduce_bucket` refuses uniformly instead.
    """
    with pytest.raises(EmptyBucketError):
        reduce_bucket(Nature.FLOW, Reduction.SUM, [])
    with pytest.raises(EmptyBucketError):
        reduce_bucket(Nature.STOCK, Reduction.HIGH, [])


def test_empty_bucket_is_checked_before_the_table_lookup() -> None:
    """An uncovered pair with empty `values` reports the coverage problem, not a lookup error.

    The caller learns "zero facts" before "no function for this pair", which is the more
    actionable of the two when both are true.
    """
    with pytest.raises(EmptyBucketError):
        reduce_bucket(Nature.EVENT, Reduction.POINT, [])
