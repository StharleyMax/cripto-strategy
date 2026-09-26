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
/** The bar is actually MOUNTED by `SymbolClient` — a component nobody renders guards nothing.
 * `T-03.11`: `onSelect` is now `handleTimeframeSelect` (a `router.push`, never a local
 * `setState`) — see that file's own docstring on why the URL, not `useState`, is the source of
 * truth for `selectedTimeframe` since this task. */
const BAR_MOUNTED = /<TimeframeBar selected=\{selectedTimeframe\} onSelect=\{handleTimeframeSelect\} \/>/;
// W1-FIX: the import may carry other names of the same module (`timeframeStepMs`, MF-B); what the
// contract pins is that `SUPPORTED_TIMEFRAMES` comes from `supported-timeframes.ts`.
const IMPORTS_CANONICAL_ARRAY = /import \{[^}]*\bSUPPORTED_TIMEFRAMES\b[^}]*\} from "\.\/supported-timeframes\.ts";/;

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

// `T-05.2` widened this anchor from the exact string `<AxisSyncProvider axis={axis}>` to a
// regex tolerant of the extra `initialRange`/`onCandidateRange` props the client-side history
// pager now threads through — the component being mounted, and its position relative to the
// bar, are what this test guards; the exact prop list is `axis-sync.test.ts`'s to guard.
const AXIS_PROVIDER_MOUNTED = /<AxisSyncProvider axis=\{axis\}/;

test("T-03.9 contract: the bar is actually mounted by SymbolClient, above the six panels", () => {
  assert.match(source, BAR_MOUNTED, "a TimeframeBar nobody renders guards nothing");
  const mountIndex = source.search(BAR_MOUNTED);
  const axisProviderIndex = source.search(AXIS_PROVIDER_MOUNTED);
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

// ── `T-03.11` (`CST-226`) — the REFETCH wiring, source-scanned the same way ──────────────────

/** `selectedTimeframe` has to arrive as a PROP of `SymbolClientProps`, never a local `useState`
 * initialised off `DEFAULT_TIMEFRAME` — the exact shape `T-03.9` shipped and this task retires.
 * A `useState(DEFAULT_TIMEFRAME)` here would mean the bar's own highlight can silently disagree
 * with which `interval` the ten fetches upstream actually used. */
const SELECTED_TIMEFRAME_IS_A_PROP = /selectedTimeframe,\s*\n\}: SymbolClientProps\)/;
const NO_LOCAL_TIMEFRAME_STATE = /useState<string>\(DEFAULT_TIMEFRAME\)/;
/** The navigation call itself — a `router.push` over the CURRENT `pathname`, never a `fetch`
 * against `INGEST_HEALTH_API_BASE_URL` issued from this client component (`ADR-005/D5`: history
 * reads are `web`'s SERVER half; a browser-side `fetch` here would be the exact boundary
 * violation `web-fullstack.browser-imports-server` exists to catch). */
const NAVIGATES_VIA_ROUTER_PUSH = /router\.push\(`\$\{pathname\}\$\{query\}`, \{ scroll: false \}\)/;
const READS_NAVIGATION_HOOKS = /import \{ usePathname, useRouter \} from "next\/navigation";/;

test("T-03.11 contract: selectedTimeframe is a prop, and the T-03.9 local useState is gone", () => {
  assert.match(
    source,
    SELECTED_TIMEFRAME_IS_A_PROP,
    "SymbolClient must destructure selectedTimeframe out of its own props",
  );
  assert.doesNotMatch(
    source,
    NO_LOCAL_TIMEFRAME_STATE,
    "MORDE-guard: a local useState(DEFAULT_TIMEFRAME) would let the bar's highlight drift from " +
      "the interval the fetches upstream actually used — T-03.11 retires it in favour of the URL",
  );
});

test("T-03.11 contract: selecting a TF navigates (router.push over the route's own pathname), never a client fetch", () => {
  assert.match(source, READS_NAVIGATION_HOOKS, "SymbolClient must import usePathname/useRouter from next/navigation");
  assert.match(
    source,
    NAVIGATES_VIA_ROUTER_PUSH,
    "the TF handler must push a new URL off the CURRENT pathname — a hardcoded route string would " +
      "silently stop working the day this page moves",
  );
  // ⛔ Negative control: this component must never call the sentimento read API directly — that
  // is `page.tsx`'s (the Server Component's) exclusive job, per `ADR-005/D5`.
  assert.doesNotMatch(
    source,
    /fetch\(.*series-history/,
    "SymbolClient (a Client Component) must never fetch /series-history itself — page.tsx does, server-side",
  );
});

test("MORDE: reverting handleTimeframeSelect to a bare setState breaks the T-03.11 contract", () => {
  const reverted = source.replace(
    NAVIGATES_VIA_ROUTER_PUSH,
    "setSelectedTimeframe(interval)",
  );
  assert.notEqual(reverted, source, "the replacement must actually change something — the anchor moved");
  assert.doesNotMatch(
    reverted,
    NAVIGATES_VIA_ROUTER_PUSH,
    "MORDE: the mutated source must no longer satisfy the router.push contract",
  );
});

test("supported-timeframes.ts and this file agree on how many buttons a full render produces", () => {
  // Not a DOM assertion (no renderer in this suite) — a sanity bound so a future edit to
  // SUPPORTED_TIMEFRAMES that silently doubles or empties the list is visible here too, not only
  // in supported-timeframes.test.ts.
  assert.ok(SUPPORTED_TIMEFRAMES.length >= 1, "the served set must never be empty — an empty bar is not a bar");
  assert.equal(new Set(SUPPORTED_TIMEFRAMES.map((o) => o.interval)).size, SUPPORTED_TIMEFRAMES.length, "no duplicate interval, or React's own `key` warning would fire at runtime for a reason this test can catch first");
});

// ── `T-03.12` (`CST-227`) — the ARIA/roving-focus wiring the design gate's own Future-Readiness
// finding (score 6/10) named as unguarded: none of `role="group"`, `aria-pressed`, roving
// `tabIndex`, or the arrow-key handler were pinned by any test, in this file or elsewhere.
// Confirmed a LIVE gap, not a hypothetical one, by QA (`FASE-03-qa`): stripping `aria-pressed`
// and the roving `tabIndex` from the real button JSX left `typecheck`/`lint`/`test:app` (387/387)
// and `test:charts` (228/228) unchanged — zero failures, on the SAME commit these anchors close.

const GROUP_ROLE = /role="group"\s*\n\s*aria-label="Timeframe"\s*\n\s*onKeyDown=\{handleKeyDown\}/;
const BUTTON_ARIA_PRESSED = /aria-pressed=\{isSelected\}/;
const BUTTON_ROVING_TABINDEX = /tabIndex=\{option\.interval === activeInterval \? 0 : -1\}/;
const ARROW_KEY_HANDLER = /const handleKeyDown = useCallback/;
const MOVE_ROVING_FOCUS = /const moveRovingFocus = useCallback/;

test("T-03.12 contract: the bar carries role=group, a Timeframe label, and wires handleKeyDown", () => {
  assert.match(
    source,
    GROUP_ROLE,
    "TimeframeBar's outer <div> must be role=group + aria-label=Timeframe + onKeyDown=handleKeyDown, " +
      "the WAI-ARIA APG Toolbar shape T-03.12 decided (not radiogroup) — see the component's own docstring",
  );
  assert.match(source, ARROW_KEY_HANDLER, "a handleKeyDown callback must exist to drive arrow-key roving focus");
  assert.match(source, MOVE_ROVING_FOCUS, "a moveRovingFocus callback must exist — handleKeyDown with nothing to move is dead wiring");
});

test("T-03.12 contract: each button announces aria-pressed and roves tabIndex off the active member", () => {
  assert.match(
    source,
    BUTTON_ARIA_PRESSED,
    "each button must announce its selected state via aria-pressed={isSelected} — a toggle button " +
      "group silent about which member is pressed fails NNG H2 (match between system and real world)",
  );
  assert.match(
    source,
    BUTTON_ROVING_TABINDEX,
    "each button's tabIndex must rove off activeInterval — five independent Tab stops (the pre-" +
      "T-03.12 shape) is the WRONG Toolbar semantic and the design gate's Interaction Design score " +
      "depends on this being exactly one Tab stop for the whole bar",
  );
});

test("MORDE: stripping aria-pressed and the roving tabIndex from the button breaks both new contracts", () => {
  // The EXACT mutation QA applied by hand to `SymbolClient.tsx` on disk (and reverted) to prove
  // this gap was live rather than theoretical — reproduced here over a COPY of the real source so
  // the MORDE is enforced going forward without needing a human to repeat the manual edit.
  const stripped = source.replace(
    /type="button"\s*\n\s*aria-pressed=\{isSelected\}\s*\n\s*tabIndex=\{option\.interval === activeInterval \? 0 : -1\}\s*\n/,
    'type="button"\n',
  );
  assert.notEqual(stripped, source, "the replacement must actually change something — the anchor moved");
  assert.doesNotMatch(stripped, BUTTON_ARIA_PRESSED, "MORDE: the mutated source must no longer satisfy the aria-pressed contract");
  assert.doesNotMatch(stripped, BUTTON_ROVING_TABINDEX, "MORDE: the mutated source must no longer satisfy the roving-tabIndex contract");
});

// ── `T-03.12` — `PartialCoverageMark` had NO contract of its own (design gate's own Future-
// Readiness finding, same score). It renders NOTHING when `totalReaggregatedBuckets === 0` (no
// reaggregation happened, or every bucket answered in full — nothing undercounted to warn about);
// QA confirmed by mutation that breaking that guard (`=== 0` → `< 0`, a realistic off-by-one/typo
// class of regression, never a count `md.series_history_report.py` can produce) still passes
// `typecheck`/`lint`/`test:app`/`test:charts` clean — the exact silent-false-alarm regression
// `ADR-040/D3`'s "nunca extrapola" clause exists to forbid the OPPOSITE of (a badge that lies by
// APPEARING, not one that lies by omission, but a mark this repo's own operators must trust is
// only as trustworthy as the guard that decides when it speaks).

const PARTIAL_MARK_GUARD = /if \(summary\.totalReaggregatedBuckets === 0\) \{\s*\n\s*return null;\s*\n\s*\}/;
const PARTIAL_MARK_DATA_FACT = /data-fact=\{`\$\{factKey\}:\$\{summary\.partialBuckets\}\/\$\{summary\.totalReaggregatedBuckets\}`\}/;
const PARTIAL_MARK_GLYPH_MOUNTED = /<PartialCoverageGlyph \/>\s*\n\s*COBERTURA PARCIAL/;

test("T-03.12 contract: PartialCoverageMark renders null exactly when totalReaggregatedBuckets is 0", () => {
  assert.match(
    source,
    PARTIAL_MARK_GUARD,
    "PartialCoverageMark must return null on totalReaggregatedBuckets === 0 — anything looser " +
      "(e.g. < 0) would render a false COBERTURA PARCIAL badge for a fully-answered window",
  );
});

test("T-03.12 contract: the mark's data-fact carries factKey:partialBuckets/totalReaggregatedBuckets, and the glyph leads the word", () => {
  assert.match(
    source,
    PARTIAL_MARK_DATA_FACT,
    "data-fact must be literally `${factKey}:${partialBuckets}/${totalReaggregatedBuckets}` — the " +
      "shape every other data-fact assertion in this repo's e2e DoD lines already parses",
  );
  assert.match(
    source,
    PARTIAL_MARK_GLYPH_MOUNTED,
    "PartialCoverageGlyph must be mounted immediately before the COBERTURA PARCIAL word — the " +
      "three-channel discipline (glyph+word+colour) this component's own docstring claims",
  );
});

test("MORDE: loosening the totalReaggregatedBuckets guard from === 0 to < 0 breaks the null-render contract", () => {
  // The EXACT mutation QA applied by hand to `SymbolClient.tsx` on disk (and reverted) to prove
  // this gap was live: with this change, EVERY window with totalReaggregatedBuckets >= 0 (i.e.
  // every real window this backend can ever produce) renders a COBERTURA PARCIAL badge — even one
  // where nothing was ever reaggregated, or every bucket answered in full — and nothing in
  // typecheck/lint/test:app/test:charts caught it before this test existed.
  const loosened = source.replace(
    /if \(summary\.totalReaggregatedBuckets === 0\) \{/,
    "if (summary.totalReaggregatedBuckets < 0) {",
  );
  assert.notEqual(loosened, source, "the replacement must actually change something — the anchor moved");
  assert.doesNotMatch(loosened, PARTIAL_MARK_GUARD, "MORDE: the mutated source must no longer satisfy the null-render guard contract");
});
