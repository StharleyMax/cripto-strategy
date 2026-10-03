"use client";

/**
 * `T-05.2` — the REACT half of `D-C3.5`'s history paginator. Mirrors the split
 * `axis-sync.ts`/`axis-sync-provider.tsx` already establish in this feature: the PURE decisions
 * (which page to ask for, how to widen/cap the window, how to merge a page's rows, how to fold
 * the pager's own declared coverage walls into one, how to rebuild the six panels' drawable
 * shapes) live in plain `.ts` modules with no React import (`history-page-window.ts`,
 * `slot-coverage.ts`, `panel-assembly.ts`, and `charts`' own `historyRequest`) and are tested
 * there, under `node --test`, with no DOM. THIS file is the thin glue: it holds the paging STATE
 * (the accumulated window, the merged rows, whether a request is in flight, the coverage floor a
 * failed page freezes, and — since `T-05.7` — the latest `panel.coverage` each of the ten series
 * has DECLARED) and wires it to `AxisSyncProvider`'s two `T-05.2` props
 * (`initialRange`/`onCandidateRange`, `axis-sync.ts`'s own docstring on `AxisSyncStoreOptions`).
 *
 * ── `T-05.7`/`D-C3.7` — THE HORIZON COMES FROM THE ENVELOPE, NEVER FROM THE FAILURE FREEZE ────
 *
 * Before this task, `onCandidateRange` built `HistoryCoverage` from `coverageFloorMs` alone — a
 * client-OBSERVED heuristic that only learns anything the moment a page FAILS, freezing the axis
 * edge that fetch was fired from (`D-C3.4`'s "never loop forever" contract, still true and still
 * below). That is not the horizon `plan 05` item `5.5` requires: "vem do ENVELOPE (`coverage`),
 * nunca de constante a mão e nunca inferido de contagem de linhas" (row COUNT is provably
 * non-monotonic — `slot-coverage.ts`'s own fixture, `klines_volume` present at day 0, absent at
 * day 6, present again at day 59). Every SUCCESSFUL page now also captures `envelope.panel
 * .coverage` per series (`fetchOne` below), `combineHistoryCoverage` (`slot-coverage.ts`) folds
 * the ten walls into one, and THAT is the primary source `onCandidateRange` feeds
 * `historyRequest`. The failure freeze does not go away — it stays exactly what `D-C3.4` built it
 * for, a safety net against an infinite loop when the wire has declared no coverage at all
 * (`combineHistoryCoverage` returns `null` only then) — it simply stops being consulted FIRST.
 *
 * ── WHY `onCandidateRange` READS EVERYTHING THROUGH REFS, NEVER THROUGH CLOSURE ──────────────
 *
 * `createAxisSyncStore` (`axis-sync.ts`) freezes whichever `onCandidateRange` closure it is
 * constructed with until `axis` itself changes (`axis-sync-provider.tsx`'s `useMemo` deps on
 * `[axis]` alone) — and `axis` does NOT change when a page fetch merely FAILS (only a
 * SUCCESSFUL page widens the window, hence changes `axis`). A callback that captured
 * `coverageFloorMs`/`panelCoverage` by closure would therefore keep re-proposing a page already
 * known to fail — the exact "detector permanentemente disparado" failure mode `D-C3.4` measured
 * for `barsInLogicalRange`, reopened one layer up. Every value `onCandidateRange` reads
 * (`axis`/`coverageFloorMs`/`panelCoverage`/`window`/`rows`) is therefore read off a REF, updated
 * on every render, so `onCandidateRange`'s own IDENTITY can stay constant (empty dep array) while
 * its BEHAVIOUR always sees the latest state — the standard React ref-for-stale-closure pattern,
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
  axisForWindow,
  DEFAULT_PAGE_TRIGGER_SLOTS,
  historyRequest,
  type HistoryCoverage,
  type TimeAxis,
  type TimeRange,
} from "../../../../charts/index.ts";
import type { BarPolicy, HistoryRequestKey } from "../../../history-transport.ts";
import { fetchSeriesHistoryFromBrowser, HistoryPageFetchError } from "./browser-series-history-client.ts";
import { recordHistoryPageRequested } from "../../history-page-latency-probe.ts";
import {
  capWindowRightEdge,
  DEFAULT_MAX_ACCUMULATED_SLOTS,
  effectiveMaxAccumulatedSlots,
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
} from "../../panel-assembly.ts";
import {
  EMPTY_OI_CANDLE_BUNDLE,
  mergeOlderOiCandles,
  oiCandleBundleOf,
  trimOiCandlesToWindow,
  type OiCandleBundle,
} from "../../oi-candle-pane.ts";
import type { PanelCoverage, SeriesHistoryRow } from "../../series-history-envelope.ts";
import { combineHistoryCoverage, type PanelCoverageBundle } from "../../slot-coverage.ts";
import {
  historyFetchPlan,
  mapSlotRecord,
  SeriesSlotError,
  slotRecordOf,
  slotValueAt,
  type HistorySeriesTable,
  type SeriesAddress,
  type SeriesSlotRecord,
} from "./series-slots.ts";
import { timeframeStepMs } from "../axis/supported-timeframes.ts";
import { isLeftOfMountView, mountViewRange, timeframeWindowBars } from "../axis/timeframe-window.ts";

/** The `series_key_id` this route resolved for each `/series-history` fetch `page.tsx` makes,
 * keyed by slot (`T-03.3`, `series-slots.ts`) — `null` for a series whose catalog resolution
 * failed or was ambiguous at the INITIAL render (`resolveCatalogEntry`'s own three-way result). A
 * `null` key is never retried: there is no series to page for it, at any window. */
export type HistorySeriesKeys = SeriesSlotRecord<string | null>;

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
  /** `D-C3.5`'s own numbers — overridable only for a test; every real caller gets the defaults
   * (`pageBars` of `interval`'s row in `timeframe-window.ts`, and `DEFAULT_MAX_ACCUMULATED_SLOTS`). */
  readonly pageSlots?: number;
  readonly maxAccumulatedSlots?: number;
  readonly triggerSlots?: number;
}

export interface HistoryPagerResult {
  readonly axis: TimeAxis;
  readonly assembly: HistoryPageAssembly;
  // `paineis-de-fluxo` `T-01.5`: `initialRange` (the range captured when a page was REQUESTED,
  // re-applied on the remount the page caused) is gone. The chart no longer remounts on a page,
  // and that range was already stale when the page landed — the `-15 → 507` re-framing of
  // `gates/DIAG-e2e-master.md` §4 (`handoff/FIX-regressoes-fase05.md` §4.3 item 3).
  readonly onCandidateRange: (range: TimeRange) => void;
  /**
   * `T-01.5` (`handoff/FIX-regressoes-fase05.md` §4.2, the `[NÃO SEI]`) — the host calls this
   * with `true` when a pointer gesture starts on the chart and with `false` when it ends. While
   * held, a page widens the window WITHOUT the `maxSlots` right-edge cut: the chart's time scale
   * anchors the view to the last bar, so a right cut in the middle of a drag moves the view by the
   * whole cut. On release, the deferred cut is applied at once (`capWindowRightEdge`), and the
   * host restores the view from the registered range, with no drag left to fight it.
   */
  readonly holdRightEdgeCap: (held: boolean) => void;
  /** `T-05.6` — the SAME accumulated window `axis` was just built from, exposed as-is (not
   * re-derived from `axis`) so a caller can feed it straight to `slot-coverage.ts::panelWallState`
   * alongside `panelCoverage` below, without reconstructing `{startMs, endMsExclusive}` out of
   * `axis.startMs`/`stepMs`/`slotCount` a second way. */
  readonly window: AccumulatedWindow;
  /** `T-05.6` — the pager's latest belief about every series' own declared floor (`T-05.7`'s own
   * state, `emptyPanelCoverage` until the first successful page lands), exposed so a caller can
   * ask, per panel, whether the fetched window has walked past that series' wall
   * (`slot-coverage.ts::panelWallState`) — the PIXEL this task adds. This hook itself never reads
   * that question; `combineHistoryCoverage` above already folds it for the paging DECISION, this
   * is the raw per-series bundle for the RENDER decision, which needs to tell OI/long-short apart
   * from price rather than one merged floor. */
  readonly panelCoverage: PanelCoverageBundle;
}

/** The pager's initial belief about every series' own declared coverage: unmeasured, every one —
 * `T-05.7`'s own scope is "a resposta MAIS RECENTE que o pager já tem", never the SSR-fetched
 * envelope `page.tsx` already discarded (`fetchPanelRows` there keeps only `{rows, status}`).
 * The very first `onCandidateRange` call of a mount therefore falls straight through to the
 * failure-freeze safety net, exactly like before this task, until the pager's OWN first
 * successful page lands and this bundle stops being all-`null`. `T-03.3`: built over the plan of
 * the table, so its slots are the slots a page fetches. */
function emptyPanelCoverage(plan: readonly SeriesAddress[]): PanelCoverageBundle {
  return slotRecordOf(plan, () => null);
}

/**
 * `table` — `estrutura-do-front` `T-03.3` (`SPEC-011 §3`, `G-R`) — the indicator table, BY
 * PARAMETER from `SymbolClient.tsx`: this file is core (`chart/**`) and does not import the
 * catalog (P2). A page fetches the four price reductions plus every series of `table`
 * (`historyFetchPlan`), keyed by slot, and hands the same table to `assembleHistoryPage`. Its
 * identity must be stable across renders (a module constant), like `seed`'s.
 */
export function useHistoryPager(table: HistorySeriesTable, seed: HistoryPagingSeed): HistoryPagerResult {
  const plan = useMemo(() => historyFetchPlan(table), [table]);
  // `paineis-de-fluxo` `T-05.1` (`handoff/T-05.1-desenho.md` §1) — THE axis step of this mount,
  // derived from `seed.interval` and from nowhere else: no second field on the seed that could
  // disagree with `interval`. It used to be `S2_AXIS_STEP_MS` (1 minute) in every timeframe, the
  // defect `D-A` of `handoff/FIX-uso-2026-10-02.md`.
  const stepMs = timeframeStepMs(seed.interval);
  const pageSlots = seed.pageSlots ?? timeframeWindowBars(seed.interval).pageBars;
  // W1-FIX (MF-A): never below the seed window + one page — see `effectiveMaxAccumulatedSlots`.
  const maxSlots = effectiveMaxAccumulatedSlots(
    seed.window,
    stepMs,
    pageSlots,
    seed.maxAccumulatedSlots ?? DEFAULT_MAX_ACCUMULATED_SLOTS,
  );
  const triggerSlots = seed.triggerSlots ?? DEFAULT_PAGE_TRIGGER_SLOTS;

  const [windowState, setWindowState] = useState<AccumulatedWindow>(seed.window);
  const [rows, setRows] = useState<HistoryRowsBundle>(seed.rows);
  const [coverageFloorMs, setCoverageFloorMs] = useState<number | null>(null);
  // `T-05.7`/`D-C3.7` — the latest `panel.coverage` DECLARED for each of the ten series, from
  // the most recent page THIS pager itself fetched successfully. See `emptyPanelCoverage`'s
  // own docstring for why this never starts seeded from the SSR envelope.
  const [panelCoverage, setPanelCoverage] = useState<PanelCoverageBundle>(() => emptyPanelCoverage(plan));

  const axis = useMemo(
    () => axisForWindow(windowState, stepMs),
    [windowState.startMs, windowState.endMsExclusive, stepMs],
  );
  const assembly = useMemo(
    () => assembleHistoryPage(table, rows, windowState, seed.staticContext, stepMs),
    [table, rows, windowState, seed.staticContext, stepMs],
  );

  // See this module's own docstring, "WHY onCandidateRange READS EVERYTHING THROUGH REFS".
  const axisRef = useRef(axis);
  axisRef.current = axis;
  const coverageFloorMsRef = useRef(coverageFloorMs);
  coverageFloorMsRef.current = coverageFloorMs;
  const panelCoverageRef = useRef(panelCoverage);
  panelCoverageRef.current = panelCoverage;
  const windowRef = useRef(windowState);
  windowRef.current = windowState;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const inFlightRef = useRef(false);
  // `T-01.5` — see `HistoryPagerResult.holdRightEdgeCap`.
  const rightEdgeCapHeldRef = useRef(false);
  // `T-05.1` (`handoff/T-05.1-revisao-ab29321.md` §4): the left edge the mount frames — same pure
  // function and same axis as `axis-sync-provider.tsx` (it receives `pager.axis` and reads it once).
  // Frozen at mount on purpose: a page widens the axis, never the framing the operator started from.
  const mountViewFromMsRef = useRef(mountViewRange(axis).fromMs);

  const fetchPage = useCallback(
    async (req: { readonly fromMs: number; readonly toMs: number; readonly intervalMs: number }) => {
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
      // without spending a request on it, and `coverage: null` (`T-05.7`): there is no series to
      // declare a wall for, ever, at any window — `combineHistoryCoverage` excludes it forever.
      interface FetchedSeries {
        readonly rows: readonly SeriesHistoryRow[];
        readonly coverage: PanelCoverage | null;
        /** `T-03.11` — the page's `oi_candles` block, `null` when the envelope served none (every
         * series but open interest, `series_history.py::_oi_candle_report`). */
        readonly oiCandles: OiCandleBundle | null;
      }
      const fetchOne = async (seriesKeyId: string | null): Promise<FetchedSeries> => {
        if (seriesKeyId === null) {
          return { rows: [], coverage: null, oiCandles: null };
        }
        const envelope = await fetchSeriesHistoryFromBrowser(buildKey(seriesKeyId), seed.historyBaseUrl);
        return {
          rows: envelope.rows,
          coverage: envelope.panel.coverage,
          oiCandles: envelope.oi_candles === null ? null : oiCandleBundleOf(envelope.oi_candles),
        };
      };

      try {
        // `T-03.3` — one fetch per address of the plan: the four price reductions, then every
        // series of the table, in table order (`ADR-050/D5`: ten over `INDICATOR_CATALOG`).
        const fetched = await Promise.all(plan.map((address) => fetchOne(slotValueAt(seed.keys, address))));
        // The `oi_candles` block rides the open-interest fetch only; the core does not name that
        // series, it keeps the one block the page served. Two would mean two series claim the
        // drawn OI candles, and keeping either would be a guess.
        const servedCandles = fetched.flatMap((series) => (series.oiCandles === null ? [] : [series.oiCandles]));
        if (servedCandles.length > 1) {
          throw new SeriesSlotError(`history pager: ${servedCandles.length} series served an oi_candles block on one page`);
        }
        const pageCandles = servedCandles[0] ?? EMPTY_OI_CANDLE_BUNDLE;

        const widened = widenAndCapWindow(
          windowRef.current,
          { fromMs: req.fromMs, toMs: req.toMs },
          axisRef.current.stepMs,
          // `T-01.5`: no right cut while a gesture is held — it is applied when the gesture ends.
          rightEdgeCapHeldRef.current ? Number.MAX_SAFE_INTEGER : maxSlots,
        );
        const currentRows = rowsRef.current;
        const mergeAndTrim = (older: readonly SeriesHistoryRow[], existing: readonly SeriesHistoryRow[]) =>
          trimRowsToWindow(mergeOlderPage(older, existing), widened);

        const nextRows: HistoryRowsBundle = {
          ...slotRecordOf(plan, (address, index) => mergeAndTrim(fetched[index]!.rows, slotValueAt(currentRows, address))),
          // `T-03.11` — the OI candles ride the SAME fetch as the OI rows and follow the same merge-then-trim.
          oiCandles: trimOiCandlesToWindow(mergeOlderOiCandles(pageCandles, currentRows.oiCandles), widened),
        };
        // `T-05.7`/`D-C3.7` — the walls THIS page's envelopes just declared, replacing whatever
        // this pager previously knew for each series (the wire's own store only ever grows, so
        // the latest declaration is always at least as informative as the last).
        const nextCoverage: PanelCoverageBundle = slotRecordOf(plan, (_address, index) => fetched[index]!.coverage);

        // `T-05.9` — refs are updated HERE, synchronously, in the same microtask this fetch
        // resolves in — never left to wait for the render `axisRef.current = axis;` line above
        // performs. React does not commit `setWindowState`'s render until the scheduler gets
        // around to it, which is NOT before this `async` function returns control to its
        // caller. A second `onCandidateRange` fired in that gap (`inFlightRef.current` is
        // cleared in `finally`, right below, at the END of this same synchronous stretch) would
        // otherwise read `axisRef.current`/`windowRef.current` still pointing at the window
        // BEFORE this page — computing `req.toMs` off a stale `axis.startMs` that no longer
        // equals `windowRef.current.startMs` by the time ITS OWN fetch resolves (which may be
        // after THIS state has committed), tripping `widenAndCapWindow`'s "page.toMs must equal
        // current.startMs" invariant. Updating the refs eagerly, right alongside the state that
        // will eventually reach them via render, closes that gap: the guard
        // (`inFlightRef.current`) and the data it gates (`windowRef`/`axisRef`/`rowsRef`/
        // `panelCoverageRef`) become consistent at the exact same instant, instead of the guard
        // opening one render-tick before the data it protects has caught up.
        windowRef.current = widened;
        rowsRef.current = nextRows;
        panelCoverageRef.current = nextCoverage;
        axisRef.current = axisForWindow(widened, stepMs);

        setWindowState(widened);
        setRows(nextRows);
        setPanelCoverage(nextCoverage);
      } catch (cause) {
        // See this module's docstring, "WHY A FAILED PAGE ABORTS ALL TEN FETCHES". `axisRef`
        // here is always the FRESH axis (see the success branch above for why it cannot be
        // stale), so the freeze lands on the edge THIS failed request was actually fired from.
        coverageFloorMsRef.current = axisRef.current.startMs;
        setCoverageFloorMs(axisRef.current.startMs);
        if (!(cause instanceof HistoryPageFetchError)) {
          throw cause;
        }
      } finally {
        inFlightRef.current = false;
      }
    },
    [plan, seed.symbol, seed.interval, seed.knowledgeTimeMs, seed.barPolicy, seed.historyBaseUrl, seed.keys, maxSlots, stepMs],
  );

  const onCandidateRange = useCallback(
    (range: TimeRange) => {
      if (inFlightRef.current) {
        // `D-C3.5`: serial, ONE request in flight per grade — never a second fired before the
        // first answers (the library has no `prepend`; a second concurrent page would race the
        // first's `setData` and could apply a stale, narrower window on top of a wider one).
        return;
      }
      // `T-05.7`/`D-C3.7` — the DECLARED wall is primary; `coverageFloorMsRef` (the failure
      // freeze `D-C3.4` built) is only consulted as the safety net for when every series is
      // still unmeasured (`combineHistoryCoverage` returns `earliestBucketMs: null` then), per
      // this module's own docstring above.
      const declared = combineHistoryCoverage(panelCoverageRef.current);
      const coverage: HistoryCoverage = {
        earliestBucketMs: declared.earliestBucketMs ?? coverageFloorMsRef.current,
        sourceFloorMs: null,
      };
      // `T-05.1`: the mount framing, a layout echo of it, or a zoom-in is not a request for older
      // history (`isLeftOfMountView`). Only bites at `4h`, where the view is born inside the trigger.
      if (!isLeftOfMountView(range, mountViewFromMsRef.current, axisRef.current.stepMs)) {
        return;
      }
      const req = historyRequest(range, axisRef.current, coverage, pageSlots, triggerSlots);
      if (req === null) {
        return;
      }
      // `T-05.9` (plan `05` DoD 7): "a borda é detectada" — recorded HERE, the instant
      // `historyRequest` decided a page is warranted, before `fetchPage` (network) is even
      // invoked. See `history-page-latency-probe.ts`'s own docstring for the full contract.
      recordHistoryPageRequested();
      inFlightRef.current = true;
      void fetchPage(req);
    },
    [fetchPage, pageSlots, triggerSlots],
  );

  const holdRightEdgeCap = useCallback(
    (held: boolean) => {
      rightEdgeCapHeldRef.current = held;
      if (held) {
        return;
      }
      const capped = capWindowRightEdge(windowRef.current, axisRef.current.stepMs, maxSlots);
      if (capped === windowRef.current) {
        return;
      }
      // Same eager-ref discipline as `fetchPage`'s success branch (`T-05.9`): the refs and the
      // state they mirror move together, so a page fired right after this sees the capped window.
      const current = rowsRef.current;
      const trim = (series: readonly SeriesHistoryRow[]) => trimRowsToWindow(series, capped);
      const nextRows: HistoryRowsBundle = {
        ...mapSlotRecord(current, trim),
        oiCandles: trimOiCandlesToWindow(current.oiCandles, capped),
      };
      windowRef.current = capped;
      rowsRef.current = nextRows;
      axisRef.current = axisForWindow(capped, stepMs);
      setWindowState(capped);
      setRows(nextRows);
    },
    [maxSlots, stepMs],
  );

  return { axis, assembly, onCandidateRange, holdRightEdgeCap, window: windowState, panelCoverage };
}
