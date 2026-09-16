/**
 * `T-04.8` — the formatters of the long/short pane's scale footer, exercised over the EXACT numbers
 * the `design_gate` of `T-04.6` judged (`gates/design-04.md` §R2.2, Rev. 3: `1.1395`, `1.8369`,
 * `0.6974`, `42,08%`, `0.3148`, `45,1%`).
 *
 * WHAT IS BEING PROVEN: that a numeral the screen prints and the API does not serve is a ROUNDING
 * of the operands the API DID serve, and never a constant somebody typed. `M-1` of that report is
 * the rule ("todo numeral rastreia a uma medição"), and the rodada it reprovou had published six
 * numerals that traced to nothing — so the cheap, real failure mode here is a `toFixed(4)` frozen
 * in the view, correct for this series today and silently wrong for the next one.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decimalPlaces,
  equilibriumPlacement,
  formatDerivedDecimal,
  formatPercentPtBr,
  LONG_SHORT_EQUILIBRIUM,
} from "./ratio-format.ts";

// The four-day domain the gate measured over production, transcribed from `gates/design-04.md`
// §R2.2 so the numbers this suite asserts are the numbers a human judged.
const WINDOW_MIN = 1.1395;
const WINDOW_MAX = 1.8369;
const WINDOW_MEDIAN = 1.6575;

test("decimalPlaces counts the notation, not the type", () => {
  assert.equal(decimalPlaces(WINDOW_MIN), 4);
  assert.equal(decimalPlaces(2), 0);
  assert.equal(decimalPlaces(1.5), 1);
  // ⚠️ The declared blind spot, asserted so it stays declared instead of being rediscovered as a
  // surprise: exponential notation has no decimal point to count.
  assert.equal(decimalPlaces(1e-7), 0);
});

test("MORDE: the raw IEEE subtraction is what this module exists to refuse", () => {
  // ⛔ THE DEFECT, SHOWN RATHER THAN DESCRIBED, and over the gate's OWN two pairs — this is the
  // string a `${max - min}` in the view prints. Note that the four-day pair below subtracts
  // exactly (`0.6974`) while BOTH four-hour pairs of Rev. 3 do not: the noise is a property of the
  // particular operands, so "it looked fine on the screen I checked" is not evidence about the next
  // window. That asymmetry is the argument for formatting every derived numeral, not the noisy ones.
  assert.equal(String(WINDOW_MAX - WINDOW_MIN), "0.6974");
  assert.equal(String(1.8114 - 1.495), "0.3163999999999998", "the Estado-2 four-hour amplitude of Rev. 3");
  assert.equal(String(1.8098 - 1.495), "0.31479999999999997", "and the Estado-1 one");
  assert.equal(
    formatDerivedDecimal(1.8114 - 1.495, [1.495, 1.8114]),
    "0.3164",
    "the amplitude is printed at the precision of the operands — 4 places in, 4 places out",
  );
  assert.equal(formatDerivedDecimal(1.8098 - 1.495, [1.495, 1.8098]), "0.3148");
  assert.equal(formatDerivedDecimal(WINDOW_MAX - WINDOW_MIN, [WINDOW_MIN, WINDOW_MAX]), "0.6974");
});

test("the precision FOLLOWS the operands — a frozen toFixed(4) is what is being ruled out", () => {
  // Same arithmetic, operands with 2 decimal places: a view with a hardcoded `toFixed(4)` would
  // print `0.4000`, publishing two digits of precision the series never had.
  assert.equal(formatDerivedDecimal(1.9 - 1.5, [1.5, 1.9]), "0.4");
  // And more precision in, more precision out, with no edit here.
  assert.equal(formatDerivedDecimal(1.500002 - 1.5, [1.5, 1.500002]), "0.000002");
  // The widest operand rules, not the first one.
  assert.equal(formatDerivedDecimal(0.5, [1.5, 1.500002]), "0.500000");
});

test("formatPercentPtBr writes pt-BR prose about the series, one decimal", () => {
  // `42,08%` in the approved footer is `amplitude / median`; the screen prints one decimal, so the
  // assertion is on what the function publishes, not on the gate's own two-decimal transcription.
  assert.equal(formatPercentPtBr((WINDOW_MAX - WINDOW_MIN) / WINDOW_MEDIAN), "42,1%");
  assert.equal(formatPercentPtBr(0.3148 / 0.6974), "45,1%");
  assert.match(formatPercentPtBr(0.451), /^\d+,\d%$/, "a dot in a pt-BR percentage is the en-US convention leaking");
});

test("the equilibrium is a CONSTANT OF DEFINITION, and the label is derived from the domain", () => {
  assert.equal(LONG_SHORT_EQUILIBRIUM, 1, "as many accounts long as short — a definition of the metric, not a reading");
  // The state the approved study hardcodes: the whole window sits above parity.
  assert.equal(equilibriumPlacement({ min: WINDOW_MIN, max: WINDOW_MAX }), "below");
  // ⛔ MORDE — the two states the study's transcribed sentence would LIE about. A screen that says
  // "abaixo da base" here is asserting something nothing measured, which is `M-1`'s defect class.
  assert.equal(equilibriumPlacement({ min: 0.82, max: 1.31 }), "inside");
  assert.equal(equilibriumPlacement({ min: 0.51, max: 0.94 }), "above");
  // The boundaries belong to the domain: equal to the minimum is INSIDE, not below it.
  assert.equal(equilibriumPlacement({ min: 1, max: 1.4 }), "inside");
  assert.equal(equilibriumPlacement({ min: 0.4, max: 1 }), "inside");
  // No observation, no domain, no relation to report.
  assert.equal(equilibriumPlacement(null), null);
});
