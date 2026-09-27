/**
 * `paineis-de-fluxo` `T-04.4` (`CST-272`, plan `04` item `4.4`, `[Q-DG-2]`, `CA-12`) — THE FORM of the
 * fused liquidation pane, as the `design_gate` decided it: `gates/T-04.4-design-gate.md` §5 (proposal
 * of the `ui-designer`) and §9 (APPROVED by the independent `ux-ui-mastery` validator, with V-1..V-4).
 *
 * ── WHAT WAS DECIDED, AND WHY IN ONE LINE EACH ────────────────────────────────────────────────
 *
 *   - `mode: "normal"` (linear, base `0`). The phase's question is *"which side was swept in that
 *     candle"* (`PRD-009:165-166`); a sweep is a cascade, and a cascade is a peak. At 1m the tallest
 *     column is `11,5x`/`53x` the median in linear against `1,7x`/`1,9x` in log, and log draws a
 *     `>= 3x` sweep pair with `< 1,5x` of height difference in 4/5 to 5/7 of the cases (§2.2, §2.3,
 *     `[MEDIDO]` there). The volume pane above is linear too: one grammar per chart (§4, argument 4).
 *   - `zeroLine: 0.5`, FIXED (option H1). `PRD-009:168` asks for an axis symmetric around zero, and the
 *     zero is the pane's only landmark; a zero that followed the two visible maxima (H2) would move on
 *     every pan for a median gain of `1,38x-1,63x` (§2.4, §4).
 *   - marks `2`/`6` px in a `0,06` band with a `0,03` gap — the volume's marks, in the same chart. The
 *     `6`/`18` px of the log proposal became the most salient thing on screen once the bars went linear
 *     (`23x` the bars' ink, §2.2 row L); this form halves the marks' ink and gives the bars `+20%`.
 *   - the pane's weight stays `22` (`pane-registry.ts`, `F1_PANE_STRETCH`): the gain comes from the
 *     marks and from the log note line that no longer exists, not from the price pane (§4, H3).
 *
 * ── WHAT IT COSTS, DECLARED (§4 and §9.3 of the gate) ─────────────────────────────────────────
 *
 * 72-89% of the visible bars sit on the library's 1 px floor, and that floor is ASYMMETRIC: the upper
 * leg's floor bar draws ~2 px, the lower leg's ~1 px (`2,0x` at DPR 1, `1,64x-1,94x` at DPR 2,
 * `[MEDIDO]` by the validator). Accepted this cycle and watched by `F-5` as the validator rewrote it
 * (V-1, §9.4): the median floor-ink ratio up/down past `2,2x` at any DPR `T-04.6` measures returns the
 * floor to the gate. The height also depends on the visible maximum (pan moves it), as the volume's.
 *
 * ⛔ ONE PLACE. This constant is the form the app draws, the form `e2e/31`'s fixture draws as "design"
 * and the form the contract tests pin. `charts` no longer carries a form of its own (the log proposal
 * was deleted in this task): two constants would be two truths, and the one nobody draws would lie.
 *
 * Pure data, no import but a type (erased at run time) — `e2e/liquidation-pane-fixture.ts` runs it in
 * plain `node`.
 */

import type { LiquidationPaneForm } from "../../charts/index.ts";

export const LIQUIDATION_PANE_FORM: LiquidationPaneForm = {
  mode: "normal",
  zeroLine: 0.5,
  up: { marks: { top: 0, bottom: 0.06 }, barsTop: 0.09 },
  down: { barsBottom: 0.91, marks: { top: 0.94, bottom: 1 } },
  absenceMarkPx: 2,
  zeroMarkPx: 6,
};
