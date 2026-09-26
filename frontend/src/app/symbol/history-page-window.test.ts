import assert from "node:assert/strict";
import { test } from "node:test";

import {
  capWindowRightEdge,
  DEFAULT_MAX_ACCUMULATED_SLOTS,
  DEFAULT_PAGE_SLOTS,
  effectiveMaxAccumulatedSlots,
  mergeOlderPage,
  trimRowsToWindow,
  widenAndCapWindow,
} from "./history-page-window.ts";

const STEP_MS = 60_000; // 1m grid

test("T-01.5 capWindowRightEdge CALA: a window at or under the cap is returned as the SAME reference", () => {
  const current = { startMs: 0, endMsExclusive: DEFAULT_MAX_ACCUMULATED_SLOTS * STEP_MS };
  assert.equal(capWindowRightEdge(current, STEP_MS), current);
});

test("T-01.5 capWindowRightEdge MORDE: a deferred over-cap window loses the RIGHT edge only, to exactly maxSlots", () => {
  // The first `1m` page with the cut deferred: 5.760 initial + 500 = 6.260 slots.
  const current = { startMs: -500 * STEP_MS, endMsExclusive: 5_760 * STEP_MS };
  const capped = capWindowRightEdge(current, STEP_MS);
  assert.equal(capped.startMs, current.startMs, "the left edge the drag reached is never cut");
  assert.equal((capped.endMsExclusive - capped.startMs) / STEP_MS, DEFAULT_MAX_ACCUMULATED_SLOTS);
  assert.throws(() => capWindowRightEdge(current, 0), RangeError);
  assert.throws(() => capWindowRightEdge(current, STEP_MS, 1.5), RangeError);
});

// ── W1-FIX (`gates/W1-DESIGN-REVIEW.md` MF-A): the cap never cuts what the route served ──────

/** The seed every TF gets today: 4 days of the `1m` grid (`request-window.ts`). */
const SEED_WINDOW = { startMs: 0, endMsExclusive: 5_760 * STEP_MS };

test("W1-FIX MF-A MORDE: the RAW cap (5.000) cuts the 5.760-slot seed on a bare release — the 12 h 40 min on screen", () => {
  // This is the defect, kept as a measured fact: a release with no page fetched still cuts 760 slots.
  const capped = capWindowRightEdge(SEED_WINDOW, STEP_MS, DEFAULT_MAX_ACCUMULATED_SLOTS);
  assert.equal((SEED_WINDOW.endMsExclusive - capped.endMsExclusive) / STEP_MS, 760);
});

test("W1-FIX MF-A CALA: with the effective cap, a release with no page leaves the seed window untouched", () => {
  const maxSlots = effectiveMaxAccumulatedSlots(SEED_WINDOW, STEP_MS, DEFAULT_PAGE_SLOTS);
  assert.equal(maxSlots, 5_760 + DEFAULT_PAGE_SLOTS);
  assert.equal(capWindowRightEdge(SEED_WINDOW, STEP_MS, maxSlots), SEED_WINDOW);
});

test("W1-FIX MF-A CALA: the first page never cuts the right edge; the second slides it by one page", () => {
  const maxSlots = effectiveMaxAccumulatedSlots(SEED_WINDOW, STEP_MS, DEFAULT_PAGE_SLOTS);
  const page1 = { fromMs: -DEFAULT_PAGE_SLOTS * STEP_MS, toMs: 0 };
  const afterFirst = widenAndCapWindow(SEED_WINDOW, page1, STEP_MS, maxSlots);
  assert.equal(afterFirst.endMsExclusive, SEED_WINDOW.endMsExclusive, "the first page keeps the served right edge");
  const page2 = { fromMs: afterFirst.startMs - DEFAULT_PAGE_SLOTS * STEP_MS, toMs: afterFirst.startMs };
  const afterSecond = widenAndCapWindow(afterFirst, page2, STEP_MS, maxSlots);
  assert.equal((SEED_WINDOW.endMsExclusive - afterSecond.endMsExclusive) / STEP_MS, DEFAULT_PAGE_SLOTS);
});

test("W1-FIX MF-A: a requested cap above the floor is kept, and bad arguments are refused", () => {
  assert.equal(effectiveMaxAccumulatedSlots(SEED_WINDOW, STEP_MS, DEFAULT_PAGE_SLOTS, 10_000), 10_000);
  assert.throws(() => effectiveMaxAccumulatedSlots(SEED_WINDOW, 0, DEFAULT_PAGE_SLOTS), RangeError);
  assert.throws(() => effectiveMaxAccumulatedSlots(SEED_WINDOW, STEP_MS, 0), RangeError);
});

test("CALA: widening under the cap keeps the endMsExclusive unchanged and moves startMs to the page's fromMs", () => {
  const current = { startMs: 1_000 * STEP_MS, endMsExclusive: 6_000 * STEP_MS }; // 5,000 slots
  const page = { fromMs: 900 * STEP_MS, toMs: current.startMs }; // +100 slots => 5,100, still small
  const result = widenAndCapWindow(current, page, STEP_MS, 10_000);
  assert.equal(result.startMs, page.fromMs);
  assert.equal(result.endMsExclusive, current.endMsExclusive);
});

test("MORDE: exceeding the cap discards the RIGHT edge, never the left one the page just extended", () => {
  const current = { startMs: 5_000 * STEP_MS, endMsExclusive: 10_000 * STEP_MS }; // 5,000 slots
  const page = { fromMs: 0, toMs: current.startMs }; // +5,000 slots => 10,000 total
  const result = widenAndCapWindow(current, page, STEP_MS, DEFAULT_MAX_ACCUMULATED_SLOTS);
  assert.equal(result.startMs, page.fromMs, "the left edge is exactly what the page asked for — never trimmed");
  assert.equal(result.endMsExclusive, page.fromMs + DEFAULT_MAX_ACCUMULATED_SLOTS * STEP_MS);
  const slots = (result.endMsExclusive - result.startMs) / STEP_MS;
  assert.equal(slots, DEFAULT_MAX_ACCUMULATED_SLOTS, "the cap is exact, not merely 'under'");
});

test("MORDE: a page that does not abut the current window (toMs !== current.startMs) is REFUSED", () => {
  const current = { startMs: 1_000 * STEP_MS, endMsExclusive: 2_000 * STEP_MS };
  assert.throws(
    () => widenAndCapWindow(current, { fromMs: 0, toMs: 500 * STEP_MS }, STEP_MS),
    /must equal current\.startMs/,
  );
});

test("MORDE: a degenerate page (fromMs >= toMs) is REFUSED", () => {
  const current = { startMs: 1_000 * STEP_MS, endMsExclusive: 2_000 * STEP_MS };
  assert.throws(
    () => widenAndCapWindow(current, { fromMs: current.startMs, toMs: current.startMs }, STEP_MS),
    /must precede/,
  );
});

test("CALA: trimRowsToWindow drops rows the capped right edge no longer covers", () => {
  const window = { startMs: 0, endMsExclusive: 3 * STEP_MS };
  const rows = [
    { event_time: -STEP_MS, x: "before" },
    { event_time: 0, x: "first" },
    { event_time: STEP_MS, x: "middle" },
    { event_time: 3 * STEP_MS, x: "at-exclusive-edge" },
    { event_time: 4 * STEP_MS, x: "after" },
  ];
  const kept = trimRowsToWindow(rows, window);
  assert.deepEqual(
    kept.map((r) => r.x),
    ["first", "middle"],
  );
});

test("CALA: mergeOlderPage prepends a strictly-earlier page ahead of the existing rows", () => {
  const older = [{ event_time: 0 }, { event_time: STEP_MS }];
  const existing = [{ event_time: 2 * STEP_MS }, { event_time: 3 * STEP_MS }];
  const merged = mergeOlderPage(older, existing);
  assert.deepEqual(
    merged.map((r) => r.event_time),
    [0, STEP_MS, 2 * STEP_MS, 3 * STEP_MS],
  );
});

test("MORDE: mergeOlderPage REFUSES an overlapping/out-of-order pair instead of silently corrupting draw order", () => {
  const older = [{ event_time: 0 }, { event_time: 2 * STEP_MS }];
  const existing = [{ event_time: STEP_MS }]; // overlaps — older's last (2*STEP) >= existing's first (1*STEP)
  assert.throws(() => mergeOlderPage(older, existing), /not strictly before/);
});

test("CALA: mergeOlderPage tolerates an empty side without throwing", () => {
  assert.deepEqual(mergeOlderPage([], [{ event_time: 0 }]), [{ event_time: 0 }]);
  assert.deepEqual(mergeOlderPage([{ event_time: 0 }], []), [{ event_time: 0 }]);
  assert.deepEqual(mergeOlderPage([], []), []);
});
