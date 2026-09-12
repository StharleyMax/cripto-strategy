/**
 * `T-02.5` — WHICH of the four `cvd_source` rows the CVD panel picks, tested against a catalog
 * that contains all four.
 *
 * ── WHY THIS FILE, AND WHY IT IS NOT A SOURCE SCAN ───────────────────────────────────────────
 *
 * The defect this guards is the one fase `04` of `pagina-de-grafico-s2` had to find IN
 * PRODUCTION, by hand, with every gate green: `/symbol` was wired to a series nobody publishes,
 * so the route answered `200`, the panel rendered, and every number on it was absent. A selector
 * is exactly the kind of code that fails that way — it returns a WRONG ROW instead of throwing,
 * and a wrong row answers `200` with an all-absent grid.
 *
 * `page.tsx` cannot be imported by a `node --test` suite (Next Server Component, route-level
 * `metadata`/`dynamic` exports), which is why the predicate lives in `view-model.ts` and is
 * imported HERE, executed for real — not scanned as text. The text scan that page.tsx still gets
 * (`cvd-pane-dom-contract.test.ts`) only proves the predicate is the one being CALLED.
 *
 * ── THE FIXTURE IS A TRANSCRIPTION, AND THE DRIFT GUARD IS THE E2E ───────────────────────────
 *
 * The four rows below are transcribed, term for term, from
 * `backend/src/modules/sentimento/domain/cvd_source_catalog.py` (`build_aggtrade_q_entry`,
 * `build_aggtrade_nq_entry`, `build_coinalyze_bv_entry`, `build_kline_takerbuy_entry`) — same
 * independent-witness technique `series-catalog.ts` itself uses for `SERIES_KEY_TERMS`, since no
 * cross-language import exists. A transcription can go stale, and this file does NOT pretend
 * otherwise: the drift guard is `e2e/10-cvd-dado-real.spec.ts`, which asks the RUNNING API for
 * its own catalog and requires the predicate to match EXACTLY ONE row of it per symbol.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { assertValidCatalogEntry, type SeriesCatalogEntry } from "../../features/s3-inspector/series-catalog.ts";
import { matchesKlineTakerBuyCvd } from "./view-model.ts";

const SYMBOL = "BTCUSDT";

function cvdSourceEntry(
  name: string,
  overrides: {
    readonly provider: string;
    readonly quantityField: "q" | "nq" | "NA";
    readonly reconstructedFrom?: string;
  },
): { readonly name: string; readonly entry: SeriesCatalogEntry } {
  const entry: SeriesCatalogEntry = {
    key: {
      provider: overrides.provider,
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
      quantityField: overrides.quantityField,
      labelShift: 0,
      aggregationScope: "Symbol",
      verifiedBy: `test_cvd_source_catalog.py::${name}`,
    },
    nativeGrid: "1min",
    maxStalenessMs: 120_000,
    priceUse: null,
    reconstructedFrom: overrides.reconstructedFrom ?? null,
    publishedError:
      overrides.reconstructedFrom === undefined ? null : { medianBp: 0, p99Bp: 38.52, n: 120 },
  };
  // The fixture is refused by the SAME rules the real catalog is (`__post_init__`'s mirror), so a
  // typo here fails this test instead of quietly teaching the selector a shape that cannot exist.
  assertValidCatalogEntry(entry);
  return { name, entry };
}

/** The four `cvd_source` rows of ONE instrument, in the order `series_catalog.py` appends them —
 * `kline_takerbuy` LAST, which is precisely why `Array.prototype.find` on `metric` alone answers
 * the wrong one. */
const CVD_SOURCE_ROWS = [
  cvdSourceEntry("aggtrade_q", { provider: "binance", quantityField: "q" }),
  cvdSourceEntry("aggtrade_nq", { provider: "binance", quantityField: "nq" }),
  cvdSourceEntry("coinalyze_bv", { provider: "coinalyze", quantityField: "NA", reconstructedFrom: "aggtrade_q" }),
  cvdSourceEntry("kline_takerbuy", { provider: "binance", quantityField: "NA" }),
] as const;

test("the predicate matches EXACTLY ONE of the four cvd_source rows, and it is kline_takerbuy", () => {
  const matched = CVD_SOURCE_ROWS.filter((row) => matchesKlineTakerBuyCvd(row.entry.key));
  assert.equal(matched.length, 1, `expected 1 match, got ${matched.map((row) => row.name).join(", ") || "none"}`);
  assert.equal(matched[0]!.name, "kline_takerbuy");
});

test("the row it picks is the DIRECT read, not the reconstruction — reconstructedFrom is null", () => {
  // `T-02.1` measured this before the identity was written: `n=4.320` buckets, `276` divergent
  // runs, ZERO with a residual — every divergence MOVES a boundary trade between two adjacent
  // minutes, none creates or destroys quantity. So the row is not a reconstruction and carries no
  // `published_error`. Selecting `coinalyze_bv` instead would put a reconstruction on screen with
  // no error band, which is the `D6.9` pairing this assertion keeps honest from the reader's side.
  const picked = CVD_SOURCE_ROWS.find((row) => matchesKlineTakerBuyCvd(row.entry.key))!;
  assert.equal(picked.entry.reconstructedFrom, null);
  assert.equal(picked.entry.publishedError, null);
  assert.equal(picked.entry.key.nature, "FLOW", "nature FLOW is the contract RN-1's SEM_PONTO hangs on");
});

test("MORDE: each of the three terms is load-bearing — dropping any one selects a DIFFERENT row", () => {
  // Each weaker predicate is what a reviewer might call "the same filter, simpler". Each one
  // answers a row this repository publishes NO data for, i.e. an all-absent panel and a green gate.
  const weaker: readonly { readonly name: string; readonly predicate: (key: SeriesCatalogEntry["key"]) => boolean }[] = [
    { name: "metric only", predicate: (key) => key.metric === "cvd_source" },
    { name: "metric + provider (no quantityField)", predicate: (key) => key.metric === "cvd_source" && key.provider === "binance" },
    { name: "metric + quantityField (no provider)", predicate: (key) => key.metric === "cvd_source" && key.quantityField === "NA" },
  ];
  for (const candidate of weaker) {
    const first = CVD_SOURCE_ROWS.find((row) => candidate.predicate(row.entry.key));
    assert.ok(first !== undefined, `"${candidate.name}" matched nothing — the fixture drifted`);
    assert.notEqual(
      first.name,
      "kline_takerbuy",
      `"${candidate.name}" happens to pick the right row in this fixture — the term it drops is then ` +
        "untested, so either the fixture or the predicate is wrong",
    );
  }
});

test("CALA: the predicate stays silent on every row that is not a cvd_source row at all", () => {
  // The other metrics of the same instrument's block — a predicate that widened by accident
  // (e.g. `metric.startsWith("cvd")` or a provider-only check) would light up here.
  for (const metric of ["klines_volume", "klines_last", "sum_open_interest", "price_mark_close"]) {
    const key = { ...CVD_SOURCE_ROWS[3]!.entry.key, metric };
    assert.equal(matchesKlineTakerBuyCvd(key), false, `${metric} must not be read as the CVD series`);
  }
});
