// `T-01.3`: the mark band anchored in `IPaneApi.getHeight()` (plan `01` item `1.4`, `RN-4`,
// `ADR-003/FR-2`). Two halves: the pure function, and a check against the REAL library that the
// band it returns makes a mark of value `N` exactly `N` px tall in a multi-pane chart — and that
// the chart-height anchor it replaces does not.
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { test } from "node:test";

import { JSDOM } from "jsdom";

import { flushFrames, installGlobals } from "./headless-chart.ts";
import { absenceMarkSeries, zeroMarkSeries } from "./s2-lightweight-adapter.ts";
import { markBandGeometry, markBandGeometryOfPane, MIN_DRAWABLE_MARK_PX } from "./mark-band-geometry.ts";
import type { MarkBandGeometry, MarkBandSpec } from "./mark-band-geometry.ts";

// The two production forms of today (`SymbolClient.tsx`), restated as INPUT fixtures — this
// module owns no form, so the test states the form it measures instead of importing it from `web`.
const VOLUME_SPEC: MarkBandSpec = { scaleMargins: { top: 0.8, bottom: 0 }, absenceMarkPx: 2, zeroMarkPx: 6 };
const LIQUIDATION_SPEC: MarkBandSpec = { scaleMargins: { top: 0.88, bottom: 0 }, absenceMarkPx: 6, zeroMarkPx: 18 };

function asBand(geometry: MarkBandGeometry): Extract<MarkBandGeometry, { kind: "band" }> {
  assert.equal(geometry.kind, "band", `expected a band, got ${JSON.stringify(geometry)}`);
  return geometry as Extract<MarkBandGeometry, { kind: "band" }>;
}

// ── pure ─────────────────────────────────────────────────────────────────────────────────────

test("the band is the pane height the marks' margins leave, and the marks keep their nominal px when they fit", () => {
  const band = asBand(markBandGeometry(300, VOLUME_SPEC));
  assert.ok(Math.abs(band.bandPx - 60) < 1e-9);
  assert.ok(Math.abs(band.spanPx - 59) < 1e-9, "the library's one-pixel inset was not taken off the band");
  assert.deepEqual(band.priceRange, { minValue: 0, maxValue: band.spanPx });
  assert.equal(band.absenceMarkValue, 2);
  assert.equal(band.zeroMarkValue, 6);
  assert.equal(band.shrunk, false);
});

test("the band follows the pane, not a chart constant: two heights give two bands", () => {
  const tall = asBand(markBandGeometry(400, LIQUIDATION_SPEC));
  const short = asBand(markBandGeometry(200, LIQUIDATION_SPEC));
  assert.ok(Math.abs(tall.bandPx - 2 * short.bandPx) < 1e-9);
});

test("bottom margin is honoured too, not only top", () => {
  const band = asBand(markBandGeometry(500, { ...VOLUME_SPEC, scaleMargins: { top: 0.5, bottom: 0.1 } }));
  assert.ok(Math.abs(band.bandPx - 200) < 1e-9);
});

test("a non-positive or non-finite height is 'not laid out yet' — unmeasured, never a guessed band", () => {
  for (const height of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(markBandGeometry(height, VOLUME_SPEC).kind, "unmeasured", `height ${height}`);
  }
});

test("marks taller than the band are scaled by ONE factor: zero fits the band, ratio is kept", () => {
  // The 72px pane floor with the liquidation margins: band 8.64px (span 7.64px), nominal zero mark 18px.
  const band = asBand(markBandGeometry(72, LIQUIDATION_SPEC));
  assert.equal(band.shrunk, true);
  assert.ok(band.zeroMarkValue <= band.spanPx + 1e-9, "the zero mark climbed out of its band");
  assert.ok(Math.abs(band.zeroMarkValue / band.absenceMarkValue - 3) < 1e-9, "the 3:1 height ratio was not kept");
  assert.ok(band.absenceMarkValue >= MIN_DRAWABLE_MARK_PX);
});

test("MORDE: feeding the nominal zero mark into the 72px floor band overflows it — the case the shrink closes", () => {
  const bandPx = 72 * (1 - LIQUIDATION_SPEC.scaleMargins.top);
  assert.ok(LIQUIDATION_SPEC.zeroMarkPx > bandPx, "the fixture no longer exercises the overflow — pick a smaller pane");
});

test("a band too short to keep absence >= 1px while below zero is 'collapsed', not a sub-pixel mark", () => {
  // band = 20 * 0.12 = 2.4px, span 1.4px -> factor 1.4/18 -> absence 0.47px < 1px.
  const geometry = markBandGeometry(20, LIQUIDATION_SPEC);
  assert.equal(geometry.kind, "collapsed");
  assert.ok(geometry.kind === "collapsed" && Math.abs(geometry.bandPx - 2.4) < 1e-9);
  // A band of one pixel or less has no span at all.
  assert.equal(markBandGeometry(8, LIQUIDATION_SPEC).kind, "collapsed");
});

test("a spec that cannot separate the marks is refused, not drawn", () => {
  assert.throws(() => markBandGeometry(300, { ...VOLUME_SPEC, zeroMarkPx: 2 }), RangeError);
  assert.throws(() => markBandGeometry(300, { ...VOLUME_SPEC, absenceMarkPx: 0.5 }), RangeError);
  assert.throws(() => markBandGeometry(300, { ...VOLUME_SPEC, scaleMargins: { top: 0.6, bottom: 0.4 } }), RangeError);
  assert.throws(() => markBandGeometry(300, { ...VOLUME_SPEC, scaleMargins: { top: -0.1, bottom: 0 } }), RangeError);
});

test("markBandGeometryOfPane reads getHeight() and nothing else", () => {
  let reads = 0;
  const pane = {
    getHeight(): number {
      reads += 1;
      return 300;
    },
  };
  assert.deepEqual(markBandGeometryOfPane(pane, VOLUME_SPEC), markBandGeometry(300, VOLUME_SPEC));
  assert.equal(reads, 1);
});

// ── against the real library ─────────────────────────────────────────────────────────────────

const WIDTH_PX = 800;
const CHART_PX = 600;
const SLOT_MS = 60_000;
const T0_MS = Date.UTC(2026, 8, 1);

/** Ten slots: a present value, a gap and a legitimate zero, repeated — both marks get drawn. */
function slots(): { time: number; value: number | null }[] {
  return Array.from({ length: 10 }, (_, i) => ({ time: T0_MS + i * SLOT_MS, value: i % 3 === 0 ? 5 : i % 3 === 1 ? null : 0 }));
}

interface MarkMeasurement {
  readonly paneHeightBeforeFrame: number;
  readonly paneHeightPx: number;
  readonly absenceHeightPx: number;
  readonly zeroHeightPx: number;
  readonly fed: { absence: number; zero: number };
}

/**
 * A two-pane chart (a line on top, a marks pane below, stretch 3:1 so the marks pane is NOT the
 * chart height) where the marks' scale is pinned to `bandFor(paneHeight)`. Returns the height in
 * pixels of each mark as the library places it.
 */
async function measureMarksPane(
  spec: MarkBandSpec,
  bandFor: (paneHeightPx: number) => { bandPx: number; absence: number; zero: number },
): Promise<MarkMeasurement> {
  const dom = new JSDOM('<!doctype html><html><body><div id="chart"></div></body></html>', { pretendToBeVisual: true });
  installGlobals(dom);
  const lc = await import("lightweight-charts");
  const container = dom.window.document.getElementById("chart");
  assert.ok(container !== null);
  const chart = lc.createChart(container, { width: WIDTH_PX, height: CHART_PX });
  const top = chart.addSeries(lc.LineSeries, {});
  top.setData(slots().map((slot) => ({ time: (slot.time / 1000) as never, value: 1 })));

  const markPane = chart.addPane();
  const paneHeightBeforeFrame = markPane.getHeight();
  chart.panes()[0]?.setStretchFactor(3);
  markPane.setStretchFactor(1);
  await flushFrames(dom, 3);

  const paneHeightPx = markPane.getHeight();
  const band = bandFor(paneHeightPx);
  const style = {
    priceScaleId: "marks",
    priceLineVisible: false,
    lastValueVisible: false,
    autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: band.bandPx } }),
  };
  const absence = chart.addSeries(lc.HistogramSeries, style, markPane.paneIndex());
  absence.priceScale().applyOptions({ scaleMargins: spec.scaleMargins });
  absence.setData(absenceMarkSeries(slots(), band.absence) as never);
  const zero = chart.addSeries(lc.HistogramSeries, style, markPane.paneIndex());
  zero.setData(zeroMarkSeries(slots(), band.zero) as never);
  chart.timeScale().fitContent();
  await flushFrames(dom, 3);

  const base = absence.priceToCoordinate(0);
  const absenceTop = absence.priceToCoordinate(band.absence);
  const zeroTop = zero.priceToCoordinate(band.zero);
  assert.ok(base !== null && absenceTop !== null && zeroTop !== null, "the library placed no mark — the measurement would be vacuous");
  chart.remove();
  return {
    paneHeightBeforeFrame,
    paneHeightPx,
    absenceHeightPx: (base as number) - (absenceTop as number),
    zeroHeightPx: (base as number) - (zeroTop as number),
    fed: { absence: band.absence, zero: band.zero },
  };
}

function fromGeometry(spec: MarkBandSpec) {
  return (paneHeightPx: number) => {
    const band = asBand(markBandGeometry(paneHeightPx, spec));
    return { bandPx: band.priceRange.maxValue, absence: band.absenceMarkValue, zero: band.zeroMarkValue };
  };
}

test("against lightweight-charts: anchored in getHeight(), a mark of value N is N px tall in a pane that is not the chart", async () => {
  for (const spec of [VOLUME_SPEC, LIQUIDATION_SPEC]) {
    const measured = await measureMarksPane(spec, fromGeometry(spec));
    assert.ok(measured.paneHeightPx > 0 && measured.paneHeightPx < CHART_PX * 0.5, `pane height ${measured.paneHeightPx}`);
    assert.ok(Math.abs(measured.absenceHeightPx - measured.fed.absence) < 0.5, `absence ${measured.absenceHeightPx} vs ${measured.fed.absence}`);
    assert.ok(Math.abs(measured.zeroHeightPx - measured.fed.zero) < 0.5, `zero ${measured.zeroHeightPx} vs ${measured.fed.zero}`);
    assert.ok(measured.absenceHeightPx >= MIN_DRAWABLE_MARK_PX && measured.absenceHeightPx < measured.zeroHeightPx);
  }
});

test("MORDE: the chart-height anchor it replaces (bandPx = chartHeight * (1 - top)) mis-sizes the same marks", async () => {
  const spec = VOLUME_SPEC;
  const measured = await measureMarksPane(spec, () => ({
    bandPx: CHART_PX * (1 - spec.scaleMargins.top),
    absence: spec.absenceMarkPx,
    zero: spec.zeroMarkPx,
  }));
  // With a 3:1 split the marks pane is ~1/4 of the chart: the chart anchor shrinks every mark ~4x.
  assert.ok(measured.zeroHeightPx < spec.zeroMarkPx * 0.5, `zero mark ${measured.zeroHeightPx}px — the chart anchor no longer mis-sizes`);
});

test("MORDE: pinning the range to the full band instead of the span (no library inset) draws the marks 1px-proportionally short", async () => {
  const spec = LIQUIDATION_SPEC;
  const measured = await measureMarksPane(spec, (paneHeightPx) => {
    const band = asBand(markBandGeometry(paneHeightPx, spec));
    return { bandPx: band.bandPx, absence: band.absenceMarkValue, zero: band.zeroMarkValue };
  });
  assert.ok(measured.fed.zero - measured.zeroHeightPx > 0.5, `zero ${measured.zeroHeightPx} vs fed ${measured.fed.zero} — the inset no longer matters`);
});

test("[T-01.0 item 1] the pane height is recorded before the first frame, and the geometry refuses it when it is 0", async () => {
  const measured = await measureMarksPane(VOLUME_SPEC, fromGeometry(VOLUME_SPEC));
  // Measured, not assumed: lightweight-charts@5.2.1 answers `0` in the tick of `addPane`. If a
  // library bump changes that, this line fails and the "ask after the first frame" rule is re-read.
  assert.equal(measured.paneHeightBeforeFrame, 0, "getHeight() before the first frame is no longer 0");
  assert.equal(markBandGeometry(measured.paneHeightBeforeFrame, VOLUME_SPEC).kind, "unmeasured");
  assert.ok(measured.paneHeightPx > 0, "after the first frames the pane must have a height");
});
