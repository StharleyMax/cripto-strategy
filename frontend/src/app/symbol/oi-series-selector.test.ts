/**
 * `T-03.5` — WHICH of the five `sum_open_interest` rows the OI panel picks, tested against a
 * catalog that contains all five.
 *
 * ── THE DEFECT THIS FILE IS THE FALSIFIER OF, MEASURED ───────────────────────────────────────
 *
 * `page.tsx` asked for `metric === "sum_open_interest"` and `findCatalogEntry` answered with
 * `Array.prototype.find`. The served catalog carries FIVE rows of that metric per instrument
 * (`domain/open_interest_catalog.py`, `CA-F2-17`), the four Coinalyze OHLC ones FIRST, so the
 * panel pointed at `coinalyze`/`OPEN` — `0` rows in `md.series` — while `binance`/`POINT` had
 * `8.064` `[MEDIDO 2026-09-12, handoff/T-03.5-T-03.6-FRONT.md §2]`. The route answered `200`, the
 * panel rendered, every number on it was `SEM_PONTO`, and no gate could see it.
 *
 * This is the SECOND time the same class of defect shipped on this route (`cvd_source`, fase
 * `02`, `cvd-series-selector.test.ts`'s own header). Twice is a class, so besides the predicate
 * below there is a STRUCTURAL half in `page.tsx`: `resolveCatalogEntry` refuses a selector that
 * matches more than one row instead of resolving it by position. This file tests the predicate;
 * `oi-pane-dom-contract.test.ts` tests that the route calls it and that `find` is gone.
 *
 * ── THE FIXTURE IS A TRANSCRIPTION, AND THE DRIFT GUARD IS THE E2E ───────────────────────────
 *
 * The five rows are transcribed, term for term, from `open_interest_catalog.py`
 * (`coinalyze_open_interest_key` x4, `binance_open_interest_key` x1) — the same
 * independent-witness technique `cvd-series-selector.test.ts` uses, since no cross-language
 * import exists. A transcription can go stale, and this file does not pretend otherwise: the
 * drift guard is `e2e/12-oi-dado-real.spec.ts`, which asks the RUNNING API for its own catalog
 * and requires this predicate to match EXACTLY ONE row of it per symbol.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertValidCatalogEntry,
  type Reduction,
  type SeriesCatalogEntry,
} from "../../features/s3-inspector/series-catalog.ts";
import {
  deriveOiProvenanceLabel,
  matchesBinanceOpenInterest,
  openInterestAdr036D2Violations,
  OPEN_INTEREST_ADR_036_D2_INVARIANTS,
} from "./view-model.ts";

const SYMBOL = "BTCUSDT";
/** `_MAX_STALENESS_MS` of `open_interest_catalog.py`: 2 x the 5-minute native bucket. The number
 * `RNF-2` judges the pane's freshness against, transcribed here so this fixture is the same
 * shape the real catalog serves (`maxStalenessMs` is not part of the SELECTION, but a fixture
 * that lied about it would teach the next reader a wrong ceiling). */
const OPEN_INTEREST_MAX_STALENESS_MS = 600_000;

function openInterestEntry(
  name: string,
  overrides: {
    readonly provider: string;
    readonly reduction: Reduction;
    readonly tsConvention: "OHLC_OVER_BUCKET" | "POINT_AT_BUCKET_END";
  },
): { readonly name: string; readonly entry: SeriesCatalogEntry } {
  const entry: SeriesCatalogEntry = {
    key: {
      provider: overrides.provider,
      venue: "usdm_futures",
      instrumentId: SYMBOL,
      metric: "sum_open_interest",
      cohort: "all",
      interval: "5m",
      unit: "BTC",
      denom: "base",
      nature: "STOCK",
      tsConvention: overrides.tsConvention,
      reduction: overrides.reduction,
      quantityField: "NA",
      labelShift: 300_000,
      aggregationScope: "Symbol",
      verifiedBy: `test_open_interest_catalog.py::${name}`,
    },
    nativeGrid: "5min",
    maxStalenessMs: OPEN_INTEREST_MAX_STALENESS_MS,
    priceUse: null,
    reconstructedFrom: null,
    publishedError: null,
  };
  // Refused by the SAME rules the real catalog is (`__post_init__`'s mirror), so a typo here
  // fails this test instead of quietly teaching the selector a shape that cannot exist.
  assertValidCatalogEntry(entry);
  return { name, entry };
}

/** The five `sum_open_interest` rows of ONE instrument, in the order
 * `open_interest_catalog_entries` builds them — the four Coinalyze OHLC rows FIRST, which is
 * precisely why `Array.prototype.find` on `metric` alone answered the wrong one. */
const OPEN_INTEREST_ROWS = [
  openInterestEntry("coinalyze_open", { provider: "coinalyze", reduction: "OPEN", tsConvention: "OHLC_OVER_BUCKET" }),
  openInterestEntry("coinalyze_high", { provider: "coinalyze", reduction: "HIGH", tsConvention: "OHLC_OVER_BUCKET" }),
  openInterestEntry("coinalyze_low", { provider: "coinalyze", reduction: "LOW", tsConvention: "OHLC_OVER_BUCKET" }),
  openInterestEntry("coinalyze_close", { provider: "coinalyze", reduction: "CLOSE", tsConvention: "OHLC_OVER_BUCKET" }),
  openInterestEntry("binance_point", { provider: "binance", reduction: "POINT", tsConvention: "POINT_AT_BUCKET_END" }),
] as const;

test("the predicate matches EXACTLY ONE of the five sum_open_interest rows, and it is the Binance POINT", () => {
  const matched = OPEN_INTEREST_ROWS.filter((row) => matchesBinanceOpenInterest(row.entry.key));
  assert.equal(matched.length, 1, `expected 1 match, got ${matched.map((row) => row.name).join(", ") || "none"}`);
  assert.equal(matched[0]!.name, "binance_point");
  // `ADR-036/D2`: the source of M2 is the ORIGIN, and the origin publishes one reading per
  // bucket, at its close. A row whose `ts_convention` is `OHLC_OVER_BUCKET` is a different
  // quantity, not the same number formatted differently (`D6.8` measured `o(t) = c(t-300)` in 6
  // of 2.141 pairs — they are genuinely distinct series).
  assert.equal(matched[0]!.entry.key.tsConvention, "POINT_AT_BUCKET_END");
  assert.equal(matched[0]!.entry.key.nature, "STOCK", "nature STOCK is what the held-reading policy hangs on");
});

test("MORDE: the ONE-TERM selector that shipped picks a DIFFERENT row — and it matches five", () => {
  // The exact expression `page.tsx` carried until `T-03.5`. Not paraphrased: it is what a
  // reviewer would call "the same filter, simpler".
  const oneTerm = (key: SeriesCatalogEntry["key"]) => key.metric === "sum_open_interest";
  const allMatches = OPEN_INTEREST_ROWS.filter((row) => oneTerm(row.entry.key));
  assert.equal(allMatches.length, 5, "one term matches every row of the metric — that is the defect");
  const chosenByFind = OPEN_INTEREST_ROWS.find((row) => oneTerm(row.entry.key));
  assert.equal(chosenByFind!.name, "coinalyze_open", "`find` answers the FIRST, which is the empty series");
  assert.notEqual(
    chosenByFind!.name,
    OPEN_INTEREST_ROWS.filter((row) => matchesBinanceOpenInterest(row.entry.key))[0]!.name,
    "if the weak selector happened to pick the right row, this fixture would prove nothing",
  );
});

test("MORDE: `provider` is the load-bearing term TODAY — dropping it re-selects the empty series", () => {
  const withoutProvider = (key: SeriesCatalogEntry["key"]) =>
    key.metric === "sum_open_interest" && key.reduction === "POINT";
  const withoutReduction = (key: SeriesCatalogEntry["key"]) =>
    key.metric === "sum_open_interest" && key.provider === "binance";

  // ⛔ THE HONEST PART, and the reason this test is not a copy of the CVD one: against TODAY'S
  // catalog `provider` and `reduction` exclude the SAME four rows, so each of these two weaker
  // predicates still answers the right row. Asserting "dropping any term picks a different row"
  // here would be FALSE, and a test that asserts something false about the fixture it ships with
  // is worse than no test.
  assert.equal(OPEN_INTEREST_ROWS.filter((row) => withoutProvider(row.entry.key)).length, 1);
  assert.equal(OPEN_INTEREST_ROWS.filter((row) => withoutReduction(row.entry.key)).length, 1);

  // What IS load-bearing, and what this asserts: each term excludes the four Coinalyze rows on
  // its own, so the predicate survives the loss of either one — and `metric` alone, which
  // survives the loss of BOTH, does not. That is the real claim.
  const coinalyzeRows = OPEN_INTEREST_ROWS.filter((row) => row.entry.key.provider === "coinalyze");
  assert.equal(coinalyzeRows.length, 4, "sanity: four siblings to be excluded");
  for (const row of coinalyzeRows) {
    assert.equal(matchesBinanceOpenInterest(row.entry.key), false, `${row.name} must not match`);
    assert.equal(withoutProvider(row.entry.key), false, `${row.name}: reduction alone already excludes it`);
    assert.equal(withoutReduction(row.entry.key), false, `${row.name}: provider alone already excludes it`);
  }
});

test("MORDE: the day the catalog grows a Binance OHLC row, the two-term selector goes ambiguous and this one does not", () => {
  // NOT hypothetical for this metric: the catalog ALREADY publishes open interest under four
  // reductions — from the other provider. `reduction` is the axis this metric is keyed by
  // (`coinalyze_open_interest_key` makes it a required, defaultless argument, `D6.7`), so the
  // row below is the natural next append, not an invented one.
  const future = [
    ...OPEN_INTEREST_ROWS,
    openInterestEntry("binance_close", { provider: "binance", reduction: "CLOSE", tsConvention: "OHLC_OVER_BUCKET" }),
  ];
  assert.equal(
    future.filter((row) => row.entry.key.metric === "sum_open_interest" && row.entry.key.provider === "binance").length,
    2,
    "two terms would match two rows — and `find` would keep answering, silently, with one of them",
  );
  const matched = future.filter((row) => matchesBinanceOpenInterest(row.entry.key));
  assert.equal(matched.length, 1, "three terms still identify ONE series");
  assert.equal(matched[0]!.name, "binance_point", "and it is still the one the collector writes");
});

test("MORDE: position is NOT used — the predicate survives a permuted catalog", () => {
  // `RS-1`: the ORDER of `"entries"` is FORM, stable by append. A selector that depended on it
  // would turn "acrescentar uma linha" into a silent re-pointing of this panel — the same class
  // of defect one level up, which is why "pegue o índice 9" was refused as the fix.
  const reversed = [...OPEN_INTEREST_ROWS].reverse();
  const matched = reversed.filter((row) => matchesBinanceOpenInterest(row.entry.key));
  assert.equal(matched.length, 1);
  assert.equal(matched[0]!.name, "binance_point");
  // ...while the one-term selector answers a DIFFERENT row in the reversed list than in the
  // original one. Positional selection is not merely fragile: it is not even a function of the
  // catalog's content.
  assert.equal(reversed.find((row) => row.entry.key.metric === "sum_open_interest")!.name, "binance_point");
  assert.equal(OPEN_INTEREST_ROWS.find((row) => row.entry.key.metric === "sum_open_interest")!.name, "coinalyze_open");
});

// ── `T-04.1`/`RN-5`/`CA-9`/`CA-10` — THE RÓTULO IS DERIVED FROM THE KEY THIS FILE ALREADY
// SELECTS, NEVER WRITTEN BY HAND ────────────────────────────────────────────────────────────
//
// The owner circled the defect in red: `108.135,34` on screen under the unlabelled words "Open
// Interest (5m)" against `27,656 B` on the Coinalyze dashboard — both correct, both measuring
// something different (contracts in BTC on one exchange vs. notional USD aggregated across many,
// over a different cohort). `deriveOiProvenanceLabel` is what the pane's rótulo is built from;
// these tests are `CA-10`'s ablation, run directly against the pure function rather than through
// a DOM render (that half is `oi-pane-dom-contract.test.ts`).

test("T-04.1: today's REAL Binance OI row spells contracts, single-exchange, cohort 'all'", () => {
  const matched = OPEN_INTEREST_ROWS.filter((row) => matchesBinanceOpenInterest(row.entry.key))[0]!;
  const label = deriveOiProvenanceLabel(matched.entry.key);
  assert.deepEqual(label, { grandeza: "contracts (BTC)", universo: "binance/usdm_futures", coorte: "all" });
});

test("CA-10 (ablation): a different `denom` flips grandeza from contracts to notional — nothing else moves", () => {
  const contracts = { unit: "BTC", denom: "base", provider: "binance", venue: "usdm_futures", cohort: "all" } as const;
  const notional = { ...contracts, denom: "quote", unit: "USD" } as const;
  const contractsLabel = deriveOiProvenanceLabel(contracts);
  const notionalLabel = deriveOiProvenanceLabel(notional);
  assert.equal(contractsLabel?.grandeza, "contracts (BTC)");
  assert.equal(notionalLabel?.grandeza, "notional (USD)");
  assert.equal(contractsLabel?.universo, notionalLabel?.universo, "universo did not move — only denom/unit changed");
  assert.equal(contractsLabel?.coorte, notionalLabel?.coorte, "coorte did not move — only denom/unit changed");
});

test("CA-10 (ablation): a different `provider`/`venue` changes universo ONLY", () => {
  const origin = { unit: "BTC", denom: "base", provider: "binance", venue: "usdm_futures", cohort: "all" } as const;
  const aggregate = { ...origin, provider: "coinalyze", venue: "aggregated" } as const;
  assert.notEqual(deriveOiProvenanceLabel(origin)?.universo, deriveOiProvenanceLabel(aggregate)?.universo);
  assert.equal(deriveOiProvenanceLabel(origin)?.grandeza, deriveOiProvenanceLabel(aggregate)?.grandeza);
  assert.equal(deriveOiProvenanceLabel(origin)?.coorte, deriveOiProvenanceLabel(aggregate)?.coorte);
});

test("CA-10 (ablation): a different `cohort` changes coorte ONLY", () => {
  const all = { unit: "BTC", denom: "base", provider: "binance", venue: "usdm_futures", cohort: "all" } as const;
  const stableAndCoinMargined = { ...all, cohort: "stablecoin_coin_margined" } as const;
  assert.notEqual(deriveOiProvenanceLabel(all)?.coorte, deriveOiProvenanceLabel(stableAndCoinMargined)?.coorte);
  assert.equal(deriveOiProvenanceLabel(all)?.grandeza, deriveOiProvenanceLabel(stableAndCoinMargined)?.grandeza);
  assert.equal(deriveOiProvenanceLabel(all)?.universo, deriveOiProvenanceLabel(stableAndCoinMargined)?.universo);
});

test("RN-5: no entry resolved (`undefined` key) answers `null` — never a fabricated label", () => {
  assert.equal(deriveOiProvenanceLabel(undefined), null);
});

test("DoD-3 sanity: every term the derivation can produce today is ASCII — it feeds a machine data-fact", () => {
  const label = deriveOiProvenanceLabel({
    unit: "BTC",
    denom: "base",
    provider: "binance",
    venue: "usdm_futures",
    cohort: "all",
  })!;
  // `no-control-regex` refuses a `\x00-\x7F` class, so the check is a scan, not a regex — the
  // same class of instrument `harness rules` itself would apply to any FUTURE detector `CLAUDE.md`
  // §"Idioma de identificador" reopens; this one only ever runs inside this test.
  const isAscii = (value: string) => [...value].every((char) => char.charCodeAt(0) <= 0x7f);
  assert.ok(isAscii(label.grandeza), `non-ASCII byte in grandeza: ${label.grandeza}`);
  assert.ok(isAscii(label.universo), `non-ASCII byte in universo: ${label.universo}`);
  assert.ok(isAscii(label.coorte), `non-ASCII byte in coorte: ${label.coorte}`);
});

// ── `T-04.2`/`C-4`/`DoD-5` — THE ENVELOPE IS A CONTRACT: `ADR-036/D2` STAYS INTACT ─────────────
//
// `RF-8`'s label above already SPELLS whatever the resolved key carries; these tests are the
// other half `C-4` asks for — that the four terms `ADR-036/D2` fixes (origin, contracts, single
// instrument) actually HOLD for the row this file's own selector picks, and that a fixture (or,
// one day, the real catalog) drifting from them is caught here, loudly, rather than reaching the
// pane as a quietly re-labelled number.

test("DoD-5: today's REAL Binance OI row honors ADR-036/D2 — origin, contracts, single instrument", () => {
  const matched = OPEN_INTEREST_ROWS.filter((row) => matchesBinanceOpenInterest(row.entry.key))[0]!;
  const violations = openInterestAdr036D2Violations(matched.entry.key);
  assert.deepEqual(
    violations,
    [],
    `ADR-036/D2 no longer holds for the resolved OI row: ${violations.join(", ")} — this is F5 arriving, ` +
      "and F5 is out of this plan by [DECISÃO-OWNER: 2026-09-19], not something this pane may absorb silently",
  );
  // Sanity on the invariants themselves — BTC/base/Symbol, never USD/quote/an aggregate scope.
  assert.deepEqual(OPEN_INTEREST_ADR_036_D2_INVARIANTS, {
    provider: "binance",
    unit: "BTC",
    denom: "base",
    aggregationScope: "Symbol",
  });
});

test("MORDE (DoD-5): a row that drifted from ADR-036/D2 is named, term by term", () => {
  const origin = { provider: "binance", unit: "BTC", denom: "base", aggregationScope: "Symbol" } as const;
  assert.deepEqual(openInterestAdr036D2Violations(origin), [], "sanity: the honest row has zero violations");

  // `F5` in miniature: a third-party aggregate, nocional, over more than one instrument — the
  // exact shape `SPEC-008` §8.1 says the owner did NOT choose.
  const aggregateNotional = { provider: "coinalyze", unit: "USD", denom: "quote", aggregationScope: "Aggregate" };
  const violations = openInterestAdr036D2Violations(aggregateNotional);
  assert.equal(violations.length, 4, "all four terms disagree — none of the four checks is dead code");
  assert.ok(violations.some((line) => line.startsWith("provider=coinalyze")));
  assert.ok(violations.some((line) => line.startsWith("unit=USD")));
  assert.ok(violations.some((line) => line.startsWith("denom=quote")));
  assert.ok(violations.some((line) => line.startsWith("aggregationScope=Aggregate")));

  // A SINGLE term drifting (Binance quietly re-publishing OI as nocional, origin unchanged) is
  // named on its own — the check does not require every term to fail to say something.
  const denomOnly = { ...origin, denom: "quote" };
  assert.deepEqual(openInterestAdr036D2Violations(denomOnly), [
    `denom=quote (expected ${OPEN_INTEREST_ADR_036_D2_INVARIANTS.denom})`,
  ]);
});
