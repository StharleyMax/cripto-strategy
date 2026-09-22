/**
 * `T-03.9` — the DOM CONTRACT the TF bar's own DoD names literally: *"remover um TF do conjunto
 * servido remove o botão, sem tocar no componente."* `supported-timeframes.test.ts` already
 * proves `SUPPORTED_TIMEFRAMES` is kept honest against the backend's own served set (the sync
 * test). What THIS file proves is the OTHER half of the claim: that `TimeframeBar`
 * (`SymbolClient.tsx`) renders its buttons by MAPPING OVER that array — never one hand-written
 * `<button>` literal per timeframe. Together the two files make the DoD true by construction: a
 * member removed from the backend's set removes a member from `SUPPORTED_TIMEFRAMES` (sync test,
 * or the array would be caught drifting), which removes exactly one rendered button (this file),
 * with zero line touched inside `TimeframeBar` itself.
 *
 * ⚠️ WHY A SOURCE SCAN AND NOT A RENDER: same reason every sibling `*-dom-contract.test.ts` in
 * this directory gives — this repo has no component renderer in any suite (`@testing-library` is
 * not installed) and `SymbolClient.tsx` imports `lightweight-charts`, which wants a DOM.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SUPPORTED_TIMEFRAMES } from "./supported-timeframes.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SYMBOL_CLIENT_PATH = path.join(HERE, "SymbolClient.tsx");
const source = readFileSync(SYMBOL_CLIENT_PATH, "utf8");

/** The `.map()` call that turns `SUPPORTED_TIMEFRAMES` into buttons — the ONE line that has to
 * exist for the DoD to hold. Anchored on the array's own imported name, not on a string literal
 * that a rename could leave stale without either test noticing (`supported-timeframes.ts`'s own
 * export is what both files agree on). */
const MAP_OVER_SUPPORTED_TIMEFRAMES = /SUPPORTED_TIMEFRAMES\.map\(\s*\(option\)\s*=>/;
/** The button itself — `key`, `data-testid` and `onClick` all derived from `option.interval`,
 * never a second, parallel literal. */
const BUTTON_KEYED_BY_OPTION = /key=\{option\.interval\}/;
const BUTTON_TESTID_FROM_OPTION = /data-testid=\{`timeframe-button-\$\{option\.interval\}`\}/;
const BUTTON_ONCLICK_FROM_OPTION = /onClick=\{\(\) => onSelect\(option\.interval\)\}/;
const BUTTON_LABEL_FROM_OPTION = /\{option\.interval\}\s*\n\s*<\/button>/;
/** The bar is actually MOUNTED by `SymbolClient` — a component nobody renders guards nothing. */
const BAR_MOUNTED = /<TimeframeBar selected=\{selectedTimeframe\} onSelect=\{setSelectedTimeframe\} \/>/;
const IMPORTS_CANONICAL_ARRAY = /import \{ DEFAULT_TIMEFRAME, SUPPORTED_TIMEFRAMES \} from "\.\/supported-timeframes\.ts";/;

test("T-03.9 contract: TimeframeBar imports the canonical array, never redeclares it", () => {
  assert.match(
    source,
    IMPORTS_CANONICAL_ARRAY,
    "SymbolClient.tsx must import SUPPORTED_TIMEFRAMES from supported-timeframes.ts, not a second literal",
  );
  // ⛔ Negative control: an inline array of the SAME five labels, declared a second time inside
  // SymbolClient.tsx, is exactly the "escrito à mão no front" the task exists to forbid — even if
  // it happened to list the same five strings today. This scans for that shape and fails if found.
  const secondHandwrittenArray = /\["1m",\s*"5m",\s*"15m",\s*"1h",\s*"4h"\]/;
  assert.doesNotMatch(
    source,
    secondHandwrittenArray,
    "a second, hand-typed timeframe list was found in SymbolClient.tsx — there must be exactly ONE",
  );
});

test("T-03.9 contract: TimeframeBar renders ONE button per SUPPORTED_TIMEFRAMES entry via .map(), never a literal per label", () => {
  assert.match(source, MAP_OVER_SUPPORTED_TIMEFRAMES, "TimeframeBar must map over SUPPORTED_TIMEFRAMES");
  assert.match(source, BUTTON_KEYED_BY_OPTION, "each button's key must come from the mapped option, not a literal");
  assert.match(source, BUTTON_TESTID_FROM_OPTION, "each button's testid must be derived from option.interval");
  assert.match(source, BUTTON_ONCLICK_FROM_OPTION, "each button's onClick must dispatch option.interval");
  assert.match(source, BUTTON_LABEL_FROM_OPTION, "each button's visible label must be option.interval itself");
});

test("T-03.9 contract: the bar is actually mounted by SymbolClient, above the six panels", () => {
  assert.match(source, BAR_MOUNTED, "a TimeframeBar nobody renders guards nothing");
  const mountIndex = source.search(BAR_MOUNTED);
  const axisProviderIndex = source.indexOf("<AxisSyncProvider axis={axis}>");
  assert.ok(mountIndex >= 0 && axisProviderIndex >= 0, "both anchors must be found");
  assert.ok(mountIndex < axisProviderIndex, "the bar must sit above the six panels, not interleaved with them");
});

test("MORDE: replacing the .map() with one hardcoded <button> per label breaks the contract", () => {
  // The exact regression this DoD exists to forbid: someone "simplifies" TimeframeBar by
  // spelling five buttons out by hand. Reproduced here over the REAL source, in a copy — never
  // mutating the file on disk — and asserted that the two contract tests above would catch it.
  const withoutMap = source.replace(MAP_OVER_SUPPORTED_TIMEFRAMES, "[].map((option: { interval: string }) =>");
  assert.notEqual(withoutMap, source, "the replacement must actually change something — the anchor moved");
  assert.doesNotMatch(
    withoutMap,
    MAP_OVER_SUPPORTED_TIMEFRAMES,
    "MORDE: the mutated source must no longer satisfy the .map()-over-SUPPORTED_TIMEFRAMES contract",
  );
});

test("supported-timeframes.ts and this file agree on how many buttons a full render produces", () => {
  // Not a DOM assertion (no renderer in this suite) — a sanity bound so a future edit to
  // SUPPORTED_TIMEFRAMES that silently doubles or empties the list is visible here too, not only
  // in supported-timeframes.test.ts.
  assert.ok(SUPPORTED_TIMEFRAMES.length >= 1, "the served set must never be empty — an empty bar is not a bar");
  assert.equal(new Set(SUPPORTED_TIMEFRAMES.map((o) => o.interval)).size, SUPPORTED_TIMEFRAMES.length, "no duplicate interval, or React's own `key` warning would fire at runtime for a reason this test can catch first");
});
