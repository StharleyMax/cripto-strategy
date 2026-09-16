/**
 * `T-01.8` — THE GEOMETRY OF THE VOLUME SUB-AXIS, MEASURED IN PIXELS AGAINST THE REAL LIBRARY.
 *
 * This file exists because phase `01`'s `design_gate`
 * (`docs/context/cinco-metricas-do-core/gates/design-01.md`) failed with TWO `BLOCKER` findings
 * that are arithmetic, and no instrument in this repo was able to see them:
 *
 *   - `BLOCKER-1` — LINEAR scale anchored on the window maximum => `954/1,404` present bars
 *     (`67.9%`) below one physical pixel, median bar of `0.62 px`. WCAG 1.4.11 fails it.
 *   - `BLOCKER-2` — `WhitespaceItem` draws no mark at all => "we do not know" and "it was zero"
 *     are the same pixels: none. `STITCH_CONTEXT.md:1821-1825` / `D5.3` forbid it.
 *
 * ⚠️ WHY THIS IS NOT ONE MORE SOURCE SCAN, and the difference is the reason the file exists:
 * `volume-subaxis-dom-contract.test.ts` proves the literals are SPELLED where the contract
 * requires — and with the whole suite green, the `67.9%` sub-pixel bars went unnoticed for two
 * tasks. Bar height is not a string one can grep: it comes out of the interaction between the
 * scale mode, the histogram base, the margins and the pane height. Only the library knows the
 * number, so this file asks IT for the number (`priceToCoordinate`), inside a `jsdom`, with the
 * SAME shim `charts` already uses to measure axis fidelity.
 *
 * ⛔ AND THE CONSTANTS ARE READ FROM THE PRODUCTION SOURCE, NOT RETYPED HERE. A copy of the
 * margins/base/heights in this file would measure the configuration THIS file chose, not the one
 * the screen draws — and it would stay green while production regresses, which is exactly the
 * class of false-green the report found. Every form constant comes from `SymbolClient.tsx` by
 * regex; if one of them is renamed, the parse fails and the test FAILS instead of measuring the
 * default.
 *
 * THE UNIVERSE: a synthetic long-tailed series with `max/p50 ~ 60x` — the ratio MEASURED on the
 * real 24h data (`max 4,931.19 / p50 81.07 = 60.8x`, `n=1,404`). Synthetic and not the on-disk
 * corpus on purpose: what fails here is the RATIO between maximum and median, which is a property
 * of the distribution, and tying that to a non-versioned CSV would turn a gate about form into a
 * `RECUSA` by environment (`scripts/verify.sh` §1c).
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

const CHART_HEIGHT_PX = productionNumber("CHART_HEIGHT_PX");
const VOLUME_LOG_BASE = productionNumber("VOLUME_LOG_BASE");
const ABSENCE_MARK_PX = productionNumber("ABSENCE_MARK_PX");
const ZERO_MARK_PX = productionNumber("ZERO_MARK_PX");

const MARGINS_DECLARATION = /const VOLUME_SCALE_MARGINS = \{ top: (\d+(?:\.\d+)?), bottom: (\d+(?:\.\d+)?) \} as const;/;
const marginsMatch = MARGINS_DECLARATION.exec(source);
assert.ok(marginsMatch !== null, "VOLUME_SCALE_MARGINS was not found in SymbolClient.tsx");
const VOLUME_SCALE_MARGINS = { top: Number(marginsMatch[1]), bottom: Number(marginsMatch[2]) };
const VOLUME_MARKS_BAND_PX = CHART_HEIGHT_PX * (1 - VOLUME_SCALE_MARGINS.top);

/** The scale mode production applies to the volume scale, read from the source — `"Logarithmic"`,
 * `"Normal"` or `null` when no mode is applied at all (which IS the linear mode, the defect). */
function productionVolumeScaleMode(): string | null {
  const match = /volumeSeries\s*\n?\s*\.priceScale\(\)[\s\S]{0,200}?mode: PriceScaleMode\.(\w+)/.exec(source);
  return match === null ? null : match[1]!;
}

// ── The synthetic universe: long tail with the max/p50 ratio of the real data ────────────────

const ONE_MINUTE_MS = 60_000;
/** The pane width only enters the bar's WIDTH, never its height — which is what this file
 * measures. Pinned anyway so the measurement does not depend on the `clientWidth` of a jsdom
 * `<div>` (which is `0`, and the component would fall back to its `|| 600`). */
const MEASUREMENT_WIDTH_PX = 1_200;
const GRID_SLOTS = 1_440;
const ABSENT_EVERY = 40;
const ZERO_AT_INDEX = 500;

interface Slot {
  readonly time: number;
  readonly value: number | null;
}

/** The `max/p50` ratio MEASURED on the real 24h data — `4,931.19 / 81.07`, `n=1,404`
 * (`gates/design-01.md` §2). IT is what produces the defect, not the amplitude alone: a
 * log-uniform distribution over the same amplitude gives `22x` and leaves "only" 40% of the bars
 * sub-pixel, too weak to serve as a negative control `[MEDIDO 2026-09-15]`. */
const REAL_MAX_OVER_P50 = 60.8;
const SYNTHETIC_MIN = 10;
const SYNTHETIC_MAX = 4_931;
/** Exponent that skews the low-discrepancy sequence inside log-space until the median lands where
 * the real one lands: `0.5 ** SKEW` has to equal `log10(p50/min) / log10(max/min)`, which on the
 * real data is `(1.909 - 1.026) / (3.693 - 1.026) = 0.331` => `SKEW = ln(0.331)/ln(0.5)`.
 * Written out as a number and VERIFIED by the universe test below, so that a convenience tweak
 * here fails instead of silently loosening the negative control. */
const SKEW = 1.6;

/** Long tail between `10` and `4,931`, with the SAME `max/p50` ratio as the real 24h data, from a
 * deterministic generator (no `Math.random`: a test that changes universe on every run is not a
 * gate). */
function syntheticVolumeSlots(): readonly Slot[] {
  const slots: Slot[] = [];
  for (let i = 0; i < GRID_SLOTS; i += 1) {
    const time = i * ONE_MINUTE_MS;
    if (i === ZERO_AT_INDEX) {
      slots.push({ time, value: 0 });
    } else if (i % ABSENT_EVERY === 0) {
      slots.push({ time, value: null });
    } else {
      // Low-discrepancy sequence (Van der Corput base 2), mapped into log-space.
      let bits = i;
      let fraction = 0;
      let denominator = 0.5;
      while (bits > 0) {
        fraction += (bits % 2) * denominator;
        bits = Math.floor(bits / 2);
        denominator /= 2;
      }
      slots.push({
        time,
        value: SYNTHETIC_MIN * 10 ** (fraction ** SKEW * Math.log10(SYNTHETIC_MAX / SYNTHETIC_MIN)),
      });
    }
  }
  return slots;
}

interface Measurement {
  readonly barHeightsPx: readonly number[];
  readonly absenceMarkPx: number;
  readonly zeroMarkPx: number;
}

/** Builds the sub-axis with the production configuration (`mode` parameterised only for the
 * negative control) and returns the height IN PIXELS of each mark, asked of the library itself. */
async function measureSubAxis(slots: readonly Slot[], mode: "Logarithmic" | "Normal"): Promise<Measurement> {
  const dom = new JSDOM('<!doctype html><html><body><div id="chart"></div></body></html>', { pretendToBeVisual: true });
  installGlobals(dom);
  const lc = await import("lightweight-charts");
  const container = dom.window.document.getElementById("chart");
  assert.ok(container !== null, "broken invariant: the chart container does not exist in the DOM");

  // ⛔ The options come from `chartConstructorOptions`, the SAME call `useLightweightChart` makes,
  // and not from an object written here. Two reasons, neither of them stylistic: (i) measuring the
  // geometry of a pane built by another constructor would measure another pane; (ii)
  // `chart-construction.test.ts` (`DR-1`) requires this of every `createChart` under `app/` — and
  // the requirement is right, because a `createChart` writing its own options is how `DR-1` went
  // to production.
  const chart = lc.createChart(container, chartConstructorOptions(MEASUREMENT_WIDTH_PX, CHART_HEIGHT_PX));
  const volumeSeries = chart.addSeries(lc.HistogramSeries, {
    priceScaleId: "volume",
    base: VOLUME_LOG_BASE,
    priceLineVisible: false,
    lastValueVisible: false,
  });
  volumeSeries.priceScale().applyOptions({
    scaleMargins: VOLUME_SCALE_MARGINS,
    mode: mode === "Logarithmic" ? lc.PriceScaleMode.Logarithmic : lc.PriceScaleMode.Normal,
  });
  volumeSeries.setData(positiveValueSeriesLossless(slots) as never);

  const markStyle = {
    priceScaleId: "volume_marks",
    priceLineVisible: false,
    lastValueVisible: false,
    autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: VOLUME_MARKS_BAND_PX } }),
  };
  const absence = chart.addSeries(lc.HistogramSeries, markStyle);
  absence.priceScale().applyOptions({ scaleMargins: VOLUME_SCALE_MARGINS });
  absence.setData(absenceMarkSeries(slots, ABSENCE_MARK_PX) as never);
  const zero = chart.addSeries(lc.HistogramSeries, markStyle);
  zero.setData(zeroMarkSeries(slots, ZERO_MARK_PX) as never);

  chart.timeScale().fitContent();
  await flushFrames(dom, 3);

  const barBase = volumeSeries.priceToCoordinate(VOLUME_LOG_BASE);
  const markBase = absence.priceToCoordinate(0);
  assert.ok(barBase !== null && markBase !== null, "the library did not place the baseline — the measurement would be vacuous");
  const barHeightsPx = slots
    .filter((slot): slot is Slot & { value: number } => slot.value !== null && slot.value > 0)
    .map((slot) => {
      const coordinate = volumeSeries.priceToCoordinate(slot.value);
      assert.ok(coordinate !== null, `the bar of ${slot.value} got no coordinate`);
      return (barBase as number) - (coordinate as number);
    });
  const heightOf = (series: typeof absence, value: number): number => {
    const coordinate = series.priceToCoordinate(value);
    assert.ok(coordinate !== null, `the mark of ${value} got no coordinate`);
    return (markBase as number) - (coordinate as number);
  };
  const measurement = {
    barHeightsPx,
    absenceMarkPx: heightOf(absence, ABSENCE_MARK_PX),
    zeroMarkPx: heightOf(zero, ZERO_MARK_PX),
  };
  chart.remove();
  dom.window.close();
  return measurement;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/** `BLOCKER-1`'s floor: 1 PHYSICAL pixel. Below it the bar is indistinguishable from absence —
 * and `lightweight-charts` has a `Math.max(1, …)` in its minified source that the report
 * explicitly COULD NOT prove to be about height; if it is, the sub-pixel bars all become equal
 * and the sub-axis stops encoding volume. Both branches are a defect, and this floor kills
 * both. */
const PIXEL_FLOOR = 1;
/** The median has to be comfortably legible, not merely "above zero". `6 px` is a small fraction
 * of the measured usable band (~37 px) and still ~10x what the linear scale delivered. */
const MEDIAN_FLOOR_PX = 6;

test("the synthetic universe reproduces the real data's max/p50 ratio — without it the negative control is weak", () => {
  // ⛔ THE UNIVERSE IS DECLARED AND VERIFIED, not assumed. What produces `BLOCKER-1` is the RATIO
  // between the maximum and the median; if a tweak here shrinks it, the linear scale stops failing
  // and the negative control below turns into decoration — failing HERE, in this test, instead of
  // later and in silence.
  const values = syntheticVolumeSlots()
    .filter((slot): slot is Slot & { value: number } => slot.value !== null && slot.value > 0)
    .map((slot) => slot.value);
  const ratio = Math.max(...values) / median(values);
  assert.ok(
    Math.abs(ratio - REAL_MAX_OVER_P50) / REAL_MAX_OVER_P50 < 0.15,
    `synthetic max/p50 = ${ratio.toFixed(1)}x against the ${REAL_MAX_OVER_P50}x measured on the real 24h data`,
  );
});

test("BLOCKER-1: no present bar falls below 1 pixel, and the median is legible", async () => {
  const slots = syntheticVolumeSlots();
  const { barHeightsPx } = await measureSubAxis(slots, "Logarithmic");
  const subPixel = barHeightsPx.filter((height) => height < PIXEL_FLOOR);
  assert.ok(barHeightsPx.length > 1_000, `universe too small (${barHeightsPx.length}) — the measurement would be weak`);
  assert.equal(
    subPixel.length,
    0,
    `${subPixel.length}/${barHeightsPx.length} bars below ${PIXEL_FLOOR}px — that is BLOCKER-1 back (WCAG 1.4.11)`,
  );
  const p50 = median(barHeightsPx);
  assert.ok(
    p50 >= MEDIAN_FLOOR_PX,
    `median bar of ${p50.toFixed(2)}px, below the floor of ${MEDIAN_FLOOR_PX}px`,
  );
});

test("MORDE: the SAME series on the LINEAR scale fails the assertion above — the negative control", async () => {
  // ⛔ Without this half, the green above is not evidence: it would be a claim the instrument was
  // never shown able to reject (`axis-spike.ts`, same argument). Here the mutation is the PREVIOUS
  // configuration, literally — the one the gate failed.
  const slots = syntheticVolumeSlots();
  const { barHeightsPx } = await measureSubAxis(slots, "Normal");
  const subPixel = barHeightsPx.filter((height) => height < PIXEL_FLOOR);
  assert.ok(
    subPixel.length > barHeightsPx.length / 2,
    `the linear scale left only ${subPixel.length}/${barHeightsPx.length} bars sub-pixel — the ` +
      `negative control stopped reproducing the defect, and without it the test above proves nothing`,
  );
  assert.ok(
    median(barHeightsPx) < PIXEL_FLOOR,
    "the linear median stopped being sub-pixel — re-anchor this control rather than deleting it",
  );
});

test("BLOCKER-1: production APPLIES the logarithmic mode — the mode measured above is the screen's", async () => {
  // The measurement above would use the right configuration even if production used the wrong one;
  // this is the tie between the two. `null` (no `mode` applied) IS the defect: the default is
  // linear.
  assert.equal(
    productionVolumeScaleMode(),
    "Logarithmic",
    "the volume sub-axis scale in SymbolClient.tsx is not logarithmic — BLOCKER-1",
  );
});

test("BLOCKER-2: absence, legitimate zero and the smallest present bar occupy DIFFERENT pixels", async () => {
  const slots = syntheticVolumeSlots();
  const { barHeightsPx, absenceMarkPx, zeroMarkPx } = await measureSubAxis(slots, "Logarithmic");
  // 1. Absence DRAWS — it is `D5.3`'s third channel, the one `WhitespaceItem` did not have.
  assert.ok(
    absenceMarkPx >= PIXEL_FLOOR,
    `the absence mark measures ${absenceMarkPx.toFixed(2)}px — below 1px it does not exist, which is BLOCKER-2`,
  );
  // 2. And it does not draw the SAME thing as the legitimate zero.
  assert.ok(
    zeroMarkPx >= 2 * absenceMarkPx,
    `zero (${zeroMarkPx.toFixed(2)}px) and absence (${absenceMarkPx.toFixed(2)}px) do not separate by height — ` +
      `"there was none" and "we do not know" would be the same claim again`,
  );
  // 3. And neither of the two may be mistaken for a small volume bar: the ORDERING is strict,
  //    absence < zero < smallest present bar.
  const smallestBar = Math.min(...barHeightsPx);
  assert.ok(
    smallestBar > zeroMarkPx,
    `the smallest present bar (${smallestBar.toFixed(2)}px) does not exceed the zero mark (${zeroMarkPx.toFixed(2)}px)`,
  );
});

test("MORDE: deleting the absence series deletes the 36 gaps — the mark is not decorative", () => {
  // This half is about COUNT, not pixels: it proves the mark series draws on EXACTLY the instants
  // with no data, and whitespace everywhere else. An implementation that "marked everything" or
  // "marked nothing" would pass the height floors above and fails here.
  const slots = syntheticVolumeSlots();
  const absent = slots.filter((slot) => slot.value === null).length;
  const zeros = slots.filter((slot) => slot.value === 0).length;
  assert.ok(absent > 0 && zeros > 0, "the synthetic universe lost its gaps or its zero — the measurement would be vacuous");
  const marks = absenceMarkSeries(slots, ABSENCE_MARK_PX).filter((item) => "value" in item);
  const zeroMarks = zeroMarkSeries(slots, ZERO_MARK_PX).filter((item) => "value" in item);
  assert.equal(marks.length, absent, "the absence series must mark exactly the gaps");
  assert.equal(zeroMarks.length, zeros, "the zero series must mark exactly the legitimate zeros");
  // And the bar series may draw on neither of the two.
  const bars = positiveValueSeriesLossless(slots).filter((item) => "value" in item);
  assert.equal(bars.length, slots.length - absent - zeros);
});
