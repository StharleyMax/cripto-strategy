/**
 * `T-02.4` — pure mapping layer between `GET /series-history`'s wire rows
 * (`series-history-client.ts`) and the shapes `charts/index.ts`'s `buildS2Panels`/panel
 * builders take (`RawCandle[]`/`ScalarPoint[]`/`ScaledCvdDelta[]`). No `fetch`, no `node:fs` —
 * every function here takes already-fetched data and returns plain values, so it is testable
 * with a literal fixture (`view-model.test.ts`) shaped exactly like phase `01`'s real envelope,
 * without a live backend.
 *
 * ── THE CENTRAL RULE, AND WHY IT NEEDS NO SPECIAL CASE (`CA-F2-3`) ─────────────────────────
 *
 * A `SeriesHistoryRow` with `absence !== null` (⇒ `value === null`, `CA-F1-5`) is simply NOT
 * turned into a point — it is left OUT of the `ScalarPoint[]`/`RawCandle[]` array this module
 * builds. `charts`' own grid-alignment machinery (`canonical-grid.ts`/`s2-scalar-grid.ts`,
 * untouched by this task — `plan 02`'s own non-goal: "não constrói geometria nova em charts")
 * already renders a slot nothing filled as `candle: null` / `value: null`, which
 * `s2-lightweight-adapter.ts`'s LOSSLESS mappings already turn into a bare `{time}`
 * `WhitespaceItem` — a real gap on the chart, never a `0`. This module's only job is to never
 * shortcut that path by inventing a point for an absent row.
 *
 * ── WHY PRICE BECOMES A DEGENERATE CANDLE, NOT A TRUE OHLC BAR ──────────────────────────────
 *
 * `SPEC-006 §5.2`/`I-1`, literal: "uma coluna (`value_raw`) basta — sem OHLC ... a tabela é
 * observação pontual, não candle". `series_key.py`'s `Reduction` enum confirms it structurally:
 * a true OHLC bar would be FOUR series (`OPEN`/`HIGH`/`LOW`/`CLOSE`, `Reduction.
 * OHLC_OVER_BUCKET`), and the one price series this catalog actually builds for
 * `structure_detection`/`execution` (`price_source_catalog.py::build_klines_last_entry`) uses
 * `Reduction.LAST` — ONE scalar per bucket, the last traded price. `buildPricePanel`
 * (`s2-panels.ts`) still expects `RawCandle[]` (open/high/low/close/volume) because that is
 * the shape `T-05.2`'s own test fixtures built from REAL klines CSVs (4 real OHLC numbers per
 * bar) — a shape this phase's real backend does not serve. Rather than inventing a synthetic
 * OHLC (which would draw a WRONG range/wick nobody measured) or reimplementing panel geometry
 * (out of scope, `plan 02` non-goals), this module builds the HONEST degenerate candle
 * `open = high = low = close = <the one real number>`, `volume = 0` — every number on screen
 * traces to `value_raw` (`RN-7`), none is fabricated, and the visual reads as a flat body with
 * no wick, which is what "we only measured one number for this bucket" IS, not a decoration
 * of it. `[INFERRED: no ADR/SPEC picks between "line" and "degenerate candle" for this
 * specific gap — degenerate candle is chosen so `buildPricePanel`'s existing, tested signature
 * needs no change, honoring the phase's "no new charts geometry" non-goal.]`
 */

import { createHash } from "node:crypto";

import type { S2RawInputs } from "../../charts/index.ts";
import type { SeriesHistoryRow } from "./series-history-client.ts";
import type { SeriesKey } from "../../features/s3-inspector/series-catalog.ts";

/** `RawCandle`'s shape, read off the barrel's own `S2RawInputs.candles` element type rather
 * than importing `canonical-grid.ts` directly — `charts/index.ts` (`ADR-034/D8`) re-exports
 * `S2RawInputs` (the "composição de painéis" category) but not `RawCandle` itself, and this
 * indexed-access alias needs no second name in the barrel to stay in lock-step with it. */
type RawCandleShape = S2RawInputs["candles"][number];

/** `ScalarPoint`'s shape, same indexed-access technique, read off `S2RawInputs.oiPoints`. */
type ScalarPointShape = S2RawInputs["oiPoints"][number];

/** One bucket's exact signed sum, `QUANTITY_SCALE`-scaled — mirrors `charts/s2-cvd.ts`'s own
 * `ScaledCvdDelta`, re-declared (not imported) because that module is `charts`-internal and
 * this file lives under `src/app/symbol/`, outside the barrel's own re-export list (the CVD
 * delta/cumulative BUILDER, `buildCvdPanel`, is what the barrel exports — this shape is only
 * the INPUT this module hands to it, so importing `s2-cvd.ts` directly would be exactly the
 * deep import `ADR-034/D8`'s exception forbids). */
export interface ScaledCvdDeltaInput {
  readonly bucketStartMs: number;
  readonly valueScaled: bigint;
}

/** `charts/s2-cvd.ts`'s own scale — 1e8, satoshi-equivalent precision. Transcribed (not
 * imported, same boundary reason as `ScaledCvdDeltaInput` above) so this module's signed
 * parser produces values `unscale()`/`cvdCumulativeScaled()` (both re-exported by
 * `buildCvdPanel`, called from `page.tsx`) read correctly. */
const QUANTITY_SCALE = 100_000_000n;

const ONE_DAY_MS = 24 * 60 * 60_000;

/** Which grid-aligned rows (of the ones that carry a real value) fall inside `[dayStartMs,
 * dayStartMs + 1 day)`. Used to derive `missingDays`/`coveredDays` the same way
 * `s2-oi-loader.ts`/`s2-cvd.ts` do for their own fixture-built inputs: a day with ZERO present
 * rows is "missing" (no file/no capture that day), a day with at least one is "covered". */
function daysWithPresence(
  rows: readonly SeriesHistoryRow[],
  days: readonly string[],
): { readonly missingDays: readonly string[]; readonly coveredDays: readonly string[] } {
  const missingDays: string[] = [];
  const coveredDays: string[] = [];
  for (const day of days) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
    if (match === null) {
      throw new RangeError(`day "${day}" is not "YYYY-MM-DD"`);
    }
    const [, year, month, dayOfMonth] = match;
    const dayStartMs = Date.UTC(Number(year), Number(month) - 1, Number(dayOfMonth));
    const dayEndMsExclusive = dayStartMs + ONE_DAY_MS;
    const hasPresentRow = rows.some(
      (row) => row.value !== null && row.event_time >= dayStartMs && row.event_time < dayEndMsExclusive,
    );
    (hasPresentRow ? coveredDays : missingDays).push(day);
  }
  return { missingDays, coveredDays };
}

/**
 * Maps `/series-history` rows for the PRICE panel's series into `RawCandle[]` — one degenerate
 * candle per row that carries a real value (`row.value !== null`), NOTHING for an absent row
 * (`CA-F2-3`'s central rule, this module's own docstring). `row.value` is a `Decimal`-as-text
 * (`SPEC-001 §2.6`) — `Number(...)` at this one display edge, the same posture
 * `charts/s2-cvd.ts::unscale` documents for its own display-edge conversion.
 */
export function rawCandlesFromHistoryRows(rows: readonly SeriesHistoryRow[]): readonly RawCandleShape[] {
  return rows
    .filter((row) => row.value !== null)
    .map((row) => {
      const close = Number(row.value);
      return { openTimeMs: row.event_time, open: close, high: close, low: close, close, volume: 0 };
    });
}

/** Maps `/series-history` rows for a SCALAR (OI/CVD-shaped) panel into `ScalarPoint[]` — same
 * "absent row contributes nothing" rule as `rawCandlesFromHistoryRows`. `gridTimeframeMs`
 * filters to the rows that land on the DESTINATION grid this point set will be aligned to
 * (`alignScalarPointsToGrid` rejects a misaligned point rather than snapping it) — needed for
 * OI, whose panel re-grids the native 1-minute response onto a 5-minute panel
 * (`s2-panels.ts::buildOiPanel`, `FIVE_MINUTES_MS`); a no-op filter for CVD, whose panel grid
 * (`CVD_BUCKET_WIDTH_MS`, 1 minute) already matches the route's own native interval. */
export function scalarPointsFromHistoryRows(
  rows: readonly SeriesHistoryRow[],
  gridTimeframeMs: number,
): readonly ScalarPointShape[] {
  return rows
    .filter((row) => row.value !== null && row.event_time % gridTimeframeMs === 0)
    .map((row) => ({ timeMs: row.event_time, value: Number(row.value) }));
}

export class InvalidSignedDecimalError extends Error {}

/**
 * Parses a SIGNED decimal string into a `QUANTITY_SCALE`-scaled `BigInt`, exactly — the CVD
 * delta counterpart of `charts/s2-cvd.ts::parseQuantityToScaled`, which REFUSES a negative
 * value by design (an individual trade quantity is never negative). A per-bucket CVD delta IS
 * signed (net sell pressure is negative), so this module needs its own parser rather than
 * widening that one's non-negative contract — a smaller, separate function, not a
 * reimplementation of the exact-BigInt-scaling reasoning that module's header comment already
 * gives in full.
 */
export function parseSignedDecimalToScaled(raw: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw.trim());
  if (match === null) {
    throw new InvalidSignedDecimalError(`value "${raw}" is not a plain signed decimal`);
  }
  const [, sign, wholePart, fractionPart = ""] = match;
  if (fractionPart.length > 8) {
    throw new InvalidSignedDecimalError(
      `value "${raw}" carries ${fractionPart.length} decimal digits, more than the 8 this ` +
        "parser scales to — refused instead of silently truncated",
    );
  }
  const paddedFraction = fractionPart.padEnd(8, "0");
  const magnitude = BigInt(wholePart) * QUANTITY_SCALE + BigInt(paddedFraction === "" ? "0" : paddedFraction);
  return sign === "-" ? -magnitude : magnitude;
}

/** Maps `/series-history` rows for the CVD DELTA panel into `ScaledCvdDeltaInput[]` — same
 * "absent row contributes nothing" rule, values parsed SIGNED (see `parseSignedDecimalToScaled`). */
export function scaledCvdDeltasFromHistoryRows(rows: readonly SeriesHistoryRow[]): readonly ScaledCvdDeltaInput[] {
  return rows
    .filter((row) => row.value !== null)
    .map((row) => ({ bucketStartMs: row.event_time, valueScaled: parseSignedDecimalToScaled(row.value as string) }));
}

export { daysWithPresence };

/** `SeriesCatalogEntry.key.instrumentId === symbol` — the ONE filter every panel selector
 * below shares, named once so the three call sites cannot drift on what "for BTCUSDT" means. */
export function keyMatchesSymbol(key: SeriesKey, symbol: string): boolean {
  return key.instrumentId === symbol;
}

// ── `series_key_id` — computed client-side, not read off the wire ──────────────────────────
//
// `GET /series-catalog`'s envelope (`series_catalog.py::_entry_to_wire`) carries the 15 RAW
// terms of a `SeriesKey` (`key`) but never the `sha256` id itself — `/series-history`'s own
// query parameter — so `web` cannot look an id up, it has to RECOMPUTE the same hash the
// backend computes, from the same 15 terms `/series-catalog` already hands it.
// `series_key.py::SeriesKey.series_key_id()`, transcribed here field-for-field:
//
//   sha256(json.dumps({term: key[term] for term in SERIES_KEY_TERMS}, ensure_ascii=True,
//                     separators=(",", ":"), sort_keys=False)).hexdigest()
//
// `canonical_json.py`'s own docstring: "insertion order IS the field order" — `SERIES_KEY_
// TERMS`'s order (`provider, venue, instrument_id, metric, cohort, interval, unit, denom,
// nature, ts_convention, reduction, quantity_field, label_shift, aggregation_scope,
// verified_by`) is reproduced below as insertion order into a plain object, which
// `JSON.stringify` preserves for non-integer-like string keys (every key here is) — and
// `JSON.stringify`'s default output already carries no whitespace, matching Python's
// `separators=(",", ":")` byte-for-byte for the ASCII field values this catalog only ever
// carries (symbol/metric/etc. are all plain ASCII, so `ensure_ascii=True`'s escaping is a
// no-op here). `SeriesKey.nature`/`.tsConvention`/`.reduction`/`.quantityField` are ALREADY
// the enum's string VALUE on the wire (`series-catalog-query.ts`'s own
// `NATURE_VALUES`/`TS_CONVENTION_VALUES`/etc. sets, checked against those exact strings) — no
// `.value` projection is needed here, unlike the Python `Enum` member `canonical_terms()`
// unwraps on its own side.
const SERIES_KEY_BACKEND_TERM_ORDER: ReadonlyArray<readonly [keyof SeriesKey, string]> = [
  ["provider", "provider"],
  ["venue", "venue"],
  ["instrumentId", "instrument_id"],
  ["metric", "metric"],
  ["cohort", "cohort"],
  ["interval", "interval"],
  ["unit", "unit"],
  ["denom", "denom"],
  ["nature", "nature"],
  ["tsConvention", "ts_convention"],
  ["reduction", "reduction"],
  ["quantityField", "quantity_field"],
  ["labelShift", "label_shift"],
  ["aggregationScope", "aggregation_scope"],
  ["verifiedBy", "verified_by"],
];

/**
 * Recomputes `SeriesKey.series_key_id()` (`series_key.py`) client-side, from the 15 raw terms
 * `GET /series-catalog` already serves — see the module-level comment above for the exact
 * mirroring and why it is necessary (the wire carries no id of its own).
 */
export function computeSeriesKeyId(key: SeriesKey): string {
  const projected: Record<string, string | number> = {};
  for (const [tsField, backendTerm] of SERIES_KEY_BACKEND_TERM_ORDER) {
    projected[backendTerm] = key[tsField] as string | number;
  }
  const canonical = JSON.stringify(projected);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
