"use client";

/**
 * `T-02.4` (`CST-211`) — the thin React glue over `axis-sync.ts`'s pure `AxisSyncStore`. ALL of
 * the logic (the dispatcher, the writer table, the guards) lives in that plain `.ts` module and
 * is tested there without a DOM (`axis-sync.test.ts`); this file's only job is holding ONE
 * `AxisSyncStore` per mount and handing it to `SymbolClient.tsx`'s six panels via context, so a
 * pan on any one panel dispatches through the SAME store the other five read from — `D-C3.1`.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";

import {
  createAxisSyncStore,
  isAxisSyncAblationRequested,
  withAxisSyncAblation,
  PANEL_COUNT,
  type AxisSyncStore,
} from "./axis-sync.ts";
import { recordAxisRangeApplied } from "./axis-latency-probe.ts";
import type { TimeAxis } from "../../charts/index.ts";

// `T-02.7` (`RNF-2`): the ONE extra wire this file carries. `createAxisSyncStore`'s optional
// `onRangeApplied` hook is bound to `recordAxisRangeApplied` here, at the same place the store
// itself is constructed, so every real axis application on every mount of this provider is
// timestamped for `frontend/e2e/17-teto-latencia-eixo.spec.ts` to read back — one place decides
// what counts as an application (`axis-sync.ts`), one place decides what clock measures it
// (`axis-latency-probe.ts`), and this file only wires the two together.

const AxisSyncContext = createContext<AxisSyncStore | null>(null);

/**
 * `axis` is expected to be REFERENTIALLY STABLE across `SymbolClient`'s re-renders for one
 * request — the caller (`SymbolClient.tsx`) memoizes it off the primitives that define it
 * (`panels.window`, the shared axis step). A new `axis` identity here constructs a NEW store
 * (`useMemo`'s own contract, mirrored from `createAxisSyncStore`'s docstring) — deliberately
 * what a FUTURE timeframe switch would need, not something today's caller triggers (there is
 * no TF selector in this route yet).
 *
 * `T-02.6` (`DoD-3`/`CA-6`): the store is wrapped through `withAxisSyncAblation` on every
 * construction. `window.location.search` is read here — the one place in this file with a real
 * `window` — and handed to `axis-sync.ts`'s pure parser; that module itself never touches the
 * DOM. On every real URL this is `ablated = false` and `withAxisSyncAblation` returns `store`
 * unchanged, so this costs nothing outside the `?e2eAxisSyncDisabled=1` Playwright uses to
 * prove the negative control.
 */
export function AxisSyncProvider({ axis, children }: { readonly axis: TimeAxis; readonly children: ReactNode }) {
  const store = useMemo(() => {
    const real = createAxisSyncStore(axis, PANEL_COUNT, recordAxisRangeApplied);
    const ablated = typeof window !== "undefined" && isAxisSyncAblationRequested(window.location.search);
    return withAxisSyncAblation(real, ablated);
  }, [axis]);
  return <AxisSyncContext.Provider value={store}>{children}</AxisSyncContext.Provider>;
}

/** Throws rather than degrading silently (`core.silent-except` territory) if a chart ever
 * mounts `useLightweightChart` outside `AxisSyncProvider` — every one of `SymbolClient.tsx`'s
 * six panels is meant to render inside it, always. */
export function useAxisSync(): AxisSyncStore {
  const store = useContext(AxisSyncContext);
  if (store === null) {
    throw new Error("useAxisSync must be called within an AxisSyncProvider");
  }
  return store;
}
