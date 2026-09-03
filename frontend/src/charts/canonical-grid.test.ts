// Unit tests for the grid arithmetic itself (`canonical-grid.ts`). Small literal
// timestamps here are NOT a market-data claim — they pin the pure math (alignment, gap
// handling, rollup) the way `axis-fidelity.test.ts` pins its own comparison arithmetic
// before any chart is involved. The real-data claim (D5.9's sha256 equivalence) is proven
// separately, against real BTCUSDT candles, in `canonical-grid-sha256-proof.test.ts`.
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  aggregateCandles,
  alignCandlesToGrid,
  alignToTimeframeStart,
  buildCanonicalGrid,
} from "./canonical-grid.ts";
import type { RawCandle } from "./canonical-grid.ts";

test("alignToTimeframeStart floors to the epoch-aligned bucket", () => {
  assert.equal(alignToTimeframeStart(0, 60_000), 0);
  assert.equal(alignToTimeframeStart(59_999, 60_000), 0);
  assert.equal(alignToTimeframeStart(60_000, 60_000), 60_000);
  assert.equal(alignToTimeframeStart(125_000, 60_000), 120_000);
});

test("alignToTimeframeStart refuses a non-positive timeframe", () => {
  assert.throws(() => alignToTimeframeStart(0, 0), RangeError);
  assert.throws(() => alignToTimeframeStart(0, -1), RangeError);
});

test("buildCanonicalGrid produces a gapless, ordered, epoch-aligned sequence", () => {
  const grid = buildCanonicalGrid(0, 300_000, 60_000);
  assert.deepEqual(grid, [0, 60_000, 120_000, 180_000, 240_000]);
});

test("buildCanonicalGrid floors an unaligned start instead of rejecting it", () => {
  const grid = buildCanonicalGrid(30_000, 180_000, 60_000);
  assert.deepEqual(grid, [0, 60_000, 120_000]);
});

test("buildCanonicalGrid refuses an empty or inverted range", () => {
  assert.throws(() => buildCanonicalGrid(100, 100, 60_000), RangeError);
  assert.throws(() => buildCanonicalGrid(200, 100, 60_000), RangeError);
});

test("buildCanonicalGrid refuses a non-positive timeframe", () => {
  assert.throws(() => buildCanonicalGrid(0, 100, 0), RangeError);
});

function candle(openTimeMs: number, close: number): RawCandle {
  return { openTimeMs, open: close, high: close, low: close, close, volume: 1 };
}

test("alignCandlesToGrid fills only the slots data covers, leaving the rest null", () => {
  const grid = buildCanonicalGrid(0, 300_000, 60_000);
  const slots = alignCandlesToGrid([candle(0, 10), candle(180_000, 40)], grid);
  assert.deepEqual(
    slots.map((slot) => slot.time),
    grid,
  );
  assert.equal(slots[0].candle?.close, 10);
  assert.equal(slots[1].candle, null);
  assert.equal(slots[2].candle, null);
  assert.equal(slots[3].candle?.close, 40);
  assert.equal(slots[4].candle, null);
});

test("alignCandlesToGrid rejects a candle that does not land on a grid slot", () => {
  const grid = buildCanonicalGrid(0, 180_000, 60_000);
  assert.throws(() => alignCandlesToGrid([candle(30_000, 1)], grid), RangeError);
});

test("alignCandlesToGrid rejects a duplicate candle for the same slot", () => {
  const grid = buildCanonicalGrid(0, 180_000, 60_000);
  assert.throws(() => alignCandlesToGrid([candle(0, 1), candle(0, 2)], grid), RangeError);
});

test("aggregateCandles rolls up OHLCV with the standard convention", () => {
  const oneMinute: RawCandle[] = [
    { openTimeMs: 0, open: 100, high: 105, low: 99, close: 102, volume: 10 },
    { openTimeMs: 60_000, open: 102, high: 110, low: 101, close: 108, volume: 20 },
    { openTimeMs: 120_000, open: 108, high: 109, low: 95, close: 96, volume: 5 },
  ];
  const rolled = aggregateCandles(oneMinute, 60_000, 180_000);
  assert.equal(rolled.length, 1);
  assert.deepEqual(rolled[0], {
    openTimeMs: 0,
    open: 100,
    high: 110,
    low: 95,
    close: 96,
    volume: 35,
  });
});

test("aggregateCandles omits buckets with zero source candles, never fabricating one", () => {
  const oneMinute: RawCandle[] = [
    { openTimeMs: 0, open: 1, high: 1, low: 1, close: 1, volume: 1 },
    { openTimeMs: 240_000, open: 2, high: 2, low: 2, close: 2, volume: 1 },
  ];
  const rolled = aggregateCandles(oneMinute, 60_000, 180_000);
  assert.deepEqual(
    rolled.map((c) => c.openTimeMs),
    [0, 180_000],
  );
});

test("aggregateCandles refuses a target that is not an exact multiple of the source", () => {
  const oneMinute: RawCandle[] = [{ openTimeMs: 0, open: 1, high: 1, low: 1, close: 1, volume: 1 }];
  assert.throws(() => aggregateCandles(oneMinute, 60_000, 100_000), RangeError);
});

test("aggregateCandles refuses a non-positive timeframe on either side", () => {
  assert.throws(() => aggregateCandles([], 0, 60_000), RangeError);
  assert.throws(() => aggregateCandles([], 60_000, 0), RangeError);
});
