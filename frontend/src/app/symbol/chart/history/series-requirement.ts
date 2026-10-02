/**
 * `estrutura-do-front` `T-00.1` (`SPEC-011 §3`, `§4.1`, `G-R`) — what a `series-history` indicator
 * asks of the core's history path (SSR in `[symbol]/page.tsx` and the pager), declared by the core.
 *
 * TYPES ONLY, and nothing imports it yet. It lives in `chart/history/` because the pager is core and
 * the core may not import `indicators/**` (`SPEC-011 §5.3`, P2): the pager receives the definitions
 * as an ARGUMENT, and reads them through these types. `indicators/contract.ts` re-uses them.
 *
 * The indicator NAMES its series by slot and a matcher over the catalog's `SeriesKey`; the core
 * resolves, fetches and pages them, and hands the rows back by slot to the indicator's ONE pure
 * `derive`, called by the SSR and by the pager alike (`RN-7`, `ADR-050/D2`).
 */

import type { SeriesKey } from "../../../../features/s3-inspector/series-catalog.ts";
import type { SeriesHistoryRow } from "../../series-history-envelope.ts";

/** One series an indicator needs, under a slot name local to that indicator. */
export interface SeriesRequirement {
  /** The key the rows come back under in `SeriesRowsBySlot`. Unique within one indicator. */
  readonly slot: string;
  /** Whether a catalog entry is this series for `symbol`. Pure. */
  readonly matches: (key: SeriesKey, symbol: string) => boolean;
}

/** The rows of every requirement of one indicator, keyed by `SeriesRequirement.slot`. */
export type SeriesRowsBySlot = Readonly<Record<string, readonly SeriesHistoryRow[]>>;

/** A half-open window, epoch ms (the same shape as `history-page-window.ts`'s window). */
export interface HistoryWindow {
  readonly startMs: number;
  readonly endMsExclusive: number;
}

/**
 * What the core passes to every `derive`, on the server and in the pager. Kept to what every
 * indicator reads; a slice that needs more adds a field here (additive, so no indicator breaks).
 */
export interface DeriveContext {
  readonly symbol: string;
  /** The window these rows cover — one page, or the initial SSR window. */
  readonly window: HistoryWindow;
  /** The bucket width of the rows, ms (the selected timeframe's step). */
  readonly intervalMs: number;
}
