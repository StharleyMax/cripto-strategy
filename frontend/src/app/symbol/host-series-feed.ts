/**
 * `paineis-de-fluxo` `T-01.10` (`ADR-044/D2′`, `handoff/T-01.10-desenho.md` §3 items 2-6) — the
 * ORDER in which the single chart host feeds its series, and the three switches the e2e reads.
 *
 * The panes no longer call `setData` (`HostedPaneBinding.apply` RETURNS its feeds); the host
 * applies, in this order, and nowhere else:
 *   1. the grid CARRIER, with exactly the axis' grid (`charts::gridCarrierItems`) — FIRST, so the
 *      union of the time scale changes once, in one full update, and every `setData` after it
 *      falls in `firstChangedPointIndex = -1` (`lightweight-charts@5.2.1`, `:11852-11868`);
 *   2. every pane feed, filtered by `charts::plotItemsOnly` — or, under the ablation
 *      `?e2eDenseSeries=1`, the lossless items as they were before `T-01.10` (the carrier stays).
 *
 * Kept out of `SymbolClient.tsx` so `node --test` can prove the order (`host-series-feed.test.ts`)
 * without a DOM — the file has no `window` reference; the host hands it `location.search`.
 */

import { gridCarrierItems, plotItemsOnly, type SeriesFeedItem, type TimeAxis } from "../../charts/index.ts";

/** One `setData` the host will make: which series, with which items. */
export interface SeriesFeed<Series> {
  readonly series: Series;
  readonly items: readonly SeriesFeedItem[];
}

/**
 * The ablation of the fix (`T-01.10-desenho.md` §3 item 5): the host feeds the panes the lossless
 * items of before and KEEPS the carrier. Namespaced `e2e…` like `AXIS_SYNC_ABLATION_QUERY_PARAM`
 * (`axis-sync.ts`), and for its reason: a runtime switch lets the SAME build be measured both ways.
 * It is `F-B`'s other arm (`data-page-apply-ms`, dense against sparse, in the same run) and the
 * other arm of the app-side pixel identity (`e2e/25`, arm ii).
 */
export const DENSE_SERIES_ABLATION_QUERY_PARAM = "e2eDenseSeries";

/**
 * `F-C`, the instrument's negative control (`T-01.10-desenho.md` §4): a busy-wait of this many
 * milliseconds inside the host's PAGE effect, on every page. If the intra-gesture interval of
 * `e2e/20` does not move with it, that metric cannot see the page's task and the ceiling proves
 * nothing. Absent, `0`, or not a whole number of milliseconds ⇒ no wait.
 */
export const PAGE_APPLY_BUSY_QUERY_PARAM = "e2ePageApplyBusyMs";

/** Upper bound of the busy-wait: a typo must not freeze the tab. */
export const PAGE_APPLY_BUSY_MAX_MS = 1_000;

export function isDenseSeriesAblationRequested(search: string): boolean {
  return new URLSearchParams(search).get(DENSE_SERIES_ABLATION_QUERY_PARAM) === "1";
}

export function requestedPageApplyBusyMs(search: string): number {
  const raw = new URLSearchParams(search).get(PAGE_APPLY_BUSY_QUERY_PARAM);
  if (raw === null || !/^\d+$/.test(raw)) {
    return 0;
  }
  return Math.min(Number(raw), PAGE_APPLY_BUSY_MAX_MS);
}

/** Spins the main thread for `durationMs` on `now`'s clock — `F-C`'s long task, on purpose. */
export function busyWait(durationMs: number, now: () => number = () => performance.now()): void {
  if (!(durationMs > 0)) {
    return;
  }
  const until = now() + durationMs;
  while (now() < until) {
    // Deliberately empty: the cost IS the loop.
  }
}

/** The pane feeds as the host applies them: plot items only, or lossless under the ablation. */
export function paneSeriesFeeds<Series>(
  paneFeeds: readonly SeriesFeed<Series>[],
  dense: boolean,
): readonly SeriesFeed<Series>[] {
  return dense ? paneFeeds : paneFeeds.map((feed) => ({ series: feed.series, items: plotItemsOnly(feed.items) }));
}

/**
 * Every `setData` of one application (the mount, or a page), in order: the carrier with the whole
 * grid of `axis` FIRST, then the pane feeds (`paneSeriesFeeds`). ⛔ The carrier is never filtered.
 */
export function hostSeriesFeeds<Series>(
  carrier: Series,
  axis: TimeAxis,
  paneFeeds: readonly SeriesFeed<Series>[],
  dense: boolean,
): readonly SeriesFeed<Series>[] {
  return [{ series: carrier, items: gridCarrierItems(axis) }, ...paneSeriesFeeds(paneFeeds, dense)];
}
