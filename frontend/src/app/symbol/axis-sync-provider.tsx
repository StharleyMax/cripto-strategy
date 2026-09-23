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
import type { TimeAxis, TimeRange } from "../../charts/index.ts";

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
 * (`useMemo`'s own contract, mirrored from `createAxisSyncStore`'s docstring) — what a
 * timeframe switch would need (still not wired, no TF-driven client refetch exists) AND what
 * `T-05.2`'s history paginator DOES trigger today: a widened window after a page arrives is a
 * new `axis`, on purpose.
 *
 * `T-02.6` (`DoD-3`/`CA-6`): the store is wrapped through `withAxisSyncAblation` on every
 * construction. `window.location.search` is read here — the one place in this file with a real
 * `window` — and handed to `axis-sync.ts`'s pure parser; that module itself never touches the
 * DOM. On every real URL this is `ablated = false` and `withAxisSyncAblation` returns `store`
 * unchanged, so this costs nothing outside the `?e2eAxisSyncDisabled=1` Playwright uses to
 * prove the negative control.
 *
 * `T-05.2` — `initialRange`/`onCandidateRange` are the two new, OPTIONAL props this task adds:
 * `initialRange` lets `SymbolClient.tsx` preserve the operator's own visible `TimeRange` across
 * a page-triggered axis swap (`D-C3.5`: "o range de tempo sobrevive ao remonte") instead of the
 * store's own default of "the whole axis", which is correct ONLY for the very first mount.
 * `onCandidateRange` is the wire the paginator listens on: `axis-sync.ts`'s own docstring on
 * `AxisSyncStoreOptions.onCandidateRange` is the full contract. Both default to `undefined`
 * (`createAxisSyncStore`'s own defaults apply), so every caller that predates `T-05.2` — there
 * is exactly one, `SymbolClient.tsx`'s own JSX before this task — is unaffected until it opts
 * in by passing them.
 */
export function AxisSyncProvider({
  axis,
  initialRange,
  onCandidateRange,
  children,
}: {
  readonly axis: TimeAxis;
  readonly initialRange?: TimeRange;
  readonly onCandidateRange?: (range: TimeRange) => void;
  readonly children: ReactNode;
}) {
  const store = useMemo(() => {
    const real = createAxisSyncStore(axis, PANEL_COUNT, recordAxisRangeApplied, {
      initialRange,
      onCandidateRange,
    });
    const ablated = typeof window !== "undefined" && isAxisSyncAblationRequested(window.location.search);
    return withAxisSyncAblation(real, ablated);
    // `initialRange`/`onCandidateRange` deliberately EXCLUDED from the dependency list, same
    // posture `useLightweightChart`'s own `build`/`measure` exclusion documents: `onCandidateRange`
    // is a fresh closure every render by construction (it captures the render's own paginator
    // state), and `initialRange` is meant to be read ONCE, at the instant `axis` itself changes —
    // re-running this `useMemo` because `initialRange` ticked on its own (it does not, but a
    // future caller should not be able to accidentally trigger a store rebuild by passing a new
    // object with the same values) would tear down and reconstruct the store on every render
    // instead of only when the axis a NEW store is actually for changes. No `react-hooks` plugin
    // is configured in this project's `eslint.config.mjs`, so no rule enforces exhaustive deps
    // here — same as `useLightweightChart`'s own comment states.
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
