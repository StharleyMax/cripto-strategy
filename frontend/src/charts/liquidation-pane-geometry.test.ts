// `T-04.1` (`paineis-de-fluxo`, plan `04` items `4.1`/`4.2`, `ADR-044/D4`, `RN-3`, `RN-4`, `C-3`):
// the fused liquidation pane — pure checks first, then the same guarantees measured against the
// real `lightweight-charts@5.2.1` in a `jsdom` (`priceToCoordinate`, the library's own answer).
//
// Every guarantee has its MORDE here, run in the same file: a check that cannot fail is not a check.
//   - negate the long leg                  → the feed throws (no negative reaches `setData`);
//   - independent autoscale on the bars    → the same value draws at two heights;
//   - swap the two legs' `scale_ref`       → the short leg lands below the zero line;
//   - shift the lower bars' margin by 3 px → the two bases part by more than 1 px;
//   - a mark band inside the bars          → the form is refused.
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { test } from "node:test";

import { JSDOM } from "jsdom";

import { flushFrames, installGlobals } from "./headless-chart.ts";
import {
  LIQUIDATION_INVERTED_SIDE,
  LIQUIDATION_SCALE_IDS,
  LiquidationPaneError,
  assertValidLiquidationPaneForm,
  countNegativeFeedValues,
  liquidationBarBase,
  liquidationPaneFeeds,
  liquidationPaneLayout,
  liquidationSideOfScale,
  sharedMagnitudeAutoscale,
  type LiquidationLegInput,
  type LiquidationPaneForm,
  type LiquidationPaneLayout,
  type LiquidationScaleMode,
  type LiquidationSide,
} from "./liquidation-pane-geometry.ts";
import { LEGEND_GAP_PX, SEPARATOR_CLEARANCE_PX } from "./pane-stack-layout.ts";
import type { ScalarSlot } from "./s2-scalar-grid.ts";

// ── The form these geometry checks run on ──────────────────────────────────────────────────
//
// LOCAL on purpose (`T-04.4`, gate §5.1: "apagá-la e dar aos testes de charts uma forma local"). The
// decided form is `web`'s (`app/symbol/liquidation-pane-form.ts`) and `charts` may not import `web`
// (`ADR-003`). It is a copy of the decided values so the pixel checks below measure the geometry the
// app draws; `app/symbol/liquidation-pane-form.test.ts` pins the web constant itself.

const FORM: LiquidationPaneForm = {
  mode: "normal",
  zeroLine: 0.5,
  up: { marks: { top: 0, bottom: 0.06 }, barsTop: 0.09 },
  down: { barsBottom: 0.91, marks: { top: 0.94, bottom: 1 } },
  absenceMarkPx: 2,
  zeroMarkPx: 6,
};

// ── Synthetic legs ───────────────────────────────────────────────────────────────────────────
//
// Synthetic on purpose (the reason `liquidation-geometry.test.ts` gives): what fails here is the
// RATIO between the legs' maxima and the sparsity, and the real long maximum is ~3,5x–4,6x the
// short one (`T-04.0` §1.3: BTC 6.759.380 vs 1.918.350; ETH 12.849.220 vs 2.766.473). The synthetic
// ratio is 10x so the independent-autoscale mutant has room to show.

const SLOT_COUNT = 240;
const START_MS = 1_700_000_040_000;
const ONE_MINUTE_MS = 60_000;
/** The value BOTH legs carry, at different slots — the `C-3` probe. */
const SAME_VALUE = 5_000;
const SHORT_SAME_SLOT = 50;
const LONG_SAME_SLOT = 60;
const SHORT_MAX = 40_000;
const SHORT_MAX_SLOT = 100;
const LONG_MAX = 400_000;
const LONG_MAX_SLOT = 180;
/** A slot where the short leg is ABSENT and the long leg is a legitimate ZERO, and its mirror. */
const SHORT_ABSENT_LONG_ZERO = 12;
const SHORT_ZERO_LONG_ABSENT = 17;

function shortValue(index: number): number | null {
  if (index === SHORT_SAME_SLOT) return SAME_VALUE;
  if (index === SHORT_MAX_SLOT) return SHORT_MAX;
  if (index === SHORT_ABSENT_LONG_ZERO) return null;
  if (index === SHORT_ZERO_LONG_ABSENT) return 0;
  if (index % 7 === 0) return 200 + ((index * 37) % 900);
  if (index % 7 === 3) return 0;
  return null;
}

function longValue(index: number): number | null {
  if (index === LONG_SAME_SLOT) return SAME_VALUE;
  if (index === LONG_MAX_SLOT) return LONG_MAX;
  if (index === SHORT_ABSENT_LONG_ZERO) return 0;
  if (index === SHORT_ZERO_LONG_ABSENT) return null;
  if (index % 5 === 0) return 300 + ((index * 53) % 1_500);
  if (index % 5 === 2) return 0;
  return null;
}

function slotsOf(value: (index: number) => number | null): ScalarSlot[] {
  return Array.from({ length: SLOT_COUNT }, (_unused, index) => ({ time: START_MS + index * ONE_MINUTE_MS, value: value(index) }));
}

const SHORT_SLOTS = slotsOf(shortValue);
const LONG_SLOTS = slotsOf(longValue);

/** The owner's `[Q-LIQ-2]` (Coinalyze): short up, long down — expressed ONLY by `scaleRef`. */
function designLegs(): LiquidationLegInput[] {
  return [
    { cohort: "short", scaleRef: LIQUIDATION_SCALE_IDS.up.bars, slots: SHORT_SLOTS },
    { cohort: "long", scaleRef: LIQUIDATION_SCALE_IDS.down.bars, slots: LONG_SLOTS },
  ];
}

const MARKS = { up: { absence: 2, zero: 6 }, down: { absence: 2, zero: 6 } } as const;

function asLayout(layout: LiquidationPaneLayout): Extract<LiquidationPaneLayout, { kind: "layout" }> {
  assert.equal(layout.kind, "layout", `expected a layout, got ${layout.kind}`);
  return layout as Extract<LiquidationPaneLayout, { kind: "layout" }>;
}

// ── Pure: the form and the layout ────────────────────────────────────────────────────────────

test("the form is valid, and the two bar scales meet at ONE zero line for any legend height", () => {
  assertValidLiquidationPaneForm(FORM);
  let measured = 0;
  for (const paneHeightPx of [72, 104, 131, 217]) {
    for (const legendBottomPx of [0, 12, 20, 36]) {
      const layout = asLayout(liquidationPaneLayout(FORM, { paneHeightPx, legendBottomPx }));
      const up = layout.sides.up.bars.scaleMargins;
      const down = layout.sides.down.bars.scaleMargins;
      const upFloorPx = paneHeightPx * (1 - up.bottom);
      const downTopPx = paneHeightPx * down.top;
      assert.ok(Math.abs(upFloorPx - downTopPx) < 1e-9, `h=${paneHeightPx} legend=${legendBottomPx}: ${upFloorPx} vs ${downTopPx}`);
      assert.ok(Math.abs(layout.zeroLinePx - upFloorPx) < 1e-9);
      // The data area starts under the legend (+ gap) and ends the clearance off the separator.
      assert.ok(Math.abs(layout.dataTopPx - (legendBottomPx + LEGEND_GAP_PX)) < 1e-9);
      assert.ok(Math.abs(layout.dataBottomPx - (paneHeightPx - SEPARATOR_CLEARANCE_PX)) < 1e-9);
      measured += 1;
    }
  }
  assert.equal(measured, 16);
});

test("the lower side is inverted on BOTH its scales, the upper on neither; one mode for both bar scales", () => {
  assert.deepEqual(LIQUIDATION_INVERTED_SIDE, { up: false, down: true });
  for (const mode of ["normal", "logarithmic"] as const) {
    const layout = asLayout(liquidationPaneLayout({ ...FORM, mode }, { paneHeightPx: 104, legendBottomPx: 20 }));
    assert.equal(layout.sides.up.bars.invertScale, false);
    assert.equal(layout.sides.up.marks.invertScale, false);
    assert.equal(layout.sides.down.bars.invertScale, true);
    assert.equal(layout.sides.down.marks.invertScale, true);
    assert.equal(layout.sides.up.bars.mode, mode);
    assert.equal(layout.sides.down.bars.mode, mode);
    assert.equal(layout.sides.up.bars.base, liquidationBarBase(mode));
    assert.equal(layout.sides.down.bars.base, liquidationBarBase(mode));
    assert.equal(layout.sides.up.marks.mode, "normal");
  }
  assert.equal(liquidationBarBase("normal"), 0);
  assert.equal(liquidationBarBase("logarithmic"), 1);
});

test("each leg's mark band is on its OWN side and disjoint from its bars, in pixels of the applied margins", () => {
  const paneHeightPx = 104;
  const layout = asLayout(liquidationPaneLayout(FORM, { paneHeightPx, legendBottomPx: 20 }));
  const px = (margins: { top: number; bottom: number }) => ({ top: paneHeightPx * margins.top, bottom: paneHeightPx * (1 - margins.bottom) });
  const upMarks = px(layout.sides.up.marks.scaleMargins);
  const upBars = px(layout.sides.up.bars.scaleMargins);
  const downBars = px(layout.sides.down.bars.scaleMargins);
  const downMarks = px(layout.sides.down.marks.scaleMargins);
  assert.ok(layout.dataTopPx <= upMarks.top && upMarks.bottom < upBars.top, "upper marks are not above the upper bars");
  assert.ok(upBars.bottom <= layout.zeroLinePx && downBars.top >= layout.zeroLinePx);
  assert.ok(downBars.bottom < downMarks.top && downMarks.bottom <= layout.dataBottomPx, "lower marks are not below the lower bars");
  for (const side of ["up", "down"] as const) {
    assert.equal(layout.sides[side].markBand.kind, "band", `${side} marks collapsed in a 104 px pane`);
  }
});

test("MORDE: a form that puts a mark band inside the bars, or on the other leg's side, is refused", () => {
  const base = FORM;
  const refused: readonly [string, LiquidationPaneForm][] = [
    ["upper marks overlap the upper bars", { ...base, up: { ...base.up, marks: { top: 0, bottom: 0.2 } } }],
    ["lower marks overlap the lower bars", { ...base, down: { ...base.down, marks: { top: 0.8, bottom: 1 } } }],
    ["upper marks glued to the zero line (the T-04.0 §3.1 collision)", { ...base, up: { marks: { top: 0.44, bottom: 0.5 }, barsTop: 0.1 } }],
    ["lower marks on the upper side", { ...base, down: { barsBottom: 0.84, marks: { top: 0.2, bottom: 0.3 } } }],
    ["zero line outside the bars", { ...base, zeroLine: 0.95 }],
    ["a band past the data area", { ...base, down: { ...base.down, marks: { top: 0.88, bottom: 1.2 } } }],
  ];
  for (const [name, form] of refused) {
    assert.throws(() => assertValidLiquidationPaneForm(form), LiquidationPaneError, name);
    assert.throws(() => liquidationPaneLayout(form, { paneHeightPx: 104, legendBottomPx: 20 }), LiquidationPaneError, name);
  }
});

test("unmeasured before the first frame, collapsed with no data area, overflow when the legend is too tall", () => {
  const form = FORM;
  assert.equal(liquidationPaneLayout(form, { paneHeightPx: 0, legendBottomPx: 10 }).kind, "unmeasured");
  assert.equal(liquidationPaneLayout(form, { paneHeightPx: 104, legendBottomPx: null }).kind, "unmeasured");
  assert.equal(liquidationPaneLayout(form, { paneHeightPx: 3, legendBottomPx: 0 }).kind, "collapsed");
  const overflow = asLayout(liquidationPaneLayout(form, { paneHeightPx: 104, legendBottomPx: 90 }));
  assert.equal(overflow.legendOverflow, true);
  assert.equal(overflow.dataTopPx, 0);
});

// ── Pure: the feeds ──────────────────────────────────────────────────────────────────────────

test("six feeds, magnitudes only: no value < 0 reaches setData (RN-3, F-6 b)", () => {
  const feeds = liquidationPaneFeeds(designLegs(), MARKS);
  assert.equal(feeds.length, 6);
  assert.deepEqual(
    feeds.map((feed) => `${feed.cohort}:${feed.side}:${feed.role}:${feed.priceScaleId}`),
    [
      "short:up:bars:liquidation_up",
      "short:up:absence_mark:liquidation_up_marks",
      "short:up:zero_mark:liquidation_up_marks",
      "long:down:bars:liquidation_down",
      "long:down:absence_mark:liquidation_down_marks",
      "long:down:zero_mark:liquidation_down_marks",
    ],
  );
  assert.equal(countNegativeFeedValues(feeds), 0);
  const longBars = feeds.find((feed) => feed.cohort === "long" && feed.role === "bars")!;
  const fed = longBars.items.filter((item) => "value" in item).map((item) => (item as { value: number }).value);
  assert.ok(fed.length > 0);
  assert.ok(fed.includes(LONG_MAX), "the long leg entered as its magnitude");
});

test("MORDE: negating the long leg (the plan-B mechanism) does not reach setData — the feed throws", () => {
  const negated = designLegs().map((leg) =>
    leg.cohort === "long" ? { ...leg, slots: leg.slots.map((slot) => ({ ...slot, value: slot.value === null ? null : -slot.value })) } : leg,
  );
  // Either guard may be the one that fires (the adapter's `RangeError`, or the re-count's own error);
  // what the MORDE requires is that no feed comes out.
  assert.throws(
    () => liquidationPaneFeeds(negated, MARKS),
    (error: unknown) => error instanceof RangeError || error instanceof LiquidationPaneError,
  );
  // The instrument itself sees a negative when one is there.
  assert.equal(
    countNegativeFeedValues([{ cohort: "long", side: "down", role: "bars", priceScaleId: "liquidation_down", items: [{ time: 1, value: -3 }] }]),
    1,
  );
});

test("each leg keeps ITS OWN absence/zero pair, on its own side (RN-4, plan 04 item 4.2)", () => {
  const feeds = liquidationPaneFeeds(designLegs(), MARKS);
  const valueAt = (cohort: string, role: string, index: number) => {
    const item = feeds.find((feed) => feed.cohort === cohort && feed.role === role)!.items[index]!;
    return "value" in item ? item.value : null;
  };
  // Short absent, long zero, in the same slot: an absence mark up, a zero mark down, nothing crossed.
  assert.equal(valueAt("short", "absence_mark", SHORT_ABSENT_LONG_ZERO), MARKS.up.absence);
  assert.equal(valueAt("short", "zero_mark", SHORT_ABSENT_LONG_ZERO), null);
  assert.equal(valueAt("long", "zero_mark", SHORT_ABSENT_LONG_ZERO), MARKS.down.zero);
  assert.equal(valueAt("long", "absence_mark", SHORT_ABSENT_LONG_ZERO), null);
  // The mirror slot.
  assert.equal(valueAt("short", "zero_mark", SHORT_ZERO_LONG_ABSENT), MARKS.up.zero);
  assert.equal(valueAt("long", "absence_mark", SHORT_ZERO_LONG_ABSENT), MARKS.down.absence);
  // Over the whole grid: per leg, exactly one of bar / zero / absent per slot.
  for (const [cohort, slots] of [["short", SHORT_SLOTS], ["long", LONG_SLOTS]] as const) {
    slots.forEach((slot, index) => {
      const states = [valueAt(cohort, "bars", index), valueAt(cohort, "zero_mark", index), valueAt(cohort, "absence_mark", index)].filter(
        (value) => value !== null,
      );
      assert.equal(states.length, 1, `${cohort} slot ${index} (${slot.value}) is in ${states.length} states`);
    });
  }
});

test("the side is the scale_ref's alone: swapping it swaps the legs; two legs on one side are refused", () => {
  assert.equal(liquidationSideOfScale("liquidation_up"), "up");
  assert.equal(liquidationSideOfScale("liquidation_down_marks"), "down");
  assert.equal(liquidationSideOfScale("liquidation_marks"), null);
  const swapped = liquidationPaneFeeds(
    [
      { cohort: "short", scaleRef: LIQUIDATION_SCALE_IDS.down.bars, slots: SHORT_SLOTS },
      { cohort: "long", scaleRef: LIQUIDATION_SCALE_IDS.up.bars, slots: LONG_SLOTS },
    ],
    MARKS,
  );
  assert.equal(swapped.find((feed) => feed.cohort === "short" && feed.role === "bars")!.side, "down");
  assert.throws(
    () =>
      liquidationPaneFeeds(
        [
          { cohort: "short", scaleRef: LIQUIDATION_SCALE_IDS.up.bars, slots: SHORT_SLOTS },
          { cohort: "long", scaleRef: LIQUIDATION_SCALE_IDS.up.marks, slots: LONG_SLOTS },
        ],
        MARKS,
      ),
    LiquidationPaneError,
  );
  assert.throws(() => liquidationPaneFeeds([designLegs()[0]!], MARKS), LiquidationPaneError);
  assert.throws(
    () => liquidationPaneFeeds([designLegs()[0]!, { ...designLegs()[1]!, slots: LONG_SLOTS.slice(1) }], MARKS),
    LiquidationPaneError,
  );
  assert.throws(
    () => liquidationPaneFeeds([designLegs()[0]!, { ...designLegs()[1]!, scaleRef: "liquidation_marks" }], MARKS),
    LiquidationPaneError,
  );
});

// ── Pure: the shared maximum ─────────────────────────────────────────────────────────────────

test("the shared autoscale is the maximum of BOTH legs over the visible logical range, whole slots", () => {
  let range: { from: number; to: number } | null = null;
  const provider = sharedMagnitudeAutoscale([SHORT_SLOTS, LONG_SLOTS], "normal", () => range);
  assert.deepEqual(provider(), { priceRange: { minValue: 0, maxValue: LONG_MAX } });
  range = { from: 20, to: 120 };
  assert.deepEqual(provider(), { priceRange: { minValue: 0, maxValue: SHORT_MAX } }, "the long max at 180 is out of view");
  range = { from: 100.6, to: 150 };
  assert.equal(provider()!.priceRange.maxValue, SHORT_MAX, "a slot partly on screen still counts");
  range = { from: 179.2, to: 179.9 };
  assert.equal(provider()!.priceRange.maxValue, LONG_MAX, "ceil(to) includes the slot being scrolled in");
  range = { from: 1, to: 2 };
  assert.equal(provider(), null, "nothing above the base in view");
  const log = sharedMagnitudeAutoscale([SHORT_SLOTS, LONG_SLOTS], "logarithmic", () => null);
  assert.deepEqual(log(), { priceRange: { minValue: 1, maxValue: LONG_MAX } });
});

// ── Against lightweight-charts ───────────────────────────────────────────────────────────────

const CHART_WIDTH_PX = 900;
const CHART_HEIGHT_PX = 360;
const LEGEND_BOTTOM_PX = 18;

interface RenderOptions {
  readonly mode: LiquidationScaleMode;
  readonly legs: readonly LiquidationLegInput[];
  /** `false` is the `C-3` MORDE: each bar scale autoscales on its own leg. */
  readonly sharedAutoscale: boolean;
  readonly visible: { readonly from: number; readonly to: number } | null;
  /** The F-6 control: pushes the lower bars' `top` margin down by this many px. */
  readonly downBarsShiftPx?: number;
}

interface BarCoordinate {
  readonly cohort: string;
  readonly value: number;
  readonly y: number;
}

interface Render {
  readonly paneHeightPx: number;
  readonly zeroLinePx: number;
  /** `priceToCoordinate(base)` on each side's bar scale. */
  readonly baseY: Readonly<Record<LiquidationSide, number>>;
  /** Every visible present bar, with the y of its tip. */
  readonly bars: readonly BarCoordinate[];
  /** Height of `SAME_VALUE` on each cohort's scale: |y(value) − y(base)|. */
  readonly sameValueHeight: Readonly<Record<string, number>>;
  /** Tip of the visible maximum on each side, and each side's mark band edges. */
  readonly tipOfMaxY: Readonly<Record<LiquidationSide, number>>;
  readonly markBaseY: Readonly<Record<LiquidationSide, number>>;
  readonly markTipY: Readonly<Record<LiquidationSide, number>>;
  readonly dataTopPx: number;
  readonly dataBottomPx: number;
}

async function renderPane(options: RenderOptions): Promise<Render> {
  const dom = new JSDOM('<!doctype html><html><body><div id="chart"></div></body></html>', { pretendToBeVisual: true });
  installGlobals(dom);
  const lc = await import("lightweight-charts");
  const container = dom.window.document.getElementById("chart");
  assert.ok(container !== null);
  const chart = lc.createChart(container, { width: CHART_WIDTH_PX, height: CHART_HEIGHT_PX });
  await flushFrames(dom, 2);
  const paneHeightPx = chart.panes()[0]!.getHeight();
  assert.ok(paneHeightPx > 0, "pane not laid out");
  const layout = asLayout(liquidationPaneLayout({ ...FORM, mode: options.mode }, { paneHeightPx, legendBottomPx: LEGEND_BOTTOM_PX }));
  const markValues = {
    up: { absence: (layout.sides.up.markBand as { absenceMarkValue: number }).absenceMarkValue, zero: (layout.sides.up.markBand as { zeroMarkValue: number }).zeroMarkValue },
    down: { absence: (layout.sides.down.markBand as { absenceMarkValue: number }).absenceMarkValue, zero: (layout.sides.down.markBand as { zeroMarkValue: number }).zeroMarkValue },
  };
  const feeds = liquidationPaneFeeds(options.legs, markValues);
  const shared = sharedMagnitudeAutoscale(
    options.legs.map((leg) => leg.slots),
    options.mode,
    () => chart.timeScale().getVisibleLogicalRange(),
  );
  const handles = new Map<string, ReturnType<typeof chart.addSeries>>();
  for (const feed of feeds) {
    const side = layout.sides[feed.side];
    const isBars = feed.role === "bars";
    const scale = isBars ? side.bars : side.marks;
    const markBand = side.markBand as { priceRange: { minValue: number; maxValue: number } };
    const series = chart.addSeries(lc.HistogramSeries, {
      priceScaleId: scale.priceScaleId,
      priceLineVisible: false,
      lastValueVisible: false,
      ...(isBars ? { base: side.bars.base } : {}),
      ...(isBars && options.sharedAutoscale ? { autoscaleInfoProvider: shared } : {}),
      ...(!isBars ? { autoscaleInfoProvider: () => ({ priceRange: markBand.priceRange }) } : {}),
    });
    let margins = scale.scaleMargins;
    if (isBars && feed.side === "down" && options.downBarsShiftPx !== undefined) {
      margins = { top: margins.top + options.downBarsShiftPx / paneHeightPx, bottom: margins.bottom };
    }
    series.priceScale().applyOptions({
      scaleMargins: margins,
      invertScale: scale.invertScale,
      mode: scale.mode === "logarithmic" ? lc.PriceScaleMode.Logarithmic : lc.PriceScaleMode.Normal,
    });
    series.setData(feed.items as never);
    handles.set(`${feed.cohort}:${feed.role}`, series);
  }
  if (options.visible === null) {
    chart.timeScale().fitContent();
  } else {
    chart.timeScale().setVisibleLogicalRange(options.visible);
  }
  await flushFrames(dom, 3);

  const visible = chart.timeScale().getVisibleLogicalRange();
  assert.ok(visible !== null);
  const inView = (index: number) => index >= Math.floor(visible.from) && index <= Math.ceil(visible.to);
  const y = (key: string, value: number): number => {
    const coordinate = handles.get(key)!.priceToCoordinate(value);
    assert.ok(coordinate !== null, `${key}: no coordinate for ${value} — the measurement would be vacuous`);
    return coordinate as number;
  };
  const sideOf = (cohort: string) => feeds.find((feed) => feed.cohort === cohort)!.side;
  const cohortOn = (side: LiquidationSide) => feeds.find((feed) => feed.side === side)!.cohort;
  const bars: BarCoordinate[] = [];
  let maxInView = Number.NEGATIVE_INFINITY;
  const maxBySide: Record<string, number> = { up: -Infinity, down: -Infinity };
  for (const leg of options.legs) {
    leg.slots.forEach((slot, index) => {
      if (slot.value !== null && slot.value > 0 && inView(index)) {
        bars.push({ cohort: leg.cohort, value: slot.value, y: y(`${leg.cohort}:bars`, slot.value) });
        maxInView = Math.max(maxInView, slot.value);
        maxBySide[sideOf(leg.cohort)] = Math.max(maxBySide[sideOf(leg.cohort)]!, slot.value);
      }
    });
  }
  const base = liquidationBarBase(options.mode);
  const baseY = { up: y(`${cohortOn("up")}:bars`, base), down: y(`${cohortOn("down")}:bars`, base) };
  const sameValueHeight: Record<string, number> = {};
  for (const leg of options.legs) {
    sameValueHeight[leg.cohort] = Math.abs(y(`${leg.cohort}:bars`, SAME_VALUE) - y(`${leg.cohort}:bars`, base));
  }
  const tipOfMaxY = {
    up: y(`${cohortOn("up")}:bars`, options.sharedAutoscale ? maxInView : maxBySide.up!),
    down: y(`${cohortOn("down")}:bars`, options.sharedAutoscale ? maxInView : maxBySide.down!),
  };
  const markBaseY = { up: y(`${cohortOn("up")}:zero_mark`, 0), down: y(`${cohortOn("down")}:zero_mark`, 0) };
  const markTipY = { up: y(`${cohortOn("up")}:zero_mark`, markValues.up.zero), down: y(`${cohortOn("down")}:zero_mark`, markValues.down.zero) };
  chart.remove();
  return {
    paneHeightPx,
    zeroLinePx: layout.zeroLinePx,
    baseY,
    bars,
    sameValueHeight,
    tipOfMaxY,
    markBaseY,
    markTipY,
    dataTopPx: layout.dataTopPx,
    dataBottomPx: layout.dataBottomPx,
  };
}

/** Bars drawn on the wrong side of the zero line: a short bar whose tip is not above the upper
 * base, or a long bar whose tip is not below the lower base. */
function wrongSideBars(render: Render): number {
  return render.bars.filter((bar) => (bar.cohort === "short" ? !(bar.y < render.baseY.up) : !(bar.y > render.baseY.down))).length;
}

const MODES: readonly LiquidationScaleMode[] = ["normal", "logarithmic"];
const WINDOWS = [null, { from: 20, to: 120 }, { from: 140, to: 239 }] as const;

test("against lightweight-charts: the two bases are ≤ 1 px apart, and a 3 px shift is caught (F-6 a)", async (t) => {
  const gaps: string[] = [];
  for (const mode of MODES) {
    for (const visible of WINDOWS) {
      const render = await renderPane({ mode, legs: designLegs(), sharedAutoscale: true, visible });
      const gap = render.baseY.down - render.baseY.up;
      gaps.push(`${mode}:${visible === null ? "fit" : visible.from}:${gap.toFixed(3)}`);
      assert.ok(gap >= 0 && gap <= 1, `${mode}: bases ${render.baseY.up} / ${render.baseY.down}, gap ${gap}`);
      assert.ok(Math.abs(render.baseY.up - render.zeroLinePx) <= 1, `${mode}: upper base ${render.baseY.up} off the zero line ${render.zeroLinePx}`);
    }
    const shifted = await renderPane({ mode, legs: designLegs(), sharedAutoscale: true, visible: null, downBarsShiftPx: 3 });
    const shiftedGap = shifted.baseY.down - shifted.baseY.up;
    assert.ok(shiftedGap > 1, `${mode}: the 3 px control drew a gap of ${shiftedGap} — the check is blind`);
    gaps.push(`${mode}:shift3:${shiftedGap.toFixed(3)}`);
  }
  t.diagnostic(`base gaps (down − up, px): ${gaps.join(" ")}`);
  assert.equal(gaps.length, 8);
});

test("against lightweight-charts: short above the zero line, long below, and swapping the scale_ref is caught (CA-LIQ)", async (t) => {
  const counts: string[] = [];
  for (const mode of MODES) {
    for (const visible of WINDOWS) {
      const render = await renderPane({ mode, legs: designLegs(), sharedAutoscale: true, visible });
      counts.push(`${mode}:${visible === null ? "fit" : visible.from}:${render.bars.length}`);
      assert.ok(render.bars.length >= 20, `only ${render.bars.length} visible bars`);
      assert.equal(wrongSideBars(render), 0, `${mode}: bars on the wrong side of the zero line`);
      assert.ok(render.bars.every((bar) => (bar.cohort === "short" ? bar.y < render.zeroLinePx : bar.y > render.zeroLinePx)));
    }
    const swapped = await renderPane({
      mode,
      legs: [
        { cohort: "short", scaleRef: LIQUIDATION_SCALE_IDS.down.bars, slots: SHORT_SLOTS },
        { cohort: "long", scaleRef: LIQUIDATION_SCALE_IDS.up.bars, slots: LONG_SLOTS },
      ],
      sharedAutoscale: true,
      visible: null,
    });
    assert.equal(wrongSideBars(swapped), swapped.bars.length, `${mode}: the swapped legs were not ALL caught on the wrong side`);
    counts.push(`${mode}:swapped:${wrongSideBars(swapped)}/${swapped.bars.length}`);
  }
  t.diagnostic(`visible bars checked per render (wrong side = 0): ${counts.join(" ")}`);
});

test("against lightweight-charts: the same value is the same height on both legs; independent autoscale is caught (C-3)", async (t) => {
  const errors: string[] = [];
  for (const mode of MODES) {
    for (const visible of WINDOWS) {
      const render = await renderPane({ mode, legs: designLegs(), sharedAutoscale: true, visible });
      const error = Math.abs(render.sameValueHeight.short! - render.sameValueHeight.long!);
      errors.push(`${mode}:${visible === null ? "fit" : visible.from}:${error.toFixed(3)}`);
      assert.ok(error <= 1, `${mode} ${JSON.stringify(visible)}: ${SAME_VALUE} is ${render.sameValueHeight.short} px short, ${render.sameValueHeight.long} px long`);
    }
    const independent = await renderPane({ mode, legs: designLegs(), sharedAutoscale: false, visible: null });
    const error = Math.abs(independent.sameValueHeight.short! - independent.sameValueHeight.long!);
    assert.ok(error > 3, `${mode}: independent autoscale drew ${SAME_VALUE} ${error.toFixed(2)} px apart — the check is blind`);
    errors.push(`${mode}:independent:${error.toFixed(3)}`);
  }
  t.diagnostic(`|height(short) − height(long)| for ${SAME_VALUE}, px: ${errors.join(" ")}`);
});

test("against lightweight-charts: the visible maximum reaches its band's ceiling, and each leg's marks stay on its outer edge", async () => {
  for (const mode of MODES) {
    for (const visible of WINDOWS) {
      const render = await renderPane({ mode, legs: designLegs(), sharedAutoscale: true, visible });
      // The upper marks (normal scale) grow UP from their base; the lower (inverted) grow DOWN.
      assert.ok(render.markTipY.up < render.markBaseY.up && render.markTipY.down > render.markBaseY.down);
      assert.ok(render.markTipY.up >= render.dataTopPx - 1, `${mode}: upper marks run under the legend`);
      assert.ok(render.markBaseY.up < render.tipOfMaxY.up, `${mode}: upper marks overlap the tallest upper bar`);
      assert.ok(render.markBaseY.down > render.tipOfMaxY.down, `${mode}: lower marks overlap the tallest lower bar`);
      assert.ok(render.markTipY.down <= render.dataBottomPx + 1, `${mode}: lower marks run into the separator clearance`);
      assert.ok(render.markBaseY.up < render.zeroLinePx && render.markBaseY.down > render.zeroLinePx);
    }
  }
});
