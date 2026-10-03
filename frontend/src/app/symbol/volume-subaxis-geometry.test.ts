/**
 * `T-01.8` → `T-02.2` — THE GEOMETRY OF THE VOLUME SUB-AXIS, MEASURED ON THE LIBRARY'S OWN DRAW CALLS.
 *
 * History, kept because the reason for the file outlives the decision it first guarded: phase
 * `01`'s `design_gate` (`docs/context/cinco-metricas-do-core/gates/design-01.md`) failed with two
 * arithmetic `BLOCKER`s no instrument here could see — `BLOCKER-1` (a linear scale put 67.9% of the
 * bars below one pixel) and `BLOCKER-2` (an absent slot drew no mark at all). The answer then was
 * `log10` base 1 plus two mark series.
 *
 * `T-02.2` (`docs/context/paineis-de-fluxo/gates/T-02.2-design-gate.md`, cycle 2 APPROVED, §8) moved
 * the scale to LINEAR base 0 and the marks to a strip of their own BELOW the bars' base. This file
 * now proves the invariants of THAT form (§5.2 and §8.8 `N-1`/`N-2`), each against the real
 * `lightweight-charts` inside a `jsdom`:
 *
 *   1. `BLOCKER-1` stays closed by the library, not by us: every present bar is PAINTED at least
 *      1 px tall (`lightweight-charts.development.mjs:14944-14963`, `tickWidth = max(1, …)`). The
 *      coordinate of a small bar is sub-pixel; its `fillRect` is not. That is why this file records
 *      `fillRect` and does not stop at `priceToCoordinate`.
 *   2. The two strips never touch: no mark row sits in the bar region, no bar row in the mark strip,
 *      and there is at least ONE empty row between the top of the ZERO mark (the taller of the two)
 *      and the bars' base (`N-1`).
 *   3. Inside the strip, absence < zero in height (order, not the nominal 2/6 values — `N-1`).
 *   4. The peak stands out (`F-3` of the gate, in unit form): the tallest painted bar is at least
 *      `4×` the median painted bar. Under the previous `log10` it is not — the MORDE below.
 *
 * ⛔ THE CONSTANTS ARE READ FROM THE PRODUCTION SOURCE, NOT RETYPED HERE, and so are the scale roles
 * the chart host applies at runtime (`clearSeparator` lifts a floor-anchored scale 4 px off the
 * separator, `charts/pane-stack-layout.ts`). A copy would measure the configuration THIS file chose.
 * The pane height is the production price pane's (`stackedPaneLayout` over `F1_PANE_STRETCH`, 335 px),
 * because the strip is a FRACTION of the pane and the gap between the strips scales with it.
 *
 * THE UNIVERSE: a synthetic long tail with `max/p50 ~ 60x`, the ratio measured on real 1-minute
 * data (`max 4,931.19 / p50 81.07 = 60.8x`, `n=1,404`), with absent slots and one legitimate zero.
 * Synthetic on purpose: what matters is the ratio, and tying a form gate to a non-versioned CSV
 * would turn it into a `RECUSA` by environment (`scripts/verify.sh` §1c).
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

import {
  absenceMarkSeries,
  F1_PANE_STACK_FORM,
  flushFrames,
  installGlobals,
  paneScaleMargins,
  positiveValueSeriesLossless,
  stackedPaneLayout,
  zeroMarkSeries,
} from "../../charts/index.ts";
import { chartConstructorOptions } from "./chart-options.ts";
import { F1_PANE_ORDER, F1_PANE_STRETCH } from "./pane-registry.ts";

const SYMBOL_CLIENT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "SymbolClient.tsx");
const source = readFileSync(SYMBOL_CLIENT_PATH, "utf8");

interface Margins {
  readonly top: number;
  readonly bottom: number;
}

interface ScaleRole {
  readonly belowLegend: boolean;
  readonly clearSeparator: boolean;
}

/** The role the chart host applies to a scale of the price pane, parsed from `PricePane`'s `scales`. */
function productionScaleRole(seriesName: string): ScaleRole {
  const match = new RegExp(`\\{ series: ${seriesName}, belowLegend: (true|false), clearSeparator: (true|false) \\}`).exec(source);
  assert.ok(match !== null, `the scale binding of ${seriesName} was not found in SymbolClient.tsx — fix this test`);
  return { belowLegend: match[1] === "true", clearSeparator: match[2] === "true" };
}

/** The scale mode production applies to the volume scale — `null` when no mode is applied. */
function productionVolumeScaleMode(): string | null {
  const match = /volumeSeries\.priceScale\(\)\.applyOptions\(\{\s*scaleMargins: VOLUME_SCALE_MARGINS,\s*mode: PriceScaleMode\.(\w+),/.exec(source);
  return match === null ? null : match[1]!;
}

// `T-10.10` DoD 1: the constants come by IMPORT, not by a regex over the declaration (a prettier break
// of the line no longer fails this file). The scale ROLES and MODE below are JSX props, not constants:
// they stay a residual scan until a test captures the binding `PricePane` registers (`T-10.11` harness).
const {
  VOLUME_BAR_BASE,
  ABSENCE_MARK_PX,
  ZERO_MARK_PX,
  VOLUME_MARKS_BAND_PX,
  VOLUME_SCALE_MARGINS,
  VOLUME_MARKS_SCALE_MARGINS,
} = await import("./SymbolClient.tsx");
const VOLUME_ROLE = productionScaleRole("volumeSeries");
const MARKS_ROLE = productionScaleRole("absenceSeries");

/** The production price pane's height — index 0 of the one-chart stack (`F1_PANE_ORDER[0]`). */
const PRICE_PANE_PX = (() => {
  assert.equal(F1_PANE_ORDER[0], "price", "the price pane is no longer index 0 — fix this test");
  const layout = stackedPaneLayout({ ...F1_PANE_STACK_FORM, weights: F1_PANE_ORDER.map((paneId) => F1_PANE_STRETCH[paneId]) });
  return Math.round(layout.paneHeightsPx[0]!);
})();

// ── The synthetic universe ──────────────────────────────────────────────────────────────────

const ONE_MINUTE_MS = 60_000;
/** The pane width only enters the bar's WIDTH; pinned so a bar never shares a column with another
 * (`1,200 / 1,440` would put two slots in some columns and the count below would blur). */
const MEASUREMENT_WIDTH_PX = 1_600;
const GRID_SLOTS = 1_440;
const ABSENT_EVERY = 40;
const ZERO_AT_INDEX = 500;

interface Slot {
  readonly time: number;
  readonly value: number | null;
}

const REAL_MAX_OVER_P50 = 60.8;
const SYNTHETIC_MIN = 10;
const SYNTHETIC_MAX = 4_931;
/** Skews the low-discrepancy sequence inside log-space until the median lands where the real one
 * does; verified by the universe test below, so a convenience tweak fails instead of loosening it. */
const SKEW = 1.6;

function syntheticVolumeSlots(): readonly Slot[] {
  const slots: Slot[] = [];
  for (let i = 0; i < GRID_SLOTS; i += 1) {
    const time = i * ONE_MINUTE_MS;
    if (i === ZERO_AT_INDEX) {
      slots.push({ time, value: 0 });
    } else if (i % ABSENT_EVERY === 0) {
      slots.push({ time, value: null });
    } else {
      let bits = i;
      let fraction = 0;
      let denominator = 0.5;
      while (bits > 0) {
        fraction += (bits % 2) * denominator;
        bits = Math.floor(bits / 2);
        denominator /= 2;
      }
      slots.push({ time, value: SYNTHETIC_MIN * 10 ** (fraction ** SKEW * Math.log10(SYNTHETIC_MAX / SYNTHETIC_MIN)) });
    }
  }
  return slots;
}

// ── The instrument: the library's own `fillRect` calls, one paint ───────────────────────────

/** Colours only this file uses, so every recorded rectangle is attributable to ONE series. */
const BAR_INK = "#a10000";
const ABSENCE_INK = "#00a100";
const ZERO_INK = "#0000a1";

interface Rect {
  readonly left: number;
  readonly top: number;
  /** Inclusive last row. */
  readonly bottom: number;
}

interface Paint {
  readonly paneHeightPx: number;
  readonly bars: readonly Rect[];
  readonly absenceMarks: readonly Rect[];
  readonly zeroMarks: readonly Rect[];
}

/** The configuration under test. Everything defaults to production; a MORDE overrides ONE field. */
interface Config {
  readonly mode: "Logarithmic" | "Normal";
  readonly base: number;
  readonly marksMargins: Margins;
}

const PRODUCTION: Config = {
  mode: productionVolumeScaleMode() === "Normal" ? "Normal" : "Logarithmic",
  base: VOLUME_BAR_BASE,
  marksMargins: VOLUME_MARKS_SCALE_MARGINS,
};

async function paintSubAxis(slots: readonly Slot[], config: Config): Promise<Paint> {
  const dom = new JSDOM('<!doctype html><html><body><div id="chart"></div></body></html>', { pretendToBeVisual: true });
  installGlobals(dom);

  let recording = false;
  // Keyed by `left:top:bottom`, so a series painted twice inside the recorded frame counts once.
  const rects = new Map<string, Map<string, Rect>>([
    [BAR_INK, new Map()],
    [ABSENCE_INK, new Map()],
    [ZERO_INK, new Map()],
  ]);
  const baseGetContext = dom.window.HTMLCanvasElement.prototype.getContext;
  dom.window.HTMLCanvasElement.prototype.getContext = function recordingGetContext(this: unknown, ...args: unknown[]): unknown {
    const context = (baseGetContext as unknown as (...rest: unknown[]) => unknown).apply(this, args) as object;
    const state = { fillStyle: "" };
    return new Proxy(context, {
      get(target, property): unknown {
        if (property === "fillStyle") {
          return state.fillStyle;
        }
        if (property === "fillRect") {
          return (x: number, y: number, width: number, height: number): void => {
            const bucket = rects.get(state.fillStyle.toLowerCase());
            // A pane-sized fill of another colour is the background of a NEW paint: only the last
            // paint is the screen, so what the previous ones drew is dropped.
            if (bucket === undefined && width >= MEASUREMENT_WIDTH_PX / 2 && height >= PRICE_PANE_PX / 2) {
              for (const drawnSoFar of rects.values()) {
                drawnSoFar.clear();
              }
            }
            if (recording && bucket !== undefined && height > 0 && width > 0) {
              bucket.set(`${x}:${y}:${height}`, { left: x, top: y, bottom: y + height - 1 });
            }
          };
        }
        return Reflect.get(target, property);
      },
      set(_target, property, value): boolean {
        if (property === "fillStyle") {
          state.fillStyle = String(value);
        }
        return true;
      },
    });
  } as unknown as HTMLCanvasElement["getContext"];

  const lc = await import("lightweight-charts");
  const container = dom.window.document.getElementById("chart");
  assert.ok(container !== null, "broken invariant: the chart container does not exist in the DOM");
  // ⛔ `chartConstructorOptions`, the SAME call `useLightweightChart` makes (`chart-construction.test.ts`, `DR-1`).
  // `locale` only: jsdom's `navigator.language` is not a locale `Intl` accepts, and the time axis
  // formats its labels while painting — same override `candle-direction-channel.test.ts` makes.
  const chart = lc.createChart(container, {
    ...chartConstructorOptions(MEASUREMENT_WIDTH_PX, PRICE_PANE_PX + F1_PANE_STACK_FORM.timeAxisPx),
    localization: { locale: "en-US" },
  });
  const volumeSeries = chart.addSeries(lc.HistogramSeries, {
    color: BAR_INK,
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
  const markStyle = (color: string) => ({
    color,
    priceScaleId: "volume_marks",
    priceLineVisible: false,
    lastValueVisible: false,
    autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: VOLUME_MARKS_BAND_PX } }),
  });
  const absence = chart.addSeries(lc.HistogramSeries, markStyle(ABSENCE_INK));
  absence.priceScale().applyOptions({ scaleMargins: config.marksMargins });
  absence.setData(absenceMarkSeries(slots, ABSENCE_MARK_PX) as never);
  const zero = chart.addSeries(lc.HistogramSeries, markStyle(ZERO_INK));
  zero.setData(zeroMarkSeries(slots, ZERO_MARK_PX) as never);
  chart.timeScale().fitContent();
  await flushFrames(dom, 3);

  recording = true;
  // Pin the pane to the production price pane's height (the time-axis row jsdom lays out is not
  // `F1_PANE_STACK_FORM`'s allowance), then apply the margins the chart host applies at runtime.
  const firstHeight = chart.panes()[0]!.getHeight();
  chart.resize(MEASUREMENT_WIDTH_PX, PRICE_PANE_PX + F1_PANE_STACK_FORM.timeAxisPx + (PRICE_PANE_PX - firstHeight));
  await flushFrames(dom, 2);
  const paneHeightPx = chart.panes()[0]!.getHeight();
  for (const [series, base, role] of [
    [volumeSeries, VOLUME_SCALE_MARGINS, VOLUME_ROLE],
    [absence, config.marksMargins, MARKS_ROLE],
  ] as const) {
    const result = paneScaleMargins(base, role, { paneHeightPx, legendBottomPx: null });
    assert.equal(result.kind, "margins", `the host would not apply margins to this scale (${result.kind})`);
    if (result.kind === "margins") {
      series.priceScale().applyOptions({ scaleMargins: result.margins });
    }
  }
  chart.timeScale().fitContent();
  await flushFrames(dom, 2);

  recording = false;
  chart.remove();
  dom.window.close();
  const drawn = (ink: string): readonly Rect[] => [...rects.get(ink)!.values()];
  return { paneHeightPx, bars: drawn(BAR_INK), absenceMarks: drawn(ABSENCE_INK), zeroMarks: drawn(ZERO_INK) };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

const heightOf = (rect: Rect): number => rect.bottom - rect.top + 1;

/** Rows of empty space between the lowest bar row and the highest mark row (`N-1`: ≥ 1). */
function stripGapRows(paint: Paint): number {
  const lowestBarRow = Math.max(...paint.bars.map((rect) => rect.bottom));
  const highestMarkRow = Math.min(...[...paint.absenceMarks, ...paint.zeroMarks].map((rect) => rect.top));
  return highestMarkRow - lowestBarRow - 1;
}

/** `F-3` of the gate: the tallest painted bar against the median painted bar. */
function peakOverMedian(paint: Paint): number {
  const heights = paint.bars.map(heightOf);
  return Math.max(...heights) / median(heights);
}

const presentCount = (slots: readonly Slot[]): number => slots.filter((slot) => slot.value !== null && slot.value > 0).length;

/** `F-3`'s threshold, verbatim from the gate (§6): "≥ 4× a mediana das colunas desenhadas". */
const PEAK_OVER_MEDIAN_FLOOR = 4;

test("the synthetic universe reproduces the real data's max/p50 ratio — without it the controls are weak", () => {
  const values = syntheticVolumeSlots()
    .filter((slot): slot is Slot & { value: number } => slot.value !== null && slot.value > 0)
    .map((slot) => slot.value);
  const ratio = Math.max(...values) / median(values);
  assert.ok(
    Math.abs(ratio - REAL_MAX_OVER_P50) / REAL_MAX_OVER_P50 < 0.15,
    `synthetic max/p50 = ${ratio.toFixed(1)}x against the ${REAL_MAX_OVER_P50}x measured on the real 24h data`,
  );
});

test("T-02.2: production APPLIES the linear mode with base 0 — the configuration measured below is the screen's", () => {
  assert.equal(productionVolumeScaleMode(), "Normal", "the volume sub-axis scale in SymbolClient.tsx is not PriceScaleMode.Normal");
  assert.equal(VOLUME_BAR_BASE, 0, "the histogram base is not 0 — the height stops being proportional (gate §8.8 N-4)");
  assert.match(source, /base: VOLUME_BAR_BASE,/, "VOLUME_BAR_BASE is declared but not fed to the volume series");
  assert.match(
    source,
    /absenceSeries\.priceScale\(\)\.applyOptions\(\{ scaleMargins: VOLUME_MARKS_SCALE_MARGINS \}\);/,
    "the marks scale does not get its own strip — the measurement below would be of another layout",
  );
  assert.equal(PRICE_PANE_PX, 335, "the production price pane changed height — re-read the gate's 335-px geometry");
});

test("BLOCKER-1 stays closed: every present bar is PAINTED at least 1 px tall, and none vanishes", async () => {
  const slots = syntheticVolumeSlots();
  const paint = await paintSubAxis(slots, PRODUCTION);
  assert.ok(Math.abs(paint.paneHeightPx - PRICE_PANE_PX) <= 1, `pane measured ${paint.paneHeightPx}px, not the production ${PRICE_PANE_PX}px`);
  assert.equal(paint.bars.length, presentCount(slots), "a present bar was not painted — BLOCKER-1 back (the absence and the bar look the same)");
  const thinnest = Math.min(...paint.bars.map(heightOf));
  assert.ok(thinnest >= 1, `a bar was painted ${thinnest}px tall`);
});

test("N-1: the strips never touch — at least one empty row between the ZERO mark (the taller) and the bars' base", async () => {
  const paint = await paintSubAxis(syntheticVolumeSlots(), PRODUCTION);
  assert.ok(paint.zeroMarks.length > 0 && paint.absenceMarks.length > 0, "the universe lost its zero or its gaps — the gap below would be vacuous");
  const gap = stripGapRows(paint);
  assert.ok(gap >= 1, `only ${gap} empty rows between the mark strip and the bars — the strips touch, BLOCKER-2 reopens (gate F-2)`);
});

test("N-1: inside the strip, absence < zero in height, and both are drawn", async () => {
  const paint = await paintSubAxis(syntheticVolumeSlots(), PRODUCTION);
  const absence = Math.max(...paint.absenceMarks.map(heightOf));
  const zero = Math.min(...paint.zeroMarks.map(heightOf));
  assert.ok(absence >= 1, `the absence mark is ${absence}px — below 1px it does not exist`);
  assert.ok(zero > absence, `zero (${zero}px) is not taller than absence (${absence}px) — "não sabemos" and "foi zero" collide`);
});

test("F-3 (unit form): the tallest painted bar is ≥ 4× the median painted bar — the peak stands out", async () => {
  const ratio = peakOverMedian(await paintSubAxis(syntheticVolumeSlots(), PRODUCTION));
  assert.ok(ratio >= PEAK_OVER_MEDIAN_FLOOR, `peak/median = ${ratio.toFixed(2)}x, below ${PEAK_OVER_MEDIAN_FLOOR}x — B loses its main argument (gate §6 F-3)`);
});

test("MORDE: the previous log10 base-1 configuration FAILS the peak test above", async () => {
  // Without this half, the green above is a claim the instrument was never shown able to reject.
  const ratio = peakOverMedian(await paintSubAxis(syntheticVolumeSlots(), { ...PRODUCTION, mode: "Logarithmic", base: 1 }));
  assert.ok(ratio < PEAK_OVER_MEDIAN_FLOOR, `log10 gave peak/median = ${ratio.toFixed(2)}x — the control stopped reproducing the flattening`);
});

test("MORDE: marks back on the bars' margins (the pre-T-02.2 layout) FAIL the strip gap", async () => {
  const gap = stripGapRows(await paintSubAxis(syntheticVolumeSlots(), { ...PRODUCTION, marksMargins: VOLUME_SCALE_MARGINS }));
  assert.ok(gap < 1, `the old layout left ${gap} empty rows — the gap measurement is blind`);
});

test("MORDE: deleting the absence series deletes the gaps — the mark is not decorative", () => {
  const slots = syntheticVolumeSlots();
  const absent = slots.filter((slot) => slot.value === null).length;
  const zeros = slots.filter((slot) => slot.value === 0).length;
  assert.ok(absent > 0 && zeros > 0, "the synthetic universe lost its gaps or its zero — the measurement would be vacuous");
  const marks = absenceMarkSeries(slots, ABSENCE_MARK_PX).filter((item) => "value" in item);
  const zeroMarks = zeroMarkSeries(slots, ZERO_MARK_PX).filter((item) => "value" in item);
  assert.equal(marks.length, absent, "the absence series must mark exactly the gaps");
  assert.equal(zeroMarks.length, zeros, "the zero series must mark exactly the legitimate zeros");
  const bars = positiveValueSeriesLossless(slots).filter((item) => "value" in item);
  assert.equal(bars.length, slots.length - absent - zeros);
});
