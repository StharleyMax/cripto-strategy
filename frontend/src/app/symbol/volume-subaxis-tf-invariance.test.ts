/**
 * `T-03.10` → `T-02.2` — THE VOLUME SUB-AXIS UNDER A TF-SHIFTED MAGNITUDE: height ratio = value ratio.
 *
 * `plano 03` item `3.7` / `[Q8]` / `[M-6]` named the domain fact: *"sob TF de 4h o volume por bucket é
 * ~240x o de 1m, e uma escala log fixada para a magnitude antiga achata o gráfico novo"*. Under the
 * old `log10` base 1 this file MEASURED that flattening (spread `27.26 → 16.57 px` at `240×`), and
 * `T-02.2`'s `design_gate` (`docs/context/paineis-de-fluxo/gates/T-02.2-design-gate.md` §1 item 3,
 * §4) is where it became one of the reasons to leave `log10`.
 *
 * On the LINEAR base-0 scale the claim this file guards is the one the on-screen label makes
 * (`VolumeScaleNote`: "Altura da barra proporcional ao volume"): for every bar, `height / tallest
 * height = value / largest value`, within ±1 px, at `1×` AND at `240×` (gate §5.6).
 *
 * ⛔ THE UNIVERSE KEEPS ITS MINIMUM FAR FROM ZERO, and that is the whole point (gate §8.8 `N-4`): the
 * histogram autoscale FUSES `base` into the range (`lightweight-charts.development.mjs:3841-3844`),
 * so the proportionality depends on `base: 0`. With a minimum near zero, a wrong base would shift
 * every bar by almost nothing and the test would not distinguish; with the visible minimum at ~1/4
 * of the maximum, moving the base moves the small bars by several pixels. The MORDE below proves it.
 *
 * Heights come from `priceToCoordinate` — the scale's geometry — and the comparison is only made
 * for bars ABOVE the library's 1-px paint floor, which `volume-subaxis-geometry.test.ts` measures on
 * the draw calls.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
// `T-10.11` harness — FIRST, so the `.tsx` below can be imported (`gates/T-10.11-padrao.md` §7). Nothing is
// rendered here: it is what lets this file read production's constants by IMPORT (`T-10.10` DoD 1).
import "../component-render.ts";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

import { F1_PANE_STACK_FORM, flushFrames, installGlobals, positiveValueSeriesLossless, stackedPaneLayout } from "../../charts/index.ts";
import { chartConstructorOptions } from "./chart-options.ts";
import { F1_PANE_ORDER, F1_PANE_STRETCH } from "./pane-registry.ts";

const SYMBOL_CLIENT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "SymbolClient.tsx");
const source = readFileSync(SYMBOL_CLIENT_PATH, "utf8");

// `T-10.10` DoD 1: the constants come by IMPORT. The scale MODE below is a JSX prop, not a constant:
// it stays a residual scan (same as `volume-subaxis-geometry.test.ts`).
const { VOLUME_BAR_BASE, VOLUME_SCALE_MARGINS } = await import("./SymbolClient.tsx");
const PRODUCTION_MODE = /volumeSeries\.priceScale\(\)\.applyOptions\(\{\s*scaleMargins: VOLUME_SCALE_MARGINS,\s*mode: PriceScaleMode\.(\w+),/.exec(source)?.[1];

/** The production price pane (`stackedPaneLayout` over `F1_PANE_STRETCH`) plus the time-axis row: a
 * single-pane chart of this height puts the pane within ~1 px of the screen's (geometry test). */
const PANE_CHART_HEIGHT_PX = (() => {
  const layout = stackedPaneLayout({ ...F1_PANE_STACK_FORM, weights: F1_PANE_ORDER.map((paneId) => F1_PANE_STRETCH[paneId]) });
  return Math.round(layout.paneHeightsPx[0]!) + F1_PANE_STACK_FORM.timeAxisPx;
})();

const ONE_MINUTE_MS = 60_000;
const MEASUREMENT_WIDTH_PX = 1_200;
const GRID_SLOTS = 1_440;
/** `N-4`: minimum far from zero — `1,000 … 4,000`, so `min/max = 0.25`. */
const SYNTHETIC_MIN = 1_000;
const SYNTHETIC_MAX = 4_000;
/** `[M-6]`, verbatim in `tasks.toml`: "sob TF de 4h o volume por bucket é ~240x o de 1m". */
const TF_4H_OVER_1M_RATIO = 240;
/** Rounding of the paint (`Math.round(y)`) and of the base: ±1 px, the gate's own tolerance (§5.6). */
const TOLERANCE_PX = 1;
/** The library's paint floor: a bar at or under 1 px is painted 1 px, whatever its value. */
const PAINT_FLOOR_PX = 1;

interface Slot {
  readonly time: number;
  readonly value: number | null;
}

function syntheticVolumeSlots(magnitudeMultiplier: number): readonly Slot[] {
  const slots: Slot[] = [];
  for (let i = 0; i < GRID_SLOTS; i += 1) {
    let bits = i + 1;
    let fraction = 0;
    let denominator = 0.5;
    while (bits > 0) {
      fraction += (bits % 2) * denominator;
      bits = Math.floor(bits / 2);
      denominator /= 2;
    }
    slots.push({ time: i * ONE_MINUTE_MS, value: magnitudeMultiplier * (SYNTHETIC_MIN + fraction * (SYNTHETIC_MAX - SYNTHETIC_MIN)) });
  }
  return slots;
}

interface Config {
  readonly mode: "Logarithmic" | "Normal";
  readonly base: number;
}

const PRODUCTION: Config = { mode: PRODUCTION_MODE === "Normal" ? "Normal" : "Logarithmic", base: VOLUME_BAR_BASE };

interface BarHeight {
  readonly value: number;
  readonly heightPx: number;
}

async function measureBarHeights(slots: readonly Slot[], config: Config): Promise<readonly BarHeight[]> {
  const dom = new JSDOM('<!doctype html><html><body><div id="chart"></div></body></html>', { pretendToBeVisual: true });
  installGlobals(dom);
  const lc = await import("lightweight-charts");
  const container = dom.window.document.getElementById("chart");
  assert.ok(container !== null, "broken invariant: the chart container does not exist in the DOM");
  const chart = lc.createChart(container, chartConstructorOptions(MEASUREMENT_WIDTH_PX, PANE_CHART_HEIGHT_PX));
  const volumeSeries = chart.addSeries(lc.HistogramSeries, {
    priceScaleId: "volume",
    base: config.base,
    priceLineVisible: false,
    lastValueVisible: false,
  });
  volumeSeries.priceScale().applyOptions({
    scaleMargins: VOLUME_SCALE_MARGINS,
    mode: config.mode === "Logarithmic" ? lc.PriceScaleMode.Logarithmic : lc.PriceScaleMode.Normal,
  });
  volumeSeries.setData(positiveValueSeriesLossless(slots) as never);
  chart.timeScale().fitContent();
  await flushFrames(dom, 3);
  // The bars grow from the coordinate of `base` — `0` in production; the MORDE moves it.
  const barBase = volumeSeries.priceToCoordinate(config.base);
  assert.ok(barBase !== null, "the library did not place the base — the measurement would be vacuous");
  const heights = slots
    .filter((slot): slot is Slot & { value: number } => slot.value !== null && slot.value > 0)
    .map((slot) => {
      const coordinate = volumeSeries.priceToCoordinate(slot.value);
      assert.ok(coordinate !== null, `the bar of ${slot.value} got no coordinate`);
      return { value: slot.value, heightPx: (barBase as number) - (coordinate as number) };
    });
  chart.remove();
  dom.window.close();
  return heights;
}

/** The largest deviation, in px, between each bar's height and `tallest × value / largest value`,
 * over the bars above the paint floor. */
function worstProportionalityErrorPx(bars: readonly BarHeight[]): number {
  const tallest = Math.max(...bars.map((bar) => bar.heightPx));
  const largest = Math.max(...bars.map((bar) => bar.value));
  let worst = 0;
  for (const bar of bars) {
    if (bar.heightPx <= PAINT_FLOOR_PX) {
      continue;
    }
    worst = Math.max(worst, Math.abs(bar.heightPx - (tallest * bar.value) / largest));
  }
  return worst;
}

test("the universe: a uniform 240x shift of a series whose minimum is far from zero (N-4)", () => {
  const at1x = syntheticVolumeSlots(1).map((slot) => slot.value as number);
  const at240x = syntheticVolumeSlots(TF_4H_OVER_1M_RATIO).map((slot) => slot.value as number);
  assert.ok(at240x.every((value, index) => Math.abs(value / at1x[index]! - TF_4H_OVER_1M_RATIO) < 1e-9), "not a uniform multiplier");
  const ratio = Math.min(...at1x) / Math.max(...at1x);
  assert.ok(ratio > 0.2, `min/max = ${ratio.toFixed(3)} — too close to zero, a wrong base would go unnoticed (N-4)`);
});

test("T-02.2: height ratio = value ratio, ±1 px, at 1x (4h-scale volume: see the next test)", async () => {
  const bars = await measureBarHeights(syntheticVolumeSlots(1), PRODUCTION);
  assert.ok(bars.length > 1_000, `universe too small (${bars.length})`);
  const worst = worstProportionalityErrorPx(bars);
  assert.ok(worst <= TOLERANCE_PX, `a bar deviates ${worst.toFixed(2)}px from proportional — the "proporcional ao volume" label lies`);
});

test("[M-6] T-02.2: height ratio = value ratio, ±1 px, at 240x — and the same pixels as at 1x", async () => {
  const at1x = await measureBarHeights(syntheticVolumeSlots(1), PRODUCTION);
  const at240x = await measureBarHeights(syntheticVolumeSlots(TF_4H_OVER_1M_RATIO), PRODUCTION);
  const worst = worstProportionalityErrorPx(at240x);
  assert.ok(worst <= TOLERANCE_PX, `at 240x a bar deviates ${worst.toFixed(2)}px from proportional`);
  // The flattening `[M-6]` named is gone: a uniform magnitude shift moves no pixel.
  const moved = at240x.map((bar, index) => Math.abs(bar.heightPx - at1x[index]!.heightPx));
  assert.ok(Math.max(...moved) <= TOLERANCE_PX, `the 240x series drew up to ${Math.max(...moved).toFixed(2)}px away from the 1x one`);
});

test("MORDE (N-4): a base away from 0 breaks the proportionality — the test above can see the base", async () => {
  // The base at half the visible minimum: what a "base = window minimum" style of anchoring does.
  const bars = await measureBarHeights(syntheticVolumeSlots(1), { ...PRODUCTION, base: SYNTHETIC_MIN / 2 });
  const worst = worstProportionalityErrorPx(bars);
  assert.ok(worst > TOLERANCE_PX, `base=${SYNTHETIC_MIN / 2} still passed (${worst.toFixed(2)}px) — the proportionality test is blind to the base`);
});

test("MORDE: the previous log10 base-1 configuration breaks the proportionality", async () => {
  const bars = await measureBarHeights(syntheticVolumeSlots(1), { mode: "Logarithmic", base: 1 });
  const worst = worstProportionalityErrorPx(bars);
  assert.ok(worst > TOLERANCE_PX, `log10 still passed (${worst.toFixed(2)}px) — the proportionality test is blind to the scale`);
});
