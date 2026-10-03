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
 * the two had drifted apart. Since `T-05.6` (R-1) both cut EXCLUSIVE on the left: `span / step` bars.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { bandEdgesFromBarCentres, clampBandToPlot, recentBandSlotRange, recentBandSlots } from "./long-short-band.ts";

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
 * BY HAND — the control the `C-1` tests below compare against. */
function slotsFromReplanted<T extends { readonly time: number }>(slots: readonly T[], sinceMs: number): readonly T[] {
  return slots.filter((slot) => slot.time >= sinceMs);
}

/** The pre-`T-05.6` band cut, INCLUSIVE on the left (`slot.time >= last - span`), replanted BY HAND
 * so the R-1 tests below are shown to reject it rather than asserted to. */
function inclusiveCutReplanted<T extends { readonly time: number }>(slots: readonly T[], spanMs: number): readonly T[] {
  const lastTimeMs = slots[slots.length - 1]!.time;
  return slots.filter((slot) => slot.time >= lastTimeMs - spanMs);
}

const END_MS = Date.UTC(2026, 8, 16, 12, 0, 0);
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;

// ── `T-05.6` (`W7-CODE-REVIEW` R-1) — the band is `span / step` BARS, on every TF ─────────────
//
// A slot is the OPEN of a bar one step wide. "Últimas 4 h" are the bars that open strictly after
// `last - 4h`: 240 on `1m`, 4 on `1h`, 1 on `4h`. The inclusive cut added the bar that ENDS where
// the four hours begin — 241 / 5 / 2, i.e. 8 h of data under the label on `4h`.
for (const [label, stepMs, count, expectedBars] of [
  ["1m", ONE_MINUTE_MS, 4 * 24 * 60, 240],
  ["1h", ONE_HOUR_MS, 4 * 24, 4],
  ["4h", FOUR_HOURS_MS, 4 * 6, 1],
] as const) {
  test(`R-1 MORDE: on ${label} the band is ${expectedBars} bar(s) — span / step, never span / step + 1`, () => {
    const slots = grid(count, END_MS, stepMs);
    const range = recentBandSlotRange(slots, FOUR_HOURS_MS);
    assert.notEqual(range, null, `on ${label} a four-hour band must be drawn`);
    assert.equal(range!.lastIndex, slots.length - 1, "the band ends at the window's own last bar");
    assert.equal(range!.lastIndex - range!.firstIndex + 1, expectedBars);
    assert.equal(
      slots[range!.firstIndex]!.time,
      END_MS - FOUR_HOURS_MS + stepMs,
      "its first bar opens one step after `last - span`, so the bars span exactly `span`",
    );
    assert.equal(recentBandSlots(slots, FOUR_HOURS_MS).length, expectedBars, "and the footer counts the same bars");
  });

  test(`R-1 (control): on ${label} the inclusive cut is ${expectedBars + 1} bars, which the test above rejects`, () => {
    assert.equal(inclusiveCutReplanted(grid(count, END_MS, stepMs), FOUR_HOURS_MS).length, expectedBars + 1);
  });
}

test("D-1: nothing to delimit answers `null`, never a rectangle", () => {
  assert.equal(recentBandSlotRange([], FOUR_HOURS_MS), null, "no slots, no band");
  assert.equal(recentBandSlotRange(grid(240, END_MS), 0), null, "a band of no duration is not a band");
  assert.equal(recentBandSlotRange(grid(240, END_MS), -1), null, "nor is a negative one");
  assert.equal(
    recentBandSlotRange(grid(1, END_MS), FOUR_HOURS_MS),
    null,
    "one slot: no neighbour, no step, so nothing says the bar fits inside the span",
  );
  assert.equal(
    recentBandSlotRange(grid(240, END_MS), ONE_MINUTE_MS / 2),
    null,
    "a span narrower than one bar — the last bar alone would cover more than the label says",
  );
  assert.equal(
    recentBandSlotRange(grid(10, END_MS, 24 * ONE_HOUR_MS), FOUR_HOURS_MS),
    null,
    "a 1-day bar is not 'the last 4 h'",
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

test("C-1 MORDE (control): on 1m the 1-minute cut the footer used to make keeps one slot MORE than the band", () => {
  // The pre-`C-1` footer cut at `windowEndMsInclusive - span`, INCLUSIVE. On `1m` the request's last
  // instant IS the axis' last slot, so it keeps 241 slots beside a 240-bar band — the agreement test
  // above rejects that. (On `1h`/`4h` it lands one minute short of the next bar and happens to keep
  // the same 4 / 1 bars as the exclusive band, which is why the agreement test, not a TF, guards C-1.)
  const slots = grid(4 * 24 * 60, END_MS);
  assert.equal(slotsFromReplanted(slots, END_MS - FOUR_HOURS_MS).length, 241);
  assert.equal(recentBandSlots(slots, FOUR_HOURS_MS).length, 240);
});

test("recentBandSlots: a FILTER of the same slots, never a re-grid, and empty in, empty out", () => {
  const slots = [
    { time: 1_000, value: 1.4 },
    { time: 61_000, value: 1.5 },
    { time: 121_000, value: 1.6 },
  ];
  assert.deepEqual(recentBandSlots(slots, 60_000), [slots[2]], "exclusive on the left — one step is one bar");
  assert.deepEqual(recentBandSlots(slots, 120_000), [slots[1], slots[2]]);
  assert.deepEqual(recentBandSlots(slots, 10 * 60_000), slots);
  assert.deepEqual(recentBandSlots(slots, 0), [], "no duration, no slots");
  assert.deepEqual(recentBandSlots([], FOUR_HOURS_MS), []);
  assert.ok(
    recentBandSlots(slots, 120_000).every((slot) => slots.includes(slot)),
    "the SAME objects, never copies — it filters, it does not re-grid",
  );
});

// ── `T-05.6` (`W7-DESIGN-REVIEW` N-1) — the band covers WHOLE bars and stays inside the plot ─────
test("N-1: the band runs from the left edge of its first bar to the right edge of its last", () => {
  assert.deepEqual(bandEdgesFromBarCentres(1157, 1157, 28), { leftPx: 1143, rightPx: 1171 }, "one bar on 4h is one bar wide");
  assert.deepEqual(bandEdgesFromBarCentres(900, 921, 7), { leftPx: 896.5, rightPx: 924.5 }, "four bars on 1h, 4 x 7 px");
});

test("N-1 MORDE (control): centre to centre, a one-bar band (4h) has no width at all", () => {
  const firstCentrePx = 1157;
  const lastCentrePx = 1157;
  assert.equal(lastCentrePx - firstCentrePx, 0, "the pre-T-05.6 geometry — the reason the edges are half a bar out");
  const edges = bandEdgesFromBarCentres(firstCentrePx, lastCentrePx, 28);
  assert.equal(edges.rightPx - edges.leftPx, 28, "one bar, one bar spacing of axis");
});

test("N-1: the band is clamped to the plot, so its right border — the label's anchor — never passes the price scale", () => {
  assert.deepEqual(clampBandToPlot(900, 950, 944), { leftPx: 900, widthPx: 44, clippedLeft: false, clippedRight: true });
  assert.deepEqual(clampBandToPlot(-10, 40, 944), { leftPx: 0, widthPx: 40, clippedLeft: true, clippedRight: false });
  assert.deepEqual(
    clampBandToPlot(100, 140, 944),
    { leftPx: 100, widthPx: 40, clippedLeft: false, clippedRight: false },
    "inside, untouched",
  );
  assert.equal(clampBandToPlot(950, 990, 944), null, "wholly past the plot: no band");
  assert.equal(clampBandToPlot(100, 100, 944), null, "zero width: no band");
});
