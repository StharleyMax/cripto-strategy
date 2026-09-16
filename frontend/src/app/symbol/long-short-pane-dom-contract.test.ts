/**
 * `T-04.5` — the DOM CONTRACT of the long/short pane, guarded. Sibling of
 * `volume-subaxis-dom-contract.test.ts`/`cvd-pane-dom-contract.test.ts`/
 * `oi-pane-dom-contract.test.ts`/`liquidation-pane-dom-contract.test.ts`, and it exists for the
 * reason those give: `long-short-series-selector.test.ts` proves the SELECTOR and the NATIVE-BAR
 * COUNT are right and NOTHING about the route calling them or the pane rendering them.
 *
 * ⚠️ WHY A SOURCE SCAN AND NOT A RENDER: verbatim the reason the four sibling files give — this repo
 * has no component renderer in any suite (`@testing-library` is not installed) and
 * `SymbolClient.tsx` imports `lightweight-charts`, which wants a DOM. This instrument proves the
 * literal is SPELLED where the contract requires it; the browser half is `T-04.7`'s e2e, which reads
 * a real number out of a real page. Two instruments, two different things, neither substitutable.
 *
 * ── WHAT THIS FILE IS THE CONTRACT WITH, AND WHY IT HAS TO EXIST BEFORE `T-04.6` ─────────────
 *
 * `T-04.6` (`ui-designer` + `ux-ui-mastery`) owns the FORM of this pane and may rewrite every
 * colour, height, word and position in it. `T-04.7` asserts DATA on the same pane. The only thing
 * that keeps a `NEEDS_FIX` about form from silently emptying an assert about data is that the
 * handles are named, pinned here, and outside the form: a `data-testid` and two `data-` attributes,
 * never a pt-BR label a designer is entitled to reword.
 *
 * ── THE MUTATIONS, AND THE UNIVERSE THEY WERE MEASURED IN ────────────────────────────────────
 *
 * `npm --prefix frontend run test:app` with this file OUT of the suite versus IN it, one mutation
 * applied at a time to `SymbolClient.tsx`/`page.tsx` `[MEDIDO 2026-09-16, universo: 262 testes com
 * este arquivo fora, 273 com ele — e 252 antes de `T-04.5`, que é o que prova que estes guardas
 * NÃO existiam]`. Every mutation below is replanted IN THIS FILE, over the real
 * production source, and the `MORDE` tests assert that the asserts above them reject it.
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

/** `page.tsx` with every comment removed — block first, then line. Needed because the asserts below
 * ask whether a shape is in the CODE, and this route's comments quote the shapes they retired.
 * Crude on purpose, same as the four sibling files'. */
const pageCode = pageSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The selectors `T-04.7`'s e2e will `page.locator()` by. Duplicated here ON PURPOSE: a contract
 * with another task is not guarded by importing the constant it is made of — that would rename
 * itself along with the mutation it is supposed to catch. */
const EXPECTED_PANE_TESTID = "long-short-pane";
const EXPECTED_ABSENCE_TOKEN = "SEM_PONTO";

const PANE_TESTID_DECLARATION = /const LONG_SHORT_PANE_TESTID = "([^"]*)";/;
const PANE_TESTID_RENDERED = /data-testid=\{LONG_SHORT_PANE_TESTID\}/;
const ABSENCE_TOKEN_DECLARATION = /const ABSENCE_TOKEN = "([^"]*)";/;

const NATIVE_BARS_ATTRIBUTE = /data-long-short-native-bars=\{longShort\.nativeBars\}/;
const WIRE_POINTS_ATTRIBUTE = /data-long-short-wire-points=\{longShort\.wirePoints\}/;
const ABSENT_BRANCH =
  /longShort\.reading\.kind === "absent" \|\| longShort\.reading\.value === null\s*\n?\s*\? ABSENCE_TOKEN/;
const LOSSLESS_SETDATA = /series\.setData\(lineSeriesLossless\(longShort\.slots\) as never\);/;
const HORIZON_FACT =
  /data-fact=\{`long_short_readable_horizon:\$\{longShort\.nativeBars\}\/\$\{longShort\.wirePoints\}\/\$\{gridSlots\}`\}/;
/** ⚠️ RE-ANCHORED BY `T-04.8`, AND THE LOOSENING IS NAMED RATHER THAN SILENT: it used to end in
 * `\/>`, which pinned the pane to EXACTLY two props. The `design_gate` of `T-04.6` approved a header
 * that states the series' identity (symbol · publisher · grids), so the pane now takes `symbol` as a
 * third prop — a change of FORM, which this file exists to let happen without emptying a DATA
 * assert. What is still guarded is what the contract is about: that the pane is MOUNTED, and that it
 * is fed `longShort` and its OWN status. The `MORDE` case below still bites, because deleting the
 * match leaves no `<LongShortPane longShort={longShort} status={panelStatus.longShort}` behind. */
const PANE_RENDERED = /<LongShortPane longShort=\{longShort\} status=\{panelStatus\.longShort\}/;
const ABSENCE_NOTE_RENDERED = /<LongShortReadableHorizon longShort=\{longShort\} \/>\s*\n\s*<AbsenceNote status=\{status\} \/>/;

/** `page.tsx`: the selector, CALLED through the unique-match helper. */
const PAGE_SELECTOR = /resolveCatalogEntry\(catalog, \(entry\) => matchesCountLongShortRatio\(entry\.key\)\)/;
/** `page.tsx`: the headline count comes from the publication counter, never from a divisor. */
const PAGE_NATIVE_BARS = /nativeBars: countNativeBarsByPublication\(longShortResult\.rows\)/;
const PAGE_WIRE_POINTS = /wirePoints: countPresentSlots\(longShortSlots\)/;
/** `page.tsx`: the pane has a status of its OWN, so it degrades on its own. */
const PAGE_STATUS = /longShort: longShortResult\.status/;
/** `page.tsx`: the ONE `RN-1` mapper, shared. */
const PAGE_MAPPER = /const longShortSlots = nonNegativeFlowSlotsFromHistoryRows\(longShortResult\.rows\);/;

// ── The stable handles `T-04.7` depends on ────────────────────────────────────────────────────

test("T-04.7 contract: the pane carries a stable testid, spelled exactly, and it is RENDERED", () => {
  const declaration = PANE_TESTID_DECLARATION.exec(source);
  assert.ok(declaration !== null, "LONG_SHORT_PANE_TESTID declaration not found — the anchor moved, fix this test");
  assert.equal(
    declaration[1],
    EXPECTED_PANE_TESTID,
    "the e2e locates this pane by the literal string — renaming it empties that spec silently",
  );
  assert.match(source, PANE_TESTID_RENDERED, "declared is not rendered: the constant must reach an attribute");
  assert.match(source, PANE_RENDERED, "the pane must be MOUNTED by SymbolClient — a component nobody renders is not a panel");
});

test("T-04.7 contract: the handle is NOT the pt-BR label — form must not be able to empty a data assert", () => {
  // ⛔ THIS IS THE WHOLE REASON THE TESTID EXISTS. `T-04.6` may rewrite "Long/short de contas" into
  // anything; an e2e pinned to that text would then find nothing and PASS its own way into a false
  // green. The label is asserted to exist (the pane needs an accessible name) and asserted to be
  // something the contract does not depend on.
  assert.match(source, /aria-label="Long\/short"/, "the pane needs an accessible name");
  const reworded = source.replace(/aria-label="Long\/short"/, 'aria-label="Razão de contas"');
  assert.notEqual(reworded, source, "the label moved — re-anchor this test");
  assert.equal(PANE_TESTID_DECLARATION.exec(reworded)?.[1], EXPECTED_PANE_TESTID, "rewording the label must not touch the handle");
  assert.match(reworded, NATIVE_BARS_ATTRIBUTE, "nor the counts");
});

test("T-04.7 contract: BOTH counts are bare integer attributes on the SAME element as the testid", () => {
  assert.match(source, NATIVE_BARS_ATTRIBUTE, "`DoD-3`'s N has to be machine-readable");
  assert.match(source, WIRE_POINTS_ATTRIBUTE, "the staircase count is published beside it, so the ratio is checkable");
  const sameElement =
    /data-testid=\{LONG_SHORT_PANE_TESTID\}[\s\S]{0,600}?data-long-short-native-bars=\{longShort\.nativeBars\}\s*\n\s*data-long-short-wire-points=\{longShort\.wirePoints\}/;
  assert.match(source, sameElement, "testid and both counts must sit on the SAME element, or `getAttribute` finds nothing");
  // ⛔ AND THE HEADLINE NUMBER MUST NOT BE THE STAIRCASE. This is `RN-S1` in the DOM: over the
  // measured 240-minute window the wire count is `175` against `49` native observations
  // `[MEDIDO 2026-09-16]`, so publishing one under the other's name overstates the data by 3,6x —
  // and `DoD-3`'s `N >= 30` would pass with 10 real buckets.
  assert.doesNotMatch(source, /data-long-short-native-bars=\{longShort\.wirePoints\}/);
  assert.doesNotMatch(source, /data-long-short-wire-points=\{longShort\.nativeBars\}/);
});

// ── `RN-1` — the rule this pane exists to not break ───────────────────────────────────────────

test("RN-1: absence prints SEM_PONTO, and for a RATIO a number there would not even look wrong", () => {
  const declaration = ABSENCE_TOKEN_DECLARATION.exec(source);
  assert.ok(declaration !== null, "ABSENCE_TOKEN declaration not found — the anchor moved, fix this test");
  assert.equal(declaration[1], EXPECTED_ABSENCE_TOKEN, "absence is SEM_PONTO, the same token the other four readouts use");
  assert.ok(
    !/^-?\d+(\.\d+)?$/.test(declaration[1]!),
    "the absence token must not be a number in any shape — 0, 0.0 and -0 are all the RN-1 defect",
  );
  assert.match(
    source,
    ABSENT_BRANCH,
    "the absent branch of the long/short readout must resolve to ABSENCE_TOKEN — and here a fabricated " +
      "`0` is the most dangerous on this screen, because 0 IS a readable long/short ratio",
  );
});

test("RN-1: the chart gets the LOSSLESS mapping, so an absent slot draws nothing at all", () => {
  assert.match(
    source,
    LOSSLESS_SETDATA,
    "the line must be fed `lineSeriesLossless`, which turns a `value: null` slot into a bare `{time}` " +
      "WhitespaceItem — any mapping with a `?? 0` in it fabricates a quotient nobody measured",
  );
  assert.doesNotMatch(source, /longShort\.slots\.map\([^)]*\?\? 0/, "a zero-filling map on the long/short slots is the RN-1 defect");
});

test("RN-1 is written ONCE: the pane declares the case is MIXED, not all-absent", () => {
  // ⛔ THE HANDOFF'S OWN ADENDO KILLED THE "SÓ AUSÊNCIA" READING (2026-09-16T20:29Z): the series is
  // live, and over 180 min it answers `129` slots with value against `51` without. A pane that could
  // ONLY render absence would make `DoD-3`'s "não diz SEM_PONTO" unfalsifiable; a pane that could
  // only render values would break `RN-1`. Both readouts of both states are reachable, and the
  // readable horizon is what says WHICH of the grid is which.
  assert.match(source, HORIZON_FACT, "the horizon must publish the three numbers, in the order native-first");
  assert.match(source, /Nenhuma grade legível no período/, "the empty case must be SAID, not left as a blank line");
  assert.match(source, ABSENCE_NOTE_RENDERED, "the pane must render the absence note that names WHY a panel degraded");
});

// ── The route side ────────────────────────────────────────────────────────────────────────────

test("the route resolves the series through the unique-match helper and gives the pane its OWN status", () => {
  assert.match(pageCode, PAGE_SELECTOR, "the pane must select by identity, through the helper that refuses ambiguity");
  assert.doesNotMatch(pageCode, /catalog\.entries\.find\(/, "`Array.prototype.find` over the catalog is the defect");
  assert.match(pageCode, PAGE_STATUS, "a shared status would let a live panel vouch for a dead one");
  assert.match(pageCode, PAGE_MAPPER, "the slots must come from the shared non-negative mapper — `RN-1` is written once");
});

test("RN-S1, route side: the headline number is the PUBLICATION count, never a divisor", () => {
  assert.match(pageCode, PAGE_NATIVE_BARS, "`nativeBars` must come from countNativeBarsByPublication");
  assert.match(pageCode, PAGE_WIRE_POINTS, "and the staircase count from the slots");
  // ⛔ THE TWO CHEAP ANSWERS, REFUSED IN THE CODE AND NOT ONLY IN PROSE. Both are measured wrong for
  // this series in `long-short-series-selector.test.ts`: the divisor by ~28%, the five-minute filter
  // by 4,5x.
  assert.doesNotMatch(pageCode, /nativeBars:[^,]*\/\s*5/, "a `/5` divisor understates this series' runs of 1..5 slots");
  assert.doesNotMatch(
    pageCode,
    /nativeBars:[^,]*scalarPointsFromHistoryRows\(longShortResult\.rows/,
    "the OI pane's five-minute re-grid does not apply: this series' observations do not land on that grid",
  );
});

// ── MORDE: every mutation above, replanted over the real source ───────────────────────────────

/** Every assert of this file that a mutant has to survive to be undetected. */
function survivesClient(mutated: string): boolean {
  return (
    PANE_TESTID_DECLARATION.exec(mutated)?.[1] === EXPECTED_PANE_TESTID &&
    PANE_TESTID_RENDERED.test(mutated) &&
    PANE_RENDERED.test(mutated) &&
    NATIVE_BARS_ATTRIBUTE.test(mutated) &&
    WIRE_POINTS_ATTRIBUTE.test(mutated) &&
    !/data-long-short-native-bars=\{longShort\.wirePoints\}/.test(mutated) &&
    ABSENT_BRANCH.test(mutated) &&
    LOSSLESS_SETDATA.test(mutated) &&
    HORIZON_FACT.test(mutated) &&
    ABSENCE_NOTE_RENDERED.test(mutated)
  );
}

test("MORDE: each of the 7 pane mutations is caught by an assert above", () => {
  const mutants: readonly { readonly name: string; readonly mutate: (s: string) => string }[] = [
    {
      name: "pane testid renamed",
      mutate: (s) => s.replace(PANE_TESTID_DECLARATION, 'const LONG_SHORT_PANE_TESTID = "renamed";'),
    },
    {
      name: "the pane is declared but never mounted",
      mutate: (s) => s.replace(PANE_RENDERED, ""),
    },
    {
      name: "absence rendered as 0 (RN-1)",
      mutate: (s) =>
        s.replace(
          ABSENT_BRANCH,
          'longShort.reading.kind === "absent" || longShort.reading.value === null\n      ? "0"',
        ),
    },
    {
      name: "the native-bar attribute deleted",
      mutate: (s) => s.replace(/\s*data-long-short-native-bars=\{longShort\.nativeBars\}/, ""),
    },
    {
      name: "the STAIRCASE published as the headline number (RN-S1)",
      mutate: (s) => s.replace(NATIVE_BARS_ATTRIBUTE, "data-long-short-native-bars={longShort.wirePoints}"),
    },
    {
      name: "a zero-filling mapping feeds the line",
      mutate: (s) =>
        s.replace(
          LOSSLESS_SETDATA,
          "series.setData(longShort.slots.map((slot) => ({ time: slot.time, value: slot.value ?? 0 })) as never);",
        ),
    },
    {
      name: "the readable horizon stops publishing the native count",
      mutate: (s) => s.replace(HORIZON_FACT, "data-fact={`long_short_readable_horizon:${longShort.wirePoints}/${gridSlots}`}"),
    },
  ];
  for (const mutant of mutants) {
    const mutated = mutant.mutate(source);
    assert.notEqual(mutated, source, `the mutation "${mutant.name}" found no anchor — update this test, do not delete it`);
    assert.ok(!survivesClient(mutated), `the mutation "${mutant.name}" is NOT detected by the asserts above — the guard is vacuous`);
  }
});

test("MORDE, route side: the 4 route mutations are caught", () => {
  const mutants: readonly { readonly name: string; readonly mutate: (s: string) => string }[] = [
    {
      name: "the selector loses `provider` and becomes ambiguous the day the mirror is cataloged",
      mutate: (s) =>
        s.replace(PAGE_SELECTOR, 'resolveCatalogEntry(catalog, (entry) => entry.key.metric === "count_long_short_ratio")'),
    },
    {
      name: "the pane shares the OI status",
      mutate: (s) => s.replace(PAGE_STATUS, "longShort: oiResult.status"),
    },
    {
      name: "the headline count computed with the `/5` divisor",
      mutate: (s) => s.replace(PAGE_NATIVE_BARS, "nativeBars: countPresentSlots(longShortSlots) / 5"),
    },
    {
      name: "a second copy of the RN-1 mapper for this pane",
      mutate: (s) =>
        s.replace(PAGE_MAPPER, "const longShortSlots = longShortResult.rows.map((row) => ({ time: row.event_time, value: Number(row.value ?? 0) }));"),
    },
  ];
  for (const mutant of mutants) {
    const mutated = mutant.mutate(pageCode);
    assert.notEqual(mutated, pageCode, `the mutation "${mutant.name}" found no anchor — update this test, do not delete it`);
    const survives =
      PAGE_SELECTOR.test(mutated) &&
      PAGE_STATUS.test(mutated) &&
      PAGE_NATIVE_BARS.test(mutated) &&
      PAGE_WIRE_POINTS.test(mutated) &&
      PAGE_MAPPER.test(mutated) &&
      !/nativeBars:[^,]*\/\s*5/.test(mutated);
    assert.ok(!survives, `the mutation "${mutant.name}" is NOT detected by the asserts above — the guard is vacuous`);
  }
});

// ── CALA: form is `T-04.6`'s to change, and changing it must not touch any assert above ───────

test("CALA: a design_gate NEEDS_FIX about colour, wording or order leaves the contract intact", () => {
  // Exactly the kind of edit `T-04.6` (`ui-designer` + `ux-ui-mastery`) is entitled to make WITHOUT
  // coordinating with `T-04.7`. If any of these trips an assert, the contract is guarding form
  // instead of the requirement, and it is the contract that is wrong.
  const restyled = source
    .replace(/Long\/short de contas \(5m/, "Razão long\\/short de contas (5 min")
    .replace(/Leitura atual: \{readingText\}/, "Último valor conhecido: {readingText}")
    .replace(/observações nativas de 5 min/, "leituras de 5 min")
    .replace(
      'const style: Partial<LineSeriesOptions> = { color: colorTokens().provenanceStrong };\n    const series: ISeriesApi<"Line"> = chart.addSeries(LineSeries, style);\n    // `lineSeriesLossless`',
      'const style: Partial<LineSeriesOptions> = { color: colorTokens().provenanceWeak };\n    const series: ISeriesApi<"Line"> = chart.addSeries(LineSeries, style);\n    // `lineSeriesLossless`',
    );
  assert.notEqual(restyled, source, "the form anchors moved — re-anchor this CALA rather than dropping it");
  assert.ok(survivesClient(restyled), "a pure restyling must leave every contract assert of this file green");
});
