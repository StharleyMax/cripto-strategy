/**
 * `T-06.10` — fixture/synthetic data for the `S3` inspector, same convention
 * `s1-console/fixtures.ts` documents: every number below is chosen to be internally consistent
 * and to reproduce a DoD's PUBLISHED shape where one exists — never read from a database. The
 * real backing store is `series_catalog` (`T-06.1`) plus whichever of `T-06.2`-`T-06.9` have
 * landed; wiring a real reader is future work, out of this task's DoD (`D6.15`/`D6.1`).
 */

import type { IngestHealthGapRow } from "../s1-console/ingest-health-query.ts";
import type { CatalogRow, DivergenceRow, RawDataRow } from "./domain.ts";
import { COINALYZE_ONE_SHOT_TERMS, FULLY_RESOLVED_TERMS } from "./quarantine.ts";
import type { SeriesCatalogEntry } from "./series-catalog.ts";

/** Binance `sumOpenInterest`, 5-minute grade — `SPEC-001` §2.1 `SeriesKey`, fully resolved
 * (all three quarantine terms present). `label_shift` is `0` here as a fixture convenience —
 * `06_semantica_declarada.md` item 6.2 fixes the REAL Binance-endpoint shift table, out of scope
 * for this display-only fixture. */
const BINANCE_OI_5M_ENTRY: SeriesCatalogEntry = {
  key: {
    provider: "binance",
    venue: "binance-futures",
    instrumentId: "BTCUSDT",
    metric: "open_interest",
    cohort: "ALL",
    interval: "5m",
    unit: "BTC",
    denom: "NA",
    nature: "STOCK",
    tsConvention: "POINT_AT_BUCKET_END",
    reduction: "POINT",
    quantityField: "NA",
    labelShift: 0,
    aggregationScope: "SYMBOL",
    verifiedBy: "test_series_catalog_binance_oi_5m",
  },
  nativeGrid: "5m",
  maxStalenessMs: 900_000,
  priceUse: null,
  reconstructedFrom: null,
  publishedError: null,
};

/** Coinalyze `c` (close) OI, 1-minute grade — `CA-F2-17`: Coinalyze publishes OHLC over the
 * bucket, so `reduction = CLOSE` is one of FOUR catalog rows this same `(provider, venue,
 * instrument, metric, interval)` produces; the other three (`OPEN`/`HIGH`/`LOW`) are omitted
 * from this fixture, not from the real catalog. Quarantined: `available_at` unresolved (`Q19`
 * open) — `COINALYZE_ONE_SHOT_TERMS`, `SPEC-001` §5.2's own worked example. */
const COINALYZE_OI_1M_CLOSE_ENTRY: SeriesCatalogEntry = {
  key: {
    provider: "coinalyze",
    venue: "coinalyze-agg",
    instrumentId: "BTCUSDT",
    metric: "open_interest",
    cohort: "ALL",
    interval: "1m",
    unit: "BTC",
    denom: "NA",
    nature: "STOCK",
    tsConvention: "OHLC_OVER_BUCKET",
    reduction: "CLOSE",
    quantityField: "NA",
    labelShift: 60_000,
    aggregationScope: "SYMBOL",
    verifiedBy: "test_series_catalog_coinalyze_oi_close",
  },
  nativeGrid: "1m",
  maxStalenessMs: 120_000,
  priceUse: null,
  reconstructedFrom: null,
  publishedError: null,
};

export const FIXTURE_CATALOG_ROWS: readonly CatalogRow[] = [
  {
    entry: BINANCE_OI_5M_ENTRY,
    provenance: "OBSERVADO",
    completeness: { kind: "grid", present: 285, expected: 288, gaps: 1 },
    quarantine: FULLY_RESOLVED_TERMS,
  },
  {
    entry: COINALYZE_OI_1M_CLOSE_ENTRY,
    provenance: "OBSERVADO",
    completeness: { kind: "grid", present: 1440, expected: 1440, gaps: 0 },
    quarantine: COINALYZE_ONE_SHOT_TERMS,
  },
];

/**
 * Raw rows for `BINANCE_OI_5M_ENTRY`, reproducing `D4.2`'s own worked example
 * (`docs/plans/SPEC-001-plataforma-dados/04_contrato_temporal.md:30`): "285 linhas · 1 linha em
 * `ingest_gap` com `n_missing=3` · 1 vão de 20 min · ZERO pontos interpolados". Only 3
 * representative rows are listed (a full 285-row fixture would not add anything a reviewer can
 * check that these 3 plus the gap do not already show) — `event_time` in epoch ms, UTC.
 */
export const FIXTURE_RAW_ROWS: readonly RawDataRow[] = [
  {
    kind: "data",
    eventTime: Date.UTC(2026, 7, 12, 11, 40, 0),
    srcLabelRaw: "2026-08-12 11:40:00",
    provenance: "OBSERVADO",
    values: { sumOpenInterest: "182345.12000000" },
  },
  {
    kind: "data",
    eventTime: Date.UTC(2026, 7, 12, 11, 45, 0),
    srcLabelRaw: "2026-08-12 11:45:00",
    provenance: "OBSERVADO",
    values: { sumOpenInterest: "182410.55000000" },
  },
  // A 20-minute gap follows here (11:45 -> 12:05), see FIXTURE_GAP_ROWS below.
  {
    kind: "data",
    eventTime: Date.UTC(2026, 7, 12, 12, 5, 0),
    srcLabelRaw: "2026-08-12 12:05:00",
    provenance: "OBSERVADO",
    values: { sumOpenInterest: "181998.02000000" },
  },
];

/** The ONE gap `D4.2` names — `n_missing=3` over a 20-minute vão at a 5-minute grade
 * (`(12:05 - 11:45) / 5min - 1 = 3`). Mirrors `IngestHealthGapRow`'s 8 columns exactly (reused
 * from `s1-console/ingest-health-query.ts`, never re-shaped). */
export const FIXTURE_GAP_ROWS: readonly IngestHealthGapRow[] = [
  {
    source: "binance",
    symbol: "BTCUSDT",
    series_key_id: "binance:binance-futures:BTCUSDT:open_interest:POINT:5m",
    from_ts: "2026-08-12T11:45:00Z",
    to_ts: "2026-08-12T12:05:00Z",
    n_missing: 3,
    class: "REST_UNAVAILABLE",
    detected_at: "2026-08-12T12:06:00Z",
  },
];

/**
 * A cross-source divergence, in the shape `handoff/T-06.10.md:22` requires: BOTH readings shown,
 * neither reconciled. Synthetic values (this task does not measure a real cross-source pair);
 * `D6.8` is the real published measurement of this KIND of comparison
 * (`06_semantica_declarada.md:29`, Coinalyze `c` × Binance `sumOpenInterest`, 1,86 bp
 * mediana / 9,46 bp p99, n=1.706) and is cited here only to justify why divergence display, not
 * silent reconciliation, is the correct shape — not as the source of these two numbers.
 */
export const FIXTURE_DIVERGENCES: readonly DivergenceRow[] = [
  {
    label: "open_interest @ BTCUSDT · 2026-08-12T12:00:00Z",
    readings: [
      { source: "binance · sumOpenInterest", valueText: "182410.55 BTC", provenance: "OBSERVADO" },
      { source: "coinalyze · c (close)", valueText: "182398.11 BTC", provenance: "OBSERVADO" },
    ],
  },
];
