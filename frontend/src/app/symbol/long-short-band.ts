/**
 * `D-1` of `docs/context/cinco-metricas-do-core/gates/design-04.md` §R3.5 — WHERE THE LAST FOUR
 * HOURS ARE, resolved to slot indices so the pane can draw the band the approved study draws.
 *
 * ── WHAT THE FINDING WAS, AND WHY A MODULE ANSWERS IT ────────────────────────────────────────
 *
 * The `design_gate` measured that the approved study (`gates/design-04-rev3.html:260` and `:360`)
 * draws the trailing window TWICE as a `.four-hour-window` element, and that the implementation had
 * *"uma série `Line` e ZERO sobreposição"* — so the recorte existed only as text in the footer. The
 * report's own words: the operator reads *"últimas 4 h: amplitude 0.0917"* and **cannot point at the
 * chart and say where those four hours begin**. `[DOC: gates/design-04.md §R3.5, D-1]`
 *
 * The footer answers *quanto*; this answers *onde*. `[DECISÃO-OWNER 2026-09-16 §D18]` prescribes
 * BOTH ("faixa de 4h + rodapé numérico"), and only the second half had been built.
 *
 * ⛔ IT IS A PURE FUNCTION IN A MODULE OF ITS OWN, for the reason `ratio-format.ts` states in full:
 * this repository has no component renderer in any suite (`@testing-library` is not installed) and
 * `SymbolClient.tsx` imports `lightweight-charts`, which wants a DOM — geometry living there would
 * be provable only by reading source as text. Here it is plain data in, indices out, and
 * `long-short-band.test.ts` exercises it under `node --test`.
 *
 * ⛔ IT MAY NOT REACH THE SERVER: imported by a `"use client"` component, so no `node:*` and no
 * `view-model.ts` (`web-fullstack.browser-imports-server` is a BLOQUEIO).
 */

/** The INCLUSIVE pair of slot indices the trailing band covers: the first and the last BAR inside
 * it. Indices — not pixels and not instants — because the pane feeds `lightweight-charts` one item
 * per slot, in order, so a slot's index IS its logical coordinate on that chart's time scale;
 * asking the library to convert an index is asking it the one question it can answer exactly. The
 * band is drawn over the WHOLE of those bars (`firstIndex - 0.5` to `lastIndex + 0.5`), because a
 * bar's slot is the open of a bar that lasts one step. */
export interface RecentBandSlotRange {
  readonly firstIndex: number;
  readonly lastIndex: number;
}

/** The minimal shape these functions read off a slot. Declared here so the module never imports the
 * server. */
interface TimedSlot {
  readonly time: number;
}

/**
 * ⛔ `T-05.6` (`W7-CODE-REVIEW` R-1): THE CUT IS EXCLUSIVE ON THE LEFT, AND THE BAND IS EXACTLY
 * `spanMs` OF BARS. A slot's `time` is the OPEN of a bar one axis step wide, so the bars whose span
 * lies inside the trailing `spanMs` are the ones that open STRICTLY after `last.time - spanMs`
 * (+ one step, the last bar's own close). The inclusive cut this replaces kept the bar that opens
 * exactly `spanMs` before the last one — a bar that ENDS where the four hours begin — so the band
 * and its footer described `span + 1 step`: 2 bars on `4h` (8 h of data under "Últimas 4 h"),
 * 5 on `1h`, 241 on `1m`. Exclusive, it is 1, 4 and 240: `span / step` bars, every TF.
 */
function insideRecentBand(slot: TimedSlot, lastTimeMs: number, spanMs: number): boolean {
  return slot.time > lastTimeMs - spanMs;
}

/**
 * The slots covered by the trailing band of `spanMs` that ENDS at the window's own last bar.
 *
 * ⛔ THE CUT IS `insideRecentBand`, AND THE FOOTER USES THE SAME ONE: `page.tsx` and
 * `panel-assembly.ts` compute `recentStats` over `recentBandSlots(slots, LONG_SHORT_RECENT_SPAN_MS)`,
 * so the band and the numerals beside it are one set of slots BY CONSTRUCTION. A band drawn over a
 * different set than the footer's would be a second, silent answer to the same question — the class
 * of defect `M-1` of that gate exists to refuse, and the one `W7-CODE-REVIEW` C-1 found: the footer
 * used to cut at `windowEndMsInclusive - span`, an instant on the 1-MINUTE grid, which is the last
 * slot only on `1m`.
 *
 * `null`, and never a fabricated rectangle, when:
 *   - there are no slots, or `spanMs` is not positive (a band of no duration is not a band);
 *   - there is ONE slot: with no neighbour there is no axis step, so nothing says how wide the bar
 *     is and whether it fits inside `spanMs`;
 *   - the axis step is WIDER than `spanMs`: the last bar alone would already cover more than the
 *     span, and a band drawn over it would label a longer stretch "Últimas 4 h".
 *
 * A single bar IS a band when the step equals the span (`4h` on a four-hour band): it covers the
 * whole width of that bar, which is exactly four hours of the axis, not zero.
 *
 * ⚠️ A WINDOW SHORTER THAN THE BAND ANSWERS `{0, last}`, DELIBERATELY: if every slot served is
 * inside the last four hours, then the band really does cover the whole plot, and shrinking it to
 * look more informative would be the screen saying something the data does not.
 */
export function recentBandSlotRange(
  slots: readonly TimedSlot[],
  spanMs: number,
): RecentBandSlotRange | null {
  if (slots.length < 2 || !(spanMs > 0)) {
    return null;
  }
  const lastIndex = slots.length - 1;
  const lastTimeMs = slots[lastIndex]!.time;
  const stepMs = lastTimeMs - slots[lastIndex - 1]!.time;
  if (!(stepMs > 0) || stepMs > spanMs) {
    return null;
  }
  const firstIndex = slots.findIndex((slot) => insideRecentBand(slot, lastTimeMs, spanMs));
  if (firstIndex === -1) {
    return null;
  }
  return { firstIndex, lastIndex };
}

/**
 * The slots the trailing band covers — what the footer's `recentStats` are computed over, in both
 * `page.tsx` (SSR) and `panel-assembly.ts` (the pager). Same objects, same order: it FILTERS, it
 * does not re-grid and it does not shrink to fit (`M-2` of `gates/design-05.md`). Same cut as
 * `recentBandSlotRange` (`insideRecentBand`), so whenever a band is drawn this is exactly its slots.
 *
 * Unlike `recentBandSlotRange` it never refuses a one-slot window: a band that cannot be drawn is
 * not drawn, but the last bar is still the most recent data and the footer still describes it. A
 * non-positive `spanMs` keeps nothing — no duration, no slots.
 */
export function recentBandSlots<T extends TimedSlot>(slots: readonly T[], spanMs: number): readonly T[] {
  if (slots.length === 0 || !(spanMs > 0)) {
    return [];
  }
  const lastTimeMs = slots[slots.length - 1]!.time;
  return slots.filter((slot) => insideRecentBand(slot, lastTimeMs, spanMs));
}

/** The band's horizontal extent in PIXELS: from the left edge of its first bar to the right edge of
 * its last. `lightweight-charts` centres bar `i` on the coordinate of logical `i`, so a bar spans
 * half a bar spacing either side of it. Drawing from centre to centre — what the band did before
 * `T-05.6` — was half a bar short at each end, and a one-bar band (`4h`) had no width at all.
 *
 * ⚠️ FROM CENTRES AND A SPACING, NOT FROM `logicalToCoordinate(i ± 0.5)`: the library answers `0`
 * for any non-integer logical index (`indexToCoordinate`: `if (… || !isInteger(index)) return 0`,
 * `lightweight-charts` 5.2.1) `[MEDIDO 2026-10-02: leftPx=0, rightPx=0 for 40.5/41.5 on 4h]`. The
 * spacing is read off two integer coordinates by the caller, so it is the one on screen. */
export function bandEdgesFromBarCentres(
  firstCentrePx: number,
  lastCentrePx: number,
  barSpacingPx: number,
): { readonly leftPx: number; readonly rightPx: number } {
  const half = barSpacingPx / 2;
  return { leftPx: firstCentrePx - half, rightPx: lastCentrePx + half };
}

/** The band's pixels, clamped to the PLOT (`[0, plotWidthPx]`, the time scale's own width, which
 * stops where the price scale begins), or `null` when nothing of it is left on screen. ⛔ `T-05.6`
 * (`W7-DESIGN-REVIEW` N-1): the band's right border is the anchor of its label, so a band that ran
 * past the plot would carry its label over the price scale with it.
 *
 * `clippedLeft`/`clippedRight` say WHICH side was cut, because a cut side must not draw its border:
 * a border at the plot's edge would say "the four hours begin here" when they begin off screen
 * (on `1m` the default view is about four hours wide, so the band's start is usually just past the
 * left edge). */
export interface ClampedBand {
  readonly leftPx: number;
  readonly widthPx: number;
  readonly clippedLeft: boolean;
  readonly clippedRight: boolean;
}

export function clampBandToPlot(leftPx: number, rightPx: number, plotWidthPx: number): ClampedBand | null {
  const left = Math.max(0, leftPx);
  const right = Math.min(plotWidthPx, rightPx);
  if (!(right > left)) {
    return null;
  }
  return { leftPx: left, widthPx: right - left, clippedLeft: left > leftPx, clippedRight: right < rightPx };
}
