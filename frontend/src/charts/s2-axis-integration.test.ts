// `T-05.2`'s central proof, in two parts:
//
//  (1) THE T-08.2 CLOSE-OUT the handoff demands BEFORE anything is rendered: does a
//      `GridSlot`/`ScalarSlot` null-gap survive, LOSSLESS, as a `lightweight-charts`
//      whitespace placeholder, at the REAL library call boundary — not just at our own
//      data-structure level? Measured two ways: `series.data().length` after `setData`
//      (a direct round-trip) AND `D5.11` axis fidelity (0.5 px) on the REAL populated
//      points, against the library's own coordinate assignment (`docs/INDEX.md:97`,
//      `axis-fidelity.ts`, reused from `T-08.2` — not reimplemented).
//
//  (2) THE NEGATIVE CONTROL the T-08.2 methodology requires: if a caller instead DROPS the
//      gap slots (the naive, tempting "just filter out the nulls" mistake), does the axis
//      actually break? Without this half, a green on (1) alone would not be evidence — it
//      would be a claim the instrument was never shown able to reject (`axis-spike.ts`'s own
//      argument, restated here at this task's real-data scale, on a REAL gap — the whole of
//      2026-08-22, missing from `data/binance/metrics` and `data/binance/aggtrades` alike —
//      instead of a synthetic one).
//
// Run with: npm --prefix frontend run test:charts (this file alone is the slow one, ~10-15s:
// it parses ~8.9M real aggTrades rows across 3 days — see `s2-cvd.ts` for why that is a
// streaming fold, not a materialized array of trades).

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { measureAxisFidelity, TOLERANCE_PX } from "./axis-fidelity.ts";
import type { CoordinateSample } from "./axis-fidelity.ts";
import { runHeadlessChart } from "./s2-headless-run.ts";
import {
  buildPricePanel,
  buildOiPanel,
  buildCvdPanel,
  SYMBOL,
  DAYS,
  ONE_MINUTE_MS,
  FIVE_MINUTES_MS,
  RANGE_START_MS,
  RANGE_END_MS_EXCLUSIVE,
  S2_PRICE_USE,
} from "./s2-panels.ts";
import { parseKlinesDays } from "./s2-klines-loader.ts";
import { assembleOiPoints } from "./s2-oi-loader.ts";
import { assembleCvdDeltas } from "./s2-cvd.ts";
import { candlestickSeriesLossless, lineSeriesLossless, naiveDropGapsLine } from "./s2-lightweight-adapter.ts";
import { candlestickSeriesColors } from "./color-tokens.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "../../..");
const DATA_ROOT = path.join(REPO_ROOT, "data");
const KLINES_DIR = path.join(DATA_ROOT, "binance/klines/tf2");
const METRICS_DIR = path.join(DATA_ROOT, "binance/metrics");
const AGGTRADES_DIR = path.join(DATA_ROOT, "binance/aggtrades");

const EXPECTED_PRICE_SLOTS = (RANGE_END_MS_EXCLUSIVE - RANGE_START_MS) / ONE_MINUTE_MS;
const EXPECTED_OI_SLOTS = (RANGE_END_MS_EXCLUSIVE - RANGE_START_MS) / FIVE_MINUTES_MS;
const EXPECTED_MISSING_DAY_OI_SLOTS = (24 * 60 * 60_000) / FIVE_MINUTES_MS; // one whole day, 5m grid
const EXPECTED_MISSING_DAY_CVD_SLOTS = (24 * 60 * 60_000) / ONE_MINUTE_MS; // one whole day, 1m grid

/** Reads `dir/<SYMBOL>-<fileInfix>-<day>.csv` for `day`, or `undefined` if it does not exist. */
function readDayCsvIfPresent(dir: string, fileInfix: string, day: string): string | undefined {
  try {
    return readFileSync(path.join(dir, `${SYMBOL}-${fileInfix}-${day}.csv`), "utf8");
  } catch {
    return undefined;
  }
}

// Real I/O (klines + OI + ~8.9M aggTrades rows), done ONCE here — this `.test.ts` file, not
// `s2-panels.ts` (production, pure per `ADR-003` FR-1) — and shared by every `test()` below
// instead of re-read/re-parsed per case.
const klinesCsvTexts = DAYS.map((day) => readFileSync(path.join(KLINES_DIR, `${SYMBOL}-1m-${day}.csv`), "utf8"));
const candles = parseKlinesDays(klinesCsvTexts);

const oiCsvTextByDay = new Map<string, string>();
for (const day of DAYS) {
  const csvText = readDayCsvIfPresent(METRICS_DIR, "metrics", day);
  if (csvText !== undefined) oiCsvTextByDay.set(day, csvText);
}
const { points: oiPoints, missingDays: oiMissingDays } = assembleOiPoints(DAYS, oiCsvTextByDay);

const cvdCsvTextByDay = new Map<string, string>();
for (const day of DAYS) {
  const csvText = readDayCsvIfPresent(AGGTRADES_DIR, "aggTrades", day);
  if (csvText !== undefined) cvdCsvTextByDay.set(day, csvText);
}
const { deltas: cvdDeltas, missingDays: cvdMissingDays, coveredDays: cvdCoveredDays } = assembleCvdDeltas(
  DAYS,
  cvdCsvTextByDay,
);

// `T-05.5`: `buildPricePanel` now returns a `PricePanel` (`{priceSource, priceUse, series}`)
// — `price` here stays the plain `ChartSeries` every assertion below already expects
// (`.slots`), by pulling `.series` out at the one call site instead of touching each one.
const price = buildPricePanel(candles, S2_PRICE_USE).series;
const oi = buildOiPanel(oiPoints, oiMissingDays);
const cvd = buildCvdPanel(cvdDeltas, cvdMissingDays, cvdCoveredDays);

test("fixture precondition: exactly one real gap day (08-22), shared by OI and CVD, price gapless", () => {
  assert.deepEqual(oi.missingDays, ["2026-08-22"]);
  assert.deepEqual(cvd.missingDays, ["2026-08-22"]);
  assert.deepEqual(cvd.coveredDays, ["2026-08-20", "2026-08-21", "2026-08-23"]);
  assert.ok(
    price.slots.every((slot) => slot.candle !== null),
    "price panel must be gapless across the 4-day window (T-05.1 handoff's chosen range)",
  );
});

function samplesFrom(
  items: readonly { time: number }[],
  source: CoordinateSample["source"],
  coordinateOf: (timeSeconds: number) => number | null,
): CoordinateSample[] {
  const samples: CoordinateSample[] = [];
  for (const item of items) {
    if (Object.keys(item).length === 1) {
      continue; // whitespace — has no `event_time`-bearing value to check fidelity against
    }
    const actualX = coordinateOf(item.time);
    assert.notEqual(actualX, null, `chart refused to place time ${item.time} — universe would differ from declared`);
    samples.push({ time: item.time, actualX: actualX as number, source });
  }
  return samples;
}

test("D5.11 + null-gap survival, LOSSLESS: price + OI + CVD delta + CVD cumulative on one shared axis", async () => {
  const priceItems = candlestickSeriesLossless(price.slots);
  const oiItems = lineSeriesLossless(oi.slots);
  const cvdDeltaItems = lineSeriesLossless(cvd.deltaSlots);
  const cvdCumItems = lineSeriesLossless(cvd.cumulativeSlots);

  // `T-05.7`: the price panel's candlestick series is styled from NAMED ADR-010 tokens, not
  // the library's own defaults (`#26a69a`/`#ef5350`, unrelated to `#089981`/`#f23645`) — see
  // `color-tokens.ts`'s module docstring for why these exact hexes and no others.
  const priceColors = candlestickSeriesColors("dark");
  // `HeadlessSeriesSpec.items` is `readonly Record<string, unknown>[]` (the shape
  // `runHeadlessChart` forwards verbatim to `series.setData`); `*Lossless`'s items are the
  // narrower `CandlestickItem | LineItem | WhitespaceItem` unions, which have no index
  // signature. Mechanical cast, same shape already accepted at `spec.items as never` inside
  // `s2-headless-run.ts:129`.
  const handle = await runHeadlessChart([
    {
      label: "price",
      kind: "candlestick",
      items: priceItems as unknown as readonly Record<string, unknown>[],
      style: priceColors,
    },
    { label: "oi", kind: "line", items: oiItems as unknown as readonly Record<string, unknown>[] },
    { label: "cvd_delta", kind: "line", items: cvdDeltaItems as unknown as readonly Record<string, unknown>[] },
    { label: "cvd_cum", kind: "line", items: cvdCumItems as unknown as readonly Record<string, unknown>[] },
  ]);
  try {
    // ── (1) WHAT WAS SENT vs WHAT `.data()` REPORTS BACK — the measured surprise ─────────
    // `.data()` silently drops whitespace entries (see `HeadlessSeriesResult.dataLength`'s
    // own doc comment) — so `dataLength` is asserted equal to the REAL-point count, not the
    // full canonical-slot count. `itemsSent`/`whitespaceItemsSent` are what prove this run
    // actually ASKED the library to place one item per slot, gaps included; the true
    // lossless-ness proof is part (2) below (axis coordinates), not this round-trip.
    const byLabel = new Map(handle.seriesResults.map((result) => [result.label, result]));
    assert.equal(byLabel.get("price")?.itemsSent, EXPECTED_PRICE_SLOTS);
    assert.equal(byLabel.get("price")?.whitespaceItemsSent, 0, "price has no real gap in this window");
    assert.equal(byLabel.get("price")?.dataLength, EXPECTED_PRICE_SLOTS);
    assert.equal(byLabel.get("oi")?.itemsSent, EXPECTED_OI_SLOTS);
    assert.equal(byLabel.get("oi")?.whitespaceItemsSent, EXPECTED_MISSING_DAY_OI_SLOTS);
    assert.equal(byLabel.get("oi")?.dataLength, EXPECTED_OI_SLOTS - EXPECTED_MISSING_DAY_OI_SLOTS);
    assert.equal(byLabel.get("cvd_delta")?.itemsSent, EXPECTED_PRICE_SLOTS);
    assert.equal(byLabel.get("cvd_delta")?.whitespaceItemsSent, EXPECTED_MISSING_DAY_CVD_SLOTS);
    assert.equal(byLabel.get("cvd_delta")?.dataLength, EXPECTED_PRICE_SLOTS - EXPECTED_MISSING_DAY_CVD_SLOTS);
    assert.equal(byLabel.get("cvd_cum")?.itemsSent, EXPECTED_PRICE_SLOTS);
    assert.equal(byLabel.get("cvd_cum")?.whitespaceItemsSent, EXPECTED_MISSING_DAY_CVD_SLOTS);
    assert.equal(byLabel.get("cvd_cum")?.dataLength, EXPECTED_PRICE_SLOTS - EXPECTED_MISSING_DAY_CVD_SLOTS);
    process.stderr.write(`[T-05.2][lossless] sent vs data(): ${JSON.stringify(handle.seriesResults)}\n`);

    // `T-05.7`: the color the REAL library stored for the price series is read back — not
    // just the object we passed in — and it is the ADR-010 token, not the library default
    // (`#26a69a`/`#ef5350`).
    assert.deepEqual(byLabel.get("price")?.appliedCandlestickColors, {
      upColor: priceColors.upColor,
      downColor: priceColors.downColor,
    });

    // ── (2) D5.11 ITSELF: coordinates of the REAL points against their own event_time ────
    const samples = [
      ...samplesFrom(priceItems, "candle", handle.coordinateOf),
      ...samplesFrom(oiItems, "point", handle.coordinateOf),
      ...samplesFrom(cvdDeltaItems, "point", handle.coordinateOf),
      ...samplesFrom(cvdCumItems, "point", handle.coordinateOf),
    ];
    const report = measureAxisFidelity(samples, TOLERANCE_PX);
    process.stderr.write(
      `[T-05.2][lossless] D5.11 combined: n=${report.sampleCount} distinct_t=${report.distinctTimeCount} ` +
        `worst=${report.worstErrorPx.toFixed(4)}px tol=${report.tolerancePx}px within=${report.withinTolerance}\n`,
    );
    assert.equal(
      report.withinTolerance,
      true,
      `D5.11 FAILED at this task's real scale: worst case ${report.worstErrorPx} px > ${TOLERANCE_PX} px`,
    );
  } finally {
    handle.close();
  }
});

/**
 * Isolates ONE series per chart (no always-complete price series sharing the axis) — a
 * chart's time scale is the UNION of every series' own times, so a gapless price series
 * would force the shared axis complete regardless of how OI/CVD handled their own gap,
 * masking exactly the contrast this test needs to show. See `s2-headless-run.ts`'s
 * docstring for the same point.
 */
async function measureIsolated(
  label: string,
  lossless: readonly { time: number }[],
  naive: readonly { time: number }[],
  gapTimeSeconds: number,
): Promise<{
  lossless: ReturnType<typeof measureAxisFidelity>;
  naive: ReturnType<typeof measureAxisFidelity>;
  losslessGapCoordinate: number | null;
  naiveGapCoordinate: number | null;
}> {
  const losslessHandle = await runHeadlessChart([{ label, kind: "line", items: lossless }]);
  let losslessReport;
  let losslessGapCoordinate: number | null;
  try {
    const samples = samplesFrom(lossless, "point", losslessHandle.coordinateOf);
    losslessReport = measureAxisFidelity(samples, TOLERANCE_PX);
    losslessGapCoordinate = losslessHandle.coordinateOf(gapTimeSeconds);
  } finally {
    losslessHandle.close();
  }

  const naiveHandle = await runHeadlessChart([{ label: `${label}_naive`, kind: "line", items: naive }]);
  let naiveReport;
  let naiveGapCoordinate: number | null;
  try {
    const samples = samplesFrom(naive, "point", naiveHandle.coordinateOf);
    naiveReport = measureAxisFidelity(samples, TOLERANCE_PX);
    naiveGapCoordinate = naiveHandle.coordinateOf(gapTimeSeconds);
  } finally {
    naiveHandle.close();
  }
  return { lossless: losslessReport, naive: naiveReport, losslessGapCoordinate, naiveGapCoordinate };
}

/** The first instant of the missing day (2026-08-22T00:00Z), in UNIX seconds. */
const GAP_DAY_START_SECONDS = Date.UTC(2026, 7, 22, 0, 0, 0) / 1000;

test("NEGATIVE CONTROL — OI: dropping the gap (naive) breaks D5.11 that whitespace (lossless) keeps", async () => {
  const lossless = lineSeriesLossless(oi.slots);
  const naive = naiveDropGapsLine(oi.slots);
  assert.equal(naive.length, EXPECTED_OI_SLOTS - EXPECTED_MISSING_DAY_OI_SLOTS, "naive must actually drop the gap day");

  const { lossless: losslessReport, naive: naiveReport, losslessGapCoordinate, naiveGapCoordinate } =
    await measureIsolated("oi", lossless, naive, GAP_DAY_START_SECONDS);
  process.stderr.write(
    `[T-05.2][OI] lossless worst=${losslessReport.worstErrorPx.toFixed(4)}px within=${losslessReport.withinTolerance} ` +
      `gapCoord=${losslessGapCoordinate} | naive worst=${naiveReport.worstErrorPx.toFixed(4)}px ` +
      `within=${naiveReport.withinTolerance} gapCoord=${naiveGapCoordinate}\n`,
  );
  // THE CORE CLAIM: the whitespace slot RESERVES an axis position (lossless), the dropped
  // slot simply DOES NOT EXIST on the naive axis (the library returns `null`, "not placed").
  assert.notEqual(losslessGapCoordinate, null, "the gap day's first minute must resolve to a coordinate in the lossless series");
  assert.equal(naiveGapCoordinate, null, "the gap day's first minute must NOT exist on the naive (gap-dropped) axis");
  assert.equal(losslessReport.withinTolerance, true, "lossless (whitespace-filled) OI must pass D5.11");
  assert.equal(naiveReport.withinTolerance, false, "naive (gap-dropped) OI must FAIL D5.11 — the risk this test proves is real");
  assert.ok(
    naiveReport.worstErrorPx > losslessReport.worstErrorPx,
    "the naive mapping must be measurably worse, not just differently green",
  );
});

test("NEGATIVE CONTROL — CVD delta: dropping the gap (naive) breaks D5.11 that whitespace (lossless) keeps", async () => {
  const lossless = lineSeriesLossless(cvd.deltaSlots);
  const naive = naiveDropGapsLine(cvd.deltaSlots);
  assert.equal(
    naive.length,
    EXPECTED_PRICE_SLOTS - EXPECTED_MISSING_DAY_CVD_SLOTS,
    "naive must actually drop the gap day",
  );

  const { lossless: losslessReport, naive: naiveReport, losslessGapCoordinate, naiveGapCoordinate } =
    await measureIsolated("cvd_delta", lossless, naive, GAP_DAY_START_SECONDS);
  process.stderr.write(
    `[T-05.2][CVD delta] lossless worst=${losslessReport.worstErrorPx.toFixed(4)}px within=${losslessReport.withinTolerance} ` +
      `gapCoord=${losslessGapCoordinate} | naive worst=${naiveReport.worstErrorPx.toFixed(4)}px ` +
      `within=${naiveReport.withinTolerance} gapCoord=${naiveGapCoordinate}\n`,
  );
  assert.notEqual(losslessGapCoordinate, null, "the gap day's first minute must resolve to a coordinate in the lossless series");
  assert.equal(naiveGapCoordinate, null, "the gap day's first minute must NOT exist on the naive (gap-dropped) axis");
  assert.equal(losslessReport.withinTolerance, true, "lossless (whitespace-filled) CVD delta must pass D5.11");
  assert.equal(
    naiveReport.withinTolerance,
    false,
    "naive (gap-dropped) CVD delta must FAIL D5.11 — the risk this test proves is real",
  );
  assert.ok(
    naiveReport.worstErrorPx > losslessReport.worstErrorPx,
    "the naive mapping must be measurably worse, not just differently green",
  );
});
