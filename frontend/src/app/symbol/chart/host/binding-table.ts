import type { IChartApi } from "lightweight-charts";
import type { RefObject } from "react";

import type { ScaleMargins } from "../../../../charts/index.ts";
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
 * The `paneIndex` comes from the `resolvePaneIndex` the host passes, read at REGISTER time. Deriving
 * it from the ACTIVE set at mount is `T-02.2`'s, and `refeed(instanceKey)` is `T-02.3`'s.
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
  /** Feeds a binding mounted AFTER `attach` (the carrier already holds the grid). */
  readonly feedLateMount: (feeds: readonly HostSeriesFeed[]) => void;
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
}

interface RegisteredBinding {
  readonly paneIndex: number;
  readonly binding: RefObject<AnyIndicatorBinding>;
}

function mountOne(chart: IChartApi, instanceKey: string, entry: RegisteredBinding): MountedBinding {
  const current = entry.binding.current;
  const handles = current.mount(chart, entry.paneIndex);
  // `T-01.6` — the base margins of every declared scale, read back AFTER the binding's own `applyOptions`.
  const scales = (current.scales?.(handles) ?? []).map((binding) => {
    const margins = binding.series.priceScale().options().scaleMargins;
    return { binding, base: { top: margins.top, bottom: margins.bottom } };
  });
  return { instanceKey, paneIndex: entry.paneIndex, binding: entry.binding, handles, scales };
}

export function createBindingTable(resolvePaneIndex: (placement: HostPlacement) => number): BindingTable {
  const registered = new Map<string, RegisteredBinding>();
  const mounted = new Map<string, MountedBinding>();
  let attachment: BindingTableAttachment | null = null;

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
      const entry = { paneIndex: resolvePaneIndex(placement), binding };
      registered.set(instanceKey, entry);
      if (attachment !== null && !mounted.has(instanceKey)) {
        const late = mountOne(attachment.chart, instanceKey, entry);
        mounted.set(instanceKey, late);
        attachment.feedLateMount(binding.current.apply(late.handles));
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
      const order = [...registered].sort(([, a], [, b]) => a.paneIndex - b.paneIndex);
      for (const [instanceKey, entry] of order) {
        mounted.set(instanceKey, mountOne(next.chart, instanceKey, entry));
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
  };
}
