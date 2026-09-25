// `paineis-de-fluxo` `T-01.6`, gate r2 condition `C-6`: the pane separator of the ONE chart is an
// explicit, tested option — never the library default.
//
// ⚠️ CORRECTION TO THE GATE'S PREMISE, measured here instead of copied: `DESIGN-LAYOUT-ux-critique-r2.md`
// (and `tasks_review.md`) say the library default separator is `#2B2B43` (1,30:1). In the
// installed `lightweight-charts` 5.2.1 the default `layout.panes.separatorColor` is `#E0E3EB`;
// `#2B2B43` is the default PRICE-SCALE `borderColor`. The test below reads the default from the
// installed bundle, so the premise cannot drift a second time. The CONDITION survives the
// correction unchanged: without the override the separator is a light bar the design never
// chose, 5,82:1 is what it chose, and only an assertion on the built options keeps it.
//
// Run with: npm --prefix frontend run test:app

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { chartSurfaceTheme, colorTokens, contrastRatio } from "../../charts/index.ts";
import { CHART_ATTRIBUTION_TESTID, CHART_ATTRIBUTION_URL, chartConstructorOptions } from "./chart-options.ts";

/** The library's own default for `layout.panes.separatorColor`, read from the installed bundle. */
function librarySeparatorDefault(): string {
  const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const bundle = readFileSync(
    path.join(frontendRoot, "node_modules/lightweight-charts/dist/lightweight-charts.development.mjs"),
    "utf8",
  );
  const match = /panes:\s*\{\s*enableResize:\s*true,\s*separatorColor:\s*'(#[0-9A-Fa-f]{6})'/.exec(bundle);
  assert.ok(match, "the library's pane defaults block moved — re-read it before trusting this test");
  return match[1] as string;
}

test("C-6: the built options set the separator (and its hover) to the provenanceWeak token, and turn resizing off", () => {
  const options = chartConstructorOptions(1280, 910);
  const panes = options.layout?.panes;
  assert.ok(panes, "layout.panes is missing — the chart would fall back to the library default");
  assert.equal(panes.separatorColor, colorTokens().provenanceWeak);
  assert.equal(panes.separatorColor, "#8b949e");
  assert.equal(panes.separatorHoverColor, panes.separatorColor);
  assert.equal(panes.enableResize, false);
});

test("C-6: the chosen separator clears 3:1 (WCAG 1.4.11) against the chart surface", () => {
  const theme = chartSurfaceTheme();
  const ratio = contrastRatio(theme.paneSeparatorColor, theme.backgroundColor);
  assert.ok(ratio >= 3, `separator ${theme.paneSeparatorColor} is ${ratio.toFixed(2)}:1 against ${theme.backgroundColor}`);
});

test("MORDE: options WITHOUT the panes override would render the library default, which is not the token", () => {
  const built = chartConstructorOptions(1280, 910);
  const layoutWithoutPanes = { ...built.layout };
  delete layoutWithoutPanes.panes;
  const mutated = { ...built, layout: layoutWithoutPanes };
  // What the library draws when the option is absent.
  const effective = mutated.layout.panes?.separatorColor ?? librarySeparatorDefault();
  assert.notEqual(effective, colorTokens().provenanceWeak, "the mutation must change the separator colour");
  // The same equality the first test makes, run on the mutant, must fail.
  assert.throws(() => assert.equal(effective, colorTokens().provenanceWeak));
  assert.equal(librarySeparatorDefault(), "#E0E3EB");
});

// ── `T-01.11-FIX` (`SF-1`): the logo is off ONLY because the attribution moved to the footer ──────

test("SF-1: the logo is off, and the page renders the attribution link that replaces it", () => {
  assert.equal(chartConstructorOptions(1280, 910).layout?.attributionLogo, false);
  const source = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "SymbolClient.tsx"), "utf8");
  // The two go together: dropping the footer while the logo stays off reddens here.
  const footer = /<footer data-testid=\{CHART_ATTRIBUTION_TESTID\}[\s\S]*?<\/footer>/.exec(source);
  assert.ok(footer !== null, "SymbolClient.tsx renders no attribution footer — the logo cannot be off without it");
  assert.match(footer[0], /<a href=\{CHART_ATTRIBUTION_URL\}/);
  assert.equal(CHART_ATTRIBUTION_TESTID, "chart-attribution");
  assert.match(CHART_ATTRIBUTION_URL, /^https:\/\/www\.tradingview\.com\//);
});
