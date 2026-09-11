/**
 * `ADR-003` FR-2 at the `web` side, as a PORTÃO instead of as a `grep` somebody remembers.
 *
 * WHY THIS FILE EXISTS. The `quant-architect` gate of wave `03` (C3) measured the same bucket
 * conversion written out TWICE under `src/app/symbol/` —
 *
 *     request-window.ts:85   windowEndMsInclusive: window.endMsExclusive - ONE_MINUTE_MS
 *     SymbolClient.tsx:112   return panels.rangeEndMsExclusive - ONE_MINUTE_MS
 *
 * — which is literally the "segunda implementação da grade canônica" FR-2 names as the failure
 * mode where the screen and the engine disagree about what happened
 * (`docs/adr/ADR-003-fronteira-charts-web.md:37`). The fix moved the conversion into `charts`
 * (`lastGridInstant`). The falsifier the gate wrote for it is a `grep` that has to go from 2
 * lines to 0 — and a `grep` nobody runs is prose. THIS is that `grep`, versioned, in a suite,
 * where a re-introduction fails instead of merely being visible.
 *
 * ⚠️ WHAT IT PROVES AND WHAT IT DOES NOT. It is a SOURCE SCAN, the same instrument
 * `volume-subaxis-dom-contract.test.ts` and `universe-at.test.ts` already use here, and it has
 * their limit: it proves that no bucket arithmetic is SPELLED in this directory, not that the
 * numbers the route sends are right. The second claim belongs to `request-window.test.ts` and
 * to `charts/s2-window.test.ts`, which assert behaviour. Two weak instruments over different
 * claims, neither pretending to be the other.
 *
 * Paths resolved from `fileURLToPath`, never from `cwd`.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SYMBOL_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Every production module of the route — tests excluded, because a test is allowed to name the
 * arithmetic it forbids (this file is the proof of that). */
function productionSources(): readonly { readonly file: string; readonly source: string }[] {
  return readdirSync(SYMBOL_DIR)
    .filter((file) => (file.endsWith(".ts") || file.endsWith(".tsx")) && !file.includes(".test."))
    .map((file) => ({ file, source: readFileSync(path.join(SYMBOL_DIR, file), "utf8") }));
}

/**
 * The shapes of bucket arithmetic, each with the reason it is geometry and therefore `charts`'.
 *
 * `- ONE_MINUTE_MS` / `- FIVE_MINUTES_MS` are the literal pair the gate found. `Math.floor(`
 * and `alignToTimeframeStart` are the flooring the QA of this wave measured as already absent
 * ("`grep` → `rc=1`, nenhuma linha"), pinned here so "already absent" stays a fact rather than
 * a snapshot.
 */
const FORBIDDEN_ARITHMETIC: readonly { readonly pattern: RegExp; readonly why: string }[] = [
  { pattern: /-\s*ONE_MINUTE_MS/, why: "half-open→inclusive conversion: use lastGridInstant(window, ONE_MINUTE_MS)" },
  { pattern: /-\s*FIVE_MINUTES_MS/, why: "same conversion at the coarse grid: use lastGridInstant(window, FIVE_MINUTES_MS)" },
  { pattern: /Math\.floor\s*\(/, why: "flooring onto a bucket boundary is alignToTimeframeStart's job, in charts" },
  { pattern: /alignToTimeframeStart/, why: "charts' own flooring, reached only through the barrel and never re-implemented" },
];

test("FR-2: no module of `src/app/symbol/` computes bucket arithmetic — the gate's grep, as a gate", () => {
  const offenders: string[] = [];
  for (const { file, source } of productionSources()) {
    for (const { pattern, why } of FORBIDDEN_ARITHMETIC) {
      for (const [index, line] of source.split("\n").entries()) {
        if (pattern.test(line)) {
          offenders.push(`${file}:${index + 1} matches ${pattern} — ${why}\n    ${line.trim()}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], `web computed geometry (ADR-003 FR-2):\n  ${offenders.join("\n  ")}`);
});

test("MORDE: the exact two lines the gate found would fail this test if replanted", () => {
  // The literals as they stood before the fix, verbatim from the gate's §3. If this test cannot
  // catch them, it is decoration.
  const replanted = [
    "    windowEndMsInclusive: window.endMsExclusive - ONE_MINUTE_MS,",
    "  return panels.rangeEndMsExclusive - ONE_MINUTE_MS;",
    "  const bucket = Math.floor(instantMs / FIVE_MINUTES_MS) * FIVE_MINUTES_MS;",
  ];
  for (const line of replanted) {
    assert.ok(
      FORBIDDEN_ARITHMETIC.some(({ pattern }) => pattern.test(line)),
      `the guard does not catch ${JSON.stringify(line)} — it would let the defect back in`,
    );
  }
});

test("CALA: the sanctioned call does NOT trip the guard — otherwise the fix itself would be unwritable", () => {
  const sanctioned = [
    "    windowEndMsInclusive: lastGridInstant(window, ONE_MINUTE_MS),",
    "  return lastGridInstant(panels.window, ONE_MINUTE_MS);",
    "    alignmentMs: FIVE_MINUTES_MS,",
  ];
  for (const line of sanctioned) {
    assert.ok(
      !FORBIDDEN_ARITHMETIC.some(({ pattern }) => pattern.test(line)),
      `the guard rejects the sanctioned form ${JSON.stringify(line)} — it would force the arithmetic back inline`,
    );
  }
});

test("the route still USES the charts conversion — an empty directory would pass the scan above", () => {
  // The scan is an absence proof, and an absence proof is satisfied by deleting the code. This
  // is its companion: the two call sites that used to hold the literals now call `charts`.
  const byFile = new Map(productionSources().map(({ file, source }) => [file, source]));
  for (const file of ["request-window.ts", "SymbolClient.tsx"]) {
    const source = byFile.get(file);
    assert.ok(source !== undefined, `${file} vanished — re-anchor this test rather than deleting it`);
    assert.match(source, /lastGridInstant\(/, `${file} must reach the conversion through charts, not inline it`);
  }
});
