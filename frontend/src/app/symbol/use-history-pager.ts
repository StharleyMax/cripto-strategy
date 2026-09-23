"use client";

/**
 * `T-05.2` — the REACT half of `D-C3.5`'s history paginator. Mirrors the split
 * `axis-sync.ts`/`axis-sync-provider.tsx` already establish in this feature: the PURE decisions
 * (which page to ask for, how to widen/cap the window, how to merge a page's rows, how to
 * rebuild the six panels' drawable shapes) live in plain `.ts` modules with no React import
 * (`history-page-window.ts`, `panel-assembly.ts`, and `charts`' own `historyRequest`) and are
 * tested there, under `node --test`, with no DOM. THIS file is the thin glue: it holds the
 * paging STATE (the accumulated window, the merged rows, whether a request is in flight, the
 * coverage floor a failed page freezes) and wires it to `AxisSyncProvider`'s two `T-05.2` props
 * (`initialRange`/`onCandidateRange`, `axis-sync.ts`'s own docstring on `AxisSyncStoreOptions`).
 *
 * ── WHY `onCandidateRange` READS EVERYTHING THROUGH REFS, NEVER THROUGH CLOSURE ──────────────
 *
 * `createAxisSyncStore` (`axis-sync.ts`) freezes whichever `onCandidateRange` closure it is
 * constructed with until `axis` itself changes (`axis-sync-provider.tsx`'s `useMemo` deps on
 * `[axis]` alone) — and `axis` does NOT change when a page fetch merely FAILS (only a
 * SUCCESSFUL page widens the window, hence changes `axis`). A callback that captured
 * `coverageFloorMs` by closure would therefore keep re-proposing a page already known to fail —
 * the exact "detector permanentemente disparado" failure mode `D-C3.4` measured for
 * `barsInLogicalRange`, reopened one layer up. Every value `onCandidateRange` reads
 * (`axis`/`coverageFloorMs`/`window`/`rows`) is therefore read off a REF, updated on every
 * render, so `onCandidateRange`'s own IDENTITY can stay constant (empty dep array) while its
 * BEHAVIOUR always sees the latest state — the standard React ref-for-stale-closure pattern,
 * applied here because `axis-sync.ts`'s store-freezing contract makes it load-bearing rather
 * than optional.
 *
 * ── WHY A FAILED PAGE ABORTS ALL TEN FETCHES, NEVER MERGES A PARTIAL SET ─────────────────────
 *
 * `CA-5a` (`view-model.ts::nonNegativeFlowSlotsFromHistoryRows`'s own docstring) is the
 * invariant every one of the six panes already relies on: "sobre exatamente a mesma grade". A
 * page where nine of ten fetches succeed and one throws (`T-05.4`'s 90-day ceiling refusal,
 * a dropped connection, …) would desync that one series' accumulated window from its five
 * siblings if merged anyway. `T-05.5` — not this task — owns naming WHY a page failed on
 * screen (`absent`/`not-loaded`/`beyond-coverage`); what `T-05.2` still owes, on its own, is
 * "never loop forever": freezing `coverageFloorMs` at the axis edge the failed attempt was
 * fired from makes `historyRequest`'s own short-circuit return `null` for every later
 * candidate against this axis (`time-axis-controller.ts`: "floorMs !== null && axis.startMs
 * <= floorMs").
 */

import { useCallback, useMemo, useRef, useState } from "react";

import {
  DEFAULT_PAGE_TRIGGER_SLOTS,
  historyRequest,
  S2_AXIS_STEP_MS,
  type HistoryCoverage,
  type TimeAxis,
  type TimeRange,
} from "../../charts/index.ts";
import type { BarPolicy, HistoryRequestKey } from "../history-transport.ts";
import { fetchSeriesHistoryFromBrowser, HistoryPageFetchError } from "./browser-series-history-client.ts";
import { recordHistoryPageRequested } from "./history-page-latency-probe.ts";
import {
  DEFAULT_MAX_ACCUMULATED_SLOTS,
  DEFAULT_PAGE_SLOTS,
  mergeOlderPage,
  trimRowsToWindow,
  widenAndCapWindow,
  type AccumulatedWindow,
} from "./history-page-window.ts";
import {
  assembleHistoryPage,
  type AssemblyStaticContext,
  type HistoryPageAssembly,
  type HistoryRowsBundle,
} from "./panel-assembly.ts";
import type { SeriesHistoryRow } from "./series-history-envelope.ts";

/** The `series_key_id` this route resolved for each of the ten `/series-history` fetches
 * `page.tsx` already makes — `null` for a panel whose catalog resolution failed or was
 * ambiguous at the INITIAL render (`resolveCatalogEntry`'s own three-way result). A `null` key
 * is never retried: there is no series to page for it, at any window. */
export interface HistorySeriesKeys {
  readonly open: string | null;
  readonly high: string | null;
  readonly low: string | null;
  readonly close: string | null;
  readonly oi: string | null;
  readonly cvd: string | null;
  readonly volume: string | null;
  readonly liquidationLong: string | null;
  readonly liquidationShort: string | null;
  readonly longShort: string | null;
}

/**
 * Everything `use-history-pager` needs to start from — `page.tsx` builds this once, server-side,
 * from exactly the values it already computed for the initial render (the ten resolved keys,
 * the ten already-fetched row arrays, the window, `knowledgeTimeMs`/`interval`/`barPolicy`, and
 * the STATIC per-series facts `panel-assembly.ts`'s `AssemblyStaticContext` needs). Nothing here
 * is re-derived by this hook — it is the seed a `useState` initializer reads exactly once.
 */
export interface HistoryPagingSeed {
  readonly symbol: string;
  readonly interval: string;
  readonly barPolicy: BarPolicy;
  /** Fixed for the WHOLE paging life of this mount — `ADR-005/D1`: "o cache É o knowledge_time".
   * Every page this hook ever fetches reuses this SAME instant, never `Date.now()` read again on
   * the client (`web` reads the clock exactly once, server-side, per `request-window.ts`'s own
   * docstring — a client-side paginator that read a fresh clock per page would let `R-1`'s
   * admission answer differently for the SAME grid instant across two pages of the same session). */
  readonly knowledgeTimeMs: number;
  /** `T-05.2-FIX-adr005` — the ALREADY RESOLVED absolute `GET /series-history` endpoint URL
   * `page.tsx` computed once, server-side, via `seriesHistoryEndpointUrl`
   * (`series-history-client.ts`) — `null` when `INGEST_HEALTH_API_BASE_URL` was unset at render
   * time, same degrade-to-absent posture `page.tsx`'s own `liveUrls` already takes. This hook
   * never reads an environment variable itself (`ADR-019/D4`: the browser cannot); it only
   * carries this string to `fetchSeriesHistoryFromBrowser`, which combines it with each page's
   * `HistoryRequestKey` and calls FastAPI directly. */
  readonly historyBaseUrl: string | null;
  readonly window: AccumulatedWindow;
  readonly keys: HistorySeriesKeys;
  readonly rows: HistoryRowsBundle;
  readonly staticContext: AssemblyStaticContext;
  /** `D-C3.5`'s own numbers — overridable only for a test; every real caller gets the defaults. */
  readonly pageSlots?: number;
  readonly maxAccumulatedSlots?: number;
  readonly triggerSlots?: number;
}

export interface HistoryPagerResult {
  readonly axis: TimeAxis;
  readonly assembly: HistoryPageAssembly;
  /** `undefined` until the FIRST page lands — `AxisSyncProvider` then falls back to its own
   * "whole axis" default, correct for the very first mount. Defined from then on: the exact
   * `TimeRange` the operator was looking at when the page that just landed was requested,
   * handed straight to `AxisSyncProvider`'s `initialRange` so the remount does not reset the
   * viewport (`D-C3.5`: "o range de tempo sobrevive ao remonte"). */
  readonly initialRange: TimeRange | undefined;
  readonly onCandidateRange: (range: TimeRange) => void;
}

function axisFromWindow(window: AccumulatedWindow): TimeAxis {
  return {
    startMs: window.startMs,
    stepMs: S2_AXIS_STEP_MS,
    slotCount: (window.endMsExclusive - window.startMs) / S2_AXIS_STEP_MS,
  };
}

export function useHistoryPager(seed: HistoryPagingSeed): HistoryPagerResult {
  const pageSlots = seed.pageSlots ?? DEFAULT_PAGE_SLOTS;
  const maxSlots = seed.maxAccumulatedSlots ?? DEFAULT_MAX_ACCUMULATED_SLOTS;
  const triggerSlots = seed.triggerSlots ?? DEFAULT_PAGE_TRIGGER_SLOTS;

  const [windowState, setWindowState] = useState<AccumulatedWindow>(seed.window);
  const [rows, setRows] = useState<HistoryRowsBundle>(seed.rows);
  const [preservedRange, setPreservedRange] = useState<TimeRange | undefined>(undefined);
  const [coverageFloorMs, setCoverageFloorMs] = useState<number | null>(null);

  const axis = useMemo(() => axisFromWindow(windowState), [windowState.startMs, windowState.endMsExclusive]);
  const assembly = useMemo(
    () => assembleHistoryPage(rows, windowState, seed.staticContext),
    [rows, windowState, seed.staticContext],
  );

  // See this module's own docstring, "WHY onCandidateRange READS EVERYTHING THROUGH REFS".
  const axisRef = useRef(axis);
  axisRef.current = axis;
  const coverageFloorMsRef = useRef(coverageFloorMs);
  coverageFloorMsRef.current = coverageFloorMs;
  const windowRef = useRef(windowState);
  windowRef.current = windowState;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const inFlightRef = useRef(false);

  const fetchPage = useCallback(
    async (req: { readonly fromMs: number; readonly toMs: number; readonly intervalMs: number }, range: TimeRange) => {
      const windowEndMsInclusiveOfPage = req.toMs - req.intervalMs;
      const buildKey = (seriesKeyId: string): HistoryRequestKey => ({
        series_key_id: seriesKeyId,
        symbol: seed.symbol,
        interval: seed.interval,
        window_start_ms: req.fromMs,
        window_end_ms: windowEndMsInclusiveOfPage,
        knowledge_time_ms: seed.knowledgeTimeMs,
        bar_policy: seed.barPolicy,
      });
      // A `null` key means this render never resolved a series for that panel (`not_in_catalog`/
      // `ambiguous_in_catalog`, `page.tsx`'s own `CatalogResolution`) — there is nothing to page,
      // ever, at any window, so this returns the SAME "no rows" answer that panel already has,
      // without spending a request on it.
      const fetchOne = async (seriesKeyId: string | null): Promise<readonly SeriesHistoryRow[]> => {
        if (seriesKeyId === null) {
          return [];
        }
        const envelope = await fetchSeriesHistoryFromBrowser(buildKey(seriesKeyId), seed.historyBaseUrl);
        return envelope.rows;
      };

      try {
        const [open, high, low, close, oi, cvd, volume, liquidationLong, liquidationShort, longShort] =
          await Promise.all([
            fetchOne(seed.keys.open),
            fetchOne(seed.keys.high),
            fetchOne(seed.keys.low),
            fetchOne(seed.keys.close),
            fetchOne(seed.keys.oi),
            fetchOne(seed.keys.cvd),
            fetchOne(seed.keys.volume),
            fetchOne(seed.keys.liquidationLong),
            fetchOne(seed.keys.liquidationShort),
            fetchOne(seed.keys.longShort),
          ]);

        const widened = widenAndCapWindow(
          windowRef.current,
          { fromMs: req.fromMs, toMs: req.toMs },
          axisRef.current.stepMs,
          maxSlots,
        );
        const currentRows = rowsRef.current;
        const mergeAndTrim = (older: readonly SeriesHistoryRow[], existing: readonly SeriesHistoryRow[]) =>
          trimRowsToWindow(mergeOlderPage(older, existing), widened);

        const nextRows: HistoryRowsBundle = {
          open: mergeAndTrim(open, currentRows.open),
          high: mergeAndTrim(high, currentRows.high),
          low: mergeAndTrim(low, currentRows.low),
          close: mergeAndTrim(close, currentRows.close),
          oi: mergeAndTrim(oi, currentRows.oi),
          cvd: mergeAndTrim(cvd, currentRows.cvd),
          volume: mergeAndTrim(volume, currentRows.volume),
          liquidationLong: mergeAndTrim(liquidationLong, currentRows.liquidationLong),
          liquidationShort: mergeAndTrim(liquidationShort, currentRows.liquidationShort),
          longShort: mergeAndTrim(longShort, currentRows.longShort),
        };

        setWindowState(widened);
        setRows(nextRows);
        setPreservedRange(range);
      } catch (cause) {
        // See this module's docstring, "WHY A FAILED PAGE ABORTS ALL TEN FETCHES".
        setCoverageFloorMs(axisRef.current.startMs);
        if (!(cause instanceof HistoryPageFetchError)) {
          throw cause;
        }
      } finally {
        inFlightRef.current = false;
      }
    },
    [seed.symbol, seed.interval, seed.knowledgeTimeMs, seed.barPolicy, seed.historyBaseUrl, seed.keys, maxSlots],
  );

  const onCandidateRange = useCallback(
    (range: TimeRange) => {
      if (inFlightRef.current) {
        // `D-C3.5`: serial, ONE request in flight per grade — never a second fired before the
        // first answers (the library has no `prepend`; a second concurrent page would race the
        // first's `setData` and could apply a stale, narrower window on top of a wider one).
        return;
      }
      const coverage: HistoryCoverage = { earliestBucketMs: coverageFloorMsRef.current, sourceFloorMs: null };
      const req = historyRequest(range, axisRef.current, coverage, pageSlots, triggerSlots);
      if (req === null) {
        return;
      }
      // `T-05.9` (plan `05` DoD 7): "a borda é detectada" — recorded HERE, the instant
      // `historyRequest` decided a page is warranted, before `fetchPage` (network) is even
      // invoked. See `history-page-latency-probe.ts`'s own docstring for the full contract.
      recordHistoryPageRequested();
      inFlightRef.current = true;
      void fetchPage(req, range);
    },
    [fetchPage, pageSlots, triggerSlots],
  );

  return { axis, assembly, initialRange: preservedRange, onCandidateRange };
}
