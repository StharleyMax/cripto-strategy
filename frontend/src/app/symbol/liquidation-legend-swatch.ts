/**
 * `T-04.3` (`paineis-de-fluxo`, plan `04` item `4.3`; `RF-10`, `RN-3`, `SPEC-009` §7.3) — the 8px
 * square that precedes each of the two liquidation magnitudes in the fused pane's legend.
 *
 * ── WHAT THE `design_gate` DECIDED (`SPEC-009` §7.3, `handoff/DESIGN-LAYOUT.md` §7) ─────────────
 *
 * The numeral is in NEUTRAL ink — no numeral on this screen is tinted by direction
 * (`STITCH_CONTEXT.md` D14) — and it is preceded by a square that repeats the FORM and the INK of
 * its leg: the upper leg (`short`, token of rise) is a HOLLOW square, the lower leg (`long`, token of
 * fall) a FILLED one. The square is a fill, so it may carry the hue; the number may not.
 *
 * ── `C-7`: THE DIFFERENCE IS STRUCTURAL, NOT A BACKGROUND (`gates/DESIGN-LAYOUT-ux-critique-r2.md`) ──
 *
 * Under `forced-colors` the user agent overrides the author's colours, and `background-color` is one
 * of the overridden properties: a filled square drawn with `background` is repainted in the system's
 * Canvas colour — white in Chromium's emulated palette `[MEDIDO 2026-09-27: e2e/33 ablation 1]`, and
 * `[INFERRED]` dark on the dark plot under a dark palette, i.e. gone. So NEITHER square uses
 * `background`. Both are drawn by their
 * BORDER alone, and the filled one is filled BY ITS BORDER: a border half the side wide on every edge
 * covers the whole box. Forced colours may repaint the border in a system colour, but they do not
 * remove it and do not thin it, so hollow × filled survives as geometry. This is the first of the two
 * implementations `C-7` names ("borda nos dois, preenchimento só no cheio").
 *
 * AND the second one too, `forced-color-adjust: none`, for a reason `e2e/33` measured: the square
 * is not drawn on a system surface but OVER THE CHART'S CANVAS, which forced colours never repaint.
 * Under Chromium's emulated `forced-colors: active` the border was forced to `rgb(0, 0, 0)` on the
 * plot's `#131722` — about 1.1:1, the square all but gone, hollow and filled alike
 * `[MEDIDO 2026-09-27: e2e/33 debug bitmap, 16×16 device px per square]`. The ink of the leg was
 * chosen against THAT backdrop, so it is kept: the square is a data mark, the same status the
 * canvas bars already have. The geometry stays border-only regardless, so a user agent that ignores
 * the property still keeps hollow × filled.
 * `[NÃO SEI]` (inherited from `C-7`): the exact colour each user agent forces on a border.
 *
 * ── THE FORM FOLLOWS THE SIDE, NOT THE COHORT ──────────────────────────────────────────────────
 *
 * Same rule as the bars' ink (`SymbolClient.tsx::LIQUIDATION_BAR_COLOR_ROLE`, `gates/T-04.2-builder.md`
 * §3): `SPEC-009` §7.1 says that reverting the convention is "a swap of sides in the registry" and
 * nothing else, so the square is keyed by the side its leg is DRAWN on. A square keyed by cohort would,
 * after the swap, describe the bar on the other side of the zero.
 */

import type { LiquidationSide } from "../../charts/index.ts";

/** The side of the square, CSS px (`SPEC-009` §7.3: "um quadrado de 8px"). */
export const LIQUIDATION_SWATCH_SIZE_PX = 8;

/** The border of the HOLLOW square, CSS px. Thin enough to leave a 6×6 px interior. */
export const LIQUIDATION_SWATCH_HOLLOW_BORDER_PX = 1;

/** The border of the FILLED square: half the side, so the four borders meet and cover the box. */
export const LIQUIDATION_SWATCH_FILLED_BORDER_PX = LIQUIDATION_SWATCH_SIZE_PX / 2;

export type LiquidationSwatchForm = "hollow" | "filled";

/** Upper leg hollow, lower leg filled — the same grammar as the CVD delta bars and the candles
 * (`gates/DESIGN-LAYOUT-ux-critique-r2.md` §4: "acima, vazado, verde = fluxo do lado comprador"). */
export const LIQUIDATION_SWATCH_FORM_BY_SIDE: Readonly<Record<LiquidationSide, LiquidationSwatchForm>> = {
  up: "hollow",
  down: "filled",
};

/** The inline style of one square. The shape of the returned object is the contract: there is no
 * `background*` key in it, by construction (`C-7`). */
export interface LiquidationSwatchStyle {
  readonly display: "inline-block";
  readonly flex: "none";
  readonly boxSizing: "border-box";
  readonly width: string;
  readonly height: string;
  readonly borderStyle: "solid";
  readonly borderWidth: string;
  readonly borderColor: string;
  /** `C-7`: the leg's ink survives forced colours — see the module comment for the measurement. */
  readonly forcedColorAdjust: "none";
}

export function liquidationSwatchStyle(form: LiquidationSwatchForm, ink: string): LiquidationSwatchStyle {
  const borderPx = form === "filled" ? LIQUIDATION_SWATCH_FILLED_BORDER_PX : LIQUIDATION_SWATCH_HOLLOW_BORDER_PX;
  return {
    display: "inline-block",
    flex: "none",
    boxSizing: "border-box",
    width: `${LIQUIDATION_SWATCH_SIZE_PX}px`,
    height: `${LIQUIDATION_SWATCH_SIZE_PX}px`,
    borderStyle: "solid",
    borderWidth: `${borderPx}px`,
    borderColor: ink,
    forcedColorAdjust: "none",
  };
}
