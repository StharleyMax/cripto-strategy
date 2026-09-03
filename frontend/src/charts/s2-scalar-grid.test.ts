// Unit tests for the scalar-series grid aligner (OI/CVD sibling of `alignCandlesToGrid`).
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { test } from "node:test";
import { alignScalarPointsToGrid, buildScalarSeries } from "./s2-scalar-grid.ts";
import { buildCanonicalGrid } from "./canonical-grid.ts";

const FIVE_MIN_MS = 5 * 60_000;

test("alignScalarPointsToGrid fills present slots and leaves absent ones null", () => {
  const grid = buildCanonicalGrid(0, 4 * FIVE_MIN_MS, FIVE_MIN_MS); // [0, 5, 10, 15] min
  const points = [
    { timeMs: 0, value: 100 },
    { timeMs: 3 * FIVE_MIN_MS, value: 103 },
  ];
  const slots = alignScalarPointsToGrid(points, grid);
  assert.deepEqual(
    slots.map((slot) => slot.value),
    [100, null, null, 103],
  );
});

test("alignScalarPointsToGrid rejects a point that does not land on a grid instant", () => {
  const grid = buildCanonicalGrid(0, 2 * FIVE_MIN_MS, FIVE_MIN_MS);
  assert.throws(() => alignScalarPointsToGrid([{ timeMs: 123, value: 1 }], grid), RangeError);
});

test("alignScalarPointsToGrid rejects a duplicate point for the same slot", () => {
  const grid = buildCanonicalGrid(0, 2 * FIVE_MIN_MS, FIVE_MIN_MS);
  assert.throws(
    () =>
      alignScalarPointsToGrid(
        [
          { timeMs: 0, value: 1 },
          { timeMs: 0, value: 2 },
        ],
        grid,
      ),
    RangeError,
  );
});

test("buildScalarSeries builds the grid AND aligns in one call", () => {
  const series = buildScalarSeries([{ timeMs: FIVE_MIN_MS, value: 42 }], FIVE_MIN_MS, 0, 3 * FIVE_MIN_MS);
  assert.equal(series.slots.length, 3);
  assert.deepEqual(
    series.slots.map((slot) => slot.value),
    [null, 42, null],
  );
});
