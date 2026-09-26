// `paineis-de-fluxo` `T-02.1` — the volume bar's color from the candle at the same instant.
//
// DoD (plan `02` item 1): four cases — rise, fall, doji, absent candle. MORDE: flipping the
// comparator (`>=` -> `<`) in `volumeBarColor` fails 3 of the 4 (rise, fall and doji; the
// absent case never reaches the comparator). The expected inks are read from `colorTokens()`
// AND pinned to the hex of `ADR-010`, so a test cannot pass by agreeing with a wrong palette.
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { test } from "node:test";

import { colorTokens } from "./color-tokens.ts";
import type { GridSlot } from "./canonical-grid.ts";
import type { ScalarSlot } from "./s2-scalar-grid.ts";
import { directionalVolumeSeriesLossless, volumeBarColor } from "./volume-direction.ts";

const UP = colorTokens().directionUpFill;
const DOWN = colorTokens().directionDownFill;
const NEUTRAL = colorTokens().provenanceWeak;

test("the three inks are the price candle's two direction tokens plus today's neutral volume ink", () => {
  assert.equal(UP, "#089981");
  assert.equal(DOWN, "#f23645");
  assert.equal(NEUTRAL, "#8b949e");
});

// ── The four DoD cases ────────────────────────────────────────────────────────────────────

test("DoD case 1 — rise (close > open) paints the bar with the up token", () => {
  assert.equal(volumeBarColor({ open: 100, close: 101 }), UP);
});

test("DoD case 2 — fall (close < open) paints the bar with the down token", () => {
  assert.equal(volumeBarColor({ open: 101, close: 100 }), DOWN);
});

test("DoD case 3 — doji (close === open) paints the bar with the up token [INFERRED: I-3]", () => {
  assert.equal(volumeBarColor({ open: 100, close: 100 }), UP);
});

test("DoD case 4 — absent candle gets no direction ink, only the neutral one", () => {
  const color = volumeBarColor(null);
  assert.equal(color, NEUTRAL);
  assert.notEqual(color, UP);
  assert.notEqual(color, DOWN);
});

// ── The pairing (plan item 2.2): by instant, not by array position ────────────────────────

const T0 = Date.UTC(2026, 8, 26, 0, 0, 0);
const MIN = 60_000;

function candle(time: number, open: number, close: number): GridSlot {
  return {
    time,
    candle: { openTimeMs: time, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 1 },
  };
}

test("each bar takes the direction of the candle at the SAME time; absent candle stays neutral", () => {
  const price: GridSlot[] = [
    candle(T0, 10, 11),
    candle(T0 + MIN, 11, 10),
    candle(T0 + 2 * MIN, 10, 10),
    { time: T0 + 3 * MIN, candle: null },
  ];
  const volume: ScalarSlot[] = [
    { time: T0, value: 5 },
    { time: T0 + MIN, value: 6 },
    { time: T0 + 2 * MIN, value: 7 },
    { time: T0 + 3 * MIN, value: 8 },
  ];
  assert.deepEqual(directionalVolumeSeriesLossless(volume, price), [
    { time: T0 / 1000, value: 5, color: UP },
    { time: (T0 + MIN) / 1000, value: 6, color: DOWN },
    { time: (T0 + 2 * MIN) / 1000, value: 7, color: UP },
    { time: (T0 + 3 * MIN) / 1000, value: 8, color: NEUTRAL },
  ]);
});

test("a volume slot with no price slot at its time is neutral — never a neighbour's direction", () => {
  // Price grid shorter and offset: position 0 of volume is NOT the instant of position 0 of price.
  const price: GridSlot[] = [candle(T0 + MIN, 11, 10)];
  const volume: ScalarSlot[] = [
    { time: T0, value: 5 },
    { time: T0 + MIN, value: 6 },
  ];
  const items = directionalVolumeSeriesLossless(volume, price);
  assert.deepEqual(items, [
    { time: T0 / 1000, value: 5, color: NEUTRAL },
    { time: (T0 + MIN) / 1000, value: 6, color: DOWN },
  ]);
});

test("absent and zero volume stay whitespace (their own marks draw them), lossless in length", () => {
  const price: GridSlot[] = [candle(T0, 10, 11), candle(T0 + MIN, 10, 11)];
  const volume: ScalarSlot[] = [
    { time: T0, value: null },
    { time: T0 + MIN, value: 0 },
  ];
  assert.deepEqual(directionalVolumeSeriesLossless(volume, price), [
    { time: T0 / 1000 },
    { time: (T0 + MIN) / 1000 },
  ]);
});

test("a negative volume and a duplicated candle instant both throw instead of guessing", () => {
  assert.throws(
    () => directionalVolumeSeriesLossless([{ time: T0, value: -1 }], [candle(T0, 1, 2)]),
    RangeError,
  );
  assert.throws(
    () => directionalVolumeSeriesLossless([{ time: T0, value: 1 }], [candle(T0, 1, 2), candle(T0, 2, 1)]),
    RangeError,
  );
});
