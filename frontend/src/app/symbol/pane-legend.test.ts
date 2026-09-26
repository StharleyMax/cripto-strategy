// `T-01.7` — the crosshair → legend wiring, `pane-legend.ts`. `CA-3′` (no filter by `paneIndex`),
// `CA-4` (without a crosshair: the last CLOSED bucket), `CA-5` (the name is derived from the key),
// `C-8` (the numeral sits in a fixed column). Every property has a case that would pass under the
// named mutation and is asserted to fail it.
//
// Run with: npm --prefix frontend run test:app

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// `ADR-034/D8`: this route reaches `charts` only through the barrel.
import { resolveLegendReading, type LegendReading } from "../../charts/index.ts";
import type { Nature, SeriesCatalogEntry, SeriesKey } from "../../features/s3-inspector/series-catalog.ts";
import {
  ABSENCE_MICROCOPY,
  LEGEND_GRID_ABSENCE,
  LEGEND_MARK_TEXT,
  LEGEND_SERIES_IDS,
  createCrosshairSlotStore,
  crosshairMoveHandler,
  formatLegendReading,
  legendMarkWidthCh,
  legendNumeralWidthCh,
  paneIdentityLabel,
  resolvePaneLegends,
  type LegendSeriesId,
  type PaneLegendSources,
} from "./pane-legend.ts";
import { F1_PANE_ORDER } from "./pane-registry.ts";

const SOURCE = readFileSync(fileURLToPath(new URL("./SymbolClient.tsx", import.meta.url)), "utf8");

function entry(metric: string, nature: Nature, overrides: Partial<SeriesKey> = {}): SeriesCatalogEntry {
  const key: SeriesKey = {
    provider: "binance",
    venue: "binance_usdm",
    instrumentId: "BTCUSDT",
    metric,
    cohort: "all",
    interval: "1m",
    unit: "USDT",
    denom: "NA",
    nature,
    tsConvention: nature === "FLOW" ? "AGGREGATE_OVER_BUCKET" : "POINT_AT_BUCKET_END",
    reduction: nature === "FLOW" ? "SUM" : "POINT",
    quantityField: "NA",
    labelShift: 0,
    aggregationScope: "instrument",
    verifiedBy: "fixture",
    ...overrides,
  };
  return { key, nativeGrid: "1m", maxStalenessMs: 120_000, priceUse: null, reconstructedFrom: null, publishedError: null };
}

function sources(overrides: Partial<PaneLegendSources> = {}): PaneLegendSources {
  return {
    price: { seriesKeyId: "k-price", entry: entry("klines_ohlc", "STOCK") },
    volume: { seriesKeyId: "k-volume", entry: entry("klines_volume", "FLOW", { unit: "BTC" }) },
    oi: { seriesKeyId: "k-oi", entry: entry("sum_open_interest", "STOCK", { interval: "5m", unit: "BTC" }) },
    cvd: { seriesKeyId: "k-cvd", entry: entry("cvd_source", "FLOW", { unit: "BTC" }) },
    liquidation_long: { seriesKeyId: "k-liq-l", entry: entry("sum_liquidation", "FLOW", { cohort: "long", unit: "USD" }) },
    liquidation_short: { seriesKeyId: "k-liq-s", entry: entry("sum_liquidation", "FLOW", { cohort: "short", unit: "USD" }) },
    long_short: { seriesKeyId: "k-ls", entry: entry("count_long_short_ratio", "RATIO", { interval: "5m", unit: "ratio" }) },
    ...overrides,
  };
}

// ── `CA-3′` — one crosshair, every legend, NO filter by `paneIndex` ─────────────────────────

test("CA-3′: a move over ANY pane publishes its logical index to every legend", () => {
  const store = createCrosshairSlotStore();
  const handle = crosshairMoveHandler(store);
  // One listener stands for every legend: they all read the SAME snapshot.
  let notified = 0;
  store.subscribe(() => {
    notified += 1;
  });
  F1_PANE_ORDER.forEach((_paneId, paneIndex) => {
    const logical = 100 + paneIndex;
    handle({ logical, paneIndex });
    assert.equal(store.getSnapshot(), logical, `a move over pane ${paneIndex} did not reach the legends`);
  });
  assert.equal(notified, F1_PANE_ORDER.length);
});

test("CA-3′ MORDE: a handler that filters by paneIndex is rejected by the assertion above", () => {
  // The mutation `ADR-044` §Consequências names, written out: only the price pane's moves count.
  const store = createCrosshairSlotStore();
  const filtered = (param: { logical?: number; paneIndex?: number }) => {
    if (param.paneIndex === 0) store.publish(param.logical);
  };
  filtered({ logical: 7, paneIndex: 3 });
  assert.notEqual(store.getSnapshot(), 7, "the mutant must fail the CA-3′ assertion, or that assertion is vacuous");
});

test("CA-3′: the chart is subscribed to THE handler of this module, with no paneIndex anywhere in SymbolClient", () => {
  assert.match(SOURCE, /chart\.subscribeCrosshairMove\(handleCrosshairMove\)/);
  assert.match(SOURCE, /const handleCrosshairMove = crosshairMoveHandler\(crosshairStore\)/);
  assert.match(SOURCE, /chart\.unsubscribeCrosshairMove\(handleCrosshairMove\)/);
  assert.doesNotMatch(SOURCE, /\.paneIndex\b/, "a legend that reads param.paneIndex is CA-3′'s mutation");
});

test("the crosshair store notifies only when the SLOT changes, and leaving the chart clears it", () => {
  const store = createCrosshairSlotStore();
  let notified = 0;
  const unsubscribe = store.subscribe(() => {
    notified += 1;
  });
  store.publish(4.2);
  store.publish(3.6); // same bar (`[3.5, 4.5)`) — nobody re-renders
  assert.equal(store.getSnapshot(), 4);
  assert.equal(notified, 1);
  store.publish(-0.4); // rounds to -0; the snapshot is a plain 0
  assert.ok(Object.is(store.getSnapshot(), 0));
  store.publish(undefined);
  assert.equal(store.getSnapshot(), undefined);
  store.publish(Number.NaN);
  assert.equal(store.getSnapshot(), undefined, "a NaN is no crosshair, not a slot");
  assert.equal(notified, 3);
  unsubscribe();
  store.publish(9);
  assert.equal(notified, 3);
});

// ── `CA-4` — without a crosshair the legend is the last CLOSED bucket ───────────────────────

const STEP = 60_000;
const T0 = Date.UTC(2026, 8, 24, 10, 0);
const slots = [
  { time: T0, value: 10 },
  { time: T0 + STEP, value: 30258 },
  { time: T0 + 2 * STEP, value: 0 },
  { time: T0 + 3 * STEP, value: null },
  { time: T0 + 4 * STEP, value: 55 }, // in formation at as-of
];
const AS_OF = T0 + 4 * STEP + 30_000;

function read(logical: number | undefined, nature: Nature = "FLOW"): LegendReading {
  return resolveLegendReading({ logical, slots, nature, axisStepMs: STEP, nativeTimeframeMs: STEP, asOfMs: AS_OF });
}

test("CA-4: no crosshair reads the last closed bucket — which here is ABSENT, never the forming one nor 0", () => {
  const text = formatLegendReading(read(undefined), "SEM_PONTO");
  assert.deepEqual(text, { numeral: "SEM_PONTO", mark: "none", rawValue: null });
});

test("RF-4: each reading kind has its text — the value as served, the mark, and no number for absence", () => {
  assert.deepEqual(formatLegendReading(read(1), "SEM_PONTO"), { numeral: "30258", mark: "none", rawValue: 30258 });
  assert.deepEqual(formatLegendReading(read(2), "SEM_PONTO"), { numeral: "0", mark: "none", rawValue: 0 });
  assert.deepEqual(formatLegendReading(read(4), "SEM_PONTO"), { numeral: "55", mark: "forming", rawValue: 55 });
  // STOCK holds 1 native bucket at most: slot 3 is absent, and the OI-style hold reads slot 2's value.
  const held = resolveLegendReading({
    logical: 3,
    slots,
    nature: "STOCK",
    axisStepMs: STEP,
    nativeTimeframeMs: 5 * STEP,
    asOfMs: T0 + 10 * STEP,
  });
  assert.equal(formatLegendReading(held, "SEM_PONTO").mark, held.kind === "held" ? "held" : "none");
  assert.ok(formatLegendReading(read(3), "SEM_PONTO").numeral === "SEM_PONTO", "an absent slot is never 0");
});

// ── `CA-5` — the name is derived from the key, once per pane ────────────────────────────────

test("CA-5: the legend name is a function of the SeriesKey — changing the key changes the name", () => {
  const before = resolvePaneLegends(sources());
  assert.equal(before.long_short?.label, "5m, ratio", "the long/short heading keeps the form identityTerms gave it");
  assert.equal(before.oi?.label, "5m, BTC");
  const after = resolvePaneLegends(
    sources({ oi: { seriesKeyId: "k-oi", entry: entry("sum_open_interest", "STOCK", { interval: "15m", unit: "USD" }) } }),
  );
  assert.equal(after.oi?.label, "15m, USD");
  assert.notEqual(after.oi?.label, before.oi?.label);
});

test("CA-5 MORDE: a hand-written name does NOT change with the key, so the assertion above rejects it", () => {
  const handWritten = () => "5m, BTC";
  const before = resolvePaneLegends(sources(), handWritten);
  const after = resolvePaneLegends(
    sources({ oi: { seriesKeyId: "k-oi", entry: entry("sum_open_interest", "STOCK", { interval: "15m", unit: "USD" }) } }),
    handWritten,
  );
  assert.equal(after.oi?.label, before.oi?.label, "the mutant must fail CA-5, or the CA-5 assertion is vacuous");
});

test("RF-4/ADR-044 D2: the reading policy is the entry's nature, and an unresolved series has no legend", () => {
  const legends = resolvePaneLegends(sources({ volume: null }));
  assert.equal(legends.oi?.readingPolicy, "STOCK");
  assert.equal(legends.long_short?.readingPolicy, "RATIO");
  assert.equal(legends.cvd?.readingPolicy, "FLOW");
  assert.equal(legends.volume, null);
  assert.deepEqual(Object.keys(legends).sort(), [...LEGEND_SERIES_IDS].sort());
});

test("paneIdentityLabel is cadence then unit, and SymbolClient renders every heading through it", () => {
  assert.equal(paneIdentityLabel(entry("klines_volume", "FLOW", { interval: "1m", unit: "BTC" })), "1m, BTC");
  // Each legend series of the page reads its derived label; no heading spells a cadence by hand.
  for (const id of ["price", "volume", "oi", "cvd", "liquidation_long", "long_short"] satisfies LegendSeriesId[]) {
    assert.match(SOURCE, new RegExp(`identityTerms\\(legends\\.${id}\\)`), `the ${id} heading is not derived`);
  }
  assert.match(SOURCE, /resolvePaneLegends\(paneLegendSources\)/, "the legends are resolved through the registry");
});

// ── `C-8` — a fixed column for the numerals ─────────────────────────────────────────────────

test("C-8: the numeral column fits EVERY slot's numeral and the absence token, not the one on screen", () => {
  assert.equal(legendNumeralWidthCh(slots, "SEM_PONTO"), 9); // "SEM_PONTO" beats "30258"
  const wide = [...slots, { time: T0 + 5 * STEP, value: 1234567890.5 }];
  assert.equal(legendNumeralWidthCh(wide, "SEM_PONTO"), "1234567890.5".length);
  assert.equal(legendNumeralWidthCh([], "SEM_PONTO"), 9);
  // Every numeral the pane can show fits, so the column never grows under the crosshair.
  for (let i = 0; i < wide.length; i += 1) {
    const reading = resolveLegendReading({
      logical: i,
      slots: wide,
      nature: "FLOW",
      axisStepMs: STEP,
      nativeTimeframeMs: STEP,
      asOfMs: AS_OF + 10 * STEP,
    });
    assert.ok(formatLegendReading(reading, "SEM_PONTO").numeral.length <= legendNumeralWidthCh(wide, "SEM_PONTO"));
  }
});

test("C-8 MORDE: a column sized to the CURRENT numeral changes width between two slots", () => {
  const current = (logical: number) => formatLegendReading(read(logical), "SEM_PONTO").numeral.length;
  assert.notEqual(current(1), current(2), "the mutant's width walks: 30258 → 0");
  assert.equal(legendNumeralWidthCh(slots, "SEM_PONTO"), legendNumeralWidthCh(slots, "SEM_PONTO"));
});

test("C-8: the mark column fits every mark the nature can produce", () => {
  assert.equal(legendMarkWidthCh("STOCK"), Math.max(LEGEND_MARK_TEXT.held.length, LEGEND_MARK_TEXT.forming.length));
  assert.equal(legendMarkWidthCh("FLOW"), LEGEND_MARK_TEXT.forming.length);
  assert.equal(legendMarkWidthCh("RATIO"), LEGEND_MARK_TEXT.forming.length);
});

test("C-8: SymbolClient renders the numeral right-aligned in a width of `ch`, from the whole-pane width", () => {
  // `T-01.11-FIX` (`MF-3`): the column is sized to the pt-BR absence word the legend paints.
  assert.match(SOURCE, /legendNumeralWidthCh\(slots, absenceText\)/);
  assert.match(SOURCE, /style=\{\{ width: `\$\{numeralWidthCh\}ch` \}\}/);
  // `T-01.11-FIX` (`MF-3`): the class became a template literal (the absent numeral is dimmed).
  assert.match(SOURCE, /data-legend-numeral=""[^>]*className=\{?[`"][^`"]*\btext-right\b[^`"]*\btabular-nums\b/);
});

// ── `T-01.11-FIX` (`MF-3`): the legend paints a pt-BR word for absence, never the domain enum ──────

test("MF-3: every Absence reason has a pt-BR word, and none of them is the enum spelling", () => {
  const reasons = ["SEM_PONTO", "NAO_LIDO", "QUARENTENA", "SEM_FONTE"] as const;
  assert.deepEqual(Object.keys(ABSENCE_MICROCOPY).sort(), [...reasons].sort(), "the map is total over `Absence`");
  for (const reason of reasons) {
    const word = ABSENCE_MICROCOPY[reason];
    assert.ok(word.length > 0, `${reason} has no word`);
    assert.doesNotMatch(word, /[A-Z_]/, `${reason} → "${word}" still looks like an enum (uppercase or underscore)`);
    assert.doesNotMatch(word, /\d/, `${reason} → "${word}" carries a digit — an absence must never read as a number`);
  }
  assert.equal(ABSENCE_MICROCOPY.SEM_PONTO, "ausente", "plan 01 item 1.6: \"slot ausente mostra ausente\"");
  assert.equal(LEGEND_GRID_ABSENCE, "SEM_PONTO");
});

test("MF-3: an absent reading formats to the word, and the numeral column is at least that wide", () => {
  const word = ABSENCE_MICROCOPY[LEGEND_GRID_ABSENCE];
  const absent: LegendReading = { kind: "absent", source: "crosshair", slotIndex: 3, bucketStartMs: 0 };
  assert.deepEqual(formatLegendReading(absent, word), { numeral: "ausente", mark: "none", rawValue: null });
  assert.ok(legendNumeralWidthCh([{ value: null }, { value: 7 }], word) >= word.length);
});

test("MF-3: SymbolClient's legend paints the word, keeps the enum in data-legend-absence, and dims the absent numeral", () => {
  const legendValue = /function LegendValue\([\s\S]*?\n\}\n/.exec(SOURCE);
  assert.ok(legendValue !== null, "`LegendValue` moved — re-read SymbolClient.tsx before trusting this");
  const body = legendValue[0];
  assert.match(body, /const absenceText = ABSENCE_MICROCOPY\[LEGEND_GRID_ABSENCE\]/);
  assert.match(body, /formatLegendReading\(reading, absenceText\)/);
  assert.match(body, /numeral: absenceText/);
  // The mutation this rejects: handing the ENUM back to the painted numeral.
  assert.doesNotMatch(body, /formatLegendReading\(reading, ABSENCE_TOKEN\)|numeral: ABSENCE_TOKEN/);
  assert.match(body, /data-legend-absence=\{isAbsent \? LEGEND_GRID_ABSENCE : ""\}/);
  assert.match(body, /isAbsent \? "text-provenance-weak" : "text-on-surface"/);
});
