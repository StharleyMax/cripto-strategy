/**
 * `T-01.11-FIX` (`MF-2` of `docs/context/paineis-de-fluxo/gates/T-01.11-design-review.md`) — the
 * liquidation bar scale prints no tick label, and the crosshair keeps the real number.
 *
 * Two halves: the format, read back from a REAL `lightweight-charts` series in a `jsdom` (the
 * formatter the price scale uses is its first series' — `dist/lightweight-charts.development.mjs:3908`,
 * `formatTickmarks: priceFormat.tickmarksFormatter ?? …`); and the anchor that the liquidation bar
 * series of the host is built with it. The pixel half — the axis cell beside each liquidation pane
 * carries no text ink — is `e2e/24`'s `T-01.11-FIX` test.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

import { installGlobals } from "../../charts/index.ts";
import { chartConstructorOptions } from "./chart-options.ts";
import { unlabeledTickPriceFormat } from "./unlabeled-tick-format.ts";

test("MF-2: a series built with the format has blank tick labels and a two-decimal crosshair label", async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="chart"></div></body></html>', { pretendToBeVisual: true });
  installGlobals(dom);
  const lc = await import("lightweight-charts");
  const container = dom.window.document.getElementById("chart");
  assert.ok(container !== null);
  const chart = lc.createChart(container, { ...chartConstructorOptions(600, 300), localization: { locale: "en-US" } });
  const labelled = chart.addSeries(lc.HistogramSeries, { base: 1 });
  const unlabelled = chart.addSeries(lc.HistogramSeries, { base: 1, priceFormat: unlabeledTickPriceFormat() }, 1);
  const ticks = [1, 10, 1_000, 2_000_000_000_000_000_000];
  // Control: the library's default format DOES label — otherwise the assertion below proves nothing.
  assert.ok(labelled.priceFormatter().formatTickmarks(ticks).every((label) => label.length > 0));
  assert.deepEqual(unlabelled.priceFormatter().formatTickmarks(ticks), ["", "", "", ""]);
  assert.equal(unlabelled.priceFormatter().format(6_759_380.32), "6759380.32");
  chart.remove();
});

test("MF-2: the host builds the liquidation bar series with the unlabelled format", () => {
  const source = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "SymbolClient.tsx"), "utf8");
  const barStyle = /const barStyle: Partial<HistogramSeriesOptions> = \{([\s\S]*?)\n {6}\};/.exec(source);
  assert.ok(barStyle !== null, "the liquidation `barStyle` literal moved — re-read the host before trusting this");
  assert.match(barStyle[1]!, /priceFormat: unlabeledTickPriceFormat\(\)/);
  assert.match(barStyle[1]!, /base: LIQUIDATION_LOG_BASE/, "matched a barStyle that is not the liquidation one");
});
