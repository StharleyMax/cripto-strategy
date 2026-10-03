import { createContext, useContext, useEffect, useRef, type RefObject } from "react";
import { F1_PANE_ORDER, type PaneId } from "../../pane-registry.ts";
import type { CrosshairSlotStore } from "../legend/pane-legend.ts";
import type { BindingTable } from "./binding-table.ts";
import type { AnyIndicatorBinding, HostPlacement, IndicatorBinding, IndicatorRegistrar } from "./indicator-binding.ts";

/**
 * `T-02.1` — the pane-facing half of the registrar. The binding shape is `indicator-binding.ts`'s
 * (`IndicatorBinding`, `unmount` mandatory) and the host keys it by `instanceKey`; until `F1` this
 * file declared its own copy (`HostedPaneBinding`, keyed by `paneIndex`, no `unmount`). Only
 * `register` is taken from `IndicatorRegistrar` here: `refeed` arrives with `T-02.3`.
 */
export interface PaneRegistrar extends Pick<IndicatorRegistrar, "register"> {
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
 * `T-02.1` — the `paneIndex` a placement lands on, as the host resolves it until `T-02.2`: `0` for an
 * overlay on the price pane, and the pane registry's position for a pane — today's index, unchanged
 * for the five panes. `T-02.2` derives it from the ACTIVE set instead.
 */
export function paneIndexOfPlacement(placement: HostPlacement): number {
  if (placement.kind === "overlay") {
    return 0;
  }
  const paneId = F1_PANE_ORDER.find((id) => id === placement.paneId);
  if (paneId === undefined) {
    throw new Error(`pane ${placement.paneId} is not in F1_PANE_ORDER`);
  }
  return paneIndexOfId(paneId);
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
