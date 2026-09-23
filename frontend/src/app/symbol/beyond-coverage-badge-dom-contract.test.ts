/**
 * `T-05.6` (`D-C3.6`, plan `05_historia_sob_demanda.md` item `5.5`) — the DOM CONTRACT of the
 * ASYMMETRIC WALL badge. Sibling of `oi-pane-dom-contract.test.ts`/
 * `long-short-pane-dom-contract.test.ts`: those two files guard the panels' PRE-EXISTING
 * contracts; this file guards the new one this task adds on top of them.
 *
 * The plan's DoD (item 2): dragging past the shallower series' own declared floor, the price
 * panel keeps drawing bars while OI and long/short show the NAMED state — "os dois fatos no
 * MESMO assert, n=2 painéis. Morde se o painel apenas esvaziar em silêncio." `slot-coverage.test.ts`
 * already proves the DECISION function (`panelWallState`) pure, against literal fixtures, with its
 * own asymmetric-wall fixture (OI/long-short walled, price still covered, same shared window).
 * What THIS file proves is the RENDER SIDE: that the decision actually reaches exactly two panels,
 * as one machine-readable badge each, under a REAL structural exclusion for price — not merely an
 * untested absence.
 *
 * SOURCE SCAN, NOT A RENDER — the same reason every other `*-dom-contract.test.ts` in this
 * directory gives: no component renderer in this suite (`@testing-library` is not installed), and
 * `SymbolClient.tsx` imports `lightweight-charts`, which wants a DOM. The full drag-and-look proof
 * (three drags + ablation against a live page) is `T-05.8`, explicitly out of THIS task's scope
 * (`handoff/T-05.6.md`) — this file is the component + contract half only.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(HERE, "SymbolClient.tsx"), "utf8");

const BADGE_DECLARATION = /function BeyondCoverageBadge\(\{ factKey \}: \{ readonly factKey: string \}\) \{/;
const BADGE_FACT = /data-fact=\{`\$\{factKey\}:beyond`\}/;
/** The MACHINE key and the pt-BR MICROCOPY, as two DIFFERENT strings — same `T-04.3`/`CST-230`
 * discipline `data-fact-ascii-key-contract.test.ts` already guards for the whole page: `factKey`
 * is ASCII and never built from the word beside it. */
const BADGE_MICROCOPY = /LIMITE DA COBERTURA — sem histórico disponível além deste ponto\./;
/** Every `<BeyondCoverageBadge .../>` call site in the file — the universe this file's central
 * assert counts, so a THIRD panel gaining one (or price gaining one) moves this list and fails
 * loudly rather than passing by accident. */
const BADGE_CALL_SITE = /<BeyondCoverageBadge factKey="[a-z_]+" \/>/g;
const OI_BADGE_GUARDED =
  /\{wallState === "beyond-coverage" \? <BeyondCoverageBadge factKey="oi_coverage" \/> : null\}/;
const LONG_SHORT_BADGE_GUARDED =
  /\{wallState === "beyond-coverage" \? <BeyondCoverageBadge factKey="long_short_coverage" \/> : null\}/;
const OI_WALL_STATE_PROP_DECLARED = /readonly wallState: SlotCoverageState;/g;
const OI_WALL_STATE_COMPUTED = /const oiWallState = panelWallState\(pager\.window, pager\.panelCoverage\.oi\);/;
const LONG_SHORT_WALL_STATE_COMPUTED =
  /const longShortWallState = panelWallState\(pager\.window, pager\.panelCoverage\.longShort\);/;
const OI_PANE_RENDER_SITE =
  /<OiPane panels=\{panels\} status=\{panelStatus\.oi\} oi=\{oi\} wallState=\{oiWallState\} \/>/;
const LONG_SHORT_PANE_RENDER_SITE =
  /<LongShortPane longShort=\{longShort\} status=\{panelStatus\.longShort\} symbol=\{symbol\} wallState=\{longShortWallState\} \/>/;
/** `PricePane`'s OWN prop signature, unchanged by this task — no `wallState` field anywhere in
 * it. Written out in full (rather than "PricePane does not contain the word wallState") because
 * that weaker check could not tell "never had it" apart from "removed and forgot to re-add",
 * which is exactly the class of regression `T-05.6`'s own DoD item 2 exists to catch. */
const PRICE_PANE_SIGNATURE_HAS_NO_WALL_STATE =
  /function PricePane\(\{\s*panels,\s*priceCandles,\s*status,\s*volume,\s*volumeStatus,\s*\}: \{\s*readonly panels: S2Panels;\s*readonly priceCandles: PriceCandleData;\s*readonly status: PanelStatus;\s*readonly volume: VolumeSubAxisData;\s*readonly volumeStatus: PanelStatus;\s*\}\) \{/;

test("T-05.6 contract: the badge component exists, glyph-word-colour, and publishes ONE ASCII machine key", () => {
  assert.match(source, BADGE_DECLARATION, "BeyondCoverageBadge must be declared — the anchor moved, fix this test");
  assert.match(source, BADGE_FACT, "the machine key must be `${factKey}:beyond`, derived from the PROP, not a literal");
  assert.match(source, BADGE_MICROCOPY, "the pt-BR sentence must be rendered — form is the ui-designer's, but it must exist");
  // The word and the key are DIFFERENT expressions — the key never interpolates the sentence.
  assert.doesNotMatch(
    source,
    /data-fact=\{`\$\{factKey\}:beyond`\}[^\n]*LIMITE DA COBERTURA/,
    "the machine key and the microcopy must not be the same expression",
  );
  // Reuses the SAME glyph every other "integridade do dado" mark on this screen uses — no
  // fourth SVG for a fourth flavour of the same signal.
  assert.match(
    source,
    /function BeyondCoverageBadge\(\{ factKey \}: \{ readonly factKey: string \}\) \{\s*\n\s*return \(\s*\n\s*<p\s*\n\s*data-fact=\{`\$\{factKey\}:beyond`\}[\s\S]{0,200}<PartialCoverageGlyph \/>/,
    "the badge must reuse PartialCoverageGlyph, not declare a new mark for the same role",
  );
});

test("T-05.6 DoD item 2: EXACTLY the two panels the plan names — OI and long/short — carry the badge, in ONE assert", () => {
  const callSites = (source.match(BADGE_CALL_SITE) ?? []).slice().sort();
  assert.deepEqual(
    callSites,
    ['<BeyondCoverageBadge factKey="long_short_coverage" />', '<BeyondCoverageBadge factKey="oi_coverage" />'],
    "the universe of panels wired to the wall badge moved — either a panel lost it (silent " +
      "esvaziar, the DoD's own falsifier) or a THIRD panel (price?) gained one it should not have",
  );
});

test("T-05.6: both badges are GUARDED on the strict 'beyond-coverage' verdict, never a looser check", () => {
  assert.match(source, OI_BADGE_GUARDED, "OI's badge must be rendered ONLY for the beyond-coverage verdict");
  assert.match(source, LONG_SHORT_BADGE_GUARDED, "long/short's badge must be rendered ONLY for the beyond-coverage verdict");
  // A guard written as `wallState !== "absent"` would ALSO fire for "not-loaded" — the exact
  // regression `T-05.7` already fixed one layer down (stop paging silently once not-loaded, never
  // announce it). This file's own falsifier for THIS layer: no negated-inequality guard exists.
  assert.doesNotMatch(source, /wallState !== "absent"/, "the badge must not fire on every non-absent state");
  assert.doesNotMatch(source, /wallState !== "not-loaded"/, "the badge must not fire on every non-not-loaded state");
});

test("T-05.6: exactly ONE badge declared per panel's props/wiring — SlotCoverageState prop, computed once, threaded once", () => {
  const wallStateProps = source.match(OI_WALL_STATE_PROP_DECLARED) ?? [];
  assert.equal(wallStateProps.length, 2, "exactly two panes (OI, long/short) declare a `wallState: SlotCoverageState` prop");
  assert.match(source, OI_WALL_STATE_COMPUTED, "SymbolClient must compute the OI verdict via panelWallState, not re-derive it");
  assert.match(
    source,
    LONG_SHORT_WALL_STATE_COMPUTED,
    "SymbolClient must compute the long/short verdict via panelWallState, not re-derive it",
  );
  assert.match(source, OI_PANE_RENDER_SITE, "OiPane must actually receive the computed wallState — declaring it is not enough");
  assert.match(
    source,
    LONG_SHORT_PANE_RENDER_SITE,
    "LongShortPane must actually receive the computed wallState — declaring it is not enough",
  );
});

test("T-05.6 DoD item 2: price is structurally excluded — its own prop signature carries no wallState, ever", () => {
  assert.match(
    source,
    PRICE_PANE_SIGNATURE_HAS_NO_WALL_STATE,
    "PricePane's signature moved — re-anchor this test, but re-confirm it still has no wallState field",
  );
});

// ── MORDE (DoD item 3's own ablation, at the source level — the browser half is `T-05.8`) ───────
// "Morde se o painel apenas esvaziar em silêncio": replant the exact regression — the badge
// silently stops rendering — and prove THIS file's own asserts catch it, before/after.

test("MORDE: removing OI's guarded render is caught — the panel would esvaziar em silêncio", () => {
  const before = source.match(BADGE_CALL_SITE) ?? [];
  assert.equal(before.length, 2, "sanity: baseline has both badges before the ablation");
  const mutated = source.replace(OI_BADGE_GUARDED, "");
  assert.notEqual(mutated, source, "the OI guard found no anchor to remove — update this test, do not delete it");
  const after = mutated.match(BADGE_CALL_SITE) ?? [];
  assert.equal(after.length, 1, "removing OI's render must drop the universe from 2 call sites to 1");
  assert.deepEqual(after, ['<BeyondCoverageBadge factKey="long_short_coverage" />'], "only long/short's badge should survive");
});

test("MORDE: removing long/short's guarded render is caught — the panel would esvaziar em silêncio", () => {
  const mutated = source.replace(LONG_SHORT_BADGE_GUARDED, "");
  assert.notEqual(mutated, source, "the long/short guard found no anchor to remove — update this test, do not delete it");
  const after = mutated.match(BADGE_CALL_SITE) ?? [];
  assert.equal(after.length, 1, "removing long/short's render must drop the universe from 2 call sites to 1");
  assert.deepEqual(after, ['<BeyondCoverageBadge factKey="oi_coverage" />'], "only OI's badge should survive");
});

test("MORDE: a THIRD panel quietly gaining the badge (e.g. price) is caught by the same assert", () => {
  // Simulates the inverse regression: price wired up to a badge it should never receive — the
  // universe assert above must notice a THIRD call site appearing, not just the two it expects.
  const anchor = '<section aria-label="Preço" data-testid={PRICE_PANE_TESTID} data-price-candles={priceCandles.drawnCandles}>';
  assert.ok(source.includes(anchor), "the PricePane section anchor moved — update this test, do not delete it");
  const mutated = source.replace(anchor, `${anchor}\n      <BeyondCoverageBadge factKey="price_coverage" />`);
  assert.notEqual(mutated, source, "the PricePane anchor found no match — update this test, do not delete it");
  const after = (mutated.match(BADGE_CALL_SITE) ?? []).slice().sort();
  assert.notDeepEqual(
    after,
    ['<BeyondCoverageBadge factKey="long_short_coverage" />', '<BeyondCoverageBadge factKey="oi_coverage" />'],
    "the universe assert did NOT notice a third panel gaining the badge — it is vacuous",
  );
  assert.equal(after.length, 3, "sanity: the mutation actually added a third call site");
});

// ── CALA: form (glyph placement, wording, order relative to siblings) is the ui-designer's ─────

test("CALA: rewording the badge's pt-BR sentence leaves every data-fact/structural assert intact", () => {
  const reworded = source.replace(
    "LIMITE DA COBERTURA — sem histórico disponível além deste ponto.",
    "FIM DO HISTÓRICO — a fonte não tem dado antes deste ponto.",
  );
  assert.notEqual(reworded, source, "the microcopy anchor moved — re-anchor this CALA rather than dropping it");
  assert.match(reworded, BADGE_FACT, "the machine key must survive a pure reword");
  assert.match(reworded, OI_BADGE_GUARDED);
  assert.match(reworded, LONG_SHORT_BADGE_GUARDED);
  const callSites = (reworded.match(BADGE_CALL_SITE) ?? []).slice().sort();
  assert.deepEqual(callSites, ['<BeyondCoverageBadge factKey="long_short_coverage" />', '<BeyondCoverageBadge factKey="oi_coverage" />']);
});
