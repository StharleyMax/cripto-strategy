/**
 * The four days of `data/binance/*` CSV on disk, as an `S2Window` — FOR TESTS, and only tests.
 *
 * ⛔ DELIBERATELY NOT RE-EXPORTED BY `index.ts`. `ADR-034/D8` makes the barrel the one
 * sanctioned crossing point from `web`, and `eslint.config.mjs`'s `src/app/symbol/**` block
 * refuses every deep `charts/...` import — so keeping this out of the barrel means a route
 * CANNOT go back to reading a frozen window even by accident. That is the structural half of
 * the fix `ACHADO-SERIES-HISTORY-SEM-PONTO.md` asked for; `s2-window.ts` is the other half.
 *
 * ── WHY THESE FOUR DAYS ARE STILL THE RIGHT FIXTURE WINDOW (`[MEDIDO 2026-09-03]`, kept
 *    verbatim from `s2-panels.ts`, where it used to live) ────────────────────────────────────
 *
 *   - klines (`data/binance/klines/tf2`): 1m and 15m present and gapless for ALL of
 *     08-20..08-23 (`wc -l BTCUSDT-1m-2026-08-{20,21,22,23}.csv` → 1441 each, 1440 candles).
 *   - OI (`data/binance/metrics`): complete (288/288, sorted, zero duplicates) for 08-20,
 *     08-21, 08-23. NO FILE for 08-22 — a real, whole-day gap.
 *   - aggTrades (`data/binance/aggtrades`): present for 08-20, 08-21, 08-23 (+08-24, outside
 *     this window). NO FILE for 08-22 — the SAME real gap as OI.
 *
 * `08-20T00:00Z .. 08-24T00:00Z` (4 calendar days, exclusive end) therefore gives price zero
 * gaps while OI and CVD share exactly ONE real gap — the whole of 08-22 — instead of a
 * synthetic one ("não fabrique um gap sintetico se ja existe um de verdade"). That is what
 * makes it a good FIXTURE, and it is also exactly what made it a terrible PRODUCTION window:
 * it describes the disk, not the clock.
 */

import { utcDaysCovered, type S2Window } from "./s2-window.ts";

const FIXTURE_START_MS = Date.UTC(2026, 7, 20, 0, 0, 0);
const FIXTURE_END_MS_EXCLUSIVE = Date.UTC(2026, 7, 24, 0, 0, 0);

/** `days` is DERIVED from the two edges, not typed a second time — a fixture whose day list
 * could disagree with its own range is a fixture that can lie about which day is missing. */
export const S2_FIXTURE_WINDOW: S2Window = {
  startMs: FIXTURE_START_MS,
  endMsExclusive: FIXTURE_END_MS_EXCLUSIVE,
  days: utcDaysCovered(FIXTURE_START_MS, FIXTURE_END_MS_EXCLUSIVE),
};
