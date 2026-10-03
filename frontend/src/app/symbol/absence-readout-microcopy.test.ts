// `T-01.R1` — `SF-9` of `gates/W1-DESIGN-REVIEW.md` §3 (still open in r3 §4): the `sr-only` readouts
// said "Leitura atual: SEM_PONTO" to a screen reader while the painted legend said `ausente`. The
// review measured 8 such nodes on `4h` (r1) and 7 on `4h`/`15m`/`1h` (r3), all `.sr-only`, none under
// an `aria-hidden` ancestor. One word on both channels is the fix, and this file is what fails
// without it.
//
// `estrutura-do-front` `T-10.10` DoD 2, closed with the `T-10.11` harness: the token itself is IMPORTED
// from `chart/marks/AbsenceNote.tsx` and compared by value, in this one place. What is still a source
// scan is the rest: the seven absent BRANCHES resolving to it, and the enum kept in the attributes —
// those are rendered by the `*-dom-contract` rewrites (`T-10.12..T-10.14`), not here. The browser half
// is the `e2e/08`-`e2e/13` readout assertions, which expect the same word.
//
// Run with: npm --prefix frontend run test:app

import assert from "node:assert/strict";
import { test } from "node:test";
// `T-10.11` harness — FIRST, so the `.tsx` below can be imported (`gates/T-10.11-padrao.md` §7).
import "../component-render.ts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { ABSENCE_MICROCOPY, LEGEND_GRID_ABSENCE } from "./chart/legend/pane-legend.ts";
import { MOVED_OUT_FILES } from "./symbol-client-moved-out-files.ts";

const { ABSENCE_TOKEN } = await import("./chart/marks/AbsenceNote.tsx");

const SOURCE = ["SymbolClient.tsx", ...MOVED_OUT_FILES]
  .map((file) => readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), "utf8"))
  .join("\n");
/** The code without its comments: the docstrings quote `SEM_PONTO` on purpose, the code may not. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Every `sr-only` readout of the six panes: price, volume, OI, CVD delta, CVD cumulative,
 * liquidation (one per cohort, same line) and long/short — 7 absent branches in the source. */
const EXPECTED_ABSENT_BRANCHES = 7;

test("SF-9: the readouts' absence token IS the legend's pt-BR word, not the enum", () => {
  // The mutation this rejects: `ABSENCE_TOKEN = "SEM_PONTO"`, the state the review measured.
  assert.equal(
    ABSENCE_TOKEN,
    ABSENCE_MICROCOPY[LEGEND_GRID_ABSENCE],
    "the sr-only readouts and the painted legend must say the same word for the same absence",
  );
  assert.doesNotMatch(ABSENCE_TOKEN, /[A-Z_]/, "the readout token still looks like an enum");
  assert.doesNotMatch(ABSENCE_TOKEN, /\d/, "an absence must never read as a number (RN-1)");
});

test("SF-9: no readout spells the enum as its own literal", () => {
  // The price readout printed a bare `"SEM_PONTO"` literal until `T-01.R1`, beside the constant the
  // other five used — so the constant alone was never the whole guard.
  assert.doesNotMatch(CODE, /"SEM_PONTO"/, "a \"SEM_PONTO\" string literal reaches the rendered text");
  const branches = CODE.match(/\?\s*ABSENCE_TOKEN\b/g) ?? [];
  assert.equal(branches.length, EXPECTED_ABSENT_BRANCHES, "every readout's absent branch resolves to ABSENCE_TOKEN");
});

test("SF-9: the enum stays machine-readable where it always was", () => {
  // The painted word changed; the contract did not. The legend keeps the enum in an attribute...
  assert.match(CODE, /data-legend-absence=\{isAbsent \? LEGEND_GRID_ABSENCE : ""\}/);
  // ...and every readout keeps `:absent` in its `data-fact`, which is what the e2e key on.
  for (const fact of [
    /data-fact=\{`volume_last_reading:\$\{volume\.reading\.kind\}`\}/,
    /data-fact=\{`cvd_last_reading:\$\{deltaReading\.kind\}`\}/,
    /data-fact=\{`cvd_cumulative_last_reading:\$\{cumulativeReading\.kind\}`\}/,
    /data-fact=\{`liquidation_last_reading:\$\{cohort\}:\$\{data\.reading\.kind\}`\}/,
  ]) {
    assert.match(CODE, fact);
  }
});

// `T-10.10`: the "token back to the enum" mutant left with the declaration regex — the token is now
// compared by IMPORT (the first SF-9 test), and `T-10.8` row #2 measured that mutant as a duplicate of it.
test("MORDE: planting the enum back as a readout literal is caught", () => {
  const mutants = [
    { name: "price literal back", mutate: (s: string) => s.replace(/\?\s*ABSENCE_TOKEN\b/, '? "SEM_PONTO"') },
  ];
  for (const mutant of mutants) {
    const mutated = mutant.mutate(CODE);
    assert.notEqual(mutated, CODE, `the mutation "${mutant.name}" found no anchor — update this test`);
    const survives =
      !/"SEM_PONTO"/.test(mutated) &&
      (mutated.match(/\?\s*ABSENCE_TOKEN\b/g) ?? []).length === EXPECTED_ABSENT_BRANCHES;
    assert.ok(!survives, `the mutation "${mutant.name}" is NOT detected by the asserts above`);
  }
});
