/**
 * The window `/symbol` reads over — DERIVED, never typed in.
 *
 * ── WHY THIS MODULE EXISTS (the defect it closes) ────────────────────────────────────────────
 *
 * `s2-panels.ts` used to fix the window as three module constants — `DAYS`
 * (`2026-08-20..08-23`), `RANGE_START_MS`, `RANGE_END_MS_EXCLUSIVE` — chosen in `T-05.2`
 * because those were the four days of `data/binance/*` CSV fixtures on disk. That choice was
 * correct for a module whose only caller was a fixture-driven test. It became a DEFECT the
 * moment `T-02.4` pointed a live route at it: `klines_volume` only exists from `2026-09-04` on
 * (`min(bucket_end) = 1788486120000`, 10.705 rows per symbol in `md.series`
 * `[MEDIDO 2026-09-11, ACHADO-SERIES-HISTORY-SEM-PONTO.md]`), so the route asked
 * `/series-history` for a window that PRECEDES every row that exists and the screen was empty
 * with every single link in the chain working.
 *
 * ── THE FORM CHOSEN, AND WHY IT IS THIS ONE ──────────────────────────────────────────────────
 *
 * A TRAILING window anchored on the caller's clock reading: `[now - lag - span, now - lag)`,
 * both edges floored onto a bucket boundary.
 *
 * The alternative the handoff names — derive the window from WHAT THE SERIES OFFERS — was
 * considered and refused **with a measurement, not a preference**: no read surface publishes
 * the coverage that would take. `SeriesCatalogEntry` (`features/s3-inspector/series-catalog.ts`,
 * a field-for-field transcription of `series_catalog.py`) carries `nativeGrid`,
 * `maxStalenessMs`, `priceUse`, `reconstructedFrom` and `publishedError` — and no first/last
 * `event_time` of any kind; `GET /series-history` only answers for a window the caller has
 * ALREADY chosen. Deriving from the series would therefore need either a new backend field
 * (owner `sentimento`, outside `web`/`charts`) or a probe request over a guessed window —
 * which is the same hardcoded literal, one level deeper and harder to see. A trailing window
 * needs nothing that does not exist, and it is falsifiable at EVERY instant rather than only
 * on the four days somebody typed once.
 *
 * What did NOT change is the SPAN: four days, the `ADR-034/D8` "4 dias" the route was specified
 * with. Only WHICH four days is now derived.
 *
 * ── WHY THE LAG IS A PARAMETER AND NOT ZERO ──────────────────────────────────────────────────
 *
 * The right edge is pulled back by `lagMs` before being floored. Without it the newest bucket
 * in the window would be one the writer has not published yet (`available_at - event_time`
 * measured at 10.434s / 12.034s / 13.591s over three real rows, n=3, same handoff), and the
 * panel's own "leitura atual" — which reads the window's LAST grid instant — would print
 * `SEM_PONTO` for a bar that exists. That is absence manufactured by the REQUEST, and `RN-1`
 * is about real absence. The caller declares the lag; this module never defaults it (same
 * `PS-1` discipline `s2-panels.ts` applies to `priceUse`).
 *
 * PURE, like every other module here (`ADR-003` FR-1): `nowMs` is an ARGUMENT. This module
 * never calls `Date.now()` — reading the clock is I/O, and I/O belongs to `web`.
 */

import { alignToTimeframeStart } from "./canonical-grid.ts";

export const ONE_DAY_MS = 24 * 60 * 60_000;

/**
 * The four days `ADR-034/D8` specifies the `/symbol` route with, as a DURATION rather than as
 * a pair of dates. This is the one number that survived the literal window, and it survived
 * because "how much history" is a product choice, while "which four days" is a fact about the
 * clock.
 */
export const S2_WINDOW_SPAN_MS = 4 * ONE_DAY_MS;

/** A half-open window over the canonical grid, plus the UTC dates it touches. */
export interface S2Window {
  /** Inclusive left edge, epoch ms, on a bucket boundary. */
  readonly startMs: number;
  /** Exclusive right edge, epoch ms, on a bucket boundary. */
  readonly endMsExclusive: number;
  /** Every UTC date (`YYYY-MM-DD`) a row of `[startMs, endMsExclusive)` can fall on, in order.
   * Derived from the edges — the list a caller hands to a per-day presence check. */
  readonly days: readonly string[];
}

/**
 * The UTC dates spanned by `[startMs, endMsExclusive)`. The end is EXCLUSIVE: a window that
 * stops exactly at midnight does not touch the day that starts there.
 */
export function utcDaysCovered(startMs: number, endMsExclusive: number): readonly string[] {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMsExclusive)) {
    throw new RangeError(`window edges must be finite, received [${startMs}, ${endMsExclusive})`);
  }
  if (endMsExclusive <= startMs) {
    throw new RangeError(`endMsExclusive (${endMsExclusive}) must be greater than startMs (${startMs})`);
  }
  const days: string[] = [];
  for (
    let dayStart = alignToTimeframeStart(startMs, ONE_DAY_MS);
    dayStart < endMsExclusive;
    dayStart += ONE_DAY_MS
  ) {
    days.push(new Date(dayStart).toISOString().slice(0, 10));
  }
  return days;
}

export interface TrailingWindowRequest {
  /** The caller's clock reading, epoch ms. An argument, never read here. */
  readonly nowMs: number;
  /** How far behind the clock the right edge stays — see this module's docstring. */
  readonly lagMs: number;
  /** How much history the window covers. */
  readonly spanMs: number;
  /** The bucket width both edges are floored onto — the COARSEST grid the caller will place
   * on this window, so that every finer grid lands on it too. */
  readonly alignmentMs: number;
}

/**
 * `[floor(nowMs - lagMs) - spanMs, floor(nowMs - lagMs))`, floored onto `alignmentMs`.
 *
 * `spanMs` must be a whole number of `alignmentMs` buckets: otherwise the left edge would fall
 * off the grid the right edge sits on, and the panels built over the two would disagree about
 * where a bucket starts. Refused rather than silently re-floored — a window whose width is not
 * what the caller asked for is exactly the class of quiet wrongness this module exists to end.
 */
export function resolveTrailingWindow(request: TrailingWindowRequest): S2Window {
  const { nowMs, lagMs, spanMs, alignmentMs } = request;
  if (!Number.isFinite(nowMs)) {
    throw new RangeError(`nowMs must be a finite epoch-ms reading, received ${nowMs}`);
  }
  if (!Number.isFinite(lagMs) || lagMs < 0) {
    throw new RangeError(`lagMs must be finite and non-negative, received ${lagMs}`);
  }
  if (!Number.isFinite(alignmentMs) || alignmentMs <= 0) {
    throw new RangeError(`alignmentMs must be positive, received ${alignmentMs}`);
  }
  if (!Number.isFinite(spanMs) || spanMs <= 0) {
    throw new RangeError(`spanMs must be positive, received ${spanMs}`);
  }
  if (spanMs % alignmentMs !== 0) {
    throw new RangeError(
      `spanMs (${spanMs}) must be a whole number of ${alignmentMs}ms buckets — a fractional ` +
        `span puts the left edge off the grid the right edge sits on`,
    );
  }
  const endMsExclusive = alignToTimeframeStart(nowMs - lagMs, alignmentMs);
  const startMs = endMsExclusive - spanMs;
  return { startMs, endMsExclusive, days: utcDaysCovered(startMs, endMsExclusive) };
}
