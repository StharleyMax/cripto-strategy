/**
 * `T-01.10` (`ADR-044/D2′`, `handoff/T-01.10-desenho.md` §4 row F-E) — the pure halves of the sparse
 * feed: `plotItemsOnly` keeps order and only plot items, with times ⊆ input; `gridCarrierItems`
 * gives exactly one `{time}` per slot of the axis, in the adapters' seconds.
 *
 * The pixel half (the carrier + plot items draw the same bytes as the lossless feed) is a real
 * browser's: `e2e/25-sparse-feed-pixel-identity.spec.ts`.
 *
 * Run with: npm --prefix frontend run test:charts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  absenceMarkSeries,
  candlestickSeriesLossless,
  lineSeriesLossless,
  positiveValueSeriesLossless,
  zeroMarkSeries,
} from "./s2-lightweight-adapter.ts";
import type { GridSlot } from "./canonical-grid.ts";
import type { ScalarSlot } from "./s2-scalar-grid.ts";
import { gridCarrierItems, isPlotItem, plotItemsOnly } from "./sparse-series-feed.ts";

const T0_MS = 1_700_000_040_000;
const STEP_MS = 60_000;
const SLOT_COUNT = 12;
// present 0-3, gap 4-6, isolated 7, gap 8, zeros at 9 and 10, present 11
const VALUES: readonly (number | null)[] = [5, 6, 7, 8, null, null, null, 9, null, 0, 0, 4];

function scalarSlots(): readonly ScalarSlot[] {
  return VALUES.map((value, index) => ({ time: T0_MS + index * STEP_MS, value }));
}

function gridSlots(): readonly GridSlot[] {
  return VALUES.map((value, index) => {
    const time = T0_MS + index * STEP_MS;
    return {
      time,
      candle:
        value === null
          ? null
          : { openTimeMs: time, open: value, high: value + 2, low: value - 1, close: value + 1, volume: 1 },
    };
  });
}

test("plotItemsOnly keeps every plot item, in order, as the SAME object, and drops every whitespace item", () => {
  const lossless = lineSeriesLossless(scalarSlots());
  const sparse = plotItemsOnly(lossless);
  const expected = lossless.filter((item) => "value" in item);
  assert.equal(sparse.length, expected.length);
  assert.equal(sparse.length, 8); // 12 slots, 4 of them null (4-6 and 8)
  sparse.forEach((item, index) => assert.equal(item, expected[index]));
  for (let index = 1; index < sparse.length; index += 1) {
    assert.ok(sparse[index]!.time > sparse[index - 1]!.time, "order broken");
  }
});

test("D2′(b): the times plotItemsOnly returns are a SUBSET of the input's, for every adapter", () => {
  const scalar = scalarSlots();
  const feeds = [
    candlestickSeriesLossless(gridSlots()),
    lineSeriesLossless(scalar),
    positiveValueSeriesLossless(scalar),
    absenceMarkSeries(scalar, 6),
    zeroMarkSeries(scalar, 6),
  ];
  for (const lossless of feeds) {
    const inputTimes = new Set(lossless.map((item) => item.time));
    const sparse = plotItemsOnly(lossless);
    assert.ok(sparse.every((item) => inputTimes.has(item.time)), "a time off the input grid");
    assert.ok(sparse.every(isPlotItem), "a whitespace item survived");
    assert.equal(sparse.length, lossless.filter(isPlotItem).length);
  }
});

test("isPlotItem mirrors the library's isWhitespaceData: a blank iff open AND value are undefined", () => {
  assert.equal(isPlotItem({ time: 1 }), false);
  assert.equal(isPlotItem({ time: 1, value: 0 }), true, "a legitimate 0 is a plot item");
  assert.equal(isPlotItem({ time: 1, open: 0 }), true);
});

test("gridCarrierItems: exactly slotCount {time} items, one per grid slot, in the adapters' seconds", () => {
  const axis = { startMs: T0_MS, stepMs: STEP_MS, slotCount: SLOT_COUNT };
  const carrier = gridCarrierItems(axis);
  assert.equal(carrier.length, SLOT_COUNT);
  assert.ok(carrier.every((item) => Object.keys(item).length === 1 && !isPlotItem(item)), "carrier item is not bare {time}");
  // The pane series and the carrier speak the same seconds: the lossless times ARE the carrier's.
  assert.deepEqual(
    carrier.map((item) => item.time),
    lineSeriesLossless(scalarSlots()).map((item) => item.time),
  );
});

test("MORDE: feeding the carrier through plotItemsOnly leaves NO grid at all — the gaps would collapse", () => {
  const carrier = gridCarrierItems({ startMs: T0_MS, stepMs: STEP_MS, slotCount: SLOT_COUNT });
  assert.equal(plotItemsOnly(carrier).length, 0);
});

test("gridCarrierItems refuses a grid that is not whole seconds (the adapters' own RangeError)", () => {
  assert.throws(() => gridCarrierItems({ startMs: T0_MS + 1, stepMs: STEP_MS, slotCount: 2 }), RangeError);
});
