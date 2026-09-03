"""Open Interest, populated for both sources — `CA-F2-17`: five rows, never a collapsed one."""

# `T-06.1` (`series_key.py`, `series_catalog.py`) built the CONTRACT: the `reduction` term, the
# `Reduction` enum's members, and the refusal of a blank or defaulted term of identity. This
# module is what plan `06` item 6.11 (`T-06.5`) asks for on top of that contract — it POPULATES
# the real rows, not a test fixture's private copy of them:
#
#   * Coinalyze publishes Open Interest as OHLC over a bucket (`docs/medicao-coinalyze.md`, the
#     `5min` interval — the grid `CA-F2-17`'s cross-source measurement below was run on) — FOUR
#     distinct `SeriesKey`s, one per `Reduction.OPEN` / `HIGH` / `LOW` / `CLOSE`,
#     `ts_convention = OHLC_OVER_BUCKET`.
#   * Binance's `openInterestHist` publishes ONE reading per bucket: `Reduction.POINT`,
#     `ts_convention = POINT_AT_BUCKET_END`.
#
# `D6.8`, measured (`CST-4`, `[DOC: SPEC-001 §2.1]`): the Coinalyze `c` matches Binance's
# `sumOpenInterest` at the same `create_time` to 1,86 bp median / 9,46 bp p99 (n=1.706), while
# `o(t)` equals `c(t-300)` in only 6 of 2.141 pairs. That is the proof, not an assertion, that
# Coinalyze's `t` is the START of the bucket and that the four readings are genuinely distinct
# series — "open of this bucket" is not "close of the last one" wearing a different label. It is
# also why `OPEN_INTEREST_LABEL_SHIFT_MS` below is `+interval` rather than zero: `SPEC-001` §2.1,
# literal, "o `label_shift` da Coinalyze é `+interval`, na mesma direção do dump `metrics`, e não
# zero" — the same direction and magnitude as `metrics_shift.LABEL_SHIFT_MS`, the shift the
# `daily/metrics` dump itself carries.
#
# `D6.7`'s falsifier is enforced twice over, at two different layers: `SeriesKey` itself has no
# default for `reduction` (`test_series_identity.py`), and `coinalyze_open_interest_key` below
# makes `reduction` a required, defaultless parameter of the ONE function this codebase offers
# for "give me a Coinalyze open-interest key" — asking without it is a `TypeError` naming the
# missing argument, never a silent pick among the four.

from __future__ import annotations

from typing import Final

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

# The 5-minute bucket, in both spellings the codebase already uses for it: `metrics_shift.py`
# keeps the millisecond constant, `series_key.py`'s own `interval` term wants the SPEC's short
# string. `D6.8`'s cross-source comparison ran on exactly this grid (`o(t) ≠ c(t-300)`, 300 = 5
# minutes in seconds), so this is not a second, independent choice of interval — it is the one
# the measurement was already made on.
_INTERVAL_MS: Final[int] = 300_000
_INTERVAL: Final[str] = "5m"

# `SPEC-001` §2.1, literal: "o `label_shift` da Coinalyze é `+interval` ... e não zero" — same
# direction and magnitude as `metrics_shift.LABEL_SHIFT_MS`, the `daily/metrics` dump's own
# shift. Binance's `openInterestHist` row carries the identical shift (`test_series_identity.py`
# already fixes `binance_oi_key().label_shift == 300_000`); this module does not invent a
# second number for the same fact.
OPEN_INTEREST_LABEL_SHIFT_MS: Final[int] = _INTERVAL_MS

# `CA-F2-11`: `native_grid` is a property of the SOURCE, resolved here as the constant both
# sources happen to share for Open Interest at this interval — `docs/medicao-coinalyze.md`
# names `5min` as the Coinalyze retention bucket the comparison used, and Binance's
# `openInterestHist` publishes on the same 5-minute grid.
_NATIVE_GRID: Final[str] = "5min"

# Twice the native grid: a reader may `LOCF` at most one missed bucket before the row is stale
# (`SPEC-001` §3.2). Neither source's retention table (`docs/medicao-coinalyze.md`) suggests a
# looser bound is warranted for Open Interest specifically.
_MAX_STALENESS_MS: Final[int] = 2 * _INTERVAL_MS

_VERIFIED_BY: Final[str] = (
    "test_open_interest_catalog.py::"
    "test_the_catalog_has_five_rows_four_coinalyze_ohlc_and_one_binance_point"
)


def coinalyze_open_interest_key(
    reduction: Reduction, *, instrument_id: str = "BTCUSDT"
) -> SeriesKey:
    """One of the FOUR Coinalyze open-interest series — `reduction` has no default, on purpose.

    `CA-F2-17` / `D6.7`: a caller that omits `reduction` gets Python's own `TypeError`, naming
    the missing argument — never a row picked among `OPEN`/`HIGH`/`LOW`/`CLOSE` in silence.
    """
    return SeriesKey(
        provider="coinalyze",
        venue="usdm_futures",
        instrument_id=instrument_id,
        metric="sum_open_interest",
        cohort="all",
        interval=_INTERVAL,
        unit="BTC",
        denom="base",
        nature=Nature.STOCK,
        ts_convention=TsConvention.OHLC_OVER_BUCKET,
        reduction=reduction,
        quantity_field=QuantityField.NA,
        label_shift=OPEN_INTEREST_LABEL_SHIFT_MS,
        aggregation_scope="Symbol",
        verified_by=_VERIFIED_BY,
    )


def binance_open_interest_key(*, instrument_id: str = "BTCUSDT") -> SeriesKey:
    """Build the ONE Binance open-interest series — always `Reduction.POINT`, bucket's close."""
    return SeriesKey(
        provider="binance",
        venue="usdm_futures",
        instrument_id=instrument_id,
        metric="sum_open_interest",
        cohort="all",
        interval=_INTERVAL,
        unit="BTC",
        denom="base",
        nature=Nature.STOCK,
        ts_convention=TsConvention.POINT_AT_BUCKET_END,
        reduction=Reduction.POINT,
        quantity_field=QuantityField.NA,
        label_shift=OPEN_INTEREST_LABEL_SHIFT_MS,
        aggregation_scope="Symbol",
        verified_by=_VERIFIED_BY,
    )


def open_interest_catalog_entries(instrument_id: str = "BTCUSDT") -> SeriesCatalog:
    """Build the five real `series_catalog` rows: four Coinalyze OHLC, one Binance `POINT`.

    Built through `build_series_catalog`, so `SPEC-001` §3.3's "UMA linha por `SeriesKey`" is
    not merely believed of this list — it is validated at construction, the same invariant
    `SeriesCatalog.__post_init__` enforces on any other caller's rows.
    """
    entries: list[SeriesCatalogEntry] = [
        SeriesCatalogEntry(
            key=coinalyze_open_interest_key(reduction, instrument_id=instrument_id),
            native_grid=_NATIVE_GRID,
            max_staleness_ms=_MAX_STALENESS_MS,
        )
        for reduction in (Reduction.OPEN, Reduction.HIGH, Reduction.LOW, Reduction.CLOSE)
    ]
    entries.append(
        SeriesCatalogEntry(
            key=binance_open_interest_key(instrument_id=instrument_id),
            native_grid=_NATIVE_GRID,
            max_staleness_ms=_MAX_STALENESS_MS,
        )
    )
    return build_series_catalog(entries)
