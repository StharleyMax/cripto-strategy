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

import { chartSurfaceTheme, CHART_GRID_LINE } from "./chart-theme.ts";
import type { ChartSurfaceTheme } from "./chart-theme.ts";
import { colorTokens, CONTRAST_BACKDROP, SURFACE_BASE } from "./color-tokens.ts";
import type { ColorRole, ColorTokens, ContrastBackdrop } from "./color-tokens.ts";
import { contrastRatio, relativeLuminance } from "./contrast.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const GLOBALS_CSS = path.resolve(THIS_DIR, "../app/globals.css");

// The worst ratio a role achieves against everything it is drawn on, plus the floor it owes.
// Total over the two `ContrastBackdrop` shapes — a third shape would have no branch here and
// would THROW rather than silently pass, which is the failure mode this gate exists to refuse.
//
// ⛔ AND THE REPAIR OF `DR-1` LIVES IN THIS SIGNATURE.
//
// `kind: "surface"` NO LONGER MEANS `SURFACE_BASE`. The series ink is not laid on the PAGE, it is
// laid on the `<canvas>`, and at `74d59a4` those were two different colors: `createChart` was
// called with no `layout`, so the canvas kept the library default `#FFFFFF` while this function
// measured against `#131722`. `provenanceStrong` — the CVD delta line — read `14,72:1` here and
// `1,22:1` on the screen. The gate was green and the screen was wrong, which is `ADR-012`'s
// `rc=0` that cannot tell "nada erodiu" from "o instrumento mede a referência errada".
//
// So the backdrop is now `theme.backgroundColor`, i.e. THE VALUE `createChart` RECEIVES
// (`chartSurfaceTheme()` -> `chartConstructorOptions()` -> `createChart`, with
// `chart-construction.test.ts` forbidding a call site from bypassing that chain). Taking the
// theme as a PARAMETER rather than reading it inside is what lets the negative controls below
// replant `#FFFFFF` and watch this gate produce `1,22:1` and REJECT — the defect reproduced, not
// described.
function measure(
  role: ColorRole,
  tokens: ColorTokens,
  backdrop: ContrastBackdrop,
  theme: ChartSurfaceTheme = chartSurfaceTheme(),
): { readonly ratio: number; readonly floor: number; readonly against: string } {
  if (backdrop.kind === "surface") {
    return {
      ratio: contrastRatio(tokens[role], theme.backgroundColor),
      floor: backdrop.minRatio,
      against: `chart background ${theme.backgroundColor}`,
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

/** `#fff`, `#FFFFFF`, `rgb(255 255 255)` and `rgba(255, 255, 255, 1)` are ONE color, and this says
 * so. A notation this function cannot read is returned verbatim (lowercased): it will not equal
 * `SURFACE_BASE`, so the count assertion fails LOUDLY — which is the honest answer to "I cannot
 * read this value", and the opposite of the silence that `AVISO-1` found. */
function normalizeCssColor(value: string): string {
  const raw = value.trim().toLowerCase();
  const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(raw);
  if (shortHex) {
    return `#${shortHex[1]!}${shortHex[1]!}${shortHex[2]!}${shortHex[2]!}${shortHex[3]!}${shortHex[3]!}`;
  }
  if (/^#[0-9a-f]{6}$/.test(raw)) return raw;
  const functional = /^rgba?\(([^)]*)\)$/.exec(raw);
  if (functional) {
    const channels = functional[1]!.split(/[\s,/]+/).filter((part) => part !== "");
    const rgb = channels.slice(0, 3).map((part) => Number(part));
    if (rgb.length === 3 && rgb.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
      return `#${rgb.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
    }
  }
  return raw;
}

/** Every `--color-surface-base` VALUE the CSS declares, normalized to `#rrggbb`.
 *
 * WHY IT READS THE VALUE WHOLE (`[^;{}]+`) INSTEAD OF A HEX-6 PATTERN — wave `03` QA, `AVISO-1`:
 * the first version of this gate matched `#[0-9a-fA-F]{6}` only, so a second surface written
 * `#fff` or `rgb(255 255 255)` OUTSIDE a media query was not merely allowed, it was never SEEN by
 * the count (2 of 8 mutations scored `fail 0`). A gate that cannot read the notation cannot count
 * the declaration, and CSS spells one color many ways. So the value is read whole and then
 * normalized: notation becomes a detail of writing instead of a hole in the measurement. The pair
 * that proves it is two tests below — one that MORDE, one that CALA. */
function surfaceBaseDeclarations(css: string): readonly string[] {
  return [...css.matchAll(/--color-surface-base:\s*([^;{}]+);/g)].map((match) => normalizeCssColor(match[1]!));
}

test("globals.css declares --color-surface-base EXACTLY ONCE, and it is SURFACE_BASE", () => {
  const css = cssWithoutComments(readFileSync(GLOBALS_CSS, "utf8"));
  // Any indentation, any nesting, ANY NOTATION — deliberately NOT anchored, because the anchor was
  // the bug, and deliberately not hex-only, because the notation was the leftover hole.
  const declarations = [...surfaceBaseDeclarations(css)];
  assert.deepEqual(
    declarations,
    [SURFACE_BASE],
    `globals.css declares --color-surface-base ${declarations.length}x (${declarations.join(", ") || "none"}), and ` +
      `this gate can only measure ONE surface (SURFACE_BASE = ${SURFACE_BASE}). A second declaration is a second ` +
      "surface the app really paints and the contrast floor never sees — exactly how the light palette survived D13.",
  );
});

test("the count SEES `#fff` and `rgb()` outside a media query — notation is not a way out (MORDE)", () => {
  // The two mutations that scored `fail 0` before `AVISO-1` was paid, plus the case variants of
  // each. Each string below is a SECOND surface the browser would really paint.
  for (const second of ["#fff", "#FFF", "rgb(255 255 255)", "rgba(255, 255, 255, 1)", "RGB(255,255,255)"]) {
    const mutated = `@theme { --color-surface-base: ${SURFACE_BASE}; }\n.light-theme { --color-surface-base: ${second}; }`;
    assert.deepEqual(
      surfaceBaseDeclarations(mutated),
      [SURFACE_BASE, "#ffffff"],
      `a second surface written \`${second}\` outside any media query has to be COUNTED — the hex-6 pattern ` +
        "this gate first shipped with could not even see it, which is the hole `AVISO-1` named",
    );
  }
});

test("...and it CALA over ONE surface re-spelled — a gate that fires on correct CSS gets deleted", () => {
  // The other half of the pair, and the reason the fix normalizes instead of just widening the
  // regex: re-writing the SAME color in another notation is a style choice, not a second surface.
  for (const spelling of ["#131722", "#131722  ", "#131722\n", "rgb(19 23 34)", "RGB(19, 23, 34)"]) {
    assert.deepEqual(
      surfaceBaseDeclarations(`@theme { --color-surface-base: ${spelling}; }`),
      [SURFACE_BASE],
      `\`${spelling}\` is SURFACE_BASE written differently — counting it as a second surface would make this ` +
        "gate fire on correct CSS, and a gate that cries wolf is a gate someone turns off",
    );
  }
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

// ── 1b. THE CANVAS IS THE SAME SURFACE AS THE PAGE — `DR-1` ──────────────────────────────────
//
// Section 1 above proves the PAGE paints one surface and that `SURFACE_BASE` names it. That was
// never the whole chain: the series are painted on a `<canvas>`, and at `74d59a4` the canvas was
// `#FFFFFF` while this file measured `#131722` — one true statement about CSS, one true statement
// about the palette, and a screen that was wrong between them. These three assertions close the
// gap, each measuring a different link.

test("DR-1: the chart background IS the page surface — one value, not two that agree today", () => {
  const theme = chartSurfaceTheme();
  assert.equal(
    theme.backgroundColor,
    SURFACE_BASE,
    "the color handed to `createChart` and the color every series ratio is measured against have to be the SAME " +
      "value. At 74d59a4 they were #FFFFFF and #131722, the CVD delta line read 1,22:1 on screen against 14,72:1 " +
      "in this gate, and every one of the six gates of `make verify` stayed green.",
  );
  // ...and the page agrees, read from the CSS as text (the assertion of section 1, re-tied here
  // so the THREE-way identity is stated in one place: CSS == SURFACE_BASE == canvas).
  const css = cssWithoutComments(readFileSync(GLOBALS_CSS, "utf8"));
  assert.deepEqual(surfaceBaseDeclarations(css), [theme.backgroundColor]);
});

test("DR-1: the grid line is the SECOND citation of --color-surface-stripe, and it has not drifted", () => {
  // `charts` may not read the DOM (`ADR-003` FR-1), so the value is a literal here — and a
  // literal cited twice is a literal that can drift. This is the same guard `SURFACE_BASE`
  // already carries, for the same reason.
  const css = cssWithoutComments(readFileSync(GLOBALS_CSS, "utf8"));
  const declared = [...css.matchAll(/--color-surface-stripe:\s*([^;{}]+);/g)].map((match) =>
    normalizeCssColor(match[1]!),
  );
  assert.deepEqual(
    declared,
    [CHART_GRID_LINE.toLowerCase()],
    `globals.css and chart-theme.ts disagree about the grid line (${declared.join(", ") || "none"} vs ` +
      `${CHART_GRID_LINE}). The library default is #D6DCDE — a LIGHT-theme grid, and what the canvas would fall ` +
      "back to the moment this citation stops being wired.",
  );
});

test("DR-1: axis text clears WCAG 1.4.3 against the canvas it is drawn on", () => {
  // `textColor` is TEXT, so its floor is 4,5:1, not 1.4.11's 3,0:1 — and the library default is
  // `#191919`, which against `#131722` measures 1,02:1: the ruptura the review saw in the
  // canvas' own frame. Measured here rather than asserted as a hex, so a future palette move is
  // caught by arithmetic instead of by a string comparison.
  const theme = chartSurfaceTheme();
  const ratio = contrastRatio(theme.textColor, theme.backgroundColor);
  assert.ok(
    ratio >= 4.5,
    `axis/crosshair text ${theme.textColor} on ${theme.backgroundColor} is ${ratio.toFixed(2)}:1, below WCAG 1.4.3`,
  );
  assert.equal(Number(ratio.toFixed(2)), 5.82, "`[MEDIDO 2026-09-12]` provenanceWeak on the chart surface");
  // The library default, for the record and as the contrast to the number above.
  assert.equal(Number(contrastRatio("#191919", SURFACE_BASE).toFixed(2)), 1.02);
});

// ── 1c. THE NEGATIVE CONTROL THAT REPRODUCES `DR-1`, ratio for ratio ──────────────────────────

test("MORDE: a #FFFFFF canvas reproduces the DR-1 table and makes this gate REJECT the CVD delta line", () => {
  // `#FFFFFF` is not an invented poison: it is `lightweight-charts`' published default, the exact
  // background `74d59a4` shipped with, read out of the installed bundle —
  //   grep -oE 'background:\{type:"?[a-zA-Z]+"?,color:"#[0-9a-fA-F]{3,6}"\}' \
  //     frontend/node_modules/lightweight-charts/dist/lightweight-charts.production.mjs | head -1
  //   -> background:{type:"solid",color:"#FFFFFF"}
  const whiteCanvas: ChartSurfaceTheme = { ...chartSurfaceTheme(), backgroundColor: "#ffffff" };
  const tokens = colorTokens();

  // The five rows of the design review's table, `[MEDIDO 2026-09-12, n=5 papéis de cor]`. If this
  // gate had been measuring the canvas instead of the page, these are the numbers it would have
  // printed — and two of them are below the floor.
  const onWhite = Object.fromEntries(
    (Object.keys(CONTRAST_BACKDROP) as ColorRole[])
      .filter((role) => CONTRAST_BACKDROP[role].kind === "surface")
      .map((role) => [role, Number(measure(role, tokens, CONTRAST_BACKDROP[role], whiteCanvas).ratio.toFixed(2))]),
  );
  assert.deepEqual(onWhite, {
    directionUpFill: 3.57,
    directionDownFill: 3.9,
    dataBrokenInk: 1.85,
    provenanceStrong: 1.22,
    provenanceWeak: 3.08,
  });

  // And the gate BITES on it — this is the assertion that makes the fix non-falsifiable. A future
  // author who moves the chart background off the page surface does not get a green gate and a
  // wrong screen; they get these two names.
  const failures: string[] = [];
  for (const role of Object.keys(CONTRAST_BACKDROP) as ColorRole[]) {
    const { ratio, floor } = measure(role, tokens, CONTRAST_BACKDROP[role], whiteCanvas);
    if (ratio < floor) failures.push(role);
  }
  assert.deepEqual(
    failures.sort(),
    ["dataBrokenInk", "provenanceStrong"],
    "on the library's default canvas the CVD delta line (provenanceStrong, 1,22:1) and the integrity ink " +
      "(1,85:1) are below WCAG 1.4.11's 3,0:1 — the gate has to name them, not shrug",
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
