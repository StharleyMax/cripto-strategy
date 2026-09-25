/**
 * `T-01.10` — the Node half of `e2e/25-sparse-feed-pixel-identity.spec.ts`, arm (i). Run as its own
 * `node` process (`node e2e/sparse-feed-fixture.ts`), it prints ONE JSON object on stdout: the
 * synthetic charts' series and feeds, built by the REAL adapters, the REAL `hostSeriesFeeds` /
 * `plotItemsOnly` / `gridCarrierItems` and the REAL carrier and chart options.
 *
 * ⚠️ WHY A SEPARATE PROCESS AND NOT AN IMPORT IN THE SPEC: `web` may only reach `charts` through the
 * barrel (`eslint.config.mjs`, `ADR-034/D8`), and the barrel re-exports the jsdom harness. Playwright's
 * module loader cannot load jsdom's dependency chain (`Error: module is not linked`, from
 * `html-encoding-sniffer`) `[MEDIDO 2026-09-25]`; plain `node`, the same runtime `node --test` uses for
 * these modules, can. Duplicating the order or the options in the spec would test a copy.
 */

import {
  absenceMarkSeries,
  candlestickSeriesLossless,
  lineSeriesLossless,
  plotItemsOnly,
  positiveValueSeriesLossless,
  zeroMarkSeries,
  type TimeAxis,
} from "../src/charts/index.ts";
import type { GridSlot } from "../src/charts/canonical-grid.ts";
import type { ScalarSlot } from "../src/charts/s2-scalar-grid.ts";
import { chartConstructorOptions, gridCarrierSeriesOptions } from "../src/app/symbol/chart-options.ts";
import { DENSE_SERIES_ABLATION_QUERY_PARAM, hostSeriesFeeds, type SeriesFeed } from "../src/app/symbol/host-series-feed.ts";

const ONE_MINUTE_MS = 60_000;
const AXIS: TimeAxis = { startMs: 1_700_000_040_000, stepMs: ONE_MINUTE_MS, slotCount: 80 };
const CHART_WIDTH_PX = 880;
const CHART_HEIGHT_PX = 290;
const MARK_VALUE = 6;
const MARK_BAND_MAX = 10;
/** The isolated present bucket; the mutant changes its line value. */
const ISOLATED_INDEX = 35;

/** present 0-19, gap 20-29, isolated 35, gap 36-44, present 45-79; legitimate zeros at 50 and 51. */
function syntheticValue(index: number): number | null {
  if (index < 20 || index === ISOLATED_INDEX || index >= 45) {
    return index === 50 || index === 51 ? 0 : 10 + (index % 7);
  }
  return null;
}

type SeriesKind = "Line" | "Histogram" | "Candlestick";

interface SyntheticSeriesSpec {
  readonly id: string;
  readonly kind: SeriesKind;
  readonly pane: number;
  readonly options: Record<string, unknown>;
  /** Marks live on a fixed band (`autoscaleInfoProvider` cannot cross into the page as JSON). */
  readonly fixedBand?: boolean;
}

function paneFeeds(): readonly SeriesFeed<string>[] {
  const scalar: ScalarSlot[] = [];
  const grid: GridSlot[] = [];
  for (let index = 0; index < AXIS.slotCount; index += 1) {
    const time = AXIS.startMs + index * AXIS.stepMs;
    const value = syntheticValue(index);
    scalar.push({ time, value });
    grid.push({
      time,
      candle:
        value === null
          ? null
          : { openTimeMs: time, open: value, high: value + 2, low: value - 2, close: value + 1, volume: 1 },
    });
  }
  return [
    { series: "line", items: lineSeriesLossless(scalar) },
    { series: "bars", items: positiveValueSeriesLossless(scalar) },
    { series: "absence", items: absenceMarkSeries(scalar, MARK_VALUE) },
    { series: "zero", items: zeroMarkSeries(scalar, MARK_VALUE) },
    { series: "candle", items: candlestickSeriesLossless(grid) },
  ];
}

const PANE_SERIES: readonly SyntheticSeriesSpec[] = [
  { id: "line", kind: "Line", pane: 0, options: { color: "#ff0000" } },
  { id: "bars", kind: "Histogram", pane: 1, options: { color: "#00ff00", priceScaleId: "bars" } },
  { id: "absence", kind: "Histogram", pane: 1, fixedBand: true, options: { color: "#8b949e", priceScaleId: "marks", lastValueVisible: false, priceLineVisible: false } },
  { id: "zero", kind: "Histogram", pane: 1, fixedBand: true, options: { color: "#58a6ff", priceScaleId: "marks", lastValueVisible: false, priceLineVisible: false } },
  { id: "candle", kind: "Candlestick", pane: 2, options: {} },
];
const CARRIER: SyntheticSeriesSpec = { id: "carrier", kind: "Line", pane: 0, options: { ...gridCarrierSeriesOptions() } };

const lossless = paneFeeds();
const design = hostSeriesFeeds("carrier", AXIS, lossless, false);
const mutantTime = (AXIS.startMs + ISOLATED_INDEX * AXIS.stepMs) / 1000;
const mutant = design.map((feed) =>
  feed.series !== "line"
    ? feed
    : { ...feed, items: feed.items.map((item) => (item.time === mutantTime ? { ...item, value: 14 } : item)) },
);
const withCarrier = [CARRIER, ...PANE_SERIES];

// ⚠️ With the absence/zero marks on the chart, the union of the SPARSE pane series already covers
// every slot (absence + zero + positive = all), so filtering the carrier changes nothing there — the
// first run of this spec measured exactly that (`carrier_filtered: 0` bytes) `[MEDIDO 2026-09-25]`.
// The carrier control therefore runs on a chart WITHOUT marks (line + candle), where the gaps have
// nobody but the carrier to hold them.
const NO_MARKS = new Set(["line", "candle"]);
const paneSeriesNoMarks = PANE_SERIES.filter((series) => NO_MARKS.has(series.id));
const losslessNoMarks = lossless.filter((feed) => NO_MARKS.has(feed.series));
const designNoMarks = hostSeriesFeeds("carrier", AXIS, losslessNoMarks, false);
const carrierFilteredNoMarks = designNoMarks.map((feed) =>
  feed.series === "carrier" ? { ...feed, items: plotItemsOnly(feed.items) } : feed,
);

process.stdout.write(
  JSON.stringify({
    denseQueryParam: DENSE_SERIES_ABLATION_QUERY_PARAM,
    chartOptions: chartConstructorOptions(CHART_WIDTH_PX, CHART_HEIGHT_PX),
    markBandMax: MARK_BAND_MAX,
    charts: [
      { name: "lossless", reference: "lossless", series: PANE_SERIES, feeds: lossless },
      { name: "design", reference: "lossless", series: withCarrier, feeds: design },
      { name: "mutant", reference: "lossless", series: withCarrier, feeds: mutant },
      { name: "lossless_no_marks", reference: "lossless_no_marks", series: paneSeriesNoMarks, feeds: losslessNoMarks },
      { name: "design_no_marks", reference: "lossless_no_marks", series: [CARRIER, ...paneSeriesNoMarks], feeds: designNoMarks },
      {
        name: "carrier_filtered_no_marks",
        reference: "lossless_no_marks",
        series: [CARRIER, ...paneSeriesNoMarks],
        feeds: carrierFilteredNoMarks,
      },
    ],
  }),
);
