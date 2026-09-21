"""`klines_ohlc` — the four `Reduction` readings of one `/fapi/v1/klines` bucket."""
#
# Phase `01` items 1.1 + 1.2 (`SPEC-008` §3.4, `RF-2`, `D1`).
#
# ── WHY FOUR SERIES AND NOT FOUR COLUMNS (`SPEC-008` §3.2) ──────────────────────────────────
#
# `SPEC-006`/`I-1` fixed one value column (`value_raw`) with the justification *"`series_key_id`
# já discrimina o quê"*. Four `Reduction` members over one column IS that justification's own
# mechanics, not an exception to it: `reduction` is one of the fifteen terms of the identity
# (`series_key.py`), so `OPEN`/`HIGH`/`LOW`/`CLOSE` of the same bucket are four different series
# by construction. The living proof is Open Interest, which has been exactly this shape since
# `T-06.5` — four `OHLC_OVER_BUCKET` rows over one `sum_open_interest` metric
# (`open_interest_catalog.py`).
#
# The rejected alternative (OHLC columns on `md.series`) is a schema migration with the
# production stack up, and the other (a tuple in `value_raw`) breaks the decimal-text premise
# that `binance_klines_client.py` exists to defend. Both are costed in `SPEC-008` §3.3.
#
# ── WHY THE SOURCE IS `klines` AND NEVER `price_mark_close` (`PRD-008`/`I-3`) ────────────────
#
# The mark price is subsampled by construction: `count=300` readings per bucket against a mean
# of 11.245 trades per bucket `[DOC: price_source_catalog.py:166-170]`. What a subsampled
# series loses first is its EXTREMES — which is precisely `HIGH` and `LOW`. Sourcing the wick
# from the mark price would shorten it, and a shortened wick is invisible on screen: nothing
# errors, the candle just lies. Hence `provider="binance"` over `/fapi/v1/klines`, the traded
# price, the same origin `klines_last` and `klines_volume` already read.
#
# ── THE NAME, AND WHY IT IS CHECKED BEFORE A SINGLE ROW IS WRITTEN (item 1.2) ────────────────
#
# `metric` is one of the fifteen terms `series_key_id()` hashes, so renaming a series after it
# has rows is a MIGRATION of every stored `series_key_id`, never a refactor. The name is
# therefore settled here, against two constraints:
#
#   * the convention `<endpoint>_<field/reduction>` that the two siblings on this very endpoint
#     already use — `klines_volume` (endpoint + field) and `klines_last` (endpoint + reduction).
#     `klines_ohlc` is endpoint + the field GROUP `/fapi/v1/klines` publishes at indices `[1..4]`;
#   * `FORBIDDEN_METRIC_NAMES` (`series_key.py`), which `SeriesKey.__post_init__` enforces on
#     every key ever built — this module does not re-implement that check, it SUBMITS to it.
#
# ⚠️ THE NEAR MISS WORTH NAMING: `ls_ratio` is forbidden for being one generic name standing in
# for four series, and `klines_ohlc` is one name over four rows too. The two are not the same
# case, and the difference is measurable rather than rhetorical. The four long/short series
# differ in their SOURCE ENDPOINT and in their statistics (lag-1 autocorrelation 0,99+ for three
# of them against 0,0955 for the fourth, `series_key.py`), and NO term of the fifteen separated
# them — the umbrella name erased a distinction the identity could not otherwise carry. Here the
# four rows differ in exactly one term, `reduction`, which exists for this and nothing else
# (`CA-F2-17`), and `SeriesCatalog.__post_init__` refuses them as duplicates the moment that
# stops being true. `sum_open_interest` has been the same shape in production since `T-06.5`.
#
# ── WHAT THIS MODULE DELIBERATELY DOES NOT DO ────────────────────────────────────────────────
#
# It does not read the array (`infra/binance_klines_client.py`, `T-01.2`), it does not map the
# collector's pairs (`use_cases/collector_series_mapping.py`, `T-01.3`), and it does not register
# the rows in the SERVED catalog (`use_cases/series_catalog.py`, `T-01.6`). Identity lives in
# `domain/`; the client is `infra/` and the writer is the single writer (`RN-6`).

from __future__ import annotations

from typing import Final

from src.modules.sentimento.domain.instrument import USDT_QUOTE, base_asset
from src.modules.sentimento.domain.series_catalog import (
    SeriesCatalog,
    SeriesCatalogEntry,
    build_series_catalog,
)
from src.modules.sentimento.domain.series_key import (
    Nature,
    QuantityField,
    Reduction,
    SeriesKey,
    TsConvention,
)

# The `metric` term of `SPEC-008` §3.4's normative table. A named constant, not a literal
# repeated at each call site, so the string that decides the identity has exactly one home —
# the shape `KLINES_VOLUME_METRIC` and `CVD_SOURCE_METRIC` already use.
KLINES_OHLC_METRIC: Final[str] = "klines_ohlc"

# The four readings of the same window, in the order the name spells them. This tuple is the
# ONE place the set is written: `klines_ohlc_catalog_entries` iterates it, and the test derives
# the metric's suffix from it, so dropping or reordering a member cannot stay silent.
KLINES_OHLC_REDUCTIONS: Final[tuple[Reduction, ...]] = (
    Reduction.OPEN,
    Reduction.HIGH,
    Reduction.LOW,
    Reduction.CLOSE,
)

# `interval="1m"`, for the two reasons `klines_volume` already measured and this series
# inherits without re-deciding: (i) `1m` is the grid `/api/v1/series-history` serves natively
# (`ADR-034/D6`), so no staircase of a repeated bar is ever counted as distinct points
# (`RN-S1`); (ii) from 1 minute the front composes any operating unit from 15 min to 4 h, and
# the inverse is impossible — which is what makes the owner's premise *"é tudo derivado do
# 1m"* true rather than aspirational (`SPEC-008` §3.4).
KLINES_OHLC_INTERVAL: Final[str] = "1m"

# `native_grid` — what the SOURCE emits, kept separate from the key's `interval` on purpose
# (`CA-F2-11`). For `/fapi/v1/klines` at `interval=1m` the origin emits one bar per minute, so
# here the two agree, and that agreement is why this series pays no staircase.
KLINES_OHLC_NATIVE_GRID: Final[str] = "1min"

# The same fact as the label above, in milliseconds, DECLARED beside it and never parsed from
# it (`ADR-037/D3`). It is what the read path injects as `SeriesReadPolicy.bucket_interval_ms`.
KLINES_OHLC_NATIVE_GRID_MS: Final[int] = 60_000

# Twice the native grid, the bound every `1m` row in this domain carries: a reader may `LOCF`
# at most one missed bar before the row is stale (`SPEC-001` §3.2). One missed bar is latency,
# two are a gap — and a gap must render as ABSENCE (`WhitespaceItem`), never as a zero and
# never as a flat candle carried forward (`RN-1`, `SPEC-008` §3.5).
KLINES_OHLC_MAX_STALENESS_MS: Final[int] = 120_000

# An EXPLICIT zero, never an unmeasured default: no dump-versus-REST divergence is claimed for
# `/fapi/v1/klines` here, the same position `klines_last` and `klines_volume` take on the same
# endpoint. `verified_by` names the test that pins it.
KLINES_OHLC_LABEL_SHIFT_MS: Final[int] = 0


def quote_asset(instrument_id: str) -> str:
    """Return the QUOTE asset of a USDⓈ-M symbol, refusing any symbol that does not declare it.

    `unit="USDT"` is the normative value of `SPEC-008` §3.4, but writing it as a bare literal
    would label a `…USDC` pair `USDT` in silence — and `unit` is a term of the identity, so a
    wrong one is not a wrong label, it is a different `series_key_id` nothing else writes to
    (`instrument.py`'s own reading of the same failure). `base_asset` is called here for its
    REFUSAL, not for its return value: it is the single place in this domain that knows how to
    read a quote off a symbol name, and it raises `SymbolNotQuotedInUsdtError` for exactly the
    symbols where `USDT_QUOTE` would be a guess.
    """
    base_asset(instrument_id)
    return USDT_QUOTE


def build_klines_ohlc_key(
    reduction: Reduction, *, instrument_id: str, verified_by: str
) -> SeriesKey:
    """Build ONE of the four `klines_ohlc` keys — `reduction` has no default, on purpose.

    `CA-F2-17` / `D6.7`, applied to this series: a caller that omits `reduction` gets Python's
    own `TypeError` naming the missing argument, never one of `OPEN`/`HIGH`/`LOW`/`CLOSE`
    picked in silence. Asking for "the candle" without saying WHICH reading is the question
    that has four answers, and answering it by default is how `HIGH` becomes `LOW` with
    nothing reproving.

    `verified_by` NAMES THE TEST AND IS PART OF THE IDENTITY: `series_key_id()` is the
    `sha256` of the canonical projection of all fifteen terms, so two rows differing only in
    `verified_by` are two different series. That is why the argument is required and never
    defaulted — the caller has to point at the test that verified the row, and
    `test_klines_ohlc_catalog.py` is that test today.

    `nature=STOCK`: a price is a LEVEL at an instant, so `LOCF` over it is legitimate and a
    sum over it is a type error — the opposite reading of the `FLOW` its `klines_volume`
    sibling carries off the same array. `ts_convention=OHLC_OVER_BUCKET`: four readings of the
    SAME window, which is the semantics the enum already declares for Coinalyze OI.
    """
    return SeriesKey(
        provider="binance",
        venue="usdm_futures",
        instrument_id=instrument_id,
        metric=KLINES_OHLC_METRIC,
        cohort="all",
        interval=KLINES_OHLC_INTERVAL,
        unit=quote_asset(instrument_id),
        denom="quote",
        nature=Nature.STOCK,
        ts_convention=TsConvention.OHLC_OVER_BUCKET,
        reduction=reduction,
        quantity_field=QuantityField.NA,
        label_shift=KLINES_OHLC_LABEL_SHIFT_MS,
        aggregation_scope="Symbol",
        verified_by=verified_by,
    )


def build_klines_ohlc_entry(
    reduction: Reduction, *, instrument_id: str, verified_by: str
) -> SeriesCatalogEntry:
    """Build ONE `klines_ohlc` catalog row — `SPEC-008` §3.4, one of the four.

    `price_use` stays `None`, and the omission is a decision rather than a gap: `PRICE_SOURCES`
    (`SPEC-001` §3.7) is a CLOSED set of five names, `ADR-007`'s table assigns every
    `price_use` among them, and `SPEC-008` §2.1 lists `ADR-007`'s neighbourhood among what this
    SPEC does not reopen. These four rows exist so the panel can DRAW a real body and wick
    (`RF-3`); routing a decision-path price question is `klines_last`'s job and stays there.
    A row that quietly claimed a `price_use` would be reopening `PS-1` through a side door.

    `reconstructed_from` and `published_error` stay `None` together: the value is READ from the
    bucket the origin itself publishes, so there is no ground truth this row approximates and
    no `(median, p99, n)` to declare. `SeriesCatalogEntry.__post_init__` enforces that the two
    travel together, in both directions (`D6.9`).
    """
    return SeriesCatalogEntry(
        key=build_klines_ohlc_key(reduction, instrument_id=instrument_id, verified_by=verified_by),
        native_grid=KLINES_OHLC_NATIVE_GRID,
        native_grid_ms=KLINES_OHLC_NATIVE_GRID_MS,
        max_staleness_ms=KLINES_OHLC_MAX_STALENESS_MS,
    )


def klines_ohlc_catalog_entries(instrument_id: str, *, verified_by: str) -> SeriesCatalog:
    """Build the four `klines_ohlc` rows for `instrument_id` — `OPEN`, `HIGH`, `LOW`, `CLOSE`.

    Built through `build_series_catalog`, so `SPEC-001` §3.3's *"UMA linha por `SeriesKey`"* is
    not merely believed of this list — it is VALIDATED at construction. That validation is what
    makes the umbrella-name worry of the module docstring measurable instead of argued: the day
    two of these four stop differing in `reduction`, `DuplicateSeriesKeyError` names them here,
    before any row reaches `md.series`.
    """
    return build_series_catalog(
        [
            build_klines_ohlc_entry(reduction, instrument_id=instrument_id, verified_by=verified_by)
            for reduction in KLINES_OHLC_REDUCTIONS
        ]
    )
