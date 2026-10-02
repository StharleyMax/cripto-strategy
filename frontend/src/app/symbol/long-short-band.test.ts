/**
 * `D-1` of `gates/design-04.md` §R3.5, turned into a falsifier: the band's slot range is the SAME
 * set of slots the footer's `recentStats` were computed over, and it is `null` — never a rectangle —
 * wherever there is nothing to delimit.
 *
 * ⛔ THE CENTRAL TEST OF THIS FILE IS THE AGREEMENT ONE. A band that covered a different set of
 * slots than the numerals beside it would put two answers to *"quais últimas 4 h"* on one pane, and
 * the operator has no way to tell which is the measurement. So the footer's rule (`recentBandSlots`,
 * which `page.tsx` and `panel-assembly.ts` both call) is compared against the band over the same
 * fixtures — on the `1m` grid AND on the `1h`/`4h` axis grids, where `W7-CODE-REVIEW` C-1 found
 * the two had drifted apart.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { recentBandSlotRange, recentBandSlots } from "./long-short-band.ts";

const ONE_MINUTE_MS = 60_000;
const FOUR_HOURS_MS = 4 * 60 * 60_000;

/** A grid of `count` slots `stepMs` apart ending at `endMs` — the shape `page.tsx` hands the pane
 * (`1m` unless a TF says otherwise). */
function grid(count: number, endMs: number, stepMs: number = ONE_MINUTE_MS): readonly { readonly time: number }[] {
  return Array.from({ length: count }, (_unused, index) => ({
    time: endMs - (count - 1 - index) * stepMs,
  }));
}

/** The pre-`C-1` footer cut (`view-model.ts::slotsFrom` at `windowEndMsInclusive - span`), replanted
 * BY HAND as the reference the band is compared against on `1m`, where the window's last instant
 * IS the last slot. */
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

// ── `W7-CODE-REVIEW` C-1 — the footer's slots (`recentBandSlots`) ARE the band's, on every TF ─────
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;

for (const [label, stepMs, count] of [
  ["1m", ONE_MINUTE_MS, 4 * 24 * 60],
  ["1h", ONE_HOUR_MS, 16],
  ["4h", FOUR_HOURS_MS, 4],
] as const) {
  test(`C-1: on ${label} the footer's slots are EXACTLY the band's`, () => {
    const slots = grid(count, END_MS, stepMs);
    const range = recentBandSlotRange(slots, FOUR_HOURS_MS)!;
    assert.notEqual(range, null);
    assert.deepEqual(recentBandSlots(slots, FOUR_HOURS_MS), slots.slice(range.firstIndex, range.lastIndex + 1));
  });
}

test("C-1 MORDE (control): on 4h the 1-minute cut the footer used to make drops the band's first bar", () => {
  // The axis' last slot is `END_MS`; the request's `windowEndMsInclusive` is one axis step later
  // minus one minute. Cutting there keeps 1 slot where the band shades 2 — the finding, replanted.
  const slots = grid(4, END_MS, FOUR_HOURS_MS);
  const windowEndMsInclusive = END_MS + FOUR_HOURS_MS - ONE_MINUTE_MS;
  assert.equal(slotsFromReplanted(slots, windowEndMsInclusive - FOUR_HOURS_MS).length, 1);
  assert.equal(recentBandSlots(slots, FOUR_HOURS_MS).length, 2);
});

test("recentBandSlots: a FILTER of the same slots, never a re-grid, and empty in, empty out", () => {
  const slots = [
    { time: 1_000, value: 1.4 },
    { time: 61_000, value: 1.5 },
    { time: 121_000, value: 1.6 },
  ];
  assert.deepEqual(recentBandSlots(slots, 60_000), [slots[1], slots[2]], "inclusive on the left — the cut IS a grid instant");
  assert.deepEqual(recentBandSlots(slots, 10 * 60_000), slots);
  assert.deepEqual(recentBandSlots(slots, 0), [slots[2]], "a band that collapses is not drawn, but its slot is still described");
  assert.deepEqual(recentBandSlots([], FOUR_HOURS_MS), []);
  assert.ok(
    recentBandSlots(slots, 60_000).every((slot) => slots.includes(slot)),
    "the objects handed back are the SAME the chart draws — `M-2` of gates/design-05.md",
  );
});
