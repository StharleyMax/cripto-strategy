/**
 * `T-05.5`/`D-C3.6`/`D-C3.7` — the ONE function that decides, for a slot already known to have
 * no point, WHY: `absent` (a real hole inside known coverage), `not-loaded` (outside the window
 * the pager has fetched so far), or `beyond-coverage` (outside what the store/source declares it
 * can ever serve). See `panel-status.ts`'s `SlotCoverageState` docstring for the full reasoning
 * on the three names and why they must stay distinguishable (`RN-1` applied to the time axis).
 *
 * PURE, same discipline every `charts`/pager module in this feature follows: no `fetch`, no
 * `Date.now()`, no DOM — every input is a parameter, so this is testable with a literal fixture,
 * no server and no browser. It is deliberately its OWN module rather than living in
 * `view-model.ts` (which re-exports `computeSeriesKeyId`, `node:crypto`, and therefore cannot be
 * imported by a `"use client"` file — `panel-status.ts`'s own docstring states the same
 * constraint for shapes) — `use-history-pager.ts` and `T-05.6`'s badge both need to call this
 * client-side, after every page the pager fetches.
 *
 * ⛔ THIS FUNCTION DOES NOT DECIDE WHETHER A SLOT HAS A POINT. Call it only for a slot the caller
 * already knows is pointless (`SeriesHistoryRow.value === null` on the row that landed at that
 * grid instant, or no row landed there at all because the window does not reach it yet) — it
 * answers WHY, never WHETHER.
 *
 * ⛔ NEVER INFERS A WALL FROM ROW COUNT. `T-05.7`'s own refs measure why: the store has HOLES IN
 * THE MIDDLE, not a single edge (`klines_volume`: present at day 0, absent at day 6, present
 * again at day 59, absent at day 8 — non-monotonic). The only floors this function trusts are the
 * ones `panel.coverage` declares on the wire (`series-history-envelope.ts`, `D-C3.7`) and the
 * window the pager (`T-05.2`) actually fetched — never a count of how many rows came back.
 */

import type { AccumulatedWindow } from "./history-page-window.ts";
import type { PanelCoverage } from "./series-history-envelope.ts";
import type { SlotCoverageState } from "./panel-status.ts";

/**
 * `slotMs` is the grid instant being classified (a row's `event_time`, or any canonical grid
 * instant the caller is asking about). `fetchedWindow` is the pager's OWN accumulated window
 * (`use-history-pager.ts`'s `AccumulatedWindow` — "a janela já buscada pelo pager de `T-05.2`"),
 * never the request's original window: a slot the pager has since widened past is `not-loaded`
 * no longer, even if the very first SSR render never asked for it. `coverage` is the panel's own
 * `panel.coverage` from the SAME envelope the pager's rows came from — frozen across pages, same
 * as every other static per-series fact `AssemblyStaticContext` already freezes
 * (`panel-assembly.ts`'s own docstring).
 *
 * The floor this function checks on the LEFT is the tighter of the two known walls, same formula
 * `charts/time-axis-controller.ts::historyRequest` already uses to decide when to STOP paging
 * (`coverage.earliest_bucket_ms ?? coverage.source_floor_ms`) — our own store is authoritative
 * whenever it has captured anything at all; the source's wall is the fallback for a store that
 * has captured nothing yet. `null` on either side means UNMEASURED, never "zero"/"unlimited"
 * (`PanelCoverage`'s own docstring) — an unmeasured floor asserts nothing, so a slot below it
 * falls through to `absent` rather than a `beyond-coverage` this function cannot actually prove.
 */
export function classifySlotCoverage(
  slotMs: number,
  fetchedWindow: AccumulatedWindow,
  coverage: PanelCoverage,
): SlotCoverageState {
  if (slotMs < fetchedWindow.startMs || slotMs >= fetchedWindow.endMsExclusive) {
    return "not-loaded";
  }

  const leftFloorMs = coverage.earliest_bucket_ms ?? coverage.source_floor_ms;
  if (leftFloorMs !== null && slotMs < leftFloorMs) {
    return "beyond-coverage";
  }
  if (coverage.latest_bucket_ms !== null && slotMs > coverage.latest_bucket_ms) {
    return "beyond-coverage";
  }

  return "absent";
}
