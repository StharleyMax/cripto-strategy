/**
 * The volume bar takes the direction of the candle it sits under — `paineis-de-fluxo` `T-02.1`,
 * plan `02` items `2.1` + `2.2` (`RF-7`, `RNF-3`, `RN-4`).
 *
 * ── THE RULE, AND WHERE EACH HALF COMES FROM ──────────────────────────────────────────────
 *
 *   - `close >= open` ⇒ `directionUpFill`; otherwise ⇒ `directionDownFill`. `PRD-009` `RF-7`,
 *     literal: "Barra de volume `i` tem a cor de alta se `close_i ≥ open_i` do candle de preço
 *     `i`, e a de baixa caso contrário".
 *   - The two inks are the SAME two tokens the price candle paints with (`RNF-3`: "uma gramática
 *     de cor, não três"). They come out of `colorTokens()`, never a literal, so the candle and
 *     the bar cannot drift apart.
 *   - DOJI (`close === open`) is the RISING ink. That is `[INFERRED: I-3]` of `PRD-009` §12
 *     ("Doji → cor de alta (RF-7)", TradingView convention), owned by the `design_gate`. It is
 *     NOT the price candle's doji, which `dojiItemColors()` paints neutral (`ADR-010:110`,
 *     "DIREÇÃO NÃO AFIRMADA"). The two disagree on purpose until the `design_gate` (`T-02.5`)
 *     says otherwise; this module states the inference instead of hiding it.
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

import { colorTokens } from "./color-tokens.ts";
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
  return candle.close >= candle.open ? tokens.directionUpFill : tokens.directionDownFill;
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
