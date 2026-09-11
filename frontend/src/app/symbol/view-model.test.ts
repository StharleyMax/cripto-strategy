// `T-02.4`, `CA-F2-3` — "ausência de OI/CVD renderizada como ausência (SEM_PONTO etc.), nunca
// 0". This is the falsifier: a literal fixture shaped exactly like phase `01`'s real
// `/series-history` envelope (`SeriesHistoryRow`), containing a row with `absence:"SEM_PONTO"`,
// fed through this module's mappers and then through the REAL `charts` grid/adapter machinery
// (`buildS2Panels`, `lineSeriesLossless`/`candlestickSeriesLossless` — untouched by this task) —
// MORDE: if a row were mapped to a fabricated `0` instead of being dropped, the resulting item
// at that instant would carry `{time, value: 0}`/`{time, ..., close: 0}`; CALA: the real
// mapping instead produces a bare `{time}` `WhitespaceItem`, and a PRESENT row's real value
// survives unchanged end to end.
//
// Run with: npm --prefix frontend run test:app

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildS2Panels,
  resolveTrailingWindow,
  S2_WINDOW_SPAN_MS,
  FIVE_MINUTES_MS,
  candlestickSeriesLossless,
  lineSeriesLossless,
  resolveFlowReading,
  S2_PRICE_USE,
  type CandlestickItem,
  type LineItem,
  type WhitespaceItem,
} from "../../charts/index.ts";
import type { SeriesHistoryRow } from "./series-history-client.ts";
import {
  computeSeriesKeyId,
  countPresentSlots,
  firstPresentSlotMs,
  daysWithPresence,
  InvalidSeriesValueError,
  keyMatchesSymbol,
  parseSignedDecimalToScaled,
  rawCandlesFromHistoryRows,
  resolveVolumeReading,
  scalarPointsFromHistoryRows,
  scaledCvdDeltasFromHistoryRows,
  volumeSlotsFromHistoryRows,
} from "./view-model.ts";
import type { SeriesKey } from "../../features/s3-inspector/series-catalog.ts";

const ONE_MINUTE_MS = 60_000;
// The window every panel below is built over, DERIVED exactly like the real route derives its
// own (`request-window.ts`). It used to be three constants of `charts/s2-panels.ts`, and the
// route that inherited them asked `/series-history` for four days of 2026-08 while
// `klines_volume` starts at 2026-09-04 (`ACHADO-SERIES-HISTORY-SEM-PONTO.md`, second defect).
// `lagMs: 0` because this fixture's clock reading IS the window's exclusive end — a test
// supplies its own clock and has no publication lag to wait out.
const FIXTURE_WINDOW = resolveTrailingWindow({
  nowMs: Date.UTC(2026, 7, 24, 0, 0, 0),
  lagMs: 0,
  spanMs: S2_WINDOW_SPAN_MS,
  alignmentMs: FIVE_MINUTES_MS,
});
// The 3 rows below land on REAL grid instants of the price panel built over that window.
const RANGE_START_MS = FIXTURE_WINDOW.startMs;

function rowsWithOneAbsentMinute(): readonly SeriesHistoryRow[] {
  return [
    { event_time: RANGE_START_MS, available_at: RANGE_START_MS + 1_000, value: "111.5", absence: null },
    { event_time: RANGE_START_MS + ONE_MINUTE_MS, available_at: null, value: null, absence: "SEM_PONTO" },
    { event_time: RANGE_START_MS + 2 * ONE_MINUTE_MS, available_at: RANGE_START_MS + 2 * ONE_MINUTE_MS + 1_000, value: "113.25", absence: null },
  ];
}

test("CA-F2-3 (price/OI/CVD, end to end): a SEM_PONTO row becomes a bare WhitespaceItem, never {value: 0}", () => {
  const rows = rowsWithOneAbsentMinute();

  // ── PRICE (candlestick) ────────────────────────────────────────────────────────────────
  const candles = rawCandlesFromHistoryRows(rows);
  assert.equal(candles.length, 2, "the absent row must NOT become a candle");
  const pricePanel = buildS2Panels({
    window: FIXTURE_WINDOW,
    candles,
    priceUse: S2_PRICE_USE,
    oiPoints: [],
    oiMissingDays: [],
    cvdDeltas: [],
    cvdMissingDays: [],
    cvdCoveredDays: [],
  }).price;
  // `buildChartSeries` builds its OWN grid from the candles' own range — pass the SAME
  // 3-minute range this fixture uses via `s2-panels.ts`'s constants would require importing
  // `RANGE_START_MS`/`RANGE_END_MS_EXCLUSIVE` from the barrel (the REAL 4-day window); this
  // test instead reads the grid `buildS2Panels` actually built (`price.series.slots`), which
  // spans exactly the fixture's own real 4-day constants — the middle absent slot is still
  // provably present as a gap because the fixture's `RANGE_START_MS`-aligned minute IS one of
  // its grid instants.
  const items = candlestickSeriesLossless(pricePanel.series.slots);
  const middleItem = items.find((item) => item.time === (RANGE_START_MS + ONE_MINUTE_MS) / 1000);
  assert.ok(middleItem !== undefined, "the grid must still carry a slot at the absent minute");
  assert.ok(
    !("close" in (middleItem as CandlestickItem | WhitespaceItem)),
    `the absent minute must render as a bare {time} WhitespaceItem, not a candle — got ${JSON.stringify(middleItem)}`,
  );
  const firstItem = items.find((item) => item.time === RANGE_START_MS / 1000) as CandlestickItem;
  assert.equal(firstItem.close, 111.5, "a present row's real value must survive unchanged");

  // ── OI (line, scalar) ──────────────────────────────────────────────────────────────────
  const oiPoints = scalarPointsFromHistoryRows(rows, ONE_MINUTE_MS);
  assert.equal(oiPoints.length, 2, "the absent row must NOT become a scalar point");
  // The day list comes off the window too — a literal here would be the same defect in
  // miniature: it would keep asserting about 2026-08-20 after the window moved on.
  const { missingDays: oiMissingDays } = daysWithPresence(rows, [FIXTURE_WINDOW.days[0]!]);
  assert.deepEqual(oiMissingDays, [], "a day WITH at least one present row is not a missing day");

  // ── CVD delta (line, scalar, SIGNED) ───────────────────────────────────────────────────
  const cvdRowsWithNegative: readonly SeriesHistoryRow[] = [
    rows[0]!,
    rows[1]!,
    { event_time: RANGE_START_MS + 2 * ONE_MINUTE_MS, available_at: RANGE_START_MS + 2 * ONE_MINUTE_MS, value: "-3.5", absence: null },
  ];
  const deltas = scaledCvdDeltasFromHistoryRows(cvdRowsWithNegative);
  assert.equal(deltas.length, 2);
  assert.equal(deltas[1]!.valueScaled, -350_000_000n, "a negative CVD delta must stay signed through the scaled BigInt");
});

test("MORDE (negative control — proves the falsifier is not vacuous): naively mapping value ?? 0 WOULD fabricate a zero", () => {
  // This test does NOT call any production function — it exists to show the falsifier bites a
  // real defect shape, not just the correct code path. If a future edit replaced
  // `rawCandlesFromHistoryRows`'s `.filter(...)` with a `Number(row.value ?? 0)` "convenience",
  // this is the exact wrong output that change would start producing.
  const missingRowValue: string | null = rowsWithOneAbsentMinute()[1]!.value;
  const naiveClose = Number(missingRowValue ?? 0);
  assert.equal(naiveClose, 0, "sanity: this IS what a fabricated-zero bug would look like");
  // The REAL mapper must never reach this shape — reasserted for the reader, not the runtime:
  assert.equal(rawCandlesFromHistoryRows(rowsWithOneAbsentMinute()).length, 2);
});

test("scalarPointsFromHistoryRows filters to the destination grid (OI's 1m→5m re-grid)", () => {
  const rows: SeriesHistoryRow[] = [
    { event_time: 0, available_at: 0, value: "1", absence: null },
    { event_time: ONE_MINUTE_MS, available_at: ONE_MINUTE_MS, value: "2", absence: null },
    { event_time: 5 * ONE_MINUTE_MS, available_at: 5 * ONE_MINUTE_MS, value: "3", absence: null },
  ];
  const fiveMinPoints = scalarPointsFromHistoryRows(rows, 5 * ONE_MINUTE_MS);
  assert.deepEqual(
    fiveMinPoints.map((p) => p.timeMs),
    [0, 5 * ONE_MINUTE_MS],
    "only rows landing on the 5-minute grid survive — the 1-minute-only row is dropped, not snapped",
  );
});

test("parseSignedDecimalToScaled: exact, signed, refuses over-precise input", () => {
  assert.equal(parseSignedDecimalToScaled("0"), 0n);
  assert.equal(parseSignedDecimalToScaled("1.5"), 150_000_000n);
  assert.equal(parseSignedDecimalToScaled("-1.5"), -150_000_000n);
  assert.throws(() => parseSignedDecimalToScaled("1.123456789"));
  assert.throws(() => parseSignedDecimalToScaled("not-a-number"));
});

test("keyMatchesSymbol / computeSeriesKeyId: deterministic, sensitive to every term", () => {
  const base: SeriesKey = {
    provider: "binance",
    venue: "futures",
    instrumentId: "BTCUSDT",
    metric: "sum_open_interest",
    cohort: "all",
    interval: "5m",
    unit: "USD",
    denom: "USD",
    nature: "STOCK",
    tsConvention: "POINT_AT_BUCKET_END",
    reduction: "POINT",
    quantityField: "NA",
    labelShift: 0,
    aggregationScope: "global",
    verifiedBy: "T-06.5",
  };
  assert.ok(keyMatchesSymbol(base, "BTCUSDT"));
  assert.ok(!keyMatchesSymbol(base, "ETHUSDT"));

  const id1 = computeSeriesKeyId(base);
  const id2 = computeSeriesKeyId({ ...base });
  assert.equal(id1, id2, "same 15 terms must produce the same id, deterministically");
  assert.match(id1, /^[0-9a-f]{64}$/, "sha256 hex digest, 64 chars");

  const changedVerifiedBy = computeSeriesKeyId({ ...base, verifiedBy: "T-06.6" });
  assert.notEqual(id1, changedVerifiedBy, "verified_by is inside the identity — a change must re-identify the series");
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// `T-01.7` — the volume sub-axis (`klines_volume`, M1, `SPEC-007` §3.6/§4.1)
//
// The falsifier of this task is `RN-1`: absence is `SEM_PONTO`, NEVER zero — and for a `FLOW`
// series a fabricated zero is an error of TYPE, not of UX. Each test below names the defect
// shape it catches, and the MORDE cases show the falsifiers are not vacuous.
// ════════════════════════════════════════════════════════════════════════════════════════════

test("RN-1 (volume, end to end): an absent 1m row becomes a bare WhitespaceItem — never a zero bar", () => {
  const slots = volumeSlotsFromHistoryRows(rowsWithOneAbsentMinute());
  assert.equal(slots.length, 3, "one slot per wire row — the route already walks the 1m grid");
  assert.equal(slots[1]!.value, null, "the absent minute must be an explicit gap, not a number");

  // Through the REAL adapter `SymbolClient.tsx` feeds the histogram series with.
  const items = lineSeriesLossless(slots);
  const middle = items.find((item) => item.time === (RANGE_START_MS + ONE_MINUTE_MS) / 1000);
  assert.ok(middle !== undefined, "the absent minute must still occupy the axis");
  assert.ok(
    !("value" in (middle as LineItem | WhitespaceItem)),
    `the absent minute must be a bare {time} WhitespaceItem — got ${JSON.stringify(middle)}`,
  );
  const first = items.find((item) => item.time === RANGE_START_MS / 1000) as LineItem;
  assert.equal(first.value, 111.5, "a present bucket's real volume must survive unchanged");
});

test("MORDE (negative control): the zero-fabricating mapping RN-1 forbids IS distinguishable from the real one", () => {
  const rows = rowsWithOneAbsentMinute();
  // The exact defect shape `RN-1` names, kept next to the real mapping so the assert is
  // provably NOT vacuous: the two disagree at the absent minute, and this test fails the day
  // `volumeSlotsFromHistoryRows` is ever "simplified" into it.
  const fabricated = rows.map((row) => ({ time: row.event_time, value: Number(row.value ?? 0) }));
  assert.equal(fabricated[1]!.value, 0, "sanity: this IS what the forbidden mapping produces");
  const real = volumeSlotsFromHistoryRows(rows);
  assert.notEqual(real[1]!.value, fabricated[1]!.value, "the real mapping must NOT agree with the fabricated one");
  assert.equal(real[1]!.value, null);
});

test("countPresentSlots counts REAL buckets only — the number DoD-3/RN-S2 checks against N >= 30", () => {
  const slots = volumeSlotsFromHistoryRows(rowsWithOneAbsentMinute());
  assert.equal(countPresentSlots(slots), 2, "the absent minute must not be counted as a point");
  assert.equal(countPresentSlots([]), 0, "an empty sub-axis has zero points, and says so");
  // `RN-S1`'s `/5` divisor does NOT apply to M1: `klines_volume` is `1m` native (`SPEC-007`
  // §4.1), so no slot repeats a neighbour's bar and present slots ARE distinct native bars.
  // Applying the divisor here would undercount by 5×, which is why the rule is stated, not assumed.
  assert.equal(countPresentSlots(slots), slots.filter((slot) => slot.value !== null).length);
});

test("firstPresentSlotMs: the LEFT end of the readable horizon, scanned forward and never guessed", () => {
  const slots = volumeSlotsFromHistoryRows(rowsWithOneAbsentMinute());
  assert.equal(firstPresentSlotMs(slots), slots[0]!.time, "the first present slot is the horizon");
  assert.equal(firstPresentSlotMs([]), null, "no slots, no horizon — and it says null rather than 0");
  assert.equal(
    firstPresentSlotMs(slots.map((slot) => ({ ...slot, value: null }))),
    null,
    "a window where NOTHING is readable answers null — `0` here would name the epoch as the horizon",
  );

  // The shape the live window actually has `[MEDIDO 2026-09-11: 769 de 5.761 grades com valor, o
  // primeiro no indice 4.971, ACHADO-BACKFILL-INVISIVEL-AO-AS-OF.md]`: a long absent prefix and
  // then data. The horizon must be the FIRST present instant, not the window's own left edge —
  // reporting the left edge is exactly the claim ("temos dado desde aqui") the screen must not
  // make.
  const leading = [
    { time: 1_000, value: null },
    { time: 61_000, value: null },
    { time: 121_000, value: 3.5 },
    { time: 181_000, value: null },
    { time: 241_000, value: 4.5 },
  ];
  assert.equal(firstPresentSlotMs(leading), 121_000);
  assert.notEqual(firstPresentSlotMs(leading), leading[0]!.time, "the window's left edge is NOT the horizon");
});

test("resolveVolumeReading: a real bucket answers its own number, and absence never borrows a neighbour's", () => {
  const slots = volumeSlotsFromHistoryRows(rowsWithOneAbsentMinute());
  assert.deepEqual(resolveVolumeReading(slots, RANGE_START_MS), { kind: "present", value: 111.5 });
  // FLOW never carries forward: the absent minute stays absent even though the minute before it
  // has a real number (`resolveFlowReading`, reused from `charts` — no LOCF, ever).
  assert.deepEqual(resolveVolumeReading(slots, RANGE_START_MS + ONE_MINUTE_MS), { kind: "absent", value: null });
});

test("resolveVolumeReading on an EMPTY sub-axis answers absent instead of throwing — the /symbol crash guard", () => {
  assert.deepEqual(resolveVolumeReading([], RANGE_START_MS), { kind: "absent", value: null });
  // MORDE, and it is what makes the guard load-bearing rather than decorative: the `charts`
  // function this delegates to DOES throw on an empty grid, and empty is the NORMAL state of
  // this sub-axis whenever the panel degraded (no catalog row, transport down, nothing ingested
  // yet). Without the guard, `/symbol` would crash on an absence it is designed to render.
  assert.throws(() => resolveFlowReading([], ONE_MINUTE_MS, RANGE_START_MS), { name: "RangeError" });
});

test("volumeSlotsFromHistoryRows refuses a malformed value instead of hiding it as absence", () => {
  const notANumber: readonly SeriesHistoryRow[] = [
    { event_time: RANGE_START_MS, available_at: RANGE_START_MS, value: "not-a-number", absence: null },
  ];
  assert.throws(() => volumeSlotsFromHistoryRows(notANumber), InvalidSeriesValueError);
  // A negative traded volume is a contract break too (`nature=FLOW`, `reduction=SUM`,
  // `denom=base`): refused loudly rather than drawn as a downward bar nobody could explain.
  const negative: readonly SeriesHistoryRow[] = [
    { event_time: RANGE_START_MS, available_at: RANGE_START_MS, value: "-1", absence: null },
  ];
  assert.throws(() => volumeSlotsFromHistoryRows(negative), InvalidSeriesValueError);
});
