/**
 * The ACCESSOR call-site of the canonical grid (`ADR-003` FR-3, `D5.9`) — a stand-in for
 * the future `backtest` engine consumer `ADR-003` names ("o motor de backtest a importa,
 * nunca reimplementa"). No such engine exists in this repository yet: the Python backend is
 * out of scope for `T-05.1` (`backend/` is read-only here), and a browser-side paper-trading
 * replay is later `backtest`-component work this task does not build. This module exists
 * to be the SECOND real call site `D5.9`'s falsifier requires — an index-addressable bar
 * accessor, the shape a backtest replay loop wants (`barAt(i)` / `indexAt(t)`), instead of
 * the paint-order array `canonical-grid-chart-consumer.ts` returns.
 *
 * Built on the exact same two functions the chart consumer uses, and nothing else — that
 * sameness is the property `D5.9` measures: `canonical-grid-sha256-proof.test.ts` extracts
 * the `slots` from both consumers over identical inputs and asserts their `sha256` is equal
 * bit for bit, over 4 days × 1 symbol × 3 timeframes of real `BTCUSDT` data.
 */

import { alignCandlesToGrid, buildCanonicalGrid } from "./canonical-grid.ts";
import type { GridSlot, RawCandle } from "./canonical-grid.ts";

export interface BarAccessor {
  readonly timeframeMs: number;
  readonly rangeStartMs: number;
  readonly rangeEndMsExclusive: number;
  /** Same canonical slots the chart consumer produces, exposed for the `sha256` proof. */
  readonly slots: readonly GridSlot[];
  /** Throws `RangeError` for an out-of-range index — a replay loop never silently wraps. */
  barAt(index: number): GridSlot;
  /** `-1` when `timeMs` is not a slot on this grid — never a nearest-match guess. */
  indexAt(timeMs: number): number;
}

export function buildBarAccessor(
  candles: readonly RawCandle[],
  timeframeMs: number,
  rangeStartMs: number,
  rangeEndMsExclusive: number,
): BarAccessor {
  const grid = buildCanonicalGrid(rangeStartMs, rangeEndMsExclusive, timeframeMs);
  const slots = alignCandlesToGrid(candles, grid);
  const indexByTime = new Map(slots.map((slot, index) => [slot.time, index]));

  return {
    timeframeMs,
    rangeStartMs,
    rangeEndMsExclusive,
    slots,
    barAt(index: number): GridSlot {
      const slot = slots[index];
      if (slot === undefined) {
        throw new RangeError(`bar index ${index} is out of range: grid has ${slots.length} slots`);
      }
      return slot;
    },
    indexAt(timeMs: number): number {
      return indexByTime.get(timeMs) ?? -1;
    },
  };
}
