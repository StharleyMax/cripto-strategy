/**
 * `D-1` of `gates/design-04.md` §R3.5, turned into a falsifier: the band's slot range is the SAME
 * set of slots the footer's `recentStats` were computed over, and it is `null` — never a rectangle —
 * wherever there is nothing to delimit.
 *
 * ⛔ THE CENTRAL TEST OF THIS FILE IS THE AGREEMENT ONE. A band that covered a different set of
 * slots than the numerals beside it would put two answers to *"quais últimas 4 h"* on one pane, and
 * the operator has no way to tell which is the measurement. So `slotsFrom`'s own rule is replanted
 * here and the two are compared over the same fixture — if `page.tsx` ever changes one, this bites.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { recentBandSlotRange } from "./long-short-band.ts";

const ONE_MINUTE_MS = 60_000;
const FOUR_HOURS_MS = 4 * 60 * 60_000;

/** A `1m` grid of `count` slots ending at `endMs` — the shape `page.tsx` hands the pane. */
function grid(count: number, endMs: number): readonly { readonly time: number }[] {
  return Array.from({ length: count }, (_unused, index) => ({
    time: endMs - (count - 1 - index) * ONE_MINUTE_MS,
  }));
}

/** `view-model.ts::slotsFrom`, replanted BY HAND — importing it would pull the server half
 * (`node:crypto`) into a module this file exists to keep client-safe, and a contract guarded by
 * importing the thing it guards renames itself along with the defect. */
function slotsFromReplanted<T extends { readonly time: number }>(slots: readonly T[], sinceMs: number): readonly T[] {
  return slots.filter((slot) => slot.time >= sinceMs);
}

const END_MS = Date.UTC(2026, 8, 16, 12, 0, 0);

test("D-1: the band is the LAST `spanMs` of the grid, inclusive on both ends", () => {
  // 4 days of `1m` slots, the route's real window.
  const slots = grid(4 * 24 * 60, END_MS);
  const range = recentBandSlotRange(slots, FOUR_HOURS_MS);
  assert.notEqual(range, null);
  assert.equal(range!.lastIndex, slots.length - 1, "the band ends at the window's own last instant");
  assert.equal(slots[range!.firstIndex]!.time, END_MS - FOUR_HOURS_MS, "and starts exactly `spanMs` before it");
  assert.equal(range!.lastIndex - range!.firstIndex, FOUR_HOURS_MS / ONE_MINUTE_MS, "240 minutes, 240 intervals");
});

test("D-1: the band covers EXACTLY the slots the footer's `recentStats` were computed over", () => {
  // ⛔ THE AGREEMENT THIS MODULE EXISTS FOR. `page.tsx` computes the numerals with
  // `slotsFrom(slots, windowEndMsInclusive - span)`; the band must delimit that same set.
  const slots = grid(4 * 24 * 60, END_MS);
  const range = recentBandSlotRange(slots, FOUR_HOURS_MS)!;
  const byFooterRule = slotsFromReplanted(slots, END_MS - FOUR_HOURS_MS);
  const byBand = slots.slice(range.firstIndex, range.lastIndex + 1);
  assert.deepEqual(byBand, byFooterRule, "the band delimits a different set of slots than the numerals describe");
});

test("D-1 MORDE: an off-by-one band is REJECTED by the agreement above", () => {
  // The mutation that a `>` instead of `>=` (or a `+ 1` on the index) would produce. Replanted so
  // the test above is shown to bite rather than asserted to.
  const slots = grid(4 * 24 * 60, END_MS);
  const range = recentBandSlotRange(slots, FOUR_HOURS_MS)!;
  const mutated = slots.slice(range.firstIndex + 1, range.lastIndex + 1);
  const byFooterRule = slotsFromReplanted(slots, END_MS - FOUR_HOURS_MS);
  assert.notDeepEqual(mutated, byFooterRule, "a one-slot shift is invisible to the assert above — the guard is vacuous");
});

test("D-1: nothing to delimit answers `null`, never a rectangle", () => {
  assert.equal(recentBandSlotRange([], FOUR_HOURS_MS), null, "no slots, no band");
  assert.equal(recentBandSlotRange(grid(240, END_MS), 0), null, "a band of no duration is not a band");
  assert.equal(recentBandSlotRange(grid(240, END_MS), -1), null, "nor is a negative one");
  assert.equal(
    recentBandSlotRange(grid(1, END_MS), FOUR_HOURS_MS),
    null,
    "one slot: the two borders would coincide and assert a window of zero width",
  );
  assert.equal(
    recentBandSlotRange(grid(240, END_MS), ONE_MINUTE_MS / 2),
    null,
    "a span narrower than the grid collapses onto the last slot — no band, and no fabricated one",
  );
});

test("D-1: a window SHORTER than the band covers the whole plot, and says so", () => {
  // Declared rather than special-cased: if every slot served is inside the last four hours, the
  // band really is the whole plot, and shrinking it to look informative would be the screen
  // asserting a boundary the data does not have.
  const slots = grid(60, END_MS);
  const range = recentBandSlotRange(slots, FOUR_HOURS_MS);
  assert.deepEqual(range, { firstIndex: 0, lastIndex: 59 });
});

test("D-1: the range is read off the LAST slot, not off a clock", () => {
  // The pane renders server-computed data; a band anchored on `Date.now()` would drift from the
  // window the server declared in `<main data-window-end-ms-inclusive>` by however long the render
  // took. Two grids that differ only in their end instant must produce the same INDICES.
  const early = recentBandSlotRange(grid(1_000, END_MS), FOUR_HOURS_MS);
  const late = recentBandSlotRange(grid(1_000, END_MS + 86_400_000), FOUR_HOURS_MS);
  assert.deepEqual(early, late);
});
