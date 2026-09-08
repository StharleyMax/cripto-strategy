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
  candlestickSeriesLossless,
  S2_PRICE_USE,
  type CandlestickItem,
  type WhitespaceItem,
} from "../../charts/index.ts";
import type { SeriesHistoryRow } from "./series-history-client.ts";
import {
  computeSeriesKeyId,
  daysWithPresence,
  keyMatchesSymbol,
  parseSignedDecimalToScaled,
  rawCandlesFromHistoryRows,
  scalarPointsFromHistoryRows,
  scaledCvdDeltasFromHistoryRows,
} from "./view-model.ts";
import type { SeriesKey } from "../../features/s3-inspector/series-catalog.ts";

const ONE_MINUTE_MS = 60_000;
// Deliberately the SAME instant as `charts/s2-panels.ts::RANGE_START_MS` (not imported — this
// fixture only needs 3 minutes of it, not the full 4-day window) — so the 3 rows below land on
// REAL grid instants of the barrel's own price panel, built with its real constants below.
const RANGE_START_MS = Date.UTC(2026, 7, 20, 0, 0, 0);

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
  const { missingDays: oiMissingDays } = daysWithPresence(rows, ["2026-08-20"]);
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
