/**
 * `T-02.5` `MF-1` — THE CANDLES AND THE VOLUME BARS NEVER SHARE A PIXEL ROW, MEASURED ON THE LIBRARY'S
 * OWN DRAW CALLS.
 *
 * The defect (`docs/context/paineis-de-fluxo/gates/T-02.5-design-review.md` §3): since `T-02.3` the
 * volume bar carries the SAME direction ink as the candle above it. With the library's default price
 * margin (`bottom: 0.1`) a candle could descend to 90% of the pane while the tallest bar climbs to
 * 80%, so at the peak — the bar the phase exists to show — candle and bar fused into one column: the
 * candle's low read lower than it is and the bar's height could not be read. The review also measured
 * that a bigger `bottom` alone (`M3`, `0.24`) still fused in `15m`/`1h`/`4h` and did not know why.
 * The why is `charts::paneScaleMargins`: a `belowLegend` scale WITHOUT `keepFloor` gets
 * `bottom' = bottom · (1 − reserve)`, so a taller legend walks the candles' floor back into the band.
 *
 * The invariant proved here, against the real `lightweight-charts` inside a `jsdom`: for every legend
 * height the host can apply (reserve up to `MAX_LEGEND_RESERVE_FRACTION`), the lowest painted candle
 * row sits at least `MIN_GAP_ROWS` above the highest painted bar row — with the window's lowest low
 * and its highest volume on the SAME bucket, which is the peak case the review captured.
 *
 * ⛔ The margins and the scale role are READ FROM THE PRODUCTION SOURCE, not retyped: a copy would
 * measure the configuration this file chose. Each MORDE overrides ONE field and must fail.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

import {
  F1_PANE_STACK_FORM,
  flushFrames,
  installGlobals,
  MAX_LEGEND_RESERVE_FRACTION,
  LEGEND_GAP_PX,
  paneScaleMargins,
  stackedPaneLayout,
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
  readonly keepFloor?: boolean;
}

function productionMargins(name: string): Margins {
  const match = new RegExp(`const ${name} = \\{ top: (\\d+(?:\\.\\d+)?), bottom: (\\d+(?:\\.\\d+)?) \\} as const;`).exec(source);
  assert.ok(match !== null, `${name} was not found in SymbolClient.tsx — the anchor moved, fix this test`);
  return { top: Number(match[1]), bottom: Number(match[2]) };
}

/** The role `PricePane` declares for a scale, `keepFloor` included when present. */
function productionScaleRole(seriesExpression: string): ScaleRole {
  const match = new RegExp(
    `\\{ ${seriesExpression}, belowLegend: (true|false), clearSeparator: (true|false)(?:, keepFloor: (true|false))? \\}`,
  ).exec(source);
  assert.ok(match !== null, `the scale binding "${seriesExpression}" was not found in SymbolClient.tsx — fix this test`);
  return {
    belowLegend: match[1] === "true",
    clearSeparator: match[2] === "true",
    ...(match[3] === undefined ? {} : { keepFloor: match[3] === "true" }),
  };
}

const PRICE_CANDLE_SCALE_MARGINS = productionMargins("PRICE_CANDLE_SCALE_MARGINS");
const VOLUME_SCALE_MARGINS = productionMargins("VOLUME_SCALE_MARGINS");
// `PricePane`'s candle binding is the only one written `{ series, belowLegend: … }` that ALSO sits
// next to `volumeSeries` — anchored on the `scales` destructuring so the OI/CVD panes' `{ series, … }`
// cannot answer for it.
const CANDLE_ROLE = (() => {
  const anchor = source.indexOf("scales: ({ series, volumeSeries, absenceSeries }) => [");
  assert.ok(anchor >= 0, "PricePane's scales declaration moved — fix this test");
  const window = source.slice(anchor, anchor + 400);
  const match = /\{ series, belowLegend: (true|false), clearSeparator: (true|false)(?:, keepFloor: (true|false))? \}/.exec(window);
  assert.ok(match !== null, "the candle scale binding was not found in PricePane's scales — fix this test");
  return {
    belowLegend: match[1] === "true",
    clearSeparator: match[2] === "true",
    ...(match[3] === undefined ? {} : { keepFloor: match[3] === "true" }),
  } satisfies ScaleRole;
})();
const VOLUME_ROLE = productionScaleRole("series: volumeSeries");

/** The library's own default for a price scale (`lightweight-charts` `scaleMargins`) — what the
 * candles had before `T-02.5`. */
const LIBRARY_DEFAULT_MARGINS: Margins = { top: 0.2, bottom: 0.1 };
/** The design review's `M3` mutation, verbatim (§3). */
const REVIEW_M3_MARGINS: Margins = { top: 0.2, bottom: 0.24 };

const PRICE_PANE_PX = (() => {
  assert.equal(F1_PANE_ORDER[0], "price", "the price pane is no longer index 0 — fix this test");
  const layout = stackedPaneLayout({ ...F1_PANE_STACK_FORM, weights: F1_PANE_ORDER.map((paneId) => F1_PANE_STRETCH[paneId]) });
  return Math.round(layout.paneHeightsPx[0]!);
})();

/** At least this many EMPTY rows between the candles' lowest row and the bars' highest row — the
 * separation `band.py` reads as "not fused" needs one; two leave room for the wick's rounding. */
const MIN_GAP_ROWS = 2;

// Every legend height the host would apply margins for: from no legend up to the largest reserve
// `paneScaleMargins` accepts (`MAX_LEGEND_RESERVE_FRACTION`) and one past it (the `overflow`
// branch), plus the 54 px legend `C-2` measured.
const LEGEND_BOTTOMS_PX = (() => {
  const largest = Math.floor(MAX_LEGEND_RESERVE_FRACTION * PRICE_PANE_PX - LEGEND_GAP_PX);
  return [0, 30, 54, 90, 140, largest, largest + 20];
})();

// ── The universe: the window's lowest low and its highest volume on the SAME bucket ─────────────

const ONE_MINUTE_MS = 60_000;
const MEASUREMENT_WIDTH_PX = 1_200;
const SLOTS = 240;
const PEAK_INDEX = 170;

interface Candle {
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
}

function universe(): { readonly candles: readonly Candle[]; readonly volumes: readonly { time: number; value: number }[] } {
  const candles: Candle[] = [];
  const volumes: { time: number; value: number }[] = [];
  for (let i = 0; i < SLOTS; i += 1) {
    const time = (i * ONE_MINUTE_MS) / 1000;
    const mid = 100 + 3 * Math.sin(i / 11) + ((i * 37) % 7) / 10;
    const isPeak = i === PEAK_INDEX;
    // The peak: a long DOWN candle to the window's minimum — the review's 13:29 crop.
    const open = isPeak ? mid + 0.5 : mid - 0.2 + ((i % 3) - 1) * 0.1;
    const close = isPeak ? 88 : mid + 0.2;
    const high = Math.max(open, close) + 0.3;
    const low = isPeak ? 87 : Math.min(open, close) - 0.3;
    candles.push({ time, open, high, low, close });
    volumes.push({ time, value: isPeak ? 5_000 : 60 + ((i * 53) % 90) });
  }
  return { candles, volumes };
}

// ── The instrument: the library's own `fillRect` calls, one paint ───────────────────────────────

const CANDLE_INK = "#a10000";
const BAR_INK = "#0000a1";

interface Rect {
  readonly top: number;
  /** Inclusive last row. */
  readonly bottom: number;
}

interface Paint {
  readonly paneHeightPx: number;
  readonly candles: readonly Rect[];
  readonly bars: readonly Rect[];
}

interface Config {
  readonly candleMargins: Margins;
  readonly candleRole: ScaleRole;
  readonly legendBottomPx: number;
}

async function paint(config: Config): Promise<Paint> {
  const dom = new JSDOM('<!doctype html><html><body><div id="chart"></div></body></html>', { pretendToBeVisual: true });
  installGlobals(dom);

  let recording = false;
  const rects = new Map<string, Map<string, Rect>>([
    [CANDLE_INK, new Map()],
    [BAR_INK, new Map()],
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
            // A pane-sized fill of another colour is a NEW paint: only the last one is the screen.
            if (bucket === undefined && width >= MEASUREMENT_WIDTH_PX / 2 && height >= PRICE_PANE_PX / 2) {
              for (const drawnSoFar of rects.values()) {
                drawnSoFar.clear();
              }
            }
            if (recording && bucket !== undefined && height > 0 && width > 0) {
              bucket.set(`${x}:${y}:${width}:${height}`, { top: y, bottom: y + height - 1 });
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
  const chart = lc.createChart(container, {
    ...chartConstructorOptions(MEASUREMENT_WIDTH_PX, PRICE_PANE_PX + F1_PANE_STACK_FORM.timeAxisPx),
    localization: { locale: "en-US" },
  });
  // One ink for every part of the candle: the question is WHERE it paints, not in which colour.
  const candles = chart.addSeries(lc.CandlestickSeries, {
    upColor: CANDLE_INK,
    downColor: CANDLE_INK,
    borderUpColor: CANDLE_INK,
    borderDownColor: CANDLE_INK,
    wickUpColor: CANDLE_INK,
    wickDownColor: CANDLE_INK,
    borderVisible: true,
    wickVisible: true,
    priceLineVisible: false,
    lastValueVisible: false,
  });
  candles.priceScale().applyOptions({ scaleMargins: config.candleMargins });
  const volume = chart.addSeries(lc.HistogramSeries, {
    color: BAR_INK,
    priceScaleId: "volume",
    base: 0,
    priceLineVisible: false,
    lastValueVisible: false,
  });
  volume.priceScale().applyOptions({ scaleMargins: VOLUME_SCALE_MARGINS, mode: lc.PriceScaleMode.Normal });
  const data = universe();
  candles.setData(data.candles as never);
  volume.setData(data.volumes as never);
  chart.timeScale().fitContent();
  await flushFrames(dom, 3);

  recording = true;
  const firstHeight = chart.panes()[0]!.getHeight();
  chart.resize(MEASUREMENT_WIDTH_PX, PRICE_PANE_PX + F1_PANE_STACK_FORM.timeAxisPx + (PRICE_PANE_PX - firstHeight));
  await flushFrames(dom, 2);
  const paneHeightPx = chart.panes()[0]!.getHeight();
  // What the chart host applies at runtime (`SymbolChartHost`'s layout effect), for this legend.
  for (const [series, base, role] of [
    [candles, config.candleMargins, config.candleRole],
    [volume, VOLUME_SCALE_MARGINS, VOLUME_ROLE],
  ] as const) {
    // The host applies `margins` AND `overflow` (the legend past the largest reserve keeps the
    // base), skipping only `unmeasured` — the same branch here, so the tallest legend is covered.
    const result = paneScaleMargins(base, role, { paneHeightPx, legendBottomPx: config.legendBottomPx });
    assert.notEqual(result.kind, "unmeasured", "the pane was measured — the host would apply margins");
    if (result.kind !== "unmeasured") {
      series.priceScale().applyOptions({ scaleMargins: result.margins });
    }
  }
  chart.timeScale().fitContent();
  await flushFrames(dom, 2);

  recording = false;
  chart.remove();
  dom.window.close();
  return { paneHeightPx, candles: [...rects.get(CANDLE_INK)!.values()], bars: [...rects.get(BAR_INK)!.values()] };
}

/** Empty rows between the lowest candle row and the highest bar row; negative = they overlap. */
function gapRows(result: Paint): number {
  assert.ok(result.candles.length > 0 && result.bars.length > 0, "nothing was painted — the measurement would be vacuous");
  const lowestCandleRow = Math.max(...result.candles.map((rect) => rect.bottom));
  const highestBarRow = Math.min(...result.bars.map((rect) => rect.top));
  return highestBarRow - lowestCandleRow - 1;
}

const PRODUCTION = { candleMargins: PRICE_CANDLE_SCALE_MARGINS, candleRole: CANDLE_ROLE } as const;

test("MF-1: production applies its own candle margins, and its floor is declared above the volume band", () => {
  assert.match(
    source,
    /series\.priceScale\(\)\.applyOptions\(\{ scaleMargins: PRICE_CANDLE_SCALE_MARGINS \}\);/,
    "the candle series does not get PRICE_CANDLE_SCALE_MARGINS — it falls back to the library default",
  );
  assert.equal(CANDLE_ROLE.belowLegend, true, "the candles stopped reserving the legend — another layout than the one measured");
  assert.equal(CANDLE_ROLE.keepFloor, true, "the candle binding is not keepFloor — a tall legend walks the floor into the band");
  const bandShare = 1 - VOLUME_SCALE_MARGINS.top;
  assert.ok(
    PRICE_CANDLE_SCALE_MARGINS.bottom > bandShare,
    `candle bottom ${PRICE_CANDLE_SCALE_MARGINS.bottom} does not clear the volume band's share ${bandShare.toFixed(2)}`,
  );
  assert.equal(PRICE_PANE_PX, 335, "the production price pane changed height — re-read the review's 335-px geometry");
});

for (const legendBottomPx of LEGEND_BOTTOMS_PX) {
  test(`MF-1: with a ${legendBottomPx}-px legend, the peak candle stays ≥ ${MIN_GAP_ROWS} empty rows above the peak bar`, async () => {
    const result = await paint({ ...PRODUCTION, legendBottomPx });
    assert.ok(Math.abs(result.paneHeightPx - PRICE_PANE_PX) <= 1, `pane measured ${result.paneHeightPx}px, not ${PRICE_PANE_PX}px`);
    const gap = gapRows(result);
    assert.ok(gap >= MIN_GAP_ROWS, `only ${gap} empty rows between the candles and the bars — candle and bar of the same ink fuse (MF-1)`);
  });
}

test("MORDE (MF-1 itself): the library's default candle margins put the peak candle INSIDE the volume band", async () => {
  const gap = gapRows(await paint({ candleMargins: LIBRARY_DEFAULT_MARGINS, candleRole: CANDLE_ROLE, legendBottomPx: 54 }));
  assert.ok(gap < 1, `the pre-fix layout left ${gap} empty rows — the instrument cannot see the fusion`);
});

test("MORDE (the review's M3): bottom 0.24 WITHOUT keepFloor fuses again under a tall legend", async () => {
  const gap = gapRows(
    await paint({ candleMargins: REVIEW_M3_MARGINS, candleRole: { ...CANDLE_ROLE, keepFloor: false }, legendBottomPx: 90 }),
  );
  assert.ok(gap < 1, `M3 without keepFloor left ${gap} empty rows — the review's residual fusion is not reproduced`);
});

test("MORDE: the production margins WITHOUT keepFloor fuse under a tall legend — keepFloor is load-bearing", async () => {
  const gap = gapRows(
    await paint({ candleMargins: PRICE_CANDLE_SCALE_MARGINS, candleRole: { ...CANDLE_ROLE, keepFloor: false }, legendBottomPx: 90 }),
  );
  assert.ok(gap < 1, `production margins without keepFloor left ${gap} empty rows — keepFloor would be decorative`);
});
