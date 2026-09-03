/**
 * Real-data PARSER for the OI panel (`T-05.2`, plan 05 item 5.1) — Coinalyze/Binance
 * `metrics` dump, `data/binance/metrics/BTCUSDT-metrics-<day>.csv`.
 *
 * PURE — `ADR-003` FR-1 ("`charts` não faz I/O ... Toda entrada é argumento"): this module
 * takes already-read CSV text (or its absence) and returns parsed/assembled points, zero
 * `node:fs`. A prior version of this file called `readFileSync`/`existsSync` directly;
 * `/review` (`T-05.2-review.md`, WARNING) found that a production (non-`.test.ts`) module
 * under `frontend/src/charts/` calling `node:fs` cannot be bundled for a browser,
 * contradicting FR-1 — fixed here by moving the disk read to the caller (the `.test.ts`
 * files that need real fixture data, same discipline `canonical-grid-sha256-proof.test.ts`
 * already set for `T-05.1`).
 *
 * ── A REAL DEFECT THIS LOADER EXISTS TO NOT REPEAT: THE ROWS ARE NOT SORTED ──────────────
 *
 * `[MEDIDO 2026-09-03]`: `head -15 data/binance/metrics/BTCUSDT-metrics-2026-08-20.csv`
 * shows row order `00:35, 01:45, 03:30, 05:05, 07:25, 12:25, 13:45, ...` — NOT chronological
 * inside the file. Feeding that order straight into a grid aligner would not corrupt
 * `alignScalarPointsToGrid` (it keys by time, not by row position), but any caller that
 * assumed "first row = earliest" would be wrong silently. This loader sorts explicitly and
 * names the reason, instead of leaving it to be discovered as a bug later.
 *
 * Once sorted, the three "covered" days (`08-20`, `08-21`, `08-23`) are each COMPLETE at
 * native 5-minute resolution — `[MEDIDO 2026-09-03: tail -n +2 <file> | cut -d, -f1 | sort
 * -u | wc -l` → 288 for each of the three files, matching 24h at 5 min, zero duplicates]`.
 * `08-22` has no file at all (`[MEDIDO 2026-09-03: ls data/binance/metrics/*2026-08-22*` →
 * no match]`) — the one real gap this loader reports, not fabricates.
 */

import type { ScalarPoint } from "./s2-scalar-grid.ts";

const OI_COLUMN = "sum_open_interest";

/**
 * Parses `create_time` ("YYYY-MM-DD HH:MM:SS", no zone) as UTC. `Date.parse`/`new Date(...)`
 * on a space-separated (non-`Z`, non-`T`) string is ENGINE-DEPENDENT on which zone it
 * assumes — this regex+`Date.UTC` path is explicit so the result cannot depend on the
 * machine's local timezone.
 */
export function parseCreateTimeUtcMs(createTime: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(createTime);
  if (match === null) {
    throw new RangeError(`create_time "${createTime}" does not match "YYYY-MM-DD HH:MM:SS"`);
  }
  const [, year, month, day, hour, minute, second] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
}

/** Parses one `metrics` CSV day, sorted ascending by `create_time` (see header comment). */
export function parseOiMetricsCsv(csvText: string): readonly ScalarPoint[] {
  const lines = csvText.trim().split("\n");
  const [header, ...rows] = lines;
  const columns = header.split(",");
  const createTimeIndex = columns.indexOf("create_time");
  const oiIndex = columns.indexOf(OI_COLUMN);
  if (createTimeIndex === -1 || oiIndex === -1) {
    throw new Error(`fixture CSV is missing an expected column (create_time/${OI_COLUMN}): ${header}`);
  }
  const points = rows.map((line) => {
    const cells = line.split(",");
    return { timeMs: parseCreateTimeUtcMs(cells[createTimeIndex]), value: Number(cells[oiIndex]) };
  });
  return [...points].sort((left, right) => left.timeMs - right.timeMs);
}

/**
 * Assembles the OI panel's `sum_open_interest` points across `days`, given each day's
 * already-read CSV text keyed by day (a day absent from `csvTextByDay` means no `metrics`
 * file exists for it) — the pure remainder of what used to be `loadOiPoints` (I/O version,
 * removed; see header comment). The absence IS the finding (an explicit gap), not a silent
 * zero-fill. Returns the assembled points plus the set of days that had no file, so a caller
 * can tell "measured, empty" apart from "not measured" (`ADR-012`'s distinction).
 */
export function assembleOiPoints(
  days: readonly string[],
  csvTextByDay: ReadonlyMap<string, string>,
): { points: readonly ScalarPoint[]; missingDays: readonly string[] } {
  const points: ScalarPoint[] = [];
  const missingDays: string[] = [];
  for (const day of days) {
    const csvText = csvTextByDay.get(day);
    if (csvText === undefined) {
      missingDays.push(day);
      continue;
    }
    points.push(...parseOiMetricsCsv(csvText));
  }
  return { points, missingDays };
}

/** Chosen column, declared so a reader does not have to diff this file against the CSV header. */
export const OI_VALUE_COLUMN = OI_COLUMN;
