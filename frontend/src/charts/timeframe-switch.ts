/**
 * The timeframe-switch anchoring rule — item `2.2b` of
 * `docs/plans/SPEC-008-candle-real-e-eixo-unico/02_eixo_unico.md`, the other half of
 * `D-C3.3` (`docs/context/candle-real-e-eixo-unico/handoff/JULGAMENTO-FRONTEND-ARCHITECT.md:223-255`).
 *
 * `time-axis-controller.ts` (`T-02.2`) already settled WHERE the registered state lives
 * (instants, `TimeRange`, never a logical index) and HOW it converts
 * (`toLogicalRange`/`fromLogicalRange`, no rounding) — that decision is what keeps a plain
 * re-registration across axes error-free by construction: `fromLogicalRange(toLogicalRange(r,
 * a), a)` round-trips `r` exactly, for ANY axis, because the registered value is already an
 * instant and never touches a logical index that belonged to the OLD axis. `D-C3.3`'s
 * `325,3 h`-vs-`2,7 h` measurement is what that decision is FOR: `325,3 h` is what a caller
 * gets by reusing the OLD axis's logical index verbatim as a logical index on the NEW axis
 * (skipping the instant conversion) — the class of bug this module's callers must never
 * commit, reproduced as the negative control in `timeframe-switch.test.ts`.
 *
 * What `time-axis-controller.ts` does NOT decide is WHAT WINDOW to show right after the
 * switch — that is `D-C3.3`'s second, separate decision, and it is what THIS module adds:
 * preserve the RIGHT-EDGE instant exactly, and re-size the window to a FIXED bar count
 * (`~500`), never the old span (`JULGAMENTO-FRONTEND-ARCHITECT.md:252-255`, *"N velas fixo por
 * TF, como no TradingView"*, `[DECISÃO-OWNER: 2026-09-19]`). Preserving the old `spanMs`
 * instead would show `500` `4h` candles for an `8,3h` `1m` selection — `498` of them empty.
 *
 * Pure, in `charts`: no `IChartApi`, no `fetch`, no `jsdom`.
 */

import type { TimeAxis, TimeRange } from "./time-axis-controller.ts";

/**
 * Computes the `TimeRange` to register right after a timeframe switch to `newAxis`, anchored
 * on `currentRange`'s RIGHT EDGE (preserved exactly, unmodified) and sized to exactly
 * `barCount` bars of `newAxis` — `D-C3.3`'s anchoring decision. `currentRange.fromMs` is
 * intentionally never read: the old axis's span is irrelevant to this computation, which is
 * the point of anchoring on an INSTANT rather than a span or a logical index.
 */
export function anchorTimeframeSwitch(
  currentRange: TimeRange,
  barCount: number,
  newAxis: TimeAxis,
): TimeRange {
  if (!(newAxis.stepMs > 0)) {
    throw new RangeError(`newAxis.stepMs must be positive, received ${newAxis.stepMs}`);
  }
  if (!(barCount > 0)) {
    throw new RangeError(`barCount must be positive, received ${barCount}`);
  }
  const toMs = currentRange.toMs;
  const fromMs = toMs - barCount * newAxis.stepMs;
  return { fromMs, toMs };
}
