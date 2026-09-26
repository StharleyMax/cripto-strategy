// `T-05.2` — `panel-assembly.ts` is the second, independent call site into
// `view-model.ts`/`charts`'s pure primitives (`page.tsx` is the first). This suite proves it
// reproduces the SAME shapes `view-model.test.ts` already proves for the SSR path, end to end,
// over a tiny hand-built window — never through a DOM, never through `page.tsx` itself.
//
// Run with: npm --prefix frontend run test:app

import assert from "node:assert/strict";
import { test } from "node:test";

import { S2_PRICE_USE, resolveLegendReading } from "../../charts/index.ts";
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

// ── `W1-REVIEW-r2` BLOCKER-2 / `W1-QA-r2` BLOCKER-1 / `W1-DESIGN-REVIEW-r2` MF-B′ ────────────────
// On a TF ≠ `1m` the wire answers ONE volume row per TF bucket. The legend resolves `param.logical`
// over the CANONICAL 1-minute grid (`ADR-044/D2`), so it must read `legendSlots` (gridded), never
// the native `slots` (one per row). Before the fix, the legend of a `4h` window read `ausente` in
// every crosshair position and at rest, with the bar drawn and the value served.
const FOUR_HOURS_MS = 4 * 60 * ONE_MINUTE_MS;
const FOUR_HOUR_WINDOW: AssemblyWindow = { startMs: 0, endMsExclusive: 2 * FOUR_HOURS_MS }; // 480 grid minutes

function assembleFourHourVolume() {
  const rows: HistoryRowsBundle = {
    ...emptyBundle(),
    // The values the QA read off the live API for two `4h` bars (`W1-QA-r2` §3).
    volume: [scalarRow(0, "34200.456"), scalarRow(FOUR_HOURS_MS, "14515.595")],
  };
  return assembleHistoryPage(rows, FOUR_HOUR_WINDOW, {
    priceUse: S2_PRICE_USE,
    cvdAnchorMs: FOUR_HOUR_WINDOW.startMs,
    windowEndMsInclusive: FOUR_HOUR_WINDOW.endMsExclusive - ONE_MINUTE_MS,
    longShortRecentSpanMs: 3 * ONE_MINUTE_MS,
    oiMaxStalenessMs: null,
  }).volume;
}

function readVolumeLegend(slots: ReturnType<typeof assembleFourHourVolume>["legendSlots"], logical: number | undefined) {
  return resolveLegendReading({
    logical,
    slots,
    nature: "FLOW",
    axisStepMs: ONE_MINUTE_MS,
    nativeTimeframeMs: ONE_MINUTE_MS,
    asOfMs: FOUR_HOUR_WINDOW.endMsExclusive,
    bucketMs: FOUR_HOURS_MS,
  });
}

test("CALA: on 4h the volume BARS keep one slot per wire row — pixels, presentPoints and firstPresentMs do not move", () => {
  const volume = assembleFourHourVolume();
  assert.equal(volume.slots.length, 2, "the drawn vector is the native one, one slot per 4h bar");
  assert.equal(volume.presentPoints, 2);
  assert.equal(volume.firstPresentMs, 0);
});

test("MORDE MF-B′: on 4h the volume legend reads the served bar at rest and under the crosshair, never ausente", () => {
  const volume = assembleFourHourVolume();
  assert.equal(volume.legendSlots.length, 480, "the legend vector is the window's canonical 1-minute grid");
  const atRest = readVolumeLegend(volume.legendSlots, undefined);
  assert.equal(atRest.kind, "value", "at rest the legend reads the last CLOSED 4h bar");
  assert.equal(atRest.kind === "value" ? atRest.value : null, 14515.595);
  // Every logical index inside a drawn bar reads that bar's served sum.
  for (const [logical, expected] of [
    [0, 34200.456],
    [10, 34200.456],
    [239, 34200.456],
    [240, 14515.595],
    [300, 14515.595],
    [479, 14515.595],
  ] as const) {
    const reading = readVolumeLegend(volume.legendSlots, logical);
    assert.equal(reading.kind, "value", `logical ${logical} lies inside a served bar and must not read ausente`);
    assert.equal(reading.kind === "value" ? reading.value : null, expected, `logical ${logical}`);
  }
});

test("MORDE (control): the NATIVE vector read by param.logical is the defect — ausente under the crosshair on 4h", () => {
  const volume = assembleFourHourVolume();
  assert.equal(readVolumeLegend(volume.slots, 300).kind, "absent");
});
