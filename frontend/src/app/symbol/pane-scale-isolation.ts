/**
 * `paineis-de-fluxo` `T-01.11-FIX` (`MF-1` of `gates/T-01.11-design-review.md`) — every pane of the
 * ONE chart is created BEFORE any pane mounts its series, so no pane's `right` price scale is born
 * from a sibling pane's options.
 *
 * ── THE DEFECT, READ IN THE LIBRARY AND MEASURED ON THE REAL APP ─────────────────────────────
 *
 * In `lightweight-charts@5.2.1`, `IPriceScaleApi.applyOptions` on a `left`/`right` scale does TWO
 * things (`dist/lightweight-charts.development.mjs:6843-6872`, `_internal_applyPriceScaleOptions`):
 * it applies the options to that pane's scale, AND it `merge`s them into the CHART's own
 * `rightPriceScale` options. Those chart options are the template every pane created LATER builds
 * its `right` scale from (`:5271-5272`, `Pane` constructor → `_private__createPriceScale`).
 *
 * The host used to create the panes lazily, one per `addSeries(…, paneIndex)`, in registry order.
 * The two liquidation panes (index 1 and 2) put their bar scale in `PriceScaleMode.Logarithmic`
 * — by design — and so the OI, long/short and CVD panes (3, 4, 5), created after them, were born
 * LOGARITHMIC. Read back from the chart on the real app `[MEDIDO 2026-09-25, window.__chart debug
 * build of 9a62b13, BTCUSDT 1m: priceScale('right', i).options().mode = 1 for i = 3, 4, 5]`. The
 * CVD delta goes negative, the sign-log scale is extrapolated across the legend reserve, and the
 * axis printed `3.99999999e+36` / `−2e+22` — `MF-1`. OI and long/short had no visible explosion
 * (positive values), which is why the review saw one pane and not three.
 *
 * The six-chart build in production never had it: one `createChart` per pane, one template each.
 *
 * ── WHY CREATING THE PANES FIRST IS THE FIX, AND NOT "SET mode ON EVERY PANE" ────────────────
 *
 * Re-stating `mode: Normal` on the three panes would repair today's three and leave the NEXT pane
 * (phases `02`-`04` add panes to this registry) to inherit whatever the last `applyOptions` wrote —
 * the template leaks margins too, not only the mode. With every pane created while the template is
 * still the constructor's, a later `applyOptions` still merges into the template, but no pane is
 * ever built from it again. The defect becomes structurally unreachable instead of patched per pane.
 *
 * `preserveEmptyPane = true` because the library removes an empty pane when a series leaves it
 * (`:7380-7381`); these panes are empty only for the instant between creation and `mount`.
 */

import type { IChartApi } from "lightweight-charts";

/** The two methods this needs — a narrow type so the headless test can hand it a real chart. */
export type PaneFactory = Pick<IChartApi, "panes" | "addPane">;

/**
 * Makes `chart` hold at least `paneCount` panes, adding empty ones at the end. Returns how many it
 * added. Call it right after `createChart`, before the first `addSeries(…, paneIndex)` of any pane.
 */
export function createPanesBeforeSeries(chart: PaneFactory, paneCount: number): number {
  if (!Number.isInteger(paneCount) || paneCount < 1) {
    throw new RangeError(`pane count must be a positive integer, received ${paneCount}`);
  }
  let added = 0;
  while (chart.panes().length < paneCount) {
    chart.addPane(true);
    added += 1;
  }
  return added;
}
