// Unit tests for `time-axis-controller.ts` (`T-02.2`, `D-C3.1`). No `jsdom`, no
// `lightweight-charts`, no DOM of any kind is set up in this file — that absence IS the
// falsifier `D-C3.1` names: "o controller compila e é testado sem jsdom"
// (`JULGAMENTO-FRONTEND-ARCHITECT.md:483`). Contrast with `headless-chart.test.ts`, which
// imports `jsdom` explicitly because ITS subject needs a `window`; this subject must not.
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_PAGE_TRIGGER_SLOTS,
  DEFAULT_RANGE_EPSILON_MS,
  createTimeAxisController,
  fromLogicalRange,
  historyRequest,
  reduceRangeEvent,
  toLogicalRange,
} from "./time-axis-controller.ts";
import type { HistoryCoverage, TimeAxis, TimeRange } from "./time-axis-controller.ts";

const THIS_FILE = fileURLToPath(import.meta.url);
const SOURCE_FILE = path.join(path.dirname(THIS_FILE), "time-axis-controller.ts");

test("PURITY (D-C3.1 falsifier): the module CODE (not its prose) names neither IChartApi, fetch, nor lightweight-charts", () => {
  const source = readFileSync(SOURCE_FILE, "utf8");
  // `IChartApi`/`fetch`/an import of the charting library are the three things `D-C3.1`
  // draws the boundary on (`ADR-003/FR-1` zero I/O, `FR-2` zero geometry decided by `web`,
  // stated together as "sem IChartApi, sem fetch" in the task title itself). Grepping the
  // SOURCE TEXT rather than trusting the docstring is the same discipline
  // `eslint-boundary.test.ts` uses for the charts<->web import fence: assert the absence,
  // don't assume it. Block comments (the docstrings ABOVE, which discuss these names in
  // prose, e.g. this very sentence) are stripped first, so the assertion is about CODE, not
  // about whether the module is allowed to talk about its own boundary.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.equal(code.includes("IChartApi"), false, "module code must not reference IChartApi");
  assert.equal(/\bfetch\s*\(/.test(code), false, "module code must not call fetch(...)");
  assert.equal(
    code.includes("lightweight-charts"),
    false,
    "module code must not import the charting library",
  );
  assert.equal(code.includes("jsdom"), false, "module code must not depend on jsdom");
  assert.equal(/\breact\b/i.test(code), false, "module code must not depend on React");
  // MORDE half of the same probe, in the SAME run: a version of this check that did NOT
  // strip comments would have failed on this file's own docstrings — proving the stripped
  // check has teeth (it starts from a source that DOES contain these tokens in prose) rather
  // than passing vacuously because the raw file never mentioned them at all.
  assert.equal(source.includes("IChartApi"), true, "sanity: the docstring must still discuss IChartApi in prose");
});

const AXIS_1M: TimeAxis = { startMs: 0, stepMs: 60_000, slotCount: 5_760 }; // 1m, 4 days

test("toLogicalRange converts instants to logical indices without rounding", () => {
  const range: TimeRange = { fromMs: 90_000, toMs: 150_000 };
  const logical = toLogicalRange(range, AXIS_1M);
  assert.deepEqual(logical, { from: 1.5, to: 2.5 });
});

test("fromLogicalRange is the exact inverse of toLogicalRange (round-trips, no error)", () => {
  const original: TimeRange = { fromMs: 12_345_000, toMs: 98_765_000 };
  const roundTripped = fromLogicalRange(toLogicalRange(original, AXIS_1M), AXIS_1M);
  assert.deepEqual(roundTripped, original);
});

test("toLogicalRange/fromLogicalRange refuse a non-positive stepMs", () => {
  const badAxis: TimeAxis = { startMs: 0, stepMs: 0, slotCount: 1 };
  assert.throws(() => toLogicalRange({ fromMs: 0, toMs: 1 }, badAxis), RangeError);
  assert.throws(() => fromLogicalRange({ from: 0, to: 1 }, badAxis), RangeError);
});

test("the library's own fractional LogicalRange (measured, JULGAMENTO §2) round-trips too", () => {
  // Pinned against the judgment's own measurement (`probe4.mjs`,
  // `JULGAMENTO-FRONTEND-ARCHITECT.md:232`): `{"from":10.369999999999997,"to":60.81}` — the
  // library returns fractional indices verbatim, and this module must not "clean them up"
  // with a round, which is exactly the operation `D-C3.3` measured as introducing error.
  const fourHourAxis: TimeAxis = { startMs: 0, stepMs: 4 * 60 * 60 * 1000, slotCount: 500 };
  const logical = { from: 10.369999999999997, to: 60.81 };
  const range = fromLogicalRange(logical, fourHourAxis);
  const back = toLogicalRange(range, fourHourAxis);
  assert.ok(Math.abs(back.from - logical.from) < 1e-9, "from must round-trip within float epsilon");
  assert.ok(Math.abs(back.to - logical.to) < 1e-9, "to must round-trip within float epsilon");
});

test("reduceRangeEvent reports changed=false for an identical candidate", () => {
  const state: TimeRange = { fromMs: 1_000, toMs: 2_000 };
  const result = reduceRangeEvent(state, { fromMs: 1_000, toMs: 2_000 });
  assert.equal(result.changed, false);
  assert.equal(result.next, state, "next must be the SAME reference as state, not a copy");
});

test("reduceRangeEvent dedupes within epsilon (round-trip float residue)", () => {
  const state: TimeRange = { fromMs: 1_000, toMs: 2_000 };
  const jittered: TimeRange = { fromMs: 1_000.2, toMs: 1_999.8 };
  const result = reduceRangeEvent(state, jittered);
  assert.equal(result.changed, false, "a sub-epsilon residue must not be reported as a change");
  assert.equal(result.next, state);
});

test("reduceRangeEvent reports changed=true and returns the candidate once past epsilon", () => {
  const state: TimeRange = { fromMs: 1_000, toMs: 2_000 };
  const candidate: TimeRange = { fromMs: 1_000, toMs: 2_500 };
  const result = reduceRangeEvent(state, candidate);
  assert.equal(result.changed, true);
  assert.deepEqual(result.next, candidate);
});

test("reduceRangeEvent honors a caller-supplied epsilon", () => {
  const state: TimeRange = { fromMs: 1_000, toMs: 2_000 };
  const candidate: TimeRange = { fromMs: 1_010, toMs: 2_000 };
  assert.equal(reduceRangeEvent(state, candidate, 20).changed, false);
  assert.equal(reduceRangeEvent(state, candidate, 5).changed, true);
});

test("DEFAULT_RANGE_EPSILON_MS is sub-millisecond, not a coarse bucket-sized tolerance", () => {
  // A epsilon anywhere near `stepMs` would silently swallow real one-bucket pans — this
  // pins it far below any realistic `timeframeMs` (`ONE_MINUTE_MS` in `s2-panels.ts` is
  // 60,000 ms).
  assert.ok(DEFAULT_RANGE_EPSILON_MS > 0);
  assert.ok(DEFAULT_RANGE_EPSILON_MS < 1);
});

test("createTimeAxisController binds axis and exposes the same pure conversions", () => {
  const controller = createTimeAxisController(AXIS_1M);
  assert.equal(controller.axis, AXIS_1M);

  const range: TimeRange = { fromMs: 120_000, toMs: 240_000 };
  assert.deepEqual(controller.toLogicalRange(range), toLogicalRange(range, AXIS_1M));

  const logical = { from: 3, to: 5 };
  assert.deepEqual(controller.fromLogicalRange(logical), fromLogicalRange(logical, AXIS_1M));

  const state: TimeRange = { fromMs: 0, toMs: 60_000 };
  assert.deepEqual(
    controller.reduceRangeEvent(state, { fromMs: 0, toMs: 60_000 }),
    reduceRangeEvent(state, { fromMs: 0, toMs: 60_000 }),
  );
});

test("createTimeAxisController refuses a non-positive stepMs at construction", () => {
  assert.throws(() => createTimeAxisController({ startMs: 0, stepMs: -1, slotCount: 1 }), RangeError);
});

test("createTimeAxisController does not mutate or re-derive axis — swapping timeframe means a new controller", () => {
  const controllerA = createTimeAxisController(AXIS_1M);
  const AXIS_4H: TimeAxis = { startMs: 0, stepMs: 4 * 60 * 60 * 1000, slotCount: 500 };
  const controllerB = createTimeAxisController(AXIS_4H);
  assert.notEqual(controllerA.axis.stepMs, controllerB.axis.stepMs);
  assert.equal(controllerA.axis, AXIS_1M, "constructing controllerB must not have touched controllerA's axis");
});

// `historyRequest` — `T-05.1`, `D-C3.4`. `AXIS`'s `startMs` is deliberately non-zero so a
// "floor before startMs" is a distinct, unambiguous instant from "no floor at all" (`null`).
const HOUR_MS = 60 * 60 * 1000;
const AXIS: TimeAxis = { startMs: 1_000_000 * HOUR_MS, stepMs: HOUR_MS, slotCount: 500 };
const NO_COVERAGE: HistoryCoverage = { earliestBucketMs: null, sourceFloorMs: null };

test("historyRequest returns null when the visible range is not near the loaded left edge", () => {
  const range: TimeRange = {
    fromMs: AXIS.startMs + 1_000 * HOUR_MS,
    toMs: AXIS.startMs + 1_010 * HOUR_MS,
  };
  assert.equal(historyRequest(range, AXIS, NO_COVERAGE, 500), null);
});

test("historyRequest proposes exactly the page immediately preceding axis.startMs once near the edge", () => {
  const range: TimeRange = { fromMs: AXIS.startMs + 5 * HOUR_MS, toMs: AXIS.startMs + 100 * HOUR_MS };
  const request = historyRequest(range, AXIS, NO_COVERAGE, 500, DEFAULT_PAGE_TRIGGER_SLOTS);
  assert.deepEqual(request, {
    fromMs: AXIS.startMs - 500 * HOUR_MS,
    toMs: AXIS.startMs,
    intervalMs: HOUR_MS,
  });
});

test("historyRequest's trigger is a strict less-than at the threshold, not <=", () => {
  const atThreshold: TimeRange = {
    fromMs: AXIS.startMs + DEFAULT_PAGE_TRIGGER_SLOTS * HOUR_MS,
    toMs: AXIS.startMs + 100 * HOUR_MS,
  };
  const justInside: TimeRange = { fromMs: atThreshold.fromMs - 1, toMs: atThreshold.toMs };
  assert.equal(historyRequest(atThreshold, AXIS, NO_COVERAGE, 500), null);
  assert.notEqual(historyRequest(justInside, AXIS, NO_COVERAGE, 500), null);
});

test("historyRequest is insensitive to HOW FAR range.fromMs sits past the edge — the requested window is a function of axis.startMs alone, never of range", () => {
  // This is the direct contrast with `barsInLogicalRange`: that API's `barsBefore` keeps
  // changing (and going more negative) the deeper the visible range sits in whitespace.
  // `D-C3.5`: "o gatilho é a grade, não o painel" — the proposed window must NOT move with it.
  const shallow = historyRequest(
    { fromMs: AXIS.startMs + 1 * HOUR_MS, toMs: AXIS.startMs + 50 * HOUR_MS },
    AXIS,
    NO_COVERAGE,
    500,
  );
  const deepInWhitespace = historyRequest(
    { fromMs: AXIS.startMs - 999_999 * HOUR_MS, toMs: AXIS.startMs + 50 * HOUR_MS },
    AXIS,
    NO_COVERAGE,
    500,
  );
  assert.deepEqual(shallow, deepInWhitespace);
});

test("D-C3.4 falsifier: once the known floor is reached, historyRequest goes PERMANENTLY null — no infinite loop, even with whitespace deep ahead of the range", () => {
  // Reproduces the measured failure mode's geometry (`probe3.mjs`: whitespace precedes the
  // visible range, `barsBefore = -4608`, permanently below any positive threshold) but with a
  // coverage floor this axis has already reached. A naive `barsBefore < N` detector never
  // stops firing in this geometry; this predicate must, and must keep not-firing on repeat
  // calls, not just the first one.
  const coverage: HistoryCoverage = { earliestBucketMs: AXIS.startMs, sourceFloorMs: null };
  const rangeDeepInWhitespace: TimeRange = {
    fromMs: AXIS.startMs - 10_000 * HOUR_MS,
    toMs: AXIS.startMs + 50 * HOUR_MS,
  };
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    assert.equal(
      historyRequest(rangeDeepInWhitespace, AXIS, coverage, 500),
      null,
      `attempt ${attempt} must not propose a page past the known floor`,
    );
  }
});

test("historyRequest clamps fromMs to the known floor instead of overshooting past it (partial last page)", () => {
  const floorMs = AXIS.startMs - 200 * HOUR_MS; // closer than a full 500-slot page
  const coverage: HistoryCoverage = { earliestBucketMs: floorMs, sourceFloorMs: null };
  const range: TimeRange = { fromMs: AXIS.startMs + 5 * HOUR_MS, toMs: AXIS.startMs + 50 * HOUR_MS };
  const request = historyRequest(range, AXIS, coverage, 500);
  assert.deepEqual(request, { fromMs: floorMs, toMs: AXIS.startMs, intervalMs: HOUR_MS });
});

test("historyRequest falls back to sourceFloorMs when the store has captured nothing yet (earliestBucketMs null)", () => {
  const coverage: HistoryCoverage = { earliestBucketMs: null, sourceFloorMs: AXIS.startMs };
  const range: TimeRange = { fromMs: AXIS.startMs + 1 * HOUR_MS, toMs: AXIS.startMs + 50 * HOUR_MS };
  assert.equal(
    historyRequest(range, AXIS, coverage, 500),
    null,
    "axis already sits at the origin's own wall — nothing to fetch",
  );
});

test("historyRequest prefers earliestBucketMs (our own store) over sourceFloorMs when both are known", () => {
  const strictFloor = AXIS.startMs - 10 * HOUR_MS; // our store — closer, more restrictive
  const looseFloor = AXIS.startMs - 5_000 * HOUR_MS; // origin's wall — far looser
  const coverage: HistoryCoverage = { earliestBucketMs: strictFloor, sourceFloorMs: looseFloor };
  const range: TimeRange = { fromMs: AXIS.startMs + 1 * HOUR_MS, toMs: AXIS.startMs + 50 * HOUR_MS };
  const request = historyRequest(range, AXIS, coverage, 500);
  assert.deepEqual(request, { fromMs: strictFloor, toMs: AXIS.startMs, intervalMs: HOUR_MS });
});

test("historyRequest refuses a non-positive or non-integer pageSlots", () => {
  assert.throws(() => historyRequest({ fromMs: 0, toMs: 1 }, AXIS, NO_COVERAGE, 0), RangeError);
  assert.throws(() => historyRequest({ fromMs: 0, toMs: 1 }, AXIS, NO_COVERAGE, -500), RangeError);
  assert.throws(() => historyRequest({ fromMs: 0, toMs: 1 }, AXIS, NO_COVERAGE, 1.5), RangeError);
});

test("historyRequest refuses a negative or non-integer triggerSlots", () => {
  assert.throws(() => historyRequest({ fromMs: 0, toMs: 1 }, AXIS, NO_COVERAGE, 500, -1), RangeError);
  assert.throws(() => historyRequest({ fromMs: 0, toMs: 1 }, AXIS, NO_COVERAGE, 500, 1.5), RangeError);
});

test("historyRequest refuses a non-positive axis.stepMs", () => {
  const badAxis: TimeAxis = { startMs: 0, stepMs: 0, slotCount: 1 };
  assert.throws(() => historyRequest({ fromMs: 0, toMs: 1 }, badAxis, NO_COVERAGE, 500), RangeError);
});

test("createTimeAxisController.historyRequest delegates to the free function bound to its own axis", () => {
  const controller = createTimeAxisController(AXIS);
  const range: TimeRange = { fromMs: AXIS.startMs + 5 * HOUR_MS, toMs: AXIS.startMs + 100 * HOUR_MS };
  assert.deepEqual(
    controller.historyRequest(range, NO_COVERAGE, 500),
    historyRequest(range, AXIS, NO_COVERAGE, 500),
  );
});
