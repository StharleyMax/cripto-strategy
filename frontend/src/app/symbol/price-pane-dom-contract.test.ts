/**
 * `T-01.8` — THE DOM/WIRING CONTRACT OF THE PRICE PANE, guarded. Sibling of
 * `volume-subaxis-dom-contract.test.ts` and `cvd-pane-dom-contract.test.ts`, and it exists for
 * the same measured reason those two state: `price-candle.test.ts` proves the CANDLE on the data
 * and geometry side, and NOTHING about the route that feeds it or the DOM that declares it.
 *
 * MEASURED, NOT ASSUMED — this file absent, one mutation applied at a time,
 * `npm --prefix frontend run test:app` after each `[MEDIDO 2026-09-19, universo: 324 testes]`:
 *
 *   baseline (this file absent, nothing mutated)                      -> 324 pass / 0 fail
 *   - `open: openResult.rows` becomes `open: closeResult.rows`        -> 324 pass / 0 fail
 *   - `data-fact="price_candles:…"` renamed to `data-x`               -> 324 pass / 0 fail
 *   - `data-testid={PRICE_PANE_TESTID}` suffixed with `-v2`           -> 324 pass / 0 fail
 *
 * Three mutations, zero detections, and the first is the whole task silently undone: a candle
 * whose `open` is the `close` of the same bucket is HALF the degenerate `RN-2` retired — the
 * body collapses, the wick survives, and every geometry assertion keeps passing because the
 * fixture feeds each reduction its own numbers. The second and third empty `T-01.11`'s only
 * handles on the price pane, and `Number(null) === 0` means an e2e can keep "passing" against a
 * DOM with no contract left in it (the `BLOCKER-3` of wave `03`, twice paid).
 *
 * WHY A SOURCE SCAN AND NOT A RENDER: verbatim the reason the two sibling files give — this repo
 * has no component renderer in any suite (`@testing-library` is not installed) and `page.tsx` is
 * a Server Component with route-level side effects, so it cannot be imported by a test at all.
 * This instrument proves the WIRING is spelled where the contract requires; the pixels are
 * `price-candle.test.ts`'s and the browser is `T-01.11`'s.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(HERE, "SymbolClient.tsx"), "utf8");
const pageSource = readFileSync(path.join(HERE, "[symbol]", "page.tsx"), "utf8");

/** `page.tsx` with every comment removed — the asserts below ask what the CODE does, and this
 * file's route documents the retired scalar price series in prose. Same crude stripper, same
 * justification, as `cvd-pane-dom-contract.test.ts`'s. */
const pageCode = pageSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The selector `T-01.11`'s e2e will `page.locator()` by. Duplicated here ON PURPOSE: a contract
 * with another task is not guarded by importing the constant it is made of — that would rename
 * itself along with the mutation it is supposed to catch. */
const EXPECTED_TESTID = "price-pane";
const TESTID_DECLARATION = /const PRICE_PANE_TESTID = "([^"]+)";/;
/** The machine key of the candle count. ⛔ ASCII, and NOT derived from the pt-BR label beside it
 * (`SPEC-008`/`D7`, `RF-8`/`RN-5`): this page still publishes `data-fact="live_preço:attempted"`,
 * accent and all, and that is a known defect (`CST-230`), not a precedent. */
const EXPECTED_CANDLES_FACT = "price_candles";

// ── 1. THE ROUTE READS FOUR SERIES, EACH ONE ITS OWN ─────────────────────────────────────────

test("the route resolves the FOUR klines_ohlc reductions, by identity, through the unique-match helper", () => {
  for (const reduction of ["OPEN", "HIGH", "LOW", "CLOSE"]) {
    assert.match(
      pageCode,
      new RegExp(`resolveOhlcCatalogEntry\\(catalog, catalogStatus, routeSymbol, "${reduction}"\\)`),
      `the route does not resolve ${reduction} — a candle missing one reading is a candle nobody can draw`,
    );
  }
  assert.match(
    pageCode,
    /resolveCatalogEntry\(catalog, symbol, \(entry\) => matchesKlinesOhlc\(entry\.key, reduction\)\)/,
    "the four must resolve by metric + provider + reduction, never by metric alone",
  );
});

test("⛔ each reduction is fetched SEPARATELY and fed to its OWN field — the defect here is silent", () => {
  // A candle assembled with `open: closeResult.rows` draws a body of exactly zero pixels while
  // every other number on screen stays plausible. That is the half-degenerate `RN-2` retired,
  // and it is one character away at this call site.
  for (const [field, result] of [
    ["open", "openResult"],
    ["high", "highResult"],
    ["low", "lowResult"],
    ["close", "closeResult"],
  ] as const) {
    assert.match(
      pageCode,
      new RegExp(`${field}: ${result}\\.rows,`),
      `assembleOhlcCandles' \`${field}\` must come from \`${result}\`, not from a sibling reduction`,
    );
  }
  assert.match(pageCode, /const candleAssembly = assembleOhlcCandles\(\{/);
  assert.match(
    pageCode,
    /candles: candleAssembly\.candles,/,
    "the panel must draw the assembled candles — anything else is a second assembly (RN-2)",
  );
});

test("the price panel degrades on ALL FOUR statuses, never on one of them", () => {
  assert.match(
    pageCode,
    /const priceStatus = firstAbsentStatus\(\[\s*openResult\.status,\s*highResult\.status,\s*lowResult\.status,\s*closeResult\.status,\s*\]\)/,
    "one failing series means no candle anywhere — the panel must say so instead of reporting ok",
  );
  assert.match(pageCode, /price: priceStatus,/, "and that status is the one the pane renders");
});

test("the retired scalar price series is NOT fetched any more — it only opens the live stream", () => {
  assert.match(
    pageCode,
    /price: buildLiveUrl\(baseUrl, routeSymbol, resolvedEntry\(priceLiveStreamResolution\)\)/,
    "the live-stream row keeps its own resolution, named for what it is",
  );
  assert.ok(
    !/fetchPanelRows\(priceLiveStreamResolution/.test(pageCode),
    "fetching a series nothing draws is a request per render that no pixel depends on",
  );
  assert.ok(
    !/rawCandlesFromHistoryRows/.test(pageCode),
    "the degenerate mapping must not come back through the route either (RN-2)",
  );
});

// ── 2. WHAT THE PANE DECLARES ABOUT THE BARS IT DREW ─────────────────────────────────────────

test("T-01.11 contract: the pane carries a stable testid and the drawn-candle count on it", () => {
  const declaration = TESTID_DECLARATION.exec(source);
  assert.ok(declaration !== null, "PRICE_PANE_TESTID declaration not found — the anchor moved, fix this test");
  assert.equal(declaration[1], EXPECTED_TESTID, "the e2e finds the pane by this exact string");
  assert.match(
    source,
    /data-testid=\{PRICE_PANE_TESTID\}\s*data-price-candles=\{priceCandles\.drawnCandles\}/,
    "testid and drawn-candle count must sit on the SAME element — a sibling is invisible to getAttribute",
  );
});

test("the candle facts are published as a machine key, in ASCII, with BOTH numbers", () => {
  assert.match(
    source,
    new RegExp(`data-fact=\\{\`${EXPECTED_CANDLES_FACT}:\\$\\{priceCandles\\.drawnCandles\\}/\\$\\{priceCandles\\.gridSlots\\}\`\\}`),
    "the fact must carry the pair — a bare count cannot say 812 OF WHAT",
  );
  assert.ok(
    /^[\x20-\x7E]+$/.test(EXPECTED_CANDLES_FACT),
    "a machine key an operator's grep cannot type is a key nobody queries (SPEC-008/D7)",
  );
  assert.match(
    source,
    /data-price-partial-buckets=\{priceCandles\.partialBuckets\}/,
    "the partial buckets must reach the DOM: without their own number they read as plain absence",
  );
});

test("the drawn-candle count is counted off the SLOTS the canvas gets, never off the raw rows", () => {
  assert.match(
    pageCode,
    /drawnCandles: countPresentCandleSlots\(panels\.price\.series\.slots\)/,
    "the printed number and the plotted bars must come from one array",
  );
  assert.match(pageCode, /gridSlots: panels\.price\.series\.slots\.length/);
  assert.match(pageCode, /partialBuckets: candleAssembly\.partialBuckets/);
});

test("RN-1 in words: the pane says the lacuna is a lacuna, and names what it is NOT", () => {
  // Microcopy is pt-BR and the `ui-designer` owns its form (`T-01.10`); what a builder guards is
  // that the DISTINCTION is stated at all. The page's own vocabulary is reused, not reinvented —
  // "lacuna" is the word `STITCH_CONTEXT.md` already uses for a slot nothing filled.
  assert.match(source, /em lacuna/, "the incomplete bucket must be named on screen");
  assert.match(
    source,
    /nunca uma vela de altura zero/,
    "and the pane must say what it refuses to draw — a flat bar IS a market that did not move",
  );
});

// ── MORDE: the three mutations that were GREEN before this file existed ──────────────────────

test("MORDE: each of the 3 mutations that used to pass green is now caught", () => {
  const mutants: readonly {
    readonly name: string;
    readonly file: "client" | "page";
    readonly mutate: (s: string) => string;
  }[] = [
    { name: "open read from the CLOSE series", file: "page", mutate: (s) => s.replace("open: openResult.rows,", "open: closeResult.rows,") },
    { name: "the candle fact renamed out of `data-fact`", file: "client", mutate: (s) => s.replace("data-fact={`price_candles:", "data-x={`price_candles:") },
    { name: "the pane testid suffixed", file: "client", mutate: (s) => s.replace(TESTID_DECLARATION, 'const PRICE_PANE_TESTID = "price-pane-v2";') },
  ];
  for (const mutant of mutants) {
    const original = mutant.file === "client" ? source : pageCode;
    const mutated = mutant.mutate(original);
    assert.notEqual(mutated, original, `the mutation "${mutant.name}" found no anchor — update this test, do not delete it`);
    const survives =
      /open: openResult\.rows,/.test(mutant.file === "page" ? mutated : pageCode) &&
      new RegExp(`data-fact=\\{\`${EXPECTED_CANDLES_FACT}:`).test(mutant.file === "client" ? mutated : source) &&
      TESTID_DECLARATION.exec(mutant.file === "client" ? mutated : source)?.[1] === EXPECTED_TESTID;
    assert.ok(!survives, `the mutation "${mutant.name}" is NOT detected by the asserts above — the guard is vacuous`);
  }
});
