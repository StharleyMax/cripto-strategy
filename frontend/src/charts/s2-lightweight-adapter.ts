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

import { dojiItemColors } from "./color-tokens.ts";
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
  /**
   * The DOJI override, and it is present on a doji item ONLY (`open === close`). These three
   * optional fields are `lightweight-charts`'s own per-item escape hatch
   * (`dist/typings.d.ts:841-849`: "Optional color value for certain data item. If missed,
   * color from options is used"), and they exist here because the library has TWO direction
   * branches and `ADR-010/D-2` has THREE states. See `candlestickSeriesLossless`.
   */
  readonly color?: string;
  readonly borderColor?: string;
  readonly wickColor?: string;
}

export interface LineItem {
  readonly time: UnixSeconds;
  readonly value: number;
}

export interface WhitespaceItem {
  readonly time: UnixSeconds;
}

export function toUnixSeconds(timeMs: number): UnixSeconds {
  if (!Number.isInteger(timeMs) || timeMs % 1000 !== 0) {
    throw new RangeError(
      `slot time ${timeMs} is not a whole number of seconds — every grid boundary this ` +
        `codebase uses (1m/5m) is a multiple of 1000ms, so a fraction here means the wrong ` +
        `field was passed in`,
    );
  }
  return timeMs / 1000;
}

/**
 * The correct, lossless mapping for a candlestick series: one item per canonical slot.
 *
 * ── THE DOJI OVERRIDE, AND WHY IT IS ATTACHED HERE AND NOT IN THE SERIES STYLE ──────────────
 *
 * `lightweight-charts` resolves direction with ONE comparison, and the text is the library's:
 *
 *   `const isUp = ensure(currentBar._internal_value[0]) <= ensure(currentBar._internal_value[3]);`
 *   (index `0` is Open and `3` is Close, per the library's own inline labels —
 *   `dist/lightweight-charts.development.mjs:2811`, `lightweight-charts@5.2.1`)
 *
 * `open <= close` means a DOJI (`open === close`) falls into the RISING branch and is painted
 * with `upColor`/`borderUpColor`/`wickUpColor` — byte for byte the rise. There is no third
 * branch to configure, so the third state of `ADR-010/D-2` (`CRUZ (doji) = close == open ⇒
 * DIREÇÃO NÃO AFIRMADA`, `ADR-010:110`) can only be expressed PER ITEM.
 *
 * That is what this function does: a slot whose candle has `open === close` carries
 * `dojiItemColors()` (`provenanceWeak`, luminance-only, zero direction hue). Every other slot
 * is byte for byte what it was before — no color key at all, so the series style decides.
 *
 * ⚠️ `color-tokens.ts` is imported by a MAPPER, and that is deliberate rather than a layering
 * slip: a per-item color IS part of the shape `lightweight-charts` consumes
 * (`CandlestickData.color`, `typings.d.ts:841`), both modules are `charts` (`ADR-003`), and the
 * alternative — a parameter with a default — is the trap `D13` deleted from this palette by
 * name ("the defect stops being a wrong argument and becomes INEXPRESSIBLE").
 */
export function candlestickSeriesLossless(
  slots: readonly GridSlot[],
): readonly (CandlestickItem | WhitespaceItem)[] {
  return slots.map((slot) => {
    const time = toUnixSeconds(slot.time);
    if (slot.candle === null) {
      return { time };
    }
    const { open, high, low, close } = slot.candle;
    return open === close
      ? { time, open, high, low, close, ...dojiItemColors() }
      : { time, open, high, low, close };
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
 * The lossless mapping a LOGARITHMIC price scale can actually consume: one item per canonical
 * slot, `{time, value}` only for a STRICTLY POSITIVE value, `{time}` (whitespace) for an absent
 * slot AND for a legitimate `0`.
 *
 * ⛔ WHY `0` IS ROUTED OUT OF THE BAR SERIES RATHER THAN DRAWN AS A ZERO-HEIGHT BAR — and this
 * is NOT the same decision `lineSeriesLossless` makes. `log10(0)` has no coordinate, so a `0`
 * fed to a log-scale series is a value the scale cannot place; and a zero-height bar at the
 * baseline is, pixel for pixel, the SAME MARK as "nothing was drawn here", which is exactly the
 * collision `STITCH_CONTEXT.md:1821-1825` forbids ("'Não houve liquidação' e 'não sabemos' não
 * são a mesma afirmação"). The legitimate zero does not vanish: it is drawn by
 * `zeroMarkSeries` below, with a mark of its own, and the absent slot by `absenceMarkSeries`.
 * Three states, three distinct marks — which is the whole point.
 *
 * A NEGATIVE value throws, and deliberately: this mapping exists for a non-negative `FLOW`
 * series (traded volume), a negative there is a broken contract upstream, and silently sorting
 * it into one of the three buckets would be this module inventing a meaning for it. Same
 * posture — and same `RangeError` — `toUnixSeconds` already takes for a fractional second.
 */
export function positiveValueSeriesLossless(
  slots: readonly ScalarSlot[],
): readonly (LineItem | WhitespaceItem)[] {
  return slots.map((slot) => {
    const time = toUnixSeconds(slot.time);
    if (slot.value === null || slot.value === 0) {
      return { time };
    }
    if (slot.value < 0) {
      throw new RangeError(
        `slot at ${slot.time} carries the negative value ${slot.value} — this mapping is for a ` +
          `non-negative FLOW series and a logarithmic scale has no coordinate for it`,
      );
    }
    return { time, value: slot.value };
  });
}

/** Every mark series below draws a FIXED-HEIGHT mark, so a mark value of `0` (or of anything
 * non-finite) would draw nothing at all while still looking like a configured mark — the
 * failure this guard exists to make impossible to express. */
function assertDrawableMark(markValue: number): void {
  if (!Number.isFinite(markValue) || markValue <= 0) {
    throw new RangeError(
      `mark value ${markValue} draws no mark — a mark that is not strictly positive is ` +
        `indistinguishable from the absence it is supposed to make visible`,
    );
  }
}

/**
 * THE INVERSE of `positiveValueSeriesLossless` for ABSENT slots: `{time, value: markValue}`
 * exactly where the slot carries NO value, `{time}` (whitespace) everywhere else.
 *
 * Fed to a histogram on a fixed-range price scale, this is `D5.3`'s "lacuna de `FLOW` como
 * traço na linha de base" — the third channel of `STITCH_CONTEXT.md:1821-1825`, which a bare
 * `WhitespaceItem` satisfies only two thirds of: it does not interpolate and it does not zero,
 * but it draws NO MARK, so "não sabemos" and "houve pouquíssimo volume" land on the same
 * pixels (none). `markValue` is the caller's, in the units of whatever fixed range that scale
 * declares — geometry here, form there (`ADR-003` FR-1/FR-2).
 */
export function absenceMarkSeries(
  slots: readonly ScalarSlot[],
  markValue: number,
): readonly (LineItem | WhitespaceItem)[] {
  assertDrawableMark(markValue);
  return slots.map((slot) => {
    const time = toUnixSeconds(slot.time);
    return slot.value === null ? { time, value: markValue } : { time };
  });
}

/**
 * The same shape for a LEGITIMATE ZERO — `{time, value: markValue}` exactly where the provider
 * reported `0`, whitespace everywhere else. The caller gives it a mark DISTINCT from the one it
 * gives `absenceMarkSeries`; keeping them two functions, rather than one with a predicate, is
 * what makes "the two marks are the same" a thing a reader can see rather than a default a
 * refactor can reach by accident.
 *
 * ⚠️ `0` is matched by `===`, so `-0` matches too (`-0 === 0`), and that is correct: a provider
 * that reports `-0` reported zero.
 */
export function zeroMarkSeries(
  slots: readonly ScalarSlot[],
  markValue: number,
): readonly (LineItem | WhitespaceItem)[] {
  assertDrawableMark(markValue);
  return slots.map((slot) => {
    const time = toUnixSeconds(slot.time);
    return slot.value === 0 ? { time, value: markValue } : { time };
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
