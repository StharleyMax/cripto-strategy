/**
 * `paineis-de-fluxo` `T-01.10` — the two pure halves of `ADR-044/D2′` (the grid is carried by the
 * host, the pane series get plot items only). `charts`, not `web`, because both functions give the
 * library's shape to the data (`ADR-003`); the host (`SymbolClient.tsx`) only orders and applies them.
 *
 * ── WHY THIS EXISTS, MEASURED ────────────────────────────────────────────────────────────────
 *
 * In `lightweight-charts@5.2.1` a whitespace item ALSO creates an entry in the `mapping` of its
 * time point (`dist/lightweight-charts.development.mjs:11590-11602`), and every `setData` walks
 * every point of the time scale and the `mapping` of each (`:11576-11580`, `:11530-11537`,
 * `:11886-11893`). With ONE chart (`T-01.5`) holding the 14 lossless series, each point carries 14
 * entries, and a history page cost 118.6 ms (median) against 71.2 ms with ONE full-grid carrier and
 * the 14 series fed plot items only `[MEDIDO 2026-09-25, n=40 pages,
 * docs/context/paineis-de-fluxo/handoff/T-01.10-desenho.md §2]`.
 *
 * ── WHY IT CHANGES NO PIXEL ──────────────────────────────────────────────────────────────────
 *
 * The time scale's logical indices are the UNION of every series' times. The carrier puts every
 * grid slot in that union, so a pane series that omits its blank slots still lands each plot item
 * on the same logical index it had with the whitespace in place. Measured: 0 of 880×290×4 bytes
 * differ, against 3,952 for a one-value mutant (`e2e/25-sparse-feed-pixel-identity.spec.ts`).
 *
 * ⛔ The lossless adapters (`s2-lightweight-adapter.ts`) do NOT change: `plotItemsOnly` FILTERS
 * their output, so the slot → item mapping keeps a single source. Without a carrier, filtering is
 * exactly `naiveDropGapsLine`'s defect (`D5.11`) — which is why the host applies the carrier FIRST
 * and why `plotItemsOnly` is never applied to the carrier itself (the gaps would collapse).
 */

import { toUnixSeconds, type WhitespaceItem } from "./s2-lightweight-adapter.ts";
import type { TimeAxis } from "./time-axis-controller.ts";

/** Any item the lossless adapters emit: a `{time}` whitespace item or a plot item. */
export interface SeriesFeedItem {
  readonly time: number;
  readonly value?: number;
  readonly open?: number;
}

/**
 * `true` iff the library would DRAW something for `item` — the negation of its own
 * `isWhitespaceData` (`dist/lightweight-charts.development.mjs:11382-11384`:
 * `data.open === undefined && data.value === undefined`), spelled the same way so the two cannot
 * disagree about what a blank is.
 */
export function isPlotItem(item: SeriesFeedItem): boolean {
  return item.open !== undefined || item.value !== undefined;
}

/**
 * The plot items of a lossless series, in their order: every whitespace item dropped, every other
 * item returned AS IS (same object — no field is re-derived here). The result's times are a subset
 * of the input's, which is `ADR-044/D2′(b)`: a pane series never carries a `time` off the grid.
 *
 * ⛔ Only for a PANE series, and only on a chart whose grid is carried (`gridCarrierItems`).
 */
export function plotItemsOnly<T extends SeriesFeedItem>(items: readonly T[]): readonly T[] {
  return items.filter(isPlotItem);
}

/**
 * The carrier's data (`ADR-044/D2′(a)`): one `{time}` per slot of `axis`, and nothing else. The
 * seconds conversion is the adapters' own (`toUnixSeconds`), so the carrier's times and a pane's
 * times are the same numbers by construction, not by coincidence.
 */
export function gridCarrierItems(axis: TimeAxis): readonly WhitespaceItem[] {
  return Array.from({ length: axis.slotCount }, (_, index) => ({
    time: toUnixSeconds(axis.startMs + index * axis.stepMs),
  }));
}
