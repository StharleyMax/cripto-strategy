// Unit tests for the guard that decides whether the D8.19 run is allowed to publish a number.
//
// These do NOT measure the axis -- `axis-fidelity.test.ts` pins the arithmetic and the spike
// itself pins the chart. What is pinned here is the ONE function that separates "mediu e
// passou" from "nao mediu": with `assertViewportFitted` disabled, the spike returns rc=0 over
// a 1,440-slot axis spread across ~8,640 px on a 1,200 px pane -- a green it never earned.
// That proof used to be a mutation run once by hand, and a manual mutation does not regress.
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { test } from "node:test";
import { assertViewportFitted, CHART_WIDTH_PX } from "./headless-chart.ts";

/** The D8.19 workload: 1,440 one-minute slots on the pane plan 08 reasons in. */
const SLOT_COUNT = 1440;
const FITTED_SPACING_PX = CHART_WIDTH_PX / SLOT_COUNT;

test("assertViewportFitted ACCEPTS the spacing of an axis that actually fitted", () => {
  assert.doesNotThrow(() => {
    assertViewportFitted(CHART_WIDTH_PX, FITTED_SPACING_PX, SLOT_COUNT);
  });
});

// THE MUTATION, and it is the literal geometry of the false green: 6 px is the library's
// DEFAULT bar spacing, which is what the time-scale model still carries when the rAF draw
// cycle has not run. If this case stops throwing, the spike can publish 0.000 px again.
test("assertViewportFitted REFUSES the default 6 px spacing that produced the false green", () => {
  assert.throws(
    () => {
      assertViewportFitted(CHART_WIDTH_PX, 6, SLOT_COUNT);
    },
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /NAO coube na viewport/);
      // The message has to name the graph it would have measured instead, or the operator
      // cannot tell this refusal from a real out-of-tolerance verdict.
      assert.match(error.message, /barSpacing = 6 px para 1440 slots em 1200 px de pane/);
      assert.match(error.message, /~8640 px de largura, nao de 1200 px/);
      return true;
    },
  );
});

// The 2% band is load-bearing in BOTH directions: a guard that accepted everything would let
// the false green through, and one that accepted nothing would turn every real run into rc=3.
test("assertViewportFitted holds the 2% drift band on each side of it", () => {
  assert.doesNotThrow(() => {
    assertViewportFitted(CHART_WIDTH_PX, FITTED_SPACING_PX * 1.019, SLOT_COUNT);
  });
  assert.throws(() => {
    assertViewportFitted(CHART_WIDTH_PX, FITTED_SPACING_PX * 1.021, SLOT_COUNT);
  }, /NAO coube na viewport/);
});

// A pane of zero width makes `expectedSpacing` zero and the drift ratio NaN, and `NaN > 0.02`
// is FALSE -- so without this branch an undimensioned model would slip through as "fitted".
test("assertViewportFitted refuses an undimensioned pane instead of dividing into NaN", () => {
  assert.throws(() => {
    assertViewportFitted(0, FITTED_SPACING_PX, SLOT_COUNT);
  }, /o modelo nao foi dimensionado/);
});
