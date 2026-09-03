// Testes de `T-06.10` — porte fiel de `series_key.py`/`series_catalog.py` (backend, `T-06.1`).
//
// Run with: npm --prefix frontend run test:s3 (ou node --test 'src/features/s3-inspector/*.test.ts')

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertValidCatalogEntry,
  assertValidSeriesKey,
  buildSeriesLabel,
  FORBIDDEN_METRIC_NAMES,
  IncompleteSeriesKeyError,
  InvalidCatalogEntryError,
  PRICE_USES,
  SERIES_KEY_TERMS,
  type SeriesCatalogEntry,
  type SeriesKey,
} from "./series-catalog.ts";

// ── `SERIES_KEY_TERMS` tem de casar, campo a campo, com `series_key.py::SERIES_KEY_TERMS` ──
//
// Transcrição independente da MESMA lista, lida de `series_key.py:38-54` à mão — se um dos dois
// lados for editado sem o outro, este teste diverge em vez de os dois concordarem por acidente.
const PYTHON_SERIES_KEY_TERMS_TRANSCRIBED = [
  "provider",
  "venue",
  "instrument_id",
  "metric",
  "cohort",
  "interval",
  "unit",
  "denom",
  "nature",
  "ts_convention",
  "reduction",
  "quantity_field",
  "label_shift",
  "aggregation_scope",
  "verified_by",
];

test("SERIES_KEY_TERMS reproduz series_key.py, na MESMA ordem (a ordem é o contrato)", () => {
  assert.deepEqual([...SERIES_KEY_TERMS], PYTHON_SERIES_KEY_TERMS_TRANSCRIBED);
});

function validKey(overrides: Partial<SeriesKey> = {}): SeriesKey {
  return {
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
    verifiedBy: "test_x",
    ...overrides,
  };
}

test("assertValidSeriesKey aceita uma chave completa sem lançar", () => {
  assert.doesNotThrow(() => assertValidSeriesKey(validKey()));
});

test("assertValidSeriesKey recusa termo textual em branco", () => {
  assert.throws(() => assertValidSeriesKey(validKey({ provider: "  " })), IncompleteSeriesKeyError);
});

test("assertValidSeriesKey recusa metric proibido (SPEC-001 §3.1: implied_avg_price)", () => {
  assert.ok(FORBIDDEN_METRIC_NAMES.has("implied_avg_price"));
  assert.throws(
    () => assertValidSeriesKey(validKey({ metric: "implied_avg_price" })),
    IncompleteSeriesKeyError,
  );
});

function validEntry(overrides: Partial<SeriesCatalogEntry> = {}): SeriesCatalogEntry {
  return {
    key: validKey(),
    nativeGrid: "5m",
    maxStalenessMs: 900_000,
    priceUse: null,
    reconstructedFrom: null,
    publishedError: null,
    ...overrides,
  };
}

test("assertValidCatalogEntry aceita uma linha completa e não-reconstruída", () => {
  assert.doesNotThrow(() => assertValidCatalogEntry(validEntry()));
});

test("assertValidCatalogEntry recusa max_staleness_ms não positivo", () => {
  assert.throws(
    () => assertValidCatalogEntry(validEntry({ maxStalenessMs: 0 })),
    InvalidCatalogEntryError,
  );
});

test("assertValidCatalogEntry recusa price_use fora do conjunto fechado de SPEC-001 §3.7", () => {
  assert.ok(PRICE_USES.has("execution"));
  assert.throws(
    () => assertValidCatalogEntry(validEntry({ priceUse: "nao_existe" })),
    InvalidCatalogEntryError,
  );
});

test("assertValidCatalogEntry recusa reconstructed_from sem published_error", () => {
  assert.throws(
    () => assertValidCatalogEntry(validEntry({ reconstructedFrom: "aggtrade_q" })),
    InvalidCatalogEntryError,
  );
});

test("assertValidCatalogEntry recusa published_error presente sem reconstructed_from", () => {
  assert.throws(
    () =>
      assertValidCatalogEntry(
        validEntry({ publishedError: { medianBp: 0, p99Bp: 1, n: 10 } }),
      ),
    InvalidCatalogEntryError,
  );
});

test("assertValidCatalogEntry aceita reconstrução com published_error presente", () => {
  assert.doesNotThrow(() =>
    assertValidCatalogEntry(
      validEntry({
        reconstructedFrom: "aggtrade_q",
        publishedError: { medianBp: 0, p99Bp: 29.34, n: 699 },
      }),
    ),
  );
});

// ── STITCH_CONTEXT.md §9 item 10: "As palavras OI, funding, L/S e CVD SOZINHAS não existem" ──

test("buildSeriesLabel reproduz a forma do exemplo do §9 (metric · grade N · instrumento · fonte)", () => {
  const entry = validEntry();
  assert.equal(buildSeriesLabel(entry), "open_interest · grade 5m · BTCUSDT · binance");
});
