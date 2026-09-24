/**
 * `T-04.4` (`CST-231`, plan `04_oi_honesto.md` item 4.4, `G-4`) — `T-04.3` (`CST-230`) fixed ONE
 * factory: `LiveRow` stopped building its machine key off the pt-BR `label` prop, and started
 * taking `factKey` (ASCII, stable) instead. That commit fixed one call site. Item 4.4 exists
 * because "the defect is the factory's, not the price panel's" (plan, item 4.4 title) is a claim
 * about EVERY panel this page renders, not a claim this repo had ever checked past `LiveRow` and
 * `OiProvenance` (`oi-series-selector.test.ts`'s own `DoD-3 sanity` test) and `price_candles`
 * (`price-pane-dom-contract.test.ts`'s ASCII assert on `EXPECTED_CANDLES_FACT`). This file is that
 * check, over the WHOLE page — the exact scope DoD 3 names: *"zero chave de máquina não-ASCII…
 * universo completo desta vez, não só `LiveRow`"*.
 *
 * SOURCE SCAN, NOT A RENDER — same reason `price-pane-dom-contract.test.ts` and
 * `cvd-pane-dom-contract.test.ts` give: no component renderer in this suite
 * (`@testing-library` is not installed), so `SymbolClient.tsx` cannot be mounted here. What a
 * real render (`curl` against a live `next dev`, DoD 3's own command) additionally proves is
 * documented in the QA gate block that dispatched this task, not reproduced as a unit test —
 * this file guards the SOURCE so a new panel cannot reintroduce the defect between two such
 * curls.
 *
 * MEASURED against `SymbolClient.tsx` as of `T-04.3` (`8bb81ba`), comment-stripped:
 * `43` `data-fact` expressions, `0` with a non-ASCII literal segment, `0` interpolating `label`
 * directly `[MEDIDO 2026-09-23]`. The count is asserted below as a floor/ceiling so a change to
 * the extraction regex — or a panel that stops publishing its fact under `data-fact` — cannot
 * make this file pass by finding nothing.
 *
 * `T-05.6` moved the count to `44`: ONE new expression, `` data-fact={`${factKey}:beyond`} ``
 * (`BeyondCoverageBadge`) — a single declaration reused at TWO call sites (`OiPane`,
 * `LongShortPane`), which is why the universe grew by one and not two
 * `[MEDIDO 2026-09-23, node --experimental-strip-types over the same extractor this file uses]`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const rawSource = readFileSync(path.join(HERE, "SymbolClient.tsx"), "utf8");

/** Same crude stripper `price-pane-dom-contract.test.ts`/`cvd-pane-dom-contract.test.ts` use, and
 * for the identical reason here: the docstrings above `LiveRow` and `OiProvenance` quote the
 * historical bug VERBATIM — `data-fact="live_preço:attempted"`, accent and all — as prose
 * documenting a fixed defect. A scan that does not strip comments first would flag that prose as
 * a live violation and could never turn green while the history stays written down. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const DATA_FACT_EXPR = /data-fact=(?:"([^"]*)"|\{`([^`]*)`\})/g;

/** Every `data-fact` expression found in `source`, as the raw string between the quotes/backticks
 * (interpolations included, verbatim — e.g. `` `live_${factKey}:${...}` ``). */
function extractDataFactExpressions(source: string): string[] {
  const stripped = stripComments(source);
  const found: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(DATA_FACT_EXPR);
  while ((match = re.exec(stripped)) !== null) {
    found.push(match[1] !== undefined ? match[1] : (match[2] as string));
  }
  return found;
}

/** The LITERAL segments of a `data-fact` expression — the parts a coder typed by hand, with every
 * `${...}` interpolation cut out. DoD 3's `grep -P '[^\x00-\x7F]'` runs against the RENDERED
 * page, where an interpolation has already resolved to a runtime value this file cannot see; what
 * a source scan CAN prove is that no one typed an accented byte into the hand-written part of the
 * key — which is exactly how the historical defect was not introduced (the bug was `label`
 * carrying the accent at runtime, not a literal in the template), and exactly why the structural
 * check below (no `${label}` in a `data-fact`) is the one that actually re-catches `T-04.3`'s
 * class of defect, not this one alone. */
function literalSegments(expr: string): string[] {
  return expr.split(/\$\{[^}]*\}/g);
}

// `no-control-regex` refuses a `\x00-\x7F` class, so this is a scan, not a regex — same
// instrument `oi-series-selector.test.ts`'s `DoD-3 sanity` test uses, for the same rule.
function isAsciiPrintable(text: string): boolean {
  return [...text].every((char) => char.charCodeAt(0) <= 0x7f);
}

// ── 1. THE EXTRACTOR ITSELF IS PROVEN LIVE, NOT SILENTLY BLIND ───────────────────────────────

test("sanity: the scan finds the measured universe of data-fact expressions, not zero", () => {
  const expressions = extractDataFactExpressions(rawSource);
  assert.equal(
    expressions.length,
    // 44 → 45 in `paineis-de-fluxo` `T-01.6`, confirmed as a GAINED fact, not a broken extractor:
    // `ChromeModeStamp` publishes `data-fact="chrome_mode:as_of"` (gate r2 `C-4`, the mode made
    // explicit in the chrome). No data-fact was lost: every pane's facts moved with it into the
    // pane's layer, unchanged.
    45,
    "the count moved — either a panel gained/lost a data-fact, or the extractor regex broke; " +
      "update this number ONLY after confirming which, never to silence a red run",
  );
});

// ── 2. EVERY HAND-WRITTEN SEGMENT OF EVERY data-fact IS ASCII ────────────────────────────────

test("DoD 3, at the source: no data-fact expression carries a non-ASCII literal segment, in ANY panel", () => {
  const expressions = extractDataFactExpressions(rawSource);
  assert.ok(expressions.length > 0, "the universe must be non-empty for this test to mean anything");
  for (const expr of expressions) {
    for (const segment of literalSegments(expr)) {
      assert.ok(
        isAsciiPrintable(segment),
        `non-ASCII byte in a data-fact literal segment: "${segment}" (full expression: "${expr}")`,
      );
    }
  }
});

// ── 3. THE STRUCTURAL GUARD — THE CLASS OF DEFECT T-04.3 FIXED, BANNED FOR EVERY PANEL ───────

/** `label` is this file's own convention for the pt-BR MICROCOPY prop — `LiveRow`'s docstring
 * names it explicitly, `LiquidationCohortSurface` uses the same name for the same reason. A
 * `data-fact` that interpolates `${label}` directly is `T-04.3`'s bug reborn under a different
 * component, and DoD 3 exists precisely so that rebirth is not a thing a future panel gets to
 * discover in production (`CST-230` was found on the RUNNING page, not in review). */
function findLabelDerivedKeys(source: string): string[] {
  return extractDataFactExpressions(source).filter((expr) => /\$\{\s*label\s*\}/.test(expr));
}

test("no data-fact expression interpolates `label` — the pt-BR microcopy prop — directly", () => {
  const offenders = findLabelDerivedKeys(rawSource);
  assert.deepEqual(
    offenders,
    [],
    `a data-fact key derives from \`label\` (pt-BR microcopy), the exact shape of CST-230: ${JSON.stringify(offenders)}`,
  );
});

// ── MORDE: the two historical mutations, reintroduced against the STRIPPED source ────────────

test("MORDE: reintroducing CST-230's bug on LiveRow is caught by the structural guard", () => {
  const stripped = stripComments(rawSource);
  const correct = 'data-fact={`live_${factKey}:${url === null ? "no_series" : "attempted"}`}';
  assert.ok(stripped.includes(correct), "the known-good LiveRow anchor moved — update this test, do not delete it");
  const mutated = stripped.replace(
    correct,
    'data-fact={`live_${label}:${url === null ? "no_series" : "attempted"}`}',
  );
  assert.notEqual(mutated, stripped, "the mutation found no anchor to apply — the guard below proves nothing");
  assert.deepEqual(findLabelDerivedKeys(stripped), [], "baseline must be clean before the mutation is judged");
  assert.notDeepEqual(
    findLabelDerivedKeys(mutated),
    [],
    "the structural guard did NOT catch label re-entering a data-fact key — it is vacuous",
  );
});

test("MORDE: a hand-typed accented byte in a data-fact literal is caught by the ASCII scan", () => {
  const stripped = stripComments(rawSource);
  const anchor = 'data-fact="volume_scale:log10"';
  assert.ok(stripped.includes(anchor), "the known-good volume-scale anchor moved — update this test, do not delete it");
  const mutated = stripped.replace(anchor, 'data-fact="volume_escála:log10"');
  assert.notEqual(mutated, stripped, "the mutation found no anchor to apply — the guard below proves nothing");

  const mutatedExpressions = extractDataFactExpressions(mutated);
  const allAsciiAfterMutation = mutatedExpressions.every((expr) => literalSegments(expr).every(isAsciiPrintable));
  assert.equal(allAsciiAfterMutation, false, "the ASCII scan did NOT catch the accented literal — it is vacuous");
});
