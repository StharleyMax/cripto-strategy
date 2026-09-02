// Tests for `T-07.14` — TS port of `universe_at.py` (`SPEC-001` §3.7) + the delisting-badge
// extension this task adds.
//
// Run with: npm --prefix frontend run test:app (or node --test 'src/app/*.test.ts')
//
// Real data, not synthetic (handoff, "Casos de teste obrigatorios" — mandatory test cases):
// the three fixtures below are read directly from `data/snapshots/`, catalogued in
// `data/MANIFEST.md`. None of them is rewritten or mocked — the same discipline
// `test_universe_at.py` applies via `require_fixture`, and `ingest-health-query.test.ts`
// applies by resolving its path from `fileURLToPath`, never from `cwd`.

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildSnapshotWitnessRows,
  compareSymbolSets,
  decideUniverseMembership,
  DELISTING_SENTINEL_DELIVERY_DATE,
  deliveryDateBySymbol,
  filterMatches,
  hasScheduledDelisting,
  MARKET_COIN_M,
  MARKET_USDS_M,
  NO_FILTER,
  PREMIUM_INDEX_WITNESS,
  RETROSPECTIVE_LABEL,
  S3_INFERRED,
  SNAPSHOT,
  stampUniverseRows,
  universeAt,
  type DecisiveUniverseSource,
  type RawExchangeInfoPayload,
  type RawFundingInfoEntry,
  type SnapshotWitnessRow,
} from "./universe-at.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "../../..");

function readJson<T>(relativeToRepoRoot: string): T {
  const absolute = path.join(REPO_ROOT, relativeToRepoRoot);
  let raw: string;
  try {
    raw = readFileSync(absolute, "utf8");
  } catch (error) {
    throw new Error(
      `T-07.14 fixture missing: ${absolute}. Catalogued in data/MANIFEST.md — ` +
        `this test never falls back to synthetic data silently.`,
      { cause: error },
    );
  }
  return JSON.parse(raw) as T;
}

// ── Real fixture: `data/snapshots/2026-08-25_exchangeInfo.json` — 877 symbols, the capture
// the handoff cites as the source of the sentinel and of the 3 symbols with a real delisting ─

const EXCHANGE_INFO_0825 = readJson<RawExchangeInfoPayload>("data/snapshots/2026-08-25_exchangeInfo.json");
const FUNDING_INFO_0825 = readJson<readonly RawFundingInfoEntry[]>("data/snapshots/2026-08-25_fundingInfo.json");
const SNAPSHOT_ROWS_0825: readonly SnapshotWitnessRow[] = buildSnapshotWitnessRows(
  EXCHANGE_INFO_0825,
  FUNDING_INFO_0825,
);

// ── Sanity on the fixture itself, so a future re-capture that silently changes it is caught
// here rather than by a confusing failure three tests down ─────────────────────────────────

test("fixture sanity: 2026-08-25 exchangeInfo has 877 symbols, matching data/MANIFEST.md", () => {
  assert.equal(EXCHANGE_INFO_0825.symbols.length, 877);
});

// ── The task's own anchor case: ICXUSDT/STORJUSDT/SCRTUSDT get the badge, BTCUSDT does not ─

test("delisting sentinel: BTCUSDT carries the sentinel deliveryDate, no badge", () => {
  const deliveryDates = deliveryDateBySymbol(EXCHANGE_INFO_0825);
  assert.equal(deliveryDates.get("BTCUSDT"), DELISTING_SENTINEL_DELIVERY_DATE);
  assert.equal(hasScheduledDelisting(deliveryDates.get("BTCUSDT")!), false);
});

test("delisting sentinel: ICXUSDT/STORJUSDT/SCRTUSDT carry a real deliveryDate, badge fires", () => {
  const deliveryDates = deliveryDateBySymbol(EXCHANGE_INFO_0825);
  for (const symbol of ["ICXUSDT", "STORJUSDT", "SCRTUSDT"]) {
    const deliveryDate = deliveryDates.get(symbol);
    assert.notEqual(deliveryDate, undefined, `${symbol} missing from the fixture`);
    assert.notEqual(deliveryDate, DELISTING_SENTINEL_DELIVERY_DATE, `${symbol} unexpectedly carries the sentinel`);
    assert.equal(hasScheduledDelisting(deliveryDate!), true, `${symbol} should show the badge`);
  }
});

test("stampUniverseRows carries the delisting badge only for the three real-delisting symbols, not for BTCUSDT", () => {
  const result = universeAt("2026-08-25", null, { snapshotRows: SNAPSHOT_ROWS_0825 });
  const rows = stampUniverseRows(result, EXCHANGE_INFO_0825);
  const bySymbol = new Map(rows.map((row) => [row.symbol, row]));

  for (const symbol of ["ICXUSDT", "STORJUSDT", "SCRTUSDT"]) {
    const row = bySymbol.get(symbol);
    assert.ok(row, `${symbol} missing from stamped rows`);
    assert.equal(row!.delistingBadge, true, `${symbol} should carry the badge`);
    assert.deepEqual(row!.universeSource, [SNAPSHOT]);
  }

  const btc = bySymbol.get("BTCUSDT");
  assert.ok(btc);
  assert.equal(btc!.delistingBadge, false);
  assert.deepEqual(btc!.universeSource, [SNAPSHOT]);
});

test("universe_source is stamped on EVERY output row — never absent (task title, literal)", () => {
  const result = universeAt("2026-08-25", null, { snapshotRows: SNAPSHOT_ROWS_0825 });
  const rows = stampUniverseRows(result, EXCHANGE_INFO_0825);
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.ok(row.universeSource.length > 0, `${row.symbol} has an empty universeSource`);
  }
});

// ── T-07.8's own retrospective case (same pattern, `ts` before the first snapshot) ────────

test("retrospective case: no snapshot witness for 2025-08-01 -> RETROSPECTIVE_LABEL, decided empty", () => {
  const s3Witness = new Set(["BTCUSDT", "ETHUSDT", "ICXUSDT"]);
  const result = universeAt("2025-08-01", null, { snapshotRows: null, s3WitnessSymbols: s3Witness });

  assert.ok(result.symbols.has("ICXUSDT"));
  assert.ok(!result.symbols.has("DOSUSDT"));
  assert.deepEqual([...result.decidedSymbols], []);
  assert.equal(result.label, RETROSPECTIVE_LABEL);
  assert.deepEqual(result.divergence.onlyInSecond, [...s3Witness].sort());
  assert.deepEqual(result.divergence.onlyInFirst, []);
});

test("retrospective case: stampUniverseRows never claims a badge with no exchangeInfo to read", () => {
  const s3Witness = new Set(["BTCUSDT", "ETHUSDT", "ICXUSDT"]);
  const result = universeAt("2025-08-01", null, { snapshotRows: null, s3WitnessSymbols: s3Witness });
  const rows = stampUniverseRows(result, null);
  const icx = rows.find((row) => row.symbol === "ICXUSDT");

  assert.ok(icx);
  assert.deepEqual(icx!.universeSource, [S3_INFERRED]);
  assert.equal(icx!.deliveryDate, null);
  // ICXUSDT really WILL delist (per the anchor case above) — but this retrospective read has
  // no exchangeInfo evidence, so the badge must stay false rather than guess from other tests'
  // knowledge. Guessing here would be exactly the retrospective mistake this module exists to
  // prevent, applied to a second field.
  assert.equal(icx!.delistingBadge, false);
});

// ── Divergence: MATICUSDT (SPEC-001/PRD-001's own cross-witness disagreement example) ─────

test("MATICUSDT: absent from the decided snapshot, present via s3 witness -> marked divergence, not silently merged", () => {
  assert.ok(!SNAPSHOT_ROWS_0825.some((row) => row.symbol === "MATICUSDT"), "fixture assumption changed");
  const result = universeAt("2026-08-25", null, {
    snapshotRows: SNAPSHOT_ROWS_0825,
    s3WitnessSymbols: new Set(["MATICUSDT"]),
  });

  assert.ok(!result.decidedSymbols.has("MATICUSDT"));
  assert.ok(result.symbols.has("MATICUSDT"));
  assert.deepEqual(result.divergence.onlyInSecond, ["MATICUSDT"]);
  assert.equal(result.label, null); // the snapshot IS available; divergence is data, not a guess

  const rows = stampUniverseRows(result, EXCHANGE_INFO_0825);
  const maticRow = rows.find((row) => row.symbol === "MATICUSDT");
  assert.ok(maticRow);
  assert.deepEqual(maticRow!.universeSource, [S3_INFERRED]);
  assert.equal(maticRow!.deliveryDate, null);
  assert.equal(maticRow!.delistingBadge, false);
});

// ── The decisive path: a snapshot witness IS available ─────────────────────────────────────

test("a snapshot witness makes the result decided and unlabeled", () => {
  const result = universeAt("2026-08-25", null, { snapshotRows: SNAPSHOT_ROWS_0825 });
  assert.equal(result.label, null);
  assert.ok(result.decidedSymbols.has("BTCUSDT"));
  assert.deepEqual([...result.decidedSymbols].sort(), [...result.symbols].sort());
});

test("a snapshot present but filtered to zero matches is DECIDED-AND-EMPTY, never RETROSPECTIVE_LABEL " +
  "(label is keyed on snapshotRows !== null, not on decidedSymbols.size — a mutant that keys off size " +
  "silently confuses decided-and-empty with never-observed and escapes every other test in this file)", () => {
  const result = universeAt("2026-08-25", { market: "NO_SUCH_MARKET" }, { snapshotRows: SNAPSHOT_ROWS_0825 });
  assert.equal(result.decidedSymbols.size, 0);
  assert.equal(result.label, null, "a real, present snapshot that matches nothing is still a DECISION, not a retrospective gap");
  assert.notEqual(result.label, RETROSPECTIVE_LABEL);
});

test("filter market restricts the decided symbols to one market, and the two markets partition the universe", () => {
  const coinMOnly = universeAt("2026-08-25", { market: MARKET_COIN_M }, { snapshotRows: SNAPSHOT_ROWS_0825 });
  const usdsMOnly = universeAt("2026-08-25", { market: MARKET_USDS_M }, { snapshotRows: SNAPSHOT_ROWS_0825 });

  assert.ok(coinMOnly.decidedSymbols.size > 0);
  assert.ok(usdsMOnly.decidedSymbols.size > 0);
  for (const symbol of coinMOnly.decidedSymbols) {
    assert.ok(!usdsMOnly.decidedSymbols.has(symbol));
  }
  const union = new Set([...coinMOnly.decidedSymbols, ...usdsMOnly.decidedSymbols]);
  assert.deepEqual([...union].sort(), SNAPSHOT_ROWS_0825.map((row) => row.symbol).sort());
});

test("no filter is the default and is equivalent to explicit NO_FILTER", () => {
  const implicit = universeAt("2026-08-25", undefined, { snapshotRows: SNAPSHOT_ROWS_0825 });
  const explicit = universeAt("2026-08-25", NO_FILTER, { snapshotRows: SNAPSHOT_ROWS_0825 });
  assert.deepEqual([...implicit.decidedSymbols].sort(), [...explicit.decidedSymbols].sort());
});

test("filterMatches: underlyingSubType axis refuses a row with no exchangeInfo observation (null, not [])", () => {
  const coinMRow = SNAPSHOT_ROWS_0825.find((row) => row.market === MARKET_COIN_M);
  assert.ok(coinMRow);
  assert.equal(coinMRow!.underlyingSubType, null);
  assert.equal(filterMatches({ underlyingSubType: ["PoW"] }, coinMRow!), false);
});

// ── decideUniverseMembership: union of admissible witnesses only ──────────────────────────

test("decideUniverseMembership unions every DecisiveUniverseSource witness given", () => {
  const witnesses: Partial<Record<DecisiveUniverseSource, ReadonlySet<string>>> = {
    [SNAPSHOT]: new Set(["BTCUSDT"]),
    [PREMIUM_INDEX_WITNESS]: new Set(["ETHUSDT"]),
  };
  const decided = decideUniverseMembership(witnesses);
  assert.deepEqual([...decided].sort(), ["BTCUSDT", "ETHUSDT"]);
});

test("decideUniverseMembership of an empty witness map is empty, not an error", () => {
  assert.deepEqual([...decideUniverseMembership({})], []);
});

test("compareSymbolSets: the two-sided, sorted difference", () => {
  const divergence = compareSymbolSets(new Set(["A", "C"]), new Set(["B", "C"]));
  assert.deepEqual(divergence.onlyInFirst, ["A"]);
  assert.deepEqual(divergence.onlyInSecond, ["B"]);
});

// ── The structural falsifier: `s3_inferred` cannot even be a literal `decideUniverseMembership`
// spells, mirroring `test_structural_falsifier_decide_universe_membership_cannot_spell_
// s3_inferred` in `test_universe_at.py` (there via `ast`; here via `Function.prototype.
// toString()`, since Node's native TS type-stripping keeps the runtime source text but this
// repo has no `tsc --noEmit` gate to lean on for the type-level half — see the module's own
// header comment for the type-level proof, run by hand). ─────────────────────────────────

test("structural falsifier: decideUniverseMembership's own source never spells the excluded string", () => {
  const source = decideUniverseMembership.toString();
  assert.ok(!source.includes("s3_inferred"), "decideUniverseMembership source mentions s3_inferred literally");
});

test("structural falsifier BITES: a mutant that DOES spell the excluded string is caught by the same scan", () => {
  const source = decideUniverseMembership.toString();
  // Node's native TS type-stripping blanks `<string>` to same-length whitespace rather than
  // deleting it (stack traces keep stable positions), so the anchor below matches on the
  // `new Set` call itself, padding included, rather than a literal `new Set()` substring.
  const newSetCallPattern = /new Set\s*\(\)/;
  assert.ok(newSetCallPattern.test(source), "unexpected function shape — mutant point of attack moved");
  const mutant = source.replace(newSetCallPattern, 'new Set(["s3_inferred"])');
  assert.notEqual(mutant, source, "the mutation did not find its anchor — update the anchor string");
  assert.ok(mutant.includes("s3_inferred"), "the scan failed to catch a mutant that plants the excluded string");
});

// ── The delisting sentinel, measured directly (module header comment carries the command) ──

test("DELISTING_SENTINEL_DELIVERY_DATE is the exact value measured on the raw 2026-08-25 capture", () => {
  assert.equal(DELISTING_SENTINEL_DELIVERY_DATE, 4133404800000);
  const counts = new Map<number, number>();
  for (const entry of EXCHANGE_INFO_0825.symbols) {
    counts.set(entry.deliveryDate, (counts.get(entry.deliveryDate) ?? 0) + 1);
  }
  assert.equal(counts.get(DELISTING_SENTINEL_DELIVERY_DATE), 743);
});
