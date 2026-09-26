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
 * ── `T-01.8` — PRICE IS FOUR SERIES NOW, AND THE DEGENERATE CANDLE IS GONE (`SPEC-008`/`D1`) ─
 *
 * ⛔ THIS SECTION USED TO ARGUE FOR A DEGENERATE CANDLE — `{open: close, high: close, low:
 * close, close}`, one scalar drawn as a flat body with no wick — and the argument was correct
 * for as long as its premise held: the catalog served ONE price series per bucket
 * (`klines_last`, `Reduction.LAST`), so four equal numbers were the honest transcription of
 * "we only measured one number here". `SPEC-008`/`D1` (§3.4) retired the premise: `T-01.1`
 * built the identity of FOUR `Reduction` readings of the SAME `/fapi/v1/klines` bucket
 * (`klines_ohlc`, `OPEN`/`HIGH`/`LOW`/`CLOSE`, `interval="1m"`, `nature=STOCK`,
 * `ts_convention=OHLC_OVER_BUCKET`), `T-01.3` writes them and `T-01.6` serves them.
 *
 * `RN-2`/`SPEC-008` §3.5 is why the old mapping is DELETED in the same commit that adds this
 * one rather than kept behind a flag: two live assemblies would give the SAME drawing on the
 * SAME screen two meanings, and an operator reading a flat bar could not tell "the market did
 * not move" from "this code path only had one number". `grep -n "high: close\|low: close"
 * frontend/src` is the falsifier, and it answers zero lines.
 *
 * ── A BUCKET MISSING ANY ONE OF THE FOUR DRAWS NOTHING, AND THAT IS `RN-1` ──────────────────
 *
 * A candle needs all four readings; three of them plus a guess is a drawing nobody measured.
 * So `rawCandlesFromOhlcHistoryRows` emits a candle only where all four are present, and a
 * bucket with one, two or three of them contributes NOTHING — which the grid renders as
 * `candle: null` and `candlestickSeriesLossless` as a bare `{time}` `WhitespaceItem`: a real
 * gap, never a bar. ⛔ IT IS NEVER A ZERO-HEIGHT CANDLE: `high === low` is, pixel for pixel,
 * the mark of a market that did not move, so rendering absence that way would state as fact
 * exactly the thing we do not know (`RN-1`, `SPEC-008` §7.2). The partial buckets are COUNTED
 * and published beside the drawing (`assembleOhlcCandles`), so a hole in the middle of the
 * window is a number on screen instead of a silence.
 *
 * ── WHAT IS NOT REOPENED HERE ───────────────────────────────────────────────────────────────
 *
 * `price_use`/`price_source` (`ADR-007`/`PS-1`, and `SPEC-008` §2.1 lists it among what that
 * SPEC does not reopen): the panel keeps declaring `structure_detection`/`klines_last`, which
 * are CONCEPTS of `ADR-007`'s decision table — the traded price off `/fapi/v1/klines`, which
 * is precisely the endpoint these four readings come from. The four catalog rows themselves
 * carry `price_use = None` on purpose (`klines_ohlc_catalog.py`: routing a decision-path price
 * question stays `klines_last`'s job), so nothing here claims one for them.
 */

import {
  ONE_MINUTE_MS,
  S2_AXIS_STEP_MS,
  buildScalarSeries,
  resolveFlowReading,
  type FlowReading,
  type S2Panels,
  type S2RawInputs,
  type S2Window,
} from "../../charts/index.ts";
import type {
  FreshnessVerdict,
  OiProvenanceLabel,
  PublishedErrorFact,
  SeriesProvenance,
  SeriesValueStats,
} from "./panel-status.ts";
import type { SeriesHistoryRow } from "./series-history-client.ts";
import type { SeriesKey } from "../../features/s3-inspector/series-catalog.ts";

// Re-exported so the server-side callers of `resolveFreshnessVerdict` get the function and its
// return type from ONE import; the type itself is DECLARED in `panel-status.ts`, which is the
// only module both sides of the RSC boundary may import (see its own docstring for why).
export type { FreshnessVerdict, OiProvenanceLabel, PublishedErrorFact, SeriesProvenance, SeriesValueStats };

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

/** `GridSlot`'s shape for the PRICE panel (`candle: RawCandle | null`), read off the barrel's
 * `S2Panels` by the same indexed access — the grid `buildS2Panels` produced, which is exactly
 * what `SymbolClient.tsx` hands to `candlestickSeriesLossless`. */
export type CandleSlotShape = S2Panels["price"]["series"]["slots"][number];

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

// ── `T-01.8` — THE FOUR `klines_ohlc` SERIES THE PRICE PANEL READS (`SPEC-008` §3.4) ─────────

/** `metric` of the four candle rows (`klines_ohlc_catalog.py::KLINES_OHLC_METRIC`),
 * transcribed — never re-derived from a label on screen. */
export const KLINES_OHLC_METRIC = "klines_ohlc";

/** The ORIGIN of the traded price (`ADR-036/D2`), and the term that keeps this panel on
 * `/fapi/v1/klines` the day a third party publishes its own mirror of the same four readings
 * under the same `metric`. Redundant TODAY (`klines_ohlc` has a single publisher, measured in
 * `price-candle.test.ts` against the served catalog fixture) and load-bearing the moment it
 * stops being — the same posture `matchesKlineTakerBuyCvd`/`matchesBinanceOpenInterest` take,
 * both of which were written AFTER a one-term selector silently picked an empty series. */
export const KLINES_OHLC_PROVIDER = "binance";

/** The four readings, in the order the metric's name spells them — mirrors
 * `klines_ohlc_catalog.py::KLINES_OHLC_REDUCTIONS`. The tuple is the ONE place the set is
 * written on this side of the wire. */
export const KLINES_OHLC_REDUCTIONS = ["OPEN", "HIGH", "LOW", "CLOSE"] as const;

/** One of the four `Reduction` values that identify a `klines_ohlc` row. */
export type KlinesOhlcReduction = (typeof KLINES_OHLC_REDUCTIONS)[number];

/**
 * Is this the `klines_ohlc` row carrying `reduction` — one of the four the candle is made of?
 *
 * ⛔ `reduction` HAS NO DEFAULT, exactly as `build_klines_ohlc_key` has none on the other side
 * of the wire (`CA-F2-17`/`D6.7`): the four rows differ in that ONE term, so a caller that
 * omits it is asking "give me the candle" — a question with four answers — and answering it by
 * picking one in silence is how `HIGH` becomes `LOW` with nothing reproving.
 *
 * Exported from `view-model.ts` rather than written inline in `page.tsx` for the reason the
 * three selectors below it already state: `page.tsx` is a Next Server Component with
 * route-level side effects and cannot be imported by a `node --test` suite, so a selector
 * living there could only ever be checked by reading it.
 */
export function matchesKlinesOhlc(key: SeriesKey, reduction: KlinesOhlcReduction): boolean {
  return (
    key.metric === KLINES_OHLC_METRIC &&
    key.provider === KLINES_OHLC_PROVIDER &&
    key.reduction === reduction
  );
}

/** The four row sets `GET /series-history` answered for one window, one per `Reduction` —
 * named fields and never a positional tuple, because a tuple whose second and third members
 * are `HIGH` and `LOW` is one transposition away from an upside-down candle that draws
 * perfectly well. */
export interface OhlcHistoryRows {
  readonly open: readonly SeriesHistoryRow[];
  readonly high: readonly SeriesHistoryRow[];
  readonly low: readonly SeriesHistoryRow[];
  readonly close: readonly SeriesHistoryRow[];
}

/** One `Reduction` answered TWO readings for the same grid instant. Loud, for the same reason
 * `InvalidSeriesValueError` is: `/series-history` walks the grid and answers one row per
 * instant, so a duplicate is a broken contract upstream — and a `Map.set` that quietly kept
 * the last one would pick a candle's `HIGH` by wire order. `alignCandlesToGrid` (`charts`)
 * already refuses a duplicate candle; this refuses the duplicate READING, which is the one
 * that could still differ in value. */
export class DuplicateSeriesRowError extends Error {}

/** What the price panel drew, and what it could not draw — returned TOGETHER, from ONE pass,
 * so the count the screen prints and the bars it plots cannot disagree. */
export interface OhlcCandleAssembly {
  /** One candle per bucket where all four readings are present, ascending by `openTimeMs`. */
  readonly candles: readonly RawCandleShape[];
  /** Buckets where SOME (1..3) of the four readings are present — drawn as a gap, counted
   * here so the hole is a number on screen rather than a silence (`SPEC-008` §7.2's own
   * reason: "queijo suíço", holes in the middle, not a clean edge). */
  readonly partialBuckets: number;
}

/**
 * `RawCandle.volume` is a REQUIRED field of a `charts` type this route does not own
 * (`ADR-003`), and no consumer on this path reads it: `candlestickSeriesLossless` maps `open`/
 * `high`/`low`/`close` only, and `rollUpCandles` (the one function that sums it) is not on this
 * route. The traded volume of the bucket is a SERIES OF ITS OWN — `klines_volume`, the sub-axis
 * (`SPEC-007 §3.6`) — read from its own rows, with its own absence policy, a few lines below.
 *
 * ⛔ SO THIS IS A STRUCTURAL FILLER FOR A FIELD NOTHING READS, NOT A MEASUREMENT: the day
 * something on this path starts reading it, it must read the volume series, never this. The
 * guarantee that the filler does not reach the screen is pinned by a test, not by this
 * sentence — `price-candle.test.ts` asserts the items handed to `setData` carry no `volume`
 * key at all.
 */
const VOLUME_IS_ITS_OWN_SERIES = 0;

/** `row.value` (a `Decimal`-as-text, `SPEC-001 §2.6`) by grid instant, for ONE reduction —
 * absent rows contribute nothing (this module's central rule) and a malformed one throws.
 * `Number(...)` at this one display edge, the same posture `charts/s2-cvd.ts::unscale`
 * documents for its own. */
function readingsByEventTime(
  rows: readonly SeriesHistoryRow[],
  reduction: KlinesOhlcReduction,
): ReadonlyMap<number, number> {
  const readings = new Map<number, number>();
  for (const row of rows) {
    if (row.value === null) {
      continue;
    }
    const parsed = Number(row.value);
    if (!Number.isFinite(parsed)) {
      throw new InvalidSeriesValueError(
        `${reduction} value ${JSON.stringify(row.value)} at event_time ${row.event_time} is not a finite number`,
      );
    }
    if (readings.has(row.event_time)) {
      throw new DuplicateSeriesRowError(
        `${reduction} carries two readings for event_time ${row.event_time}: the grid answers one row per instant`,
      );
    }
    readings.set(row.event_time, parsed);
  }
  return readings;
}

/**
 * Maps the four `klines_ohlc` row sets into the `RawCandle[]` the price panel draws —
 * `SPEC-008`/`D1`, and the function that replaced the degenerate candle (`RN-2`, this module's
 * own docstring).
 *
 * ONE CANDLE PER BUCKET THAT HAS ALL FOUR READINGS, nothing for any other bucket:
 *
 *   - all four absent  ⇒ no candle ⇒ `candle: null` ⇒ `WhitespaceItem` ⇒ a gap on screen;
 *   - one to three     ⇒ no candle either, and counted in `partialBuckets`. Drawing three
 *     readings plus a guess would put a body or a wick on screen that nobody measured;
 *   - all four present ⇒ the candle, with the four numbers transcribed as published.
 *
 * ⛔ NO REPAIR, NO REORDER, NO CLAMP. A bucket whose `high` is below its `low` is a defect of
 * the producer, and sorting the four numbers here would turn it into a plausible-looking candle
 * — hiding, behind a correct drawing, exactly the kind of transposition `T-01.3`'s six-tuple
 * loop could introduce. The numbers reach the screen as the origin published them (`RN-7`), and
 * the comparison against the origin's own kline is a DoD of this fase (`T-01.7`).
 *
 * `openTimeMs` IS `row.event_time`, UNCHANGED FROM THE SCALAR MAPPING IT REPLACES, and the
 * deliberate omission is worth naming: `SPEC-008`/`A-9` measured that `event_time` is the
 * bucket's END, so the bucket a fact belongs to is the one that TERMINATES at `ceil(t/B)*B`.
 * Shifting the series by one native bar HERE, in one panel, would put price on a different
 * time convention from every other pane on this screen — which is the defect `D9`/`RF-5` (the
 * single master axis, fase `02`) exists to remove. The convention is one decision for the whole
 * route, `T-01.4` owns its ingestion half, and this mapping stays on the one every other series
 * of this page already uses until that decision lands.
 */
export function assembleOhlcCandles(rows: OhlcHistoryRows): OhlcCandleAssembly {
  const open = readingsByEventTime(rows.open, "OPEN");
  const high = readingsByEventTime(rows.high, "HIGH");
  const low = readingsByEventTime(rows.low, "LOW");
  const close = readingsByEventTime(rows.close, "CLOSE");
  const buckets = [...new Set([...open.keys(), ...high.keys(), ...low.keys(), ...close.keys()])].sort(
    (left, right) => left - right,
  );
  const candles: RawCandleShape[] = [];
  let partialBuckets = 0;
  for (const openTimeMs of buckets) {
    const readings = [open.get(openTimeMs), high.get(openTimeMs), low.get(openTimeMs), close.get(openTimeMs)];
    const [openValue, highValue, lowValue, closeValue] = readings;
    if (
      openValue === undefined ||
      highValue === undefined ||
      lowValue === undefined ||
      closeValue === undefined
    ) {
      partialBuckets += 1;
      continue;
    }
    candles.push({
      openTimeMs,
      open: openValue,
      high: highValue,
      low: lowValue,
      close: closeValue,
      volume: VOLUME_IS_ITS_OWN_SERIES,
    });
  }
  return { candles, partialBuckets };
}

/** How many slots of the price grid actually carry a candle — counted off the SAME
 * `GridSlot[]` the chart draws (`panels.price.series.slots`), never off the raw rows, so the
 * number the screen prints is the number of bars it plots. Sibling of `countPresentSlots`,
 * which does the same for a scalar pane. */
export function countPresentCandleSlots(slots: readonly CandleSlotShape[]): number {
  return slots.filter((slot) => slot.candle !== null).length;
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

/** One row's `value`, validated the same way for both branches of
 * `nonNegativeFlowSlotsFromHistoryRows` below — `null` for an absent row, the parsed number for
 * a present one, and a throw for anything malformed. Split out so the two branches cannot drift
 * on what counts as a valid flow value (`RN-1` is written ONCE, same discipline the function's
 * own docstring already states for the `volume`/`liquidation` merge). */
function parseNonNegativeFlowValue(row: SeriesHistoryRow): number | null {
  if (row.value === null) {
    return null;
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
  return parsed;
}

/**
 * Maps `/series-history` rows for a NON-NEGATIVE `FLOW` series into the `ScalarSlot[]` the
 * lossless lightweight adapter takes (`lineSeriesLossless`/`positiveValueSeriesLossless`).
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
 *
 * ── `CA-5a` FOLLOW-UP (`gates/FASE-02-qa.md`, achado bloqueante) — `window` IS OPTIONAL, AND
 * THAT IS THE WHOLE FIX ──────────────────────────────────────────────────────────────────────
 *
 * Without `window`, this function still returns ONE SLOT PER ROW, in wire order — unchanged from
 * before this fix, and every caller that never needed a grid guarantee (this file's own tests
 * that hand a short, hand-built row list not meant to span a whole window) keeps that exact
 * shape.
 *
 * WITH `window`, absent rows are dropped instead of turned into a `null` slot, the survivors
 * become `ScalarPoint`s, and the shared grid primitive `charts/s2-scalar-grid.ts::buildScalarSeries`
 * — the SAME one `buildOiPanel`/`buildCvdPanel` already call, not a second implementation
 * (`ADR-003` FR-2/FR-3) — aligns them onto `S2_AXIS_STEP_MS`. The result's LENGTH then depends
 * only on `window`, never on how many rows the wire happened to answer: `0` real rows still
 * produce a full, `null`-filled grid, exactly like `buildOiPanel`/`buildCvdPanel` already do for
 * `oi`/`cvd` when `/series-history` fails (`T-02.1`/`D-C3.2`). Before this fix, `long_short`'s and
 * `liquidation`'s "one slot per row" mapping meant an upstream `500` (`rows: []`) silently
 * collapsed those two panes to `0` slots while their four siblings stayed grid-padded at the
 * full window length — the SAME "index `i` means a different instant in different panels" hazard
 * `T-02.1` fixed for OI's `5m`-vs-`1m` step mismatch, now a COUNT mismatch instead of a STEP one.
 * `[symbol]/page.tsx`'s `long_short`/`liquidation` call sites pass `routeWindow.window` for
 * exactly this reason; the volume sub-axis call site for the DRAWN BARS does not (`SPEC-007
 * §3.6` — volume is not one of the six panes `CA-5a`'s one-grid invariant covers, `data-fact`
 * never publishes a `volume_slots` fact for it).
 *
 * ⛔ THAT EXEMPTION IS REVOKED FOR THE LEGEND (`W1-REVIEW-r2` BLOCKER-2). `T-01.7` made volume a
 * consumer of the pane legend, which `ADR-044/D2` resolves off `param.logical` over the CANONICAL
 * grid, so "index `i` means a different instant" is exactly the hazard above: on `4h` the native
 * vector has 24 slots and the legend read `ausente` in 24 of 24 crosshair positions
 * (`W1-QA-r2` §3). Both call sites now ALSO build `legendSlots` WITH the window; only the bars
 * keep the one-slot-per-row vector.
 */
export function nonNegativeFlowSlotsFromHistoryRows(
  rows: readonly SeriesHistoryRow[],
  window?: S2Window,
): readonly ScalarSlotShape[] {
  if (window === undefined) {
    return rows.map((row) => ({ time: row.event_time, value: parseNonNegativeFlowValue(row) }));
  }
  const points: ScalarPointShape[] = [];
  for (const row of rows) {
    const value = parseNonNegativeFlowValue(row);
    if (value !== null) {
      points.push({ timeMs: row.event_time, value });
    }
  }
  return buildScalarSeries(points, S2_AXIS_STEP_MS, window.startMs, window.endMsExclusive).slots;
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
 * `T-04.8` — the five numbers of `SeriesValueStats`, computed over the slots that carry a value.
 * `null` when none does: a window with no observation has no minimum, and inventing one (`0`, the
 * previous window's, the equilibrium of the metric) is the `RN-1` defect wearing a statistic's
 * costume.
 *
 * ⛔ THE MEDIAN IS NEAREST-RANK, and the choice is `M-1`'s, not taste: the interpolated median of
 * an even sample is a value the series never took, and the approved screen publishes the median as
 * a NUMBER OF THE SERIES (*"42,08% da mediana 1,6575"*). `Math.ceil(n/2) - 1` over the ascending
 * order is the p50 that is always an observation.
 *
 * Sorting a COPY (`[...]`), and comparing with `a - b` rather than the default lexicographic
 * comparator: `[1.1395, 1.8369, 1.495].sort()` answers `[1.1395, 1.495, 1.8369]` only by accident
 * of the decimal digits, and on this very series `[10, 9]` would sort to `[10, 9]`.
 *
 * ⚠️ THE UNIVERSE IS THE GRID SLOT, NOT THE NATIVE OBSERVATION, AND THAT IS DECLARED RATHER THAN
 * HIDDEN — it is the same `RN-S1` staircase this file counts twice for the pane's headline. A `5m`
 * series served on the `1m` grid repeats one observation across up to five slots, so the MEDIAN
 * computed here is weighted by how long each value stood (a time-weighted p50), not by how many
 * times it was published. `min`/`max`/`amplitude` are unaffected by weighting; only the median is.
 *
 * Two things keep that from being a silent distortion. First, the caller PUBLISHES the universe:
 * the pane prints `n = <presentSlots> grades legíveis` beside the numbers, so the reader is told
 * what was counted. Second, it was checked against the other weighting: over the same production
 * window the `design_gate` computed the median over `n=850` NATIVE observations and got `1.6575`,
 * and this function over `n=3.038` grid slots gets `1.6575` too `[MEDIDO 2026-09-16, GET /symbol
 * contra a API de produção; gate: gates/design-04.md §R2.2]`. Agreement is not a proof for every
 * window — it is evidence that the two weightings do not diverge on this series' shape, recorded
 * so the next reader can re-measure instead of re-deriving.
 */
export function seriesValueStats(slots: readonly ScalarSlotShape[]): SeriesValueStats | null {
  const values: number[] = [];
  for (const slot of slots) {
    if (slot.value !== null) {
      values.push(slot.value);
    }
  }
  if (values.length === 0) {
    return null;
  }
  values.sort((left, right) => left - right);
  const min = values[0]!;
  const max = values[values.length - 1]!;
  return {
    presentSlots: values.length,
    min,
    max,
    median: values[Math.ceil(values.length / 2) - 1]!,
    amplitude: max - min,
  };
}

/**
 * The slots at or after an instant — the TRAILING sub-window the approved screen puts a solid band
 * around (*"ÚLTIMAS 4 HORAS"*, `gates/design-04.md` §R2.2).
 *
 * ⛔ IT FILTERS, IT DOES NOT RE-GRID AND IT DOES NOT SHRINK TO FIT. The slots handed back are the
 * same objects, at the same instants, that the chart is drawn from; a sub-window computed over a
 * re-derived grid would be `M-2` of `gates/design-05.md` ("a janela declarada não é a janela
 * desenhada") reintroduced one pane later.
 *
 * `>=` is inclusive on the left because the caller's instant is itself a grid instant of the same
 * window (`windowEndMsInclusive - spanMs`), so excluding it would drop a real observation from a
 * span the screen then calls "4 h".
 */
export function slotsFrom(slots: readonly ScalarSlotShape[], sinceMs: number): readonly ScalarSlotShape[] {
  return slots.filter((slot) => slot.time >= sinceMs);
}

/**
 * How many slots at the RIGHT EDGE carry no value — the *"cauda ausente: 2 grades de 1m"* the
 * approved screen prints beside `SEM_PONTO` (`M-2`, `gates/design-04.md`).
 *
 * ⛔ IT IS THE MEASURE OF WHAT IS **NOT** DRAWN, and that is why it exists: for a `RATIO` series
 * the server refuses to carry a value forward (`CARRY_FORWARD_BY_NATURE[Nature.RATIO] = False`),
 * so the line simply STOPS. The approved design forbids any mark to the right of that stop, which
 * leaves the operator with a blank right edge and no way to tell "2 minutes of tail" from "2 days"
 * — unless the pane says the number. Absence stays absence AND gets counted.
 *
 * `0` here means the window's own last instant carries an observation; it never means "no data".
 */
export function trailingAbsentSlots(slots: readonly ScalarSlotShape[]): number {
  let count = 0;
  for (let index = slots.length - 1; index >= 0; index -= 1) {
    if (slots[index]!.value !== null) {
      break;
    }
    count += 1;
  }
  return count;
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

// ── `T-03.12` — the VISIBLE MARK `P-B`/`ADR-040/D3` requires on regime-A panels ─────────────
//
// Regime A (`plano 03` item `3.4`, literal): "Σ/max/min — viés unilateral serve parcial COM
// MARCA VISIVEL". The three FLOW/SUM panels this screen draws — `klines_volume`, `cvd_delta`,
// `sum_liquidation` (both cohorts) — are exactly the series `T-03.4`'s backend docstring names
// as needing the pair, because their reading is a SUM over the bucket's native facts: a bucket
// that answered fewer than `expected` still draws a number, and that number UNDERSTATES the
// true sum by construction (`81/240` example, `SUBESTIMA ~66,2%`). OI/price/long-short are
// regime B (carry-forward `STOCK`/`RATIO`) and are covered by `maxStalenessMs` already
// (`ADR-006`) — this module does not touch them.
//
// `row.coverage === null` (the DEGENERATE case, `series_history_report.py`'s own docstring: a
// native row, requested interval === series' own cadence) is never counted as partial NOR as
// full — it is simply not a reaggregated bucket, so it contributes to neither count below. A
// panel entirely on its native grid (e.g. `1m` klines_volume requested at `1m`) therefore shows
// `0/0` — no mark — honestly, rather than a false `0/N` that would read as "N buckets, all
// complete" when in truth none of them was ever a fraction of anything.

/** One panel's worth of the `{present, expected}` pairs, folded into the two counts the mark on
 * screen needs: how many reaggregated buckets are short of their own `expected`, out of how
 * many were reaggregated at all. */
export interface PartialCoverageSummary {
  readonly partialBuckets: number;
  readonly totalReaggregatedBuckets: number;
}

/** `true` exactly when this row's own pair says the bucket is short of the native facts it
 * claims to cover — the literal test `ADR-040/D3`'s regime A exists to make visible. */
export function isPartialCoverageRow(row: SeriesHistoryRow): boolean {
  return row.coverage !== null && row.coverage.present < row.coverage.expected;
}

/** Folds a panel's rows into `PartialCoverageSummary` — pure, no I/O, same tier as every other
 * function in this module (`ADR-003` FR-1). Order-independent: a caller may pass the FULL
 * window's rows or a sub-window (e.g. the trailing band `T-04.8` already carves out) and get
 * back the honest count for exactly the rows it passed. */
export function summarizePartialCoverage(rows: readonly SeriesHistoryRow[]): PartialCoverageSummary {
  let partialBuckets = 0;
  let totalReaggregatedBuckets = 0;
  for (const row of rows) {
    if (row.coverage !== null) {
      totalReaggregatedBuckets += 1;
      if (row.coverage.present < row.coverage.expected) {
        partialBuckets += 1;
      }
    }
  }
  return { partialBuckets, totalReaggregatedBuckets };
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

// ── `T-04.1`/`RN-5` — THE OI RÓTULO IS DERIVED FROM THE KEY, NEVER WRITTEN BY HAND ────────────
//
// The owner circled the defect in red (`plano 04` §"Por que esta fase existe"): the screen
// showed `108.135,34` under the unlabelled words "Open Interest (5m)" while the Coinalyze
// dashboard showed `27,656 B` for what read as the same fact. Both numbers are correct and
// measure different things — contracts in BTC on Binance USDT-M versus notional USD aggregated
// across exchanges, over a different counterparty cohort. A rótulo that does not spell WHICH of
// those it is on screen is why the two got compared in the first place.

/** The subset of `SeriesKey` `deriveOiProvenanceLabel` reads — declared structurally, the same
 * discipline `ProvenanceSourceEntry` above uses, so a test can build one without the other ten
 * terms of the full 15-term identity. */
export type OiProvenanceKey = Pick<SeriesKey, "unit" | "denom" | "provider" | "venue" | "cohort">;

/**
 * `RN-5` as a FUNCTION over the resolved catalog row, so the pane's rótulo is the key's own
 * terms, projected — never three strings a developer remembered to keep in sync with it. This is
 * what makes `CA-10`'s ablation true by construction: change the `SeriesKey` a test fixture (or
 * the real catalog) serves for OI and this value changes, with `SymbolClient.tsx` untouched.
 *
 * `undefined` (no OI entry resolved) answers `null` — there is no series to describe, and
 * inventing a label for one would be the same fabricated claim `resolveSeriesProvenance`'s
 * `unresolved` kind and `RNF-2`'s ceiling both refuse to make out of ignorance.
 *
 *   `grandeza`  `denom` names WHAT the number counts. `"base"` is a count of the instrument's
 *               own base asset — a CONTRACT count; `"quote"` is a value denominated in the quote
 *               asset — a NOTIONAL. `SPEC-001` §2.1 does not close `denom` to those two values,
 *               so a third one is printed as itself rather than guessed at: a future term this
 *               function does not recognise stays VISIBLE on screen instead of silently
 *               mislabelled as a contract count.
 *   `universo`  `provider`/`venue` — WHICH market the reading was aggregated over. A
 *               single-exchange series (`binance`/`usdm_futures`) and a cross-exchange aggregate
 *               are different universes even when `metric` and `unit` agree, which is exactly
 *               the owner's circled defect.
 *   `coorte`    `cohort`, transcribed verbatim — WHICH counterparty subset it covers. Never
 *               re-worded: `SPEC-001` owns what the term means, this function only reads it.
 */
export function deriveOiProvenanceLabel(key: OiProvenanceKey | undefined): OiProvenanceLabel | null {
  if (key === undefined) {
    return null;
  }
  const grandeza =
    key.denom === "base"
      ? `contracts (${key.unit})`
      : key.denom === "quote"
        ? `notional (${key.unit})`
        : `${key.denom} (${key.unit})`;
  return { grandeza, universo: `${key.provider}/${key.venue}`, coorte: key.cohort };
}

// ── `T-04.2`/`C-4` — THE ENVELOPE IS A CONTRACT, AND THE UNIT IT PINS IS VERIFIABLE ────────────
//
// `RF-8`'s label (above) already spells whatever `denom`/`unit` the resolved key carries — it
// does not GUESS. What it cannot do by itself is tell "the source still is what `ADR-036/D2`
// says" from "the source drifted and the label is dutifully reporting the drift". `C-4` (`PRD-008`
// §9) asks for the envelope to be its OWN contract, not a loose object a developer remembers to
// keep in sync — this is that contract, expressed as the four terms `SPEC-008` §8.1 fixes:
// `ADR-036/D2` keeps the OI pane on the ORIGIN (`provider = binance`), in CONTRACTS
// (`unit = BTC`, `denom = base`), over ONE instrument (`aggregationScope = Symbol`) — never
// nocional USD, which is exactly what the owner's circled defect was about: nocional = contracts
// × preço, so it rises with price alone, with zero new contracts — the one case the owner named
// (*"mercado caiu e open interest subiu"*) is the one nocional erases.
export const OPEN_INTEREST_ADR_036_D2_INVARIANTS = {
  provider: OPEN_INTEREST_PROVIDER,
  unit: "BTC",
  denom: "base",
  aggregationScope: "Symbol",
} as const;

/** The subset of `SeriesKey` the invariant check reads — declared structurally like
 * `OiProvenanceKey` above, so a test fixture does not have to carry the other eleven terms. */
export type OpenInterestOriginKey = Pick<SeriesKey, "provider" | "unit" | "denom" | "aggregationScope">;

/**
 * Which of the four `ADR-036/D2` terms the resolved OI key DOES NOT honor today — empty when it
 * honors all four. A pure comparison, nothing more: it does not choose a fallback, does not
 * convert a unit, does not pick a different row. Its only job is to turn a silent drift into a
 * named list a test (or, one day, a monitor) can morder on.
 *
 * ⛔ THIS IS THE "DECLARE, DO NOT BUILD" HALF OF `C-4`. `SeriesKey` already models
 * `provider`/`venue`/`aggregation_scope` (`series_key.py:52,197`), and every one of today's ~60
 * catalog rows already carries `aggregation_scope="Symbol"` — so a multi-exchange aggregate
 * (`F5`) is a NEW CATALOG ROW away, not a schema migration, the day the owner reopens `[M-2]`.
 * This function does not build that extensibility (`F5` is `[DECISÃO-OWNER: 2026-09-19]`,
 * explicitly out of this plan) — it only pins today's invariant so that if a future row silently
 * satisfied `matchesBinanceOpenInterest`'s three terms while disagreeing on unit/denom/scope, the
 * disagreement would be caught here, in a test, before it reached the pane as a mislabelled
 * number.
 */
export function openInterestAdr036D2Violations(key: OpenInterestOriginKey): readonly string[] {
  const violations: string[] = [];
  if (key.provider !== OPEN_INTEREST_ADR_036_D2_INVARIANTS.provider) {
    violations.push(`provider=${key.provider} (expected ${OPEN_INTEREST_ADR_036_D2_INVARIANTS.provider})`);
  }
  if (key.unit !== OPEN_INTEREST_ADR_036_D2_INVARIANTS.unit) {
    violations.push(`unit=${key.unit} (expected ${OPEN_INTEREST_ADR_036_D2_INVARIANTS.unit})`);
  }
  if (key.denom !== OPEN_INTEREST_ADR_036_D2_INVARIANTS.denom) {
    violations.push(`denom=${key.denom} (expected ${OPEN_INTEREST_ADR_036_D2_INVARIANTS.denom})`);
  }
  if (key.aggregationScope !== OPEN_INTEREST_ADR_036_D2_INVARIANTS.aggregationScope) {
    violations.push(
      `aggregationScope=${key.aggregationScope} (expected ${OPEN_INTEREST_ADR_036_D2_INVARIANTS.aggregationScope})`,
    );
  }
  return violations;
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
