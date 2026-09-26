/**
 * `T-02.4` (`CST-211`) — the pure wiring `axis-sync-provider.tsx` holds ONE instance of.
 *
 * `D-C3.1` (`docs/context/candle-real-e-eixo-unico/handoff/JULGAMENTO-FRONTEND-ARCHITECT.md:120-144`)
 * splits ownership of the visible range: the algebra is `charts`' (`TimeAxisController`,
 * `T-02.2`; the reentrancy guard + dedupe, `T-02.3`'s `RangeDispatcher`), and `web` is what
 * creates/registers the six `IChartApi` instances, subscribes to their own range changes,
 * dispatches the event through the controller, and applies the result back — "assina, despacha
 * e aplica", the literal phrase this task's title uses.
 *
 * THIS module is the "assina, despacha e aplica" wiring, kept in a plain `.ts` file with no
 * React import, so it runs under `node --test` exactly like every module in `src/charts/`
 * does (`axis-sync.test.ts`), rather than being provable only through a real DOM mount
 * (`e2e/`). `axis-sync-provider.tsx` is the thin React glue on top: one `useMemo` holding one
 * `AxisSyncStore`, exposed through context so the six sibling components below `SymbolClient`'s
 * top level (`PricePane`, `OiPane`, `CvdPane`, two `LiquidationCohortSurface` mounts, and
 * `LongShortPane`) share it instead of each independently deciding a visible range.
 *
 * ⛔ `fitContent()` STOPS BEING PER-CHART HERE (plan `02` item `2.3`, fused with item `2.1`'s
 * web-side half — "tirar o `fitContent()` de cada painel" and "assinar/despachar/aplicar" are
 * the SAME change of who owns the visible range, not two). `initialLogicalRange` is the ONE
 * `LogicalRange` every panel applies at mount, computed off the shared `axis` — never each
 * chart's own `fitContent()`, which would pick a range off ITS OWN series and agree with the
 * other five only by coincidence of the canonical grid (`T-02.1`) rather than by construction.
 */

import {
  createRangeDispatcher,
  toLogicalRange,
  type LogicalRange,
  type PanelWrite,
  type RangeDispatcher,
  type TimeAxis,
  type TimeRange,
} from "../../charts/index.ts";

/**
 * `paineis-de-fluxo` `T-01.5` (plan `01` item `1.3`, `ADR-044/D1`) — the symbol page is ONE
 * `createChart` with one native pane per metric, and the six panes share the library's single
 * `timeScale`. There is one writer and one reader of the visible range, so the store runs with
 * `panelCount = 1`: the dispatcher still folds every gesture into ONE registered `TimeRange` (what
 * `onCandidateRange` and `onRangeApplied` read), and it never writes, because the only panel is
 * always the origin (`range-dispatch.test.ts`, "T-01.5 (a)").
 *
 * The six fixed indices and `PANEL_COUNT = 6` of `T-02.4` are gone. The position of a pane inside
 * the chart is the pane registry's (`pane-registry.ts::F1_PANE_ORDER`), not a store index.
 * `RangeDispatcher` still accepts any `panelCount`, and its algebra tests still run with six.
 */
export const SINGLE_CHART_PANEL_COUNT = 1;
/** The only index the single chart registers under. */
export const SINGLE_CHART_PANEL_INDEX = 0;

/**
 * What `useLightweightChart` (`SymbolClient.tsx`) gets from the provider — `D-C3.1`'s table,
 * `web`'s side of it: `initialLogicalRange` replaces the per-chart `fitContent()`;
 * `registerPanel` is how a chart makes itself WRITABLE by the dispatcher
 * (`RangeDispatcher.onPanelRangeChanged`'s `write` callback is wired once, here, not per
 * panel); `notifyPanelRangeChanged` is what a chart's own `subscribeVisibleLogicalRangeChange`
 * handler calls — the "assina" and "despacha" halves, with "aplica" happening inside `write`.
 */
export interface AxisSyncStore {
  /** The axis conversions currently run against — the construction axis until `rebase`. */
  readonly axis: TimeAxis;
  /** The framing applied ONCE, at mount, on the construction axis. Never re-read on a page. */
  readonly initialLogicalRange: LogicalRange;
  /** The registered visible range, in milliseconds — independent of any axis. */
  readonly currentRange: TimeRange;
  /**
   * `paineis-de-fluxo` `T-01.5` (`handoff/FIX-regressoes-fase05.md` §4.3) — ONE store per mount,
   * not per axis. A history page widens the grid; the host calls `rebase(newAxis)` right after
   * `setData` on every series (inside `guard.holdApplying()`), and the store keeps its state in
   * milliseconds. The echo of that `setData` (`from + k` on the new grid) converts to the same
   * milliseconds and does NOT reach `onCandidateRange` — so a page never pages again on its own.
   */
  rebase(nextAxis: TimeAxis): void;
  /** Registers `write` as panel `panelIndex`'s applier. Returns the unregister function — a
   * chart that unmounts (or is about to be replaced) MUST call it, or a later dispatch would
   * call into a `write` closure that still references a disposed `IChartApi`. */
  registerPanel(panelIndex: number, write: (logical: LogicalRange) => void): () => void;
  notifyPanelRangeChanged(panelIndex: number, candidateLogical: LogicalRange): void;
  /**
   * `T-05-FIX` — the SAME `ReentrancyGuard` `RangeDispatcher`'s cross-panel writes already hold
   * during a dispatch (`range-dispatch.ts`), reached here so `useLightweightChart`
   * (`SymbolClient.tsx`) can wrap the mount-time "aplica" — `setVisibleLogicalRange(initialLogicalRange)`
   * — the ONE write `RangeDispatcher` itself never sees, because it happens before any panel is
   * registered. Typed off `RangeDispatcher["guard"]` rather than importing `ReentrancyGuard`
   * directly: `charts/index.ts` (`ADR-034/D8`) deliberately does not re-export
   * `ReentrancyGuard`/`createReentrancyGuard` through the sanctioned `web -> charts` doorway, and
   * this indexed-access type crosses no wider than that door already does.
   */
  readonly guard: RangeDispatcher["guard"];
}

/**
 * Builds ONE `AxisSyncStore` over `axis` — one `RangeDispatcher` (`T-02.3`), one initial
 * `LogicalRange`, one `panelCount`-sized table of panel writers. `axis` is the CONSTRUCTION
 * axis; since `paineis-de-fluxo` `T-01.5` a history page no longer builds a new store — it calls
 * `rebase(newAxis)`, which keeps the state in milliseconds (`handoff/FIX-regressoes-fase05.md`
 * §4.3). A timeframe switch is still a new store: it is a new seed, and the `key` of
 * `<SymbolClient>` (`T-01.F1`) remounts the whole tree.
 *
 * `onRangeApplied` — `T-02.7` (`RNF-2`, `p95 <= 16ms` over `n >= 60` frames of one continuous
 * drag) — is called ONCE per `notifyPanelRangeChanged` call that actually produced a write to
 * the other panels (i.e. the dispatcher's own `state` changed), never on an echo or a
 * guard-dropped reentrant notification. It carries no value on purpose: this module stays free
 * of `performance.now()`/`Date.now()` — a caller that wants a timestamp reads its OWN clock
 * inside the callback, at the instant it fires, so this module's only obligation is calling it
 * at the right MOMENT, not choosing what a moment is measured against. `axis-latency-probe.ts`
 * is `web`'s caller for this; nothing under `node --test` needs it and every existing call site
 * omits it (`undefined`, the default, is a true no-op — checked before invoking).
 */
/**
 * `T-02.6` (`CST-213`, `DoD-3`/`CA-6`) — the query-parameter name the ablation switch reads.
 * Namespaced `e2e…` and read from nowhere else in this codebase (`grep -rn` this constant):
 * it exists only so a Playwright spec can prove the negative control ("desligada a assinatura,
 * os cinco PARAM de acompanhar") without a second `next build` — see `withAxisSyncAblation`'s
 * own docstring for why a compile-time flag does not fit `startSecondaryNextInstance`'s reuse
 * of an already-built `.next`.
 */
export const AXIS_SYNC_ABLATION_QUERY_PARAM = "e2eAxisSyncDisabled";

/**
 * Pure parse of a `location.search`-shaped string — no `window` reference in this module
 * (`axis-sync.ts` never imports React/DOM, same discipline as every other export here).
 * `axis-sync-provider.tsx` is the only caller with a real `window.location.search` to hand it;
 * kept here instead of there so this one-line contract is provable under `node --test`
 * (`axis-sync.test.ts`) rather than only through a real DOM mount.
 */
export function isAxisSyncAblationRequested(search: string): boolean {
  return new URLSearchParams(search).get(AXIS_SYNC_ABLATION_QUERY_PARAM) === "1";
}

/**
 * `T-02.6`'s ablation switch: wraps any `AxisSyncStore` so `notifyPanelRangeChanged` becomes a
 * no-op when `ablated` is `true`. A gesture on one panel's own chart still moves THAT chart —
 * nothing here reaches into an `IChartApi`, `useLightweightChart`'s own
 * `subscribeVisibleLogicalRangeChange` keeps firing, it is only the DISPATCH half that is
 * silenced — so `DoD-3`'s pairing holds: same capture, same gesture, opposite result, because
 * the other five never hear about it. `registerPanel`/`initialLogicalRange` are untouched: the
 * ablation is only of the "despacha" verb (`D-C3.1`'s table), never of the initial framing
 * every panel still needs at mount.
 *
 * Implemented as ordinary, always-compiled code — no build-time flag — because
 * `startSecondaryNextInstance` (`frontend/e2e/helpers.ts`) reuses an ALREADY-BUILT `.next`
 * (`make e2e` builds once); a `NEXT_PUBLIC_*` compile-time flag could not be toggled per-test
 * without a second, separately-built instance. A runtime query-string check costs nothing in
 * production (`ablated` is `false` on every real URL, and the wrapper is skipped entirely).
 */
export function withAxisSyncAblation(store: AxisSyncStore, ablated: boolean): AxisSyncStore {
  if (!ablated) {
    return store;
  }
  // Delegating accessors, not an object spread: `axis`/`currentRange` change on `rebase` and on
  // every dispatch (`T-01.5`), and a spread would freeze the values of the instant it ran.
  return {
    get axis() {
      return store.axis;
    },
    get currentRange() {
      return store.currentRange;
    },
    initialLogicalRange: store.initialLogicalRange,
    guard: store.guard,
    rebase: (nextAxis) => store.rebase(nextAxis),
    registerPanel: (panelIndex, write) => store.registerPanel(panelIndex, write),
    notifyPanelRangeChanged: () => {
      // Deliberately empty — see this function's own docstring. `registerPanel` stays real,
      // so a regression that re-enabled dispatch while ablation is requested would still show
      // up as a write on the panels under test.
    },
  };
}

/**
 * `T-05.2` — the fourth, OPTIONAL parameter `D-C3.5`'s paginator needs, kept as a trailing
 * options object rather than two more positional parameters: every existing call site
 * (`createAxisSyncStore(axis, panelCount)`, `createAxisSyncStore(axis, panelCount,
 * onRangeApplied)`) stays byte-for-byte valid, since both new fields are optional and the
 * object itself may be omitted.
 */
export interface AxisSyncStoreOptions {
  /** The `TimeRange` to register as CURRENT at construction, in place of "the whole axis"
   * (this function's own historic default, still what a caller gets by omitting this field —
   * the initial page load, where there is no PRIOR visible range to preserve). `D-C3.5`: "o
   * range de tempo sobrevive ao remonte" — when a history page widens the axis, `web`
   * constructs a NEW store (a new `axis` identity, `axis-sync-provider.tsx`'s own contract),
   * and passes the range the operator was ALREADY looking at here, so the remount does not
   * reset the viewport to "fit everything" the way a fresh page load correctly does. */
  readonly initialRange?: TimeRange;
  /** Called with the dispatcher's CURRENT `TimeRange` every time `notifyPanelRangeChanged`
   * produces a real application (same "did dispatcher.state actually change" gate
   * `onRangeApplied` below already uses) — panel-agnostic by construction, since the dispatcher
   * has already folded whichever of the six panels originated the gesture into ONE registered
   * state. This is `D-C3.5`'s "o gatilho é a grade, não o painel": the paginator (`web`,
   * `SymbolClient.tsx`) reads `historyRequest` off THIS range, once per real range change,
   * never once per panel. */
  readonly onCandidateRange?: (range: TimeRange) => void;
}

export function createAxisSyncStore(
  axis: TimeAxis,
  panelCount: number = SINGLE_CHART_PANEL_COUNT,
  onRangeApplied?: () => void,
  options: AxisSyncStoreOptions = {},
): AxisSyncStore {
  if (!Number.isInteger(panelCount) || panelCount <= 0) {
    throw new RangeError(`panelCount must be a positive integer, received ${panelCount}`);
  }
  const writes: Array<((logical: LogicalRange) => void) | null> = new Array(panelCount).fill(null);
  // The initial framing is `options.initialRange` when given (`T-05.2`: a page-triggered axis
  // swap preserving what was on screen) — otherwise the WHOLE axis, every slot the shared grid
  // declares, from its first instant to one step past its last (`window.endMsExclusive`'s own
  // convention, `s2-window.ts`). This is the value `fitContent()` used to let each chart guess
  // at independently; here it is computed once, off the axis every panel already shares.
  const initialRange: TimeRange =
    options.initialRange ?? { fromMs: axis.startMs, toMs: axis.startMs + axis.slotCount * axis.stepMs };
  const write: PanelWrite = (panelIndex, logical) => {
    writes[panelIndex]?.(logical);
  };
  const dispatcher: RangeDispatcher = createRangeDispatcher(axis, initialRange, panelCount, write);
  let currentAxis = axis;
  return {
    get axis() {
      return currentAxis;
    },
    get currentRange() {
      return dispatcher.state;
    },
    initialLogicalRange: toLogicalRange(initialRange, axis),
    guard: dispatcher.guard,
    rebase(nextAxis) {
      currentAxis = nextAxis;
      dispatcher.rebase(nextAxis);
    },
    registerPanel(panelIndex, panelWrite) {
      if (!Number.isInteger(panelIndex) || panelIndex < 0 || panelIndex >= panelCount) {
        throw new RangeError(`panelIndex out of range: received ${panelIndex}, panelCount is ${panelCount}`);
      }
      writes[panelIndex] = panelWrite;
      return () => {
        // Guarded by identity, not just index: a fast unmount/remount pair (React
        // strict-mode double-invoke, or a `key` change) could otherwise let the OLDER
        // effect's cleanup clear the NEWER effect's registration.
        if (writes[panelIndex] === panelWrite) {
          writes[panelIndex] = null;
        }
      };
    },
    notifyPanelRangeChanged(panelIndex, candidateLogical) {
      // `T-02.7`: `dispatcher.state` is reassigned (a NEW object, `range-dispatch.ts:131`) only
      // when `reduceRangeEvent` found a real change — an echo of the current state or a
      // guard-dropped reentrant notification leaves the SAME reference. Comparing identity
      // before/after is how this module knows an actual "aplica" happened without duplicating
      // `reduceRangeEvent`'s own dedupe logic or reaching into the guard's internals.
      const stateBeforeDispatch = dispatcher.state;
      dispatcher.onPanelRangeChanged(panelIndex, candidateLogical);
      if (dispatcher.state !== stateBeforeDispatch) {
        onRangeApplied?.();
        options.onCandidateRange?.(dispatcher.state);
      }
    },
  };
}
