import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { IChartApi, LogicalRange as LibraryLogicalRange } from "lightweight-charts";
import { createChart, LineSeries, PriceScaleMode } from "lightweight-charts";
import { paneScaleMargins, toLogicalRange, type ScaleMargins, type TimeAxis } from "../../../../charts/index.ts";
import { chartConstructorOptions, gridCarrierSeriesOptions } from "../../chart-options.ts";
import { createPanesBeforeSeries } from "../../pane-scale-isolation.ts";
import { recordHistoryPageApplied, recordHistoryPageDrawn } from "../../history-page-latency-probe.ts";
import { busyWait, hostSeriesFeeds, isDenseSeriesAblationRequested, paneSeriesFeeds, requestedPageApplyBusyMs } from "../../host-series-feed.ts";
import { createCrosshairSlotStore, crosshairMoveHandler } from "../../pane-legend.ts";
import { useAxisSync } from "../axis/axis-sync-provider.tsx";
import { SINGLE_CHART_PANEL_INDEX } from "../axis/axis-sync.ts";
import { legendBottomPx, paneLayerAnchorOf } from "./pane-layer.tsx";
import { PANE_STACK } from "./pane-stack.ts";
import { ChartHostContext, CrosshairSlotContext, PaneAnchorsContext, useChartHost, type AnyPaneBinding, type HostRegistrar, type HostSeries, type HostSeriesFeed, type PaneScaleBinding } from "./registrar.ts";

/**
 * ── THE SINGLE CHART HOST (`paineis-de-fluxo` `T-01.5`, plan `01` item `1.3`, `ADR-044/D1`) ──
 *
 * The symbol page is ONE `createChart`, with one native pane per metric, in the order of the pane
 * registry (`pane-registry.ts::F1_PANE_ORDER` — the position IS the `paneIndex`). The six pane
 * components below still own what each pane DRAWS (series kind, style, scales, the lossless
 * mappings, the absence/zero marks), and they declare it through `useHostedPane`; the host owns the
 * one chart, the one `timeScale`, and the one conversation with `AxisSyncStore`.
 *
 * ⛔ THE HOST SURVIVES A PAGE (`handoff/FIX-regressoes-fase05.md` §4.2 option A, §4.3). The mount
 * effect runs ONCE per mount of `SymbolClient` — its dependencies are the stable `registrar`
 * alone, never the `axis` nor the store identity. A new seed (timeframe, symbol, instant) is a new
 * `key` on `<SymbolClient>` (`T-01.F1`), which remounts the whole tree. A history page is NOT a new
 * seed: it arrives as new props, and the data effect applies it IN PLACE —
 *
 *   `holdApplying()` → `setData` on every existing series (the new grid) → `store.rebase(axis)` →
 *   release on the next animation frame (the `T-05-FIX` pattern: the library's own frame was
 *   scheduled inside `setData`, so its deferred range notification is dropped before our release).
 *
 * The host does NOT write `initialRange`/`preservedRange` into the time scale on a page: the range
 * of the instant the page was requested is stale when it lands (the `-15 → 507` re-framing of
 * `gates/DIAG-e2e-master.md` §4). A prepend does not move the view — the library anchors it to the
 * last bar. The one write left is when the RIGHT edge moved (`use-history-pager.ts`'s deferred
 * cap, `holdRightEdgeCap`): then the view is put back on the REGISTERED range, in milliseconds,
 * which is current, not a snapshot. The pager defers that cut while a pointer gesture is held, so
 * this write never lands in the middle of a drag.
 *
 * `data-chart-mount-count` on the surface counts `createChart` calls — `e2e/22` asserts it stays
 * at `1` across paging. `data-visible-logical-from`/`-to` carry the range the chart shows,
 * `data-bar-spacing-px` the library's width of one bar (`T-05.1`, DoD 1), and
 * `data-axis-sync-write-count` counts dispatcher writes, which with `panelCount = 1` stays `0`.
 *
 * ── THE PER-PANE DOM LAYER (`T-01.6`, plan `01` item `1.5`, `[Q-DG-1]`) ─────────────────────────
 *
 * Each pane's chrome — title, readouts, badges, the absence note — is rendered INTO that pane, as a
 * layer over its canvas, and not beside the chart any more (`handoff/DESIGN-LAYOUT.md` §6, approved
 * by the gate r2 with conditions). The mechanics, each one measured or read in the library:
 *
 *   1. WHERE. `IPaneApi.getHTMLElement()` returns the pane's `<tr>` (`lightweight-charts@5.2.1`
 *      `dist/lightweight-charts.development.mjs:9592`, `_internal_getElement`), and a `<div>` inside a
 *      `<tr>` is invalid table content. The layer goes into the pane CELL's own wrapper — the
 *      `position: relative; overflow: hidden` `<div>` the library puts in the middle `<td>` and paints
 *      the pane's two canvases into (`:9565-9577`). There, `absolute inset-0` IS the plot area: the
 *      price-axis cells are the `<td>`s beside it, so the layer never covers an axis numeral, and a
 *      coordinate from `timeScale()`/`priceToCoordinate` is already in the layer's own frame.
 *   2. WHEN. That element is `null` in the tick the pane is created (`gates/T-01.0-spike.md` §6.2,
 *      5/5 panes). The host asks again on the next animation frame, up to `PANE_ANCHOR_MAX_FRAMES`,
 *      and only then portals the layers in. Since the host survives a page (above), this happens
 *      once per mount, not per page. Before that — and on the server — each layer renders in place,
 *      visually hidden: every `data-fact`/`data-testid` is in the first HTML the server sends.
 *   3. THE LAYER DOES NOT COVER THE SERIES. The layer is `pointer-events: none` (the crosshair and
 *      the drag stay the canvas'), and every scale that draws near the top of its pane is compressed
 *      into the part BELOW the layer's measured legend (`charts::paneScaleMargins`). A
 *      `ResizeObserver` re-runs that whenever a legend changes height (a badge appears, a font loads).
 *   4. THE CANVASES, NOT THE HOST, ARE `aria-hidden` (`DR-6`). The host now CONTAINS the readouts
 *      (they live inside the chart's DOM), so hiding the host would hide the very text that is the
 *      canvas' declared alternative. The host marks each `<canvas>` hidden, and the library's layout
 *      `<table>` `role="presentation"`, once the panes exist.
 */

/** Frames the host waits for `getHTMLElement()` to stop being `null` before giving up. The spike
 * measured ONE frame (`T-01.0` §6.2); the margin is for a slow first layout, and giving up leaves
 * the layers rendered in place (hidden) and `data-pane-layers="unanchored"` on the host. */
const PANE_ANCHOR_MAX_FRAMES = 10;

/** `T-01.10` — the ONLY `setData` loop of the host: the feeds, in the order they were given
 * (`host-series-feed.ts` puts the carrier first). */
function feedSeries(feeds: readonly HostSeriesFeed[]): void {
  for (const { series, items } of feeds) {
    series.setData(items as never);
  }
}

/** The pane the grid carrier lives in (`ADR-044/D2′(a)`): the first, which always exists. */
const GRID_CARRIER_PANE_INDEX = 0;

/** `DR-6`, re-anchored by `T-01.6` (see the host docstring, item 4). */
function hideChartGraphicsFromAssistiveTech(container: HTMLElement): void {
  for (const canvas of container.querySelectorAll("canvas")) {
    canvas.setAttribute("aria-hidden", "true");
  }
  for (const table of container.querySelectorAll("table")) {
    table.setAttribute("role", "presentation");
  }
}

/** The element the single chart is created in, rendered by the host above the panes' layers.
 * ⛔ NOT `aria-hidden` any more (`T-01.6`): the layers live inside it; the canvases are hidden one by
 * one instead (`hideChartGraphicsFromAssistiveTech`). */
function ChartHostSurface({ priceSlots }: { readonly priceSlots: number }) {
  const registrar = useChartHost();
  return (
    <div
      ref={registrar.surfaceRef}
      data-testid={CHART_HOST_TESTID}
      data-fact={`price_slots:${priceSlots}`}
      data-pane-stack-height-px={PANE_STACK.chartHeightPx}
    />
  );
}

export function SymbolChartHost({
  axis,
  dataVersion,
  onGestureChange,
  priceSlots,
  children,
}: {
  /** The pager's current axis. Read by the DATA effect only (`rebase`), never by the mount. */
  readonly axis: TimeAxis;
  /** Changes identity exactly when the panes' data changes (a page, or the deferred cap). */
  readonly dataVersion: unknown;
  /** `true` when a pointer gesture starts on the chart, `false` when it ends — the pager's
   * `holdRightEdgeCap`. */
  readonly onGestureChange: (active: boolean) => void;
  /** The price pane's slot count, published on the surface (`data-fact="price_slots:N"`). */
  readonly priceSlots: number;
  readonly children: ReactNode;
}) {
  const axisSync = useAxisSync();
  const axisSyncRef = useRef(axisSync);
  axisSyncRef.current = axisSync;
  const onGestureChangeRef = useRef(onGestureChange);
  onGestureChangeRef.current = onGestureChange;
  const chartStateRef = useRef<{
    readonly chart: IChartApi;
    /** `T-01.10` (`ADR-044/D2′(a)`) — the hidden series that carries the whole grid. */
    readonly carrier: HostSeries;
    /** `?e2eDenseSeries=1` — the panes get the lossless items of before (the ablation). */
    readonly dense: boolean;
    /** `?e2ePageApplyBusyMs=N` — `F-C`'s busy-wait on every page, `0` otherwise. */
    readonly busyMs: number;
    readonly handles: Map<number, unknown>;
    /** `T-01.6` — per pane, its scales and the base margins read right after `mount`. */
    readonly scales: Map<number, readonly { readonly binding: PaneScaleBinding; readonly base: ScaleMargins }[]>;
  } | null>(null);
  const appliedAxisRef = useRef<TimeAxis | null>(null);
  const mountCountRef = useRef(0);
  const latestDataVersionRef = useRef(dataVersion);
  latestDataVersionRef.current = dataVersion;
  const appliedDataVersionRef = useRef<unknown>(undefined);
  const [paneAnchors, setPaneAnchors] = useState<readonly (HTMLElement | null)[]>([]);
  const [registrar] = useState<HostRegistrar>(() => {
    const bindings = new Map<number, RefObject<AnyPaneBinding>>();
    const surfaceRef: RefObject<HTMLDivElement | null> = { current: null };
    return {
      surfaceRef,
      crosshairStore: createCrosshairSlotStore(),
      bindings,
      register(paneIndex, binding) {
        bindings.set(paneIndex, binding);
        const state = chartStateRef.current;
        if (state !== null && !state.handles.has(paneIndex)) {
          // A pane that registers after the chart exists (not the case for the six fixed panes of
          // phase `01`, which all render on the first commit) is mounted on arrival.
          state.handles.set(paneIndex, binding.current.mount(state.chart, paneIndex));
          // The carrier already holds the grid, so only this pane's feeds go in.
          feedSeries(paneSeriesFeeds(binding.current.apply(state.handles.get(paneIndex)), state.dense));
        }
        return () => {
          if (bindings.get(paneIndex) === binding) {
            bindings.delete(paneIndex);
          }
        };
      },
    };
  });

  // ── MOUNT: once per mount of `SymbolClient`. Deliberately NOT keyed on `axis` or on the store
  // identity — returning either to this list is the ablation `e2e/22` bites on (a new chart per
  // page, `data-chart-mount-count` = 1 + pages).
  useEffect(() => {
    const container = registrar.surfaceRef.current;
    if (container === null) {
      return;
    }
    const store = axisSyncRef.current;
    const bindings = registrar.bindings;
    // ⛔ THE OPTIONS ARE NOT SPELLED HERE (`DR-1`, `chart-construction.test.ts`) — the separator
    // colour and `enableResize` included (`chart-options.ts`, `T-01.6`). The height is the stack's.
    const chart = createChart(container, chartConstructorOptions(container.clientWidth || 600, PANE_STACK.chartHeightPx));
    mountCountRef.current += 1;
    container.dataset.chartMountCount = String(mountCountRef.current);
    // `T-01.10` (`ADR-044/D2′(a)`, `handoff/T-01.10-desenho.md` §3 item 1) — the grid CARRIER, created
    // BEFORE any pane's series: the host owns the grid, and the pane series carry plot items only.
    // Its options are `chart-options.ts`'s (`DR-1`), and it draws nothing.
    const carrier: HostSeries = chart.addSeries(LineSeries, gridCarrierSeriesOptions(), GRID_CARRIER_PANE_INDEX);
    // `T-01.11-FIX` (`MF-1`) — every pane exists BEFORE any pane mounts, so no pane's `right` scale is
    // built from the chart template a sibling's `applyOptions` wrote into (`pane-scale-isolation.ts`:
    // the liquidation panes' logarithmic mode used to reach OI, long/short and CVD this way).
    createPanesBeforeSeries(chart, PANE_STACK.stretchFactors.length);
    const search = window.location.search;
    const dense = isDenseSeriesAblationRequested(search);
    const busyMs = requestedPageApplyBusyMs(search);
    container.dataset.seriesFeed = dense ? "dense" : "sparse";
    const handles = new Map<number, unknown>();
    const paneIndices = [...bindings.keys()].sort((a, b) => a - b);
    for (const paneIndex of paneIndices) {
      const binding = bindings.get(paneIndex)!.current;
      handles.set(paneIndex, binding.mount(chart, paneIndex));
    }
    // `T-01.6` — the stretch factors (the panes exist once `addSeries(…, paneIndex)` ran), and the
    // base margins of every declared scale, read back AFTER the pane's own `applyOptions`.
    const panes = chart.panes();
    for (const [paneIndex, pane] of panes.entries()) {
      const factor = PANE_STACK.stretchFactors[paneIndex];
      if (factor !== undefined) {
        pane.setStretchFactor(factor);
      }
    }
    const scales = new Map<number, readonly { readonly binding: PaneScaleBinding; readonly base: ScaleMargins }[]>();
    for (const paneIndex of paneIndices) {
      const declared = bindings.get(paneIndex)!.current.scales?.(handles.get(paneIndex)) ?? [];
      scales.set(
        paneIndex,
        declared.map((binding) => {
          const margins = binding.series.priceScale().options().scaleMargins;
          return { binding, base: { top: margins.top, bottom: margins.bottom } };
        }),
      );
    }
    // The carrier FIRST, then every pane (`host-series-feed.ts`).
    feedSeries(
      hostSeriesFeeds(
        carrier,
        store.axis,
        paneIndices.flatMap((paneIndex) => bindings.get(paneIndex)!.current.apply(handles.get(paneIndex))),
        dense,
      ),
    );
    chartStateRef.current = { chart, carrier, dense, busyMs, handles, scales };
    appliedAxisRef.current = store.axis;
    appliedDataVersionRef.current = latestDataVersionRef.current;
    // `T-05.9` (plan `05` DoD 7): the first `setData` is drawn here.
    recordHistoryPageDrawn();

    const timeScale = chart.timeScale();
    // "aplica" — the axis-owned initial framing, not `fitContent()`, held across the library's
    // deferred frame (`T-05-FIX`: `setVisibleLogicalRange` notifies on the NEXT frame).
    const releaseMountGuard = store.guard.holdApplying();
    timeScale.setVisibleLogicalRange(store.initialLogicalRange);
    // `paineis-de-fluxo` `T-05.1` (DoD 1) — the width the library gives ONE bar, published beside
    // the visible range so the e2e reads an exact fact (`timeScale().options().barSpacing`), not a
    // pixel estimate. Refreshed on every range change: zoom and the initial framing both move it.
    const publishBarSpacing = () => {
      container.dataset.barSpacingPx = String(timeScale.options().barSpacing);
    };
    const mountGuardFrame = requestAnimationFrame(() => {
      releaseMountGuard();
      publishBarSpacing();
    });
    container.dataset.visibleLogicalFrom = String(store.initialLogicalRange.from);
    container.dataset.visibleLogicalTo = String(store.initialLogicalRange.to);
    container.dataset.axisSyncWriteCount = "0";
    // "assina": with `panelCount = 1` the dispatcher never calls this (the only panel is always
    // the origin) — kept so a regression that writes into the origin shows up in the counter.
    const unregister = store.registerPanel(SINGLE_CHART_PANEL_INDEX, (logical) => {
      timeScale.setVisibleLogicalRange(logical);
      container.dataset.visibleLogicalFrom = String(logical.from);
      container.dataset.visibleLogicalTo = String(logical.to);
      container.dataset.axisSyncWriteCount = String(Number(container.dataset.axisSyncWriteCount ?? "0") + 1);
    });
    // "despacha": every range change of the one time scale is folded into the registered range.
    const handleRangeChange = (range: LibraryLogicalRange | null) => {
      if (range === null) {
        return;
      }
      container.dataset.visibleLogicalFrom = String(range.from);
      container.dataset.visibleLogicalTo = String(range.to);
      publishBarSpacing();
      axisSyncRef.current.notifyPanelRangeChanged(SINGLE_CHART_PANEL_INDEX, range);
    };
    timeScale.subscribeVisibleLogicalRangeChange(handleRangeChange);
    // `T-01.7` (`CA-3′`) — ONE crosshair subscription for the ONE chart: `param.logical` reaches the
    // legend of EVERY pane, whichever pane the pointer is over (`pane-legend.ts`). There is no filter
    // by the pane the event came from; that filter is `CA-3′`'s named mutation.
    const crosshairStore = registrar.crosshairStore;
    const handleCrosshairMove = crosshairMoveHandler(crosshairStore);
    chart.subscribeCrosshairMove(handleCrosshairMove);
    // The gesture window the pager's deferred right-edge cut waits on (`holdRightEdgeCap`).
    const handlePointerDown = () => onGestureChangeRef.current(true);
    const handlePointerUp = () => onGestureChangeRef.current(false);
    container.addEventListener("pointerdown", handlePointerDown, { capture: true });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    // `W1-CODE-REVIEW-r2` P-1: a gesture that loses the window (alt-tab mid-drag) delivers neither
    // `pointerup` nor `pointercancel`, and the held cap would let the window grow a page at a time
    // until the next click. Losing focus ends the gesture too.
    window.addEventListener("blur", handlePointerUp);
    const measureFrame = requestAnimationFrame(() => {
      for (const paneIndex of paneIndices) {
        bindings.get(paneIndex)?.current.measure?.(chart, paneIndex);
      }
    });
    // `T-01.6` — the anchors of the per-pane layers, once the panes' DOM exists (host docstring,
    // item 2). A cancelled mount stops asking.
    let anchorFrame = 0;
    let anchorFrames = 0;
    const acquireAnchors = () => {
      anchorFrames += 1;
      const anchors = chart.panes().map((pane) => paneLayerAnchorOf(pane.getHTMLElement()));
      if (anchors.some((anchor) => anchor === null) && anchorFrames < PANE_ANCHOR_MAX_FRAMES) {
        anchorFrame = requestAnimationFrame(acquireAnchors);
        return;
      }
      hideChartGraphicsFromAssistiveTech(container);
      container.dataset.paneLayers = anchors.every((anchor) => anchor !== null) ? "anchored" : "unanchored";
      container.dataset.paneAnchorFrames = String(anchorFrames);
      setPaneAnchors(anchors);
    };
    anchorFrame = requestAnimationFrame(acquireAnchors);
    return () => {
      cancelAnimationFrame(anchorFrame);
      cancelAnimationFrame(measureFrame);
      cancelAnimationFrame(mountGuardFrame);
      releaseMountGuard();
      container.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("blur", handlePointerUp);
      timeScale.unsubscribeVisibleLogicalRangeChange(handleRangeChange);
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      crosshairStore.publish(undefined);
      unregister();
      chartStateRef.current = null;
      setPaneAnchors([]);
      chart.remove();
    };
  }, [registrar]);

  // ── LAYOUT (`T-01.6`): once the layers are portaled in, every declared scale gets the margins
  // `charts::paneScaleMargins` derives from its base, the pane's height and its legend's MEASURED
  // bottom — and again whenever a legend changes height. What was applied is read back from the
  // library and published on the layer root, so the e2e compares the render, not this code.
  useEffect(() => {
    const state = chartStateRef.current;
    if (state === null || paneAnchors.length === 0) {
      return;
    }
    const layoutPaneScales = () => {
      const panes = state.chart.panes();
      for (const [paneIndex, declared] of state.scales) {
        const pane = panes[paneIndex];
        const anchor = paneAnchors[paneIndex] ?? null;
        if (pane === undefined || anchor === null) {
          continue;
        }
        const paneHeightPx = pane.getHeight();
        const legendBottom = legendBottomPx(anchor);
        let reserveKind = "none";
        let reservedTopPx: number | null = null;
        let paneFacts: Readonly<Record<string, string>> = {};
        // `T-04.2` — a pane that lays out its own scales (the fused liquidation pane).
        const ownBinding = registrar.bindings.get(paneIndex)?.current;
        if (ownBinding?.layout !== undefined && state.handles.has(paneIndex)) {
          const report = ownBinding.layout(state.handles.get(paneIndex), { paneHeightPx, legendBottomPx: legendBottom });
          reserveKind = report.reserveKind;
          reservedTopPx = report.reservedTopPx;
          paneFacts = report.facts;
          if (report.refeed) {
            // The mark values moved with the layout: this pane's feeds again (the carrier holds the grid).
            feedSeries(paneSeriesFeeds(ownBinding.apply(state.handles.get(paneIndex)), state.dense));
          }
        }
        for (const { binding, base } of declared) {
          const result = paneScaleMargins(base, binding, { paneHeightPx, legendBottomPx: legendBottom });
          if (result.kind === "unmeasured") {
            reserveKind = "unmeasured";
            continue;
          }
          binding.series.priceScale().applyOptions({ scaleMargins: result.margins });
          if (binding.belowLegend) {
            reserveKind = result.kind === "overflow" ? "overflow" : reserveKind === "none" ? "margins" : reserveKind;
            const appliedTopPx = binding.series.priceScale().options().scaleMargins.top * paneHeightPx;
            reservedTopPx = reservedTopPx === null ? appliedTopPx : Math.min(reservedTopPx, appliedTopPx);
          }
        }
        // The layer ROOT is the legend's parent by construction (`PaneLegend` is always its direct
        // child), so the facts land on the element that carries the pane's `data-testid`.
        const root = anchor.querySelector<HTMLElement>("[data-pane-legend]")?.parentElement ?? null;
        if (root !== null) {
          root.dataset.paneHeightPx = String(Math.round(paneHeightPx * 100) / 100);
          root.dataset.legendBottomPx = legendBottom === null ? "" : String(Math.round(legendBottom * 100) / 100);
          root.dataset.reservedScaleTopPx = reservedTopPx === null ? "" : String(Math.round(reservedTopPx * 100) / 100);
          root.dataset.legendReserve = reserveKind;
          // `T-01.11-FIX` (`MF-1`) — the mode of the pane's `right` scale, READ BACK from the
          // library: a pane that inherits a sibling's logarithmic mode shows here, not only in pixels.
          root.dataset.rightScaleMode =
            state.chart.priceScale("right", paneIndex).options().mode === PriceScaleMode.Logarithmic ? "logarithmic" : "normal";
          for (const [name, value] of Object.entries(paneFacts)) {
            root.dataset[name] = value;
          }
        }
      }
    };
    layoutPaneScales();
    const observer = new ResizeObserver(() => layoutPaneScales());
    for (const anchor of paneAnchors) {
      const legend = anchor?.querySelector("[data-pane-legend]") ?? null;
      if (legend !== null) {
        observer.observe(legend);
      }
    }
    return () => observer.disconnect();
  }, [paneAnchors]);

  // ── PAGE: new data on the SAME chart. Skipped on the commit that mounted (the mount effect
  // already applied that data on that axis).
  useEffect(() => {
    const state = chartStateRef.current;
    const container = registrar.surfaceRef.current;
    if (state === null || container === null || appliedAxisRef.current === null) {
      return;
    }
    if (appliedDataVersionRef.current === dataVersion) {
      // The commit that mounted: the mount effect already applied exactly this data.
      return;
    }
    appliedDataVersionRef.current = dataVersion;
    const previousAxis = appliedAxisRef.current;
    const store = axisSyncRef.current;
    const bindings = registrar.bindings;
    const releasePageGuard = store.guard.holdApplying();
    const isPage = axis.startMs !== previousAxis.startMs;
    if (isPage) {
      // `F-C` (`handoff/T-01.10-desenho.md` §4) — the instrument's negative control, off unless the
      // URL asks for it; OUTSIDE the timed loop, so `data-page-apply-ms` stays the apply alone.
      busyWait(state.busyMs);
    }
    // `T-01.10` (§3 item 6) — the page application, timed: the carrier with the new grid FIRST, then
    // every pane's feeds as plot items only (`ADR-044/D2′`).
    const applyStartMs = performance.now();
    feedSeries(
      hostSeriesFeeds(
        state.carrier,
        axis,
        [...state.handles].flatMap(([paneIndex, handles]) => bindings.get(paneIndex)?.current.apply(handles) ?? []),
        state.dense,
      ),
    );
    const applyMs = performance.now() - applyStartMs;
    store.rebase(axis);
    appliedAxisRef.current = axis;
    if (isPage) {
      // A PAGE (the left edge moved): its bars are drawn now — `T-05.9`'s "pixel" instant. The
      // deferred right-edge cut alone is not a page and is not recorded, so `requestedMs[i]`,
      // `drawnMs[i]` and `applyMs[i]` stay paired one to one.
      container.dataset.pageApplyMs = applyMs.toFixed(2);
      recordHistoryPageApplied(applyMs);
      recordHistoryPageDrawn();
    }
    const previousEndMs = previousAxis.startMs + previousAxis.slotCount * previousAxis.stepMs;
    const nextEndMs = axis.startMs + axis.slotCount * axis.stepMs;
    if (nextEndMs !== previousEndMs) {
      // The right edge moved — only the deferred cap does that, and never inside a drag. The view
      // goes back onto the REGISTERED range (milliseconds, current), read through the new grid.
      const logical = toLogicalRange(store.currentRange, axis);
      state.chart.timeScale().setVisibleLogicalRange(logical);
      container.dataset.visibleLogicalFrom = String(logical.from);
      container.dataset.visibleLogicalTo = String(logical.to);
    }
    const releaseFrame = requestAnimationFrame(() => {
      releasePageGuard();
      for (const paneIndex of state.handles.keys()) {
        bindings.get(paneIndex)?.current.measure?.(state.chart, paneIndex);
      }
    });
    return () => {
      cancelAnimationFrame(releaseFrame);
      releasePageGuard();
    };
  }, [registrar, axis, dataVersion]);

  return (
    <ChartHostContext.Provider value={registrar}>
      <PaneAnchorsContext.Provider value={paneAnchors}>
        <CrosshairSlotContext.Provider value={registrar.crosshairStore}>
          <ChartHostSurface priceSlots={priceSlots} />
          {children}
        </CrosshairSlotContext.Provider>
      </PaneAnchorsContext.Provider>
    </ChartHostContext.Provider>
  );
}

/** `T-01.5` — the element the ONE chart is created in (`ChartHostSurface`). */
const CHART_HOST_TESTID = "symbol-chart-host";
