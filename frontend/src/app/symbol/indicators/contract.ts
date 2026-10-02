/**
 * `estrutura-do-front` `T-00.1` (`SPEC-011 §4.1`, `§4.3`, `ADR-050/D2` + emenda `E-4`, `RF-1`) —
 * the ONE contract every indicator of `/symbol/[symbol]` implements: the panes of today and the
 * overlays of tomorrow alike.
 *
 * TYPES ONLY: no runtime value, and nothing imports it yet (the indicators move in from `F3`).
 *
 * ⛔ THIS FILE DOES NOT ENUMERATE `kind` (`E-4`, `G-B`). `IndicatorDefinition` is generic in
 * `K extends string`, and the union `IndicatorKind` is DERIVED from `INDICATOR_CATALOG` in
 * `catalog.ts` (`F9`). Adding an indicator is one folder plus one catalog line, and this file stays
 * out of the diff (`CA-7 (b)`). A literal union here would make every new `kind` edit the contract —
 * `contract.test.ts` compiles a synthetic `IndicatorDefinition<"x">` to keep that from happening.
 *
 * Dependency direction (`SPEC-011 §3`, `G-R`): this file imports the CORE (`chart/**`) and never the
 * other way. The types the core consumes (the binding, the series requirement) are the core's own,
 * and are re-exported here so an indicator reads one contract.
 */

import type { ComponentType } from "react";

import type { HostPlacement } from "../chart/host/indicator-binding.ts";
import type { DeriveContext, SeriesRequirement, SeriesRowsBySlot } from "../chart/history/series-requirement.ts";

export type {
  AnyIndicatorBinding,
  HostPlacement,
  HostSeriesFeed,
  IndicatorBinding,
  IndicatorRegistrar,
  PaneLayoutReport,
  PaneScaleBinding,
} from "../chart/host/indicator-binding.ts";
export type {
  DeriveContext,
  HistoryWindow,
  SeriesRequirement,
  SeriesRowsBySlot,
} from "../chart/history/series-requirement.ts";

/** `SPEC-011 §4.3` — the band an overlay asks to keep for itself at the bottom of the price pane. */
export interface OverlayBandRequest {
  /**
   * Share of pane 0's height, in `(0, 1)`. Volume asks for what the candle reserves today (22%,
   * `ADR-050/D2`). `chart/price/` sums the requests of the ACTIVE overlays (empty sum = 0), and the
   * scale margin itself is geometry, computed by `charts` (`paneScaleMargins`, `ADR-003/FR-2`).
   */
  readonly bottomFraction: number;
}

/** An indicator that owns one native pane, below the price pane. */
export interface PanePlacement extends Extract<HostPlacement, { readonly kind: "pane" }> {
  /** The pane's stretch factor in the stack. */
  readonly stretch: number;
}

/** An indicator that draws over the price pane (volume today; sma, ema and smc next). */
export interface OverlayPlacement extends Extract<HostPlacement, { readonly kind: "overlay" }> {
  readonly band?: OverlayBandRequest;
}

/** WHERE an indicator draws. Every `Placement` is a `HostPlacement`: the host reads only that part. */
export type Placement = PanePlacement | OverlayPlacement;

/** The parameters of a builtin: none. Its `parseParams` accepts only `{}`. */
export type EmptyParams = Readonly<Record<string, never>>;

/** Why `parseParams` refused its input. */
export interface ParamsError {
  readonly reason: string;
}

/** The result of `parseParams`: the parameters, or why they were refused. Never a throw. */
export type ParamsParseResult<Params> =
  | { readonly ok: true; readonly params: Params }
  | { readonly ok: false; readonly error: ParamsError };

/** The data of an indicator, as its `View` receives it. */
export type IndicatorDataState<Data> =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly data: Data }
  | { readonly status: "error"; readonly reason: string };

/**
 * WHAT an indicator needs (`ADR-050/D2`).
 *
 * `series-history`: the core resolves, fetches and pages `series` (SSR and pager), and calls the ONE
 * `derive`, which is PURE, on both sides (`RN-7`). `indicator-endpoint`: the indicator fetches on its
 * own, outside the pager (`ADR-048/D5`), and asks the host to `refeed` it (`E-1`).
 */
export type DataSource<Params, Data> =
  | {
      readonly from: "series-history";
      readonly series: readonly SeriesRequirement[];
      readonly derive: (rows: SeriesRowsBySlot, ctx: DeriveContext, params: Params) => Data;
    }
  | {
      readonly from: "indicator-endpoint";
      readonly useData: (ctx: DeriveContext, params: Params) => IndicatorDataState<Data>;
    };

/** What the host hands to an indicator's `View`. */
export interface IndicatorViewProps<Params, Data> {
  /** The registrar key of this instance; a builtin's is its own `kind`. */
  readonly instanceKey: string;
  readonly params: Params;
  readonly data: IndicatorDataState<Data>;
}

/**
 * One indicator (`SPEC-011 §4.1`). The field names are final from `F0` on.
 *
 * `K` is the indicator's `kind` literal: unique in the catalog, and a `data-testid`/e2e key (so
 * `long_short` keeps its `_`). It is a PARAMETER, not a member of a union declared here (`E-4`).
 */
export interface IndicatorDefinition<K extends string, Params = EmptyParams, Data = unknown> {
  readonly kind: K;
  /** The five builtins are `indicator`; smc is the first `strategy`. */
  readonly category: "indicator" | "strategy";
  /** The five builtins are `single` (`RN-3`). */
  readonly cardinality: "single" | "multi";
  readonly defaultParams: Params;
  /** Never throws (`SPEC-011 §4.1`). A builtin accepts only `{}`. */
  readonly parseParams: (raw: unknown) => ParamsParseResult<Params>;
  /** A builtin's `paneId` is today's `PaneId`. */
  readonly placement: Placement;
  readonly data: DataSource<Params, Data>;
  /**
   * Declares its series to the host through the binding (`chart/host/indicator-binding.ts`), and
   * renders its layer or its legend row. Absence is drawn by the core marks (`chart/marks/*`),
   * never by local copy.
   */
  readonly View: ComponentType<IndicatorViewProps<Params, Data>>;
}
