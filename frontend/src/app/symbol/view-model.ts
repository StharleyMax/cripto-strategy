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

import { ONE_MINUTE_MS, resolveFlowReading, type FlowReading, type S2Panels, type S2RawInputs } from "../../charts/index.ts";
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

// ── `klines_volume` (M1) — the volume SUB-AXIS of the price panel (`T-01.7`) ─────────────────
//
// `SPEC-007 §3.6` (`[Q6]`): volume is a SUB-AXIS of `PricePane`, never a panel of its own.
// Everything `web` adds for it is below — a mapping, a count and a reading. None of the three
// is geometry: `ADR-003` keeps série→geometria inside `charts`, and this module builds no grid.
//
// WHERE THE GRID COMES FROM, AND WHY IT IS NOT REBUILT HERE: `GET /series-history` already
// answers ONE ROW PER 1-MINUTE GRID INSTANT of the requested window — it walks the grid on its
// own side (`use_cases/series_history.py`: `while grid_instant <= window_end_ms`) and fills
// `absence` for every instant nothing wrote. `klines_volume` carries `interval="1m"`
// (`SPEC-007 §4.1`), which IS the grid `ADR-034/D6` serves natively, so for this series the
// rows already are the canonical grid and turning them into slots is TRANSCRIPTION, not
// alignment — no second implementation of `s2-scalar-grid.ts` (which the `charts` barrel does
// not re-export, `ADR-034/D8`) is smuggled in here.
//
// THE COST THIS MAKES VISIBLE, DELIBERATELY (`SPEC-007 §4.1`): the panel's other series,
// `klines_last`, is `5m` served on the `1m` grid — a LADDER — and volume is `1m` native, so it
// is not. Two grids in one panel is the declared price of `interval="1m"` for M1, and the
// `design_gate` of `T-01.8` is supposed to SEE it, so nothing here smooths it over.

/** `ScalarSlot`'s shape (`charts/s2-scalar-grid.ts`), read off the barrel's own `S2Panels`
 * rather than deep-importing the module that declares it — the same indexed-access technique
 * `RawCandleShape`/`ScalarPointShape` above use, and for the same `ADR-034/D8` reason. */
export type ScalarSlotShape = S2Panels["oi"]["slots"][number];

/** A `/series-history` row carried a `value` string that is not a number a volume slot can be
 * built from. Loud on purpose: `RN-1` forbids substituting absence for a value, and it equally
 * forbids the reverse — swallowing a malformed value as if it were absence would hide a broken
 * producer behind the exact same `SEM_PONTO` a real gap shows. */
export class InvalidSeriesValueError extends Error {}

/**
 * Maps `/series-history` rows for `klines_volume` into the `ScalarSlot[]` the lossless
 * lightweight adapter takes (`lineSeriesLossless`) — ONE SLOT PER ROW, in wire order.
 *
 * `RN-1`, the rule this function exists for: a row with `absence !== null` (⇒ `value === null`,
 * `CA-F1-5`) becomes `value: null`, which `lineSeriesLossless` turns into a bare `{time}`
 * `WhitespaceItem` — a real gap on screen. It is NEVER `0`. For a `FLOW` series that is an
 * error of TYPE, not of taste (`series_key.py`: *"LOCF over it is a type error, never UX"*), so
 * there is no rendering option, no toggle and no default that could turn it into a zero bar.
 */
export function volumeSlotsFromHistoryRows(rows: readonly SeriesHistoryRow[]): readonly ScalarSlotShape[] {
  return rows.map((row) => {
    if (row.value === null) {
      return { time: row.event_time, value: null };
    }
    const parsed = Number(row.value);
    if (!Number.isFinite(parsed)) {
      throw new InvalidSeriesValueError(`value ${JSON.stringify(row.value)} at event_time ${row.event_time} is not a finite number`);
    }
    if (parsed < 0) {
      // `klines_volume` is `nature=FLOW`, `reduction=SUM`, `denom=base` (`SPEC-007 §4`): a sum
      // of traded base quantity over a bucket is never negative. Refused rather than drawn —
      // the same posture `charts/s2-cvd.ts::parseQuantityToScaled` takes for its own
      // never-negative quantity, and the opposite of a downward bar nobody could explain.
      throw new InvalidSeriesValueError(`volume ${parsed} at event_time ${row.event_time} is negative — a summed traded quantity never is`);
    }
    return { time: row.event_time, value: parsed };
  });
}

/**
 * How many slots carry a REAL value — the number `DoD-3`/`RN-S2` count against `N >= 30`.
 *
 * For `klines_volume` this is also the count of DISTINCT NATIVE BARS, with no divisor: `RN-S1`
 * makes the `/5` correction mandatory only for a `5m` series served on the `1m` grid, where the
 * ladder repeats one native bar across five slots. M1 is `1m` native (`SPEC-007 §4.1`), so no
 * slot here repeats another's bar and `presentSlots === nativeBars`. Stated rather than assumed
 * because applying `RN-S1`'s divisor to this series would UNDERCOUNT by 5×.
 */
export function countPresentSlots(slots: readonly ScalarSlotShape[]): number {
  return slots.filter((slot) => slot.value !== null).length;
}

/**
 * The volume reading at one instant, `FLOW` semantics (`resolveFlowReading`, reused from
 * `charts` — no second absence policy is written here).
 *
 * The GUARD this function exists for: `resolveFlowReading` throws `RangeError` on an empty slot
 * array (*"an empty grid has no extent to query"*), and an empty array is the NORMAL state of
 * this sub-axis whenever the panel degraded — catalog without the series, transport down, or
 * simply nothing ingested yet. A throw there would crash the whole `/symbol` route over an
 * absence the page is designed to render, which is the failure class fase `04` of
 * `pagina-de-grafico-s2` already paid for once. Absence answers `absent`; it never throws and
 * it never becomes `0`.
 */
export function resolveVolumeReading(slots: readonly ScalarSlotShape[], instantMs: number): FlowReading {
  if (slots.length === 0) {
    return { kind: "absent", value: null };
  }
  return resolveFlowReading(slots, ONE_MINUTE_MS, instantMs);
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
