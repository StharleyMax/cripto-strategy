/**
 * `T-03.5` — the DOM CONTRACT of the OI pane, guarded. Sibling of
 * `cvd-pane-dom-contract.test.ts`/`volume-subaxis-dom-contract.test.ts`, and it exists for the
 * same measured reason those two give: `view-model.test.ts` proves `RN-S1`/`RNF-2` on the DATA
 * side and NOTHING about the RENDERING side, and `oi-series-selector.test.ts` proves the
 * predicate is correct without proving the ROUTE calls it.
 *
 * MEASURED, NOT ASSUMED — this file removed from the suite, one mutation applied at a time,
 * `npm --prefix frontend run test:app` after each `[MEDIDO 2026-09-12, universo: 191 testes com
 * este arquivo fora, 199 com ele]`:
 *
 *                                                        sem o guarda      com o guarda
 *   nada mutado                                          191 pass / 0 fail  199 pass / 0 fail
 *   renomear `OI_PANE_TESTID`                            191 pass / 0 fail  196 pass / 3 fail
 *   ausência de OI chegando ao readout como `"0"`        191 pass / 0 fail  196 pass / 3 fail
 *   apagar `data-oi-native-bars`                         191 pass / 0 fail  196 pass / 3 fail
 *   publicar a ESCADA como `data-oi-native-bars`         191 pass / 0 fail  196 pass / 3 fail
 *   apagar a linha de frescor (`RNF-2`)                  191 pass / 0 fail  197 pass / 2 fail
 *   seletor de volta a `metric === "sum_open_interest"`  191 pass / 0 fail  197 pass / 2 fail
 *   `resolveCatalogEntry` voltando a `matches[0]`        191 pass / 0 fail  197 pass / 2 fail
 *
 * SEVEN mutations, ZERO detections before this file; SEVEN out of seven after it. The sixth and
 * seventh are the defect of
 * `handoff/T-03.5-T-03.6-FRONT.md` §2 REPLANTED — a whole phase shipped with it and every gate
 * was green. The fourth is the `RN-S1` failure the phase names as its own falsifier: publishing
 * `wirePoints` under the native-bars name makes `N >= 30` pass with SIX real buckets, and
 * nothing in the DOM, the API or the logs would contradict it.
 *
 * ⚠️ THE SECOND COLUMN IS HALF THE MEASUREMENT, NOT DECORATION: "morde" sozinho não exclui um
 * guarda que reprove qualquer coisa, e a coluna da esquerda — `191 / 0` sete vezes seguidas — é o
 * que prova que ele NÃO estava lá antes. As duas metades juntas são o que a disciplina
 * morde/cala de `ADR-011` pede, e são o que `harness.toml` já exige de uma regra nova.
 *
 * WHY A SOURCE SCAN AND NOT A RENDER: verbatim the reason the two sibling files give — this repo
 * has no component renderer in any suite (`@testing-library` is not installed) and
 * `SymbolClient.tsx` imports `lightweight-charts`, which wants a DOM. This instrument proves the
 * literal is SPELLED where the contract requires it; the browser half is `T-03.6`'s e2e, and it
 * is the one that reads a real number out of a real page.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(HERE, "SymbolClient.tsx"), "utf8");
const pageSource = readFileSync(path.join(HERE, "page.tsx"), "utf8");

/** `page.tsx` with every comment removed — block first, then line. Needed because the asserts
 * below ask whether a RETIRED SELECTOR is gone from the CODE, and `page.tsx`'s header now
 * EXPLAINS the retirement by quoting the old expression. Scanning raw text would fail a correct,
 * well-documented file and pass an undocumented one. Crude on purpose, same as the CVD file's. */
const pageCode = pageSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The selector `e2e/12-oi-dado-real.spec.ts` will `page.locator()` by. Duplicated here ON
 * PURPOSE: a contract with another task is not guarded by importing the constant it is made of —
 * that would rename itself along with the mutation it is supposed to catch. */
const EXPECTED_TESTID = "oi-pane";
const EXPECTED_ABSENCE_TOKEN = "SEM_PONTO";

const TESTID_DECLARATION = /const OI_PANE_TESTID = "([^"]*)";/;
const ABSENCE_TOKEN_DECLARATION = /const ABSENCE_TOKEN = "([^"]*)";/;
const OI_ABSENT_BRANCH = /reading\.kind === "absent"\s*\n?\s*\? ABSENCE_TOKEN/;
/** The two counts, as the e2e spells them. `native-bars` is the one `DoD-3` reads; `wire-points`
 * is the staircase, published beside it so the ratio is checkable from outside. */
const NATIVE_BARS_ATTRIBUTE = /data-oi-native-bars=\{oi\.nativeBars\}/;
const WIRE_POINTS_ATTRIBUTE = /data-oi-wire-points=\{oi\.wirePoints\}/;
const FRESHNESS_FACT = /data-fact=\{`oi_freshness:\$\{freshness\.kind\}`\}/;
const FRESHNESS_RENDERED = /<OiFreshness oi=\{oi\} \/>/;
/** `page.tsx`: the three-term predicate, CALLED. */
const PAGE_OI_SELECTOR = /resolveCatalogEntry\(catalog, \(entry\) => matchesBinanceOpenInterest\(entry\.key\)\)/;
/** `page.tsx`: the native count comes off the PANEL's 5-minute grid, never off the wire rows. */
const PAGE_NATIVE_COUNT = /nativeBars: countPresentSlots\(oiGridSlots\)/;
const PAGE_OI_GRID_SOURCE = /const oiGridSlots = panels\.oi\.slots;/;
/** `page.tsx`: the `RNF-2` ceiling is the catalog's own, and `null` when no entry resolved. */
const PAGE_CEILING = /maxStalenessMs: oiEntry\?\.maxStalenessMs \?\? null/;
/** `page.tsx`: ambiguity RESOLVES TO NOTHING — the structural half of the fix. */
const PAGE_UNIQUE_MATCH = /if \(matches\.length === 1\) \{\s*\n\s*return \{ kind: "found", entry: matches\[0\]! \};/;

test("T-03.6 contract: the OI pane carries the STABLE testid, spelled exactly", () => {
  const declaration = TESTID_DECLARATION.exec(source);
  assert.ok(declaration !== null, "OI_PANE_TESTID declaration not found — the anchor moved, fix this test");
  assert.equal(
    declaration[1],
    EXPECTED_TESTID,
    "the e2e locates this pane by the literal string — renaming it empties that spec silently",
  );
  assert.match(source, /data-testid=\{OI_PANE_TESTID\}/, "the constant must be USED on the section, not merely declared");
});

test("RN-1: the OI readout says SEM_PONTO where there is no observation, never a number", () => {
  assert.equal(ABSENCE_TOKEN_DECLARATION.exec(source)?.[1], EXPECTED_ABSENCE_TOKEN);
  assert.match(
    source,
    OI_ABSENT_BRANCH,
    "the absent branch must resolve to ABSENCE_TOKEN — a `0` here would assert an open interest " +
      "of zero, which is a claim about the market made out of ignorance",
  );
});

test("RN-S1: the pane publishes the NATIVE bar count, with the staircase beside it and NAMED apart", () => {
  assert.match(source, NATIVE_BARS_ATTRIBUTE, "`DoD-3`'s N has to be machine-readable — and it is the native count");
  assert.match(source, WIRE_POINTS_ATTRIBUTE, "the staircase is published too, so the ratio can be checked");
  // ⛔ AND THE TWO MUST NOT BE THE SAME EXPRESSION. This is the phase's own falsifier: a pane
  // that reads `N` off the wire rows reports ~5x the data it has.
  assert.notEqual(
    NATIVE_BARS_ATTRIBUTE.source.replace("nativeBars", "X"),
    WIRE_POINTS_ATTRIBUTE.source.replace("wirePoints", "Y"),
    "sanity: the two attributes are distinct contracts",
  );
  assert.doesNotMatch(source, /data-oi-native-bars=\{oi\.wirePoints\}/, "the headline number must not be the staircase");
  // The horizon's denominator is the native grid too — `N/5761` would be the staircase wearing
  // the costume of a measurement.
  assert.match(source, /data-fact=\{`oi_readable_horizon:\$\{oi\.nativeBars\}\/\$\{gridSlots\}`\}/);
  assert.match(source, /<OiReadableHorizon oi=\{oi\} gridSlots=\{panels\.oi\.slots\.length\} \/>/);
});

test("RN-S1, route side: the count comes off the 5-minute PANEL grid, not off the wire rows", () => {
  assert.match(pageCode, PAGE_OI_GRID_SOURCE, "`panels.oi.slots` IS the native grid (buildOiPanel, FIVE_MINUTES_MS)");
  assert.match(pageCode, PAGE_NATIVE_COUNT);
  assert.match(pageCode, /wirePoints: oiResult\.rows\.filter\(\(row\) => row\.value !== null\)\.length/);
  // ⛔ NO `/5` ANYWHERE, and that is deliberate, not an omission: a literal divisor would be a
  // second, silent model of the staircase living beside the grid alignment that already handles
  // it — and it would be WRONG the day `as_of` holds one observation across two native buckets.
  assert.doesNotMatch(pageCode, /\/ 5\b/, "the divisor is paid by the grid, never by arithmetic on a count");
});

test("RNF-2: the pane says HOW OLD its newest reading is, against the ceiling the catalog serves", () => {
  assert.match(source, FRESHNESS_RENDERED, "the freshness line must be RENDERED, not merely declared");
  assert.match(source, FRESHNESS_FACT, "the verdict has to be machine-readable");
  assert.match(source, /data-freshness-age-ms=\{freshness\.ageMs \?\? ""\}/);
  assert.match(source, /data-freshness-ceiling-ms=\{freshness\.ceilingMs \?\? ""\}/);
  // The three kinds are rendered as three different things, and `unknown` is never freshness.
  assert.match(source, /freshness\.kind === "unknown"\s*\n?\s*\? "Frescor não avaliável/);
  assert.match(source, /freshness\.kind === "stale" \? " ⚠️ Mais velha que o teto/);

  // Route side: the ceiling is the catalog entry's OWN `max_staleness_ms` — no new field, no
  // route re-versioned (`RF-5`), and the same number `as_of` applied server-side.
  assert.match(pageCode, PAGE_CEILING);
  assert.match(pageCode, /resolveFreshnessVerdict\(oiGridSlots, routeWindow\.windowEndMsInclusive,/);
  // ⛔ AND NO INVENTED DEFAULT. `?? 600_000` here would be a freshness claim manufactured by the
  // renderer for a panel that never resolved a series.
  assert.doesNotMatch(pageCode, /\?\? 600_000/);
});

test("the selector defect is GONE from the route, both halves of it", () => {
  // Half one: the predicate the route calls is the three-term one.
  assert.match(pageCode, PAGE_OI_SELECTOR, "the OI panel must select by identity, not by metric alone");
  assert.doesNotMatch(
    pageCode,
    /entry\.key\.metric === OI_METRIC/,
    "the one-term selector matched FIVE rows and `find` answered the empty one — it must not come back",
  );
  assert.doesNotMatch(pageCode, /const OI_METRIC/, "and the constant that made it easy to write is retired too");

  // Half two, the structural one: NO panel resolves its entry with `find`. This is what keeps a
  // future selector from repeating the defect on a metric nobody has thought about yet.
  assert.match(pageCode, PAGE_UNIQUE_MATCH, "a selector that matches more than one row must resolve to NOTHING");
  assert.doesNotMatch(pageCode, /catalog\.entries\.find\(/, "`Array.prototype.find` over the catalog is the defect");
  assert.match(pageCode, /reason: "ambiguous_in_catalog"/, "and ambiguity has to be SAID, not swallowed");
  // All four panels go through it — a fifth panel added later inherits the refusal by default.
  assert.equal(
    (pageCode.match(/resolveCatalogEntry\(catalog,/g) ?? []).length,
    4,
    "price, OI, CVD and volume all resolve through the unique-match helper",
  );
});

// ── MORDE: the seven mutations that were GREEN before this file existed ───────────────────────

test("MORDE: each of the 7 OI DOM-contract mutations that used to pass green is now caught", () => {
  const mutants: readonly {
    readonly name: string;
    readonly file: "client" | "page";
    readonly mutate: (s: string) => string;
  }[] = [
    { name: "testid renamed", file: "client", mutate: (s) => s.replace(TESTID_DECLARATION, 'const OI_PANE_TESTID = "renamed";') },
    { name: "OI absence rendered as 0", file: "client", mutate: (s) => s.replace(OI_ABSENT_BRANCH, 'reading.kind === "absent"\n      ? "0"') },
    { name: "native-bars attribute deleted", file: "client", mutate: (s) => s.replace(/\s*data-oi-native-bars=\{oi\.nativeBars\}/, "") },
    { name: "the STAIRCASE published as the native count", file: "client", mutate: (s) => s.replace(NATIVE_BARS_ATTRIBUTE, "data-oi-native-bars={oi.wirePoints}") },
    { name: "freshness line removed", file: "client", mutate: (s) => s.replace(FRESHNESS_RENDERED, "") },
    { name: "selector back to metric alone", file: "page", mutate: (s) => s.replace(PAGE_OI_SELECTOR, 'resolveCatalogEntry(catalog, (entry) => entry.key.metric === OI_METRIC)') },
    { name: "ambiguity resolved by position again", file: "page", mutate: (s) => s.replace(PAGE_UNIQUE_MATCH, 'if (matches.length >= 1) {\n    return { kind: "found", entry: matches[0]! };') },
  ];
  for (const mutant of mutants) {
    const original = mutant.file === "client" ? source : pageCode;
    const mutated = mutant.mutate(original);
    assert.notEqual(mutated, original, `the mutation "${mutant.name}" found no anchor — update this test, do not delete it`);
    const survives =
      mutant.file === "client"
        ? TESTID_DECLARATION.exec(mutated)?.[1] === EXPECTED_TESTID &&
          OI_ABSENT_BRANCH.test(mutated) &&
          NATIVE_BARS_ATTRIBUTE.test(mutated) &&
          !/data-oi-native-bars=\{oi\.wirePoints\}/.test(mutated) &&
          FRESHNESS_RENDERED.test(mutated)
        : PAGE_OI_SELECTOR.test(mutated) &&
          PAGE_UNIQUE_MATCH.test(mutated) &&
          !/entry\.key\.metric === OI_METRIC/.test(mutated);
    assert.ok(!survives, `the mutation "${mutant.name}" is NOT detected by the asserts above — the guard is vacuous`);
  }
});

// ── CALA: form is the `ui-designer`'s to change, and changing it must not touch any assert ────

test("CALA: a design_gate NEEDS_FIX about colour or wording leaves the OI contract intact", () => {
  const restyled = source
    .replace(/color: colorTokens\(\)\.provenanceStrong/, "color: colorTokens().provenanceWeak")
    .replace(/Open Interest \(5m\)/, "Open Interest — contratos em aberto (5m)")
    .replace(/Leitura atual: \{readingText\}/, "Último valor conhecido: {readingText}")
    .replace(/barras nativas de 5 min na janela/, "buckets de 5 min legíveis")
    .replace(/⚠️ Mais velha que o teto — o valor acima é DADO VELHO\./, "Atenção: leitura vencida.");
  assert.notEqual(restyled, source, "the form constants moved — re-anchor this CALA rather than dropping it");
  assert.equal(TESTID_DECLARATION.exec(restyled)?.[1], EXPECTED_TESTID);
  assert.equal(ABSENCE_TOKEN_DECLARATION.exec(restyled)?.[1], EXPECTED_ABSENCE_TOKEN);
  assert.match(restyled, NATIVE_BARS_ATTRIBUTE);
  assert.match(restyled, WIRE_POINTS_ATTRIBUTE);
  assert.match(restyled, FRESHNESS_FACT);
  assert.match(restyled, OI_ABSENT_BRANCH);
});
