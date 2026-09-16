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

import { ONE_MINUTE_MS, resolveFlowReading, type FlowReading, type S2Panels, type S2RawInputs } from "../../charts/index.ts";
import type { FreshnessVerdict, PublishedErrorFact, SeriesProvenance } from "./panel-status.ts";
import type { SeriesHistoryRow } from "./series-history-client.ts";
import type { SeriesKey } from "../../features/s3-inspector/series-catalog.ts";

// Re-exported so the server-side callers of `resolveFreshnessVerdict` get the function and its
// return type from ONE import; the type itself is DECLARED in `panel-status.ts`, which is the
// only module both sides of the RSC boundary may import (see its own docstring for why).
export type { FreshnessVerdict, PublishedErrorFact, SeriesProvenance };

// Re-exported, not re-implemented: `computeSeriesKeyId` moved to its own module so a Playwright
// spec can import it without evaluating the `charts` barrel (and, through it, `jsdom`). Every
// caller of `view-model.ts` keeps working unchanged — see `series-key-id.ts` for the full why.
export { computeSeriesKeyId } from "./series-key-id.ts";

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
 * Maps `/series-history` rows for a NON-NEGATIVE `FLOW` series into the `ScalarSlot[]` the
 * lossless lightweight adapter takes (`lineSeriesLossless`/`positiveValueSeriesLossless`) — ONE
 * SLOT PER ROW, in wire order.
 *
 * `RN-1`, the rule this function exists for: a row with `absence !== null` (⇒ `value === null`,
 * `CA-F1-5`) becomes `value: null`, which `lineSeriesLossless` turns into a bare `{time}`
 * `WhitespaceItem` — a real gap on screen. It is NEVER `0`. For a `FLOW` series that is an
 * error of TYPE, not of taste (`series_key.py`: *"LOCF over it is a type error, never UX"*), so
 * there is no rendering option, no toggle and no default that could turn it into a zero bar.
 *
 * ⚠️ IT WAS CALLED `volumeSlotsFromHistoryRows` UNTIL `T-05.9`, and the rename is not cosmetic.
 * `sum_liquidation` needs the SAME mapping — `1m` native, `nature=FLOW`, `reduction=SUM`, a value
 * that is never negative (`liquidation_catalog.py`) — and the two honest options were "call a
 * function named `volume…` on liquidation rows" or "write a second copy of the `RN-1` rule". The
 * first lies at the call site; the second is two implementations of the one rule this route
 * exists to keep. So the function keeps its single body and takes the name of its CONTRACT:
 * a summed, non-negative flow quantity, whatever the metric.
 */
export function nonNegativeFlowSlotsFromHistoryRows(rows: readonly SeriesHistoryRow[]): readonly ScalarSlotShape[] {
  return rows.map((row) => {
    if (row.value === null) {
      return { time: row.event_time, value: null };
    }
    const parsed = Number(row.value);
    if (!Number.isFinite(parsed)) {
      throw new InvalidSeriesValueError(`value ${JSON.stringify(row.value)} at event_time ${row.event_time} is not a finite number`);
    }
    if (parsed < 0) {
      // `klines_volume` is `nature=FLOW`, `reduction=SUM`, `denom=base` and `sum_liquidation` is
      // `nature=FLOW`, `reduction=SUM`, `denom=quote` (`SPEC-007 §4`): a sum of traded base
      // quantity — or of liquidated USD notional — over a bucket is never negative. Refused
      // rather than drawn — the same posture `charts/s2-cvd.ts::parseQuantityToScaled` takes for
      // its own never-negative quantity, and the opposite of a downward bar nobody could explain.
      throw new InvalidSeriesValueError(`flow value ${parsed} at event_time ${row.event_time} is negative — a summed traded quantity never is`);
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
 * How many of the PRESENT slots carry a LEGITIMATE ZERO — an observation whose value is `0`,
 * which is a completely different fact from an absent slot (`ZL-3` of
 * `domain/liquidation_zero_legitimacy.py`: *"a LEGITIMATE zero … is a real observation and must be
 * represented as one — a `Decimal(0)` value, `absence=None` — distinguishable from `NO_SOURCE` by
 * TYPE, not by convention"*).
 *
 * ⛔ THIS IS NOT A DECORATIVE SECOND NUMBER, AND THE MEASUREMENT IS WHY. Over the 4-day window the
 * route actually asks for, the long cohort answers `191` present slots of `5.761` — and `62` of
 * those `191` are legitimate zeros `[MEDIDO 2026-09-16, `GET /api/v1/series-history`,
 * `series_key_id=23e4332…`, `bar_policy=final_only`, n=5.761 grades]`. A pane publishing only
 * "191 observações" would let a reader take all `191` for liquidation events, overstating by
 * `1,5x`. The two counts side by side are the same discipline `T-03.5` applied to OI's native bars
 * versus its wire staircase: a falsifier needs both figures.
 *
 * `-0` counts as zero (`-0 === 0`), the same call `zeroMarkSeries` makes, and for the same reason:
 * a provider that reported `-0` reported zero.
 */
export function countZeroSlots(slots: readonly ScalarSlotShape[]): number {
  return slots.filter((slot) => slot.value === 0).length;
}

/**
 * The instant of the FIRST slot carrying a real value, or `null` when none does — the left end
 * of the readable horizon the screen declares (`SymbolClient.tsx::ReadableHorizon`).
 *
 * Scanning FORWARD is the whole point and is not an implementation detail: over the derived
 * window the first present slot sits at index `4.971/5.761` `[MEDIDO 2026-09-11,
 * ACHADO-BACKFILL-INVISIVEL-AO-AS-OF.md]`, because rows imported by backfill carry
 * `available_at = the instant we fetched them` and `R-1` refuses them at their own grid
 * instant. This function reports that boundary; it does NOT move it, fill anything before it,
 * or shorten the window to start there — `RN-1`'s absence stays absence, and the span stays
 * `PRD-006 §2`/item `5.1`'s.
 */
export function firstPresentSlotMs(slots: readonly ScalarSlotShape[]): number | null {
  const found = slots.find((slot) => slot.value !== null);
  return found === undefined ? null : found.time;
}

/**
 * The reading of a `FLOW` series at one instant, `FLOW` semantics (`resolveFlowReading`, reused
 * from `charts` — no second absence policy is written here). Used by the volume sub-axis and, since
 * `T-05.9`, by both liquidation cohorts; renamed off `resolveVolumeReading` for the reason
 * `nonNegativeFlowSlotsFromHistoryRows` states in full.
 *
 * The GUARD this function exists for: `resolveFlowReading` throws `RangeError` on an empty slot
 * array (*"an empty grid has no extent to query"*), and an empty array is the NORMAL state of
 * such a surface whenever the panel degraded — catalog without the series, transport down, or
 * simply nothing ingested yet. A throw there would crash the whole `/symbol` route over an
 * absence the page is designed to render, which is the failure class fase `04` of
 * `pagina-de-grafico-s2` already paid for once. Absence answers `absent`; it never throws and
 * it never becomes `0`.
 */
export function resolveFlowReadingOrAbsent(slots: readonly ScalarSlotShape[], instantMs: number): FlowReading {
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


// ── `T-02.5` — WHICH `cvd_source` ROW THE CVD PANEL READS, AND WHY IT TAKES THREE TERMS ──────
//
// `GET /series-catalog` serves FOUR rows whose `metric` is `cvd_source` for each instrument
// (`domain/cvd_source_catalog.py`), and they are four different SERIES, not four spellings of
// one:
//
//   provider    quantity_field  builder                    what it is
//   binance     q               build_aggtrade_q_entry     CVD from the `aggTrade` `q` field
//   binance     nq              build_aggtrade_nq_entry    CVD from the `aggTrade` `nq` field
//   coinalyze   NA              build_coinalyze_bv_entry   a RECONSTRUCTION (reconstructed_from
//                                                          = "aggtrade_q", published_error set)
//   binance     NA              build_kline_takerbuy_entry `2*takerBuy[9] - volume[5]`, the row
//                                                          `T-02.3` publishes off the SAME
//                                                          `/fapi/v1/klines` array phase `01`
//                                                          already fetches
//
// ⛔ SO `metric === "cvd_source"` ALONE PICKS THE WRONG SERIES, and it does it SILENTLY: the
// catalog is ordered, `Array.prototype.find` answers the FIRST match, and the first match for
// BTCUSDT today is `aggtrade_q` — a series this repository publishes NO rows for, which would
// render an all-absent panel while every link in the chain reported success. That is the exact
// failure fase `04` of `pagina-de-grafico-s2` had to find IN PRODUCTION, by hand.
//
// The three terms below are the minimum that separates the intended row from the other three,
// and each one is load-bearing: `quantityField` alone also matches `coinalyze_bv`; `provider`
// alone also matches `aggtrade_q`/`aggtrade_nq`. ⛔ POSITION IS NOT USED: the row sits at index
// 11 of each instrument's block of 12 TODAY (`use_cases/series_catalog.py`), and indexing by
// position would re-point this panel at another metric the day a row is appended.

/** `metric` of every CVD source row (`cvd_source_catalog.py::CVD_SOURCE_METRIC`). */
export const CVD_SOURCE_METRIC = "cvd_source";
/** The ORIGIN, not a third party — `coinalyze_bv` is the row this term excludes. */
export const CVD_KLINE_PROVIDER = "binance";
/** `QuantityField.NA`: nothing in `2*takerBuy - volume` derives from an `aggTrade` quantity —
 * this is what excludes `aggtrade_q` (`q`) and `aggtrade_nq` (`nq`). */
export const CVD_KLINE_QUANTITY_FIELD = "NA";

/**
 * Is this the `kline_takerbuy` `cvd_source` row — the one `T-02.3`'s collector writes?
 *
 * Exported from `view-model.ts` rather than written inline in `page.tsx` so a `node --test`
 * suite can run it against a catalog fixture: `page.tsx` cannot be imported by a test (it is a
 * Next Server Component with route-level side effects), and a selector that can only be checked
 * by reading it is exactly the class of defect this one exists to avoid.
 */
export function matchesKlineTakerBuyCvd(key: SeriesKey): boolean {
  return (
    key.metric === CVD_SOURCE_METRIC &&
    key.provider === CVD_KLINE_PROVIDER &&
    key.quantityField === CVD_KLINE_QUANTITY_FIELD
  );
}


// ── `T-03.5` — WHICH `sum_open_interest` ROW THE OI PANEL READS, AND WHY IT TAKES THREE TERMS ─
//
// The SAME defect the block above documents for CVD, found a second time, in production, on a
// different metric — `handoff/T-03.5-T-03.6-FRONT.md` §2. `page.tsx` selected
// `metric === "sum_open_interest"` alone, `findCatalogEntry` answered with
// `Array.prototype.find`, and `GET /series-catalog` serves FIVE rows of that metric per
// instrument (`domain/open_interest_catalog.py`, `CA-F2-17`), the four Coinalyze ones FIRST:
//
//   index  provider    reduction  ts_convention          rows in `md.series`
//   5      coinalyze   OPEN       OHLC_OVER_BUCKET       0      <- what `find` answered
//   6      coinalyze   HIGH       OHLC_OVER_BUCKET       0
//   7      coinalyze   LOW        OHLC_OVER_BUCKET       0
//   8      coinalyze   CLOSE      OHLC_OVER_BUCKET       0
//   9      binance     POINT      POINT_AT_BUCKET_END    8.064  <- the one `ADR-036/D2` names
//
// `[MEDIDO 2026-09-12: GET /api/v1/series-catalog -> 13 linhas para BTCUSDT, 5 delas com
// metric="sum_open_interest"; `select count(*) from md.series where
// src_label_raw='/futures/data/openInterestHist'` -> 8.064]`.
//
// ⛔ SO THE ONE-TERM SELECTOR PICKED A SERIES WITH ZERO ROWS AND THE ROUTE ANSWERED `200`: every
// slot rendered `SEM_PONTO`, which on screen is indistinguishable from "o mercado não teve
// dado". The `rc=0`-that-means-nothing failure `ADR-012` names.
//
// ⚠️ AND THE FIX IS NOT "TAKE INDEX 9" NOR "TAKE THE LAST MATCH". The order of `"entries"` is
// FORM (`RS-1`), stable BY APPEND — depending on it would turn "acrescentar uma linha ao
// catálogo" into a silent re-pointing of this panel, the same class of defect one level up. The
// fix is IDENTITY: name the terms that distinguish the series from its siblings, and REFUSE
// ambiguity instead of resolving it by position (`page.tsx::findUniqueCatalogEntry`).
//
// THE THREE TERMS, and what each is for — stated honestly, including the one redundant TODAY:
//
//   `metric`     narrows to the five rows above. ALONE IT MATCHES 5 (measured).
//   `provider`   `ADR-036/D2` fixes Binance (the ORIGIN) as the source of M2; `RS-5`'s
//                third-party label would only apply to a third-party series. Excludes the four
//                Coinalyze rows — `metric + provider` matches exactly 1 today.
//   `reduction`  REDUNDANT AGAINST TODAY'S CATALOG, and deliberate: this is the metric the
//                catalog ALREADY publishes under four reductions, so "which reading of the
//                bucket" is not a hypothetical axis here — it is the axis this metric is keyed
//                by (`coinalyze_open_interest_key` makes `reduction` a required, defaultless
//                argument for exactly that reason, `D6.7`). A Binance OHLC row would make
//                `metric + provider` ambiguous; with this term the panel keeps pointing at the
//                bucket-close reading it draws today.
//
// ⛔ REDUNDANCY IS NOT FREE, SO THE COST IS NAMED: a third term is a third way for the backend to
// make this panel go dark by renaming something. What keeps that from being SILENT is
// `findUniqueCatalogEntry` — zero matches is a named absence on screen
// (`panel_absent:not_in_catalog`), never a wrong row. The trade this file takes: a loud nothing
// over a quiet something.

/** `metric` of every open-interest row (`open_interest_catalog.py`, both key builders). */
export const OPEN_INTEREST_METRIC = "sum_open_interest";
/** The ORIGIN, not the third party — `ADR-036/D2`. Excludes the four Coinalyze OHLC rows. */
export const OPEN_INTEREST_PROVIDER = "binance";
/** `Reduction.POINT`: ONE reading per bucket, at its close (`ts_convention =
 * POINT_AT_BUCKET_END`) — never `OPEN`/`HIGH`/`LOW`/`CLOSE` over a bucket. */
export const OPEN_INTEREST_REDUCTION = "POINT";

/**
 * Is this the Binance `openInterestHist` row — the one `T-03.3`'s collector writes?
 *
 * Exported from `view-model.ts` rather than written inline in `page.tsx` for the same reason
 * `matchesKlineTakerBuyCvd` is: `page.tsx` cannot be imported by a `node --test` suite, and a
 * selector that can only be checked by reading it is exactly the class of defect it exists to
 * avoid (`oi-series-selector.test.ts` runs this one against a fixture carrying all five rows).
 */
export function matchesBinanceOpenInterest(key: SeriesKey): boolean {
  return (
    key.metric === OPEN_INTEREST_METRIC &&
    key.provider === OPEN_INTEREST_PROVIDER &&
    key.reduction === OPEN_INTEREST_REDUCTION
  );
}


// ── `T-05.9` — WHICH `sum_liquidation` ROWS THE LIQUIDATION PANE READS, AND WHY THERE ARE TWO ─
//
// ⛔ TWO SERIES, NEVER ONE. `cohort` is a term of IDENTITY (`SPEC-001` §2.1), and
// `domain/liquidation_catalog.py` builds one catalog row per leg on purpose, with the argument
// written out there: *"a long liquidation is forced selling and a short liquidation is forced
// buying. Their sum is a 'liquidation volume' that moves identically whether the market just
// flushed longs, flushed shorts, or flushed both — which is precisely the discrimination the
// metric exists to provide (`RF-2`)."* So this route resolves TWO entries, fetches TWO
// `series_key_id`s and draws TWO surfaces; nothing in `web` adds them.
//
// THE SELECTOR TAKES THREE TERMS, the same discipline `matchesBinanceOpenInterest` and
// `matchesKlineTakerBuyCvd` above earned the hard way — and here the third is not redundant, it
// IS the discriminator:
//
//   `metric`    narrows to the liquidation rows. ALONE IT MATCHES 2 per instrument (measured).
//   `provider`  `coinalyze` is the ONLY source of this metric today (`ADR-036/D4` keeps
//               `!forceOrder@arr` off the critical path, and it has written nothing). Named
//               anyway: the day a second provider publishes the metric, this pane must go to a
//               NAMED ambiguity instead of to whichever row the catalog lists first.
//   `cohort`    the leg. WITHOUT IT THE SELECTOR IS AMBIGUOUS BY CONSTRUCTION — and that is the
//               good outcome, not the bad one: `resolveCatalogEntry` refuses two matches, so the
//               failure mode of forgetting this term is an empty pane that says why, never a
//               pane that silently draws longs under a name a reader takes for "the liquidations".
//
// `[MEDIDO 2026-09-16: GET /api/v1/series-catalog -> n_entries=60, 8 linhas com
//  metric="sum_liquidation" (4 instrumentos x 2 coortes), 2 delas para BTCUSDT — uma por coorte,
//  cada seletor de 3 termos casando EXATAMENTE 1]`.

/** `metric` of both liquidation rows (`liquidation_catalog.py::coinalyze_liquidation_key`). */
export const LIQUIDATION_METRIC = "sum_liquidation";
/** The only publisher of this metric today — and a THIRD PARTY, which is what `RS-5` is about. */
export const LIQUIDATION_PROVIDER = "coinalyze";

/** The two legs, transcribed from `liquidation_catalog.py::COHORTS`. Closed on purpose there —
 * *"a third cohort would be a third series with its own requirement, not a value someone may pass
 * in"* — and closed here for the same reason: the tuple is the TYPE, so a pane cannot ask for a
 * leg the sources do not publish. */
export const LIQUIDATION_COHORTS = ["long", "short"] as const;
export type LiquidationCohort = (typeof LIQUIDATION_COHORTS)[number];

/**
 * Is this the Coinalyze `sum_liquidation` row of ONE cohort — one of the two `T-05.5`'s collector
 * writes?
 *
 * Exported from `view-model.ts` rather than written inline in `page.tsx` for the same reason the
 * two selectors above are: `page.tsx` cannot be imported by a `node --test` suite, and a selector
 * that can only be checked by reading it is exactly the class of defect it exists to avoid
 * (`liquidation-series-selector.test.ts` runs this one against a fixture carrying both legs plus
 * the sibling metrics).
 */
export function matchesLiquidationCohort(key: SeriesKey, cohort: LiquidationCohort): boolean {
  return (
    key.metric === LIQUIDATION_METRIC && key.provider === LIQUIDATION_PROVIDER && key.cohort === cohort
  );
}


// ── `T-04.5` — WHICH `count_long_short_ratio` ROW THE LONG/SHORT PANE READS ───────────────────
//
// ⛔ M3 IS NOT ONE SERIES, IT IS FOUR, AND THE BACKEND REFUSES THE GENERIC NAME IN CODE.
// `series_key.FORBIDDEN_METRIC_NAMES` rejects `ls_ratio` inside `SeriesKey.__post_init__`
// because that name covers `count_long_short_ratio`, `count_toptrader_long_short_ratio`,
// `sum_toptrader_long_short_ratio` and `sum_taker_long_short_vol_ratio` — three with lag-1
// autocorrelation of `0,99+` and one with `0,0955` (`SPEC-001` §3.1/§5.11, `CA-F2-3`). This pane
// draws exactly ONE of them, `count_long_short_ratio`, the row `long_short_catalog.py` publishes
// and the one Binance serves at `/futures/data/globalLongShortAccountRatio`.
//
// THE SELECTOR TAKES TWO TERMS, and the count of terms is a MEASUREMENT, not a habit:
//
//   `metric`    ALONE IT MATCHES EXACTLY 1 TODAY `[MEDIDO 2026-09-16: GET /api/v1/series-catalog
//               -> n_entries=60, 15 linhas para BTCUSDT, 1 com metric="count_long_short_ratio"]`.
//               The three sibling L/S series are not cataloged at all, and if they were they would
//               carry DIFFERENT metric names — so they are not what a second term defends against.
//   `provider`  `ADR-036/D3` fixes BINANCE (the ORIGIN) as the source of M3, and Coinalyze mirrors
//               the same quotient in its `r` field. The day that row is cataloged, `metric` alone
//               becomes ambiguous — and this term is what makes the pane keep pointing at the
//               origin instead of at whichever row the catalog happens to list first.
//
// ⛔ AND A THIRD TERM WAS CONSIDERED AND REFUSED, because redundancy is not free (`T-03.5`'s own
// warning: "a third term is a third way for the backend to make this panel go dark by renaming
// something"). The candidate was `reduction === "POINT"` — the term that saved the OI pane, where
// the SAME metric is published under four reductions. Here it defends against nothing: the
// coarsening this series would need for another reduction is refused BY TYPE upstream
// (`long_short_ratio_series.py` allows `last()` on the edge and refuses `mean()`/`sum()`), so a
// second reduction of this metric is not a row the catalog can grow. Two terms, both load-bearing.

/** `metric` of the row (`long_short_catalog.py`, via `long_short_ratio_series.COUNT_LONG_SHORT_RATIO`). */
export const LONG_SHORT_METRIC = "count_long_short_ratio";
/** The ORIGIN (`ADR-036/D3`) — the term that excludes a future Coinalyze mirror of the same quotient. */
export const LONG_SHORT_PROVIDER = "binance";

/**
 * Is this the Binance `globalLongShortAccountRatio` row — the one `T-04.2`'s collector writes?
 *
 * Exported from `view-model.ts` rather than written inline in `page.tsx` for the same reason the
 * three selectors above are: `page.tsx` cannot be imported by a `node --test` suite, and a selector
 * that can only be checked by reading it is exactly the class of defect it exists to avoid
 * (`long-short-series-selector.test.ts` runs this one against a fixture carrying the sibling rows).
 */
export function matchesCountLongShortRatio(key: SeriesKey): boolean {
  return key.metric === LONG_SHORT_METRIC && key.provider === LONG_SHORT_PROVIDER;
}

/**
 * `RN-S1` FOR A SERIES WHOSE STAIRCASE DOES NOT LAND ON THE 5-MINUTE GRID — how many NATIVE
 * observations the wire rows carry, counted by DISTINCT PUBLICATION (`available_at`).
 *
 * ⛔ WHY NOT `presentRows / 5`, WHICH IS THE DIVISOR THE PLAN WRITES DOWN: the divisor assumes every
 * native bucket occupies exactly five slots of the `1m` grid. Measured against production it does
 * not: over a 4-hour window the readable rows group into runs of `1..5` slots (`1x1, 2x6, 3x17,
 * 4x14, 5x11`), because the run is cut short by the next publication and by the absences around it.
 * `[MEDIDO 2026-09-16, GET /api/v1/series-history?series_key_id=279d3172…&symbol=BTCUSDT&
 *  interval=1m&bar_policy=final_only, janela de 240 min: 240 slots, 175 com valor, 65 sem;
 *  175/5 = 35 contra 49 available_at distintos, e 240 min / 5 min = 48 baldes esperados]` — the
 * divisor UNDERSTATES this series by ~28%.
 *
 * ⛔ AND NOT `event_time % 300_000 === 0` EITHER, which is how the OI pane gets its native grid:
 * that series' observations land ON the five-minute grid, and this one's do not. The same
 * measurement answers `11` readable rows on the `300_000` grid out of `49` real buckets — a 4,5x
 * undercount — because the ladder of this series starts wherever the publication landed
 * (`long_short_catalog.py` measured delays of `9,6 s` and `70,8 s` on two consecutive buckets).
 *
 * WHAT `available_at` IS HERE, AND WHY IT IDENTIFIES THE BUCKET: `ADR-038` stamps the row at the
 * instant the observation became knowable, and the read path repeats THAT ONE STAMP across every
 * `1m` slot the bucket covers — the adendo of `handoff/T-04.5-HANDOFF-FRONT.md` names it as what
 * produces the staircase. So one distinct `available_at` is one distinct native observation.
 *
 * ⚠️ ITS ONE FAILURE MODE, DECLARED: rows imported by BACKFILL share the instant they were fetched,
 * so a backfilled stretch collapses into fewer publications than it has buckets. The error is
 * therefore always toward UNDERSTATING the data — a `DoD-3` threshold read off this number is never
 * passed by a bucket that does not exist, which is the direction a count feeding an `N >= 30` gate
 * has to fail in.
 */
export function countNativeBarsByPublication(rows: readonly SeriesHistoryRow[]): number {
  const publications = new Set<number>();
  for (const row of rows) {
    if (row.value !== null && row.available_at !== null) {
      publications.add(row.available_at);
    }
  }
  return publications.size;
}


// ── `T-05.9`/`RS-5` — WHOSE MEASUREMENT IS ON SCREEN, DECIDED BY RULE AND NOT BY MEMORY ───────
//
// `SPEC-007` §7, literal: *"toda série de terceiro ou de reconstrução que chega à tela é rotulada
// como tal, com o `published_error` … O operador não pode ler dado de terceiro sem saber que é de
// terceiro."* `sum_liquidation` is, after `GA-7`, the ONLY third-party series of this feature.
//
// ⛔ THE RULE IS "WHO PUBLISHED IT", NOT "IS THE PROVIDER STRING COINALYZE". A hardcoded
// `provider === "coinalyze"` test would satisfy `RS-5` for today's catalog and silently fail for
// the next third party, which is the exact shape of the defect `RS-5` exists to prevent. So the
// rule is stated from the other side: a series is ORIGIN only when the venue's OWN publisher
// published it AND it is not a reconstruction. Everything else is DECLARED.

/** Who the ORIGIN publisher of each venue is — the exchange that ran the matching engine.
 *
 * ⛔ A VENUE MISSING FROM THIS MAP RESOLVES TO `declared`, NEVER TO `origin`, and the asymmetry is
 * the whole design: an unknown venue is a venue whose origin this repository cannot prove, and
 * `RS-5`'s failure mode is a third party read as first-party data. Erring toward the label costs
 * one sentence on screen; erring away from it costs the operator's trust in a number. */
export const ORIGIN_PROVIDER_BY_VENUE: ReadonlyMap<string, string> = new Map([["usdm_futures", "binance"]]);

/** The catalog fields `resolveSeriesProvenance` reads — declared structurally so a test can build
 * one without importing the whole `SeriesCatalogEntry` and so this function cannot quietly start
 * depending on a field nobody passed it. */
export interface ProvenanceSourceEntry {
  readonly key: Pick<SeriesKey, "provider" | "venue">;
  readonly reconstructedFrom: string | null;
  readonly publishedError: PublishedErrorFact | null;
}

/**
 * `RS-5` as a FUNCTION over the catalog row, so the pane renders the label by TYPE instead of by
 * a developer remembering the rule — see `panel-status.ts::SeriesProvenance` for why the three
 * kinds are what makes "third party without a label" inexpressible.
 *
 * `undefined` (no entry resolved) answers `unresolved`, never `origin`: "we could not identify the
 * series" and "this is first-party data" are opposite claims and only one of them is a reassurance.
 */
export function resolveSeriesProvenance(entry: ProvenanceSourceEntry | undefined): SeriesProvenance {
  if (entry === undefined) {
    return { kind: "unresolved" };
  }
  const origin = ORIGIN_PROVIDER_BY_VENUE.get(entry.key.venue);
  if (origin === entry.key.provider && entry.reconstructedFrom === null) {
    return { kind: "origin", provider: entry.key.provider };
  }
  return {
    kind: "declared",
    provider: entry.key.provider,
    reconstructedFrom: entry.reconstructedFrom,
    publishedError: entry.publishedError,
  };
}

/**
 * The instant of the LAST slot carrying a real value, or `null` when none does — the mirror of
 * `firstPresentSlotMs`, and the input `RNF-2`'s freshness verdict is computed from.
 *
 * Scanning BACKWARD (`findLast`) rather than filtering the whole array: the answer wanted is the
 * RIGHT end of the readable horizon, and on this screen the array is the window's full grid
 * (1.152 slots for OI over 4 days), mostly empty.
 */
export function lastPresentSlotMs(slots: readonly ScalarSlotShape[]): number | null {
  const found = slots.findLast((slot) => slot.value !== null);
  return found === undefined ? null : found.time;
}

/**
 * The `available_at` of the NEWEST READABLE row — the instant the right-edge reading became
 * knowable, and the minuend of `RNF-2`'s age (`T - available_at`, `STITCH_CONTEXT.md:1774`).
 *
 * ⛔ THE NEWEST ROW, NOT `Math.max` OVER `available_at`, and the two diverge exactly in the case
 * that matters: under backfill an OLD row receives a RECENT `available_at`, and `max` would pick
 * precisely the row that rejuvenates the screen. `STITCH_CONTEXT.md:1777` scopes the age field to
 * the RIGHT EDGE of time, so the row is chosen by `event_time` and the timestamp is then read off
 * THAT row.
 *
 * Chosen by greatest `event_time` rather than by array position (`findLast`): row order is a
 * server convention this module never asserts. The two answers agree whenever the wire is ordered,
 * and only this one is right when it is not.
 *
 * `available_at` is `null` exactly when `value` is (`CA-F1-5`, asserted at the point the wire is
 * trusted in `series-history-client.ts`), so a readable row always carries one — the `?? null` is
 * the type system's price, not a case this contract permits.
 */
export function lastReadableAvailableAtMs(rows: readonly SeriesHistoryRow[]): number | null {
  let newest: SeriesHistoryRow | null = null;
  for (const row of rows) {
    if (row.value === null) {
      continue;
    }
    if (newest === null || row.event_time > newest.event_time) {
      newest = row;
    }
  }
  return newest?.available_at ?? null;
}

/**
 * `RNF-2` — HOW OLD the newest readable point of a panel is, and whether that age is past the
 * ceiling the catalog itself publishes for the series.
 *
 * ⛔ THE CEILING IS NOT INVENTED HERE AND NO ROUTE CHANGES FORM (`RF-5`): it is
 * `SeriesCatalogEntry.maxStalenessMs`, already served in every row of `GET /series-catalog`
 * (`600_000` for open interest — twice the `5m` native bucket, `open_interest_catalog.py`
 * `_MAX_STALENESS_MS`). `page.tsx` reads it off the SAME entry it resolved the `series_key_id`
 * from, so the ceiling on screen and the ceiling `as_of` applied server-side
 * (`series_history.py`: `staleness_ms = entry.max_staleness_ms`) are one number by construction,
 * not by coincidence.
 *
 * [INFERRED: `tasks.toml`'s own ref names `liveness.stale_after_s` as the field to reuse. That
 * one is served by `GET /collector-status` (`ADR-030`) — a route `/symbol` does not call, and a
 * per-ENDPOINT judgement, not a per-series one; reaching for it would add a second network call
 * to this render to learn a number the entry already in hand carries. `maxStalenessMs` is taken
 * instead, on the ref's OWN rule ("reusa o que JÁ é servido, não inventa campo novo"), and the
 * divergence is declared here instead of left for a reader to discover.]
 *
 * ⚠️ WHAT `ageMs` MEASURES — and `A-4.2` CHANGED IT, so read this before quoting the number:
 * `T - available_at`, the distance from the window's last grid instant to the instant the newest
 * readable row BECAME KNOWABLE. That is the literal definition in `STITCH_CONTEXT.md:1774`, and
 * it is PUBLICATION LAG plus window trailing — not a distance between grid instants.
 *
 * ⛔ WHAT IT USED TO MEASURE, and why that was a defect and not a naming quibble: `T -
 * lastPresentSlotMs`, the distance to the last grid instant the SERVER MANAGED TO FILL. Open
 * interest is `Nature.STOCK` ⇒ the server carries the last observation forward up to the SAME
 * `max_staleness_ms` this line then compares against (`as_of_accessor.py:112-113,330`;
 * `series_history.py:197-200` feeds it `entry.max_staleness_ms`), so the ceiling was SPENT on the
 * server and CHARGED AGAIN here. Measured budget of the old rule: `540_000 ms` of server LOCF on
 * the `1m` grid plus `600_000 ms` of client ceiling = `1_140_000 ms`, i.e. the panel printed
 * `fresh` over a reading `25,0-30,0 min` old — `5,0x-6,0x` the `5m` cadence, and `ageMs` read `0`
 * for every reading the server still had budget to carry
 * [MEDIDO 2026-09-15, `gates/T-03.5-T-03.6-A-4.2-decisao-limiar.md` §1 e §2.3].
 *
 * ⛔ AND THE REFERENCE INSTANT IS NOT THE WALL CLOCK. `instantMs` is the caller's
 * `windowEndMsInclusive`, and the route's window end TRAILS the wall clock by
 * `360_000-659_999 ms` [MEDIDO 2026-09-15 over the real `resolveRouteWindow`, n=300000 — one whole
 * `5 min` cycle at millisecond resolution: min=360000 max=659999 mean=509999.5. The
 * `max=600000 mean=480000 (n=1440)` this docstring carried before was an artefact of sampling on
 * MINUTE boundaries; in closed form `trailing = 360_000 + (nowMs mod 300_000)`, whose supremum is
 * `659_999`, ibid. §2.1]. So a `fresh` verdict still tolerates that much WALL-CLOCK age on top of
 * the ceiling — for open interest the last `fresh` now sits at a reading `15,0-20,0 min` old,
 * `3,0x-4,0x` the `5m` cadence (ibid. §2.3), against `5,0x-6,0x` before.
 *
 * That residual is NOT fixable by swapping in `Date.now()`: `STITCH_CONTEXT.md:1773-1776` bans the
 * wall clock as the reference ("o carimbo e do FECHO da janela"), and under as-of replay
 * `Date.now()` would print `stale` for ALL history. It is `R-1` of that decision — declared, with
 * owner (owner) and date (2026-10-15), in its §8.
 *
 * ⚠️ `ageMs` CAN BE SLIGHTLY NEGATIVE, and it is left raw instead of clamped: the server reads
 * `as_of` at `t = grid_instant + 59_999` (`series_history.py:149`), so a row landing on the last
 * grid instant may carry an `available_at` up to `59_999 ms` PAST `instantMs`. The comparison is
 * unaffected (`ageMs > ceilingMs` stays false) and the renderer floors the display at zero;
 * clamping here would hide, in the attribute, a real property of the read.
 */
export function resolveFreshnessVerdict(
  rows: readonly SeriesHistoryRow[],
  instantMs: number,
  ceilingMs: number | null,
): FreshnessVerdict {
  const observedMs = lastReadableAvailableAtMs(rows);
  // TWO DIFFERENT IGNORANCES, deliberately collapsed into one verdict and never into "fresh": no
  // readable point at all, and no ceiling published for the series (the panel degraded before it
  // ever had a catalog entry). Neither licenses the screen to say the data is current.
  if (observedMs === null || ceilingMs === null) {
    return { kind: "unknown", ageMs: null, observedMs: null, referenceMs: instantMs, ceilingMs };
  }
  const ageMs = instantMs - observedMs;
  // `referenceMs` travels WITH the age so the renderer can name the instant the age is counted
  // back from. Handing the number over beats letting the view recompute `observedMs + ageMs`:
  // the view would then own a second model of the same subtraction.
  //
  // ⚠️ `observedMs` IS A PUBLICATION INSTANT (`available_at`), not a grid instant — since `A-4.2`.
  // Whoever reads `data-freshness-observed-ms` off the DOM must not expect it to land on the
  // native grid; `e2e/12-oi-dado-real.spec.ts` asserted exactly that and was corrected with this.
  return ageMs > ceilingMs
    ? { kind: "stale", ageMs, observedMs, referenceMs: instantMs, ceilingMs }
    : { kind: "fresh", ageMs, observedMs, referenceMs: instantMs, ceilingMs };
}
