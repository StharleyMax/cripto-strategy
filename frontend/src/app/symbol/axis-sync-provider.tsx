"use client";

/**
 * `T-02.4` (`CST-211`) — the thin React glue over `axis-sync.ts`'s pure `AxisSyncStore`. ALL of
 * the logic (the dispatcher, the writer table, the guards) lives in that plain `.ts` module and
 * is tested there without a DOM (`axis-sync.test.ts`); this file's only job is holding ONE
 * `AxisSyncStore` per mount and handing it to `SymbolClient.tsx`'s chart host via context.
 *
 * `paineis-de-fluxo` `T-01.5` (`handoff/FIX-regressoes-fase05.md` §4.3) — ONE STORE PER MOUNT,
 * NOT PER AXIS. Until this task the store was rebuilt in `useMemo([axis])`, so every history page
 * (a wider window is a new `axis`) built a new store, and the chart effect that depended on it
 * called `chart.remove()` and `createChart` again, dropping the rest of the operator's drag
 * (`gates/DIAG-e2e-master.md` §4: 24/24 gestures). Now the store is created once, from the FIRST
 * `axis` this provider sees, and a page reaches it through `store.rebase(newAxis)`, which the host
 * calls itself, inside its own `holdApplying()` window, right after `setData`. The `axis` prop is
 * read once; later values are ignored here on purpose.
 */

import { createContext, useContext, useRef, useState, type ReactNode } from "react";

import {
  createAxisSyncStore,
  isAxisSyncAblationRequested,
  withAxisSyncAblation,
  SINGLE_CHART_PANEL_COUNT,
  type AxisSyncStore,
} from "./axis-sync.ts";
import { recordAxisRangeApplied } from "./axis-latency-probe.ts";
import type { TimeAxis, TimeRange } from "../../charts/index.ts";

// `T-02.7` (`RNF-2`): the ONE extra wire this file carries. `createAxisSyncStore`'s optional
// `onRangeApplied` hook is bound to `recordAxisRangeApplied` here, at the same place the store
// itself is constructed, so every real axis application on every mount of this provider is
// timestamped for `frontend/e2e/17-teto-latencia-eixo.spec.ts` to read back — one place decides
// what counts as an application (`axis-sync.ts`), one place decides what clock measures it
// (`axis-latency-probe.ts`), and this file only wires the two together.

const AxisSyncContext = createContext<AxisSyncStore | null>(null);

/**
 * `axis` — the construction axis, read ONCE (see the module note). `onCandidateRange` — the
 * paginator's wire (`axis-sync.ts::AxisSyncStoreOptions.onCandidateRange`); the store holds a
 * stable forwarder to the LATEST value this provider was rendered with, so a caller whose
 * callback changes identity never needs a new store.
 *
 * `T-02.6` (`DoD-3`/`CA-6`): the store is wrapped through `withAxisSyncAblation` at construction.
 * `window.location.search` is read here — the one place in this file with a real `window` — and
 * handed to `axis-sync.ts`'s pure parser. On every real URL this is `ablated = false` and the
 * wrapper returns the store unchanged.
 */
export function AxisSyncProvider({
  axis,
  onCandidateRange,
  children,
}: {
  readonly axis: TimeAxis;
  readonly onCandidateRange?: (range: TimeRange) => void;
  readonly children: ReactNode;
}) {
  const onCandidateRangeRef = useRef(onCandidateRange);
  onCandidateRangeRef.current = onCandidateRange;
  const [store] = useState<AxisSyncStore>(() => {
    const real = createAxisSyncStore(axis, SINGLE_CHART_PANEL_COUNT, recordAxisRangeApplied, {
      onCandidateRange: (range) => onCandidateRangeRef.current?.(range),
    });
    const ablated = typeof window !== "undefined" && isAxisSyncAblationRequested(window.location.search);
    return withAxisSyncAblation(real, ablated);
  });
  return <AxisSyncContext.Provider value={store}>{children}</AxisSyncContext.Provider>;
}

/** Throws rather than degrading silently (`core.silent-except` territory) if the chart host ever
 * mounts outside `AxisSyncProvider` — it is meant to render inside it, always. */
export function useAxisSync(): AxisSyncStore {
  const store = useContext(AxisSyncContext);
  if (store === null) {
    throw new Error("useAxisSync must be called within an AxisSyncProvider");
  }
  return store;
}
