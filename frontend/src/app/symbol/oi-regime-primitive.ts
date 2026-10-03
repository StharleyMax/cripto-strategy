/**
 * `T-03.12` (`paineis-de-fluxo`, plan `03` item `3b.5`) — the pane primitive that PAINTS the regime
 * marks of the OI pane on its canvas: the band (`DG-1`, surface `OI_REGIME_BAND_SURFACE`, behind
 * everything) and the boundary rule (`DG-2`, 1 px, continuous, `provenanceWeak`, the pane's height
 * BELOW its legend, behind the candles). What to paint is `oi-regime-marks.ts`' (pure); this file only turns
 * milliseconds into x and fills rectangles.
 *
 * WHY A PANE PRIMITIVE (`gate §3 item 2`): it is redrawn by the library on every scroll and zoom, so
 * the band and the rule follow the candles without an effect of ours re-measuring anything. `zOrder`
 * `bottom`: the band is `drawBackground` (under the grid, which stays visible over it at `1,051:1`,
 * `gate §8.4-1`), the rule is `draw` (over the grid, under the candles).
 *
 * WHERE y STARTS (`T-03.14` `MF-1`): at the pane legend's MEASURED bottom (`data-legend-bottom-px`),
 * never at the pane's top. Painted from `y = 0`, the rule struck through the legend text (5/5 scenes,
 * 38/38 legend rows inked) and the band sat behind it — the `SF-10` class the W5 closed. The DG-3
 * labels sit between the legend's bottom and the reserved scale top, so the band still holds them.
 * While the legend is not measured yet, nothing is painted: `0` is exactly the defect.
 *
 * WHERE x COMES FROM: the canonical grid of the pane is the AXIS grid — step `gridStepMs`, the
 * timeframe's since `paineis-de-fluxo` `T-05.1` (it used to be one minute in every TF) — slot `i` at
 * `gridStartMs + i · gridStepMs`, and each slot is one logical index — the same rule
 * `LongShortPane` measures its band with. An interval `(leftExcl, rightIncl]` spans from the RIGHT edge
 * of the slot of `leftExcl` to the RIGHT edge of the slot of `rightIncl` (`gate §3 item 2`), i.e.
 * the centre of the slot plus half a bar spacing, on both ends.
 */

import type {
  IChartApiBase,
  IPanePrimitive,
  IPanePrimitivePaneView,
  IPrimitivePaneRenderer,
  Logical,
  PaneAttachedParameter,
  Time,
} from "lightweight-charts";

import { colorTokens, OI_REGIME_BAND_SURFACE } from "../../charts/index.ts";
import type { OiRegimeBand, OiRegimeRule } from "./oi-regime-marks.ts";

type DrawTarget = Parameters<IPrimitivePaneRenderer["draw"]>[0];

/** What the primitive paints — the pure marks, the grid origin, and whether to paint at all. */
export interface OiRegimeCanvasMarks {
  readonly bands: readonly OiRegimeBand[];
  readonly rules: readonly OiRegimeRule[];
  /** `slots[0].time` of the pane's canonical grid; `null` when the pane has no grid yet. */
  readonly gridStartMs: number | null;
  /** The step of that grid — the axis step, i.e. the timeframe's width (`T-05.1`). Carried WITH
   * `gridStartMs` so the two can never come from different grids; `null` exactly when it is. */
  readonly gridStepMs: number | null;
  /** `false` under the e2e ablation `?e2eOiRegimeMarks=0`: nothing is painted. */
  readonly paint: boolean;
}

export const NO_OI_REGIME_CANVAS_MARKS: OiRegimeCanvasMarks = {
  bands: [],
  rules: [],
  gridStartMs: null,
  gridStepMs: null,
  paint: false,
};

/** `DG-2`: the rule is 1 CSS px wide. */
const RULE_WIDTH_CSS_PX = 1;

export class OiRegimePanePrimitive implements IPanePrimitive<Time> {
  private chart: IChartApiBase<Time> | null = null;
  private requestUpdate: (() => void) | null = null;
  private marks: OiRegimeCanvasMarks = NO_OI_REGIME_CANVAS_MARKS;
  private readonly views: readonly IPanePrimitivePaneView[];
  private readonly onViewport: () => void;
  private readonly legendBottomPx: () => number | null;

  /** `onViewport` runs whenever the library recomputes the views — every scroll, zoom and resize —
   * so the HTML labels (`DG-3`) can be re-placed against the same x the canvas uses.
   * `legendBottomPx` is the legend block's bottom, in CSS px from the pane's top, read at every
   * paint; `null` while it is not measured. (Explicit fields, not parameter properties: `node
   * --test` strips types only, and a parameter property is not strippable.) */
  constructor(onViewport: () => void, legendBottomPx: () => number | null) {
    this.onViewport = onViewport;
    this.legendBottomPx = legendBottomPx;
    const renderer: IPrimitivePaneRenderer = {
      draw: (target) => this.drawRules(target),
      drawBackground: (target) => this.drawBands(target),
    };
    const view: IPanePrimitivePaneView = { zOrder: () => "bottom", renderer: () => renderer };
    this.views = [view];
  }

  attached({ chart, requestUpdate }: PaneAttachedParameter<Time>): void {
    this.chart = chart;
    this.requestUpdate = requestUpdate;
  }

  detached(): void {
    this.chart = null;
    this.requestUpdate = null;
  }

  updateAllViews(): void {
    this.onViewport();
  }

  paneViews(): readonly IPanePrimitivePaneView[] {
    return this.views;
  }

  setMarks(marks: OiRegimeCanvasMarks): void {
    this.marks = marks;
    this.requestUpdate?.();
  }

  /** The x (media px, from the plot's left edge) of the RIGHT edge of the slot at `ms`; `null`
   * while the chart or the grid is not there. */
  edgePx(ms: number): number | null {
    const { gridStartMs, gridStepMs } = this.marks;
    if (this.chart === null || gridStartMs === null || gridStepMs === null) {
      return null;
    }
    const index = Math.round((ms - gridStartMs) / gridStepMs);
    const timeScale = this.chart.timeScale();
    // ⚠️ `logicalToCoordinate` answers `0` for a NON-INTEGER logical (`indexToCoordinate`,
    // `lightweight-charts@5.2.1` `dist/lightweight-charts.development.mjs:6164`, `!isInteger(index)`),
    // so the half slot is added in px: the distance between two consecutive integer indices.
    const centre = timeScale.logicalToCoordinate(index as Logical);
    const next = timeScale.logicalToCoordinate((index + 1) as Logical);
    return centre === null || next === null ? null : centre + (next - centre) / 2;
  }

  /** The plot's width in media px (the time scale's, without the price axis). */
  plotWidthPx(): number {
    return this.chart === null ? 0 : this.chart.timeScale().width();
  }

  /** The first bitmap row the marks may ink — the one right under the legend — or `null` (paint
   * nothing) while the legend is not measured. */
  private firstRow(verticalPixelRatio: number, bitmapHeight: number): number | null {
    const legendBottom = this.legendBottomPx();
    if (legendBottom === null || !Number.isFinite(legendBottom)) {
      return null;
    }
    return Math.min(bitmapHeight, Math.max(0, Math.ceil(legendBottom * verticalPixelRatio)));
  }

  private drawBands(target: DrawTarget): void {
    if (!this.marks.paint || this.marks.bands.length === 0) {
      return;
    }
    const spans = this.marks.bands
      .map((band) => [this.edgePx(band.leftExclusiveMs), this.edgePx(band.rightInclusiveMs)] as const)
      .filter((pair): pair is readonly [number, number] => pair[0] !== null && pair[1] !== null && pair[1] > pair[0]);
    target.useBitmapCoordinateSpace(({ context, bitmapSize, horizontalPixelRatio, verticalPixelRatio }) => {
      const top = this.firstRow(verticalPixelRatio, bitmapSize.height);
      if (top === null || top >= bitmapSize.height) {
        return;
      }
      context.fillStyle = OI_REGIME_BAND_SURFACE;
      for (const [left, right] of spans) {
        const x0 = Math.max(0, Math.round(left * horizontalPixelRatio));
        const x1 = Math.min(bitmapSize.width, Math.round(right * horizontalPixelRatio));
        if (x1 > x0) {
          context.fillRect(x0, top, x1 - x0, bitmapSize.height - top);
        }
      }
    });
  }

  private drawRules(target: DrawTarget): void {
    if (!this.marks.paint || this.marks.rules.length === 0) {
      return;
    }
    const xs = this.marks.rules.map((rule) => this.edgePx(rule.atMs)).filter((x): x is number => x !== null);
    target.useBitmapCoordinateSpace(({ context, bitmapSize, horizontalPixelRatio, verticalPixelRatio }) => {
      const top = this.firstRow(verticalPixelRatio, bitmapSize.height);
      if (top === null || top >= bitmapSize.height) {
        return;
      }
      context.fillStyle = colorTokens().provenanceWeak;
      const width = Math.max(1, Math.floor(RULE_WIDTH_CSS_PX * horizontalPixelRatio));
      for (const x of xs) {
        const left = Math.round(x * horizontalPixelRatio) - Math.floor(width / 2);
        if (left + width > 0 && left < bitmapSize.width) {
          context.fillRect(left, top, width, bitmapSize.height - top);
        }
      }
    });
  }
}
