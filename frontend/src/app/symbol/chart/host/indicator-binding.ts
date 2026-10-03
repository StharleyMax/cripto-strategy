/**
 * `estrutura-do-front` `T-00.1` (`SPEC-011 §4.2`, `ADR-050/D3` + emenda `E-1`/`E-4`, `G-R`) — the
 * types the chart host CONSUMES from an indicator, declared by the host itself.
 *
 * TYPES ONLY: this file has no runtime value. It was born in `F0` so the contract
 * (`indicators/contract.ts`) could reuse it; the host moved here in `F1` and, since `T-02.1`, is
 * declared against it — `registrar.ts` no longer carries a copy of these types.
 *
 * Why the core owns these types and not `indicators/contract.ts`: the core (`chart/**`) is FORBIDDEN
 * from importing `indicators/**` (`SPEC-011 §5.3`, P2) — contract and catalog included. The
 * registrar is core, so the shape it accepts has to live in the core, and the contract re-uses it
 * (`G-R`). The direction of the dependency is `indicators -> chart`, never the other way.
 *
 * The shape is `F1`'s `HostedPaneBinding`, widened by `ADR-050/D3`:
 *   - keyed by a STRING `instanceKey` (until `T-02.1`: a numeric `paneIndex`) — the builtins use their `kind`;
 *   - `unmount` is MANDATORY — after it, pane 0 holds the same number of series it held before
 *     `mount` (`CA-11`);
 *   - `refeed(instanceKey)` is the HOST's, not the binding's (`E-1`): the `indicator-endpoint` path.
 * `mount`, `apply`, `measure`, `scales` and `layout` keep today's meaning.
 */

import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts";
import type { RefObject } from "react";

import type { PaneScaleMeasure } from "../../../../charts/index.ts";
import type { SeriesFeed } from "../../host-series-feed.ts";

/** A series of the host's chart. */
export type HostSeries = ISeriesApi<SeriesType>;

/** One `setData` the host will make on one of its series (`T-01.10`: the host owns the only loop). */
export type HostSeriesFeed = SeriesFeed<HostSeries>;

/** `T-01.6` — one price scale of a pane and its role in the stack. */
export interface PaneScaleBinding {
  readonly series: HostSeries;
  /** Draws near the top of the pane, so it is compressed below the legend. */
  readonly belowLegend: boolean;
  /** Anchored at the pane's bottom, so it keeps clear of the separator (`C-6`). */
  readonly clearSeparator: boolean;
  /** With `belowLegend`, only the ceiling descends (`charts::PaneScaleRole.keepFloor`). */
  readonly keepFloor?: boolean;
}

/** `T-04.2` — what a pane's own `layout` reports to the host. */
export interface PaneLayoutReport {
  readonly reserveKind: string;
  readonly reservedTopPx: number | null;
  /** The pane's feeds must be applied again (its mark values moved with the layout). */
  readonly refeed: boolean;
  readonly facts: Readonly<Record<string, string>>;
}

/**
 * WHERE a binding lands, as far as the host needs to know to derive its `paneIndex`: `0` for an
 * overlay on the price pane; otherwise `1 +` the position of `paneId` among the ACTIVE pane
 * indicators, in catalog order (`ADR-050/D3`). The contract's `Placement` extends each arm with
 * what only the indicator side reads (`stretch`, the overlay band request).
 */
export type HostPlacement =
  | { readonly kind: "pane"; readonly paneId: string }
  | { readonly kind: "overlay"; readonly on: "price" };

/** What an indicator declares to the single chart host (`ADR-050/D3`). */
export interface IndicatorBinding<Handles> {
  /** Runs once the chart exists, and returns the binding's series handles. */
  readonly mount: (chart: IChartApi, paneIndex: number) => Handles;
  /** RETURNS the feeds of the current render; never calls `setData` itself (`T-01.10`). */
  readonly apply: (handles: Handles) => readonly HostSeriesFeed[];
  /** MANDATORY: removes every series and primitive `mount` created (`CA-11`). */
  readonly unmount: (chart: IChartApi, handles: Handles) => void;
  /** Reads geometry back out of the library, one frame after every apply. */
  readonly measure?: (chart: IChartApi, paneIndex: number) => void;
  /** `T-01.6` — the binding's scales and their role in the stack. */
  readonly scales?: (handles: Handles) => readonly PaneScaleBinding[];
  /** `T-04.2` — a pane whose scales do not fit the one-scale-at-a-time rule lays them out itself. */
  readonly layout?: (handles: Handles, measure: PaneScaleMeasure) => PaneLayoutReport;
}

/** A binding with its handles erased — what the registrar stores. */
export type AnyIndicatorBinding = IndicatorBinding<unknown>;

/** The indicator-facing half of the host's registrar (`SPEC-011 §4.2`). */
export interface IndicatorRegistrar {
  /**
   * One binding per `instanceKey`: registering a key already registered replaces the previous
   * binding and unmounts it. Returns the unregister.
   */
  register(instanceKey: string, placement: HostPlacement, binding: RefObject<AnyIndicatorBinding>): () => void;
  /**
   * `E-1` — asks the host to run `apply` for `instanceKey` outside a history page: the
   * `indicator-endpoint` path (`ADR-048/D3`, `D5`). No builtin uses it.
   */
  refeed(instanceKey: string): void;
}
