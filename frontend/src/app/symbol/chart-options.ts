/**
 * THE ONLY PLACE `createChart`'s options are built — `DR-1` of
 * `docs/context/cinco-metricas-do-core/gates/design-review-painel-cvd.md`.
 *
 * The defect, measured: `SymbolClient.tsx:178-182` at `74d59a4` passed `width`, `height` and
 * `timeScale` and nothing else, so every pane kept `lightweight-charts`' published defaults —
 * `background {type:"solid", color:"#FFFFFF"}` and `textColor "#191919"`
 * (`grep -oE 'background:\{type:"?[a-zA-Z]+"?,color:"#[0-9a-fA-F]{3,6}"\}'
 * frontend/node_modules/lightweight-charts/dist/lightweight-charts.production.mjs | head -1`),
 * plus a `#D6DCDE` grid — three white rectangles in a `#131722` page, with the CVD delta line
 * at `1,22:1` on them while the contrast gate read `14,72:1` against a surface the canvas was
 * not using.
 *
 * WHY A MODULE AND NOT A FEW MORE LINES IN THE `createChart` CALL: because `chart-construction.test.ts`
 * needs something to REQUIRE. Its rule is one sentence — every `createChart(` in `frontend/src`
 * takes its options from `chartConstructorOptions()` — and a rule of that shape is only
 * enforceable if the options have a NAME. Inline options are unenforceable by construction: the
 * next pane would spell its own object, correctly or not, and nothing could tell the two apart.
 * This is `D13`'s reasoning about the deleted theme parameter applied one layer out: make the
 * defect INEXPRESSIBLE rather than merely absent today.
 *
 * The colors themselves are NOT chosen here. They come from `chartSurfaceTheme()` in `charts`,
 * which is the same value `color-contrast.test.ts` measures every series ratio against — one
 * value, two readers, so "the gate's backdrop" and "the canvas' backdrop" cannot be different
 * things.
 *
 * ⛔ FORM IS THE `ui-designer`'S (`CLAUDE.md` §"Design — autonomia delegada, com gate de
 * validação"): height, grid visibility and the crosshair's manners are submitted, not decided.
 * What a builder decides is that the canvas and the page are the SAME surface.
 */

import { ColorType, type DeepPartial, type ChartOptions } from "lightweight-charts";

import { chartSurfaceTheme } from "../../charts/index.ts";

/**
 * The options every chart on this route is created with. `width`/`height` stay arguments
 * because they are layout, not theme, and the caller is the one that measured the container.
 */
export function chartConstructorOptions(width: number, height: number): DeepPartial<ChartOptions> {
  const theme = chartSurfaceTheme();
  return {
    width,
    height,
    layout: {
      background: { type: ColorType.Solid, color: theme.backgroundColor },
      textColor: theme.textColor,
    },
    grid: {
      vertLines: { color: theme.gridLineColor },
      horzLines: { color: theme.gridLineColor },
    },
    timeScale: { timeVisible: true, secondsVisible: false },
  };
}
