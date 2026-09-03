// Unit tests for the GridSlot/ScalarSlot -> lightweight-charts shape mapping.
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { test } from "node:test";
import { candlestickSeriesLossless, lineSeriesLossless, naiveDropGapsLine } from "./s2-lightweight-adapter.ts";
import type { GridSlot } from "./canonical-grid.ts";
import type { ScalarSlot } from "./s2-scalar-grid.ts";

test("candlestickSeriesLossless emits one item per slot, whitespace for gaps, seconds not ms", () => {
  const slots: readonly GridSlot[] = [
    { time: 60_000, candle: { openTimeMs: 60_000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 } },
    { time: 120_000, candle: null },
  ];
  const items = candlestickSeriesLossless(slots);
  assert.deepEqual(items[0], { time: 60, open: 1, high: 2, low: 0.5, close: 1.5 });
  assert.deepEqual(items[1], { time: 120 });
  assert.equal(Object.keys(items[1]).length, 1, "the gap item must carry ONLY time — no OHLC key at all");
});

test("lineSeriesLossless mirrors the same contract for scalar slots", () => {
  const slots: readonly ScalarSlot[] = [
    { time: 0, value: 42 },
    { time: 300_000, value: null },
  ];
  const items = lineSeriesLossless(slots);
  assert.deepEqual(items[0], { time: 0, value: 42 });
  assert.deepEqual(items[1], { time: 300 });
});

test("toUnixSeconds refuses a time that is not a whole number of seconds", () => {
  const slots: readonly ScalarSlot[] = [{ time: 1500, value: 1 }];
  assert.throws(() => lineSeriesLossless(slots), RangeError);
});

test("naiveDropGapsLine (the negative control) actually drops gap slots instead of marking them", () => {
  const slots: readonly ScalarSlot[] = [
    { time: 0, value: 1 },
    { time: 300_000, value: null },
    { time: 600_000, value: 2 },
  ];
  const items = naiveDropGapsLine(slots);
  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((item) => item.time),
    [0, 600],
  );
});
