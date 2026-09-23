"""`reduce_bucket(nature, reduction, values)` — the ONE function over `ADR-040/D2`'s 8 pairs.

`plano 03` item 3.1, `ADR-040/D2`, `RF-7`, `RN-3`, `SPEC-008` §5.1. The julgamento delegated to
`quant-architect` (`docs/context/candle-real-e-eixo-unico/handoff/JULGAMENTO-QUANT-ARCHITECT.md`
§1) settled the table; this module is that table made executable.

── WHY `(nature, reduction)` AND NEVER `metric` ──────────────────────────────────────────────

`ADR-040/D2`, literal: a table indexed by `metric` has the property that a metric nobody
remembered to register receives SILENCE — it inherits whatever branch the table's `else`
happens to fall through to. A sum applied to a `STOCK` does not break an import, does not fail
a test, and returns a number that is PLAUSIBLE AND WRONG — the same class as the ambiguous
`rc=0` of `ADR-012`. Keying on the two terms that `SeriesKey` already carries (`series_key.py`)
means a metric NEW to a pair already in `REDUCTION_TABLE` inherits the right function without
anyone touching this file, and a metric that lands on a pair NOT in the table raises instead of
guessing — `KeyError` on a `dict`, wrapped below so the caller sees why.

── THE 8 PAIRS, TOTAL, NO DEFAULT BRANCH ─────────────────────────────────────────────────────

Transcribed from `SPEC-008` §5.1 / `JULGAMENTO-QUANT-ARCHITECT.md` §1:

    (FLOW,  SUM)   = Σ                        — klines_volume, cvd_source, sum_liquidation
    (STOCK, OPEN)  = first (smallest event_time in the bucket) — sum_open_interest
    (STOCK, HIGH)  = max, of the bucket's OWN `HIGH` readings  — sum_open_interest
    (STOCK, LOW)   = min, of the bucket's OWN `LOW` readings   — sum_open_interest
    (STOCK, CLOSE) = last (largest event_time)  — price_mark_close AND sum_open_interest
    (STOCK, LAST)  = last                       — klines_last
    (STOCK, POINT) = last                       — sum_open_interest (POINT_AT_BUCKET_END)
    (RATIO, POINT) = last                       — count_long_short_ratio, under the allowlist
                                                   `T-03.5`/`ADR-040/D4` gates at the CALL site

`ts_convention` deliberately does NOT enter the key: `(STOCK, CLOSE)` is the one collision the
julgamento measured — `price_mark_close` (`POINT_AT_BUCKET_END`) and `sum_open_interest`
(`OHLC_OVER_BUCKET`) both want the same function, "the last reading of the bucket". Adding
`ts_convention` to the key would split one function into two identical entries, which is a
seam a future edit could open without anyone noticing the two had to stay equal.

⚠️ `(RATIO, POINT)` IS IN THIS TABLE'S DOMAIN, BUT THIS MODULE DOES NOT GATE WHO MAY CALL IT.
`SeriesKey` has ONE `RATIO` member standing in for TWO behaviours (`series_key.py:94-95`), and
summing a FLOW-shaped ratio inflates the read 3,3× (p50 `3,1809` against `0,9707`,
`[MEDIDO 2026-09-19]`, `ADR-040/D4`). The allowlist of ONE metric
(`count_long_short_ratio`) that makes `last` safe to apply here is `T-03.5`'s call-site
concern, not this function's: `reduce_bucket` answers "what function does `(RATIO, POINT)`
have", never "is THIS metric allowed to ask".

⛔ "THE PROPER `HIGH`/`LOW`" IS A CALLER CONTRACT, NOT SOMETHING THIS FUNCTION CAN ENFORCE.
`(STOCK, HIGH) = max` and `(STOCK, LOW) = min` are correct only when `values` holds THAT
reduction's own column — `max` taken over a `CLOSE` series understates the true high by
`94,20 USDT` (`11,7 bp`) on the measured fixture (`JULGAMENTO-QUANT-ARCHITECT.md` §1, row 3).
A pure function over `Sequence[float]` has no way to know which column the caller sliced; the
type only says "some floats", not "the `HIGH` column of this bucket". Naming the risk here is
the closest this module gets to a guard for it.

── WHAT THIS MODULE DELIBERATELY DOES NOT DO ─────────────────────────────────────────────────

* It does not read `md.series`, a `SeriesKey`, or a catalog row — `values` arrives already
  sliced to the bucket by the caller. Pure in the literal sense: same inputs, same output,
  no I/O, no clock.
* It does not decide partial-coverage policy (`{present, expected}`, `maxStalenessMs`) — that
  is `T-03.4`/`ADR-040/D3`'s `P-B`. This function's contract is "given the facts that ARE
  present, reduce them"; how many facts SHOULD have been present is a different question with
  a different owner.
* It does not enforce the `(RATIO, POINT)` allowlist — see above, that is `T-03.5`.
* It does not wire into `use_cases/series_history.py` — `SUPPORTED_INTERVAL` there is still
  `{"1m"}` (`ADR-034/D6`) until `T-03.3` grows the set the reaggregation this function backs
  actually needs to run against.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from decimal import Decimal
from typing import Final

from src.modules.sentimento.domain.series_key import Nature, Reduction


class UncoveredReductionPairError(Exception):
    """`(nature, reduction)` has no function in `REDUCTION_TABLE` — fail HIGH, never a default.

    `ADR-040/D2`, literal: "métrica que acrescente par novo falha alto em vez de cair num
    padrão". A `KeyError` alone would say the same thing to a debugger; this wraps it so the
    message names the exact pair and points at the one place the table lives, instead of
    leaving the reader to reconstruct that from a bare tuple in a traceback.
    """

    def __init__(self, nature: Nature, reduction: Reduction) -> None:
        """Name the exact `(nature, reduction)` pair that has no entry in `REDUCTION_TABLE`."""
        self.nature = nature
        self.reduction = reduction
        super().__init__(
            f"no reduction function for (nature={nature.value}, reduction={reduction.value}) — "
            f"ADR-040/D2 requires an explicit entry in REDUCTION_TABLE "
            f"(series_reduction.py), never a default branch. A metric that reaches this pair "
            f"needs a function decided and added there, not inherited from another pair."
        )


class EmptyBucketError(Exception):
    """`reduce_bucket` was asked to reduce zero facts.

    A bucket with zero facts present is a coverage question (`{present: 0, expected: N}`,
    `T-03.4`/`ADR-040/D3`), not a reduction question — this function has no function-shaped
    answer for "the sum/first/max/min/last of nothing", so it refuses instead of guessing
    `0.0` (right for `Σ`, wrong for every other function in the table) or raising whatever
    builtin exception `min([])`/`values[0]` happens to throw (a `ValueError` here and an
    `IndexError` there, for callers that have no reason to know the difference).
    """


def _sum(values: Sequence[float]) -> float:
    """`(FLOW, SUM)` — Σ of the facts present. The definition of a flow quantity.

    Summed through `Decimal`, not `float(sum(values))` directly — the latter accumulates IEEE-754
    rounding error across the additions, one bit at a time, and a wide bucket (`4h` reaggregating
    `240` native `1m` `cvd_delta` facts) sums enough signed terms for that error to surface as
    13-14 noise digits on the wire (`"-655.9100000000001"` for a value whose true precision is 8
    decimal places, the source's own quantity scale — `CA-F1-…` handoff of `candle-real-e-eixo-
    unico` fase `05`, reproduced against production Postgres). `Decimal(str(v))` reconstructs the
    exact decimal each `float` already carries (Python's `repr` is the shortest string that
    round-trips to that same `float`, so this is lossless, not a second lossy hop), sums those
    EXACTLY the way `domain/cvd.py::cvd_delta_by_bucket` already sums the un-reaggregated facts,
    and only touches `float` once more, at the very end, to keep this function's signature the
    `REDUCTION_TABLE` contract (`ADR-040/D2`) already fixes. The single final round-trip is the
    same one the `1m` native path already takes with no visible noise (`use_cases/series_history.
    py::_row_from_native_reading`'s own comment) — the defect was in the REPEATED float additions
    this replaces, never in touching `float` once.
    """
    return float(sum(Decimal(str(value)) for value in values))


def _first(values: Sequence[float]) -> float:
    """`(STOCK, OPEN)` — the fact of smallest `event_time` in the bucket.

    Contract: `values` arrives in ascending `event_time` order. This function does not sort —
    sorting here would silently paper over a caller that sliced the wrong column ordering.
    """
    return float(values[0])


def _max(values: Sequence[float]) -> float:
    """`(STOCK, HIGH)` — max of the bucket's OWN `HIGH` readings, never of `CLOSE`."""
    return float(max(values))


def _min(values: Sequence[float]) -> float:
    """`(STOCK, LOW)` — min of the bucket's OWN `LOW` readings, never of `CLOSE`."""
    return float(min(values))


def _last(values: Sequence[float]) -> float:
    """`(STOCK, CLOSE/LAST/POINT)`, `(RATIO, POINT)` — the fact of largest `event_time`.

    Contract: `values` arrives in ascending `event_time` order, same as `_first` above.
    """
    return float(values[-1])


# THE TABLE. Total over the 8 pairs the julgamento measured, and NO `.get(..., default)`
# anywhere near it — `reduce_bucket` below looks this dict up with `[...]`, which raises on a
# miss, on purpose. Adding a 9th pair here is the one and only way to cover it; the alternative
# (a `metric`-keyed table, `ADR-040/B5`) is the failure mode `D2` exists to name.
REDUCTION_TABLE: Final[dict[tuple[Nature, Reduction], Callable[[Sequence[float]], float]]] = {
    (Nature.FLOW, Reduction.SUM): _sum,
    (Nature.STOCK, Reduction.OPEN): _first,
    (Nature.STOCK, Reduction.HIGH): _max,
    (Nature.STOCK, Reduction.LOW): _min,
    (Nature.STOCK, Reduction.CLOSE): _last,
    (Nature.STOCK, Reduction.LAST): _last,
    (Nature.STOCK, Reduction.POINT): _last,
    (Nature.RATIO, Reduction.POINT): _last,
}


def reduce_bucket(nature: Nature, reduction: Reduction, values: Sequence[float]) -> float:
    """Reduce the native facts of ONE bucket to the single value `(nature, reduction)` publishes.

    `values` is the bucket's own facts for that `reduction`'s column (e.g. the `HIGH` readings
    for `(STOCK, HIGH)`), in ascending `event_time` order — the caller's contract, not something
    this function can check from `Sequence[float]` alone (see the module docstring).

    Raises `UncoveredReductionPairError` for any pair outside `REDUCTION_TABLE` — never a
    silent default (`ADR-040/D2`) — and `EmptyBucketError` if `values` is empty (a coverage
    question, not a reduction one; see `EmptyBucketError`'s own docstring).
    """
    if not values:
        raise EmptyBucketError(
            f"reduce_bucket(nature={nature.value}, reduction={reduction.value}) got zero facts "
            f"— that is a coverage question (T-03.4/ADR-040/D3), not one this function answers"
        )
    try:
        function = REDUCTION_TABLE[(nature, reduction)]
    except KeyError:
        raise UncoveredReductionPairError(nature, reduction) from None
    return function(values)
