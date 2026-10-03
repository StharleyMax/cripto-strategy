/**
 * `T-05.9` — the DOM CONTRACT of the liquidation pane, guarded. Sibling of
 * `volume-subaxis-dom-contract.test.ts`/`cvd-pane-dom-contract.test.ts`/
 * `oi-pane-dom-contract.test.ts`, and it exists for the same measured reason those give:
 * `liquidation-series-selector.test.ts` proves the SELECTOR and the `RS-5` RULE are right and
 * NOTHING about the route calling them or the pane rendering them.
 *
 * ⚠️ WHY A SOURCE SCAN AND NOT A RENDER: verbatim the reason the three sibling files give — this
 * repo has no component renderer in any suite (`@testing-library` is not installed) and
 * `SymbolClient.tsx` imports `lightweight-charts`, which wants a DOM. This instrument proves the
 * literal is SPELLED where the contract requires it; `liquidation-geometry.test.ts` proves the
 * PIXELS against the real library; and the browser half is `T-05.11`'s e2e, which reads a real
 * number out of a real page. Three instruments, three different things, none substitutable.
 *
 * ── THE MUTATIONS, AND THE UNIVERSE THEY WERE MEASURED IN ────────────────────────────────────
 *
 * `npm --prefix frontend run test:app` with this file OUT of the suite versus IN it, one mutation
 * applied at a time to `SymbolClient.tsx`/`page.tsx` `[MEDIDO 2026-09-16, universo: 227 testes com
 * este arquivo fora, 239 com ele]`. The column on the left is half the measurement, not decoration:
 * "morde" alone does not exclude a guard that rejects anything, and `227 / 0` on every row is what
 * proves the guard was NOT there before.
 *
 * Every mutation below is replanted IN THIS FILE, over the real production source, and the
 * `MORDE` tests assert that the asserts above them reject it.
 *
 * ⚠️ `T-04.2` RE-ANCHORED THE CLIENT HALF. The two legs are ONE pane now (`ADR-044/D4`): the
 * geometry the old asserts pinned in this file's source — two margins, one log mode, three
 * `setData` literals per leg — moved to `charts/liquidation-pane-geometry.ts` (`T-04.1`), which
 * proves it against the real library in its own suite. What stays HERE is the WIRING: that the pane
 * hands BOTH legs to that module, by the registry's `scale_ref`s, with the form that module
 * validates, the shared maximum on both bar series and the inks by side. The mutations below are
 * the wiring's. `liquidation-geometry.test.ts` (the two-pane geometry in pixels) was retired with
 * the configuration it measured — `gates/T-04.2-builder.md` §3.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertValidLiquidationPaneForm } from "../../charts/index.ts";
import { LIQUIDATION_PANE_FORM } from "./liquidation-pane-form.ts";
import { MOVED_OUT_FILES } from "./symbol-client-moved-out-files.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const source = ["SymbolClient.tsx", ...MOVED_OUT_FILES]
  .map((file) => readFileSync(path.join(HERE, file), "utf8"))
  .join("\n");
const pageSource = readFileSync(path.join(HERE, "[symbol]", "page.tsx"), "utf8");

/** `page.tsx` with every comment removed — block first, then line. Needed because the asserts below
 * ask whether a RETIRED shape is gone from the CODE, and `page.tsx`'s comments quote the shapes they
 * retired. Scanning raw text would fail a correct, well-documented file and pass an undocumented
 * one. Crude on purpose, same as the three sibling files'. */
const pageCode = pageSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The selectors `e2e/13-liquidacoes-dado-real.spec.ts` (`T-05.11`) will `page.locator()` by.
 * Duplicated here ON PURPOSE: a contract with another task is not guarded by importing the constant
 * it is made of — that would rename itself along with the mutation it is supposed to catch. */
const EXPECTED_PANE_TESTID = "liquidation-pane";
const EXPECTED_COHORT_TESTIDS = ["liquidation-cohort-long", "liquidation-cohort-short"] as const;

const PANE_TESTID_DECLARATION = /const LIQUIDATION_PANE_TESTID = "([^"]*)";/;
const COHORT_TESTID_BUILDER = /return `liquidation-cohort-\$\{cohort\}`;/;

const PRESENT_POINTS_ATTRIBUTE = /data-liquidation-present-points=\{data\.presentPoints\}/;
const ZERO_POINTS_ATTRIBUTE = /data-liquidation-zero-points=\{data\.zeroPoints\}/;
const ABSENT_BRANCH = /data\.reading\.kind === "absent" \|\| data\.reading\.value === null\s*\n?\s*\? ABSENCE_TOKEN/;

/** `T-04.2` — BOTH legs are rendered as groups, in the order the registry's refs give. */
const LEGS_RENDERED = /\{cohortsTopFirst\.map\(\(cohort\) => \(\s*<LiquidationLegGroup/;
const LEG_LABELS = /const LIQUIDATION_LEG_LABEL: Readonly<Record<LiquidationCohort, string>> = \{\s*short: "[^"]+",\s*long: "[^"]+",\s*\};/;
/** `T-04.2` — BOTH legs are handed to `charts`' feed builder, each with its OWN slots and its ref. */
const LEGS_FED = /const legs = \(\["short", "long"\] as const\)\.map\(\(cohort\) => \(\{\s*cohort,\s*scaleRef: handles\.scaleRefs\[cohort\],\s*slots: liquidation\[cohort\]\.slots,/;
const FEEDS_CALL = /return liquidationPaneFeeds\(legs, handles\.live\.marks\)\.map\(\(feed\) => \(\{\s*series: handles\.series\[feed\.side\]\[feed\.role\],\s*items: feed\.items,/;
/** The refs are the REGISTRY's (or the ablation's swap of them), never a literal scale name here. */
const REFS_FROM_REGISTRY = /: LIQUIDATION_LEG_SCALE_REF;/;
/** The layout is `charts`', from the form `web` owns — at mount and on every measure. */
/** `T-04.4`: the form is the ONE constant of `liquidation-pane-form.ts`, and the canvas draws it
 * unless the e2e ablation's query asks for its log variant. */
const FORM_DECLARATION = /import \{ LIQUIDATION_PANE_FORM \} from "\.\/liquidation-pane-form\.ts";/;
const DEFAULT_FORM_RETURNED = /return \{ \.\.\.LIQUIDATION_PANE_FORM, mode: "logarithmic" \};\s*\}\s*return LIQUIDATION_PANE_FORM;\s*\}/;
const ABLATION_GATED = /\.get\(LIQUIDATION_LOG_ABLATION_QUERY_PARAM\) === "1"\)/;
const LAYOUT_ON_MEASURE = /const layout = liquidationPaneLayout\(handles\.form, measure\);/;
const SCALES_APPLIED = /series\[side\]\.bars\.priceScale\(\)\.applyOptions\(\{\s*scaleMargins: bars\.scaleMargins,\s*invertScale: bars\.invertScale,\s*mode: liquidationPriceScaleMode\(bars\.mode\),/;
const LOG_MAPPING = /mode === "logarithmic" \? PriceScaleMode\.Logarithmic : PriceScaleMode\.Normal/;
/** `T-04.4` (gate §5.3): the scale is declared in the VISIBLE key, as linear, with the fact. */
const KEY_DECLARES_LINEAR = /<span data-fact="liquidation_scale:linear"> · altura linear, a mesma escala nas duas pernas<\/span>/;
const SR_ONLY_DECLARES_LINEAR = /altura\s+proporcional ao valor em USD, na mesma escala nas duas pernas; o topo é a maior barra visível das duas/;
/** Where the scale copy lives: the visible key and the `sr-only` legend, each up to its closing brace. */
function functionBody(text: string, name: string): string {
  const start = text.indexOf(`function ${name}()`);
  if (start < 0) return "";
  const end = text.indexOf("\n}\n", start);
  return end < 0 ? "" : text.slice(start, end);
}
/** No copy of the pane may still speak log: a label that outlived its scale is the lie `T-02.2` §5.6
 * names (copy nobody pins keeps lying and nothing fails). */
function scaleCopyIsLinearOnly(text: string): boolean {
  const copy = functionBody(text, "LiquidationMarksKey") + functionBody(text, "LiquidationMarksLegend");
  return (
    copy.length > 0 &&
    KEY_DECLARES_LINEAR.test(copy) &&
    SR_ONLY_DECLARES_LINEAR.test(copy) &&
    !/ordem de grandeza|log10/.test(copy) &&
    !/liquidation_scale:log10|LiquidationScaleNote/.test(text)
  );
}
/** `C-3`: ONE provider for both bar series, rebuilt from the current data on every apply. */
const SHARED_AUTOSCALE_HUNG = /autoscaleInfoProvider: \(\) => live\.autoscale\(\),/;
const SHARED_AUTOSCALE_BUILT = /handles\.live\.autoscale = sharedMagnitudeAutoscale\(\s*\[bySide\("up"\), bySide\("down"\)\],/;
/** The ink of the bars follows the SIDE (`[Q-LIQ-2]`). */
const BAR_INK_BY_SIDE = /const LIQUIDATION_BAR_COLOR_ROLE: Readonly<Record<LiquidationSide, ColorRole>> = \{\s*up: "directionUpFill",\s*down: "directionDownFill",\s*\};/;
const BAR_INK_USED = /color: tokens\[LIQUIDATION_BAR_COLOR_ROLE\[side\]\],/;

const ABSENCE_ROLE = /const LIQUIDATION_ABSENCE_MARK_COLOR_ROLE = "(\w+)" as const;/;
const ZERO_ROLE = /const LIQUIDATION_ZERO_MARK_COLOR_ROLE = "(\w+)" as const;/;

const PROVENANCE_DECLARED_FACT = /data-fact=\{`liquidation_provenance:declared:\$\{provenance\.provider\}`\}/;
const PUBLISHED_ERROR_ATTRIBUTE = /data-published-error=\{/;
const PROVENANCE_RENDERED = /<LiquidationProvenance provenance=\{liquidation\.provenance\} \/>/;

/** `page.tsx`: the two cohort selectors, CALLED, each with its own leg. */
const PAGE_LONG_SELECTOR = /resolveCatalogEntry\(catalog, routeSymbol, \(entry\) => matchesLiquidationCohort\(entry\.key, "long"\)\)/;
const PAGE_SHORT_SELECTOR = /resolveCatalogEntry\(catalog, routeSymbol, \(entry\) => matchesLiquidationCohort\(entry\.key, "short"\)\)/;
/** `page.tsx`: the provenance is RESOLVED from the catalog row, never spelled as a literal. */
const PAGE_PROVENANCE = /provenance: resolveSeriesProvenance\(liquidationEntry\)/;
/** `page.tsx`: the two statuses are two, so one live cohort cannot vouch for a dead one. */
const PAGE_LONG_STATUS = /liquidationLong: liquidationLongResult\.status/;
const PAGE_SHORT_STATUS = /liquidationShort: liquidationShortResult\.status/;

// ── The stable handles `T-05.11` depends on ───────────────────────────────────────────────────

test("T-05.11 contract: the pane and BOTH cohorts carry stable testids, spelled exactly", () => {
  const declaration = PANE_TESTID_DECLARATION.exec(source);
  assert.ok(declaration !== null, "LIQUIDATION_PANE_TESTID declaration not found — the anchor moved, fix this test");
  assert.equal(
    declaration[1],
    EXPECTED_PANE_TESTID,
    "the e2e locates this pane by the literal string — renaming it empties that spec silently",
  );
  assert.equal(
    (source.match(/data-testid=\{LIQUIDATION_PANE_TESTID\}/g) ?? []).length,
    1,
    "declared is not rendered, or rendered twice: `e2e/13` requires exactly ONE element with it",
  );
  // The per-cohort handles are DERIVED from the cohort name, so a third leg could not be added
  // without a handle; the builder is pinned character for character because the e2e spells the
  // result, not the function.
  assert.match(source, COHORT_TESTID_BUILDER, "the per-cohort testid must be `liquidation-cohort-<cohort>`");
  assert.match(source, /data-testid=\{liquidationCohortTestId\(cohort\)\}/, "and the builder must be USED on the group");
  // `T-04.2`: both legs are rendered, one group each, and both are NAMED.
  assert.match(source, LEGS_RENDERED, "the legs are not rendered from the registry's order — a pane with one leg is the net RF-2 forbids, minus half");
  assert.match(source, LEG_LABELS, "each of the two legs must have its own name");
  assert.deepEqual(
    EXPECTED_COHORT_TESTIDS.map((id) => id.replace("liquidation-cohort-", "")),
    ["long", "short"],
    "the expected testids and the cohorts must stay the same pair",
  );
});

test("T-05.11 contract: BOTH counts are bare integer attributes on the SAME element as the testid", () => {
  assert.match(source, PRESENT_POINTS_ATTRIBUTE, "`DoD-3`'s N has to be machine-readable");
  assert.match(source, ZERO_POINTS_ATTRIBUTE, "the zero count is published beside it, so the ratio is checkable");
  const sameElement =
    /data-testid=\{liquidationCohortTestId\(cohort\)\}\s*\n\s*data-liquidation-present-points=\{data\.presentPoints\}\s*\n\s*data-liquidation-zero-points=\{data\.zeroPoints\}/;
  assert.match(source, sameElement, "testid and both counts must sit on the SAME element, or `getAttribute` finds nothing");
  // ⛔ AND THE HEADLINE NUMBER MUST NOT BE THE ZERO COUNT, nor the two the same expression. Over the
  // 4-day window the long cohort answers `191` observations of which `62` are zeros `[MEDIDO
  // 2026-09-16]`, and publishing one under the other's name misstates the data by `1,5x`.
  assert.doesNotMatch(source, /data-liquidation-present-points=\{data\.zeroPoints\}/);
  assert.doesNotMatch(source, /data-liquidation-zero-points=\{data\.presentPoints\}/);
});

// ── `RN-1` — the rule this pane exists to not break ───────────────────────────────────────────

test("RN-1: the liquidation readout's absent branch resolves to ABSENCE_TOKEN", () => {
  // `T-10.10`: WHICH word `ABSENCE_TOKEN` is (`ausente`, never a number) is pinned ONCE, in
  // `absence-readout-microcopy.test.ts` — it was copied into five pane contracts, and the mutation
  // `ABSENCE_TOKEN = "SEM_PONTO"` turned all six red for one defect (`UNIT-FRONT-analise` §2, F03).
  // What stays HERE is the half only this pane has: its readout falls back to that token.
  assert.match(
    source,
    ABSENT_BRANCH,
    "the absent branch of the liquidation readout must resolve to ABSENCE_TOKEN — a `0` here would " +
      "assert 'nobody was liquidated this minute', a claim about the market made out of ignorance",
  );
});

test("T-04.2 / RN-4: BOTH legs go to charts' feed builder, each with its own slots and the registry's ref", () => {
  // `liquidationPaneFeeds` (`T-04.1`) is where absence and zero become TWO SERIES per leg, on the
  // leg's own side, and where a value `< 0` throws — the pane's job is to hand it both legs.
  assert.match(source, LEGS_FED, "the two legs are not both fed, each with ITS OWN slots and scaleRef");
  assert.match(source, FEEDS_CALL, "the feeds do not reach the series of their side and role");
  assert.match(source, REFS_FROM_REGISTRY, "the scale refs must come from the registry's LIQUIDATION_LEG_SCALE_REF");
  assert.doesNotMatch(
    source,
    /"liquidation_(up|down)(_marks)?"/,
    "a scale NAME spelled in the view — the side would stop coming from the registry's scale_ref",
  );
  const absenceRole = ABSENCE_ROLE.exec(source)?.[1];
  const zeroRole = ZERO_ROLE.exec(source)?.[1];
  assert.ok(absenceRole !== undefined && zeroRole !== undefined, "the ink roles of the marks vanished from the source");
  assert.notEqual(absenceRole, zeroRole, "both marks share the SAME ink — 'não houve' and 'não sabemos' would be one claim");
  // ⛔ `ADR-010`: the marks separate by LUMINANCE, zero hue — the direction hue is the bars' channel.
  for (const role of [absenceRole!, zeroRole!]) {
    assert.match(role, /^provenance(Strong|Weak)$/, `the mark uses the role ${role}, outside the provenance ramp`);
  }
  // Height is the second channel, and the form carries it (`markBandGeometry` refuses zero <= absence).
  assert.ok(LIQUIDATION_PANE_FORM.zeroMarkPx > LIQUIDATION_PANE_FORM.absenceMarkPx);
  // And the third channel, in words — inside the `<canvas>` no legend reaches.
  assert.match(source, /data-fact="liquidation_marks_legend:3"/, "the three states must be named in text too");
});

test("T-04.2: the form is laid out by charts at mount AND on every measure, and applied with invertScale", () => {
  assert.match(source, FORM_DECLARATION, "the pane's form must come from the ONE constant of liquidation-pane-form.ts");
  assert.doesNotMatch(source, /const LIQUIDATION_PANE_FORM\b/, "a second form declared in the view is a second truth");
  assert.doesNotThrow(() => assertValidLiquidationPaneForm(LIQUIDATION_PANE_FORM));
  assert.match(source, DEFAULT_FORM_RETURNED, "without the ablation's query the canvas draws the decided form, unchanged");
  assert.match(source, ABLATION_GATED, "the log variant is reachable only through the e2e query, set to 1");
  assert.match(source, LAYOUT_ON_MEASURE, "the layout must follow the MEASURED pane and legend");
  assert.match(source, /const form = liquidationPaneForm\(\);\s*const initial = liquidationPaneLayout\(form, \{/, "and exist before the first feed");
  assert.match(source, SCALES_APPLIED, "the bar scales must receive the layout's margins, invertScale and mode");
  // The two marks of a side share ONE price scale id — one band per side, not two.
  assert.equal((source.match(/priceScaleId: ids\.marks,/g) ?? []).length, 1);
});

test("T-04.4 / [Q-DG-2]: the form is linear, and the scale is declared on screen as linear — never as log", () => {
  // `gates/T-04.4-design-gate.md` §5.1 (APPROVED in §9): linear, base 0; §5.3: the declaration moves
  // into the key line (visible) and the sr-only legend, and nothing may still say "ordem de grandeza".
  assert.equal(LIQUIDATION_PANE_FORM.mode, "normal", "the decided form is linear — a log form would make the declaration below lie");
  assert.match(source, LOG_MAPPING, "the form's mode must still reach PriceScaleMode (the ablation draws log on purpose)");
  assert.match(source, KEY_DECLARES_LINEAR, "the visible key must declare the linear scale, with the fact");
  assert.match(source, SR_ONLY_DECLARES_LINEAR, "the sr-only legend must say what the height means");
  assert.ok(scaleCopyIsLinearOnly(source), "a copy of the pane still speaks log10 / 'ordem de grandeza'");
  assert.doesNotMatch(source, /escala log10/, "the log10 label outlived its scale");
});

test("C-3 and [Q-LIQ-2]: one shared maximum on both bar series, and the bar ink follows the side", () => {
  assert.match(source, SHARED_AUTOSCALE_HUNG, "the bar series must hang the SHARED provider");
  assert.equal((source.match(/autoscaleInfoProvider: \(\) => live\.autoscale\(\),/g) ?? []).length, 1, "one barStyle for both sides");
  assert.match(source, SHARED_AUTOSCALE_BUILT, "the shared provider must read BOTH legs");
  assert.match(source, BAR_INK_BY_SIDE, "up = the rise's token, down = the fall's (Coinalyze, [Q-LIQ-2])");
  assert.match(source, BAR_INK_USED, "the bar series must take the ink of its SIDE");
});

// ── `RS-5` — the label, and the fact that it is owed by TYPE ──────────────────────────────────

test("RS-5: the pane declares WHOSE measurement it shows, and carries published_error even when absent", () => {
  assert.match(source, PROVENANCE_RENDERED, "the provenance line must be RENDERED, not merely declared");
  assert.match(source, PROVENANCE_DECLARED_FACT, "the third-party verdict has to be machine-readable");
  assert.match(source, PUBLISHED_ERROR_ATTRIBUTE, "`published_error` must reach the DOM — including when it is absent");
  // ⛔ ABSENT IS SAID, NOT OMITTED. A screen that drops the field lets a reader take "no error
  // published" for "no doubt", and for M4 the emptiness IS the honest signal
  // (`liquidation_catalog.py`: no oracle exists, and `ADR-036/D6` escalated the question).
  assert.match(source, /\? "none"/, "an absent published_error must render as an explicit token, not as nothing");
  assert.match(source, /Erro publicado: NENHUM/, "and it must be said in words the operator reads");
  // The three kinds are three renderings, and `origin` is never what an unresolved panel gets.
  assert.match(source, /data-fact="liquidation_provenance:unresolved"/);
  assert.match(source, /data-fact=\{`liquidation_provenance:origin:\$\{provenance\.provider\}`\}/);
  // Route side: the verdict is RESOLVED from the catalog row, never a literal in the view.
  assert.match(pageCode, PAGE_PROVENANCE, "the provenance must come from resolveSeriesProvenance over the resolved entry");
  assert.doesNotMatch(
    source,
    /"coinalyze"/,
    "a hardcoded provider string in the view would be true today and free to stay true after the " +
      "series stopped being third-party — the rule lives in view-model.ts",
  );
});

// ── The route side ────────────────────────────────────────────────────────────────────────────

test("the route resolves TWO cohorts through the unique-match helper, and gives them TWO statuses", () => {
  assert.match(pageCode, PAGE_LONG_SELECTOR, "the long leg must select by identity, cohort included");
  assert.match(pageCode, PAGE_SHORT_SELECTOR, "the short leg must select by identity, cohort included");
  assert.doesNotMatch(pageCode, /catalog\.entries\.find\(/, "`Array.prototype.find` over the catalog is the defect");
  // ⛔ TWO STATUSES, NEVER ONE. They are fetched under two `series_key_id`s and fail independently;
  // a shared status would let a live cohort vouch for a dead one.
  assert.match(pageCode, PAGE_LONG_STATUS);
  assert.match(pageCode, PAGE_SHORT_STATUS);
  // And nothing in the route adds the legs together.
  assert.doesNotMatch(
    pageCode,
    /liquidationLongResult\.rows\.concat\(|liquidationShort[\w.]*\s*\+\s*liquidationLong/,
    "the two legs must never be merged — their sum moves identically whether longs, shorts or both were flushed",
  );
});

test("the route reuses the ONE RN-1 mapper, and does not write a second copy of the rule", () => {
  assert.match(
    pageCode,
    /const slots = nonNegativeFlowSlotsFromHistoryRows\(rows, routeWindow\.window, axisStepMs\);/,
    "the liquidation slots must come from the shared non-negative FLOW mapper, grid-padded by the " +
      "route's own window ON THE AXIS STEP (`CA-5a` fix, `gates/FASE-02-qa.md`; the step is the " +
      "TF's since `T-05.1`, never a fixed 1 min)",
  );
  // ⛔ AND THE OLD NAME IS GONE. `volumeSlotsFromHistoryRows` called on liquidation rows would work
  // and LIE at the call site; a second mapper would be two implementations of `RN-1`.
  assert.doesNotMatch(pageCode, /volumeSlotsFromHistoryRows/, "the volume-specific name must not come back");
  // ⚠️ THE NUMBER MOVED FROM 2 TO 3 IN `T-04.5`, AND THAT IS THE GUARD SAYING WHAT IT WAS BUILT TO
  // SAY. The long/short pane (M3) maps its rows with this SAME function — a non-negative scalar
  // whose absence stays absence describes a ratio of account counts as exactly as it describes a
  // summed quantity — so the count rose by one because a pane JOINED the rule, which is the opposite
  // of the failure this assert watches for. What it still catches is a pane that stops sharing it:
  // a fourth mapper written by hand leaves this number where it is and fails the MORDE below.
  // ⚠️ AND FROM 3 TO 4 IN `W1-REVIEW-r2` BLOCKER-2, FOR THE SAME REASON: the volume LEGEND reads the
  // same rows on the canonical grid (`legendSlots`, `ADR-044/D2`) through this SAME mapper, with the
  // route window — a consumer joined the rule; no second copy of it was written.
  assert.equal(
    (pageCode.match(/nonNegativeFlowSlotsFromHistoryRows\(/g) ?? []).length,
    4,
    "exactly FOUR call sites — the volume sub-axis bars, the volume legend's grid copy, the shared " +
      "liquidation cohort builder and the long/short pane (the import carries no parenthesis). A " +
      "panel missing from this count wrote its own copy of `RN-1`",
  );
});

// ── MORDE: every mutation above, replanted over the real source ───────────────────────────────

const CLIENT_ASSERTS: readonly ((mutated: string) => boolean)[] = [
  (m) => PANE_TESTID_DECLARATION.exec(m)?.[1] === EXPECTED_PANE_TESTID,
  (m) => (m.match(/data-testid=\{LIQUIDATION_PANE_TESTID\}/g) ?? []).length === 1,
  (m) => COHORT_TESTID_BUILDER.test(m),
  (m) => LEGS_RENDERED.test(m),
  (m) => ABSENT_BRANCH.test(m),
  (m) => PRESENT_POINTS_ATTRIBUTE.test(m),
  (m) => ZERO_POINTS_ATTRIBUTE.test(m),
  (m) => !/data-liquidation-present-points=\{data\.zeroPoints\}/.test(m),
  (m) => LEGS_FED.test(m),
  (m) => FEEDS_CALL.test(m),
  (m) => REFS_FROM_REGISTRY.test(m),
  (m) => !/"liquidation_(up|down)(_marks)?"/.test(m),
  (m) => ABSENCE_ROLE.exec(m)?.[1] !== ZERO_ROLE.exec(m)?.[1],
  (m) => LAYOUT_ON_MEASURE.test(m),
  (m) => SCALES_APPLIED.test(m),
  (m) => LOG_MAPPING.test(m),
  (m) => scaleCopyIsLinearOnly(m),
  (m) => FORM_DECLARATION.test(m),
  (m) => DEFAULT_FORM_RETURNED.test(m),
  (m) => ABLATION_GATED.test(m),
  (m) => SHARED_AUTOSCALE_HUNG.test(m),
  (m) => SHARED_AUTOSCALE_BUILT.test(m),
  (m) => BAR_INK_BY_SIDE.test(m),
  (m) => BAR_INK_USED.test(m),
  (m) => PROVENANCE_RENDERED.test(m),
];

test("MORDE: each of the 19 liquidation-pane mutations is caught by an assert above", () => {
  const mutants: readonly { readonly name: string; readonly mutate: (s: string) => string }[] = [
    { name: "pane testid renamed", mutate: (s) => s.replace(PANE_TESTID_DECLARATION, 'const LIQUIDATION_PANE_TESTID = "renamed";') },
    { name: "the per-cohort handle collapses into one string", mutate: (s) => s.replace(COHORT_TESTID_BUILDER, "return `liquidation-cohort`;") },
    {
      name: "absence rendered as 0 (RN-1)",
      mutate: (s) => s.replace(ABSENT_BRANCH, 'data.reading.kind === "absent" || data.reading.value === null\n      ? "0"'),
    },
    { name: "the ZERO count published as the headline number", mutate: (s) => s.replace(PRESENT_POINTS_ATTRIBUTE, "data-liquidation-present-points={data.zeroPoints}") },
    { name: "only the short leg is fed", mutate: (s) => s.replace('const legs = (["short", "long"] as const)', 'const legs = (["short"] as const)') },
    { name: "the long leg fed the short leg's slots", mutate: (s) => s.replace("slots: liquidation[cohort].slots,", 'slots: liquidation["short"].slots,') },
    { name: "a scale name spelled in the view", mutate: (s) => s.replace("scaleRef: handles.scaleRefs[cohort],", 'scaleRef: "liquidation_up",') },
    { name: "the invertScale of the layout is dropped", mutate: (s) => s.replace("invertScale: bars.invertScale,", "invertScale: false,") },
    { name: "the form's mode stops reaching the library (the log ablation would draw linear, silently)", mutate: (s) => s.replace(LOG_MAPPING, "mode === \"logarithmic\" ? PriceScaleMode.Normal : PriceScaleMode.Normal") },
    // `T-04.4` — the scale declaration and the decided form.
    { name: "the linear declaration removed from the visible key", mutate: (s) => s.replace(KEY_DECLARES_LINEAR, "") },
    { name: "the sr-only legend back to 'altura em ordem de grandeza'", mutate: (s) => s.replace(SR_ONLY_DECLARES_LINEAR, "altura em ordem de grandeza") },
    { name: "the log10 note comes back beside the linear key", mutate: (s) => s.replace("<LiquidationMarksKey />", '<p data-fact="liquidation_scale:log10">Altura em escala log10</p>\n          <LiquidationMarksKey />') },
    { name: "the canvas always draws the log variant", mutate: (s) => s.replace(/return LIQUIDATION_PANE_FORM;\s*\}/, 'return { ...LIQUIDATION_PANE_FORM, mode: "logarithmic" };\n}') },
    { name: "the ablation fires without its query", mutate: (s) => s.replace(ABLATION_GATED, ".get(LIQUIDATION_LOG_ABLATION_QUERY_PARAM) !== \"0\")") },
    { name: "a second form declared in the view", mutate: (s) => s.replace(FORM_DECLARATION, "const LIQUIDATION_PANE_FORM: LiquidationPaneForm = { ...BASE_FORM };") },
    { name: "each bar series autoscales on its own (C-3)", mutate: (s) => s.replace(SHARED_AUTOSCALE_HUNG, "") },
    { name: "the ink bound to one token for both sides", mutate: (s) => s.replace(BAR_INK_USED, 'color: tokens["provenanceStrong"],') },
    { name: "both marks start using the SAME ink", mutate: (s) => s.replace(ZERO_ROLE, 'const LIQUIDATION_ZERO_MARK_COLOR_ROLE = "provenanceWeak" as const;') },
    { name: "the RS-5 line is removed from the pane", mutate: (s) => s.replace(PROVENANCE_RENDERED, "") },
  ];
  for (const mutant of mutants) {
    const mutated = mutant.mutate(source);
    assert.notEqual(mutated, source, `the mutation "${mutant.name}" found no anchor — update this test, do not delete it`);
    const survives = CLIENT_ASSERTS.every((holds) => holds(mutated));
    assert.ok(!survives, `the mutation "${mutant.name}" is NOT detected by the asserts above — the guard is vacuous`);
  }
  // And the real source passes every one of them — a guard that rejects anything proves nothing.
  assert.ok(CLIENT_ASSERTS.every((holds) => holds(source)));
});

test("MORDE, route side: the 4 route mutations are caught", () => {
  const mutants: readonly { readonly name: string; readonly mutate: (s: string) => string }[] = [
    {
      name: "the short leg selected without its cohort (ambiguous, and silently so if `find` returned)",
      mutate: (s) =>
        s.replace(PAGE_SHORT_SELECTOR, 'resolveCatalogEntry(catalog, (entry) => entry.key.metric === "sum_liquidation")'),
    },
    {
      name: "one status serving both legs",
      mutate: (s) => s.replace(PAGE_SHORT_STATUS, "liquidationShort: liquidationLongResult.status"),
    },
    {
      name: "the provenance spelled as a literal instead of resolved",
      mutate: (s) => s.replace(PAGE_PROVENANCE, 'provenance: { kind: "declared", provider: "coinalyze" }'),
    },
    {
      name: "a second copy of the RN-1 mapper for liquidation",
      mutate: (s) => s.replace(/const slots = nonNegativeFlowSlotsFromHistoryRows\(rows, routeWindow\.window, axisStepMs\);/, "const slots = rows.map((row) => ({ time: row.event_time, value: Number(row.value ?? 0) }));"),
    },
  ];
  for (const mutant of mutants) {
    const mutated = mutant.mutate(pageCode);
    assert.notEqual(mutated, pageCode, `the mutation "${mutant.name}" found no anchor — update this test, do not delete it`);
    const survives =
      PAGE_LONG_SELECTOR.test(mutated) &&
      PAGE_SHORT_SELECTOR.test(mutated) &&
      PAGE_LONG_STATUS.test(mutated) &&
      PAGE_SHORT_STATUS.test(mutated) &&
      PAGE_PROVENANCE.test(mutated) &&
      /const slots = nonNegativeFlowSlotsFromHistoryRows\(rows, routeWindow\.window, axisStepMs\);/.test(mutated);
    assert.ok(!survives, `the mutation "${mutant.name}" is NOT detected by the asserts above — the guard is vacuous`);
  }
});

// ── CALA: form is the `design_gate`'s to change, and changing it must not touch any assert above ──

test("CALA: a design_gate NEEDS_FIX about wording, order or legend leaves the contract intact", () => {
  // Exactly the kind of edit the `ui-designer` + `ux-ui-mastery` are entitled to make (`T-04.3`, `T-04.4`).
  // If any of these trips an assert, the contract is guarding form instead of the requirement.
  const restyled = source
    .replace(/Liquidação de posições compradas \(long\)/, "Longs liquidados")
    .replace(/Leitura atual: \{readingText\}/, "Último valor conhecido: {readingText}")
    .replace(/grades de \{slotUnit\} observadas/, "minutos observados")
    .replace(/⚠️ Dado de TERCEIRO/, "Fonte externa");
  assert.notEqual(restyled, source, "the form strings moved — re-anchor this CALA rather than dropping it");
  assert.ok(CLIENT_ASSERTS.every((holds) => holds(restyled)));
  assert.match(restyled, PROVENANCE_DECLARED_FACT);
});
