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

import { ColorType, type DeepPartial, type ChartOptions, type LineSeriesPartialOptions } from "lightweight-charts";

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
      // `paineis-de-fluxo` `T-01.6` (`[Q-DG-1]`, `C-6`): the pane chrome of the ONE chart. The
      // separator colour is the theme's (never a literal here — `DR-1`), the hover colour is the
      // same value, and resizing is off: a resized layout would be state that the next remount
      // forgets (`handoff/DESIGN-LAYOUT.md` §6, row "enableResize"). `pane-chrome-options.test.ts`
      // asserts all three on the BUILT value, so dropping this block reddens a test instead of
      // silently falling back to the library's own (light, undesigned) default separator.
      panes: {
        separatorColor: theme.paneSeparatorColor,
        separatorHoverColor: theme.paneSeparatorColor,
        enableResize: false,
      },
      // `T-01.11-FIX` (`SF-1` of `gates/T-01.11-design-review.md`): with ONE chart there is ONE logo,
      // and the library pins it to the bottom-left of the LAST pane — on top of CVD data. The
      // attribution the licence asks for is NOT dropped: it moved to the page's footer as a link
      // (`SymbolClient.tsx`, `CHART_ATTRIBUTION_TESTID`), and `pane-chrome-options.test.ts` requires the
      // two together — the logo off only while that link is rendered.
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: theme.gridLineColor },
      horzLines: { color: theme.gridLineColor },
    },
    timeScale: { timeVisible: true, secondsVisible: false },
  };
}

/** `T-01.11-FIX` (`SF-1`) — the footer link that carries the library's attribution once the logo is
 * off. The URL is the one the library's own logo links to. */
export const CHART_ATTRIBUTION_TESTID = "chart-attribution";
export const CHART_ATTRIBUTION_URL = "https://www.tradingview.com/";

/** `T-01.10` — the overlay price scale of the grid carrier, its own and nobody else's: a scale id
 * that is neither `left` nor `right` is an overlay, so it draws no axis and moves no pane scale. */
export const GRID_CARRIER_PRICE_SCALE_ID = "grid-carrier";

/**
 * `T-01.10` (`ADR-044/D2′(a)`, `handoff/T-01.10-desenho.md` §3 item 1) — the options of the host's
 * grid CARRIER: the one `LineSeries`, in pane 0, that is fed exactly the canonical grid as `{time}`
 * items so the 14 pane series can be fed plot items only. It must draw NOTHING and take part in
 * NOTHING the operator sees: hidden, on its own overlay scale, no last-value label, no price line,
 * no crosshair marker. Here and not in `SymbolClient.tsx` for `DR-1`'s reason: options that have a
 * NAME can be required and compared (`e2e/25-sparse-feed-pixel-identity.spec.ts` builds the carrier
 * from THIS value, so the pixel proof and the app cannot hold two carriers).
 */
export function gridCarrierSeriesOptions(): LineSeriesPartialOptions {
  return {
    visible: false,
    priceScaleId: GRID_CARRIER_PRICE_SCALE_ID,
    lastValueVisible: false,
    priceLineVisible: false,
    crosshairMarkerVisible: false,
  };
}
