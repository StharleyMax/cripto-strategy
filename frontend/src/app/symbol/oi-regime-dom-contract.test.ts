// `T-03.12` (`paineis-de-fluxo`, plan `03` item `3b.5`) — the SOURCE contract of the OI pane's regime
// marks, pinned on `SymbolClient.tsx` the way `oi-candle-dom-contract.test.ts` pins the candle. What
// the canvas and the legend show is `e2e/37-oi-regime-marks-pixel.spec.ts`'s (with the
// `?e2eOiRegimeMarks=0` ablation); what this file guards is that the source still SAYS it:
//
//   1. the marks are `oiRegimeMarks(oiCandles.candles, oiCandles.sources)` — the served candles, and
//      nothing written by hand (`V7`: no instant, no regime literal in the pane);
//   2. a pane primitive paints them (`attachPrimitive`), in every kind the pane mounts;
//   3. the legend's `H/L não medidos` cell is `hlUnmeasured(candle, oiCandles.sources)` — the candle
//      the legend reads, never another one, never `expected` (`N-7`);
//   4. the DOM facts publish the derivation (`data-oi-regime-*`) and each label its `derived_from`.
//
// Run with: npm --prefix frontend run test:app

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(HERE, "SymbolClient.tsx"), "utf8");

function functionBody(text: string, name: string): string {
  const start = text.indexOf(`\nfunction ${name}(`);
  assert.ok(start >= 0, `function ${name} not found — the anchor moved, fix this test`);
  const next = text.indexOf("\nfunction ", start + 1);
  const nextExport = text.indexOf("\nexport function ", start + 1);
  const ends = [next, nextExport].filter((at) => at > start);
  return text.slice(start, ends.length === 0 ? undefined : Math.min(...ends));
}

const MARKS_FROM_SERVED = /oiRegimeMarks\(oiCandles\.candles, oiCandles\.sources\)/;
const PRIMITIVE_ATTACHED = /chart\.panes\(\)\[paneIndex\]\?\.attachPrimitive\(primitive\);\s*\n\s*primitive\.setMarks\(canvasMarks\);/;
const PRIMITIVE_BEFORE_KIND = /primitiveRef\.current = primitive;\s*\n\s*const kind = mountedOiPaneSeriesKind\(\);/;
const MARKS_UPDATED = /primitiveRef\.current\?\.setMarks\(canvasMarks\);/;
const FACT_BANDS = /data-oi-regime-bands=\{regime\.bands\.length\}/;
const FACT_RULES = /data-oi-regime-rules=\{regime\.rules\.length\}/;
const FACT_BANDS_AT = /data-oi-regime-bands-at=\{oiRegimeBandsAtFact\(regime\)\}/;
const LABEL_FACT = /data-fact=\{`oi_regime_band_label:\$\{label\.derivedFrom\}`\}/;
const LABEL_TEXT = /\{label\.text\}/;
const HL_PREDICATE = /const hlNotMeasured = candle !== null && hlUnmeasured\(candle, oiCandles\.sources\);/;
const HL_CELL = /if \(hlNotMeasured && field === "high"\) \{\s*\n\s*return <OiLegendHlUnmeasuredCell key="hl-unmeasured" numeralWidthCh=\{numeralWidthCh\} \/>;/;
const HL_LOW_DROPPED = /if \(hlNotMeasured && field === "low"\) \{/;
const HL_PART = /data-legend-ohlc-part="hl-unmeasured"/;
const HL_TEXT = /const OI_HL_UNMEASURED_TEXT = "H\/L não medidos";/;

const oiPane = () => functionBody(source, "OiPane");

function survives(text: string): boolean {
  const pane = functionBody(text, "OiPane");
  const legend = functionBody(text, "OiCandleLegend");
  const cell = functionBody(text, "OiLegendHlUnmeasuredCell");
  return (
    MARKS_FROM_SERVED.test(pane) &&
    PRIMITIVE_ATTACHED.test(pane) &&
    PRIMITIVE_BEFORE_KIND.test(pane) &&
    MARKS_UPDATED.test(pane) &&
    FACT_BANDS.test(pane) &&
    FACT_RULES.test(pane) &&
    FACT_BANDS_AT.test(pane) &&
    LABEL_FACT.test(pane) &&
    LABEL_TEXT.test(pane) &&
    !/binance_point_5m|binance_poll_1m/.test(pane) &&
    HL_PREDICATE.test(legend) &&
    HL_CELL.test(legend) &&
    HL_LOW_DROPPED.test(legend) &&
    HL_PART.test(cell) &&
    HL_TEXT.test(text)
  );
}

test("the regime marks come off the served candles and a pane primitive paints them in every kind", () => {
  assert.match(oiPane(), MARKS_FROM_SERVED);
  assert.match(oiPane(), PRIMITIVE_ATTACHED);
  assert.match(oiPane(), PRIMITIVE_BEFORE_KIND, "attached before the kind branch: line and candlestick both get it");
  assert.match(oiPane(), MARKS_UPDATED, "new pages reach the primitive");
  assert.doesNotMatch(oiPane(), /binance_point_5m|binance_poll_1m/, "no regime written by hand in the pane (V7)");
});

test("the DOM publishes the derivation and each label names its derived_from", () => {
  for (const pin of [FACT_BANDS, FACT_RULES, FACT_BANDS_AT, LABEL_FACT, LABEL_TEXT]) {
    assert.match(oiPane(), pin);
  }
});

test("DG-4: the legend's cell is hlUnmeasured of THE candle it reads, and replaces H and L together", () => {
  const legend = functionBody(source, "OiCandleLegend");
  assert.match(legend, HL_PREDICATE);
  assert.match(legend, HL_CELL);
  assert.match(legend, HL_LOW_DROPPED);
  assert.match(functionBody(source, "OiLegendHlUnmeasuredCell"), HL_PART);
  assert.match(source, HL_TEXT);
});

test("the baseline source survives every pin", () => {
  assert.ok(survives(source));
});

test("MORDE: each planted defect of the regime wiring is caught", () => {
  const inPane = (s: string, mutate: (body: string) => string) => s.replace(functionBody(s, "OiPane"), mutate(functionBody(s, "OiPane")));
  const mutants: readonly { readonly name: string; readonly mutate: (s: string) => string }[] = [
    { name: "marks from the rows' slots", mutate: (s) => inPane(s, (b) => b.replace(MARKS_FROM_SERVED, "oiRegimeMarks([], oiCandles.sources)")) },
    { name: "primitive never attached", mutate: (s) => inPane(s, (b) => b.replace("chart.panes()[paneIndex]?.attachPrimitive(primitive);", "")) },
    { name: "primitive only for the candlestick kind", mutate: (s) => inPane(s, (b) => b.replace(PRIMITIVE_BEFORE_KIND, "const kind = mountedOiPaneSeriesKind();")) },
    { name: "new pages never reach the primitive", mutate: (s) => inPane(s, (b) => b.replace(MARKS_UPDATED, "")) },
    { name: "fact of bands hard-coded", mutate: (s) => s.replace(FACT_BANDS, "data-oi-regime-bands={1}") },
    { name: "label fact hard-coded", mutate: (s) => s.replace(LABEL_FACT, 'data-fact="oi_regime_band_label:binance_point_5m"') },
    { name: "legend predicate by expected (N-7)", mutate: (s) => s.replace(HL_PREDICATE, "const hlNotMeasured = candle !== null && candle.samples.expected === 1;") },
    { name: "legend predicate off another candle", mutate: (s) => s.replace(HL_PREDICATE, "const hlNotMeasured = oiCandles.candles.length > 0 && hlUnmeasured(oiCandles.candles.at(-1)!, oiCandles.sources);") },
    { name: "the cell replaces only H (L stays a numeral)", mutate: (s) => s.replace(/if \(hlNotMeasured && field === "low"\) \{/, 'if (hlNotMeasured && field === ("never" as string)) {') },
    { name: "the text says 'sem pavio' (marubozu)", mutate: (s) => s.replace(HL_TEXT, 'const OI_HL_UNMEASURED_TEXT = "sem pavio";') },
  ];
  for (const mutant of mutants) {
    const mutated = mutant.mutate(source);
    assert.notEqual(mutated, source, `the mutation "${mutant.name}" found no anchor — update this test, do not delete it`);
    assert.equal(survives(mutated), false, `the mutation "${mutant.name}" is NOT detected — the guard is vacuous`);
  }
});
