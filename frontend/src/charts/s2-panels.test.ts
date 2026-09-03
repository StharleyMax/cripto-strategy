// Sanity tests for panel ASSEMBLY (grid shape, missing-day reporting) — the CVD panel's own
// correctness is covered in `s2-cvd.test.ts` and its axis behavior in
// `s2-axis-integration.test.ts`; kept OUT of this file so the real ~8.9M-row aggTrades parse
// does not run three times across the suite.
//
// This file does the real disk I/O (`readFileSync`) itself and hands already-read text to the
// pure parsers/panel builders — `frontend/src/charts/*.ts` (non-`.test.ts`) modules do zero
// I/O per `ADR-003` FR-1; see `s2-panels.ts`'s own header for why (`/review`,
// `T-05.2-review.md`, WARNING fixed).
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildPricePanel,
  buildOiPanel,
  SYMBOL,
  DAYS,
  RANGE_START_MS,
  RANGE_END_MS_EXCLUSIVE,
  ONE_MINUTE_MS,
  FIVE_MINUTES_MS,
  S2_PRICE_USE,
} from "./s2-panels.ts";
import { parseKlinesDays } from "./s2-klines-loader.ts";
import { assembleOiPoints } from "./s2-oi-loader.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "../../..");
const DATA_ROOT = path.join(REPO_ROOT, "data");
const KLINES_DIR = path.join(DATA_ROOT, "binance/klines/tf2");
const METRICS_DIR = path.join(DATA_ROOT, "binance/metrics");

test("buildPricePanel: 4 gapless days at 1-minute resolution, BTCUSDT", () => {
  const csvTexts = DAYS.map((day) => readFileSync(path.join(KLINES_DIR, `${SYMBOL}-1m-${day}.csv`), "utf8"));
  const candles = parseKlinesDays(csvTexts);
  const panel = buildPricePanel(candles, S2_PRICE_USE);
  assert.equal(panel.series.timeframeMs, ONE_MINUTE_MS);
  assert.equal(panel.series.slots.length, (RANGE_END_MS_EXCLUSIVE - RANGE_START_MS) / ONE_MINUTE_MS);
  assert.ok(panel.series.slots.every((slot) => slot.candle !== null));
});

test("T-05.5/5.7: the price panel declares price_source AND price_use on the panel row", () => {
  const csvTexts = DAYS.map((day) => readFileSync(path.join(KLINES_DIR, `${SYMBOL}-1m-${day}.csv`), "utf8"));
  const candles = parseKlinesDays(csvTexts);
  const panel = buildPricePanel(candles, S2_PRICE_USE);
  assert.equal(panel.priceUse, "structure_detection");
  // ADR-007's table: structure_detection -> klines_last (negotiated price, not the 1 Hz mark).
  assert.equal(panel.priceSource, "klines_last");
});

test("buildOiPanel: 08-22 is reported as the missing day, slots explicit null there", () => {
  const csvTextByDay = new Map<string, string>();
  for (const day of DAYS) {
    const filePath = path.join(METRICS_DIR, `${SYMBOL}-metrics-${day}.csv`);
    try {
      csvTextByDay.set(day, readFileSync(filePath, "utf8"));
    } catch {
      // 08-22 has no file — the real gap this test exercises; left absent from the map.
    }
  }
  const { points, missingDays } = assembleOiPoints(DAYS, csvTextByDay);
  const panel = buildOiPanel(points, missingDays);
  assert.deepEqual(panel.missingDays, ["2026-08-22"]);
  assert.equal(panel.timeframeMs, FIVE_MINUTES_MS);
  const gapDayStartMs = Date.UTC(2026, 7, 22, 0, 0, 0);
  const gapDaySlots = panel.slots.filter((slot) => slot.time >= gapDayStartMs && slot.time < gapDayStartMs + 86_400_000);
  assert.equal(gapDaySlots.length, 288);
  assert.ok(gapDaySlots.every((slot) => slot.value === null));
  const populatedSlots = panel.slots.filter((slot) => slot.value !== null);
  assert.equal(populatedSlots.length, 288 * 3);
});
