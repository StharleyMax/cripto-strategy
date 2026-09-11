"""`klines_volume` — the M1 traded-volume identity, created by this task, not inherited."""

# Phase `01` item 1.1 (`SPEC-007` §4 / §4.1, `RF-2`).
#
# ── WHY THIS MODULE EXISTS AT ALL (`GA-1`) ─────────────────────────────────────────────────
#
# There is NO volume metric in any catalog of this repository. The four `metric` names the
# domain declares are `sum_open_interest`, `klines_last`, `price_mark_close` and `cvd_source`
# `[MEDIDO 2026-09-10, n=5 sites]`, and none of them is volume. In particular
# `build_klines_last_entry` (`price_source_catalog.py:179`) is a PRICE series — its own
# docstring reads "the last trade price of the 5-minute bucket", with `Reduction.LAST`,
# `Nature.STOCK`, `unit="USDT"`, `denom="quote"`. Reading it as "the klines contract already
# exists" is the misreading `GA-1` corrects. This module CREATES an identity.
#
# ── WHY `klines_volume` AND NOT `sum_traded_volume` (`SPEC-007` §4.1) ──────────────────────
#
# `sum_…` in this repository is the TRANSCRIPTION of a Binance field name (`sumOpenInterest`,
# `sumTakerLongShortVolRatio`, from the `/futures/data/` endpoints). `/fapi/v1/klines` has no
# field with that prefix, so `sum_traded_volume` would invent a provenance the source does not
# publish. `klines_volume` follows the shape of the sibling that already lives in the same
# domain (`klines_last` = `<endpoint>_<field/reduction>`), does not collide with
# `FORBIDDEN_METRIC_NAMES`, and leaves `base` vs `quote` to `denom`, the term that exists
# exactly for that.
#
# REJECTED ALTERNATIVE: reuse `klines_last` with a different `quantity_field`.
# `quantity_field` is "which `aggTrade` quantity the series is built from"
# (`series_key.py:138`), and `klines` does not derive from `aggTrade` — the correct value is
# `NA` for BOTH series, so the term does not distinguish them. `metric` does, and that is the
# reading the module already makes.
#
# ── WHY `interval="1m"`, AND THE COST IT BUYS (`SPEC-007` §4.1) ────────────────────────────
#
# Double reason: (i) `1m` is the grid `/api/v1/series-history` serves natively (`ADR-034/D6`,
# `SUPPORTED_INTERVAL`), so M1 never pays the staircase of `GA-2` — a `5m` series on a `1m`
# grid is served as the same bar repeated five times, and `RN-S1` then forbids counting those
# repeats as distinct points; (ii) at 1 min the front composes any operating unit from 15 min
# to 4 h, and the inverse is impossible.
#
# DECLARED COST, and it is not hidden: M1 ends up on a DIFFERENT grid from its panel
# neighbour `klines_last` (`5m`) — price is a staircase and volume is not, in the same
# `PricePane`. The `design_gate` has to see this before phase `01` closes (`SPEC-007` §8.2).
#
# ── `FLOW`, `SUM`, `AGGREGATE_OVER_BUCKET`, `denom="base"` — each one is a claim ───────────
#
# `volume` is index `[5]` of the `/fapi/v1/klines` array and is the quantity traded ACROSS the
# bucket, denominated in the instrument's BASE asset (index `[7]`, `quoteAssetVolume`, is the
# quote-denominated one). Hence `Nature.FLOW` (`LOCF` over it is a type error, never UX —
# `RN-1`), `TsConvention.AGGREGATE_OVER_BUCKET`, `Reduction.SUM`, `denom="base"`, and `unit`
# required from the caller rather than defaulted, for the same reason
# `cvd_source_catalog.build_aggtrade_q_entry` requires it: the base asset of `ETHUSDT` is
# `ETH`, and a hardcoded `"BTC"` would silently mislabel every non-`BTC` instrument.
#
# ── WHAT THIS MODULE DELIBERATELY DOES NOT DO ──────────────────────────────────────────────
#
# It does not register the row in the SERVED `SeriesCatalog` (`use_cases/series_catalog.py`) —
# that is item 1.8 of the phase (`RF-2`), a different task and a different file. It does not
# speak HTTP and it does not write to `md.series`: identity is `domain/`, the client is
# `infra/` and the writer is the single writer (`SPEC-007` §5, `RN-6`).

from __future__ import annotations

from typing import Final

from src.modules.sentimento.domain.series_catalog import SeriesCatalogEntry
from src.modules.sentimento.domain.series_key import (
    Nature,
    QuantityField,
    Reduction,
    SeriesKey,
    TsConvention,
)

# The `metric` term of `SPEC-007` §4's normative row for M1. A named constant, not a literal
# repeated at each call site, so the string that decides the identity has exactly one home —
# the same shape `cvd_source_catalog.CVD_SOURCE_METRIC` already uses.
KLINES_VOLUME_METRIC: Final[str] = "klines_volume"

# `native_grid` — the grid the SOURCE publishes, which for `/fapi/v1/klines` at `interval=1m`
# is one bar per minute. It is a separate field from the key's `interval` on purpose
# (`CA-F2-11`): `interval` says what the series IS, `native_grid` says what the origin emits,
# and for M1 they agree — which is precisely why M1 does not pay `GA-2`'s staircase.
KLINES_VOLUME_NATIVE_GRID: Final[str] = "1min"

# Twice the native grid, the same ratio the other series in this domain use (`5m` rows carry
# `600_000`; the `1m` `cvd_source` rows carry `120_000`). It bounds how far a `LOCF` may reach
# on read (`SPEC-001` §3.2) — one missed bar is tolerated as latency, two are a gap, and a gap
# on a `FLOW` series must render as absence, never as zero (`RN-1`).
KLINES_VOLUME_MAX_STALENESS_MS: Final[int] = 120_000


def build_klines_volume_entry(
    instrument_id: str, *, unit: str, verified_by: str
) -> SeriesCatalogEntry:
    """Build the `klines_volume` catalog row for `instrument_id` — `SPEC-007` §4, row M1.

    `verified_by` NAMES THE TEST AND IS PART OF THE IDENTITY: `series_key_id()` is the
    `sha256` of the canonical projection of all fifteen terms (`series_key.py:226-234`), so
    two rows that differ only in `verified_by` are two different series. That is why this
    argument is required and never defaulted — the caller has to point at the test that
    verified the row, and `test_klines_volume_catalog.py` is that test today.

    `reconstructed_from` stays `None`, and so does `published_error`: the value is READ from
    the bucket the origin itself publishes, so there is nothing reconstructed and no
    reconstruction error to declare. `SeriesCatalogEntry.__post_init__` enforces that the two
    travel together (`D6.9`), in both directions.

    `price_use` stays `None` — volume is not a price source. `PRICE_SOURCES` (`SPEC-001` §3.7)
    is a closed set of five names and `klines_volume` is not among them; `resolve_price_source`
    must never be able to route a price question to this row.

    `label_shift=0` is an EXPLICIT zero, not an unmeasured default: no dump-versus-REST
    divergence is claimed for `/fapi/v1/klines` here, and `verified_by` names the test that
    pins it.
    """
    key = SeriesKey(
        provider="binance",
        venue="usdm_futures",
        instrument_id=instrument_id,
        metric=KLINES_VOLUME_METRIC,
        cohort="all",
        interval="1m",
        unit=unit,
        denom="base",
        nature=Nature.FLOW,
        ts_convention=TsConvention.AGGREGATE_OVER_BUCKET,
        reduction=Reduction.SUM,
        quantity_field=QuantityField.NA,
        label_shift=0,
        aggregation_scope="Symbol",
        verified_by=verified_by,
    )
    return SeriesCatalogEntry(
        key=key,
        native_grid=KLINES_VOLUME_NATIVE_GRID,
        max_staleness_ms=KLINES_VOLUME_MAX_STALENESS_MS,
    )
