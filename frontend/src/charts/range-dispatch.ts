/**
 * The reentrancy guard and the multi-panel range dispatcher — item `2.2` of
 * `docs/plans/SPEC-008-candle-real-e-eixo-unico/02_eixo_unico.md`, deciding `D-C3.2`
 * (`docs/context/candle-real-e-eixo-unico/handoff/JULGAMENTO-FRONTEND-ARCHITECT.md:188-217`).
 *
 * ⭐ CONTRARY TO INTUITION, and measured, not presumed: this guard is NOT what stops the
 * six-panel mesh from looping — the naive mesh does not loop either (depth-1 delivery, no
 * stack overflow, `JULGAMENTO-FRONTEND-ARCHITECT.md:151-155`: `n=6`, 6 notifications, 30
 * writes, max recursion depth 1). What actually prevents the measured 91h (5.460 min) of
 * cross-panel misalignment is the canonical-grid invariant `T-02.1` already built (`D-C3.2`:
 * "todo painel sobre EXATAMENTE a mesma grade"). What the naive mesh wastes, given the grid
 * invariant already holds, is WRITES — `30` instead of `5` for `N=6` panels — because every
 * panel blindly re-broadcasts to the other five on ANY notification, including the five
 * echoes produced by the first round of writes.
 *
 * This module's `RangeDispatcher` fixes the waste with `reduceRangeEvent`'s dedupe
 * (`time-axis-controller.ts`, `T-02.2`) alone (`CA-5c`). The `ReentrancyGuard` on top is for
 * the two windows a plain dedupe cannot cover, because the candidate is a genuinely
 * DIFFERENT value, not a near-duplicate: prepend-on-scroll and a timeframe switch
 * (`JULGAMENTO-FRONTEND-ARCHITECT.md:206-217`) — `web` wraps its suspend -> `setData` (all
 * six) -> recompute -> apply -> resume sequence in ONE `runApplying` call, so any
 * notification fired as a side effect of THAT sequence is dropped outright, never
 * re-dispatched, regardless of how far the transient value is from the registered state.
 *
 * Pure, like `time-axis-controller.ts`: no `IChartApi`, no `fetch`, no `jsdom` — the
 * `applying` flag is a closure variable, not a chart property, and `PanelWrite` is the
 * narrowest possible callback shape (`ADR-003/FR-1`+`FR-2`), implemented for real by `web`
 * (`T-02.4`) and by a plain function in this module's own tests.
 */

import {
  DEFAULT_RANGE_EPSILON_MS,
  fromLogicalRange,
  reduceRangeEvent,
  toLogicalRange,
} from "./time-axis-controller.ts";
import type { LogicalRange, TimeAxis, TimeRange } from "./time-axis-controller.ts";

/**
 * `D-C3.2`'s belt: while `applying`, any incoming range notification is a known side effect
 * of our OWN write (or a transient mid-`setData` value), never a fresh user gesture — drop
 * it, unconditionally, before dedupe even runs.
 */
export interface ReentrancyGuard {
  readonly isApplying: boolean;
  /**
   * Runs `fn` with the guard held, always releasing it — even if `fn` throws — via
   * `finally`, so a mid-sequence exception can never leave the guard stuck `true` and every
   * later gesture silently swallowed.
   */
  runApplying<T>(fn: () => T): T;
  /**
   * `T-05-FIX` (achado escalado de T-05.8/T-05.9): the async twin of `runApplying`, for a
   * caller whose "aplica" does NOT complete synchronously — `setVisibleLogicalRange` invalidates
   * and defers the actual range change (and the `visibleLogicalRangeChange` notification that
   * follows it) to a later turn, so a synchronous `runApplying(fn)` already released the guard
   * by the time that deferred echo lands, indistinguishable from a real gesture.
   * `holdApplying()` marks the guard held IMMEDIATELY and returns the release, left to the
   * caller to invoke once its own deferred echo has had its chance to arrive — never fired
   * automatically, and safe to call more than once (only the first call has an effect), so a
   * caller that also releases on cleanup (an early unmount) cannot double-release into a
   * wrongly-held guard.
   */
  holdApplying(): () => void;
}

export function createReentrancyGuard(): ReentrancyGuard {
  // `T-05-FIX` RODADA 3 (achado escalado desta rodada: `holdApplying` era um booleano com
  // "último a liberar vence", não um contador). `SymbolClient.tsx` calls `holdApplying()` once
  // PER PANEL on every mount — this guard is the ONE instance `AxisSyncStore` hands out
  // (`axis-sync.ts::guard`), shared by all six panels of that era, and their six mount effects
  // run in the SAME React commit, each scheduling its own `requestAnimationFrame` release right
  // after its own `setVisibleLogicalRange` call. Because `lightweight-charts` also schedules its
  // OWN `window.requestAnimationFrame` per chart instance
  // (`lightweight-charts.development.mjs:11196`, registered synchronously inside
  // `setVisibleLogicalRange`), the six panels interleave in the SAME animation frame in mount
  // order: [chart0-lib-raf, chart0-release-raf, chart1-lib-raf, chart1-release-raf, ...]. A
  // BOOLEAN guard has chart0's release (2nd callback in the queue) flip `applying` back to
  // `false` BEFORE chart1..chart5's own deferred echoes (3rd, 5th, 7th, ... callbacks) have had
  // their chance to be dropped — exactly the deferred-echo shape `holdApplying` exists to catch,
  // just for every panel after the first. `holdCount` makes `isApplying` true for as long as
  // ANY hold (or the synchronous `runApplying`) is outstanding — a release only closes the gate
  // once every opener has released, so panel 1..5's echoes are still guarded even after panel
  // 0's own release fires first. `runApplying` folds into the same counter (not a separate
  // `applying` boolean) so the two mechanisms cannot desync: a `runApplying` dispatch never runs
  // while a hold is outstanding in the first place (`onPanelRangeChanged` checks `isApplying`
  // before calling it), so this is not a behavior change for the already-covered single-writer
  // case — see `range-dispatch.test.ts`'s "TWO concurrent holdApplying calls" falsifier.
  let holdCount = 0;
  return {
    get isApplying(): boolean {
      return holdCount > 0;
    },
    runApplying<T>(fn: () => T): T {
      holdCount += 1;
      try {
        return fn();
      } finally {
        holdCount -= 1;
      }
    },
    holdApplying(): () => void {
      holdCount += 1;
      let released = false;
      return () => {
        if (released) {
          return;
        }
        released = true;
        holdCount -= 1;
      };
    },
  };
}

/**
 * Writes a `LogicalRange` to one panel, by index — the ONLY thing `web` implements; every
 * other line in this module is pure. Deliberately not `IChartApi`: this is the minimal shape
 * `D-C3.1` names (`ADR-003/FR-1`), so this module compiles and is tested against a fake,
 * never the real chart library.
 */
export type PanelWrite = (panelIndex: number, logical: LogicalRange) => void;

/**
 * Wires `panelCount` panels to ONE registered `TimeRange` over `axis` — the object that
 * turns `T-02.2`'s pure conversions + dedupe into the `CA-5c` property: a single real pan
 * produces AT MOST `panelCount - 1` writes (the panel that moved does not need to be
 * re-written), never the `panelCount * (panelCount - 1)` a naive "every panel echoes to
 * every panel" mesh produces (`30` for `N=6`,
 * `JULGAMENTO-FRONTEND-ARCHITECT.md:153`; reproduced as the negative control in
 * `range-dispatch.test.ts`).
 */
export interface RangeDispatcher {
  readonly state: TimeRange;
  readonly guard: ReentrancyGuard;
  /**
   * Called from panel `originIndex`'s `subscribeVisibleLogicalRangeChange` handler, with the
   * logical range THAT panel reports. Writes to every OTHER panel when — and only when —
   * the guard is not held AND the candidate is a real change (`reduceRangeEvent`); otherwise
   * this is a no-op, on purpose (an echo of our own write, or a repeat of the current state).
   */
  onPanelRangeChanged(originIndex: number, candidateLogical: LogicalRange): void;
  /**
   * `paineis-de-fluxo` `T-01.5` (`handoff/FIX-regressoes-fase05.md` §4.3) — swaps the axis every
   * later conversion runs against, and KEEPS `state`. `state` is a `TimeRange` in milliseconds,
   * independent of any axis, so a history page that widens the grid does not need a new
   * dispatcher: it needs the same registered instant range read through the new grid. After the
   * swap, the echo of the page's own `setData` (the SAME instants, now at `from + k` on the new
   * grid) converts back to the same milliseconds and `reduceRangeEvent` reports no change.
   * Writes nothing, fires nothing: a rebase is not a range change.
   */
  rebase(nextAxis: TimeAxis): void;
}

export function createRangeDispatcher(
  axis: TimeAxis,
  initialState: TimeRange,
  panelCount: number,
  write: PanelWrite,
  epsilonMs: number = DEFAULT_RANGE_EPSILON_MS,
): RangeDispatcher {
  if (!Number.isInteger(panelCount) || panelCount < 0) {
    throw new RangeError(`panelCount must be a non-negative integer, received ${panelCount}`);
  }
  const guard = createReentrancyGuard();
  let state = initialState;
  let currentAxis = axis;
  return {
    guard,
    get state(): TimeRange {
      return state;
    },
    rebase(nextAxis) {
      currentAxis = nextAxis;
    },
    onPanelRangeChanged(originIndex, candidateLogical) {
      if (guard.isApplying) {
        // D-C3.2: this notification is a side effect of a write THIS dispatcher just issued
        // (or of a `web`-driven suspend/setData/apply sequence around it) — never a fresh
        // gesture. Dropped before dedupe runs on purpose: dedupe alone cannot be trusted here
        // (a mid-`setData` transient value can be genuinely far from `state`, not a
        // near-duplicate `reduceRangeEvent` would catch).
        return;
      }
      const candidate = fromLogicalRange(candidateLogical, currentAxis);
      const { next, changed } = reduceRangeEvent(state, candidate, epsilonMs);
      if (!changed) {
        return;
      }
      state = next;
      const logical = toLogicalRange(next, currentAxis);
      guard.runApplying(() => {
        for (let index = 0; index < panelCount; index += 1) {
          if (index === originIndex) {
            // The panel that moved already shows `candidateLogical` — writing it back would
            // be the exact redundant echo `D-C3.2`'s measurement counts as waste.
            continue;
          }
          write(index, logical);
        }
      });
    },
  };
}
