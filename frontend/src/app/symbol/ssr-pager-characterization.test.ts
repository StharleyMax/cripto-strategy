// `estrutura-do-front` `T-03.1` (`SPEC-011` §7.3, `CA-10`, `G-C`, `G-D`) — CHARACTERIZATION, written
// before any other line of phase 03: for each of the five indicators (volume, CVD, OI, liquidation,
// long/short), the derivation `[symbol]/page.tsx` runs at SSR time and the one `panel-assembly.ts`
// runs for the pager, called over THE SAME ROWS, give the same result.
//
// HOW EACH SIDE IS CALLED, and why neither is a copy:
// - SSR: `SymbolPage` itself, the default export of `page.tsx`, is CALLED (not rendered) with
//   `fetch` stubbed and `Date.now` pinned. It returns the `<SymbolClient …/>` element, and its
//   `props` are exactly what the server hands the client: the derived facts per indicator AND the
//   raw rows of the ten fetches (`historyPagingRows.rows`).
// - Pager: `assembleHistoryPage` over THOSE rows, with the seed `SymbolClient.tsx` builds from the
//   same props (`historyPagingSeed`, `SymbolClient.tsx:3260-3279`). That seed construction lives
//   inside the component and is NOT exported, so `pagerSeedOf` below transcribes it; this is the
//   one piece the test mirrors instead of calling. It reads only props, field for field.
//
// WHAT IS COMPARED: every field `assembleHistoryPage` returns for the indicator, against the field
// of the same name in the SSR prop, by `deepStrictEqual`; and the KEY SET of the SSR prop must be
// the pager's keys plus the static catalog facts `SymbolClient.tsx:3329-3352` keeps frozen from the
// SSR (`STATIC_KEYS`). A dynamic field the SSR computes and the pager does not would break the
// key-set check, not slip past it. For CVD and OI the drawn panel (`panels.cvd`, `panels.oi`) is
// compared too, minus `DAY_LIST_KEYS` (see there: a measured difference with zero readers).
//
// ⛔ If a case goes red on unmutated code, phase 03 STOPS (`T-03.1` refs, `Q-8`, `SPEC-011` §12):
// it is today's behaviour diverging, and the measured case goes to the owner.
//
// Non-vacuity: every case also asserts the fixture really exercised the indicator (present points,
// absences, zeros, partial coverage), so "equal" cannot be two empty arrays agreeing.
//
// Run with: node --conditions=react-server --test src/app/symbol/ssr-pager-characterization.test.ts

import "../component-render.ts";

import assert from "node:assert/strict";
import { test } from "node:test";

import { lastGridInstant } from "../../charts/index.ts";
import type { SeriesCatalogEntry, SeriesKey } from "../../features/s3-inspector/series-catalog.ts";
import { timeframeStepMs } from "./chart/axis/supported-timeframes.ts";
import { assembleHistoryPage, type AssemblyStaticContext, type HistoryPageAssembly } from "./panel-assembly.ts";
import type { SeriesHistoryRow } from "./series-history-envelope.ts";
import type { SymbolClientProps } from "./SymbolClient.tsx";
import { computeSeriesKeyId } from "./view-model.ts";

const ONE_MINUTE_MS = 60_000;
const FIVE_MINUTES_MS = 5 * ONE_MINUTE_MS;
const ONE_DAY_MS = 86_400_000;
const SYMBOL = "BTCUSDT";
/** The one clock reading of every SSR call in this file — mid-minute on purpose, so the window
 * alignment in `request-window.ts` has something to do. */
const PINNED_NOW_MS = Date.UTC(2026, 8, 30, 12, 34, 56);
const STUB_BASE_URL = "http://characterization.stub.invalid";
/** `1m` is the default route; `1h` is a TF whose axis step is off the `1m` request grid, where the
 * reading instant and `windowEndMsInclusive` are two different instants (`T-05.1`). */
const TIMEFRAMES = ["1m", "1h"] as const;

type Role =
  | "open"
  | "high"
  | "low"
  | "close"
  | "oi"
  | "cvd"
  | "volume"
  | "liquidationLong"
  | "liquidationShort"
  | "longShort";

// ── The catalog: one entry per role, each one matching exactly ONE predicate of `page.tsx` ──────

function seriesKey(overrides: Partial<SeriesKey> & Pick<SeriesKey, "metric">): SeriesKey {
  return {
    provider: "binance",
    venue: "binance",
    instrumentId: SYMBOL,
    cohort: "NA",
    interval: "1m",
    unit: "USD",
    denom: "USD",
    nature: "FLOW",
    tsConvention: "AGGREGATE_OVER_BUCKET",
    reduction: "SUM",
    quantityField: "NA",
    labelShift: 0,
    aggregationScope: "NA",
    verifiedBy: "T-03.1-characterization",
    ...overrides,
  };
}

function catalogEntry(key: SeriesKey, nativeGrid: string, maxStalenessMs: number): SeriesCatalogEntry {
  return { key, nativeGrid, maxStalenessMs, priceUse: null, reconstructedFrom: null, publishedError: null };
}

function ohlcKey(reduction: "OPEN" | "HIGH" | "LOW" | "CLOSE"): SeriesKey {
  return seriesKey({ metric: "klines_ohlc", nature: "STOCK", tsConvention: "OHLC_OVER_BUCKET", reduction });
}

const CATALOG: ReadonlyMap<Role, SeriesCatalogEntry> = new Map<Role, SeriesCatalogEntry>([
  ["open", catalogEntry(ohlcKey("OPEN"), "1min", 600_000)],
  ["high", catalogEntry(ohlcKey("HIGH"), "1min", 600_000)],
  ["low", catalogEntry(ohlcKey("LOW"), "1min", 600_000)],
  ["close", catalogEntry(ohlcKey("CLOSE"), "1min", 600_000)],
  [
    "oi",
    catalogEntry(
      seriesKey({
        metric: "sum_open_interest",
        interval: "5m",
        nature: "STOCK",
        tsConvention: "POINT_AT_BUCKET_END",
        reduction: "POINT",
      }),
      "5min",
      900_000,
    ),
  ],
  ["cvd", catalogEntry(seriesKey({ metric: "cvd_source" }), "1min", 600_000)],
  ["volume", catalogEntry(seriesKey({ metric: "klines_volume" }), "1min", 600_000)],
  [
    "liquidationLong",
    catalogEntry(seriesKey({ metric: "sum_liquidation", provider: "coinalyze", cohort: "long" }), "1min", 600_000),
  ],
  [
    "liquidationShort",
    catalogEntry(seriesKey({ metric: "sum_liquidation", provider: "coinalyze", cohort: "short" }), "1min", 600_000),
  ],
  [
    "longShort",
    catalogEntry(
      seriesKey({
        metric: "count_long_short_ratio",
        interval: "5m",
        unit: "ratio",
        denom: "ratio",
        nature: "RATIO",
        tsConvention: "POINT_AT_BUCKET_END",
        reduction: "POINT",
      }),
      "5min",
      900_000,
    ),
  ],
]);

const ROLE_BY_SERIES_KEY_ID: ReadonlyMap<string, Role> = new Map(
  [...CATALOG].map(([role, entry]) => [computeSeriesKeyId(entry.key), role]),
);

// ── The rows: deterministic, and shaped to reach every branch the five derivations have ─────────

function absentRow(eventTimeMs: number): SeriesHistoryRow {
  return { event_time: eventTimeMs, available_at: null, value: null, absence: "SEM_PONTO", coverage: null };
}

function presentRow(
  eventTimeMs: number,
  value: string,
  availableAtMs: number = eventTimeMs + 1_000,
  coverage: SeriesHistoryRow["coverage"] = null,
): SeriesHistoryRow {
  return { event_time: eventTimeMs, available_at: availableAtMs, value, absence: null, coverage };
}

/** A partial bucket every 19th row on a re-aggregated TF, and every 19th row on `1m` too (the wire
 * never sends `expected: 1` with a partial, but the fold does not care, and the branch is reached). */
function coverageOf(index: number, stepMs: number): SeriesHistoryRow["coverage"] {
  const expected = Math.max(2, stepMs / ONE_MINUTE_MS);
  return index % 19 === 0 ? { present: expected - 1, expected } : { present: expected, expected };
}

/** Where row `index` of a request sits: its instant, the request's own first instant and step, and
 * how many rows the request answers. */
interface RowPlace {
  readonly index: number;
  readonly t: number;
  readonly startMs: number;
  readonly stepMs: number;
  readonly count: number;
}

function rowFor(role: Role, { index, t, startMs, stepMs, count }: RowPlace): SeriesHistoryRow {
  const isLast = (n: number): boolean => index >= count - n;
  const price = 100 + (index % 50) * 0.25;
  const fiveMinuteBucket = Math.floor(t / FIVE_MINUTES_MS);
  switch (role) {
    case "open":
    case "high":
    case "low":
    case "close": {
      if (index % 97 < 3) return absentRow(t); // a hole in all four
      if (role === "high" && index % 41 === 7) return absentRow(t); // a partial bucket
      const value = { open: price, high: price + 2, low: price - 2, close: price + 1 }[role];
      return presentRow(t, value.toFixed(4));
    }
    case "oi":
      // A `5m` STOCK served on the request grid: a staircase, a gap, and the last rows absent so the
      // freshness verdict has an age to judge.
      if (index % 113 < 10 || isLast(4)) return absentRow(t);
      return presentRow(t, (1_000 + (fiveMinuteBucket % 30) * 3.5).toFixed(4), fiveMinuteBucket * FIVE_MINUTES_MS + 30_000);
    case "cvd": {
      // A WHOLE UTC day missing, the second one the window touches: `daysWithPresence` sees it.
      if (Math.floor(t / ONE_DAY_MS) === Math.floor(startMs / ONE_DAY_MS) + 1) return absentRow(t);
      // Gaps off index 0, so the first slot carries a delta and the anchor of the sum is not free.
      if ((index + 5) % 31 < 2) return absentRow(t);
      return presentRow(t, (((index % 17) - 8) * 1.25).toFixed(8), t + 1_000, coverageOf(index, stepMs));
    }
    case "volume":
      if (index % 61 < 2) return absentRow(t);
      return presentRow(t, ((index % 23) * 3.5).toFixed(4), t + 1_000, coverageOf(index, stepMs));
    case "liquidationLong":
    case "liquidationShort": {
      const phase = role === "liquidationLong" ? 0 : 3;
      if ((index + phase) % 53 < 4) return absentRow(t);
      const value = (index + phase) % 7 === 0 ? ((index % 11) * 1_250).toFixed(2) : "0";
      return presentRow(t, value, t + 1_000, coverageOf(index + phase, stepMs));
    }
    case "longShort":
      // `5m` RATIO on the request grid, published 20 s after its bucket, and a trailing absent tail.
      if (index % 89 < 5 || isLast(2)) return absentRow(t);
      return presentRow(t, (1.5 + (fiveMinuteBucket % 10) * 0.01).toFixed(4), fiveMinuteBucket * FIVE_MINUTES_MS + 20_000);
  }
}

/** Leading buckets the wire does NOT send at all (a series that starts after the window does): the
 * native vector is then shorter than the window grid, which is where a derivation WITH the window
 * and one WITHOUT it part ways (`nonNegativeFlowSlotsFromHistoryRows`, `CA-5a`). */
const UNSENT_LEADING_ROWS: Readonly<Partial<Record<Role, number>>> = { volume: 3, liquidationShort: 2 };

function rowsFor(role: Role, startMs: number, endMsInclusive: number, stepMs: number): SeriesHistoryRow[] {
  const count = Math.floor((endMsInclusive - startMs) / stepMs) + 1;
  const rows = Array.from({ length: count }, (_, index) => rowFor(role, { index, t: startMs + index * stepMs, startMs, stepMs, count }));
  return rows.slice(UNSENT_LEADING_ROWS[role] ?? 0);
}

// ── The stub backend: `GET /series-catalog` and `GET /series-history`, nothing else ─────────────

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

async function stubFetch(input: string | URL | Request): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : input.toString());
  if (url.pathname.endsWith("/series-catalog")) {
    const entries = [...CATALOG.values()];
    return jsonResponse({ query: "series_catalog", n_entries: entries.length, entries });
  }
  if (url.pathname.endsWith("/series-history")) {
    const seriesKeyId = url.searchParams.get("series_key_id") ?? "";
    const role = ROLE_BY_SERIES_KEY_ID.get(seriesKeyId);
    if (role === undefined) {
      throw new Error(`characterization stub: unknown series_key_id ${seriesKeyId}`);
    }
    const stepMs = timeframeStepMs(url.searchParams.get("interval") ?? "");
    const startMs = Number(url.searchParams.get("window_start_ms"));
    const endMsInclusive = Number(url.searchParams.get("window_end_ms"));
    const knowledgeTimeMs = Number(url.searchParams.get("knowledge_time_ms"));
    return jsonResponse({
      session: { principal_id: null, server_now_ms: PINNED_NOW_MS },
      panel: {
        series_key_id: seriesKeyId,
        source: "T-03.1-characterization",
        nature: CATALOG.get(role)?.key.nature ?? "FLOW",
        unit: CATALOG.get(role)?.key.unit ?? "USD",
        coverage: { earliest_bucket_ms: null, latest_bucket_ms: null, source_floor_ms: null },
      },
      rows: rowsFor(role, startMs, endMsInclusive, stepMs),
      oi_candles: null,
      knowledge_time: knowledgeTimeMs,
      bar_policy: "final_only",
    });
  }
  throw new Error(`characterization stub: no route for ${url.pathname}`);
}

// ── The two sides ───────────────────────────────────────────────────────────────────────────────

/** The SSR side: `SymbolPage` called with `fetch` stubbed and the clock pinned; its element's
 * props. Memoized per TF: the five cases read the SAME SSR call. */
const ssrCache = new Map<string, Promise<SymbolClientProps>>();

function ssrPropsOf(timeframe: string): Promise<SymbolClientProps> {
  const cached = ssrCache.get(timeframe);
  if (cached !== undefined) {
    return cached;
  }
  const pending = (async () => {
    const page = await import("./[symbol]/page.tsx");
    const savedFetch = globalThis.fetch;
    const savedNow = Date.now;
    const savedBaseUrl = process.env.INGEST_HEALTH_API_BASE_URL;
    globalThis.fetch = stubFetch as typeof fetch;
    Date.now = () => PINNED_NOW_MS;
    process.env.INGEST_HEALTH_API_BASE_URL = STUB_BASE_URL;
    try {
      const element = await page.default({
        params: Promise.resolve({ symbol: SYMBOL.toLowerCase() }),
        searchParams: Promise.resolve({ interval: timeframe }),
      });
      return element.props as SymbolClientProps;
    } finally {
      globalThis.fetch = savedFetch;
      Date.now = savedNow;
      if (savedBaseUrl === undefined) {
        delete process.env.INGEST_HEALTH_API_BASE_URL;
      } else {
        process.env.INGEST_HEALTH_API_BASE_URL = savedBaseUrl;
      }
    }
  })();
  ssrCache.set(timeframe, pending);
  return pending;
}

/** `SymbolClient.tsx:3260-3279` (`historyPagingSeed`), transcribed: window, rows and static
 * context, every term read off the SSR props, nothing re-derived. */
function pagerSeedOf(props: SymbolClientProps): {
  readonly window: { readonly startMs: number; readonly endMsExclusive: number };
  readonly staticContext: AssemblyStaticContext;
} {
  const panels = props.panels;
  return {
    window: { startMs: panels.window.startMs, endMsExclusive: panels.window.endMsExclusive },
    staticContext: {
      priceUse: panels.price.priceUse,
      cvdAnchorMs: props.cvd.anchorMs,
      windowEndMsInclusive: lastGridInstant(panels.window, ONE_MINUTE_MS),
      windowEndMsExclusive: panels.window.endMsExclusive,
      longShortRecentSpanMs: props.longShort.recentSpanMs,
      oiMaxStalenessMs: props.oi.maxStalenessMs,
      knowledgeTimeMs: props.knowledgeTimeMs,
      coverageGridMs: props.coverageGridMs,
    },
  };
}

/** The pager side: what `use-history-pager.ts:233` computes at mount, before any page arrives. */
function pagerAssemblyOf(props: SymbolClientProps): HistoryPageAssembly {
  const seed = pagerSeedOf(props);
  return assembleHistoryPage(
    props.historyPagingRows.rows,
    seed.window,
    seed.staticContext,
    timeframeStepMs(props.selectedTimeframe),
  );
}

async function sidesOf(timeframe: string): Promise<{ readonly ssr: SymbolClientProps; readonly pager: HistoryPageAssembly }> {
  const ssr = await ssrPropsOf(timeframe);
  // The anchor that the SSR call really fetched: every panel resolved and answered. Without it, both
  // sides would be deriving from `[]` and agreeing about nothing.
  assert.deepEqual(
    Object.values(ssr.panelStatus).map((status) => status.kind),
    Array.from({ length: Object.keys(ssr.panelStatus).length }, () => "ok"),
    `${timeframe}: every panel status is ok`,
  );
  return { ssr, pager: pagerAssemblyOf(ssr) };
}

// ── The comparison ──────────────────────────────────────────────────────────────────────────────

/** Static catalog facts `SymbolClient.tsx:3329-3352` keeps from the SSR prop instead of the pager. */
const STATIC_KEYS = {
  volume: [],
  cvd: ["anchorMs"],
  oi: ["maxStalenessMs", "provenance"],
  liquidation: ["provenance", "unit"],
  longShort: ["recentSpanMs", "provenance", "unit", "nativeInterval", "nativeGrid"],
} as const;

/**
 * ⚠️ A MEASURED DIFFERENCE, LEFT OUT OF THE COMPARISON AND NAMED HERE (`T-03.1-build.md` §3): the
 * SSR builds `panels.oi`/`panels.cvd` with the day lists of `daysWithPresence` (`page.tsx`
 * `oiMissingDays`/`cvdMissingDays`/`cvdCoveredDays`), the pager with `[]` (`panel-assembly.ts`).
 * No module outside `charts/s2-*.ts` (which only carries them) and `view-model.ts` (which computes
 * them) reads these fields, and `SymbolClient` draws `pager.assembly.panels`, so today both
 * derivations put the same thing on screen. Whether that is `Q-8` is the owner's call.
 */
const DAY_LIST_KEYS: ReadonlySet<string> = new Set(["missingDays", "coveredDays"]);

function withoutDayLists(panel: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(panel).filter(([key]) => !DAY_LIST_KEYS.has(key)));
}

/** Every field the pager derives equals the SSR field of the same name, and the SSR carries no
 * field beyond those plus its declared static ones. */
function assertDerivationsAgree(label: string, ssrFacts: object, pagerFacts: object, staticKeys: readonly string[]): void {
  const ssrRecord = ssrFacts as Record<string, unknown>;
  const pagerRecord = pagerFacts as Record<string, unknown>;
  assert.deepEqual(
    Object.keys(ssrRecord).sort(),
    [...Object.keys(pagerRecord), ...staticKeys].sort(),
    `${label}: the SSR prop has exactly the pager's fields plus the static ones`,
  );
  for (const key of Object.keys(pagerRecord)) {
    assert.deepStrictEqual(ssrRecord[key], pagerRecord[key], `${label}.${key}: SSR and pager disagree`);
  }
}

function presentCount(slots: readonly { readonly value: number | null }[]): number {
  return slots.filter((slot) => slot.value !== null).length;
}

test("CA-10 volume: page.tsx and panel-assembly.ts derive the same facts from the same rows", async () => {
  for (const timeframe of TIMEFRAMES) {
    const { ssr, pager } = await sidesOf(timeframe);
    assert.ok(ssr.volume.presentPoints > 0 && ssr.volume.presentPoints < ssr.volume.slots.length, "present AND absent slots");
    assert.ok(ssr.volume.partialCoverage.partialBuckets > 0, "a partial bucket reached the coverage fold");
    assertDerivationsAgree(`volume@${timeframe}`, ssr.volume, pager.volume, STATIC_KEYS.volume);
  }
});

test("CA-10 CVD: page.tsx and panel-assembly.ts derive the same facts and the same panel", async () => {
  for (const timeframe of TIMEFRAMES) {
    const { ssr, pager } = await sidesOf(timeframe);
    assert.ok(ssr.cvd.presentPoints > 0 && ssr.cvd.presentPoints < ssr.panels.cvd.deltaSlots.length, "present AND absent deltas");
    assert.ok(presentCount(ssr.panels.cvd.cumulativeSlots) > 0, "a cumulative curve was drawn");
    assert.ok(ssr.cvd.partialCoverage.partialBuckets > 0, "a partial bucket reached the coverage fold");
    assertDerivationsAgree(`cvd@${timeframe}`, ssr.cvd, pager.cvd, STATIC_KEYS.cvd);
    assert.deepStrictEqual(withoutDayLists(ssr.panels.cvd), withoutDayLists(pager.panels.cvd), `panels.cvd@${timeframe}`);
  }
});

test("CA-10 OI: page.tsx and panel-assembly.ts derive the same facts and the same panel", async () => {
  for (const timeframe of TIMEFRAMES) {
    const { ssr, pager } = await sidesOf(timeframe);
    assert.ok(ssr.oi.nativeBars > 0 && ssr.oi.wirePoints >= ssr.oi.nativeBars, "native bars and the wire staircase");
    assert.ok(ssr.oi.maxStalenessMs !== null, "the catalog ceiling reached the freshness verdict");
    assertDerivationsAgree(`oi@${timeframe}`, ssr.oi, pager.oi, STATIC_KEYS.oi);
    assert.deepStrictEqual(withoutDayLists(ssr.panels.oi), withoutDayLists(pager.panels.oi), `panels.oi@${timeframe}`);
  }
});

test("CA-10 liquidation: page.tsx and panel-assembly.ts derive the same facts for both legs", async () => {
  for (const timeframe of TIMEFRAMES) {
    const { ssr, pager } = await sidesOf(timeframe);
    for (const leg of [ssr.liquidation.long, ssr.liquidation.short]) {
      assert.ok(leg.presentPoints > 0 && leg.zeroPoints > 0 && leg.presentPoints < leg.slots.length, "values, zeros AND absences");
      assert.ok(leg.partialCoverage.partialBuckets > 0, "a partial bucket reached the coverage fold");
    }
    assertDerivationsAgree(
      `liquidation@${timeframe}`,
      ssr.liquidation,
      { long: pager.liquidationLong, short: pager.liquidationShort },
      STATIC_KEYS.liquidation,
    );
  }
});

test("CA-10 long/short: page.tsx and panel-assembly.ts derive the same facts", async () => {
  for (const timeframe of TIMEFRAMES) {
    const { ssr, pager } = await sidesOf(timeframe);
    assert.ok(ssr.longShort.nativeBars > 0 && ssr.longShort.trailingAbsentSlots > 0, "native bars AND an absent tail");
    assert.ok(ssr.longShort.recentStats !== null && ssr.longShort.ageMs !== null, "the recent band and the age were derived");
    assertDerivationsAgree(`longShort@${timeframe}`, ssr.longShort, pager.longShort, STATIC_KEYS.longShort);
  }
});
