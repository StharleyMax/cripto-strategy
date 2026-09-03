/**
 * Minimal headless `lightweight-charts` bootstrap for `T-05.2`'s own scenarios — built on
 * `headless-chart.ts`'s exported `installGlobals`/`flushFrames` (that file's own jsdom
 * shimming is reused verbatim; nothing about it is duplicated or modified here).
 *
 * `T-08.2`'s `collectAxisCoordinates` is shaped for exactly one candlestick + one line
 * series (its own synthetic workload). This task needs a variable set of series
 * (candlestick + N line series, real BTCUSDT data, WITH whitespace items) and needs BOTH
 * `series.data()` AND `timeScale.timeToCoordinate` — a different enough shape to warrant its
 * own small runner rather than bending the T-08.2 one to fit.
 *
 * `series.data()` turned out NOT to be the lossless-ness proof it looks like — see
 * `HeadlessSeriesResult.dataLength`'s own comment for the measured surprise. The real proof
 * is `coordinateOf`: whether a WHITESPACE instant still resolves to a non-null coordinate
 * (it reserved an axis slot) and whether real points keep uniform spacing across a gap
 * (`s2-axis-integration.test.ts`'s isolated OI/CVD scenarios).
 */

import { JSDOM } from "jsdom";
import { installGlobals, flushFrames, assertViewportFitted, CHART_WIDTH_PX, CHART_HEIGHT_PX } from "./headless-chart.ts";

export interface HeadlessSeriesSpec {
  readonly label: string;
  readonly kind: "candlestick" | "line";
  /** Already time-in-UNIX-SECONDS shaped items — `CandlestickItem/LineItem/WhitespaceItem`. */
  readonly items: readonly Record<string, unknown>[];
  /**
   * Style options passed straight to `chart.addSeries(..., style)` — e.g.
   * `candlestickSeriesColors(mode)` from `color-tokens.ts` (`T-05.7`). Optional and
   * defaulted to `{}` (the library's own defaults) so every caller from before `T-05.7`
   * keeps working unchanged.
   */
  readonly style?: Record<string, unknown>;
}

export interface HeadlessSeriesResult {
  readonly label: string;
  /** Length of `spec.items` — what this run ASKED the library to place, whitespace included. */
  readonly itemsSent: number;
  /** How many of `spec.items` carry ONLY `time` — the gap placeholders this run sent. */
  readonly whitespaceItemsSent: number;
  /**
   * `series.data().length` AFTER `setData`.
   *
   * ⚠️ MEASURED, NOT WHAT THE JSDOC SAYS, AND THE GAP IS THE FINDING: `.data()`'s own comment
   * claims "Original data items provided via setData" (`node_modules/lightweight-charts/
   * dist/typings.d.ts:2497`), but `[MEDIDO 2026-09-03]` a `LineSeries`/`CandlestickSeries`
   * fed `[real, {time}, real]` returns `.data().length === 2`, not 3 — whitespace entries are
   * SILENTLY DROPPED from this accessor's return value, single or consecutive, edge or
   * interior. `dataLength` here therefore equals `itemsSent - whitespaceItemsSent` on every
   * lossless series in this task's fixture, confirmed below rather than assumed — it is NOT
   * proof of loss; see `coordinateOf` for the accessor that actually shows whether the gap
   * kept its axis position.
   */
  readonly dataLength: number;
  /**
   * `series.options()` read BACK from the real library, for `kind: "candlestick"` specs
   * that passed a `style` (`T-05.7`) — `undefined` otherwise. Reading it back (rather than
   * trusting that whatever `style` object was passed survives) is the same discipline this
   * file already applies to `dataLength`: the library, not our own object, is the source of
   * truth for what a real chart actually stored.
   */
  readonly appliedCandlestickColors?: { readonly upColor: string; readonly downColor: string };
}

export interface HeadlessRunHandle {
  readonly seriesResults: readonly HeadlessSeriesResult[];
  readonly distinctTimeCount: number;
  readonly timeScaleWidthPx: number;
  /** `null` when the chart refused to place `timeSeconds` (outside the plotted range). */
  coordinateOf(timeSeconds: number): number | null;
  close(): void;
}

function isWhitespaceItem(item: Record<string, unknown>): boolean {
  return Object.keys(item).length === 1 && "time" in item;
}

/**
 * Renders every spec in `specs` on ONE shared chart/time-scale and returns a handle to
 * query coordinates and per-series `data()` length. Callers that need an ISOLATED time
 * scale (so one series' gap-handling is not masked by another, always-complete series
 * sharing the axis — see `s2-axis-integration.test.ts` for why this matters) pass exactly
 * one spec.
 */
export async function runHeadlessChart(specs: readonly HeadlessSeriesSpec[]): Promise<HeadlessRunHandle> {
  if (specs.length === 0) {
    throw new RangeError("runHeadlessChart requires at least one series spec");
  }
  const dom = new JSDOM("<!doctype html><html><body><div id=\"chart\"></div></body></html>", {
    pretendToBeVisual: true,
  });
  installGlobals(dom);

  const charts = await import("lightweight-charts");
  const container = dom.window.document.getElementById("chart");
  if (container === null) {
    throw new Error("invariant broken: the chart container does not exist in the DOM");
  }

  // `minBarSpacing` defaults to 0.5 px (`node_modules/lightweight-charts/dist/typings.d.ts:
  // 1373`) — a REAL finding at this task's scale, not a workaround detail to bury: 4 days x
  // 1-minute = 5,760 slots on a 1,200 px pane needs ~0.198 px/bar to fit at once, below that
  // floor, so `fitContent`/`setVisibleLogicalRange` over the FULL range REFUSES to compress
  // that far with the library's own defaults (`assertViewportFitted` catches exactly this —
  // it threw here before this override was added, naming the true clamped spacing, 0.5 px,
  // not a silent wrong number). Set near-zero HERE, for measurement purposes only: this
  // proves the AXIS MATH (D5.11) at full density; it is NOT a UX recommendation to ship a
  // chart nobody can read at 0.2 px/bar — that default-view density decision belongs to
  // later chrome work (`T-05.3`+), out of this task's scope, and is named as a finding in
  // the gate report instead of silently worked around.
  const chart = charts.createChart(container, {
    width: CHART_WIDTH_PX,
    height: CHART_HEIGHT_PX,
    timeScale: { rightOffset: 0, timeVisible: true, secondsVisible: true, minBarSpacing: 0.001 },
  });

  const distinctTimes = new Set<number>();
  const seriesResults: HeadlessSeriesResult[] = [];
  for (const spec of specs) {
    const series =
      spec.kind === "candlestick"
        ? chart.addSeries(charts.CandlestickSeries, (spec.style ?? {}) as never)
        : chart.addSeries(charts.LineSeries, {});
    // `as never`: the items here are already exactly the shape `lightweight-charts` expects
    // (built by `s2-lightweight-adapter.ts`, one place, ONE conversion — see that module's
    // docstring); this cast is the seam between "plain data we built" and the library's own
    // branded `Time` type, the same seam `headless-chart.ts` already crosses at `time as never`.
    series.setData(spec.items as never);
    const stored = series.data();
    const whitespaceItemsSent = spec.items.filter((item) => isWhitespaceItem(item)).length;
    const appliedCandlestickColors =
      spec.kind === "candlestick" && spec.style !== undefined
        ? {
            upColor: (series.options() as { upColor: string }).upColor,
            downColor: (series.options() as { downColor: string }).downColor,
          }
        : undefined;
    seriesResults.push({
      label: spec.label,
      itemsSent: spec.items.length,
      whitespaceItemsSent,
      dataLength: stored.length,
      appliedCandlestickColors,
    });
    for (const item of spec.items) {
      distinctTimes.add(item.time as number);
    }
  }

  const timeScale = chart.timeScale();
  await flushFrames(dom, 3);
  timeScale.setVisibleLogicalRange({ from: 0, to: distinctTimes.size - 1 });
  await flushFrames(dom, 3);
  assertViewportFitted(timeScale.width(), timeScale.options().barSpacing, distinctTimes.size);

  return {
    seriesResults,
    distinctTimeCount: distinctTimes.size,
    timeScaleWidthPx: timeScale.width(),
    coordinateOf(timeSeconds: number): number | null {
      const coordinate = timeScale.timeToCoordinate(timeSeconds as never);
      return coordinate === null ? null : (coordinate as unknown as number);
    },
    close(): void {
      chart.remove();
      dom.window.close();
    },
  };
}
