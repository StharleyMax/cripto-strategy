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
  lastPresentSlotMs,
  parseSignedDecimalToScaled,
  assembleOhlcCandles,
  resolveFreshnessVerdict,
  resolveFlowReadingOrAbsent,
  scalarPointsFromHistoryRows,
  scaledCvdDeltasFromHistoryRows,
  seriesValueStats,
  slotsFrom,
  trailingAbsentSlots,
  nonNegativeFlowSlotsFromHistoryRows,
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
  // `T-01.8`: the candle is FOUR series now (`SPEC-008`/`D1`), so the fixture feeds the same
  // three grid instants to each `Reduction` — the middle one absent in all four, which is what
  // a bucket nobody wrote looks like on the wire. The candle-specific cases (one reading
  // missing, a real body and wick, the ablation) live in `price-candle.test.ts`; what this
  // test still owns is the END-TO-END absence rule, through the real `charts` machinery.
  const candles = assembleOhlcCandles({ open: rows, high: rows, low: rows, close: rows }).candles;
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

test("CA-5a (QA · Fase 02 gate): an upstream fetch failure for long_short/liquidation breaks the ONE-GRID invariant, unlike price/OI/CVD", () => {
  // Reproduced LIVE against this worktree's own `make e2e` store (100% upstream `/series-history`
  // 500 for every series, `[MEDIDO 2026-09-22]`, `api.log`: every GET returns 500):
  //   curl "$BASE/symbol/BTCUSDT" | grep -o 'data-fact="[a-z_]*slots:[0-9]*"' | sort -u
  //   -> price_slots:5760 · oi_slots:5760 · cvd_slots:5760 · long_short_slots:0 ·
  //      liquidation_slots:long:0 · liquidation_slots:short:0
  // CA-5a's own literal check (`tasks.toml:257`, plano `02` DoD item 1) is
  //   `grep -o 'data-fact="[a-z_]*slots:[0-9]*"' <página> | cut -d: -f2 | sort -u | wc -l` -> 1,
  // and it MORDES here: `wc -l` gives 2, not 1.
  //
  // Root cause, in production code, not test setup: `buildPricePanel`/`buildOiPanel`/
  // `buildCvdPanel` (`charts/s2-panels.ts`) all call `buildChartSeries`/`buildScalarSeries`,
  // which build the grid from `window.startMs`/`window.endMsExclusive` — the slot COUNT never
  // depends on how many real points arrived, so it stays `[MEASURED]` the full window length
  // even when every point is missing (T-02.1's fix). `nonNegativeFlowSlotsFromHistoryRows`
  // (the mapper `long_short`/`liquidation` panels use, `[symbol]/page.tsx:731,671`) instead
  // returns "ONE SLOT PER ROW" with no grid fallback — when `fetchPanelRows` catches an
  // upstream failure it returns `rows: []` (`[symbol]/page.tsx:349-353`), so the resulting
  // panel silently collapses to ZERO slots while its five siblings stay grid-padded at full
  // length. This is exactly the "index i means a different instant in different panels" hazard
  // `D9`/`D-C3.2`/`CA-5a` exist to catch (`02_eixo_unico.md` — "um defeito pior que o atual,
  // porque parece consertado") — except CA-5a was written to catch a STEP mismatch (5m vs 1m,
  // T-02.1's OI defect), and this is a COUNT mismatch (0 vs full grid) under partial/total
  // upstream failure, a case none of T-02.1's/T-02.6's tests exercise (T-02.6's e2e checks
  // range-dispatch write-through, which fires unconditionally regardless of a panel's own slot
  // count, so it cannot see this).
  const gridPanels = buildS2Panels({
    window: FIXTURE_WINDOW,
    candles: [], // 0 real candles — the SAME "upstream gave nothing" shape `rows: []` is for long_short
    priceUse: S2_PRICE_USE,
    oiPoints: [],
    oiMissingDays: [],
    cvdDeltas: [],
    cvdMissingDays: [],
    cvdCoveredDays: [],
  });
  const priceSlotCount = gridPanels.price.series.slots.length;
  assert.equal(gridPanels.oi.slots.length, priceSlotCount, "control: OI still pads to the full grid with 0 points (T-02.1)");
  assert.equal(gridPanels.cvd.deltaSlots.length, priceSlotCount, "control: CVD still pads to the full grid with 0 points");

  const longShortSlotCountOnFetchFailure = nonNegativeFlowSlotsFromHistoryRows([]).length;
  assert.equal(
    longShortSlotCountOnFetchFailure,
    priceSlotCount,
    `CA-5a MORDE: on a \`fetchPanelRows\` failure (rows: []), long_short/liquidation collapse to ` +
      `${longShortSlotCountOnFetchFailure} slots while price/OI/CVD stay grid-padded at ${priceSlotCount} — ` +
      `the six panels are no longer "sobre exatamente a mesma grade" (plano 02 item 2.0). Same class as the ` +
      `defect T-02.1 fixed for OI (grid divergence), now live for long_short/liquidation under upstream failure.`,
  );
});

test("MORDE (negative control — proves the falsifier is not vacuous): naively mapping value ?? 0 WOULD fabricate a zero", () => {
  // This test does NOT call any production function — it exists to show the falsifier bites a
  // real defect shape, not just the correct code path. If a future edit replaced
  // `assembleOhlcCandles`'s `row.value === null` skip with a `Number(row.value ?? 0)` "convenience",
  // this is the exact wrong output that change would start producing.
  const missingRowValue: string | null = rowsWithOneAbsentMinute()[1]!.value;
  const naiveClose = Number(missingRowValue ?? 0);
  assert.equal(naiveClose, 0, "sanity: this IS what a fabricated-zero bug would look like");
  // The REAL mapper must never reach this shape — reasserted for the reader, not the runtime:
  const sameRows = rowsWithOneAbsentMinute();
  assert.equal(
    assembleOhlcCandles({ open: sameRows, high: sameRows, low: sameRows, close: sameRows }).candles.length,
    2,
  );
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
  const slots = nonNegativeFlowSlotsFromHistoryRows(rowsWithOneAbsentMinute());
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
  // `nonNegativeFlowSlotsFromHistoryRows` is ever "simplified" into it.
  const fabricated = rows.map((row) => ({ time: row.event_time, value: Number(row.value ?? 0) }));
  assert.equal(fabricated[1]!.value, 0, "sanity: this IS what the forbidden mapping produces");
  const real = nonNegativeFlowSlotsFromHistoryRows(rows);
  assert.notEqual(real[1]!.value, fabricated[1]!.value, "the real mapping must NOT agree with the fabricated one");
  assert.equal(real[1]!.value, null);
});

test("countPresentSlots counts REAL buckets only — the number DoD-3/RN-S2 checks against N >= 30", () => {
  const slots = nonNegativeFlowSlotsFromHistoryRows(rowsWithOneAbsentMinute());
  assert.equal(countPresentSlots(slots), 2, "the absent minute must not be counted as a point");
  assert.equal(countPresentSlots([]), 0, "an empty sub-axis has zero points, and says so");
  // `RN-S1`'s `/5` divisor does NOT apply to M1: `klines_volume` is `1m` native (`SPEC-007`
  // §4.1), so no slot repeats a neighbour's bar and present slots ARE distinct native bars.
  // Applying the divisor here would undercount by 5×, which is why the rule is stated, not assumed.
  assert.equal(countPresentSlots(slots), slots.filter((slot) => slot.value !== null).length);
});

test("firstPresentSlotMs: the LEFT end of the readable horizon, scanned forward and never guessed", () => {
  const slots = nonNegativeFlowSlotsFromHistoryRows(rowsWithOneAbsentMinute());
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

// ── `T-04.8` — the three statistics the approved long/short pane publishes ────────────────────
//
// `gates/design-04.md` §R2 (veredito `APPROVED`, Rev. 3) puts a scale footer, a four-hour band and
// a `cauda ausente` count on this pane. Each of the three is a number the API does NOT serve, so
// each has to be DERIVED from the slots the chart is drawn from — which is what `M-1` of that
// report demands and what its own Rev. 2 failed, publishing six numerals that traced to nothing.

test("seriesValueStats: the five numbers of the scale footer, all derived from present slots", () => {
  const slots = [
    { time: 1_000, value: 1.4 },
    { time: 61_000, value: null },
    { time: 121_000, value: 1.1 },
    { time: 181_000, value: 1.9 },
    { time: 241_000, value: 1.6 },
  ];
  const stats = seriesValueStats(slots);
  assert.ok(stats !== null);
  assert.equal(stats.presentSlots, 4, "the absent slot is not part of the universe the numbers describe");
  assert.equal(stats.min, 1.1);
  assert.equal(stats.max, 1.9);
  assert.equal(stats.amplitude, 1.9 - 1.1);
  // ⛔ NEAREST-RANK p50 OVER `[1.1, 1.4, 1.6, 1.9]` — the SECOND of the four, an observation the
  // series really took. The interpolated median would be `1.5`, a value this series never printed,
  // and the screen quotes the median as a number OF the series (`M-1`).
  assert.equal(stats.median, 1.4);
  assert.ok(
    slots.some((slot) => slot.value === stats.median),
    "MORDE: the median must be one of the observations — an interpolated 1.5 would fail this",
  );
});

test("seriesValueStats sorts NUMERICALLY — the default comparator is the bug this guards", () => {
  const slots = [
    { time: 1_000, value: 9 },
    { time: 61_000, value: 10 },
    { time: 121_000, value: 80 },
  ];
  const stats = seriesValueStats(slots);
  assert.ok(stats !== null);
  // `[9, 10, 80].sort()` (lexicographic) answers `[10, 80, 9]`, i.e. `min = 10` and `max = 9` —
  // a footer claiming a maximum BELOW its own minimum.
  assert.equal(stats.min, 9);
  assert.equal(stats.max, 80);
  assert.deepEqual([9, 10, 80].map(String).sort(), ["10", "80", "9"], "the mutation this test exists for");
});

test("seriesValueStats of a window with NO observation is null — never a fabricated domain", () => {
  assert.equal(seriesValueStats([]), null);
  assert.equal(
    seriesValueStats([
      { time: 1_000, value: null },
      { time: 61_000, value: null },
    ]),
    null,
    "a `{min: 0, max: 0}` here would put the metric's floor on screen as if it had been measured",
  );
  // A single observation has a domain of zero width, and that is a fact, not an error: the screen
  // then says `n=1` beside it (`presentSlots`) instead of hiding the sample size.
  const single = seriesValueStats([{ time: 1_000, value: 1.5 }]);
  assert.deepEqual(single, { presentSlots: 1, min: 1.5, max: 1.5, median: 1.5, amplitude: 0 });
});

test("slotsFrom: the trailing sub-window is a FILTER of the same slots, never a re-grid", () => {
  const slots = [
    { time: 1_000, value: 1.4 },
    { time: 61_000, value: 1.5 },
    { time: 121_000, value: 1.6 },
  ];
  assert.deepEqual(slotsFrom(slots, 61_000), [slots[1], slots[2]], "inclusive on the left — the instant IS a grid instant");
  assert.deepEqual(slotsFrom(slots, 0), slots);
  assert.deepEqual(slotsFrom(slots, 200_000), []);
  assert.ok(
    // Identity, not deep equality: `includes` compares references, which is the property being
    // asserted. The cast is the type system's price for a fixture literal narrower than
    // `ScalarSlot` (`value: number | null`), not a widening of anything at runtime.
    slotsFrom(slots, 61_000).every((slot) => (slots as readonly unknown[]).includes(slot)),
    "the objects handed back are the SAME the chart draws — a sub-window computed over a re-derived grid " +
      "is `M-2` of gates/design-05.md ('a janela declarada não é a janela desenhada')",
  );
});

test("trailingAbsentSlots: the size of the tail the RATIO pane refuses to draw", () => {
  const withTail = [
    { time: 1_000, value: 1.4 },
    { time: 61_000, value: 1.5 },
    { time: 121_000, value: null },
    { time: 181_000, value: null },
  ];
  assert.equal(trailingAbsentSlots(withTail), 2, "the two slots after the last observation — `cauda ausente: 2 grades`");
  // ⛔ THE TAIL IS THE RIGHT EDGE ONLY. A hole in the middle is not tail, and counting every absent
  // slot instead would publish `3` here — the pane would claim the line stops an hour before it does.
  const withHole = [
    { time: 1_000, value: null },
    { time: 61_000, value: 1.5 },
    { time: 121_000, value: null },
    { time: 181_000, value: 1.6 },
  ];
  assert.equal(trailingAbsentSlots(withHole), 0, "the window's last instant carries an observation — no tail");
  assert.equal(withHole.filter((slot) => slot.value === null).length, 2, "MORDE: the naive count answers 2, not 0");
  assert.equal(trailingAbsentSlots([]), 0, "no slots, no tail — and `0` here is not a claim about data");
  assert.equal(
    trailingAbsentSlots([
      { time: 1_000, value: null },
      { time: 61_000, value: null },
    ]),
    2,
    "a window where nothing is readable is ALL tail",
  );
});

test("resolveFlowReadingOrAbsent: a real bucket answers its own number, and absence never borrows a neighbour's", () => {
  const slots = nonNegativeFlowSlotsFromHistoryRows(rowsWithOneAbsentMinute());
  assert.deepEqual(resolveFlowReadingOrAbsent(slots, RANGE_START_MS), { kind: "present", value: 111.5 });
  // FLOW never carries forward: the absent minute stays absent even though the minute before it
  // has a real number (`resolveFlowReading`, reused from `charts` — no LOCF, ever).
  assert.deepEqual(resolveFlowReadingOrAbsent(slots, RANGE_START_MS + ONE_MINUTE_MS), { kind: "absent", value: null });
});

test("resolveFlowReadingOrAbsent on an EMPTY sub-axis answers absent instead of throwing — the /symbol crash guard", () => {
  assert.deepEqual(resolveFlowReadingOrAbsent([], RANGE_START_MS), { kind: "absent", value: null });
  // MORDE, and it is what makes the guard load-bearing rather than decorative: the `charts`
  // function this delegates to DOES throw on an empty grid, and empty is the NORMAL state of
  // this sub-axis whenever the panel degraded (no catalog row, transport down, nothing ingested
  // yet). Without the guard, `/symbol` would crash on an absence it is designed to render.
  assert.throws(() => resolveFlowReading([], ONE_MINUTE_MS, RANGE_START_MS), { name: "RangeError" });
});

test("nonNegativeFlowSlotsFromHistoryRows refuses a malformed value instead of hiding it as absence", () => {
  const notANumber: readonly SeriesHistoryRow[] = [
    { event_time: RANGE_START_MS, available_at: RANGE_START_MS, value: "not-a-number", absence: null },
  ];
  assert.throws(() => nonNegativeFlowSlotsFromHistoryRows(notANumber), InvalidSeriesValueError);
  // A negative traded volume is a contract break too (`nature=FLOW`, `reduction=SUM`,
  // `denom=base`): refused loudly rather than drawn as a downward bar nobody could explain.
  const negative: readonly SeriesHistoryRow[] = [
    { event_time: RANGE_START_MS, available_at: RANGE_START_MS, value: "-1", absence: null },
  ];
  assert.throws(() => nonNegativeFlowSlotsFromHistoryRows(negative), InvalidSeriesValueError);
});

// ── `T-03.5` — THE `RN-S1` DIVISOR, AND `RNF-2` ─────────────────────────────────────────────
//
// `GA-2`: `/series-history` serves this `5m` series on the `1m` grid — it walks the minute grid
// and asks `as_of` at each instant (`series_history.py`, `grid_instant += _GRID_STEP_MS`), so ONE
// native bucket comes back as up to FIVE readable rows. The staircase is not a bug; counting it
// as data is.

/** `n` native 5-minute buckets, each one appearing as the FIVE consecutive 1-minute rows the
 * route really serves — the staircase, built from a single value per native bucket so the two
 * countings (wire rows vs native buckets) are unambiguous by construction. */
function ladderRows(nativeBars: number, startMs: number): readonly SeriesHistoryRow[] {
  const rows: SeriesHistoryRow[] = [];
  for (let bar = 0; bar < nativeBars; bar += 1) {
    const bucketStartMs = startMs + bar * FIVE_MINUTES_MS;
    for (let step = 0; step < 5; step += 1) {
      rows.push({
        event_time: bucketStartMs + step * ONE_MINUTE_MS,
        available_at: bucketStartMs,
        // The SAME value five times: that is what a held reading of one observation IS.
        value: String(1000 + bar),
        absence: null,
      });
    }
  }
  return rows;
}

test("RN-S1: 30 native buckets arrive as 150 readable rows, and the OI panel counts 30", () => {
  const nativeBars = 30;
  const rows = ladderRows(nativeBars, RANGE_START_MS);
  // The number `DoD-3` would have read if nobody applied the divisor — five times the data.
  assert.equal(rows.filter((row) => row.value !== null).length, 150, "sanity: the wire carries the staircase");

  // ⛔ NO `/5` IS WRITTEN ANYWHERE. `scalarPointsFromHistoryRows(rows, FIVE_MINUTES_MS)` keeps
  // only the rows landing ON the 5-minute grid. Since `T-02.1` (`D-C3.2`) `buildOiPanel` aligns
  // those points to the SHARED axis grid (not a 5-minute grid of its own), but each native
  // point still lands on exactly one axis slot — so counting NON-NULL slots is still exact.
  const points = scalarPointsFromHistoryRows(rows, FIVE_MINUTES_MS);
  assert.equal(points.length, nativeBars, "one point per native bucket, not per wire row");

  const panels = buildS2Panels({
    window: FIXTURE_WINDOW,
    candles: [],
    priceUse: S2_PRICE_USE,
    oiPoints: points,
    oiMissingDays: [],
    cvdDeltas: [],
    cvdMissingDays: [],
    cvdCoveredDays: [],
  });
  assert.equal(countPresentSlots(panels.oi.slots), nativeBars, "`DoD-3`'s N is the native count");
  // MORDE — the forbidden reading, computed here so the two numbers can be compared instead of
  // asserted apart in prose: reading `N` off the wire rows says 150 where the data is 30. A pane
  // that published THAT number would pass `N >= 30` with six real buckets.
  const staircaseCount = rows.filter((row) => row.value !== null).length;
  assert.equal(staircaseCount, 5 * nativeBars);
  assert.notEqual(countPresentSlots(panels.oi.slots), staircaseCount);
});

test("RN-S1: two ADJACENT native buckets carrying the SAME value are TWO buckets, not one", () => {
  // The failure mode of the "count distinct consecutive values" shortcut, which is the other
  // tempting way to undo the staircase. Open interest is a STOCK: it genuinely repeats.
  const rows: readonly SeriesHistoryRow[] = [
    { event_time: RANGE_START_MS, available_at: RANGE_START_MS, value: "70000", absence: null },
    { event_time: RANGE_START_MS + FIVE_MINUTES_MS, available_at: RANGE_START_MS, value: "70000", absence: null },
  ];
  const points = scalarPointsFromHistoryRows(rows, FIVE_MINUTES_MS);
  assert.equal(points.length, 2, "identical values at two grid instants are two observations");
  const distinctValues = new Set(points.map((point) => point.value)).size;
  assert.equal(distinctValues, 1, "sanity: the shortcut would answer 1 here");
});

test("lastPresentSlotMs: the RIGHT end of the readable horizon, and null when nothing is readable", () => {
  const slots = [
    { time: RANGE_START_MS, value: 1 },
    { time: RANGE_START_MS + FIVE_MINUTES_MS, value: null },
    { time: RANGE_START_MS + 2 * FIVE_MINUTES_MS, value: 3 },
    { time: RANGE_START_MS + 3 * FIVE_MINUTES_MS, value: null },
  ];
  assert.equal(lastPresentSlotMs(slots), RANGE_START_MS + 2 * FIVE_MINUTES_MS, "trailing gaps do not move it");
  assert.equal(lastPresentSlotMs([]), null);
  assert.equal(
    lastPresentSlotMs(slots.map((slot) => ({ ...slot, value: null }))),
    null,
    "nothing readable answers null — `0` would name the epoch as the last reading",
  );
});

/** `max_staleness_ms` of open interest — 2 x the 5m native bucket (`open_interest_catalog.py`). */
const OI_CEILING_MS = 600_000;

/** A readable wire row, with the publication instant spelled out — `A-4.2` made `available_at`
 * the minuend of the age, so a fixture that leaves it implicit no longer describes the input. */
function readableRow(eventTimeMs: number, availableAtMs: number): SeriesHistoryRow {
  return { event_time: eventTimeMs, available_at: availableAtMs, value: "70000", absence: null };
}

/** An absent row — `available_at` is `null` exactly when `value` is (`CA-F1-5`). */
function absentRow(eventTimeMs: number): SeriesHistoryRow {
  return { event_time: eventTimeMs, available_at: null, value: null, absence: "SEM_PONTO" };
}

test("RNF-2: a reading older than the series' own ceiling is called STALE, and the ceiling is the served one", () => {
  const ceilingMs = OI_CEILING_MS;
  // Publication lag zero in this fixture, so the arithmetic below is about the THRESHOLD and not
  // about the lag; the lag gets its own cases further down.
  const rows: readonly SeriesHistoryRow[] = [
    readableRow(RANGE_START_MS, RANGE_START_MS),
    absentRow(RANGE_START_MS + FIVE_MINUTES_MS),
  ];
  const fresh = resolveFreshnessVerdict(rows, RANGE_START_MS + 4 * ONE_MINUTE_MS, ceilingMs);
  assert.equal(fresh.kind, "fresh", "4 min is grid rounding on a 5m series, not staleness");
  assert.equal(fresh.ageMs, 4 * ONE_MINUTE_MS);

  // Exactly AT the ceiling is still fresh; one millisecond past it is not. Stated as two asserts
  // because "> vs >=" is precisely the kind of boundary a rewrite flips without noticing.
  assert.equal(resolveFreshnessVerdict(rows, RANGE_START_MS + ceilingMs, ceilingMs).kind, "fresh");
  const stale = resolveFreshnessVerdict(rows, RANGE_START_MS + ceilingMs + 1, ceilingMs);
  assert.equal(stale.kind, "stale");
  assert.equal(stale.observedMs, RANGE_START_MS, "the verdict carries the instant it judged");
  assert.equal(stale.ceilingMs, ceilingMs, "and the ceiling it judged against — both auditable");

  // Six hours old: the state `formatHeldStockLabel` CANNOT describe (`resolveStockReading` holds
  // at most one native bucket and then says `SEM_PONTO`, saying nothing about WHEN). This is the
  // gap `RNF-2` exists to close.
  assert.equal(resolveFreshnessVerdict(rows, RANGE_START_MS + 6 * 3_600_000, ceilingMs).kind, "stale");
});

test("A-4.2 regression: a 25-minute-old reading is STALE even when the server carried it to the window edge", () => {
  // THE DEFECT THIS FIXTURE EXISTS TO KEEP DEAD, and it is the shape of a REAL wire response, not
  // an invented one: open interest is `Nature.STOCK`, so `as_of` carries the last observation
  // forward across the `1m` grid up to `max_staleness_ms` (`as_of_accessor.py:112-113,330`). Every
  // grid row from the observation onward therefore comes back PRESENT, with the SAME `available_at`
  // as the observation — including the row that lands on the window's last grid instant.
  //
  // MORDE: with the old grandeza (`T - event_time` of the last present row, which is what
  // `lastPresentSlotMs` gave) this case scores `ageMs = 0` and the panel prints `fresh` over a
  // reading 25 minutes old — the ceiling spent once on the server and charged again on the client.
  // CALA: `T - available_at` scores `1_500_000 > 600_000` and the panel says `stale`, which is the
  // verdict `SPEC-001` §3.2 authored the ceiling to produce ("more than one missed bucket").
  const windowEndMs = RANGE_START_MS + 60 * ONE_MINUTE_MS;
  const publishedAtMs = windowEndMs - 25 * ONE_MINUTE_MS;
  const carriedForward: readonly SeriesHistoryRow[] = Array.from({ length: 26 }, (_unused, index) =>
    readableRow(publishedAtMs + index * ONE_MINUTE_MS, publishedAtMs),
  );
  assert.equal(
    carriedForward.at(-1)!.event_time,
    windowEndMs,
    "sanity: the LOCF staircase really does reach the window edge — otherwise this case proves nothing",
  );

  const verdict = resolveFreshnessVerdict(carriedForward, windowEndMs, OI_CEILING_MS);
  assert.equal(verdict.kind, "stale", "25 min of publication age against a 10 min ceiling is STALE");
  assert.equal(verdict.ageMs, 25 * ONE_MINUTE_MS, "and the age is T - available_at, not T - last filled slot");
  assert.equal(verdict.observedMs, publishedAtMs, "the instant judged is the PUBLICATION instant");
  assert.equal(verdict.referenceMs, windowEndMs, "counted back from the window close, never from the wall clock");
});

test("A-4.2: the age comes off the RIGHT-EDGE row, not off the newest available_at in the window", () => {
  // Backfill: an OLD row is (re)published NOW. `Math.max` over `available_at` would pick exactly
  // the row that rejuvenates the screen, and the panel would call a 40-minute-old right edge
  // fresh. `STITCH_CONTEXT.md:1777` scopes the field to the RIGHT EDGE of time.
  const windowEndMs = RANGE_START_MS + 60 * ONE_MINUTE_MS;
  const rows: readonly SeriesHistoryRow[] = [
    readableRow(RANGE_START_MS, windowEndMs), // backfilled: ancient event, brand-new publication
    readableRow(windowEndMs - 40 * ONE_MINUTE_MS, windowEndMs - 40 * ONE_MINUTE_MS),
  ];
  const verdict = resolveFreshnessVerdict(rows, windowEndMs, OI_CEILING_MS);
  assert.equal(verdict.kind, "stale", "a fresh backfill of old history does not refresh the right edge");
  assert.equal(verdict.ageMs, 40 * ONE_MINUTE_MS);

  // And the choice does not depend on the order the wire happened to use.
  const reversed = resolveFreshnessVerdict([...rows].reverse(), windowEndMs, OI_CEILING_MS);
  assert.deepEqual(reversed, verdict, "row order is a server convention; the verdict must not ride on it");
});

test("RNF-2: ignorance is never rendered as freshness — no point and no ceiling both answer unknown", () => {
  const ceilingMs = OI_CEILING_MS;
  assert.equal(resolveFreshnessVerdict([], RANGE_START_MS, ceilingMs).kind, "unknown", "no readable point");
  assert.equal(
    resolveFreshnessVerdict([absentRow(RANGE_START_MS)], RANGE_START_MS, ceilingMs).kind,
    "unknown",
    "a window of pure absence is ignorance, not a fresh zero",
  );
  // No entry resolved ⇒ no ceiling published ⇒ the panel may not claim the data is current. A
  // `?? 600_000` default here would be a freshness claim invented by the renderer.
  const noCeiling = resolveFreshnessVerdict([readableRow(RANGE_START_MS, RANGE_START_MS)], RANGE_START_MS, null);
  assert.equal(noCeiling.kind, "unknown");
  assert.equal(noCeiling.ageMs, null, "and it publishes no age either — there is nothing to compare");
});
