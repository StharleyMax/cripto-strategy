/**
 * The volume bar takes the direction of the candle it sits under — `paineis-de-fluxo` `T-02.1`,
 * plan `02` items `2.1` + `2.2` (`RF-7`, `RNF-3`, `RN-4`).
 *
 * ── THE RULE, AND WHERE EACH HALF COMES FROM ──────────────────────────────────────────────
 *
 *   - `close > open` ⇒ `directionUpFill`; `close < open` ⇒ `directionDownFill`. The two inks
 *     are the SAME two tokens the price candle paints with (`PRD-009` `RNF-3`: "uma gramática
 *     de cor, não três"). They come out of `colorTokens()`, never a literal, so the candle and
 *     the bar cannot drift apart.
 *   - DOJI (`close === open`) claims NO direction: the bar takes `dojiItemColors().color`, the
 *     very ink the doji candle right above it paints with (`ADR-010/D-2`, `:110`: "CRUZ (doji)
 *     = close == open ⇒ DIREÇÃO NÃO AFIRMADA"; `ADR-010:66` puts "barra" in the `FILL` mark
 *     type). Same predicate as `candlestickSeriesLossless` (`s2-lightweight-adapter.ts`), and
 *     the ink is READ from `dojiItemColors()`, not from a token by name, so the bar cannot
 *     diverge from the candle even if the candle's doji ink changes one day. This overrides
 *     the `[INFERRED: I-3]` "doji = alta" of `PRD-009` `RF-7` and plan `02`: the owner of `I-3`
 *     (the `design_gate`) had already accepted `#8b949e` for the volume doji
 *     (`DESIGN-LAYOUT.md` D3, critique r2 C-6). Decision: `handoff/T-02.1-doji-julgamento.md`.
 *   - NO CANDLE on the bar's slot ⇒ NO DIRECTION: the bar keeps the neutral ink it carries
 *     today (`provenanceWeak`, the one `SymbolClient.tsx` gives the whole volume series before
 *     this phase). `RN-4`: a direction the data does not carry is not drawn. The neutral is
 *     RETURNED EXPLICITLY rather than left to the series default, so a later change of that
 *     default cannot make an orphan bar start claiming a direction.
 *
 * ── WHY THE PAIRING IS BY TIME AND NOT BY ARRAY POSITION ──────────────────────────────────
 *
 * "Slot `i`" in the plan means the same instant on the canonical grid. The two vectors that
 * reach the price pane are NOT guaranteed to share positions: volume is served one row per TF
 * bucket in wire order (`panel-assembly.ts`, the `W1-REVIEW-r2` BLOCKER-2 note), price is the
 * candle grid. Pairing by position would paint bar `i` with a NEIGHBOUR's direction the day
 * the two lengths differ, which is a false statement with no error. Pairing by `time` makes the
 * same misalignment degrade to the neutral ink — no direction claimed where none was matched.
 *
 * `charts` owns this (`ADR-003` FR-1: pure, no I/O); `web` only hands the two slot vectors in.
 */

import { colorTokens, dojiItemColors } from "./color-tokens.ts";
import type { GridSlot, RawCandle } from "./canonical-grid.ts";
import type { ScalarSlot } from "./s2-scalar-grid.ts";
import { toUnixSeconds, type UnixSeconds, type WhitespaceItem } from "./s2-lightweight-adapter.ts";

/** The two fields of a candle the direction reads — nothing else of it matters here. */
export type CandleDirectionInput = Pick<RawCandle, "open" | "close">;

/**
 * The color of volume bar `i`, from the candle at the same instant (`null` = no candle there).
 * Pure; the only input besides the candle is the one palette.
 */
export function volumeBarColor(candle: CandleDirectionInput | null): string {
  const tokens = colorTokens();
  if (candle === null) {
    return tokens.provenanceWeak;
  }
  if (candle.close === candle.open) {
    return dojiItemColors().color;
  }
  return candle.close > candle.open ? tokens.directionUpFill : tokens.directionDownFill;
}

/** A histogram item carrying its own color — `lightweight-charts`' per-item `HistogramData.color`. */
export interface ColoredHistogramItem {
  readonly time: UnixSeconds;
  readonly value: number;
  readonly color: string;
}

/**
 * The volume series for a LOGARITHMIC scale, one item per volume slot, each bar colored by
 * `volumeBarColor` of the candle at the same `time`.
 *
 * The value half is exactly `positiveValueSeriesLossless`: an absent slot and a legitimate `0`
 * are whitespace (their own marks draw them), a negative value throws. Only the `color` is new.
 *
 * A duplicate candle `time` throws: two candles for one instant is a broken grid upstream, and
 * picking one of them would be this module inventing which direction is true.
 */
export function directionalVolumeSeriesLossless(
  volumeSlots: readonly ScalarSlot[],
  priceSlots: readonly GridSlot[],
): readonly (ColoredHistogramItem | WhitespaceItem)[] {
  const candleAt = new Map<number, RawCandle | null>();
  for (const slot of priceSlots) {
    if (candleAt.has(slot.time)) {
      throw new RangeError(`price grid carries two slots for time ${slot.time}`);
    }
    candleAt.set(slot.time, slot.candle);
  }
  return volumeSlots.map((slot) => {
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
    return { time, value: slot.value, color: volumeBarColor(candleAt.get(slot.time) ?? null) };
  });
}
