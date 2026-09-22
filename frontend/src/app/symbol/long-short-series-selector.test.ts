/**
 * `T-04.5` — WHICH `count_long_short_ratio` row the long/short pane picks, and HOW MANY NATIVE
 * OBSERVATIONS the staircase it is served on actually carries.
 *
 * ── THE TWO THINGS THIS FILE IS THE FALSIFIER OF ─────────────────────────────────────────────
 *
 * 1. THE PANE POINTING AT A SERIES NOBODY PUBLISHES. Twice already, in production: `metric ===
 *    "cvd_source"` silently selected `aggtrade_q` (`T-02.5`) and `metric === "sum_open_interest"`
 *    selected `coinalyze`/`OPEN` with `0` rows against `binance`/`POINT` with `8.064` (`T-03.5`).
 *    Both answered `200` and drew an all-absent grid, which on screen is indistinguishable from
 *    "o mercado não teve dado" — the `rc=0`-that-means-nothing failure `ADR-012` names.
 *
 * 2. `RN-S1` — THE STAIRCASE COUNTED AS DATA. The series is `5m` native served on the `1m` grid,
 *    so one observation occupies up to five slots. The phase names the failure mode itself:
 *    "contar 150 pontos onde há 30 barras". `DoD-3` asks for `N >= 30` NATIVE bars, and the two
 *    cheap answers (`presentRows / 5`, `event_time % 300_000 === 0`) are BOTH wrong for this
 *    series — measured below, not asserted.
 *
 * ── THE FIXTURE IS A TRANSCRIPTION, AND THE DRIFT GUARD IS THE E2E ───────────────────────────
 *
 * The long/short row is transcribed, term for term, from `long_short_catalog.py`
 * (`count_long_short_ratio_key` + `build_count_long_short_ratio_entry`) — the same
 * independent-witness technique the three sibling selector suites use, since no cross-language
 * import exists. CONFIRMED against the running API `[MEDIDO 2026-09-16, GET
 * /api/v1/series-catalog: n_entries=60, 15 linhas para BTCUSDT, 1 com
 * metric="count_long_short_ratio" — provider=binance, venue=usdm_futures, cohort=all, interval=5m,
 * unit=ratio, denom=NA, nature=RATIO, tsConvention=POINT_AT_BUCKET_END, reduction=POINT,
 * quantityField=NA, labelShift=0, aggregationScope=Symbol, nativeGrid=5min,
 * maxStalenessMs=600000, priceUse=null, reconstructedFrom=null, publishedError=null]`. A
 * transcription can still go stale, and this file does not pretend otherwise: the drift guard is
 * `T-04.7`'s e2e, which asks the RUNNING API for its own catalog.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { assertValidCatalogEntry, type SeriesCatalogEntry } from "../../features/s3-inspector/series-catalog.ts";
import type { SeriesHistoryRow } from "./series-history-client.ts";
import {
  countNativeBarsByPublication,
  countPresentSlots,
  LONG_SHORT_METRIC,
  LONG_SHORT_PROVIDER,
  matchesBinanceOpenInterest,
  matchesCountLongShortRatio,
  matchesKlineTakerBuyCvd,
  matchesLiquidationCohort,
  nonNegativeFlowSlotsFromHistoryRows,
} from "./view-model.ts";

const SYMBOL = "BTCUSDT";

/** The row this pane draws — `long_short_catalog.py`, transcribed. */
function longShortEntry(): SeriesCatalogEntry {
  const entry: SeriesCatalogEntry = {
    key: {
      provider: "binance",
      venue: "usdm_futures",
      instrumentId: SYMBOL,
      metric: "count_long_short_ratio",
      cohort: "all",
      interval: "5m",
      unit: "ratio",
      denom: "NA",
      nature: "RATIO",
      tsConvention: "POINT_AT_BUCKET_END",
      reduction: "POINT",
      quantityField: "NA",
      // ⛔ `0`, AND MEASURED — `long_short_catalog.LONG_SHORT_LABEL_SHIFT_MS`. It DIVERGES from the
      // open-interest row's `+interval` on purpose: the `timestamp` Binance publishes on
      // `/futures/data/globalLongShortAccountRatio` is already the END of the window it labels
      // (measured across two bucket boundaries), so there is nothing to shift.
      labelShift: 0,
      aggregationScope: "Symbol",
      verifiedBy:
        "test_long_short_catalog.py::test_the_five_minute_grid_is_the_origins_and_the_label_is_the_bucket_end",
    },
    nativeGrid: "5min",
    maxStalenessMs: 600_000,
    // `PRICE_USES` is a closed set of five names and an account-count ratio is not among them, so
    // `resolve_price_source` must never be able to route a price question here.
    priceUse: null,
    reconstructedFrom: null,
    publishedError: null,
  };
  assertValidCatalogEntry(entry);
  return entry;
}

/** The SAME quotient published by the THIRD PARTY — Coinalyze mirrors it in its `r` field. It is
 * NOT in the served catalog today, and that is exactly why it is here: `provider` is the second
 * term of the selector, and a term that defends against nothing measurable is a term whose cost
 * (one more way for a rename to make the pane go dark) buys nothing. This fixture is what makes
 * that defence falsifiable before the row exists. */
function coinalyzeLongShortMirrorEntry(): SeriesCatalogEntry {
  const entry: SeriesCatalogEntry = {
    ...longShortEntry(),
    key: { ...longShortEntry().key, provider: "coinalyze" },
  };
  assertValidCatalogEntry(entry);
  return entry;
}

/** A Binance row of the same venue and the same `reduction`/`ts_convention` — the sibling that
 * makes `provider + reduction` (a selector WITHOUT `metric`) ambiguous, so the first term is
 * measured to be load-bearing rather than assumed. */
function binanceOpenInterestEntry(): SeriesCatalogEntry {
  const entry: SeriesCatalogEntry = {
    key: {
      provider: "binance",
      venue: "usdm_futures",
      instrumentId: SYMBOL,
      metric: "sum_open_interest",
      cohort: "all",
      interval: "5m",
      unit: "BTC",
      denom: "base",
      nature: "STOCK",
      tsConvention: "POINT_AT_BUCKET_END",
      reduction: "POINT",
      quantityField: "NA",
      labelShift: 300_000,
      aggregationScope: "Symbol",
      verifiedBy: "test_open_interest_catalog.py::test_binance_open_interest_key",
    },
    nativeGrid: "5min",
    maxStalenessMs: 600_000,
    priceUse: null,
    reconstructedFrom: null,
    publishedError: null,
  };
  assertValidCatalogEntry(entry);
  return entry;
}

/** The catalog a real render sees, in the order `use_cases/series_catalog.py` builds it — the
 * long/short row is APPENDED LAST (`RS-1`: ordem é forma, e ela foi anexada), so a selector
 * resolved by position would be wrong in a way this fixture can show. */
const CATALOG: readonly SeriesCatalogEntry[] = [binanceOpenInterestEntry(), longShortEntry()];

// ── The selector ──────────────────────────────────────────────────────────────────────────────

test("the selector matches EXACTLY ONE row of the catalog the route reads", () => {
  const matches = CATALOG.filter((entry) => matchesCountLongShortRatio(entry.key));
  assert.equal(matches.length, 1, `the selector matched ${matches.length} rows, and it must match exactly 1`);
  assert.equal(matches[0]!.key.metric, LONG_SHORT_METRIC, "and it must be the long/short row");
  assert.equal(matches[0]!.key.provider, LONG_SHORT_PROVIDER, "from the ORIGIN, never from a mirror");
});

test("MORDE: dropping `provider` makes the selector AMBIGUOUS the day the third party's mirror is cataloged", () => {
  // ⛔ THE POINT IS NOT THAT THE ROW EXISTS TODAY — IT DOES NOT. It is that `metric` alone is
  // unique only ACCIDENTALLY, by the catalog's current contents, and this control shows the
  // accident. With the mirror present, the one-term selector matches two rows and
  // `resolveCatalogEntry` refuses to choose (a named absence on screen); with `provider`, the pane
  // stays on the origin `ADR-036/D3` fixes.
  const withMirror = [...CATALOG, coinalyzeLongShortMirrorEntry()];
  const oneTerm = withMirror.filter((entry) => entry.key.metric === LONG_SHORT_METRIC);
  assert.equal(oneTerm.length, 2, "without `provider` the selector must be ambiguous — if it is not, this guard is vacuous");
  const twoTerms = withMirror.filter((entry) => matchesCountLongShortRatio(entry.key));
  assert.equal(twoTerms.length, 1, "with `provider` it must stay unique");
  assert.equal(twoTerms[0]!.key.provider, "binance", "and it must be the ORIGIN's row, not the mirror's");
});

test("MORDE: dropping `metric` matches the OI row — `provider + reduction` is not enough", () => {
  const withoutMetric = CATALOG.filter(
    (entry) => entry.key.provider === LONG_SHORT_PROVIDER && entry.key.reduction === "POINT",
  );
  assert.equal(withoutMetric.length, 2, "the fixture lost a sibling — re-anchor this control");
  assert.ok(
    withoutMetric.some((entry) => entry.key.metric === "sum_open_interest"),
    "and one of them is a DIFFERENT metric of the same provider, with the same reduction",
  );
});

test("CALA: the long/short selector matches NO row the other panes own, and vice versa", () => {
  const longShort = longShortEntry();
  assert.ok(!matchesBinanceOpenInterest(longShort.key), "the long/short row must not satisfy the OI selector");
  assert.ok(!matchesKlineTakerBuyCvd(longShort.key), "nor the CVD one");
  for (const cohort of ["long", "short"] as const) {
    assert.ok(!matchesLiquidationCohort(longShort.key, cohort), "nor either liquidation leg");
  }
  assert.ok(!matchesCountLongShortRatio(binanceOpenInterestEntry().key), "and the OI row is invisible to this one");
});

test("the metric is ONE of the four L/S series, spelled — never the generic name the backend refuses", () => {
  // `series_key.FORBIDDEN_METRIC_NAMES` rejects `ls_ratio` inside `SeriesKey.__post_init__` because
  // the generic name covers four series, three with lag-1 autocorrelation of `0,99+` and one with
  // `0,0955` (`SPEC-001` §3.1). A selector spelling the generic name could not even be built.
  assert.equal(LONG_SHORT_METRIC, "count_long_short_ratio");
  for (const forbidden of ["ls_ratio", "long_short_ratio"]) {
    assert.notEqual(LONG_SHORT_METRIC, forbidden, "the generic name is not a series this repository publishes");
  }
});

// ── `RN-S1`: how many NATIVE observations the staircase carries ───────────────────────────────

/** One native observation repeated across `span` slots of the `1m` grid, all carrying the ONE
 * `available_at` the read path stamps them with (`ADR-038`) — the staircase, in miniature. */
function ladder(startMs: number, availableAt: number, value: string, span: number): readonly SeriesHistoryRow[] {
  return Array.from({ length: span }, (_unused, index) => ({
    event_time: startMs + index * 60_000,
    available_at: availableAt,
    value,
    absence: null,
    coverage: null,
  }));
}

function gap(startMs: number, span: number): readonly SeriesHistoryRow[] {
  return Array.from({ length: span }, (_unused, index) => ({
    event_time: startMs + index * 60_000,
    available_at: null,
    value: null,
    absence: "NO_SOURCE",
    coverage: null,
  }));
}

/** A window shaped like the real one: runs of DIFFERENT lengths, gaps between them, and
 * publication instants that do NOT land on the five-minute grid — `[MEDIDO 2026-09-16, GET
 * /api/v1/series-history, janela de 240 min: 240 slots, 175 com valor, 49 available_at distintos,
 * corridas de 1x1, 2x6, 3x17, 4x14 e 5x11 slots]`. */
const WIRE_ROWS: readonly SeriesHistoryRow[] = [
  ...ladder(1_789_576_440_000, 1_789_576_298_609, "1.8193", 1),
  ...gap(1_789_576_500_000, 2),
  ...ladder(1_789_576_620_000, 1_789_576_665_921, "1.8161", 3),
  ...ladder(1_789_576_800_000, 1_789_576_849_542, "1.8161", 5),
  ...gap(1_789_577_100_000, 1),
  ...ladder(1_789_577_160_000, 1_789_577_216_650, "1.8145", 4),
];
/** Four native observations in the fixture above: one per `available_at`. */
const EXPECTED_NATIVE_BARS = 4;

test("countNativeBarsByPublication counts OBSERVATIONS, not slots — one per publication", () => {
  assert.equal(countNativeBarsByPublication(WIRE_ROWS), EXPECTED_NATIVE_BARS);
  // And the wire count is the other number: 13 readable slots for 4 observations.
  const slots = nonNegativeFlowSlotsFromHistoryRows(WIRE_ROWS);
  assert.equal(countPresentSlots(slots), 13, "the fixture's ladder lengths moved — re-anchor this control");
  assert.ok(
    countPresentSlots(slots) > countNativeBarsByPublication(WIRE_ROWS),
    "if the two counts agreed there would be no staircase to correct and this suite would be vacuous",
  );
});

test("MORDE: `presentRows / 5` — the divisor the plan writes down — is WRONG for this series", () => {
  // ⛔ THE DIVISOR ASSUMES EVERY OBSERVATION OCCUPIES FIVE SLOTS. Measured against production it
  // does not: the runs are `1..5` slots long, because the next publication and the absences around
  // it cut them short. Over the real 240-minute window the divisor answers `35` where there are `49`
  // observations `[MEDIDO 2026-09-16]` — an understatement of ~28%, in the direction that makes a
  // `DoD-3` threshold read off it fail for data that exists.
  const slots = nonNegativeFlowSlotsFromHistoryRows(WIRE_ROWS);
  const byDivisor = countPresentSlots(slots) / 5;
  assert.notEqual(
    byDivisor,
    EXPECTED_NATIVE_BARS,
    "the divisor agreed with the real count on this fixture — build a fixture with unequal runs, or the control is vacuous",
  );
  assert.ok(byDivisor < EXPECTED_NATIVE_BARS, `the divisor answered ${byDivisor} for ${EXPECTED_NATIVE_BARS} observations`);
});

test("MORDE: the five-minute-grid filter — how the OI pane counts — is WRONG for this series", () => {
  // OI's observations land ON the `300_000` grid; these do not, because the ladder starts wherever
  // the publication landed (`long_short_catalog.py` measured delays of `9,6 s` and `70,8 s` on two
  // consecutive buckets). Over the real window the filter answers `11` for `49` observations
  // `[MEDIDO 2026-09-16]` — a 4,5x undercount.
  const onFiveMinuteGrid = WIRE_ROWS.filter((row) => row.value !== null && row.event_time % 300_000 === 0);
  assert.notEqual(
    onFiveMinuteGrid.length,
    EXPECTED_NATIVE_BARS,
    "the grid filter agreed with the real count — the fixture must use publications off the 5-minute grid",
  );
});

test("RN-1: an absent row contributes NO observation, and an all-absent window counts zero", () => {
  // ⛔ THE DIRECTION OF THIS RULE IS THE WHOLE POINT. An absent slot carries no `available_at`
  // (`CA-F1-5`), and counting it would let a window nobody observed report bars — the same class of
  // claim a fabricated `0` makes on the chart.
  assert.equal(countNativeBarsByPublication(gap(1_789_576_500_000, 60)), 0);
  assert.equal(countNativeBarsByPublication([]), 0, "an empty response is zero bars, not an error");
  // And a readable row lying about it (value present, `available_at` null) is not counted either:
  // there is no publication to identify the observation by.
  const malformed: readonly SeriesHistoryRow[] = [
    { event_time: 1_789_576_440_000, available_at: null, value: "1.80", absence: null, coverage: null },
  ];
  assert.equal(countNativeBarsByPublication(malformed), 0);
});

test("CALA: two DIFFERENT observations carrying the same value are still two bars", () => {
  // ⛔ A "distinct consecutive values" rule would merge them, and this series sits at `0,99+` lag-1
  // autocorrelation (`SPEC-001` §3.1) — consecutive buckets carrying the SAME quotient to four
  // decimals is the NORMAL state, not the exception. The fixture above already contains the case
  // (`1.8161` published twice, under two `available_at`), and this names it.
  const repeated = [
    ...ladder(1_789_576_620_000, 1_789_576_665_921, "1.8161", 3),
    ...ladder(1_789_576_800_000, 1_789_576_849_542, "1.8161", 5),
  ];
  assert.equal(countNativeBarsByPublication(repeated), 2, "same value, two publications — two observations");
  assert.equal(new Set(repeated.map((row) => row.value)).size, 1, "and the values really are identical");
});
