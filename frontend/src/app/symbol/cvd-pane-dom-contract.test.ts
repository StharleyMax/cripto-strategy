/**
 * `T-02.5` — the DOM CONTRACT of the CVD pane, guarded. Sibling of
 * `volume-subaxis-dom-contract.test.ts`, and it exists for the same measured reason that one
 * gives: `view-model.test.ts` proves `RN-1` on the DATA side, and NOTHING about the RENDERING
 * side, which is where this task's deliverable lives.
 *
 * MEASURED, NOT ASSUMED — this file removed from the suite, one mutation applied at a time,
 * `npm --prefix frontend run test:app` after each `[MEDIDO 2026-09-12, universo: 160 testes]`:
 *
 *   baseline (this file removed, nothing mutated)         -> 160 pass / 0 fail
 *   - renaming `CVD_PANE_TESTID`                          -> 160 pass / 0 fail
 *   - `ABSENCE_TOKEN` reaching the CVD readout as `"0"`    -> 160 pass / 0 fail
 *   - deleting `data-cvd-present-points`                   -> 160 pass / 0 fail
 *   - dropping `cvdAnchorMs` from `page.tsx`               -> 160 pass / 0 fail
 *   this file restored, nothing mutated                   -> 168 pass / 0 fail
 *
 * Four mutations, zero detections: every one of them passed COMPLETELY UNNOTICED —
 *
 * The second is the `RN-1` defect itself, one token away: a `FLOW` absence painted as `0` on
 * screen. The third silently empties `10-cvd-dado-real.spec.ts`'s only handle on `N >= 30` —
 * and `Number(null) === 0` means the e2e would keep PASSING against a DOM with no contract in
 * it (the `BLOCKER-3` of wave `03`, repeated here from the other side). The fourth makes the
 * screen's printed anchor a coincidence of a default two modules away instead of a choice the
 * route made — `delta` is anchor-free, but `cumulativo` is a VIEW whose sign depends on it
 * (`D4.7`).
 *
 * WHY A SOURCE SCAN AND NOT A RENDER: verbatim the reason the volume file gives — this repo has
 * no component renderer in any suite (`@testing-library` is not installed), and `SymbolClient.tsx`
 * imports `lightweight-charts`, which wants a DOM. This instrument proves the literal is SPELLED
 * where the contract requires it, not that a browser painted it; the browser half is `T-02.6`'s
 * e2e, by design, and it is the one that reads a real number out of a real page.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SYMBOL_CLIENT_PATH = path.join(HERE, "SymbolClient.tsx");
const PAGE_PATH = path.join(HERE, "page.tsx");
const source = readFileSync(SYMBOL_CLIENT_PATH, "utf8");
const pageSource = readFileSync(PAGE_PATH, "utf8");

/** `pageSource` with every comment removed — block first, then line.
 *
 * Needed because the assertions below ask whether a RETIRED SELECTOR is gone from the CODE, and
 * `page.tsx`'s own header now EXPLAINS the retirement by naming the old metric in prose. Scanning
 * the raw text would make a correct, well-documented file fail while an undocumented one passed,
 * which inverts the incentive this repository runs on. Crude on purpose: a `"//"` inside a string
 * literal would be mis-stripped, and `page.tsx` has none (the URLs it handles come from
 * `process.env`) — a real tokenizer would be a dependency this assertion does not justify. */
const pageCode = pageSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The selector `10-cvd-dado-real.spec.ts` will `page.locator()` by. Duplicated here ON PURPOSE:
 * a contract with another task is not guarded by importing the constant it is made of — that
 * would rename itself along with the mutation it is supposed to catch. */
const EXPECTED_TESTID = "cvd-pane";
/** `RN-1`'s literal token. `DoD-3` asserts its ABSENCE from this pane once data is present, so
 * the string is as load-bearing as the testid. */
const EXPECTED_ABSENCE_TOKEN = "SEM_PONTO";

const TESTID_DECLARATION = /const CVD_PANE_TESTID = "([^"]*)";/;
const ABSENCE_TOKEN_DECLARATION = /const ABSENCE_TOKEN = "([^"]*)";/;
const CVD_ABSENT_BRANCH =
  /deltaReading\.kind === "absent" \|\| deltaReading\.value === null \? ABSENCE_TOKEN :/;
/** `data-cvd-present-points`, as the e2e spells it — written out here rather than built from a
 * constant, same duplication-on-purpose rule as the testid above. */
const PRESENT_POINTS_ATTRIBUTE = /data-cvd-present-points=\{cvd\.presentPoints\}/;
const PAGE_ANCHOR_CHOICE = /cvdAnchorMs: routeWindow\.window\.startMs,/;
/** `DR-2`: the cumulative curve on a price scale of its OWN. The delta keeps the default right
 * scale; sharing it flattens one of the two into nothing, because `max|cum| >= max|delta|` holds
 * BY CONSTRUCTION (the cumulative is the running sum of the very deltas beside it, anchored
 * before the first plotted point). Spelled out rather than imported, same duplication-on-purpose
 * rule as the testid. */
const CUMULATIVE_OWN_SCALE = /priceScaleId: CVD_CUMULATIVE_PRICE_SCALE_ID,/;
const CUMULATIVE_SCALE_DECLARATION = /const CVD_CUMULATIVE_PRICE_SCALE_ID = "([^"]*)";/;
/** `DR-3`: the absent branch of the CUMULATIVE readout, which did not exist before — the pane
 * drew two series and read exactly one. */
const CVD_CUMULATIVE_ABSENT_BRANCH =
  /cumulativeReading\.kind === "absent" \|\| cumulativeReading\.value === null\s*\n?\s*\? ABSENCE_TOKEN/;
const CVD_CUMULATIVE_READOUT_FACT = /data-fact=\{`cvd_cumulative_last_reading:\$\{cumulativeReading\.kind\}`\}/;

test("T-02.6 contract: the CVD pane carries the STABLE testid, spelled exactly", () => {
  const declaration = TESTID_DECLARATION.exec(source);
  assert.ok(declaration !== null, "CVD_PANE_TESTID declaration not found — the anchor moved, fix this test");
  assert.equal(
    declaration[1],
    EXPECTED_TESTID,
    "the testid T-02.6 selects by changed; renaming it silently breaks the e2e's only handle",
  );
  // Declared is not rendered: the constant must actually reach a `data-testid` attribute.
  assert.match(source, /data-testid=\{CVD_PANE_TESTID\}/);
});

test("T-02.6 contract: the present-point count is a bare integer attribute on that same element", () => {
  assert.match(
    source,
    PRESENT_POINTS_ATTRIBUTE,
    "the attribute DoD-3 reads N >= 30 from must be rendered, and must carry the raw count",
  );
  // SAME element as the testid, not a sibling — otherwise the e2e's `getAttribute` finds
  // nothing, and `Number(null) === 0` turns that into a silent green.
  assert.match(
    source,
    /data-testid=\{CVD_PANE_TESTID\}\s*\n\s*data-cvd-present-points=\{cvd\.presentPoints\}/,
    "testid and present-point count must sit on the SAME element",
  );
});

test("RN-1 at the RENDERING layer: CVD absence prints SEM_PONTO, and the token is never a number", () => {
  const declaration = ABSENCE_TOKEN_DECLARATION.exec(source);
  assert.ok(declaration !== null, "ABSENCE_TOKEN declaration not found — the anchor moved, fix this test");
  assert.equal(
    declaration[1],
    EXPECTED_ABSENCE_TOKEN,
    "absence is SEM_PONTO — for a FLOW series a number here is an error of TYPE, not of taste",
  );
  assert.ok(
    !/^-?\d+(\.\d+)?$/.test(declaration[1]!),
    "the absence token must not be a number in any shape — 0, 0.0 and -0 are all the RN-1 defect",
  );
  // The token has to be what the CVD readout actually falls back to, not a dead constant one
  // pane away. Before `T-02.5` this branch resolved to `formatFlowValue(deltaReading)` (`"—"`),
  // which made `DoD-3`'s "não diz SEM_PONTO" unfalsifiable: a pane that can never say the token
  // passes the assertion whether or not any data arrived.
  assert.match(source, CVD_ABSENT_BRANCH, "the absent branch of the CVD readout must resolve to ABSENCE_TOKEN");
});

// ── The readable horizon, declared for CVD too — and the vão is NOT shrunk ────────────────────
//
// CVD is written by the SAME collector pass as `klines_volume`, off the same `/fapi/v1/klines`
// array, with the same `available_at` (`collector_series_mapping.py`: "two readings OF THE SAME
// OBSERVATION ... they differ only in `series_key_id` and `value_raw`") ⇒ it inherits the
// backfill horizon exactly: `769/5.761` grades readable, first at index `4.971`
// `[MEDIDO 2026-09-11, ACHADO-BACKFILL-INVISIVEL-AO-AS-OF.md]`. So the pane declares the two
// numbers rather than letting a structurally empty left edge read as a dead market.

test("C4 for CVD: the pane declares how many grades are readable, of how many, and since when", () => {
  assert.match(
    source,
    /data-fact=\{`cvd_readable_horizon:\$\{cvd\.presentPoints\}\/\$\{gridSlots\}`\}/,
    "the horizon fact must carry BOTH numbers — a bare count cannot say 769 OF WHAT",
  );
  assert.match(
    source,
    /data-readable-since-ms=\{cvd\.firstPresentMs \?\? ""\}/,
    "the first readable instant must reach the DOM as a machine-readable attribute",
  );
  // `null` is absence of a horizon and must READ as absence, never as the epoch (`0`).
  assert.match(
    source,
    /cvd\.firstPresentMs === null\s*\n?\s*\? "Nenhuma grade legível no período"/,
    "no readable grade must print a sentence, not a date derived from 0",
  );
  // ⛔ AND THE SPAN IS NOT SHRUNK TO FIT: the denominator is the slot array the pane was handed,
  // WHOLE. A chart that narrows itself around its data hides its own hole.
  assert.match(source, /const gridSlots = panels\.cvd\.deltaSlots\.length;/);
  assert.ok(
    !source.includes("S2_WINDOW_SPAN_MS"),
    "the rendering layer must not reach for the span — re-cutting it around the data hides the gap",
  );
});

test("D4.7: the cumulative anchor is CHOSEN by the route and PRINTED by the pane", () => {
  // Printed — an anchor nobody can see is an anchor inherited in silence.
  assert.match(source, /data-fact=\{`cvd_cumulative_anchor:\$\{cvd\.anchorMs\}`\}/);
  assert.match(source, /Acumulado ancorado em \{formatUtcMinute\(cvd\.anchorMs\)\}/);
  // Chosen — `page.tsx` passes it EXPLICITLY. Leaving it out would land on `buildCvdPanel`'s own
  // default, which happens to be the same instant TODAY; the screen's claim would then be true by
  // coincidence of a default in `charts`, and would go silently false the day that default moves.
  assert.match(
    pageCode,
    PAGE_ANCHOR_CHOICE,
    "page.tsx must pass cvdAnchorMs explicitly — the pane prints window.startMs as THE anchor",
  );
  // ...and the instant the pane prints must be the same one the route passed.
  assert.match(pageCode, /anchorMs: routeWindow\.window\.startMs,/);
});

// ── The selector, which is the defect class this whole fase exists to close ───────────────────

test("the CVD panel selects the kline_takerbuy row by TERM, never by metric alone or by position", () => {
  assert.match(
    pageCode,
    /matchesKlineTakerBuyCvd\(entry\.key\)/,
    "page.tsx must use the three-term predicate; `metric === 'cvd_source'` alone picks aggtrade_q",
  );
  // The retired selector must be GONE FROM THE CODE, not merely unused: `cvd_delta` is a metric no
  // builder in `backend/src/modules/sentimento/domain/` produces, so a panel asking for it is
  // absent by construction — which is what `/symbol` shipped with before this task. Measured over
  // `pageCode`, so the header's prose EXPLANATION of the retirement is not mistaken for the
  // selector it retired.
  assert.ok(!pageCode.includes("cvd_delta"), "the cvd_delta selector must be gone from the code, not left behind");
  // And nothing indexes the catalog by position (`entries[11]`, `.at(11)`): the row sits at index
  // 11 of each instrument's block TODAY, and a row appended upstream would re-point this panel at
  // another metric with no test failing.
  assert.ok(
    !/entries\s*(\[\s*\d+\s*\]|\.at\(\s*\d+\s*\))/.test(pageCode),
    "the catalog must be filtered by term, never indexed by position",
  );
});

// ── DR-2 / DR-3: what the design_gate REJECTED, guarded so it cannot come back ────────────────
//
// `gates/design-review-painel-cvd.md` blocked this pane on three findings. `DR-1` (the white
// canvas) is guarded by `chart-construction.test.ts` + `color-contrast.test.ts` +
// `e2e/11-canvas-fundo.spec.ts`. The two below are guarded here, because they are properties of
// what this file already scans.
//
// ⛔ AND THESE ARE NOT FORM. The `CALA` test at the bottom of this file says colour and wording
// are the `ui-designer`'s to change without touching a single assert — that stays true. A shared
// price scale is not a colour choice: it is `max|delta| / max|cum|` of the panel's height for one
// of the two series, arithmetic, and the file itself already argued so for the volume sub-axis
// 200 lines above the place where it then did the opposite. Likewise, "which line is which"
// carried ONLY by hue is WCAG 1.4.1, a failure with a number attached, not a taste.

test("DR-2: the cumulative curve gets a price scale of its OWN — a shared scale flattens one series", () => {
  const declaration = CUMULATIVE_SCALE_DECLARATION.exec(source);
  assert.ok(declaration !== null, "CVD_CUMULATIVE_PRICE_SCALE_ID declaration not found — the anchor moved");
  assert.notEqual(
    declaration[1],
    "",
    'an empty priceScaleId is the DEFAULT right scale spelled differently — that is the defect, not the fix',
  );
  assert.match(source, CUMULATIVE_OWN_SCALE, "the cumulative series must declare its own priceScaleId");
  // ...and it must actually get margins, like the volume sub-axis does — an overlay scale with
  // the default margins sits on top of the delta instead of beside it.
  assert.match(source, /cumulativeSeries\.priceScale\(\)\.applyOptions\(\{ scaleMargins: CVD_CUMULATIVE_SCALE_MARGINS \}\)/);
  assert.match(source, /deltaSeries\.priceScale\(\)\.applyOptions\(\{ scaleMargins: CVD_DELTA_SCALE_MARGINS \}\)/);
});

test("DR-3/WCAG 1.4.1: the two lines are distinguished by MORE than colour, and both are named", () => {
  // Channel 1 — inside the canvas, where no legend reaches: dash vs solid.
  assert.match(source, /lineStyle: LineStyle\.Solid,/, "the delta line must declare its style explicitly");
  assert.match(source, /lineStyle: LineStyle\.Dashed,/, "the cumulative line must not differ from the delta by hue alone");
  // Channel 2 — the words. A legend that only shows swatches is colour-only with extra steps.
  assert.match(source, /Delta \(linha cheia\)/);
  assert.match(source, /Acumulado \(linha tracejada\)/);
  assert.match(source, /<CvdLegend \/>/, "the legend must be RENDERED, not merely declared");
});

test("DR-3: the cumulative curve has a NUMBER in the DOM, with the same absence token as the delta", () => {
  // The screen went to the trouble of naming the anchor of this curve (`D4.7`) and then never
  // said what value the anchor produced. One token, now five readouts — the reasoning of
  // `ABSENCE_TOKEN`'s own comment ("um token, quatro readouts") applied to the fifth.
  assert.match(source, CVD_CUMULATIVE_READOUT_FACT, "the cumulative reading needs a machine-readable data-fact");
  assert.match(source, /Acumulado atual: \{cumulativeReadingText\}/);
  assert.match(
    source,
    CVD_CUMULATIVE_ABSENT_BRANCH,
    "absence of a cumulative value must resolve to ABSENCE_TOKEN — a running sum with a missing bucket is a " +
      "missing sum, and a `0` there would be the RN-1 defect one series over",
  );
  // ...and it is resolved with the FLOW policy, never the STOCK one: carrying the previous total
  // forward would be LOCF over a series whose absences are real gaps in observation.
  assert.match(source, /const cumulativeReading = resolveFlowReading\(/);
});

test("DR-6: the canvas host is hidden from the accessibility tree, with the readouts as its alternative", () => {
  // `lightweight-charts` paints into a `<canvas>` with no accessible name; a screen reader used
  // to find a nameless empty node. This does not make the SERIES accessible (that is DR-10, a
  // keyboard-navigable table, strategic) — it stops the tree from carrying a node that says
  // nothing, next to readouts that say the last instant.
  assert.match(source, /ref=\{containerRef\}\s*\n\s*aria-hidden="true"/);
});

// ── MORDE: the four mutations that were GREEN before this file existed ────────────────────────

test("MORDE: each of the 4 CVD DOM-contract mutations that used to pass green is now caught", () => {
  const mutants: readonly {
    readonly name: string;
    readonly file: "client" | "page";
    readonly mutate: (s: string) => string;
  }[] = [
    { name: "testid renamed", file: "client", mutate: (s) => s.replace(TESTID_DECLARATION, 'const CVD_PANE_TESTID = "renamed";') },
    { name: "CVD absence rendered as 0", file: "client", mutate: (s) => s.replace(CVD_ABSENT_BRANCH, 'deltaReading.kind === "absent" || deltaReading.value === null ? "0" :') },
    { name: "present-point attribute deleted", file: "client", mutate: (s) => s.replace(/\s*data-cvd-present-points=\{cvd\.presentPoints\}/, "") },
    { name: "anchor left to the charts default", file: "page", mutate: (s) => s.replace(PAGE_ANCHOR_CHOICE, "") },
  ];
  for (const mutant of mutants) {
    const original = mutant.file === "client" ? source : pageCode;
    const mutated = mutant.mutate(original);
    assert.notEqual(mutated, original, `the mutation "${mutant.name}" found no anchor — update this test, do not delete it`);
    const survives =
      mutant.file === "client"
        ? TESTID_DECLARATION.exec(mutated)?.[1] === EXPECTED_TESTID &&
          CVD_ABSENT_BRANCH.test(mutated) &&
          PRESENT_POINTS_ATTRIBUTE.test(mutated)
        : PAGE_ANCHOR_CHOICE.test(mutated);
    assert.ok(!survives, `the mutation "${mutant.name}" is NOT detected by the asserts above — the guard is vacuous`);
  }
});

// ── CALA: form is the `ui-designer`'s to change, and changing it must not touch any assert ────

test("CALA: a design_gate NEEDS_FIX about colour or wording leaves the CVD contract intact", () => {
  // ⚠️ RE-ANCHORED after the `design_gate` of 2026-09-12: the delta series no longer reads
  // `{ color: tokens.provenanceStrong }` on one line — `DR-2`/`DR-3` gave it a `lineStyle` and a
  // `scaleMargins` call. The CALA is re-pointed rather than dropped, exactly as its own message
  // demands ("re-anchor this CALA rather than dropping it"); what it proves is unchanged, and it
  // now also proves that moving the LEGEND's wording touches no contract either.
  const restyled = source
    .replace(/color: tokens\.provenanceStrong,/, "color: tokens.provenanceWeak,")
    .replace(/CVD \(delta e acumulado\)/, "CVD — fluxo agressor (delta e acumulado)")
    .replace(/Delta atual: \{readingText\}/, "Delta do último minuto: {readingText}")
    .replace(/Acumulado \(linha tracejada\)/, "Soma corrida (tracejada)");
  assert.notEqual(restyled, source, "the form constants moved — re-anchor this CALA rather than dropping it");
  assert.equal(TESTID_DECLARATION.exec(restyled)?.[1], EXPECTED_TESTID);
  assert.equal(ABSENCE_TOKEN_DECLARATION.exec(restyled)?.[1], EXPECTED_ABSENCE_TOKEN);
  assert.match(restyled, PRESENT_POINTS_ATTRIBUTE);
  assert.match(restyled, CVD_ABSENT_BRANCH);
  assert.match(restyled, /data-testid=\{CVD_PANE_TESTID\}/);
  // The two contracts `DR-2`/`DR-3` added survive a restyle too — otherwise the next design pass
  // would have to choose between good wording and a guarded pane.
  assert.match(restyled, CUMULATIVE_OWN_SCALE);
  assert.match(restyled, CVD_CUMULATIVE_READOUT_FACT);
});
