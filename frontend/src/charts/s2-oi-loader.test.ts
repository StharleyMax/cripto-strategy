// Unit + real-data tests for the OI loader.
//
// The "rows are not sorted in the file" claim in `s2-oi-loader.ts`'s header is checked here
// against the ACTUAL fixture, not just asserted in prose (`[MEDIDO 2026-09-03]`).
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseCreateTimeUtcMs, parseOiMetricsCsv, assembleOiPoints } from "./s2-oi-loader.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "../../..");
const METRICS_DIR = path.join(REPO_ROOT, "data/binance/metrics");

test("parseCreateTimeUtcMs reads a naive timestamp as UTC, never local time", () => {
  assert.equal(parseCreateTimeUtcMs("2026-08-20 00:35:00"), Date.UTC(2026, 7, 20, 0, 35, 0));
  assert.equal(parseCreateTimeUtcMs("2026-08-20 23:55:00"), Date.UTC(2026, 7, 20, 23, 55, 0));
});

test("parseCreateTimeUtcMs refuses a malformed timestamp instead of guessing", () => {
  assert.throws(() => parseCreateTimeUtcMs("2026-08-20T00:35:00Z"), RangeError);
});

test("REAL FIXTURE: the 08-20 metrics file is scrambled in row order, header claim held to account", () => {
  const raw = readFileSync(path.join(METRICS_DIR, "BTCUSDT-metrics-2026-08-20.csv"), "utf8");
  const firstDataLine = raw.split("\n")[1];
  assert.equal(firstDataLine.startsWith("2026-08-20 00:35:00"), true, "the fixture's own first row is NOT 00:00:00");
  const parsed = parseOiMetricsCsv(raw);
  // `parseOiMetricsCsv` must have SORTED it: the returned array's first point is the
  // earliest timestamp in the file, even though the raw CSV's first row was not.
  assert.equal(parsed[0].timeMs, Date.UTC(2026, 7, 20, 0, 0, 0));
  for (let index = 1; index < parsed.length; index += 1) {
    assert.ok(parsed[index].timeMs > parsed[index - 1].timeMs, `not strictly ascending at index ${index}`);
  }
});

test("REAL FIXTURE: each covered day is complete at 5-minute resolution (288 points, no duplicates)", () => {
  for (const day of ["2026-08-20", "2026-08-21", "2026-08-23"]) {
    const raw = readFileSync(path.join(METRICS_DIR, `BTCUSDT-metrics-${day}.csv`), "utf8");
    const parsed = parseOiMetricsCsv(raw);
    assert.equal(parsed.length, 288, `${day}: expected 24h at 5m = 288 rows`);
    for (let index = 1; index < parsed.length; index += 1) {
      assert.equal(parsed[index].timeMs - parsed[index - 1].timeMs, 5 * 60_000, `${day}: gap at index ${index}`);
    }
  }
});

test("assembleOiPoints reports 08-22 as a missing day, not a silently empty one", () => {
  const days = ["2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23"];
  const csvTextByDay = new Map<string, string>();
  for (const day of days) {
    const filePath = path.join(METRICS_DIR, `BTCUSDT-metrics-${day}.csv`);
    try {
      csvTextByDay.set(day, readFileSync(filePath, "utf8"));
    } catch {
      // 08-22 has no file — the real gap this test exercises; left absent from the map.
    }
  }
  const { points, missingDays } = assembleOiPoints(days, csvTextByDay);
  assert.deepEqual(missingDays, ["2026-08-22"]);
  assert.equal(points.length, 288 * 3);
});
