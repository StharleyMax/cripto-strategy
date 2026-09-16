/**
 * `T-05.9` — WHICH `sum_liquidation` rows the liquidation pane picks (one per leg, never a sum),
 * and WHO the operator is told the data came from (`RS-5`).
 *
 * ── THE TWO THINGS THIS FILE IS THE FALSIFIER OF ─────────────────────────────────────────────
 *
 * 1. THE LEGS COLLAPSING INTO ONE. `cohort` is a term of identity (`SPEC-001` §2.1) and
 *    `domain/liquidation_catalog.py` publishes one row per leg with the argument written out:
 *    *"a long liquidation is forced selling and a short liquidation is forced buying. Their sum is
 *    a 'liquidation volume' that moves identically whether the market just flushed longs, flushed
 *    shorts, or flushed both — which is precisely the discrimination the metric exists to provide
 *    (`RF-2`)."* A selector that omits `cohort` matches BOTH rows; `resolveCatalogEntry` then
 *    refuses to choose, which is the good failure — but a selector that picked by position would
 *    draw longs under a name a reader takes for "the liquidations".
 *
 * 2. `RS-5` — third-party data read as first-party data. After `GA-7`, `sum_liquidation` is the
 *    ONLY third-party series of this feature (`SPEC-007` §7), so this pane is the only one that
 *    owes the label. The rule tested here is the one `view-model.ts` states: ORIGIN means the
 *    venue's OWN publisher AND not a reconstruction; everything else is DECLARED.
 *
 * ── THE FIXTURE IS A TRANSCRIPTION, AND THE DRIFT GUARD IS THE E2E ───────────────────────────
 *
 * The two liquidation rows are transcribed, term for term, from `liquidation_catalog.py`
 * (`coinalyze_liquidation_key` x2) — the same independent-witness technique
 * `oi-series-selector.test.ts`/`cvd-series-selector.test.ts` use, since no cross-language import
 * exists. The transcription is CONFIRMED against the running API
 * `[MEDIDO 2026-09-16, GET /api/v1/series-catalog: n_entries=60, 8 linhas com
 *  metric="sum_liquidation", 2 delas para BTCUSDT — provider=coinalyze, venue=usdm_futures,
 *  unit=USD, denom=quote, nature=FLOW, reduction=SUM, label_shift=60000, native_grid=1min,
 *  max_staleness_ms=120000, price_use=null, reconstructed_from=null, published_error=null]`.
 * A transcription can still go stale, and this file does not pretend otherwise: the drift guard is
 * `T-05.11`'s e2e, which asks the RUNNING API for its own catalog.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { assertValidCatalogEntry, type SeriesCatalogEntry } from "../../features/s3-inspector/series-catalog.ts";
import type { SeriesProvenance } from "./panel-status.ts";
import {
  countPresentSlots,
  countZeroSlots,
  LIQUIDATION_COHORTS,
  LIQUIDATION_METRIC,
  LIQUIDATION_PROVIDER,
  matchesBinanceOpenInterest,
  matchesKlineTakerBuyCvd,
  matchesLiquidationCohort,
  ORIGIN_PROVIDER_BY_VENUE,
  resolveSeriesProvenance,
  type LiquidationCohort,
} from "./view-model.ts";

const SYMBOL = "BTCUSDT";
/** `MAX_STALENESS_MS` of `liquidation_catalog.py`: 2 x the 1-minute native bucket. */
const LIQUIDATION_MAX_STALENESS_MS = 120_000;

function liquidationEntry(cohort: string): SeriesCatalogEntry {
  const entry: SeriesCatalogEntry = {
    key: {
      provider: "coinalyze",
      venue: "usdm_futures",
      instrumentId: SYMBOL,
      metric: "sum_liquidation",
      cohort,
      interval: "1m",
      unit: "USD",
      denom: "quote",
      nature: "FLOW",
      tsConvention: "AGGREGATE_OVER_BUCKET",
      reduction: "SUM",
      quantityField: "NA",
      labelShift: 60_000,
      aggregationScope: "Symbol",
      verifiedBy: "test_liquidation_catalog.py::test_the_catalog_has_two_rows_one_per_cohort_never_a_sum",
    },
    nativeGrid: "1min",
    maxStalenessMs: LIQUIDATION_MAX_STALENESS_MS,
    priceUse: null,
    // ⛔ BOTH `null`, AND THAT IS THE MEASURED STATE, NOT A LAZY FIXTURE. `liquidation_catalog.py`
    // refuses to publish a fidelity: Binance has no REST liquidation endpoint, `!forceOrder@arr` is
    // off the critical path by `ADR-036/D4` and wrote nothing, so there is no oracle to measure
    // against and *"inventing a `(median, p99, n)` here would publish a fidelity nobody measured"*.
    reconstructedFrom: null,
    publishedError: null,
  };
  assertValidCatalogEntry(entry);
  return entry;
}

/** A Binance row from the SAME catalog — the sibling every selector below has to exclude, and the
 * `origin` case `resolveSeriesProvenance` has to tell apart from the Coinalyze one. */
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

/** A RECONSTRUCTION published by the third party — `build_coinalyze_bv_entry`
 * (`cvd_source_catalog.py:271-277`), the row `RS-5` names as its own example, with the
 * `published_error` the catalog obliges a reconstruction to carry. Present here so the provenance
 * rule is exercised against a row that is BOTH third-party AND reconstructed. */
function coinalyzeReconstructionEntry(): SeriesCatalogEntry {
  const entry: SeriesCatalogEntry = {
    key: {
      provider: "coinalyze",
      venue: "usdm_futures",
      instrumentId: SYMBOL,
      metric: "cvd_source",
      cohort: "all",
      interval: "1m",
      unit: "BTC",
      denom: "base",
      nature: "FLOW",
      tsConvention: "AGGREGATE_OVER_BUCKET",
      reduction: "SUM",
      quantityField: "NA",
      labelShift: 60_000,
      aggregationScope: "Symbol",
      verifiedBy: "test_cvd_source_catalog.py::test_coinalyze_bv_entry_declares_its_reconstruction",
    },
    nativeGrid: "1min",
    maxStalenessMs: 120_000,
    priceUse: null,
    reconstructedFrom: "aggtrade_q",
    publishedError: { medianBp: 29, p99Bp: 104, n: 120 },
  };
  assertValidCatalogEntry(entry);
  return entry;
}

/** A BINANCE row that IS a reconstruction — the case a naive "third party means not binance" rule
 * gets wrong, and the reason `resolveSeriesProvenance` takes two conditions instead of one. It is
 * hypothetical TODAY and said so; the rule is written for it because `RS-5` covers "terceiro OU
 * reconstrução", and a rule that only sees the first half fails silently on the second. */
function binanceReconstructionEntry(): SeriesCatalogEntry {
  const entry = binanceOpenInterestEntry();
  return { ...entry, reconstructedFrom: "aggtrade_q", publishedError: { medianBp: 3, p99Bp: 38, n: 120 } };
}

/** The catalog a real render sees, in the order `use_cases/series_catalog.py` builds it — the two
 * liquidation rows LAST, so a selector resolved by position would be wrong in a way this fixture
 * can show. */
const CATALOG: readonly SeriesCatalogEntry[] = [
  binanceOpenInterestEntry(),
  coinalyzeReconstructionEntry(),
  liquidationEntry("long"),
  liquidationEntry("short"),
];

// ── The selector ──────────────────────────────────────────────────────────────────────────────

test("each cohort selector matches EXACTLY ONE row of a catalog that carries both legs", () => {
  for (const cohort of LIQUIDATION_COHORTS) {
    const matches = CATALOG.filter((entry) => matchesLiquidationCohort(entry.key, cohort));
    assert.equal(matches.length, 1, `the '${cohort}' selector matched ${matches.length} rows, and it must match exactly 1`);
    assert.equal(matches[0]!.key.cohort, cohort, "and it must be the row of THAT leg");
  }
});

test("the two legs are TWO series — no row satisfies both selectors, and their union is the whole metric", () => {
  // ⛔ THE POINT IS NOT THAT THE FUNCTION WORKS. It is that "the liquidations" is not a series this
  // route can name: every `sum_liquidation` row belongs to exactly one leg, so a caller cannot
  // reach a summed one by accident.
  const both = CATALOG.filter((entry) => LIQUIDATION_COHORTS.every((c) => matchesLiquidationCohort(entry.key, c)));
  assert.equal(both.length, 0, "a row matching BOTH legs would be a net, and a net is what RF-2 forbids");
  const liquidationRows = CATALOG.filter((entry) => entry.key.metric === LIQUIDATION_METRIC);
  const covered = liquidationRows.filter((entry) =>
    LIQUIDATION_COHORTS.some((c) => matchesLiquidationCohort(entry.key, c)),
  );
  assert.equal(covered.length, liquidationRows.length, "every liquidation row belongs to one of the two legs");
  assert.equal(liquidationRows.length, 2, "the fixture lost a leg — the measurement above would be vacuous");
});

test("MORDE: dropping `cohort` from the selector makes it AMBIGUOUS, which is what the route refuses", () => {
  // The mutation is the one-term selector — literally the defect `T-03.5` found on OI and `T-02.5`
  // found on CVD, replanted on this metric. It does NOT resolve to the wrong row here; it resolves
  // to TWO, and `resolveCatalogEntry` (guarded by `oi-pane-dom-contract.test.ts`) turns two into a
  // named absence. This test pins the FIRST half: that the term is what makes it unique.
  const withoutCohort = CATALOG.filter(
    (entry) => entry.key.metric === LIQUIDATION_METRIC && entry.key.provider === LIQUIDATION_PROVIDER,
  );
  assert.equal(withoutCohort.length, 2, "without `cohort` the selector must be ambiguous — if it is not, this guard is vacuous");
});

test("MORDE: dropping `metric` matches the third party's OTHER series — `provider + cohort` is not enough", () => {
  const withoutMetric = CATALOG.filter(
    (entry) => entry.key.provider === LIQUIDATION_PROVIDER && entry.key.cohort === "all",
  );
  assert.equal(withoutMetric.length, 1, "the fixture lost the coinalyze reconstruction — re-anchor this control");
  assert.equal(withoutMetric[0]!.key.metric, "cvd_source", "and it is a DIFFERENT metric of the same provider");
});

test("CALA: the liquidation selectors match NO row the other two panels own, and vice versa", () => {
  for (const cohort of LIQUIDATION_COHORTS) {
    for (const entry of CATALOG) {
      if (!matchesLiquidationCohort(entry.key, cohort)) {
        continue;
      }
      assert.ok(!matchesBinanceOpenInterest(entry.key), "a liquidation row must not satisfy the OI selector");
      assert.ok(!matchesKlineTakerBuyCvd(entry.key), "a liquidation row must not satisfy the CVD selector");
    }
  }
  // And the reverse: the OI row the other pane draws is invisible to both liquidation selectors.
  const oiRow = binanceOpenInterestEntry();
  for (const cohort of LIQUIDATION_COHORTS) {
    assert.ok(!matchesLiquidationCohort(oiRow.key, cohort));
  }
});

test("the cohorts are the backend's two, closed — a third leg is not a value this route can ask for", () => {
  assert.deepEqual([...LIQUIDATION_COHORTS], ["long", "short"], "transcribed from liquidation_catalog.py::COHORTS");
  // `LiquidationCohort` is the tuple's element type, so this line is a TYPE assertion the compiler
  // makes, not a runtime one: uncommenting a third member would fail `tsc --noEmit --strict`.
  const cohorts: readonly LiquidationCohort[] = LIQUIDATION_COHORTS;
  assert.equal(cohorts.length, 2);
});

// ── `RS-5` — the provenance rule ──────────────────────────────────────────────────────────────

test("RS-5: the liquidation row is DECLARED third-party, and its absent published_error is carried, not hidden", () => {
  const provenance = resolveSeriesProvenance(liquidationEntry("long"));
  assert.equal(provenance.kind, "declared", "coinalyze is not the origin of a usdm_futures series — the label is owed");
  assert.deepEqual(provenance, {
    kind: "declared",
    provider: "coinalyze",
    reconstructedFrom: null,
    // ⛔ `null` TRAVELS. A shape that dropped the field when it is absent would let the screen show
    // nothing where the honest signal IS the emptiness (`liquidation_catalog.py`).
    publishedError: null,
  } satisfies SeriesProvenance);
});

test("RS-5: a Binance row of the same venue is ORIGIN — the rule is not 'everything gets a label'", () => {
  // Without this half the rule would be satisfied by a function that returns `declared` always, and
  // a label on every panel is a label nobody reads.
  assert.deepEqual(resolveSeriesProvenance(binanceOpenInterestEntry()), { kind: "origin", provider: "binance" });
});

test("RS-5: a RECONSTRUCTION is declared even when its provider IS the origin — the second half of the rule", () => {
  const provenance = resolveSeriesProvenance(binanceReconstructionEntry());
  assert.equal(provenance.kind, "declared", "a reconstruction is not the venue's own measurement, whoever computed it");
  assert.deepEqual(provenance, {
    kind: "declared",
    provider: "binance",
    reconstructedFrom: "aggtrade_q",
    publishedError: { medianBp: 3, p99Bp: 38, n: 120 },
  } satisfies SeriesProvenance);
});

test("RS-5: the third party's reconstruction carries BOTH facts and its published (median, p99, n)", () => {
  const provenance = resolveSeriesProvenance(coinalyzeReconstructionEntry());
  assert.deepEqual(provenance, {
    kind: "declared",
    provider: "coinalyze",
    reconstructedFrom: "aggtrade_q",
    publishedError: { medianBp: 29, p99Bp: 104, n: 120 },
  } satisfies SeriesProvenance);
});

test("RS-5: no entry resolves to `unresolved`, NEVER to `origin`", () => {
  // ⛔ The two are opposite claims and only one of them is a reassurance: "we could not identify the
  // series" must not render as "this is first-party data".
  assert.deepEqual(resolveSeriesProvenance(undefined), { kind: "unresolved" });
});

test("RS-5: an UNKNOWN venue is declared, not assumed to be its own origin", () => {
  const unknownVenue = {
    key: { provider: "someexchange", venue: "not_a_venue_this_repo_knows" },
    reconstructedFrom: null,
    publishedError: null,
  };
  assert.ok(!ORIGIN_PROVIDER_BY_VENUE.has(unknownVenue.key.venue), "the fixture must use a venue outside the map");
  assert.equal(
    resolveSeriesProvenance(unknownVenue).kind,
    "declared",
    "an unprovable origin must err toward the label — a missing label is a third party read as first-party data",
  );
});

test("MORDE: a 'provider === coinalyze' rule would pass the two live cases and FAIL the hypothetical one", () => {
  // The cheap rule everyone writes first, replanted and shown to be wrong. It agrees with
  // `resolveSeriesProvenance` on all THREE rows of today's catalog — which is exactly why a suite
  // built only on today's catalog would never catch it — and disagrees on the Binance
  // reconstruction, where it withholds a label `RS-5` demands.
  const naive = (entry: SeriesCatalogEntry): boolean => entry.key.provider === "coinalyze";
  for (const entry of CATALOG) {
    assert.equal(
      naive(entry),
      resolveSeriesProvenance(entry).kind === "declared",
      "the naive rule was supposed to AGREE on today's catalog — if it does not, re-anchor this control",
    );
  }
  const reconstruction = binanceReconstructionEntry();
  assert.equal(naive(reconstruction), false, "the naive rule withholds the label");
  assert.equal(resolveSeriesProvenance(reconstruction).kind, "declared", "the real rule owes it");
});

// ── The two counts the pane publishes ─────────────────────────────────────────────────────────

test("countZeroSlots separates the LEGITIMATE ZERO from the absence, and from a positive value", () => {
  // `ZL-3` of `domain/liquidation_zero_legitimacy.py`: a legitimate zero is a real observation and
  // must be representable as one, distinguishable from `NO_SOURCE` BY TYPE.
  const slots = [
    { time: 0, value: null },
    { time: 60_000, value: 0 },
    { time: 120_000, value: 1_234.5 },
    { time: 180_000, value: null },
    { time: 240_000, value: -0 },
  ];
  assert.equal(countPresentSlots(slots), 3, "an observation is a value, zero included");
  assert.equal(countZeroSlots(slots), 2, "`-0 === 0`: a provider that reported -0 reported zero");
  // ⛔ AND THE TWO ARE NOT THE SAME NUMBER. A pane publishing only `presentPoints` over the real
  // 4-day window would quote `191` where `62` of them are zeros `[MEDIDO 2026-09-16]`.
  assert.notEqual(countPresentSlots(slots), countZeroSlots(slots));
  assert.ok(countZeroSlots(slots) <= countPresentSlots(slots), "a zero is a present slot — the counts nest");
});

test("countZeroSlots on an all-absent grid is 0, and so is countPresentSlots — absence is never zero", () => {
  // The state 94,7% of this series' grid is in `[MEDIDO 2026-09-16: 1.365 ausentes de 1.441]`. If
  // absence leaked into either count, the pane would claim observations it never made.
  const allAbsent = [0, 60_000, 120_000].map((time) => ({ time, value: null }));
  assert.equal(countPresentSlots(allAbsent), 0);
  assert.equal(countZeroSlots(allAbsent), 0);
});
