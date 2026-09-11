/**
 * The window and the as-of instant `/symbol` reads over — derived from ONE clock reading.
 *
 * ── WHAT THIS CLOSES ─────────────────────────────────────────────────────────────────────────
 *
 * `page.tsx` used to build its request from `RANGE_START_MS`/`RANGE_END_MS_EXCLUSIVE`/`DAYS`,
 * three constants of `charts/s2-panels.ts` that named four days of 2026-08 because those were
 * the CSV fixtures on disk when that module was written. `klines_volume` only exists from
 * `2026-09-04` on (`min(bucket_end) = 1788486120000`, 10.705 rows per symbol in `md.series`
 * `[MEDIDO 2026-09-11, docs/context/cinco-metricas-do-core/handoff/
 * ACHADO-SERIES-HISTORY-SEM-PONTO.md]`) ⇒ the route asked `/series-history` for a window that
 * PRECEDES every row that exists, and the screen was empty with every link in the chain
 * working. Nobody could see it because a literal does not fail — it just gets older.
 *
 * ── THE BOUNDARY, AND WHAT THIS MODULE IS CAREFUL NOT TO DO ─────────────────────────────────
 *
 * `ADR-003` FR-2: "`web` does not compute geometry". So this module computes NO bucket
 * boundary: it reads the clock (which is I/O, and therefore `web`'s own business, not
 * `charts`') and hands that reading to `resolveTrailingWindow` (`charts`, pure, reached
 * through the ONE sanctioned barrel of `ADR-034/D8`). Every flooring, every edge, and the day
 * list come back from there.
 *
 * The one instant this module does derive is `knowledgeTimeMs`, and that is NOT geometry: it
 * is the as-of policy of `ADR-005/D1` — "what did we know at T" — which is the transport's
 * question, not the grid's. It computes no bucket and aligns nothing.
 */

import {
  FIVE_MINUTES_MS,
  ONE_MINUTE_MS,
  S2_WINDOW_SPAN_MS,
  resolveTrailingWindow,
  type S2Window,
} from "../../charts/index.ts";

/**
 * How far behind the clock reading the window's right edge stays.
 *
 * NOT cosmetic, and not a guess: `available_at - event_time` was measured at 10.434s /
 * 12.034s / 13.591s on three real `klines_volume` rows (n=3, same handoff). A right edge
 * flush against `now` would therefore include one or two buckets the writer has not published
 * yet, and the panel's "leitura atual" — which reads the window's LAST grid instant — would
 * print `SEM_PONTO` for a bar that exists. That is absence manufactured by the REQUEST;
 * `RN-1` is about absence that is real. Five minutes is ~22× the worst measured lag and is
 * also the coarsest panel grid (OI), so it costs nothing in alignment.
 */
export const RIGHT_EDGE_LAG_MS = FIVE_MINUTES_MS;

/**
 * How far AFTER the window's right edge the as-of instant sits.
 *
 * The last bar of the window closes at `endMsExclusive` and is published ~14s later, so an
 * `as_of` equal to `endMsExclusive` would hide it. One minute covers the measured lag with
 * ~4× margin while still leaving `knowledgeTimeMs` at least `RIGHT_EDGE_LAG_MS -
 * KNOWLEDGE_TIME_LAG_MS` = 4 minutes behind the clock reading — the tolerance against
 * server-clock skew that the old fixed-instant comment in `page.tsx` was protecting, kept
 * explicit instead of bought by freezing the window in the past.
 */
export const KNOWLEDGE_TIME_LAG_MS = ONE_MINUTE_MS;

export interface RouteWindow {
  /** The window itself, geometry included — built by `charts`, never here. */
  readonly window: S2Window;
  /** `window_end_ms` of `HistoryRequestKey`, which is INCLUSIVE (`ADR-034/D9`): the last grid
   * instant of the window, i.e. one minute before its exclusive end. */
  readonly windowEndMsInclusive: number;
  /** `knowledge_time_ms` — see `KNOWLEDGE_TIME_LAG_MS`. */
  readonly knowledgeTimeMs: number;
}

/**
 * `nowMs` is an ARGUMENT, not `Date.now()` read inside: that is what makes this falsifiable at
 * every instant (`request-window.test.ts`) instead of only on whatever day the suite runs.
 * `page.tsx` is the one place that reads the real clock.
 */
export function resolveRouteWindow(nowMs: number): RouteWindow {
  const window = resolveTrailingWindow({
    nowMs,
    lagMs: RIGHT_EDGE_LAG_MS,
    spanMs: S2_WINDOW_SPAN_MS,
    alignmentMs: FIVE_MINUTES_MS,
  });
  return {
    window,
    windowEndMsInclusive: window.endMsExclusive - ONE_MINUTE_MS,
    knowledgeTimeMs: window.endMsExclusive + KNOWLEDGE_TIME_LAG_MS,
  };
}
