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
 * ── THE WINDOW IS AN ARGUMENT NOW — it used to be three constants, and that was a DEFECT ──
 *
 * This module used to EXPORT the window as `DAYS` (`2026-08-20..08-23`), `RANGE_START_MS` and
 * `RANGE_END_MS_EXCLUSIVE`, chosen in `T-05.2` because those were the four days of
 * `data/binance/*` CSV fixtures on disk `[MEDIDO 2026-09-03]`. Correct while the only caller
 * was a fixture-driven test; a defect the moment `T-02.4` pointed the live `/symbol` route at
 * it, because `klines_volume` only exists from `2026-09-04` on
 * (`min(bucket_end) = 1788486120000`, `md.series` `[MEDIDO 2026-09-11,
 * ACHADO-SERIES-HISTORY-SEM-PONTO.md]`) — the route asked for a window that PRECEDES every row
 * that exists, and the screen stayed empty with every link in the chain working.
 *
 * Every builder below therefore takes an `S2Window` (`s2-window.ts`) EXPLICITLY, with no
 * default — the same `PS-1` discipline `priceUse` already gets here: a silent default window
 * is exactly how the frozen one survived four tasks without anybody reading it. Production
 * derives that window from the clock (`resolveTrailingWindow`); the fixture-driven tests in
 * this directory use `S2_FIXTURE_WINDOW` (`s2-fixture-window.ts`), which is NOT re-exported by
 * the barrel and so cannot be reached from `web` at all.
 *
 * The four fixture days are still exactly the right choice FOR THOSE TESTS, and the reason is
 * kept where it belongs, in `s2-fixture-window.ts`: price has zero gaps across all four, while
 * OI and CVD share exactly ONE real, whole-day gap (08-22) instead of a synthetic one.
 */

import { buildChartSeries } from "./canonical-grid-chart-consumer.ts";
import type { ChartSeries } from "./canonical-grid-chart-consumer.ts";
import type { RawCandle } from "./canonical-grid.ts";
import { buildScalarSeries } from "./s2-scalar-grid.ts";
import type { ScalarPoint, ScalarSlot } from "./s2-scalar-grid.ts";
import { cvdCumulativeScaled, unscale, CVD_BUCKET_WIDTH_MS } from "./s2-cvd.ts";
import type { ScaledCvdDelta } from "./s2-cvd.ts";
import { resolvePriceSource } from "./s2-price-source.ts";
import type { PriceSource, PriceUse } from "./s2-price-source.ts";
import type { S2Window } from "./s2-window.ts";

export const SYMBOL = "BTCUSDT";

export const ONE_MINUTE_MS = 60_000;
export const FIVE_MINUTES_MS = 5 * 60_000;

/**
 * `T-05.5` / plan item `5.7`: this S2-mínima price panel is a VISUAL / STRUCTURE display —
 * candles for the human to read swing/BOS/CHoCH context on, not a liquidation or funding
 * surface — so its `price_use` is `structure_detection`, `ADR-007`'s own assignment for
 * exactly that use. Exported (not inlined) so `buildPricePanel`'s caller passes it
 * EXPLICITLY rather than the function defaulting it internally — `PS-1` forbids a silent
 * default, and a required parameter with a named, documented constant at the call site is
 * how that stays true without forcing every test to redeclare the string literal.
 */
export const S2_PRICE_USE: PriceUse = "structure_detection";

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

/**
 * `T-05.5` / plan item `5.7`: "o painel de Preço declara `price_source` E `price_use` na
 * linha do painel" — both fields live on the panel row itself, not only on whatever marks a
 * human later places over it, so a viewer can tell which price GRANDEZA is on screen before
 * any `<Anotacao>` exists at all. `priceSource` is DERIVED from `priceUse` via
 * `resolvePriceSource` (`ADR-007`/`PS-1`), never carried as an independent field a caller
 * could set inconsistently with `priceUse`.
 */
export interface PricePanel {
  readonly priceSource: PriceSource;
  readonly priceUse: PriceUse;
  readonly series: ChartSeries;
}

export interface S2Panels {
  readonly symbol: string;
  readonly rangeStartMs: number;
  readonly rangeEndMsExclusive: number;
  readonly price: PricePanel;
  readonly oi: OiPanel;
  readonly cvd: CvdPanel;
}

/**
 * `candles` — already parsed (`parseKlinesDays`/`parseKlinesCsv`), never read from disk here.
 *
 * `priceUse` is a REQUIRED parameter, not optional/defaulted (`ADR-007`/`PS-1`): the caller
 * names the use explicitly (`S2_PRICE_USE` for this task's own call site), and
 * `resolvePriceSource` is what turns that into the `price_source` the panel declares.
 */
export function buildPricePanel(
  candles: readonly RawCandle[],
  priceUse: PriceUse,
  window: S2Window,
): PricePanel {
  return {
    priceSource: resolvePriceSource(priceUse),
    priceUse,
    series: buildChartSeries(candles, ONE_MINUTE_MS, window.startMs, window.endMsExclusive),
  };
}

/** `points`/`missingDays` — already assembled (`assembleOiPoints`), never read from disk here. */
export function buildOiPanel(
  points: readonly ScalarPoint[],
  missingDays: readonly string[],
  window: S2Window,
): OiPanel {
  const series = buildScalarSeries(points, FIVE_MINUTES_MS, window.startMs, window.endMsExclusive);
  return { timeframeMs: FIVE_MINUTES_MS, slots: series.slots, missingDays };
}

/**
 * `deltas`/`missingDays`/`coveredDays` — already assembled (`assembleCvdDeltas`), never read
 * from disk here.
 *
 * `anchorMs` defaults to the window's own start — a chart-display choice (where the visible
 * cumulative curve starts counting from), independent of `<Anotacao>`'s own `cvd_anchor`
 * field (which records what anchor was in effect when a MARK was made, `PRD-001:360`, out
 * of this task's scope). Declared here as a parameter, not hardcoded, so a future caller
 * (e.g. a "reset to AGORA" control) can pick a different one without touching this module.
 * Unlike the WINDOW, this default is safe: it cannot point outside the data, because it is
 * read off the window the caller just passed in.
 */
export function buildCvdPanel(
  deltas: readonly ScaledCvdDelta[],
  missingDays: readonly string[],
  coveredDays: readonly string[],
  window: S2Window,
  anchorMs: number = window.startMs,
): CvdPanel {
  const cumulative = cvdCumulativeScaled(deltas, anchorMs);

  // `deltas`/`cumulative` are scaled-BigInt facts, one per bucket that a covered day
  // reported (present, possibly zero) — NOT one per grid slot yet. The grid alignment
  // below is what turns "the buckets we have" into "one slot per canonical instant, gap
  // slots explicit" (`s2-scalar-grid.ts`), exactly the same shape the price/OI panels use.
  const deltaSeries = buildScalarSeries(
    deltas.map((fact) => ({ timeMs: fact.bucketStartMs, value: unscale(fact.valueScaled) })),
    CVD_BUCKET_WIDTH_MS,
    window.startMs,
    window.endMsExclusive,
  );
  const cumulativeSeries = buildScalarSeries(
    cumulative.map((point) => ({ timeMs: point.bucketStartMs, value: unscale(point.valueScaled) })),
    CVD_BUCKET_WIDTH_MS,
    window.startMs,
    window.endMsExclusive,
  );
  return {
    timeframeMs: CVD_BUCKET_WIDTH_MS,
    deltaSlots: deltaSeries.slots,
    cumulativeSlots: cumulativeSeries.slots,
    missingDays,
    coveredDays,
  };
}

/**
 * Raw, already-loaded inputs for all 3 panels — the caller has done every disk read already.
 *
 * `priceUse` has NO DEFAULT here either (`?` would let a caller of `buildS2Panels` fall back
 * to an implicit choice one level up from `buildPricePanel`'s own required parameter,
 * reopening the exact hole `PS-1` closes) — every caller of `buildS2Panels` names it, and
 * this task's own caller passes `S2_PRICE_USE`.
 */
export interface S2RawInputs {
  /** The window every panel is built over — DERIVED by the caller (`resolveTrailingWindow`),
   * never a constant of this module. See this file's header for the defect that made it a
   * required field instead of three exported constants. */
  readonly window: S2Window;
  readonly candles: readonly RawCandle[];
  readonly priceUse: PriceUse;
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
    rangeStartMs: inputs.window.startMs,
    rangeEndMsExclusive: inputs.window.endMsExclusive,
    price: buildPricePanel(inputs.candles, inputs.priceUse, inputs.window),
    oi: buildOiPanel(inputs.oiPoints, inputs.oiMissingDays, inputs.window),
    cvd: buildCvdPanel(
      inputs.cvdDeltas,
      inputs.cvdMissingDays,
      inputs.cvdCoveredDays,
      inputs.window,
      inputs.cvdAnchorMs,
    ),
  };
}

