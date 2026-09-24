// `T-01.6` (`paineis-de-fluxo`, plan `01` item `1.5`, `[Q-DG-1]`): the vertical geometry of the one
// chart — the height that keeps every pane at its floor, and the scale margins that keep the marks
// out from under the per-pane DOM layer and off the separator (`C-6`). Every rule has a case that
// FAILS without it.
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  F1_PANE_STACK_FORM,
  LEGEND_GAP_PX,
  MAX_LEGEND_RESERVE_FRACTION,
  PANE_SEPARATOR_PX,
  SEPARATOR_CLEARANCE_PX,
  paneScaleMargins,
  stackedPaneLayout,
} from "./pane-stack-layout.ts";
import type { ScaleMargins } from "./pane-stack-layout.ts";

/** The phase `01` weights, restated as an INPUT fixture (this module owns no form; the values are
 * `web`'s `F1_PANE_STRETCH`, in `F1_PANE_ORDER`: price · liq long · liq short · OI · L/S · CVD). */
const F1_WEIGHTS = [34, 11, 11, 15, 9, 9] as const;

function close(actual: number, expected: number, message?: string): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ""} expected ${expected}, got ${actual}`);
}

// ── stackedPaneLayout ─────────────────────────────────────────────────────────────────────────

test("F1: at the gate's 910px target every one of the six panes clears the 72px floor, and the weights go through unchanged", () => {
  const layout = stackedPaneLayout({ ...F1_PANE_STACK_FORM, weights: F1_WEIGHTS });
  assert.equal(layout.chartHeightPx, 910);
  assert.equal(layout.grewForFloor, false);
  assert.deepEqual(layout.stretchFactors, [...F1_WEIGHTS]);
  const lightest = Math.min(...layout.paneHeightsPx);
  assert.ok(lightest >= F1_PANE_STACK_FORM.floorPx, `lightest pane ${lightest}px is under the floor`);
  // The split is the weights': the price pane is 34/89 of what panes get.
  const panesPx = 910 - F1_PANE_STACK_FORM.timeAxisPx - 5 * PANE_SEPARATOR_PX;
  close(layout.paneHeightsPx[0]!, (panesPx * 34) / 89, "price pane");
});

test("the floor binds: a target too short for it makes the chart exactly as tall as the lightest pane needs", () => {
  const form = { weights: [3, 1], floorPx: 100, targetChartHeightPx: 200, timeAxisPx: 20 };
  const layout = stackedPaneLayout(form);
  assert.equal(layout.grewForFloor, true);
  // lightest (w=1) gets 100px ⇔ panes = 100 · 4 / 1 = 400; + 20 axis + 1 separator = 421.
  assert.equal(layout.chartHeightPx, 421);
  close(layout.paneHeightsPx[1]!, 100, "the lightest pane sits exactly on the floor");
});

test("MORDE: without the floor rule, the same target leaves the lightest pane under it", () => {
  // What `setStretchFactor` alone does: split the target proportionally.
  const form = { weights: [3, 1], floorPx: 100, targetChartHeightPx: 200, timeAxisPx: 20 };
  const naiveLightest = ((form.targetChartHeightPx - form.timeAxisPx - PANE_SEPARATOR_PX) * 1) / 4;
  assert.ok(naiveLightest < form.floorPx, "the fixture must be one where the floor actually binds");
  const layout = stackedPaneLayout(form);
  assert.ok(Math.min(...layout.paneHeightsPx) >= form.floorPx - 1e-9);
});

test("R-2's arithmetic: halving the liquidation weight to 5,5 per leg would need a stack taller than the 1.024px viewport", () => {
  // The argument `pane-registry.ts::F1_PANE_STRETCH` writes down, recomputed here so it cannot rot.
  const halved = stackedPaneLayout({ ...F1_PANE_STACK_FORM, weights: [34, 5.5, 5.5, 15, 9, 9] });
  assert.ok(halved.grewForFloor, "5,5 per leg must force the chart past the target");
  assert.ok(halved.chartHeightPx > 1024, `expected > 1024px, got ${halved.chartHeightPx}px`);
  const kept = stackedPaneLayout({ ...F1_PANE_STACK_FORM, weights: F1_WEIGHTS });
  assert.ok(kept.chartHeightPx <= 1024);
});

test("invalid forms are refused, not silently laid out", () => {
  const base = { weights: [1, 1], floorPx: 72, targetChartHeightPx: 500, timeAxisPx: 28 };
  assert.throws(() => stackedPaneLayout({ ...base, weights: [] }), RangeError);
  assert.throws(() => stackedPaneLayout({ ...base, weights: [1, 0] }), RangeError);
  assert.throws(() => stackedPaneLayout({ ...base, weights: [1, Number.NaN] }), RangeError);
  assert.throws(() => stackedPaneLayout({ ...base, floorPx: -1 }), RangeError);
  assert.throws(() => stackedPaneLayout({ ...base, targetChartHeightPx: 0 }), RangeError);
});

// ── paneScaleMargins ──────────────────────────────────────────────────────────────────────────

const LIBRARY_DEFAULT: ScaleMargins = { top: 0.2, bottom: 0.1 };
const TOP_ROLE = { belowLegend: true, clearSeparator: false } as const;
const FLOOR_ROLE = { belowLegend: false, clearSeparator: true } as const;

test("belowLegend: the first pixel the scale may draw is at or below the legend's bottom + gap", () => {
  const paneHeightPx = 92;
  const legendBottomPx = 36;
  const result = paneScaleMargins({ top: 0.05, bottom: 0.15 }, TOP_ROLE, { paneHeightPx, legendBottomPx });
  assert.equal(result.kind, "margins");
  if (result.kind !== "margins") return;
  assert.equal(result.reservedPx, legendBottomPx + LEGEND_GAP_PX);
  assert.ok(result.margins.top * paneHeightPx >= legendBottomPx + LEGEND_GAP_PX - 1e-9);
});

test("MORDE: the base margins alone — what the pane had before `T-01.6` — put the scale's top under the legend", () => {
  const paneHeightPx = 92;
  const legendBottomPx = 36;
  const base = { top: 0.05, bottom: 0.15 };
  assert.ok(base.top * paneHeightPx < legendBottomPx, "the fixture must be one the reserve changes");
  const result = paneScaleMargins(base, TOP_ROLE, { paneHeightPx, legendBottomPx });
  assert.ok(result.kind === "margins" && result.margins.top > base.top);
});

test("compression, not raise: two scales that split the pane keep their order and their equal shares below the legend", () => {
  // The CVD pane: delta above, cumulative below.
  const delta = { top: 0.05, bottom: 0.55 };
  const cumulative = { top: 0.55, bottom: 0.05 };
  const measure = { paneHeightPx: 100, legendBottomPx: 36 };
  const d = paneScaleMargins(delta, TOP_ROLE, measure);
  const c = paneScaleMargins(cumulative, TOP_ROLE, measure);
  assert.ok(d.kind === "margins" && c.kind === "margins");
  if (d.kind !== "margins" || c.kind !== "margins") return;
  const dBand = 1 - d.margins.top - d.margins.bottom;
  const cBand = 1 - c.margins.top - c.margins.bottom;
  close(dBand, cBand, "equal shares survive");
  assert.ok(dBand > 0.2, `the upper half must not collapse, got ${dBand}`);
  assert.ok(1 - d.margins.bottom <= c.margins.top + 1e-9, "delta stays entirely above cumulative");
});

test("MORDE: raising only `top` (the naive reserve) collapses the upper half of a split pane", () => {
  const delta = { top: 0.05, bottom: 0.55 };
  const naiveTop = 0.4; // (36 + 4) / 100
  assert.ok(1 - naiveTop - delta.bottom < 0.1, "the naive raise leaves the delta ~5% of the pane");
  const d = paneScaleMargins(delta, TOP_ROLE, { paneHeightPx: 100, legendBottomPx: 36 });
  assert.ok(d.kind === "margins" && 1 - d.margins.top - d.margins.bottom > 0.2);
});

test("clearSeparator (C-6): a scale anchored at the floor keeps >= 4px off the separator", () => {
  const volume = { top: 0.8, bottom: 0 };
  const result = paneScaleMargins(volume, FLOOR_ROLE, { paneHeightPx: 335, legendBottomPx: null });
  assert.equal(result.kind, "margins");
  if (result.kind !== "margins") return;
  assert.ok(result.margins.bottom * 335 >= SEPARATOR_CLEARANCE_PX - 1e-9);
  assert.equal(result.margins.top, 0.8, "a floor scale is not moved by the legend");
});

test("MORDE: the volume's own margins (bottom 0) leave the doji ON the separator", () => {
  assert.equal({ top: 0.8, bottom: 0 }.bottom * 335, 0);
});

test("unmeasured: before the first frame (height 0) or before the layer exists, nothing is derived", () => {
  assert.equal(paneScaleMargins(LIBRARY_DEFAULT, TOP_ROLE, { paneHeightPx: 0, legendBottomPx: 20 }).kind, "unmeasured");
  assert.equal(paneScaleMargins(LIBRARY_DEFAULT, TOP_ROLE, { paneHeightPx: 90, legendBottomPx: null }).kind, "unmeasured");
  // A floor scale does not need the legend, only the height.
  assert.equal(paneScaleMargins(LIBRARY_DEFAULT, FLOOR_ROLE, { paneHeightPx: 90, legendBottomPx: null }).kind, "margins");
});

test("overflow: a legend taller than 3/4 of its pane keeps the base margins and says so", () => {
  const result = paneScaleMargins(LIBRARY_DEFAULT, TOP_ROLE, { paneHeightPx: 80, legendBottomPx: 70 });
  assert.equal(result.kind, "overflow");
  assert.ok(70 / 80 > MAX_LEGEND_RESERVE_FRACTION);
  if (result.kind === "overflow") {
    assert.deepEqual(result.margins, LIBRARY_DEFAULT);
  }
});

test("invalid base margins are refused", () => {
  assert.throws(() => paneScaleMargins({ top: 0.6, bottom: 0.5 }, TOP_ROLE, { paneHeightPx: 90, legendBottomPx: 10 }), RangeError);
  assert.throws(() => paneScaleMargins({ top: -0.1, bottom: 0 }, TOP_ROLE, { paneHeightPx: 90, legendBottomPx: 10 }), RangeError);
});
