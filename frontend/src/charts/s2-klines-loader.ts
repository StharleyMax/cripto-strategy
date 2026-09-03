/**
 * Real-data PARSER for the Price panel (`T-05.2`, plan 05 item 5.1) — Binance klines dump,
 * `data/binance/klines/tf2/BTCUSDT-<tf>-<day>.csv`.
 *
 * PURE — `ADR-003` FR-1 ("`charts` não faz I/O ... Toda entrada é argumento"): this module
 * takes already-read CSV text and returns parsed candles, zero `node:fs`. The disk read
 * (`readFileSync`) lives only in the `.test.ts` files that need real fixture data — same
 * discipline `canonical-grid-sha256-proof.test.ts` already set for `T-05.1`. A prior version
 * of this file called `readFileSync` directly; `/review` (`T-05.2-review.md`, WARNING) found
 * that a production (non-`.test.ts`) module under `frontend/src/charts/` calling `node:fs`
 * cannot be bundled for a browser, contradicting FR-1 — fixed here by moving the disk read
 * to the caller.
 */

import type { RawCandle } from "./canonical-grid.ts";

/** Parses one Binance kline dump CSV (`open_time,open,high,low,close,volume,...`). */
export function parseKlinesCsv(csvText: string): readonly RawCandle[] {
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

/**
 * Parses and concatenates several already-read days of the same native timeframe, in the
 * given day order — the pure remainder of what used to be `loadKlinesDays` (I/O version,
 * removed; see header comment).
 */
export function parseKlinesDays(csvTextsInDayOrder: readonly string[]): readonly RawCandle[] {
  return csvTextsInDayOrder.flatMap((csvText) => parseKlinesCsv(csvText));
}
