// Unit + real-data tests for the CVD loader/aggregator.
//
// The cross-check against `awk` below is the falsifier for the whole streaming parser: if
// column indices, the sign convention, or the bucket arithmetic were wrong, this is where it
// would show up as a mismatched total, not just "the code ran".
//
// Run with: npm --prefix frontend run test:charts (this file is the ~5-8s one — it parses
// the 08-20 and 08-21 real aggTrades files, ~7.5M rows combined).

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseQuantityToScaled,
  ImprecisePrecisionError,
  accumulateDayIntoTotals,
  assembleCvdDeltas,
  cvdCumulativeScaled,
  unscale,
  QUANTITY_SCALE,
  CVD_BUCKET_WIDTH_MS,
} from "./s2-cvd.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "../../..");
const AGGTRADES_DIR = path.join(REPO_ROOT, "data/binance/aggtrades");

test("parseQuantityToScaled is exact for plain and fractional decimals", () => {
  assert.equal(parseQuantityToScaled("0.03"), 3_000_000n);
  assert.equal(parseQuantityToScaled("0.004"), 400_000n);
  assert.equal(parseQuantityToScaled("1"), QUANTITY_SCALE);
  assert.equal(parseQuantityToScaled("235.919"), 23_591_900_000n);
});

test("parseQuantityToScaled refuses more than 8 decimal digits instead of truncating", () => {
  assert.throws(() => parseQuantityToScaled("0.123456789"), ImprecisePrecisionError);
});

test("parseQuantityToScaled refuses a non-numeric or negative string", () => {
  assert.throws(() => parseQuantityToScaled("abc"), RangeError);
  assert.throws(() => parseQuantityToScaled("-1"), RangeError);
});

test("accumulateDayIntoTotals: sign convention — is_buyer_maker=true subtracts, false adds", () => {
  const csv =
    "agg_trade_id,price,quantity,first_trade_id,last_trade_id,transact_time,is_buyer_maker\n" +
    "1,100,1.5,1,1,1000,false\n" + // +1.5, bucket 0
    "2,100,0.5,2,2,2000,true\n" + // -0.5, bucket 0
    "3,100,2.0,3,3,61000,false\n"; // +2.0, bucket 60000
  const totals = new Map<number, bigint>();
  accumulateDayIntoTotals(csv, totals);
  assert.equal(unscale(totals.get(0) ?? 0n), 1.0);
  assert.equal(unscale(totals.get(CVD_BUCKET_WIDTH_MS) ?? 0n), 2.0);
});

// Cross-checked against an INDEPENDENT tool over the SAME real file, universe declared:
//   LC_ALL=C awk -F, 'NR>1{if ($7=="true") s-=$3; else s+=$3} END{printf "%.6f\n", s}' \
//     data/binance/aggtrades/BTCUSDT-aggTrades-2026-08-20.csv   -> 16872.545000
//   ... -2026-08-21.csv -> 11624.740000
// `LC_ALL=C` matters: this machine's ambient locale made `awk`'s own `printf` print a
// COMMA as the decimal separator on the first (unset-locale) attempt, which looked like a
// completely different (wrong) number until re-run with the locale pinned — a real
// reproducibility trap worth naming so the next person does not repeat it.
test("REAL FIXTURE: 08-20 total signed delta matches an independent awk computation exactly", () => {
  const csv = readFileSync(path.join(AGGTRADES_DIR, "BTCUSDT-aggTrades-2026-08-20.csv"), "utf8");
  const totals = new Map<number, bigint>();
  accumulateDayIntoTotals(csv, totals);
  let sum = 0n;
  for (const value of totals.values()) sum += value;
  assert.equal(unscale(sum).toFixed(3), (16872.545).toFixed(3));
});

test("REAL FIXTURE: 08-21 total signed delta matches an independent awk computation exactly", () => {
  const csv = readFileSync(path.join(AGGTRADES_DIR, "BTCUSDT-aggTrades-2026-08-21.csv"), "utf8");
  const totals = new Map<number, bigint>();
  accumulateDayIntoTotals(csv, totals);
  let sum = 0n;
  for (const value of totals.values()) sum += value;
  assert.equal(unscale(sum).toFixed(3), (11624.74).toFixed(3));
});

test("assembleCvdDeltas: covered days are zero-filled to 1,440 buckets; the missing day contributes none", () => {
  const days = ["2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23"];
  const csvTextByDay = new Map<string, string>();
  for (const day of days) {
    const filePath = path.join(AGGTRADES_DIR, `BTCUSDT-aggTrades-${day}.csv`);
    try {
      csvTextByDay.set(day, readFileSync(filePath, "utf8"));
    } catch {
      // 08-22 has no file — the real gap this test exercises; left absent from the map.
    }
  }
  const { deltas, missingDays, coveredDays } = assembleCvdDeltas(days, csvTextByDay);
  assert.deepEqual(missingDays, ["2026-08-22"]);
  assert.deepEqual(coveredDays, ["2026-08-20", "2026-08-21", "2026-08-23"]);
  assert.equal(deltas.length, 1440 * 3, "3 covered days x 1,440 one-minute buckets each, zero-filled");
});

test("cvdCumulativeScaled skips buckets before the anchor and accumulates the rest in order", () => {
  const deltas = [
    { bucketStartMs: 0, valueScaled: 100n },
    { bucketStartMs: 60_000, valueScaled: -30n },
    { bucketStartMs: 120_000, valueScaled: 10n },
  ];
  const fromZero = cvdCumulativeScaled(deltas, 0);
  assert.deepEqual(
    fromZero.map((point) => point.valueScaled),
    [100n, 70n, 80n],
  );
  const fromSecondBucket = cvdCumulativeScaled(deltas, 60_000);
  assert.deepEqual(
    fromSecondBucket.map((point) => point.valueScaled),
    [-30n, -20n],
  );
});
