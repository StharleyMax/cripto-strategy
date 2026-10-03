import http from "node:http";

import type { Page, Request } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { computeSeriesKeyId } from "../src/app/symbol/series-key-id.ts";
import type { SeriesKey } from "../src/features/s3-inspector/series-catalog.ts";
import { fact, startSecondaryNextInstance, type NextInstanceHandle } from "./helpers.ts";
import { readView, showView } from "./view.ts";

/**
 * `estrutura-do-front` `T-03.3` (plan `03` DoD 2, `ADR-050/D5`) — ONE HISTORY PAGE IS TEN REQUESTS.
 *
 * The pager receives the indicator table by parameter (`SymbolClient.tsx` passes `INDICATOR_CATALOG`
 * to `useHistoryPager`) and fires one `/series-history` request per address of
 * `chart/history/series-slots.ts::historyFetchPlan`: the four price reductions plus the six series of
 * the table — ten. This spec counts them in the BROWSER, with `page.on('request')`, against the built
 * app. The fast half of the same claim is `src/app/symbol/history-pager-requests.test.ts`.
 *
 * ── WHAT THIS SPEC ASSERTS ───────────────────────────────────────────────────────────────────
 *
 * After `>= MIN_PAGES` pages triggered by dragging and DRAWN, every page (the requests grouped by
 * `(window_start_ms, window_end_ms)`) is exactly `REQUESTS_PER_PAGE` requests, for
 * `REQUESTS_PER_PAGE` distinct `series_key_id`s.
 *
 * **Bites:** `historyFetchPlan` skipping one series of the table makes every page 9 requests and this
 * spec fails. The mutation was run by hand while building the task; the result is in
 * `docs/context/estrutura-do-front/gates/T-03.3-build.md`.
 *
 * ── WHY A SYNTHETIC STUB OF ITS OWN (the `22-*.spec.ts` recipe, own copy) ────────────────────
 *
 * The weak universe of `make e2e` (ephemeral sqlite) answers `500` for `/series-history`, and without
 * any real value the library does not recognise the drag as a pan (`17-*.spec.ts`). A LOCAL
 * `http.createServer` answers a catalog with the ten series and, for `/series-history`, one value a
 * minute for the price reductions and `rows: []` for the indicators — no `INSERT`, no Postgres
 * touched. The catalog keys are the exact rows `src/app/symbol/indicators/catalog.test.ts::rowsOf`
 * proves each series of the table selects, so every `kind/slot` resolves to one `series_key_id`.
 *
 * Run with: `E2E_API_PORT=… E2E_NEXT_PORT=… make e2e E2E_SPECS=e2e/43-history-requests-per-page.spec.ts`.
 */

const SPEC = "43-history-requests-per-page";
const SYMBOL = "BTCUSDT";
const SYMBOL_PATH = `/symbol/${SYMBOL}`;
const CHART_HOST_TESTID = "symbol-chart-host";

/** `ADR-050/D5`: four price reductions plus the six series of `INDICATOR_CATALOG`. */
const REQUESTS_PER_PAGE = 10;
/** More than one, so the count is a property of every page and not of the first one only. */
const MIN_PAGES = 2;
/** Same walk as `22-*.spec.ts`: from the right `WALK_VIEW_BARS` slots to the left edge. */
const MAX_DRAGS = 12;
const WALK_VIEW_BARS = 2_000;
const PER_DRAG_TIMEOUT_MS = 10_000;
const NO_REQUEST_WAIT_MS = 2_500;
const EDGE_OVERSHOOT_SLOTS = 60;
/** The price pane is the top pane of the single chart (`22-*.spec.ts`, `PRICE_PANE_MID_Y_PX`). */
const PRICE_PANE_MID_Y_PX = 110;

const ONE_MINUTE_MS = 60_000;
const OHLC_REDUCTIONS = ["OPEN", "HIGH", "LOW", "CLOSE"] as const;

declare global {
  interface Window {
    __historyPageLatencyProbe?: { requestedMs: number[]; drawnMs: number[]; reset(): void };
  }
}

type StubKey = Readonly<Record<string, string | number>>;

/** The defaults of `catalog.test.ts::seriesKey`, verbatim. */
function stubKey(overrides: StubKey & { readonly metric: string }): StubKey {
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
    verifiedBy: "T-03.3-synthetic-stub",
    ...overrides,
  };
}

/** Ten keys: the four OHLC reductions and the six rows `catalog.test.ts::EXPECTED` names. */
function syntheticKeys(): readonly StubKey[] {
  return [
    ...OHLC_REDUCTIONS.map((reduction) =>
      stubKey({ metric: "klines_ohlc", nature: "STOCK", tsConvention: "OHLC_OVER_BUCKET", reduction }),
    ),
    stubKey({ metric: "klines_volume" }),
    stubKey({ metric: "sum_liquidation", provider: "coinalyze", cohort: "long" }),
    stubKey({ metric: "sum_liquidation", provider: "coinalyze", cohort: "short" }),
    stubKey({
      metric: "sum_open_interest",
      interval: "5m",
      nature: "STOCK",
      tsConvention: "POINT_AT_BUCKET_END",
      reduction: "POINT",
    }),
    stubKey({
      metric: "count_long_short_ratio",
      interval: "5m",
      unit: "ratio",
      denom: "ratio",
      nature: "RATIO",
      tsConvention: "POINT_AT_BUCKET_END",
      reduction: "POINT",
    }),
    stubKey({ metric: "cvd_source" }),
  ];
}

function syntheticCatalogEnvelope(): { readonly query: string; readonly n_entries: number; readonly entries: unknown[] } {
  const entries = syntheticKeys().map((key) => ({
    key,
    nativeGrid: key.interval,
    maxStalenessMs: 600_000,
    priceUse: null,
    reconstructedFrom: null,
    publishedError: null,
  }));
  return { query: "series_catalog", n_entries: entries.length, entries };
}

async function startSyntheticStub(): Promise<{ readonly url: string; close(): Promise<void> }> {
  const catalog = syntheticCatalogEnvelope();
  const server = http.createServer((request, response) => {
    // The browser pages with a real cross-origin `fetch()` against this port (`20-*.spec.ts`).
    response.setHeader("access-control-allow-origin", "*");
    const incoming = new URL(request.url ?? "/", "http://placeholder");
    if (incoming.pathname.endsWith("/series-catalog")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(catalog));
      return;
    }
    if (incoming.pathname.endsWith("/series-history")) {
      const startMs = Number(incoming.searchParams.get("window_start_ms"));
      const endMsInclusive = Number(incoming.searchParams.get("window_end_ms"));
      const knowledgeTimeMs = Number(incoming.searchParams.get("knowledge_time_ms"));
      const seriesKeyId = incoming.searchParams.get("series_key_id") ?? "unknown";
      if (!Number.isFinite(startMs) || !Number.isFinite(endMsInclusive)) {
        response.writeHead(400, { "content-type": "text/plain" });
        response.end("synthetic stub: window_start_ms/window_end_ms missing or not numeric");
        return;
      }
      // Only the price needs values: without them the library does not see the drag as a pan. The
      // indicators answer a valid, empty page — this spec counts requests, not what they draw.
      const isPrice = priceSeriesKeyIds.has(seriesKeyId);
      const rows: { event_time: number; available_at: number; value: string; absence: null; coverage: null }[] = [];
      if (isPrice) {
        for (let t = startMs; t <= endMsInclusive; t += ONE_MINUTE_MS) {
          const value = 100 + (t % 1_000_000) / 100_000;
          rows.push({ event_time: t, available_at: t, value: value.toFixed(4), absence: null, coverage: null });
        }
      }
      const envelope = {
        session: { principal_id: null, server_now_ms: Date.now() },
        panel: {
          series_key_id: seriesKeyId,
          source: "T-03.3-synthetic-stub",
          nature: "STOCK",
          unit: "USD",
          coverage: { earliest_bucket_ms: null, latest_bucket_ms: null, source_floor_ms: null },
        },
        rows,
        knowledge_time: Number.isFinite(knowledgeTimeMs) ? knowledgeTimeMs : Date.now(),
        bar_policy: "final_only",
      };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(envelope));
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("synthetic stub: no route");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("synthetic stub: no port");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** The `series_key_id`s of the four OHLC reductions, computed by the one place this repository
 * computes them (`series-key-id.ts`, the `08-*.spec.ts` import). */
const priceSeriesKeyIds: ReadonlySet<string> = new Set(
  syntheticKeys()
    .filter((key) => key.metric === "klines_ohlc")
    .map((key) => computeSeriesKeyId(key as unknown as SeriesKey)),
);

function hostLocator(page: Page) {
  return page.locator(`[data-testid="${CHART_HOST_TESTID}"]`);
}

async function dragRight(page: Page, deltaXPx: number): Promise<void> {
  const box = await hostLocator(page).boundingBox();
  if (box === null) {
    throw new Error("the chart host has no bounding box — nothing mounted");
  }
  const startX = box.x + box.width * 0.5;
  const y = box.y + PRICE_PANE_MID_Y_PX;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.move(startX + deltaXPx, y, { steps: 30 });
  await page.waitForTimeout(100);
  await page.mouse.up();
}

async function probeCounts(page: Page): Promise<{ readonly requested: number; readonly drawn: number }> {
  return page.evaluate(() => ({
    requested: window.__historyPageLatencyProbe?.requestedMs.length ?? 0,
    drawn: window.__historyPageLatencyProbe?.drawnMs.length ?? 0,
  }));
}

interface PageRequests {
  readonly window: string;
  readonly seriesKeyIds: string[];
}

test(`DoD-2: cada página de história são ${REQUESTS_PER_PAGE} pedidos /series-history, um por series_key_id (${SPEC})`, async ({
  page,
}) => {
  expect(priceSeriesKeyIds.size, "os 4 series_key_id de preço do stub").toBe(OHLC_REDUCTIONS.length);
  const stub = await startSyntheticStub();
  let instance: NextInstanceHandle | undefined;
  const pages = new Map<string, PageRequests>();
  const onRequest = (request: Request): void => {
    if (request.method() !== "GET") return;
    const url = new URL(request.url());
    if (!request.url().startsWith(stub.url) || !url.pathname.endsWith("/series-history")) return;
    const window = `${url.searchParams.get("window_start_ms")}..${url.searchParams.get("window_end_ms")}`;
    const group = pages.get(window) ?? { window, seriesKeyIds: [] };
    group.seriesKeyIds.push(url.searchParams.get("series_key_id") ?? "missing");
    pages.set(window, group);
  };
  try {
    instance = await startSecondaryNextInstance({ INGEST_HEALTH_API_BASE_URL: stub.url });
    const response = await page.goto(`${instance.baseUrl}${SYMBOL_PATH}`, { waitUntil: "load" });
    expect(response?.ok(), `GET ${SYMBOL_PATH} não respondeu ok`).toBe(true);
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll("canvas")).some((c) => c.width > 0 && c.height > 0),
      undefined,
      { timeout: 120_000 },
    );
    await page.waitForTimeout(2_000);

    // Counted from here on: the SSR seed is node-side and never reaches `page.on('request')`.
    page.on("request", onRequest);
    const view = await showView(page, { kind: "lastBars", bars: WALK_VIEW_BARS });
    fact(SPEC, "prewalk_view", { iterations: view.iterations, from: view.fromLogical, to: view.toLogical, spacingPx: view.barSpacingPx });
    await page.evaluate(() => window.__historyPageLatencyProbe?.reset());
    for (let i = 0; i < MAX_DRAGS; i += 1) {
      const counts = await probeCounts(page);
      if (counts.drawn >= MIN_PAGES && counts.drawn >= counts.requested) {
        break;
      }
      const box = await hostLocator(page).boundingBox();
      if (box === null) throw new Error("the chart host has no bounding box — nothing mounted");
      const range = await readView(page);
      const pxPerSlot = box.width / (range.toLogical - range.fromLogical);
      const deltaXPx = Math.min(box.width * 0.45, Math.max(10, pxPerSlot * (Math.max(range.fromLogical, 0) + EDGE_OVERSHOOT_SLOTS)));
      await dragRight(page, deltaXPx);
      const requestedGrew = await page
        .waitForFunction((n) => (window.__historyPageLatencyProbe?.requestedMs.length ?? 0) > n, counts.requested, {
          timeout: NO_REQUEST_WAIT_MS,
        })
        .then(() => true)
        .catch(() => false);
      fact(SPEC, `drag_requested_new_page:${i}`, requestedGrew);
      if (!requestedGrew) continue;
      const afterRequest = await probeCounts(page);
      // A page that never draws is a failure, but not the FIRST one to report: the requests it fired
      // are the claim, and they are counted below before the draw count is asserted.
      const drawn = await page
        .waitForFunction((n) => (window.__historyPageLatencyProbe?.drawnMs.length ?? 0) >= n, afterRequest.requested, {
          timeout: PER_DRAG_TIMEOUT_MS,
        })
        .then(() => true)
        .catch(() => false);
      fact(SPEC, `drag_page_drawn:${i}`, drawn);
      if (!drawn) break;
    }
    page.off("request", onRequest);

    const final = await probeCounts(page);
    fact(SPEC, "history_pages_requested", final.requested);
    fact(SPEC, "history_pages_drawn", final.drawn);

    const perPage = [...pages.values()].map((group) => ({
      window: group.window,
      requests: group.seriesKeyIds.length,
      distinctSeriesKeyIds: new Set(group.seriesKeyIds).size,
    }));
    fact(SPEC, "requests_per_page", perPage);
    for (const group of perPage) {
      expect(
        group.requests,
        `a página ${group.window} fez ${group.requests} pedidos — são 4 de preço + 6 da tabela (ADR-050/D5)`,
      ).toBe(REQUESTS_PER_PAGE);
      expect(
        group.distinctSeriesKeyIds,
        `a página ${group.window} pediu ${group.distinctSeriesKeyIds} series_key_id distintos em ${group.requests} pedidos`,
      ).toBe(REQUESTS_PER_PAGE);
    }
    expect(
      perPage.length,
      `o navegador viu ${perPage.length} janelas de /series-history para ${final.drawn} páginas desenhadas`,
    ).toBeGreaterThanOrEqual(MIN_PAGES);
    expect(
      final.drawn,
      `apenas ${final.drawn} páginas desenhadas depois de ${MAX_DRAGS} arrastos — o spec precisa de >= ${MIN_PAGES}`,
    ).toBeGreaterThanOrEqual(MIN_PAGES);
  } finally {
    page.off("request", onRequest);
    if (instance !== undefined) await instance.close();
    await stub.close();
  }
});
