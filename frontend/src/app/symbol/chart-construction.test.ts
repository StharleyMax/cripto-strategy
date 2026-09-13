/**
 * `DR-1` (BLOCKER) of `docs/context/cinco-metricas-do-core/gates/design-review-painel-cvd.md`:
 * the `<canvas>` was white inside a `#131722` page, and the contrast gate measured against a
 * surface nothing was painted on. **This file is the half of the fix that is not the fix.**
 *
 * PASSING `layout` TO `createChart` REPAIRS THE PANE THAT EXISTS TODAY. It does nothing about
 * the pane written next month, and the review said so in as many words: "o portão tem de deixar
 * de ser falsificável assim … enquanto forem duas verdades separadas, o portão volta a mentir".
 * The repository has the receipt for what happens otherwise — `color-tokens.ts`'s module
 * docstring records the OI line drawn `#131722` on `#131722` (`1,00:1`, invisible, LIVE) and
 * records that `D13` refused alternative `A` ("trocar `light`->`dark` nos 4 sítios") BY NAME
 * because a fix applied at the call sites "leaves the trap armed". `DR-1` is that same trap,
 * sprung from the other side.
 *
 * THE RULE THIS FILE ENFORCES, in one sentence: **every `createChart(` under `frontend/src`
 * takes its options from `chartConstructorOptions()`.** That is what makes the chain
 * `chartSurfaceTheme()` → `chartConstructorOptions()` → `createChart` unbreakable-in-silence,
 * and therefore what makes `color-contrast.test.ts`'s backdrop the backdrop that is really
 * painted. A call site that spells its own options object — even a CORRECT one, even with the
 * right hex in it — is rejected: the point is not that today's literal is right, it is that the
 * canvas' color and the gate's reference cannot be two independent statements.
 *
 * ⛔ WHAT IT DOES NOT DO: no allowlist, no skip list, no "except this file". If a legitimate
 * call site ever needs different options, it changes `chartConstructorOptions` or adds a
 * parameter to it — both of which keep the single reference intact. "Entrada de allowlist é
 * indistinguível de bypass" (`CLAUDE.md`).
 *
 * WHY A SOURCE SCAN: verbatim the reason `cvd-pane-dom-contract.test.ts` gives — this repo has
 * no component renderer in any suite, and `SymbolClient.tsx` imports `lightweight-charts`, which
 * wants a DOM. A source scan proves what is WRITTEN. What was PAINTED is proven by
 * `e2e/11-canvas-fundo.spec.ts`, which reads the pixels of the real canvas in a real browser.
 * Three instruments, three different things measured; none of them is the other's substitute.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chartSurfaceTheme } from "../../charts/index.ts";

import { chartConstructorOptions } from "./chart-options.ts";

/** This test file names `createChart(` in prose and in its own negative controls; scanning itself
 * would make the gate fire on its own explanation — the false positive that gets a real gate
 * disabled (same reason `color-contrast.test.ts` strips CSS comments before counting). */
const THIS_FILE = fileURLToPath(import.meta.url);
const HERE = path.dirname(THIS_FILE);
const SRC_ROOT = path.resolve(HERE, "../..");

/** The named builder every call site must take its options from. Spelled out as a literal rather
 * than imported: a guard built from the symbol it guards renames itself along with the mutation
 * it is supposed to catch (same duplication-on-purpose rule the DOM-contract tests declare). */
const REQUIRED_OPTIONS_BUILDER = "chartConstructorOptions(";
const CHART_FACTORY = "createChart(";

/** Every `.ts`/`.tsx` under `frontend/src`. The universe is the whole tree ON PURPOSE — a pane
 * added in a directory that does not exist yet is exactly the case this file is for. */
function sourceFiles(dir: string): readonly string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) found.push(full);
  }
  return found;
}

/**
 * `source` with its comments blanked out, line numbering preserved (a block comment becomes the
 * same number of newlines).
 *
 * NEEDED, not cosmetic: `chart-theme.ts` and this file both DISCUSS `createChart(` in prose, and
 * prose does not balance its parentheses — the first version of this gate threw
 * "unbalanced parentheses" on a perfectly correct tree. A gate that fires on its own explanation
 * is a gate someone deletes (the same argument `color-contrast.test.ts` gives for stripping CSS
 * comments before counting declarations). Crude on purpose, and the same crudeness
 * `cvd-pane-dom-contract.test.ts` already declares for `pageCode`: a `//` inside a string literal
 * would be mis-stripped. That can only make this scan see FEWER characters, never invent a
 * `createChart(` that is not there, so the failure direction is a missed offender — and the e2e
 * pixel check is the instrument that does not care what the source looks like at all.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => "\n".repeat((block.match(/\n/g) ?? []).length))
    .replace(/^\s*\/\/.*$/gm, "");
}

/**
 * The argument list of the call that starts at `openParenIndex`, read by BALANCING parentheses
 * rather than by a regex. A regex stops at the first `)`, which in
 * `createChart(el, chartConstructorOptions(w, h))` is the INNER one — it would read the options
 * as `chartConstructorOptions(w` and still match, but it would read a nested inline object
 * wrongly too, and a rule that is right by accident is not a rule.
 */
function callArguments(source: string, openParenIndex: number): string {
  let depth = 0;
  for (let i = openParenIndex; i < source.length; i += 1) {
    if (source[i] === "(") depth += 1;
    else if (source[i] === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(openParenIndex + 1, i);
    }
  }
  throw new Error(`unbalanced parentheses after index ${openParenIndex} — cannot read the createChart call`);
}

/**
 * The keys `chartConstructorOptions` itself writes, READ OFF THE BUILDER at runtime rather than
 * typed out here — `["width", "height", "layout", "grid", "timeScale"]` today.
 *
 * ⛔ `DR-11`: THIS IS THE DOOR THE FIRST VERSION OF THIS GATE LEFT OPEN, and the design review
 * walked through it. The rule was "the arguments mention `chartConstructorOptions(`", and
 * `{ ...chartConstructorOptions(600, 220), layout: { background: … "#FFFFFF" } }` mentions it —
 * so the reviewer replanted `DR-1` WHOLE, in a real file, and BOTH source gates stayed green
 * (`color-contrast.test.ts` pass 16 · fail 0, `chart-construction.test.ts` pass 7 · fail 0)
 * `[MEASURED 2026-09-12 by the reviewer, n=1 planted site]`. The spread is not a hypothetical
 * shape either: it is the exact form the `DR-4` fix (`autoSize`) tends to use, and this file's
 * own CALA test sanctions it.
 *
 * DERIVED, NOT LISTED, because a list is a second statement about what the builder owns and this
 * whole file exists because two statements about one thing drift. Add a key to
 * `chartConstructorOptions` and it becomes un-overridable at the call site on the same commit.
 */
const BUILDER_OWNED_KEYS: readonly string[] = Object.keys(chartConstructorOptions(1, 1));

/**
 * `args` with every `chartConstructorOptions(…)` call — parentheses and all — cut out, so what
 * remains is only what the CALL SITE itself spelled.
 *
 * Needed because the builder's own arguments legitimately contain identifiers
 * (`chartConstructorOptions(measureWidth(container), CHART_HEIGHT_PX)`), and a scan for
 * `width:`/`height:` over the whole argument list could not tell the builder's input from a
 * call-site override of the builder's output.
 */
function withoutBuilderCalls(args: string): string {
  let remaining = args;
  for (;;) {
    const at = remaining.indexOf(REQUIRED_OPTIONS_BUILDER);
    if (at === -1) return remaining;
    const openParen = at + REQUIRED_OPTIONS_BUILDER.length - 1;
    const inner = callArguments(remaining, openParen);
    remaining =
      remaining.slice(0, at) + remaining.slice(openParen + 1 + inner.length + 1);
  }
}

/**
 * Every `createChart(` in `source` that does not take its options from the named builder — either
 * because it never mentions the builder at all, or because it spreads the builder and then
 * OVERRIDES one of the keys the builder owns. Reported as `line: text`. Pure over a string so the
 * negative controls below can feed it the real `74d59a4` defect, and the reviewer's `DR-11`
 * bypass, instead of a paraphrase of either.
 */
export function bareCreateChartCalls(
  source: string,
  ownedKeys: readonly string[] = BUILDER_OWNED_KEYS,
): readonly string[] {
  const violations: string[] = [];
  const overrides = new RegExp(`(^|[^.\\w])(${ownedKeys.join("|")})\\s*:`);
  let cursor = 0;
  for (;;) {
    const at = source.indexOf(CHART_FACTORY, cursor);
    if (at === -1) return violations;
    const openParen = at + CHART_FACTORY.length - 1;
    const args = callArguments(source, openParen);
    const report = (): void => {
      const line = source.slice(0, at).split("\n").length;
      violations.push(`line ${line}: createChart(${args.replace(/\s+/g, " ").trim()})`);
    };
    if (!args.includes(REQUIRED_OPTIONS_BUILDER)) report();
    else if (overrides.test(withoutBuilderCalls(args))) report();
    cursor = at + CHART_FACTORY.length;
  }
}

// ── THE GATE ─────────────────────────────────────────────────────────────────────────────────
//
// THE UNIVERSE IS THE WHOLE TREE, AND IT IS SPLIT BY A PROPERTY OF THE CODE, NOT BY A LIST OF
// PATHS. `frontend/src` holds `createChart` call sites of two kinds, and the difference between
// them is not a matter of taste:
//
//   - MOUNTING call sites (`app/`, `features/`) put a canvas in front of an operator. They owe
//     the theme, and they can pay: `web` may import the sanctioned `charts` barrel.
//   - HEADLESS call sites bootstrap their own `jsdom` and measure coordinates off a canvas that
//     no one ever looks at (`headless-chart.ts`, `s2-headless-run.ts` — the axis-fidelity
//     harnesses). They live in `charts`, which `ADR-003`/`D5.12` forbids from importing `web` at
//     all, so they structurally CANNOT reach `chartConstructorOptions` — and a background nobody
//     sees has no contrast obligation to anybody.
//
// ⛔ THE SECOND ASSERTION IS NOT AN EXEMPTION, IT IS THE EROSION DETECTOR. It does not say "skip
// `charts/`" — it says every `createChart` outside the mounting half has to be in a file that
// really does bootstrap `jsdom`. The day somebody mounts a browser chart from `charts/` (or drops
// the jsdom bootstrap from a harness and points it at a real DOM), that call site is in neither
// branch and this gate names it. A path allowlist would have been silent about exactly that move,
// and "entrada de allowlist é indistinguível de bypass" (`CLAUDE.md`).

const MOUNTING_PREFIXES = ["app", "features"] as const;
const HEADLESS_BOOTSTRAP = 'from "jsdom"';

interface CallSite {
  readonly relativePath: string;
  readonly mounting: boolean;
  readonly headless: boolean;
  readonly violations: readonly string[];
}

function callSites(): readonly CallSite[] {
  const sites: CallSite[] = [];
  for (const file of sourceFiles(SRC_ROOT)) {
    if (file === THIS_FILE) continue;
    const source = codeOnly(readFileSync(file, "utf8"));
    if (!source.includes(CHART_FACTORY)) continue;
    const relativePath = path.relative(SRC_ROOT, file);
    sites.push({
      relativePath,
      mounting: MOUNTING_PREFIXES.some((prefix) => relativePath.startsWith(`${prefix}${path.sep}`)),
      headless: source.includes(HEADLESS_BOOTSTRAP),
      violations: bareCreateChartCalls(source),
    });
  }
  return sites;
}

test("DR-1: every createChart that MOUNTS a chart takes its options from chartConstructorOptions()", () => {
  const mounting = callSites().filter((site) => site.mounting);
  assert.ok(
    mounting.length > 0,
    "no mounting createChart call site was found at all — this gate would then be vacuously green, which is the " +
      "exact shape of nothing (`ADR-012`'s rc=0 that cannot distinguish). Re-anchor it, do not delete it.",
  );
  const offenders = mounting.flatMap((site) => site.violations.map((v) => `${site.relativePath} ${v}`));
  assert.deepEqual(
    offenders,
    [],
    "these call sites build their own chart options, so the canvas' background and the color " +
      "`color-contrast.test.ts` measures against are two independent statements again — which is precisely how " +
      `DR-1 shipped:\n  ${offenders.join("\n  ")}`,
  );
});

test("DR-1: every createChart OUTSIDE the mounting half really is headless — the erosion detector", () => {
  const outside = callSites().filter((site) => !site.mounting);
  assert.ok(
    outside.length > 0,
    "the headless branch found nothing to measure — if the axis-fidelity harnesses moved, re-anchor this, because " +
      "a branch that never matches cannot detect the day something DOES land there",
  );
  const notHeadless = outside.filter((site) => !site.headless).map((site) => site.relativePath);
  assert.deepEqual(
    notHeadless,
    [],
    "a createChart outside `app/`/`features/` that does NOT bootstrap jsdom is a chart headed for a real browser " +
      "from a module that `ADR-003`/`D5.12` forbids from importing `web` — so it can never reach the theme, and " +
      `its background is whatever the library defaults to (#FFFFFF):\n  ${notHeadless.join("\n  ")}`,
  );
});

/**
 * `DR-11`, the OTHER half: the link `chartSurfaceTheme() -> chartConstructorOptions()` was
 * asserted by `assert.match` over the TEXT of `chart-options.ts`, while three docstrings
 * (`chart-theme.ts`, `color-contrast.test.ts`, this file) said the gate measured "the value
 * `createChart` receives". The reviewer deleted the whole `layout` block and showed what the
 * failure actually reads:
 *
 *     The input did not match the regular expression /background: \{ type: ColorType\.Solid, … \}/
 *
 * — no `Received: "#ffffff"` anywhere in it, because no value was ever computed
 * `[MEASURED 2026-09-12 by the reviewer, n=1 mutant]`. An instrument that declares it measures X
 * and measures Y is the very class of defect that produced `DR-1`. So the value is BUILT here and
 * compared, and the regex over the source is gone: it cannot be a weaker statement of the same
 * thing, because a weaker statement is what got believed.
 */
test("DR-11: the options handed to createChart carry chartSurfaceTheme's VALUES, built and compared", () => {
  const built = chartConstructorOptions(1, 1);
  const theme = chartSurfaceTheme();

  const background = built.layout?.background;
  assert.ok(
    background !== undefined && "color" in background,
    "chartConstructorOptions() returned no `layout.background` at all — which is exactly `DR-1` as it shipped: " +
      "`createChart` then keeps the library default #FFFFFF, inside a #131722 page.",
  );
  assert.equal(
    background.color,
    theme.backgroundColor,
    "the color the canvas is cleared to and the color `color-contrast.test.ts` measures every series ratio " +
      "against have to be ONE value read twice, never two that agree today",
  );
  assert.equal(built.layout?.textColor, theme.textColor);
  assert.equal(built.grid?.vertLines?.color, theme.gridLineColor);
  assert.equal(built.grid?.horzLines?.color, theme.gridLineColor);
});

test("DR-1: chart-options.ts derives the background from chartSurfaceTheme, never from a literal", () => {
  const source = readFileSync(path.join(HERE, "chart-options.ts"), "utf8");
  assert.match(
    source,
    /const theme = chartSurfaceTheme\(\);/,
    "the options builder must READ the theme `charts` owns — a hex typed here would be a third citation of the " +
      "surface, and three citations of one color is two chances to drift",
  );
  // No bare hex anywhere in the builder. `#FFFFFF` arriving here as a "temporary" value is the
  // defect itself, and a hex that happens to be right today is still a second source of truth.
  // This one STAYS a source scan on purpose: it is a statement about PROVENANCE ("no literal was
  // typed"), which no built value can answer — a hex copied from the theme builds identical.
  const hexes = source.replace(/\/\*[\s\S]*?\*\//g, "").match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
  assert.deepEqual(hexes, [], `chart-options.ts spells raw colors: ${hexes.join(", ")}`);
});

// ── MORDE: the defect exactly as it shipped ──────────────────────────────────────────────────

test("MORDE: the 74d59a4 call — width/height/timeScale and no layout — is REJECTED", () => {
  // Copied character for character from `SymbolClient.tsx:178-182` at `74d59a4`, the code the
  // design review measured at 1,22:1 on screen.
  const shipped = `    const chart = createChart(container, {
      width: container.clientWidth || 600,
      height: 220,
      timeScale: { timeVisible: true, secondsVisible: false },
    });`;
  const violations = bareCreateChartCalls(shipped);
  assert.equal(violations.length, 1, "the defect as shipped has to be caught, once");
  assert.match(violations[0]!, /createChart\(container, \{ width/);
});

test("MORDE: a call with CORRECT inline options is rejected too — provenance, not hue", () => {
  // This one would LOOK right on screen today. It is still a violation: the hex below and the one
  // `color-contrast.test.ts` measures against are two independent statements, and the whole
  // lesson of DR-1 is that two statements about one color eventually disagree with nobody
  // noticing. A gate that accepted this would be a gate about today's pixel, not about the
  // reference.
  const plausible = `createChart(el, { layout: { background: { type: ColorType.Solid, color: "#131722" } } });`;
  assert.equal(bareCreateChartCalls(plausible).length, 1);
});

test("MORDE: the barest form — no options at all — is rejected", () => {
  assert.equal(bareCreateChartCalls("const c = createChart(container);").length, 1);
  // ...and two offenders in one file are both reported, with their line numbers, rather than the
  // first one masking the second.
  const two = "createChart(a);\n\n\ncreateChart(b, {});";
  const violations = bareCreateChartCalls(two);
  assert.equal(violations.length, 2);
  assert.match(violations[0]!, /^line 1:/);
  assert.match(violations[1]!, /^line 4:/);
});

// ── CALA: correct code must not fire, in any of the shapes a builder may legitimately write ──

test("MORDE DR-11: the spread that re-plants #FFFFFF over the builder is REJECTED", () => {
  // Character for character the site the design reviewer planted in `probe-pane.tsx` at
  // `c7e17fc` — it mentions `chartConstructorOptions(`, so the first version of this gate passed
  // it (pass 7 · fail 0) with the whole of `DR-1` back on the screen.
  const bypass = `createChart(container, {
  ...chartConstructorOptions(600, 220),
  layout: { background: { type: "solid", color: "#FFFFFF" }, textColor: "#191919" },
});`;
  const violations = bareCreateChartCalls(bypass);
  assert.equal(violations.length, 1, "the DR-11 bypass has to be caught, once");
  assert.match(violations[0]!, /^line 1:/);

  // ...and it is not about the hue: a spread that re-spells `layout` with the RIGHT color is
  // rejected too, for the same reason the inline-correct-options MORDE above is.
  assert.equal(
    bareCreateChartCalls(`createChart(el, { ...chartConstructorOptions(1, 1), layout: { textColor: theme.textColor } });`).length,
    1,
  );
  // Every key the builder owns, not just `layout` — `grid` and `timeScale` are theme too, and
  // `width`/`height` are the builder's own arguments, so re-setting them at the call site means
  // the number the caller measured and the number the chart got are two statements again.
  for (const key of BUILDER_OWNED_KEYS) {
    assert.equal(
      bareCreateChartCalls(`createChart(el, { ...chartConstructorOptions(1, 1), ${key}: x });`).length,
      1,
      `overriding the builder-owned key \`${key}\` at the call site is not caught`,
    );
  }
  // The derived list is the builder's, not a copy of it — if `chartConstructorOptions` ever stops
  // writing `layout`, this gate must not keep protecting a key nobody sets (that is a green that
  // means nothing, `ADR-012`'s rc=0).
  assert.ok(BUILDER_OWNED_KEYS.includes("layout"), "the builder no longer writes `layout` — re-anchor DR-11");
});

test("CALA: the sanctioned call passes, and so do its legitimate variants", () => {
  assert.deepEqual(
    bareCreateChartCalls("createChart(container, chartConstructorOptions(container.clientWidth || 600, CHART_HEIGHT_PX));"),
    [],
  );
  // Multi-line, nested parens in the arguments, and a spread on top of the builder — none of
  // these is the defect, and a gate that cried wolf over them is a gate someone turns off.
  const variants = [
    "const chart = createChart(\n  container,\n  chartConstructorOptions(measureWidth(container), 320),\n);",
    "createChart(container, { ...chartConstructorOptions(600, 220), autoSize: true });",
  ];
  for (const variant of variants) {
    assert.deepEqual(bareCreateChartCalls(variant), [], `false positive on a legitimate call:\n${variant}`);
  }
});
