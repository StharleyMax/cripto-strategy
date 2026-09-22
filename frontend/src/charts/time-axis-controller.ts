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
 * stateful `applying`-flag protocol ON TOP of the pure primitives this file exports. Likewise
 * `historyRequest`/`HistoryRequest` (`D-C3.1`'s contract block also names it) is NOT exported
 * here: its actual predicate (`D-C3.4`, "borda por aritmética sobre a grade, nunca
 * `barsInLogicalRange`") and paging behaviour (`D-C3.5`) belong to the phase `03`/`05` tasks
 * that reference those decisions (`tasks.toml:693,708`), not to this one. Exporting a stub
 * here would freeze a shape those later tasks have not decided yet.
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
  };
}
