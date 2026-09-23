import assert from "node:assert/strict";
import { test } from "node:test";

import { historyRequest, type TimeAxis } from "../../charts/index.ts";
import { classifySlotCoverage, combineHistoryCoverage, type PanelCoverageBundle } from "./slot-coverage.ts";

const STEP_MS = 60_000; // 1m grid
const DAY_MS = 24 * 60 * 60_000;

const WINDOW = { startMs: 0, endMsExclusive: 10 * DAY_MS };

const NO_COVERAGE: PanelCoverageBundle = {
  open: null,
  high: null,
  low: null,
  close: null,
  oi: null,
  cvd: null,
  volume: null,
  liquidationLong: null,
  liquidationShort: null,
  longShort: null,
};

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

// ── `T-05.7`/`D-C3.7` — `combineHistoryCoverage`, the fold `use-history-pager.ts` calls before
// every `historyRequest` — the fixtures below are MORDE against the two wrong shortcuts a naive
// combine would take: stopping when the FIRST series hits its floor (too early, loses real data
// for a deeper series) and stopping — or never stopping — because of a single unmeasured series.

test("CALA: no series has declared anything yet — combined floor is null, not zero/-Infinity", () => {
  const combined = combineHistoryCoverage(NO_COVERAGE);
  assert.deepEqual(combined, { earliestBucketMs: null, sourceFloorMs: null });
});

test("MORDE: the combined floor is the MINIMUM of the known walls, never the first or the maximum", () => {
  const bundle: PanelCoverageBundle = {
    ...NO_COVERAGE,
    // price: only data back to day 5 (shallow — e.g. a series onboarded recently)
    open: { earliest_bucket_ms: 5 * DAY_MS, latest_bucket_ms: null, source_floor_ms: null },
    // OI: data all the way back to day 0 — deeper, and the one a MAX (or first-hit) combine would
    // wrongly ignore once `open`'s floor is reached.
    oi: { earliest_bucket_ms: 0, latest_bucket_ms: null, source_floor_ms: null },
  };
  const combined = combineHistoryCoverage(bundle);
  assert.equal(combined.earliestBucketMs, 0, "OI's deeper floor must win — open's shallower one is not the wall");
});

test("MORDE: one unmeasured series does not veto the floor already known for the others", () => {
  const bundle: PanelCoverageBundle = {
    ...NO_COVERAGE,
    open: { earliest_bucket_ms: 3 * DAY_MS, latest_bucket_ms: null, source_floor_ms: null },
    // cvd never declared anything (both walls null) — must be EXCLUDED, not treated as "no floor
    // known anywhere", or a permanently-unmeasured series would let paging run forever.
    cvd: { earliest_bucket_ms: null, latest_bucket_ms: null, source_floor_ms: null },
  };
  const combined = combineHistoryCoverage(bundle);
  assert.equal(combined.earliestBucketMs, 3 * DAY_MS);
});

test("CALA: a series falls back to source_floor_ms when its own store (earliest_bucket_ms) is empty", () => {
  const bundle: PanelCoverageBundle = {
    ...NO_COVERAGE,
    volume: { earliest_bucket_ms: null, latest_bucket_ms: null, source_floor_ms: 2 * DAY_MS },
  };
  const combined = combineHistoryCoverage(bundle);
  assert.equal(combined.earliestBucketMs, 2 * DAY_MS);
});

// The falsifier `T-05.7`'s handoff names explicitly: once the combined wall is reached,
// `historyRequest` must REFUSE the next page — this is what stops the request counter from
// climbing past the declared horizon (`D-C3.7`'s falsifier (b)). Proven against the REAL
// `historyRequest`, not a stand-in, so a regression in either function shows up here.
test("MORDE: historyRequest refuses another page once axis.startMs reaches the combined floor", () => {
  const axis: TimeAxis = { startMs: 3 * DAY_MS, stepMs: STEP_MS, slotCount: 1_000 };
  const bundle: PanelCoverageBundle = {
    ...NO_COVERAGE,
    open: { earliest_bucket_ms: 3 * DAY_MS, latest_bucket_ms: null, source_floor_ms: null },
    oi: { earliest_bucket_ms: 5 * DAY_MS, latest_bucket_ms: null, source_floor_ms: null },
  };
  const coverage = combineHistoryCoverage(bundle);
  // The visible range sits right at the loaded edge — close enough to trigger a page if one were
  // still owed.
  const req = historyRequest({ fromMs: axis.startMs, toMs: axis.startMs + 10 * STEP_MS }, axis, coverage, 500);
  assert.equal(req, null, "axis.startMs already equals open's own floor (the tighter of the two) — nothing left to fetch");
});

test("CALA: historyRequest still pages when the combined floor has not been reached yet", () => {
  const axis: TimeAxis = { startMs: 4 * DAY_MS, stepMs: STEP_MS, slotCount: 1_000 };
  const bundle: PanelCoverageBundle = {
    ...NO_COVERAGE,
    open: { earliest_bucket_ms: 3 * DAY_MS, latest_bucket_ms: null, source_floor_ms: null },
    oi: { earliest_bucket_ms: 0, latest_bucket_ms: null, source_floor_ms: null },
  };
  const coverage = combineHistoryCoverage(bundle);
  const req = historyRequest({ fromMs: axis.startMs, toMs: axis.startMs + 10 * STEP_MS }, axis, coverage, 500);
  assert.notEqual(req, null, "OI's floor (day 0) is still 4 days below the axis edge — a page is still owed");
});
