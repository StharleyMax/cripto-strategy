/**
 * Maps `GridSlot`/`ScalarSlot` arrays onto the shapes `lightweight-charts` v5 consumes —
 * the FIRST real render call site for `T-05.1`'s grid (`T-05.2` handoff, literal: "confirm
 * whether GridSlot's null-gap slots survive as lossless placeholders when handed to the
 * actual Lightweight Charts library call").
 *
 * ── THE MECHANISM, NAMED BEFORE IT IS USED ────────────────────────────────────────────────
 *
 * `lightweight-charts` has a first-class concept for exactly this case: `WhitespaceData`,
 * `{ time }` with NO value fields. A series fed `[bar, bar, {time}, bar, ...]` keeps one
 * entry per `time` — the whitespace entries occupy an axis position and are not drawn, but
 * they are NOT dropped (verified against the library itself, not assumed, in
 * `s2-axis-integration.test.ts`: `series.data().length` after `setData` equals the input
 * array length, whitespace included).
 *
 * `LOSSLESS(slot)` is the correct mapping this task ships: one item per canonical slot,
 * `candle`/`value` when present, `{time}` when the slot is `null`.
 *
 * `naiveDropGaps(...)` is the WRONG mapping, included ONLY as the negative control that
 * `s2-axis-integration.test.ts` uses to demonstrate what breaks if a future caller "cleans
 * up" a series by filtering out `null` slots before calling `setData` — it is dead code from
 * production's point of view and is exported for exactly one reason: to be fed to the same
 * chart the lossless mapping is, so the T-08.2 ordinal-axis risk can be shown to reproduce
 * on real data when this rule is violated, not just asserted away.
 *
 * TIME UNITS: `lightweight-charts`'s UTC-timestamp business day/time format is UNIX SECONDS,
 * not epoch milliseconds — `GridSlot.time`/`ScalarSlot.time` are epoch MILLISECONDS UTC
 * (`canonical-grid.ts`'s own docstring). Every function below divides by 1000 exactly once,
 * at this boundary, so the conversion happens in ONE place.
 */

import type { GridSlot } from "./canonical-grid.ts";
import type { ScalarSlot } from "./s2-scalar-grid.ts";

/** `UTCTimestamp` in `lightweight-charts` terms: UNIX seconds, not epoch milliseconds. */
export type UnixSeconds = number;

export interface CandlestickItem {
  readonly time: UnixSeconds;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
}

export interface LineItem {
  readonly time: UnixSeconds;
  readonly value: number;
}

export interface WhitespaceItem {
  readonly time: UnixSeconds;
}

function toUnixSeconds(timeMs: number): UnixSeconds {
  if (!Number.isInteger(timeMs) || timeMs % 1000 !== 0) {
    throw new RangeError(
      `slot time ${timeMs} is not a whole number of seconds — every grid boundary this ` +
        `codebase uses (1m/5m) is a multiple of 1000ms, so a fraction here means the wrong ` +
        `field was passed in`,
    );
  }
  return timeMs / 1000;
}

/** The correct, lossless mapping for a candlestick series: one item per canonical slot. */
export function candlestickSeriesLossless(
  slots: readonly GridSlot[],
): readonly (CandlestickItem | WhitespaceItem)[] {
  return slots.map((slot) => {
    const time = toUnixSeconds(slot.time);
    return slot.candle === null
      ? { time }
      : { time, open: slot.candle.open, high: slot.candle.high, low: slot.candle.low, close: slot.candle.close };
  });
}

/** The correct, lossless mapping for a line series: one item per canonical slot. */
export function lineSeriesLossless(slots: readonly ScalarSlot[]): readonly (LineItem | WhitespaceItem)[] {
  return slots.map((slot) => {
    const time = toUnixSeconds(slot.time);
    return slot.value === null ? { time } : { time, value: slot.value };
  });
}

/**
 * THE NEGATIVE CONTROL — filters out gap slots instead of emitting whitespace for them.
 * See the module docstring: this exists only to be fed to a chart and shown to fail D5.11,
 * not to be used by any real caller.
 */
export function naiveDropGapsLine(slots: readonly ScalarSlot[]): readonly LineItem[] {
  return slots
    .filter((slot): slot is ScalarSlot & { value: number } => slot.value !== null)
    .map((slot) => ({ time: toUnixSeconds(slot.time), value: slot.value }));
}
