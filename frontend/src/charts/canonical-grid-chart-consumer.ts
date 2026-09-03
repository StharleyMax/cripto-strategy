/**
 * The CHART call-site of the canonical grid (`ADR-003` FR-3, `D5.9`).
 *
 * Shape: an ordered, gapless array of `GridSlot` covering `[rangeStartMs, rangeEndMsExclusive)`
 * at `timeframeMs` — exactly what a rendering layer walks left-to-right to place bars, one
 * canonical slot per pixel column's worth of time, `candle: null` standing for an explicit
 * gap (never interpolated; see `canonical-grid.ts`'s module docstring for why).
 *
 * This module does NOT render anything (`T-05.2` builds the actual chart; out of scope
 * here) and does NOT do I/O (`ADR-003` FR-1) — it is the thinnest adapter between the two
 * shared functions and the shape a renderer needs, so that the renderer never has to call
 * `buildCanonicalGrid`/`alignCandlesToGrid` itself and never gets a chance to bucket
 * differently than `canonical-grid-accessor-consumer.ts` does.
 */

import { alignCandlesToGrid, buildCanonicalGrid } from "./canonical-grid.ts";
import type { GridSlot, RawCandle } from "./canonical-grid.ts";

export interface ChartSeries {
  readonly timeframeMs: number;
  readonly rangeStartMs: number;
  readonly rangeEndMsExclusive: number;
  /** Ordered left-to-right, one entry per canonical slot. */
  readonly slots: readonly GridSlot[];
}

export function buildChartSeries(
  candles: readonly RawCandle[],
  timeframeMs: number,
  rangeStartMs: number,
  rangeEndMsExclusive: number,
): ChartSeries {
  const grid = buildCanonicalGrid(rangeStartMs, rangeEndMsExclusive, timeframeMs);
  return {
    timeframeMs,
    rangeStartMs,
    rangeEndMsExclusive,
    slots: alignCandlesToGrid(candles, grid),
  };
}
