import assert from "node:assert/strict";
import { test } from "node:test";

import { classifySlotCoverage } from "./slot-coverage.ts";

const STEP_MS = 60_000; // 1m grid
const DAY_MS = 24 * 60 * 60_000;

const WINDOW = { startMs: 0, endMsExclusive: 10 * DAY_MS };

test("MORDE: a slot before the fetched window's startMs is not-loaded, never absent", () => {
  const state = classifySlotCoverage(-STEP_MS, WINDOW, {
    earliest_bucket_ms: -30 * DAY_MS,
    latest_bucket_ms: 30 * DAY_MS,
    source_floor_ms: null,
  });
  assert.equal(state, "not-loaded");
});

test("MORDE: a slot at the fetched window's endMsExclusive is not-loaded — the window is half-open", () => {
  const state = classifySlotCoverage(WINDOW.endMsExclusive, WINDOW, {
    earliest_bucket_ms: 0,
    latest_bucket_ms: 30 * DAY_MS,
    source_floor_ms: null,
  });
  assert.equal(state, "not-loaded");
});

test("CALA: a slot exactly at the fetched window's startMs IS loaded — the left edge is inclusive", () => {
  const state = classifySlotCoverage(WINDOW.startMs, WINDOW, {
    earliest_bucket_ms: 0,
    latest_bucket_ms: 30 * DAY_MS,
    source_floor_ms: null,
  });
  // Inside the window and inside coverage, with no other information: absent (a real hole),
  // never not-loaded and never beyond-coverage.
  assert.equal(state, "absent");
});

test("MORDE: a slot before the store's OWN earliest_bucket_ms is beyond-coverage, even inside the fetched window", () => {
  const state = classifySlotCoverage(1 * DAY_MS, WINDOW, {
    earliest_bucket_ms: 2 * DAY_MS,
    latest_bucket_ms: 9 * DAY_MS,
    source_floor_ms: -90 * DAY_MS,
  });
  assert.equal(state, "beyond-coverage");
});

test("MORDE: an empty store (earliest_bucket_ms null) falls back to source_floor_ms as the left wall", () => {
  const state = classifySlotCoverage(1 * DAY_MS, WINDOW, {
    earliest_bucket_ms: null,
    latest_bucket_ms: null,
    source_floor_ms: 2 * DAY_MS,
  });
  assert.equal(state, "beyond-coverage", "1 day is before the source's own 2-day floor");
});

test("CALA: both walls UNMEASURED (null) asserts nothing — falls through to absent, never a false beyond-coverage", () => {
  const state = classifySlotCoverage(0, WINDOW, {
    earliest_bucket_ms: null,
    latest_bucket_ms: null,
    source_floor_ms: null,
  });
  assert.equal(state, "absent");
});

test("MORDE: a slot past the store's own latest_bucket_ms is beyond-coverage on the RIGHT wall too", () => {
  const state = classifySlotCoverage(9 * DAY_MS + STEP_MS, WINDOW, {
    earliest_bucket_ms: 0,
    latest_bucket_ms: 9 * DAY_MS,
    source_floor_ms: null,
  });
  assert.equal(state, "beyond-coverage");
});

test("CALA: a slot exactly at latest_bucket_ms is still covered — the right wall is inclusive", () => {
  const state = classifySlotCoverage(9 * DAY_MS, WINDOW, {
    earliest_bucket_ms: 0,
    latest_bucket_ms: 9 * DAY_MS,
    source_floor_ms: null,
  });
  assert.equal(state, "absent");
});

// `T-05.7`'s own measured fixture (`klines_volume`, `[MEDIDO 2026-09-19]`): present at day 0,
// absent at day 6, present again at day 59, absent at day 8 of THAT probe — non-monotonic. The
// point of this test is that a MID-RANGE hole inside known coverage never gets mistaken for a
// wall: nothing here infers a floor from how many rows came back, only from the declared walls.
test("MORDE: a non-monotonic hole strictly INSIDE the two known walls is absent, never beyond-coverage", () => {
  const coverage = { earliest_bucket_ms: 0, latest_bucket_ms: 8 * DAY_MS, source_floor_ms: -30 * DAY_MS };
  const holeAtDay7 = classifySlotCoverage(7 * DAY_MS, WINDOW, coverage);
  assert.equal(holeAtDay7, "absent", "day 7 sits between the two walls (0 and 8 days) — a real hole, not an edge");
});
