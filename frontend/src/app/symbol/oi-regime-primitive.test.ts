// `T-03.14` (`paineis-de-fluxo`, design review `MF-1`) — the OI regime primitive never inks the rows
// of the pane legend. Painted from `y = 0`, the boundary rule struck through the legend text and the
// band sat behind it (5/5 scenes, 38/38 legend rows inked, `gates/T-03.14-design-review.md` §3) —
// the `SF-10` class the W5 closed on the liquidation pane.
//
// What this file guards, on the primitive's OWN draw calls (a recording canvas, no browser):
//
//   1. every `fillRect` of the band (`drawBackground`) and of the rule (`draw`) starts at the first
//      bitmap row UNDER the legend's measured bottom, at DPR 1 and 2, and reaches the pane's bottom;
//   2. both calls happen at all (a primitive that paints nothing would pass 1 vacuously);
//   3. while the legend is not measured (`null`), nothing is painted — `0` is exactly the defect.
//
// The mutation this file must reject: `fillRect(x, 0, …, bitmapSize.height)` in either renderer.
// The pixel twin is `e2e/37-oi-regime-marks-pixel.spec.ts` (`RM-3b`).
//
// Run with: npm --prefix frontend run test:app

import assert from "node:assert/strict";
import { test } from "node:test";

import type { IPrimitivePaneRenderer, PaneAttachedParameter, Time } from "lightweight-charts";

import { ONE_MINUTE_MS } from "../../charts/index.ts";
import { OiRegimePanePrimitive, type OiRegimeCanvasMarks } from "./oi-regime-primitive.ts";

type DrawTarget = Parameters<IPrimitivePaneRenderer["draw"]>[0];

interface Fill {
  readonly style: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const PANE_WIDTH_PX = 400;
const PANE_HEIGHT_PX = 150;
const SLOT_SPACING_PX = 10;

/** A chart whose slot `i` is centred at `i · 10 + 5` media px. */
function fakeChart(): PaneAttachedParameter<Time> {
  const timeScale = {
    logicalToCoordinate: (index: number) => index * SLOT_SPACING_PX + SLOT_SPACING_PX / 2,
    width: () => PANE_WIDTH_PX,
  };
  return { chart: { timeScale: () => timeScale }, requestUpdate: () => undefined } as unknown as PaneAttachedParameter<Time>;
}

/** A draw target that records every `fillRect` it receives, in bitmap px. */
function recordingTarget(pixelRatio: number, fills: Fill[]): DrawTarget {
  const context = {
    fillStyle: "",
    fillRect(x: number, y: number, width: number, height: number) {
      fills.push({ style: String(this.fillStyle), x, y, width, height });
    },
  };
  const scope = {
    context,
    bitmapSize: { width: PANE_WIDTH_PX * pixelRatio, height: PANE_HEIGHT_PX * pixelRatio },
    mediaSize: { width: PANE_WIDTH_PX, height: PANE_HEIGHT_PX },
    horizontalPixelRatio: pixelRatio,
    verticalPixelRatio: pixelRatio,
  };
  return { useBitmapCoordinateSpace: (paint: (s: typeof scope) => void) => paint(scope) } as unknown as DrawTarget;
}

const MARKS: OiRegimeCanvasMarks = {
  bands: [{ leftExclusiveMs: 5 * ONE_MINUTE_MS, rightInclusiveMs: 20 * ONE_MINUTE_MS, derivedFrom: "binance_point_5m", candles: 3 }],
  rules: [{ atMs: 20 * ONE_MINUTE_MS, from: "binance_point_5m", to: "binance_poll_1m" }],
  gridStartMs: 0,
  gridStepMs: ONE_MINUTE_MS,
  paint: true,
};

function paint(legendBottomPx: number | null, pixelRatio: number): { readonly bands: Fill[]; readonly rules: Fill[] } {
  const primitive = new OiRegimePanePrimitive(() => undefined, () => legendBottomPx);
  primitive.attached(fakeChart());
  primitive.setMarks(MARKS);
  const renderer = primitive.paneViews()[0]!.renderer()!;
  const bands: Fill[] = [];
  const rules: Fill[] = [];
  renderer.drawBackground!(recordingTarget(pixelRatio, bands));
  renderer.draw(recordingTarget(pixelRatio, rules));
  return { bands, rules };
}

for (const pixelRatio of [1, 2]) {
  for (const legendBottomPx of [38, 38.4, 54]) {
    test(`MF-1: at DPR ${pixelRatio} with a ${legendBottomPx}-px legend, band and rule start under the legend and reach the pane's bottom`, () => {
      const { bands, rules } = paint(legendBottomPx, pixelRatio);
      assert.equal(bands.length, 1, "the band was not painted — the rows check below would pass vacuously");
      assert.equal(rules.length, 1, "the rule was not painted — the rows check below would pass vacuously");
      const firstRow = Math.ceil(legendBottomPx * pixelRatio);
      for (const [what, fill] of [["band", bands[0]!], ["rule", rules[0]!]] as const) {
        assert.equal(fill.y, firstRow, `${what} starts at row ${fill.y}, over the legend (its last row is ${firstRow - 1})`);
        assert.equal(fill.y + fill.height, PANE_HEIGHT_PX * pixelRatio, `${what} does not reach the pane's bottom`);
      }
    });
  }
}

test("MF-1: while the legend is not measured, the primitive paints nothing (y = 0 is the defect)", () => {
  const { bands, rules } = paint(null, 1);
  assert.deepEqual([bands.length, rules.length], [0, 0]);
});

test("MF-1: a legend taller than the pane leaves nothing to paint", () => {
  const { bands, rules } = paint(PANE_HEIGHT_PX + 10, 1);
  assert.deepEqual([bands.length, rules.length], [0, 0]);
});
