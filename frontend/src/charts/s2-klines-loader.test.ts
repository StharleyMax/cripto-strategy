// Unit + real-data tests for the klines (price) parser — did not exist as a dedicated file
// before this task's I/O split (`/review`, `T-05.2-review.md`, WARNING fixed): `parseKlinesCsv`
// was previously only exercised transitively through `s2-panels.test.ts`/
// `s2-axis-integration.test.ts`. Added now that `parseKlinesDays` is a new pure export, per
// the same "keep coverage on the parse logic" discipline `s2-oi-loader.test.ts`/
// `s2-cvd.test.ts` already follow.
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseKlinesCsv, parseKlinesDays } from "./s2-klines-loader.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "../../..");
const KLINES_DIR = path.join(REPO_ROOT, "data/binance/klines/tf2");

test("parseKlinesCsv refuses a CSV missing an expected column instead of guessing", () => {
  assert.throws(() => parseKlinesCsv("open_time,open,high,low,close\n1,2,3,4,5\n"), Error);
});

test("parseKlinesCsv parses a minimal well-formed row by column name, not position", () => {
  const csv =
    "close,open_time,volume,open,high,low\n" + // deliberately out of the "natural" order
    "101,1000,50,100,102,99\n";
  const candles = parseKlinesCsv(csv);
  assert.deepEqual(candles, [{ openTimeMs: 1000, open: 100, high: 102, low: 99, close: 101, volume: 50 }]);
});

test("REAL FIXTURE: parseKlinesDays concatenates 2 real 1m days in the given day order, 1,440 candles each", () => {
  const days = ["2026-08-20", "2026-08-21"];
  const csvTexts = days.map((day) => readFileSync(path.join(KLINES_DIR, `BTCUSDT-1m-${day}.csv`), "utf8"));
  const candles = parseKlinesDays(csvTexts);
  assert.equal(candles.length, 1440 * 2, "2 real days x 1,440 one-minute candles each");
  assert.equal(candles[0].openTimeMs, Date.UTC(2026, 7, 20, 0, 0, 0), "first candle is day 1's first minute");
  assert.equal(candles[1440].openTimeMs, Date.UTC(2026, 7, 21, 0, 0, 0), "day 2 starts right after day 1 ends");
  for (let index = 1; index < candles.length; index += 1) {
    assert.equal(candles[index].openTimeMs - candles[index - 1].openTimeMs, 60_000, `gap at index ${index}`);
  }
});
