/**
 * `T-03.10` (`CST-225`) — DOES THE `log10` VOLUME SUB-AXIS SURVIVE A TF-SHIFTED MAGNITUDE?
 *
 * `plano 03` item `3.7` / `[Q8]` / `[M-6]`, and the refs of `T-03.10` in `tasks.toml` name the
 * domain fact THIS FILE measures, verbatim: *"sob TF de 4h o volume por bucket é ~240x o de 1m,
 * e uma escala log fixada para a magnitude antiga achata o gráfico novo"* — `4h` sums `240`
 * one-minute `FLOW` buckets (`item 3.1`, `(FLOW,SUM)=Σ`), so a bucket at `4h` is, in typical
 * order of magnitude, `240×` a bucket at `1m`.
 *
 * ⛔ THE DECISION UNDER TEST IS NOT "change the scale" — that verdict belongs to the
 * `design_gate` (`ux-ui-mastery`), never to a builder (`CLAUDE.md` §"Design — autonomia
 * delegada"). What THIS builder owns is: does `BLOCKER-1`'s floor (no present bar below 1
 * physical pixel, median legible — `volume-subaxis-geometry.test.ts`) still hold when the SAME
 * distribution shape is shifted `240×` in magnitude, with the production configuration
 * (`VOLUME_LOG_BASE = 1`, `PriceScaleMode.Logarithmic`, `VOLUME_SCALE_MARGINS`) held fixed and
 * UNCHANGED? If yes, "continua até prova em contrário" (`[M-6]`) has a number behind it instead
 * of an assumption.
 *
 * ⚠️ WHAT THE MEASUREMENT BELOW ACTUALLY FOUND, and it is reported instead of hidden because a
 * gate that only writes down the reassuring half is not a gate: the floor DOES hold (no
 * sub-pixel bar, median well above `MEDIAN_FLOOR_PX` in both magnitudes), but the DYNAMIC RANGE
 * measurably COMPRESSES as magnitude rises — `[MEDIDO 2026-09-22, jsdom against the real
 * library, n=1,440 present bars per run]`:
 *
 *   |            | min bar | median | max bar | spread (max−min) |
 *   |------------|---------|--------|---------|-------------------|
 *   | `1×` (1m)  | 10.14px | 19.15px| 37.40px | 27.26px           |
 *   | `240×` (4h)| 20.83px | 26.30px| 37.40px | 16.57px           |
 *
 * WHY, arithmetically: `VOLUME_LOG_BASE = 1` is an ABSOLUTE anchor (the comment beside it in
 * `SymbolClient.tsx` already argues this is deliberate — same height means same value in any
 * window). The usable band always maps `[base, windowMax]` in log space to `[bandBottom,
 * bandTop]` in pixels. `windowMax` rises `240×` while `base` stays `1`, so the LOG SPAN the band
 * has to cover (`log10(windowMax) − log10(base)`) grows — `log10(240) ≈ 2.38` more decades —
 * while the SERIES' OWN spread (`max/min` ratio, `~493×` here, unaffected by a uniform
 * multiplier) stays constant. More of the fixed pixel band is spent on the (now longer)
 * `base→min` segment, and less is left for `min→max` — the max bar is pinned to the band's top
 * regardless of magnitude (`37.40px` both times, exactly), and the min bar RISES toward it
 * (`10.14px → 20.83px`), shrinking the visual contrast between the smallest and largest bars on
 * screen. This is real and worth a `design_gate` look, but it is NOT `BLOCKER-1` back — no bar
 * left the readable band, and the compression is bounded (median moved the RIGHT direction, up,
 * not into sub-pixel territory) `[MEDIDO below]`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

import { flushFrames, installGlobals, positiveValueSeriesLossless } from "../../charts/index.ts";
import { chartConstructorOptions } from "./chart-options.ts";

const SYMBOL_CLIENT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "SymbolClient.tsx");
const source = readFileSync(SYMBOL_CLIENT_PATH, "utf8");

/** Same anchor-to-source discipline as `volume-subaxis-geometry.test.ts` — a copy of these
 * constants would measure the configuration THIS file chose, not the one the screen draws. */
function productionNumber(name: string): number {
  const match = new RegExp(`const ${name} = (-?\\d+(?:\\.\\d+)?);`).exec(source);
  assert.ok(match !== null, `${name} was not found in SymbolClient.tsx — the anchor moved, fix this test`);
  return Number(match[1]);
}

const CHART_HEIGHT_PX = productionNumber("CHART_HEIGHT_PX");
const VOLUME_LOG_BASE = productionNumber("VOLUME_LOG_BASE");

const MARGINS_DECLARATION = /const VOLUME_SCALE_MARGINS = \{ top: (\d+(?:\.\d+)?), bottom: (\d+(?:\.\d+)?) \} as const;/;
const marginsMatch = MARGINS_DECLARATION.exec(source);
assert.ok(marginsMatch !== null, "VOLUME_SCALE_MARGINS was not found in SymbolClient.tsx");
const VOLUME_SCALE_MARGINS = { top: Number(marginsMatch[1]), bottom: Number(marginsMatch[2]) };

// ── The same synthetic universe as `volume-subaxis-geometry.test.ts` (`max/p50 ~ 60.8x`,
// measured on real 24h `1m` data), now also run at a `240×` multiplier — `[M-6]`'s own domain
// fact, cited above, for the `(FLOW,SUM)` reduction at `4h`. Not the real 24h corpus (would tie
// a form gate to on-disk data, `scripts/verify.sh` §1c); the RATIO is what matters here, same
// argument the sibling file already makes.
const ONE_MINUTE_MS = 60_000;
const MEASUREMENT_WIDTH_PX = 1_200;
const GRID_SLOTS = 1_440;
const SYNTHETIC_MIN = 10;
const SYNTHETIC_MAX = 4_931;
const SKEW = 1.6;
/** `[M-6]`, verbatim in `tasks.toml`: "sob TF de 4h o volume por bucket é ~240x o de 1m". */
const TF_4H_OVER_1M_RATIO = 240;

interface Slot {
  readonly time: number;
  readonly value: number | null;
}

function syntheticVolumeSlots(magnitudeMultiplier: number): readonly Slot[] {
  const slots: Slot[] = [];
  for (let i = 0; i < GRID_SLOTS; i += 1) {
    const time = i * ONE_MINUTE_MS;
    let bits = i;
    let fraction = 0;
    let denominator = 0.5;
    while (bits > 0) {
      fraction += (bits % 2) * denominator;
      bits = Math.floor(bits / 2);
      denominator /= 2;
    }
    const shape = SYNTHETIC_MIN * 10 ** (fraction ** SKEW * Math.log10(SYNTHETIC_MAX / SYNTHETIC_MIN));
    slots.push({ time, value: magnitudeMultiplier * shape });
  }
  return slots;
}

/** Bar heights in px, production configuration held fixed, magnitude parameterised. */
async function measureBarHeightsPx(slots: readonly Slot[]): Promise<readonly number[]> {
  const dom = new JSDOM('<!doctype html><html><body><div id="chart"></div></body></html>', { pretendToBeVisual: true });
  installGlobals(dom);
  const lc = await import("lightweight-charts");
  const container = dom.window.document.getElementById("chart");
  assert.ok(container !== null, "broken invariant: the chart container does not exist in the DOM");

  const chart = lc.createChart(container, chartConstructorOptions(MEASUREMENT_WIDTH_PX, CHART_HEIGHT_PX));
  const volumeSeries = chart.addSeries(lc.HistogramSeries, {
    priceScaleId: "volume",
    base: VOLUME_LOG_BASE,
    priceLineVisible: false,
    lastValueVisible: false,
  });
  volumeSeries.priceScale().applyOptions({
    scaleMargins: VOLUME_SCALE_MARGINS,
    mode: lc.PriceScaleMode.Logarithmic,
  });
  volumeSeries.setData(positiveValueSeriesLossless(slots) as never);
  chart.timeScale().fitContent();
  await flushFrames(dom, 3);

  const barBase = volumeSeries.priceToCoordinate(VOLUME_LOG_BASE);
  assert.ok(barBase !== null, "the library did not place the baseline — the measurement would be vacuous");
  const heights = slots
    .filter((slot): slot is Slot & { value: number } => slot.value !== null && slot.value > 0)
    .map((slot) => {
      const coordinate = volumeSeries.priceToCoordinate(slot.value);
      assert.ok(coordinate !== null, `the bar of ${slot.value} got no coordinate`);
      return (barBase as number) - (coordinate as number);
    });
  chart.remove();
  dom.window.close();
  return heights;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

// Same floors `BLOCKER-1` established — this file does not relax them for the shifted magnitude,
// because the promise ("continua") is that the SAME configuration keeps paying that argument off.
const PIXEL_FLOOR = 1;
const MEDIAN_FLOOR_PX = 6;

test("[M-6] a 240x TF-shifted magnitude (4h-scale volume) still clears BLOCKER-1's floor under the SAME production config", async () => {
  const shifted = syntheticVolumeSlots(TF_4H_OVER_1M_RATIO);
  const heights = await measureBarHeightsPx(shifted);
  assert.ok(heights.length > 1_000, `universe too small (${heights.length}) — the measurement would be weak`);
  const subPixel = heights.filter((height) => height < PIXEL_FLOOR);
  assert.equal(
    subPixel.length,
    0,
    `${subPixel.length}/${heights.length} bars below ${PIXEL_FLOOR}px at ${TF_4H_OVER_1M_RATIO}x magnitude — ` +
      `the fixed base=1 anchor stopped clearing BLOCKER-1's floor under a TF-shifted magnitude`,
  );
  const p50 = median(heights);
  assert.ok(
    p50 >= MEDIAN_FLOOR_PX,
    `median bar of ${p50.toFixed(2)}px at ${TF_4H_OVER_1M_RATIO}x magnitude, below the floor of ${MEDIAN_FLOOR_PX}px`,
  );
});

test("[M-6] the dynamic range MEASURABLY compresses as magnitude rises — reported for the design_gate, not hidden", async () => {
  // ⛔ This is not a MORDE/negative-control pair: both runs use the SAME production
  // configuration, unmutated. It documents a real, bounded, arithmetic property of an ABSOLUTE
  // `base=1` anchor (see the file header for the derivation) — evidence for `[M-6]`'s verdict,
  // not a pass/fail gate on taste.
  const heights1x = await measureBarHeightsPx(syntheticVolumeSlots(1));
  const heights240x = await measureBarHeightsPx(syntheticVolumeSlots(TF_4H_OVER_1M_RATIO));
  const spread1x = Math.max(...heights1x) - Math.min(...heights1x);
  const spread240x = Math.max(...heights240x) - Math.min(...heights240x);
  assert.ok(
    spread240x < spread1x,
    `expected the ${TF_4H_OVER_1M_RATIO}x spread (${spread240x.toFixed(2)}px) to be smaller than the 1x spread ` +
      `(${spread1x.toFixed(2)}px) — if it is not, the arithmetic derivation in this file's header no longer ` +
      `matches production and needs re-deriving, not silently accepting`,
  );
  // And bounded: even fully compressed, the spread may not collapse into indistinguishability.
  assert.ok(
    spread240x >= MEDIAN_FLOOR_PX,
    `the ${TF_4H_OVER_1M_RATIO}x spread compressed to ${spread240x.toFixed(2)}px, below ${MEDIAN_FLOOR_PX}px — ` +
      `at that point the smallest and largest bars are no longer visually distinguishable, which IS a form ` +
      `the design_gate needs to see, not this test silently accepting`,
  );
});

test("the synthetic universe reproduces a UNIFORM 240x magnitude shift — without it the two tests above prove nothing", () => {
  // Same discipline as `volume-subaxis-geometry.test.ts`'s own universe-validity test: the claim
  // above depends on the shifted universe being the ORIGINAL distribution scaled by exactly
  // `TF_4H_OVER_1M_RATIO`, not some other shape that happens to also avoid sub-pixel bars.
  const shifted1x = syntheticVolumeSlots(1).map((s) => s.value as number);
  const shifted240x = syntheticVolumeSlots(TF_4H_OVER_1M_RATIO).map((s) => s.value as number);
  const ratioAtEveryIndex = shifted240x.every(
    (value, index) => Math.abs(value / shifted1x[index]! - TF_4H_OVER_1M_RATIO) < 1e-9,
  );
  assert.ok(ratioAtEveryIndex, "the 240x universe is not a uniform multiplier of the 1x universe — fix the generator");
});
