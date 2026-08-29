// Unit tests for the D8.19 measurement itself.
//
// The chart is NOT involved here: these pin the arithmetic that turns coordinates into a
// verdict, so a green from the spike cannot be an artefact of the comparison being wrong.
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { test } from "node:test";
import { expectedCoordinate, measureAxisFidelity, TOLERANCE_PX } from "./axis-fidelity.ts";
import type { CoordinateSample } from "./axis-fidelity.ts";
import { buildFullGridWorkload, buildSparseGridWorkload, CANDLE_COUNT, POINT_COUNT } from "./synthetic-series.ts";

test("expectedCoordinate interpolates linearly between the two anchors", () => {
  assert.equal(expectedCoordinate(50, 0, 100, 100, 300), 200);
  assert.equal(expectedCoordinate(0, 0, 100, 100, 300), 100);
  assert.equal(expectedCoordinate(100, 0, 100, 100, 300), 300);
});

test("expectedCoordinate refuses a degenerate time span instead of dividing by zero", () => {
  assert.throws(() => expectedCoordinate(5, 10, 0, 10, 100), RangeError);
});

test("measureAxisFidelity reports zero when the map is exactly affine in time", () => {
  const samples: CoordinateSample[] = Array.from({ length: 100 }, (_, index) => ({
    time: index * 60,
    actualX: index * 3.5,
    source: "candle",
  }));
  const report = measureAxisFidelity(samples);
  // Not `equal(..., 0)`: the affine map is exact in arithmetic but not in IEEE-754, and
  // this bound is measured, not guessed -- the same construction returns 2.84e-14 here.
  assert.ok(report.worstErrorPx < 1e-9, `esperava ruido de float, veio ${report.worstErrorPx}`);
  assert.equal(report.withinTolerance, true);
  assert.equal(report.sampleCount, 100);
  assert.equal(report.distinctTimeCount, 100);
});

// THE MUTATION. Ordinal spacing over a grid with one gap is exactly what Lightweight
// Charts does, and the comparison has to REJECT it. Without this case, every green above
// would be consistent with `measureAxisFidelity` returning 0 unconditionally.
test("measureAxisFidelity REJECTS an ordinal map over a grid with a gap", () => {
  const times = [0, 60, 120, 6000, 6060];
  const samples: CoordinateSample[] = times.map((time, index) => ({
    time,
    actualX: index * 100,
    source: "candle",
  }));
  const report = measureAxisFidelity(samples, TOLERANCE_PX);
  assert.equal(report.withinTolerance, false);
  assert.ok(report.worstErrorPx > 100, `pior caso ${report.worstErrorPx} px deveria passar de 100 px`);
  assert.equal(report.worstSample.time, 120);
});

test("measureAxisFidelity keeps the mean out of the criterion", () => {
  const samples: CoordinateSample[] = [
    { time: 0, actualX: 0, source: "candle" },
    { time: 1, actualX: 0.4, source: "point" },
    { time: 2, actualX: 2, source: "candle" },
    { time: 3, actualX: 3, source: "candle" },
  ];
  const report = measureAxisFidelity(samples, TOLERANCE_PX);
  assert.ok(report.meanErrorPx < TOLERANCE_PX, "a media fica abaixo da tolerancia");
  assert.equal(report.withinTolerance, false, "e ainda assim o veredito e FORA, pelo pior caso");
});

test("measureAxisFidelity refuses a universe too small to show non-linearity", () => {
  assert.throws(() => measureAxisFidelity([{ time: 0, actualX: 0, source: "candle" }]), RangeError);
});

test("the full-grid workload carries exactly the load D8.19 names", () => {
  const workload = buildFullGridWorkload();
  assert.equal(workload.candles.length, CANDLE_COUNT);
  assert.equal(workload.points.length, POINT_COUNT);
  assert.equal(workload.candles.length + workload.points.length, 1728);
  const times = workload.candles.map((candle) => candle.time);
  assert.equal(times[times.length - 1] - times[0], 1439 * 60);
});

test("the sparse workload is deterministic and keeps both window boundaries", () => {
  const first = buildSparseGridWorkload(0.2, 20260829);
  const second = buildSparseGridWorkload(0.2, 20260829);
  assert.deepEqual(
    first.candles.map((candle) => candle.time),
    second.candles.map((candle) => candle.time),
  );
  const full = buildFullGridWorkload();
  assert.equal(first.candles[0].time, full.candles[0].time);
  assert.equal(
    first.candles[first.candles.length - 1].time,
    full.candles[full.candles.length - 1].time,
  );
  assert.ok(first.candles.length < CANDLE_COUNT / 2, "a grade tem de ficar mesmo esparsa");
});

test("the sparse workload refuses a coverage outside (0, 1]", () => {
  assert.throws(() => buildSparseGridWorkload(0, 1), RangeError);
  assert.throws(() => buildSparseGridWorkload(1.5, 1), RangeError);
});
