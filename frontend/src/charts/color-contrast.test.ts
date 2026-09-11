// THE GATE `D13` ORDERED: no series token may sit below its declared contrast floor against the
// surface it is actually drawn on.
//
// Why this file exists at all: the OI line was `#131722` on a `#131722` surface — `1,00:1`,
// literally invisible — LIVE IN PRODUCTION, and all six gates of `make verify` stayed green.
// `D13`: "a prova é que a linha de OI está invisível em produção agora, sem que nenhum dos 6
// portões do `make verify` tenha visto". Deleting the theme parameter removes the way that
// defect was introduced; this file removes the way ANY future token could reintroduce it.
//
// WHAT IT DOES NOT DO, deliberately: it carries no list of role names to skip. The backdrop of
// each role is read from `CONTRAST_BACKDROP`, which lives next to the palette and is typed
// `Record<ColorRole, ...>`, so a new token cannot exist without declaring what it is painted on.
// `directionOn` clears nothing against the surface (`1,00:1`) and that is correct — it is ink on
// a candle body, so the fills are its backdrop. That exemption is STRUCTURAL, not an allowlist:
// "entrada de allowlist é indistinguível de bypass" (`CLAUDE.md`).
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { colorTokens, CONTRAST_BACKDROP, SURFACE_BASE } from "./color-tokens.ts";
import type { ColorRole, ColorTokens, ContrastBackdrop } from "./color-tokens.ts";
import { contrastRatio, relativeLuminance } from "./contrast.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const GLOBALS_CSS = path.resolve(THIS_DIR, "../app/globals.css");

/**
 * The worst ratio a role achieves against everything it is drawn on, plus the floor it owes.
 * Total over the two `ContrastBackdrop` shapes — a third shape would have no branch here and
 * would THROW rather than silently pass, which is the failure mode this gate exists to refuse.
 */
function measure(
  role: ColorRole,
  tokens: ColorTokens,
  backdrop: ContrastBackdrop,
): { readonly ratio: number; readonly floor: number; readonly against: string } {
  if (backdrop.kind === "surface") {
    return {
      ratio: contrastRatio(tokens[role], SURFACE_BASE),
      floor: backdrop.minRatio,
      against: `surface ${SURFACE_BASE}`,
    };
  }
  if (backdrop.kind === "roles") {
    assert.ok(
      backdrop.roles.length > 0,
      `role "${role}" declares kind:"roles" with an EMPTY list — that would be a vacuous floor`,
    );
    let worst = Number.POSITIVE_INFINITY;
    let worstAgainst = "";
    for (const other of backdrop.roles) {
      const ratio = contrastRatio(tokens[role], tokens[other]);
      if (ratio < worst) {
        worst = ratio;
        worstAgainst = `${other} (${tokens[other]})`;
      }
    }
    return { ratio: worst, floor: backdrop.minRatio, against: worstAgainst };
  }
  throw new Error(`role "${role}" declares an unknown contrast backdrop: ${JSON.stringify(backdrop)}`);
}

// ── 0. the arithmetic itself, against values WCAG publishes ──────────────────────────────────

test("the WCAG formula reproduces its own published anchors", () => {
  assert.equal(relativeLuminance("#000000"), 0);
  assert.equal(relativeLuminance("#ffffff"), 1);
  // Black on white is the maximum ratio WCAG 2.x can express: (1 + 0.05) / (0 + 0.05) = 21.
  assert.equal(contrastRatio("#000000", "#ffffff"), 21);
  // A color against itself is 1:1 — the exact reading the invisible OI line produced.
  assert.equal(contrastRatio(SURFACE_BASE, SURFACE_BASE), 1);
  // Symmetric: the order of the arguments cannot change the verdict.
  assert.equal(contrastRatio("#8b949e", SURFACE_BASE), contrastRatio(SURFACE_BASE, "#8b949e"));
  assert.throws(() => relativeLuminance("131722"), /#rrggbb/);
});

// ── 1. the surface constant is the same number the app actually paints ───────────────────────

// WHY THIS TEST WAS REWRITTEN (wave `03` QA, `BLOCKER-1`): the previous version matched
// `/^ {2}--color-surface-base:/m` — anchored at TWO spaces, with the comment "NOT one nested in a
// media query". `globals.css` then held the token TWICE: `#131722` at indent 2 (`@theme`) and
// `#ffffff` at indent 4, inside `@media (prefers-color-scheme: light)`. The anchor excluded the
// second BY CONSTRUCTION, so this gate read 8/8 green while a browser in light mode painted the
// OI line at 1,22:1 on `#ffffff` — the very defect `D13` exists to kill, surviving in the one
// surface `charts/` cannot see (`ADR-003/FR-1`: `charts` may not read the DOM).
//
// The rule now: the app paints ONE surface and this constant names it. Three assertions, and the
// second and third are the ones that would have caught it — n = every declaration in the file, at
// any indentation, inside any block.

/** The CSS a browser would parse: comments removed, because prose ABOUT the deleted light block
 * (and there is a paragraph of it in `globals.css` now) is not a declaration, and counting it
 * would make this gate fire on its own explanation — a false positive that gets a real gate
 * disabled. Only code is measured; `/* … *\/` is not code. */
function cssWithoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

test("globals.css declares --color-surface-base EXACTLY ONCE, and it is SURFACE_BASE", () => {
  const css = cssWithoutComments(readFileSync(GLOBALS_CSS, "utf8"));
  // Any indentation, any nesting — deliberately NOT anchored, because the anchor was the bug.
  const declarations = [...css.matchAll(/--color-surface-base:\s*(#[0-9a-fA-F]{6})\s*;/g)].map((match) =>
    match[1]!.toLowerCase(),
  );
  assert.deepEqual(
    declarations,
    [SURFACE_BASE],
    `globals.css declares --color-surface-base ${declarations.length}x (${declarations.join(", ") || "none"}), and ` +
      `this gate can only measure ONE surface (SURFACE_BASE = ${SURFACE_BASE}). A second declaration is a second ` +
      "surface the app really paints and the contrast floor never sees — exactly how the light palette survived D13.",
  );
});

test("globals.css carries NO prefers-color-scheme block — D13 left one palette, not a default", () => {
  const css = cssWithoutComments(readFileSync(GLOBALS_CSS, "utf8"));
  const mediaQueries = [...css.matchAll(/@media[^{]*prefers-color-scheme[^{]*/g)].map((match) => match[0].trim());
  assert.deepEqual(
    mediaQueries,
    [],
    `globals.css reintroduced a color-scheme media query (${mediaQueries.join(" | ")}). D13 deleted the theme ` +
      "PARAMETER from charts/; a media query is the same parameter re-expressed in CSS, and it repaints the very " +
      "surface every ratio below is measured against.",
  );
});

test("globals.css declares color-scheme: dark, so the browser's own widgets follow", () => {
  const css = cssWithoutComments(readFileSync(GLOBALS_CSS, "utf8"));
  assert.match(
    css,
    /:root\s*\{[^}]*\bcolor-scheme:\s*dark\s*;/,
    "globals.css has no `:root { color-scheme: dark; }` — without it a user agent in light mode still paints " +
      "scrollbar, form controls and the pre-paint canvas from the LIGHT system palette, on top of a #131722 page. " +
      "Deleting the light block is necessary; this declaration is what makes it sufficient.",
  );
});

// ── 2. the declaration is TOTAL over the palette ─────────────────────────────────────────────

test("every token declares a backdrop, and every declaration names a real token", () => {
  const tokenRoles = Object.keys(colorTokens()).sort();
  const declaredRoles = Object.keys(CONTRAST_BACKDROP).sort();
  assert.deepEqual(
    declaredRoles,
    tokenRoles,
    "CONTRAST_BACKDROP and the palette disagree on the role set — a token with no declared backdrop is a " +
      "token this gate cannot measure, which is exactly how the invisible OI line got through",
  );
  for (const [role, backdrop] of Object.entries(CONTRAST_BACKDROP)) {
    assert.ok(backdrop.minRatio >= 3.0, `role "${role}" declares a floor below WCAG 1.4.11's 3.0:1`);
    if (backdrop.kind === "roles") {
      for (const other of backdrop.roles) {
        assert.ok(tokenRoles.includes(other), `role "${role}" is declared as drawn on "${other}", which is not a token`);
      }
    }
  }
});

// ── 3. THE GATE ──────────────────────────────────────────────────────────────────────────────

test("D13's floor: no token sits below the contrast floor of the surface it is drawn on", () => {
  const tokens = colorTokens();
  const failures: string[] = [];
  for (const role of Object.keys(CONTRAST_BACKDROP) as ColorRole[]) {
    const { ratio, floor, against } = measure(role, tokens, CONTRAST_BACKDROP[role]);
    if (ratio < floor) {
      failures.push(`${role} (${tokens[role]}) vs ${against}: ${ratio.toFixed(2)}:1 < ${floor.toFixed(1)}:1`);
    }
  }
  assert.deepEqual(failures, [], `tokens below their declared contrast floor:\n  ${failures.join("\n  ")}`);
});

test("the measured ratios are the ones D13 recorded, to 2 decimals", () => {
  const tokens = colorTokens();
  const actual = Object.fromEntries(
    (Object.keys(CONTRAST_BACKDROP) as ColorRole[]).map((role) => [
      role,
      Number(measure(role, tokens, CONTRAST_BACKDROP[role]).ratio.toFixed(2)),
    ]),
  );
  // `[MEDIDO 2026-09-11]`. The two D13 names explicitly: volume (`provenanceWeak`) 2,80 -> 5,82,
  // and the OI line (`provenanceStrong`) 1,00 -> 14,72. `directionOn` is the worst of its two
  // fills, i.e. the down fill at 4,59 — not the 1,00 it would read against the surface.
  assert.deepEqual(actual, {
    directionUpFill: 5.01,
    directionDownFill: 4.59,
    directionOn: 4.59,
    dataBrokenInk: 9.68,
    provenanceStrong: 14.72,
    provenanceWeak: 5.82,
  });
});

// ── 4. THE GATE SHOWN BITING — with the exact values the deleted light palette carried ───────

test("NEGATIVE CONTROL: replanting the light provenanceWeak (#57606a) makes the gate REJECT it", () => {
  // `#57606a` is the exact hex the deleted light palette carried for `provenanceWeak`, i.e. what
  // the volume histogram was really painted with in production: 2,80:1 against `#131722`, below
  // WCAG 1.4.11's 3,0:1. Fed through the SAME `measure` the gate above uses — a guard exercised
  // only on data that already passes it proves nothing.
  const poisoned: ColorTokens = { ...colorTokens(), provenanceWeak: "#57606a" };
  const { ratio, floor } = measure("provenanceWeak", poisoned, CONTRAST_BACKDROP.provenanceWeak);
  assert.equal(Number(ratio.toFixed(2)), 2.8, "the light provenanceWeak must still measure 2,80:1 against the surface");
  assert.ok(ratio < floor, "2,80:1 has to be below the 3,0:1 floor — otherwise this gate cannot bite");
});

test("NEGATIVE CONTROL: replanting the light provenanceStrong (#131722) reproduces the INVISIBLE OI line at 1,00:1", () => {
  // The defect exactly as it shipped: a line drawn in the surface's own color.
  const poisoned: ColorTokens = { ...colorTokens(), provenanceStrong: SURFACE_BASE };
  const { ratio, floor } = measure("provenanceStrong", poisoned, CONTRAST_BACKDROP.provenanceStrong);
  assert.equal(Number(ratio.toFixed(2)), 1, "a token equal to the surface must measure 1,00:1");
  assert.ok(ratio < floor, "1,00:1 has to be below the 3,0:1 floor");
});

test("NEGATIVE CONTROL: directionOn is NOT exempt — darkening the fill it sits on makes IT fail too", () => {
  // The structural exemption reads "measured against the fills", never "never measured". If the
  // up fill moved to something close to `directionOn`, this gate has to say so.
  const poisoned: ColorTokens = { ...colorTokens(), directionUpFill: "#1d2330" };
  const { ratio, floor } = measure("directionOn", poisoned, CONTRAST_BACKDROP.directionOn);
  assert.ok(ratio < floor, `expected directionOn to fail against a near-surface fill, got ${ratio.toFixed(2)}:1`);
});
