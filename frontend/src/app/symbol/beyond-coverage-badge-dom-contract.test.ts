/**
 * `T-05.6` (`D-C3.6`, plan `05_historia_sob_demanda.md` item `5.5`) — the DOM CONTRACT of the
 * ASYMMETRIC WALL badge, `chart/marks/BeyondCoverageBadge.tsx`, RENDERED.
 *
 * `estrutura-do-front` `T-10.11` — this file stopped reading the source. It renders the component with
 * literal props (`../component-render.ts`, the pattern of `gates/T-10.11-padrao.md`) and asserts what
 * the DOM carries: the machine key `data-fact="<factKey>:beyond"`, the pt-BR sentence, and the shared
 * glyph. The source-scan regexes and the in-memory MORDE that defended them are gone with it (DoD 3):
 * they measured the regex, not the component, and fired on refactors with no effect (R01–R03,
 * `gates/T-10.8-build.md` §5).
 *
 * ⚠️ WHERE THE WIRING IN `SymbolClient` IS PROVEN — and where it is NOT (DoD 2):
 * - "price NEVER gets the badge": `price-pane-dom-contract.test.ts`, by rendering `PricePane`.
 * - "OI and long/short show the badge, guarded on the strict `beyond-coverage` verdict":
 *   `wall-badge-pane-render.test.ts`, by rendering `OiPane`/`LongShortPane` (wave-2 QA `W-1`).
 * - "each pane is fed the verdict of ITS OWN series by `panelWallState`":
 *   `wall-state-call-site.test.ts`, by AST over `SymbolClient`'s call site (no pane render reaches it).
 *   `e2e/21-arrasto-historia-parede-e-ablacao.spec.ts` still proves the whole chain on screen, but only
 *   when the series-window reader is present — in `make verify` it is not (`gates/T-10.11-build.md` §4).
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, render } from "../component-render.ts";

const { BeyondCoverageBadge } = await import("./chart/marks/BeyondCoverageBadge.tsx");
const { PartialCoverageGlyph } = await import("./chart/marks/PartialCoverageMark.tsx");

/** The predicate under test — read by the positive render AND by the prop-mutated control. */
function badgeFactOf(container: HTMLElement): string | null {
  return container.querySelector("p[data-fact]")?.getAttribute("data-fact") ?? null;
}

const BADGE_MICROCOPY = "LIMITE DA COBERTURA — sem histórico disponível além deste ponto.";

test("T-05.6 contract: the badge publishes data-fact `<factKey>:beyond` and the pt-BR sentence", async () => {
  const rendered = await render(createElement(BeyondCoverageBadge, { factKey: "oi_coverage" }));
  assert.equal(badgeFactOf(rendered.container), "oi_coverage:beyond");
  assert.equal(rendered.container.textContent?.trim(), BADGE_MICROCOPY, "the sentence must be rendered, whole");
  rendered.unmount();
});

test("negative control by PROP mutation: the machine key TRACKS factKey, never a constant", async () => {
  const rendered = await render(createElement(BeyondCoverageBadge, { factKey: "long_short_coverage" }));
  // Equal to the MUTATED value, not merely different: a removed attribute is also different, and
  // a component that ignored the prop and wrote one key for both panes would pass "different".
  assert.equal(badgeFactOf(rendered.container), "long_short_coverage:beyond");
  assert.throws(() => assert.equal(badgeFactOf(rendered.container), "oi_coverage:beyond"));
  rendered.unmount();
});

test("the machine key is ASCII and never built from the sentence beside it (T-04.3 / CST-230)", async () => {
  const rendered = await render(createElement(BeyondCoverageBadge, { factKey: "oi_coverage" }));
  const fact = badgeFactOf(rendered.container);
  assert.ok(fact !== null, "the badge rendered no data-fact — the anchor every assert here reads");
  assert.ok(/^[\x20-\x7E]+$/.test(fact), `a machine key an operator's grep cannot type: ${fact}`);
  assert.doesNotMatch(fact, /LIMITE|COBERTURA/, "the key must not interpolate the microcopy");
  rendered.unmount();
});

test("the badge reuses PartialCoverageGlyph — the screen's ONE integrity glyph, not a fourth SVG", async () => {
  const badge = await render(createElement(BeyondCoverageBadge, { factKey: "oi_coverage" }));
  const glyph = await render(createElement(PartialCoverageGlyph));
  const badgeSvg = badge.container.querySelector("p[data-fact] > svg");
  const glyphSvg = glyph.container.querySelector("svg");
  assert.ok(badgeSvg !== null && glyphSvg !== null, "both renders must carry an <svg>");
  assert.equal(badgeSvg.outerHTML, glyphSvg.outerHTML, "the badge's glyph must be PartialCoverageGlyph's markup");
  // Glyph before the word: the order of the three channels the screen already teaches.
  assert.equal(badge.container.querySelector("p[data-fact]")?.firstElementChild, badgeSvg);
  badge.unmount();
  glyph.unmount();
});
