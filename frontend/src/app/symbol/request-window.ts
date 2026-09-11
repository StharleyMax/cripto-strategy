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
  lastGridInstant,
  resolveTrailingWindow,
  type S2Window,
} from "../../charts/index.ts";

/**
 * THE MEASUREMENT BOTH CONSTANTS BELOW ARE SIZED AGAINST — one number, one command, one `n`.
 *
 * `available_at - bucket_end` over `md.series`, split by class, `series_key_id ef3033e6…4e42`
 * (BTCUSDT `klines_volume`) `[DOC: docs/context/cinco-metricas-do-core/handoff/
 * ACHADO-BACKFILL-INVISIVEL-AO-AS-OF.md, MEDIDO 2026-09-11]`:
 *
 *     SELECT CASE WHEN available_at - bucket_end > 300000 THEN 'backfill' ELSE 'ao vivo' END,
 *            count(*), min(available_at-bucket_end)/1000, max(available_at-bucket_end)/1000
 *     FROM md.series WHERE series_key_id='ef3033e6…4e42' GROUP BY 1;
 *
 *     ao vivo   n =    804   min   0 s   max  267 s
 *     backfill  n = 20.148   min 306 s   max  604.703 s (≈ 7 dias)
 *
 * ⚠️ The `n=3` sample these two constants used to be justified with (10.434s / 12.034s /
 * 13.591s, `ACHADO-SERIES-HISTORY-SEM-PONTO.md`) is the TAIL-FREE part of that same
 * distribution: it is not wrong, it is 19× too small to size a margin with. Replaced by the
 * `n=804` above on the `quant-architect` gate of wave `03` (C2).
 *
 * `[NÃO MEDIDO nesta sessão]`: p50/p99 of the live class. The percentile query needs `psql`
 * against the shared Postgres and this session could not run it, so both constants below are
 * sized against the MAXIMUM (267 s), which is the conservative end. The backfill class is NOT
 * coverable by any constant here — `604.703 s` of lag is the `ADR-006`/`SPEC-001` §5.11
 * question about what `available_at` MEANS for imported history, and it is not `web`'s.
 */
export const LIVE_PUBLICATION_LAG_MAX_MS = 267_000;

/**
 * How far behind the clock reading the window's right edge stays.
 *
 * ⛔ WHAT IT DOES NOT BUY, because the previous version of this docstring claimed it and the
 * claim was FALSE (`quant-architect`, wave `03`, C2): it does not buy anything against
 * `SEM_PONTO`. `R-1` is `available_at <= t` with `t` the GRID INSTANT, not the wall clock
 * (`backend/src/modules/sentimento/domain/as_of_accessor.py:37,311`), so pulling the right
 * edge back moves `t` and the bar it admits together — the relation is INVARIANT under this
 * constant, and no value of it can turn a `SEM_PONTO` into a number.
 *
 * What it does buy, and each of the three is real:
 *   1. the window never reaches past the backend's own `server_now_ms` (which answers `422`);
 *   2. `knowledgeTimeMs` stays strictly behind the clock reading — see below, it is
 *      `RIGHT_EDGE_LAG_MS - KNOWLEDGE_TIME_LAG_MS` of headroom and nothing else provides it;
 *   3. tolerance for clock skew between this Node process and the writer's host.
 *
 * NONE of the three is sized by the publication lag. Five minutes is chosen because it is the
 * coarsest panel grid (OI's native step), so it costs zero in alignment.
 */
export const RIGHT_EDGE_LAG_MS = FIVE_MINUTES_MS;

/**
 * How far AFTER the window's right edge the as-of instant sits.
 *
 * THIS is the constant the publication lag sizes, via the OTHER admission predicate:
 * `observed_at <= knowledge_time` (`as_of_accessor.py:310`). The bar the page reads out sits
 * at `windowEndMsInclusive` (one minute before the exclusive edge) and is observed ~`lag`
 * after its own bucket closes, so the tolerance this constant grants is
 *
 *     lag <= KNOWLEDGE_TIME_LAG_MS + ONE_MINUTE_MS
 *
 * At the previous value (`ONE_MINUTE_MS`) that was **120 s against a measured maximum of
 * 267 s** — a margin of `0,45×`, i.e. the tail was simply outside. At `4 min` it is **300 s
 * against 267 s = 1,12×**, and the tail is inside. (The gate states the same tolerance as
 * `180 s`/`0,67×` because it counts from a `bucket_end` two minutes before the exclusive edge
 * — the bar `R-1` admits AT the last grid instant; the form written here counts from the
 * readout instant itself, which is one grid step tighter, and the tighter one is what the test
 * asserts.)
 *
 * ⛔ WHY NOT MORE, since more looks free: it is not. `knowledgeTimeMs = endMsExclusive +
 * KNOWLEDGE_TIME_LAG_MS` and `endMsExclusive <= nowMs - RIGHT_EDGE_LAG_MS`, so the invariant
 * `knowledgeTimeMs < nowMs` (a `422` if violated, `request-window.test.ts`) holds only while
 * `KNOWLEDGE_TIME_LAG_MS < RIGHT_EDGE_LAG_MS`. The `>= 300_000` the gate suggested is exactly
 * the boundary: at a clock reading already aligned to 5 minutes it produces
 * `knowledgeTimeMs === nowMs`, which asks the backend about the present instant. `4 min` is
 * the largest round value that keeps 60 s of skew headroom, and the cost of that choice is
 * declared: the skew tolerance drops from 4 min to 1 min.
 *
 * ⚠️ AND IT STILL DOES NOT COVER EVERYTHING, stated rather than hidden: for the bar at the very
 * last grid instant, `R-1` (`available_at <= t`) binds BEFORE this predicate does, and `R-1` is
 * invariant under both constants. A row whose lag exceeds one grid step is not hidden by this
 * request — it is simply not knowable yet at that instant, which is absence that is REAL
 * (`RN-1`) and the readout correctly prints `SEM_PONTO` for it.
 */
export const KNOWLEDGE_TIME_LAG_MS = 4 * ONE_MINUTE_MS;

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
    // ⚠️ `alignmentMs` IS THE COARSEST GRID THIS PAGE DRAWS, and today that is OI's 5 minutes.
    // The day a 15m/1h/4h aggregate is drawn over this same window, THIS ARGUMENT HAS TO RISE
    // WITH IT — a 5-minute-aligned edge lands on a 15m boundary in only 33,3% of clock
    // readings, on a 1h boundary in 8,3% and on a 4h boundary in 2,1% `[MEDIDO 2026-09-11,
    // n=1440 leituras de minuto, gate WAVE-03-janela-deslizante-quant-architect.md §1]`. The
    // window stays VALID when that happens; it is the outermost bars that get cut, which is a
    // silent wrongness, not an error. (`quant-architect`, wave `03`, C1.)
    spanMs: S2_WINDOW_SPAN_MS,
    alignmentMs: FIVE_MINUTES_MS,
  });
  return {
    window,
    // The half-open → inclusive conversion is `charts`' (`ADR-003` FR-2), and it takes the
    // FINEST grid this route queries (`interval: "1m"`), not the alignment above.
    windowEndMsInclusive: lastGridInstant(window, ONE_MINUTE_MS),
    knowledgeTimeMs: window.endMsExclusive + KNOWLEDGE_TIME_LAG_MS,
  };
}
