// Runs a real Lightweight Charts instance with no browser, so D8.19 is measured against
// the library's own coordinate assignment instead of against a model of it.
//
// ── WHY A STUBBED 2D CONTEXT IS SOUND FOR THIS MEASUREMENT ────────────────────────────
//
// The 2D context here draws nothing: every method is a no-op. That is safe for D8.19 and
// only for D8.19, and the reason is structural, not convenient -- `timeToCoordinate` is
// answered by the time-scale MODEL (bar index, bar spacing, right offset, pane width),
// which is computed before any paint call and never reads back from the canvas. Painting
// would change pixels on a screen; it would not change the number under test.
//
// What the stub DOES have to get right is anything the layout reads: `measureText` feeds
// the price-axis width, which feeds the pane width, which feeds bar spacing. It is given
// a fixed width so the pane width is deterministic across machines and fonts.
//
// This is stated rather than assumed because the opposite claim -- "headless is close
// enough" -- is exactly the kind of thing that turns a spike into a false green.

import { JSDOM } from "jsdom";
import type { CoordinateSample } from "./axis-fidelity.ts";
import type { SyntheticWorkload } from "./synthetic-series.ts";

/** The pane width plan 08 already reasons in (D8.12: "1200 px / 24 h"). */
export const CHART_WIDTH_PX = 1200;
export const CHART_HEIGHT_PX = 600;

const MEASURED_TEXT_WIDTH_PX = 40;

interface HeadlessResult {
  samples: CoordinateSample[];
  /** The width of the time-scale pane, in CSS pixels -- smaller than the chart width. */
  timeScaleWidthPx: number;
  /** Items the chart refused to place. A non-zero value invalidates the run. */
  unplacedCount: number;
}

function installGlobals(dom: JSDOM): void {
  const { window } = dom;

  const define = (key: string, value: unknown): void => {
    try {
      Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    } catch {
      // `navigator` and friends are getter-only on some Node versions; the library only
      // needs them to exist, and jsdom's own copy is already reachable via `window`.
    }
  };

  const context2d = new Proxy(
    {},
    {
      get(_target, property): unknown {
        if (property === "canvas") {
          return { width: CHART_WIDTH_PX, height: CHART_HEIGHT_PX };
        }
        if (property === "measureText") {
          return () => ({
            width: MEASURED_TEXT_WIDTH_PX,
            actualBoundingBoxAscent: 6,
            actualBoundingBoxDescent: 2,
            actualBoundingBoxLeft: 0,
            actualBoundingBoxRight: MEASURED_TEXT_WIDTH_PX,
          });
        }
        if (property === "createLinearGradient") {
          return () => ({ addColorStop: () => undefined });
        }
        if (property === "getImageData") {
          return () => ({ data: new Uint8ClampedArray(4) });
        }
        return () => undefined;
      },
      set(): boolean {
        return true;
      },
    },
  );

  window.HTMLCanvasElement.prototype.getContext = function getContext(): unknown {
    return context2d;
  } as unknown as HTMLCanvasElement["getContext"];

  const rect = {
    x: 0,
    y: 0,
    width: CHART_WIDTH_PX,
    height: CHART_HEIGHT_PX,
    top: 0,
    left: 0,
    right: CHART_WIDTH_PX,
    bottom: CHART_HEIGHT_PX,
    toJSON: () => ({}),
  };
  Object.defineProperty(window.HTMLElement.prototype, "clientWidth", {
    get: () => CHART_WIDTH_PX,
    configurable: true,
  });
  Object.defineProperty(window.HTMLElement.prototype, "clientHeight", {
    get: () => CHART_HEIGHT_PX,
    configurable: true,
  });
  window.HTMLElement.prototype.getBoundingClientRect = () => rect as DOMRect;

  if (!("ResizeObserver" in window)) {
    class NoopResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (window as unknown as Record<string, unknown>).ResizeObserver = NoopResizeObserver;
  }
  if (!("matchMedia" in window)) {
    (window as unknown as Record<string, unknown>).matchMedia = () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    });
  }
  window.devicePixelRatio = 1;

  define("window", window);
  define("document", window.document);
  define("devicePixelRatio", 1);
  const bridged = [
    "navigator",
    "location",
    "HTMLElement",
    "HTMLCanvasElement",
    "CanvasRenderingContext2D",
    "Element",
    "Node",
    "Event",
    "CustomEvent",
    "MouseEvent",
    "TouchEvent",
    "DOMRect",
    "ResizeObserver",
    "MutationObserver",
    "matchMedia",
    "getComputedStyle",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "Image",
    "screen",
  ];
  const source = window as unknown as Record<string, unknown>;
  for (const key of bridged) {
    if (key in source) {
      define(key, source[key]);
    }
  }
}

/**
 * Refuses the run unless all `barCount` slots were actually squeezed into the pane.
 *
 * This is the guard, not a formality: without it a frozen model reports 0.000 px and the
 * spike publishes a green it never earned. `rc=3` ("nao mediu") is the honest answer, and
 * it is a different answer from `rc=1` ("mediu e reprovou").
 */
function assertViewportFitted(paneWidthPx: number, barSpacingPx: number, barCount: number): void {
  if (paneWidthPx <= 0) {
    throw new Error(`a pane do eixo tem largura ${paneWidthPx} px; o modelo nao foi dimensionado`);
  }
  const expectedSpacing = paneWidthPx / barCount;
  const drift = Math.abs(barSpacingPx - expectedSpacing) / expectedSpacing;
  if (drift > 0.02) {
    throw new Error(
      `o eixo NAO coube na viewport: barSpacing = ${barSpacingPx} px para ${barCount} slots em ` +
        `${paneWidthPx} px de pane (esperado ~${expectedSpacing.toFixed(4)} px). O ciclo de ` +
        `desenho nao aplicou o fit, e medir aqui devolveria o numero de um grafico com ` +
        `~${(barSpacingPx * barCount).toFixed(0)} px de largura, nao de ${paneWidthPx} px.`,
    );
  }
}

/** Lets the chart run its rAF-driven draw cycle, which is where the fit is applied. */
async function flushFrames(dom: JSDOM, frames: number): Promise<void> {
  for (let index = 0; index < frames; index += 1) {
    await new Promise<void>((resolve) => {
      dom.window.requestAnimationFrame(() => resolve());
    });
  }
  await new Promise<void>((resolve) => {
    dom.window.setTimeout(() => resolve(), 0);
  });
}

/**
 * Renders `workload` on ONE axis and returns the X coordinate the chart gave every item.
 *
 * ── THE FALSE GREEN THIS FUNCTION EXISTS TO PREVENT ───────────────────────────────────
 *
 * `fitContent()` and `setVisibleLogicalRange()` do NOT change anything synchronously: they
 * queue a time-scale invalidation that is applied inside the rAF-driven draw cycle. Read
 * the coordinates without letting that cycle run and the chart answers from a model still
 * carrying the DEFAULTS -- bar spacing 6 px, right-aligned range -- which spreads 1,440
 * bars over ~8,634 px on a 1,200 px pane. Every bar is then a whole number of pixels
 * apart, so the error comes out 0.000 px and the DoD looks satisfied.
 *
 * That measurement was produced here, looked entirely plausible, and was wrong: it graded
 * a chart seven times wider than the viewport, at a bar spacing where sub-pixel rounding
 * cannot occur -- i.e. it graded away the exact thing D8.19 is about.
 *
 * So the frames are flushed, and then `assertViewportFitted` REFUSES the run if the fit
 * did not land. A refusal is recoverable; a plausible number is not.
 */
export async function collectAxisCoordinates(
  workload: SyntheticWorkload,
): Promise<HeadlessResult> {
  const dom = new JSDOM(
    "<!doctype html><html><body><div id=\"chart\"></div></body></html>",
    { pretendToBeVisual: true },
  );
  installGlobals(dom);

  const charts = await import("lightweight-charts");
  const container = dom.window.document.getElementById("chart");
  if (container === null) {
    throw new Error("invariante quebrada: o container do grafico nao existe no DOM");
  }

  const chart = charts.createChart(container, {
    width: CHART_WIDTH_PX,
    height: CHART_HEIGHT_PX,
    timeScale: { rightOffset: 0, timeVisible: true, secondsVisible: false },
  });
  const candleSeries = chart.addSeries(charts.CandlestickSeries, {});
  const pointSeries = chart.addSeries(charts.LineSeries, {});

  candleSeries.setData(workload.candles);
  pointSeries.setData(workload.points);

  const distinctTimes = new Set<number>();
  for (const candle of workload.candles) {
    distinctTimes.add(candle.time);
  }
  for (const point of workload.points) {
    distinctTimes.add(point.time);
  }
  const timeScale = chart.timeScale();
  await flushFrames(dom, 3);
  timeScale.setVisibleLogicalRange({ from: 0, to: distinctTimes.size - 1 });
  await flushFrames(dom, 3);

  assertViewportFitted(timeScale.width(), timeScale.options().barSpacing, distinctTimes.size);

  const samples: CoordinateSample[] = [];
  let unplacedCount = 0;
  const collect = (time: number, source: CoordinateSample["source"]): void => {
    const coordinate = timeScale.timeToCoordinate(time as never);
    if (coordinate === null) {
      unplacedCount += 1;
      return;
    }
    samples.push({ time, actualX: coordinate as unknown as number, source });
  };
  for (const candle of workload.candles) {
    collect(candle.time, "candle");
  }
  for (const point of workload.points) {
    collect(point.time, "point");
  }

  const timeScaleWidthPx = timeScale.width();
  chart.remove();
  dom.window.close();

  return { samples, timeScaleWidthPx, unplacedCount };
}
