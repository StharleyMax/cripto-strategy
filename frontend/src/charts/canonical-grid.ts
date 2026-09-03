/**
 * The canonical time grid — `ADR-003` FR-3: "A grade canônica é UMA função, dona de
 * `charts`, e o motor de backtest a IMPORTA — não a reimplementa." (`ADR-003/FR-3`,
 * `docs/plans/SPEC-001-plataforma-dados/05_fatia_visivel.md` DoD `D5.9`, item 5.2).
 *
 * SCOPE, stated because the plan explicitly excludes the rest of `ADR-003`'s definition of
 * "grade canônica" from this task (`T-05.1` handoff, "Fora de escopo": `T-05.2..T-05.7`):
 * this module is ONLY the time axis — the ordered set of canonical bucket-start instants
 * for a `(timeframe, range)` pair, and the alignment of real bar data onto it. It does NOT
 * do value->y mapping, scales, the four-`nature` absence policy, or the "trilho de
 * vigência" overlay — those are `ADR-003`'s other named pieces, each with its own DoD in a
 * later task (`D5.2`+).
 *
 * WHY A SHARED GRID MATTERS, and it is not cosmetic: if a chart renderer computes "bucket N
 * starts at `t`" one way and a bar-indexed consumer (a backtest replay, `ADR-003`'s "motor
 * de backtest") computes it another way, the two disagree on what "bar 42" IS whenever a
 * bucket is skipped by only one of the two implementations. `D5.9`'s falsifier is exactly
 * that: `sha256` of the SAME projection, produced by two different call sites, has to match
 * bit for bit — see `canonical-grid-chart-consumer.ts` / `canonical-grid-accessor-consumer.ts`
 * and the proof in `canonical-grid-sha256-proof.test.ts`.
 *
 * `ADR-003` FR-1 applies: zero I/O in this file. Every timestamp arrives as a parameter, in
 * epoch MILLISECONDS UTC — same discipline `as_of_accessor.py` states for `t`/`knowledge_time`
 * (`backend/src/modules/sentimento/domain/as_of_accessor.py:14-24`, read-only citation,
 * `backend/` is out of scope for this task): a function that reads a clock is not
 * reproducible, and reproducibility is the property `D5.9`'s `sha256` proof depends on.
 *
 * NO INTERPOLATION, same posture as `as_of_accessor.py`'s LOCF rule: a canonical slot with
 * no source candle gets `candle: null` (`GridSlot`), never a fabricated value. A missing bar
 * is DATA (an absence), not a gap to paper over — inventing one here would be exactly the
 * kind of optimistic implementation detail this repository's `CLAUDE.md` names as the class
 * of defect that costs real money.
 */

/** One OHLCV bar, keyed by its OPEN time. Never mutated after construction. */
export interface RawCandle {
  /** Epoch milliseconds UTC, the bucket's OPEN instant — never `closeTime`. */
  readonly openTimeMs: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

/** One canonical slot: the grid says a bucket exists here whether or not data does. */
export interface GridSlot {
  /** Epoch milliseconds UTC — the canonical bucket-start instant. */
  readonly time: number;
  /** `null` = the grid has a slot here and no source candle filled it (an explicit gap). */
  readonly candle: RawCandle | null;
}

/**
 * Floors `ms` to the start of the timeframe bucket that contains it.
 *
 * Epoch-aligned, not calendar-aligned: bucket boundaries are multiples of `timeframeMs`
 * since the Unix epoch. This is the same alignment Binance's own kline `open_time` uses
 * (verified below, in the `sha256` proof, against real `BTCUSDT` data), so a native kline's
 * `openTimeMs` is already grid-aligned and this function is idempotent on it.
 */
export function alignToTimeframeStart(ms: number, timeframeMs: number): number {
  if (timeframeMs <= 0) {
    throw new RangeError(`timeframeMs must be positive, received ${timeframeMs}`);
  }
  return Math.floor(ms / timeframeMs) * timeframeMs;
}

/**
 * Builds the ordered, GAPLESS sequence of canonical bucket-start instants covering
 * `[rangeStartMs, rangeEndMsExclusive)` at `timeframeMs` resolution.
 *
 * This is the "grade" itself: it exists independently of whether any candle data fills it.
 * `rangeStartMs` is floored to a bucket boundary (`alignToTimeframeStart`); the sequence
 * stops at the last bucket strictly before `rangeEndMsExclusive`.
 */
export function buildCanonicalGrid(
  rangeStartMs: number,
  rangeEndMsExclusive: number,
  timeframeMs: number,
): readonly number[] {
  if (timeframeMs <= 0) {
    throw new RangeError(`timeframeMs must be positive, received ${timeframeMs}`);
  }
  if (rangeEndMsExclusive <= rangeStartMs) {
    throw new RangeError(
      `rangeEndMsExclusive (${rangeEndMsExclusive}) must be greater than rangeStartMs (${rangeStartMs})`,
    );
  }
  const slots: number[] = [];
  const firstBucket = alignToTimeframeStart(rangeStartMs, timeframeMs);
  for (let bucket = firstBucket; bucket < rangeEndMsExclusive; bucket += timeframeMs) {
    slots.push(bucket);
  }
  return slots;
}

/**
 * Places `candles` onto `grid`, one `GridSlot` per grid instant, in grid order.
 *
 * `candles` need not be sorted and need not cover every slot. A candle whose `openTimeMs`
 * does not land exactly on a grid instant is a caller error (it means `candles` was not
 * built at the timeframe `grid` was built for) and is REJECTED rather than silently
 * snapped to the nearest bucket — snapping would let a caller pass mismatched data and get
 * a plausible-looking, wrong grid.
 */
export function alignCandlesToGrid(
  candles: readonly RawCandle[],
  grid: readonly number[],
): readonly GridSlot[] {
  const gridTimes = new Set(grid);
  const byTime = new Map<number, RawCandle>();
  for (const candle of candles) {
    if (!gridTimes.has(candle.openTimeMs)) {
      throw new RangeError(
        `candle openTimeMs ${candle.openTimeMs} does not land on a grid slot — ` +
          `the candle was not built at the timeframe this grid was built for`,
      );
    }
    if (byTime.has(candle.openTimeMs)) {
      throw new RangeError(`duplicate candle for grid slot ${candle.openTimeMs}`);
    }
    byTime.set(candle.openTimeMs, candle);
  }
  return grid.map((time) => ({ time, candle: byTime.get(time) ?? null }));
}

/**
 * Rolls `sourceCandles` (all at `sourceTimeframeMs` resolution) up into `targetTimeframeMs`
 * candles, using the OHLCV convention: `open` of the first source bar in the bucket by
 * time, `close` of the last, `high`/`low` the extremes, `volume` the sum.
 *
 * Built ONLY on `buildCanonicalGrid`/`alignCandlesToGrid` — the same two functions every
 * other consumer uses — so a rolled-up timeframe is not a second implementation of bucket
 * boundaries, it is the first one applied at a coarser resolution (`ADR-003` FR-3's
 * "nunca reimplementa" read literally, applied inside this module too).
 *
 * Buckets with zero source candles are OMITTED from the result (never fabricated as a
 * zero-volume candle); pass the result through `buildCanonicalGrid`/`alignCandlesToGrid`
 * again at `targetTimeframeMs` to get a padded grid with explicit `null` gaps.
 */
export function aggregateCandles(
  sourceCandles: readonly RawCandle[],
  sourceTimeframeMs: number,
  targetTimeframeMs: number,
): readonly RawCandle[] {
  if (targetTimeframeMs <= 0 || sourceTimeframeMs <= 0) {
    throw new RangeError(
      `both timeframes must be positive, received source=${sourceTimeframeMs} target=${targetTimeframeMs}`,
    );
  }
  if (targetTimeframeMs % sourceTimeframeMs !== 0) {
    throw new RangeError(
      `targetTimeframeMs (${targetTimeframeMs}) must be an exact multiple of ` +
        `sourceTimeframeMs (${sourceTimeframeMs}) — a non-multiple rollup has no well-defined bucket edge`,
    );
  }
  const byBucket = new Map<number, RawCandle[]>();
  for (const candle of sourceCandles) {
    const bucket = alignToTimeframeStart(candle.openTimeMs, targetTimeframeMs);
    const group = byBucket.get(bucket);
    if (group === undefined) {
      byBucket.set(bucket, [candle]);
    } else {
      group.push(candle);
    }
  }
  const result: RawCandle[] = [];
  for (const [bucket, group] of [...byBucket.entries()].sort((left, right) => left[0] - right[0])) {
    const sorted = [...group].sort((left, right) => left.openTimeMs - right.openTimeMs);
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;
    for (const candle of sorted) {
      high = Math.max(high, candle.high);
      low = Math.min(low, candle.low);
      volume += candle.volume;
    }
    result.push({
      openTimeMs: bucket,
      open: sorted[0].open,
      high,
      low,
      close: sorted[sorted.length - 1].close,
      volume,
    });
  }
  return result;
}
