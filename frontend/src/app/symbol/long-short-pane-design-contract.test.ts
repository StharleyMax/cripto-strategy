/**
 * `T-04.8` — THE `design_gate` VERDICT, TURNED INTO A FALSIFIER.
 *
 * Subject: `docs/context/cinco-metricas-do-core/gates/design-04.md` §R2 — `ui-designer` +
 * `ux-ui-mastery`, veredito **`APPROVED`** over Rev. 3, with `0` must-fix and `4` should-fix
 * (`A-1`…`A-4`). This file is what keeps that verdict from being a paragraph: every item it asserts
 * is one the gate MEASURED, and every assert carries the mutation that shows it bites.
 *
 * ── WHY A SOURCE SCAN, AND WHAT IT DOES NOT CLAIM ────────────────────────────────────────────
 *
 * Verbatim the reason the five sibling `*-dom-contract.test.ts` files give: this repository has no
 * component renderer in any suite (`@testing-library` is not installed) and `SymbolClient.tsx`
 * imports `lightweight-charts`, which wants a DOM. So this instrument proves a LITERAL IS SPELLED
 * where the gate requires it. It does NOT prove a rendered pixel, a contrast ratio measured on a
 * real surface, or a screen-reader announcement — those are `e2e/14`, `color-contrast.test.ts` and
 * a test that does not exist in this environment (`[NÃO MEDIDO]`, and the gate says so too).
 *
 * ⛔ AND IT IS NOT A DESIGN DECISION. Form belongs to the `ui-designer` WITH the `ux-ui-mastery`
 * verdict (`CLAUDE.md` §"Design — autonomia delegada, com gate de validação"). What is pinned here
 * is only what that verdict REQUIRED — never a colour, a word or a position a future rodada is free
 * to change.
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
const globalsCss = readFileSync(path.join(HERE, "..", "globals.css"), "utf8");

/** The long/short pane's own slice of the file — from the first of its components to the live
 * readout hook that follows it. Several asserts below are about what must NOT appear, and over the
 * whole file they would be answering for four other panes. */
function longShortSlice(text: string): string {
  const start = text.indexOf("function LongShortReadableHorizon");
  const end = text.indexOf("function useLiveReadout");
  assert.ok(start !== -1 && end > start, "the long/short block moved — re-anchor this file, do not delete it");
  return text.slice(start, end);
}

/** TSX with its comments removed — block first, then line. Every assert below asks whether a shape
 * is in the CODE, and this file's own subject is a report whose findings are QUOTED in the
 * component's docstrings: without this step the scan for a bare `<svg>` would find the one inside
 * the sentence that explains why bare `<svg>`s were fixed, and the scan for the word this pane
 * refuses to use would find the paragraph that refuses it. Crude on purpose, same as the five
 * sibling contract files'. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const PANE = withoutComments(longShortSlice(source));

/** CSS with comments stripped — the same discipline `color-contrast.test.ts` states: a paragraph
 * explaining a rule is not the rule, and counting it would make a gate fire on its own explanation. */
function cssWithoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

// ── `A-1` (WCAG 1.1.1, level A) — the integrity glyph is decorative and says so ───────────────

const GLYPH_SVG = /<svg aria-hidden="true" focusable="false"/;

test("A-1: every <svg> of this pane carries aria-hidden AND focusable=false", () => {
  const svgs = [...PANE.matchAll(/<svg\b[^>]*>/g)].map((match) => match[0]);
  assert.ok(svgs.length >= 1, "the pane draws no SVG at all — the integrity glyph is gone, not fixed");
  for (const svg of svgs) {
    assert.match(svg, /aria-hidden="true"/, "an unnamed graphic with no aria-hidden is announced as a bare 'graphic'");
    assert.match(
      svg,
      /focusable="false"/,
      "legacy engines put a focusable SVG in the tab order — a stop on the way to nothing",
    );
  }
  assert.match(PANE, GLYPH_SVG);
});

test("A-1 MORDE: the study's own <svg>, replanted verbatim, is REJECTED by the assert above", () => {
  // The exact opening tag of `gates/design-04-rev3.html` (three of them, none with either attribute).
  const mutated = PANE.replace(GLYPH_SVG, '<svg height="12" viewBox="0 0 12 12" width="12"');
  assert.notEqual(mutated, PANE, "the glyph moved — re-anchor this mutation, do not delete it");
  const svgs = [...mutated.matchAll(/<svg\b[^>]*>/g)].map((match) => match[0]);
  assert.ok(
    svgs.some((svg) => !/aria-hidden="true"/.test(svg)),
    "the replanted defect is invisible to the scan above — the guard would be vacuous",
  );
});

test("A-1: the lozenge is HOLLOW — a filled one would read as a data mark", () => {
  // `STITCH_CONTEXT.md` §9 item 4: the integrity mark never fills an area. `M-3` of the gate
  // measured `fill="none"` on the approved screen and named it as the reason the mark is legible as
  // a mark.
  assert.match(PANE, /<polygon points="6,1 11,6 6,11 1,6" fill="none"/);
});

// ── `A-2` (WCAG 2.4.7) — the focus rule of the project EXISTS ─────────────────────────────────

test("A-2: globals.css declares a :focus-visible ring with a POSITIVE outline-offset", () => {
  const css = cssWithoutComments(globalsCss);
  const rule = /:focus-visible\s*\{[^}]*\}/.exec(css);
  assert.ok(rule !== null, "no :focus-visible rule at all — `STITCH_CONTEXT.md` §9 item 7 is unimplemented");
  assert.match(rule[0], /outline:\s*2px solid var\(--color-focus-ring\)/, "the ring uses the governed focus token");
  const offset = /outline-offset:\s*(-?[\d.]+)px/.exec(rule[0]);
  assert.ok(offset !== null, "no outline-offset — the ring lands on the 1px surface border and reads as a border");
  assert.ok(Number(offset[1]) > 0, `outline-offset must be > 0; it is ${offset[1]}px`);
});

test("A-2 MORDE: an outline:none anywhere, or a zero offset, is caught", () => {
  const css = cssWithoutComments(globalsCss);
  // The two ways this rule dies in practice: someone removes the ring, or someone keeps it and
  // sets the offset to `0`, which is the state the report measured as insufficient.
  assert.doesNotMatch(css, /outline:\s*none/, "an `outline: none` with no replacement ring re-opens `2.4.7`");
  const zeroed = css.replace(/outline-offset:\s*2px/, "outline-offset: 0px");
  assert.notEqual(zeroed, css, "the offset moved — re-anchor this mutation");
  const mutatedOffset = /outline-offset:\s*(-?[\d.]+)px/.exec(/:focus-visible\s*\{[^}]*\}/.exec(zeroed)![0])!;
  assert.ok(Number(mutatedOffset[1]) === 0, "the mutation is what it claims to be");
});

// ── `A-3` (WCAG 1.4.4 / 1.4.10) — the fixed canvas does NOT migrate ───────────────────────────

test("A-3: the pane carries no fixed width and no overflow:hidden — it wraps instead of clipping", () => {
  assert.doesNotMatch(PANE, /overflow-hidden/, "`overflow: hidden` on a fluid card is how content disappears at 200%");
  assert.doesNotMatch(PANE, /\bw-\[\d+px\]/, "a pinned pixel width is the study's `width: 1280px`, migrated");
  // And the positive half: every row of the header/footer is declared wrappable, which is what
  // makes the layout survive the reflow `1.4.10` asks for.
  const rows = [...PANE.matchAll(/className="flex flex-wrap/g)];
  assert.ok(rows.length >= 3, `only ${rows.length} wrappable rows — the header/footer rows must wrap, not clip`);
});

// ── `A-4` — the operator can COPY a numeral ───────────────────────────────────────────────────

test("A-4: no user-select:none reaches this app, in CSS or in a utility class", () => {
  // The gate's own words: on a screen built to stop an unsourced number from reaching a decision,
  // stopping the operator from copying the number to check it works AGAINST the thesis.
  assert.doesNotMatch(cssWithoutComments(globalsCss), /user-select:\s*none/);
  assert.doesNotMatch(source, /select-none/, "Tailwind's `select-none` is the same declaration by another name");
  // And the positive declaration, so a future paste of the study cannot flip it in silence.
  assert.match(cssWithoutComments(globalsCss), /user-select:\s*text/);
});

// ── `M-4` / `SC 1.4.1` — the two channel rules the gate re-measured as intact ─────────────────

test("M-4: no alpha channel anywhere in this pane — contrast is measured on what is painted", () => {
  // The gate's measurement, and why alpha is refused rather than tuned: the composite the rodada 1
  // form used (`#8b949e @50%` = `#4f5660`) read `2.41` against the plot's `#131722`, below the
  // `3.0` floor of `1.4.11`, while the token it was derived from reads `5.82`. A ratio computed on
  // a token and rendered through alpha is a ratio nobody has.
  assert.doesNotMatch(PANE, /\bopacity/, "opacity on a governed token invalidates every contrast number measured on it");
  assert.doesNotMatch(PANE, /rgba\(/);
  assert.doesNotMatch(PANE, /backdrop/);
  // Tailwind's colour/alpha shorthand is the same thing in one character.
  assert.doesNotMatch(PANE, /(bg|text|border)-[a-z-]+\/\d/, "`bg-x/50` is alpha with a different spelling");
});

test("SC 1.4.1: a COHORT is not a DIRECTION — zero green, zero red on this pane", () => {
  // `long`/`short` here are cohorts of accounts, not the direction of a candle. Painting them in the
  // direction fills would invite reading the cohort as the market's direction, and `ADR-010/D-1`
  // reserves those two hexes for `fill` of price direction only.
  assert.doesNotMatch(PANE, /#089981|#f23645/i);
  assert.doesNotMatch(PANE, /direction(Up|Down)Fill/, "the tokens are as forbidden here as the literals they hold");
});

test("the ink comes from TOKENS, never from a literal hex", () => {
  const hexes = [...PANE.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((match) => match[0]);
  assert.deepEqual(
    hexes,
    [],
    `the pane spells ${hexes.length} literal hex value(s) (${hexes.join(", ")}). The study is full of them by ` +
      "construction; a component is not, or `ADR-010`'s palette stops being the thing that decides colour.",
  );
});

// ── `M-1` — every numeral on the pane traces to a measurement ─────────────────────────────────

test("M-1: the scale footer's numerals are DERIVED, never spelled", () => {
  // The six fabricated numerals of Rev. 2 are the reason this assert exists. The form is: the
  // footer reads its numbers off `windowStats`/`recentStats`, which `view-model.ts::seriesValueStats`
  // computes over the very slots the chart is drawn from.
  assert.match(PANE, /windowStats\.min\}\s*a\s*\$\{windowStats\.max\}/);
  assert.match(PANE, /formatDerivedDecimal\(windowStats\.amplitude, \[windowStats\.min, windowStats\.max\]\)/);
  assert.match(PANE, /formatPercentPtBr\(windowStats\.amplitude \/ windowStats\.median\)/);
  // ⛔ AND THE GATE'S OWN NUMBERS MUST NOT BE IN THE COMPONENT. They are true of the four days the
  // study was generated over and of nothing else; transcribing one would be the `M-1` defect in its
  // purest form — a numeral on screen that no render measured.
  for (const fabricated of ["1.8369", "1.1395", "0.6974", "1.6575", "1.5164", "1.8098", "0.3148", "1.8114", "0.3164"]) {
    assert.ok(!PANE.includes(fabricated), `the study's measured value \`${fabricated}\` is hardcoded in the component`);
  }
  // A hardcoded observation COUNT, with the one exception that is not one: the empty state prints
  // the literal `0`, and there `0` is the definition of the state rather than a measurement of it
  // (the component renders it only under `windowStats === null`). Any other digit in that sentence
  // would be a count nobody counted.
  assert.ok(
    !/\b[1-9]\d* observações nativas/.test(PANE.replace(/\{[^}]*\}/g, "")),
    "a hardcoded observation count — the number must come from `longShort.nativeBars`",
  );
});

test("M-2: absence is never carried forward, and the size of the tail is published", () => {
  // The blocking finding of rodada 1 was a dashed stretch drawn to the right edge over a series the
  // server refuses to carry forward. Rev. 3 draws nothing there — and the pane owes the operator the
  // size of that emptiness, because a blank right edge cannot be dated by looking at it.
  assert.match(PANE, /data-fact=\{`long_short_tail_absent:\$\{absent\}`\}/);
  assert.match(PANE, /cauda ausente/);
  assert.doesNotMatch(PANE, /LineStyle\.Dashed/, "a dashed continuation on a RATIO pane is the carry-forward defect");
  assert.doesNotMatch(PANE, /lastValueVisible:\s*true/);
});

test("M-3: procedência and the age stamp exist ONLY where there is an observation", () => {
  // "OBSERVADO" over zero observations is a predicate with no subject — one of the three false
  // claims that reproved rodada 1. The branch is structural: both components are rendered under
  // `hasObservation`, and the empty half renders the integrity badge instead.
  assert.match(PANE, /const hasObservation = longShort\.windowStats !== null;/);
  assert.match(PANE, /\{hasObservation \? <LongShortAgeStamp longShort=\{longShort\} \/> : <LongShortIntegrityBadge \/>\}/);
  assert.match(PANE, /\{hasObservation \? <LongShortProvenance provenance=\{longShort\.provenance\} \/> : null\}/);
});

test("M-3 MORDE: rendering procedência unconditionally is caught", () => {
  const mutated = PANE.replace(
    /\{hasObservation \? <LongShortProvenance provenance=\{longShort\.provenance\} \/> : null\}/,
    "<LongShortProvenance provenance={longShort.provenance} />",
  );
  assert.notEqual(mutated, PANE, "the branch moved — re-anchor this mutation, do not delete it");
  assert.doesNotMatch(
    mutated,
    /\{hasObservation \? <LongShortProvenance provenance=\{longShort\.provenance\} \/> : null\}/,
    "the mutation is undetectable by the assert above — the guard is vacuous",
  );
});

// ── `S-5` / `S-7` — the two words the gate took OUT, and the one it moved ─────────────────────

test("S-5: the word QUARENTENA does not migrate, not even as an identifier", () => {
  // `c-5` of the gate, literal: the study dropped the WORD from the screen and kept
  // `.badge-quarentena` as a CSS class — *"quem transcrever o HTML para `.tsx` reintroduz a
  // palavra"*. This is that transcription.
  // Over the CODE, not over the prose: the paragraph that explains the refusal necessarily names
  // the word it refuses (and so does `gates/design-04.md` itself). What must not exist is a
  // rendered string, a class name or an identifier.
  assert.doesNotMatch(PANE, /quarentena/i, "a registered, well-formed, empty series is not under quarantine");
  assert.match(PANE, /SEM OBSERVAÇÃO NA JANELA/, "and the word that REPLACED it must be on the pane");
});

test("S-7: the equilibrium is a border label, and its sentence is DERIVED from the domain", () => {
  // The study hardcodes "abaixo da base", true of its four days and false the first time this ratio
  // trades below parity. A transcribed sentence would assert a position nothing measured.
  assert.match(PANE, /equilibriumPlacement\(stats\)/);
  assert.match(PANE, /constante de\s*\n?\s*definição, não medição/);
  assert.doesNotMatch(PANE, /createPriceLine/, "a 1,0000 line inside the plot is what `S-7` removed, with a number");
});

// ── The contract with `T-04.7`, re-measured after a restyle (the gate's §R2.4) ────────────────

test("the restyle left the DATA handles byte-identical — form must not empty a data assert", () => {
  assert.match(source, /const LONG_SHORT_PANE_TESTID = "long-short-pane";/);
  assert.match(PANE, /data-long-short-native-bars=\{longShort\.nativeBars\}/);
  assert.match(PANE, /data-long-short-wire-points=\{longShort\.wirePoints\}/);
  assert.match(PANE, /data-fact=\{`long_short_last_reading:\$\{longShort\.reading\.kind\}`\}/);
  assert.match(PANE, /data-fact=\{`long_short_slots:\$\{longShort\.slots\.length\}`\}/);
  // ⛔ AND THE ABSENCE READOUT CARRIES NO DIGIT — `e2e/14` asserts `not.toMatch(/\d/)` on this very
  // element's text. A unit, a count or a timestamp moved into that node would break a data test
  // from the FORM side, which is exactly what the split exists to prevent.
  const readout = /data-fact=\{`long_short_last_reading:[^}]*\}[\s\S]{0,200}?<\/p>/.exec(PANE);
  assert.ok(readout !== null, "the readout element moved — re-anchor this guard");
  assert.doesNotMatch(readout[0].replace(/\{[^}]*\}/g, ""), /\d/, "a literal digit inside the absence readout");
});
