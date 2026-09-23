// `T-05.2` — `panel-assembly.ts` is the second, independent call site into
// `view-model.ts`/`charts`'s pure primitives (`page.tsx` is the first). This suite proves it
// reproduces the SAME shapes `view-model.test.ts` already proves for the SSR path, end to end,
// over a tiny hand-built window — never through a DOM, never through `page.tsx` itself.
//
// Run with: npm --prefix frontend run test:app

import assert from "node:assert/strict";
import { test } from "node:test";

import { S2_PRICE_USE } from "../../charts/index.ts";
import { assembleHistoryPage, type AssemblyWindow, type HistoryRowsBundle } from "./panel-assembly.ts";
import type { SeriesHistoryRow } from "./series-history-envelope.ts";

const ONE_MINUTE_MS = 60_000;
const WINDOW: AssemblyWindow = { startMs: 0, endMsExclusive: 3 * ONE_MINUTE_MS }; // 3 slots: 0, 60_000, 120_000

function ohlcRow(eventTimeMs: number, value: string | null): SeriesHistoryRow {
  return value === null
    ? { event_time: eventTimeMs, available_at: null, value: null, absence: "SEM_PONTO", coverage: null }
    : { event_time: eventTimeMs, available_at: eventTimeMs + 1_000, value, absence: null, coverage: null };
}

function scalarRow(eventTimeMs: number, value: string | null): SeriesHistoryRow {
  return ohlcRow(eventTimeMs, value);
}

function emptyBundle(): HistoryRowsBundle {
  return {
    open: [],
    high: [],
    low: [],
    close: [],
    oi: [],
    cvd: [],
    volume: [],
    liquidationLong: [],
    liquidationShort: [],
    longShort: [],
  };
}

test("CALA: a fully-present window draws every candle and every dynamic count agrees with the fixture", () => {
  const rows: HistoryRowsBundle = {
    ...emptyBundle(),
    open: [ohlcRow(0, "100"), ohlcRow(ONE_MINUTE_MS, "101"), ohlcRow(2 * ONE_MINUTE_MS, "102")],
    high: [ohlcRow(0, "105"), ohlcRow(ONE_MINUTE_MS, "106"), ohlcRow(2 * ONE_MINUTE_MS, "107")],
    low: [ohlcRow(0, "95"), ohlcRow(ONE_MINUTE_MS, "96"), ohlcRow(2 * ONE_MINUTE_MS, "97")],
    close: [ohlcRow(0, "104"), ohlcRow(ONE_MINUTE_MS, "105"), ohlcRow(2 * ONE_MINUTE_MS, "106")],
  };
  const result = assembleHistoryPage(rows, WINDOW, {
    priceUse: S2_PRICE_USE,
    cvdAnchorMs: WINDOW.startMs,
    windowEndMsInclusive: WINDOW.endMsExclusive - ONE_MINUTE_MS,
    longShortRecentSpanMs: 3 * ONE_MINUTE_MS,
    oiMaxStalenessMs: null,
  });
  assert.equal(result.priceCandles.drawnCandles, 3);
  assert.equal(result.priceCandles.gridSlots, 3);
  assert.equal(result.priceCandles.partialBuckets, 0);
});

test("MORDE CA-F2-3: a SEM_PONTO row in ONE of the four OHLC reductions draws NO candle for that bucket, counted as partial", () => {
  const rows: HistoryRowsBundle = {
    ...emptyBundle(),
    open: [ohlcRow(0, "100")],
    high: [ohlcRow(0, "105")],
    low: [ohlcRow(0, "95")],
    close: [ohlcRow(0, null)], // the fourth reading is absent
  };
  const result = assembleHistoryPage(rows, WINDOW, {
    priceUse: S2_PRICE_USE,
    cvdAnchorMs: WINDOW.startMs,
    windowEndMsInclusive: WINDOW.endMsExclusive - ONE_MINUTE_MS,
    longShortRecentSpanMs: 3 * ONE_MINUTE_MS,
    oiMaxStalenessMs: null,
  });
  assert.equal(result.priceCandles.drawnCandles, 0, "three of four readings is NOT a candle, RN-1");
  assert.equal(result.priceCandles.partialBuckets, 1, "the hole must be COUNTED, not silently absorbed into the gap count");
});

test("CALA: OI freshness reads the CALLER'S oiMaxStalenessMs, never a literal baked into this module", () => {
  const rows: HistoryRowsBundle = {
    ...emptyBundle(),
    oi: [scalarRow(0, "1234.5")],
  };
  const windowEndMsInclusive = WINDOW.endMsExclusive - ONE_MINUTE_MS;
  const fresh = assembleHistoryPage(rows, WINDOW, {
    priceUse: S2_PRICE_USE,
    cvdAnchorMs: WINDOW.startMs,
    windowEndMsInclusive,
    longShortRecentSpanMs: 3 * ONE_MINUTE_MS,
    oiMaxStalenessMs: 10 * ONE_MINUTE_MS, // generous ceiling — the one observation is "fresh"
  });
  assert.equal(fresh.oi.freshness.kind, "fresh");

  const stale = assembleHistoryPage(rows, WINDOW, {
    priceUse: S2_PRICE_USE,
    cvdAnchorMs: WINDOW.startMs,
    windowEndMsInclusive,
    longShortRecentSpanMs: 3 * ONE_MINUTE_MS,
    oiMaxStalenessMs: 1, // one millisecond ceiling — the SAME observation is now "old"
  });
  assert.notEqual(stale.oi.freshness.kind, "fresh", "the SAME rows read as stale under a tighter ceiling — proves the ceiling is read, not ignored");
});

test("CALA: cvdAnchorMs stays fixed across a call — the cumulative curve counts from the SAME instant every page", () => {
  const rows: HistoryRowsBundle = {
    ...emptyBundle(),
    cvd: [scalarRow(0, "10"), scalarRow(ONE_MINUTE_MS, "-3")],
  };
  const result = assembleHistoryPage(rows, WINDOW, {
    priceUse: S2_PRICE_USE,
    cvdAnchorMs: 0, // anchored at the window's own start
    windowEndMsInclusive: WINDOW.endMsExclusive - ONE_MINUTE_MS,
    longShortRecentSpanMs: 3 * ONE_MINUTE_MS,
    oiMaxStalenessMs: null,
  });
  const cumulativeAtAnchor = result.panels.cvd.cumulativeSlots.find((slot) => slot.time === 0);
  assert.equal(cumulativeAtAnchor?.value, 10, "the cumulative value AT the anchor instant is exactly that bucket's own delta");
  assert.equal(result.cvd.presentPoints, 2);
});

test("CALA: long/short observedAtMs/ageMs are derived off the newest READABLE row, relative to windowEndMsInclusive", () => {
  const observedAtMs = ONE_MINUTE_MS + 500;
  const rows: HistoryRowsBundle = {
    ...emptyBundle(),
    longShort: [{ event_time: ONE_MINUTE_MS, available_at: observedAtMs, value: "1.05", absence: null, coverage: null }],
  };
  const windowEndMsInclusive = WINDOW.endMsExclusive - ONE_MINUTE_MS;
  const result = assembleHistoryPage(rows, WINDOW, {
    priceUse: S2_PRICE_USE,
    cvdAnchorMs: WINDOW.startMs,
    windowEndMsInclusive,
    longShortRecentSpanMs: 3 * ONE_MINUTE_MS,
    oiMaxStalenessMs: null,
  });
  assert.equal(result.longShort.observedAtMs, observedAtMs);
  assert.equal(result.longShort.ageMs, windowEndMsInclusive - observedAtMs);
});

test("MORDE: an upstream-failed series (empty rows) still comes back GRID-PADDED to the window, matching its siblings (CA-5a)", () => {
  const rows: HistoryRowsBundle = { ...emptyBundle() }; // every series absent — simulates every fetch failing
  const result = assembleHistoryPage(rows, WINDOW, {
    priceUse: S2_PRICE_USE,
    cvdAnchorMs: WINDOW.startMs,
    windowEndMsInclusive: WINDOW.endMsExclusive - ONE_MINUTE_MS,
    longShortRecentSpanMs: 3 * ONE_MINUTE_MS,
    oiMaxStalenessMs: null,
  });
  assert.equal(result.liquidationLong.slots.length, 3, "liquidation is grid-padded via the `window` argument");
  assert.equal(result.liquidationLong.presentPoints, 0);
  assert.equal(result.longShort.slots.length, 3, "long/short is grid-padded the same way");
  assert.equal(result.panels.oi.slots.length, 3, "OI/CVD/price stay grid-padded through buildS2Panels regardless");
});
