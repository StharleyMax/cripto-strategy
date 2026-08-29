// Synthetic workloads for the D8.19 axis spike (SPEC-001 section 9.2).
//
// Zero network, zero API key, zero dependency on another phase: the whole 1,728-item load
// is generated here, deterministically, so the measurement reproduces byte for byte.
//
// The two workloads exist because ONE of them cannot answer the question alone. A complete
// one-minute grid makes the ordinal axis of Lightweight Charts and a linear time axis the
// same function, so it can only ever say "pass" -- it has no power to reject. The sparse
// grid is the mutation that gives the instrument the ability to say "no".

/** One candlestick item, in the shape Lightweight Charts consumes. */
export interface CandlePoint {
  /** UTC timestamp in seconds -- the `event_time` the axis is being judged against. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** One line item, in the shape Lightweight Charts consumes. */
export interface LinePoint {
  /** UTC timestamp in seconds -- the `event_time` the axis is being judged against. */
  time: number;
  value: number;
}

/** The full load the DoD names: 1,440 candles plus 288 points on one axis. */
export interface SyntheticWorkload {
  candles: CandlePoint[];
  points: LinePoint[];
}

/** 2025-01-01T00:00:00Z. Fixed so the workload is reproducible. */
export const WINDOW_START_UTC = 1735689600;

/** 1,440 one-minute candles = 24 h, the denominator of the D8.11 coverage figures. */
export const CANDLE_COUNT = 1440;

/** 288 five-minute points = the same 24 h at the native OI cadence. */
export const POINT_COUNT = 288;

const SECONDS_PER_MINUTE = 60;
const POINT_CADENCE_SECONDS = 300;

/**
 * Deterministic linear congruential generator (Numerical Recipes constants).
 *
 * A seeded generator, not `Math.random`: the thinning below has to land on the same
 * candles on every machine, or the published worst case is not reproducible.
 */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** A price path that is deterministic and bounded -- shape is irrelevant to the axis. */
function priceAt(index: number): number {
  return 100 + Math.sin(index / 40) * 5;
}

function buildCandles(times: number[]): CandlePoint[] {
  return times.map((time, index) => {
    const open = priceAt(index);
    const close = priceAt(index + 1);
    return {
      time,
      open,
      close,
      high: Math.max(open, close) + 0.5,
      low: Math.min(open, close) - 0.5,
    };
  });
}

function buildPoints(): LinePoint[] {
  return Array.from({ length: POINT_COUNT }, (_, index) => ({
    time: WINDOW_START_UTC + index * POINT_CADENCE_SECONDS,
    value: 1_000_000 + index * 137,
  }));
}

/**
 * The DoD case, read literally: a COMPLETE one-minute grid over 24 h, with the 288
 * five-minute points landing on grid slots that already exist.
 */
export function buildFullGridWorkload(): SyntheticWorkload {
  const times = Array.from(
    { length: CANDLE_COUNT },
    (_, index) => WINDOW_START_UTC + index * SECONDS_PER_MINUTE,
  );
  return { candles: buildCandles(times), points: buildPoints() };
}

/**
 * The same 24 h and the same 288 points, but with the one-minute grid thinned to a target
 * coverage -- gaps, which is what the real feed delivers.
 *
 * `coverage` is the only quantity borrowed from a measured source (plan 08, D8.11, which
 * reports 1 m coverage at 20.0%). The SHAPE of the gaps is synthetic and seeded, and this
 * spike does not claim it matches the real gap distribution: it claims that AT that
 * coverage the ordinal axis stops agreeing with `event_time`, and by how much.
 *
 * First and last candle are always kept, so the window boundaries are identical across
 * workloads and the two worst cases are comparable.
 */
export function buildSparseGridWorkload(coverage: number, seed: number): SyntheticWorkload {
  if (!(coverage > 0) || coverage > 1) {
    throw new RangeError(`coverage tem de estar em (0, 1]; recebi ${coverage}`);
  }
  const random = createRandom(seed);
  const times: number[] = [];
  for (let index = 0; index < CANDLE_COUNT; index += 1) {
    const isBoundary = index === 0 || index === CANDLE_COUNT - 1;
    if (isBoundary || random() < coverage) {
      times.push(WINDOW_START_UTC + index * SECONDS_PER_MINUTE);
    }
  }
  return { candles: buildCandles(times), points: buildPoints() };
}
