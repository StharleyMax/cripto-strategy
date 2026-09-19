/**
 * `T-01.8` (`SPEC-008`/`D1`, plano `01` item `1.8`) — THE CANDLE THE PRICE PANEL DRAWS, MEASURED
 * IN PIXELS, AND THE ABLATION THAT MAKES THE MEASUREMENT MEAN SOMETHING.
 *
 * ── WHY THIS FILE IS NOT ANOTHER SOURCE SCAN, NOR ANOTHER DOM ASSERTION ─────────────────────
 *
 * The deliverable of this task is a BODY and a WICK on screen, and neither is a string one can
 * grep or an attribute one can read: both come out of four numbers going through the grid, the
 * lossless adapter and the library's own price scale. `MEMORY.md` names the lesson this repo
 * already paid for — *"assert de DOM não prova pixel: elemento pode passar em tudo e não existir
 * na tela"*. So this file asks the LIBRARY where it placed each of the four readings
 * (`priceToCoordinate`, inside a `jsdom`), exactly the instrument
 * `volume-subaxis-geometry.test.ts` introduced when a source scan and a DOM contract both stayed
 * green over `67.9%` of sub-pixel bars.
 *
 * ── THE FOUR MEASUREMENTS, AND WHAT EACH ONE WOULD CATCH ────────────────────────────────────
 *
 *   `bodyPx`  = |y(open) - y(close)|   ⇒ `0` when the four readings collapse (the DEGENERATE
 *                                        candle `RN-2` retired, and also what `ADR-040/D2`'s
 *                                        "os quatro STOCK num só" would look like);
 *   `wickPx`  = y(low) - y(high)       ⇒ `0` when `high === low`, which is a market that did not
 *                                        move — the exact affirmation absence must never make;
 *   `bars`    = items carrying OHLC    ⇒ `0` after the ablation, and that is `DoD-4`;
 *   `gaps`    = bare `{time}` items    ⇒ what a bucket without all four readings becomes.
 *
 * ⛔ THE ABLATION (`CA-4`/`DoD-4`). The same fixture is measured twice: with the four series,
 * and with the producer of `HIGH` removed. A pixel that survives the second run was drawing
 * something else — the `close` alone, or the retired degenerate. The falsifier is the
 * before/after PAIR, never the "before" alone: a candle drawn from a constant would pass any
 * single-run assertion about body and wick.
 *
 * ⚠️ WHAT THIS FILE DOES NOT CLAIM: it does not rasterize. `jsdom` has no 2D backend here, so
 * "pixel" means the coordinate the library itself assigns inside the pane it was given — the
 * same meaning `volume-subaxis-geometry.test.ts` uses, and the strongest statement available
 * without a browser. The browser half is `T-01.11`'s e2e against the real app, and it is the one
 * that will read a real screen.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

import {
  buildS2Panels,
  candlestickSeriesColors,
  candlestickSeriesLossless,
  flushFrames,
  installGlobals,
  resolveTrailingWindow,
  FIVE_MINUTES_MS,
  S2_PRICE_USE,
  S2_WINDOW_SPAN_MS,
  type CandlestickItem,
  type WhitespaceItem,
} from "../../charts/index.ts";
import { chartConstructorOptions } from "./chart-options.ts";
import type { SeriesHistoryRow } from "./series-history-client.ts";
import type { SeriesKey } from "../../features/s3-inspector/series-catalog.ts";
import {
  assembleOhlcCandles,
  countPresentCandleSlots,
  DuplicateSeriesRowError,
  InvalidSeriesValueError,
  KLINES_OHLC_REDUCTIONS,
  matchesKlinesOhlc,
  type OhlcHistoryRows,
} from "./view-model.ts";

const ONE_MINUTE_MS = 60_000;
/** Derived exactly like the route derives its own (`request-window.ts`) — never a literal
 * window, the defect `ACHADO-SERIES-HISTORY-SEM-PONTO.md` cost a whole phase. */
const FIXTURE_WINDOW = resolveTrailingWindow({
  nowMs: Date.UTC(2026, 7, 24, 0, 0, 0),
  lagMs: 0,
  spanMs: S2_WINDOW_SPAN_MS,
  alignmentMs: FIVE_MINUTES_MS,
});
const FIRST_BUCKET_MS = FIXTURE_WINDOW.startMs;
/** Height of the pane the measurement happens in — read from production, not retyped, so a
 * change of pane height moves the measurement with the screen instead of away from it. */
const MEASUREMENT_WIDTH_PX = 1_200;
/** `CHART_HEIGHT_PX` READ FROM THE PRODUCTION COMPONENT, never retyped — same discipline (and
 * the same failure-on-rename) as `volume-subaxis-geometry.test.ts`'s `productionNumber`: a copy
 * here would measure the pane THIS file chose instead of the one the screen draws. */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHART_HEIGHT_PX = (() => {
  const source = readFileSync(path.join(HERE, "SymbolClient.tsx"), "utf8");
  const match = /const CHART_HEIGHT_PX = (\d+);/.exec(source);
  assert.ok(match !== null, "CHART_HEIGHT_PX was not found in SymbolClient.tsx — the anchor moved, fix this test");
  return Number(match[1]);
})();

/** Three consecutive 1-minute buckets, carrying ONE real bar each (values below), with a real
 * body (`open !== close`) and a real range (`high > max(open, close)`, `low < min(open, close)`)
 * — a shape the degenerate mapping could not produce and cannot imitate. */
const BARS = [
  { openTimeMs: FIRST_BUCKET_MS, open: 100, high: 110, low: 90, close: 105 },
  { openTimeMs: FIRST_BUCKET_MS + ONE_MINUTE_MS, open: 105, high: 120, low: 104, close: 118 },
  { openTimeMs: FIRST_BUCKET_MS + 2 * ONE_MINUTE_MS, open: 118, high: 119, low: 101, close: 102 },
] as const;

/** `/series-history`'s own envelope shape, for ONE reduction: one row per grid instant, value
 * as `Decimal`-as-text (`SPEC-001 §2.6`), absence DECLARED. `omitAt` drops the reading of one
 * bucket the way the wire does it — a row that exists and says `SEM_PONTO`. */
function rowsFor(
  reading: (bar: (typeof BARS)[number]) => number,
  options: { readonly absentAt?: readonly number[] } = {},
): readonly SeriesHistoryRow[] {
  const absentAt = new Set(options.absentAt ?? []);
  return BARS.map((bar) =>
    absentAt.has(bar.openTimeMs)
      ? { event_time: bar.openTimeMs, available_at: null, value: null, absence: "SEM_PONTO" }
      : {
          event_time: bar.openTimeMs,
          available_at: bar.openTimeMs + 1_000,
          value: String(reading(bar)),
          absence: null,
        },
  );
}

function ohlcRows(options: { readonly absentHighAt?: readonly number[]; readonly withoutHigh?: boolean } = {}): OhlcHistoryRows {
  return {
    open: rowsFor((bar) => bar.open),
    // ⛔ THE ABLATION KNOB. `withoutHigh` is the producer of `HIGH` REMOVED — not a zeroed
    // value, not a flag: the series answers nothing at all, which is what "removido o produtor"
    // means on this side of the wire (`fetchPanelRows` returns `rows: []` for every failure it
    // knows about, from `not_in_catalog` to `connection_refused`).
    high: options.withoutHigh === true ? [] : rowsFor((bar) => bar.high, { absentAt: options.absentHighAt }),
    low: rowsFor((bar) => bar.low),
    close: rowsFor((bar) => bar.close),
  };
}

interface CandleMeasurement {
  /** One entry per bar the library actually placed, in grid order. */
  readonly bars: readonly { readonly bodyPx: number; readonly wickPx: number }[];
  /** Items handed to `setData` that carry OHLC. */
  readonly ohlcItems: number;
  /** Items handed to `setData` that are bare `{time}` whitespace — the LACUNA. */
  readonly gapItems: number;
  /** Slots of the price grid carrying a candle, counted the way the screen counts them. */
  readonly drawnCandles: number;
}

/**
 * Builds the price pane the way `SymbolClient.tsx` builds it — `buildS2Panels` for the grid,
 * `candlestickSeriesLossless` for the items, `candlestickSeriesColors`/`chartConstructorOptions`
 * for the series and the chart — and asks the library where it put each reading.
 *
 * Every step comes from production code. A local re-implementation of any of them would measure
 * the geometry THIS file chose rather than the one the screen draws, which is the false-green
 * `volume-subaxis-geometry.test.ts`'s header describes.
 */
async function measureCandles(rows: OhlcHistoryRows): Promise<CandleMeasurement> {
  const assembly = assembleOhlcCandles(rows);
  const panels = buildS2Panels({
    window: FIXTURE_WINDOW,
    candles: assembly.candles,
    priceUse: S2_PRICE_USE,
    oiPoints: [],
    oiMissingDays: [],
    cvdDeltas: [],
    cvdMissingDays: [],
    cvdCoveredDays: [],
  });
  const items = candlestickSeriesLossless(panels.price.series.slots);

  const dom = new JSDOM('<!doctype html><html><body><div id="chart"></div></body></html>', { pretendToBeVisual: true });
  installGlobals(dom);
  const lc = await import("lightweight-charts");
  const container = dom.window.document.getElementById("chart");
  assert.ok(container !== null, "broken invariant: the chart container does not exist in the DOM");
  const chart = lc.createChart(container, chartConstructorOptions(MEASUREMENT_WIDTH_PX, CHART_HEIGHT_PX));
  const series = chart.addSeries(lc.CandlestickSeries, candlestickSeriesColors());
  series.setData(items as never);
  chart.timeScale().fitContent();
  await flushFrames(dom, 3);

  const bars = assembly.candles.map((candle) => {
    const y = (price: number): number => {
      const coordinate = series.priceToCoordinate(price);
      assert.ok(coordinate !== null, `the library placed no coordinate for ${price} — the measurement would be vacuous`);
      return coordinate;
    };
    // The vertical axis grows DOWNWARD, so a higher price has a SMALLER coordinate: `y(low) -
    // y(high)` is the full range in pixels, and `|y(open) - y(close)|` the body.
    return { bodyPx: Math.abs(y(candle.open) - y(candle.close)), wickPx: y(candle.low) - y(candle.high) };
  });
  chart.remove();
  return {
    bars,
    ohlcItems: items.filter((item) => "close" in (item as CandlestickItem | WhitespaceItem)).length,
    gapItems: items.filter((item) => !("close" in (item as CandlestickItem | WhitespaceItem))).length,
    drawnCandles: countPresentCandleSlots(panels.price.series.slots),
  };
}

// ── 1. THE PIXEL, AND THE ABLATION THAT PROVES IT WAS THE CANDLE ─────────────────────────────

test("P1: the four readings draw a BODY and a WICK — measured in pixels, asked of the library", async () => {
  const measurement = await measureCandles(ohlcRows());

  assert.equal(measurement.ohlcItems, BARS.length, "one item with OHLC per bucket that answered all four readings");
  assert.equal(measurement.drawnCandles, BARS.length, "and the screen's own count agrees with what was drawn");
  assert.equal(measurement.bars.length, BARS.length);
  for (const [index, bar] of measurement.bars.entries()) {
    assert.ok(bar.bodyPx > 0, `bar ${index} has no BODY (${bar.bodyPx} px) — open and close collapsed onto one price`);
    assert.ok(bar.wickPx > 0, `bar ${index} has no RANGE (${bar.wickPx} px) — high and low collapsed onto one price`);
    // The wick must EXCEED the body: that is what makes it visible as a wick at all rather than
    // as the two edges of the body. `110 > 105` and `90 < 100` in the fixture, so the pixels have
    // to reproduce the same ordering the numbers have.
    assert.ok(
      bar.wickPx > bar.bodyPx,
      `bar ${index}: the range (${bar.wickPx} px) must be taller than the body (${bar.bodyPx} px)`,
    );
  }
});

test("⛔ ABLATION (DoD-4): remove the HIGH producer and the body and the wick VANISH — no bar survives", async () => {
  const before = await measureCandles(ohlcRows());
  const after = await measureCandles(ohlcRows({ withoutHigh: true }));

  assert.ok(before.bars.length > 0, "sanity: there was something to ablate");
  assert.equal(after.bars.length, 0, "every bar must be gone — a bar that survives was drawing something else");
  assert.equal(after.ohlcItems, 0, "and no item handed to the canvas may still carry OHLC");
  assert.equal(after.drawnCandles, 0, "the count the screen prints has to fall with the drawing, not after it");
  // ⛔ AND IT IS A LACUNA, NOT A FLAT BAR. The slots do not disappear — the grid still has one
  // per minute — they become bare `{time}` whitespace, which draws NOTHING. A zero-height candle
  // would be `ohlcItems` unchanged with `bodyPx === 0`, i.e. absence wearing the face of a market
  // that did not move (`RN-1`).
  assert.equal(after.gapItems, before.ohlcItems + before.gapItems, "every slot of the window must be a gap now");
});

test("MORDE (negative control): the RETIRED degenerate assembly gives 0 px of body and 0 px of wick", async () => {
  // This is what `rawCandlesFromHistoryRows` produced until this commit — `{open: close, high:
  // close, low: close, close}` — expressed here as the four series all answering the SAME
  // reading. It exists so the assertions above cannot be called vacuous: the instrument measures
  // a REAL difference between the old drawing and the new one, on the same fixture and the same
  // pane.
  const degenerate = await measureCandles({
    open: rowsFor((bar) => bar.close),
    high: rowsFor((bar) => bar.close),
    low: rowsFor((bar) => bar.close),
    close: rowsFor((bar) => bar.close),
  });
  assert.equal(degenerate.ohlcItems, BARS.length, "sanity: the degenerate DID draw a bar — that is why it was misleading");
  for (const bar of degenerate.bars) {
    assert.equal(bar.bodyPx, 0, "the degenerate has no body by construction");
    assert.equal(bar.wickPx, 0, "and no wick — a flat mark indistinguishable from a market that did not move");
  }
});

test("⛔ RN-2: the degenerate mapping is GONE from frontend/src, not parked behind a flag", () => {
  // `SPEC-008` §3.5 / plano `01` DoD 7, literal: `grep -n "high: close\|low: close" frontend/src`
  // → 0 lines. Run here rather than left to a human because "sem bandeira, sem convivência" is a
  // property of the TREE, and a property of the tree that nothing executes is a promise.
  const frontendSrc = path.join(HERE, "..", "..");
  // `spawnSync`, not `execFileSync`: `grep` exits `1` when it finds nothing, which is the
  // PASSING case here, and `execFileSync` would turn the pass into a thrown error.
  const scan = spawnSync(
    "grep",
    ["-rn", "-e", "high: close", "-e", "low: close", "--include=*.ts", "--include=*.tsx", frontendSrc],
    { encoding: "utf8" },
  );
  assert.ok(scan.error === undefined, `grep did not run: ${String(scan.error)}`);
  assert.ok(scan.status === 0 || scan.status === 1, `grep failed with status ${String(scan.status)}: ${scan.stderr}`);
  // ⚠️ THE UNIVERSE IS PRODUCTION SOURCE, AND THE TWO SUBTRACTIONS ARE DECLARED, NOT SILENT —
  // a falsifier that is born FIRING measures nothing (`ADR-012`'s ambiguous `rc=0`, and
  // `CLAUDE.md`'s own note on the language falsifier):
  //
  //   (1) COMMENT LINES. This very file spells the forbidden pattern in prose (the `grep`
  //       arguments above, the negative control's docstring). A test that reproved itself for
  //       DOCUMENTING what it forbids is a test the next person deletes;
  //   (2) `*.test.ts`. ONE occurrence lives there and it was MEASURED, not waved away:
  //       `frontend/src/charts/canonical-grid.test.ts:51`, a fixture builder for the GRID tests
  //       (`{open: close, high: close, low: close, close, volume: 1}`) whose job is to place a
  //       bar on a slot, not to render an absence. `RN-2` is about the production MAPPING that
  //       reaches the screen — two live assemblies feeding one drawing — and a fixture in
  //       another component's test suite is neither. It is named here so the exception is
  //       readable instead of inferred from a filter.
  const found = scan.stdout
    .split("\n")
    .filter((line) => line.trim() !== "")
    .filter((line) => !/\.test\.tsx?:/.test(line))
    .filter((line) => !/:\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");
  assert.equal(found, "", `the degenerate candle is back:\n${found}`);
});

// ── 2. ABSENCE, PARTIAL BUCKETS, AND THE RULES THAT MAKE THEM DISTINGUISHABLE ────────────────

test("RN-1: a bucket missing ONE of the four readings draws NOTHING and is COUNTED as partial", async () => {
  const bucketWithoutHigh = BARS[1]!.openTimeMs;
  const rows = ohlcRows({ absentHighAt: [bucketWithoutHigh] });
  const assembly = assembleOhlcCandles(rows);

  assert.equal(assembly.candles.length, BARS.length - 1, "three readings plus a guess is not a candle");
  assert.equal(assembly.partialBuckets, 1, "and the hole is COUNTED — a silent gap is indistinguishable from no data at all");
  assert.ok(
    !assembly.candles.some((candle) => candle.openTimeMs === bucketWithoutHigh),
    "the incomplete bucket must not appear among the candles under any reading",
  );

  const measurement = await measureCandles(rows);
  assert.equal(measurement.ohlcItems, BARS.length - 1, "the canvas gets one bar fewer");
  for (const bar of measurement.bars) {
    assert.ok(bar.wickPx > 0, "and none of the survivors degenerates into a flat mark");
  }
});

test("a bucket that answered NONE of the four is absence, and absence is never a partial bucket", () => {
  const allFourAbsentAt = BARS[0]!.openTimeMs;
  const absentAt = [allFourAbsentAt];
  const assembly = assembleOhlcCandles({
    open: rowsFor((bar) => bar.open, { absentAt }),
    high: rowsFor((bar) => bar.high, { absentAt }),
    low: rowsFor((bar) => bar.low, { absentAt }),
    close: rowsFor((bar) => bar.close, { absentAt }),
  });
  assert.equal(assembly.candles.length, BARS.length - 1);
  assert.equal(
    assembly.partialBuckets,
    0,
    "nothing was read for that bucket, so it is a plain gap — calling it 'partial' would claim a reading arrived",
  );
});

test("the four readings are transcribed as published — no repair, no reorder, no clamp", () => {
  // A producer transposition (`HIGH` below `LOW`) must reach the screen AS IT IS. Sorting the
  // four numbers here would draw a plausible candle over a broken series — hiding exactly the
  // defect `T-01.7`'s comparison against the origin's own kline exists to find.
  const inverted = assembleOhlcCandles({
    open: rowsFor((bar) => bar.open),
    high: rowsFor((bar) => bar.low),
    low: rowsFor((bar) => bar.high),
    close: rowsFor((bar) => bar.close),
  });
  assert.equal(inverted.candles[0]!.high, BARS[0]!.low, "high is whatever the HIGH series published");
  assert.equal(inverted.candles[0]!.low, BARS[0]!.high, "and low whatever the LOW series published");
});

test("the `volume` filler never reaches the canvas — the items carry OHLC and nothing else", async () => {
  const assembly = assembleOhlcCandles(ohlcRows());
  const panels = buildS2Panels({
    window: FIXTURE_WINDOW,
    candles: assembly.candles,
    priceUse: S2_PRICE_USE,
    oiPoints: [],
    oiMissingDays: [],
    cvdDeltas: [],
    cvdMissingDays: [],
    cvdCoveredDays: [],
  });
  for (const item of candlestickSeriesLossless(panels.price.series.slots)) {
    assert.ok(!("volume" in item), `an item carried a volume: ${JSON.stringify(item)} — volume is a SERIES of its own`);
  }
});

test("a malformed value and a duplicated reading are LOUD, never swallowed as absence", () => {
  const bucket = BARS[0]!.openTimeMs;
  const malformed: readonly SeriesHistoryRow[] = [
    { event_time: bucket, available_at: bucket, value: "not-a-number", absence: null },
  ];
  assert.throws(
    () => assembleOhlcCandles({ ...ohlcRows(), high: malformed }),
    InvalidSeriesValueError,
    "a broken producer must not hide behind the same gap a real absence draws",
  );
  const duplicated: readonly SeriesHistoryRow[] = [
    { event_time: bucket, available_at: bucket, value: "110", absence: null },
    { event_time: bucket, available_at: bucket, value: "999", absence: null },
  ];
  assert.throws(
    () => assembleOhlcCandles({ ...ohlcRows(), high: duplicated }),
    DuplicateSeriesRowError,
    "two readings for one instant would make the candle's HIGH a function of wire order",
  );
});

// ── 3. THE SELECTOR — WHICH FOUR ROWS OF THE SERVED CATALOG THE PANEL READS ───────────────────

/** The catalog rows `GET /api/v1/series-catalog` serves for BTCUSDT that a price selector could
 * plausibly match — the four `klines_ohlc` (`T-01.6`, measured at that task's gate: `n_entries`
 * 60 → 76, `klines_ohlc` = 16 over 4 instruments) plus the two single-price rows that already
 * existed. Transcribed from the served wire, not invented: the point of the test is that the
 * selector separates rows that REALLY sit side by side. */
function catalogKeys(): readonly SeriesKey[] {
  const base = {
    provider: "binance",
    venue: "usdm_futures",
    instrumentId: "BTCUSDT",
    cohort: "all",
    interval: "1m",
    unit: "USDT",
    denom: "quote",
    nature: "STOCK",
    tsConvention: "OHLC_OVER_BUCKET",
    quantityField: "NA",
    labelShift: 0,
    aggregationScope: "Symbol",
    verifiedBy: "test_klines_ohlc_catalog.py",
  } as const;
  return [
    ...KLINES_OHLC_REDUCTIONS.map((reduction) => ({ ...base, metric: "klines_ohlc", reduction }) as SeriesKey),
    { ...base, metric: "klines_last", reduction: "LAST", tsConvention: "POINT_AT_BUCKET_END" } as SeriesKey,
    { ...base, metric: "price_mark_close", reduction: "CLOSE", tsConvention: "POINT_AT_BUCKET_END" } as SeriesKey,
  ];
}

test("each of the four reductions matches EXACTLY ONE row of the served catalog", () => {
  const keys = catalogKeys();
  for (const reduction of KLINES_OHLC_REDUCTIONS) {
    const matches = keys.filter((key) => matchesKlinesOhlc(key, reduction));
    assert.equal(matches.length, 1, `reduction ${reduction} matched ${matches.length} rows — the route refuses to choose`);
    assert.equal(matches[0]!.reduction, reduction);
  }
});

test("MORDE: a selector by `metric` alone matches FOUR rows — which is why `reduction` has no default", () => {
  const byMetricAlone = catalogKeys().filter((key) => key.metric === "klines_ohlc");
  assert.equal(byMetricAlone.length, 4, "asking for 'the candle' by metric is a question with four answers");
  // And `price_mark_close` carries `reduction: "CLOSE"` too: a selector by `reduction` alone
  // would pick the MARK price for the candle's close — the subsampled series `PRD-008`/`I-3`
  // forbids precisely because what it loses first is the extremes.
  const byReductionAlone = catalogKeys().filter((key) => key.reduction === "CLOSE");
  assert.equal(byReductionAlone.length, 2, "reduction alone also matches price_mark_close");
  assert.equal(catalogKeys().filter((key) => matchesKlinesOhlc(key, "CLOSE")).length, 1, "the three-term selector separates them");
});
