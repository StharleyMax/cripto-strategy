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
 * ⚠️ THE FLOOR PATTERN WAS SHARPENED ON 2026-09-15 — AND THE FIRST SHARPENING DID OPEN A HOLE,
 * which the code-review of PR #222 measured and the third arm below closes; the paragraph after
 * this one is that story, kept here rather than rewritten out of it. The pattern used to be the
 * bare `Math.floor\s*\(`, which forbids a WORD rather than the operation this file exists to
 * forbid. `A-4.1` then wrote `formatSpan`
 * (`SymbolClient.tsx`), which decomposes a DURATION into `h`/`min`/`s` — `Math.floor(spanMs /
 * 1_000)`, `Math.floor(totalSeconds / 60)`. That is unit decomposition of a SPAN: it takes no
 * instant and it produces no instant, so `ADR-003`'s "segunda implementação da grade canônica" is
 * structurally out of reach for it — and the bare pattern flagged all four of its lines
 * [MEDIDO 2026-09-15: `npm --prefix frontend run test:app` → 4 offenders, all in `formatSpan`].
 *
 * What FR-2 actually forbids is flooring an INSTANT ONTO A GRID. Three fingerprints, not two — and
 * the third one exists because the two-fingerprint claim was WRONG, which is the next paragraph.
 *
 * ⚠️ THE THIRD ARM WAS ADDED ON 2026-09-15 BECAUSE THE TWO ARMS ABOVE HAD A HOLE, and the hole was
 * found by replanting, not by reading. The docstring used to argue that a grid floor "cannot be
 * written without leaving one of two fingerprints": a NAMED width (`*_MS`), or the quotient
 * MULTIPLIED BACK. That is true of the OPERATION and false of the INSTRUMENT — this scan is line by
 * line (`source.split("\n")`), so the multiply-back arm only ever sees a `*` that shares a line with
 * its `Math.floor`. Written in two steps with a LITERAL width, the floor walked between both arms:
 *
 *     const bucketIndex = Math.floor(instantMs / 300_000);   // no `_MS`, no `*` on this line
 *     return bucketIndex * 300_000;                          // no `Math.floor` on this line
 *
 * That IS the second implementation of the canonical grid — instant in, instant on a bucket
 * boundary out — and it is the natural shape whenever the quotient is reused. Replanted in a
 * production module of this directory, it left the suite GREEN
 * [MEDIDO 2026-09-15: `npm --prefix frontend run test:app` → `pass 203 / fail 0`], where the bare
 * `Math.floor\s*\(` that preceded these arms would have failed it.
 *
 * The third arm therefore anchors on the SCALE OF THE DIVISOR instead of on a neighbouring token:
 * every grid width expressed in milliseconds is `>= 60_000` (one minute is the finest grid this
 * product has), while `formatSpan`'s unit decomposition divides by `1_000`, `60` and `3_600`. Scale
 * separates them with no overlap, and it survives the line break that defeated the multiply-back arm.
 *
 * ⚠️ IT IS NOT the regex the review sketched. That one read `(?:[6-9]\d|\d{3,})[\d_]*`, whose
 * `[6-9]\d` alternative matches the bare `60` of `Math.floor(totalSeconds / 60)` — 2 FALSE POSITIVES
 * over `formatSpan`'s 4 lines [MEDIDO 2026-09-15], which would have turned the production scan red
 * and invited exactly the loosening this file is repairing. The arm below counts DIGITS, ignoring
 * `_` separators: six or more digits, or five digits starting at 6-9 — i.e. the literal's VALUE is
 * `>= 60_000`. Over the same 4 lines it is quiet, and it bites all three replanted floor shapes.
 *
 * Each arm carries its own discriminating case in `MORDE`, and the load-bearing test below proves
 * no arm is decoration another already covers.
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
  {
    pattern: /Math\.floor\s*\([^\n]*\/\s*(?:\d(?:_?\d){5,}|[6-9](?:_?\d){4}(?!_?\d))/,
    why: "dividing by a literal of BUCKET scale (>= 60_000 ms) is a grid floor even when the multiply-back lives on the next line — charts' geometry",
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
    //   numeric literal, multiplied back on the SAME line — caught by the multiply-back arm.
    "  const bucket = Math.floor(instantMs / 300_000) * 300_000;",
    //   TWO STEPS with a LITERAL width — the shape that walked between the two arms of 2026-09-15
    //   and left the suite at `pass 203 / fail 0` when the review replanted it in `panel-status.ts`.
    //   Only the floor LINE can be caught: the scan is line by line, so this entry is what proves
    //   the scale arm exists. Its companion `return bucketIndex * 300_000;` is deliberately NOT
    //   listed — claiming a line-by-line scan catches a line with no `Math.floor` on it would be
    //   the same kind of false claim that produced this hole.
    "  const bucketIndex = Math.floor(instantMs / 300_000);",
    //   same two-step shape written without `_` separators, so the digit counting is exercised on
    //   both literal spellings the codebase allows.
    "  const bucketIndex = Math.floor((instantMs - originMs) / 60000);",
  ];
  for (const line of replanted) {
    assert.ok(
      FORBIDDEN_ARITHMETIC.some(({ pattern }) => pattern.test(line)),
      `the guard does not catch ${JSON.stringify(line)} — it would let the defect back in`,
    );
  }
});

test("all three arms of the floor guard are load-bearing — none is decoration another already covers", () => {
  // A multi-pattern rule whose cases all trip EVERY pattern proves only that one of them works.
  // These assertions are what stops a future cleanup from deleting an arm as "redundant" — and the
  // third arm is here precisely because such a cleanup (2026-09-15) removed coverage it had.
  const onlyThisArmCatches: readonly (readonly [string, string])[] = [
    // the `_MS` arm: a bucket INDEX by a NAMED width — no multiply-back, no literal to measure.
    ["_MS", "  const bucketIndex = Math.floor((instantMs - originMs) / FIVE_MINUTES_MS);"],
    // the multiply-back arm: width held in a VARIABLE, so neither `_MS` nor scale can see it.
    ["multiply-back", "  const bucket = Math.floor(instantMs / bucketWidthMs) * bucketWidthMs;"],
    // the scale arm: literal width, multiply-back moved to the NEXT line — the PR #222 hole.
    ["scale", "  const bucketIndex = Math.floor(instantMs / 300_000);"],
  ];
  const arms = FORBIDDEN_ARITHMETIC.filter(({ pattern }) => pattern.source.includes("Math"));
  assert.equal(arms.length, 3, "the floor guard is three arms — re-anchor this test if that changes");
  for (const [index, [name, line]] of onlyThisArmCatches.entries()) {
    const matching = arms.filter(({ pattern }) => pattern.test(line)).length;
    assert.equal(
      matching,
      1,
      `${matching} of ${arms.length} arms catch the ${name}-only case — it proves nothing about that arm`,
    );
    assert.ok(
      arms[index].pattern.test(line),
      `the ${name} arm must be the one that catches ${JSON.stringify(line)}`,
    );
  }
});

test("CALA: the sanctioned call does NOT trip the guard — otherwise the fix itself would be unwritable", () => {
  const sanctioned = [
    "    windowEndMsInclusive: lastGridInstant(window, ONE_MINUTE_MS),",
    "  return lastGridInstant(panels.window, ONE_MINUTE_MS);",
    "    alignmentMs: FIVE_MINUTES_MS,",
    // `A-4.1`'s `formatSpan`, verbatim: decomposing a SPAN into h/min/s takes no instant and
    // produces no instant. The bare `Math.floor\s*\(` flagged all four of these, and the scale arm
    // sketched by the PR #222 review (`(?:[6-9]\d|\d{3,})[\d_]*`) flagged two — the `/ 60` of the
    // 2nd and 4th lines. The arm that shipped counts digits, so `60`, `1_000` and `3_600` are all
    // below the `>= 60_000` bucket scale and none of the four is reachable by it.
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
