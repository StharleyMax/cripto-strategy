import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { fact } from "./helpers.ts";

/**
 * `paineis-de-fluxo` `T-04.1` — the fused liquidation pane of `charts`, read off the CANVAS of a real
 * Chromium, with the real `lightweight-charts@5.2.1` standalone build and the scales/feeds built by
 * the real `charts` module (`e2e/liquidation-pane-fixture.ts`, a plain `node` process).
 *
 * ⚠️ WHAT THIS IS NOT: the app. `T-04.1` is the `charts` half; the pane is wired into
 * `SymbolClient.tsx` by `T-04.2`, and `T-04.6` measures F-6, `CA-LIQ`, `CA-9′` and `CA-10′` against
 * the app with real data. This spec proves the GEOMETRY the app will receive, in pixels, before it
 * is wired — the arm-(i) posture of `e2e/25-sparse-feed-pixel-identity.spec.ts`.
 *
 * Each series is painted in a colour of its own (by cohort and role), so every pixel is attributable.
 * The design must pass, and EACH ablation must fail the check it targets, or that check is blind:
 *   - `swapped`     (the two legs' `scale_ref` exchanged)      → short pixels below the zero line;
 *   - `independent` (each bar scale autoscales on its own leg) → `5.000` at two heights (`C-3`);
 *   - `shifted`     (the lower bars' margin 3 px down)         → the bases part by > 1 px (`F-6 a`);
 *   - negating the long leg                                    → the fixture's feed throws (`F-6 b`).
 *
 * Run with: `npx playwright test 31-liquidation-pane-pixel` (no server needed).
 */

const SPEC = "31-liquidation-pane-pixel";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIGHTWEIGHT_CHARTS_STANDALONE = path.resolve(
  HERE,
  "..",
  "node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.js",
);
const FIXTURE = path.resolve(HERE, "liquidation-pane-fixture.ts");
const CHART_WIDTH_PX = 900;
const CHART_HEIGHT_PX = 300;
const LEGEND_BOTTOM_PX = 18;

/** One colour per (cohort, role) — test colours, not the product's tokens (colour is `T-04.2`'s). */
const CLASS_COLORS: Readonly<Record<string, readonly [number, number, number]>> = {
  "short:bars": [0, 160, 0],
  "short:absence_mark": [0, 0, 200],
  "short:zero_mark": [0, 100, 255],
  "long:bars": [200, 0, 0],
  "long:absence_mark": [200, 0, 200],
  "long:zero_mark": [255, 150, 0],
};

interface FixtureSeries {
  readonly id: string;
  readonly priceScaleId: string;
  readonly scaleMargins: { readonly top: number; readonly bottom: number };
  readonly invertScale: boolean;
  readonly logarithmic: boolean;
  readonly base: number;
  readonly priceRange: { readonly minValue: number; readonly maxValue: number } | null;
  readonly items: readonly Record<string, unknown>[];
}

interface FixtureChart {
  readonly name: string;
  readonly variant: "design" | "swapped" | "independent" | "shifted";
  readonly zeroLinePx: number;
  readonly negatives: number;
  readonly series: readonly FixtureSeries[];
}

interface Fixture {
  readonly paneHeightPx: number;
  readonly sameValue: number;
  readonly sameValueTimes: { readonly short: number; readonly long: number };
  readonly negationRefused: boolean;
  readonly charts: readonly FixtureChart[];
}

const CHART_OPTIONS = {
  width: CHART_WIDTH_PX,
  height: CHART_HEIGHT_PX,
  layout: { background: { color: "#ffffff" }, textColor: "#ffffff", attributionLogo: false },
  grid: { vertLines: { visible: false }, horzLines: { visible: false } },
  rightPriceScale: { visible: false },
  leftPriceScale: { visible: false },
  timeScale: { rightOffset: 0, visible: true },
  crosshair: { vertLine: { visible: false }, horzLine: { visible: false } },
};

test(`the fused liquidation pane, in pixels: sides, one base, one maximum, marks on the outer edge — and every ablation caught (${SPEC})`, async ({
  page,
}) => {
  await page.setViewportSize({ width: CHART_WIDTH_PX + 40, height: CHART_HEIGHT_PX * 10 });
  await page.setContent(`<html><body style="margin:0;background:#fff"></body></html>`);
  await page.addScriptTag({ path: LIGHTWEIGHT_CHARTS_STANDALONE });

  // 1. The pane's height, as the library lays it out — the layout is computed FROM it.
  const probe = await page.evaluate(async (options) => {
    const library = (globalThis as unknown as { LightweightCharts: Record<string, unknown> }).LightweightCharts;
    const element = document.createElement("div");
    document.body.append(element);
    const chart = (library.createChart as (el: HTMLElement, o: unknown) => { panes: () => { getHeight: () => number }[]; remove: () => void })(
      element,
      options,
    );
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const paneHeightPx = chart.panes()[0]!.getHeight();
    chart.remove();
    element.remove();
    return { paneHeightPx, dpr: window.devicePixelRatio };
  }, CHART_OPTIONS);
  expect(probe.paneHeightPx, "the pane was not laid out").toBeGreaterThan(100);
  fact(SPEC, "probe", probe);

  // 2. The real `charts` module, in node.
  const run = spawnSync(process.execPath, [FIXTURE, String(probe.paneHeightPx), String(LEGEND_BOTTOM_PX)], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  expect(run.status, `liquidation-pane-fixture.ts failed: ${run.stderr}`).toBe(0);
  const fixture = JSON.parse(run.stdout) as Fixture;
  expect(fixture.charts.map((chart) => chart.name)).toEqual([
    "normal:design",
    "normal:swapped",
    "normal:independent",
    "normal:shifted",
    "logarithmic:design",
    "logarithmic:swapped",
    "logarithmic:independent",
    "logarithmic:shifted",
  ]);

  // 3. Draw every chart and classify its pixels.
  const measured = await page.evaluate(
    async ({ charts, options, colors, sameValueTimes }) => {
      type SeriesApi = { setData: (items: unknown) => void; priceScale: () => { applyOptions: (o: unknown) => void } };
      type Api = {
        addSeries: (kind: unknown, options: unknown) => SeriesApi;
        timeScale: () => { fitContent: () => void; timeToCoordinate: (t: number) => number | null };
        takeScreenshot: () => HTMLCanvasElement;
        panes: () => { getHeight: () => number }[];
      };
      const library = (globalThis as unknown as { LightweightCharts: Record<string, unknown> }).LightweightCharts;
      const priceScaleMode = library.PriceScaleMode as { Normal: number; Logarithmic: number };
      const built: { spec: (typeof charts)[number]; chart: Api }[] = [];
      for (const spec of charts) {
        const element = document.createElement("div");
        document.body.append(element);
        const chart = (library.createChart as (el: HTMLElement, o: unknown) => Api)(element, options);
        for (const series of spec.series) {
          const [r, g, b] = colors[series.id]!;
          const handle = chart.addSeries(library.HistogramSeries, {
            color: `rgb(${r}, ${g}, ${b})`,
            priceScaleId: series.priceScaleId,
            base: series.base,
            priceLineVisible: false,
            lastValueVisible: false,
            ...(series.priceRange === null ? {} : { autoscaleInfoProvider: () => ({ priceRange: series.priceRange }) }),
          });
          handle.priceScale().applyOptions({
            scaleMargins: series.scaleMargins,
            invertScale: series.invertScale,
            mode: series.logarithmic ? priceScaleMode.Logarithmic : priceScaleMode.Normal,
          });
          handle.setData(series.items);
        }
        chart.timeScale().fitContent();
        built.push({ spec, chart });
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      await new Promise<void>((resolve) => setTimeout(resolve, 200));

      const classOf = new Map<string, string>();
      for (const [id, [r, g, b]] of Object.entries(colors)) classOf.set(`${r},${g},${b}`, id);
      return built.map(({ spec, chart }) => {
        const canvas = chart.takeScreenshot();
        const context = canvas.getContext("2d")!;
        const paneHeight = chart.panes()[0]!.getHeight();
        const data = context.getImageData(0, 0, canvas.width, paneHeight).data;
        const rows: Record<string, number[]> = {};
        const columns: Record<string, Map<number, number[]>> = {};
        let fedNegatives = 0;
        for (const series of spec.series) {
          for (const item of series.items) if (typeof item.value === "number" && (item.value as number) < 0) fedNegatives += 1;
        }
        for (let y = 0; y < paneHeight; y += 1) {
          for (let x = 0; x < canvas.width; x += 1) {
            const offset = (y * canvas.width + x) * 4;
            const id = classOf.get(`${data[offset]},${data[offset + 1]},${data[offset + 2]}`);
            if (id === undefined) continue;
            (rows[id] ??= []).push(y);
            const byColumn = (columns[id] ??= new Map());
            if (!byColumn.has(x)) byColumn.set(x, []);
            byColumn.get(x)!.push(y);
          }
        }
        const extent = (id: string) => {
          const values = rows[id] ?? [];
          return values.length === 0 ? null : { min: Math.min(...values), max: Math.max(...values), pixels: values.length };
        };
        const heightAt = (id: string, time: number) => {
          const x = chart.timeScale().timeToCoordinate(time);
          if (x === null) return null;
          return (columns[id]?.get(Math.round(x)) ?? []).length;
        };
        const edgeRows = (id: string, edge: "min" | "max") =>
          [...(columns[id]?.values() ?? [])].map((ys) => (edge === "max" ? Math.max(...ys) : Math.min(...ys)));
        return {
          name: spec.name,
          variant: spec.variant,
          canvasWidth: canvas.width,
          zeroLinePx: spec.zeroLinePx,
          fedNegatives,
          extents: Object.fromEntries(Object.keys(colors).map((id) => [id, extent(id)])),
          columnCount: { short: columns["short:bars"]?.size ?? 0, long: columns["long:bars"]?.size ?? 0 },
          shortBaseRows: [...new Set(edgeRows("short:bars", "max"))],
          longBaseRows: [...new Set(edgeRows("long:bars", "min"))],
          shortBelowZero: (rows["short:bars"] ?? []).filter((y) => y > spec.zeroLinePx + 1).length,
          longAboveZero: (rows["long:bars"] ?? []).filter((y) => y < spec.zeroLinePx - 1).length,
          sameValueHeight: { short: heightAt("short:bars", sameValueTimes.short), long: heightAt("long:bars", sameValueTimes.long) },
        };
      });
    },
    { charts: fixture.charts, options: CHART_OPTIONS, colors: CLASS_COLORS, sameValueTimes: fixture.sameValueTimes },
  );

  // 4. The verdicts.
  expect(fixture.negationRefused, "negating the long leg reached a feed (F-6 b)").toBe(true);
  for (const chart of measured) {
    const short = chart.extents["short:bars"]!;
    const long = chart.extents["long:bars"]!;
    const borderGap = long.min - short.max - 1;
    const sameValueError = Math.abs((chart.sameValueHeight.short ?? NaN) - (chart.sameValueHeight.long ?? NaN));
    fact(SPEC, chart.name, {
      canvasWidth: chart.canvasWidth,
      zeroLinePx: chart.zeroLinePx,
      columns: chart.columnCount,
      borderGap,
      shortBaseRows: chart.shortBaseRows,
      longBaseRows: chart.longBaseRows,
      shortBelowZero: chart.shortBelowZero,
      longAboveZero: chart.longAboveZero,
      sameValueHeight: chart.sameValueHeight,
      fedNegatives: chart.fedNegatives,
      extents: chart.extents,
    });
    expect(chart.canvasWidth, `${chart.name}: the capture is not at DPR 1`).toBe(CHART_WIDTH_PX);
    expect(chart.fedNegatives, `${chart.name}: a value < 0 reached setData`).toBe(0);
    expect(chart.columnCount.short, `${chart.name}: fewer than 20 short columns`).toBeGreaterThanOrEqual(20);
    expect(chart.columnCount.long, `${chart.name}: fewer than 20 long columns`).toBeGreaterThanOrEqual(20);
    switch (chart.variant) {
      case "design": {
        expect(chart.shortBelowZero, `${chart.name}: short pixels below the zero line`).toBe(0);
        expect(chart.longAboveZero, `${chart.name}: long pixels above the zero line`).toBe(0);
        expect(short.max, `${chart.name}: the short leg is not the upper one`).toBeLessThan(long.min);
        expect(chart.shortBaseRows, `${chart.name}: short bars do not share one base row`).toHaveLength(1);
        expect(chart.longBaseRows, `${chart.name}: long bars do not share one base row`).toHaveLength(1);
        expect(borderGap, `${chart.name}: F-6 (a), border distance between the bases`).toBeGreaterThanOrEqual(0);
        expect(borderGap, `${chart.name}: F-6 (a), border distance between the bases`).toBeLessThanOrEqual(1);
        expect(chart.sameValueHeight.short, `${chart.name}: no short bar at the probe slot`).toBeGreaterThan(0);
        expect(sameValueError, `${chart.name}: C-3, ${fixture.sameValue} drawn at two heights`).toBeLessThanOrEqual(1);
        // Each leg's marks on its OWN outer edge, disjoint from its bars (RN-4, T-04.0 §3.1).
        for (const role of ["absence_mark", "zero_mark"] as const) {
          const upMarks = chart.extents[`short:${role}`];
          const downMarks = chart.extents[`long:${role}`];
          expect(upMarks, `${chart.name}: no short ${role} drawn`).not.toBeNull();
          expect(downMarks, `${chart.name}: no long ${role} drawn`).not.toBeNull();
          expect(upMarks!.max, `${chart.name}: short ${role} reaches its bars`).toBeLessThan(short.min);
          expect(downMarks!.min, `${chart.name}: long ${role} reaches its bars`).toBeGreaterThan(long.max);
        }
        break;
      }
      case "swapped":
        expect(chart.shortBelowZero, `${chart.name}: swapping scale_ref was NOT caught — the side check is blind`).toBeGreaterThan(0);
        expect(chart.longAboveZero, `${chart.name}: swapping scale_ref was NOT caught — the side check is blind`).toBeGreaterThan(0);
        break;
      case "independent":
        expect(sameValueError, `${chart.name}: independent autoscale was NOT caught — the C-3 check is blind`).toBeGreaterThan(3);
        break;
      case "shifted":
        expect(borderGap, `${chart.name}: the 3 px shift was NOT caught — the F-6 check is blind`).toBeGreaterThan(1);
        break;
    }
  }
});
