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

/** The half-open-free, INCLUSIVE pair of slot indices the trailing band covers. Indices — not
 * pixels and not instants — because the pane feeds `lightweight-charts` one item per slot, in
 * order, so a slot's index IS its logical coordinate on that chart's time scale; asking the library
 * to convert an index is asking it the one question it can answer exactly. */
export interface RecentBandSlotRange {
  readonly firstIndex: number;
  readonly lastIndex: number;
}

/** The minimal shape this function reads off a slot — the same structural subset
 * `view-model.ts::slotsFrom` filters on. Declared here so the module never imports the server. */
interface TimedSlot {
  readonly time: number;
}

/**
 * The slots covered by the trailing band of `spanMs` that ENDS at the window's own last instant.
 *
 * ⛔ THE RULE IS `slotsFrom`'s, TO THE CHARACTER — `time >= last.time - spanMs` — and the identity
 * is the point, not a coincidence: `page.tsx` computes `recentStats` with
 * `slotsFrom(slots, windowEndMsInclusive - LONG_SHORT_RECENT_SPAN_MS)`, and the last slot of the
 * route's grid IS `windowEndMsInclusive`. A band drawn over a different set of slots than the one
 * the footer's numerals were computed over would be a second, silent answer to the same question —
 * the class of defect `M-1` of that gate exists to refuse.
 *
 * `null`, and never a fabricated rectangle, when:
 *   - there are no slots (nothing to date, and the empty state says so in words);
 *   - `spanMs` is not positive (a band of no duration is not a band);
 *   - the band collapses onto a single slot, where the two borders would coincide and the mark
 *     would assert a window of zero width.
 *
 * ⚠️ A WINDOW SHORTER THAN THE BAND ANSWERS `{0, last}`, DELIBERATELY: if every slot served is
 * inside the last four hours, then the band really does cover the whole plot, and shrinking it to
 * look more informative would be the screen saying something the data does not.
 */
export function recentBandSlotRange(
  slots: readonly TimedSlot[],
  spanMs: number,
): RecentBandSlotRange | null {
  if (slots.length === 0 || !(spanMs > 0)) {
    return null;
  }
  const lastIndex = slots.length - 1;
  const sinceMs = slots[lastIndex]!.time - spanMs;
  const firstIndex = slots.findIndex((slot) => slot.time >= sinceMs);
  if (firstIndex === -1 || firstIndex >= lastIndex) {
    return null;
  }
  return { firstIndex, lastIndex };
}
