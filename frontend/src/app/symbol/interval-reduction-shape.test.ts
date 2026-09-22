/**
 * `T-03.11` (`CST-226`, plan `03` DoD 8, `RN-4`) — the falsifier for the claim the Playwright
 * spec (`e2e/18-tf-refetch-e-ablacao.spec.ts`) cannot make on real numbers in the weak (sqlite)
 * universe `make e2e` composes: *"sob TF explícito, `wire-points` deixa de ser `5x
 * native-bars`"*.
 *
 * ── WHY A SYNTHETIC FIXTURE, AND WHY IT IS SAFE TO TRUST ─────────────────────────────────────
 *
 * The shape below is not invented — it is a TRANSCRIPTION of the backend's own row-shaping code
 * (`backend/src/modules/sentimento/use_cases/series_history.py::build_series_history_report`,
 * read here, never imported — same "read, never re-derived" discipline `supported-timeframes.ts`
 * already uses for the interval SET itself):
 *
 *   - `outer_bucket_ends = range(first_outer_bucket_end, window_end_ms + 1, interval_ms)` — ONE
 *     row is emitted per OUTER bucket, spaced by the REQUESTED `interval`, never by the fixed
 *     `_GRID_STEP_MS` (60 000 ms) the pre-`ADR-040` route always used.
 *   - `group_size = interval_ms // _GRID_STEP_MS`. At `interval="1m"`, `group_size === 1` and
 *     `_row_from_native_reading` emits the degenerate case: ONE 1-minute-spaced row per NATIVE
 *     1-minute instant, string in/string out. For a `STOCK`, carry-forward series (OI,
 *     `CARRY_FORWARD_BY_NATURE[Nature.STOCK] = True`) with a `5m` native cadence, four of every
 *     five consecutive 1-minute instants read the SAME held value as their neighbour — the
 *     "staircase" `GA-2`/`RN-S1` names, and the shape `12-oi-dado-real.spec.ts`'s own MORDE
 *     fixture already builds by hand for the `interval="1m"`-only world that predates this task.
 *   - At `interval != "1m"`, `group_size > 1` and EVERY row instead comes from
 *     `_reaggregated_row` — ONE row per OUTER bucket, no repetition: the staircase this file
 *     exists to falsify is a property of `interval="1m"` alone, not of the series' own nature.
 *
 * `SymbolClient.tsx`/`page.tsx` never re-implement this grouping (`ADR-003`: `web` computes no
 * bucket boundary) — they only COUNT what arrives, with `view-model.ts`'s own
 * `scalarPointsFromHistoryRows`/`countPresentSlots` (imported below, not reimplemented), the
 * exact pair `page.tsx` calls to build `oi.nativeBars` (`oiGridSlots`) and `oi.wirePoints`
 * (`oiResult.rows.filter((row) => row.value !== null).length`, mirrored here as `wirePoints`
 * for the same reason `countRows` is written out by hand in `e2e/12`: importing `SymbolClient.tsx`
 * would drag `lightweight-charts` into `node --test`, which `12-oi-dado-real.spec.ts`'s own header
 * already documents killing the WHOLE collection under Playwright's loader).
 *
 * `[MEDIDO 2026-09-19]` baseline this file falsifies against, literal from `tasks.toml`'s own
 * DoD 8: `data-oi-wire-points="5760"` for `data-oi-native-bars="1152"` — a `5x` staircase, and
 * ONLY ever measured at `interval="1m"` (the one interval the route served before `ADR-040/D1`).
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildScalarSeries, FIVE_MINUTES_MS, ONE_MINUTE_MS } from "../../charts/index.ts";
import type { SeriesHistoryRow } from "./series-history-client.ts";
import { SUPPORTED_TIMEFRAMES } from "./supported-timeframes.ts";
import { countPresentSlots, scalarPointsFromHistoryRows } from "./view-model.ts";

/** The series' own native cadence — OI's, the one `DoD 8`'s baseline was measured against
 * (`series_key.py`'s `native_grid_ms`, transcribed the same way `12-oi-dado-real.spec.ts`'s
 * `NATIVE_GRID_MS` already is). */
const NATIVE_GRID_MS = FIVE_MINUTES_MS;

/**
 * Builds the EXACT row shape `build_series_history_report` emits for `nativeBucketCount` native
 * OI buckets, at the given `interval`, over a window that starts at `windowStartMs` (a multiple
 * of `NATIVE_GRID_MS`, same alignment invariant `request-window.ts`'s own `alignmentMs` now
 * guarantees since this task).
 *
 * ⚠️ THE FIRST ROW LANDS **AT** `windowStartMs`, NEVER ONE STEP AFTER IT — this is
 * `_first_grid_instant`'s own arithmetic (`series_history.py`): `-(-window_start_ms //
 * step_ms) * step_ms` is a ceiling division that returns `window_start_ms` UNCHANGED whenever
 * it is already a multiple of `step_ms` — which it always is here, by the SAME invariant
 * `request-window.ts`'s `alignmentMs` rise (this task) guarantees for the real route. Getting
 * this wrong is exactly the off-by-one-bucket mismatch `alignScalarPointsToGrid` (`charts`,
 * `s2-scalar-grid.ts`) refuses to paper over: a `ScalarPoint.timeMs` that does not land
 * EXACTLY on a grid instant throws, loud, rather than silently shifting the series by one bar.
 *
 * `interval === "1m"`: `group_size === 1` — one row per NATIVE minute, staircase-repeated (the
 * held value stays constant for the `NATIVE_GRID_MS / ONE_MINUTE_MS` (5) minutes of its own
 * bucket, then steps to the bucket's own new value) — `_row_from_native_reading`'s degenerate
 * path, `STOCK` carry-forward.
 *
 * `interval !== "1m"`: `group_size > 1` — one row per OUTER bucket (`interval`-spaced), value
 * taken as the bucket's own reading (no repetition) — `_reaggregated_row`'s path.
 */
function buildBackendShapedRows(
  nativeBucketCount: number,
  interval: string,
  windowStartMs: number,
): readonly SeriesHistoryRow[] {
  const intervalMs = SUPPORTED_TIMEFRAMES.find((option) => option.interval === interval)?.stepMs;
  if (intervalMs === undefined) {
    throw new Error(`buildBackendShapedRows: ${JSON.stringify(interval)} is not a member of SUPPORTED_TIMEFRAMES`);
  }
  const windowEndMsExclusive = windowStartMs + nativeBucketCount * NATIVE_GRID_MS;
  const lastEventTimeMs = windowEndMsExclusive - intervalMs; // <= windowEndMsInclusive, on the outer grid

  if (intervalMs === ONE_MINUTE_MS) {
    // `group_size === 1` — one row per NATIVE 1-minute instant, staircase-held per native bucket.
    const rows: SeriesHistoryRow[] = [];
    for (let eventTimeMs = windowStartMs; eventTimeMs <= lastEventTimeMs; eventTimeMs += ONE_MINUTE_MS) {
      const nativeBucketIndex = Math.floor((eventTimeMs - windowStartMs) / NATIVE_GRID_MS);
      rows.push({ event_time: eventTimeMs, available_at: eventTimeMs, value: String(70_000 + nativeBucketIndex), absence: null, coverage: null });
    }
    return rows;
  }

  // `group_size > 1` — one row per OUTER (`interval`-spaced) bucket, no repetition.
  const rows: SeriesHistoryRow[] = [];
  for (let eventTimeMs = windowStartMs; eventTimeMs <= lastEventTimeMs; eventTimeMs += intervalMs) {
    const outerBucketIndex = Math.floor((eventTimeMs - windowStartMs) / intervalMs);
    rows.push({ event_time: eventTimeMs, available_at: eventTimeMs, value: String(70_000 + outerBucketIndex), absence: null, coverage: null });
  }
  return rows;
}

/** `page.tsx`'s own pair, mirrored over a window of `nativeBucketCount` native OI buckets
 * starting at `windowStartMs`: `nativeBars` off `scalarPointsFromHistoryRows(rows,
 * FIVE_MINUTES_MS)` placed onto the SAME shared 1-minute axis `buildOiPanel` uses
 * (`buildScalarSeries`, `s2-panels.ts`'s own `S2_AXIS_STEP_MS = ONE_MINUTE_MS`), then
 * `countPresentSlots` — the exact pipeline `page.tsx` names for `oi.nativeBars`
 * (`oiGridSlots = panels.oi.slots`). `wirePoints` off the raw non-null row count
 * (`oi.wirePoints`). Calling the REAL `view-model.ts`/`charts` functions, not a
 * reimplementation — a drift between this file and `page.tsx` would otherwise falsify nothing. */
function countLikePageTsx(
  rows: readonly SeriesHistoryRow[],
  windowStartMs: number,
  nativeBucketCount: number,
): { readonly nativeBars: number; readonly wirePoints: number } {
  const windowEndMsExclusive = windowStartMs + nativeBucketCount * NATIVE_GRID_MS;
  const points = scalarPointsFromHistoryRows(rows, FIVE_MINUTES_MS);
  const slots = buildScalarSeries(points, ONE_MINUTE_MS, windowStartMs, windowEndMsExclusive).slots;
  const nativeBars = countPresentSlots(slots);
  const wirePoints = rows.filter((row) => row.value !== null).length;
  return { nativeBars, wirePoints };
}

const WINDOW_START_MS = Date.UTC(2026, 8, 1, 0, 0, 0);
const NATIVE_BUCKET_COUNT = 1152; // `DoD 8`'s own baseline magnitude (4 days / 5 min).

test("interval=1m: the staircase from the 2026-09-19 baseline is REPRODUCED exactly (ablation target)", () => {
  const rows = buildBackendShapedRows(NATIVE_BUCKET_COUNT, "1m", WINDOW_START_MS);
  const counted = countLikePageTsx(rows, WINDOW_START_MS, NATIVE_BUCKET_COUNT);
  assert.equal(rows.length, NATIVE_BUCKET_COUNT * 5, "5 wire rows per native OI bucket at interval=1m");
  assert.equal(counted.wirePoints, 5760, "DoD 8's own measured baseline: data-oi-wire-points=5760");
  assert.equal(counted.nativeBars, 1152, "DoD 8's own measured baseline: data-oi-native-bars=1152");
  assert.equal(counted.wirePoints, counted.nativeBars * 5, "the staircase IS exactly 5x at interval=1m");
});

for (const option of SUPPORTED_TIMEFRAMES.filter((entry) => entry.interval !== "1m")) {
  test(`DoD 8: interval=${option.interval} — wire-points STOPS being 5x native-bars (RN-4's staircase is declared, never silent)`, () => {
    const rows = buildBackendShapedRows(NATIVE_BUCKET_COUNT, option.interval, WINDOW_START_MS);
    const counted = countLikePageTsx(rows, WINDOW_START_MS, NATIVE_BUCKET_COUNT);
    assert.notEqual(
      counted.wirePoints,
      counted.nativeBars * 5,
      `MORDE: interval=${option.interval} must NOT reproduce the interval=1m staircase ratio`,
    );
    // Every `SUPPORTED_TIMEFRAMES` width other than `1m` is a multiple of `FIVE_MINUTES_MS`
    // (`5m`/`15m`/`1h`/`4h`), so EVERY outer-bucket row this shape emits also lands on OI's own
    // native 5-minute grid — the two counts coincide exactly, 1:1, never merely "closer than 5x".
    assert.equal(
      counted.wirePoints,
      counted.nativeBars,
      `interval=${option.interval}: wire-points and native-bars must be EQUAL — the outer grid IS the native grid here`,
    );
  });
}

test("MORDE of this file's own instrument: a hand-mutated 5x-repeated fixture at interval=5m is REJECTED by the same assertion", () => {
  // The exact regression this file exists to catch: someone "reaggregates" by literally
  // repeating the 1m-shaped rows 5 times under a wider interval label, instead of actually
  // grouping them — reproduced here over a COPY, never over `buildBackendShapedRows` itself.
  const staircaseRows = buildBackendShapedRows(NATIVE_BUCKET_COUNT, "1m", WINDOW_START_MS);
  const mutant = staircaseRows.map((row) => ({ ...row })); // same 5x shape, mislabeled as interval=5m
  const counted = countLikePageTsx(mutant, WINDOW_START_MS, NATIVE_BUCKET_COUNT);
  assert.equal(
    counted.wirePoints,
    counted.nativeBars * 5,
    "sanity: the mutant fixture IS the 5x staircase shape this file's real assertions reject",
  );
});
