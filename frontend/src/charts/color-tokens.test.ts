// Cross-checks `color-tokens.ts` against `scripts/validate_palette.js` — the `docs`-owned
// instrument this task's DoD (`D5.6`) names (`node scripts/validate_palette.js`, exit 0,
// 361 measurements). Same "two call sites, one number must match" discipline
// `canonical-grid-sha256-proof.test.ts` uses for the grid, applied here to a palette: the
// script's `PAPEIS` table is read as TEXT (never executed — it prints ~150 lines and sets
// `process.exitCode` as a side effect, which a `.test.ts` must not inherit) and the 6 hex
// values this module claims are checked equal, per mode, to what the script itself declares.
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  colorTokens,
  candlestickSeriesColors,
  assertNoForbiddenColorRoles,
  FORBIDDEN_COLOR_ROLE_SUBSTRINGS,
} from "./color-tokens.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "../../..");
const VALIDATE_PALETTE_JS = path.join(REPO_ROOT, "scripts/validate_palette.js");

// This module's `ColorRole` -> the script's `'papel-em-portugues'` key. The script owns the
// arithmetic (`docs` component, `ADR-010`); this module owns the typed, English-identifier
// consumption (`charts` component) — the map below is the ONLY place the two vocabularies
// are put side by side.
const ROLE_TO_SCRIPT_KEY: Record<string, string> = {
  directionUpFill: "direcao-alta-fill",
  directionDownFill: "direcao-baixa-fill",
  directionOn: "direcao-on",
  dataBrokenInk: "dado-quebrado-ink",
  provenanceStrong: "proc-forte",
  provenanceWeak: "proc-fraca",
};

/**
 * Extracts `{ mode: { 'role-key': hex, ... } }` from `validate_palette.js`'s `PAPEIS` object
 * literal by reading the file as plain text. Deliberately NOT `import()`/`require()` of the
 * script itself — that would execute ~150 lines of `console.log` and leave `process.exitCode`
 * set as a side effect of loading a test file, which is its own defect class.
 */
function extractPapeisFromScript(source: string): Record<string, Record<string, string>> {
  const papeisMatch = source.match(/const PAPEIS = \{([\s\S]*?)\n\};/);
  if (papeisMatch === null) {
    throw new Error("could not find the `const PAPEIS = { ... };` block in validate_palette.js — has it moved?");
  }
  const body = papeisMatch[1];
  const result: Record<string, Record<string, string>> = {};
  // Each mode block: `claro: {` ... up to its matching top-level `},` (modes are the only
  // 2-space-indented keys in this block; entries inside are 4-space-indented).
  const modeBlockRe = /\n {2}(claro|escuro): \{([\s\S]*?)\n {2}\},/g;
  let modeMatch: RegExpExecArray | null;
  while ((modeMatch = modeBlockRe.exec(body)) !== null) {
    const [, mode, modeBody] = modeMatch;
    const entries: Record<string, string> = {};
    const entryRe = /'([a-z-]+)':\s*\{\s*hex:\s*'(#[0-9a-fA-F]{6})'/g;
    let entryMatch: RegExpExecArray | null;
    while ((entryMatch = entryRe.exec(modeBody)) !== null) {
      const [, key, hex] = entryMatch;
      entries[key] = hex;
    }
    result[mode] = entries;
  }
  return result;
}

const scriptSource = readFileSync(VALIDATE_PALETTE_JS, "utf8");
const scriptPapeis = extractPapeisFromScript(scriptSource);

test("precondition: validate_palette.js's PAPEIS was parsed and both modes were found", () => {
  assert.ok(Object.keys(ROLE_TO_SCRIPT_KEY).length === 6, "this test's own map must name all 6 roles");
  assert.ok("claro" in scriptPapeis, "did not find PAPEIS.claro in validate_palette.js — regex out of date?");
  assert.ok("escuro" in scriptPapeis, "did not find PAPEIS.escuro in validate_palette.js — regex out of date?");
  assert.ok(Object.keys(scriptPapeis.claro).length >= 6, `PAPEIS.claro parsed too few entries: ${JSON.stringify(scriptPapeis.claro)}`);
});

// `D13` left ONE theme, the dark one, so there is one column left to cross-check. The script
// keeps its `claro` block on purpose — it is `docs`-owned and proves `ADR-010`'s dicromacia
// arithmetic for both columns; what `D13` retired is the light theme of the APP, not of the ADR.
test("color-tokens.ts's tokens match validate_palette.js's PAPEIS.escuro hex for hex", () => {
  const tokens = colorTokens();
  const scriptEntries = scriptPapeis.escuro;
  for (const [role, scriptKey] of Object.entries(ROLE_TO_SCRIPT_KEY)) {
    const ours = tokens[role as keyof typeof tokens];
    const theirs = scriptEntries[scriptKey];
    assert.equal(
      theirs,
      ours,
      `role "${role}" (script key "${scriptKey}"): color-tokens.ts has ${ours}, ` +
        `validate_palette.js has ${theirs} — ADR-010's two citations of this palette diverged`,
    );
  }
});

test("D13: the theme parameter is GONE, not merely defaulted — colorTokens takes zero arguments", () => {
  // The point of `D13` was to make "ask for the light palette" INEXPRESSIBLE, not to make it
  // the wrong string. `Function.length` is the smallest honest witness of that: alternative `A`
  // (swap `"light"` for `"dark"` at the 4 call sites) would leave both of these at 1.
  assert.equal(colorTokens.length, 0, "colorTokens must declare no parameter after D13");
  assert.equal(candlestickSeriesColors.length, 0, "candlestickSeriesColors must declare no parameter after D13");
  const source = readFileSync(path.join(THIS_DIR, "color-tokens.ts"), "utf8");
  assert.ok(!source.includes("#57606a"), "the light provenanceWeak (#57606a) must not survive in this module");
  assert.ok(!source.includes("#581c87"), "the light dataBrokenInk (#581c87) must not survive in this module");
  assert.ok(!/export type ColorMode/.test(source), "ColorMode must not be declared");
  const barrel = readFileSync(path.join(THIS_DIR, "index.ts"), "utf8");
  assert.ok(!/\bColorMode\b/.test(barrel), "index.ts must not re-export ColorMode");
});

test("D5.6's own falsifier pair reproduces from the script text: #f23645 (directionDownFill) is a literal FAIL partner for #eb6834, never mixed into a token", () => {
  // Not re-computing CIEDE2000 here (that arithmetic is `validate_palette.js`'s job, proven
  // by ITS OWN `exit 0`) — just confirming the hex this module ships for `directionDownFill`
  // is the exact TradingView red the script's BLOCO 1 names as the pair that FAILs at 5.3,
  // so `critical fora do canal de cor` traces to a value this module actually exports.
  assert.equal(colorTokens().directionDownFill, "#f23645");
  assert.ok(scriptSource.includes("'#f23645', '#eb6834'"), "validate_palette.js should still carry the FAIL pair in BLOCO 1");
});

test("candlestickSeriesColors derives every field from the 2 direction tokens, never a 3rd hue", () => {
  const tokens = colorTokens();
  const style = candlestickSeriesColors();
  assert.deepEqual(style, {
    upColor: tokens.directionUpFill,
    downColor: tokens.directionDownFill,
    borderUpColor: tokens.directionUpFill,
    borderDownColor: tokens.directionDownFill,
    wickUpColor: tokens.directionUpFill,
    wickDownColor: tokens.directionDownFill,
  });
});

// ── CA-F4-10's guard, and it is shown REJECTING something, not just typechecking clean ──

test("assertNoForbiddenColorRoles PASSES on the real token set", () => {
  assert.doesNotThrow(() => assertNoForbiddenColorRoles(Object.keys(colorTokens())));
});

test("the negative control: a role named like operational severity is REJECTED, for each forbidden substring", () => {
  for (const forbidden of FORBIDDEN_COLOR_ROLE_SUBSTRINGS) {
    const poisoned = ["directionUpFill", `${forbidden}Fill`];
    assert.throws(
      () => assertNoForbiddenColorRoles(poisoned),
      new RegExp(forbidden, "i"),
      `expected assertNoForbiddenColorRoles to reject a role containing "${forbidden}"`,
    );
  }
  // Case-insensitivity is part of the guard, not an accident: a future `CriticalFill` (capital
  // C) must be caught exactly like `criticalFill`.
  assert.throws(() => assertNoForbiddenColorRoles(["CriticalFill"]), /critical/i);
});
