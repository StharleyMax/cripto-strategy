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
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(HERE, "SymbolClient.tsx"), "utf8");
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
const EXPECTED_ABSENCE_TOKEN = "SEM_PONTO";

const PANE_TESTID_DECLARATION = /const LIQUIDATION_PANE_TESTID = "([^"]*)";/;
const COHORT_TESTID_BUILDER = /return `liquidation-cohort-\$\{cohort\}`;/;
const ABSENCE_TOKEN_DECLARATION = /const ABSENCE_TOKEN = "([^"]*)";/;

const PRESENT_POINTS_ATTRIBUTE = /data-liquidation-present-points=\{data\.presentPoints\}/;
const ZERO_POINTS_ATTRIBUTE = /data-liquidation-zero-points=\{data\.zeroPoints\}/;
const ABSENT_BRANCH = /data\.reading\.kind === "absent" \|\| data\.reading\.value === null\s*\n?\s*\? ABSENCE_TOKEN/;

const BAR_SETDATA = /barSeries\.setData\(positiveValueSeriesLossless\(data\.slots\) as never\);/;
const ABSENCE_SETDATA = /absenceSeries\.setData\(absenceMarkSeries\(data\.slots, LIQUIDATION_ABSENCE_MARK_PX\) as never\);/;
const ZERO_SETDATA = /zeroSeries\.setData\(zeroMarkSeries\(data\.slots, LIQUIDATION_ZERO_MARK_PX\) as never\);/;
const LOG_MODE =
  /barSeries\.priceScale\(\)\.applyOptions\(\{\s*scaleMargins: LIQUIDATION_BAR_SCALE_MARGINS,\s*mode: PriceScaleMode\.Logarithmic,/;
const MARKS_SCALE_APPLIED = /absenceSeries\.priceScale\(\)\.applyOptions\(\{ scaleMargins: LIQUIDATION_MARKS_SCALE_MARGINS \}\);/;

const ABSENCE_ROLE = /const LIQUIDATION_ABSENCE_MARK_COLOR_ROLE = "(\w+)" as const;/;
const ZERO_ROLE = /const LIQUIDATION_ZERO_MARK_COLOR_ROLE = "(\w+)" as const;/;
const ABSENCE_MARK_PX = /const LIQUIDATION_ABSENCE_MARK_PX = (\d+(?:\.\d+)?);/;
const ZERO_MARK_PX = /const LIQUIDATION_ZERO_MARK_PX = (\d+(?:\.\d+)?);/;
const BAR_MARGINS = /const LIQUIDATION_BAR_SCALE_MARGINS = \{ top: [\d.]+, bottom: ([\d.]+) \} as const;/;
const MARKS_MARGINS = /const LIQUIDATION_MARKS_SCALE_MARGINS = \{ top: ([\d.]+), bottom: [\d.]+ \} as const;/;

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
  assert.match(source, /data-testid=\{LIQUIDATION_PANE_TESTID\}/, "declared is not rendered: the constant must reach an attribute");
  // The per-cohort handles are DERIVED from the cohort name, so a third leg could not be added
  // without a handle; the builder is pinned character for character because the e2e spells the
  // result, not the function.
  assert.match(source, COHORT_TESTID_BUILDER, "the per-cohort testid must be `liquidation-cohort-<cohort>`");
  assert.match(source, /data-testid=\{liquidationCohortTestId\(cohort\)\}/, "and the builder must be USED on the group");
  // And the two legs are both rendered, by name.
  for (const cohort of ["long", "short"]) {
    assert.match(
      source,
      new RegExp(`<LiquidationCohortSurface\\s*\\n\\s*cohort="${cohort}"`),
      `the '${cohort}' cohort is not rendered — a pane with one leg is the net RF-2 forbids, minus half`,
    );
  }
  // Sanity on the strings the e2e will actually type.
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
  // ⛔ AND THE HEADLINE NUMBER MUST NOT BE THE ZERO COUNT, nor the two the same expression. This is
  // this pane's own version of `RN-S1`'s staircase: over the 4-day window the long cohort answers
  // `191` observations of which `62` are zeros `[MEDIDO 2026-09-16]`, and publishing one under the
  // other's name misstates the data by `1,5x` with nothing in the DOM to contradict it.
  assert.doesNotMatch(source, /data-liquidation-present-points=\{data\.zeroPoints\}/);
  assert.doesNotMatch(source, /data-liquidation-zero-points=\{data\.presentPoints\}/);
});

// ── `RN-1` — the rule this pane exists to not break ───────────────────────────────────────────

test("RN-1: absence prints SEM_PONTO, and the token is never a number", () => {
  const declaration = ABSENCE_TOKEN_DECLARATION.exec(source);
  assert.ok(declaration !== null, "ABSENCE_TOKEN declaration not found — the anchor moved, fix this test");
  assert.equal(declaration[1], EXPECTED_ABSENCE_TOKEN, "absence is SEM_PONTO — for a FLOW series a number here is an error of TYPE");
  assert.ok(
    !/^-?\d+(\.\d+)?$/.test(declaration[1]!),
    "the absence token must not be a number in any shape — 0, 0.0 and -0 are all the RN-1 defect",
  );
  assert.match(
    source,
    ABSENT_BRANCH,
    "the absent branch of the liquidation readout must resolve to ABSENCE_TOKEN — a `0` here would " +
      "assert 'nobody was liquidated this minute', a claim about the market made out of ignorance",
  );
});

test("RN-1: absence and legitimate zero are TWO SERIES, with distinct marks and distinct inks", () => {
  // ⛔ THIS IS THE LESSON OF `BLOCKER-2` OF `gates/design-01.md`, REUSED — and here the collision is
  // not structural-but-dormant as it was for volume (`zeros_exatos = 0` there). It is LIVE: the
  // short cohort answers `50` legitimate zeros in `76` observations over 24 h, the long one `23`
  // `[MEDIDO 2026-09-16, GET /api/v1/series-history]`. `ZL-3` of
  // `domain/liquidation_zero_legitimacy.py` makes the zero a real observation, by TYPE.
  assert.match(source, BAR_SETDATA, "the bar series must use the mapping that routes BOTH absence and zero out");
  assert.match(source, ABSENCE_SETDATA, "there is no absence mark series — `WhitespaceItem` draws nothing");
  assert.match(source, ZERO_SETDATA, "there is no mark series for the provider's legitimate zero");
  const absenceRole = ABSENCE_ROLE.exec(source)?.[1];
  const zeroRole = ZERO_ROLE.exec(source)?.[1];
  assert.ok(absenceRole !== undefined && zeroRole !== undefined, "the ink roles of the marks vanished from the source");
  assert.notEqual(
    absenceRole,
    zeroRole,
    "both marks share the SAME ink — 'não houve liquidação' and 'não sabemos' would be the same claim again",
  );
  // ⛔ `ADR-010`: the distinction is one of LUMINANCE, zero hue. Not price direction (green/red is
  // `fill` of a candle, and `long`/`short` here are COHORTS, not market direction) and not
  // `dataBrokenInk` (integrity of the data; a grid gap is operational).
  for (const role of [absenceRole!, zeroRole!]) {
    assert.match(role, /^provenance(Strong|Weak)$/, `the mark uses the role ${role}, outside the provenance ramp`);
  }
  // And the heights differ, which is the second channel — a mark that is invisible or identical to
  // its sibling makes the ink irrelevant.
  const absencePx = Number(ABSENCE_MARK_PX.exec(source)?.[1]);
  const zeroPx = Number(ZERO_MARK_PX.exec(source)?.[1]);
  assert.ok(Number.isFinite(absencePx) && Number.isFinite(zeroPx), "the mark heights vanished from the source");
  assert.ok(absencePx > 0 && zeroPx > absencePx, `absence ${absencePx} and zero ${zeroPx} do not separate by height`);
  // And the third channel, in words — inside the `<canvas>` no legend reaches.
  assert.match(source, /data-fact="liquidation_marks_legend:3"/, "the three states must be named in text too");
});

test("BLOCKER-1 reused: the bar scale is logarithmic AND the scale is declared on screen", () => {
  // `max/p50 = 443,8x` on this series `[MEDIDO 2026-09-16, n=191 grades presentes em 4 dias]`,
  // against the `60,8x` that already put 67,9% of the volume bars below one physical pixel. Linear
  // here would make the MEDIAN bar sub-pixel.
  assert.match(source, LOG_MODE, "the liquidation bar scale does not declare `PriceScaleMode.Logarithmic`");
  assert.match(source, /data-fact="liquidation_scale:log10"/, "the scale must be DECLARED on screen, not merely applied");
  assert.match(source, /escala log10/, "the visible label must state the scale in words");
});

test("the two scale bands are DISJOINT by construction — no bar can reach the marks band", () => {
  // ⛔ THIS IS WHERE THIS PANE GOES BEYOND `T-01.8`'s FIX AND SAYS SO. There the ordering
  // absence < zero < smallest bar was MEASURED over one universe, so a small enough value would
  // re-create the collision. Here the marks live in the bottom `1 - top` of the pane and the bar
  // baseline sits at `bottom` — with `bottom > 1 - top`, NO bar of ANY value reaches the marks.
  const marksTop = Number(MARKS_MARGINS.exec(source)?.[1]);
  const barBottom = Number(BAR_MARGINS.exec(source)?.[1]);
  assert.ok(Number.isFinite(marksTop) && Number.isFinite(barBottom), "the scale margins vanished from the source");
  assert.ok(
    barBottom > 1 - marksTop,
    `the bar baseline sits at ${barBottom} of the pane height and the marks band reaches ${1 - marksTop} — ` +
      "they overlap, and a small bar becomes indistinguishable from the zero mark again",
  );
  assert.match(source, MARKS_SCALE_APPLIED, "the marks margin must be APPLIED, not merely declared");
  // The two mark series share ONE price scale id, so applying the margin on either configures both
  // — asserted here so a reader does not take the single `applyOptions` call for a missing one.
  assert.equal(
    (source.match(/priceScaleId: LIQUIDATION_MARKS_PRICE_SCALE_ID/g) ?? []).length,
    1,
    "both marks must ride ONE shared scale (`markStyle`), or the band they live in is two bands",
  );
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
    /const slots = nonNegativeFlowSlotsFromHistoryRows\(rows\);/,
    "the liquidation slots must come from the shared non-negative FLOW mapper",
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
  assert.equal(
    (pageCode.match(/nonNegativeFlowSlotsFromHistoryRows\(/g) ?? []).length,
    3,
    "exactly THREE call sites — the volume sub-axis, the shared liquidation cohort builder and the " +
      "long/short pane (the import carries no parenthesis). A panel missing from this count wrote " +
      "its own copy of `RN-1`",
  );
});

// ── MORDE: every mutation above, replanted over the real source ───────────────────────────────

test("MORDE: each of the 10 liquidation-pane mutations is caught by an assert above", () => {
  const mutants: readonly {
    readonly name: string;
    readonly file: "client" | "page";
    readonly mutate: (s: string) => string;
  }[] = [
    {
      name: "pane testid renamed",
      file: "client",
      mutate: (s) => s.replace(PANE_TESTID_DECLARATION, 'const LIQUIDATION_PANE_TESTID = "renamed";'),
    },
    {
      name: "the per-cohort handle collapses into one string",
      file: "client",
      mutate: (s) => s.replace(COHORT_TESTID_BUILDER, "return `liquidation-cohort`;"),
    },
    {
      name: "absence rendered as 0 (RN-1)",
      file: "client",
      mutate: (s) => s.replace(ABSENT_BRANCH, 'data.reading.kind === "absent" || data.reading.value === null\n      ? "0"'),
    },
    {
      name: "the present-point attribute deleted",
      file: "client",
      mutate: (s) => s.replace(/\s*data-liquidation-present-points=\{data\.presentPoints\}/, ""),
    },
    {
      name: "the ZERO count published as the headline number",
      file: "client",
      mutate: (s) => s.replace(PRESENT_POINTS_ATTRIBUTE, "data-liquidation-present-points={data.zeroPoints}"),
    },
    {
      name: "back to lineSeriesLossless (zero becomes a zero-height bar)",
      file: "client",
      mutate: (s) => s.replace(BAR_SETDATA, "barSeries.setData(lineSeriesLossless(data.slots) as never);"),
    },
    {
      name: "the absence mark disappears",
      file: "client",
      mutate: (s) => s.replace(ABSENCE_SETDATA, ""),
    },
    {
      name: "both marks start using the SAME ink",
      file: "client",
      mutate: (s) => s.replace(ZERO_ROLE, 'const LIQUIDATION_ZERO_MARK_COLOR_ROLE = "provenanceWeak" as const;'),
    },
    {
      name: "the bar scale goes back to linear",
      file: "client",
      mutate: (s) =>
        s.replace(LOG_MODE, "barSeries.priceScale().applyOptions({\n      scaleMargins: LIQUIDATION_BAR_SCALE_MARGINS,"),
    },
    {
      name: "the RS-5 line is removed from the pane",
      file: "client",
      mutate: (s) => s.replace(PROVENANCE_RENDERED, ""),
    },
  ];
  for (const mutant of mutants) {
    const original = mutant.file === "client" ? source : pageCode;
    const mutated = mutant.mutate(original);
    assert.notEqual(mutated, original, `the mutation "${mutant.name}" found no anchor — update this test, do not delete it`);
    const survives =
      PANE_TESTID_DECLARATION.exec(mutated)?.[1] === EXPECTED_PANE_TESTID &&
      COHORT_TESTID_BUILDER.test(mutated) &&
      ABSENT_BRANCH.test(mutated) &&
      PRESENT_POINTS_ATTRIBUTE.test(mutated) &&
      ZERO_POINTS_ATTRIBUTE.test(mutated) &&
      !/data-liquidation-present-points=\{data\.zeroPoints\}/.test(mutated) &&
      BAR_SETDATA.test(mutated) &&
      ABSENCE_SETDATA.test(mutated) &&
      ZERO_SETDATA.test(mutated) &&
      ABSENCE_ROLE.exec(mutated)?.[1] !== ZERO_ROLE.exec(mutated)?.[1] &&
      LOG_MODE.test(mutated) &&
      PROVENANCE_RENDERED.test(mutated);
    assert.ok(!survives, `the mutation "${mutant.name}" is NOT detected by the asserts above — the guard is vacuous`);
  }
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
      mutate: (s) => s.replace(/const slots = nonNegativeFlowSlotsFromHistoryRows\(rows\);/, "const slots = rows.map((row) => ({ time: row.event_time, value: Number(row.value ?? 0) }));"),
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
      /const slots = nonNegativeFlowSlotsFromHistoryRows\(rows\);/.test(mutated);
    assert.ok(!survives, `the mutation "${mutant.name}" is NOT detected by the asserts above — the guard is vacuous`);
  }
});

// ── CALA: form is `T-05.10`'s to change, and changing it must not touch any assert above ──────

test("CALA: a design_gate NEEDS_FIX about colour, height, wording or order leaves the contract intact", () => {
  // Exactly the kind of edit `T-05.10` (`ui-designer` + `ux-ui-mastery`) is entitled to make
  // WITHOUT coordinating with `T-05.11`. If any of these trips an assert, the contract is guarding
  // form instead of the requirement, and it is the contract that is wrong.
  const restyled = source
    .replace(/const LIQUIDATION_ABSENCE_MARK_PX = \d+;/, "const LIQUIDATION_ABSENCE_MARK_PX = 4;")
    .replace(/const LIQUIDATION_ZERO_MARK_PX = \d+;/, "const LIQUIDATION_ZERO_MARK_PX = 12;")
    .replace(/Liquidação de posições compradas \(long\)/, "Longs liquidados")
    .replace(/Leitura atual: \{readingText\}/, "Último valor conhecido: {readingText}")
    .replace(/grades de 1 min observadas/, "minutos observados")
    .replace(/⚠️ Dado de TERCEIRO/, "Fonte externa");
  assert.notEqual(restyled, source, "the form constants moved — re-anchor this CALA rather than dropping it");
  assert.equal(PANE_TESTID_DECLARATION.exec(restyled)?.[1], EXPECTED_PANE_TESTID);
  assert.match(restyled, COHORT_TESTID_BUILDER);
  assert.match(restyled, PRESENT_POINTS_ATTRIBUTE);
  assert.match(restyled, ZERO_POINTS_ATTRIBUTE);
  assert.match(restyled, ABSENT_BRANCH);
  assert.match(restyled, BAR_SETDATA);
  assert.match(restyled, ABSENCE_SETDATA);
  assert.match(restyled, ZERO_SETDATA);
  assert.match(restyled, LOG_MODE);
  assert.match(restyled, PROVENANCE_DECLARED_FACT);
  assert.notEqual(ABSENCE_ROLE.exec(restyled)?.[1], ZERO_ROLE.exec(restyled)?.[1]);
  // The restyled marks still separate by height — the CALA must not license a collision.
  assert.ok(Number(ZERO_MARK_PX.exec(restyled)?.[1]) > Number(ABSENCE_MARK_PX.exec(restyled)?.[1]));
});
