/**
 * `T-05.9` — THE GEOMETRY OF THE LIQUIDATION PANE, MEASURED IN PIXELS AGAINST THE REAL LIBRARY.
 *
 * Sibling of `volume-subaxis-geometry.test.ts`, and it exists because that file's own lesson was
 * paid in a `design_gate` `NEEDS_FIX`: with the whole suite green, `67,9%` of the volume bars were
 * being drawn below one physical pixel for two tasks, because BAR HEIGHT IS NOT A STRING ONE CAN
 * GREP. It comes out of the interaction between scale mode, histogram base, margins and pane
 * height, and only the library knows the number — so this file asks IT (`priceToCoordinate`),
 * inside a `jsdom`, with the same shim `charts` already uses for axis fidelity.
 *
 * ⛔ AND THE CONSTANTS ARE READ FROM THE PRODUCTION SOURCE, NOT RETYPED HERE. A copy of the
 * margins/base/heights would measure the configuration THIS file chose, not the one the screen
 * draws — and it would stay green while production regressed, which is exactly the false-green
 * `gates/design-01.md` found. If a constant is renamed the parse FAILS instead of defaulting.
 *
 * ── WHAT THIS FILE PROVES THAT `T-01.8`'s DID NOT, AND THE DIFFERENCE IS THE POINT ───────────
 *
 * There the ordering `ausência < zero < menor barra presente` was MEASURED over one universe: true
 * for that data, not guaranteed for all data. A liquidation of `2 USD` on a `log10` scale anchored
 * at base `1` would draw a bar shorter than the zero mark and re-create the very collision
 * `BLOCKER-2` closed. Here the two bands are DISJOINT BY SCALE MARGIN — the marks live in the
 * bottom `1 - top` of the pane and the bar baseline sits at `bottom`, with `bottom > 1 - top` — so
 * no bar of ANY value reaches the marks band. The universe below deliberately contains a value far
 * below anything ever observed on this series, precisely so the claim is tested and not assumed.
 *
 * THE UNIVERSE: the shape MEASURED on the real 4-day window the route asks for
 * `[MEDIDO 2026-09-16, GET /api/v1/series-history, series_key_id=23e4332… (BTCUSDT/long),
 *  bar_policy=final_only: 5.761 grades, 191 com observação, 62 delas ZERO legítimo, min 75,62 ·
 *  p50 6.489,82 · max 2.880.132,45 ⇒ max/p50 = 443,8x]`. Synthetic and not the on-disk corpus on
 * purpose, the same reason the volume file gives: what fails here is the RATIO and the SPARSITY,
 * which are properties of the distribution, and tying a form gate to a non-versioned capture would
 * turn it into a `RECUSA` by environment (`scripts/verify.sh` §1c).
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

import { absenceMarkSeries, flushFrames, installGlobals, positiveValueSeriesLossless, zeroMarkSeries } from "../../charts/index.ts";
import { chartConstructorOptions } from "./chart-options.ts";

const SYMBOL_CLIENT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "SymbolClient.tsx");
const source = readFileSync(SYMBOL_CLIENT_PATH, "utf8");

/** Reads a numeric module constant from the production source. Fails instead of defaulting: a
 * default here is the measurement silently switching to another object. */
function productionNumber(name: string): number {
  const match = new RegExp(`const ${name} = (-?\\d+(?:\\.\\d+)?);`).exec(source);
  assert.ok(match !== null, `${name} was not found in SymbolClient.tsx — the anchor moved, fix this test`);
  return Number(match[1]);
}

/** Reads a `{ top, bottom }` margin constant from the production source, same posture. */
function productionMargins(name: string): { readonly top: number; readonly bottom: number } {
  const match = new RegExp(`const ${name} = \\{ top: ([\\d.]+), bottom: ([\\d.]+) \\} as const;`).exec(source);
  assert.ok(match !== null, `${name} was not found in SymbolClient.tsx — the anchor moved, fix this test`);
  return { top: Number(match[1]), bottom: Number(match[2]) };
}

const CHART_HEIGHT_PX = productionNumber("CHART_HEIGHT_PX");
const LIQUIDATION_LOG_BASE = productionNumber("LIQUIDATION_LOG_BASE");
const LIQUIDATION_ABSENCE_MARK_PX = productionNumber("LIQUIDATION_ABSENCE_MARK_PX");
const LIQUIDATION_ZERO_MARK_PX = productionNumber("LIQUIDATION_ZERO_MARK_PX");
const LIQUIDATION_BAR_SCALE_MARGINS = productionMargins("LIQUIDATION_BAR_SCALE_MARGINS");
const LIQUIDATION_MARKS_SCALE_MARGINS = productionMargins("LIQUIDATION_MARKS_SCALE_MARGINS");
const LIQUIDATION_MARKS_BAND_PX = CHART_HEIGHT_PX * (1 - LIQUIDATION_MARKS_SCALE_MARGINS.top);

/** The scale mode production applies to the liquidation BAR scale, read from the source —
 * `"Logarithmic"`, `"Normal"`, or `null` when no mode is applied at all (which IS the linear mode,
 * and is the defect). Anchored to `barSeries` on purpose: an unanchored regex would be satisfied by
 * the volume sub-axis's own logarithmic scale, which is the failure mode that made
 * `volume-subaxis-dom-contract.test.ts`'s guard go vacuous the moment this pane was added. */
function productionBarScaleMode(): string | null {
  const match = /barSeries\s*\n?\s*\.priceScale\(\)[\s\S]{0,200}?mode: PriceScaleMode\.(\w+)/.exec(source);
  return match === null ? null : match[1]!;
}

// ── The synthetic universe: the real series' sparsity AND its long tail ──────────────────────

const ONE_MINUTE_MS = 60_000;
/** The pane width only enters the bar's WIDTH, never its height — which is what this file
 * measures. Pinned anyway so the measurement does not depend on the `clientWidth` of a jsdom
 * `<div>` (which is `0`, and the component would fall back to its `|| 600`). */
const MEASUREMENT_WIDTH_PX = 1_200;
/** `4 * 24 * 60 + 1` — the route's own 4-day window on the 1-minute grid. */
const GRID_SLOTS = 5_761;
/** `191` observações em `5.761` grades `[MEDIDO 2026-09-16]`, das quais `62` são zero legítimo. */
const PRESENT_SLOTS = 191;
const ZERO_SLOTS = 62;

const REAL_MAX_OVER_P50 = 443.8;
const REAL_MIN = 75.62;
const REAL_MAX = 2_880_132.45;
/** `0.5 ** SKEW` has to equal `log10(p50/min) / log10(max/min)` = `(3.8122 - 1.8787) / 4.5807` =
 * `0.4221` ⇒ `SKEW = ln(0.4221)/ln(0.5) = 1.244`. Written out and VERIFIED by the universe test
 * below, so a convenience tweak fails instead of silently loosening the negative control. */
const SKEW = 1.244;

/** ⛔ A VALUE FAR BELOW ANYTHING EVER OBSERVED ON THIS SERIES, on purpose. `T-01.8`'s ordering was
 * true for its universe; this one is the counter-example that would have broken it — on a `log10`
 * scale anchored at base `1` this bar is a fraction of a decade tall, well inside the height the
 * zero mark occupies. The disjointness test below has to hold for it too, and it holds because the
 * separation is a scale margin, not a measured luck. */
const MICRO_LIQUIDATION_USD = 2;

interface Slot {
  readonly time: number;
  readonly value: number | null;
}

/** Where the micro liquidation sits among the observations — the middle, so it is inside the
 * visible range whatever `fitContent` decides. */
const MICRO_AT_ORDINAL = 95;

/**
 * The sparse, long-tailed universe, from a deterministic generator (no `Math.random`: a test that
 * changes universe on every run is not a gate). Absences are the DEFAULT state — `5.570` of `5.761`
 * — which is what this series looks like and what makes the absence mark load-bearing here rather
 * than a nicety.
 *
 * ⛔ THE ZEROS ARE SPREAD ACROSS THE WINDOW, NOT STACKED AT ITS LEFT EDGE, and that is a
 * MEASUREMENT CONSTRAINT this file learned the hard way rather than a stylistic choice. With all
 * `62` zeros in the first fifth of the window, `fitContent` over `5.761` bars left them outside the
 * visible logical range, the zero series had no `firstValue`, and `priceToCoordinate` answered
 * `null` — the instrument silently measuring nothing `[MEDIDO 2026-09-16: z.data().length = 62,
 * z.priceToCoordinate(18) = null, enquanto a série de ausência respondia 175,97]`. Spreading them
 * is also what the real series does: the zeros are interleaved with the events, not a prefix.
 */
function syntheticLiquidationSlots(): readonly Slot[] {
  const slots: Slot[] = [];
  // The observations are spread evenly across the window so no test can accidentally depend on
  // them clustering; WHICH grid instants carry them is irrelevant to every assertion below.
  const stride = Math.floor(GRID_SLOTS / PRESENT_SLOTS);
  let observed = 0;
  let zerosPlaced = 0;
  for (let i = 0; i < GRID_SLOTS; i += 1) {
    const time = i * ONE_MINUTE_MS;
    if (i % stride !== 0 || observed >= PRESENT_SLOTS) {
      slots.push({ time, value: null });
      continue;
    }
    const ordinal = observed;
    observed += 1;
    if (ordinal === MICRO_AT_ORDINAL) {
      slots.push({ time, value: MICRO_LIQUIDATION_USD });
      continue;
    }
    if (ordinal % 3 === 1 && zerosPlaced < ZERO_SLOTS) {
      zerosPlaced += 1;
      slots.push({ time, value: 0 });
      continue;
    }
    // Low-discrepancy sequence (Van der Corput base 2), mapped into log-space.
    let bits = ordinal;
    let fraction = 0;
    let denominator = 0.5;
    while (bits > 0) {
      fraction += (bits % 2) * denominator;
      bits = Math.floor(bits / 2);
      denominator /= 2;
    }
    slots.push({ time, value: REAL_MIN * 10 ** (fraction ** SKEW * Math.log10(REAL_MAX / REAL_MIN)) });
  }
  return slots;
}

interface Measurement {
  /** Height in pixels of every STRICTLY POSITIVE bar, from the bar series' own baseline. */
  readonly barHeightsPx: readonly number[];
  readonly absenceMarkPx: number;
  readonly zeroMarkPx: number;
  /** ⛔ THE TWO NUMBERS THE DISJOINTNESS CLAIM IS MADE OF, in absolute canvas coordinates (y grows
   * DOWNWARD): where the bar series' baseline sits, and where the TOP of the tallest mark sits.
   * `barBaselineY < zeroMarkTopY` is the whole claim — the bar band starts strictly above the mark
   * band, for every value, not just for the ones this universe happens to carry. */
  readonly barBaselineY: number;
  readonly zeroMarkTopY: number;
}

/** Builds ONE cohort surface with the production configuration (`mode` and the marks margin
 * parameterised only for the negative controls) and asks the library for the pixels. */
async function measureCohortSurface(
  slots: readonly Slot[],
  options: { readonly mode: "Logarithmic" | "Normal"; readonly marksMarginTop?: number },
): Promise<Measurement> {
  const dom = new JSDOM('<!doctype html><html><body><div id="chart"></div></body></html>', { pretendToBeVisual: true });
  installGlobals(dom);
  const lc = await import("lightweight-charts");
  const container = dom.window.document.getElementById("chart");
  assert.ok(container !== null, "broken invariant: the chart container does not exist in the DOM");

  // ⛔ The options come from `chartConstructorOptions`, the SAME call `useLightweightChart` makes.
  // Measuring the geometry of a pane built by another constructor would measure another pane, and
  // `chart-construction.test.ts` (`DR-1`) requires this of every `createChart` under `app/`.
  const chart = lc.createChart(container, chartConstructorOptions(MEASUREMENT_WIDTH_PX, CHART_HEIGHT_PX));
  const barSeries = chart.addSeries(lc.HistogramSeries, {
    base: LIQUIDATION_LOG_BASE,
    priceLineVisible: false,
    lastValueVisible: false,
  });
  barSeries.priceScale().applyOptions({
    scaleMargins: LIQUIDATION_BAR_SCALE_MARGINS,
    mode: options.mode === "Logarithmic" ? lc.PriceScaleMode.Logarithmic : lc.PriceScaleMode.Normal,
  });
  barSeries.setData(positiveValueSeriesLossless(slots) as never);

  const markStyle = {
    priceScaleId: "liquidation_marks",
    priceLineVisible: false,
    lastValueVisible: false,
    autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: LIQUIDATION_MARKS_BAND_PX } }),
  };
  const absence = chart.addSeries(lc.HistogramSeries, markStyle);
  absence.priceScale().applyOptions({
    scaleMargins: {
      top: options.marksMarginTop ?? LIQUIDATION_MARKS_SCALE_MARGINS.top,
      bottom: LIQUIDATION_MARKS_SCALE_MARGINS.bottom,
    },
  });
  absence.setData(absenceMarkSeries(slots, LIQUIDATION_ABSENCE_MARK_PX) as never);
  const zero = chart.addSeries(lc.HistogramSeries, markStyle);
  zero.setData(zeroMarkSeries(slots, LIQUIDATION_ZERO_MARK_PX) as never);

  chart.timeScale().fitContent();
  await flushFrames(dom, 3);

  const barBase = barSeries.priceToCoordinate(LIQUIDATION_LOG_BASE);
  const markBase = absence.priceToCoordinate(0);
  const zeroTop = zero.priceToCoordinate(LIQUIDATION_ZERO_MARK_PX);
  assert.ok(
    barBase !== null && markBase !== null && zeroTop !== null,
    "the library did not place one of the baselines — the measurement would be vacuous",
  );
  const barHeightsPx = slots
    .filter((slot): slot is Slot & { value: number } => slot.value !== null && slot.value > 0)
    .map((slot) => {
      const coordinate = barSeries.priceToCoordinate(slot.value);
      assert.ok(coordinate !== null, `the bar of ${slot.value} got no coordinate`);
      return (barBase as number) - (coordinate as number);
    });
  const heightOf = (series: typeof absence, value: number): number => {
    const coordinate = series.priceToCoordinate(value);
    assert.ok(coordinate !== null, `the mark of ${value} got no coordinate`);
    return (markBase as number) - (coordinate as number);
  };
  const measurement: Measurement = {
    barHeightsPx,
    absenceMarkPx: heightOf(absence, LIQUIDATION_ABSENCE_MARK_PX),
    zeroMarkPx: heightOf(zero, LIQUIDATION_ZERO_MARK_PX),
    barBaselineY: barBase as number,
    zeroMarkTopY: zeroTop as number,
  };
  chart.remove();
  dom.window.close();
  return measurement;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/** Below one PHYSICAL pixel a mark is indistinguishable from the absence of a mark — which for
 * this pane means indistinguishable from `SEM_PONTO`. WCAG 1.4.11 fails it, and no contrast ratio
 * rescues a mark that is not there. */
const PIXEL_FLOOR = 1;
/** The median bar has to be legible, not merely "above zero". */
const MEDIAN_FLOOR_PX = 6;

test("the synthetic universe reproduces the real series' sparsity AND its max/p50 ratio", () => {
  // ⛔ THE UNIVERSE IS DECLARED AND VERIFIED, not assumed. What produces the sub-pixel defect is the
  // RATIO between maximum and median; what makes the absence mark load-bearing is the SPARSITY. If
  // a tweak shrinks either, the negative controls below turn into decoration — failing HERE instead
  // of later and in silence.
  const slots = syntheticLiquidationSlots();
  assert.equal(slots.length, GRID_SLOTS);
  const present = slots.filter((slot) => slot.value !== null);
  const zeros = slots.filter((slot) => slot.value === 0);
  assert.equal(present.length, PRESENT_SLOTS, "the universe lost its measured density");
  assert.equal(zeros.length, ZERO_SLOTS, "the universe lost its legitimate zeros — the whole collision would be untested");
  const absent = slots.length - present.length;
  assert.ok(absent / slots.length > 0.9, `only ${((absent / slots.length) * 100).toFixed(1)}% absent — the real series is 96,7%`);
  const positives = present.filter((slot): slot is Slot & { value: number } => slot.value! > 0).map((slot) => slot.value);
  const ratio = Math.max(...positives) / median(positives);
  assert.ok(
    Math.abs(ratio - REAL_MAX_OVER_P50) / REAL_MAX_OVER_P50 < 0.15,
    `synthetic max/p50 = ${ratio.toFixed(1)}x against the ${REAL_MAX_OVER_P50}x measured on the real 4-day window`,
  );
  assert.ok(positives.includes(MICRO_LIQUIDATION_USD), "the sub-observed micro value must be in the universe");
});

test("no present bar falls below 1 pixel, and the median is legible", async () => {
  const { barHeightsPx } = await measureCohortSurface(syntheticLiquidationSlots(), { mode: "Logarithmic" });
  assert.ok(barHeightsPx.length > 100, `universe too small (${barHeightsPx.length}) — the measurement would be weak`);
  const subPixel = barHeightsPx.filter((height) => height < PIXEL_FLOOR);
  assert.equal(
    subPixel.length,
    0,
    `${subPixel.length}/${barHeightsPx.length} bars below ${PIXEL_FLOOR}px — a sub-pixel bar is, on the canvas, ` +
      "the same thing as the absence: nothing (WCAG 1.4.11)",
  );
  const p50 = median(barHeightsPx);
  assert.ok(p50 >= MEDIAN_FLOOR_PX, `median bar of ${p50.toFixed(2)}px, below the floor of ${MEDIAN_FLOOR_PX}px`);
});

test("MORDE: the SAME series on the LINEAR scale fails the assertion above — the negative control", async () => {
  // ⛔ Without this half the green above is not evidence: it would be a claim the instrument was
  // never shown able to reject. The mutation is the configuration a developer gets by DEFAULT — a
  // price scale with no `mode` applied is linear.
  const { barHeightsPx } = await measureCohortSurface(syntheticLiquidationSlots(), { mode: "Normal" });
  const subPixel = barHeightsPx.filter((height) => height < PIXEL_FLOOR);
  assert.ok(
    subPixel.length > barHeightsPx.length / 2,
    `the linear scale left only ${subPixel.length}/${barHeightsPx.length} bars sub-pixel — the negative ` +
      "control stopped reproducing the defect, and without it the test above proves nothing",
  );
  assert.ok(
    median(barHeightsPx) < PIXEL_FLOOR,
    "the linear median stopped being sub-pixel — re-anchor this control rather than deleting it",
  );
});

test("production APPLIES the logarithmic mode to the BAR scale — the mode measured above is the screen's", () => {
  // The measurement would use the right configuration even if production used the wrong one; this
  // is the tie between the two. `null` (no `mode` applied) IS the defect: the default is linear.
  assert.equal(productionBarScaleMode(), "Logarithmic", "the liquidation bar scale in SymbolClient.tsx is not logarithmic");
});

test("RN-1 in pixels: absence DRAWS, and it does not draw what the legitimate zero draws", async () => {
  const { absenceMarkPx, zeroMarkPx } = await measureCohortSurface(syntheticLiquidationSlots(), { mode: "Logarithmic" });
  // 1. Absence draws at all — the third channel of `D5.3` that a bare `WhitespaceItem` does not have.
  assert.ok(
    absenceMarkPx >= PIXEL_FLOOR,
    `the absence mark measures ${absenceMarkPx.toFixed(2)}px — below 1px it does not exist`,
  );
  // 2. And it does not draw the SAME thing as the legitimate zero. For THIS series that collision is
  //    not hypothetical: 62 of 191 observations over the 4-day window ARE zeros `[MEDIDO 2026-09-16]`.
  assert.ok(
    zeroMarkPx >= 2 * absenceMarkPx,
    `zero (${zeroMarkPx.toFixed(2)}px) and absence (${absenceMarkPx.toFixed(2)}px) do not separate by height — ` +
      '"não houve liquidação" and "não sabemos" would be the same claim again',
  );
});

test("the BANDS are disjoint: no bar reaches the marks band — including one far below anything observed", async () => {
  // ⛔ THIS IS THE CLAIM `T-01.8` COULD NOT MAKE. There the ordering held because of the values that
  // happened to be in the data; here it holds because the bar baseline sits ABOVE the top of the
  // tallest mark, so the shortest bar expressible is still above the marks. `y` grows DOWNWARD.
  const { barBaselineY, zeroMarkTopY, barHeightsPx } = await measureCohortSurface(syntheticLiquidationSlots(), {
    mode: "Logarithmic",
  });
  assert.ok(
    barBaselineY < zeroMarkTopY,
    `the bar baseline (y=${barBaselineY.toFixed(2)}) is not above the top of the zero mark (y=${zeroMarkTopY.toFixed(2)}) — ` +
      "the two bands overlap and a small enough liquidation is drawn where the zero mark is",
  );
  // The micro bar is in the universe and it is the shortest one; the claim above covers it by
  // construction, and this line makes the coverage visible rather than implied.
  assert.ok(Math.min(...barHeightsPx) >= 0, "a negative bar height would mean the baseline moved below the data");
  assert.ok(
    zeroMarkTopY - barBaselineY > PIXEL_FLOOR,
    `the gap between the bands is ${(zeroMarkTopY - barBaselineY).toFixed(2)}px — under a pixel it is not a separation`,
  );
});

test("MORDE: raising the marks band into the bars makes the disjointness assert FAIL", async () => {
  // The mutation is the one a careless restyle would make: giving the marks the same margin the
  // bars have, so the two bands share pixels again. Without this half, the green above could be a
  // property of the library rather than of the configuration.
  const { barBaselineY, zeroMarkTopY } = await measureCohortSurface(syntheticLiquidationSlots(), {
    mode: "Logarithmic",
    marksMarginTop: LIQUIDATION_BAR_SCALE_MARGINS.top,
  });
  assert.ok(
    barBaselineY >= zeroMarkTopY,
    `with the marks band raised to the bars' own margin the separation SURVIVED (bar baseline y=${barBaselineY.toFixed(2)}, ` +
      `zero mark top y=${zeroMarkTopY.toFixed(2)}) — the assert above is not measuring the margin, re-anchor it`,
  );
});

test("MORDE: the three mark series draw on EXACTLY their own instants, and never on each other's", () => {
  // This half is about COUNT, not pixels: it proves the mapping is a partition. An implementation
  // that "marked everything" or "marked nothing" would pass every height floor above and fail here.
  const slots = syntheticLiquidationSlots();
  const absent = slots.filter((slot) => slot.value === null).length;
  const zeros = slots.filter((slot) => slot.value === 0).length;
  assert.ok(absent > 0 && zeros > 0, "the universe lost its gaps or its zeros — the measurement would be vacuous");
  const absenceMarks = absenceMarkSeries(slots, LIQUIDATION_ABSENCE_MARK_PX).filter((item) => "value" in item);
  const zeroMarks = zeroMarkSeries(slots, LIQUIDATION_ZERO_MARK_PX).filter((item) => "value" in item);
  const bars = positiveValueSeriesLossless(slots).filter((item) => "value" in item);
  assert.equal(absenceMarks.length, absent, "the absence series must mark exactly the gaps");
  assert.equal(zeroMarks.length, zeros, "the zero series must mark exactly the legitimate zeros");
  assert.equal(bars.length, slots.length - absent - zeros, "the bar series draws on neither of the other two");
  // A partition: every slot is covered exactly once by exactly one of the three.
  assert.equal(absenceMarks.length + zeroMarks.length + bars.length, slots.length);
});
