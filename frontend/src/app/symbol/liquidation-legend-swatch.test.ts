/**
 * `T-04.3` — the square of each liquidation leg (`liquidation-legend-swatch.ts`) and its WIRING in
 * `SymbolClient.tsx`. The pixels — hollow × filled read off a screenshot, with and without
 * `forced-colors`, and the neutral numeral — are `e2e/33`'s; this file proves the two things a
 * browser cannot tell apart from a lucky render: that the filled square does not depend on
 * `background` (`C-7`), and that the ink and the form come from the SIDE the leg is drawn on.
 *
 * Every assert below has a `MORDE` twin that replants the mutation it exists to catch and shows the
 * same predicate rejecting it.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LIQUIDATION_SWATCH_FILLED_BORDER_PX,
  LIQUIDATION_SWATCH_FORM_BY_SIDE,
  LIQUIDATION_SWATCH_HOLLOW_BORDER_PX,
  LIQUIDATION_SWATCH_SIZE_PX,
  liquidationSwatchStyle,
  type LiquidationSwatchStyle,
} from "./liquidation-legend-swatch.ts";
import { MOVED_OUT_FILES } from "./symbol-client-moved-out-files.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const source = ["SymbolClient.tsx", ...MOVED_OUT_FILES]
  .map((file) => readFileSync(path.join(HERE, file), "utf8"))
  .join("\n");

const INK = "#089981";

/** The C-7 predicate: the square's form is carried by geometry that forced colours keep. */
function formIsStructural(style: Readonly<Record<string, unknown>>, expected: "hollow" | "filled"): string | null {
  for (const key of Object.keys(style)) {
    if (key.toLowerCase().startsWith("background")) return `uses ${key}, which forced-colors overrides`;
  }
  if (style.width !== `${LIQUIDATION_SWATCH_SIZE_PX}px` || style.height !== `${LIQUIDATION_SWATCH_SIZE_PX}px`) {
    return `is ${String(style.width)}×${String(style.height)}, not ${LIQUIDATION_SWATCH_SIZE_PX}px`;
  }
  if (style.boxSizing !== "border-box") return "is not border-box: the border would grow the square";
  if (style.borderStyle !== "solid") return `border-style ${String(style.borderStyle)}`;
  const border = Number.parseFloat(String(style.borderWidth));
  const covered = 2 * border >= LIQUIDATION_SWATCH_SIZE_PX;
  if (expected === "filled" && !covered) return `border ${border}px leaves an interior: the FILL would need a background`;
  if (expected === "hollow" && covered) return `border ${border}px covers the box: it is not hollow`;
  if (expected === "hollow" && border < 1) return `border ${border}px is below one CSS px`;
  // The square sits on the chart's canvas, which forced colours never repaint: a system colour on
  // it measured ~1.1:1 (`e2e/33`), so the leg's ink must be kept.
  if (style.forcedColorAdjust !== "none") return "forced-color-adjust is not none: forced colours repaint the ink";
  return null;
}

test("T-04.3: upper leg HOLLOW, lower leg FILLED (SPEC-009 §7.3)", () => {
  assert.deepEqual(LIQUIDATION_SWATCH_FORM_BY_SIDE, { up: "hollow", down: "filled" });
});

test("T-04.3 / C-7: both squares are drawn by the border alone, 8px, and the filled one is filled BY its border", () => {
  assert.equal(LIQUIDATION_SWATCH_SIZE_PX, 8);
  assert.equal(LIQUIDATION_SWATCH_FILLED_BORDER_PX * 2, LIQUIDATION_SWATCH_SIZE_PX);
  assert.ok(LIQUIDATION_SWATCH_HOLLOW_BORDER_PX * 2 < LIQUIDATION_SWATCH_SIZE_PX);
  assert.equal(formIsStructural({ ...liquidationSwatchStyle("hollow", INK) }, "hollow"), null);
  assert.equal(formIsStructural({ ...liquidationSwatchStyle("filled", INK) }, "filled"), null);
  assert.equal(liquidationSwatchStyle("filled", INK).borderColor, INK);
  assert.equal(liquidationSwatchStyle("hollow", INK).borderColor, INK);
});

test("MORDE C-7: a filled square made of a 1px border plus a background is REJECTED", () => {
  const byBackground: Readonly<Record<string, unknown>> = {
    ...liquidationSwatchStyle("hollow", INK),
    backgroundColor: INK,
  };
  assert.match(formIsStructural(byBackground, "filled") ?? "", /backgroundColor/);
  const thinFilled: LiquidationSwatchStyle = { ...liquidationSwatchStyle("filled", INK), borderWidth: "1px" };
  assert.match(formIsStructural({ ...thinFilled }, "filled") ?? "", /leaves an interior/);
  const hollowAsFilled = liquidationSwatchStyle("filled", INK);
  assert.match(formIsStructural({ ...hollowAsFilled }, "hollow") ?? "", /not hollow/);
  const wrongSize = { ...liquidationSwatchStyle("hollow", INK), width: "10px" };
  assert.match(formIsStructural(wrongSize, "hollow") ?? "", /not 8px/);
  const repainted = { ...liquidationSwatchStyle("filled", INK), forcedColorAdjust: "auto" };
  assert.match(formIsStructural(repainted, "filled") ?? "", /forced-color-adjust/);
});

// ── The wiring in `SymbolClient.tsx` ─────────────────────────────────────────────────────────

/** The body of a top-level function of the client, from its `function` line to its closing brace
 * at column 0. */
function functionBody(code: string, name: string): string {
  const start = code.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `function ${name} not found in SymbolClient.tsx`);
  const end = code.indexOf("\n}\n", start);
  return end < 0 ? code.slice(start) : code.slice(start, end + 2);
}

/** The swatch takes its form AND its ink from the SIDE, and the ink from the bars' own map. */
function swatchWiringDefect(code: string): string | null {
  const body = functionBody(code, "LiquidationLegSwatch");
  if (!/LIQUIDATION_SWATCH_FORM_BY_SIDE\[side\]/.test(body)) return "the form is not LIQUIDATION_SWATCH_FORM_BY_SIDE[side]";
  if (!/colorTokens\(\)\[LIQUIDATION_BAR_COLOR_ROLE\[side\]\]/.test(body)) {
    return "the ink is not colorTokens()[LIQUIDATION_BAR_COLOR_ROLE[side]] — the bars' own ink";
  }
  if (!/liquidationSwatchStyle\(form, ink\)/.test(body)) return "the style is not liquidationSwatchStyle(form, ink)";
  if (!/aria-hidden="true"/.test(body)) return "the square is announced (it is the redundant copy of the <h3>)";
  if (/\bcohort\b/.test(body)) return "the square reads the cohort — after a side swap it would describe the other bar";
  return null;
}

/** Each leg's value carries its side's square as the lead of the numeral. */
function legWiringDefect(code: string): string | null {
  const body = functionBody(code, "LiquidationLegGroup");
  if (!/lead=\{<LiquidationLegSwatch side=\{side\} \/>\}/.test(body)) return "the leg's LegendValue has no square of its side";
  const values = body.match(/<LegendValue\b/g) ?? [];
  if (values.length !== 1) return `the leg renders ${values.length} LegendValue — the pane must show exactly two numbers, one per leg`;
  return null;
}

/** The lead sits right before the numeral inside the value, and the numeral's ink is neutral. */
function legendValueDefect(code: string): string | null {
  const body = functionBody(code, "LegendValue");
  const lead = body.indexOf("{lead ?? null}");
  const numeral = body.indexOf("data-legend-numeral");
  if (lead < 0 || numeral < 0 || lead > numeral) return "the lead is not rendered before the numeral";
  const between = body.slice(lead, numeral);
  if (/<span[^>]*>[^<]/.test(between)) return "text sits between the lead and the numeral";
  const numeralClass = body.slice(numeral, body.indexOf("</span>", numeral));
  if (/direction|text-(?:green|red|success|error)/.test(numeralClass)) return "the numeral is tinted by direction (D14)";
  if (!/text-on-surface/.test(numeralClass)) return "the numeral lost its neutral ink";
  return null;
}

test("T-04.3 wiring: the square's form and ink come from the SIDE, off the bars' ink map", () => {
  assert.equal(swatchWiringDefect(source), null);
});

test("T-04.3 wiring: each leg shows ONE value, led by its side's square; no third number", () => {
  assert.equal(legWiringDefect(source), null);
  const pane = functionBody(source, "LiquidationPane");
  assert.equal((pane.match(/<LegendValue\b/g) ?? []).length, 0, "the pane itself renders a LegendValue besides the two legs");
});

test("T-04.3 wiring: the lead is right before the numeral, and the numeral is in neutral ink", () => {
  assert.equal(legendValueDefect(source), null);
});

test("MORDE wiring: ink by cohort, form by cohort, no lead, a third value, a tinted numeral — each rejected", () => {
  const byCohortInk = source.replace(
    "colorTokens()[LIQUIDATION_BAR_COLOR_ROLE[side]]",
    'colorTokens()[cohort === "short" ? "directionUpFill" : "directionDownFill"]',
  );
  assert.notEqual(byCohortInk, source);
  assert.match(swatchWiringDefect(byCohortInk) ?? "", /bars' own ink/);

  const noLead = source.replace("lead={<LiquidationLegSwatch side={side} />}", "");
  assert.notEqual(noLead, source);
  assert.match(legWiringDefect(noLead) ?? "", /no square/);

  const thirdValue = source.replace(
    "lead={<LiquidationLegSwatch side={side} />}\n        />",
    'lead={<LiquidationLegSwatch side={side} />}\n        />\n        <LegendValue seriesId="liquidation_long" factKey="liquidation_net" slots={data.slots} />',
  );
  assert.notEqual(thirdValue, source);
  assert.match(legWiringDefect(thirdValue) ?? "", /2 LegendValue/);

  const tinted = source.replace(
    '${isAbsent ? "text-provenance-weak" : "text-on-surface"}',
    '${isAbsent ? "text-provenance-weak" : "text-direction-up"}',
  );
  assert.notEqual(tinted, source);
  assert.match(legendValueDefect(tinted) ?? "", /tinted by direction/);

  const leadAfter = source.replace("      {lead ?? null}\n", "").replace(
    '<span data-legend-mark={text.mark}',
    '{lead ?? null}\n      <span data-legend-mark={text.mark}',
  );
  assert.notEqual(leadAfter, source);
  assert.match(legendValueDefect(leadAfter) ?? "", /not rendered before the numeral/);
});
