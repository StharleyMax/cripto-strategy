// Unit + real-data tests for the `nature`-based absence policy (`T-05.4`, `D5.1`/`D5.2`/`D5.3`).
//
// `D5.1` and the "held, capped at one native bucket" half of `D5.2` are proven against the
// REAL `OI` fixture (`s2-panels.ts`'s own 4-day BTCUSDT window, the SAME one `T-05.2`
// already built its panels over — composed via `buildOiPanel`, never reimplemented). `D5.3`'s
// core distinction (never held, unlike `STOCK`) is proven against the real missing day
// (`2026-08-22`, zero `aggTrades` file) WITHOUT parsing the other three days' multi-million-
// row real `aggTrades` text — `assembleCvdDeltas` reports absence from a day's ABSENCE from
// `csvTextByDay`, so proving "absent stays absent" costs zero bytes read, and the "present"
// half is proven with a tiny synthetic point instead of the slow real parse (`s2-cvd.test.ts`
// already covers that parse's own correctness; repeating it here would just re-run the same
// ~5-8s cost for no new signal).
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveStockReading,
  resolveFlowReading,
  closeTimeMs,
  formatCloseStamp,
  formatHeldStockLabel,
  formatFlowValue,
} from "./s2-absence-policy.ts";
import { buildScalarSeries } from "./s2-scalar-grid.ts";
import { parseOiMetricsCsv, assembleOiPoints } from "./s2-oi-loader.ts";
import { assembleCvdDeltas } from "./s2-cvd.ts";
import { buildOiPanel, buildCvdPanel, SYMBOL, DAYS, FIVE_MINUTES_MS } from "./s2-panels.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "../../..");
const METRICS_DIR = path.join(REPO_ROOT, "data/binance/metrics");

const ONE_MINUTE_MS = 60_000;

function readOiDay(day: string): string {
  return readFileSync(path.join(METRICS_DIR, `${SYMBOL}-metrics-${day}.csv`), "utf8");
}

/** The real 4-day OI panel (`T-05.2`'s own window), 08-22 genuinely missing — no fixture invented. */
function realOiPanel() {
  const csvTextByDay = new Map<string, string>();
  for (const day of DAYS) {
    try {
      csvTextByDay.set(day, readOiDay(day));
    } catch {
      // 2026-08-22 has no file — the real gap this suite exercises.
    }
  }
  const { points, missingDays } = assembleOiPoints(DAYS, csvTextByDay);
  return buildOiPanel(points, missingDays);
}

test("D5.1 — REAL FIXTURE: the printed stamp for the first OI point of 08-23 is its FECHO, not the raw label", () => {
  const parsed = parseOiMetricsCsv(readOiDay("2026-08-23"));
  const firstPoint = parsed[0];
  assert.equal(firstPoint.timeMs, Date.UTC(2026, 7, 23, 0, 0, 0), "sanity: this IS the raw 00:00:00 bucket-start");
  assert.equal(formatCloseStamp(firstPoint.timeMs, FIVE_MINUTES_MS), "00:05:00Z");
  assert.notEqual(
    formatCloseStamp(firstPoint.timeMs, FIVE_MINUTES_MS),
    "00:00:00Z",
    "the raw bucket-start label is exactly the defect D5.1 exists to catch",
  );
});

test("closeTimeMs is bucket-start + timeframe, nothing else", () => {
  assert.equal(closeTimeMs(0, FIVE_MINUTES_MS), FIVE_MINUTES_MS);
  assert.equal(closeTimeMs(Date.UTC(2026, 7, 23, 0, 0, 0), FIVE_MINUTES_MS), Date.UTC(2026, 7, 23, 0, 5, 0));
});

test("D5.2 — REAL FIXTURE: a 1-minute bar with no OI point of its own reads the held value, secondary-ink labeled", () => {
  const panel = realOiPanel();
  // 2026-08-20 is a fully-covered day: 00:00 has a real OI point; 00:01..00:04 do not
  // (OI's own native cadence is 5 minutes — SPEC-001 §5.12's "1m -> 0,2 points per bar").
  const nativeBucketMs = Date.UTC(2026, 7, 20, 0, 0, 0);
  const queryBucketMs = Date.UTC(2026, 7, 20, 0, 2, 0);
  const reading = resolveStockReading(panel.slots, panel.timeframeMs, queryBucketMs);
  assert.equal(reading.kind, "held");
  assert.equal(reading.observedBucketStartMs, nativeBucketMs);
  assert.equal(reading.observedCloseMs, Date.UTC(2026, 7, 20, 0, 5, 0));
  assert.equal(reading.staleMinutes, 2);
  assert.deepEqual(reading.guideLine, { fromMs: queryBucketMs, toMs: nativeBucketMs });
  assert.equal(formatHeldStockLabel(reading), "de 00:05:00Z (−2m)");
});

test("D5.2 — REAL FIXTURE: the exact native instant is \"exact\", not \"held\" — no guide line, no stale label", () => {
  const panel = realOiPanel();
  const nativeBucketMs = Date.UTC(2026, 7, 20, 0, 0, 0);
  const reading = resolveStockReading(panel.slots, panel.timeframeMs, nativeBucketMs);
  assert.equal(reading.kind, "exact");
  assert.equal(reading.staleMinutes, 0);
  assert.equal(reading.guideLine, null);
  assert.throws(() => formatHeldStockLabel(reading), RangeError);
});

test("D5.2 — REAL FIXTURE: trilho de vigencia caps at ONE native bucket — the SECOND missing bucket is absent, not held for the whole gap day", () => {
  const panel = realOiPanel();
  const gapDayStartMs = Date.UTC(2026, 7, 22, 0, 0, 0);
  const lastGoodBucketMs = Date.UTC(2026, 7, 21, 23, 55, 0); // last real 08-21 observation, right before the gap

  // First missing bucket of the gap day: exactly ONE native bucket back from the last real
  // point still resolves — this is the width the policy PERMITS.
  const firstGapReading = resolveStockReading(panel.slots, panel.timeframeMs, gapDayStartMs);
  assert.equal(firstGapReading.kind, "held");
  assert.equal(firstGapReading.observedBucketStartMs, lastGoodBucketMs);
  assert.equal(firstGapReading.staleMinutes, 5);
  assert.equal(formatHeldStockLabel(firstGapReading), "de 00:00:00Z (−5m)");

  // Second missing bucket: TWO native buckets back from the last real point — the forbidden
  // "trilho maior que grade nativa". The policy refuses to hold this far; must read absent.
  const secondGapReading = resolveStockReading(panel.slots, panel.timeframeMs, gapDayStartMs + FIVE_MINUTES_MS);
  assert.equal(secondGapReading.kind, "absent");
  assert.equal(secondGapReading.value, null);
  assert.equal(secondGapReading.guideLine, null);
});

test("D5.3 — REAL FIXTURE: a CVD bucket on the real missing day (2026-08-22, no aggTrades file) is absent, never held", () => {
  // Deliberately does not read 08-20/08-21/08-23's real (multi-million-row) aggTrades text —
  // the point under test is 08-22's ABSENCE, which needs zero bytes to prove: an empty
  // `csvTextByDay` already reports it missing, the same way `s2-panels.ts`'s own real window
  // does (see that file's header note on the SAME whole-day gap).
  const { deltas, missingDays, coveredDays } = assembleCvdDeltas(["2026-08-22"], new Map());
  assert.deepEqual(missingDays, ["2026-08-22"]);
  const panel = buildCvdPanel(deltas, missingDays, coveredDays);
  const reading = resolveFlowReading(panel.deltaSlots, panel.timeframeMs, Date.UTC(2026, 7, 22, 0, 0, 0));
  assert.equal(reading.kind, "absent");
  assert.equal(formatFlowValue(reading), "—");
});

test("D5.3 — a present FLOW bucket (even a measured zero) is never mistaken for absence", () => {
  const series = buildScalarSeries([{ timeMs: 0, value: 0 }], ONE_MINUTE_MS, 0, 2 * ONE_MINUTE_MS);
  const zeroReading = resolveFlowReading(series.slots, ONE_MINUTE_MS, 0);
  assert.equal(zeroReading.kind, "present");
  assert.equal(formatFlowValue(zeroReading), "0");

  const presentReading = resolveFlowReading(
    buildScalarSeries([{ timeMs: 0, value: 7.5 }], ONE_MINUTE_MS, 0, 2 * ONE_MINUTE_MS).slots,
    ONE_MINUTE_MS,
    0,
  );
  assert.equal(presentReading.kind, "present");
  assert.equal(formatFlowValue(presentReading), "7.5");

  // The SECOND slot (timeMs = ONE_MINUTE_MS) has no point at all — a genuine, unheld absence.
  const absentReading = resolveFlowReading(series.slots, ONE_MINUTE_MS, ONE_MINUTE_MS);
  assert.equal(absentReading.kind, "absent");
  assert.equal(formatFlowValue(absentReading), "—");
});

test("resolveFlowReading rejects a query not aligned to the grid's own timeframe (no floor, ever)", () => {
  const series = buildScalarSeries([{ timeMs: 0, value: 1 }], FIVE_MINUTES_MS, 0, 2 * FIVE_MINUTES_MS);
  assert.throws(() => resolveFlowReading(series.slots, FIVE_MINUTES_MS, 123), RangeError);
});

test("resolveStockReading DOES tolerate an arbitrary sub-instant — that IS the D5.2 case, not a caller error", () => {
  const series = buildScalarSeries([{ timeMs: 0, value: 1 }], FIVE_MINUTES_MS, 0, 2 * FIVE_MINUTES_MS);
  // 123ms floors into the [0, 5min) native bucket, same as any 1-minute price-bar instant would.
  const reading = resolveStockReading(series.slots, FIVE_MINUTES_MS, 123);
  assert.equal(reading.kind, "held");
  assert.equal(reading.value, 1);
  assert.equal(reading.observedBucketStartMs, 0);
});

test("resolveStockReading/resolveFlowReading reject an empty grid", () => {
  assert.throws(() => resolveStockReading([], FIVE_MINUTES_MS, 0), RangeError);
  assert.throws(() => resolveFlowReading([], FIVE_MINUTES_MS, 0), RangeError);
});
