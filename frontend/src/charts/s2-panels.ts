/**
 * Panel assembly for `T-05.2` (S2-minima: BTCUSDT, 4 days, Price + OI + CVD delta/cumulative).
 *
 * PURE — `ADR-003` FR-1 ("`charts` não faz I/O ... Toda entrada é argumento"): every function
 * below takes already-loaded data (candles, scalar points, CVD deltas) as an argument and
 * hands it to the shared grid functions (`buildChartSeries` from `T-05.1`, `buildScalarSeries`
 * from `s2-scalar-grid.ts`) — no bucket-boundary arithmetic is repeated here, and zero
 * `node:fs`. A prior version of this file took a `dataRoot: string` and called the (then
 * I/O-doing) loaders internally; `/review` (`T-05.2-review.md`, WARNING) found that made this
 * production module transitively do disk I/O, contradicting FR-1 — fixed by pushing both the
 * disk read AND the loader calls out to the `.test.ts` files that need real fixture data
 * (`s2-panels.test.ts`, `s2-axis-integration.test.ts`), which now build the raw inputs below
 * and pass them in.
 *
 * ── THE WINDOW, AND WHY IT IS THESE 4 DAYS (decision made HERE, not in the handoff) ──────
 *
 * `[MEDIDO 2026-09-03]`:
 *   - klines (`data/binance/klines/tf2`): 1m and 15m present and gapless for ALL of
 *     08-20..08-23 (`wc -l BTCUSDT-1m-2026-08-{20,21,22,23}.csv` → 1441 each, 1440 candles).
 *   - OI (`data/binance/metrics`): complete (288/288, sorted, zero duplicates) for 08-20,
 *     08-21, 08-23. NO FILE for 08-22 — a real, whole-day gap.
 *   - aggTrades (`data/binance/aggtrades`): present for 08-20, 08-21, 08-23 (+08-24, outside
 *     this window). NO FILE for 08-22 — the SAME real gap as OI.
 *
 * Choosing `08-20T00:00Z .. 08-24T00:00Z` (4 calendar days, exclusive end) means: price has
 * zero gaps (full coverage all 4 days), while OI and CVD share exactly ONE real gap — the
 * whole of 08-22 — instead of a synthetic one. Per the handoff ("não fabrique um gap
 * sintetico se ja existe um de verdade"), this is used as-is for the D5.11/null-gap proof
 * rather than manufacturing a second, made-up hole.
 */

import { buildChartSeries } from "./canonical-grid-chart-consumer.ts";
import type { ChartSeries } from "./canonical-grid-chart-consumer.ts";
import type { RawCandle } from "./canonical-grid.ts";
import { buildScalarSeries } from "./s2-scalar-grid.ts";
import type { ScalarPoint, ScalarSlot } from "./s2-scalar-grid.ts";
import { cvdCumulativeScaled, unscale, CVD_BUCKET_WIDTH_MS } from "./s2-cvd.ts";
import type { ScaledCvdDelta } from "./s2-cvd.ts";

export const SYMBOL = "BTCUSDT";
export const DAYS = ["2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23"] as const;
export const RANGE_START_MS = Date.UTC(2026, 7, 20, 0, 0, 0);
export const RANGE_END_MS_EXCLUSIVE = Date.UTC(2026, 7, 24, 0, 0, 0);

export const ONE_MINUTE_MS = 60_000;
export const FIVE_MINUTES_MS = 5 * 60_000;

export interface OiPanel {
  readonly timeframeMs: number;
  readonly slots: readonly ScalarSlot[];
  readonly missingDays: readonly string[];
}

export interface CvdPanel {
  readonly timeframeMs: number;
  readonly deltaSlots: readonly ScalarSlot[];
  readonly cumulativeSlots: readonly ScalarSlot[];
  readonly missingDays: readonly string[];
  readonly coveredDays: readonly string[];
}

export interface S2Panels {
  readonly symbol: string;
  readonly rangeStartMs: number;
  readonly rangeEndMsExclusive: number;
  readonly price: ChartSeries;
  readonly oi: OiPanel;
  readonly cvd: CvdPanel;
}

/** `candles` — already parsed (`parseKlinesDays`/`parseKlinesCsv`), never read from disk here. */
export function buildPricePanel(candles: readonly RawCandle[]): ChartSeries {
  return buildChartSeries(candles, ONE_MINUTE_MS, RANGE_START_MS, RANGE_END_MS_EXCLUSIVE);
}

/** `points`/`missingDays` — already assembled (`assembleOiPoints`), never read from disk here. */
export function buildOiPanel(points: readonly ScalarPoint[], missingDays: readonly string[]): OiPanel {
  const series = buildScalarSeries(points, FIVE_MINUTES_MS, RANGE_START_MS, RANGE_END_MS_EXCLUSIVE);
  return { timeframeMs: FIVE_MINUTES_MS, slots: series.slots, missingDays };
}

/**
 * `deltas`/`missingDays`/`coveredDays` — already assembled (`assembleCvdDeltas`), never read
 * from disk here.
 *
 * `anchorMs` defaults to the window start — a chart-display choice (where the visible
 * cumulative curve starts counting from), independent of `<Anotacao>`'s own `cvd_anchor`
 * field (which records what anchor was in effect when a MARK was made, `PRD-001:360`, out
 * of this task's scope). Declared here as a parameter, not hardcoded, so a future caller
 * (e.g. a "reset to AGORA" control) can pick a different one without touching this module.
 */
export function buildCvdPanel(
  deltas: readonly ScaledCvdDelta[],
  missingDays: readonly string[],
  coveredDays: readonly string[],
  anchorMs: number = RANGE_START_MS,
): CvdPanel {
  const cumulative = cvdCumulativeScaled(deltas, anchorMs);

  // `deltas`/`cumulative` are scaled-BigInt facts, one per bucket that a covered day
  // reported (present, possibly zero) — NOT one per grid slot yet. The grid alignment
  // below is what turns "the buckets we have" into "one slot per canonical instant, gap
  // slots explicit" (`s2-scalar-grid.ts`), exactly the same shape the price/OI panels use.
  const deltaSeries = buildScalarSeries(
    deltas.map((fact) => ({ timeMs: fact.bucketStartMs, value: unscale(fact.valueScaled) })),
    CVD_BUCKET_WIDTH_MS,
    RANGE_START_MS,
    RANGE_END_MS_EXCLUSIVE,
  );
  const cumulativeSeries = buildScalarSeries(
    cumulative.map((point) => ({ timeMs: point.bucketStartMs, value: unscale(point.valueScaled) })),
    CVD_BUCKET_WIDTH_MS,
    RANGE_START_MS,
    RANGE_END_MS_EXCLUSIVE,
  );
  return {
    timeframeMs: CVD_BUCKET_WIDTH_MS,
    deltaSlots: deltaSeries.slots,
    cumulativeSlots: cumulativeSeries.slots,
    missingDays,
    coveredDays,
  };
}

/** Raw, already-loaded inputs for all 3 panels — the caller has done every disk read already. */
export interface S2RawInputs {
  readonly candles: readonly RawCandle[];
  readonly oiPoints: readonly ScalarPoint[];
  readonly oiMissingDays: readonly string[];
  readonly cvdDeltas: readonly ScaledCvdDelta[];
  readonly cvdMissingDays: readonly string[];
  readonly cvdCoveredDays: readonly string[];
  readonly cvdAnchorMs?: number;
}

export function buildS2Panels(inputs: S2RawInputs): S2Panels {
  return {
    symbol: SYMBOL,
    rangeStartMs: RANGE_START_MS,
    rangeEndMsExclusive: RANGE_END_MS_EXCLUSIVE,
    price: buildPricePanel(inputs.candles),
    oi: buildOiPanel(inputs.oiPoints, inputs.oiMissingDays),
    cvd: buildCvdPanel(inputs.cvdDeltas, inputs.cvdMissingDays, inputs.cvdCoveredDays, inputs.cvdAnchorMs),
  };
}

