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
 *   4. Hand `{ panels, volume, cvd, panelStatus, liveUrls }` to `SymbolClient.tsx` by props.
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
import { SymbolClient, type CvdPaneData, type OiPaneData, type VolumeSubAxisData } from "./SymbolClient.tsx";
import {
  computeSeriesKeyId,
  countPresentSlots,
  firstPresentSlotMs,
  daysWithPresence,
  keyMatchesSymbol,
  lastPresentSlotMs,
  matchesBinanceOpenInterest,
  matchesKlineTakerBuyCvd,
  rawCandlesFromHistoryRows,
  resolveFreshnessVerdict,
  resolveVolumeReading,
  scalarPointsFromHistoryRows,
  scaledCvdDeltasFromHistoryRows,
  volumeSlotsFromHistoryRows,
} from "./view-model.ts";

export const metadata: Metadata = {
  title: "cripto-strategy — Símbolo",
};

export const dynamic = "force-dynamic";

const BAR_POLICY: BarPolicy = "final_only";
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

  const priceResolution =
    catalogStatus.kind === "ok"
      ? resolveCatalogEntry(catalog, (entry) => entry.priceUse === S2_PRICE_USE)
      : CATALOG_UNAVAILABLE;
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

  const [priceResult, oiResult, cvdResult, volumeResult] = await Promise.all([
    fetchPanelRows(priceResolution, routeWindow),
    fetchPanelRows(oiResolution, routeWindow),
    fetchPanelRows(cvdResolution, routeWindow),
    fetchPanelRows(volumeResolution, routeWindow),
  ]);

  // The day list is the window's own (`utcDaysCovered`, derived in `charts`), never a literal.
  const days = routeWindow.window.days;
  const oiPresence = daysWithPresence(oiResult.rows, days);
  const cvdPresence = daysWithPresence(cvdResult.rows, days);

  const rawInputs: S2RawInputs = {
    window: routeWindow.window,
    candles: rawCandlesFromHistoryRows(priceResult.rows),
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
  const volumeSlots = volumeSlotsFromHistoryRows(volumeResult.rows);
  const volume: VolumeSubAxisData = {
    slots: volumeSlots,
    presentPoints: countPresentSlots(volumeSlots),
    // The left end of the readable horizon, DECLARED on screen rather than left to look like a
    // dead market (`quant-architect`, wave `03`, C4). Derived from the same slots the sub-axis
    // draws, so the number the screen prints and the bars it draws cannot disagree.
    firstPresentMs: firstPresentSlotMs(volumeSlots),
    // `windowEndMsInclusive` is the same instant `SymbolClient.tsx` derives as `lastInstantMs`
    // for the other three readouts — one instant for the whole page, not a fourth one.
    reading: resolveVolumeReading(volumeSlots, routeWindow.windowEndMsInclusive),
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
    freshness: resolveFreshnessVerdict(oiGridSlots, routeWindow.windowEndMsInclusive, oiEntry?.maxStalenessMs ?? null),
  };

  const baseUrl = process.env.INGEST_HEALTH_API_BASE_URL;
  const liveUrls =
    baseUrl === undefined
      ? { price: null, oi: null, cvd: null }
      : {
          price: buildLiveUrl(baseUrl, resolvedEntry(priceResolution)),
          oi: buildLiveUrl(baseUrl, resolvedEntry(oiResolution)),
          cvd: buildLiveUrl(baseUrl, resolvedEntry(cvdResolution)),
        };

  return (
    <SymbolClient
      panels={panels}
      volume={volume}
      cvd={cvd}
      oi={oi}
      panelStatus={{
        price: priceResult.status,
        oi: oiResult.status,
        cvd: cvdResult.status,
        volume: volumeResult.status,
      }}
      knowledgeTimeMs={routeWindow.knowledgeTimeMs}
      liveUrls={liveUrls}
    />
  );
}
