/**
 * `T-01.F1` — `seedIdentityKey` (`seed-identity.ts`) and its wiring into `[symbol]/page.tsx`.
 *
 * BITES: two seeds that differ ONLY in `interval` must give different keys — that is the shape of
 * the `e2e/18` regression (a `4h` render reconciled into the `1m` instance). Also bites on
 * `symbol` and on `knowledgeTimeMs` alone, and on a separator forged inside a string term.
 * STAYS QUIET: the same `(symbol, interval, knowledgeTimeMs)` twice gives the same key, so an
 * unrelated re-render never remounts the chart.
 *
 * The last test is a SOURCE SCAN of `page.tsx` (same reason every sibling `*-dom-contract.test.ts`
 * gives: no component renderer in any suite) proving the key is actually on `<SymbolClient>` and
 * built from the three values the same render hands the client — a correct pure function that is
 * never wired would pass every other test here.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { seedIdentityKey, type SeedIdentity } from "./seed-identity.ts";
import { SUPPORTED_TIMEFRAMES } from "./supported-timeframes.ts";

const BASE: SeedIdentity = { symbol: "BTCUSDT", interval: "1m", knowledgeTimeMs: 1_758_672_000_000 };

test("same (symbol, interval, knowledgeTimeMs) gives the same key — no spurious remount", () => {
  assert.equal(seedIdentityKey(BASE), seedIdentityKey({ ...BASE }));
  assert.equal(
    seedIdentityKey({ symbol: "ETHUSDT", interval: "4h", knowledgeTimeMs: 0 }),
    seedIdentityKey({ symbol: "ETHUSDT", interval: "4h", knowledgeTimeMs: 0 }),
  );
});

test("every pair of distinct served timeframes gives distinct keys (the e2e/18 defect shape)", () => {
  const keys = SUPPORTED_TIMEFRAMES.map((option) => seedIdentityKey({ ...BASE, interval: option.interval }));
  // n = 5 served timeframes ⇒ 10 unordered pairs; a Set collapses any collision.
  assert.equal(new Set(keys).size, SUPPORTED_TIMEFRAMES.length);
  assert.notEqual(seedIdentityKey({ ...BASE, interval: "1m" }), seedIdentityKey({ ...BASE, interval: "4h" }));
});

test("a different knowledgeTimeMs alone gives a different key (ADR-005/D1)", () => {
  assert.notEqual(seedIdentityKey(BASE), seedIdentityKey({ ...BASE, knowledgeTimeMs: BASE.knowledgeTimeMs + 1 }));
});

test("a different symbol alone gives a different key", () => {
  assert.notEqual(seedIdentityKey(BASE), seedIdentityKey({ ...BASE, symbol: "ETHUSDT" }));
});

test("a separator forged inside a string term cannot collide with another pair", () => {
  // A naive `${symbol}|${interval}` join maps both of these to "A|B|C".
  assert.notEqual(
    seedIdentityKey({ symbol: "A|B", interval: "C", knowledgeTimeMs: 1 }),
    seedIdentityKey({ symbol: "A", interval: "B|C", knowledgeTimeMs: 1 }),
  );
  assert.notEqual(
    seedIdentityKey({ symbol: 'A","B', interval: "C", knowledgeTimeMs: 1 }),
    seedIdentityKey({ symbol: "A", interval: 'B","C', knowledgeTimeMs: 1 }),
  );
});

test("a non-finite knowledgeTimeMs is refused instead of collapsing to the same key", () => {
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(() => seedIdentityKey({ ...BASE, knowledgeTimeMs: bad }), RangeError);
  }
});

test("page.tsx keys <SymbolClient> by seedIdentityKey over the same three values it passes as props", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(path.join(here, "[symbol]", "page.tsx"), "utf8");
  const open = source.indexOf("<SymbolClient");
  assert.ok(open >= 0, "page.tsx must render <SymbolClient>");
  const element = source.slice(open, source.indexOf("/>", open));

  const keyMatch = /key=\{seedIdentityKey\(\{([^}]*)\}\)\}/.exec(element);
  assert.ok(keyMatch, "<SymbolClient> must carry key={seedIdentityKey({...})}");
  const keyArgs = keyMatch[1];
  assert.match(keyArgs, /\bsymbol:\s*routeSymbol\b/);
  assert.match(keyArgs, /\binterval:\s*selectedInterval\b/);
  assert.match(keyArgs, /\bknowledgeTimeMs:\s*routeWindow\.knowledgeTimeMs\b/);

  // The key's terms are the SAME expressions the client is seeded from — a key built from any
  // other value could stay equal while the seed changes, which is the defect all over again.
  assert.match(element, /\bsymbol=\{routeSymbol\}/);
  assert.match(element, /\bselectedTimeframe=\{selectedInterval\}/);
  assert.match(element, /\bknowledgeTimeMs=\{routeWindow\.knowledgeTimeMs\}/);
});
