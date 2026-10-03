import { createContext, useContext, useEffect, useRef, type RefObject } from "react";
import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts";
import type { PaneScaleMeasure } from "../../../../charts/index.ts";
import type { SeriesFeed } from "../../host-series-feed.ts";
import { F1_PANE_ORDER, type PaneId } from "../../pane-registry.ts";
import type { CrosshairSlotStore } from "../legend/pane-legend.ts";

/** `T-01.6` — one price scale of a pane and its role in the stack. The host reads its BASE margins
 * from the library once, right after `mount` (so the pane's own `applyOptions` is the base), and
 * from then on only ever writes the margins `charts::paneScaleMargins` derives from that base. Two
 * series sharing one scale need to be declared once. */
export interface PaneScaleBinding {
  readonly series: ISeriesApi<SeriesType>;
  /** Draws near the top of the pane ⇒ is compressed below the legend. */
  readonly belowLegend: boolean;
  /** Anchored at the pane's bottom ⇒ keeps `SEPARATOR_CLEARANCE_PX` off the separator (`C-6`). */
  readonly clearSeparator: boolean;
  /** With `belowLegend`, only the ceiling descends: the floor stays where the base put it
   * (`charts::PaneScaleRole.keepFloor`). */
  readonly keepFloor?: boolean;
}

/** A series of the host's chart, and one `setData` the host will make on it (`T-01.10`). */
export type HostSeries = ISeriesApi<SeriesType>;
export type HostSeriesFeed = SeriesFeed<HostSeries>;

/** What a pane declares to the host. `mount` runs ONCE, when the chart exists, and returns the
 * pane's series handles; `apply` RETURNS the lossless feeds of the CURRENT render for them (the
 * host keeps the latest binding, so `apply` never reads stale props) — since `T-01.10` it no longer
 * calls `setData`: the host does, after its grid carrier, through `plotItemsOnly`
 * (`host-series-feed.ts`, `ADR-044/D2′`); `measure`, optional, reads geometry back out of the
 * library one frame after every apply; `scales` (`T-01.6`) names the pane's scales and their role
 * in the stack. */
export interface HostedPaneBinding<Handles> {
  readonly mount: (chart: IChartApi, paneIndex: number) => Handles;
  readonly apply: (handles: Handles) => readonly HostSeriesFeed[];
  readonly measure?: (chart: IChartApi, paneIndex: number) => void;
  readonly scales?: (handles: Handles) => readonly PaneScaleBinding[];
  /** `T-04.2` — a pane whose scales do not fit `paneScaleMargins`' one-scale-at-a-time rule (the fused
   * liquidation pane: four scales on ONE zero line) lays them out itself, from the same measure. */
  readonly layout?: (handles: Handles, measure: PaneScaleMeasure) => PaneLayoutReport;
}

/** What a pane's own `layout` tells the host: the same reserve facts the generic path publishes,
 * whether the pane's feeds must be re-applied (its mark values moved with the layout), and extra
 * facts for the layer root. */
export interface PaneLayoutReport {
  readonly reserveKind: string;
  readonly reservedTopPx: number | null;
  readonly refeed: boolean;
  readonly facts: Readonly<Record<string, string>>;
}

export type AnyPaneBinding = HostedPaneBinding<unknown>;

export interface PaneRegistrar {
  register(paneIndex: number, binding: RefObject<AnyPaneBinding>): () => void;
  readonly surfaceRef: RefObject<HTMLDivElement | null>;
  /** `T-01.7` — the slot under the crosshair, one per host (`pane-legend.ts`). Lives on the
   * registrar so the mount effect keeps its single, stable dependency. */
  readonly crosshairStore: CrosshairSlotStore;
}

/** The host's own view of the registrar: the same object, plus the bindings it iterates. */
export interface HostRegistrar extends PaneRegistrar {
  readonly bindings: Map<number, RefObject<AnyPaneBinding>>;
}

export const ChartHostContext = createContext<PaneRegistrar | null>(null);

/** `T-01.6` — the element each pane's layer is portaled into, by `paneIndex`. Empty until the
 * panes are laid out (see the host docstring, item 2). */
export const PaneAnchorsContext = createContext<readonly (HTMLElement | null)[]>([]);

export function useChartHost(): PaneRegistrar {
  const registrar = useContext(ChartHostContext);
  if (registrar === null) {
    throw new Error("useChartHost must be called within a SymbolChartHost");
  }
  return registrar;
}

/** The `paneIndex` of `paneId` — its position in the pane registry's order. */
export function paneIndexOfId(paneId: PaneId): number {
  const index = F1_PANE_ORDER.indexOf(paneId);
  if (index < 0) {
    throw new Error(`pane ${paneId} is not in F1_PANE_ORDER`);
  }
  return index;
}

/**
 * Declares one pane to the single chart host. Registration happens in the pane's own effect,
 * which React runs BEFORE the host's (a child's effects run before its parent's), so by the time
 * the host creates the chart every pane of the first render is registered.
 */
export function useHostedPane<Handles>(paneId: PaneId, binding: HostedPaneBinding<Handles>): void {
  const registrar = useChartHost();
  const bindingRef = useRef(binding as AnyPaneBinding);
  bindingRef.current = binding as AnyPaneBinding;
  useEffect(() => registrar.register(paneIndexOfId(paneId), bindingRef), [registrar, paneId]);
}

/** The slot under the crosshair, published by the host's ONE `subscribeCrosshairMove`. */
export const CrosshairSlotContext = createContext<CrosshairSlotStore | null>(null);
