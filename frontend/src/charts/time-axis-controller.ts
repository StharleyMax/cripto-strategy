/**
 * `TimeAxisController` — item `2.1` of `docs/plans/SPEC-008-candle-real-e-eixo-unico/02_eixo_unico.md`,
 * deciding `D-C3.1` (`docs/context/candle-real-e-eixo-unico/handoff/JULGAMENTO-FRONTEND-ARCHITECT.md:120-144`).
 *
 * `ADR-003/FR-1`: "zero `fetch`, zero I/O" — this module never reads a clock, never touches
 * the network, never imports `lightweight-charts`. `ADR-003/FR-2`: "`web` não calcula
 * geometria" — the range algebra (instant <-> logical index) lives HERE, not in
 * `SymbolClient.tsx`, so the six panels convert against the SAME arithmetic instead of six
 * independent ones (the divergence `02_eixo_unico.md` measured: `price_slots:5760` vs
 * `oi_slots:1152`, fixed by `T-02.1`'s canonical grid — this module is what `web` dispatches
 * range EVENTS through, on top of that single grid).
 *
 * PURITY IS THE DoD, literally: `D-C3.1`'s falsifier is "the controller compiles and is
 * tested WITHOUT `jsdom`" (`JULGAMENTO-FRONTEND-ARCHITECT.md:483`). Every function below is a
 * pure function of its arguments — no `IChartApi`, no `fetch`, no `window`, no module-level
 * mutable state — so `time-axis-controller.test.ts` runs under plain `node --test`, the same
 * way `canonical-grid.test.ts` does, with no DOM shim at all.
 *
 * SCOPE, stated because two sibling decisions in the SAME judgment file are deliberately NOT
 * here: `D-C3.2` (the reentrancy guard, "necessária mas não é ela que resolve" — item `2.2`)
 * and `D-C3.3` (the TF-switch anchoring rule — preserve the right-edge instant + bar count,
 * item `2.2b`) are `T-02.3`, which `depends_on = ["T-02.2"]` in
 * `docs/context/candle-real-e-eixo-unico/tasks.toml:267,281` precisely so it can build the
 * stateful `applying`-flag protocol ON TOP of the pure primitives this file exports.
 *
 * `historyRequest`/`HistoryRequest` below is `T-05.1` (`docs/plans/SPEC-008-.../05_historia_sob_demanda.md`
 * item `5.1`, deciding `D-C3.4`): the edge PREDICATE — "borda por aritmética sobre a grade,
 * nunca `barsInLogicalRange`" — and the request-window arithmetic that follows from it. What
 * this function does NOT do, on purpose, is `D-C3.5`'s paging ORCHESTRATION (`T-05.2`,
 * `tasks.toml:708`): how many requests may be in flight, the serial-one-at-a-time discipline,
 * and the ~5.000-slot accumulated cap that keeps `setData` under the 400 ms DoD are `web`'s
 * job, on top of this pure primitive — this module still never touches `IChartApi`/`fetch`.
 * `pageSlots` is therefore a REQUIRED argument here, not a constant this file picks: how much
 * to ask for per page is `D-C3.5` territory (item `5.1b`), not `D-C3.4`'s.
 */

/** The single shared time axis every panel renders against — `T-02.1`'s canonical grid, in
 * the form this controller's arithmetic needs. `startMs`/`stepMs` are epoch milliseconds UTC,
 * same discipline as `canonical-grid.ts` (`ADR-003/FR-1`: every timestamp is a parameter). */
export interface TimeAxis {
  /** Epoch milliseconds UTC of the FIRST canonical slot (`buildCanonicalGrid`'s `grid[0]`). */
  readonly startMs: number;
  /** Bucket width in milliseconds — the timeframe's duration, never a UI pixel unit. */
  readonly stepMs: number;
  /** Number of slots in the grid — the same `slotCount` `D-C3.2`'s invariant fixes across
   * all six panels (`lossless with whitespace`, never a per-panel native length). */
  readonly slotCount: number;
}

/** The visible window, in INSTANTS — never a logical (bar-index) range. `D-C3.3` (`T-02.3`)
 * decided the axis's registered state is time, not logical, exactly so this type is the one
 * that survives a timeframe switch unchanged; `logicalRange` is wire format only. */
export interface TimeRange {
  readonly fromMs: number;
  readonly toMs: number;
}

/** `lightweight-charts`' own `LogicalRange` shape, reproduced here as a plain value so this
 * module never imports the library (`ADR-003/FR-1`). Deliberately `number`, not an integer
 * type: the library accepts and returns FRACTIONAL logical indices verbatim (measured,
 * `JULGAMENTO-FRONTEND-ARCHITECT.md:232,242`: `{"from":10.369999999999997,"to":60.81}`), and
 * `toLogicalRange`/`fromLogicalRange` below rely on that — no rounding, so no error
 * accumulates when switching timeframes (`D-C3.3`'s `2,7 h` vs `325,3 h` measurement). */
export interface LogicalRange {
  readonly from: number;
  readonly to: number;
}

function assertPositiveStep(stepMs: number): void {
  if (!(stepMs > 0)) {
    throw new RangeError(`axis.stepMs must be positive, received ${stepMs}`);
  }
}

/**
 * Converts an instant-based `TimeRange` to the `LogicalRange` `setVisibleLogicalRange` wants,
 * against `axis`. Pure arithmetic — `(instant - axis.startMs) / axis.stepMs` — deliberately
 * NOT rounded: `Math.round`/`Math.floor` here would reintroduce the very error this decision
 * exists to avoid (`D-C3.3`'s measurement that the library's own fractional acceptance is
 * what keeps a `1m -> 4h` switch inside `2,7 h` instead of the `325,3 h` a rounded, cruder
 * path produced by loading the raw logical index into the new grid).
 */
export function toLogicalRange(range: TimeRange, axis: TimeAxis): LogicalRange {
  assertPositiveStep(axis.stepMs);
  return {
    from: (range.fromMs - axis.startMs) / axis.stepMs,
    to: (range.toMs - axis.startMs) / axis.stepMs,
  };
}

/**
 * The inverse of `toLogicalRange`: converts a (possibly fractional) `LogicalRange` back to
 * INSTANTS against `axis`. Same no-rounding discipline — a caller that needs a bucket-aligned
 * instant applies `alignToTimeframeStart` (`canonical-grid.ts`) itself, deliberately kept out
 * of this function so it stays a pure inverse (`fromLogicalRange(toLogicalRange(r, a), a)`
 * round-trips `r` exactly, `time-axis-controller.test.ts` proves it).
 */
export function fromLogicalRange(logical: LogicalRange, axis: TimeAxis): TimeRange {
  assertPositiveStep(axis.stepMs);
  return {
    fromMs: axis.startMs + logical.from * axis.stepMs,
    toMs: axis.startMs + logical.to * axis.stepMs,
  };
}

/** The result of folding one incoming range candidate into the controller's registered
 * state — `D-C3.1`'s contract: `reduceRangeEvent(state, event) -> { next, changed }`. */
export interface RangeReduction {
  /** The range the caller should treat as current: `candidate` when it changed, `state`
   * (the SAME reference) when it did not — so a caller can skip `setVisibleLogicalRange`
   * entirely on a no-op event instead of re-issuing an identical write. */
  readonly next: TimeRange;
  readonly changed: boolean;
}

/**
 * Default epsilon for range-equality: half a millisecond. `lightweight-charts`' own
 * `LogicalRange` is a `double`, so a round-trip through `toLogicalRange`/`fromLogicalRange`
 * can land a fraction of a millisecond off the original instant even though no bucket was
 * skipped — `reduceRangeEvent` treats that as "did not change", not as a new range. This is
 * NOT the reentrancy guard (`D-C3.2`, `T-02.3`'s `applying` flag over the six `IChartApi`
 * instances) — it is dedupe over VALUES, the half of `D-C3.1`'s contract that has no `web`
 * dependency at all and so belongs in this pure module.
 */
export const DEFAULT_RANGE_EPSILON_MS = 0.5;

/**
 * Folds one incoming `candidate` `TimeRange` into `state`, deduping within `epsilonMs` on
 * both edges. `changed: false` means the caller should treat `candidate` as a repeat of
 * `state` (a library echo, or a round-trip residual) and skip re-applying it.
 */
export function reduceRangeEvent(
  state: TimeRange,
  candidate: TimeRange,
  epsilonMs: number = DEFAULT_RANGE_EPSILON_MS,
): RangeReduction {
  const sameFrom = Math.abs(candidate.fromMs - state.fromMs) <= epsilonMs;
  const sameTo = Math.abs(candidate.toMs - state.toMs) <= epsilonMs;
  if (sameFrom && sameTo) {
    return { next: state, changed: false };
  }
  return { next: candidate, changed: true };
}

/**
 * The two walls `D-C3.7` names on `panel.coverage`
 * (`backend/src/modules/sentimento/domain/series_history_report.py:57-92`, read-only
 * citation — this module still imports nothing from `backend/`): `earliestBucketMs` is OUR
 * OWN STORE's leftmost bucket for this series (`null` = the store holds no row yet),
 * `sourceFloorMs` is the upstream origin's own historical depth (`null` = UNMEASURED, never
 * "zero"/"unlimited" — same discipline the backend type documents). `historyRequest` reads
 * these ONLY to decide whether a page is even worth asking for; naming the THREE distinguishable
 * states (`absent`/`not-loaded`/`beyond-coverage`, `D-C3.6`) on the wire and pixel is item
 * `5.4`/`5.5`, not this task.
 */
export interface HistoryCoverage {
  readonly earliestBucketMs: number | null;
  readonly sourceFloorMs: number | null;
}

/** `D-C3.1`'s contract shape, verbatim: what `historyRequest` asks `web` to fetch next. */
export interface HistoryRequest {
  readonly fromMs: number;
  readonly toMs: number;
  readonly intervalMs: number;
}

/**
 * Default trigger distance, in canonical GRID SLOTS (not raw ms — so "how close to the edge"
 * means the same thing at any timeframe), from the loaded axis's left edge. This is
 * `D-C3.4`'s predicate `visibleRange.fromMs - axis.startMs < PAGE_TRIGGER_MS`, with
 * `PAGE_TRIGGER_MS = triggerSlots * axis.stepMs`.
 * `[INFERRED: neither D-C3.4 nor D-C3.5 pins a specific margin — they fix the FORM of the
 * predicate (grid arithmetic, never `barsInLogicalRange`) and the ~500-slot page width, not
 * how early to fire. 20 is a small, conservative default — comfortably inside one page's
 * worth of slots on the D-C3.5-proposed ~500-slot page, so a single pan gesture cannot outrun
 * a page still in flight before the NEXT one is requested. `web`/the design gate may retune
 * it once real pan gestures are measured against the 400 ms DoD (plan item 5.7); nothing here
 * depends on the exact number, and it is exposed exactly so it can be overridden or retuned
 * without touching this function's logic.]`
 */
export const DEFAULT_PAGE_TRIGGER_SLOTS = 20;

/**
 * Decides whether the visible `range` is close enough to `axis`'s loaded left edge to warrant
 * fetching one more page, and if so, exactly which `[fromMs, toMs)` window to ask for —
 * `D-C3.4`'s edge detector plus the request-window arithmetic `D-C3.1`'s contract names.
 * Returns `null` when no request is warranted: either `range` is not near the edge, or the
 * known `coverage` walls say there is nothing left to fetch (this is what makes the function
 * SAFE against the infinite-loop failure mode `D-C3.4` measured — `barsInLogicalRange` stays
 * permanently negative once whitespace exists; this predicate instead goes permanently
 * `false` once `axis.startMs` reaches a known floor, because the check below runs BEFORE the
 * distance-to-edge check and short-circuits it).
 *
 * `pageSlots` is REQUIRED (see the module docstring): how much to request per page is
 * `D-C3.5`/`T-05.2` territory, not decided here. `triggerSlots` defaults to
 * `DEFAULT_PAGE_TRIGGER_SLOTS` but is threaded through so a caller (or its own tests) can pin
 * a different margin without reaching into this module's internals.
 *
 * Deliberately ignores `range.toMs` — per `D-C3.4`, the edge that matters for BACKWARD paging
 * is the LEFT one, and per `D-C3.5` "o gatilho é a grade, não o painel": the requested window
 * is always the one page immediately preceding `axis.startMs`, never a function of exactly how
 * deep into whitespace the visible range happens to sit.
 */
export function historyRequest(
  range: TimeRange,
  axis: TimeAxis,
  coverage: HistoryCoverage,
  pageSlots: number,
  triggerSlots: number = DEFAULT_PAGE_TRIGGER_SLOTS,
): HistoryRequest | null {
  assertPositiveStep(axis.stepMs);
  if (!Number.isInteger(pageSlots) || pageSlots <= 0) {
    throw new RangeError(`pageSlots must be a positive integer, received ${pageSlots}`);
  }
  if (!Number.isInteger(triggerSlots) || triggerSlots < 0) {
    throw new RangeError(`triggerSlots must be a non-negative integer, received ${triggerSlots}`);
  }

  // The tighter of the two known walls: our OWN store is what `/series-history` can actually
  // serve TODAY, so it is authoritative whenever known. The origin's wall is the fallback for
  // an empty store (`earliestBucketMs === null`) — without it, a store that has captured
  // nothing yet would have NO known floor and this function would keep proposing pages the
  // origin itself can never satisfy, which is exactly the class of pointless-request loop
  // `D-C3.4` exists to prevent (the OTHER half of it: `barsInLogicalRange`'s permanent
  // negative reading).
  const floorMs = coverage.earliestBucketMs ?? coverage.sourceFloorMs;

  if (floorMs !== null && axis.startMs <= floorMs) {
    // The loaded grid already reaches (or has passed) the known floor: requesting another
    // page here would ask for a window that cannot contain new data. This is the
    // short-circuit that keeps the predicate from firing forever once the true edge is hit.
    return null;
  }

  const distanceFromEdgeMs = range.fromMs - axis.startMs;
  const triggerMs = triggerSlots * axis.stepMs;
  if (distanceFromEdgeMs >= triggerMs) {
    // Not close enough to the loaded edge yet — no page warranted.
    return null;
  }

  const candidateFromMs = axis.startMs - pageSlots * axis.stepMs;
  const fromMs = floorMs !== null ? Math.max(candidateFromMs, floorMs) : candidateFromMs;
  return { fromMs, toMs: axis.startMs, intervalMs: axis.stepMs };
}

/**
 * Bundles `axis` with the pure conversions above, bound to it — the literal
 * `TimeAxisController` this task (`T-02.2`) is named for. Deliberately NOT a class holding
 * mutable range state: `axis` is the only thing frozen at construction, every method is
 * still a pure function of its OWN arguments (no hidden `this.range`), and there is no
 * `dispatch`/`apply` pair here — `T-02.3` adds the stateful protocol (`applying` flag,
 * TF-switch anchoring) on top of this object, and `T-02.4` (`web`) is what actually calls it
 * from the six panels' `subscribeVisibleLogicalRangeChange` handlers.
 */
export interface TimeAxisController {
  readonly axis: TimeAxis;
  toLogicalRange(range: TimeRange): LogicalRange;
  fromLogicalRange(logical: LogicalRange): TimeRange;
  reduceRangeEvent(state: TimeRange, candidate: TimeRange, epsilonMs?: number): RangeReduction;
  /** `historyRequest` bound to this controller's `axis` — see the free function's docstring
   * for the full contract (`T-05.1`, `D-C3.4`). */
  historyRequest(
    range: TimeRange,
    coverage: HistoryCoverage,
    pageSlots: number,
    triggerSlots?: number,
  ): HistoryRequest | null;
}

/** Constructs a `TimeAxisController` bound to `axis`. `axis` itself is never mutated or
 * re-read from anywhere but the argument list — swapping the axis (a timeframe switch) means
 * constructing a NEW controller, not mutating this one. */
export function createTimeAxisController(axis: TimeAxis): TimeAxisController {
  assertPositiveStep(axis.stepMs);
  return {
    axis,
    toLogicalRange: (range) => toLogicalRange(range, axis),
    fromLogicalRange: (logical) => fromLogicalRange(logical, axis),
    reduceRangeEvent: (state, candidate, epsilonMs) => reduceRangeEvent(state, candidate, epsilonMs),
    historyRequest: (range, coverage, pageSlots, triggerSlots) =>
      historyRequest(range, axis, coverage, pageSlots, triggerSlots),
  };
}
