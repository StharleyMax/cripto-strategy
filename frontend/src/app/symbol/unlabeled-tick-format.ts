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
 * The axis draws NO tick label for this scale, which is what the pane already said about itself
 * (`LiquidationScaleNote`: the height is an order of magnitude, "não uma diferença absoluta"), and the
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
