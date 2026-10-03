/**
 * `estrutura-do-front` `T-03.2` (plan `03` items `3.2` and `3.4`, `SPEC-011 §3`, `§6.1`, `RF-4`,
 * `RF-8`) — `INDICATOR_CATALOG` is born here, as a TABLE: one entry per indicator of
 * `/symbol/[symbol]`, with
 *
 *   - `series`: the catalog series the indicator asks for, by slot, each with the predicate that
 *     used to be written inline in `[symbol]/page.tsx`. The predicates themselves are the ones
 *     that already existed (`view-model.ts`), wrapped, not rewritten; the only one that MOVED is
 *     volume's, whose metric constant lived in `page.tsx`;
 *   - `derive`: WHERE the indicator is derived TODAY. It is a pointer, not a function, because
 *     today there is no one function to point at: the SSR derives inline in `SymbolPage`, and the
 *     pager derives in `panel-assembly.ts::assembleHistoryPage`, for all five at once. Unifying the
 *     two into ONE pure `derive` per indicator is `F4`–`F8`'s, and each of those slices replaces its
 *     entry here with `./<kind>/definition` (`SPEC-011 §7.3`, `RN-7`).
 *
 * Who reads it today: `[symbol]/page.tsx` (the six indicator series). The pager and
 * `panel-assembly.ts` receive it BY PARAMETER from `SymbolClient.tsx` in `T-03.3` — no file of
 * `chart/**` imports this one (P2, `SPEC-011 §5.3`).
 *
 * ⛔ The price is NOT an indicator: its four `klines_ohlc` series and the `klines_last` live-stream
 * row stay resolved in `page.tsx` (core, `chart/price/` from `F8`). The `10` history fetches of a
 * page are those four plus the six series below.
 *
 * Order (`SPEC-011 §6.1`): the panes in `F1_PANE_ORDER` order without `price` — `liquidation`,
 * `oi`, `long_short`, `cvd` —, with `volume`, the one overlay, first. `F1_PANE_ORDER` stays the
 * source of truth for the panes until `F9` replaces it with this array.
 *
 * ⚠️ Known divergence, carried and NOT unified here (`gates/T-03.1-build.md` §3): `panels.cvd` and
 * `panels.oi` carry `missingDays`/`coveredDays` filled by the SSR (`daysWithPresence`) and `[]` by
 * the pager. Nothing renders them. The table names `panels.cvd`/`panels.oi` as facts of both sides
 * and does not pick one: the single `derive` of `F4` (CVD) and `F5` (OI) is where one of the two
 * has to win, and that choice is the `Q-8` question of the T-03.1 report.
 */

import type { SeriesKey } from "../../../features/s3-inspector/series-catalog.ts";
import type { S2Panels } from "../../../charts/index.ts";
import type { SeriesRequirement } from "../chart/history/series-requirement.ts";
import type { HistoryPageAssembly } from "../panel-assembly.ts";
import type { SymbolClientProps } from "../SymbolClient.tsx";
import {
  keyMatchesSymbol,
  matchesBinanceOpenInterest,
  matchesCountLongShortRatio,
  matchesKlineTakerBuyCvd,
  matchesLiquidationCohort,
} from "../view-model.ts";

/** `T-01.7` / `SPEC-007 §4`, row M1 — the volume SUB-AXIS of the price panel (§3.6), whose
 * catalog entry `T-01.6` registered (`domain/klines_volume_catalog.py`, `metric` transcribed
 * here, not re-derived). Its `interval` is `1m` (§4.1), the grid `/series-history` serves
 * natively, so this request asks for exactly the same `interval` the other three do while the
 * series behind it is the only one of the four with no ladder. Moved from `[symbol]/page.tsx`
 * (`T-03.2`): one term, and today the only `klines_volume` row per instrument. */
export const VOLUME_METRIC = "klines_volume";

/** The panels of `buildS2Panels` that belong to ONE indicator (the price panel is the core's). */
type IndicatorPanel = Exclude<keyof S2Panels, "symbol" | "window" | "price">;

/** A fact `[symbol]/page.tsx::SymbolPage` hands to `SymbolClient` for one indicator: a prop, or
 * one indicator panel of `panels`. */
export type SsrFact = keyof SymbolClientProps | `panels.${IndicatorPanel}`;

/** A fact `panel-assembly.ts::assembleHistoryPage` returns for one indicator: a field of the
 * assembly, or one indicator panel of `panels`. */
export type PagerFact = Exclude<keyof HistoryPageAssembly, "panels" | "priceCandles"> | `panels.${IndicatorPanel}`;

/**
 * WHERE an indicator is derived today — two sites, not one. The names are typed against the two
 * results, so a renamed prop or assembly field stops `tsc` here instead of leaving a dead pointer.
 */
export interface DeriveSitesToday {
  /** Built inline by `[symbol]/page.tsx::SymbolPage`, from the rows of `series`. */
  readonly ssr: readonly SsrFact[];
  /** Returned by `panel-assembly.ts::assembleHistoryPage`, every page, from the same rows. */
  readonly pager: readonly PagerFact[];
}

/** One row of the table. `F4`–`F8` turn each into an `IndicatorDefinition` (`contract.ts`). */
export interface IndicatorTableEntry<K extends string = string> {
  readonly kind: K;
  readonly series: readonly SeriesRequirement[];
  readonly derive: DeriveSitesToday;
}

export const INDICATOR_CATALOG = [
  {
    kind: "volume",
    series: [{ slot: "volume", matches: (key: SeriesKey, symbol: string) => keyMatchesSymbol(key, symbol) && key.metric === VOLUME_METRIC }],
    derive: { ssr: ["volume"], pager: ["volume"] },
  },
  {
    kind: "liquidation",
    // `T-05.9` — TWO series, one per leg, and NEVER one that sums them: `cohort` is a term of
    // identity, and the sum moves the same whether longs, shorts or both were flushed.
    series: [
      { slot: "long", matches: (key: SeriesKey, symbol: string) => keyMatchesSymbol(key, symbol) && matchesLiquidationCohort(key, "long") },
      { slot: "short", matches: (key: SeriesKey, symbol: string) => keyMatchesSymbol(key, symbol) && matchesLiquidationCohort(key, "short") },
    ],
    derive: { ssr: ["liquidation"], pager: ["liquidationLong", "liquidationShort"] },
  },
  {
    kind: "oi",
    // `T-03.5` — three terms: `metric` alone matches FIVE rows, and the first one is empty.
    series: [{ slot: "oi", matches: (key: SeriesKey, symbol: string) => keyMatchesSymbol(key, symbol) && matchesBinanceOpenInterest(key) }],
    // `oiCandles` has no SSR twin: the SSR hands the raw `oi_candles` block over in
    // `historyPagingRows.rows`, and only the pager derives the candles from it.
    derive: { ssr: ["oi", "panels.oi"], pager: ["oi", "panels.oi", "oiCandles"] },
  },
  {
    kind: "long_short",
    // `T-04.5` — two terms: `provider` keeps the pane on the origin the day a mirror is cataloged.
    series: [{ slot: "ratio", matches: (key: SeriesKey, symbol: string) => keyMatchesSymbol(key, symbol) && matchesCountLongShortRatio(key) }],
    derive: { ssr: ["longShort"], pager: ["longShort"] },
  },
  {
    kind: "cvd",
    // `T-02.5` — three terms: `metric === "cvd_source"` alone selects `aggtrade_q`, which has no rows.
    series: [{ slot: "cvd", matches: (key: SeriesKey, symbol: string) => keyMatchesSymbol(key, symbol) && matchesKlineTakerBuyCvd(key) }],
    derive: { ssr: ["cvd", "panels.cvd"], pager: ["cvd", "panels.cvd"] },
  },
] as const satisfies readonly IndicatorTableEntry[];

/** The `kind` of every indicator, DERIVED from the table (`SPEC-011 §4.1`, `E-4`): `contract.ts`
 * does not enumerate it. */
export type IndicatorKind = (typeof INDICATOR_CATALOG)[number]["kind"];

/** The slot names one indicator declares. */
export type SlotOf<K extends IndicatorKind> = Extract<(typeof INDICATOR_CATALOG)[number], { readonly kind: K }>["series"][number]["slot"];

/**
 * The requirement under `slot` of indicator `kind`. Both arguments are typed off the table, so a
 * misspelled pair does not compile; the throw is the runtime half of the same refusal.
 */
export function seriesRequirement<K extends IndicatorKind>(kind: K, slot: SlotOf<K>): SeriesRequirement {
  const table: readonly IndicatorTableEntry[] = INDICATOR_CATALOG;
  const requirement = table.find((entry) => entry.kind === kind)?.series.find((series) => series.slot === slot);
  if (requirement === undefined) {
    throw new Error(`indicator catalog: no series "${slot}" under kind "${kind}"`);
  }
  return requirement;
}
