import { createContext, useContext, useEffect, useRef, type RefObject } from "react";
import { F1_PANE_ORDER, type PaneId } from "../../pane-registry.ts";
import type { CrosshairSlotStore } from "../legend/pane-legend.ts";
import { derivePaneIndex, F1_HOST_PANE_ORDER, type BindingTable } from "./binding-table.ts";
import type { AnyIndicatorBinding, HostPlacement, IndicatorBinding, IndicatorRegistrar } from "./indicator-binding.ts";

/**
 * `T-02.1` — the pane-facing half of the registrar. The binding shape is `indicator-binding.ts`'s
 * (`IndicatorBinding`, `unmount` mandatory) and the host keys it by `instanceKey`; until `F1` this
 * file declared its own copy (`HostedPaneBinding`, keyed by `paneIndex`, no `unmount`).
 *
 * `T-02.3` — the whole `IndicatorRegistrar`, `refeed` included (`E-1`): the host runs `apply` of that
 * key alone, outside a history page, through its one `setData` loop (`binding-table.ts::refeed`).
 * No builtin calls it; it is the `indicator-endpoint` path.
 */
export interface PaneRegistrar extends IndicatorRegistrar {
  readonly surfaceRef: RefObject<HTMLDivElement | null>;
  /** `T-01.7` — the slot under the crosshair, one per host (`pane-legend.ts`). Lives on the
   * registrar so the mount effect keeps its single, stable dependency. */
  readonly crosshairStore: CrosshairSlotStore;
}

/** The host's own view of the registrar: the same object, plus the table it mounts from. */
export interface HostRegistrar extends PaneRegistrar {
  readonly table: BindingTable;
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
 * `T-02.2` — the derivation the host hands its binding table: `binding-table.ts::derivePaneIndex`
 * over `F1_PANE_ORDER` (price the core's pane, at `0`), read at MOUNT over the ACTIVE set. With the
 * five panes on, it is each pane's position in `F1_PANE_ORDER` — today's index, unchanged.
 */
export function paneIndexOfPlacement(placement: HostPlacement, active: readonly HostPlacement[]): number {
  return derivePaneIndex(placement, active, F1_HOST_PANE_ORDER);
}

/**
 * Declares one pane to the single chart host. Registration happens in the pane's own effect,
 * which React runs BEFORE the host's (a child's effects run before its parent's), so by the time
 * the host creates the chart every pane of the first render is registered.
 */
export function useHostedPane<Handles>(paneId: PaneId, binding: IndicatorBinding<Handles>): void {
  const registrar = useChartHost();
  const bindingRef = useRef(binding as AnyIndicatorBinding);
  bindingRef.current = binding as AnyIndicatorBinding;
  // `T-02.1` — the key of a builtin is its own kind, which for the five panes is the `paneId`.
  useEffect(() => registrar.register(paneId, { kind: "pane", paneId }, bindingRef), [registrar, paneId]);
}

/** The slot under the crosshair, published by the host's ONE `subscribeCrosshairMove`. */
export const CrosshairSlotContext = createContext<CrosshairSlotStore | null>(null);
