/**
 * `paineis-de-fluxo` `T-05.1` — how much history `/symbol` fetches, counted in BARS of the
 * timeframe on screen (`handoff/T-05.1-desenho.md` §2, defect `D-A` of
 * `handoff/FIX-uso-2026-10-02.md`).
 *
 * ── WHAT THIS REPLACES ───────────────────────────────────────────────────────────────────────
 *
 * The window used to be a TIME span (`S2_WINDOW_SPAN_MS = 4 days`, `charts/s2-window.ts`) and the
 * page a count of ONE-MINUTE slots (`DEFAULT_PAGE_SLOTS = 500`), in every timeframe. Four days are
 * 5.760 bars at `1m` but only 96 at `1h` and 24 at `4h`, fewer than the view frames, and a
 * 500-minute page is a third of ONE `4h` bar per page in slot terms. Both are now one row of the
 * table below per timeframe.
 *
 * ── WHY `web`, NOT `charts` ──────────────────────────────────────────────────────────────────
 *
 * How much to FETCH is transport policy, sized by the backend's measured cost: no geometry is
 * computed here. The window itself is still built by `charts::resolveTrailingWindow`.
 *
 * ── THE RULE THE NUMBERS FOLLOW ──────────────────────────────────────────────────────────────
 *
 * No request goes past 7 days of native minutes (10.080). The cost of `/series-history` is
 * proportional to native minutes × revision density, not to bars: 10 series of `1h × 168` cost
 * 7,50–8,43 s of wall clock per screen, against 6,52 s for today's 4 days, and 20 days of `4h`
 * cost 23,90 s `[MEDIDO 2026-10-02, handoff/T-05.1-desenho.md §0b, n=1–3 per row]`. Inside that
 * budget the initial window is 4 days (today's cost), unless 4 days give fewer bars than the view
 * (`VIEW_BARS`), and then it is 7 days.
 *
 * `1h`/`4h` at 7 days is the owner's choice between two declared options
 * `[DECISÃO-OWNER: 2026-10-02, escolha entre alternativas apresentadas]` — the refused one was
 * "4 days, as today" (96 bars at `1h`, 24 at `4h`, same cost).
 *
 * Re-tuning trigger: if `T-05.3` removes the revision density measured on 09-09..09-17 (up to 22
 * rows per minute), re-measure; `4h` could then afford more bars (candidate: 84 = 14 days).
 */

import { SUPPORTED_TIMEFRAMES } from "./supported-timeframes.ts";

/** How many bars the route fetches at mount, and how many one history page adds. */
export interface TimeframeWindowBars {
  readonly initialBars: number;
  readonly pageBars: number;
}

/**
 * One literal row per member of `SUPPORTED_TIMEFRAMES` — `timeframe-window.test.ts` refuses a
 * missing or an extra key, a span that is not a whole number of the window's alignment, a span
 * past 7 days, and an initial window plus one page above the accumulation cap.
 *
 * | TF  | initial            | page              |
 * |-----|--------------------|-------------------|
 * | 1m  | 5.760 bars = 4 d   | 500 bars = 8,3 h  |  unchanged: the TF that already worked
 * | 5m  | 1.152 bars = 4 d   | 288 bars = 1 d    |
 * | 15m |   384 bars = 4 d   | 192 bars = 2 d    |
 * | 1h  |   168 bars = 7 d   | 168 bars = 7 d    |  4 d would be 96 bars, fewer than the view
 * | 4h  |    42 bars = 7 d   |  42 bars = 7 d    |  120 bars would be 20 d = 23,9 s per screen
 */
export const TIMEFRAME_WINDOW_BARS: Readonly<Record<string, TimeframeWindowBars>> = {
  "1m": { initialBars: 5_760, pageBars: 500 },
  "5m": { initialBars: 1_152, pageBars: 288 },
  "15m": { initialBars: 384, pageBars: 192 },
  "1h": { initialBars: 168, pageBars: 168 },
  "4h": { initialBars: 42, pageBars: 42 },
};

/**
 * How many bars the chart frames at mount, in every timeframe (`handoff/T-05.1-desenho.md` §3):
 * the `LEGIBLE_BAR_COUNT` the design gate already called legible, *"~7 px/bar in a 900 px pane"*
 * (`candle-direction-channel.test.ts`), with a hollow interior of at least 3 px. When the window
 * holds fewer bars (`4h`, 42), the view is the whole window.
 */
export const VIEW_BARS = 120;

/** The row of `TIMEFRAME_WINDOW_BARS` for a served `interval`. Throws for any other: `page.tsx`
 * only ever hands a member of `SUPPORTED_TIMEFRAMES` down, so an outsider is a contract violation,
 * never a silent `1m`. */
export function timeframeWindowBars(interval: string): TimeframeWindowBars {
  const isServed = SUPPORTED_TIMEFRAMES.some((option) => option.interval === interval);
  const bars = isServed ? TIMEFRAME_WINDOW_BARS[interval] : undefined;
  if (bars === undefined) {
    throw new RangeError(`timeframeWindowBars: ${JSON.stringify(interval)} has no window row`);
  }
  return bars;
}
