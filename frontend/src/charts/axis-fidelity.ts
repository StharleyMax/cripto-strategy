// The measurement of D8.19: does the X coordinate the chart assigns agree with the one
// `event_time` implies, to within 0.5 px, under the full 1,728-item load?
//
// ── WHAT "the one `event_time` implies" MEANS HERE, because a vague definition would make
//    the number unfalsifiable ───────────────────────────────────────────────────────────
//
// The expected coordinate is the AFFINE map from time to pixels calibrated on the chart's
// OWN two extreme samples:
//
//     expected(t) = x(t_first) + (t - t_first) / (t_last - t_first) * (x(t_last) - x(t_first))
//
// Anchoring on the chart's own endpoints is deliberate and it is the conservative choice:
// it cancels every offset, padding and right-margin the library applies, so a non-zero
// error can only come from NON-LINEARITY of the time-to-pixel map. Any definition that
// anchored on an external origin would report the library's padding as error, and that
// would be a strawman -- padding does not make the axis lie about `event_time`.
//
// Corollary that must be stated, because it caps the claim: by construction the two
// endpoints have error exactly 0. The worst case is therefore always found strictly
// inside the window, and it is a LOWER bound on what a differently-anchored definition
// would report -- never an inflated one.

/** The tolerance D8.19 declares, in CSS pixels. */
export const TOLERANCE_PX = 0.5;

/** One rendered item and the X coordinate the chart gave it. */
export interface CoordinateSample {
  /** UTC timestamp in seconds. */
  time: number;
  /** The X coordinate Lightweight Charts assigned, in CSS pixels. */
  actualX: number;
  /** Which series the item came from -- carried so the worst case can be attributed. */
  source: "candle" | "point";
}

/** One item after the expected coordinate has been computed for it. */
export interface FidelitySample extends CoordinateSample {
  expectedX: number;
  errorPx: number;
}

/** The verdict, and every number in it carries the universe it was taken over. */
export interface FidelityReport {
  /** How many items were compared -- the `n` of every figure below. */
  sampleCount: number;
  /** How many distinct timestamps those items occupy on the shared axis. */
  distinctTimeCount: number;
  /** The published figure: the WORST case, never the mean. */
  worstErrorPx: number;
  /** The item that produced the worst case, so the finding is inspectable. */
  worstSample: FidelitySample;
  /** Reported only as context. It is not the criterion and never becomes it. */
  meanErrorPx: number;
  /** The span in pixels between the two anchors, so px figures are readable as a fraction. */
  spanPx: number;
  tolerancePx: number;
  withinTolerance: boolean;
}

/**
 * Computes the expected coordinate of `time` from the two anchors.
 *
 * Exported so the definition above is testable on its own, without a chart.
 */
export function expectedCoordinate(
  time: number,
  earlyTime: number,
  earlyX: number,
  lateTime: number,
  lateX: number,
): number {
  if (lateTime === earlyTime) {
    throw new RangeError("as ancoras tem o mesmo event_time; a escala de tempo seria degenerada");
  }
  return earlyX + ((time - earlyTime) / (lateTime - earlyTime)) * (lateX - earlyX);
}

/**
 * Compares every sample against the affine time-to-pixel map and returns the worst case.
 *
 * `samples` need not be sorted; the anchors are taken as the extremes by `time`.
 */
export function measureAxisFidelity(
  samples: readonly CoordinateSample[],
  tolerancePx: number = TOLERANCE_PX,
): FidelityReport {
  if (samples.length < 3) {
    throw new RangeError(
      `preciso de pelo menos 3 amostras para medir nao-linearidade; recebi ${samples.length}`,
    );
  }
  const sorted = [...samples].sort((left, right) => left.time - right.time);
  const early = sorted[0];
  const late = sorted[sorted.length - 1];

  let worst: FidelitySample | null = null;
  let errorSum = 0;
  const distinct = new Set<number>();

  for (const sample of sorted) {
    distinct.add(sample.time);
    const expectedX = expectedCoordinate(
      sample.time,
      early.time,
      early.actualX,
      late.time,
      late.actualX,
    );
    const errorPx = Math.abs(sample.actualX - expectedX);
    errorSum += errorPx;
    if (worst === null || errorPx > worst.errorPx) {
      worst = { ...sample, expectedX, errorPx };
    }
  }

  // `worst` is non-null: the loop runs at least three times (guarded above). The cast-free
  // narrowing below keeps `no-explicit-any` and `no-non-null-assertion` both satisfied.
  if (worst === null) {
    throw new Error("invariante quebrada: nenhuma amostra foi avaliada");
  }

  return {
    sampleCount: sorted.length,
    distinctTimeCount: distinct.size,
    worstErrorPx: worst.errorPx,
    worstSample: worst,
    meanErrorPx: errorSum / sorted.length,
    spanPx: Math.abs(late.actualX - early.actualX),
    tolerancePx,
    withinTolerance: worst.errorPx <= tolerancePx,
  };
}
