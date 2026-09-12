/**
 * THE SURFACE THE CHART IS ACTUALLY PAINTED ON — the value `createChart` receives, not a
 * constant somebody hopes it received.
 *
 * WHY THIS FILE EXISTS, and it is not a refactor. `design-review-painel-cvd.md` (`DR-1`,
 * BLOCKER) measured the defect: `SymbolClient.tsx:178-182` called `createChart` with `width`,
 * `height` and `timeScale` and NOTHING ELSE, so the `<canvas>` kept the library's published
 * default background, `#FFFFFF`, inside a `#131722` page. The CVD delta line
 * (`provenanceStrong`, `#e6e9ef`) therefore measured **14,72:1 in the gate and 1,22:1 on the
 * screen** — invisible. `color-contrast.test.ts` stayed green the whole time, because its
 * `kind: "surface"` branch measured every ratio against `SURFACE_BASE` while the ink was being
 * laid on white.
 *
 * ⛔ SO THE FIX IS NOT "PASS `layout` AND MOVE ON". That is exactly the shape `D13` refused BY
 * NAME for the theme parameter ("trocar `light`->`dark` nos 4 sítios … deixa a armadilha
 * armada"), and the identical failure mode `color-tokens.ts`'s module docstring already records
 * from the opposite side (the OI line drawn `#131722` on `#131722`: `1,00:1`, live in
 * production, six green gates). A local fix leaves the next pane free to call `createChart`
 * bare and reintroduce it with nothing saying a word.
 *
 * WHAT MAKES THE DIVERGENCE DETECTABLE INSTEAD — three instruments, each measuring something
 * the other two cannot see:
 *
 *   1. `color-contrast.test.ts` no longer measures against `SURFACE_BASE` directly: its
 *      `kind: "surface"` backdrop is `chartSurfaceTheme().backgroundColor`, i.e. THIS module's
 *      value, the one handed to `createChart`. If the chart background ever moves off the page
 *      surface, every series ratio is recomputed against the new value and the floor bites.
 *      Its NEGATIVE CONTROL replants `#FFFFFF` here and reproduces `1,22:1` exactly.
 *   2. `chart-construction.test.ts` (in `web`, where the call sites are) scans every
 *      `createChart(` in `frontend/src` and REJECTS any whose options do not come from
 *      `chartConstructorOptions()`. That is the instrument that covers a pane written next
 *      month in a file that does not exist yet.
 *   3. `e2e/11-canvas-fundo.spec.ts` reads the PIXELS of the real `<canvas>` in a real browser
 *      and asserts the modal color is this background. Source scans prove what is written;
 *      only that one proves what was painted.
 *
 * AND THE VALUES ARE NOT NEW ONES. `backgroundColor` IS `SURFACE_BASE` (imported, not
 * re-typed — two literals could drift, one cannot), `textColor` is the `provenanceWeak` token,
 * and `gridLineColor` is the SECOND citation of `--color-surface-stripe` from `globals.css`,
 * guarded against drift by a test that reads that file as text — the same discipline
 * `SURFACE_BASE` itself already carries.
 *
 * WHY THE GRID LINE IS NOT A `ColorRole`: `CONTRAST_BACKDROP` is `Record<ColorRole, …>` with a
 * floor of `>= 3.0` on every member, because every member is SERIES INK. A grid line is chrome,
 * not a datum — WCAG 1.4.11 scopes non-text contrast to the parts "required to understand the
 * content", and a 3,0:1 grid would shout over the very series it exists to help read. Adding it
 * to the union would force either a wrong floor or an allowlist, and "entrada de allowlist é
 * indistinguível de bypass" (`CLAUDE.md`). It is declared here, with its own drift test,
 * instead.
 *
 * ⛔ FORM SUBMITTED TO THE `design_gate`, NOT DECIDED HERE — `CLAUDE.md` §"Design — autonomia
 * delegada, com gate de validação". Which hue a grid line takes and whether axis text is the
 * weak or the strong end of the procedência ramp are the `ui-designer`'s with the
 * `ux-ui-mastery` verdict. What a builder decides is that the canvas is NOT a different surface
 * from the page it sits in, and that the difference is MEASURABLE.
 *
 * `charts` still imports nothing from `lightweight-charts` (`git grep -c 'from "lightweight-charts"'
 * frontend/src/charts` → 0, and this file keeps it at 0): the shape below is plain data, and the
 * binding to the library's `DeepPartial<ChartOptions>` lives in `web`, where the library already
 * is. `ADR-003` FR-1 — `charts` owns geometry, `web` owns the mounting.
 */

import { colorTokens, SURFACE_BASE } from "./color-tokens.ts";

/**
 * `--color-surface-stripe` of `frontend/src/app/globals.css`, cited here as a literal for the
 * same reason `SURFACE_BASE` is: `charts` may not read the DOM (`ADR-003` FR-1, and `D13`'s
 * refused alternative `C`). `chart-theme.test.ts` reads `globals.css` as TEXT and fails if the
 * two ever disagree.
 */
export const CHART_GRID_LINE = "#222634";

/**
 * What a chart surface is made of — plain data, no library type, so `charts` stays free of
 * `lightweight-charts` and `color-contrast.test.ts` can import it without dragging a canvas in.
 */
export interface ChartSurfaceTheme {
  /** The color the `<canvas>` is cleared to. THE backdrop every series ratio is measured against. */
  readonly backgroundColor: string;
  /** Axis and crosshair labels. Text, so it owes WCAG 1.4.3's 4,5:1 against `backgroundColor`. */
  readonly textColor: string;
  /** Chrome, not a datum — see this module's docstring for why it is not a `ColorRole`. */
  readonly gridLineColor: string;
}

/**
 * The one chart surface. Takes no argument for the same reason `colorTokens()` stopped taking
 * one (`D13`): there is a single theme, so there is nothing left to select — and a parameter is
 * how the invisible-line defect was expressible in the first place.
 */
export function chartSurfaceTheme(): ChartSurfaceTheme {
  const tokens = colorTokens();
  return {
    backgroundColor: SURFACE_BASE,
    textColor: tokens.provenanceWeak,
    gridLineColor: CHART_GRID_LINE,
  };
}
