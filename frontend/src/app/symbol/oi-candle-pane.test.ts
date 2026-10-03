// `T-03.11` (`paineis-de-fluxo`, plan `03` item `3b.4`, `RF-8`, `RF-9`, `RN-6`) — the browser half
// of the OI candle: the served `oi_candles` placed on the canonical grid, merged/trimmed like the
// rows, and the `DERIVADO` label read off the source a candle's `derived_from` names.
//
// Every "MORDE" case below names the mutation of `oi-candle-pane.ts` it rejects; each one was run
// against the module and turned this file red (see `gates/T-03.11-builder.md` §mutations).
//
// Run with: npm --prefix frontend run test:app

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EMPTY_OI_CANDLE_BUNDLE,
  mergeOlderOiCandles,
  nativeGridTerm,
  oiCandleAt,
  oiCandleBundleOf,
  OiCandleBundleError,
  oiCandleFieldSlots,
  oiCandlePaneData,
  oiCandleProvenanceLabel,
  oiCandleRegimeStepAt,
  trimOiCandlesToWindow,
  type OiCandleBundle,
} from "./oi-candle-pane.ts";
import type { OiCandleSource, OiCandleSourceWire, OiCandleWire } from "./series-history-envelope.ts";

const MINUTE = 60_000;
const FIVE = 5 * MINUTE;
const T0 = 1_780_000_200_000; // a multiple of five minutes

const POINT_5M: OiCandleSourceWire = {
  derived_from: "binance_point_5m",
  series_key_id: "hist-id",
  native_grid_ms: FIVE,
  bucket_interval_ms: FIVE,
};
const POLL_1M: OiCandleSourceWire = {
  derived_from: "binance_poll_1m",
  series_key_id: "poll-id",
  native_grid_ms: MINUTE,
  bucket_interval_ms: MINUTE,
};

function candle(
  bucketEndMs: number,
  prices: { open: number; high: number; low: number; close: number },
  derivedFrom: OiCandleSource = "binance_point_5m",
  closed = true,
): OiCandleWire {
  const width = derivedFrom === "binance_point_5m" ? FIVE : MINUTE;
  return {
    bucket_end_ms: bucketEndMs,
    ...prices,
    open_at_ms: bucketEndMs - width,
    close_at_ms: bucketEndMs,
    samples: { present: 2, expected: 2 },
    closed,
    derived_from: derivedFrom,
  };
}

// Deliberately NOT continuous: `open` of the second candle differs from `close` of the first, so a
// module that rebuilt `open` from the previous close (derivation in the browser) would be caught.
const UP = candle(T0 + FIVE, { open: 100, high: 130, low: 90, close: 120 });
const DOWN = candle(T0 + 2 * FIVE, { open: 125, high: 126, low: 80, close: 85 });
const BUNDLE: OiCandleBundle = { sources: [POINT_5M], candles: [UP, DOWN] };
const WINDOW = { startMs: T0, endMsExclusive: T0 + 3 * FIVE };

// ── oiCandlePaneData: the candle lands at bucket_end_ms, nothing else is invented ───────────

test("oiCandlePaneData puts each served candle on the slot of its bucket_end_ms, and nothing on the others", () => {
  const data = oiCandlePaneData(BUNDLE, WINDOW, MINUTE);
  assert.equal(data.slots.length, 15, "one slot per minute of the 15-minute window");
  const drawn = data.slots.filter((slot) => slot.candle !== null);
  assert.deepEqual(
    drawn.map((slot) => slot.time),
    [UP.bucket_end_ms, DOWN.bucket_end_ms],
    "MORDE: placing the candle at open_at_ms (bucket start) moves it one bucket left",
  );
  assert.equal(data.drawnCandles, 2);
  assert.equal(data.slots[0]!.candle, null);
  assert.equal(oiCandlePaneData(EMPTY_OI_CANDLE_BUNDLE, WINDOW, MINUTE).drawnCandles, 0);
});

test("the four prices drawn are the SERVED ones — never re-derived in the browser (ADR-040/D1)", () => {
  const data = oiCandlePaneData(BUNDLE, WINDOW, MINUTE);
  const second = data.slots.find((slot) => slot.time === DOWN.bucket_end_ms)!.candle!;
  assert.deepEqual(
    { open: second.open, high: second.high, low: second.low, close: second.close },
    { open: 125, high: 126, low: 80, close: 85 },
    "MORDE: open rebuilt from the previous candle's close (120) instead of the served 125",
  );
  assert.equal(second.openTimeMs, DOWN.bucket_end_ms, "the slot key and the candle's time are the same instant");
});

test("a candle outside the window is left out; one inside it but off the minute grid THROWS", () => {
  const outside: OiCandleBundle = { sources: [POINT_5M], candles: [candle(T0 - FIVE, { open: 1, high: 2, low: 1, close: 2 }), UP] };
  assert.equal(oiCandlePaneData(outside, WINDOW, MINUTE).drawnCandles, 1);
  const offGrid: OiCandleBundle = { sources: [POINT_5M], candles: [candle(T0 + FIVE + 30_000, { open: 1, high: 2, low: 1, close: 2 })] };
  assert.throws(() => oiCandlePaneData(offGrid, WINDOW, MINUTE), RangeError, "an off-grid candle is never snapped to a neighbour");
});

test("oiCandleRegimeStepAt: the width of the regime of the candle a slot would be held from", () => {
  const capture = T0 + 2 * FIVE;
  const mixed: OiCandleBundle = {
    sources: [POINT_5M, POLL_1M],
    candles: [
      candle(T0 + FIVE, { open: 1, high: 2, low: 1, close: 2 }),
      candle(capture, { open: 1, high: 2, low: 1, close: 2 }, "binance_poll_1m"),
      candle(capture + MINUTE, { open: 1, high: 2, low: 1, close: 2 }, "binance_poll_1m"),
    ],
  };
  const data = oiCandlePaneData(mixed, WINDOW, MINUTE);
  assert.equal(oiCandleRegimeStepAt(data, T0), null, "no candle at or before the slot");
  assert.equal(oiCandleRegimeStepAt(data, T0 + FIVE), FIVE);
  assert.equal(oiCandleRegimeStepAt(data, T0 + FIVE + 4 * MINUTE), FIVE, "held inside the 5m regime");
  assert.equal(
    oiCandleRegimeStepAt(data, capture + MINUTE),
    MINUTE,
    "MORDE: one pane-wide width (the widest loaded, 5m) makes a 1m candle's legend read up to 4 minutes back",
  );
  assert.equal(oiCandleRegimeStepAt(data, capture + 3 * MINUTE), MINUTE);
  assert.throws(
    () => oiCandleRegimeStepAt({ candles: data.candles, sources: [POINT_5M] }, capture),
    OiCandleBundleError,
    "an undeclared derived_from has no width to read at",
  );
});

test("oiCandleFieldSlots reads ONE field per slot, null where no candle is", () => {
  const data = oiCandlePaneData(BUNDLE, WINDOW, MINUTE);
  const highs = oiCandleFieldSlots(data.slots, "high").filter((slot) => slot.value !== null);
  assert.deepEqual(highs, [
    { time: UP.bucket_end_ms, value: 130 },
    { time: DOWN.bucket_end_ms, value: 126 },
  ]);
  assert.equal(oiCandleFieldSlots(data.slots, "low").filter((slot) => slot.value === null).length, 13);
});

test("oiCandleAt finds the candle by bucket_end_ms, and null between candles", () => {
  assert.equal(oiCandleAt(BUNDLE.candles, DOWN.bucket_end_ms), DOWN);
  assert.equal(oiCandleAt(BUNDLE.candles, UP.bucket_end_ms), UP);
  assert.equal(oiCandleAt(BUNDLE.candles, UP.bucket_end_ms + MINUTE), null);
  assert.equal(oiCandleAt([], T0), null);
});

// ── the pager contract (mergeOlderPage by bucket_end_ms) ────────────────────────────────────

test("oiCandleBundleOf: a response without an oi_candles block is the empty bundle", () => {
  assert.equal(oiCandleBundleOf(null), EMPTY_OI_CANDLE_BUNDLE);
  assert.deepEqual(oiCandleBundleOf({ timeframe_ms: MINUTE, sources: [POINT_5M], candles: [UP] }), {
    sources: [POINT_5M],
    candles: [UP],
  });
});

test("mergeOlderOiCandles prepends an older page, and REFUSES one that overlaps what is loaded", () => {
  const older: OiCandleBundle = { sources: [POINT_5M], candles: [UP] };
  const existing: OiCandleBundle = { sources: [POINT_5M], candles: [DOWN] };
  assert.deepEqual(mergeOlderOiCandles(older, existing).candles, [UP, DOWN]);
  assert.throws(() => mergeOlderOiCandles(existing, older), OiCandleBundleError);
  assert.throws(() => mergeOlderOiCandles(existing, existing), OiCandleBundleError, "equal bucket ends overlap too");
  assert.deepEqual(mergeOlderOiCandles(EMPTY_OI_CANDLE_BUNDLE, existing).candles, [DOWN]);
});

test("two pages that declare the same derived_from on different grids are refused, never merged", () => {
  const older: OiCandleBundle = { sources: [{ ...POINT_5M, native_grid_ms: MINUTE }], candles: [UP] };
  const existing: OiCandleBundle = { sources: [POINT_5M], candles: [DOWN] };
  assert.throws(() => mergeOlderOiCandles(older, existing), OiCandleBundleError);
  // `W6-QA-FRONT-r2` (mutant U15 survived): the same series on the same native grid, but a page
  // cut at another bucket width — the width is the candle's interval, so the pages disagree.
  const otherWidth: OiCandleBundle = { sources: [{ ...POINT_5M, bucket_interval_ms: 3 * FIVE }], candles: [UP] };
  assert.throws(() => mergeOlderOiCandles(otherWidth, existing), OiCandleBundleError, "another bucket_interval_ms");
  const both = mergeOlderOiCandles({ sources: [POLL_1M], candles: [] }, existing);
  assert.deepEqual(
    [...both.sources].map((source) => source.derived_from).sort(),
    ["binance_point_5m", "binance_poll_1m"],
    "the union of the declarations of both pages",
  );
});

test("trimOiCandlesToWindow keeps [startMs, endMsExclusive) by bucket_end_ms — the rows' rule", () => {
  const trimmed = trimOiCandlesToWindow(BUNDLE, { startMs: T0, endMsExclusive: DOWN.bucket_end_ms });
  assert.deepEqual(trimmed.candles, [UP], "the exclusive end drops the candle that ends ON it");
  assert.equal(trimOiCandlesToWindow(BUNDLE, WINDOW), BUNDLE, "nothing trimmed ⇒ the same object");
});

test("trimOiCandlesToWindow keeps the candle that ends ON startMs and drops the one that ends ON endMsExclusive", () => {
  // Both edges at once, on candle instants: the start is inclusive, the end is exclusive. A `>`
  // at the start (W6-QA-FRONT mutant U2) silently drops UP here.
  const trimmed = trimOiCandlesToWindow(BUNDLE, { startMs: UP.bucket_end_ms, endMsExclusive: DOWN.bucket_end_ms });
  assert.deepEqual(trimmed.candles, [UP], "the inclusive start keeps the candle that ends ON it");
  const pastStart = trimOiCandlesToWindow(BUNDLE, { startMs: UP.bucket_end_ms + 1, endMsExclusive: WINDOW.endMsExclusive });
  assert.deepEqual(pastStart.candles, [DOWN], "one millisecond past the start drops it");
});

// ── RN-6: the DERIVADO label is derived from derived_from + the source's native grid ────────

test("the label names the native grid of the source the candle's derived_from declares", () => {
  assert.equal(oiCandleProvenanceLabel("binance_point_5m", [POINT_5M, POLL_1M]), "DERIVADO (OHLC de amostras 5m · ADR-045)");
  assert.equal(oiCandleProvenanceLabel("binance_poll_1m", [POINT_5M, POLL_1M]), "DERIVADO (OHLC de amostras 1m · ADR-045)");
});

test("MORDE: a label keyed by the enum (hand-written per derived_from) is caught — the grid moves the label", () => {
  // Same `derived_from`, a different declared grid: a label written by hand per enum value would
  // still say `1m`; the derived one must follow the declaration (`RF-5`).
  const moved: OiCandleSourceWire = { ...POLL_1M, native_grid_ms: 2 * MINUTE };
  assert.equal(oiCandleProvenanceLabel("binance_poll_1m", [moved]), "DERIVADO (OHLC de amostras 2m · ADR-045)");
  assert.doesNotMatch(oiCandleProvenanceLabel("binance_point_5m", [POINT_5M]), /OBSERVADO/, "high/low of samples are a lower bound");
});

test("a derived_from that no source declares THROWS instead of printing a guess", () => {
  assert.throws(() => oiCandleProvenanceLabel("binance_poll_1m", [POINT_5M]), OiCandleBundleError);
});

test("nativeGridTerm: whole minutes and hours only — a label never rounds", () => {
  assert.equal(nativeGridTerm(MINUTE), "1m");
  assert.equal(nativeGridTerm(FIVE), "5m");
  assert.equal(nativeGridTerm(60 * MINUTE), "1h");
  assert.equal(nativeGridTerm(90 * MINUTE), "90m");
  for (const bad of [90_000, 0, -MINUTE, 1.5]) {
    assert.throws(() => nativeGridTerm(bad), RangeError, `${bad} ms`);
  }
});
