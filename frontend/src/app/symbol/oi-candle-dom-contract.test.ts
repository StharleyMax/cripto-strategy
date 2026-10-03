// `T-03.11` (`paineis-de-fluxo`, plan `03` item `3b.4`, `RF-8`, `RF-9`, `RN-6`) — the SOURCE contract
// of the OI pane's candle, pinned on `SymbolClient.tsx` the way `oi-pane-dom-contract.test.ts` pins
// the rest of the pane. What the canvas shows is `e2e/36-oi-candle-pixel-and-ablation.spec.ts`'s
// (with the `?e2eOiLine=1` ablation); what this file guards is that the source still SAYS it:
//
//   1. the mount reads its kind off the registry (`oiPaneSeriesKind`), and `candlestick` mounts a
//      `CandlestickSeries` fed `candlestickSeriesLossless(oiCandles.slots)` — the served candles;
//   2. the colours are the price candle's (`candlestickSeriesColors()`, `RF-9`/`RNF-3`): the library
//      then colours each bar by ITS OWN `close` vs `open` — contracts, never price;
//   3. the legend is O·H·L·C, in that order, off ONE candle (`OiCandleLegend`);
//   4. the `DERIVADO` label is `oiCandleProvenanceLabel(candle.derived_from, …)` — no literal
//      `DERIVADO (` anywhere in the client (`RN-6`: "nunca escrito à mão").
//
// Every pin has a MORDE that plants the defect and proves the pin notices.
//
// Run with: npm --prefix frontend run test:app

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(HERE, "SymbolClient.tsx"), "utf8");

/** The body of one top-level `function <name>(` of the client, up to the next top-level function. */
function functionBody(text: string, name: string): string {
  // `export function` too: decision P1 (T-10.11) exports the panes a render test mounts.
  const bare = text.indexOf(`\nfunction ${name}(`);
  const start = bare >= 0 ? bare : text.indexOf(`\nexport function ${name}(`);
  assert.ok(start >= 0, `function ${name} not found — the anchor moved, fix this test`);
  const next = text.indexOf("\nfunction ", start + 1);
  const nextExport = text.indexOf("\nexport function ", start + 1);
  const ends = [next, nextExport].filter((at) => at > start);
  return text.slice(start, ends.length === 0 ? undefined : Math.min(...ends));
}

/** Code only — comments stripped, because the docstrings QUOTE the label and the old line. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

const MOUNT_BY_REGISTRY = /const kind = mountedOiPaneSeriesKind\(\);\s*\n\s*if \(kind === "candlestick"\) \{/;
const KIND_FROM_REGISTRY = /return oiPaneSeriesKind\(typeof window !== "undefined" && isOiLineAblationRequested\(window\.location\.search\)\);/;
const CANDLE_SERIES = /chart\.addSeries\(CandlestickSeries, style, paneIndex\)/;
const CANDLE_COLOURS = /const style: Partial<CandlestickSeriesOptions> = candlestickSeriesColors\(\);/;
const CANDLE_FEED = /kind === "candlestick" \? candlestickSeriesLossless\(oiCandles\.slots\) : lineSeriesLossless\(panels\.oi\.slots\)/;
const LEGEND_RENDERED = /<OiCandleLegend oiCandles=\{oiCandles\} \/>/;
const OLD_LINE_LEGEND = /<LegendValue seriesId="oi"/;
const OHLC_ORDER =
  /\{ field: "open", letter: "O" \},\s*\n\s*\{ field: "high", letter: "H" \},\s*\n\s*\{ field: "low", letter: "L" \},\s*\n\s*\{ field: "close", letter: "C" \},/;
const LABEL_DERIVED = /const provenance = candle === null \? null : oiCandleProvenanceLabel\(candle\.derived_from, oiCandles\.sources\);/;
const LABEL_FACT = /data-fact=\{`oi_candle_provenance:\$\{candle!\.derived_from\}`\}/;
const ONE_CANDLE = /oiCandleAt\(oiCandles\.candles, reading\.observedBucketStartMs\)/;
const REGIME_STEP = /oiCandleRegimeStepAt\(oiCandles, probe\.bucketStartMs\)/;
const READ_AT_REGIME = /regimeStepMs === null \? probe : readAt\(regimeStepMs\)/;
const WIRED_FROM_PAGER = /<OiPane[^>]*oiCandles=\{pager\.assembly\.oiCandles\}/;

const oiPane = functionBody(source, "OiPane");
const oiLegend = functionBody(source, "OiCandleLegend");
const kindFn = functionBody(source, "mountedOiPaneSeriesKind");

/** A mutation scoped to the body of `OiPane` — the price pane carries the same candle lines FIRST,
 * so an unscoped `replace` would plant the defect in the wrong pane and prove nothing. */
function inOiPane(text: string, mutate: (body: string) => string): string {
  const body = functionBody(text, "OiPane");
  return text.replace(body, mutate(body));
}

function survives(text: string): boolean {
  const pane = functionBody(text, "OiPane");
  const legend = functionBody(text, "OiCandleLegend");
  return (
    MOUNT_BY_REGISTRY.test(pane) &&
    CANDLE_SERIES.test(pane) &&
    CANDLE_COLOURS.test(pane) &&
    CANDLE_FEED.test(pane) &&
    LEGEND_RENDERED.test(pane) &&
    !OLD_LINE_LEGEND.test(pane) &&
    KIND_FROM_REGISTRY.test(functionBody(text, "mountedOiPaneSeriesKind")) &&
    OHLC_ORDER.test(text) &&
    LABEL_DERIVED.test(legend) &&
    LABEL_FACT.test(legend) &&
    ONE_CANDLE.test(legend) &&
    REGIME_STEP.test(legend) &&
    READ_AT_REGIME.test(legend) &&
    !/DERIVADO \(/.test(code(text)) &&
    WIRED_FROM_PAGER.test(text)
  );
}

test("RF-8: the OI pane mounts the registry's kind, and candlestick is a CandlestickSeries fed the served candles", () => {
  assert.match(kindFn, KIND_FROM_REGISTRY);
  assert.match(oiPane, MOUNT_BY_REGISTRY);
  assert.match(oiPane, CANDLE_SERIES);
  assert.match(oiPane, CANDLE_FEED);
  assert.match(source, WIRED_FROM_PAGER, "the candles reach the pane from the pager's assembly");
});

test("RF-9: the OI candle wears the price candle's colours — each bar coloured by its own close vs open", () => {
  assert.match(oiPane, CANDLE_COLOURS);
});

test("RF-8: the legend is O·H·L·C, in that order, and all four come off ONE candle", () => {
  assert.match(oiPane, LEGEND_RENDERED);
  assert.doesNotMatch(oiPane, OLD_LINE_LEGEND, "the line's single-value legend is gone from the OI pane");
  assert.match(source, OHLC_ORDER);
  assert.match(oiLegend, ONE_CANDLE);
  assert.match(oiLegend, REGIME_STEP, "the reading width is the regime of the slot, not one width for the pane");
  assert.match(oiLegend, READ_AT_REGIME);
});

test("RN-6: the DERIVADO label is derived from derived_from — no literal of it in the client's code", () => {
  assert.match(oiLegend, LABEL_DERIVED);
  assert.match(oiLegend, LABEL_FACT);
  assert.doesNotMatch(code(source), /DERIVADO \(/);
});

test("the baseline source survives every pin (a pin that rejects the real file is not a pin)", () => {
  assert.ok(survives(source));
});

test("MORDE: each planted defect of the OI candle is caught by the pins above", () => {
  const mutants: readonly { readonly name: string; readonly mutate: (s: string) => string }[] = [
    { name: "mount ignores the registry (always line)", mutate: (s) => inOiPane(s, (b) => b.replace(MOUNT_BY_REGISTRY, (m) => m.replace('if (kind === "candlestick")', 'if (kind === "line")'))) },
    { name: "kind hard-coded instead of read off the registry", mutate: (s) => s.replace(KIND_FROM_REGISTRY, 'return "candlestick";') },
    { name: "candle drawn as a line series", mutate: (s) => inOiPane(s, (b) => b.replace(CANDLE_SERIES, "chart.addSeries(LineSeries, style, paneIndex)")) },
    { name: "coloured by a fixed ink (not by direction)", mutate: (s) => inOiPane(s, (b) => b.replace(CANDLE_COLOURS, "const style: Partial<CandlestickSeriesOptions> = { upColor: \"#888\", downColor: \"#888\" };")) },
    { name: "candle fed the rows' line slots", mutate: (s) => inOiPane(s, (b) => b.replace(CANDLE_FEED, 'kind === "candlestick" ? lineSeriesLossless(panels.oi.slots) : lineSeriesLossless(panels.oi.slots)')) },
    { name: "old single-value legend back", mutate: (s) => inOiPane(s, (b) => b.replace(LEGEND_RENDERED, '<LegendValue seriesId="oi" factKey="oi" slots={panels.oi.slots} nativeTimeframeMs={panels.oi.timeframeMs} />')) },
    { name: "O·H·L·C out of order", mutate: (s) => s.replace(OHLC_ORDER, (m) => m.replace('field: "high", letter: "H"', 'field: "low", letter: "H"')) },
    { name: "label written by hand", mutate: (s) => s.replace(LABEL_DERIVED, 'const provenance = candle === null ? null : "DERIVADO (OHLC de amostras 5m · ADR-045)";') },
    { name: "fact key hard-coded", mutate: (s) => s.replace(LABEL_FACT, 'data-fact="oi_candle_provenance:binance_point_5m"') },
    { name: "legend reads the last candle, not the one under the reading", mutate: (s) => s.replace(ONE_CANDLE, "oiCandles.candles.at(-1) ?? null") },
    { name: "legend read at one pane-wide width", mutate: (s) => s.replace(READ_AT_REGIME, "regimeStepMs === null ? probe : readAt(300_000)") },
    { name: "regime step not asked of the slot", mutate: (s) => s.replace(REGIME_STEP, "(oiCandles.sources[0]?.bucket_interval_ms ?? null)") },
    { name: "candles not handed to the pane", mutate: (s) => s.replace("oiCandles={pager.assembly.oiCandles}", "oiCandles={EMPTY_OI_CANDLE_PANE}") },
  ];
  for (const mutant of mutants) {
    const mutated = mutant.mutate(source);
    assert.notEqual(mutated, source, `the mutation "${mutant.name}" found no anchor — update this test, do not delete it`);
    assert.equal(survives(mutated), false, `the mutation "${mutant.name}" is NOT detected — the guard is vacuous`);
  }
});

test("CALA: the ui-designer rewording the letters' ink or the label's position leaves the contract intact", () => {
  const restyled = source
    .replace('<span className="text-provenance-weak">{letter}</span>\n              {numeralSpan}\n            </span>', '<span className="text-on-surface">{letter}</span>\n              {numeralSpan}\n            </span>')
    .replace('data-fact={`oi_candle_provenance:${candle!.derived_from}`} className="text-sm text-on-surface"', 'data-fact={`oi_candle_provenance:${candle!.derived_from}`} className="text-xs text-provenance-weak"');
  assert.notEqual(restyled, source, "the form anchors moved — re-anchor this CALA rather than dropping it");
  assert.ok(survives(restyled));
});
