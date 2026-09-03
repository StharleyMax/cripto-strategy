// D5.9's falsifier, executed: "sha256 da projecao canonica IGUAL sobre 4 dias x 1 simbolo x
// 3 TFs" (`docs/plans/SPEC-001-plataforma-dados/05_fatia_visivel.md:37`).
//
// Real data, not synthetic (`T-05.1` handoff, literal: "check data/binance/klines/ — same
// real-data-only discipline as every other task this session, never synthetic fixtures"),
// same fixture-resolution discipline `universe-at.test.ts` uses (`fileURLToPath`, never
// `cwd`): `BTCUSDT` klines, `data/binance/klines/tf2/`, catalogued in `data/MANIFEST.md`
// row "`klines/tf2/` | `klines` 1m e 15m de BTCUSDT, 8 dias".
//
// UNIVERSE, declared before any number below is read (`CLAUDE.md`, "nenhum numero sem o
// comando"):
//   symbol     BTCUSDT
//   days (4)   2026-08-20, 08-21, 08-22, 08-23 (UTC), contiguous — verified gapless below
//   timeframes (3)  1m (native), 15m (native), 1h (DERIVED from the native 1m series via
//                   `aggregateCandles`, because the only native 1h file in this fixture set
//                   covers a single day — `[MEDIDO 2026-09-02: wc -l
//                   data/binance/klines/tf2/BTCUSDT-1h-2026-08-23.csv -> 25 linhas = 24
//                   horas]`. This is exact-aggregation of real ticks, not synthetic data —
//                   the same rollup `aggregateCandles`'s own docstring names as "not a
//                   second implementation", applied here to widen the real-data universe
//                   from 1 day to 4 without inventing a single price.
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { aggregateCandles } from "./canonical-grid.ts";
import type { RawCandle } from "./canonical-grid.ts";
import { buildChartSeries } from "./canonical-grid-chart-consumer.ts";
import { buildBarAccessor } from "./canonical-grid-accessor-consumer.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "../../..");
const KLINES_DIR = path.join(REPO_ROOT, "data/binance/klines/tf2");

const SYMBOL = "BTCUSDT";
const DAYS = ["2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23"] as const;

// Epoch-millisecond edges of the 4-day window, independently stated (not read off the
// files) so the gapless assertion below is checking the data against a claim, not against
// itself.
const RANGE_START_MS = Date.UTC(2026, 7, 20, 0, 0, 0);
const RANGE_END_MS_EXCLUSIVE = Date.UTC(2026, 7, 24, 0, 0, 0);
const ONE_MINUTE_MS = 60_000;
const FIFTEEN_MINUTES_MS = 15 * 60_000;
const ONE_HOUR_MS = 60 * 60_000;

/** Parses one Binance kline dump CSV (`open_time,open,high,low,close,volume,...`). */
function parseKlinesCsv(csvText: string): readonly RawCandle[] {
  const lines = csvText.trim().split("\n");
  const [header, ...rows] = lines;
  const columns = header.split(",");
  const openTimeIndex = columns.indexOf("open_time");
  const openIndex = columns.indexOf("open");
  const highIndex = columns.indexOf("high");
  const lowIndex = columns.indexOf("low");
  const closeIndex = columns.indexOf("close");
  const volumeIndex = columns.indexOf("volume");
  if ([openTimeIndex, openIndex, highIndex, lowIndex, closeIndex, volumeIndex].includes(-1)) {
    throw new Error(`fixture CSV is missing an expected column: ${header}`);
  }
  return rows.map((line) => {
    const cells = line.split(",");
    return {
      openTimeMs: Number(cells[openTimeIndex]),
      open: Number(cells[openIndex]),
      high: Number(cells[highIndex]),
      low: Number(cells[lowIndex]),
      close: Number(cells[closeIndex]),
      volume: Number(cells[volumeIndex]),
    };
  });
}

function loadDay(timeframeLabel: "1m" | "15m", day: string): readonly RawCandle[] {
  const filePath = path.join(KLINES_DIR, `${SYMBOL}-${timeframeLabel}-${day}.csv`);
  return parseKlinesCsv(readFileSync(filePath, "utf8"));
}

function loadFourDays(timeframeLabel: "1m" | "15m"): readonly RawCandle[] {
  return DAYS.flatMap((day) => loadDay(timeframeLabel, day));
}

/** Deterministic JSON: `GridSlot[]` already has a fixed key order per object literal. */
function sha256OfSlots(slots: readonly unknown[]): string {
  return createHash("sha256").update(JSON.stringify(slots)).digest("hex");
}

const NATIVE_1M = loadFourDays("1m");
const NATIVE_15M = loadFourDays("15m");
const DERIVED_1H = aggregateCandles(NATIVE_1M, ONE_MINUTE_MS, ONE_HOUR_MS);

test("fixture precondition: the native 4-day series are gapless at their own resolution", () => {
  const assertGapless = (candles: readonly RawCandle[], stepMs: number): void => {
    for (let index = 1; index < candles.length; index += 1) {
      assert.equal(
        candles[index].openTimeMs - candles[index - 1].openTimeMs,
        stepMs,
        `gap at index ${index}`,
      );
    }
  };
  assert.equal(NATIVE_1M.length, 4 * 24 * 60);
  assert.equal(NATIVE_15M.length, 4 * 24 * 4);
  assertGapless(NATIVE_1M, ONE_MINUTE_MS);
  assertGapless(NATIVE_15M, FIFTEEN_MINUTES_MS);
  assert.equal(NATIVE_1M[0].openTimeMs, RANGE_START_MS);
  assert.equal(NATIVE_1M[NATIVE_1M.length - 1].openTimeMs, RANGE_END_MS_EXCLUSIVE - ONE_MINUTE_MS);
});

test("aggregateCandles(1m -> 1h) matches the native 1h series bar for bar (correctness cross-check)", () => {
  const nativeOneHourText = readFileSync(path.join(KLINES_DIR, `${SYMBOL}-1h-2026-08-23.csv`), "utf8");
  const nativeOneHour = parseKlinesCsv(nativeOneHourText);
  const derivedThatDay = DERIVED_1H.filter(
    (candle) => candle.openTimeMs >= nativeOneHour[0].openTimeMs && candle.openTimeMs <= nativeOneHour[nativeOneHour.length - 1].openTimeMs,
  );
  assert.equal(derivedThatDay.length, nativeOneHour.length);
  for (let index = 0; index < nativeOneHour.length; index += 1) {
    assert.equal(derivedThatDay[index].openTimeMs, nativeOneHour[index].openTimeMs);
    assert.equal(derivedThatDay[index].open, nativeOneHour[index].open);
    assert.equal(derivedThatDay[index].high, nativeOneHour[index].high);
    assert.equal(derivedThatDay[index].low, nativeOneHour[index].low);
    assert.equal(derivedThatDay[index].close, nativeOneHour[index].close);
  }
});

const TIMEFRAMES: ReadonlyArray<{ label: string; ms: number; candles: readonly RawCandle[] }> = [
  { label: "1m", ms: ONE_MINUTE_MS, candles: NATIVE_1M },
  { label: "15m", ms: FIFTEEN_MINUTES_MS, candles: NATIVE_15M },
  { label: "1h", ms: ONE_HOUR_MS, candles: DERIVED_1H },
];

const combinedHashInput: string[] = [];

for (const timeframe of TIMEFRAMES) {
  test(`D5.9: chart-consumer and accessor-consumer produce byte-identical slots — ${SYMBOL} ${timeframe.label}, 4 days`, () => {
    const chartSeries = buildChartSeries(timeframe.candles, timeframe.ms, RANGE_START_MS, RANGE_END_MS_EXCLUSIVE);
    const barAccessor = buildBarAccessor(timeframe.candles, timeframe.ms, RANGE_START_MS, RANGE_END_MS_EXCLUSIVE);

    const expectedSlotCount = (RANGE_END_MS_EXCLUSIVE - RANGE_START_MS) / timeframe.ms;
    assert.equal(chartSeries.slots.length, expectedSlotCount);
    assert.equal(barAccessor.slots.length, expectedSlotCount);
    assert.ok(
      chartSeries.slots.every((slot) => slot.candle !== null),
      `expected a fully populated grid for ${timeframe.label} (no gaps in the fixture)`,
    );

    const chartHash = sha256OfSlots(chartSeries.slots);
    const accessorHash = sha256OfSlots(barAccessor.slots);
    assert.equal(
      chartHash,
      accessorHash,
      `${timeframe.label}: chart-consumer sha256 (${chartHash}) != accessor-consumer sha256 (${accessorHash})`,
    );
    combinedHashInput.push(chartHash);

    // Cross-check the accessor's index/lookup API against the same slots the chart sees.
    assert.deepEqual(barAccessor.barAt(0), chartSeries.slots[0]);
    assert.deepEqual(barAccessor.barAt(barAccessor.slots.length - 1), chartSeries.slots[chartSeries.slots.length - 1]);
    assert.equal(barAccessor.indexAt(chartSeries.slots[1].time), 1);
    assert.equal(barAccessor.indexAt(RANGE_START_MS - timeframe.ms), -1);
  });
}

test("D5.9: the combined sha256 over all 3 timeframes is stable and printed for the gate report", () => {
  assert.equal(combinedHashInput.length, 3, "the 3 per-timeframe tests above must run first and each push one hash");
  const combined = createHash("sha256").update(combinedHashInput.join("|")).digest("hex");
  // Not asserted against a hardcoded literal (that would just be re-stating today's
  // number); printed so the gate report can quote the exact figure this run produced.
  process.stderr.write(`D5.9 combined sha256 (${SYMBOL}, 4 days, [1m,15m,1h]): ${combined}\n`);
  assert.equal(combined.length, 64);
});
