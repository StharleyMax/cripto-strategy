/**
 * `paineis-de-fluxo` `T-01.11-FIX` (`MF-2` of `gates/T-01.11-design-review.md`) — the price format
 * of a scale whose TICK labels would be false: the liquidation bar scale.
 *
 * ── WHY THE LABELS WERE FALSE ─────────────────────────────────────────────────────────────────
 *
 * The bar scale is `PriceScaleMode.Logarithmic` by design (`BLOCKER-1`, `max/p50 = 443,8x`), and
 * since `T-01.6` its data is compressed BELOW the pane's legend (`charts::paneScaleMargins`): in the
 * 108 px long leg the bars get ~40 px and the legend reserve ~60 px. `lightweight-charts@5.2.1` lays
 * its tick marks over the WHOLE pane height (`dist/lightweight-charts.development.mjs:4395-4397`,
 * `coordinateToLogical(0)` … `coordinateToLogical(height − 1)`), so the reserve is labelled by
 * extrapolating a log scale ~10 decades past the data: `2000000000000000000.00` on the long leg and
 * `600000000.00` on the short one, printed on top of the separator `[MEDIDO 2026-09-25, real app over
 * the production API: series.coordinateToPrice(0) = 2,66e17 (long) and 6,53e8 (short), against a
 * served maximum of 6,76e6 and 4,59e6]`. No bar ever reaches those values.
 *
 * ── WHAT THIS DOES, AND WHAT IT KEEPS ────────────────────────────────────────────────────────
 *
 * ⚠️ `T-04.4` made the bar scale LINEAR (`gates/T-04.4-design-gate.md` §5). The labels would still be
 * false, by another road: the ticks cover the whole pane, so the upper leg's scale would label the
 * lower half with NEGATIVE USD — a signed number the pane never carries (`RN-3`). The format stays.
 *
 * ⚠️ `W5-QA` (W-b): since `T-04.2` the bars live on NAMED (overlay) scales, and an overlay scale draws
 * no tick label and no crosshair label at all — so today this format is DEFENCE IN DEPTH, not what
 * keeps the axis silent `[MEDIDO 2026-09-27: dropping it from the host leaves `e2e/24` T-01.11-FIX
 * green]`. It bites again the moment a bar scale becomes `right`/`left`; the pixel guard of that is
 * `e2e/24` "RN-3" (pointer in both halves, axis cell unchanged), the source pin is the test beside
 * this file.
 *
 * The axis draws NO tick label for this scale, which is what the pane says about itself (the scale is
 * declared in words in the legend, `data-fact="liquidation_scale:linear"`), and the
 * alternative the design review names (*"o eixo não rotula. O que não pode ficar é um número falso"*).
 * The crosshair label keeps the real value under the pointer (`formatter`, two decimals — the
 * library's own default `priceFormat` precision), and the legend keeps the reading. Nothing about the
 * geometry changes: the format is read by the axis renderer only.
 *
 * Why a per-SERIES format and not `IPriceScaleApi.applyOptions({ visible: false })`: on a `right`
 * scale that call is merged into the CHART's options (`:6863-6868`), and the chart-level
 * `rightPriceScale.visible` decides whether the whole right axis column exists (`:10652`). It would
 * hide the axis of every pane, not of this one.
 */

import type { PriceFormatCustom } from "lightweight-charts";

/** Decimal places of the crosshair label: `lightweight-charts`' default `priceFormat.precision`. */
const CROSSHAIR_PRECISION = 2;

/** A `priceFormat` for a series whose scale must print no tick label. */
export function unlabeledTickPriceFormat(): PriceFormatCustom {
  return {
    type: "custom",
    minMove: 10 ** -CROSSHAIR_PRECISION,
    formatter: (price) => price.toFixed(CROSSHAIR_PRECISION),
    tickmarksFormatter: (prices) => prices.map(() => ""),
  };
}
