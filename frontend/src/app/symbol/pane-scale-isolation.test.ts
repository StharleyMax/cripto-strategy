/**
 * `T-01.11-FIX` (`MF-1` of `docs/context/paineis-de-fluxo/gates/T-01.11-design-review.md`) — no
 * pane of the ONE chart inherits a sibling pane's price-scale options. Measured against the REAL
 * `lightweight-charts` inside a `jsdom` (the shim `charts` already uses for axis fidelity), because
 * the defect is the library's own template (`pane-scale-isolation.ts`), and a model of it would
 * prove the model.
 *
 * The scenario is the host's, reduced to what the defect needs: pane 0 a positive line (price),
 * pane 1 a histogram whose `right` scale goes LOGARITHMIC (the liquidation bar), pane 2 a line that
 * crosses zero (the CVD delta) with the margins the legend reserve gives it on the real app
 * (`top 0,498 · bottom 0,29`, read back from the chart `[MEDIDO 2026-09-25]`).
 *
 * THE TWO ARMS, AND WHY BOTH ARE HERE: the first is the fix and must pass; the second is the host
 * WITHOUT the fix — panes created lazily by `addSeries(…, paneIndex)` — and must show the defect.
 * If a future `lightweight-charts` stops leaking, the second arm fails, which is the signal that
 * `createPanesBeforeSeries` is no longer needed (not that the fix broke).
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

import { flushFrames, installGlobals } from "../../charts/index.ts";
import { chartConstructorOptions } from "./chart-options.ts";
import { createPanesBeforeSeries } from "./pane-scale-isolation.ts";

const WIDTH_PX = 900;
const HEIGHT_PX = 600;
const SLOTS = 120;
const START_S = 1_758_700_800; // 2025-09-24T08:00Z — any whole minute
/** The margins of the CVD delta scale on the real app, legend reserve included. */
const CVD_DELTA_MARGINS = { top: 0.498, bottom: 0.29 } as const;
/** "Same order of magnitude as the data": the value the axis can label at the pane's top edge may
 * exceed the served extreme — the legend reserve is labelled by extrapolation — but not by more than
 * this factor. Measured `[2026-09-25, this file's diagnostics]`: fixed, top `2822` against `±498`
 * (5,7x — half the pane is legend reserve, labelled by linear extrapolation); lazy, top `1,43e35` and
 * bottom `−4,11e21`, the shape of the review's `2e+37 / −1e+23`. */
const ORDER_OF_MAGNITUDE = 10;

function deltaValue(index: number): number {
  return ((index * 37) % 997) - 498;
}

interface Measured {
  readonly modes: readonly number[];
  readonly topValue: number;
  readonly bottomValue: number;
  readonly maxAbsServed: number;
}

async function measure(precreate: boolean): Promise<Measured> {
  const dom = new JSDOM('<!doctype html><html><body><div id="chart"></div></body></html>', { pretendToBeVisual: true });
  installGlobals(dom);
  const lc = await import("lightweight-charts");
  const container = dom.window.document.getElementById("chart");
  assert.ok(container !== null, "broken invariant: the chart container does not exist in the DOM");
  // `localization.locale` only for the jsdom shim (`axis-sync-alignment.test.ts:82-87`): without it
  // the library's tick formatter throws `Incorrect locale information provided` on every frame.
  const chart = lc.createChart(container, { ...chartConstructorOptions(WIDTH_PX, HEIGHT_PX), localization: { locale: "en-US" } });
  if (precreate) {
    assert.equal(createPanesBeforeSeries(chart, 3), 2, "the chart starts with ONE pane; two must be added");
  }
  const times = Array.from({ length: SLOTS }, (_, i) => (START_S + i * 60) as never);

  const price = chart.addSeries(lc.LineSeries, {}, 0);
  price.setData(times.map((time, i) => ({ time, value: 100 + (i % 7) })));

  const bars = chart.addSeries(lc.HistogramSeries, { base: 1 }, 1);
  bars.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.15 }, mode: lc.PriceScaleMode.Logarithmic });
  bars.setData(times.map((time, i) => ({ time, value: 10 ** (1 + (i % 5)) })));

  const delta = chart.addSeries(lc.LineSeries, {}, 2);
  delta.priceScale().applyOptions({ scaleMargins: CVD_DELTA_MARGINS });
  const values = times.map((_, i) => deltaValue(i));
  delta.setData(times.map((time, i) => ({ time, value: values[i]! })));

  chart.timeScale().fitContent();
  await flushFrames(dom, 3);

  const modes = chart.panes().map((_, i) => chart.priceScale("right", i).options().mode);
  const paneHeight = chart.panes()[2]!.getHeight();
  const topValue = delta.coordinateToPrice(0);
  const bottomValue = delta.coordinateToPrice(paneHeight - 1);
  assert.ok(paneHeight > 0 && topValue !== null && bottomValue !== null, "the library did not lay out pane 2 — vacuous");
  const result = {
    modes,
    topValue: topValue as number,
    bottomValue: bottomValue as number,
    maxAbsServed: Math.max(...values.map(Math.abs)),
  };
  chart.remove();
  return result;
}

test("MF-1: with every pane created first, the CVD-like pane keeps a NORMAL right scale and an axis in the data's order of magnitude", async (t) => {
  const fixed = await measure(true);
  t.diagnostic(`fixed: modes=${fixed.modes.join(",")} top=${fixed.topValue} bottom=${fixed.bottomValue} maxAbs=${fixed.maxAbsServed}`);
  assert.deepEqual(fixed.modes, [0, 1, 0], "only the log pane is logarithmic — no sibling inherited its mode");
  assert.ok(
    Math.abs(fixed.topValue) <= ORDER_OF_MAGNITUDE * fixed.maxAbsServed &&
      Math.abs(fixed.bottomValue) <= ORDER_OF_MAGNITUDE * fixed.maxAbsServed,
    `axis extremes ${fixed.topValue} / ${fixed.bottomValue} out of order of magnitude of ±${fixed.maxAbsServed}`,
  );
});

test("MF-1, the ablation: panes created lazily (the host before the fix) — the log mode LEAKS and the axis explodes", async (t) => {
  const lazy = await measure(false);
  t.diagnostic(`lazy: modes=${lazy.modes.join(",")} top=${lazy.topValue} bottom=${lazy.bottomValue} maxAbs=${lazy.maxAbsServed}`);
  assert.deepEqual(lazy.modes, [0, 1, 1], "the pane created after the log pane inherited Logarithmic");
  assert.ok(
    Math.abs(lazy.topValue) > 1e6 * lazy.maxAbsServed,
    `expected the explosion the design review saw (2e+37); the top of the axis read ${lazy.topValue}`,
  );
});

test("createPanesBeforeSeries refuses a count that is not a positive integer, and adds nothing when the panes exist", () => {
  const panes: unknown[] = [{}];
  const fake = { panes: () => panes as never, addPane: () => (panes.push({}), {} as never) };
  assert.throws(() => createPanesBeforeSeries(fake, 0), RangeError);
  assert.throws(() => createPanesBeforeSeries(fake, 2.5), RangeError);
  assert.equal(createPanesBeforeSeries(fake, 1), 0);
  assert.equal(createPanesBeforeSeries(fake, 4), 3);
  assert.equal(panes.length, 4);
});

// ── The host calls it, and BEFORE any pane mounts ─────────────────────────────────────────────

const SYMBOL_CLIENT = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "SymbolClient.tsx"), "utf8");

test("the host creates every pane of the registry before the first pane's mount", () => {
  const call = SYMBOL_CLIENT.indexOf("createPanesBeforeSeries(chart, PANE_STACK.stretchFactors.length)");
  const firstMount = SYMBOL_CLIENT.indexOf("binding.mount(chart, paneIndex)");
  // Anchored on the host's constructor options, not on the call's name: `chart-construction.test.ts`
  // scans every file for that name followed by a parenthesis.
  const createChartAt = SYMBOL_CLIENT.indexOf("chartConstructorOptions(container.clientWidth");
  assert.ok(call > 0, "SymbolClient.tsx no longer calls createPanesBeforeSeries with the registry's pane count");
  assert.ok(firstMount > 0, "the anchor 'binding.mount(chart, paneIndex)' moved — re-read the host before trusting this");
  assert.ok(createChartAt > 0 && createChartAt < call && call < firstMount, "the panes must be created after the chart and before the first mount");
});
