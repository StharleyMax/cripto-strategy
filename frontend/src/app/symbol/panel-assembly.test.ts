// `T-05.2` — `panel-assembly.ts` is the second, independent call site into
// `view-model.ts`/`charts`'s pure primitives (`page.tsx` is the first). This suite proves it
// reproduces the SAME shapes `view-model.test.ts` already proves for the SSR path, end to end,
// over a tiny hand-built window — never through a DOM, never through `page.tsx` itself.
//
// Run with: npm --prefix frontend run test:app

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { S2_PRICE_USE, resolveLegendReading } from "../../charts/index.ts";
import { recentBandSlotRange } from "./long-short-band.ts";
import { EMPTY_OI_CANDLE_BUNDLE } from "./oi-candle-pane.ts";
import type { PriceSlot } from "./chart/history/series-slots.ts";
import { INDICATOR_CATALOG } from "./indicators/catalog.ts";
import { assembleHistoryPage, type AssemblyWindow, type HistoryRowsBundle } from "./panel-assembly.ts";
import type { SeriesHistoryRow } from "./series-history-envelope.ts";
import { seriesValueStats } from "./view-model.ts";

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

/** `T-03.3` — the table the assembly reads its indicator rows through, as `SymbolClient.tsx` passes it. */
const TABLE = INDICATOR_CATALOG;

type Rows = readonly SeriesHistoryRow[];

/** `T-03.3` — SHAPE CHANGE (`estudo §6.2`): the bundle is keyed by slot — `price.<reduction>`, then
 * `indicators.<kind>.<slot>` — where it used to carry ten flat fields (`open`, …, `longShort`). */
function emptyBundle(): HistoryRowsBundle {
  return {
    price: { open: [], high: [], low: [], close: [] },
    indicators: {
      volume: { volume: [] },
      liquidation: { long: [], short: [] },
      oi: { oi: [] },
      long_short: { ratio: [] },
      cvd: { cvd: [] },
    },
    oiCandles: EMPTY_OI_CANDLE_BUNDLE,
  };
}

/** `emptyBundle` with some series replaced, by slot. */
function bundleWith(
  price: Partial<Record<PriceSlot, Rows>>,
  indicators: Readonly<Record<string, Readonly<Record<string, Rows>>>> = {},
): HistoryRowsBundle {
  const empty = emptyBundle();
  return {
    ...empty,
    price: { ...empty.price, ...price },
    indicators: Object.fromEntries(
      Object.entries(empty.indicators).map(([kind, bySlot]) => [kind, { ...bySlot, ...indicators[kind] }]),
    ),
  };
}

/** `T-05.4` — the two coverage terms of the static context: knowledge four minutes past the window
 * (`request-window.ts::KNOWLEDGE_TIME_LAG_MS`) and every regime-A series on the one-minute grid. */
const COVERAGE_CONTEXT = {
  knowledgeTimeMs: WINDOW.endMsExclusive + 4 * ONE_MINUTE_MS,
  coverageGridMs: { volume: ONE_MINUTE_MS, cvd: ONE_MINUTE_MS, liquidationLong: ONE_MINUTE_MS, liquidationShort: ONE_MINUTE_MS },
};

test("CALA: a fully-present window draws every candle and every dynamic count agrees with the fixture", () => {
  const rows: HistoryRowsBundle = bundleWith({
    open: [ohlcRow(0, "100"), ohlcRow(ONE_MINUTE_MS, "101"), ohlcRow(2 * ONE_MINUTE_MS, "102")],
    high: [ohlcRow(0, "105"), ohlcRow(ONE_MINUTE_MS, "106"), ohlcRow(2 * ONE_MINUTE_MS, "107")],
    low: [ohlcRow(0, "95"), ohlcRow(ONE_MINUTE_MS, "96"), ohlcRow(2 * ONE_MINUTE_MS, "97")],
    close: [ohlcRow(0, "104"), ohlcRow(ONE_MINUTE_MS, "105"), ohlcRow(2 * ONE_MINUTE_MS, "106")],
  });
  const result = assembleHistoryPage(TABLE, rows, WINDOW, {
    priceUse: S2_PRICE_USE,
    windowEndMsExclusive: WINDOW.endMsExclusive,
    ...COVERAGE_CONTEXT,
    cvdAnchorMs: WINDOW.startMs,
    windowEndMsInclusive: WINDOW.endMsExclusive - ONE_MINUTE_MS,
    longShortRecentSpanMs: 3 * ONE_MINUTE_MS,
    oiMaxStalenessMs: null,
  }, ONE_MINUTE_MS);
  assert.equal(result.priceCandles.drawnCandles, 3);
  assert.equal(result.priceCandles.gridSlots, 3);
  assert.equal(result.priceCandles.partialBuckets, 0);
});

test("MORDE CA-F2-3: a SEM_PONTO row in ONE of the four OHLC reductions draws NO candle for that bucket, counted as partial", () => {
  const rows: HistoryRowsBundle = bundleWith({
    open: [ohlcRow(0, "100")],
    high: [ohlcRow(0, "105")],
    low: [ohlcRow(0, "95")],
    close: [ohlcRow(0, null)], // the fourth reading is absent
  });
  const result = assembleHistoryPage(TABLE, rows, WINDOW, {
    priceUse: S2_PRICE_USE,
    windowEndMsExclusive: WINDOW.endMsExclusive,
    ...COVERAGE_CONTEXT,
    cvdAnchorMs: WINDOW.startMs,
    windowEndMsInclusive: WINDOW.endMsExclusive - ONE_MINUTE_MS,
    longShortRecentSpanMs: 3 * ONE_MINUTE_MS,
    oiMaxStalenessMs: null,
  }, ONE_MINUTE_MS);
  assert.equal(result.priceCandles.drawnCandles, 0, "three of four readings is NOT a candle, RN-1");
  assert.equal(result.priceCandles.partialBuckets, 1, "the hole must be COUNTED, not silently absorbed into the gap count");
});

test("CALA: OI freshness reads the CALLER'S oiMaxStalenessMs, never a literal baked into this module", () => {
  const rows: HistoryRowsBundle = bundleWith({}, { oi: { oi: [scalarRow(0, "1234.5")] } });
  const windowEndMsInclusive = WINDOW.endMsExclusive - ONE_MINUTE_MS;
  const fresh = assembleHistoryPage(TABLE, rows, WINDOW, {
    priceUse: S2_PRICE_USE,
    windowEndMsExclusive: WINDOW.endMsExclusive,
    ...COVERAGE_CONTEXT,
    cvdAnchorMs: WINDOW.startMs,
    windowEndMsInclusive,
    longShortRecentSpanMs: 3 * ONE_MINUTE_MS,
    oiMaxStalenessMs: 10 * ONE_MINUTE_MS, // generous ceiling — the one observation is "fresh"
  }, ONE_MINUTE_MS);
  assert.equal(fresh.oi.freshness.kind, "fresh");

  const stale = assembleHistoryPage(TABLE, rows, WINDOW, {
    priceUse: S2_PRICE_USE,
    windowEndMsExclusive: WINDOW.endMsExclusive,
    ...COVERAGE_CONTEXT,
    cvdAnchorMs: WINDOW.startMs,
    windowEndMsInclusive,
    longShortRecentSpanMs: 3 * ONE_MINUTE_MS,
    oiMaxStalenessMs: 1, // one millisecond ceiling — the SAME observation is now "old"
  }, ONE_MINUTE_MS);
  assert.notEqual(stale.oi.freshness.kind, "fresh", "the SAME rows read as stale under a tighter ceiling — proves the ceiling is read, not ignored");
});

test("CALA: cvdAnchorMs stays fixed across a call — the cumulative curve counts from the SAME instant every page", () => {
  const rows: HistoryRowsBundle = bundleWith({}, { cvd: { cvd: [scalarRow(0, "10"), scalarRow(ONE_MINUTE_MS, "-3")] } });
  const result = assembleHistoryPage(TABLE, rows, WINDOW, {
    priceUse: S2_PRICE_USE,
    windowEndMsExclusive: WINDOW.endMsExclusive,
    ...COVERAGE_CONTEXT,
    cvdAnchorMs: 0, // anchored at the window's own start
    windowEndMsInclusive: WINDOW.endMsExclusive - ONE_MINUTE_MS,
    longShortRecentSpanMs: 3 * ONE_MINUTE_MS,
    oiMaxStalenessMs: null,
  }, ONE_MINUTE_MS);
  const cumulativeAtAnchor = result.panels.cvd.cumulativeSlots.find((slot) => slot.time === 0);
  assert.equal(cumulativeAtAnchor?.value, 10, "the cumulative value AT the anchor instant is exactly that bucket's own delta");
  assert.equal(result.cvd.presentPoints, 2);
});

test("CALA: long/short observedAtMs/ageMs are derived off the newest READABLE row, relative to windowEndMsInclusive", () => {
  const observedAtMs = ONE_MINUTE_MS + 500;
  const rows: HistoryRowsBundle = bundleWith(
    {},
    { long_short: { ratio: [{ event_time: ONE_MINUTE_MS, available_at: observedAtMs, value: "1.05", absence: null, coverage: null }] } },
  );
  const windowEndMsInclusive = WINDOW.endMsExclusive - ONE_MINUTE_MS;
  const result = assembleHistoryPage(TABLE, rows, WINDOW, {
    priceUse: S2_PRICE_USE,
    windowEndMsExclusive: WINDOW.endMsExclusive,
    ...COVERAGE_CONTEXT,
    cvdAnchorMs: WINDOW.startMs,
    windowEndMsInclusive,
    longShortRecentSpanMs: 3 * ONE_MINUTE_MS,
    oiMaxStalenessMs: null,
  }, ONE_MINUTE_MS);
  assert.equal(result.longShort.observedAtMs, observedAtMs);
  assert.equal(result.longShort.ageMs, windowEndMsInclusive - observedAtMs);
});

test("MORDE: an upstream-failed series (empty rows) still comes back GRID-PADDED to the window, matching its siblings (CA-5a)", () => {
  const rows: HistoryRowsBundle = emptyBundle(); // every series absent — simulates every fetch failing
  const result = assembleHistoryPage(TABLE, rows, WINDOW, {
    priceUse: S2_PRICE_USE,
    windowEndMsExclusive: WINDOW.endMsExclusive,
    ...COVERAGE_CONTEXT,
    cvdAnchorMs: WINDOW.startMs,
    windowEndMsInclusive: WINDOW.endMsExclusive - ONE_MINUTE_MS,
    longShortRecentSpanMs: 3 * ONE_MINUTE_MS,
    oiMaxStalenessMs: null,
  }, ONE_MINUTE_MS);
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
  const rows: HistoryRowsBundle = bundleWith(
    {},
    // The values the QA read off the live API for two `4h` bars (`W1-QA-r2` §3).
    { volume: { volume: [scalarRow(0, "34200.456"), scalarRow(FOUR_HOURS_MS, "14515.595")] } },
  );
  return assembleHistoryPage(TABLE, rows, FOUR_HOUR_WINDOW, {
    priceUse: S2_PRICE_USE,
    windowEndMsExclusive: FOUR_HOUR_WINDOW.endMsExclusive,
    ...COVERAGE_CONTEXT,
    cvdAnchorMs: FOUR_HOUR_WINDOW.startMs,
    windowEndMsInclusive: FOUR_HOUR_WINDOW.endMsExclusive - ONE_MINUTE_MS,
    longShortRecentSpanMs: 3 * ONE_MINUTE_MS,
    oiMaxStalenessMs: null,
  }, ONE_MINUTE_MS).volume;
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

// ── `W7-CODE-REVIEW` C-1 — the long/short footer and the faixa das 4 h describe ONE set of slots ──
// The footer's `recentStats` used to cut at `windowEndMsInclusive - span`, an instant on the
// 1-MINUTE grid, while the band (`long-short-band.ts::recentBandSlotRange`) cuts at the last slot
// of the AXIS grid. On `1m` the two instants coincide; on `1h`/`4h` the footer lost the band's
// first slot: `4h` printed `n = 1` beside a band of 2 bars, `1h` 4 slots beside 5 bars. Since
// `T-05.6` (R-1) the band itself is exclusive on the left — 1 bar on `4h`, 4 on `1h`.
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
const RECENT_SPAN_MS = FOUR_HOURS_MS; // `LONG_SHORT_RECENT_SPAN_MS`

/** A long/short window of `slotCount` axis slots at `axisStepMs`, EVERY slot readable (values
 * cycling through 1.00..1.06 so `min`/`max` depend on which slots enter), assembled exactly as the
 * pager does: `windowEndMsInclusive` on the 1-minute grid, as `request-window.ts` builds it. */
function assembleLongShort(axisStepMs: number, slotCount: number) {
  const window: AssemblyWindow = { startMs: 0, endMsExclusive: slotCount * axisStepMs };
  const longShort = Array.from({ length: slotCount }, (_unused, index) =>
    scalarRow(index * axisStepMs, (1 + (index % 7) / 100).toFixed(2)),
  );
  return assembleHistoryPage(TABLE, bundleWith({}, { long_short: { ratio: longShort } }), window, {
    priceUse: S2_PRICE_USE,
    windowEndMsExclusive: window.endMsExclusive,
    ...COVERAGE_CONTEXT,
    cvdAnchorMs: window.startMs,
    windowEndMsInclusive: window.endMsExclusive - ONE_MINUTE_MS,
    longShortRecentSpanMs: RECENT_SPAN_MS,
    oiMaxStalenessMs: null,
  }, axisStepMs).longShort;
}

function bandBars(slots: readonly { readonly time: number }[]): number {
  const range = recentBandSlotRange(slots, RECENT_SPAN_MS);
  assert.notEqual(range, null, "the fixture must have a band to compare against");
  return range!.lastIndex - range!.firstIndex + 1;
}

// `T-05.6` (R-1): the band is `span / step` bars — 1 on `4h`, 4 on `1h` — exclusive on the left.
for (const [label, axisStepMs, slotCount, expectedBars] of [
  ["4h", FOUR_HOURS_MS, 4, 1],
  ["1h", ONE_HOUR_MS, 16, 4],
] as const) {
  test(`MORDE C-1: on ${label} the footer's n is the band's bar count (${expectedBars}), every slot readable`, () => {
    const longShort = assembleLongShort(axisStepMs, slotCount);
    assert.equal(bandBars(longShort.slots), expectedBars);
    assert.notEqual(longShort.recentStats, null);
    assert.equal(
      longShort.recentStats!.presentSlots,
      expectedBars,
      `the footer describes ${longShort.recentStats!.presentSlots} slots and the band shades ${expectedBars}`,
    );
  });
}

test("MORDE C-1/R-1: on 1m the footer is the band's 240 bars, one fewer than the pre-fix 1-minute cut", () => {
  const slotCount = 300; // 5 h of 1m slots — the band is strictly inside the window
  const longShort = assembleLongShort(ONE_MINUTE_MS, slotCount);
  const windowEndMsInclusive = slotCount * ONE_MINUTE_MS - ONE_MINUTE_MS;
  // The pre-fix expression, replanted: `slotsFrom(slots, windowEndMsInclusive - span)`, inclusive —
  // the bar that ENDS where the four hours begin was counted (`W7-CODE-REVIEW` R-1).
  const before = seriesValueStats(longShort.slots.filter((slot) => slot.time >= windowEndMsInclusive - RECENT_SPAN_MS));
  assert.equal(before!.presentSlots, 241);
  assert.notDeepEqual(longShort.recentStats, before);
  assert.equal(longShort.recentStats!.presentSlots, 240);
  assert.equal(bandBars(longShort.slots), 240);
});

test("MORDE C-1: page.tsx (the SSR copy) derives recentStats through the SAME function the pager uses", () => {
  // `page.tsx` is a Server Component no suite renders; its derivation is pinned by source, the way
  // the `*-dom-contract.test.ts` files pin theirs.
  const pageSource = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "[symbol]", "page.tsx"), "utf8");
  assert.match(pageSource, /recentStats: seriesValueStats\(recentBandSlots\(longShortSlots, LONG_SHORT_RECENT_SPAN_MS\)\)/);
  assert.doesNotMatch(pageSource, /windowEndMsInclusive - LONG_SHORT_RECENT_SPAN_MS/);
});

// ── `estrutura-do-front` `T-03.3` — the table arrives BY PARAMETER, and the assembly reads through it ──

const TABLE_CONTEXT = {
  priceUse: S2_PRICE_USE,
  windowEndMsExclusive: WINDOW.endMsExclusive,
  ...COVERAGE_CONTEXT,
  cvdAnchorMs: WINDOW.startMs,
  windowEndMsInclusive: WINDOW.endMsExclusive - ONE_MINUTE_MS,
  longShortRecentSpanMs: 3 * ONE_MINUTE_MS,
  oiMaxStalenessMs: null,
};

test("MORDE T-03.3: a table that does not declare a series the assembly reads is refused, by name", () => {
  // No page would fetch the CVD under this table: deriving it anyway would freeze it at the SSR window.
  const withoutCvd = TABLE.filter((entry) => entry.kind !== "cvd");
  assert.throws(
    () => assembleHistoryPage(withoutCvd, emptyBundle(), WINDOW, TABLE_CONTEXT, ONE_MINUTE_MS),
    /no series "cvd" under kind "cvd"/,
  );
  // Control: the whole table assembles the same rows.
  assert.doesNotThrow(() => assembleHistoryPage(TABLE, emptyBundle(), WINDOW, TABLE_CONTEXT, ONE_MINUTE_MS));
});

test("MORDE T-03.3: rows missing a slot the table declares are refused, never read as an empty series", () => {
  const empty = emptyBundle();
  const rows: HistoryRowsBundle = { ...empty, indicators: { ...empty.indicators, liquidation: { long: [] } } };
  assert.throws(
    () => assembleHistoryPage(TABLE, rows, WINDOW, TABLE_CONTEXT, ONE_MINUTE_MS),
    /no value under liquidation\/short/,
  );
});
