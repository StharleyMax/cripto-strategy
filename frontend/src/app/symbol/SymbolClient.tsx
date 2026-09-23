"use client";

/**
 * `T-02.4` — the Client Component half of `/symbol`. `page.tsx` (Server Component, `async`)
 * does every network call and hands this component `{ panels, panelStatus, liveUrls }` by
 * props, all JSON-serializable (`S2Panels` is plain data; `PanelStatus`/the `liveUrls` record
 * are plain discriminated values/strings) — same RSC-boundary discipline `ConsoleClient.tsx`
 * documents for its own props.
 *
 * `T-02.5` (`SPEC-007` plan `02` item `2.6`) gives the CVD pane REAL DATA: the route now selects
 * the `cvd_source`/`binance`/`NA` catalog row (`kline_takerbuy`) instead of a `cvd_delta` metric
 * no backend builder ever produced, and this component gains one more plain prop (`cvd`) with
 * what the pane DECLARES about itself — how many grades of the window are readable, since when,
 * and which instant the cumulative curve is anchored at.
 *
 * `T-01.7` (`SPEC-007 §3.6`) adds a VOLUME SUB-AXIS to the Price pane — `klines_volume`, `1m`,
 * a histogram on its own price scale INSIDE the price chart, not a fourth pane. It arrives here
 * as one more prop (`volume`), computed server-side like every other, and it degrades on its
 * own (`panelStatus.volume`): price present with volume absent is a real, expected state.
 *
 * Mounts `lightweight-charts` directly (the library this repo already depends on,
 * `package.json`) for 3 panes — Price (candlestick + volume histogram), OI (line), CVD (two
 * lines: delta and cumulative) — feeding each one the LOSSLESS mapping (`candlestickSeriesLossless`/
 * `lineSeriesLossless`, the barrel's "adaptador lightweight" category): an absent grid slot
 * becomes a bare `{time}` `WhitespaceItem`, which the library places on the axis and draws
 * NOTHING for — never a `0` (`CA-F2-3`).
 *
 * ⛔ THE `design_gate` OF 2026-09-12 BLOCKED THIS FILE ON THREE FINDINGS, and the three are paid
 * here (`docs/context/cinco-metricas-do-core/gates/design-review-painel-cvd.md`):
 *   - `DR-1` — `createChart` had no `layout`, so every canvas kept the library default `#FFFFFF`
 *     inside a `#131722` page and the CVD delta line measured 1,22:1 ON SCREEN against 14,72:1 in
 *     the contrast gate. Options now come from `chartConstructorOptions()`, and three instruments
 *     make the divergence detectable instead of silent — see that module's docstring.
 *   - `DR-2` — delta and cumulative shared the default price scale, which flattens one of the two
 *     by construction (`max|cum| >= max|delta|`). The cumulative got a scale of its own.
 *   - `DR-3` — the two lines were distinguished ONLY by hue (WCAG 1.4.1) and the cumulative had no
 *     number anywhere in the DOM. Dash pattern + legend + `Acumulado atual:` readout.
 *
 * Below each chart, a small "leitura atual" readout exercises the barrel's absence-policy
 * functions (`resolveStockReading`/`resolveFlowReading`) at the window's own last instant —
 * `D5.2`/`D5.3`'s STOCK-held/FLOW-absent rules, genuinely read here, not merely imported.
 *
 * The live section is intentionally minimal: `GET /series-live`'s own backend producer is NOT
 * wired yet (`docs/context/pagina-de-grafico-s2/gates/F1-builder.md`, "Bloqueado" item 3 —
 * `LiveBucketSource`/`SeriesWindowReader` are unconnected Protocol stubs) — so an `EventSource`
 * opened against `liveUrls` will fail to connect in this phase, and this component shows that
 * failure as "ao vivo indisponível", the SAME absence-as-absence posture the rest of this page
 * follows, rather than pretending a live feed exists.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import type {
  CandlestickSeriesOptions,
  HistogramSeriesOptions,
  IChartApi,
  LineSeriesOptions,
  ISeriesApi,
  Logical,
  LogicalRange as LibraryLogicalRange,
} from "lightweight-charts";
import {
  CandlestickSeries,
  createChart,
  HistogramSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
} from "lightweight-charts";

import {
  absenceMarkSeries,
  candlestickSeriesColors,
  candlestickSeriesLossless,
  colorTokens,
  formatHeldStockLabel,
  lastGridInstant,
  lineSeriesLossless,
  ONE_MINUTE_MS,
  positiveValueSeriesLossless,
  resolveFlowReading,
  resolveStockReading,
  zeroMarkSeries,
  type FlowReading,
  type S2Panels,
  type TimeAxis,
} from "../../charts/index.ts";
import { chartConstructorOptions } from "./chart-options.ts";
import { recentBandSlotRange } from "./long-short-band.ts";
import { AxisSyncProvider, useAxisSync } from "./axis-sync-provider.tsx";
import { recordHistoryPageDrawn } from "./history-page-latency-probe.ts";
import {
  CVD_PANEL_INDEX,
  LIQUIDATION_LONG_PANEL_INDEX,
  LIQUIDATION_SHORT_PANEL_INDEX,
  LONG_SHORT_PANEL_INDEX,
  OI_PANEL_INDEX,
  PRICE_PANEL_INDEX,
} from "./axis-sync.ts";
import { decodeBucketEnvelope, type LiveBucketEnvelope } from "../live-transport.ts";
import type {
  FreshnessVerdict,
  OiProvenanceLabel,
  PanelStatus,
  SeriesProvenance,
  SeriesValueStats,
  SlotCoverageState,
  SymbolPanelStatuses,
} from "./panel-status.ts";
import {
  equilibriumPlacement,
  formatDerivedDecimal,
  formatPercentPtBr,
  LONG_SHORT_EQUILIBRIUM,
} from "./ratio-format.ts";
import { DEFAULT_TIMEFRAME, SUPPORTED_TIMEFRAMES } from "./supported-timeframes.ts";
import { HISTORY_BAR_POLICY } from "../history-transport.ts";
import type { HistoryRowsBundle } from "./panel-assembly.ts";
import { useHistoryPager, type HistoryPagingSeed, type HistorySeriesKeys } from "./use-history-pager.ts";
import { panelWallState } from "./slot-coverage.ts";

/** `ScalarSlot`'s shape, read off the barrel's own `S2Panels` (`ADR-034/D8` — no deep import
 * into `charts`, and no import of `view-model.ts`, which is server-side: it pulls
 * `node:crypto`, and `web-fullstack.browser-imports-server` is a BLOQUEIO). */
type VolumeSlot = S2Panels["oi"]["slots"][number];

/**
 * `T-01.7` — everything the volume sub-axis needs, computed server-side (`page.tsx` +
 * `view-model.ts`) and handed over as plain, JSON-serializable data, same RSC-boundary
 * discipline as `panels`/`panelStatus`. This component draws it; it decides nothing about it.
 */
export interface VolumeSubAxisData {
  readonly slots: readonly VolumeSlot[];
  /** Slots carrying a real value — the number `DoD-3`/`RN-S2` count against `N >= 30`. */
  readonly presentPoints: number;
  /** The FIRST grid instant of the window that carries a real value, or `null` when none does.
   *
   * Exists because of a measured fact about this screen, not for decoration: over the derived
   * 4-day window only `769/5.761` grades carry a value and the first one sits at index
   * `4.971/5.761` `[MEDIDO 2026-09-11, ACHADO-BACKFILL-INVISIVEL-AO-AS-OF.md]` — the leftmost
   * 86% of the chart is structurally empty because backfilled rows carry `available_at = the
   * instant we FETCHED them`, which `R-1` correctly refuses at their own grid instant. That
   * absence is REAL (we did not know it then), so the chart is not lying — but an operator
   * cannot tell it apart from "o mercado não teve dado", and `RN-1` is exactly about not
   * letting one kind of absence pass for another. So the screen DECLARES the horizon as a
   * measured fact (`quant-architect`, wave `03`, C4). ⛔ The span is NOT shrunk to fit the data:
   * it is `PRD-006 §2`/item `5.1`'s, and a window that shrinks to hide its own hole is worse
   * than one that names it. */
  readonly firstPresentMs: number | null;
  readonly reading: FlowReading;
  /** `T-03.12` / `P-B` / `ADR-040/D3` regime A — `klines_volume` is a `FLOW` SUM; a reaggregated
   * bucket short of its own `expected` native facts draws an UNDERCOUNT, silently, unless this
   * pane says so. `0/0` (no reaggregated bucket in the window) draws no mark at all. */
  readonly partialCoverage: PartialCoverageSummary;
}

/**
 * `T-02.5` — everything the CVD pane DECLARES about itself that is not already in
 * `panels.cvd`, computed server-side (`page.tsx`) and handed over as plain data, same
 * RSC-boundary discipline as `volume`. This component draws it; it decides nothing about it.
 */
export interface CvdPaneData {
  /** Delta slots carrying a real value — the number `DoD-3` counts against `N >= 30`. For a
   * `1m`-NATIVE series this is also the count of DISTINCT native bars, with no `RN-S1` `/5`
   * divisor (`view-model.ts::countPresentSlots`, same argument it gives for M1). */
  readonly presentPoints: number;
  /** The FIRST grid instant of the window whose delta is readable, or `null` when none is —
   * the left end of the readable horizon, DECLARED instead of left to look like a dead market.
   * Same measured reason as `VolumeSubAxisData.firstPresentMs`, and CVD inherits it exactly:
   * it is the same collector, the same row, the same `available_at`
   * (`handoff/ACHADO-BACKFILL-INVISIVEL-AO-AS-OF.md`). ⛔ The span is NOT shrunk to fit. */
  readonly firstPresentMs: number | null;
  /** WHERE THE CUMULATIVE CURVE STARTS COUNTING FROM, chosen by the route and printed on
   * screen. `delta` is anchor-free; `cumulativo` is a VIEW whose every point depends on this
   * instant, and three anchors over the SAME deltas invert the sign of the total (`D4.7`) — so
   * an anchor inherited in silence is a chart that cannot be read. */
  readonly anchorMs: number;
  /** `T-03.12` / `P-B` / `ADR-040/D3` regime A — `cvd_delta` is the other `FLOW` SUM this screen
   * draws. Folded off `cvdDeltaSlots`'s own raw rows, never off `cumulativeSlots` (a downstream
   * VIEW of the same deltas — one honest count at the source, `page.tsx`'s own comment). */
  readonly partialCoverage: PartialCoverageSummary;
}

/**
 * `T-03.5` — everything the OI pane DECLARES about itself beyond `panels.oi`, computed
 * server-side (`page.tsx`) and handed over as plain data, same RSC-boundary discipline as
 * `volume`/`cvd`. This component draws it; it decides nothing about it.
 */
export interface OiPaneData {
  /** ⛔ NATIVE 5-MINUTE BUCKETS carrying a real value — the number `DoD-3` counts against
   * `N >= 30`, and the `RN-S1` divisor paid in the TYPE instead of in a `/5`.
   *
   * `page.tsx` derives it from `panels.oi.slots`, which since `T-02.1` (`D-C3.2`) is the ONE
   * shared axis grid every panel's `slots` sits on (`ONE_MINUTE_MS`), NOT a 5-minute grid of
   * its own — `buildOiPanel` no longer builds one. The count still comes out to native buckets
   * because `oiPoints` only ever carries points at the native 5-minute cadence
   * (`scalarPointsFromHistoryRows(rows, FIVE_MINUTES_MS)`), so exactly one axis slot per native
   * bucket is non-null and every slot in between is an explicit gap. It is NOT the count of
   * readable wire rows: the route serves this `5m` series on the `1m` grid (`GA-2`), so one
   * native bucket appears as up to five rows and that count runs ~5x high. */
  readonly nativeBars: number;
  /** The STAIRCASE count — readable rows on the `1m` wire grid, i.e. the number `nativeBars`
   * would have been if nobody applied `RN-S1`. On screen beside it, and never quoted as the
   * amount of data: it is here so the ratio is visible and so `e2e/12-oi-dado-real.spec.ts` can
   * assert that the pane publishes the OTHER one. A falsifier needs both figures. */
  readonly wirePoints: number;
  /** Left end of the readable horizon (first native bucket with a value), `null` when none —
   * same measured reason as `VolumeSubAxisData.firstPresentMs`, and OI has it worse: over the
   * 4-day window the backfilled rows carry `available_at = the instant we fetched them`, so
   * `as_of` correctly refuses them at their own grid instant
   * (`ACHADO-BACKFILL-INVISIVEL-AO-AS-OF.md`). ⛔ The span is NOT shrunk to fit the data. */
  readonly firstPresentMs: number | null;
  /** Right end of the same horizon — the input of the `RNF-2` verdict below, on screen so the
   * age the pane claims can be recomputed from the instant it was computed against. */
  readonly lastPresentMs: number | null;
  /** `RNF-2`'s ceiling: the catalog's OWN `max_staleness_ms` for this series (`600_000` = 2 x
   * the `5m` native bucket), already served in every `GET /series-catalog` row. `null` when the
   * panel resolved no entry. */
  readonly maxStalenessMs: number | null;
  /** `RNF-2` — whether the newest readable point is past that ceiling. The pane must not show a
   * number older than the series' own periodicity without SAYING it is old. */
  readonly freshness: FreshnessVerdict;
  /** `T-04.1`/`RN-5` — grandeza · universo · coorte, DERIVED from the `SeriesKey` the route
   * resolved for this panel (`page.tsx` + `view-model.ts::deriveOiProvenanceLabel`), never a
   * literal in this file. `null` when no entry resolved — there is no series to describe. */
  readonly provenance: OiProvenanceLabel | null;
}

/**
 * `T-05.9` — ONE COHORT of `sum_liquidation` (M4), computed server-side (`page.tsx` +
 * `view-model.ts`) and handed over as plain, JSON-serializable data, same RSC-boundary discipline
 * as `volume`/`cvd`/`oi`. This component draws it; it decides nothing about it.
 *
 * ⛔ TWO OF THESE, NEVER ONE SUMMED — `liquidation_catalog.py`'s own argument, quoted in
 * `view-model.ts`'s selector section: long liquidation is forced SELLING and short liquidation is
 * forced BUYING, and their sum moves identically whether the market flushed longs, flushed shorts
 * or flushed both, erasing the discrimination the metric exists to provide (`RF-2`).
 */
export interface LiquidationCohortData {
  readonly slots: readonly VolumeSlot[];
  /** Slots carrying a real OBSERVATION — a value, possibly the legitimate zero of `ZL-3`. The
   * number `DoD-3` counts against `N >= 30`. `1m` native, so no `RN-S1` `/5` divisor. */
  readonly presentPoints: number;
  /** How many of those observations are a LEGITIMATE ZERO. Published beside `presentPoints` and
   * never folded into it: over the route's own 4-day window the long cohort answers `191` present
   * of `5.761`, and `62` of the `191` are zeros `[MEDIDO 2026-09-16]` — a pane quoting only the
   * first number lets a reader take all `191` for liquidation events, overstating by `1,5x`. Same
   * "a falsifier needs both figures" discipline `OiPaneData.wirePoints` already applies. */
  readonly zeroPoints: number;
  /** The FIRST grid instant carrying an observation, or `null` when none does — the left end of
   * the readable horizon, DECLARED rather than left to look like a market with no liquidations.
   * ⛔ The span is NOT shrunk to fit the data; same rule as `VolumeSubAxisData.firstPresentMs`. */
  readonly firstPresentMs: number | null;
  readonly reading: FlowReading;
  /** `T-03.12` / `P-B` / `ADR-040/D3` regime A — `sum_liquidation` is a `FLOW` SUM per cohort;
   * long and short each carry their OWN count, degrading independently like every other fact on
   * this pane. */
  readonly partialCoverage: PartialCoverageSummary;
}

/**
 * `T-05.9` — the liquidation pane as a whole: both legs plus the ONE fact that belongs to the
 * series rather than to a cohort, `RS-5`'s provenance.
 *
 * `provenance` is resolved from the LONG entry and applies to both: the two rows differ only in
 * `cohort`, so `provider`/`venue`/`reconstructed_from`/`published_error` are identical by
 * construction (`liquidation_catalog.py` builds both from one comprehension over `COHORTS`).
 * `page.tsx` states that out loud at the call site rather than leaving it implied here.
 */
export interface LiquidationPaneData {
  readonly long: LiquidationCohortData;
  readonly short: LiquidationCohortData;
  readonly provenance: SeriesProvenance;
  /** The `unit` term of the series' own identity (`USD` for M4), read off the resolved catalog
   * entry and printed beside the numeral — `null` when no entry resolved, in which case there is
   * no number on screen to give a unit to either.
   *
   * Carried instead of spelled as a literal here because of `W-1` of `gates/design-01.md`: the
   * volume sub-axis shipped a numeral with no unit and the ambiguity was five orders of magnitude.
   * A literal `"USD"` in this file would say the same thing while being free to drift away from
   * the identity the backend actually published. */
  readonly unit: string | null;
}

/**
 * `T-04.5` — `count_long_short_ratio` (M3), the FIRST NEW PANE of this feature, computed
 * server-side (`page.tsx` + `view-model.ts`) and handed over as plain, JSON-serializable data, same
 * RSC-boundary discipline as `volume`/`cvd`/`oi`/`liquidation`. This component draws it; it decides
 * nothing about it.
 *
 * ⛔ `nature = RATIO`, AND THAT IS NOT A LABEL — IT IS WHY THIS PANE NEVER HOLDS A VALUE FORWARD.
 * `CARRY_FORWARD_BY_NATURE[Nature.RATIO]` is `False` on the server (`as_of_accessor.py`, read by
 * `modeled_availability.py:38-40,134`), so a slot with no observation of its own comes back ABSENT
 * from the read path — never the previous quotient carried over. The screen renders that as
 * `SEM_PONTO`, and a `0` there would be the `RN-1` defect in its most misleading form on this
 * screen: `0` is a readable long/short ratio (nobody long), so a fabricated zero would not even
 * look wrong.
 */
export interface LongShortPaneData {
  /** The `1m` WIRE grid the route was served, transcribed — one slot per grid instant, `null` where
   * nothing was readable. It is a STAIRCASE by construction: the series is `5m` native
   * (`long_short_catalog.LONG_SHORT_INTERVAL`) served on the `1m` grid (`GA-2`), so one native
   * observation occupies up to five slots. Nothing here smooths that over; the ladder IS what the
   * data is. */
  readonly slots: readonly VolumeSlot[];
  /** ⛔ THE HEADLINE NUMBER, AND THE ONE `DoD-3` COUNTS AGAINST `N >= 30`: distinct NATIVE
   * observations, counted by publication (`view-model.ts::countNativeBarsByPublication`, which also
   * carries the measurement showing why neither `wirePoints / 5` nor a `% 300_000` filter answers
   * it for this series). */
  readonly nativeBars: number;
  /** The STAIRCASE count — readable rows on the `1m` wire grid, i.e. the number `nativeBars` would
   * have been if nobody applied `RN-S1`. Published beside it and never quoted as the amount of data,
   * the same "a falsifier needs both figures" discipline `OiPaneData.wirePoints` states in full. */
  readonly wirePoints: number;
  /** The FIRST grid instant carrying a readable value, or `null` when none does — the left end of
   * the readable horizon, DECLARED instead of left to look like a market nobody measured. ⛔ The
   * span is NOT shrunk to fit the data; same rule as `VolumeSubAxisData.firstPresentMs`. */
  readonly firstPresentMs: number | null;
  /** The RIGHT end of the readable horizon — the last grid instant carrying a value, `null` when
   * none does. On screen because of the geometry the `design_gate` approved: for a `RATIO` series
   * the line simply STOPS at this instant and nothing is drawn to the right of it (`M-2`), which
   * leaves a blank right edge an operator cannot date. */
  readonly lastPresentMs: number | null;
  /** The `available_at` of the newest READABLE row — a PUBLICATION instant, not a grid instant, the
   * same quantity `FreshnessVerdict.observedMs` carries for OI (`A-4.2`). `null` when nothing in
   * the window is readable. */
  readonly observedAtMs: number | null;
  /** `windowEndMsInclusive - observedAtMs` — the age stamp `S-6` of `gates/design-04.md` requires
   * at the right edge of time, and ONLY where there is an observation to date. `null` when there is
   * none: an age over zero observations was one of the three false claims that reproved rodada 1.
   *
   * ⛔ IT IS AN AGE, NOT A FRESHNESS VERDICT — see the route's own comment at the call site for why
   * this pane does not carry `OiPaneData.freshness`' ceiling comparison. */
  readonly ageMs: number | null;
  /** How many slots at the RIGHT EDGE carry nothing — *"cauda ausente: N grades de 1m"*. `0` means
   * the window's last instant carries an observation, never "no data". */
  readonly trailingAbsentSlots: number;
  /** The scale of the pane over the WHOLE window — `null` when no slot carries a value, in which
   * case the pane says the absence instead of printing a domain nobody measured. */
  readonly windowStats: SeriesValueStats | null;
  /** The same five numbers over the trailing band (`page.tsx::LONG_SHORT_RECENT_SPAN_MS`), and the
   * span itself so the screen can NAME the band it is describing instead of hardcoding "4 h" beside
   * a number computed over something else. */
  readonly recentStats: SeriesValueStats | null;
  readonly recentSpanMs: number;
  /** `RS-5` — whose measurement this is, resolved from the catalog row (`resolveSeriesProvenance`).
   * The approved header prints `procedência` where there IS an observation and drops it entirely
   * where there is none (`M-3`): "OBSERVADO" over zero observations was a claim with no subject. */
  readonly provenance: SeriesProvenance;
  readonly reading: FlowReading;
  /** The `unit` term of the series' own identity (`ratio` for M3), read off the resolved catalog
   * entry and printed beside the numeral — `null` when no entry resolved. Carried instead of
   * spelled as a literal here for `W-1` of `gates/design-01.md`: a numeral with no unit on this
   * screen was a finding once already, and a literal would be free to drift from what the backend
   * published. */
  readonly unit: string | null;
  /** `key.interval` of the resolved catalog row (`5m` for M3) — the CADENCE term of the series'
   * identity, carried for exactly the reason `unit` above is carried, and the `/review` `[WARNING]`
   * of `T-04.8` is that reason measured: four places on this pane spelled `5 min`/`5m` BY HAND while
   * the API published the term per entry, so *"a literal would be free to drift from what the
   * backend published"* applied to them word for word. `null` when no entry resolved, and then the
   * pane says nothing about cadence rather than a cadence nobody served. */
  readonly nativeInterval: string | null;
  /** `native_grid` of the same row (`5min` for M3). Published BESIDE `nativeInterval` and not
   * instead of it because they are two different declarations — the interval is a term of the
   * series' KEY (it distinguishes two series), the grid is a property of how it is SAMPLED — and
   * `e2e/14` asserts both, separately, against the served catalog (`:330-331`). */
  readonly nativeGrid: string | null;
}

/**
 * `T-01.8` (`SPEC-008`/`D1`) — what the PRICE pane declares about the bars it just drew.
 *
 * The candle is FOUR series now (`klines_ohlc` `OPEN`/`HIGH`/`LOW`/`CLOSE`, one reading each,
 * `view-model.ts::assembleOhlcCandles`), and every one of these three numbers is computed on
 * the server, like every other prop on this component: this file draws, it decides nothing.
 *
 * ⛔ WHY THREE NUMBERS AND NOT ONE. `lightweight-charts` paints to a `<canvas>`, which no DOM
 * assertion can read, so the pane's only auditable statement about its own data is what it
 * publishes here — and "how many bars" alone cannot tell a window with no data (`0/5760`) from
 * a window whose four series disagree about which buckets they covered (`0/5760` with
 * `partialBuckets` in the thousands). The second is a REAL state of this feature's own data
 * (`SPEC-008` §7.2's "queijo suíço": holes in the middle, not a clean edge), and without its
 * own number it renders as the same nothing as the first.
 */
export interface PriceCandleData {
  /** Grid slots carrying a candle — counted off the same `GridSlot[]` fed to `setData`. */
  readonly drawnCandles: number;
  /** Slots in the window's grid, drawn or not: the denominator, never omitted. */
  readonly gridSlots: number;
  /** Buckets where 1..3 of the four readings arrived ⇒ no candle, a gap, and a count. */
  readonly partialBuckets: number;
}

export interface SymbolClientProps {
  /** `T-02.5` — the route's resolved `[symbol]` segment (`page.tsx`, validated against the
   * pilot universe there), never `panels.symbol`. `charts`' `S2Panels.symbol` stays the module
   * constant `"BTCUSDT"` (`s2-panels.ts`) on purpose — widening THAT signature is a change to a
   * component this task does not own (`ADR-003`) — so the page that DOES know which instrument
   * this request served passes it explicitly, the same "no silent default" rule `priceUse` and
   * `window` already follow one level up. */
  readonly symbol: string;
  readonly panels: S2Panels;
  readonly priceCandles: PriceCandleData;
  readonly volume: VolumeSubAxisData;
  readonly cvd: CvdPaneData;
  readonly oi: OiPaneData;
  readonly liquidation: LiquidationPaneData;
  readonly longShort: LongShortPaneData;
  readonly panelStatus: SymbolPanelStatuses;
  /** `knowledge_time_ms` of the request this render was built from (`request-window.ts`). Shown
   * nowhere; carried to the DOM as a `data-` attribute so the screen can be AUDITED against the
   * read API over exactly the window the server used — which is what lets `e2e/08` cross-check
   * DOM against `/series-history` without seeding anything (`[P-seed]`). */
  readonly knowledgeTimeMs: number;
  readonly liveUrls: { readonly price: string | null; readonly oi: string | null; readonly cvd: string | null };
  /** `T-03.11` — the `interval` THIS render's ten fetches actually asked `/series-history` for
   * (`page.tsx`'s own `selectedInterval`, resolved from `?interval=` against
   * `SUPPORTED_TIMEFRAMES`, never trusted raw). Replaces the `useState(DEFAULT_TIMEFRAME)` the
   * bar used to own locally (`T-03.9`): the URL is now the single source of truth for which TF
   * is selected, so `TimeframeBar`'s own selection can never drift from what was actually
   * fetched — the exact drift a client-only `useState` would reopen the day someone reads
   * `selectedTimeframe` as "what the panels show" instead of "what the bar highlights". */
  readonly selectedTimeframe: string;
  /** `T-05.2` (`D-C3.5`) — the SEED the client-side history paginator (`use-history-pager.ts`)
   * starts from: the ten `series_key_id`s this render resolved (`null` where the catalog
   * resolution itself failed/was ambiguous — `page.tsx`'s own `CatalogResolution`) and the ten
   * raw `SeriesHistoryRow[]` arrays this render already fetched. Every OTHER prop above
   * (`panels`/`priceCandles`/`volume`/`cvd`/`oi`/`liquidation`/`longShort`) is what the FIRST
   * paint draws; this is what a later drag-to-the-edge widens. Plain, JSON-serializable data,
   * same RSC-boundary discipline every other prop here follows — `page.tsx` already had all ten
   * row arrays in hand (`openResult.rows`, …, `longShortResult.rows`) and all ten resolved keys
   * (`computeSeriesKeyId(entry.key)` at each of the ten `HistoryRequestKey` call sites); this
   * prop is those same values, carried one level further instead of discarded after the initial
   * fetch. */
  readonly historyPagingRows: {
    readonly keys: HistorySeriesKeys;
    readonly rows: HistoryRowsBundle;
  };
  /** `T-05.2-FIX-adr005` — the ALREADY RESOLVED absolute `GET /series-history` endpoint URL
   * (`page.tsx`'s own `seriesHistoryEndpointUrl`, `series-history-client.ts`), carried into
   * `useHistoryPager`'s seed unchanged. `null` when `INGEST_HEALTH_API_BASE_URL` was unset at
   * render time — same shape `liveUrls` above already has per-panel. */
  readonly historyBaseUrl: string | null;
}

const ABSENCE_REASON_LABEL: Record<Exclude<PanelStatus, { kind: "ok" }>["reason"], string> = {
  not_in_catalog: "sem série cadastrada no catálogo",
  // `T-03.5`: the catalog answered with MORE THAN ONE candidate and the route refuses to choose
  // by position. Said on screen because the alternative — drawing whichever row came first — is
  // the defect that put this panel on an empty series for a whole phase.
  ambiguous_in_catalog: "o catálogo tem mais de uma série candidata e a escolha seria por posição",
  missing_base_url: "configuração de API ausente",
  connection_refused: "API de leitura inacessível",
  non_2xx: "API respondeu com erro",
  malformed_envelope: "resposta em formato inválido",
};

function AbsenceNote({ status }: { readonly status: PanelStatus }) {
  if (status.kind === "ok") {
    return null;
  }
  return (
    // ⛔ NO `role="status"`, and the removal is `T-05.10`'s `m-5` finding. A live region
    // (`aria-live="polite"`) announces CHANGE; this note exists at the first paint (`status` comes
    // from the server, per request) and never mutates on the client. A live region already present
    // at load time is NOT announced by a screen reader ⇒ the role bought nothing and left a spurious
    // live region competing with the ones that do change. The text stays reachable: it is a `<p>` in
    // the flow.
    <p data-fact={`panel_absent:${status.reason}`} className="text-sm text-provenance-weak">
      Sem dado real neste painel — {ABSENCE_REASON_LABEL[status.reason]}. Nenhum número é mostrado no lugar
      (nunca um zero fabricado).
    </p>
  );
}

/** The window's own last grid instant — the one the "leitura atual" readouts query, and the
 * same one `page.tsx` sends as `window_end_ms`.
 *
 * READ OFF THE PANELS, not off a constant: the window is derived per request now
 * (`request-window.ts`), so a module-level constant here would drift away from the data the
 * server actually fetched — which is the very shape of the defect this replaced
 * (`ACHADO-SERIES-HISTORY-SEM-PONTO.md`, second defect: a frozen window outliving its data).
 *
 * ⛔ AND IT IS NOT COMPUTED HERE. Subtracting one minute from the exclusive edge used to be
 * written out in this file AND in `request-window.ts` — two copies of the same half-open →
 * inclusive bucket conversion inside `web`, which is literally the "segunda implementação da
 * grade canônica"
 * `ADR-003` FR-2 names as the failure mode where the screen and the engine disagree about what
 * happened. `lastGridInstant` is that conversion, living in `charts` where geometry belongs
 * (`quant-architect`, wave `03`, C3). */
function lastInstantMs(panels: S2Panels): number {
  return lastGridInstant(panels.window, ONE_MINUTE_MS);
}

/** ⛔ FORM, submitted to the `design_gate` — `DR-4` of `gates/design-review-painel-cvd.md` asks
 * for a `ResizeObserver`/`autoSize` on top of this, and that is a MEDIUM item of that report's
 * roadmap, not one of the three blockers this pass exists to clear. Named as a constant here so
 * the next pass has one place to change instead of a literal inside a call. */
const CHART_HEIGHT_PX = 220;

/**
 * ⛔ `measure` IS READ AFTER THE FIT, ON THE NEXT FRAME, AND BOTH HALVES OF THAT SENTENCE ARE THE
 * REASON IT EXISTS — `D-1` of `gates/design-04.md` §R3.5 needs a pane to draw an overlay ALIGNED
 * with the chart's own time scale, and the only honest source of that alignment is the library.
 *
 * `setVisibleLogicalRange()` sets the target range and INVALIDATES; the time scale's coordinates
 * are recomputed when the chart next paints (same async contract `fitContent()` had —
 * `charts/headless-chart.ts`'s own docstring: "`fitContent()` and `setVisibleLogicalRange()` do
 * NOT change anything synchronously"). Reading `logicalToCoordinate` in the same tick answers
 * with the range the chart had BEFORE the write — a coordinate that looks like a measurement and
 * is not. So the callback is deferred one animation frame, and cancelled with the chart if the
 * pane unmounts first: a callback that outlives `chart.remove()` would read a disposed model.
 *
 * It is OPTIONAL, and four of the five panes pass nothing: a pane that draws only on the canvas has
 * no geometry to read back out.
 *
 * `T-02.4` (`D-C3.1`, plan `02` item `2.3`) — `panelIndex` is new, and `fitContent()` is GONE:
 * ⛔ the initial framing is no longer this chart's own decision. It writes `axisSync`'s
 * `initialLogicalRange` — the ONE `LogicalRange` computed off the shared `TimeAxis`, the same
 * value every one of the six panels applies — then registers itself with the `AxisSyncStore` so
 * `RangeDispatcher` (`T-02.3`, `charts`) can WRITE this chart when ANOTHER panel pans, and
 * subscribes to this chart's own `subscribeVisibleLogicalRangeChange` so a gesture ON this chart
 * DISPATCHES to the other five. "Assina, despacha e aplica" — the three verbs `D-C3.1`'s table
 * assigns to `web` — are exactly these three calls.
 *
 * `T-02.6` (`CST-213`, `DoD-2`/`DoD-4`) — three `data-*` attributes on `container` itself, kept
 * in lockstep with every "aplica"/"despacha" write: `data-visible-logical-from`/`-to` (the
 * `LogicalRange` this chart is CURRENTLY showing, position — not presence — for Playwright to
 * assert on) and `data-axis-sync-write-count` (incremented only inside `registerPanel`'s
 * callback, i.e. only when the DISPATCHER wrote here because ANOTHER panel moved — a gesture on
 * THIS panel's own drag never increments its own counter, matching `axis-sync.test.ts`'s
 * already-proven "never in the origin").
 */
function useLightweightChart(
  containerRef: RefObject<HTMLDivElement | null>,
  panelIndex: number,
  build: (chart: IChartApi) => void,
  measure?: (chart: IChartApi) => void,
): void {
  const axisSync = useAxisSync();
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    // ⛔ THE OPTIONS ARE NOT SPELLED HERE, AND THAT IS THE FIX — `DR-1` of
    // `gates/design-review-painel-cvd.md`. This call used to pass `width`/`height`/`timeScale`
    // only, so the canvas kept the library default `#FFFFFF` background inside a `#131722`
    // page and the CVD delta line measured `1,22:1` on screen while `color-contrast.test.ts`
    // read `14,72:1` against a surface nothing was painted on. Building the options here
    // instead of naming them would have fixed THIS pane and left the next one free to do it
    // again: `chart-construction.test.ts` can only require a NAME.
    const chart = createChart(container, chartConstructorOptions(container.clientWidth || 600, CHART_HEIGHT_PX));
    build(chart);
    const timeScale = chart.timeScale();
    // "aplica" — the axis-owned initial framing, not `fitContent()`.
    timeScale.setVisibleLogicalRange(axisSync.initialLogicalRange);
    // `T-02.6` (`DoD-2`/`DoD-4`) — DOM-observable POSITION, not presence: `data-visible-logical-*`
    // carries the actual `LogicalRange` this chart currently applies (updated below on both the
    // "aplica" and "despacha" halves, so it is current no matter which of the six panels a
    // gesture originated on), and `data-axis-sync-write-count` counts how many times the
    // DISPATCHER (never this chart's own drag) wrote into it — the instrumentation `CA-6`/`DoD-4`
    // need without adding a status code or an attribute a test could pass by merely existing.
    container.dataset.visibleLogicalFrom = String(axisSync.initialLogicalRange.from);
    container.dataset.visibleLogicalTo = String(axisSync.initialLogicalRange.to);
    container.dataset.axisSyncWriteCount = "0";
    // "assina" (this chart is now WRITABLE by the dispatcher) + "despacha" (this chart's own
    // range changes are forwarded to the other five).
    const unregister = axisSync.registerPanel(panelIndex, (logical) => {
      timeScale.setVisibleLogicalRange(logical);
      container.dataset.visibleLogicalFrom = String(logical.from);
      container.dataset.visibleLogicalTo = String(logical.to);
      container.dataset.axisSyncWriteCount = String(Number(container.dataset.axisSyncWriteCount ?? "0") + 1);
    });
    const handleRangeChange = (range: LibraryLogicalRange | null) => {
      if (range === null) {
        return;
      }
      container.dataset.visibleLogicalFrom = String(range.from);
      container.dataset.visibleLogicalTo = String(range.to);
      axisSync.notifyPanelRangeChanged(panelIndex, range);
    };
    timeScale.subscribeVisibleLogicalRangeChange(handleRangeChange);
    const frame =
      measure === undefined
        ? null
        : requestAnimationFrame(() => {
            measure(chart);
          });
    return () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
      timeScale.unsubscribeVisibleLogicalRangeChange(handleRangeChange);
      unregister();
      chart.remove();
    };
    // `build` and `measure` intentionally excluded from the dependency list: each is a fresh closure every
    // render by construction (it captures this render's own panel slots), and
    // `lightweight-charts` owns its own mount/unmount lifecycle — re-running this effect on
    // every render would tear the chart down and rebuild it constantly instead of once per
    // mount. No `react-hooks` plugin is configured in this project's `eslint.config.mjs`, so
    // no rule enforces exhaustive deps here; this comment names the intent for a reader.
  }, [containerRef, panelIndex, axisSync]);
}

/** `T-04.3` (`CA-F4-3`): a "leitura atual" readout for Preço, same shape `OiPane` already has
 * for OI — the falsifier this fase exists for needs a REAL NUMBER in the DOM, not only the
 * chart canvas (`lightweight-charts` draws to `<canvas>`, opaque to a DOM assertion). No new
 * absence policy: `panels.price.series.slots` (`GridSlot[]`, `candle: RawCandle | null`) is
 * mapped onto the exact `{ time, value }` shape `resolveStockReading` already takes for OI —
 * the SAME pure function, reused, not a price-specific reimplementation. `nativeTimeframeMs =
 * ONE_MINUTE_MS` because price's own native grid IS 1 minute (unlike OI's 5), so this always
 * resolves `"exact"` or `"absent"`, never `"held"` — there is no coarser native grid to hold
 * across for this panel.
 */
// ── The volume sub-axis (`T-01.7`, `SPEC-007 §3.6`) ─────────────────────────────────────────
//
// ⛔ THE STABLE SELECTOR. `T-01.9`'s e2e finds the sub-axis by THIS string and reads
// `data-volume-present-points` off it. It is a CONTRACT, not styling: the `design_gate`
// (`T-01.8`) may change height, scale, color and how absence LOOKS without touching it, which
// is exactly what makes the two tasks parallelizable — a `NEEDS_FIX` about form must not be
// able to break an assert about data.
const VOLUME_SUBAXIS_TESTID = "price-pane-volume-subaxis";

// ⛔ AND THE SAME KIND OF CONTRACT FOR THE PRICE PANE ITSELF (`T-01.8`): `T-01.11`'s e2e finds
// it by THIS string and reads `data-price-candles` off it. `section[aria-label="Preço"]` is NOT
// the handle — the label is user-visible pt-BR microcopy the `ui-designer` may rewrite under the
// `ux-ui-mastery` verdict (`T-01.10`), and pinning a DATA assertion to UI TEXT is how a change of
// form breaks a test about data. Form may change freely; this string may not.
const PRICE_PANE_TESTID = "price-pane";

// ⛔ THE STABLE SELECTOR OF THE CVD PANE (`T-02.5`), and it is the same KIND of contract the
// line above is for `T-01.9`: `e2e/10-cvd-dado-real.spec.ts` finds this pane by THIS string and
// reads `data-cvd-present-points` off it. Form — colour, height, where the readout sits, how
// absence LOOKS — belongs to the `ui-designer` with the `ux-ui-mastery` verdict and may change
// without touching either string. `section[aria-label="CVD"]` is NOT used as the handle: the
// label is user-visible pt-BR microcopy, and selecting by text of UI is what `T-02.6` forbids.
const CVD_PANE_TESTID = "cvd-pane";

// ⛔ AND THE SAME CONTRACT FOR THE OI PANE (`T-03.5`): `e2e/12-oi-dado-real.spec.ts` finds it by
// THIS string. `section[aria-label="Open Interest"]` is NOT the handle — that label is
// user-visible pt-BR microcopy the `design_gate` may restyle or reword, and selecting a DATA
// assertion by the TEXT OF UI is what makes a form change break a data test.
const OI_PANE_TESTID = "oi-pane";

// ⛔ AND THE SAME CONTRACT FOR THE LONG/SHORT PANE (`T-04.5`), the first NEW pane of this feature:
// `T-04.7`'s e2e finds it by THIS string and reads `data-long-short-native-bars` off it. It is what
// DECOUPLES the data assertion from the design verdict — `T-04.6` (`ui-designer` +
// `ux-ui-mastery`) may change every colour, height, word and position of this pane without touching
// either string, which is what lets the two tasks run without coordinating.
// `section[aria-label="Long/short"]` is NOT the handle: the label is user-visible pt-BR microcopy
// the `ui-designer` may rewrite, and pinning a DATA assertion to UI TEXT is how a change of form
// breaks a test about data.
const LONG_SHORT_PANE_TESTID = "long-short-pane";

/** `RN-1`'s literal token: absence is `SEM_PONTO`, and for a `FLOW` series rendering it as `0`
 * is an error of TYPE, not of taste. `DoD-3` asserts this exact string's ABSENCE from the CVD
 * pane once data is present, so it is as load-bearing as a testid.
 *
 * ⚠️ `T-02.5` MADE THE CVD READOUT USE IT TOO, and the previous version of this comment said the
 * opposite ("`formatFlowValue`'s `—` is the CVD readout's own wording and is deliberately NOT
 * reused here"). Why it changed: `formatFlowValue` (`D5.3`) is the CROSSHAIR wording and stays
 * exactly as it is inside `charts` — but on THIS screen it made CVD the only one of four
 * readouts spelling absence differently from the other three (Preço, OI and o sub-eixo de Volume
 * all print `SEM_PONTO`), and `DoD-3`'s "não diz `SEM_PONTO`" is unfalsifiable against a pane
 * that could never say it: a test that passes whether or not the data arrived proves nothing.
 * One token, four readouts, one thing for an operator to learn. ⛔ FORM SUBMITTED TO THE
 * `design_gate`, not decided here — `CLAUDE.md` §"Design — autonomia delegada, com gate de
 * validação"; what a builder decides is that absence is DISTINGUISHABLE and machine-readable. */
const ABSENCE_TOKEN = "SEM_PONTO";

/** `T-03.12` — the SAME shape `view-model.ts::PartialCoverageSummary` (`page.tsx`'s own return
 * type from `summarizePartialCoverage`) declares, DUPLICATED here rather than imported: this
 * file is a Client Component and `view-model.ts` pulls `node:crypto`
 * (`computeSeriesKeyId`) — `volume-subaxis-dom-contract.test.ts`'s own
 * `web-fullstack.browser-imports-server` scan forbids ANY import of `view-model.ts` from here,
 * type-only or not (the scan is a text regex over import specifiers, not TS-aware). Structural
 * typing makes the duplication safe: `page.tsx` assigns a `view-model.ts`-shaped object literal
 * straight into these props with no cast needed, and a shape drift between the two would fail
 * `tsc`, not pass silently. */
interface PartialCoverageSummary {
  readonly partialBuckets: number;
  readonly totalReaggregatedBuckets: number;
}

/** `T-03.12` — the SAME hollow-lozenge glyph `LongShortIntegrityGlyph` already carries, reused
 * rather than reinvented: `DESIGN_SYSTEM.md` §1.5 reserves exactly ONE glyph for "integridade do
 * dado" ("losango vazado, sempre o mesmo, nunca triângulo nem círculo"), and a partial `FLOW` SUM
 * silently undercounting its own denominator is that class of signal, not a new one. `fill="none"`
 * is the rule, not a look — §9 item 4 of `STITCH_CONTEXT.md` forbids this mark from ever filling
 * an area, so it is never mistaken for a data mark. `aria-hidden` + `focusable="false"` because
 * the word beside it (`PartialCoverageMark`, below) carries the whole message, same criterion
 * `CvdLegend`/`VolumeMarksLegend`/`LongShortIntegrityGlyph` already apply to their own glyphs. */
function PartialCoverageGlyph() {
  return (
    <svg aria-hidden="true" focusable="false" width="12" height="12" viewBox="0 0 12 12">
      <polygon points="6,1 11,6 6,11 1,6" fill="none" stroke={colorTokens().dataBrokenInk} strokeWidth="1.5" />
    </svg>
  );
}

/**
 * `T-03.12` — the VISIBLE MARK `P-B`/`ADR-040/D3` requires when a regime-A (`Σ`/max/min) panel
 * serves a partial reaggregated bucket: glyph, WORD, and colour as the THIRD channel (never the
 * only one), same three-channel discipline `LongShortIntegrityBadge` already established on this
 * screen — reused, not reinvented, because both are the same role (`ADR-010/D-3`, `integridade do
 * dado`) applied to two different absences ("no observation" there, "fewer native facts than
 * claimed" here).
 *
 * Renders NOTHING when `partialBuckets === 0` — either no reaggregation happened at all (the
 * window's rows never left their native grid, `series_history_report.py`'s own DEGENERATE case,
 * `totalReaggregatedBuckets === 0` too) or every reaggregated bucket answered its full `expected`
 * — in both cases there is nothing undercounted to warn about, and a badge reading "0 de N
 * buckets... subestimada" would be a false alarm about a sum that is, in fact, whole.
 *
 * Scope, stated rather than hidden: this counts buckets across the visible WINDOW, never a mark
 * painted on the individual bar inside the canvas — `lightweight-charts` paints to an OPAQUE
 * `<canvas>` (every other pane's own comment on this file, `DR-6`), so a per-bar mark painted
 * there would be invisible to every `data-fact` assertion this repo's DoD lines already run
 * (`grep -o 'data-fact=...'`). `panel.coverage`'s two WALLS (`T-03.6`, beyond-coverage vs
 * absent) are a DIFFERENT fact (`D-C3.7`) and stay out of this mark on purpose. */
function PartialCoverageMark({
  factKey,
  summary,
}: {
  readonly factKey: string;
  readonly summary: PartialCoverageSummary;
}) {
  if (summary.totalReaggregatedBuckets === 0) {
    return null;
  }
  return (
    <p
      data-fact={`${factKey}:${summary.partialBuckets}/${summary.totalReaggregatedBuckets}`}
      className="flex items-center gap-2 border border-integrity-ink px-2 py-0.5 text-sm font-bold text-integrity-ink"
    >
      <PartialCoverageGlyph />
      COBERTURA PARCIAL — {summary.partialBuckets} de {summary.totalReaggregatedBuckets} buckets reagregados
      somam menos fatos nativos do que deveriam (soma subestimada).
    </p>
  );
}

/**
 * `T-05.6` (`D-C3.6`, plan `05` item `5.5`) — the NAMED STATE for a panel whose accumulated
 * window has widened past this SERIES' OWN declared floor (`beyond-coverage`,
 * `slot-coverage.ts::panelWallState`): the store/source has no history before this point, ever —
 * a WALL, distinct from `not-loaded` (the pager just hasn't paged there yet, `T-05.7` already
 * stops asking silently once the wall is known) and from `absent` (a real hole inside KNOWN
 * coverage). Reuses the SAME glyph/word/colour three-channel discipline
 * `PartialCoverageMark`/`LongShortIntegrityBadge` already established on this screen (`ADR-010/D-
 * 3`, "integridade do dado") — the SAME glyph too (`PartialCoverageGlyph`), not a fourth SVG for a
 * fourth flavour of "integrity", so an operator only ever has to learn ONE mark.
 *
 * ONE badge per PANEL, never per slot/bar (this task's own DoD): the caller decides ONE
 * `SlotCoverageState` for the whole panel (`panelWallState` against the window's own left edge,
 * never a scan of every slot) and this component only ever renders for `"beyond-coverage"` —
 * `"absent"`/`"not-loaded"` render nothing here, on purpose: neither is "this panel has hit a
 * wall it can never cross".
 */
function BeyondCoverageBadge({ factKey }: { readonly factKey: string }) {
  return (
    <p
      data-fact={`${factKey}:beyond`}
      className="flex items-center gap-2 border border-integrity-ink px-2 py-0.5 text-sm font-bold text-integrity-ink"
    >
      <PartialCoverageGlyph />
      LIMITE DA COBERTURA — sem histórico disponível além deste ponto.
    </p>
  );
}

// ⛔ FORM, NOT CONTRACT — every constant in this block belongs to the `ui-designer` WITH the
// `ux-ui-mastery` verdict (`T-01.8`, `CLAUDE.md` §"Design — autonomia delegada, com gate de
// validação"). What is here is the sober, functional placeholder a builder is allowed to write
// so the data can be seen at all; it is NOT a design decision and must not be read as one.
// `priceScaleId` is a scale of its OWN, separate from price's — that part IS structural
// (`SPEC-007 §3.6`: a SUB-AXIS of `PricePane`), since sharing price's scale would flatten one
// of the two series into nothing.
const VOLUME_PRICE_SCALE_ID = "volume";
const VOLUME_SCALE_MARGINS = { top: 0.8, bottom: 0 } as const;

// ⛔ `BLOCKER-1` DO `design_gate` DE `T-01.8`, E ELE ERA ARITMÉTICO, NÃO DE GOSTO
// (`docs/context/cinco-metricas-do-core/gates/design-01.md` §2). Com a escala LINEAR ancorada no
// máximo da janela, o volume de 1 min do BTCUSDT (`max/p50 = 60,8x`) dava uma barra mediana de
// `0,62 px` e punha `954/1.404` barras presentes (`67,9%`) abaixo de 1 pixel físico — e uma barra
// sub-pixel é, no canvas, a mesma coisa que a ausência: nada. WCAG 1.4.11 reprova (um objeto
// gráfico necessário para entender o conteúdo tem de ser PERCEPTÍVEL, e nenhum contraste torna
// perceptível uma marca de 0,62 px).
// `[MEDIDO 2026-09-15 contra a própria `lightweight-charts@5.2.1` em jsdom, n=1.404 grades
//  presentes em 24h de dado real; linear p50=0,62px / log10 p50=19,34px, 0 abaixo de 1px]`
//
// ⛔ CLIP NO `p95` FOI CONSIDERADO E RECUSADO PELO LAUDO, e não se ressuscita: ele também
// resolve a legibilidade, mas MENTE sobre o pico — uma barra recortada afirma `4931` e `1017`
// com a mesma altura.
//
// O QUE A BASE FAZ, e por que ela é `1` e não `0`: numa escala logarítmica a altura da barra é
// `log10(valor/base)`, então a base é o ZERO da leitura. `1` é uma âncora ABSOLUTA na unidade da
// própria série — a mesma altura significa o mesmo volume em qualquer janela —, ao contrário de
// ancorar no mínimo da janela, que faz o desenho mudar de significado quando a janela muda
// `[MEDIDO: base=1 -> menor barra 10,39px, p50 19,34px, 0/1403 abaixo de 1px; base=mínimo da
//  janela -> menor barra 0,00px e 9 abaixo de 1px]`.
//
// ── `T-03.10` (`[Q8]`/`[M-6]`) — E SOB TF≠1m (volume ~240× MAIOR a `4h`)? A ÂNCORA CONTINUA `1`,
// ATÉ PROVA EM CONTRÁRIO (quem decide mudar é o `design_gate`, não este arquivo). A prova, em
// `volume-subaxis-tf-invariance.test.ts`: `BLOCKER-1` (nenhuma barra sub-pixel, mediana legível)
// CONTINUA valendo a `240×` a magnitude de `1x` — mas o CONTRASTE entre a menor e a maior barra
// visíveis MEDIDAMENTE se comprime (`spread` de `27,26px` para `16,57px`, `n=1.440`), porque `1`
// é âncora ABSOLUTA: o vão `base→mínimo` cresce com a magnitude enquanto o vão `mínimo→máximo`
// (a razão da própria série) não muda. Isto é o PREÇO já aceito da âncora absoluta, não um
// defeito novo — a alternativa (âncora no mínimo da janela) já foi medida e recusada duas
// comentários acima, e ela reintroduziria o BLOCKER-1 que motivou `base=1` em primeiro lugar.
// `[MEDIDO 2026-09-22, jsdom contra a biblioteca real: 1× -> mín 10,14px/mediana 19,15px/máx
//  37,40px; 240× -> mín 20,83px/mediana 26,30px/máx 37,40px, 0/1.440 abaixo de 1px nos dois]`
const VOLUME_LOG_BASE = 1;

// ⛔ `BLOCKER-2`: A AUSÊNCIA NÃO TINHA MARCA, E A REGRA TRAVADA EXIGE UMA.
// `STITCH_CONTEXT.md:1821-1825`, verbatim: *"Zero legitimo do fornecedor e uma MARCA desenhada na
// linha de base, distinguivel de ausencia. 'Nao houve liquidacao' e 'nao sabemos' nao sao a mesma
// afirmacao."* — e `:223` registra que a tela materializada JÁ satisfazia isso (`D5.3`, "lacuna de
// `FLOW` como traço na linha de base"). O sub-eixo não herdou o traço: `WhitespaceItem` acerta
// dois dos três canais (não interpola, não zera) e falha o terceiro, a MARCA.
// `[MEDIDO 2026-09-15: 36 lacunas isoladas de 1 min em 24h (2,5%) e `zeros_exatos = 0` — a
//  colisão zero<->ausência não está viva HOJE, mas é estrutural, não sortuda]`
//
// AS MARCAS VIVEM NUMA ESCALA SÓ DELAS, e isso é estrutural e não estético: penduradas na escala
// do volume elas mudariam de altura com o dado (e entrariam no autoscale dele). A escala das
// marcas declara uma faixa FIXA em "pixels nominais da banda do sub-eixo", então o valor de cada
// marca se lê direto como altura.
const VOLUME_MARKS_PRICE_SCALE_ID = "volume_marks";
const VOLUME_MARKS_BAND_PX = CHART_HEIGHT_PX * (1 - VOLUME_SCALE_MARGINS.top);
// ⚠️ NOMINAL, NÃO MEDIDO — a banda real é ~15% menor que `VOLUME_MARKS_BAND_PX` porque o eixo de
// tempo come altura do painel. As alturas ABAIXO são as nominais; as MEDIDAS contra a biblioteca
// real, e a ordenação estrita entre elas, estão em `volume-subaxis-geometry.test.ts`
// `[MEDIDO 2026-09-15: ausência 1,70px < zero 5,10px < menor barra positiva 10,39px]`.
const ABSENCE_MARK_PX = 2;
const ZERO_MARK_PX = 6;
// ⛔ `ADR-010` GOVERNA A TINTA, E AS DUAS SÃO DA RAMPA DE PROCEDÊNCIA (`D-4`: luminância, hue
// zero). Nem verde/vermelho (são `fill` de DIREÇÃO de preço, e volume não tem direção) nem
// violeta (`dataBrokenInk` é INTEGRIDADE do dado, e uma lacuna de grade não é dado quebrado — é
// operacional; `S3Inspector.tsx:26` escreve a mesma distinção). A atribuição segue a semântica da
// rampa: ausência é o que NÃO se sabe, então tinta FRACA; zero legítimo é um fato OBSERVADO,
// então tinta FORTE. A distinção viaja por dois canais no canvas (luminância E altura) e por um
// terceiro em texto (`VolumeMarksLegend`), para que nenhuma perda isolada a apague.
const ABSENCE_MARK_COLOR_ROLE = "provenanceWeak" as const;
const ZERO_MARK_COLOR_ROLE = "provenanceStrong" as const;

// ⛔ AND THE SAME ARGUMENT, APPLIED WHERE IT IS STRONGER — `DR-2` of
// `gates/design-review-painel-cvd.md`. The two CVD series used to share the default right
// scale, in the same commit that wrote the sentence four lines above. The review's point is
// arithmetic, not taste: the cumulative IS the running sum of the very deltas plotted beside
// it, anchored at `window.startMs` (`page.tsx`, `cvdAnchorMs`), i.e. BEFORE the first plotted
// point — so `max|cum| >= max|delta|` BY CONSTRUCTION, with equality only in the degenerate
// single-bucket case. On a shared scale the axis reads in units of cumulative and the delta
// gets `max|delta| / max|cum|` of the panel's height. That is the flattening the volume
// sub-axis already refuses.
//
// So: delta keeps the default right scale (it is the series the readout and `DoD-3` are about,
// and it is the one that gets axis labels), and the cumulative goes to a scale of its own,
// stacked under it — the same `priceScaleId` + `scaleMargins` idiom as the volume sub-axis.
// ⛔ The MARGINS are form (`ui-designer` + `ux-ui-mastery`); the SEPARATION is structural.
const CVD_CUMULATIVE_PRICE_SCALE_ID = "cvd_cumulative";
const CVD_DELTA_SCALE_MARGINS = { top: 0.05, bottom: 0.55 } as const;
const CVD_CUMULATIVE_SCALE_MARGINS = { top: 0.55, bottom: 0.05 } as const;

// ── `T-05.9` — THE LIQUIDATION PANE (M4), AND THE SPARSEST SERIES ON THE SCREEN ───────────────
//
// ⛔ SELECTOR STABILITY, first: `e2e/13-liquidacoes-dado-real.spec.ts` (`T-05.11`) finds the pane by
// THESE strings and reads `data-liquidation-present-points` off each cohort. They are a CONTRACT,
// not styling — the `design_gate` (`T-05.10`) may change height, color, wording and order without
// touching any of them, which is what makes the two tasks parallelizable. `section[aria-label=
// "Liquidações"]` is NOT the hook: a label is pt-BR microcopy the `ui-designer` may rewrite, and
// pinning a DATA assertion to UI TEXT is how a change of form breaks a test about data.
const LIQUIDATION_PANE_TESTID = "liquidation-pane";
/** One testid per COHORT, derived from the cohort name — the two legs are two series and the e2e
 * has to be able to assert about each one. Deriving instead of enumerating keeps the pair glued to
 * the `cohort` the catalog publishes (`liquidation_catalog.py::COHORTS`), so a third leg could not
 * be born without a hook. */
function liquidationCohortTestId(cohort: string): string {
  return `liquidation-cohort-${cohort}`;
}

// ⛔ THE THREE SCALES OF THIS PANE, AND THE SEPARATION IS GEOMETRIC — NOT CARE, IMPOSSIBILITY.
//
// Phase `01`'s lesson is literal (`gates/design-01.md` §A3, `BLOCKER-2`): the distinction between
// "we do not know" and "it was zero" has to travel in SEPARATE SERIES, never in an `if` on color —
// *"two series make the collision stop being expressible"*. Here the form is reused AND HARDENED,
// because in this series the collision is not structural-but-dormant as it was in volume
// (`zeros_exatos = 0` there): it is ALIVE TODAY. Over the 4-day window the route asks for, the
// `long` cohort answers `191` observations in `5.761` grid slots, and `62` of them are LEGITIMATE
// ZERO; the `short` one, `50` zeros in `76` observations over 24 h `[MEDIDO 2026-09-16, GET
// /api/v1/series-history, bar_policy=final_only]`. Legitimate zero is a fact of TYPE here: `ZL-3`
// of `domain/liquidation_zero_legitimacy.py`.
//
// WHAT PHASE `01` LEFT OPEN AND THIS PANE CLOSES: there the ordering absence < zero < smallest bar
// was MEASURED over a synthetic universe — true for that data, not guaranteed for all data. Here
// the two bands are DISJOINT by SCALE MARGIN, and what separates them is an inequality between two
// constants of this section, not a property of the data:
//
//     1 - LIQUIDATION_BAR_SCALE_MARGINS.bottom  <  LIQUIDATION_MARKS_SCALE_MARGINS.top
//                        0,85                   <              0,88
//
// THE GUARANTEE, in the exact form in which it is true: **every DRAWN bar ends at the FLOOR of the
// bar band**, `y = H·(1 - bottom)`, and the marks band only starts at `H·top`. The floor is
// invariant in value because the bar scale is AUTOSCALED and the bar series is the ONLY one hung on
// it: the smallest visible value is, by definition, the one that lands on the floor.
// `[MEDIDO 2026-09-16, liquidation-geometry.test.ts against the real library: for micro ∈ {2 ·
//  0,26 · 0,1 · 0,01 · 0,003} the lowest drawn bar sits at `y = 162,20` in the four below the
//  baseline, against a marks-band top of `168,96` and a zero-mark top of `175,97`]`.
//
// ⛔ WHAT THE GUARANTEE IS NOT, AND THE PREVIOUS VERSION OF THIS SECTION ASSERTED: *"no bar, of any
// value, reaches the marks band, because the BASELINE of the bars sits above the top of the
// marks"*. The sentence was REMOVED for being FALSE, and `T-05.10`'s `design_gate` (`M-1`,
// `gates/design-05.md`) falsified it with a number: the baseline is NOT a floor. In a histogram
// with `base = 1`, a value BELOW the base draws DOWNWARD from it — and what moves when the data
// shrinks is the baseline (from `y = 162,20` to `118,76` with a bar of `0,003`; to `74,88` if the
// whole series comes in BASE unit), never the floor. The floor is what closes the collision.
//
// ⚠️ AND IT IS NOT UNCONDITIONAL IN THE CONFIGURATION — only in the DATA. Two things sustain it, and
// both are mutation-tested in `liquidation-geometry.test.ts`: (1) the inequality above; (2) the
// autoscale of the bar scale. Pinning the autoscale (an `autoscaleInfoProvider` on the bar series)
// hands the collision back at once: with it, the `0,003` bar goes to `y = 221,47`, BELOW the pane's
// own floor (`191`) `[MEDIDO 2026-09-16, the test's MORDE]`.
//
// ⚠️ WHAT IT DOES NOT COVER: a bar OUTSIDE the visible window. `priceToCoordinate` extrapolates for
// it (`0,26 → 176,36`, inside the zero band), but nothing is painted — it is not in the viewport.
// When it enters, the autoscale includes it and it lands on the floor. That the DECLARED window is
// not the DRAWN one is `M-2` of the same report, escalated: it is transversal to the 4 panes and is
// not solved here.
const LIQUIDATION_BAR_SCALE_MARGINS = { top: 0.05, bottom: 0.15 } as const;
const LIQUIDATION_MARKS_PRICE_SCALE_ID = "liquidation_marks";
const LIQUIDATION_MARKS_SCALE_MARGINS = { top: 0.88, bottom: 0 } as const;
const LIQUIDATION_MARKS_BAND_PX = CHART_HEIGHT_PX * (1 - LIQUIDATION_MARKS_SCALE_MARGINS.top);

// ⛔ `log10` SCALE, BY THE SAME ARITHMETIC ARGUMENT AS PHASE `01`'s `BLOCKER-1` — and here it is
// STRONGER, not weaker: 1-minute volume had `max/p50 = 60,8x` and already put 67,9% of the bars
// below 1 px; liquidation has `max/p50 = 443,8x` (`min 75,62 · p50 6.489,82 · max 2.880.132,45`)
// `[MEDIDO 2026-09-16, n=191 present grid slots over 4 days of real data]`. On a linear scale
// anchored at the maximum, the MEDIAN bar of this series would sit below half a pixel.
// `PriceScaleMode.Logarithmic` moves the GEOMETRY and leaves the number intact (`ADR-003` FR-2
// applied to a scale); transforming the DATA would put `log10(v)` inside the series, and every
// reading the library makes of it would come out of there.
//
// Base `1` for the same reason as the volume sub-axis: an ABSOLUTE anchor in the series' unit (USD),
// so that the same height means the same value in any window.
const LIQUIDATION_LOG_BASE = 1;

// The two marks of the bottom band, in "nominal pixels of the band". The 3:1 ratio between them is
// the same order of magnitude phase `01` measured as enough to separate the two assertions; what
// proves the separation in REAL pixels, against the library, is `liquidation-geometry.test.ts`.
const LIQUIDATION_ABSENCE_MARK_PX = 6;
const LIQUIDATION_ZERO_MARK_PX = 18;
// ⛔ `ADR-010` GOVERNS THE INK, and the assignment here follows the SEMANTICS of the provenance ramp
// (`D-4`: luminance, zero hue), not taste: absence is what is NOT known ⇒ WEAK ink; legitimate zero
// and a present bar are OBSERVATIONS ⇒ STRONG ink, and what separates them is the height, which is
// precisely the quantity that differs between them. Neither green/red (they are the `fill` of price
// DIRECTION, and `long`/`short` here are liquidation COHORTS, not candle direction — painting the
// liquidation of longs in red would invite reading the cohort as the market's direction) nor violet
// (`dataBrokenInk` is data INTEGRITY, and a grid gap is not broken data).
const LIQUIDATION_ABSENCE_MARK_COLOR_ROLE = "provenanceWeak" as const;
const LIQUIDATION_ZERO_MARK_COLOR_ROLE = "provenanceStrong" as const;
const LIQUIDATION_BAR_COLOR_ROLE = "provenanceStrong" as const;

/**
 * The sub-axis' DOM anchor. The bars themselves are drawn on the price panel's own `<canvas>`
 * (`lightweight-charts`), which a DOM assertion cannot see — so this element carries the facts
 * about them: `data-volume-present-points` (how many 1-minute buckets have a real number) and
 * the "leitura atual" readout, which prints `SEM_PONTO` when the last instant has nothing.
 *
 * For M1 the present-slot count IS the count of distinct native bars — no `RN-S1` `/5` divisor,
 * because `klines_volume` is `1m` native and nothing here is a ladder (`view-model.ts`
 * `countPresentSlots`).
 */
/** `YYYY-MM-DD HH:MM UTC`, built off the epoch instant with no locale in the path: this string
 * is a FACT about the data (which instant), not a presentation choice, and a locale-dependent
 * rendering of it would make the same screen say different things to different readers. */
function formatUtcMinute(instantMs: number): string {
  return `${new Date(instantMs).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** The readable horizon, DECLARED rather than left to be inferred from a flat left edge — see
 * `VolumeSubAxisData.firstPresentMs` for the measurement that made this necessary. It reports
 * two numbers and one instant, all of them the route's own; it never hides, shortens or
 * fabricates anything.
 *
 * ⛔ THE WORDING AND THE PLACEMENT ARE FORM, AND FORM IS THE `ui-designer`'S WITH THE
 * `ux-ui-mastery` VERDICT (`CLAUDE.md` §"Design — autonomia delegada, com gate de validação").
 * What a builder is allowed to decide, and all that is decided here, is that the FACT is on
 * screen and machine-readable — the sentence itself is a sober placeholder, submitted to
 * `T-01.8`, not a design decision. The `data-fact`/`data-readable-since-ms` pair is the CONTRACT
 * half and must survive any restyling, same split the volume sub-axis already declares. */
function ReadableHorizon({ volume }: { readonly volume: VolumeSubAxisData }) {
  const gridSlots = volume.slots.length;
  const sinceText =
    volume.firstPresentMs === null
      ? "Nenhuma grade legível no período"
      : `Dado legível desde ${formatUtcMinute(volume.firstPresentMs)}`;
  return (
    <p
      data-fact={`volume_readable_horizon:${volume.presentPoints}/${gridSlots}`}
      data-readable-since-ms={volume.firstPresentMs ?? ""}
      className="text-sm text-provenance-weak"
    >
      {sinceText} — {volume.presentPoints}/{gridSlots} grades de 1 min na janela.
    </p>
  );
}

/** ⛔ O RÓTULO QUE O `BLOCKER-1` EXIGE JUNTO COM A ESCALA, e a exigência é literal no laudo:
 * *"`log10` exige rótulo de eixo declarando a escala — um eixo logarítmico não rotulado é pior
 * que um linear ilegível."* Pior porque um eixo log não declarado convida à leitura errada: quem
 * lê uma barra com o dobro da altura como o dobro do volume está lendo o quadrado dele.
 *
 * A escala do sub-eixo é uma escala SOBREPOSTA (`priceScaleId` próprio), e uma dessas não desenha
 * rótulo numérico nenhum no canvas — então o rótulo de eixo só pode existir aqui, no DOM. Isso é
 * uma vantagem, não um remendo: aqui ele é texto, alcança leitor de tela e é asserível. */
function VolumeScaleNote() {
  return (
    <p data-fact="volume_scale:log10" className="text-sm text-provenance-weak">
      Altura da barra em escala log10 (base {VOLUME_LOG_BASE}) — cada degrau de altura é uma ordem de
      grandeza, não uma diferença absoluta.
    </p>
  );
}

/** As DUAS marcas de linha de base, nomeadas — o terceiro canal do `BLOCKER-2`, pelo mesmo motivo
 * que `CvdLegend` existe: dentro do `<canvas>` nenhuma legenda alcança, e uma distinção que só
 * vive em pixels morre num screenshot monocromático ou num leitor de tela. Aqui ela viaja em
 * palavras, e as palavras dizem a diferença que o gate cobra: *"não houve"* ≠ *"não sabemos"*.
 *
 * `aria-hidden` no glifo é deliberado, mesmo critério de `CvdLegend`: ele é a cópia redundante do
 * que as palavras ao lado já carregam, e anunciar "▁" não acrescenta nada. A tinta sai de
 * `colorTokens()`, a MESMA chamada de onde sai a da série, então uma legenda que mente sobre a
 * cor da marca não é expressável. */
function VolumeMarksLegend() {
  const tokens = colorTokens();
  return (
    <ul className="flex gap-4 text-sm text-provenance-weak" data-fact="volume_marks_legend:2">
      <li>
        <span aria-hidden="true" style={{ color: tokens[ABSENCE_MARK_COLOR_ROLE] }}>
          ▁
        </span>{" "}
        Sem dado — traço baixo e apagado na linha de base (não sabemos)
      </li>
      <li>
        <span aria-hidden="true" style={{ color: tokens[ZERO_MARK_COLOR_ROLE] }}>
          ▃
        </span>{" "}
        Zero do fornecedor — traço alto e claro na linha de base (sabemos: foi zero)
      </li>
    </ul>
  );
}

function VolumeSubAxis({ volume, status }: { readonly volume: VolumeSubAxisData; readonly status: PanelStatus }) {
  const readingText =
    volume.reading.kind === "absent" || volume.reading.value === null ? ABSENCE_TOKEN : String(volume.reading.value);
  return (
    <div
      role="group"
      aria-label="Volume (sub-eixo de Preço)"
      data-testid={VOLUME_SUBAXIS_TESTID}
      data-volume-present-points={volume.presentPoints}
    >
      <h3 className="font-label-caps text-label-caps text-on-surface">Volume (1m)</h3>
      <VolumeScaleNote />
      <VolumeMarksLegend />
      <p data-fact={`volume_last_reading:${volume.reading.kind}`} className="text-sm text-provenance-weak">
        Leitura atual: {readingText}
      </p>
      <ReadableHorizon volume={volume} />
      <PartialCoverageMark factKey="volume_partial_coverage" summary={volume.partialCoverage} />
      <AbsenceNote status={status} />
    </div>
  );
}

/**
 * `T-01.8` — the price pane's DOM contract about the candle: how many bars the canvas got, out
 * of how many grid slots, and how many buckets had SOME of the four readings and therefore drew
 * nothing at all.
 *
 * ⛔ THE MACHINE KEY IS ASCII AND DOES NOT COME FROM THE MICROCOPY (`SPEC-008`/`D7`,
 * `RF-8`/`RN-5`). Before `T-04.3` (`CST-230`) this page built `` `live_${label}:…` `` straight
 * off the pt-BR label and published `data-fact="live_preço:attempted"` — accent and all, a key
 * an operator's `grep` could not type. `LiveRow` now takes `factKey` (ASCII, stable) separately
 * from `label` (pt-BR microcopy) — see its own docstring. `price_candles` and
 * `price_candle_partial_buckets` are stable identifiers the same way; the sentence beside them is
 * pt-BR microcopy and the `ui-designer` may rewrite every word of it without moving either key.
 *
 * ⚠️ FORM IS THE `design_gate`'S (`T-01.10`), NOT A BUILDER'S: the wording and the placement
 * here are the sober placeholder that lets the fact be seen and asserted at all — the same
 * split `ReadableHorizon` states for the volume sub-axis.
 *
 * `[MINOR-1]`/`A6` OF THAT GATE, APPLIED: the clause "as quatro leituras do mesmo bucket:
 * abertura, máxima, mínima e fechamento" was CUT. It taught what an OHLC is, to a single user
 * who is a heavy TradingView user (`STITCH_CONTEXT.md:58`), on a line he reads every session —
 * H8, aesthetic and minimalist design, which the skill anchors in Sweller's extraneous load.
 * Everything the gate said to KEEP is untouched: numerator AND denominator, `partialBuckets`
 * with a number of its own, the un-tinted `text-provenance-weak` numeral, and "nada desenhado,
 * nunca uma vela de altura zero".
 */
function PriceCandleFacts({ priceCandles }: { readonly priceCandles: PriceCandleData }) {
  return (
    <p
      data-fact={`price_candles:${priceCandles.drawnCandles}/${priceCandles.gridSlots}`}
      data-price-partial-buckets={priceCandles.partialBuckets}
      className="text-sm text-provenance-weak"
    >
      Vela completa em {priceCandles.drawnCandles} de {priceCandles.gridSlots} buckets de 1 min.{" "}
      {priceCandles.partialBuckets} {priceCandles.partialBuckets === 1 ? "bucket" : "buckets"} com
      leitura incompleta {priceCandles.partialBuckets === 1 ? "fica" : "ficam"} em lacuna — nada
      desenhado, nunca uma vela de altura zero.
    </p>
  );
}

function PricePane({
  panels,
  priceCandles,
  status,
  volume,
  volumeStatus,
}: {
  readonly panels: S2Panels;
  readonly priceCandles: PriceCandleData;
  readonly status: PanelStatus;
  readonly volume: VolumeSubAxisData;
  readonly volumeStatus: PanelStatus;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useLightweightChart(containerRef, PRICE_PANEL_INDEX, (chart) => {
    const style: Partial<CandlestickSeriesOptions> = candlestickSeriesColors();
    const series: ISeriesApi<"Candlestick"> = chart.addSeries(CandlestickSeries, style);
    series.setData(candlestickSeriesLossless(panels.price.series.slots) as never);
    // `T-05.9` (plan `05` DoD 7): "a barra nova está desenhada" — this `build` callback only
    // re-runs when the `AxisSyncStore` identity changes (`useLightweightChart`'s own docstring),
    // which a successful history page does on purpose (`axis-sync-provider.tsx`'s own docstring).
    // Recording HERE, right after `setData`, is the literal instant the DoD names as the
    // difference between "resposta chegou" and "pixel" — see `history-page-latency-probe.ts`.
    recordHistoryPageDrawn();

    // The volume sub-axis, on the SAME chart as price (`SPEC-007 §3.6`) and on its own price
    // scale. `lineSeriesLossless` is REUSED, not copied: it already maps a `value: null` slot
    // to a bare `{time}` `WhitespaceItem`, which a histogram series renders as NO BAR — never
    // a zero-height bar at zero, which is what `RN-1` forbids. A histogram accepts the same
    // `{time, value}` / `{time}` items a line does.
    //
    // ⚠️ The two series on this panel run on DIFFERENT native grids, and that is deliberate and
    // visible (`SPEC-007 §4.1`): price is `klines_last` at `5m` served on the `1m` grid — a
    // ladder — while volume is `klines_volume` at `1m` native. The `design_gate` of `T-01.8` is
    // meant to see it, so nothing here hides it.
    const volumeStyle: Partial<HistogramSeriesOptions> = {
      color: colorTokens().provenanceWeak,
      priceScaleId: VOLUME_PRICE_SCALE_ID,
      base: VOLUME_LOG_BASE,
      priceLineVisible: false,
      lastValueVisible: false,
    };
    const volumeSeries: ISeriesApi<"Histogram"> = chart.addSeries(HistogramSeries, volumeStyle);
    // ⛔ `BLOCKER-1`, pago aqui: `PriceScaleMode.Logarithmic`, NÃO uma transformação do DADO. A
    // diferença importa e não é de estilo — transformar o dado poria `log10(v)` dentro da série,
    // e daí sai toda leitura que a biblioteca faz dela (crosshair, `priceFormat`, qualquer
    // rótulo futuro). O modo de escala move a GEOMETRIA e deixa o número intacto, que é a
    // fronteira de `ADR-003` FR-2 aplicada a uma escala.
    volumeSeries.priceScale().applyOptions({
      scaleMargins: VOLUME_SCALE_MARGINS,
      mode: PriceScaleMode.Logarithmic,
    });
    // E a série de barras recebe só o que uma escala log consegue posicionar: `log10(0)` não tem
    // coordenada, e um `0` desenhado como barra de altura zero seria, pixel a pixel, a marca da
    // ausência. Os dois estados saem daqui e ganham marca própria abaixo.
    volumeSeries.setData(positiveValueSeriesLossless(volume.slots) as never);

    // ⛔ `BLOCKER-2`, pago aqui — DUAS séries de marca, numa escala de faixa FIXA, para que
    // "não sabemos" e "foi zero" nunca sejam os mesmos pixels. Uma só série com cor condicional
    // resolveria a aparência e deixaria a distinção depender de um `if` que um refactor apaga
    // sem que nada reprove; duas séries fazem a colisão deixar de ser expressável.
    const markStyle = (color: string): Partial<HistogramSeriesOptions> => ({
      color,
      priceScaleId: VOLUME_MARKS_PRICE_SCALE_ID,
      priceLineVisible: false,
      lastValueVisible: false,
      // A faixa fixa: a altura da marca é a da própria marca, não a do dado ao lado dela.
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: VOLUME_MARKS_BAND_PX } }),
    });
    const absenceSeries: ISeriesApi<"Histogram"> = chart.addSeries(
      HistogramSeries,
      markStyle(colorTokens()[ABSENCE_MARK_COLOR_ROLE]),
    );
    absenceSeries.priceScale().applyOptions({ scaleMargins: VOLUME_SCALE_MARGINS });
    absenceSeries.setData(absenceMarkSeries(volume.slots, ABSENCE_MARK_PX) as never);
    const zeroSeries: ISeriesApi<"Histogram"> = chart.addSeries(
      HistogramSeries,
      markStyle(colorTokens()[ZERO_MARK_COLOR_ROLE]),
    );
    zeroSeries.setData(zeroMarkSeries(volume.slots, ZERO_MARK_PX) as never);
  });
  const closeSlots = panels.price.series.slots.map((slot) => ({
    time: slot.time,
    value: slot.candle === null ? null : slot.candle.close,
  }));
  // Price's own native cadence IS the axis step (`ONE_MINUTE_MS`) — the two `resolveStockReading`
  // parameters happen to be the same value here, unlike OI's call below (`T-02.1`).
  const reading = resolveStockReading(closeSlots, ONE_MINUTE_MS, ONE_MINUTE_MS, lastInstantMs(panels));
  const readingText =
    reading.kind === "absent"
      ? "SEM_PONTO"
      : reading.kind === "held"
        ? `${reading.value} (${formatHeldStockLabel(reading)})`
        : String(reading.value);
  return (
    <section aria-label="Preço" data-testid={PRICE_PANE_TESTID} data-price-candles={priceCandles.drawnCandles}>
      <h2 className="font-label-caps text-label-caps text-on-surface">
        Preço ({panels.price.priceSource}, {panels.price.priceUse})
      </h2>
      <div ref={containerRef} data-fact={`price_slots:${panels.price.series.slots.length}`} />
      <p data-fact={`price_last_reading:${reading.kind}`} className="text-sm text-provenance-weak">
        Leitura atual: {readingText}
      </p>
      <PriceCandleFacts priceCandles={priceCandles} />
      <AbsenceNote status={status} />
      <VolumeSubAxis volume={volume} status={volumeStatus} />
    </section>
  );
}

/** The readable horizon of the OI pane — the same two numbers and one instant the other two
 * panes declare, over the OI pane's own NATIVE 5-minute grid.
 *
 * ⛔ THE DENOMINATOR IS THE NATIVE GRID, NOT THE WIRE GRID, and the difference is the whole
 * `RN-S1` point: `panels.oi.slots` has one slot per 5-minute bucket of the window (1.152 over 4
 * days), while the route answered 5.761 rows on the 1-minute grid. Writing `N/5761` here would
 * be the staircase wearing the costume of a measurement.
 *
 * Written out rather than shared with `ReadableHorizon`/`CvdReadableHorizon` for the reason that
 * one already states in full: the literal `data-fact` expressions are pinned, character for
 * character, by three different contract tests, and merging them into one parameterized
 * component is how a refactor silently re-points somebody else's falsifier. */
function OiReadableHorizon({ oi, gridSlots }: { readonly oi: OiPaneData; readonly gridSlots: number }) {
  const sinceText =
    oi.firstPresentMs === null
      ? "Nenhuma grade legível no período"
      : `Dado legível desde ${formatUtcMinute(oi.firstPresentMs)}`;
  return (
    <p
      data-fact={`oi_readable_horizon:${oi.nativeBars}/${gridSlots}`}
      data-readable-since-ms={oi.firstPresentMs ?? ""}
      className="text-sm text-provenance-weak"
    >
      {sinceText} — {oi.nativeBars}/{gridSlots} barras nativas de 5 min na janela.
    </p>
  );
}

/**
 * `RNF-2` — THE PANE DOES NOT SHOW A NUMBER OLDER THAN THE SERIES' OWN PERIODICITY WITHOUT
 * SAYING SO.
 *
 * The ceiling is `max_staleness_ms` from the catalog row this panel resolved (`600_000` for open
 * interest = 2 x the `5m` native bucket) — already served, not invented, and the SAME number
 * `as_of` applied server-side. No route changed form for this (`RF-5`).
 *
 * ⚠️ WHY THIS IS NOT REDUNDANT WITH `formatHeldStockLabel` ON THE READOUT ABOVE IT, which also
 * says "held since": that label only exists while `resolveStockReading` still HAS a value to
 * hold — at most one native bucket back (`s2-absence-policy.ts` §5.11). Past that the readout
 * goes to `SEM_PONTO` and says nothing at all about WHEN the data stopped. This line covers the
 * whole range, including the state the readout cannot describe: "a última leitura desta série é
 * de 6 horas atrás", which is exactly the thing an operator must not have to infer from a flat
 * line. `unknown` prints as ignorance, never as freshness.
 *
 * ⛔ WORDING AND PLACEMENT ARE FORM — the `ui-designer`'s, with the `ux-ui-mastery` verdict
 * (`CLAUDE.md` §"Design — autonomia delegada, com gate de validação"). What a builder decides,
 * and all that is decided here, is that the FACT is on screen and machine-readable.
 */
function OiFreshness({ oi }: { readonly oi: OiPaneData }) {
  // ⚠️ `A-4.2` (2026-09-15): `freshness.observedMs`, published below as
  // `data-freshness-observed-ms`, is the `available_at` of the right-edge reading — a PUBLICATION
  // instant, no longer the last grid slot the server's carry-forward managed to fill. The
  // attribute NAME did not change and its MEANING did; the out-of-process reader
  // (`e2e/12-oi-dado-real.spec.ts`) was corrected in the same commit.
  const { freshness } = oi;
  const text =
    freshness.kind === "unknown"
      ? "Frescor não avaliável — nenhuma leitura nesta janela."
      : `Última leitura há ${formatSpan(freshness.ageMs)} em relação ao fecho da janela ` +
        // ⚠️ NO ` UTC` HERE: `formatUtcMinute` already ends in it (`:351`). The literal that used to
        // sit after this call printed `UTC UTC` on screen, in 8 of 8 renderings — `design-review`
        // `V-1`. The other four call sites (`:370`, `:481`, `:636`, `:771`) never repeated it; this
        // one did — which is why the fix is HERE and not in the formatter.
        `(${formatUtcMinute(freshness.referenceMs)}) — teto desta série: ${formatSpan(freshness.ceilingMs)}.` +
        (freshness.kind === "stale" ? " ⚠️ Mais velha que o teto — o valor acima é DADO VELHO." : "");
  return (
    <p
      role={freshness.kind === "stale" ? "status" : undefined}
      data-fact={`oi_freshness:${freshness.kind}`}
      data-freshness-age-ms={freshness.ageMs ?? ""}
      data-freshness-ceiling-ms={freshness.ceilingMs ?? ""}
      data-freshness-observed-ms={freshness.observedMs ?? ""}
      data-freshness-reference-ms={freshness.referenceMs}
      className="text-sm text-provenance-weak"
    >
      {text}
    </p>
  );
}

/**
 * A millisecond span as a UNIT LADDER, pt-BR — presentation of a number this component was handed,
 * never a recomputation of it (the `data-` attributes beside it carry the raw ms).
 *
 * ⛔ FLOOR, NOT ROUND, and the difference is the whole point (`design-review` `QW-1`): the `stale`
 * verdict asserts `ageMs > ceilingMs`, and `Math.round` printed BOTH sides of that inequality as
 * `10 min` for every age in `(600_000, 630_000)` ms — the screen contradicting its own sentence in
 * the same line. Flooring plus a seconds term makes the two numerals differ exactly when the
 * verdict says they differ.
 *
 * And the hour rung is not decoration: the largest age actually measured on this series is
 * `31_740_000 ms` [DOC: gates/T-03.5-T-03.6-builder.md], which the old function printed as
 * `529 min` — making the operator divide by 60 in his head on the very screen where he is deciding
 * whether to trust the number.
 */
function formatSpan(spanMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(spanMs / 1_000));
  if (totalSeconds < 3_600) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`;
  }
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

/**
 * `T-04.1`/`RN-5`, `CA-9` — the three terms the owner's circled defect asks for, spelled from
 * `oi.provenance` (already DERIVED server-side, `view-model.ts::deriveOiProvenanceLabel`): this
 * component only interpolates the object it was handed, exactly the RSC-boundary discipline
 * every other prop on this file follows — it decides nothing about what the terms say.
 *
 * ⛔ THE `data-fact` IS RENDERED EVEN WHEN `provenance` IS `null` (no entry resolved), because
 * `CA-9`'s falsifier greps for the ATTRIBUTE: a panel that cannot identify its own series must
 * still publish a machine-readable fact saying so, never drop the attribute off the page.
 */
function OiProvenance({ oi }: { readonly oi: OiPaneData }) {
  const { provenance } = oi;
  const fact =
    provenance === null
      ? "oi_provenance:unresolved"
      : `oi_provenance:grandeza=${provenance.grandeza};universo=${provenance.universo};coorte=${provenance.coorte}`;
  const text =
    provenance === null
      ? "Procedência não identificada — nenhuma série resolvida no catálogo."
      : `Grandeza: ${provenance.grandeza} · Universo: ${provenance.universo} · Coorte: ${provenance.coorte}`;
  return (
    <p data-fact={fact} className="text-sm text-provenance-weak">
      {text}
    </p>
  );
}

function OiPane({
  panels,
  status,
  oi,
  wallState,
}: {
  readonly panels: S2Panels;
  readonly status: PanelStatus;
  readonly oi: OiPaneData;
  /** `T-05.6` — `slot-coverage.ts::panelWallState` against the pager's own fetched window and
   * THIS series' declared floor, computed once in `SymbolClient` and handed down rather than
   * recomputed per pane (every pane would otherwise need `pager.window` threaded to it anyway). */
  readonly wallState: SlotCoverageState;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useLightweightChart(containerRef, OI_PANEL_INDEX, (chart) => {
    const style: Partial<LineSeriesOptions> = { color: colorTokens().provenanceStrong };
    const series: ISeriesApi<"Line"> = chart.addSeries(LineSeries, style);
    series.setData(lineSeriesLossless(panels.oi.slots) as never);
  });
  // `panels.oi.slots` sits on the SHARED axis grid since `T-02.1` (`ONE_MINUTE_MS`, `D-C3.2`),
  // no longer OI's own native grid — `panels.oi.timeframeMs` (5 min) is passed SEPARATELY, as
  // the cap `resolveStockReading`'s held-value rule (`D5.2`) reads against.
  const reading = resolveStockReading(panels.oi.slots, ONE_MINUTE_MS, panels.oi.timeframeMs, lastInstantMs(panels));
  const readingText =
    reading.kind === "absent"
      ? ABSENCE_TOKEN
      : reading.kind === "held"
        ? `${reading.value} (${formatHeldStockLabel(reading)})`
        : String(reading.value);
  return (
    <section
      aria-label="Open Interest"
      // ⛔ THE STABLE SELECTOR (`T-03.5`), and the same KIND of contract `VOLUME_SUBAXIS_TESTID`
      // and `CVD_PANE_TESTID` already are: `e2e/12-oi-dado-real.spec.ts` finds this pane by THIS
      // string and reads `data-oi-native-bars` off it. Form may change without touching either.
      data-testid={OI_PANE_TESTID}
      // ⛔ THE TWO NUMBERS, SIDE BY SIDE, AND ONLY ONE OF THEM IS "QUANTO DADO EXISTE".
      // `data-oi-native-bars` is the count of 5-minute NATIVE buckets with a value — `DoD-3`'s
      // `N >= 30`. `data-oi-wire-points` is the staircase: readable rows on the 1-minute grid the
      // route serves (`GA-2`), ~5x larger for the same data. Both are published so the ratio is
      // checkable from outside; the e2e asserts the pane's headline number is the FIRST one.
      data-oi-native-bars={oi.nativeBars}
      data-oi-wire-points={oi.wirePoints}
    >
      <h2 className="font-label-caps text-label-caps text-on-surface">Open Interest (5m)</h2>
      <div ref={containerRef} data-fact={`oi_slots:${panels.oi.slots.length}`} />
      <p data-fact={`oi_last_reading:${reading.kind}`} className="text-sm text-provenance-weak">
        Leitura atual: {readingText}
      </p>
      <OiFreshness oi={oi} />
      <OiReadableHorizon oi={oi} gridSlots={panels.oi.slots.length} />
      <OiProvenance oi={oi} />
      {wallState === "beyond-coverage" ? <BeyondCoverageBadge factKey="oi_coverage" /> : null}
      <AbsenceNote status={status} />
    </section>
  );
}

/** The readable horizon of the CVD pane — the SAME two numbers and one instant `ReadableHorizon`
 * declares for the volume sub-axis, over the CVD pane's own slots.
 *
 * ⛔ WRITTEN OUT RATHER THAN SHARED WITH `ReadableHorizon`, ON PURPOSE. Generalizing that
 * component would rewrite the literal expressions
 * `volume_readable_horizon:${volume.presentPoints}/${gridSlots}` and
 * `const gridSlots = volume.slots.length`, and those two are PINNED, character for character, BY
 * ANOTHER TASK'S CONTRACT TEST (`volume-subaxis-dom-contract.test.ts`, `T-01.7`/`T-01.9`, in
 * flight in a parallel worktree). Merging two contracts into one parameterized component is how a
 * refactor silently re-points somebody else's falsifier; the duplication is ~12 lines and each
 * copy is guarded from its own side. Same reasoning `08-symbol-dado-real.spec.ts` gives for
 * duplicating a selector instead of importing it. */
function CvdReadableHorizon({ cvd, gridSlots }: { readonly cvd: CvdPaneData; readonly gridSlots: number }) {
  const sinceText =
    cvd.firstPresentMs === null
      ? "Nenhuma grade legível no período"
      : `Dado legível desde ${formatUtcMinute(cvd.firstPresentMs)}`;
  return (
    <p
      data-fact={`cvd_readable_horizon:${cvd.presentPoints}/${gridSlots}`}
      data-readable-since-ms={cvd.firstPresentMs ?? ""}
      className="text-sm text-provenance-weak"
    >
      {sinceText} — {cvd.presentPoints}/{gridSlots} grades de 1 min na janela.
    </p>
  );
}

/** `DR-3`/WCAG 1.4.1 — the pane's two lines, named. Before this, the ONLY thing on screen that
 * mentioned them was the `<h2>` ("CVD (delta e acumulado)"); which line was which could be
 * discovered by trial and error and nothing else, and with `DR-1` unfixed the operator did not
 * even see two lines.
 *
 * Three channels carry the same distinction, on purpose, so no single loss erases it: the COLOR
 * (`provenanceStrong`/`provenanceWeak`), the DASH PATTERN (`LineStyle.Solid`/`Dashed`, drawn in
 * the canvas), and this TEXT. `aria-hidden` on the swatch is deliberate — it is the redundant
 * copy of information the adjacent words already carry, and announcing "▬" adds nothing.
 *
 * The swatch's color comes from `colorTokens()`, the SAME call the series style comes from, so a
 * legend that lies about a series colour is not expressible here.
 *
 * ⛔ WORDING AND PLACEMENT ARE FORM — the `ui-designer`'s with the `ux-ui-mastery` verdict
 * (`CLAUDE.md` §"Design — autonomia delegada, com gate de validação"). What a builder decides is
 * that the encoding is not colour-only. */
function CvdLegend() {
  const tokens = colorTokens();
  return (
    <ul className="flex gap-4 text-sm text-provenance-weak" data-fact="cvd_legend:2">
      <li>
        <span aria-hidden="true" style={{ color: tokens.provenanceStrong }}>
          ▬
        </span>{" "}
        Delta (linha cheia)
      </li>
      <li>
        <span aria-hidden="true" style={{ color: tokens.provenanceWeak }}>
          ▬ ▬
        </span>{" "}
        Acumulado (linha tracejada)
      </li>
    </ul>
  );
}

function CvdPane({
  panels,
  status,
  cvd,
}: {
  readonly panels: S2Panels;
  readonly status: PanelStatus;
  readonly cvd: CvdPaneData;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useLightweightChart(containerRef, CVD_PANEL_INDEX, (chart) => {
    const tokens = colorTokens();
    // ⛔ `LineStyle.Dashed` is NOT decoration — it is `DR-3`/WCAG 1.4.1 (Use of Color) inside the
    // canvas, where no legend reaches: with two lines distinguished ONLY by hue, a dicromata or a
    // monochrome screenshot carries no way to tell delta from cumulative. Dash vs solid is a
    // SECOND channel, and the legend below repeats it in words, so the information survives the
    // loss of any one of the three.
    const deltaSeries: ISeriesApi<"Line"> = chart.addSeries(LineSeries, {
      color: tokens.provenanceStrong,
      lineStyle: LineStyle.Solid,
    });
    deltaSeries.priceScale().applyOptions({ scaleMargins: CVD_DELTA_SCALE_MARGINS });
    deltaSeries.setData(lineSeriesLossless(panels.cvd.deltaSlots) as never);
    const cumulativeSeries: ISeriesApi<"Line"> = chart.addSeries(LineSeries, {
      color: tokens.provenanceWeak,
      lineStyle: LineStyle.Dashed,
      priceScaleId: CVD_CUMULATIVE_PRICE_SCALE_ID,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    cumulativeSeries.priceScale().applyOptions({ scaleMargins: CVD_CUMULATIVE_SCALE_MARGINS });
    cumulativeSeries.setData(lineSeriesLossless(panels.cvd.cumulativeSlots) as never);
  });
  const deltaReading = resolveFlowReading(panels.cvd.deltaSlots, panels.cvd.timeframeMs, lastInstantMs(panels));
  // `DR-3`, second half: the pane drew TWO series and read exactly ONE. The screen went to the
  // trouble of naming the anchor of the cumulative curve (`D4.7`) and then never said what value
  // that anchor produced. Same function, same absence policy, same token as the delta — the
  // cumulative is a running sum of `FLOW` buckets, so a missing bucket is a missing sum, never a
  // `0`. (`resolveFlowReading`, not `resolveStockReading`: carrying the previous total forward
  // would be LOCF over a series whose absences are real gaps in observation.)
  const cumulativeReading = resolveFlowReading(
    panels.cvd.cumulativeSlots,
    panels.cvd.timeframeMs,
    lastInstantMs(panels),
  );
  // `RN-1` at the RENDERING layer, and for this series it is a rule of TYPE: a `FLOW` bucket with
  // no observation is NOT a bucket where buyers and sellers balanced out. A `0` there would be an
  // ASSERTION about the market ("não houve desequilíbrio comprador/vendedor neste minuto") made
  // out of ignorance — `series_key.py`: "LOCF over it is a type error, never UX".
  const readingText =
    deltaReading.kind === "absent" || deltaReading.value === null ? ABSENCE_TOKEN : String(deltaReading.value);
  const cumulativeReadingText =
    cumulativeReading.kind === "absent" || cumulativeReading.value === null
      ? ABSENCE_TOKEN
      : String(cumulativeReading.value);
  const gridSlots = panels.cvd.deltaSlots.length;
  return (
    <section
      aria-label="CVD"
      data-testid={CVD_PANE_TESTID}
      data-cvd-present-points={cvd.presentPoints}
    >
      <h2 className="font-label-caps text-label-caps text-on-surface">CVD (delta e acumulado)</h2>
      <CvdLegend />
      {/* ⛔ `aria-hidden` on the canvas host — `DR-6`. `lightweight-charts` paints into a
          `<canvas>` with no accessible name, so a screen reader finds an empty node here and a
          user cannot tell an empty chart from an unlabelled one. The readouts below ARE the
          declared textual alternative for the last instant; hiding the host says so instead of
          leaving a nameless node in the tree. A per-point alternative (a keyboard-navigable
          table) is `DR-10`, strategic, not this pass. */}
      <div
        ref={containerRef}
        aria-hidden="true"
        data-fact={`cvd_slots:${panels.cvd.deltaSlots.length}`}
      />
      <p data-fact={`cvd_last_reading:${deltaReading.kind}`} className="text-sm text-provenance-weak">
        Delta atual: {readingText}
      </p>
      <p data-fact={`cvd_cumulative_last_reading:${cumulativeReading.kind}`} className="text-sm text-provenance-weak">
        Acumulado atual: {cumulativeReadingText}
      </p>
      <CvdReadableHorizon cvd={cvd} gridSlots={gridSlots} />
      {/* The anchor of the CUMULATIVE curve, named on screen. The delta line above needs none;
          the cumulative one is unreadable without this instant, and `page.tsx` chooses it
          EXPLICITLY (`cvdAnchorMs`) instead of letting `buildCvdPanel`'s default decide in
          silence — three anchors over the same deltas invert the sign of the total (`D4.7`). */}
      <p data-fact={`cvd_cumulative_anchor:${cvd.anchorMs}`} className="text-sm text-provenance-weak">
        Acumulado ancorado em {formatUtcMinute(cvd.anchorMs)}.
      </p>
      <PartialCoverageMark factKey="cvd_partial_coverage" summary={cvd.partialCoverage} />
      <AbsenceNote status={status} />
    </section>
  );
}

/** ⛔ `RS-5`, PAID HERE — AND WHAT MAKES IT HARD TO FORGET IS THE TYPE, NOT THIS FUNCTION.
 * `SeriesProvenance` (`panel-status.ts`) has three members, and only the `declared` member carries
 * `provider`/`reconstructedFrom`/`publishedError`: a THIRD-PARTY series pane with no label is not a
 * state this component tree is able to express. The alternative — a boolean prop the renderer may
 * simply not read — is how `RS-5` would be satisfied on paper and violated on the screen.
 *
 * ⚠️ AND AN ABSENT `published_error` IS SAID, NOT OMITTED. For M4 it is `null`, and that is a
 * MEASURED REFUSAL, not an oversight: `liquidation_catalog.py` writes the reason down — Binance has
 * no REST liquidation endpoint, and `!forceOrder@arr`, the only possible comparison, is off the
 * critical path by `ADR-036/D4` and wrote nothing (`5` runs, all `REJECTED`, `n_written=0`
 * `[MEDIDO 2026-09-12 em md.ingest_run]`). *"Making up a `(median, p99, n)` here would publish a
 * fidelity nobody measured, which is worse than publishing none."* A screen that drops the field
 * makes the operator read absence of error as absence of doubt.
 *
 * ⛔ WORDING AND POSITION ARE FORM — the `ui-designer`'s, with the `ux-ui-mastery` verdict
 * (`T-05.10`, `CLAUDE.md` §"Design — autonomia delegada, com gate de validação"). What a builder
 * decides, and all that is decided here, is that the FACT is on the screen and machine-readable. */
function LiquidationProvenance({ provenance }: { readonly provenance: SeriesProvenance }) {
  if (provenance.kind === "unresolved") {
    return (
      <p data-fact="liquidation_provenance:unresolved" className="text-sm text-provenance-weak">
        Procedência não declarada — nenhuma série foi identificada no catálogo para este painel.
      </p>
    );
  }
  if (provenance.kind === "origin") {
    return (
      <p data-fact={`liquidation_provenance:origin:${provenance.provider}`} className="text-sm text-provenance-weak">
        Dado da própria fonte ({provenance.provider}).
      </p>
    );
  }
  const { publishedError } = provenance;
  return (
    // ⛔ `provenanceStrong` HERE AND `provenanceWeak` IN THE REST OF THE PANE — it is HIERARCHY, not
    // legibility: `#8b949e` over `#131722` measures `5,82:1` and already passes AA. `T-05.10`'s
    // `S-3` finding counted `7` nodes in the weak tone against `2` in the strong one, and the `RS-5`
    // warning (what `SPEC-007` §7 defines as what the operator must NOT fail to see) carried the
    // same weight as the scale footer. `ADR-010` §5.4 leaves LUMINANCE as the only channel of
    // emphasis — three hues, and none available for this — and there was an unspent step of `2,53`
    // (`5,82` → `14,72`). Footer, legend and horizon stay weak: if everything rises, nothing rises.
    //
    // ⛔ NO `role="status"` (`m-5` of the same report): a live region announces CHANGE, and this line
    // comes from the server at the first paint and never mutates on the client. An `aria-live`
    // present at load time is not announced — the role bought nothing and competed with the regions
    // that do change.
    <p
      data-fact={`liquidation_provenance:declared:${provenance.provider}`}
      data-reconstructed-from={provenance.reconstructedFrom ?? ""}
      data-published-error={
        publishedError === null
          ? "none"
          : `median_bp=${publishedError.medianBp};p99_bp=${publishedError.p99Bp};n=${publishedError.n}`
      }
      className="text-sm text-provenance-strong"
    >
      ⚠️ Dado de TERCEIRO ({provenance.provider}), não da corretora de origem
      {provenance.reconstructedFrom === null
        ? ""
        : ` — reconstruído a partir de ${provenance.reconstructedFrom}`}
      .{" "}
      {publishedError === null
        ? "Erro publicado: NENHUM — não há segunda fonte para medir a fidelidade contra, e publicar um número que ninguém mediu seria pior do que não publicar."
        : `Erro publicado: mediana ${publishedError.medianBp} bp, p99 ${publishedError.p99Bp} bp, n = ${publishedError.n}.`}
    </p>
  );
}

/** The label the `log10` scale demands, by the literal reason of phase `01`'s report: *"an unlabeled
 * logarithmic axis is worse than an illegible linear one"* — whoever reads a bar of twice the height
 * as twice the value is reading its square. The pane's scale draws no numeric label on the canvas,
 * so it can only exist here, in the DOM; and here it is text, it reaches a screen reader and it is
 * assertable. */
function LiquidationScaleNote() {
  return (
    <p data-fact="liquidation_scale:log10" className="text-sm text-provenance-weak">
      Altura da barra em escala log10 (base {LIQUIDATION_LOG_BASE}) — cada degrau de altura é uma
      ordem de grandeza, não uma diferença absoluta.
    </p>
  );
}

/** The THREE states, named in words — the third channel, for the same reason `CvdLegend` and
 * `VolumeMarksLegend` exist: inside the `<canvas>` no legend reaches, and a distinction that lives
 * only in pixels dies in a monochrome screenshot or in a screen reader. Here it travels in words,
 * and the words say the difference `RN-1` demands: *"there was none"* ≠ *"we do not know"*.
 *
 * The ink comes out of `colorTokens()`, the SAME call the series' ink comes from, so a legend that
 * lies about the mark's color is not expressible. `aria-hidden` on the glyph is deliberate: it is
 * the redundant copy of what the words beside it already carry. */
function LiquidationMarksLegend() {
  const tokens = colorTokens();
  return (
    <ul className="flex gap-4 text-sm text-provenance-weak" data-fact="liquidation_marks_legend:3">
      <li>
        <span aria-hidden="true" style={{ color: tokens[LIQUIDATION_ABSENCE_MARK_COLOR_ROLE] }}>
          ▁
        </span>{" "}
        Sem ponto — traço baixo e apagado (não sabemos se houve liquidação neste minuto)
      </li>
      <li>
        <span aria-hidden="true" style={{ color: tokens[LIQUIDATION_ZERO_MARK_COLOR_ROLE] }}>
          ▃
        </span>{" "}
        Zero do fornecedor — traço médio e claro (sabemos: não houve liquidação)
      </li>
      <li>
        <span aria-hidden="true" style={{ color: tokens[LIQUIDATION_BAR_COLOR_ROLE] }}>
          ▇
        </span>{" "}
        Liquidação — barra acima da faixa das marcas, altura em ordem de grandeza
      </li>
    </ul>
  );
}

/** The readable horizon of ONE cohort — the same two numbers and one instant the other panes
 * declare, plus the fraction only this series needs: how many of the observations are a LEGITIMATE
 * ZERO.
 *
 * Written out in full instead of shared with `ReadableHorizon`/`CvdReadableHorizon` for the reason
 * that one already states at length: the literal `data-fact` expressions are pinned, character by
 * character, by different contract tests, and merging two contracts into one parameterized component
 * is how a refactor silently re-points another task's falsifier. */
function LiquidationReadableHorizon({
  cohort,
  data,
}: {
  readonly cohort: string;
  readonly data: LiquidationCohortData;
}) {
  const gridSlots = data.slots.length;
  const sinceText =
    data.firstPresentMs === null
      ? "Nenhuma grade legível no período"
      : `Dado legível desde ${formatUtcMinute(data.firstPresentMs)}`;
  return (
    <p
      data-fact={`liquidation_readable_horizon:${cohort}:${data.presentPoints}/${gridSlots}`}
      data-readable-since-ms={data.firstPresentMs ?? ""}
      className="text-sm text-provenance-weak"
    >
      {sinceText} — {data.presentPoints}/{gridSlots} grades de 1 min observadas, das quais{" "}
      {data.zeroPoints} são zero do fornecedor.
    </p>
  );
}

/**
 * ONE cohort: one chart, three series, and the zero↔absence collision made geometrically impossible
 * — see the `LIQUIDATION_*` block of constants for the whole argument.
 *
 * ⛔ THE THREE SERIES ARE NOT THREE COLORS OF ONE. `positiveValueSeriesLossless` sends both absence
 * and zero to whitespace (on a log scale, `log10(0)` has no coordinate, and a zero-height bar on the
 * baseline is, pixel by pixel, the mark of "nothing was drawn here"), and then `absenceMarkSeries`
 * and `zeroMarkSeries` draw each of the two states with a mark of its own. An `if` on color would
 * settle the appearance and leave the distinction pinned to a branch a refactor erases without
 * anything failing.
 */
function LiquidationCohortSurface({
  cohort,
  label,
  data,
  unit,
  status,
  panelIndex,
}: {
  readonly cohort: string;
  readonly label: string;
  readonly data: LiquidationCohortData;
  readonly unit: string | null;
  readonly status: PanelStatus;
  /** `T-02.4`: the two cohorts are two of the SIX runtime charts (`LIQUIDATION_LONG_PANEL_INDEX`/
   * `LIQUIDATION_SHORT_PANEL_INDEX`) — `LiquidationPane` names which is which, since this
   * component mounts twice and cannot infer its own index from `cohort` alone without
   * duplicating the mapping `axis-sync.ts` already owns. */
  readonly panelIndex: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useLightweightChart(containerRef, panelIndex, (chart) => {
    const tokens = colorTokens();
    const barStyle: Partial<HistogramSeriesOptions> = {
      color: tokens[LIQUIDATION_BAR_COLOR_ROLE],
      base: LIQUIDATION_LOG_BASE,
      priceLineVisible: false,
      lastValueVisible: false,
    };
    const barSeries: ISeriesApi<"Histogram"> = chart.addSeries(HistogramSeries, barStyle);
    barSeries.priceScale().applyOptions({
      scaleMargins: LIQUIDATION_BAR_SCALE_MARGINS,
      mode: PriceScaleMode.Logarithmic,
    });
    barSeries.setData(positiveValueSeriesLossless(data.slots) as never);

    const markStyle = (color: string): Partial<HistogramSeriesOptions> => ({
      color,
      priceScaleId: LIQUIDATION_MARKS_PRICE_SCALE_ID,
      priceLineVisible: false,
      lastValueVisible: false,
      // The fixed band: the mark's height is the mark's own, never that of the data beside it.
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: LIQUIDATION_MARKS_BAND_PX } }),
    });
    const absenceSeries: ISeriesApi<"Histogram"> = chart.addSeries(
      HistogramSeries,
      markStyle(tokens[LIQUIDATION_ABSENCE_MARK_COLOR_ROLE]),
    );
    // ⛔ THE MARGIN IS WHAT SEPARATES THE TWO BANDS, and it is applied on the MARKS scale: with
    // `top: 0.88` they take the bottom 12% of the pane, and the FLOOR of the bar band sits at 85%
    // (`1 - bottom`). No DRAWN bar passes the floor, for any value — see the `LIQUIDATION_*` block of
    // constants for the whole guarantee, what it presupposes and what it does not cover.
    absenceSeries.priceScale().applyOptions({ scaleMargins: LIQUIDATION_MARKS_SCALE_MARGINS });
    absenceSeries.setData(absenceMarkSeries(data.slots, LIQUIDATION_ABSENCE_MARK_PX) as never);
    const zeroSeries: ISeriesApi<"Histogram"> = chart.addSeries(
      HistogramSeries,
      markStyle(tokens[LIQUIDATION_ZERO_MARK_COLOR_ROLE]),
    );
    zeroSeries.setData(zeroMarkSeries(data.slots, LIQUIDATION_ZERO_MARK_PX) as never);
  });
  // `RN-1` at the rendering layer, and for this series it is a rule of TYPE: a `FLOW` bucket with no
  // observation is NOT a bucket in which nobody was liquidated. A `0` there would be an ASSERTION
  // about the market made out of ignorance — and it is the most expensive one on this screen,
  // because `77` of `1.440` grid slots carry a point: if absence and zero collided, the pane would
  // lie over most of the window.
  const readingText =
    data.reading.kind === "absent" || data.reading.value === null
      ? ABSENCE_TOKEN
      : unit === null
        ? String(data.reading.value)
        : `${data.reading.value} ${unit}`;
  return (
    <div
      role="group"
      aria-label={label}
      data-testid={liquidationCohortTestId(cohort)}
      data-liquidation-present-points={data.presentPoints}
      data-liquidation-zero-points={data.zeroPoints}
    >
      <h3 className="font-label-caps text-label-caps text-on-surface">{label}</h3>
      {/* ⛔ `aria-hidden` on the canvas host — same criterion as `CvdPane`/`DR-6`:
          `lightweight-charts` paints on a `<canvas>` with no accessible name, and the readouts below
          ARE the declared textual alternative. */}
      <div
        ref={containerRef}
        aria-hidden="true"
        data-fact={`liquidation_slots:${cohort}:${data.slots.length}`}
      />
      <p data-fact={`liquidation_last_reading:${cohort}:${data.reading.kind}`} className="text-sm text-provenance-weak">
        Leitura atual: {readingText}
      </p>
      <LiquidationReadableHorizon cohort={cohort} data={data} />
      <PartialCoverageMark factKey={`liquidation_partial_coverage:${cohort}`} summary={data.partialCoverage} />
      <AbsenceNote status={status} />
    </div>
  );
}

/**
 * `T-05.9` — the liquidation pane: TWO cohorts, the `RS-5` label and the absence that never becomes
 * a zero.
 *
 * ⛔ THE TWO LEGS ARE NOT ONE SERIES WITH TWO COLORS, and the reason is not a UX one: summing them
 * erases exactly the discrimination the metric exists to provide (`liquidation_catalog.py`, literal
 * — *"a long liquidation is forced selling and a short liquidation is forced buying"*). Two
 * surfaces, two `series_key_id`, two statuses that degrade on their own.
 *
 * And the two live in SEPARATE charts, each with its own title, instead of two colors in a single
 * chart: that way the distinction between the cohorts depends on no hue (WCAG 1.4.1) and the absence
 * marks of one leg do not overlap those of the other — which matters when `94,7%` of the grid slots
 * are absent in both `[MEDIDO 2026-09-16: 1.365 absent of 1.441 grid slots over 24 h, per cohort]`.
 */
function LiquidationPane({
  liquidation,
  longStatus,
  shortStatus,
}: {
  readonly liquidation: LiquidationPaneData;
  readonly longStatus: PanelStatus;
  readonly shortStatus: PanelStatus;
}) {
  return (
    <section aria-label="Liquidações" data-testid={LIQUIDATION_PANE_TESTID}>
      <h2 className="font-label-caps text-label-caps text-on-surface">
        Liquidações (1m{liquidation.unit === null ? "" : `, ${liquidation.unit}`})
      </h2>
      <LiquidationProvenance provenance={liquidation.provenance} />
      <LiquidationScaleNote />
      <LiquidationMarksLegend />
      <LiquidationCohortSurface
        cohort="long"
        label="Liquidação de posições compradas (long)"
        data={liquidation.long}
        unit={liquidation.unit}
        status={longStatus}
        panelIndex={LIQUIDATION_LONG_PANEL_INDEX}
      />
      <LiquidationCohortSurface
        cohort="short"
        label="Liquidação de posições vendidas (short)"
        data={liquidation.short}
        unit={liquidation.unit}
        status={shortStatus}
        panelIndex={LIQUIDATION_SHORT_PANEL_INDEX}
      />
    </section>
  );
}

/** The readable horizon of the long/short pane — the same instant and the same pair of counts the
 * other panes declare, over this series' own two grids.
 *
 * ⛔ THREE NUMBERS, NOT TWO, AND THE ORDER IS THE POINT: the NATIVE bar count comes first because it
 * is the amount of data, and the wire count comes second because it is the ladder. `RN-S1`'s failure
 * mode on this screen is stated by the phase itself — "contar 150 pontos onde há 30 barras" — and a
 * pane that published only the second number would overstate this series by ~3,6x
 * `[MEDIDO 2026-09-16: 175 grades legíveis de 1 min contra 49 observações nativas em 240 min]`.
 *
 * Written out instead of shared with `ReadableHorizon`/`CvdReadableHorizon`/`OiReadableHorizon` for
 * the reason the first of them states in full: the literal `data-fact` expressions are pinned,
 * character for character, by different contract tests, and merging contracts into one parameterized
 * component is how a refactor silently re-points another task's falsifier.
 *
 * ⛔ WORDING AND PLACEMENT ARE FORM — the `ui-designer`'s, with the `ux-ui-mastery` verdict
 * (`T-04.6`, `CLAUDE.md` §"Design — autonomia delegada, com gate de validação"). What a builder
 * decides, and all that is decided here, is that the FACTS are on screen and machine-readable. */
function LongShortReadableHorizon({ longShort }: { readonly longShort: LongShortPaneData }) {
  const gridSlots = longShort.slots.length;
  const sinceText =
    longShort.firstPresentMs === null
      ? "Nenhuma grade legível no período"
      : `Dado legível desde ${formatUtcMinute(longShort.firstPresentMs)}`;
  return (
    <p
      data-fact={`long_short_readable_horizon:${longShort.nativeBars}/${longShort.wirePoints}/${gridSlots}`}
      data-readable-since-ms={longShort.firstPresentMs ?? ""}
      data-native-grid={longShort.nativeGrid ?? ""}
      className="text-sm text-provenance-weak"
    >
      {sinceText} — {longShort.nativeBars} observações nativas
      {nativeGridSuffix(longShort.nativeGrid)}, servidas como {longShort.wirePoints}/{gridSlots} grades
      de 1 min (a mesma observação repetida na escada).
    </p>
  );
}

/** The cadence term, spelled ONLY when the backend published one — the `/review` `[WARNING]` of
 * `T-04.8`, paid.
 *
 * Three sentences of this pane used to carry a hand-typed `5 min`. The catalog serves `native_grid`
 * per entry, so the literal was a second, unversioned copy of a term the API owns, free to keep
 * saying `5 min` the day the series is re-sampled — the exact failure `LongShortPaneData.unit`'s own
 * docstring names for the unit ("a literal would be free to drift from what the backend
 * published"). With no resolved entry the phrase simply ends: a pane that invents a cadence is worse
 * than one that declines to state it, and the identity line already says the source is unidentified.
 *
 * ⚠️ THE WIRE GRID (`1 min`) IS NOT READ FROM HERE, AND THE ASYMMETRY IS DELIBERATE: it is not a
 * property of the SERIES but of the REQUEST this route makes (`page.tsx`, `interval: "1m"`), so the
 * catalog has nothing to say about it and reading it off the catalog would be the drift defect with
 * the arrow reversed. */
function nativeGridSuffix(nativeGrid: string | null): string {
  return nativeGrid === null ? "" : ` de ${nativeGrid}`;
}

/** The parenthesised terms of the pane's heading — CADENCE then UNIT, the order the approved form
 * prints them in, and each one present only where the catalog served it.
 *
 * The heading used to read `Long/short de contas (5m{, unit})`: one term read off the entry, one
 * typed by hand, inside the same pair of parentheses. Both come off the entry now. With neither
 * term the parentheses do not appear — `Long/short de contas ()` would be the screen announcing
 * that it has an identity it cannot state. */
function identityTerms(longShort: LongShortPaneData): string {
  const terms = [longShort.nativeInterval, longShort.unit].filter((term): term is string => term !== null);
  return terms.length === 0 ? "" : ` (${terms.join(", ")})`;
}

// ══ `T-04.8` — THE FORM THE `design_gate` APPROVED, TRANSLATED INTO THIS COMPONENT TREE ═══════
//
// Source of truth: `docs/context/cinco-metricas-do-core/gates/design-04.md` §R2 — veredito
// `APPROVED` over Rev. 3 (`7d87cac1…`), whose HTML is versioned beside it as
// `gates/design-04-rev3.html`. What follows TRANSLATES that study; it does not paste it, and the
// four places where it deliberately diverges are named at the point of divergence (`A-3`'s fixed
// canvas, `A-4`'s `user-select`, the `.badge-quarentena` class name of `c-5`, and the border label
// whose sentence the study could only ever hardcode).
//
// ⛔ WHAT MAY NOT MOVE, because the e2e and the DOM contract are pinned to it, character for
// character (`long-short-pane-dom-contract.test.ts`, `e2e/14-long-short-dado-real.spec.ts`):
// `data-testid="long-short-pane"`, `data-long-short-native-bars`, `data-long-short-wire-points`,
// the `long_short_*` `data-fact` expressions, and `SEM_PONTO` as the absence token. The gate's own
// §R2.4 re-measured them as intact and says why the split exists: a `NEEDS_FIX` about FORM must not
// be able to empty an assert about DATA.

/** `A-1` of the gate's `/accessibility-check` (`1.1.1`, level A) — the integrity glyph, with the
 * attributes the study's three `<svg>` were missing.
 *
 * The lozenge is HOLLOW (`fill="none"`) and that is a rule, not a look: §9 item 4 of
 * `STITCH_CONTEXT.md` forbids this mark from ever filling an area, so it cannot be mistaken for a
 * data mark. `aria-hidden` + `focusable="false"` because the words beside it carry the whole
 * message — the same criterion `CvdLegend`/`VolumeMarksLegend` already apply to their glyphs.
 *
 * ⚠️ AND THE GATE LEFT A FALSIFIER ON THIS DECISION, recorded here so it is not lost: run a real
 * screen reader over the pane; if one announces a bare "graphic" WITHOUT the adjacent words, `A-1`
 * becomes a must-fix and the `APPROVED` has to be revisited. `[NÃO MEDIDO]` — there is no screen
 * reader in this environment. */
function LongShortIntegrityGlyph() {
  return (
    <svg aria-hidden="true" focusable="false" width="12" height="12" viewBox="0 0 12 12">
      <polygon points="6,1 11,6 6,11 1,6" fill="none" stroke={colorTokens().dataBrokenInk} strokeWidth="1.5" />
    </svg>
  );
}

/** `M-3` — the THREE CHANNELS of "there is no observation in this window", in the order the gate
 * measured them: glyph, WORD, and colour as the third (never the only) one.
 *
 * ⚠️ THE WORD IS NOT "QUARENTENA" (`S-5`): quarantine is a verdict about a series' integrity, and
 * this series is registered, well-formed and simply empty over the time slice asked for. The study
 * still carried `.badge-quarentena` as a CSS CLASS NAME (`c-5` of the gate: *"quem transcrever o
 * HTML para `.tsx` reintroduz a palavra"*) — this is that transcription, and the word does not come
 * along, not even as an identifier. */
function LongShortIntegrityBadge() {
  return (
    <p
      data-fact="long_short_integrity:no_observation"
      className="flex items-center gap-2 border border-integrity-ink px-2 py-0.5 text-sm font-bold text-integrity-ink"
    >
      <LongShortIntegrityGlyph />
      SEM OBSERVAÇÃO NA JANELA
    </p>
  );
}

/** The series' identity, on the pane instead of in somebody's head — symbol, publisher and the two
 * grids (`5m` native served on the `1m` wire, `GA-2`). The approved header carries it verbatim; the
 * publisher is read off the resolved catalog row (`SeriesProvenance`), never spelled here. */
function LongShortIdentity({
  symbol,
  provenance,
  nativeGrid,
}: {
  readonly symbol: string;
  readonly provenance: SeriesProvenance;
  readonly nativeGrid: string | null;
}) {
  const publisher = provenance.kind === "unresolved" ? "fonte não identificada" : provenance.provider;
  return (
    <p data-fact={`long_short_identity:${symbol}`} className="text-sm text-provenance-weak">
      {symbol} · {publisher} · nativa{nativeGridSuffix(nativeGrid)} servida na grade de 1 min
    </p>
  );
}

/** `RS-5` — whose measurement this is. `M-3` of the gate is the reason this component is rendered
 * CONDITIONALLY by its caller and not always: over a window with zero observations, `procedência:
 * OBSERVADO` is a predicate with no subject, and printing it there was one of the three false
 * claims that reproved rodada 1. Where there IS an observation, the label is owed and printed. */
function LongShortProvenance({ provenance }: { readonly provenance: SeriesProvenance }) {
  if (provenance.kind === "unresolved") {
    return (
      <p data-fact="long_short_provenance:unresolved" className="text-sm text-provenance-weak">
        Procedência não declarada — nenhuma série identificada no catálogo.
      </p>
    );
  }
  if (provenance.kind === "origin") {
    return (
      <p data-fact={`long_short_provenance:origin:${provenance.provider}`} className="text-sm text-provenance-weak">
        Procedência: <strong className="font-bold text-on-surface">OBSERVADO</strong> — dado da própria
        fonte ({provenance.provider}).
      </p>
    );
  }
  return (
    <p
      data-fact={`long_short_provenance:declared:${provenance.provider}`}
      data-reconstructed-from={provenance.reconstructedFrom ?? ""}
      className="text-sm text-provenance-strong"
    >
      ⚠️ Dado de TERCEIRO ({provenance.provider}), não da corretora de origem
      {provenance.reconstructedFrom === null ? "" : ` — reconstruído a partir de ${provenance.reconstructedFrom}`}.
    </p>
  );
}

/** `S-6` — THE AGE STAMP EXISTS ONLY WHERE THERE IS AN OBSERVATION TO DATE, and it sits at the
 * right edge of time, which is where the approved form puts it.
 *
 * What it measures is `windowEndMsInclusive - available_at`: the distance from the window's own
 * close to the instant the newest readable observation BECAME KNOWABLE (`A-4.2`,
 * `STITCH_CONTEXT.md:1774`). Both instants are printed as `data-` attributes so the number can be
 * recomputed from outside instead of trusted.
 *
 * ⛔ IT IS NOT A FRESHNESS VERDICT. `OiFreshness` compares an age against the catalog's ceiling and
 * can say "DADO VELHO"; this pane cannot and must not, because a `RATIO` series is never carried
 * forward — the readout is exact or it is `SEM_PONTO`, so there is no state in which a stale number
 * sits here pretending to be current. */
function LongShortAgeStamp({ longShort }: { readonly longShort: LongShortPaneData }) {
  if (longShort.ageMs === null || longShort.observedAtMs === null) {
    return null;
  }
  return (
    <p
      data-fact={`long_short_age:${longShort.ageMs}`}
      data-observed-at-ms={longShort.observedAtMs}
      className="text-sm text-provenance-weak"
    >
      Idade da última observação: {formatSpan(longShort.ageMs)} (publicada em{" "}
      {formatUtcMinute(longShort.observedAtMs)}).
    </p>
  );
}

/** `M-2` — THE TAIL THE PANE REFUSES TO DRAW, COUNTED.
 *
 * The gate's blocking finding was geometric: the study's rodada 1 carried the last value forward as
 * a dashed stretch to the right edge, and `CARRY_FORWARD_BY_NATURE[Nature.RATIO] = False` means the
 * server refuses to do exactly that. Rev. 3 draws NOTHING past the last observation — and then owes
 * the operator the size of that emptiness, because a blank right edge cannot be dated by looking at
 * it. *"cauda ausente: 2 grades de 1m"*, verbatim.
 *
 * The `0` case is printed too, and it is not noise: it is the assertion that the window's own last
 * instant IS observed, which is what makes the other branch falsifiable. */
function LongShortTailNote({ longShort }: { readonly longShort: LongShortPaneData }) {
  const absent = longShort.trailingAbsentSlots;
  return (
    <p data-fact={`long_short_tail_absent:${absent}`} className="text-sm text-provenance-weak">
      {absent === 0
        ? "Fecho da janela observado — cauda ausente: 0 grades de 1 min."
        : `Fecho da janela sem ponto — cauda ausente: ${absent} grades de 1 min (nada é desenhado à direita da última observação).`}
    </p>
  );
}

/** ⛔ `M-1`, WHERE IT IS HARDEST: EVERY NUMERAL OF THE SCALE FOOTER IS DERIVED FROM THE SLOTS.
 *
 * The approved footer publishes the pane's own compression — the domain, the amplitude, and the
 * amplitude as a share of the median — because the series is, at the operator's own timeframe,
 * nearly flat: `25,5%` of 15-minute windows do not move half a pixel `[DOC: gates/design-04.md
 * §R2.7, n=850]`. The number is how the geometry becomes readable, which is why the gate refused
 * (twice) to fix flatness by adding a second series, and why these numerals are the pane's most
 * load-bearing text rather than decoration.
 *
 * Nothing here is typed by hand: `windowStats`/`recentStats` come from
 * `view-model.ts::seriesValueStats` over the very slots the chart draws, and the rounding comes
 * from `ratio-format.ts`, which prints a derived value at the precision of its operands. Rev. 2 of
 * this very screen published SIX numerals that traced to no measurement, and the only reason it was
 * caught is that the audit extracted every numeral and checked each one.
 *
 * `null` stats print a travessão and say why, never a zero: a window with no observation has no
 * domain, and `0` is a legible long/short ratio (nobody long), so a fabricated zero on THIS pane
 * would not even look wrong. */
function LongShortScaleFooter({ longShort }: { readonly longShort: LongShortPaneData }) {
  const { windowStats, recentStats } = longShort;
  // ⚠️ THE SAME GUARD ITS SISTER BELOW ALREADY HAD, AND THE `/review` `[INFO]` of `T-04.8` is why it
  // is here: this quotient divides by the MEDIAN, which nothing stopped from being `0`. It is not a
  // theoretical case on this pane — `0` is a LEGIBLE long/short ratio (nobody long), so a window in
  // which the majority of readable slots are `0` is a market state, not a producer defect, and it
  // would have put `Infinity%` (or `NaN%`, for an amplitude of `0` over it) on a screen whose whole
  // subject is not publishing numbers nobody measured. A degenerate window is SAID, never divided by.
  const windowShare =
    windowStats === null || windowStats.median === 0
      ? null
      : formatPercentPtBr(windowStats.amplitude / windowStats.median);
  const windowText =
    windowStats === null
      ? "— (nenhuma observação na janela)"
      : `${windowStats.min} a ${windowStats.max} · amplitude ` +
        `${formatDerivedDecimal(windowStats.amplitude, [windowStats.min, windowStats.max])}` +
        `${windowShare === null ? ` (mediana ${windowStats.median})` : ` (${windowShare} da mediana ${windowStats.median})`} · ` +
        `n = ${windowStats.presentSlots} grades legíveis`;
  const recentShare =
    // ⚠️ A DEGENERATE WINDOW IS SAID, NOT DIVIDED BY. With a single observation (or a perfectly flat
    // window) the amplitude is `0`, and `x/0` would put `Infinity%` — or `NaN%` for `0/0` — on a
    // screen whose whole subject is not publishing numbers nobody measured.
    windowStats === null || windowStats.amplitude === 0 || recentStats === null
      ? null
      : formatPercentPtBr(recentStats.amplitude / windowStats.amplitude);
  const recentText =
    recentStats === null
      ? "— (nenhuma observação na banda)"
      : `${recentStats.min} a ${recentStats.max} · amplitude ` +
        `${formatDerivedDecimal(recentStats.amplitude, [recentStats.min, recentStats.max])}` +
        `${recentShare === null ? "" : ` (${recentShare} da amplitude da janela)`} · ` +
        `n = ${recentStats.presentSlots} grades legíveis`;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div className="flex flex-col gap-0.5">
        <p
          data-fact={`long_short_window_scale:${windowStats === null ? "absent" : windowStats.presentSlots}`}
          className="text-sm text-provenance-weak"
        >
          Escala da janela: {windowText}
        </p>
        <p
          data-fact={`long_short_recent_scale:${recentStats === null ? "absent" : recentStats.presentSlots}`}
          data-recent-span-ms={longShort.recentSpanMs}
          className="text-sm text-provenance-weak"
        >
          Últimas {formatSpan(longShort.recentSpanMs)}: {recentText}
        </p>
      </div>
      <p className="text-sm text-provenance-weak">
        números derivados da série, não redigidos
        <span className="block">ausência não interpolada nem carregada adiante</span>
      </p>
    </div>
  );
}

/** `S-7` — THE EQUILIBRIUM AS A BORDER LABEL, AND THE SENTENCE DERIVED INSTEAD OF TRANSCRIBED.
 *
 * The gate's `S-7` took the `1,0000` reference OUT of the plot: anchoring the scale there costs
 * `19%` of vertical resolution and pushes `33,7%` (against `25,5%`) of 15-minute windows below one
 * pixel `[DOC: gates/design-04.md §R2.3]`. The operator does not lose the side of equilibrium — it
 * is stated here, in words, outside the domain.
 *
 * ⛔ AND THIS IS THE ONE PLACE THE TRANSLATION REFUSES THE STUDY'S OWN TEXT. The HTML hardcodes
 * *"abaixo da base"*, which is true of the four days it was generated over (`min = 1.1395`) and
 * FALSE the first time this ratio trades below parity — a normal market state. A transcribed
 * sentence would then assert a position nothing measured, which is exactly the `M-1` class of
 * defect this gate reproved. `equilibriumPlacement` derives the wording from the window's own
 * domain, and `ratio-format.test.ts` exercises all three branches. */
function LongShortEquilibriumNote({ stats }: { readonly stats: SeriesValueStats | null }) {
  const placement = equilibriumPlacement(stats);
  if (placement === null) {
    return null;
  }
  const equilibrium = LONG_SHORT_EQUILIBRIUM.toFixed(4).replace(".", ",");
  const glyph = placement === "below" ? "▼" : placement === "above" ? "▲" : "◆";
  const where =
    placement === "below"
      ? "abaixo da base da escala desenhada"
      : placement === "above"
        ? "acima do topo da escala desenhada"
        : "dentro da escala desenhada";
  return (
    <p data-fact={`long_short_equilibrium:${placement}`} className="text-sm text-provenance-weak">
      <span aria-hidden="true">{glyph}</span> {equilibrium} equilíbrio de contas (constante de
      definição, não medição) — {where}.
    </p>
  );
}

/** `M-3` + `S-5` — the empty state, said in full instead of left as a blank rectangle.
 *
 * It carries NO procedência, NO age and NO domain (there is no observation to predicate any of them
 * of), and the two numbers it does carry are `0` and the size of the grid that was asked for — the
 * only two facts that exist in this state. The sentence names the ONE thing an operator cannot
 * infer from an empty chart: that the emptiness is a property of the time slice, not of the series
 * or of the screen. */
function LongShortEmptyState({ longShort }: { readonly longShort: LongShortPaneData }) {
  return (
    <div
      data-fact={`long_short_empty:0/${longShort.slots.length}`}
      className="border border-surface-border bg-surface-lowest px-4 py-3"
    >
      <p className="flex items-center gap-2 text-sm font-bold text-on-surface">
        <LongShortIntegrityGlyph />
        NENHUMA GRADE LEGÍVEL NO PERÍODO
      </p>
      <p className="text-sm text-provenance-weak">
        0 observações nativas{nativeGridSuffix(longShort.nativeGrid)} na janela ({longShort.wirePoints}/
        {longShort.slots.length} grades de 1 min legíveis). A série está cadastrada e íntegra; o que está
        vazio é o corte temporal. Ausência não é interpolada nem substituída por zero.
      </p>
    </div>
  );
}

/** The band's geometry, in pixels of the chart's own canvas — read back OUT of `lightweight-charts`
 * rather than computed beside it, which is the only way an HTML overlay and a canvas series can be
 * asserted to describe the same slots. `firstIndex`/`lastIndex` travel with the pixels so the DOM
 * publishes WHAT was measured next to WHERE it landed. */
interface RecentBandGeometry {
  readonly leftPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly firstIndex: number;
  readonly lastIndex: number;
}

/**
 * ⛔ `D-1` OF `gates/design-04.md` §R3.5 — THE FAIXA DAS 4 H, WHICH WAS THE MISSING HALF OF THE
 * REMEDY `[DECISÃO-OWNER 2026-09-16, §D18]` APPROVED ("faixa de 4h + rodapé numérico").
 *
 * The finding, measured: the study draws the band twice (`gates/design-04-rev3.html:260`, `:360`)
 * and the pane had *"uma série `Line` e ZERO sobreposição"* — so the recorte existed only as text.
 * The footer says **quanto** the series moved in the decision timeframe; this says **onde** that
 * timeframe starts, which an operator otherwise has to find by counting axis marks.
 *
 * ── ⚠️ THE ONE DIVERGENCE FROM THE STUDY, DECLARED HERE BECAUSE IT IS A REAL ONE ─────────────
 *
 * The study's `.four-hour-window` carries `background-color:#222634` PLUS the two 1px borders. This
 * element carries **the borders only, and no fill**, and the reason is a property of the migration
 * rather than a preference: the study is HTML all the way down, so its fill sits UNDER its own
 * `<svg>` trace; here the series is painted by `lightweight-charts` on an OPAQUE `<canvas>`, and an
 * HTML overlay can only sit ON TOP of it. An opaque fill would therefore hide the very line the band
 * exists to locate, and `M-4` forbids the escape hatch (`opacity`/`rgba`) — for a measured reason,
 * not a stylistic one: a ratio computed on a token and rendered through alpha is a ratio nobody has.
 *
 * ⭐ AND THE GATE'S OWN NUMBERS SAY THIS COSTS ALMOST NOTHING: §2.3 measured the fill at **1.19**
 * against the plot and the border at **5.82**, and concluded in so many words that *"a faixa é
 * carregada pela BORDA, não pelo fill … o fill só AGRUPA"*. A 1.19 fill is, by definition of the
 * number, nearly indistinguishable from the surface it sits on. What is dropped is the ~invisible
 * half; what is kept is the half that measures 5.82 and does the delimiting.
 *
 * ⛔ FORM IS NOT MINE TO SETTLE: this divergence is a builder's answer to a physical constraint, and
 * the `ui-designer` with the `ux-ui-mastery` verdict owns whether it stands. Recorded in
 * `gates/T-04.10-achados-front.md` so it is decided rather than inherited.
 */
function LongShortRecentBand({
  band,
  longShort,
}: {
  readonly band: RecentBandGeometry;
  readonly longShort: LongShortPaneData;
}) {
  return (
    <div
      // `aria-hidden` for the same reason the canvas host beside it is: this is a MARK over a
      // graphic, and the sentence that carries its meaning to a screen reader is the footer's
      // *"Últimas 4 h: … n = N grades legíveis"*, which is real text in the accessibility tree.
      aria-hidden="true"
      data-fact={`long_short_recent_band:${band.firstIndex}/${band.lastIndex}`}
      data-recent-band-left-px={Math.round(band.leftPx)}
      data-recent-band-width-px={Math.round(band.widthPx)}
      // ⛔ `z-10` IS NOT DECORATION — WITHOUT IT THIS ELEMENT EXISTS IN THE DOM AND NOT ON THE
      // SCREEN, which is the worst failure available to a mark whose whole job is to be seen. The
      // first working version of this band had no `z-` class: every assertion passed (`toHaveCount(1)`,
      // a bounding box of `120x192` at the right coordinates) and a screenshot showed NOTHING.
      // Measured cause: `lightweight-charts` paints its canvases at `z-index: 1` and `2`
      // (`getComputedStyle` over the 7 `<canvas>` of this chart: `1,2,1,2,1,2,auto`), none of their
      // ancestors up to `.relative` opens a stacking context, so an overlay at `auto` (= 0) sorts
      // BELOW them. `10` clears both with room for the library to add a layer.
      // `pointer-events-none`: the band must not eat the crosshair of the chart underneath it.
      className="pointer-events-none absolute z-10 border-l border-r border-provenance-weak"
      style={{ left: `${band.leftPx}px`, top: 0, width: `${band.widthPx}px`, height: `${band.heightPx}px` }}
    >
      {/* ⚠️ THE TAG NAMES THE BAND AND DOES NOT REPEAT ITS DOMAIN, WHICH THE STUDY DOES
          (*"Últimas 4h [1.4950 a 1.8098]"*) — and the reason is a width this migration measured and
          the study could not have: the study's own band is `330px` (it chose its window); over the
          route's REAL 4-day window this band renders `120px` wide `[MEDIDO 2026-09-16, `e2e/14`:
          `long_short_recent_band_width_px=120` sobre `canvas=1208px`]`, in which the domain wraps to
          three lines and becomes a blob over the plot. The two numerals are not lost: they are the
          footer's *"Últimas 4 h: 1.495 a 1.5707 · …"*, 14px, one line below, which is the MORE
          legible copy of the same fact. One fact, one place. */}
      <span className="absolute left-2 top-1.5 whitespace-nowrap border border-provenance-weak bg-surface-lowest px-1.5 text-data-sm text-provenance-weak">
        Últimas {formatSpan(longShort.recentSpanMs)}
      </span>
    </div>
  );
}

/**
 * `T-04.5` — the long/short pane (M3), the FIRST NEW PANE of this feature.
 *
 * ⛔ ONE LINE, ONE SERIES, AND NO SECOND SERIES SMUGGLED IN. `count_long_short_ratio` is ONE of the
 * four series `SPEC-001` §3.1 separates, and the plan's own falsifier (`04_long_short.md`) reserves
 * the decision to add `sum_taker_long_short_vol_ratio` as a second line to the phase, AFTER the
 * first one is on screen and measured flat or not. Adding it here would answer that question
 * before it was asked.
 *
 * ⛔ AND THERE IS NO FRESHNESS LINE HERE, UNLIKE `OiPane` — the omission is reasoned, not forgotten.
 * `OiFreshness` exists because open interest is `Nature.STOCK`: the server CARRIES the last
 * observation forward, so the pane can print a number that is much older than it looks and owes the
 * operator the age (`RNF-2`). This series is `Nature.RATIO` with
 * `CARRY_FORWARD_BY_NATURE[Nature.RATIO] = False` — nothing is ever held forward, so the readout at
 * the window's last instant is EXACT or it is `SEM_PONTO`, and there is no state in which a stale
 * number can sit on this pane pretending to be current.
 */
function LongShortPane({
  longShort,
  status,
  symbol,
  wallState,
}: {
  readonly longShort: LongShortPaneData;
  readonly status: PanelStatus;
  readonly symbol: string;
  /** `T-05.6` — same contract as `OiPane`'s own `wallState` prop; see that docstring. */
  readonly wallState: SlotCoverageState;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // `D-1` — the band's slots, resolved by the SAME rule `page.tsx` used for the footer's numerals
  // (`long-short-band.ts`, whose test compares the two sets slot for slot). `null` where there is
  // nothing to delimit, and then no rectangle is drawn at all.
  const [band, setBand] = useState<RecentBandGeometry | null>(null);
  const bandRange = recentBandSlotRange(longShort.slots, longShort.recentSpanMs);
  useLightweightChart(
    containerRef,
    LONG_SHORT_PANEL_INDEX,
    (chart) => {
      const style: Partial<LineSeriesOptions> = { color: colorTokens().provenanceStrong };
      const series: ISeriesApi<"Line"> = chart.addSeries(LineSeries, style);
      // `lineSeriesLossless` — REUSED, never a second mapping: a slot with `value: null` becomes a
      // bare `{time}` `WhitespaceItem`, which the library places on the axis and draws NOTHING for.
      // For this series a `0` there would be worse than for any other pane on this screen: `0` is a
      // legible long/short ratio (nobody long), so the fabricated value would not even look wrong.
      series.setData(lineSeriesLossless(longShort.slots) as never);
    },
    (chart) => {
      // ⛔ THE COORDINATES ARE THE LIBRARY'S, NOT A PROPORTION COMPUTED BESIDE IT. The plot area is
      // narrower than the container by whatever the price axis takes, and `fitContent` leaves half
      // a bar of margin at each end — a percentage over the container would be a band that looks
      // aligned and is not, which on a pane about provenance is the worst kind of wrong. Every slot
      // fed to the series is one logical index, in order, so `logicalToCoordinate` answers exactly.
      if (bandRange === null) {
        return;
      }
      const timeScale = chart.timeScale();
      const leftPx = timeScale.logicalToCoordinate(bandRange.firstIndex as Logical);
      const rightPx = timeScale.logicalToCoordinate(bandRange.lastIndex as Logical);
      const paneHeightPx = chart.paneSize().height;
      // A coordinate outside the visible range comes back `null`, and a zero-width band would draw
      // two coincident borders over a window that is not zero wide. Either way: no band, never an
      // invented one.
      if (leftPx === null || rightPx === null || !(rightPx > leftPx) || !(paneHeightPx > 0)) {
        return;
      }
      setBand({
        leftPx,
        widthPx: rightPx - leftPx,
        heightPx: paneHeightPx,
        firstIndex: bandRange.firstIndex,
        lastIndex: bandRange.lastIndex,
      });
    },
  );
  // ⛔ `resolveFlowReadingOrAbsent` ON A `RATIO` SERIES, AND THE DIVERGENCE IS DECLARED RATHER THAN
  // SMUGGLED: what is shared with `FLOW` is the RULE (never look at a neighbouring slot, absence is
  // absence), not the nature. The rule is the right one here because the SERVER already applies it —
  // `CARRY_FORWARD_BY_NATURE[Nature.RATIO]` is `False`, so an absent slot is a slot the read path
  // itself refused to fill. `charts`' `SeriesNature` is `"STOCK" | "FLOW"` and `s2-absence-policy.ts`
  // says a `RATIO` branch belongs to "a future task that adds a RATIO panel" — that branch lives in
  // `charts`, a component this `web` task does not own (`ADR-003`), so this pane reuses the rule it
  // needs and names what it is doing instead of writing a second absence policy in `web`.
  const readingText =
    longShort.reading.kind === "absent" || longShort.reading.value === null
      ? ABSENCE_TOKEN
      : longShort.unit === null
        ? String(longShort.reading.value)
        : `${longShort.reading.value} ${longShort.unit}`;
  // WHETHER THERE IS ANYTHING TO PREDICATE — the ONE branch `M-3`/`S-6` of the gate turn on, and it
  // is the window's own statistic rather than a status or a count of rows: a pane with a healthy
  // transport and an empty time slice is the state the empty form exists for.
  const hasObservation = longShort.windowStats !== null;
  return (
    // ⛔ NO `overflow: hidden` AND NO FIXED WIDTH ON THIS CARD, AND THE OMISSION IS `A-3` OF THE
    // GATE. The study is a `1280x1024` canvas (`body { width: 1280px; overflow: hidden }`), which
    // CLIPS its own content at 200% zoom — `1.4.4`/`1.4.10`. The report classifies that as inherent
    // to a fixed-canvas form study and as a DEFECT the moment the form migrates into the `S2`. This
    // is that migration, so the card is fluid and every row of it wraps (`flex-wrap`).
    <section
      aria-label="Long/short"
      data-testid={LONG_SHORT_PANE_TESTID}
      // ⛔ THE TWO NUMBERS, SIDE BY SIDE, AND ONLY THE FIRST IS "QUANTO DADO EXISTE" — the same
      // discipline `OiPane` publishes for its own staircase. `data-long-short-native-bars` is
      // `DoD-3`'s `N >= 30`; `data-long-short-wire-points` is the ladder, published so the ratio
      // between them is checkable from outside and so the e2e can assert the pane's headline number
      // is NOT that one.
      data-long-short-native-bars={longShort.nativeBars}
      data-long-short-wire-points={longShort.wirePoints}
      className="border border-surface-border bg-surface-base"
    >
      {/* THE HEADER IN TWO SEMANTIC ROWS, the shape the approved form uses: row 1 is WHAT THIS IS
          and WHAT IT READS NOW; row 2 is HOW MUCH OF IT IS REAL.

          ⚠️ TYPE SIZE — THE PREVIOUS VERSION OF THIS COMMENT CLAIMED "nothing is smaller", AND THAT
          WAS FALSE AS MEASURED (`D-2`, `gates/design-04.md` §R3.5). Every class here is `text-sm`
          (14px) except the `<h2>`, which carries the `label-caps` token — and `label-caps` is
          `0.6875rem` = **11px** (`globals.css`, `--text-label-caps`), i.e. BELOW the 12px floor
          `S-8` of the gate asked for. The pane's own nodes measure `14px ×38 · 16px ×1 · 11px ×3`.

          THE PIXEL STAYS AND THE CLAIM GOES, and the gate's own measurement is why: the `S2`'s
          NINE section headers all render at 11px (`getComputedStyle` over `h2,h3` of the route:
          `11px ×9`), so this pane conformed to the SYSTEM rather than to the study — the choice a
          migration should make, since the inverse would put one out-of-scale heading among eight
          siblings. Contrast is `14.72:1`, the text is caps, and no WCAG criterion fixes a minimum
          type size, so nothing REPROVES it. What was a defect was the declaration, and `D-2` says
          so in as many words: *"O defeito é a declaração, não o pixel"*.

          ⛔ WHOSE CALL THE 12px FLOOR IS: `STITCH_CONTEXT.md` §9 item 14, owner `ui-designer` with
          the `ux-ui-mastery` verdict. The gate PROPOSED reading it as *"12px, exceto o token
          `label-caps` do chrome da S2"* and explicitly did not apply it (`R6`). This comment states
          the divergence; it does not resolve it. */}
      <div className="flex flex-col gap-1 border-b border-surface-border bg-surface-lowest px-3 py-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {/* ⛔ THE CADENCE AND THE UNIT ARE BOTH TERMS OF THE SERIES' KEY, AND NEITHER IS TYPED
                HERE — the `/review` `[WARNING]` of `T-04.8`. `5m` used to be a literal beside a
                `longShort.unit` that was already being read off the catalog, which is two rules for
                two halves of the same parenthesis. Where the backend published neither term the
                parenthesis does not appear at all, rather than appearing empty. */}
            <h2 className="font-label-caps text-label-caps text-on-surface">
              Long/short de contas{identityTerms(longShort)}
            </h2>
            <LongShortIdentity
              symbol={symbol}
              provenance={longShort.provenance}
              nativeGrid={longShort.nativeGrid}
            />
          </div>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            {/* THE HEADLINE, in the strong ink and bold — the only node of this pane in that
                weight, which is the whole of `ADR-010` §5.4's hierarchy channel (luminance; there
                is no hue to spend). If everything rises, nothing rises. */}
            <p data-fact={`long_short_last_reading:${longShort.reading.kind}`} className="text-sm font-bold text-on-surface">
              Leitura atual: {readingText}
            </p>
            {hasObservation ? <LongShortAgeStamp longShort={longShort} /> : <LongShortIntegrityBadge />}
          </div>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {hasObservation ? <LongShortProvenance provenance={longShort.provenance} /> : null}
            <LongShortReadableHorizon longShort={longShort} />
            <AbsenceNote status={status} />
            {wallState === "beyond-coverage" ? <BeyondCoverageBadge factKey="long_short_coverage" /> : null}
          </div>
          <LongShortTailNote longShort={longShort} />
        </div>
      </div>
      <div className="px-3 py-2">
        {/* ⛔ `aria-hidden` on the canvas host — same criterion as `CvdPane`/`DR-6`:
            `lightweight-charts` paints on a `<canvas>` with no accessible name, and the readouts
            around it ARE the declared textual alternative for the window's last instant. */}
        {/* ⛔ `relative` EXISTS ONLY SO THE BAND HAS AN ORIGIN. The band's coordinates come from the
            chart's time scale, which measures from the chart element's own left edge — so the
            overlay has to be positioned against THAT element and nothing else. No `overflow-hidden`
            here either (`A-3`): the band is clamped by the coordinates it was measured from. */}
        <div className="relative">
          <div
            ref={containerRef}
            aria-hidden="true"
            data-fact={`long_short_slots:${longShort.slots.length}`}
          />
          {band === null ? null : <LongShortRecentBand band={band} longShort={longShort} />}
        </div>
        {hasObservation ? null : <LongShortEmptyState longShort={longShort} />}
      </div>
      <div className="flex flex-col gap-1 border-t border-surface-border bg-surface-lowest px-3 py-2">
        <LongShortScaleFooter longShort={longShort} />
        <LongShortEquilibriumNote stats={longShort.windowStats} />
      </div>
    </section>
  );
}

/** One `EventSource`, decoded through `../live-transport.ts` — see this module's own docstring
 * for why this reads "ao vivo indisponível" in this phase (no real producer wired yet). */
function useLiveReadout(url: string | null): string {
  const [text, setText] = useState<string>(url === null ? "sem série resolvida" : "conectando…");

  useEffect(() => {
    if (url === null) {
      return;
    }
    let cancelled = false;
    const source = new EventSource(url);
    source.onmessage = (event) => {
      if (cancelled) {
        return;
      }
      try {
        const envelope: LiveBucketEnvelope = decodeBucketEnvelope(JSON.parse(event.data as string));
        setText(`${envelope.last_price} @ ${envelope.bucket_open_ts} (seq ${envelope.seq})`);
      } catch {
        setText("ao vivo indisponível (envelope inválido)");
      }
    };
    source.onerror = () => {
      if (!cancelled) {
        setText("ao vivo indisponível");
      }
    };
    return () => {
      cancelled = true;
      source.close();
    };
  }, [url]);

  return text;
}

/**
 * `T-04.3` (`CST-230`, `SPEC-008`/`D7`, `RF-8`/`RN-5`) — `factKey` and `label` are two DIFFERENT
 * strings on purpose. Before this task the machine key was built from `label` itself
 * (`` `live_${label}:…` ``), so the page published `data-fact="live_preço:attempted"` — an
 * operator's `grep -P '[^\x00-\x7F]'` mordeu on the accent, and worse, renaming the visible word
 * (the `ui-designer`'s call, gated by `ux-ui-mastery`, CLAUDE.md §Design) would have silently
 * renamed the CONTRACT a consumer greps for. `factKey` is ASCII and stable — the property name
 * `liveUrls` already carries (`price`/`oi`/`cvd`, `page.tsx:853-860`) — and never derived from
 * the pt-BR microcopy beside it.
 */
function LiveRow({
  label,
  factKey,
  url,
}: {
  readonly label: string;
  readonly factKey: string;
  readonly url: string | null;
}) {
  const text = useLiveReadout(url);
  return (
    <li data-fact={`live_${factKey}:${url === null ? "no_series" : "attempted"}`}>
      {label}: {text}
    </li>
  );
}

/**
 * `T-03.9` (`RF-6`, plan `03` item `3.6`) — the TF bar. ONE `<button>` per entry of
 * `SUPPORTED_TIMEFRAMES` (`supported-timeframes.ts`), via `.map()` — never a hand-written
 * `<button>` per label. That is the DoD, literally: *"remover um TF do conjunto servido remove o
 * botão, sem tocar no componente"* — shrink the array (kept honest by that module's own sync
 * test against the backend) and this component's rendered output shrinks with it, with zero
 * edit here. `timeframe-bar-dom-contract.test.ts` is the source-scan that proves this component
 * actually maps rather than duplicating the list.
 *
 * Colour: the two GOVERNED roles `DESIGN_SYSTEM.md` §1.2 reserves for exactly this — `action`
 * (`--acao-fill`/`--acao-borda`/`--acao-on`, "Marca / ação", never yet consumed by any `.tsx`
 * before this task) for the SELECTED member, `surface`/`provenance` (already used everywhere
 * else on this screen) for the rest. No new hue (`NG-5`).
 *
 * `role="group"` + `aria-pressed` (a toggle-button group), NOT `role="radiogroup"` +
 * `aria-checked` — `T-03.12` DECIDES this, and it is the earlier docstring's "FORM decision this
 * task does not own" being finally owned. Kept, not flipped: a `radiogroup` asserts "one value
 * among mutually exclusive options, as if submitted by a form" (WAI-ARIA 1.2's own role
 * definition), and a screen reader announces each item as "radio button" — the WRONG semantic
 * for a VIEW control that reshapes what six charts already on screen draw, never a value bound
 * to any form. `role="group"` + `aria-pressed` is the correct reading: "a set of toggle
 * buttons", which is exactly what clicking one of these DOES (toggles which TF is active).
 *
 * What WAS missing, and is what this task actually adds: roving `tabIndex` + arrow-key
 * navigation, the WAI-ARIA APG "Toolbar" pattern (a horizontal cluster of related buttons,
 * `https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/` — `[NÃO SEI]` the exact current wording of
 * that page; this environment has no web fetch, so the pattern is applied from its well-known
 * shape — one stop on `Tab`, `ArrowLeft`/`ArrowRight`/`Home`/`End` move the roving cursor,
 * `Enter`/`Space`/click activate — never from a live read of the page). Before this task, every
 * button was independently `Tab`-stoppable (5 stops to cross the bar); now the bar is ONE `Tab`
 * stop, consistent with every other multi-button cluster a keyboard user encounters on the web,
 * while `aria-pressed`'s semantics (and the DOM contract pinning `data-testid`/`key`/`onClick`/
 * the visible label, `timeframe-bar-dom-contract.test.ts`) are UNCHANGED.
 *
 * `T-03.11` (`CST-226`) — `onSelect` NOW TRIGGERS A REAL REFETCH, wired by `SymbolClient` below.
 * The two backend prerequisites `T-03.9`'s docstring named (`T-03.4`'s `{present, expected}`
 * marks, `T-03.6`'s `coverage` envelope field) are merged on this branch now, and the DoD this
 * task exists for (`plan 03` DoD 6/7/8) is the falsifier over the wire-grid/staircase counts
 * every panel already published — see `SymbolClient`'s own `handleTimeframeSelect` for the
 * mechanism (a URL search param, not an in-component fetch).
 */
function TimeframeBar({
  selected,
  onSelect,
}: {
  readonly selected: string;
  readonly onSelect: (interval: string) => void;
}) {
  // The roving cursor — WHICH button is the bar's one `Tab` stop right now. Starts, and
  // re-syncs, on `selected`: after a real navigation (`onSelect` fired, `page.tsx` re-rendered
  // with a new `selectedTimeframe`) the newly-active TF is also the sensible place `Tab` should
  // land next time, same as a native radio group re-syncing its roving stop to whichever input
  // is `checked`. Arrow-key browsing before a selection is made moves this WITHOUT touching
  // `selected` — the two are related, never the same state.
  const [activeInterval, setActiveInterval] = useState(selected);
  useEffect(() => {
    setActiveInterval(selected);
  }, [selected]);

  const buttonNodesByInterval = useRef(new Map<string, HTMLButtonElement>());
  // ⛔ Parameter named `entry`, deliberately NOT `option` — `timeframe-bar-dom-contract.test.ts`'s
  // `MAP_OVER_SUPPORTED_TIMEFRAMES` regex is anchored on the array's `.map` call spelled with an
  // `option` parameter, singular, to prove there is exactly ONE such call (the render map,
  // below). A second call spelled the same way would give the MORDE test two matches to strip
  // instead of one, and the mutation it applies would silently miss the real render map.
  const intervals = SUPPORTED_TIMEFRAMES.map((entry) => entry.interval);

  const moveRovingFocus = useCallback((interval: string) => {
    setActiveInterval(interval);
    buttonNodesByInterval.current.get(interval)?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const currentIndex = intervals.indexOf(activeInterval);
      if (currentIndex === -1) {
        return;
      }
      switch (event.key) {
        case "ArrowRight":
          event.preventDefault();
          moveRovingFocus(intervals[(currentIndex + 1) % intervals.length]!);
          return;
        case "ArrowLeft":
          event.preventDefault();
          moveRovingFocus(intervals[(currentIndex - 1 + intervals.length) % intervals.length]!);
          return;
        case "Home":
          event.preventDefault();
          moveRovingFocus(intervals[0]!);
          return;
        case "End":
          event.preventDefault();
          moveRovingFocus(intervals[intervals.length - 1]!);
          return;
        default:
          return;
      }
    },
    [activeInterval, intervals, moveRovingFocus],
  );

  return (
    <div
      role="group"
      aria-label="Timeframe"
      onKeyDown={handleKeyDown}
      className="flex gap-1 border-b border-surface-border bg-surface-lowest px-3 py-2"
    >
      {SUPPORTED_TIMEFRAMES.map((option) => {
        const isSelected = option.interval === selected;
        return (
          <button
            key={option.interval}
            ref={(node) => {
              if (node === null) {
                buttonNodesByInterval.current.delete(option.interval);
              } else {
                buttonNodesByInterval.current.set(option.interval, node);
              }
            }}
            type="button"
            aria-pressed={isSelected}
            tabIndex={option.interval === activeInterval ? 0 : -1}
            data-testid={`timeframe-button-${option.interval}`}
            onClick={() => onSelect(option.interval)}
            onFocus={() => setActiveInterval(option.interval)}
            className={
              isSelected
                ? "border border-action-border bg-action-fill px-2 py-1 font-label-caps text-data-sm text-action-on"
                : "border border-surface-border bg-surface-base px-2 py-1 font-label-caps text-data-sm text-provenance-weak"
            }
          >
            {option.interval}
          </button>
        );
      })}
    </div>
  );
}

export function SymbolClient({
  symbol,
  panels: initialPanels,
  cvd: initialCvd,
  oi: initialOi,
  liquidation: initialLiquidation,
  longShort: initialLongShort,
  panelStatus,
  knowledgeTimeMs,
  liveUrls,
  historyPagingRows,
  historyBaseUrl,
  selectedTimeframe,
}: SymbolClientProps) {
  // `T-05.2` (`D-C3.5`) — the SEED the client-side paginator starts from, memoized off PRIMITIVES
  // and the stable `historyPagingRows` prop reference, never rebuilt as a fresh object every
  // render: `use-history-pager.ts`'s own docstring on why `onCandidateRange` needs a STABLE
  // `seed.keys` identity to stay a stable callback across renders (the ref-based
  // stale-closure fix depends on `fetchPage`'s `useCallback` deps not churning every render).
  // Every field here comes off props THIS render already has — `windowEndMsInclusive` off
  // `lastInstantMs(initialPanels)` (the SAME conversion the "leitura atual" readouts already use,
  // `ADR-003` FR-2: not re-derived a second way), `cvdAnchorMs`/`oiMaxStalenessMs`/
  // `longShortRecentSpanMs` off the STATIC facts `page.tsx` already resolved once.
  const historyPagingSeed: HistoryPagingSeed = useMemo(
    () => ({
      symbol,
      interval: selectedTimeframe,
      barPolicy: HISTORY_BAR_POLICY,
      knowledgeTimeMs,
      historyBaseUrl,
      window: { startMs: initialPanels.window.startMs, endMsExclusive: initialPanels.window.endMsExclusive },
      keys: historyPagingRows.keys,
      rows: historyPagingRows.rows,
      staticContext: {
        priceUse: initialPanels.price.priceUse,
        cvdAnchorMs: initialCvd.anchorMs,
        windowEndMsInclusive: lastInstantMs(initialPanels),
        longShortRecentSpanMs: initialLongShort.recentSpanMs,
        oiMaxStalenessMs: initialOi.maxStalenessMs,
      },
    }),
    [
      symbol,
      selectedTimeframe,
      knowledgeTimeMs,
      historyBaseUrl,
      initialPanels,
      historyPagingRows,
      initialCvd.anchorMs,
      initialLongShort.recentSpanMs,
      initialOi.maxStalenessMs,
    ],
  );
  const pager = useHistoryPager(historyPagingSeed);
  // `T-02.4` (`D-C3.1`) — the ONE `TimeAxis` every one of the six charts shares. `T-05.2`: THIS IS
  // NOW `pager.axis`, NOT a local `useMemo` off `initialPanels.window` — the paginator OWNS the
  // window from here on (it starts equal to `initialPanels.window`, `use-history-pager.ts`'s own
  // `useState` initializer, and widens as pages arrive). `S2_AXIS_STEP_MS` is the SAME step
  // `T-02.1` unified every panel's grid onto (`D-C3.2`) — `use-history-pager.ts` reuses it, not a
  // second `60_000` literal.
  const axis: TimeAxis = pager.axis;
  // `T-05.2` — THE SIX PANES DRAW `pager.assembly`'s SLOTS FROM HERE ON, never `initialPanels`
  // directly: `panels`/`priceCandles`/`volume`/`cvd` merge the paginator's DYNAMIC facts
  // (recomputed from the merged rows on every page, `panel-assembly.ts`) with the STATIC facts a
  // CATALOG ENTRY carries (`provenance`/`unit`/`maxStalenessMs`/`nativeInterval`/`nativeGrid`/
  // `anchorMs`/`recentSpanMs`) — properties of the SERIES, not the window, frozen at their
  // SSR-resolved values because paging never changes which series a pane reads, only how much of
  // it is loaded (see `panel-assembly.ts`'s own docstring on why this split is deliberate).
  const panels: S2Panels = pager.assembly.panels;
  const priceCandles: PriceCandleData = pager.assembly.priceCandles;
  const volume: VolumeSubAxisData = pager.assembly.volume;
  const cvd: CvdPaneData = { ...pager.assembly.cvd, anchorMs: initialCvd.anchorMs };
  const oi: OiPaneData = {
    ...pager.assembly.oi,
    maxStalenessMs: initialOi.maxStalenessMs,
    provenance: initialOi.provenance,
  };
  const liquidation: LiquidationPaneData = {
    long: pager.assembly.liquidationLong,
    short: pager.assembly.liquidationShort,
    provenance: initialLiquidation.provenance,
    unit: initialLiquidation.unit,
  };
  const longShort: LongShortPaneData = {
    ...pager.assembly.longShort,
    recentSpanMs: initialLongShort.recentSpanMs,
    provenance: initialLongShort.provenance,
    unit: initialLongShort.unit,
    nativeInterval: initialLongShort.nativeInterval,
    nativeGrid: initialLongShort.nativeGrid,
  };
  // `T-05.6` (`D-C3.6`, plan `05` item `5.5`) — THE ASYMMETRIC WALL, NAMED. Computed once here,
  // off `pager.window`/`pager.panelCoverage` (`T-05.6`'s own additions to `HistoryPagerResult`),
  // and handed down as a single `SlotCoverageState` per panel rather than recomputed inside each
  // pane (both panes would otherwise need the pager's window threaded to them anyway). Price gets
  // NO such prop/badge — it deliberately keeps drawing whatever bars its own floor allows, per the
  // DoD's own "o painel de Preço continua com barras": OI and long/short are the two panels this
  // task's plan names as the shallower series, and a THIRD candidate here would be scope this task
  // does not own (the plan's own falsifier is `n=2` panels, not `n=3`).
  const oiWallState = panelWallState(pager.window, pager.panelCoverage.oi);
  const longShortWallState = panelWallState(pager.window, pager.panelCoverage.longShort);
  // `T-03.11` — `selectedTimeframe` is now a PROP, resolved server-side by `page.tsx` off
  // `?interval=` (never a client `useState`): the URL is the single source of truth for which
  // TF the ten fetches this render answers were actually made with, so the bar's own highlight
  // can never say "5m" while the panels drew "1m" data. Clicking a button pushes a NEW url via
  // `next/navigation`'s router — `dynamic = "force-dynamic"` on `page.tsx` guarantees that
  // navigation re-runs the Server Component with the new `interval`, which is the real refetch
  // `T-03.9`/`T-03.10` deferred (`ADR-005/D5`: history fetches are `web`'s server half, never
  // client-side `fetch` against `INGEST_HEALTH_API_BASE_URL`, which is not even readable from
  // the browser).
  const router = useRouter();
  const pathname = usePathname();
  const handleTimeframeSelect = useCallback(
    (interval: string) => {
      // The default TF omits the param entirely rather than writing `?interval=1m` — the same
      // "no silent default, but no noisy one either" discipline the rest of this route already
      // follows (`page.tsx`'s own `S2_PRICE_USE` comment): `/symbol/BTCUSDT` and
      // `/symbol/BTCUSDT?interval=1m` are the SAME request, and only one of the two spellings
      // needs to exist for a bookmark to keep working after the default ever changes.
      const query = interval === DEFAULT_TIMEFRAME ? "" : `?interval=${encodeURIComponent(interval)}`;
      router.push(`${pathname}${query}`, { scroll: false });
    },
    [pathname, router],
  );
  return (
    // The three instants of the request this render was built from, on the root element: the
    // screen declares WHAT IT ASKED, so an assertion (or an operator) can re-issue exactly that
    // query against the read API instead of guessing the window from its own clock.
    <main
      data-window-start-ms={panels.window.startMs}
      data-window-end-ms-inclusive={lastInstantMs(panels)}
      data-knowledge-time-ms={knowledgeTimeMs}
    >
      <h1 className="sr-only">
        {symbol} — Preço (com volume), Open Interest, CVD, Liquidações e Long/short
      </h1>
      <TimeframeBar selected={selectedTimeframe} onSelect={handleTimeframeSelect} />
      <AxisSyncProvider axis={axis} initialRange={pager.initialRange} onCandidateRange={pager.onCandidateRange}>
        <PricePane
          panels={panels}
          priceCandles={priceCandles}
          status={panelStatus.price}
          volume={volume}
          volumeStatus={panelStatus.volume}
        />
        <OiPane panels={panels} status={panelStatus.oi} oi={oi} wallState={oiWallState} />
        <CvdPane panels={panels} status={panelStatus.cvd} cvd={cvd} />
        <LiquidationPane
          liquidation={liquidation}
          longStatus={panelStatus.liquidationLong}
          shortStatus={panelStatus.liquidationShort}
        />
        {/* `symbol` is the pane's THIRD prop since `T-04.8`: the approved header states the series'
            identity on the pane (symbol · publisher · the two grids). Since `T-02.5` it is the
            route's resolved `[symbol]` segment, passed into `SymbolClient` above — never
            `panels.symbol` (that field stays `charts`' own fixed constant), and never re-derived
            here. */}
        <LongShortPane longShort={longShort} status={panelStatus.longShort} symbol={symbol} wallState={longShortWallState} />
      </AxisSyncProvider>
      <section aria-label="Ao vivo">
        <h2 className="font-label-caps text-label-caps text-on-surface">Ao vivo</h2>
        <ul>
          <LiveRow label="preço" factKey="price" url={liveUrls.price} />
          <LiveRow label="oi" factKey="oi" url={liveUrls.oi} />
          <LiveRow label="cvd" factKey="cvd" url={liveUrls.cvd} />
        </ul>
      </section>
    </main>
  );
}
