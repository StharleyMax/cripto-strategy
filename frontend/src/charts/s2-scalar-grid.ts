/**
 * Grid alignment for SCALAR time series (one number per bucket) — OI and CVD in `T-05.2`.
 *
 * `canonical-grid.ts`'s `alignCandlesToGrid` is shaped for OHLCV bars only (`RawCandle`).
 * OI (`sum_open_interest`) and CVD (`cvd_delta`/`cvd_cum`) are single-value series, not
 * candles, so they need a sibling alignment function — NOT a second implementation of the
 * bucket boundaries. This module is built ONLY on `buildCanonicalGrid` (imported from
 * `./canonical-grid.ts`, never reimplemented), the same discipline `aggregateCandles`
 * already follows inside `canonical-grid.ts` itself for its own rollup case (see that
 * file's docstring on `ADR-003` FR-3's "nunca reimplementa" read literally).
 *
 * Same no-interpolation posture as `GridSlot`: a canonical instant with no source point
 * gets `value: null` — an explicit, never-fabricated gap.
 */

import { buildCanonicalGrid } from "./canonical-grid.ts";

/** One scalar sample, keyed by its own bucket-start instant. */
export interface ScalarPoint {
  /** Epoch milliseconds UTC — the bucket-start instant this value belongs to. */
  readonly timeMs: number;
  readonly value: number;
}

/** One canonical slot for a scalar series: the grid says a bucket exists whether or not data does. */
export interface ScalarSlot {
  readonly time: number;
  /** `null` = the grid has a slot here and no source point filled it (an explicit gap). */
  readonly value: number | null;
}

/**
 * Places `points` onto `grid`, one `ScalarSlot` per grid instant, in grid order.
 *
 * Mirrors `alignCandlesToGrid`'s contract exactly: a point whose `timeMs` does not land on
 * a grid instant is a caller error (rejected, never snapped), and a duplicate point for the
 * same slot is a caller error too — both for the same reason `alignCandlesToGrid` states:
 * silently accepting either would let mismatched data produce a plausible, wrong grid.
 */
export function alignScalarPointsToGrid(
  points: readonly ScalarPoint[],
  grid: readonly number[],
): readonly ScalarSlot[] {
  const gridTimes = new Set(grid);
  const byTime = new Map<number, number>();
  for (const point of points) {
    if (!gridTimes.has(point.timeMs)) {
      throw new RangeError(
        `point timeMs ${point.timeMs} does not land on a grid slot — the point was not ` +
          `built at the timeframe this grid was built for`,
      );
    }
    if (byTime.has(point.timeMs)) {
      throw new RangeError(`duplicate point for grid slot ${point.timeMs}`);
    }
    byTime.set(point.timeMs, point.value);
  }
  return grid.map((time) => ({ time, value: byTime.get(time) ?? null }));
}

/** Convenience: build the grid and align in one call, mirroring `buildChartSeries`'s shape. */
export function buildScalarSeries(
  points: readonly ScalarPoint[],
  timeframeMs: number,
  rangeStartMs: number,
  rangeEndMsExclusive: number,
): { timeframeMs: number; rangeStartMs: number; rangeEndMsExclusive: number; slots: readonly ScalarSlot[] } {
  const grid = buildCanonicalGrid(rangeStartMs, rangeEndMsExclusive, timeframeMs);
  return {
    timeframeMs,
    rangeStartMs,
    rangeEndMsExclusive,
    slots: alignScalarPointsToGrid(points, grid),
  };
}
