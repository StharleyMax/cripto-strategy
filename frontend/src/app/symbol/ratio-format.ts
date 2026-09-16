/**
 * `T-04.8` — HOW A DERIVED NUMBER IS PRINTED, so that presentation never invents precision the
 * measurement does not have.
 *
 * ── WHY THIS MODULE EXISTS AT ALL ────────────────────────────────────────────────────────────
 *
 * The `design_gate` of `T-04.6` (`ui-designer` + `ux-ui-mastery`, veredito `APPROVED` on Rev. 3,
 * `docs/context/cinco-metricas-do-core/gates/design-04.md` §R2) approved a pane that publishes a
 * SCALE FOOTER: *"Janela de 4 dias: 1.1395 a 1.8369 · amplitude 0.6974 (42,08% da mediana
 * 1,6575)"*. Two of those numerals are not served by the API — `amplitude` is a subtraction and the
 * percentage is a quotient — and `M-1` of that same report is the rule they have to obey: every
 * numeral on the screen traces to a measurement. `1.8369 - 1.1395` evaluates to
 * `0.6974000000000001` in IEEE-754, and printing THAT would publish 16 digits of precision for a
 * series the backend serves with four. Printing `0.7` would throw away a digit the operands have.
 *
 * So the rule here is mechanical and has one sentence: **a derived value is printed with as many
 * decimal places as its widest operand, and no more.** The rounding is then a property of the
 * INPUTS, not a constant somebody chose, and it moves by itself the day the backend serves more
 * precision.
 *
 * ── AND WHY IT IS A MODULE OF ITS OWN, NOT A HELPER INSIDE `SymbolClient.tsx` ────────────────
 *
 * This repository has no component renderer in any suite (`@testing-library` is not installed) and
 * `SymbolClient.tsx` imports `lightweight-charts`, which wants a DOM — a function living there is
 * provable only by reading the source as text. Here it is plain data in, string out, and
 * `ratio-format.test.ts` exercises it with `node --test`, including the IEEE case above.
 *
 * ⛔ IT MAY NOT REACH THE SERVER. It is imported by a `"use client"` component, so it stays free of
 * `node:*` and of `view-model.ts` (`web-fullstack.browser-imports-server` is a BLOQUEIO), exactly
 * like `panel-status.ts`, whose docstring states the boundary in full.
 */

/**
 * How many decimal places a number's own decimal notation carries — `1.1395` ⇒ `4`, `2` ⇒ `0`.
 *
 * ⚠️ EXPONENTIAL NOTATION ANSWERS `0`, DELIBERATELY. `String(1e-7)` is `"1e-7"`, which has no
 * decimal point to count, and a wrong count here would silently round a real value away. This
 * series (a ratio of account counts, `~1,1..1,9`) never reaches that regime, and the caller that
 * one day does gets a visibly wrong `0` rather than an invisibly wrong `7` — the failure that can
 * be seen is the one that gets fixed.
 */
export function decimalPlaces(value: number): number {
  const text = String(value);
  if (text.includes("e") || text.includes("E")) {
    return 0;
  }
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

/**
 * A DERIVED value (a difference, a sum) printed at the precision of the operands it was derived
 * from — the rule this module's docstring states, applied.
 *
 * `operands` is passed EXPLICITLY rather than inferred from the result: the whole point is that the
 * precision of `max - min` is a fact about `max` and `min`, and a function that looked only at its
 * own argument would have nothing left to look at but the IEEE noise it exists to remove.
 */
export function formatDerivedDecimal(value: number, operands: readonly number[]): string {
  const places = operands.reduce((widest, operand) => Math.max(widest, decimalPlaces(operand)), 0);
  return value.toFixed(places);
}

/**
 * A fraction as a pt-BR percentage — `0.4508` ⇒ `"45,1%"`.
 *
 * ⚠️ THE DECIMAL SEPARATOR DIFFERS FROM THE ONE `formatDerivedDecimal` PRINTS, AND THE MIXTURE IS
 * THE APPROVED DESIGN'S, NOT AN OVERSIGHT: the Rev. 3 screen prints `0.3148` with a dot and
 * `45,1%` with a comma, because the first is a VALUE OF THE SERIES — the same characters the API
 * serves and an operator would paste back into a query — and the second is pt-BR PROSE about it
 * (`CLAUDE.md` §"Idioma de identificador", line 8: string visível de UI em pt-BR). Translating the
 * series' own value into pt-BR notation would break that paste; leaving the percentage in en-US
 * would put a foreign convention in a sentence.
 *
 * `toFixed(1)` and not more: the percentage is a RATIO OF TWO DERIVED NUMBERS, so its trailing
 * digits are noise about noise, and the approved screen prints exactly one.
 */
export function formatPercentPtBr(fraction: number): string {
  return `${(fraction * 100).toFixed(1).replace(".", ",")}%`;
}

/**
 * The EQUILIBRIUM of a long/short account ratio — the value at which as many accounts are long as
 * are short.
 *
 * ⛔ IT IS A CONSTANT OF DEFINITION, NOT A MEASUREMENT, and the screen says so where it prints it.
 * `M-1`'s audit of Rev. 3 classified it in exactly those words (*"`1,0000` — constante de
 * definição (equilíbrio), não medição"*), and the distinction is load-bearing on a pane whose whole
 * subject is not letting an unmeasured number pass for a measured one.
 *
 * ⛔ AND IT IS NOT DRAWN INSIDE THE PLOT. `S-7` of the same report measured what anchoring the
 * scale at this value costs: the median 15-minute excursion falls from `0.88 px` to `0.74 px` and
 * the share of 15-minute windows that move less than half a pixel rises from `25,5%` to `33,7%` —
 * i.e. a third of the operator's timeframe becomes a flat line, to keep one reference line on
 * screen. It is a BORDER LABEL instead (`LongShortEquilibriumNote`), outside the domain.
 */
export const LONG_SHORT_EQUILIBRIUM = 1;

/** The three positions the equilibrium can hold relative to the window's own domain. Used to
 * choose the border label's wording, so the screen never says "abaixo da base" about a value that
 * is inside the plotted range — the study HTML could only ever say the one sentence that was true
 * of the four days it was generated from. */
export type EquilibriumPlacement = "below" | "inside" | "above";

/**
 * WHERE the equilibrium sits relative to a window's measured domain.
 *
 * ⛔ THIS FUNCTION IS THE FIX FOR A LIE THE APPROVED HTML CANNOT AVOID TELLING. The Rev. 3 study
 * hardcodes *"▼ 1,0000 equilíbrio · abaixo da base"* — true of the four days it was generated over
 * (`min = 1.1395`), and FALSE the first time the series trades below parity, which is a normal
 * market state for a long/short ratio. A screen that says "abaixo da base" while `1,0000` sits in
 * the middle of the plot is the `M-1` class of defect (an assertion nothing measured), so the
 * wording is derived from the domain instead of transcribed from the study.
 *
 * `null` stats (no observation in the window) answer `null`: with no domain there is no relation to
 * report, and the pane says the absence instead.
 */
export function equilibriumPlacement(
  stats: { readonly min: number; readonly max: number } | null,
): EquilibriumPlacement | null {
  if (stats === null) {
    return null;
  }
  if (LONG_SHORT_EQUILIBRIUM < stats.min) {
    return "below";
  }
  if (LONG_SHORT_EQUILIBRIUM > stats.max) {
    return "above";
  }
  return "inside";
}
