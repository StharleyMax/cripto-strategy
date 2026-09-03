"""The two shapes of Long/Short ratio, and why `delta()`/resample refuse ONE of them by type."""

# `SPEC-001` §3.1/§5.11, `CA-F2-3`, plan `06` items 6.3+6.10 (`T-06.3`/`CST-47`). Two decisions
# live here, and they are one module because they are the same distinction applied twice:
#
#   6.3  Three of the four L/S series (`SPEC-001` §3.1's own order: `count_long_short_ratio`,
#        `count_toptrader_long_short_ratio`, `sum_toptrader_long_short_ratio`) behave like a
#        STOCK read through a ratio lens — `SPEC-001` §5.11 calls this "RATIO de estoque":
#        `last()` on the edge is legitimate, and autocorrelation lag-1 is 0,99+ on this repo's
#        own fixtures (`test_long_short_ratio_series.py::test_d6_4_...`). The fourth
#        (`sum_taker_long_short_vol_ratio`) is "RATIO de fluxo": it resets every bucket
#        (autocorrelation near zero, orthogonal to the other three), and a `delta()` over it
#        answers a question nobody asked.
#
#        `SeriesKey.nature` has exactly ONE `RATIO` member — `T-04.4`'s single as-of read
#        accessor already names this gap ("`RATIO` IS CONSERVATIVE HERE, AND IT IS A `[NAO
#        SEI]` WITH AN OWNER... Owner of the question 'does `nature` need a sixth member, or
#        does §5.11 need a second term?': `/architect`"), and amending `SeriesKey`/`SPEC-001`
#        §2.1 is that ADR's call, not this task's. This module draws the STOCK-like/FLOW-like
#        line ONE LAYER ABOVE `SeriesKey`, with two distinct value types that share no base
#        class and no common field named `value` — so `delta()`'s own SIGNATURE is what
#        refuses the taker series, the same exclusion `universe_at.py`'s
#        `DecisiveUniverseSource` uses to bar `s3_inferred` from `decide_universe_membership`.
#        There is no `isinstance`/`nature ==` branch anywhere below — the handoff for this task
#        is explicit that the refusal must be BY TYPE.
#
#   6.10 The REST `takerlongshortRatio` endpoint publishes `buyVol`/`sellVol` alongside the
#        ratio; `daily/metrics` (the dump this repo has captured) does not — eight columns,
#        zero of them volume (`SPEC-001` §5.11). `TakerRatioComponents` exists to CARRY the two
#        legs instead of collapsing them into a bare ratio the moment they are read, and
#        `resample_taker_ratio_to_timeframe` is the only function allowed to coarsen the
#        series, because it is the only one that ever touches `buy_vol`/`sell_vol` at all —
#        `SPEC-001` §5.11, literal: "Razao de fluxo so recomputa de `Sigma buy/Sigma sell`".
#
# ── WHY A REFUSAL FUNCTION EXISTS, NOT JUST AN EXCLUDED TYPE (`D6.6`) ──────────────────────
#
# Today (`T-06.3`), no REST ingestion of `takerlongshortRatio` exists yet — only the dump,
# which never carries `buy_vol`/`sell_vol`. A caller holding ONLY the bare ratio (the dump's
# actual shape, right now) and asking for a coarser timeframe has no correct answer available:
# `SPEC-001` §5.11 measures what a naive `sum()`/`mean()` over 3 buckets of 5 min would
# produce — `p50 = 3,1809` where the true 15-minute ratio is ~`0,9707`, 3,3x inflated under an
# honest title. `resample_bare_taker_ratio_refuses` is not a placeholder for a function nobody
# calls: it is what a reader of today's actual data must do, until a future ingestion task
# lands the REST client this task's domain shape (`TakerRatioComponents`) is built to receive.

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Final, Literal

# ── THE FOUR NAMES, TRANSCRIBED FROM `SPEC-001` §3.1 IN ITS OWN ORDER ──────────────────────
COUNT_LONG_SHORT_RATIO: Final[str] = "count_long_short_ratio"
COUNT_TOPTRADER_LONG_SHORT_RATIO: Final[str] = "count_toptrader_long_short_ratio"
SUM_TOPTRADER_LONG_SHORT_RATIO: Final[str] = "sum_toptrader_long_short_ratio"
SUM_TAKER_LONG_SHORT_VOL_RATIO: Final[str] = "sum_taker_long_short_vol_ratio"

POSITION_RATIO_METRICS: Final[tuple[str, ...]] = (
    COUNT_LONG_SHORT_RATIO,
    COUNT_TOPTRADER_LONG_SHORT_RATIO,
    SUM_TOPTRADER_LONG_SHORT_RATIO,
)

# The catalog's full four — `SeriesKey.FORBIDDEN_METRIC_NAMES` bans the fifth, generic name
# (`ls_ratio`) that would collapse these into one guarda-chuva column.
LONG_SHORT_METRICS: Final[tuple[str, ...]] = (
    *POSITION_RATIO_METRICS,
    SUM_TAKER_LONG_SHORT_VOL_RATIO,
)

# `PositionRatioMetric` has THREE members, deliberately excluding `SUM_TAKER_LONG_SHORT_VOL_
# RATIO` — the same technique `DecisiveUniverseSource` (`universe_at.py`) uses to exclude
# `s3_inferred`: `PositionRatioObservation.metric` below is typed with this narrow `Literal`,
# so no call site can build one carrying the taker metric and still pass `mypy --strict`.
PositionRatioMetric = Literal[
    "count_long_short_ratio",
    "count_toptrader_long_short_ratio",
    "sum_toptrader_long_short_ratio",
]


class InvalidTakerVolumeError(Exception):
    """`buy_vol`/`sell_vol` negative, or `sell_vol` non-positive (the ratio's own denominator).

    `SPEC-001` §5.3's `ZL-1..3` — zero returned by the vendor is not a legitimate zero — applies
    here to the denominator specifically: a `sell_vol` of zero makes the ratio undefined, not
    infinite, and this type refuses to carry an observation that cannot produce one.
    """


class MismatchedRatioMetricError(Exception):
    """`delta()` was asked to compare two `PositionRatioObservation` of DIFFERENT metrics.

    The three positioning series are distinct identities (`SPEC-001` F-2) — a difference between
    a `count_long_short_ratio` reading and a `sum_toptrader_long_short_ratio` reading is not a
    `delta()` of anything, it is two unrelated numbers subtracted by accident.
    """


class NonAggregableFlowRatioError(Exception):
    """A flow-ratio (`sum_taker_long_short_vol_ratio`) was asked to coarsen WITHOUT its legs.

    `SPEC-001` §5.11: summing or averaging the ratio itself across buckets is not a convention
    violation, it produces a SPECIFIC wrong number — `p50 = 3,1809` against a true ~`0,9707`,
    measured over 3 buckets of 5 min. Refusing is the only correct answer available until the
    volume components exist for the window being resampled.
    """


@dataclass(frozen=True)
class PositionRatioObservation:
    """One reading of a STOCK-like L/S ratio — admits `delta()`, `last()` on the edge.

    `SPEC-001` §5.11 "RATIO de estoque". `metric` is typed `PositionRatioMetric` — a `Literal`
    with three members that structurally excludes the taker metric.
    """

    metric: PositionRatioMetric
    value: Decimal


@dataclass(frozen=True)
class TakerRatioComponents:
    """One reading of the FLOW-like taker ratio, carried as `buy_vol`/`sell_vol` — item 6.10.

    NEVER carries a bare `value`/`ratio` field that a generic resampler could sum by mistake:
    `ratio` below is a computed PROPERTY, not a stored field, so nothing here can drift from the
    two legs and no dataclass field named `value` exists for `delta()` to be tempted by.
    """

    buy_vol: Decimal
    sell_vol: Decimal

    def __post_init__(self) -> None:
        """Refuse a negative leg, or a zero denominator — `SPEC-001` §5.3's `ZL-1..3`."""
        if self.buy_vol < 0 or self.sell_vol < 0:
            raise InvalidTakerVolumeError(
                f"buy_vol={self.buy_vol!r} sell_vol={self.sell_vol!r}: a negative volume leg "
                f"is not a value the REST `takerlongshortRatio` endpoint can publish"
            )
        if self.sell_vol == 0:
            raise InvalidTakerVolumeError(
                "sell_vol=0: the ratio's own denominator is zero, so no ratio can be derived "
                "from this observation (SPEC-001 §5.3, ZL-1..3)"
            )

    @property
    def ratio(self) -> Decimal:
        """`buy_vol / sell_vol` — computed on read, never stored and never summed on its own."""
        return self.buy_vol / self.sell_vol


def delta(before: PositionRatioObservation, after: PositionRatioObservation) -> Decimal:
    """`after.value - before.value` — defined ONLY for STOCK-like ratios (`D6.5`).

    The parameter type is `PositionRatioObservation`, which has no `sum_taker_long_short_vol_
    ratio` member (`PositionRatioMetric` excludes it structurally), and `TakerRatioComponents`
    is a DIFFERENT type with no `.value` field at all — `delta(taker_components, ...)` fails
    `mypy --strict` at the call site before this function ever runs, the same exclusion
    `test_universe_at.py` proves for `DecisiveUniverseSource`. There is no `isinstance`/
    `nature ==` branch here: the refusal is BY TYPE, not a runtime convention check.
    """
    if before.metric != after.metric:
        raise MismatchedRatioMetricError(
            f"delta() between {before.metric!r} and {after.metric!r}: two different series, "
            f"not two readings of the same one"
        )
    return after.value - before.value


def resample_position_ratio_to_timeframe(
    observations: Sequence[PositionRatioObservation],
) -> PositionRatioObservation:
    """Coarsen a STOCK-like ratio via `last()` on the edge — `mean()` is PROIBIDO (§5.11).

    There is no `mean` branch to disable: this function has exactly one behaviour, so nothing
    here can be misused into computing the operation `SPEC-001` §5.11 forbids for this row.
    """
    if not observations:
        raise ValueError("resample_position_ratio_to_timeframe: empty window has no last()")
    return observations[-1]


def resample_taker_ratio_to_timeframe(components: Sequence[TakerRatioComponents]) -> Decimal:
    """Coarsen the taker ratio the only legitimate way: `Sigma buy_vol / Sigma sell_vol`.

    Never reads `.ratio` on any element — summing THAT would recreate the exact defect `D6.6`
    exists to close. Requires `buy_vol`/`sell_vol` (item 6.10) on every element; a caller
    holding only a bare `Decimal` per bucket cannot type this call at all, which is why
    `resample_bare_taker_ratio_refuses` exists below for the shape the dump alone still
    produces today.
    """
    if not components:
        raise ValueError("resample_taker_ratio_to_timeframe: empty window has no ratio")
    # No `total_sell == 0` guard here: every element's own `__post_init__` already refuses a
    # zero `sell_vol`, so a sum of one-or-more strictly positive values can never be zero — a
    # check for it would be an unreachable branch, and this module has no room for dead code.
    total_buy = sum((component.buy_vol for component in components), start=Decimal(0))
    total_sell = sum((component.sell_vol for component in components), start=Decimal(0))
    return total_buy / total_sell


def resample_bare_taker_ratio_refuses(values: Sequence[Decimal]) -> Decimal:
    """Refuse to coarsen `sum_taker_long_short_vol_ratio` from bare ratio values (`D6.6`).

    `values` is exactly the shape `daily/metrics` still hands a reader today — no REST
    ingestion of `buy_vol`/`sell_vol` exists yet (item 6.10 lands the domain SHAPE that would
    carry them, `TakerRatioComponents`; wiring the REST client is a future task). `SPEC-001`
    §5.11 measures what a naive `sum()`/`mean()` here would produce: `p50 = 3,1809` where the
    true 15-minute ratio is ~`0,9707` — 3,3x inflated with an honest title. This function never
    computes that number: it raises before doing ANY arithmetic on `values`, regardless of how
    many buckets it is given or what they contain.
    """
    raise NonAggregableFlowRatioError(
        f"cannot resample {len(values)} bare `sum_taker_long_short_vol_ratio` reading(s) to a "
        f"coarser timeframe: a ratio of flow does not sum across buckets (SPEC-001 §5.11). Use "
        f"resample_taker_ratio_to_timeframe with TakerRatioComponents (buy_vol/sell_vol) instead"
    )
