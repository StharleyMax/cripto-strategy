"""`reduce_bucket_for_series(key, values)` — the one call site allowed to ask for `(RATIO, POINT)`.

`plano 03` item 3.5, `ADR-040/D4`, `SPEC-008` §5.3, `SPEC-008/A-4`. `reduce_bucket`
(`series_reduction.py`) answers "what function does `(nature, reduction)` have" and refuses, by
its own docstring, to answer "is THIS metric allowed to ask" — that second question is this
module's entire job, and nothing else in it.

── WHY THE GATE IS BY `metric`, NEVER BY `nature` ────────────────────────────────────────────

`SeriesKey.nature` has exactly ONE `RATIO` member standing in for TWO behaviours
(`series_key.py:94-95`, and the read accessor's own conservative default for that same gap):
"RATIO de estoque" (`count_long_short_ratio`,
`count_toptrader_long_short_ratio`, `sum_toptrader_long_short_ratio` — `last()` on the edge is
legitimate, autocorrelation lag-1 0,99+ on this repo's own fixtures) and "RATIO de fluxo"
(`sum_taker_long_short_vol_ratio` — resets every bucket, autocorrelation near zero). A gate keyed
on `nature == RATIO` would let `reduce_bucket`'s `last` run for ALL FOUR the moment any of them
carries `reduction=POINT`; reading a flow-shaped ratio that way inflates the number `3,3×` — p50
`3,1809` against the true `0,9707`, `[MEDIDO 2026-09-19, ADR-040/D4]`. Keying on `metric` instead
means only the ONE name the julgamento measured safe gets through: a second name reaching
`(RATIO, POINT)` — including one of the other three "estoque" ratios, until each is reviewed on
its own — raises instead of inheriting the allowlist by nature.

── WHY NOT "RECOMPUTE FROM THE COMPONENTS" ───────────────────────────────────────────────────

`ADR-040/D4` / `SPEC-008/A-4`: `longAccount`/`shortAccount` are FRACTIONS THAT SUM TO 1, not
counts — summing them across a bucket gives `média/média`, a different estimator, not the true
ratio at any instant. For a stock-shaped ratio there is no "aggregate over the bucket", only
"which instant do you report", which is exactly what `(RATIO, POINT) = last` already answers.
Recomposition is not a future feature this module is missing; it is impossible with the columns
this source publishes today (`M4`, `ADR-040/D4`).

── THE ALLOWLIST, TODAY ──────────────────────────────────────────────────────────────────────

ONE element: `count_long_short_ratio`, imported from `long_short_ratio_series.py` rather than
respelled here — a second literal of the same string is the seam a typo could open between the
two. Growing this set is a judgement call about a DIFFERENT metric's own measured behaviour
(autocorrelation, whether it resets per bucket), made where that measurement lives, never
inferred from this set's own existence.

── WHAT THIS MODULE DELIBERATELY DOES NOT DO ─────────────────────────────────────────────────

* It does not build a second reduction table. Every pair other than `(RATIO, POINT)` passes
  straight through to `reduce_bucket` unchanged, including its own failure modes
  (`UncoveredReductionPairError`, `EmptyBucketError`).
* It does not wire into `use_cases/series_history.py` — that reaggregation call site is a later
  task's concern, once `SUPPORTED_INTERVAL` (`T-03.3`) actually grows past `{"1m"}`.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Final

from src.modules.sentimento.domain.long_short_ratio_series import COUNT_LONG_SHORT_RATIO
from src.modules.sentimento.domain.series_key import Nature, Reduction, SeriesKey
from src.modules.sentimento.domain.series_reduction import reduce_bucket

# `ADR-040/D4`, literal: "allowlist de `metric` com 1 elemento". Not `nature` — see the module
# docstring above. Adding a name here is a judgement call about THAT metric's own measured
# behaviour, decided elsewhere (a future ADR/task), never inferred from this set's own existence.
RATIO_POINT_METRIC_ALLOWLIST: Final[frozenset[str]] = frozenset({COUNT_LONG_SHORT_RATIO})


class DisallowedRatioPointMetricError(Exception):
    """`(RATIO, POINT)` was asked for a `metric` outside `RATIO_POINT_METRIC_ALLOWLIST`.

    `ADR-040/D4`: `nature` alone cannot tell a stock-shaped ratio from a flow-shaped one, so this
    is the refusal `reduce_bucket` itself cannot make — see `series_reduction.py`'s own docstring
    for why that function stops one question short of this one.
    """

    def __init__(self, metric: str) -> None:
        """Name the exact `metric` that reached `(RATIO, POINT)` without being allowlisted."""
        self.metric = metric
        allowed = ", ".join(sorted(RATIO_POINT_METRIC_ALLOWLIST))
        super().__init__(
            f"metric={metric!r} may not use (RATIO, POINT)=last — ADR-040/D4 allows only "
            f"{{{allowed}}} here, by metric NAME and never by nature: SeriesKey has one RATIO "
            f"member for two behaviours, and a flow-shaped ratio read this way inflates the "
            f"number 3.3x (p50 3.1809 vs 0.9707, MEDIDO 2026-09-19). A new metric needs its own "
            f"behaviour measured and its own entry added to RATIO_POINT_METRIC_ALLOWLIST — it "
            f"cannot inherit count_long_short_ratio's."
        )


def reduce_bucket_for_series(key: SeriesKey, values: Sequence[float]) -> float:
    """Reduce one bucket's `values` for `key`, gating `(RATIO, POINT)` by `key.metric`.

    Every pair other than `(RATIO, POINT)` passes straight through to `reduce_bucket`
    (`series_reduction.py`) unchanged — this function adds exactly one refusal, not a second
    reduction table. Raises `DisallowedRatioPointMetricError` before `reduce_bucket` ever runs,
    for a `(RATIO, POINT)` key whose `metric` is not in `RATIO_POINT_METRIC_ALLOWLIST`; every
    other failure mode (`UncoveredReductionPairError`, `EmptyBucketError`) still comes from
    `reduce_bucket` itself, unchanged by this wrapper.
    """
    if (
        key.nature is Nature.RATIO
        and key.reduction is Reduction.POINT
        and key.metric not in RATIO_POINT_METRIC_ALLOWLIST
    ):
        raise DisallowedRatioPointMetricError(key.metric)
    return reduce_bucket(key.nature, key.reduction, values)
