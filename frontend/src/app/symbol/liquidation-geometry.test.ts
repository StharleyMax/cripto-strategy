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
 * for that data, not guaranteed for all data. Here the two bands are DISJOINT BY SCALE MARGIN, and
 * the separation is an inequality between two production constants:
 *
 *     1 - LIQUIDATION_BAR_SCALE_MARGINS.bottom  <  LIQUIDATION_MARKS_SCALE_MARGINS.top
 *
 * ⛔ AND THE CLAIM IS ABOUT THE BAND'S **FLOOR**, NOT ABOUT THE BAR'S BASELINE — which is the
 * correction this file carries after `T-05.10`'s `design_gate` FALSIFIED its previous wording
 * (`M-1` of `docs/context/cinco-metricas-do-core/gates/design-05.md`). What it used to say was
 * *"the bar baseline sits above the top of the tallest mark, so no bar of ANY value reaches the
 * marks band"*, and the second half does not follow from the first: on a histogram with `base = 1`
 * a value BELOW the base draws DOWNWARD from the baseline, so the baseline is a starting point and
 * never a floor. Measured: with the micro value outside the visible range, `priceToCoordinate`
 * extrapolates `0,26 → y = 176,36`, inside the zero mark's own height (`175,97`).
 *
 * WHAT IS TRUE, AND IT IS UNCONDITIONAL ON THE DATA: every bar that is actually DRAWN ends at or
 * above the FLOOR of the bar band, `y = H·(1 - bottom)`, because the bar series is ALONE on an
 * AUTOSCALED price scale — the smallest visible value is, by definition, the one that lands on the
 * floor. The floor does not move with the data; the BASELINE does. The sweep below measures both
 * across five decades, and three mutations show what breaks the guarantee.
 *
 * ⚠️ NOT unconditional on the CONFIGURATION, and the two preconditions are mutation-tested here:
 * the inequality above, and the bar scale's autoscale. Pinning the latter puts a `0,003` bar at
 * `y = 221,47`, below the pane floor itself.
 *
 * ⚠️ WHAT IT DOES NOT COVER: a bar OUTSIDE the visible range is not drawn at all, so the claim says
 * nothing about it — and that the declared window is not the drawn one is `M-2` of the same gate,
 * escalated because it is transversal to the four panes.
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

import {
  absenceMarkSeries,
  flushFrames,
  installGlobals,
  paneScaleMargins,
  positiveValueSeriesLossless,
  zeroMarkSeries,
} from "../../charts/index.ts";
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

/**
 * ⛔ THE SECOND PRECONDITION OF THE DISJOINTNESS GUARANTEE, READ OFF PRODUCTION.
 *
 * The bar band's FLOOR only holds still because the bar scale AUTOSCALES: the smallest visible
 * value is the one that lands on `H·(1 - bottom)`. Pin that scale — an `autoscaleInfoProvider` on
 * the bar series, or `autoScale: false` — and a value below the base walks straight out of the band
 * and off the pane (the `MORDE` below measures `y = 221,47` against a pane floor of `191`).
 *
 * The marks series DO pin theirs, deliberately and for the opposite reason (their height must be
 * the mark's, never the data's) — so this check is anchored to `barStyle` and to the bar scale's
 * own `applyOptions`, and a blanket grep for `autoscaleInfoProvider` would be satisfied by the
 * marks and prove nothing.
 */
function productionBarScaleIsAutoscaled(): boolean {
  const style = /const barStyle: Partial<HistogramSeriesOptions> = \{([\s\S]*?)\n\s*\};/.exec(source);
  assert.ok(style !== null, "barStyle was not found in SymbolClient.tsx — the anchor moved, fix this test");
  const scale = /barSeries\.priceScale\(\)\.applyOptions\(\{([\s\S]*?)\n\s*\}\);/.exec(source);
  assert.ok(scale !== null, "the bar scale's applyOptions was not found in SymbolClient.tsx — the anchor moved, fix this test");
  const declared = `${style[1]!}${scale[1]!}`;
  return !declared.includes("autoscaleInfoProvider") && !/autoScale:\s*false/.test(declared);
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

/**
 * ⛔ THE COUNTER-EXAMPLE, AND IT HAD TO BE REPLACED BECAUSE THE PREVIOUS ONE COULD NOT FAIL.
 *
 * It used to be `2`, with `LIQUIDATION_LOG_BASE = 1` — a value ABOVE the base, therefore on the
 * safe side BY CONSTRUCTION, so the assertion it was supposed to challenge was true whatever the
 * configuration did. `T-05.10`'s `design_gate` named it for what it was: decoration, the same
 * false-green class this file was written to kill.
 *
 * `0.003` is not hypothetical and not chosen for drama: it is the number
 * `backend/src/modules/sentimento/domain/liquidation_catalog.py:34-38` MEASURED coming out of the
 * provider's own default (`convert_to_usd=false` returns BASE units — `BTC 0.003`). So the
 * counter-example is the shape of a REAL regression: if `CONVERT_TO_USD_REQUIRED` ever stops
 * reaching the request, every value in this pane looks like this one.
 */
const MICRO_LIQUIDATION_USD = 0.003;
/** Five decades, straddling the base: one above it and four below. The guarantee has to hold
 * identically across all of them — and what proves it is not merely that each passes, but that the
 * measured floor is the SAME number for the sub-base ones while the baseline moves. */
const MICRO_SWEEP_USD = [2, 0.26, 0.1, 0.01, 0.003] as const;

interface Slot {
  readonly time: number;
  readonly value: number | null;
}

/**
 * Where the micro liquidation sits among the observations — the LAST one, so that it is inside the
 * visible range and therefore actually DRAWN.
 *
 * ⛔ IT USED TO BE `95` ("the middle, so it is inside the visible range whatever `fitContent`
 * decides"), and that parenthesis was FALSE — which is the second half of why the old assertion
 * measured nothing. `fitContent` over `5.761` grades saturates at `minBarSpacing`, and the visible
 * logical range comes back anchored to the RIGHT: `[3485, 5760]` at `1.200px`
 * `[MEDIDO 2026-09-16, getVisibleLogicalRange() after fitContent]`. Observation `95` sits at grid
 * index `2850` — OUTSIDE it, so it was neither drawn nor included in the autoscale, and every
 * coordinate the file read for it was an EXTRAPOLATION. Ordinal `190` is at grid index `5700`,
 * inside the range; the sweep below asserts that instead of asserting it in prose.
 */
const MICRO_AT_ORDINAL = 190;
/** One observation every `OBSERVATION_STRIDE` grid slots — the generator's own spreading rule,
 * lifted to module scope so the measurement can say WHERE the micro bar is without re-deriving it
 * (and drifting from it). */
const OBSERVATION_STRIDE = Math.floor(GRID_SLOTS / PRESENT_SLOTS);
const MICRO_GRID_INDEX = MICRO_AT_ORDINAL * OBSERVATION_STRIDE;

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
function syntheticLiquidationSlots(micro: number = MICRO_LIQUIDATION_USD): readonly Slot[] {
  const slots: Slot[] = [];
  // The observations are spread evenly across the window so no test can accidentally depend on
  // them clustering; WHICH grid instants carry them is irrelevant to every assertion below.
  const stride = OBSERVATION_STRIDE;
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
      slots.push({ time, value: micro });
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
  /** VISUAL height in pixels of every STRICTLY POSITIVE bar — the ABSOLUTE distance between the
   * bar's tip and the series' baseline. Absolute on purpose: a value below the histogram's `base`
   * draws DOWNWARD, and the number this feeds (the sub-pixel floor) asks how many pixels the bar
   * OCCUPIES, which has no sign. The direction is not lost — it is exactly what `lowestDrawnBarY`
   * below carries, and that is where the collision claim is decided. */
  readonly barHeightsPx: readonly number[];
  readonly absenceMarkPx: number;
  readonly zeroMarkPx: number;
  /** ⛔ THE NUMBER THE DISJOINTNESS CLAIM IS ACTUALLY MADE OF (y grows DOWNWARD): the LOWEST pixel
   * any DRAWN bar reaches — the maximum `y` over every positive value inside the visible logical
   * range. `lowestDrawnBarY < marksBandTopY` is the whole claim. It is NOT `barBaselineY`, which is
   * where a bar STARTS and which moves with the data. */
  readonly lowestDrawnBarY: number;
  /** Where the marks' own band begins — `priceToCoordinate(LIQUIDATION_MARKS_BAND_PX)` on the marks
   * scale. Stricter than `zeroMarkTopY`: the band is the territory, the zero mark is only the
   * tallest thing standing in it today. */
  readonly marksBandTopY: number;
  readonly barBaselineY: number;
  readonly zeroMarkTopY: number;
  /** The pane's own floor in pixels — `priceToCoordinate(0)` on the marks scale, whose bottom
   * margin is `0`. It is the pane HEIGHT after the time axis took its share, and it is what turns
   * the production margin (a fraction) into the pixel bound the bars may not pass. */
  readonly paneFloorY: number;
  /** The recorte `fitContent` actually produced, so a test can assert that what it measured was
   * DRAWN instead of extrapolated. */
  readonly visibleFrom: number;
  readonly visibleTo: number;
  /** Whether the micro value's grid slot fell inside that recorte. `false` would make every micro
   * measurement in this file an extrapolation again — which is how the previous version went
   * vacuous. */
  readonly microDrawn: boolean;
}

/** Builds ONE cohort surface with the production configuration (`mode` and the marks margin
 * parameterised only for the negative controls) and asks the library for the pixels. */
async function measureCohortSurface(
  slots: readonly Slot[],
  options: {
    readonly mode: "Logarithmic" | "Normal";
    readonly marksMarginTop?: number;
    /** Mutation knob: the bar scale's own bottom margin, which is one half of the inequality the
     * guarantee rests on. */
    readonly barMarginBottom?: number;
    /** Mutation knob: pins the bar scale's autoscale, which is the OTHER half. Production must not
     * do this, and `productionBarScaleIsAutoscaled()` is what keeps it from starting to. */
    readonly pinBarAutoscale?: boolean;
  },
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
    ...(options.pinBarAutoscale === true
      ? { autoscaleInfoProvider: () => ({ priceRange: { minValue: LIQUIDATION_LOG_BASE, maxValue: REAL_MAX } }) }
      : {}),
  });
  barSeries.priceScale().applyOptions({
    scaleMargins: {
      top: LIQUIDATION_BAR_SCALE_MARGINS.top,
      bottom: options.barMarginBottom ?? LIQUIDATION_BAR_SCALE_MARGINS.bottom,
    },
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
      return Math.abs((barBase as number) - (coordinate as number));
    });

  // ⛔ THE FLOOR, AND IT IS COMPUTED ONLY OVER WHAT IS DRAWN. A slot outside the visible logical
  // range is not painted, and `priceToCoordinate` answers for it by EXTRAPOLATING off the pane —
  // folding those numbers in would measure a bar nobody can see, which is precisely the mistake
  // that made the previous version of this file claim more than the geometry gives.
  const visible = chart.timeScale().getVisibleLogicalRange();
  assert.ok(visible !== null, "the time scale has no visible range — the measurement would be vacuous");
  let lowestDrawnBarY = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < slots.length; index += 1) {
    const value = slots[index]!.value;
    if (value === null || value <= 0 || index < visible.from || index > visible.to) {
      continue;
    }
    const coordinate = barSeries.priceToCoordinate(value);
    assert.ok(coordinate !== null, `the drawn bar of ${value} got no coordinate`);
    lowestDrawnBarY = Math.max(lowestDrawnBarY, coordinate as number);
  }
  assert.ok(Number.isFinite(lowestDrawnBarY), "no positive bar is inside the visible range — nothing was measured");
  const marksBandTop = absence.priceToCoordinate(LIQUIDATION_MARKS_BAND_PX);
  assert.ok(marksBandTop !== null, "the marks band has no top coordinate — the measurement would be vacuous");
  const heightOf = (series: typeof absence, value: number): number => {
    const coordinate = series.priceToCoordinate(value);
    assert.ok(coordinate !== null, `the mark of ${value} got no coordinate`);
    return (markBase as number) - (coordinate as number);
  };
  const measurement: Measurement = {
    barHeightsPx,
    absenceMarkPx: heightOf(absence, LIQUIDATION_ABSENCE_MARK_PX),
    zeroMarkPx: heightOf(zero, LIQUIDATION_ZERO_MARK_PX),
    lowestDrawnBarY,
    marksBandTopY: marksBandTop as number,
    barBaselineY: barBase as number,
    zeroMarkTopY: zeroTop as number,
    paneFloorY: markBase as number,
    visibleFrom: visible.from,
    visibleTo: visible.to,
    microDrawn: MICRO_GRID_INDEX >= visible.from && MICRO_GRID_INDEX <= visible.to,
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
  // ⛔ THE ANTI-VACUITY GUARD, and it is the one this file did not have. A counter-example at or
  // above the histogram base is on the safe side BY CONSTRUCTION: every disjointness assertion
  // would hold no matter what the configuration did, which is how `2` passed while proving nothing
  // (`T-05.10`, `M-1`).
  assert.ok(
    MICRO_LIQUIDATION_USD < LIQUIDATION_LOG_BASE,
    `the counter-example is ${MICRO_LIQUIDATION_USD}, not below the histogram base of ${LIQUIDATION_LOG_BASE} — ` +
      "a bar at or above the base cannot be drawn downward, so it cannot challenge the claim it is here to challenge",
  );
  assert.ok(
    MICRO_SWEEP_USD.filter((micro) => micro < LIQUIDATION_LOG_BASE).length >= 3,
    "fewer than three sweep values are below the histogram base — the sweep stopped spanning the regime that fails",
  );
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

test("the BANDS are disjoint by SCALE MARGIN — an inequality between two production constants", () => {
  // ⛔ THE STRUCTURAL HALF, AND IT IS PURE ARITHMETIC OVER THE SOURCE. The pixels below are what the
  // library does with these two numbers; this is the number itself. It fails the moment someone
  // restyles either margin into the other's territory, without needing a canvas to notice.
  const barBandFloor = 1 - LIQUIDATION_BAR_SCALE_MARGINS.bottom;
  const marksBandTop = LIQUIDATION_MARKS_SCALE_MARGINS.top;
  assert.ok(
    barBandFloor < marksBandTop,
    `the bar band's floor is at ${(barBandFloor * 100).toFixed(0)}% of the pane and the marks band starts at ` +
      `${(marksBandTop * 100).toFixed(0)}% — the bars own pixels the marks also own, and a small enough ` +
      "liquidation is drawn where the zero mark is",
  );
});

test("the bar band's FLOOR is what no drawn bar passes — across five decades, four of them BELOW the base", async () => {
  // ⛔ THIS IS THE CLAIM `T-01.8` COULD NOT MAKE, IN THE ONLY FORM IN WHICH IT IS TRUE. The previous
  // version asserted `barBaselineY < zeroMarkTopY` and read it as "no bar of any value" — a
  // non-sequitur `T-05.10`'s gate falsified: the baseline is where a bar STARTS, and a value below
  // `base` draws DOWNWARD from it. What holds for every value is the FLOOR, and the proof that it
  // is a property of the CONFIGURATION rather than of this universe is that the floor comes back as
  // the SAME number for every sub-base value while the baseline moves across decades.
  const subBaseFloors: number[] = [];
  const baselines: number[] = [];
  for (const micro of MICRO_SWEEP_USD) {
    const measurement = await measureCohortSurface(syntheticLiquidationSlots(micro), { mode: "Logarithmic" });
    assert.ok(
      measurement.microDrawn,
      `the micro value ${micro} sits at grid index ${MICRO_GRID_INDEX}, outside the visible range ` +
        `[${measurement.visibleFrom.toFixed(0)}, ${measurement.visibleTo.toFixed(0)}] — it is NOT drawn, so this ` +
        "measurement would be an extrapolation and the assertion below would prove nothing",
    );
    assert.ok(
      measurement.lowestDrawnBarY < measurement.marksBandTopY,
      `with a liquidation of ${micro} the lowest DRAWN bar reaches y=${measurement.lowestDrawnBarY.toFixed(2)}, ` +
        `inside the marks band that starts at y=${measurement.marksBandTopY.toFixed(2)} — a real liquidation is ` +
        "being painted where the pane says 'zero legítimo' lives",
    );
    assert.ok(
      measurement.zeroMarkTopY - measurement.lowestDrawnBarY > PIXEL_FLOOR,
      `the gap to the tallest mark is ${(measurement.zeroMarkTopY - measurement.lowestDrawnBarY).toFixed(2)}px — ` +
        "under a pixel it is not a separation",
    );
    // ⛔ AND THE BOUND IS THE PRODUCTION MARGIN, NOT A NUMBER THIS FILE LIKED. `paneFloorY` is the
    // pane's height in pixels and `1 - bottom` is the constant read off the source, so this ties
    // the measured pixel to the configuration instead of to a remembered `162,20`.
    const bandFloorY = measurement.paneFloorY * (1 - LIQUIDATION_BAR_SCALE_MARGINS.bottom);
    assert.ok(
      measurement.lowestDrawnBarY <= bandFloorY + 0.5,
      `with a liquidation of ${micro} the lowest drawn bar reaches y=${measurement.lowestDrawnBarY.toFixed(2)}, past ` +
        `the band floor the margin declares (y=${bandFloorY.toFixed(2)} = ${measurement.paneFloorY.toFixed(2)} × ` +
        `${(1 - LIQUIDATION_BAR_SCALE_MARGINS.bottom).toFixed(2)})`,
    );
    if (micro < LIQUIDATION_LOG_BASE) {
      subBaseFloors.push(measurement.lowestDrawnBarY);
    }
    baselines.push(measurement.barBaselineY);
  }
  // Below the base the floor is INVARIANT in the value — the sub-base bar is the smallest visible
  // one, so autoscale puts it exactly on the floor whatever it is worth. That invariance is the
  // evidence that the guarantee belongs to the configuration and not to this universe. (At or above
  // the base the floor is a BOUND, not an equality: nothing is drawn that low, which is safer.)
  assert.ok(
    Math.max(...subBaseFloors) - Math.min(...subBaseFloors) < PIXEL_FLOOR,
    `across ${subBaseFloors.length} values spanning two decades below the base the floor moved by ` +
      `${(Math.max(...subBaseFloors) - Math.min(...subBaseFloors)).toFixed(2)}px — it is not a floor, and the ` +
      "guarantee is back to being a property of the data",
  );
  assert.ok(
    Math.max(...baselines) - Math.min(...baselines) > 10,
    `the baseline barely moved (${(Math.max(...baselines) - Math.min(...baselines)).toFixed(2)}px) across five ` +
      "decades — the sweep is no longer reaching below the histogram base, so it can no longer fail",
  );
});

test("the same holds when the WHOLE series arrives in base units — the regression the catalog measured", async () => {
  // ⛔ NOT ACADEMIC: `liquidation_catalog.py:34-38` measured that the provider's DEFAULT
  // (`convert_to_usd=false`) answers in BASE units — `BTC 0.003`. If `CONVERT_TO_USD_REQUIRED` ever
  // stops reaching the request, EVERY value in this pane is below the histogram base at once, which
  // is the regime the old wording would have drawn straight through the marks.
  const baseUnitSlots = syntheticLiquidationSlots(0.003).map((slot) =>
    slot.value === null || slot.value === 0 ? slot : { time: slot.time, value: (slot.value / REAL_MAX) * 0.05 },
  );
  const { lowestDrawnBarY, marksBandTopY, barBaselineY } = await measureCohortSurface(baseUnitSlots, {
    mode: "Logarithmic",
  });
  assert.ok(
    lowestDrawnBarY < marksBandTopY,
    `in base units the lowest drawn bar reaches y=${lowestDrawnBarY.toFixed(2)}, inside the marks band ` +
      `(y=${marksBandTopY.toFixed(2)})`,
  );
  // And the evidence that the regime really is the pathological one: the baseline has left the
  // floor far behind, i.e. every bar in the pane now hangs DOWNWARD from it.
  assert.ok(
    barBaselineY < lowestDrawnBarY - 50,
    `the baseline (y=${barBaselineY.toFixed(2)}) is not far above the floor (y=${lowestDrawnBarY.toFixed(2)}) — ` +
      "this universe stopped being entirely below the histogram base, so it stopped testing the regression",
  );
});

test("MORDE: dropping the bars' bottom margin INTO the marks band makes the floor assert FAIL", async () => {
  // ⛔ THE TIGHT MUTATION — it moves the guarantee's own inequality by the smallest step that
  // breaks it: `bottom: 0.10` puts the bar floor at 90% of the pane against a marks band that
  // starts at 88%. The bar is still above the ZERO MARK's top (`171,80` vs `175,97`), so a test
  // written against the mark instead of against the BAND would survive this — which is exactly why
  // the assertion above is written against the band.
  const { lowestDrawnBarY, marksBandTopY } = await measureCohortSurface(syntheticLiquidationSlots(), {
    mode: "Logarithmic",
    barMarginBottom: 0.1,
  });
  assert.ok(
    lowestDrawnBarY >= marksBandTopY,
    "with the bars' bottom margin at 0.10 against a marks band starting at " +
      `${LIQUIDATION_MARKS_SCALE_MARGINS.top} the overlap did NOT happen (floor y=${lowestDrawnBarY.toFixed(2)}, ` +
      `band top y=${marksBandTopY.toFixed(2)}) — the assert above is not measuring the margin, re-anchor it`,
  );
});

test("MORDE: raising the marks band into the bars makes the disjointness assert FAIL", async () => {
  // The mutation is the one a careless restyle would make: giving the marks the same margin the
  // bars have, so the two bands share pixels again. Without this half, the green above could be a
  // property of the library rather than of the configuration.
  const { lowestDrawnBarY, marksBandTopY } = await measureCohortSurface(syntheticLiquidationSlots(), {
    mode: "Logarithmic",
    marksMarginTop: LIQUIDATION_BAR_SCALE_MARGINS.top,
  });
  assert.ok(
    lowestDrawnBarY >= marksBandTopY,
    `with the marks band raised to the bars' own margin the separation SURVIVED (floor y=${lowestDrawnBarY.toFixed(2)}, ` +
      `band top y=${marksBandTopY.toFixed(2)}) — the assert above is not measuring the margin, re-anchor it`,
  );
});

test("production leaves the bar scale AUTOSCALED — the guarantee's second precondition", () => {
  assert.ok(
    productionBarScaleIsAutoscaled(),
    "the liquidation bar scale in SymbolClient.tsx pins its autoscale — the band floor stops holding still and a " +
      "value below the histogram base leaves the pane (see the MORDE below for the pixels)",
  );
});

test("MORDE: pinning the bar scale's autoscale walks a sub-base bar out of the pane", async () => {
  // ⛔ WHY THIS HALF EXISTS: the floor is not a law of the library, it is a consequence of the
  // smallest VISIBLE value setting the range. Pin the range and the consequence goes away — the
  // `0,003` bar is drawn below the pane's own floor, through the marks band on its way out. This is
  // the mutation that makes the guard above load-bearing instead of decorative.
  const { lowestDrawnBarY, marksBandTopY, paneFloorY } = await measureCohortSurface(syntheticLiquidationSlots(), {
    mode: "Logarithmic",
    pinBarAutoscale: true,
  });
  assert.ok(
    lowestDrawnBarY >= marksBandTopY,
    `with the bar scale pinned the sub-base bar STAYED inside its band (floor y=${lowestDrawnBarY.toFixed(2)}, ` +
      `band top y=${marksBandTopY.toFixed(2)}) — autoscale is not what the floor rests on, re-anchor the claim`,
  );
  assert.ok(
    lowestDrawnBarY > paneFloorY,
    `pinned, the bar stopped at y=${lowestDrawnBarY.toFixed(2)}, still inside the pane (floor y=${paneFloorY.toFixed(2)})`,
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

// ── `W1-CODE-REVIEW-r2` C-2 — the inequality must hold on the APPLIED margins ──────────────────
// The legend reserve (`T-01.6`) rewrites the bar scale's margins at runtime. The two tests above
// check the BASE constants; this one checks what `paneScaleMargins` hands the library for the
// production binding, read BACK from the library, with the legend heights the design gate measured
// on the live pane (`T-01.11-r2-facts.json`: long 54 px, short 38 px, pane 108 px), plus a sweep up
// to the largest reserve `paneScaleMargins` accepts.

/** The role production declares for the liquidation BAR scale, parsed from the source. */
function productionBarScaleRole(): { belowLegend: boolean; clearSeparator: boolean; keepFloor?: boolean } {
  const match = /\{ series: barSeries, belowLegend: (true|false), clearSeparator: (true|false)(?:, keepFloor: (true|false))? \}/.exec(
    source,
  );
  assert.ok(match !== null, "the liquidation bar scale binding was not found in SymbolClient.tsx — fix this test");
  return {
    belowLegend: match[1] === "true",
    clearSeparator: match[2] === "true",
    ...(match[3] === undefined ? {} : { keepFloor: match[3] === "true" }),
  };
}

async function appliedBarFloor(role: ReturnType<typeof productionBarScaleRole>, paneHeightPx: number, legendBottomPx: number) {
  const result = paneScaleMargins(LIQUIDATION_BAR_SCALE_MARGINS, role, { paneHeightPx, legendBottomPx });
  assert.notEqual(result.kind, "unmeasured");
  if (result.kind === "unmeasured") return Number.NaN;
  const dom = new JSDOM('<!doctype html><html><body><div id="chart"></div></body></html>', { pretendToBeVisual: true });
  installGlobals(dom);
  const lc = await import("lightweight-charts");
  const container = dom.window.document.getElementById("chart");
  assert.ok(container !== null);
  const chart = lc.createChart(container, chartConstructorOptions(MEASUREMENT_WIDTH_PX, paneHeightPx));
  const barSeries = chart.addSeries(lc.HistogramSeries, { base: LIQUIDATION_LOG_BASE });
  barSeries.priceScale().applyOptions({ scaleMargins: result.margins });
  const applied = barSeries.priceScale().options().scaleMargins;
  chart.remove();
  return 1 - applied.bottom;
}

test("C-2: on the APPLIED margins the bar band's floor stays above the marks band, for every legend the pane accepts", async () => {
  const role = productionBarScaleRole();
  assert.equal(role.belowLegend, true, "the bars sit below the legend");
  for (const legendBottomPx of [38, 54, 60, 70, 76]) {
    const floor = await appliedBarFloor(role, 108, legendBottomPx);
    assert.ok(
      floor < LIQUIDATION_MARKS_SCALE_MARGINS.top,
      `legend ${legendBottomPx} px in a 108 px pane: bar floor at ${(floor * 100).toFixed(1)}% of the pane, marks band ` +
        `from ${(LIQUIDATION_MARKS_SCALE_MARGINS.top * 100).toFixed(0)}% — a small bar lands on the zero mark`,
    );
  }
});

test("MORDE (C-2): the same binding WITHOUT keepFloor crosses into the marks band with the 54 px legend", async () => {
  const role = { ...productionBarScaleRole(), keepFloor: false };
  const floor = await appliedBarFloor(role, 108, 54);
  assert.ok(floor >= LIQUIDATION_MARKS_SCALE_MARGINS.top, `expected the defect to reproduce, floor=${floor}`);
});
