/**
 * `T-01.7` — the DOM CONTRACT of the volume sub-axis, guarded.
 *
 * WHY THIS FILE EXISTS (achado do QA de `T-01.7`): `view-model.test.ts` proves `RN-1` on the
 * DATA side — a mutation planting `value: 0` on absence turns 4 of its tests red. It proves
 * NOTHING about the RENDERING side, and the rendering side is where `T-01.7`'s own extra
 * deliverable lives. Measured, not assumed: with the suite at 136/136 green, each of the three
 * mutations below passed unnoticed —
 *
 *   - renaming `VOLUME_SUBAXIS_TESTID`            -> 136 pass / 0 fail
 *   - `ABSENCE_TOKEN = "SEM_PONTO"` becoming `"0"` -> 136 pass / 0 fail
 *   - deleting `data-volume-present-points`        -> 136 pass / 0 fail
 *
 * The second one IS the defect `RN-1` names, reachable by a one-token edit: a `FLOW` absence
 * printed as `0` on screen ("LOCF over it is a type error, never UX"). The other two silently
 * break `T-01.9`'s selector, which is the very thing that makes `T-01.8` (form) and `T-01.9`
 * (data) parallelizable.
 *
 * WHY A SOURCE SCAN AND NOT A RENDER: this repo has no component renderer in any suite
 * (`@testing-library` is not installed; no `*.test.ts` mounts a `.tsx`), and `SymbolClient.tsx`
 * imports `lightweight-charts`, which wants a DOM. The source scan is the technique this repo
 * already uses for exactly this class of claim — `universe-at.test.ts`'s "structural
 * falsifier", with its own MORDE companion, in this same suite. It is a weaker instrument than
 * a render and says so: it proves the literal is SPELLED where the contract requires, not that
 * a browser painted it. The browser half is `T-01.9`'s e2e, by design.
 *
 * Path resolved from `fileURLToPath`, never from `cwd` — same discipline as `universe-at.test.ts`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SYMBOL_CLIENT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "SymbolClient.tsx");
const source = readFileSync(SYMBOL_CLIENT_PATH, "utf8");

/** The selector `T-01.9` will `page.locator()` by. Duplicated here ON PURPOSE: a contract with
 * another task is not guarded by importing the constant it is made of — that would rename
 * itself along with the mutation it is supposed to catch. */
const EXPECTED_TESTID = "price-pane-volume-subaxis";
const EXPECTED_PRESENT_POINTS_ATTR = "data-volume-present-points";
/** `RN-1`'s literal token. `DoD-3` asserts its ABSENCE from the screen when data is present, so
 * the string is as load-bearing as the testid. */
const EXPECTED_ABSENCE_TOKEN = "SEM_PONTO";

const TESTID_DECLARATION = /const VOLUME_SUBAXIS_TESTID = "([^"]*)";/;
const ABSENCE_TOKEN_DECLARATION = /const ABSENCE_TOKEN = "([^"]*)";/;

test("T-01.9 contract: the volume sub-axis carries the STABLE testid, spelled exactly", () => {
  const declaration = TESTID_DECLARATION.exec(source);
  assert.ok(declaration !== null, "VOLUME_SUBAXIS_TESTID declaration not found — the anchor moved, fix this test");
  assert.equal(
    declaration[1],
    EXPECTED_TESTID,
    "the testid T-01.9 selects by changed; renaming it silently breaks the e2e's only handle",
  );
  // Declared is not rendered: the constant must actually reach a `data-testid` attribute.
  assert.match(source, /data-testid=\{VOLUME_SUBAXIS_TESTID\}/);
});

test("T-01.9 contract: the present-point count is a bare integer attribute on that same element", () => {
  assert.match(
    source,
    new RegExp(`${EXPECTED_PRESENT_POINTS_ATTR}=\\{volume\\.presentPoints\\}`),
    "the attribute DoD-3/RN-S2 read N >= 30 from must be rendered, and must carry the raw count",
  );
  // Same element as the testid, not a sibling — otherwise the e2e's `getAttribute` finds nothing.
  const subAxisElement = /data-testid=\{VOLUME_SUBAXIS_TESTID\}\s*\n\s*data-volume-present-points=\{volume\.presentPoints\}/;
  assert.match(source, subAxisElement, "testid and present-point count must sit on the SAME element");
});

test("RN-1 at the RENDERING layer: absence prints SEM_PONTO, and the token is never a number", () => {
  const declaration = ABSENCE_TOKEN_DECLARATION.exec(source);
  assert.ok(declaration !== null, "ABSENCE_TOKEN declaration not found — the anchor moved, fix this test");
  assert.equal(declaration[1], EXPECTED_ABSENCE_TOKEN, "absence is SEM_PONTO — for a FLOW series a number here is an error of TYPE");
  assert.ok(
    !/^-?\d+(\.\d+)?$/.test(declaration[1]!),
    "the absence token must not be a number in any shape — 0, 0.0 and -0 are all the RN-1 defect",
  );
  // The token has to be what the readout actually falls back to, not a dead constant.
  assert.match(
    source,
    /volume\.reading\.kind === "absent" \|\| volume\.reading\.value === null \? ABSENCE_TOKEN :/,
    "the absent branch of the volume readout must resolve to ABSENCE_TOKEN",
  );
});

// ── MORDE: the three mutations that were GREEN before this file existed ──────────────────────

test("MORDE: each of the 3 DOM-contract mutations that used to pass green is now caught", () => {
  const mutants: readonly { readonly name: string; readonly mutate: (s: string) => string }[] = [
    { name: "testid renamed", mutate: (s) => s.replace(TESTID_DECLARATION, 'const VOLUME_SUBAXIS_TESTID = "renamed";') },
    { name: "absence rendered as 0", mutate: (s) => s.replace(ABSENCE_TOKEN_DECLARATION, 'const ABSENCE_TOKEN = "0";') },
    { name: "present-point attribute deleted", mutate: (s) => s.replace(/\s*data-volume-present-points=\{volume\.presentPoints\}/, "") },
  ];
  for (const mutant of mutants) {
    const mutated = mutant.mutate(source);
    assert.notEqual(mutated, source, `the mutation "${mutant.name}" found no anchor — update this test, do not delete it`);
    const survives =
      TESTID_DECLARATION.exec(mutated)?.[1] === EXPECTED_TESTID &&
      ABSENCE_TOKEN_DECLARATION.exec(mutated)?.[1] === EXPECTED_ABSENCE_TOKEN &&
      mutated.includes(`${EXPECTED_PRESENT_POINTS_ATTR}={volume.presentPoints}`);
    assert.ok(!survives, `the mutation "${mutant.name}" is NOT detected by the asserts above — the guard is vacuous`);
  }
});

// ── CALA: form is `T-01.8`'s to change, and changing it must not touch any assert above ──────

test("CALA: a design_gate NEEDS_FIX about colour, height or scale leaves the contract intact", () => {
  // Exactly the kind of edit `T-01.8` is allowed to make without coordinating with `T-01.9`.
  const restyled = source
    .replace(/const VOLUME_SCALE_MARGINS = \{ top: 0\.8, bottom: 0 \} as const;/, "const VOLUME_SCALE_MARGINS = { top: 0.55, bottom: 0.05 } as const;")
    .replace(/color: colorTokens\("light"\)\.provenanceWeak,/, 'color: colorTokens("light").provenanceStrong,');
  assert.notEqual(restyled, source, "the form constants moved — re-anchor this CALA rather than dropping it");
  assert.equal(TESTID_DECLARATION.exec(restyled)?.[1], EXPECTED_TESTID);
  assert.equal(ABSENCE_TOKEN_DECLARATION.exec(restyled)?.[1], EXPECTED_ABSENCE_TOKEN);
  assert.ok(restyled.includes(`${EXPECTED_PRESENT_POINTS_ATTR}={volume.presentPoints}`));
  assert.match(restyled, /data-testid=\{VOLUME_SUBAXIS_TESTID\}/);
});

// ── The layer boundary this component must not cross (`web-fullstack.browser-imports-server`) ─

test("SymbolClient.tsx imports nothing server-side — no node: builtin, no view-model.ts", () => {
  const importedFrom = [...source.matchAll(/^import[\s\S]*?from "([^"]+)";$/gm)].map((match) => match[1]!);
  assert.ok(importedFrom.length > 0, "no imports parsed — the scan is vacuous, fix the pattern");
  for (const specifier of importedFrom) {
    assert.ok(!specifier.startsWith("node:"), `client component imports the Node builtin ${specifier}`);
    // `view-model.ts` pulls `node:crypto` (computeSeriesKeyId); importing it from a client
    // component is the BLOQUEIO `web-fullstack.browser-imports-server` names.
    assert.ok(!specifier.includes("view-model"), `client component imports the server-side ${specifier}`);
  }
});
