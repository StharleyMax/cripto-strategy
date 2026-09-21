/**
 * `T-02.4`, `ADR-034/D8` — the `/symbol` route: BTCUSDT, Preço + OI + CVD (delta e acumulado),
 * 4 dias (`plano 02` itens `2.4`+`2.5`), Server Component (`async`, no `"use client"`,
 * `ADR-005/D5`).
 *
 * ── THE PIPELINE, IN ORDER ───────────────────────────────────────────────────────────────────
 *
 *   1. `GET /series-catalog` (reused from `features/s3-inspector/series-catalog-query.ts` —
 *      the SAME query `/console` already makes; not duplicated here) — its wire carries the
 *      15 raw `SeriesKey` terms for every cataloged series, BTCUSDT included, but no
 *      `series_key_id` of its own (`view-model.ts`'s own comment on `computeSeriesKeyId`).
 *   2. For each of the 3 panels PLUS the volume sub-axis of the price panel (`T-01.7`,
 *      `SPEC-007 §3.6` — `klines_volume`, `1m`, cataloged by `T-01.6`), find the ONE catalog
 *      entry that matches (symbol + a per-series selector, below), recompute its `series_key_id`
 *      (`view-model.ts::computeSeriesKeyId`), and fetch `GET /series-history` for it
 *      (`series-history-client.ts`) over the TRAILING 4-day window `resolveRouteWindow`
 *      derives from this request's own clock reading (`request-window.ts`; the geometry itself
 *      is `charts`' `resolveTrailingWindow`, reached through the `ADR-034/D8` barrel — this
 *      route neither invents a second window nor computes a bucket boundary).
 *
 *      ⛔ It used to be a FIXED window (`RANGE_START_MS`/`RANGE_END_MS_EXCLUSIVE`, four days of
 *      2026-08). That was the second defect of `ACHADO-SERIES-HISTORY-SEM-PONTO.md`: the data
 *      starts at 2026-09-04, so the route asked for a window that precedes every row that
 *      exists and the page rendered nothing while every link in the chain worked.
 *   3. Map the rows into `RawCandle[]`/`ScalarPoint[]`/`ScaledCvdDeltaInput[]`
 *      (`view-model.ts`) and call `buildS2Panels` (the barrel) to get the 3 panels; volume is
 *      mapped separately (`volumeSlotsFromHistoryRows`) because it is a sub-axis, not a panel.
 *   4. Hand `{ panels, priceCandles, volume, cvd, panelStatus, liveUrls }` to
 *      `SymbolClient.tsx` by props.
 *
 * ⚠️ THE LIST ABOVE SAYS "3 panels" BECAUSE `buildS2Panels` BUILDS THREE. The route now resolves
 * TEN series: the price panel's FOUR (`T-01.8` — `klines_ohlc` `OPEN`/`HIGH`/`LOW`/`CLOSE`,
 * `SPEC-008`/`D1`, one candle per bucket that answers all four), OI, CVD, the volume sub-axis
 * (`T-01.7`), the two liquidation cohorts (`T-05.9`) and `count_long_short_ratio` (`T-04.5`, M3 —
 * the first NEW pane of `SPEC-007`). The four newest panes are NOT part of `S2RawInputs`: widening
 * `charts`' panel composition is a change to a component these `web` tasks do not own (`ADR-003`),
 * so each is mapped from the route's own wire grid and degrades on its own status. Their sections
 * are at the bottom of this file, each with the argument for why it is not a fourth member of
 * `S2Panels`.
 *
 * ⛔ ELEVEN CATALOG LOOKUPS, TEN FETCHES: `priceUse === S2_PRICE_USE` (`klines_last`) is still
 * RESOLVED, and deliberately NOT fetched — it feeds the live-stream URL of the price readout and
 * nothing else. It used to be the series the panel DREW, as a degenerate candle; `RN-2` retired
 * that drawing in the same commit that added the four (`view-model.ts`'s own section).
 *
 * ── WHY EVERY FAILURE DEGRADES TO ABSENCE, NEVER A THROWN PAGE (`CA-F2-3`) ──────────────────
 *
 * Three independent, NAMED failure modes exist today, and all three render as absence, exactly
 * like a real `SEM_PONTO` row would (`view-model.ts`'s own docstring on the central rule):
 *
 *   - the catalog has NO entry for a panel's selector. ⚠️ THIS BULLET USED TO NAME CVD AS THE
 *     MEASURED EXAMPLE, and `T-02.5` retired that example rather than leaving it to rot: the
 *     panel asked for `metric === "cvd_delta"`, a metric no builder in
 *     `backend/src/modules/sentimento/domain/` ever produced, so the selector could not match
 *     and the panel was absent BY CONSTRUCTION. Since `T-02.3` the collector publishes
 *     `cvd_source`/`binance`/`NA` (`2*takerBuy[9] - volume[5]`, off the same `/fapi/v1/klines`
 *     array phase `01` already fetches) and this route selects THAT row
 *     (`view-model.ts::matchesKlineTakerBuyCvd`). The failure MODE stays real for any panel —
 *     a catalog that does not carry a selector's row still degrades to absence here;
 *   - the catalog carries MORE THAN ONE row a panel's selector matches (`T-03.5`). This one is
 *     NEW as a rendered state and OLD as a defect: it used to resolve, silently, to whichever
 *     row came first — which is how the OI panel spent this phase pointed at `coinalyze`/`OPEN`,
 *     a series with zero rows, while `binance`/`POINT` had 8.064
 *     (`handoff/T-03.5-T-03.6-FRONT.md` §2). `resolveCatalogEntry` now refuses to choose and the
 *     panel says `ambiguous_in_catalog` on screen;
 *   - `GET /series-history` throws `TransportError` (missing base URL, connection refused,
 *     non-2xx, malformed envelope) — the SAME four kinds `/console` already handles;
 *   - the catalog fetch itself throws `TransportError` — every panel degrades together.
 *
 * In every case the panel's raw inputs become empty arrays and `missingDays` becomes the FULL
 * day list of the window — `buildS2Panels`'s own grid-alignment machinery (untouched,
 * `plan 02`'s "no new charts geometry" non-goal) then renders every slot as an explicit gap,
 * which `s2-lightweight-adapter.ts`'s LOSSLESS mappings turn into `WhitespaceItem`s on screen.
 * No branch anywhere in this pipeline substitutes a `0` for "I could not get a real number".
 *
 * `dynamic = "force-dynamic"`: same reasoning `console/page.tsx` documents in full — this
 * route's transports throw synchronously on a missing `INGEST_HEALTH_API_BASE_URL` BEFORE any
 * `fetch` call, which would otherwise let `next build` bake a stale static error page.
 */

import type { Metadata } from "next";

import {
  buildS2Panels,
  FIVE_MINUTES_MS,
  S2_PRICE_USE,
  SYMBOL,
  type S2Panels,
  type S2RawInputs,
} from "../../charts/index.ts";
import {
  fetchSeriesCatalogProjectionViaHttp,
  TransportError,
  type SeriesCatalogProjection,
} from "../../features/s3-inspector/series-catalog-query.ts";
import type { SeriesCatalogEntry } from "../../features/s3-inspector/series-catalog.ts";
import type { BarPolicy, HistoryRequestKey } from "../history-transport.ts";
import { encodeLiveStreamOpenRequest, liveStreamUrl, type LiveStreamOpenRequest } from "../live-transport.ts";
import {
  fetchSeriesHistoryViaHttp,
  type SeriesHistoryRow,
} from "./series-history-client.ts";
import type { PanelStatus } from "./panel-status.ts";
import { resolveRouteWindow, type RouteWindow } from "./request-window.ts";
import {
  SymbolClient,
  type CvdPaneData,
  type LiquidationCohortData,
  type LiquidationPaneData,
  type LongShortPaneData,
  type OiPaneData,
  type PriceCandleData,
  type VolumeSubAxisData,
} from "./SymbolClient.tsx";
import {
  assembleOhlcCandles,
  computeSeriesKeyId,
  countNativeBarsByPublication,
  countPresentCandleSlots,
  countPresentSlots,
  countZeroSlots,
  firstPresentSlotMs,
  daysWithPresence,
  keyMatchesSymbol,
  lastPresentSlotMs,
  lastReadableAvailableAtMs,
  matchesBinanceOpenInterest,
  matchesCountLongShortRatio,
  matchesKlineTakerBuyCvd,
  matchesKlinesOhlc,
  matchesLiquidationCohort,
  nonNegativeFlowSlotsFromHistoryRows,
  resolveFlowReadingOrAbsent,
  resolveFreshnessVerdict,
  resolveSeriesProvenance,
  scalarPointsFromHistoryRows,
  scaledCvdDeltasFromHistoryRows,
  seriesValueStats,
  slotsFrom,
  trailingAbsentSlots,
  type KlinesOhlcReduction,
} from "./view-model.ts";

export const metadata: Metadata = {
  title: "cripto-strategy — Símbolo",
};

export const dynamic = "force-dynamic";

const BAR_POLICY: BarPolicy = "final_only";

/**
 * `T-04.8` — the TRAILING SUB-WINDOW the approved long/short form measures separately (*"ÚLTIMAS 4
 * HORAS"*, `gates/design-04.md` §R2, veredito `APPROVED`).
 *
 * ⛔ `4 h` IS NOT A ROUND NUMBER SOMEBODY LIKED — it is the CEILING of this feature's declared
 * operating timeframe, `15min..4h` (`tasks.toml`, `T-04.9`'s falsifier), and the gate measured the
 * series over exactly that band: at `15 min` the median excursion is `0.88 px` and `25,5%` of the
 * windows do not move half a pixel; at `4 h` it is `13.18 px` and `0,0%`
 * `[DOC: gates/design-04.md §R2.7, n=850 native observations over 4 days]`. The pane publishes the
 * top of the band NUMERICALLY for the reason that measurement gives: the bottom of it is, on this
 * scale, not readable as geometry — so the number is how the operator reads it.
 */
const LONG_SHORT_RECENT_SPAN_MS = 4 * 60 * 60_000;
// ⛔ `const OI_METRIC = "sum_open_interest"` USED TO LIVE HERE, AND IT WAS THE WHOLE SELECTOR.
// `T-03.5` retired it: the metric is one of THREE terms now and all three live in
// `view-model.ts::matchesBinanceOpenInterest`, where a `node --test` suite can execute them
// against a fixture that carries all five rows of this metric. Leaving the constant here would
// leave a second, weaker way to spell the same selection one import away.
/** `T-01.7` / `SPEC-007 §4`, row M1 — the volume SUB-AXIS of the price panel (§3.6), whose
 * catalog entry `T-01.6` registered (`domain/klines_volume_catalog.py`, `metric` transcribed
 * here, not re-derived). Its `interval` is `1m` (§4.1), the grid `/series-history` serves
 * natively, so this request asks for exactly the same `interval` the other three do while the
 * series behind it is the only one of the four with no ladder. */
const VOLUME_METRIC = "klines_volume";

/** What the catalog answered for ONE panel's selector — never a bare entry.
 *
 * `"ambiguous"` is the member that did not exist and had to (`T-03.5`), see below. */
type CatalogResolution =
  | { readonly kind: "found"; readonly entry: SeriesCatalogEntry }
  | { readonly kind: "none" }
  | { readonly kind: "ambiguous"; readonly matches: number };

/**
 * ⛔ `Array.prototype.find` IS GONE FROM THIS ROUTE, AND THAT IS THE FIX OF `T-03.5` — not the
 * three-term OI predicate one line below, which is only what makes THIS metric unambiguous.
 *
 * The measured defect (`handoff/T-03.5-T-03.6-FRONT.md` §2): the OI panel asked for
 * `metric === "sum_open_interest"`, the served catalog carries FIVE rows of that metric per
 * instrument, `find` answered the FIRST — `coinalyze`/`OPEN`, a series with `0` rows in
 * `md.series` while the Binance one has `8.064`. The route answered `200`, the panel drew an
 * all-absent grid, and NOTHING in the response, the logs or the gates could tell that apart from
 * a market with no data.
 *
 * The same shape had already been paid for once on CVD (`view-model.ts`'s `cvd_source` section:
 * `metric` alone silently selects `aggtrade_q`, also empty). Twice is a class, not an accident —
 * so the fix is structural and applies to ALL FOUR selectors of this route: a selector that
 * matches more than one row RESOLVES TO NOTHING, with the count carried out, instead of
 * resolving to whichever row the catalog happens to list first.
 *
 * ⚠️ WHY THE SET IS SCANNED WHOLE INSTEAD OF SHORT-CIRCUITING: the cost of `filter` over `find`
 * here is one pass over 44 entries (`GET /series-catalog` `n_entries` at this SHA, 4 pilot
 * instruments x 11..13 rows), and the whole point is to KNOW there was a second match. A
 * short-circuit is precisely the optimization that made the defect unobservable.
 *
 * Measured over the catalog this route reads `[MEDIDO 2026-09-12: GET /api/v1/series-catalog,
 * n=13 linhas para BTCUSDT]` — the four selectors of this route match, respectively:
 * price `1` (`priceUse === "structure_detection"`), OI `1` (three terms; `metric` alone would be
 * `5`), CVD `1` (three terms; `metric` alone would be `4`), volume `1` (`klines_volume` is a
 * single row today). Every one of them is unique, and now that is ENFORCED rather than assumed.
 */
function resolveCatalogEntry(
  catalog: SeriesCatalogProjection,
  predicate: (entry: SeriesCatalogEntry) => boolean,
): CatalogResolution {
  const matches = catalog.entries.filter((entry) => keyMatchesSymbol(entry.key, SYMBOL) && predicate(entry));
  if (matches.length === 1) {
    return { kind: "found", entry: matches[0]! };
  }
  return matches.length === 0 ? { kind: "none" } : { kind: "ambiguous", matches: matches.length };
}

/** The catalog fetch itself failed ⇒ every panel degrades together, and none of them may claim
 * "not in catalog": there is no catalog to have been absent from. */
const CATALOG_UNAVAILABLE: CatalogResolution = { kind: "none" };

/** The entry a panel resolved, or `undefined` — for the two consumers that only need the key
 * (`buildLiveUrl` and the OI pane's own `maxStalenessMs`). Absence and ambiguity collapse here
 * on purpose: neither yields a series to open a stream for or to publish a ceiling from. */
function resolvedEntry(resolution: CatalogResolution): SeriesCatalogEntry | undefined {
  return resolution.kind === "found" ? resolution.entry : undefined;
}

/** `T-01.8` — ONE of the four `klines_ohlc` rows, by `reduction`. The predicate is
 * `view-model.ts`'s (three terms, each named there), and `resolveCatalogEntry`'s refusal to
 * choose among multiple matches applies unchanged: two rows differing only in `verified_by`
 * would leave this panel saying `ambiguous_in_catalog` instead of drawing a candle built from
 * whichever the catalog happened to list first. */
function resolveOhlcCatalogEntry(
  catalog: SeriesCatalogProjection,
  catalogStatus: PanelStatus,
  reduction: KlinesOhlcReduction,
): CatalogResolution {
  return catalogStatus.kind === "ok"
    ? resolveCatalogEntry(catalog, (entry) => matchesKlinesOhlc(entry.key, reduction))
    : CATALOG_UNAVAILABLE;
}

/**
 * ONE status for a panel whose data comes from MORE THAN ONE series — the first non-`ok` of
 * `statuses`, in the order given, or `ok` when every one of them is.
 *
 * ⛔ THE CANDLE IS AN ALL-OR-NOTHING READ, and this is the rendering half of that. A bucket
 * needs all four readings (`assembleOhlcCandles`), so one series failing means NO candle is
 * drawn anywhere in the window — and a panel drawing nothing while reporting `ok` because
 * three of its four fetches succeeded is the "every link in the chain reported success" state
 * this route has already paid for twice (`resolveCatalogEntry`'s own header). The first reason
 * is published rather than a synthetic "one of four failed": every member of the union is a
 * reason an operator can act on, and inventing a fifth would name none of them.
 */
function firstAbsentStatus(statuses: readonly PanelStatus[]): PanelStatus {
  return statuses.find((status) => status.kind !== "ok") ?? { kind: "ok" };
}

/** `routeWindow` is PASSED IN, not read from a module constant: one clock reading serves the
 * whole render, so the four panels are guaranteed to be asking about the same window even if
 * the request straddles a bucket boundary. */
async function fetchPanelRows(
  resolution: CatalogResolution,
  routeWindow: RouteWindow,
): Promise<{ readonly rows: readonly SeriesHistoryRow[]; readonly status: PanelStatus }> {
  if (resolution.kind === "none") {
    return { rows: [], status: { kind: "absent", reason: "not_in_catalog" } };
  }
  if (resolution.kind === "ambiguous") {
    // ⛔ NO REQUEST IS ISSUED. Picking one of the matches to ask about would be `Array.find` with
    // extra steps — the panel says it cannot identify its own series, and the screen shows that.
    return { rows: [], status: { kind: "absent", reason: "ambiguous_in_catalog" } };
  }
  const entry = resolution.entry;
  const key: HistoryRequestKey = {
    series_key_id: computeSeriesKeyId(entry.key),
    symbol: SYMBOL,
    interval: "1m",
    window_start_ms: routeWindow.window.startMs,
    window_end_ms: routeWindow.windowEndMsInclusive,
    knowledge_time_ms: routeWindow.knowledgeTimeMs,
    bar_policy: BAR_POLICY,
  };
  try {
    const envelope = await fetchSeriesHistoryViaHttp(key);
    return { rows: envelope.rows, status: { kind: "ok" } };
  } catch (cause) {
    if (!(cause instanceof TransportError)) {
      throw cause;
    }
    return { rows: [], status: { kind: "absent", reason: cause.kind } };
  }
}

/** Builds the 3 `LiveStreamOpenRequest` URLs (`../live-transport.ts`) for whichever panels DID
 * resolve a `series_key_id` — `null` for a panel that stayed absent, since there is no series
 * to open a live stream for. Genuinely used (not decorative): `encodeLiveStreamOpenRequest`
 * validates the request before `SymbolClient` ever sees the URL. */
function buildLiveUrl(baseUrl: string, entry: SeriesCatalogEntry | undefined): string | null {
  if (entry === undefined) {
    return null;
  }
  const request: LiveStreamOpenRequest = {
    series_key_id: computeSeriesKeyId(entry.key),
    symbol: SYMBOL,
    interval: "1m",
  };
  encodeLiveStreamOpenRequest(request); // validates; throws on an incomplete request
  return liveStreamUrl(baseUrl, request).toString();
}

export default async function SymbolPage() {
  // The ONE clock reading of this render. `Date.now()` is I/O and therefore lives here, in
  // `web`, and nowhere else — `request-window.ts`/`resolveTrailingWindow` take it as an
  // argument precisely so the window stays falsifiable at every instant.
  const routeWindow = resolveRouteWindow(Date.now());

  let catalog: SeriesCatalogProjection;
  let catalogStatus: PanelStatus = { kind: "ok" };
  try {
    catalog = await fetchSeriesCatalogProjectionViaHttp();
  } catch (cause) {
    if (!(cause instanceof TransportError)) {
      throw cause;
    }
    catalog = { query: "series_catalog", n_entries: 0, entries: [] };
    catalogStatus = { kind: "absent", reason: cause.kind };
  }

  // ⛔ `T-01.8` — THE PANEL NO LONGER FETCHES A HISTORY FOR THIS RESOLUTION, and the split is
  // the whole point. `priceUse === S2_PRICE_USE` resolves `klines_last` (`ADR-007`'s
  // `structure_detection` row), which is ONE scalar per bucket — the series the retired
  // degenerate candle was built from. What the panel DRAWS now is the four `klines_ohlc`
  // readings below (`SPEC-008`/`D1`). This entry survives for ONE consumer, named here so it
  // cannot quietly grow a second: the live stream URL, whose retargeting is not this task's
  // (it is a text readout of the last traded price, not a bar on the chart).
  const priceLiveStreamResolution =
    catalogStatus.kind === "ok"
      ? resolveCatalogEntry(catalog, (entry) => entry.priceUse === S2_PRICE_USE)
      : CATALOG_UNAVAILABLE;
  // `T-01.8` / `SPEC-008` §3.4 — FOUR resolutions, one per `Reduction`, never one "the candle"
  // selector. The four rows share `metric`, `provider`, `interval` and every other term of the
  // fifteen except `reduction` (`klines_ohlc_catalog.py`), so `reduction` is the term that
  // identifies each of them and it is passed EXPLICITLY at each of the four call sites — a
  // helper that looped the four names here would be a fifth place for `HIGH` and `LOW` to swap.
  const ohlcResolutions = {
    open: resolveOhlcCatalogEntry(catalog, catalogStatus, "OPEN"),
    high: resolveOhlcCatalogEntry(catalog, catalogStatus, "HIGH"),
    low: resolveOhlcCatalogEntry(catalog, catalogStatus, "LOW"),
    close: resolveOhlcCatalogEntry(catalog, catalogStatus, "CLOSE"),
  };
  // `T-03.5` — the predicate is `view-model.ts`'s (three terms, each one named there with the
  // sibling row it excludes and the one that is redundant today said out loud). ⛔ It used to be
  // `entry.key.metric === OI_METRIC`, which matches FIVE rows and whose first match has zero rows
  // in `md.series`: the measured defect of `handoff/T-03.5-T-03.6-FRONT.md` §2.
  const oiResolution =
    catalogStatus.kind === "ok"
      ? resolveCatalogEntry(catalog, (entry) => matchesBinanceOpenInterest(entry.key))
      : CATALOG_UNAVAILABLE;
  // `T-02.5` — the CVD panel now reads a series that EXISTS: `cvd_source`/`binance`/`NA`, the
  // `kline_takerbuy` row `T-02.3`'s collector publishes off the same `/fapi/v1/klines` array
  // phase `01` already fetches. The predicate is `view-model.ts`'s (three terms, each one
  // load-bearing — see the section there for which sibling row each term excludes and why
  // `metric === "cvd_source"` alone silently selects `aggtrade_q`, a series with no rows).
  const cvdResolution =
    catalogStatus.kind === "ok"
      ? resolveCatalogEntry(catalog, (entry) => matchesKlineTakerBuyCvd(entry.key))
      : CATALOG_UNAVAILABLE;
  const volumeResolution =
    catalogStatus.kind === "ok"
      ? resolveCatalogEntry(catalog, (entry) => entry.key.metric === VOLUME_METRIC)
      : CATALOG_UNAVAILABLE;
  // `T-05.9` — TWO resolutions, one per leg, and NEVER one that sums them. `cohort` is a term of
  // identity (`SPEC-001` §2.1) and `liquidation_catalog.py` publishes one row per leg on purpose:
  // long liquidation is forced SELLING, short liquidation is forced BUYING, and the sum of the two
  // moves identically whether the market flushed longs, flushed shorts or flushed both. The
  // predicate is `view-model.ts`'s (three terms, each named there with the sibling row it excludes).
  const liquidationLongResolution =
    catalogStatus.kind === "ok"
      ? resolveCatalogEntry(catalog, (entry) => matchesLiquidationCohort(entry.key, "long"))
      : CATALOG_UNAVAILABLE;
  const liquidationShortResolution =
    catalogStatus.kind === "ok"
      ? resolveCatalogEntry(catalog, (entry) => matchesLiquidationCohort(entry.key, "short"))
      : CATALOG_UNAVAILABLE;
  // `T-04.5` — M3, the first NEW pane of this feature. TWO terms, both load-bearing, and the
  // predicate is `view-model.ts`'s (`metric` alone matches exactly 1 today, MEASURED there;
  // `provider` is what keeps the pane on the ORIGIN the day Coinalyze's mirror of the same quotient
  // is cataloged). ⛔ `count_long_short_ratio` and not "long/short": M3 is FOUR series, and
  // `series_key.FORBIDDEN_METRIC_NAMES` refuses the generic name in code.
  const longShortResolution =
    catalogStatus.kind === "ok"
      ? resolveCatalogEntry(catalog, (entry) => matchesCountLongShortRatio(entry.key))
      : CATALOG_UNAVAILABLE;

  const [
    openResult,
    highResult,
    lowResult,
    closeResult,
    oiResult,
    cvdResult,
    volumeResult,
    liquidationLongResult,
    liquidationShortResult,
    longShortResult,
  ] = await Promise.all([
    fetchPanelRows(ohlcResolutions.open, routeWindow),
    fetchPanelRows(ohlcResolutions.high, routeWindow),
    fetchPanelRows(ohlcResolutions.low, routeWindow),
    fetchPanelRows(ohlcResolutions.close, routeWindow),
    fetchPanelRows(oiResolution, routeWindow),
    fetchPanelRows(cvdResolution, routeWindow),
    fetchPanelRows(volumeResolution, routeWindow),
    fetchPanelRows(liquidationLongResolution, routeWindow),
    fetchPanelRows(liquidationShortResolution, routeWindow),
    fetchPanelRows(longShortResolution, routeWindow),
  ]);

  // The day list is the window's own (`utcDaysCovered`, derived in `charts`), never a literal.
  const days = routeWindow.window.days;
  const oiPresence = daysWithPresence(oiResult.rows, days);
  const cvdPresence = daysWithPresence(cvdResult.rows, days);

  // `T-01.8` — the candle is assembled ONCE, here, from the four row sets, and both the bars
  // and the counts the screen publishes come out of that single pass (`assembleOhlcCandles`):
  // a second traversal to "count what was drawn" is how a printed number and a plotted bar
  // start disagreeing.
  const candleAssembly = assembleOhlcCandles({
    open: openResult.rows,
    high: highResult.rows,
    low: lowResult.rows,
    close: closeResult.rows,
  });
  const priceStatus = firstAbsentStatus([
    openResult.status,
    highResult.status,
    lowResult.status,
    closeResult.status,
  ]);

  const rawInputs: S2RawInputs = {
    window: routeWindow.window,
    candles: candleAssembly.candles,
    // ⛔ UNCHANGED, AND THE OMISSION IS DELIBERATE (`SPEC-008` §2.1): `price_use` /
    // `price_source` are `ADR-007`/`PS-1`'s decision table, which this feature does not
    // reopen. `structure_detection` ⇒ `klines_last` is the CONCEPT "the traded price off
    // `/fapi/v1/klines`" — the very endpoint the four `klines_ohlc` readings are read from —
    // and the four catalog rows themselves carry `price_use = None` on purpose
    // (`klines_ohlc_catalog.py`), so nothing here claims one for them.
    priceUse: S2_PRICE_USE,
    oiPoints: scalarPointsFromHistoryRows(oiResult.rows, FIVE_MINUTES_MS),
    oiMissingDays: oiPresence.missingDays,
    cvdDeltas: scaledCvdDeltasFromHistoryRows(cvdResult.rows),
    cvdMissingDays: cvdPresence.missingDays,
    cvdCoveredDays: cvdPresence.coveredDays,
    // ⛔ THE ANCHOR IS CHOSEN HERE, EXPLICITLY, AND SHOWN ON SCREEN — never inherited in
    // silence. `delta` is anchor-free (one signed value per bucket); `cumulativo` is a VIEW over
    // it whose every point depends on where the sum starts, and three different anchors over the
    // SAME deltas invert the sign of the total (`domain/cvd.py::cvd_cum`, `D4.7`). Passing
    // `undefined` would land on `buildCvdPanel`'s own default — the same window start this line
    // names — but it would land there WITHOUT the route ever stating which anchor it chose, and
    // `SymbolClient.tsx` prints `panels.window.startMs` as the anchor the curve counts from.
    // Writing it out is what keeps that printed claim true by construction rather than by
    // coincidence of a default two modules away (`cvd-pane-dom-contract.test.ts` pins the pair).
    cvdAnchorMs: routeWindow.window.startMs,
  };

  // Each field of `rawInputs` above ALREADY degrades to `[]`/every-day-missing independently
  // per panel (`fetchPanelRows` returns `rows: []` on its own failure) — no further collapsing
  // needed here even when every panel failed; `rawInputs` and `EMPTY_PANELS_INPUT` would be
  // equivalent in that case anyway. `buildS2Panels` never sees a mix that hides one panel's
  // real data because a SIBLING panel's fetch failed.
  const panels: S2Panels = buildS2Panels(rawInputs);

  // ── What the price panel DREW, and what it could not (`T-01.8`) ───────────────────────────
  //
  // `drawnCandles` is counted off `panels.price.series.slots` — the SAME array
  // `candlestickSeriesLossless` maps into the items `setData` receives — so the number the
  // screen prints is the number of bars the canvas gets, not a hopeful recount of the rows.
  // `gridSlots` is the window's own grid, so the pair reads as "N buckets of M carry a candle"
  // and an empty panel says `0/5760` instead of saying nothing.
  const priceCandles: PriceCandleData = {
    drawnCandles: countPresentCandleSlots(panels.price.series.slots),
    gridSlots: panels.price.series.slots.length,
    // ⛔ THE HOLE, NAMED. A bucket that answered one, two or three of the four readings draws
    // NOTHING (`assembleOhlcCandles`) — and without this count it would be indistinguishable
    // from a bucket that answered none, which is `SPEC-008` §7.2's "queijo suíço" hiding
    // behind a clean-looking gap.
    partialBuckets: candleAssembly.partialBuckets,
  };

  // ── The volume sub-axis (`T-01.7`) ────────────────────────────────────────────────────────
  //
  // NOT part of `S2RawInputs`/`buildS2Panels`: `SPEC-007 §3.6` makes volume a SUB-AXIS of the
  // price panel, and widening `charts`' panel composition for it would be a change to a
  // component this task does not own (`ADR-003`; this task is `components = ["web"]`). The
  // slots are the route's OWN 1-minute grid, transcribed — see `view-model.ts`'s section on
  // `klines_volume` for why that is transcription and not a second grid implementation.
  //
  // Every failure degrades exactly like the three panels above: `volumeResult.rows` is `[]`, so
  // `slots` is `[]`, `presentPoints` is `0` and the reading is `absent` — which the sub-axis
  // prints as `SEM_PONTO`. No branch anywhere here substitutes a `0` for a missing number, and
  // for this `FLOW` series that is a rule of TYPE, not of taste (`RN-1`).
  const volumeSlots = nonNegativeFlowSlotsFromHistoryRows(volumeResult.rows);
  const volume: VolumeSubAxisData = {
    slots: volumeSlots,
    presentPoints: countPresentSlots(volumeSlots),
    // The left end of the readable horizon, DECLARED on screen rather than left to look like a
    // dead market (`quant-architect`, wave `03`, C4). Derived from the same slots the sub-axis
    // draws, so the number the screen prints and the bars it draws cannot disagree.
    firstPresentMs: firstPresentSlotMs(volumeSlots),
    // `windowEndMsInclusive` is the same instant `SymbolClient.tsx` derives as `lastInstantMs`
    // for the other three readouts — one instant for the whole page, not a fourth one.
    reading: resolveFlowReadingOrAbsent(volumeSlots, routeWindow.windowEndMsInclusive),
  };

  // ── The CVD panel's own declared facts (`T-02.5`) ─────────────────────────────────────────
  //
  // Derived from the slots `buildCvdPanel` just produced — the SAME array `CvdPane` draws — so
  // the count the screen prints and the line it plots cannot disagree. `countPresentSlots` and
  // `firstPresentSlotMs` are REUSED from the volume sub-axis (`T-01.7`), not re-written: both
  // take a `ScalarSlot[]`, and `deltaSlots` is one. For a `1m`-native series the present-slot
  // count IS the count of distinct native bars — no `RN-S1` `/5` divisor (`SPEC-007 §4.1`), the
  // same reasoning `countPresentSlots`'s own docstring gives for M1.
  const cvdDeltaSlots = panels.cvd.deltaSlots;
  const cvd: CvdPaneData = {
    presentPoints: countPresentSlots(cvdDeltaSlots),
    firstPresentMs: firstPresentSlotMs(cvdDeltaSlots),
    anchorMs: routeWindow.window.startMs,
  };

  // ── The OI pane's own declared facts (`T-03.5`) ───────────────────────────────────────────
  //
  // ⛔ `nativeBars` IS THE `RN-S1` DIVISOR, PAID IN THE TYPE INSTEAD OF IN A `/5`. The route
  // serves a `5m` series on a `1m` grid (`series_history.py` steps `_GRID_STEP_MS`, `GA-2`), so
  // ONE native bucket appears as up to FIVE wire rows — a staircase, not five observations. The
  // naive count of readable wire rows therefore overstates the data by ~5x, and `DoD-3`'s
  // "`N >= 30`" read off it would pass with SIX real buckets.
  //
  // This code does not divide, and does not have to: `scalarPointsFromHistoryRows(rows,
  // FIVE_MINUTES_MS)` already keeps only the rows landing ON the 5-minute grid
  // (`event_time % 300_000 === 0`) and `buildOiPanel` aligns them to a 5-minute canonical grid,
  // so `panels.oi.slots` carries ONE SLOT PER NATIVE BUCKET and `countPresentSlots` over it is a
  // count of native buckets — exact, with no heuristic about repeated values (two adjacent
  // buckets carrying the SAME open interest are two buckets, and a "distinct consecutive values"
  // rule would silently merge them).
  //
  // ⚠️ `wirePoints` IS PUBLISHED BESIDE IT ON PURPOSE, and it is the number nobody should quote:
  // it is the staircase count, kept on screen so the ratio is VISIBLE and so `e2e/12` can assert
  // that the pane's own number is NOT that one. A falsifier needs both figures to compare, and
  // the phase's stated failure mode is exactly "contar 150 pontos onde há 30 barras".
  const oiGridSlots = panels.oi.slots;
  const oiEntry = resolvedEntry(oiResolution);
  const oi: OiPaneData = {
    nativeBars: countPresentSlots(oiGridSlots),
    wirePoints: oiResult.rows.filter((row) => row.value !== null).length,
    firstPresentMs: firstPresentSlotMs(oiGridSlots),
    lastPresentMs: lastPresentSlotMs(oiGridSlots),
    // `RNF-2`: the ceiling is the catalog's OWN `max_staleness_ms` for this series, read off the
    // entry this panel resolved — no new field, no route re-versioned (`RF-5`), and the same
    // number `as_of` enforced server-side. `null` when no entry resolved: a panel that could not
    // identify its series has no ceiling to be judged against, and inventing one would be a
    // freshness claim made out of ignorance.
    maxStalenessMs: oiEntry?.maxStalenessMs ?? null,
    // ⛔ `oiResult.rows`, NEVER `oiGridSlots` — `A-4.2`. The grid slots are what the server's LOCF
    // produced, so measuring age against them charges `max_staleness_ms` a second time after the
    // server already spent it; the age the screen owes the operator is `T - available_at`, and
    // only the wire rows carry `available_at`. See
    // `docs/context/cinco-metricas-do-core/gates/T-03.5-T-03.6-A-4.2-decisao-limiar.md`.
    freshness: resolveFreshnessVerdict(oiResult.rows, routeWindow.windowEndMsInclusive, oiEntry?.maxStalenessMs ?? null),
  };

  // ── The liquidation pane (`T-05.9`, M4) ───────────────────────────────────────────────────
  //
  // NOT part of `S2RawInputs`/`buildS2Panels`, for the same reason the volume sub-axis is not:
  // widening `charts`' panel composition is a change to a component this task does not own
  // (`ADR-003`; this task is `components = ["web"]`). The slots are the route's own 1-minute grid,
  // transcribed — `sum_liquidation` is `interval="1m"` NATIVE (`liquidation_catalog.py`), which IS
  // the grid `/series-history` serves, so there is no re-gridding and no `RN-S1` divisor.
  //
  // ⛔ AND THE MAPPER IS THE VOLUME SUB-AXIS'S OWN, NOT A COPY OF IT. Both are non-negative `FLOW`
  // sums on the native grid, so `nonNegativeFlowSlotsFromHistoryRows` (renamed off
  // `volumeSlotsFromHistoryRows` by this task, see its docstring) serves both: `RN-1` is written
  // ONCE. A row with `absence !== null` becomes `value: null`, which the three-series rendering in
  // `SymbolClient.tsx` draws as the ABSENCE MARK — never as a zero bar, and never as the same mark
  // the legitimate zero of `ZL-3` gets. That distinction is the whole reason this pane is hard:
  // over the route's window, `5.570` of `5.761` grades carry no point at all.
  const liquidationCohortData = (rows: readonly SeriesHistoryRow[]): LiquidationCohortData => {
    const slots = nonNegativeFlowSlotsFromHistoryRows(rows);
    return {
      slots,
      presentPoints: countPresentSlots(slots),
      zeroPoints: countZeroSlots(slots),
      firstPresentMs: firstPresentSlotMs(slots),
      // `windowEndMsInclusive` — the SAME instant every other readout on this page uses. One
      // instant for the whole render, never a seventh one computed here.
      reading: resolveFlowReadingOrAbsent(slots, routeWindow.windowEndMsInclusive),
    };
  };
  // ⛔ `RS-5` IS RESOLVED FROM THE CATALOG ROW, NEVER SPELLED AS A LITERAL. A hardcoded "dado de
  // terceiro" sentence in the view would be true today and free to stay true after the series
  // stopped being third-party — `resolveSeriesProvenance` states the rule (origin = the venue's own
  // publisher AND not a reconstruction; everything else is DECLARED) and the type carries the
  // verdict across the boundary.
  //
  // The LONG entry answers for both legs: the two rows are built from one comprehension over
  // `COHORTS` (`liquidation_catalog.py`) and differ ONLY in `cohort`, so `provider`, `venue`,
  // `reconstructed_from`, `published_error` and `unit` are identical by construction. Said here
  // rather than left implied — if that ever stops holding, this line is where it breaks.
  const liquidationEntry = resolvedEntry(liquidationLongResolution);
  const liquidation: LiquidationPaneData = {
    long: liquidationCohortData(liquidationLongResult.rows),
    short: liquidationCohortData(liquidationShortResult.rows),
    provenance: resolveSeriesProvenance(liquidationEntry),
    // The `unit` term of the series' OWN identity (`USD`), printed beside the numeral — `W-1` of
    // `gates/design-01.md` failed the volume sub-axis for a numeral with no unit, and a literal
    // here would say the same thing while being free to drift from what the backend published.
    unit: liquidationEntry?.key.unit ?? null,
  };

  // ── The long/short pane (`T-04.5`, M3) ────────────────────────────────────────────────────
  //
  // NOT part of `S2RawInputs`/`buildS2Panels`, for the same reason the volume sub-axis and the
  // liquidation pane are not: widening `charts`' panel composition is a change to a component this
  // task does not own (`ADR-003`; this task is `components = ["web"]`). The slots are the route's
  // own `1m` WIRE grid, transcribed — and here the transcription keeps a STAIRCASE, because the
  // series is `5m` native (`long_short_catalog.LONG_SHORT_INTERVAL`) served on the `1m` grid
  // (`GA-2`). The ladder is not smoothed, hidden or re-gridded; it is what the read path serves.
  //
  // ⛔ AND THE MAPPER IS THE SHARED ONE, NOT A COPY. `nonNegativeFlowSlotsFromHistoryRows` is named
  // for its CONTRACT — a non-negative scalar whose absence stays absence — and a ratio of account
  // counts satisfies it (a quotient of two counts is never negative, and a negative one would be a
  // producer defect worth refusing rather than drawing). `RN-1` is written ONCE; a third copy of it
  // for this pane is exactly what `T-05.9` refused to write for liquidation.
  //
  // ⛔ `RN-S1` IS PAID BY `countNativeBarsByPublication`, AND NOT BY A `/5`. That function carries
  // the measurement that rules the two cheaper answers out for this series: the divisor understates
  // it by ~28% (runs of `1..5` slots, not always 5) and a `% 300_000` filter by 4,5x (this series'
  // observations do not land on the five-minute grid).
  //
  // ── `T-04.8`: THE NUMBERS THE APPROVED FORM PUBLISHES, DERIVED HERE AND NEVER IN THE VIEW ────
  //
  // The `design_gate` of `T-04.6` (`APPROVED`, Rev. 3 — `gates/design-04.md` §R2) put a SCALE
  // FOOTER, a FOUR-HOUR BAND, an AGE STAMP and a `cauda ausente` count on this pane. Every one of
  // them is computed from the rows this route already fetched, on the server, and handed over as
  // plain data — the same discipline the six panes above follow, and the structural answer to `M-1`
  // of that report: a rodada that tried to write those numbers instead of deriving them fabricated
  // SIX of them, and the audit caught it only because it was exhaustive.
  const longShortSlots = nonNegativeFlowSlotsFromHistoryRows(longShortResult.rows);
  const longShortEntry = resolvedEntry(longShortResolution);
  // The `available_at` of the newest READABLE row — a PUBLICATION instant, the same one `RNF-2`
  // uses for OI (`lastReadableAvailableAtMs`, and its docstring explains why it is not `max`).
  const longShortObservedAtMs = lastReadableAvailableAtMs(longShortResult.rows);
  const longShort: LongShortPaneData = {
    slots: longShortSlots,
    nativeBars: countNativeBarsByPublication(longShortResult.rows),
    wirePoints: countPresentSlots(longShortSlots),
    firstPresentMs: firstPresentSlotMs(longShortSlots),
    lastPresentMs: lastPresentSlotMs(longShortSlots),
    observedAtMs: longShortObservedAtMs,
    // ⛔ AN AGE, AND NOT A FRESHNESS VERDICT. `OiFreshness` compares the age against the catalog's
    // `max_staleness_ms` and can print "DADO VELHO"; this pane does not, and the difference is the
    // series' nature. Open interest is `STOCK`: the server carries the last observation forward, so
    // a number on screen can be much older than it looks and owes the operator a verdict. This one
    // is `RATIO` with `CARRY_FORWARD_BY_NATURE[Nature.RATIO] = False` — the readout at the window's
    // last instant is EXACT or it is `SEM_PONTO`, never stale-in-disguise. What `S-6` of the gate
    // asks for is the STAMP, at the right edge of time, and only where an observation exists.
    ageMs: longShortObservedAtMs === null ? null : routeWindow.windowEndMsInclusive - longShortObservedAtMs,
    trailingAbsentSlots: trailingAbsentSlots(longShortSlots),
    windowStats: seriesValueStats(longShortSlots),
    // The trailing band of the approved form. `windowEndMsInclusive - span` is a grid instant of
    // this very window, so `slotsFrom` filters the SAME slots the chart draws — it never re-grids
    // and never shrinks the window to fit the data (`M-2` of `gates/design-05.md`).
    recentSpanMs: LONG_SHORT_RECENT_SPAN_MS,
    recentStats: seriesValueStats(
      slotsFrom(longShortSlots, routeWindow.windowEndMsInclusive - LONG_SHORT_RECENT_SPAN_MS),
    ),
    // `RS-5` resolved from the catalog row, never spelled as a literal — same call, same rule as the
    // liquidation pane above. For M3 the venue's own publisher IS the provider, so this resolves to
    // `origin` and the pane says so instead of leaving procedência unstated.
    provenance: resolveSeriesProvenance(longShortEntry),
    // `windowEndMsInclusive` — the SAME instant every other readout on this page uses. One instant
    // for the whole render, never an eighth one computed here.
    reading: resolveFlowReadingOrAbsent(longShortSlots, routeWindow.windowEndMsInclusive),
    // The `unit` term of the series' own identity (`ratio`), printed beside the numeral — a literal
    // here would say the same thing while being free to drift from what the backend published.
    unit: longShortEntry?.key.unit ?? null,
    // ⛔ AND THE CADENCE COMES OFF THE SAME ROW, for exactly the reason the line above gives — the
    // `/review` `[WARNING]` of `T-04.8`: FOUR sentences of the pane spelled `5 min`/`5m` by hand
    // while this entry was already being read for `unit`, i.e. two rules for two terms of one
    // identity. `interval` is the KEY term (`5m`, what distinguishes this series from a `1m` one)
    // and `nativeGrid` is the SAMPLING property (`5min`); `e2e/14:330-331` asserts both against the
    // served catalog, separately, so neither can drift without a test noticing.
    nativeInterval: longShortEntry?.key.interval ?? null,
    nativeGrid: longShortEntry?.nativeGrid ?? null,
  };

  const baseUrl = process.env.INGEST_HEALTH_API_BASE_URL;
  const liveUrls =
    baseUrl === undefined
      ? { price: null, oi: null, cvd: null }
      : {
          price: buildLiveUrl(baseUrl, resolvedEntry(priceLiveStreamResolution)),
          oi: buildLiveUrl(baseUrl, resolvedEntry(oiResolution)),
          cvd: buildLiveUrl(baseUrl, resolvedEntry(cvdResolution)),
        };

  return (
    <SymbolClient
      panels={panels}
      priceCandles={priceCandles}
      volume={volume}
      cvd={cvd}
      oi={oi}
      liquidation={liquidation}
      longShort={longShort}
      panelStatus={{
        price: priceStatus,
        oi: oiResult.status,
        cvd: cvdResult.status,
        volume: volumeResult.status,
        liquidationLong: liquidationLongResult.status,
        liquidationShort: liquidationShortResult.status,
        longShort: longShortResult.status,
      }}
      knowledgeTimeMs={routeWindow.knowledgeTimeMs}
      liveUrls={liveUrls}
    />
  );
}
