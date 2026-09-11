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
 *      (`series-history-client.ts`) over the fixed 4-day window `charts/index.ts` names
 *      (`RANGE_START_MS`/`RANGE_END_MS_EXCLUSIVE`, `s2-panels.ts`'s own decision, `ADR-034/D8`
 *      re-exports it — this route does not invent a second window).
 *   3. Map the rows into `RawCandle[]`/`ScalarPoint[]`/`ScaledCvdDeltaInput[]`
 *      (`view-model.ts`) and call `buildS2Panels` (the barrel) to get the 3 panels; volume is
 *      mapped separately (`volumeSlotsFromHistoryRows`) because it is a sub-axis, not a panel.
 *   4. Hand `{ panels, volume, panelStatus, liveUrls }` to `SymbolClient.tsx` by props.
 *
 * ── WHY EVERY FAILURE DEGRADES TO ABSENCE, NEVER A THROWN PAGE (`CA-F2-3`) ──────────────────
 *
 * Three independent, NAMED failure modes exist today, and all three render as absence, exactly
 * like a real `SEM_PONTO` row would (`view-model.ts`'s own docstring on the central rule):
 *
 *   - the catalog has NO entry for a panel's selector (measured today for CVD: the only CVD
 *     catalog metric this codebase's backend builds is `cvd_source`, nature `FLOW`
 *     — `cvd_source_catalog.py` — a raw-quantity-source CHARACTERIZATION, not a materialized
 *     per-bucket delta series `/series-history` could serve; there is no producer of a
 *     `cvd_delta`-shaped catalog row yet. This is a genuine, current gap in what `sentimento`
 *     ingests — NOT something this `web`-scope task can or should fabricate — named here so it
 *     is not silently mistaken for a bug in this page);
 *   - `GET /series-history` throws `TransportError` (missing base URL, connection refused,
 *     non-2xx, malformed envelope) — the SAME four kinds `/console` already handles;
 *   - the catalog fetch itself throws `TransportError` — every panel degrades together.
 *
 * In every case the panel's raw inputs become empty arrays and `missingDays` becomes the FULL
 * `DAYS` list — `buildS2Panels`'s own grid-alignment machinery (untouched, `plan 02`'s "no new
 * charts geometry" non-goal) then renders every slot as an explicit gap, which
 * `s2-lightweight-adapter.ts`'s LOSSLESS mappings turn into `WhitespaceItem`s on screen. No
 * branch anywhere in this pipeline substitutes a `0` for "I could not get a real number".
 *
 * `dynamic = "force-dynamic"`: same reasoning `console/page.tsx` documents in full — this
 * route's transports throw synchronously on a missing `INGEST_HEALTH_API_BASE_URL` BEFORE any
 * `fetch` call, which would otherwise let `next build` bake a stale static error page.
 */

import type { Metadata } from "next";

import {
  buildS2Panels,
  DAYS,
  FIVE_MINUTES_MS,
  ONE_MINUTE_MS,
  RANGE_END_MS_EXCLUSIVE,
  RANGE_START_MS,
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
import { SymbolClient, type VolumeSubAxisData } from "./SymbolClient.tsx";
import {
  computeSeriesKeyId,
  countPresentSlots,
  daysWithPresence,
  keyMatchesSymbol,
  rawCandlesFromHistoryRows,
  resolveVolumeReading,
  scalarPointsFromHistoryRows,
  scaledCvdDeltasFromHistoryRows,
  volumeSlotsFromHistoryRows,
} from "./view-model.ts";

export const metadata: Metadata = {
  title: "cripto-strategy — Símbolo",
};

export const dynamic = "force-dynamic";

const WINDOW_END_MS_INCLUSIVE = RANGE_END_MS_EXCLUSIVE - ONE_MINUTE_MS;
/** Fixed, in-the-past instant (the window's own exclusive end) — never `Date.now()`: keeps this
 * route's `knowledge_time_ms` deterministic and clear of any server-clock-skew `422`
 * (`knowledge_time_ms` must never exceed the backend's own `server_now_ms`). */
const KNOWLEDGE_TIME_MS = RANGE_END_MS_EXCLUSIVE;
const BAR_POLICY: BarPolicy = "final_only";
const OI_METRIC = "sum_open_interest";
/** `[INFERRED]`: no catalog builder in `backend/src/modules/sentimento/domain/` produces this
 * metric today (`cvd_source_catalog.py` only builds `cvd_source`, the raw-quantity-source
 * characterization — a materialized per-bucket CVD delta series does not exist yet). Kept as
 * the forward-compatible selector so this panel starts reading real data the day `sentimento`
 * ships one, instead of a second code path this page would need later. */
const CVD_METRIC = "cvd_delta";
/** `T-01.7` / `SPEC-007 §4`, row M1 — the volume SUB-AXIS of the price panel (§3.6), whose
 * catalog entry `T-01.6` registered (`domain/klines_volume_catalog.py`, `metric` transcribed
 * here, not re-derived). Its `interval` is `1m` (§4.1), the grid `/series-history` serves
 * natively, so this request asks for exactly the same `interval` the other three do while the
 * series behind it is the only one of the four with no ladder. */
const VOLUME_METRIC = "klines_volume";

function findCatalogEntry(
  catalog: SeriesCatalogProjection,
  predicate: (entry: SeriesCatalogEntry) => boolean,
): SeriesCatalogEntry | undefined {
  return catalog.entries.find((entry) => keyMatchesSymbol(entry.key, SYMBOL) && predicate(entry));
}

async function fetchPanelRows(
  entry: SeriesCatalogEntry | undefined,
): Promise<{ readonly rows: readonly SeriesHistoryRow[]; readonly status: PanelStatus }> {
  if (entry === undefined) {
    return { rows: [], status: { kind: "absent", reason: "not_in_catalog" } };
  }
  const key: HistoryRequestKey = {
    series_key_id: computeSeriesKeyId(entry.key),
    symbol: SYMBOL,
    interval: "1m",
    window_start_ms: RANGE_START_MS,
    window_end_ms: WINDOW_END_MS_INCLUSIVE,
    knowledge_time_ms: KNOWLEDGE_TIME_MS,
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

  const priceEntry =
    catalogStatus.kind === "ok" ? findCatalogEntry(catalog, (entry) => entry.priceUse === S2_PRICE_USE) : undefined;
  const oiEntry =
    catalogStatus.kind === "ok" ? findCatalogEntry(catalog, (entry) => entry.key.metric === OI_METRIC) : undefined;
  const cvdEntry =
    catalogStatus.kind === "ok" ? findCatalogEntry(catalog, (entry) => entry.key.metric === CVD_METRIC) : undefined;
  const volumeEntry =
    catalogStatus.kind === "ok" ? findCatalogEntry(catalog, (entry) => entry.key.metric === VOLUME_METRIC) : undefined;

  const [priceResult, oiResult, cvdResult, volumeResult] = await Promise.all([
    fetchPanelRows(priceEntry),
    fetchPanelRows(oiEntry),
    fetchPanelRows(cvdEntry),
    fetchPanelRows(volumeEntry),
  ]);

  const oiPresence = daysWithPresence(oiResult.rows, DAYS);
  const cvdPresence = daysWithPresence(cvdResult.rows, DAYS);

  const rawInputs: S2RawInputs = {
    candles: rawCandlesFromHistoryRows(priceResult.rows),
    priceUse: S2_PRICE_USE,
    oiPoints: scalarPointsFromHistoryRows(oiResult.rows, FIVE_MINUTES_MS),
    oiMissingDays: oiPresence.missingDays,
    cvdDeltas: scaledCvdDeltasFromHistoryRows(cvdResult.rows),
    cvdMissingDays: cvdPresence.missingDays,
    cvdCoveredDays: cvdPresence.coveredDays,
  };

  // Each field of `rawInputs` above ALREADY degrades to `[]`/full-`DAYS`-missing independently
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
    // `WINDOW_END_MS_INCLUSIVE` is the same instant `SymbolClient.tsx` names `LAST_INSTANT_MS`
    // for the other three readouts — one instant for the whole page, not a fourth one.
    reading: resolveVolumeReading(volumeSlots, WINDOW_END_MS_INCLUSIVE),
  };

  const baseUrl = process.env.INGEST_HEALTH_API_BASE_URL;
  const liveUrls =
    baseUrl === undefined
      ? { price: null, oi: null, cvd: null }
      : {
          price: buildLiveUrl(baseUrl, priceEntry),
          oi: buildLiveUrl(baseUrl, oiEntry),
          cvd: buildLiveUrl(baseUrl, cvdEntry),
        };

  return (
    <SymbolClient
      panels={panels}
      volume={volume}
      panelStatus={{
        price: priceResult.status,
        oi: oiResult.status,
        cvd: cvdResult.status,
        volume: volumeResult.status,
      }}
      liveUrls={liveUrls}
    />
  );
}
