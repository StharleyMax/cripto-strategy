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

/** Fixed, because the six panels this route mounts are fixed — no conditional panel, no
 * dynamic count. `RangeDispatcher` (`T-02.3`) takes `panelCount` at construction, so an index a
 * future panel needs has to be added HERE, not discovered at runtime. */
export const PANEL_COUNT = 6;
export const PRICE_PANEL_INDEX = 0;
export const OI_PANEL_INDEX = 1;
export const CVD_PANEL_INDEX = 2;
export const LIQUIDATION_LONG_PANEL_INDEX = 3;
export const LIQUIDATION_SHORT_PANEL_INDEX = 4;
export const LONG_SHORT_PANEL_INDEX = 5;

/**
 * What `useLightweightChart` (`SymbolClient.tsx`) gets from the provider — `D-C3.1`'s table,
 * `web`'s side of it: `initialLogicalRange` replaces the per-chart `fitContent()`;
 * `registerPanel` is how a chart makes itself WRITABLE by the dispatcher
 * (`RangeDispatcher.onPanelRangeChanged`'s `write` callback is wired once, here, not per
 * panel); `notifyPanelRangeChanged` is what a chart's own `subscribeVisibleLogicalRangeChange`
 * handler calls — the "assina" and "despacha" halves, with "aplica" happening inside `write`.
 */
export interface AxisSyncStore {
  readonly axis: TimeAxis;
  readonly initialLogicalRange: LogicalRange;
  /** Registers `write` as panel `panelIndex`'s applier. Returns the unregister function — a
   * chart that unmounts (or is about to be replaced) MUST call it, or a later dispatch would
   * call into a `write` closure that still references a disposed `IChartApi`. */
  registerPanel(panelIndex: number, write: (logical: LogicalRange) => void): () => void;
  notifyPanelRangeChanged(panelIndex: number, candidateLogical: LogicalRange): void;
}

/**
 * Builds ONE `AxisSyncStore` over `axis` — one `RangeDispatcher` (`T-02.3`), one initial
 * `LogicalRange`, one `panelCount`-sized table of panel writers. `axis` is expected to be
 * held fixed for the store's whole life: a NEW axis needs a NEW store (`createRangeDispatcher`
 * takes the axis at construction, same discipline `T-02.2`'s `createTimeAxisController`
 * documents — "swapping the axis means constructing a new controller, not mutating this
 * one"), which is deliberately what a FUTURE timeframe switch would need, not something this
 * task's caller triggers today (there is no TF selector in this route yet).
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
  return {
    ...store,
    notifyPanelRangeChanged: () => {
      // Deliberately empty — see this function's own docstring. `registerPanel` stays real,
      // so a regression that re-enabled dispatch while ablation is requested would still show
      // up as a write on the panels under test.
    },
  };
}

export function createAxisSyncStore(axis: TimeAxis, panelCount: number = PANEL_COUNT): AxisSyncStore {
  if (!Number.isInteger(panelCount) || panelCount <= 0) {
    throw new RangeError(`panelCount must be a positive integer, received ${panelCount}`);
  }
  const writes: Array<((logical: LogicalRange) => void) | null> = new Array(panelCount).fill(null);
  // The initial framing IS the whole axis — every slot the shared grid declares, from its
  // first instant to one step past its last (`window.endMsExclusive`'s own convention,
  // `s2-window.ts`). This is the value `fitContent()` used to let each chart guess at
  // independently; here it is computed once, off the axis every panel already shares.
  const initialRange: TimeRange = { fromMs: axis.startMs, toMs: axis.startMs + axis.slotCount * axis.stepMs };
  const write: PanelWrite = (panelIndex, logical) => {
    writes[panelIndex]?.(logical);
  };
  const dispatcher: RangeDispatcher = createRangeDispatcher(axis, initialRange, panelCount, write);
  return {
    axis,
    initialLogicalRange: toLogicalRange(initialRange, axis),
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
      dispatcher.onPanelRangeChanged(panelIndex, candidateLogical);
    },
  };
}
