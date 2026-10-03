// `estrutura-do-front` `T-03.2` (plan `03` item `3.4`, `RN-12`) — the VALUE test of
// `INDICATOR_CATALOG`. It replaces the regexes that read `[symbol]/page.tsx`'s source for the
// selector of each indicator (`PAGE_OI_SELECTOR`, `PAGE_SELECTOR` of long/short,
// `PAGE_LONG_SELECTOR`/`PAGE_SHORT_SELECTOR` of liquidation, and the CVD one): those proved a
// predicate was SPELLED at a call site; these prove what it SELECTS.
//
//   1. the table: over a catalog that carries every sibling row of every metric involved, for two
//      instruments, each requirement matches exactly ONE row — its own — and refuses the others;
//   2. the route: `SymbolPage` is CALLED over that same catalog (fetch stubbed), and the entry each
//      indicator series resolved to — `paneLegendSources` and `historyPagingRows.keys` — is the
//      expected row. This is the half the regex used to stand for ("the route calls it");
//   3. the derive pointers: the pager facts the table names cover `assembleHistoryPage`'s result
//      once each, and the SSR facts exist on `SymbolClient`'s props.
//
// Ablations (recorded in `gates/T-03.2-build.md`): the OI predicate accepting the Coinalyze CLOSE
// row ⇒ cases 1 and 2 fail; `page.tsx` selecting OI by `metric` alone ⇒ case 2 fails.
//
// Run with: npm --prefix frontend run test:app

import "../../component-render.ts";

import assert from "node:assert/strict";
import { test } from "node:test";

import { S2_PRICE_USE } from "../../../charts/index.ts";
import type {
  QuantityField,
  Reduction,
  SeriesCatalogEntry,
  SeriesKey,
  TsConvention,
} from "../../../features/s3-inspector/series-catalog.ts";
import { PRICE_SLOTS, historyFetchPlan, slotRecordOf, slotValueAt } from "../chart/history/series-slots.ts";
import { coverageGridMsOf } from "../coverage-magnitude.ts";
import { EMPTY_OI_CANDLE_BUNDLE } from "../oi-candle-pane.ts";
import { assembleHistoryPage } from "../panel-assembly.ts";
import type { SymbolClientProps } from "../SymbolClient.tsx";
import { computeSeriesKeyId } from "../series-key-id.ts";
import { INDICATOR_CATALOG, type IndicatorTableEntry } from "./catalog.ts";

const SYMBOL = "BTCUSDT";
/** The twin instrument: every row below exists for it too, so a requirement that forgot the
 * symbol term matches two rows instead of one. */
const OTHER_SYMBOL = "ETHUSDT";
const PINNED_NOW_MS = Date.UTC(2026, 8, 30, 12, 34, 56);
const STUB_BASE_URL = "http://catalog-value.stub.invalid";

// ── The neighbour catalog: every sibling row of every metric the six series read ─────────────────

function seriesKey(symbol: string, overrides: Partial<SeriesKey> & Pick<SeriesKey, "metric">): SeriesKey {
  return {
    provider: "binance",
    venue: "binance",
    instrumentId: symbol,
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
    verifiedBy: "T-03.2-catalog-value",
    ...overrides,
  };
}

interface NamedEntry {
  readonly name: string;
  readonly entry: SeriesCatalogEntry;
}

function named(name: string, key: SeriesKey, priceUse: string | null = null): NamedEntry {
  return {
    name,
    entry: { key, nativeGrid: key.interval === "5m" ? "5min" : "1min", maxStalenessMs: 600_000, priceUse, reconstructedFrom: null, publishedError: null },
  };
}

/** The rows of ONE instrument, siblings of each target included (the order of each block is the
 * order the backend builds it, so a selector resolved by position would pick a sibling). */
function rowsOf(symbol: string): readonly NamedEntry[] {
  const ohlc = (reduction: "OPEN" | "HIGH" | "LOW" | "CLOSE") =>
    named(`klines_ohlc_${reduction}`, seriesKey(symbol, { metric: "klines_ohlc", nature: "STOCK", tsConvention: "OHLC_OVER_BUCKET", reduction }));
  const oi = (name: string, provider: string, reduction: Reduction, tsConvention: TsConvention) =>
    named(name, seriesKey(symbol, { metric: "sum_open_interest", provider, interval: "5m", nature: "STOCK", tsConvention, reduction }));
  const cvd = (name: string, provider: string, quantityField: QuantityField) =>
    named(name, seriesKey(symbol, { metric: "cvd_source", provider, quantityField }));
  const liquidation = (cohort: string) =>
    named(`liquidation_${cohort}`, seriesKey(symbol, { metric: "sum_liquidation", provider: "coinalyze", cohort }));
  const longShort = (name: string, provider: string) =>
    named(
      name,
      seriesKey(symbol, {
        metric: "count_long_short_ratio",
        provider,
        interval: "5m",
        unit: "ratio",
        denom: "ratio",
        nature: "RATIO",
        tsConvention: "POINT_AT_BUCKET_END",
        reduction: "POINT",
      }),
    );
  return [
    named("klines_last", seriesKey(symbol, { metric: "klines_last", nature: "STOCK", tsConvention: "POINT_AT_BUCKET_END", reduction: "POINT" }), S2_PRICE_USE),
    ohlc("OPEN"),
    ohlc("HIGH"),
    ohlc("LOW"),
    ohlc("CLOSE"),
    named("klines_volume", seriesKey(symbol, { metric: "klines_volume" })),
    oi("oi_coinalyze_open", "coinalyze", "OPEN", "OHLC_OVER_BUCKET"),
    oi("oi_coinalyze_high", "coinalyze", "HIGH", "OHLC_OVER_BUCKET"),
    oi("oi_coinalyze_low", "coinalyze", "LOW", "OHLC_OVER_BUCKET"),
    oi("oi_coinalyze_close", "coinalyze", "CLOSE", "OHLC_OVER_BUCKET"),
    oi("oi_binance_point", "binance", "POINT", "POINT_AT_BUCKET_END"),
    cvd("cvd_aggtrade_q", "binance", "q"),
    cvd("cvd_aggtrade_nq", "binance", "nq"),
    cvd("cvd_coinalyze_bv", "coinalyze", "NA"),
    cvd("cvd_kline_takerbuy", "binance", "NA"),
    liquidation("long"),
    liquidation("short"),
    longShort("long_short_binance", "binance"),
    // Hypothetical today, and the reason `provider` is a term (`long-short-series-selector.test.ts`).
    longShort("long_short_coinalyze_mirror", "coinalyze"),
  ];
}

const NEIGHBOURS: readonly NamedEntry[] = [...rowsOf(SYMBOL), ...rowsOf(OTHER_SYMBOL)];

/** What each series of the table must select, and the `paneLegendSources` key `page.tsx`
 * publishes it under. `T-03.3`: the pager's key needs no mapping any more — `historyPagingRows.keys`
 * is keyed by the table's own `kind/slot` (`chart/history/series-slots.ts`). */
const EXPECTED: Readonly<Record<string, { readonly row: string; readonly legend: string }>> = {
  "volume/volume": { row: "klines_volume", legend: "volume" },
  "liquidation/long": { row: "liquidation_long", legend: "liquidation_long" },
  "liquidation/short": { row: "liquidation_short", legend: "liquidation_short" },
  "oi/oi": { row: "oi_binance_point", legend: "oi" },
  "long_short/ratio": { row: "long_short_binance", legend: "long_short" },
  "cvd/cvd": { row: "cvd_kline_takerbuy", legend: "cvd" },
};

const TABLE: readonly IndicatorTableEntry[] = INDICATOR_CATALOG;

function seriesOfTable(): readonly {
  readonly id: string;
  readonly kind: string;
  readonly slot: string;
  readonly matches: IndicatorTableEntry["series"][number]["matches"];
}[] {
  return TABLE.flatMap((entry) =>
    entry.series.map((series) => ({ id: `${entry.kind}/${series.slot}`, kind: entry.kind, slot: series.slot, matches: series.matches })),
  );
}

function expectedRow(id: string, symbol: string): NamedEntry {
  const expected = EXPECTED[id];
  assert.ok(expected !== undefined, `${id}: no expectation — a series was added to the table without a value test`);
  const row = NEIGHBOURS.find((candidate) => candidate.name === expected.row && candidate.entry.key.instrumentId === symbol);
  assert.ok(row !== undefined, `${id}: the fixture lost the row ${expected.row}`);
  return row;
}

// ── 1. The table ──────────────────────────────────────────────────────────────────────────────────

test("the table declares the five indicators and the six series the value tests expect", () => {
  assert.deepEqual(
    TABLE.map((entry) => entry.kind),
    ["volume", "liquidation", "oi", "long_short", "cvd"],
  );
  assert.deepEqual(seriesOfTable().map((series) => series.id).sort(), Object.keys(EXPECTED).sort());
});

for (const kind of ["volume", "liquidation", "oi", "long_short", "cvd"]) {
  test(`RN-12 ${kind}: each requirement matches its own row and refuses every neighbour`, () => {
    const requirements = seriesOfTable().filter((series) => series.kind === kind);
    assert.ok(requirements.length > 0, `${kind}: no series in the table`);
    for (const requirement of requirements) {
      for (const symbol of [SYMBOL, OTHER_SYMBOL]) {
        const matched = NEIGHBOURS.filter((row) => requirement.matches(row.entry.key, symbol));
        assert.deepEqual(
          matched.map((row) => `${row.name}@${row.entry.key.instrumentId}`),
          [`${expectedRow(requirement.id, symbol).name}@${symbol}`],
          `${requirement.id} for ${symbol}: exactly one row, its own`,
        );
      }
    }
  });
}

test("MORDE: the two weaker selectors this fixture exists to catch each match more than one row", () => {
  for (const series of seriesOfTable()) {
    const target = expectedRow(series.id, SYMBOL).entry.key;
    // The symbol term dropped: the twin on the other instrument comes in.
    const withoutSymbol = NEIGHBOURS.filter((row) => series.matches({ ...row.entry.key, instrumentId: SYMBOL }, SYMBOL));
    assert.ok(withoutSymbol.length >= 2, `${series.id}: a selector blind to the symbol would go unnoticed`);
    // `metric` alone — the shape of the T-03.5 defect. Volume's predicate IS metric alone today.
    const metricAlone = NEIGHBOURS.filter((row) => row.entry.key.instrumentId === SYMBOL && row.entry.key.metric === target.metric);
    assert.ok(series.id === "volume/volume" || metricAlone.length >= 2, `${series.id}: metric alone would go unnoticed`);
  }
});

// ── 2. The route reads the table ──────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

const ENTRY_BY_SERIES_KEY_ID: ReadonlyMap<string, SeriesCatalogEntry> = new Map(
  NEIGHBOURS.map((row) => [computeSeriesKeyId(row.entry.key), row.entry]),
);

async function stubFetch(input: string | URL | Request): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : input.toString());
  if (url.pathname.endsWith("/series-catalog")) {
    const entries = NEIGHBOURS.map((row) => row.entry);
    return jsonResponse({ query: "series_catalog", n_entries: entries.length, entries });
  }
  if (url.pathname.endsWith("/series-history")) {
    const seriesKeyId = url.searchParams.get("series_key_id") ?? "";
    const entry = ENTRY_BY_SERIES_KEY_ID.get(seriesKeyId);
    if (entry === undefined) {
      throw new Error(`catalog value stub: unknown series_key_id ${seriesKeyId}`);
    }
    return jsonResponse({
      session: { principal_id: null, server_now_ms: PINNED_NOW_MS },
      panel: {
        series_key_id: seriesKeyId,
        source: "T-03.2-catalog-value",
        nature: entry.key.nature,
        unit: entry.key.unit,
        coverage: { earliest_bucket_ms: null, latest_bucket_ms: null, source_floor_ms: null },
      },
      rows: [],
      oi_candles: null,
      knowledge_time: Number(url.searchParams.get("knowledge_time_ms")),
      bar_policy: "final_only",
    });
  }
  throw new Error(`catalog value stub: no route for ${url.pathname}`);
}

let ssrProps: Promise<SymbolClientProps> | undefined;

/** `SymbolPage` called, not rendered, over the neighbour catalog (the `T-03.1` technique). */
function routeProps(): Promise<SymbolClientProps> {
  ssrProps ??= (async () => {
    const page = await import("../[symbol]/page.tsx");
    const savedFetch = globalThis.fetch;
    const savedNow = Date.now;
    const savedBaseUrl = process.env.INGEST_HEALTH_API_BASE_URL;
    globalThis.fetch = stubFetch as typeof fetch;
    Date.now = () => PINNED_NOW_MS;
    process.env.INGEST_HEALTH_API_BASE_URL = STUB_BASE_URL;
    try {
      const element = await page.default({
        params: Promise.resolve({ symbol: SYMBOL.toLowerCase() }),
        searchParams: Promise.resolve({ interval: "1m" }),
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
  return ssrProps;
}

test("RN-12 route: page.tsx resolves each of the six series to the row the table selects", async () => {
  const props = await routeProps();
  const legends = props.paneLegendSources as unknown as Record<string, { readonly seriesKeyId: string; readonly entry: SeriesCatalogEntry } | null>;
  const keys = props.historyPagingRows.keys;
  for (const series of seriesOfTable()) {
    const expected = EXPECTED[series.id]!;
    const row = expectedRow(series.id, SYMBOL);
    const legend = legends[expected.legend];
    assert.ok(legend !== null && legend !== undefined, `${series.id}: the route resolved nothing (absent or ambiguous)`);
    assert.deepEqual(legend.entry.key, row.entry.key, `${series.id}: the route resolved another row`);
    assert.equal(
      slotValueAt(keys, { group: "indicator", kind: series.kind, slot: series.slot }),
      computeSeriesKeyId(row.entry.key),
      `${series.id}: the pager pages another series`,
    );
  }
  // The four candle readings are the core's, resolved the old way, and must still resolve too.
  for (const reduction of PRICE_SLOTS) {
    assert.ok(keys.price[reduction] !== null, `price ${reduction}: resolved`);
  }
  assert.ok(
    Object.values(props.panelStatus).every((status) => status.kind === "ok"),
    `every panel resolved: ${JSON.stringify(props.panelStatus)}`,
  );
});

// ── 3. The derive pointers ────────────────────────────────────────────────────────────────────────

test("derive: the pager facts the table names cover assembleHistoryPage's indicator facts, once each", () => {
  const startMs = Date.UTC(2026, 8, 30, 0, 0);
  const endMsExclusive = startMs + 10 * 60_000;
  const grid = coverageGridMsOf(undefined);
  const assembly = assembleHistoryPage(
    TABLE,
    { ...slotRecordOf(historyFetchPlan(TABLE), () => []), oiCandles: EMPTY_OI_CANDLE_BUNDLE },
    { startMs, endMsExclusive },
    {
      priceUse: S2_PRICE_USE,
      cvdAnchorMs: startMs,
      windowEndMsInclusive: endMsExclusive - 60_000,
      windowEndMsExclusive: endMsExclusive,
      longShortRecentSpanMs: 4 * 60 * 60_000,
      oiMaxStalenessMs: null,
      knowledgeTimeMs: endMsExclusive,
      coverageGridMs: { volume: grid, cvd: grid, liquidationLong: grid, liquidationShort: grid },
    },
    60_000,
  );
  const coreFacts = ["priceCandles", "panels.price", "panels.symbol", "panels.window"];
  const allFacts = [
    ...Object.keys(assembly).filter((key) => key !== "panels"),
    ...Object.keys(assembly.panels).map((key) => `panels.${key}`),
  ].filter((fact) => !coreFacts.includes(fact));
  const named = TABLE.flatMap((entry) => entry.derive.pager);
  assert.deepEqual([...named].sort(), allFacts.sort(), "each indicator fact of the pager is named by exactly one entry");
});

test("derive: the SSR facts the table names exist on SymbolClient's props", async () => {
  const props = (await routeProps()) as unknown as Record<string, unknown> & { readonly panels: Record<string, unknown> };
  for (const entry of TABLE) {
    assert.ok(entry.derive.ssr.length > 0, `${entry.kind}: no SSR fact`);
    for (const fact of entry.derive.ssr) {
      const [head, panel] = fact.split(".");
      const value = panel === undefined ? props[head!] : props.panels[panel];
      assert.ok(value !== undefined, `${entry.kind}: the SSR fact ${fact} does not exist`);
    }
  }
});
