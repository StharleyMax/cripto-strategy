/**
 * `T-05.2` — the DYNAMIC half of what `[symbol]/page.tsx` computes: everything about the six
 * panes that changes when the ROWS change (the window widens, `D-C3.5`'s paginator merges in a
 * new page). Extracted so `SymbolClient.tsx`'s client-side paginator can rebuild the exact same
 * shapes `page.tsx` builds at SSR time, from the SAME sequence of pure calls into
 * `view-model.ts`/`charts` — never a second copy of a RULE (`RN-1`, `RN-S1`, the `{present,
 * expected}` pair, …), only a second, independent CALL SITE for the same orchestration, which is
 * what `nonNegativeFlowSlotsFromHistoryRows` already serves two callers (volume, liquidation) for
 * inside `view-model.ts` itself.
 *
 * ⛔ `page.tsx`'S OWN DERIVATION IS DELIBERATELY LEFT UNTOUCHED, byte for byte — this module does
 * NOT replace it and `page.tsx` does NOT import this module. Several `*-dom-contract.test.ts`
 * files (`price-pane-dom-contract.test.ts`, `oi-pane-dom-contract.test.ts`, …) scan `page.tsx`'s
 * own SOURCE TEXT for the exact expressions this task would otherwise move out of it
 * (`price-pane-dom-contract.test.ts`'s own docstring: "WHY A SOURCE SCAN AND NOT A RENDER"). This
 * module reproduces the SAME sequence of calls as a second, independent call site instead — the
 * duplication that exists is of ORCHESTRATION (which function to call, in which order), never of
 * a RULE, and every rule stays owned by exactly one function in `view-model.ts`/`charts`.
 *
 * STATIC facts a series' CATALOG ENTRY carries (`provenance`, `unit`, `maxStalenessMs`,
 * `nativeInterval`, `nativeGrid`) are OUT of this module's scope on purpose: they are properties
 * of the SERIES ITSELF, not of the window, so they never change across a history page and
 * `SymbolClient.tsx`'s paginator keeps them frozen at their SSR-resolved values (see its own
 * docstring on `HistoryPagingSeed` for the full list and the reasoning). This module returns only
 * what genuinely depends on `rows`/`window`.
 */

import { buildS2Panels, FIVE_MINUTES_MS, type S2Panels, type S2RawInputs } from "../../charts/index.ts";
import type { FlowReading } from "../../charts/index.ts";

/** `PriceUse` itself is not re-exported by the `charts` barrel (`ADR-034/D8`: `web` reaches
 * `charts` through ONE sanctioned barrel, never a deep import of `s2-price-source.ts`) — this
 * indexed-access type reads the SAME type off `S2RawInputs`, which IS exported, the same
 * technique `view-model.ts`'s own `ScalarSlotShape`/`RawCandleShape` already use against
 * `S2Panels`. */
type PriceUse = S2RawInputs["priceUse"];
import type { FreshnessVerdict, SeriesValueStats } from "./panel-status.ts";
import type { SeriesHistoryRow } from "./series-history-envelope.ts";
import {
  assembleOhlcCandles,
  countNativeBarsByPublication,
  countPresentCandleSlots,
  countPresentSlots,
  countZeroSlots,
  firstPresentSlotMs,
  lastPresentSlotMs,
  lastReadableAvailableAtMs,
  nonNegativeFlowSlotsFromHistoryRows,
  resolveFlowReadingOrAbsent,
  resolveFreshnessVerdict,
  scalarPointsFromHistoryRows,
  scaledCvdDeltasFromHistoryRows,
  seriesValueStats,
  slotsFrom,
  summarizePartialCoverage,
  trailingAbsentSlots as trailingAbsentSlotsOf,
} from "./view-model.ts";

/** The ten row arrays a page (initial OR paginated) carries — one per `/series-history` fetch
 * `[symbol]/page.tsx` already makes (`T-01.8`'s four OHLC reductions, OI, CVD, volume, the two
 * liquidation cohorts, long/short). Mirrors `page.tsx`'s own local variable names exactly, so a
 * reader translating between the two files does not have to guess the correspondence. */
export interface HistoryRowsBundle {
  readonly open: readonly SeriesHistoryRow[];
  readonly high: readonly SeriesHistoryRow[];
  readonly low: readonly SeriesHistoryRow[];
  readonly close: readonly SeriesHistoryRow[];
  readonly oi: readonly SeriesHistoryRow[];
  readonly cvd: readonly SeriesHistoryRow[];
  readonly volume: readonly SeriesHistoryRow[];
  readonly liquidationLong: readonly SeriesHistoryRow[];
  readonly liquidationShort: readonly SeriesHistoryRow[];
  readonly longShort: readonly SeriesHistoryRow[];
}

/** A half-open window, epoch ms — `S2Window` minus `.days` (`history-page-window.ts`'s own
 * `AccumulatedWindow`, reused here so the two modules agree on one window shape). */
export interface AssemblyWindow {
  readonly startMs: number;
  readonly endMsExclusive: number;
}

export interface AssemblyStaticContext {
  readonly priceUse: PriceUse;
  /** Where the CVD cumulative curve counts from — kept FIXED across every page
   * (`SymbolClient.tsx`'s own docstring on why the anchor never moves once chosen). */
  readonly cvdAnchorMs: number;
  /** The right edge of the ORIGINAL request — invariant under backward paging (only the LEFT
   * edge ever moves, `D-C3.5`), so every "age"/"freshness"/"reading at the window's last
   * instant" computation below reads the SAME instant `page.tsx` computed it against. */
  readonly windowEndMsInclusive: number;
  readonly longShortRecentSpanMs: number;
  /** The OI catalog entry's OWN `max_staleness_ms` (`RNF-2`'s ceiling) — a property of the
   * SERIES, frozen from the initial SSR resolution, never re-derived here (this module reads no
   * catalog). `null` when the initial render resolved no OI entry at all. */
  readonly oiMaxStalenessMs: number | null;
}

export interface DynamicPriceFacts {
  readonly drawnCandles: number;
  readonly gridSlots: number;
  readonly partialBuckets: number;
}

export interface DynamicVolumeFacts {
  readonly slots: S2Panels["oi"]["slots"];
  /** The same rows on the canonical 1-minute grid — what the legend reads (`ADR-044/D2`). */
  readonly legendSlots: S2Panels["oi"]["slots"];
  readonly presentPoints: number;
  readonly firstPresentMs: number | null;
  readonly reading: FlowReading;
  readonly partialCoverage: ReturnType<typeof summarizePartialCoverage>;
}

export interface DynamicCvdFacts {
  readonly presentPoints: number;
  readonly firstPresentMs: number | null;
  readonly partialCoverage: ReturnType<typeof summarizePartialCoverage>;
}

export interface DynamicOiFacts {
  readonly nativeBars: number;
  readonly wirePoints: number;
  readonly firstPresentMs: number | null;
  readonly lastPresentMs: number | null;
  readonly freshness: FreshnessVerdict;
}

export interface DynamicLiquidationCohortFacts {
  readonly slots: S2Panels["oi"]["slots"];
  readonly presentPoints: number;
  readonly zeroPoints: number;
  readonly firstPresentMs: number | null;
  readonly reading: FlowReading;
  readonly partialCoverage: ReturnType<typeof summarizePartialCoverage>;
}

export interface DynamicLongShortFacts {
  readonly slots: S2Panels["oi"]["slots"];
  readonly nativeBars: number;
  readonly wirePoints: number;
  readonly firstPresentMs: number | null;
  readonly lastPresentMs: number | null;
  readonly observedAtMs: number | null;
  readonly ageMs: number | null;
  readonly trailingAbsentSlots: number;
  readonly windowStats: SeriesValueStats | null;
  readonly recentStats: SeriesValueStats | null;
  readonly reading: FlowReading;
}

export interface HistoryPageAssembly {
  readonly panels: S2Panels;
  readonly priceCandles: DynamicPriceFacts;
  readonly volume: DynamicVolumeFacts;
  readonly cvd: DynamicCvdFacts;
  readonly oi: DynamicOiFacts;
  readonly liquidationLong: DynamicLiquidationCohortFacts;
  readonly liquidationShort: DynamicLiquidationCohortFacts;
  readonly longShort: DynamicLongShortFacts;
}

/**
 * The ONE function `SymbolClient.tsx`'s paginator calls after every page fetch (and that
 * `use-history-pager.ts`'s own tests exercise directly, without a DOM) — same sequence of calls
 * `page.tsx` makes at SSR time (lines ~554-855 there, at the time of `T-05.2`), reproduced as a
 * second, independent call site rather than imported, for the reason this module's own docstring
 * states.
 */
export function assembleHistoryPage(
  rows: HistoryRowsBundle,
  window: AssemblyWindow,
  context: AssemblyStaticContext,
): HistoryPageAssembly {
  const s2Window = { startMs: window.startMs, endMsExclusive: window.endMsExclusive, days: [] };

  const candleAssembly = assembleOhlcCandles({
    open: rows.open,
    high: rows.high,
    low: rows.low,
    close: rows.close,
  });

  const panels: S2Panels = buildS2Panels({
    window: s2Window,
    candles: candleAssembly.candles,
    priceUse: context.priceUse,
    oiPoints: scalarPointsFromHistoryRows(rows.oi, FIVE_MINUTES_MS),
    oiMissingDays: [],
    cvdDeltas: scaledCvdDeltasFromHistoryRows(rows.cvd),
    cvdMissingDays: [],
    cvdCoveredDays: [],
    cvdAnchorMs: context.cvdAnchorMs,
  });

  const priceCandles: DynamicPriceFacts = {
    drawnCandles: countPresentCandleSlots(panels.price.series.slots),
    gridSlots: panels.price.series.slots.length,
    partialBuckets: candleAssembly.partialBuckets,
  };

  // Volume: NO window argument, same choice `page.tsx` makes — "one slot per row, in wire
  // order" (`view-model.ts::nonNegativeFlowSlotsFromHistoryRows`'s own docstring), because the
  // wire itself already answers one row per 1-minute grid instant of whatever window was asked
  // for, and volume is not one of the six panes `CA-5a`'s cross-panel grid invariant covers.
  //
  // ⛔ THAT PREMISE HOLDS FOR THE DRAWN BARS ONLY, NOT FOR THE LEGEND (`W1-REVIEW-r2` BLOCKER-2,
  // `W1-QA-r2` BLOCKER-1). On a TF ≠ `1m` the wire answers one row per TF bucket (24 rows over a
  // `4h` window), so "slot `i`" of the native vector is NOT logical index `i`, and the legend —
  // which `ADR-044/D2` resolves off `param.logical` over the CANONICAL grid — read `ausente` in
  // every position. `legendSlots` is the SAME rows aligned onto the window's 1-minute grid (the
  // shared primitive, like liquidation and long/short below); the bars keep the native vector,
  // so their pixels, `presentPoints` and `firstPresentMs` do not move.
  const volumeSlots = nonNegativeFlowSlotsFromHistoryRows(rows.volume);
  const volume: DynamicVolumeFacts = {
    slots: volumeSlots,
    legendSlots: nonNegativeFlowSlotsFromHistoryRows(rows.volume, s2Window),
    presentPoints: countPresentSlots(volumeSlots),
    firstPresentMs: firstPresentSlotMs(volumeSlots),
    reading: resolveFlowReadingOrAbsent(volumeSlots, context.windowEndMsInclusive),
    partialCoverage: summarizePartialCoverage(rows.volume),
  };

  const cvdDeltaSlots = panels.cvd.deltaSlots;
  const cvd: DynamicCvdFacts = {
    presentPoints: countPresentSlots(cvdDeltaSlots),
    firstPresentMs: firstPresentSlotMs(cvdDeltaSlots),
    partialCoverage: summarizePartialCoverage(rows.cvd),
  };

  const oiGridSlots = panels.oi.slots;
  const oi: DynamicOiFacts = {
    nativeBars: countPresentSlots(oiGridSlots),
    wirePoints: rows.oi.filter((row) => row.value !== null).length,
    firstPresentMs: firstPresentSlotMs(oiGridSlots),
    lastPresentMs: lastPresentSlotMs(oiGridSlots),
    freshness: resolveFreshnessVerdict(rows.oi, context.windowEndMsInclusive, context.oiMaxStalenessMs),
  };

  // Liquidation/long-short: WITH `window` — same choice `page.tsx` makes, so a series whose page
  // fetch degrades to `[]` still comes back grid-padded to the SAME length as its five siblings
  // (`CA-5a`), rather than silently shrinking relative to them.
  const liquidationCohort = (rows_: readonly SeriesHistoryRow[]): DynamicLiquidationCohortFacts => {
    const slots = nonNegativeFlowSlotsFromHistoryRows(rows_, s2Window);
    return {
      slots,
      presentPoints: countPresentSlots(slots),
      zeroPoints: countZeroSlots(slots),
      firstPresentMs: firstPresentSlotMs(slots),
      reading: resolveFlowReadingOrAbsent(slots, context.windowEndMsInclusive),
      partialCoverage: summarizePartialCoverage(rows_),
    };
  };
  const liquidationLong = liquidationCohort(rows.liquidationLong);
  const liquidationShort = liquidationCohort(rows.liquidationShort);

  const longShortSlots = nonNegativeFlowSlotsFromHistoryRows(rows.longShort, s2Window);
  const longShortObservedAtMs = lastReadableAvailableAtMs(rows.longShort);
  const longShort: DynamicLongShortFacts = {
    slots: longShortSlots,
    nativeBars: countNativeBarsByPublication(rows.longShort),
    wirePoints: countPresentSlots(longShortSlots),
    firstPresentMs: firstPresentSlotMs(longShortSlots),
    lastPresentMs: lastPresentSlotMs(longShortSlots),
    observedAtMs: longShortObservedAtMs,
    ageMs: longShortObservedAtMs === null ? null : context.windowEndMsInclusive - longShortObservedAtMs,
    trailingAbsentSlots: trailingAbsentSlotsOf(longShortSlots),
    windowStats: seriesValueStats(longShortSlots),
    recentStats: seriesValueStats(slotsFrom(longShortSlots, context.windowEndMsInclusive - context.longShortRecentSpanMs)),
    reading: resolveFlowReadingOrAbsent(longShortSlots, context.windowEndMsInclusive),
  };

  return { panels, priceCandles, volume, cvd, oi, liquidationLong, liquidationShort, longShort };
}
