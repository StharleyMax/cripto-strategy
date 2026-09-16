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

// ── C4: the readable horizon is DECLARED on screen, not left to look like a dead market ──────
//
// `[MEDIDO 2026-09-11, ACHADO-BACKFILL-INVISIVEL-AO-AS-OF.md]`: only `769/5.761` grades of the
// derived window carry a value, and the first sits at index `4.971` — the leftmost 86% of the
// chart is structurally empty because `R-1` correctly refuses backfilled rows at their own grid
// instant. That absence is REAL, so the chart does not lie; but "sabíamos nada ainda" and "o
// mercado não teve dado" look identical to an operator, and telling two kinds of absence apart
// is what `RN-1` is for. So the number is printed (`quant-architect`, wave `03`, C4).

test("C4: the screen declares the readable horizon — first readable instant AND how many grades", () => {
  assert.match(
    source,
    /data-fact=\{`volume_readable_horizon:\$\{volume\.presentPoints\}\/\$\{gridSlots\}`\}/,
    "the horizon fact must carry BOTH numbers — a bare count cannot say 769 OF WHAT",
  );
  assert.match(
    source,
    /data-readable-since-ms=\{volume\.firstPresentMs \?\? ""\}/,
    "the first readable instant must reach the DOM as a machine-readable attribute",
  );
  // `null` is absence of a horizon and must READ as absence, never as the epoch (`0`).
  assert.match(
    source,
    /volume\.firstPresentMs === null\s*\n?\s*\? "Nenhuma grade legível no período"/,
    "no readable grade must print a sentence, not a date derived from 0",
  );
  // ⛔ AND THE SPAN IS NOT SHRUNK TO FIT: C4 item 2. The window is `PRD-006 §2`/item `5.1`'s, and
  // a chart that narrows itself to hide its own hole is worse than one that names the hole. The
  // client never names the span at all — it draws the window it was handed.
  assert.ok(
    !source.includes("S2_WINDOW_SPAN_MS"),
    "the rendering layer must not reach for the span — re-cutting it around the data hides the gap",
  );
  // And the denominator is the slot array it was handed, whole — not a re-sliced sub-range.
  assert.match(source, /const gridSlots = volume\.slots\.length;/);
});

test("C4: the request this render was built from is on the root element, so the screen is auditable", () => {
  // What makes `e2e/08` able to cross-check the DOM against `/series-history` over EXACTLY the
  // window the server used — instead of re-deriving it from the spec's own clock, which races,
  // or seeding Postgres, which `[P-seed]` forbids.
  for (const attribute of [
    /data-window-start-ms=\{panels\.window\.startMs\}/,
    /data-window-end-ms-inclusive=\{lastInstantMs\(panels\)\}/,
    /data-knowledge-time-ms=\{knowledgeTimeMs\}/,
  ]) {
    assert.match(source, attribute, `the root element must declare ${attribute}`);
  }
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

// ── `T-01.8`: the two `design_gate` `BLOCKER`s, guarded on the SOURCE side ───────────────────
//
// ⚠️ THIS IS THE WEAK HALF, AND IT SAYS SO. What proves the HEIGHT IN PIXELS is
// `volume-subaxis-geometry.test.ts`, which measures against the real `lightweight-charts`; what
// these asserts prove is that the WIRING is written — that the bar series has not gone back to
// the mapping that draws zero as a bar, that both marks exist and that the scale is declared on
// screen. Both halves are necessary: the geometry does not see a `setData` that stopped being
// called in the component, and the scan does not see a pixel.

const VOLUME_SETDATA = /volumeSeries\.setData\(positiveValueSeriesLossless\(volume\.slots\) as never\);/;
/** ⛔ ANCHORED TO `volumeSeries`, AND IT WAS NOT UNTIL `T-05.9` — the bare
 * `/mode: PriceScaleMode\.Logarithmic,/` was correct while this file was the only logarithmic scale
 * in `SymbolClient.tsx`, and went VACUOUS the moment a second one arrived (the liquidation pane):
 * the mutation below deletes the FIRST occurrence, the second one kept the assert green, and the
 * `MORDE` test caught exactly that. The guard now names the series whose scale it is about, which
 * is what makes it survive a third chart too. */
const LOG_MODE =
  /volumeSeries\.priceScale\(\)\.applyOptions\(\{\s*scaleMargins: VOLUME_SCALE_MARGINS,\s*mode: PriceScaleMode\.Logarithmic,/;
const ABSENCE_SETDATA = /absenceSeries\.setData\(absenceMarkSeries\(volume\.slots, ABSENCE_MARK_PX\) as never\);/;
const ZERO_SETDATA = /zeroSeries\.setData\(zeroMarkSeries\(volume\.slots, ZERO_MARK_PX\) as never\);/;
const ABSENCE_ROLE = /const ABSENCE_MARK_COLOR_ROLE = "(\w+)" as const;/;
const ZERO_ROLE = /const ZERO_MARK_COLOR_ROLE = "(\w+)" as const;/;

test("BLOCKER-1: the bar series uses the mapping a log scale is able to place", () => {
  assert.match(
    source,
    VOLUME_SETDATA,
    "the sub-axis went back to `lineSeriesLossless`, which hands `0` over as a zero-height bar — " +
      "`log10(0)` has no coordinate and the zero-height bar IS the absence mark",
  );
  assert.match(source, LOG_MODE, "the sub-axis scale does not declare `PriceScaleMode.Logarithmic` — BLOCKER-1");
  // And the label the report requires ALONGSIDE the scale: an unlabelled log axis is worse than an
  // illegible linear one, because it invites reading twice the height as twice the volume.
  assert.match(source, /data-fact="volume_scale:log10"/, "the scale must be DECLARED on screen, not merely applied");
  assert.match(source, /escala log10/, "the visible label must state the scale in words");
});

test("BLOCKER-2: absence and legitimate zero are TWO series, with distinct marks and inks", () => {
  assert.match(source, ABSENCE_SETDATA, "there is no absence mark series — `WhitespaceItem` draws nothing");
  assert.match(source, ZERO_SETDATA, "there is no mark series for the provider's legitimate zero");
  const absenceRole = ABSENCE_ROLE.exec(source)?.[1];
  const zeroRole = ZERO_ROLE.exec(source)?.[1];
  assert.ok(absenceRole !== undefined && zeroRole !== undefined, "the ink roles of the marks vanished from the source");
  assert.notEqual(
    absenceRole,
    zeroRole,
    "both marks share the SAME ink — 'there was no liquidation' and 'we do not know' would be the " +
      "same claim again (STITCH_CONTEXT.md:1821-1825)",
  );
  // ⛔ `ADR-010`: the distinction is one of LUMINANCE, zero hue. Neither price direction
  // (green/red, which is `fill` and volume has no direction) nor data integrity (`dataBrokenInk` —
  // a grid gap is OPERATIONAL, not broken data).
  for (const role of [absenceRole!, zeroRole!]) {
    assert.match(role, /^provenance(Strong|Weak)$/, `the mark uses the role ${role}, outside the provenance ramp`);
  }
  // And the legend, which is the third channel — inside the `<canvas>` no legend reaches.
  assert.match(source, /data-fact="volume_marks_legend:2"/);
});

test("MORDE: each of the 4 regressions of the two BLOCKERs is caught by an assert above", () => {
  const mutants: readonly { readonly name: string; readonly mutate: (s: string) => string }[] = [
    {
      name: "back to lineSeriesLossless (zero becomes a zero-height bar)",
      mutate: (s) => s.replace(VOLUME_SETDATA, "volumeSeries.setData(lineSeriesLossless(volume.slots) as never);"),
    },
    {
      name: "scale back to linear",
      mutate: (s) =>
        s.replace(LOG_MODE, "volumeSeries.priceScale().applyOptions({\n      scaleMargins: VOLUME_SCALE_MARGINS,"),
    },
    { name: "the absence mark disappears", mutate: (s) => s.replace(ABSENCE_SETDATA, "") },
    {
      name: "both marks start using the SAME ink",
      mutate: (s) => s.replace(ZERO_ROLE, 'const ZERO_MARK_COLOR_ROLE = "provenanceWeak" as const;'),
    },
  ];
  for (const mutant of mutants) {
    const mutated = mutant.mutate(source);
    assert.notEqual(mutated, source, `the mutation "${mutant.name}" found no anchor — update this test, do not delete it`);
    const survives =
      VOLUME_SETDATA.test(mutated) &&
      LOG_MODE.test(mutated) &&
      ABSENCE_SETDATA.test(mutated) &&
      ZERO_SETDATA.test(mutated) &&
      ABSENCE_ROLE.exec(mutated)?.[1] !== ZERO_ROLE.exec(mutated)?.[1];
    assert.ok(!survives, `the mutation "${mutant.name}" is NOT detected by the asserts above — the guard is vacuous`);
  }
});

// ── CALA: form is `T-01.8`'s to change, and changing it must not touch any assert above ──────

test("CALA: a design_gate NEEDS_FIX about colour, height or scale leaves the contract intact", () => {
  // Exactly the kind of edit `T-01.8` is allowed to make without coordinating with `T-01.9`.
  const restyled = source
    .replace(/const VOLUME_SCALE_MARGINS = \{ top: 0\.8, bottom: 0 \} as const;/, "const VOLUME_SCALE_MARGINS = { top: 0.55, bottom: 0.05 } as const;")
    .replace(/color: colorTokens\(\)\.provenanceWeak,/, "color: colorTokens().provenanceStrong,");
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
