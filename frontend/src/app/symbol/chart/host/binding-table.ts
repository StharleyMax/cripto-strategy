import type { IChartApi } from "lightweight-charts";
import type { RefObject } from "react";

import type { ScaleMargins } from "../../../../charts/index.ts";
import { F1_PANE_ORDER } from "../../pane-registry.ts";
import type { AnyIndicatorBinding, HostPlacement, HostSeriesFeed, PaneScaleBinding } from "./indicator-binding.ts";

/**
 * `estrutura-do-front` `T-02.1` (plan `02` items `2.1` and `2.3`, `SPEC-011 §4.2`, `ADR-050/D3`) — the
 * host's table of bindings, KEYED BY `instanceKey`, and the only place a binding is mounted or
 * unmounted.
 *
 * It replaces the `Map<paneIndex, binding>` the host kept until `F1`, whose unregister only deleted
 * the map entry and left the binding's series on the chart (`FRONTEND-ARCH-estudo.md` §1.2). Three
 * invariants, each pinned by `binding-table.test.ts` on a real chart:
 *
 *   1. ONE BINDING PER KEY. Registering a key already registered with ANOTHER binding unmounts the
 *      previous one before the new one mounts; the previous binding's own unregister then does
 *      nothing, because the key is no longer its.
 *   2. UNMOUNT ON UNREGISTER. While the table is attached to a chart, unregistering a key calls that
 *      binding's `unmount(chart, handles)` — after it, pane 0 holds the series it held before
 *      `mount` (`CA-11`).
 *   3. UNMOUNT ON DETACH. The host detaches the table before `chart.remove()`, and every binding
 *      still mounted is unmounted, last mounted first.
 *
 * `T-02.2` (plan `02` item `2.2`) — the `paneIndex` is DERIVED AT MOUNT, never stored at register:
 * the table hands the derivation the binding's placement AND the placements of every binding
 * registered at that moment (the ACTIVE set), so a pane's index is its place among the panes that
 * are on, whatever order they registered in (`derivePaneIndex`).
 *
 * `T-02.3` (plan `02` item `2.4`, `SPEC-011 §4.2`, `ADR-050` emenda `E-1`) — `refeed(instanceKey)` runs
 * `apply` of THAT key alone, outside a history page, and hands its feeds to the SAME function the host
 * gives the table for a late mount (`BindingTableAttachment.feedOutsidePage`), which is the host's one
 * `setData` loop. The table never calls `setData` itself.
 *
 * No React here (only the `RefObject` type): the table runs under `node --test` with a real chart, the
 * same way `price-candle.test.ts` measures the price pane.
 */

/** A declared scale and the base margins read back from the library right after `mount` (`T-01.6`). */
export interface MountedScale {
  readonly binding: PaneScaleBinding;
  readonly base: ScaleMargins;
}

/** One binding on the chart: its key, where it landed, and what its `mount` returned. */
export interface MountedBinding {
  readonly instanceKey: string;
  readonly paneIndex: number;
  /** The ref the binding was registered with: `.current` is always its LATEST render. */
  readonly binding: RefObject<AnyIndicatorBinding>;
  readonly handles: unknown;
  readonly scales: readonly MountedScale[];
}

/** What the host gives the table when the chart exists. */
export interface BindingTableAttachment {
  readonly chart: IChartApi;
  /**
   * Feeds ONE binding outside a history page — a binding mounted AFTER `attach`, or a `refeed` — through
   * the host's only `setData` loop (the carrier already holds the grid, so it is not fed again).
   */
  readonly feedOutsidePage: (feeds: readonly HostSeriesFeed[]) => void;
}

export interface BindingTable {
  /** One binding per `instanceKey` (invariant 1). Returns the unregister (invariant 2). */
  register(instanceKey: string, placement: HostPlacement, binding: RefObject<AnyIndicatorBinding>): () => void;
  /**
   * Mounts every registered binding on `attachment.chart` — by `paneIndex`, then in registration
   * order, which is the order the host mounted the panes in until `F1` — and returns them. From now
   * on a binding that registers is mounted on arrival.
   */
  attach(attachment: BindingTableAttachment): readonly MountedBinding[];
  /** Unmounts every mounted binding, last mounted first, and forgets the chart (invariant 3). */
  detach(): void;
  /** The mounted bindings, in the order they were mounted. */
  mounted(): readonly MountedBinding[];
  /**
   * `T-02.3` (`E-1`) — runs `apply` of `instanceKey` ALONE, with its latest render, and hands its feeds
   * to `feedOutsidePage`; no other binding is applied. Does nothing when the key is not mounted: before
   * `attach` the mount applies the latest render anyway, and after an unregister there is nothing to feed.
   */
  refeed(instanceKey: string): void;
}

/**
 * `T-02.2` — the order the host derives a `paneIndex` from (`ADR-050/D3`, `SPEC-011 §4.2`): the
 * core's own pane, always `0`, then the pane indicators top to bottom.
 */
export interface PaneOrder {
  /** The price pane: the core's, never switched off, and the pane every overlay draws on. */
  readonly corePaneId: string;
  /** The pane indicators in catalog order. Until the catalog arrives (`F9`), `F1_PANE_ORDER`'s. */
  readonly indicatorPaneIds: readonly string[];
}

/** `T-02.2` — `F1_PANE_ORDER` read as a `PaneOrder`: price is the core, the other four are panes. */
export const F1_HOST_PANE_ORDER: PaneOrder = {
  corePaneId: "price",
  indicatorPaneIds: F1_PANE_ORDER.filter((paneId) => paneId !== "price"),
};

/**
 * `T-02.2` (plan `02` item `2.2`, `ADR-050/D3`) — the `paneIndex` a placement lands on, given the
 * placements ACTIVE at mount: `0` for an overlay on the price pane and for the core's own pane;
 * otherwise `1 +` the position of `paneId` among the ACTIVE pane indicators, in `order`.
 *
 * The registration order plays no part: with every pane of `order` active this is each pane's
 * position in `order`, and a pane that is off takes no index and moves the ones below it up.
 */
export function derivePaneIndex(placement: HostPlacement, active: readonly HostPlacement[], order: PaneOrder): number {
  if (placement.kind === "overlay" || placement.paneId === order.corePaneId) {
    return 0;
  }
  if (!order.indicatorPaneIds.includes(placement.paneId)) {
    throw new Error(`pane ${placement.paneId} is not in the host's pane order`);
  }
  const activePaneIds = new Set<string>([placement.paneId]);
  for (const other of active) {
    if (other.kind === "pane") {
      activePaneIds.add(other.paneId);
    }
  }
  return 1 + order.indicatorPaneIds.filter((paneId) => activePaneIds.has(paneId)).indexOf(placement.paneId);
}

/** How the table derives a `paneIndex` at mount: the placement, and every placement active then. */
export type PaneIndexDerivation = (placement: HostPlacement, active: readonly HostPlacement[]) => number;

interface RegisteredBinding {
  readonly placement: HostPlacement;
  readonly binding: RefObject<AnyIndicatorBinding>;
}

function mountOne(
  chart: IChartApi,
  instanceKey: string,
  entry: RegisteredBinding,
  paneIndex: number,
): MountedBinding {
  const current = entry.binding.current;
  const handles = current.mount(chart, paneIndex);
  // `T-01.6` — the base margins of every declared scale, read back AFTER the binding's own `applyOptions`.
  const scales = (current.scales?.(handles) ?? []).map((binding) => {
    const margins = binding.series.priceScale().options().scaleMargins;
    return { binding, base: { top: margins.top, bottom: margins.bottom } };
  });
  return { instanceKey, paneIndex, binding: entry.binding, handles, scales };
}

export function createBindingTable(derive: PaneIndexDerivation): BindingTable {
  const registered = new Map<string, RegisteredBinding>();
  const mounted = new Map<string, MountedBinding>();
  let attachment: BindingTableAttachment | null = null;

  // `T-02.2` — read at MOUNT, over every binding registered at that moment.
  const paneIndexAtMount = (entry: RegisteredBinding): number =>
    derive(
      entry.placement,
      [...registered.values()].map(({ placement }) => placement),
    );

  const unmountKey = (instanceKey: string): void => {
    const entry = mounted.get(instanceKey);
    if (entry === undefined || attachment === null) {
      return;
    }
    mounted.delete(instanceKey);
    entry.binding.current.unmount(attachment.chart, entry.handles);
  };

  return {
    register(instanceKey, placement, binding) {
      const previous = registered.get(instanceKey);
      if (previous !== undefined && previous.binding !== binding) {
        unmountKey(instanceKey);
      }
      const entry = { placement, binding };
      registered.set(instanceKey, entry);
      if (attachment !== null && !mounted.has(instanceKey)) {
        const late = mountOne(attachment.chart, instanceKey, entry, paneIndexAtMount(entry));
        mounted.set(instanceKey, late);
        attachment.feedOutsidePage(binding.current.apply(late.handles));
      }
      return () => {
        if (registered.get(instanceKey)?.binding !== binding) {
          // Replaced by another binding under the same key: the key is not this binding's any more.
          return;
        }
        registered.delete(instanceKey);
        unmountKey(instanceKey);
      };
    },
    attach(next) {
      attachment = next;
      // Derived over the whole active set FIRST, then mounted by `paneIndex` (the sort is stable, so
      // registration order breaks ties, as the `sort((a, b) => a - b)` of `F1` did).
      const order = [...registered]
        .map(([instanceKey, entry]) => ({ instanceKey, entry, paneIndex: paneIndexAtMount(entry) }))
        .sort((a, b) => a.paneIndex - b.paneIndex);
      for (const { instanceKey, entry, paneIndex } of order) {
        mounted.set(instanceKey, mountOne(next.chart, instanceKey, entry, paneIndex));
      }
      return [...mounted.values()];
    },
    detach() {
      for (const instanceKey of [...mounted.keys()].reverse()) {
        unmountKey(instanceKey);
      }
      attachment = null;
    },
    mounted() {
      return [...mounted.values()];
    },
    refeed(instanceKey) {
      const entry = mounted.get(instanceKey);
      if (entry === undefined || attachment === null) {
        return;
      }
      attachment.feedOutsidePage(entry.binding.current.apply(entry.handles));
    },
  };
}
