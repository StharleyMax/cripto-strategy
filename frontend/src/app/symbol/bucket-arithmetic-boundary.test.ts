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
 * `- ONE_MINUTE_MS` / `- FIVE_MINUTES_MS` are the literal pair the gate found.
 * `alignToTimeframeStart` is `charts`' own flooring, pinned so "already absent" stays a fact
 * rather than a snapshot.
 *
 * ⚠️ THE FLOOR PATTERN WAS SHARPENED ON 2026-09-15, AND IT WAS NOT LOOSENED INTO A HOLE — read
 * the two replacements before judging. It used to be the bare `Math.floor\s*\(`, which forbids a
 * WORD rather than the operation this file exists to forbid. `A-4.1` then wrote `formatSpan`
 * (`SymbolClient.tsx`), which decomposes a DURATION into `h`/`min`/`s` — `Math.floor(spanMs /
 * 1_000)`, `Math.floor(totalSeconds / 60)`. That is unit decomposition of a SPAN: it takes no
 * instant and it produces no instant, so `ADR-003`'s "segunda implementação da grade canônica" is
 * structurally out of reach for it — and the bare pattern flagged all four of its lines
 * [MEDIDO 2026-09-15: `npm --prefix frontend run test:app` → 4 offenders, all in `formatSpan`].
 *
 * What FR-2 actually forbids is flooring an INSTANT ONTO A GRID, and that operation cannot be
 * written without leaving one of two fingerprints: the grid width is NAMED (a `*_MS` constant), or
 * the quotient is MULTIPLIED BACK to land on the boundary. Those two are the patterns below, and
 * the `MORDE` test carries a case for each arm — including a bucket floor written with a NUMERIC
 * literal, which the old single pattern caught by accident and these two catch on purpose.
 */
const FORBIDDEN_ARITHMETIC: readonly { readonly pattern: RegExp; readonly why: string }[] = [
  { pattern: /-\s*ONE_MINUTE_MS/, why: "half-open→inclusive conversion: use lastGridInstant(window, ONE_MINUTE_MS)" },
  { pattern: /-\s*FIVE_MINUTES_MS/, why: "same conversion at the coarse grid: use lastGridInstant(window, FIVE_MINUTES_MS)" },
  {
    pattern: /Math\.floor\s*\([^\n]*_MS\b/,
    why: "flooring by a NAMED grid width is alignToTimeframeStart's job, in charts",
  },
  {
    pattern: /Math\.floor\s*\([^\n]*\)\s*\*/,
    why: "flooring and multiplying back lands an instant ON a bucket boundary — charts' geometry",
  },
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
    // One case per ARM of the sharpened floor guard (2026-09-15), because a two-pattern rule whose
    // cases all trip both patterns proves only that one of them works:
    //   named grid width, no multiply-back — caught by the `_MS` arm alone;
    "  const bucketIndex = Math.floor((instantMs - originMs) / FIVE_MINUTES_MS);",
    //   numeric literal, multiplied back — caught by the multiply-back arm alone.
    "  const bucket = Math.floor(instantMs / 300_000) * 300_000;",
  ];
  for (const line of replanted) {
    assert.ok(
      FORBIDDEN_ARITHMETIC.some(({ pattern }) => pattern.test(line)),
      `the guard does not catch ${JSON.stringify(line)} — it would let the defect back in`,
    );
  }
});

test("both arms of the floor guard are load-bearing — neither is decoration the other already covers", () => {
  // A two-pattern rule whose cases all trip BOTH patterns proves only that one of them works.
  // These two assertions are what stops a future cleanup from deleting one arm as "redundant".
  const namedWidthOnly = "  const bucketIndex = Math.floor((instantMs - originMs) / FIVE_MINUTES_MS);";
  const multiplyBackOnly = "  const bucket = Math.floor(instantMs / 300_000) * 300_000;";
  const arms = FORBIDDEN_ARITHMETIC.filter(({ pattern }) => pattern.source.includes("Math"));
  assert.equal(arms.length, 2, "the floor guard is two arms — re-anchor this test if that changes");
  const [namedWidthArm, multiplyBackArm] = arms;
  assert.ok(namedWidthArm.pattern.test(namedWidthOnly), "the `_MS` arm must catch a bucket INDEX (no multiply-back)");
  assert.ok(
    !multiplyBackArm.pattern.test(namedWidthOnly),
    "…and the multiply-back arm must NOT, or this case proves nothing about the first",
  );
  assert.ok(multiplyBackArm.pattern.test(multiplyBackOnly), "the multiply-back arm must catch a LITERAL bucket width");
  assert.ok(
    !namedWidthArm.pattern.test(multiplyBackOnly),
    "…and the `_MS` arm must NOT, or this case proves nothing about the second",
  );
});

test("CALA: the sanctioned call does NOT trip the guard — otherwise the fix itself would be unwritable", () => {
  const sanctioned = [
    "    windowEndMsInclusive: lastGridInstant(window, ONE_MINUTE_MS),",
    "  return lastGridInstant(panels.window, ONE_MINUTE_MS);",
    "    alignmentMs: FIVE_MINUTES_MS,",
    // `A-4.1`'s `formatSpan`, verbatim: decomposing a SPAN into h/min/s takes no instant and
    // produces no instant. The bare `Math.floor\s*\(` flagged all four of these.
    "    const totalSeconds = Math.max(0, Math.floor(spanMs / 1_000));",
    "    const minutes = Math.floor(totalSeconds / 60);",
    "    const hours = Math.floor(totalSeconds / 3_600);",
    "    const minutes = Math.floor((totalSeconds % 3_600) / 60);",
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
