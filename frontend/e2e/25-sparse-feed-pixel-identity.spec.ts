import { spawnSync } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { fact, startSecondaryNextInstance, type NextInstanceHandle } from "./helpers.ts";

/**
 * `paineis-de-fluxo` `T-01.10` — `F-D` of `handoff/T-01.10-desenho.md` §4, the INVISIBILITY of the
 * fix: feeding the grid through ONE hidden carrier and the pane series plot items only
 * (`ADR-044/D2′`) must draw the SAME bytes as the lossless feed of before. Two arms:
 *
 * (i) SYNTHETIC, no server: the real adapters, the real `plotItemsOnly`/`hostSeriesFeeds` and the
 *     real carrier options (`chart-options.ts`), computed in a plain `node` process
 *     (`e2e/sparse-feed-fixture.ts`, whose docstring says why it is a process) and handed to the
 *     library in a real Chromium. A line, a histogram with its absence/zero marks, and a candlestick,
 *     each with a gap, an isolated present bucket and legitimate zeros. Lossless-without-carrier
 *     against carrier+sparse ⇒ 0 bytes. Two controls must DIFFER, or the instrument is blind: a
 *     one-value mutant, and the carrier itself filtered by `plotItemsOnly` (the gaps collapse). The
 *     second runs on a chart WITHOUT the absence/zero marks: with them, the sparse series alone
 *     already cover every slot and the carrier control measured 0 bytes (the fixture's comment).
 *     Promoted from `gates/T-01.10-desenho-pixel.mjs.txt`, which fed the library hand-written items.
 *
 * (ii) THE APP: one `next start` against a deterministic stub with gaps, the same page loaded twice —
 *     sparse, and `?e2eDenseSeries=1` (the ablation: lossless feeds, carrier kept) — no pointer, every
 *     canvas of the chart host read byte for byte. 0 bytes.
 *
 * Not a latency spec: nothing here is timed.
 *
 * Run with: `npx playwright test 25-sparse-feed-pixel-identity` (arm ii needs a built `.next`).
 */

const SPEC = "25-sparse-feed-pixel-identity";
const SYMBOL = "BTCUSDT";
const SYMBOL_PATH = `/symbol/${SYMBOL}`;
const CHART_HOST_TESTID = "symbol-chart-host";
const ONE_MINUTE_MS = 60_000;
/** Mirrors `host-series-feed.ts::DENSE_SERIES_ABLATION_QUERY_PARAM`; arm (i) asserts the two agree. */
const DENSE_SERIES_ABLATION_QUERY_PARAM = "e2eDenseSeries";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIGHTWEIGHT_CHARTS_STANDALONE = path.resolve(
  HERE,
  "..",
  "node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.js",
);
const FIXTURE = path.resolve(HERE, "sparse-feed-fixture.ts");

// ── arm (i) ──────────────────────────────────────────────────────────────────────────────────

interface FixtureSeries {
  readonly id: string;
  readonly kind: "Line" | "Histogram" | "Candlestick";
  readonly pane: number;
  readonly options: Record<string, unknown>;
  readonly fixedBand?: boolean;
}

interface FixtureChart {
  readonly name: string;
  /** The chart this one is compared against, byte for byte. */
  readonly reference: string;
  readonly series: readonly FixtureSeries[];
  readonly feeds: readonly { readonly series: string; readonly items: readonly Record<string, unknown>[] }[];
}

interface Fixture {
  readonly denseQueryParam: string;
  readonly chartOptions: Record<string, unknown>;
  readonly markBandMax: number;
  readonly charts: readonly FixtureChart[];
}

function loadFixture(): Fixture {
  const run = spawnSync(process.execPath, [FIXTURE], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (run.status !== 0) {
    throw new Error(`sparse-feed-fixture.ts exited ${run.status}: ${run.stderr}`);
  }
  return JSON.parse(run.stdout) as Fixture;
}

test(`F-D(i): portadora + plotItemsOnly desenha os MESMOS bytes do feed lossless, e os dois controles diferem (${SPEC})`, async ({
  page,
}) => {
  const fixture = loadFixture();
  expect(fixture.denseQueryParam, "o parâmetro da ablação divergiu de host-series-feed.ts").toBe(DENSE_SERIES_ABLATION_QUERY_PARAM);
  const byName = new Map(fixture.charts.map((chart) => [chart.name, chart]));
  expect(fixture.charts.map((chart) => chart.name)).toEqual([
    "lossless",
    "design",
    "mutant",
    "lossless_no_marks",
    "design_no_marks",
    "carrier_filtered_no_marks",
  ]);
  const lossless = byName.get("lossless")!;
  const design = byName.get("design")!;
  fact(SPEC, "arm_i_carrier_items", design.feeds[0]!.items.length);
  fact(
    SPEC,
    "arm_i_pane_items_sparse_vs_lossless",
    design.feeds.slice(1).map((feed, index) => [feed.series, feed.items.length, lossless.feeds[index]!.items.length]),
  );
  await page.setViewportSize({ width: 900, height: 1300 });
  await page.setContent(`<html><body style="margin:0"></body></html>`);
  await page.addScriptTag({ path: LIGHTWEIGHT_CHARTS_STANDALONE });
  const result = await page.evaluate(async ({ charts, chartOptions, markBandMax }) => {
    type Api = {
      addSeries: (kind: unknown, options: unknown, pane: number) => { setData: (items: unknown) => void };
      timeScale: () => { fitContent: () => void };
      takeScreenshot: () => HTMLCanvasElement;
    };
    const library = (globalThis as unknown as { LightweightCharts: Record<string, unknown> }).LightweightCharts;
    const kinds: Record<string, unknown> = {
      Line: library.LineSeries,
      Histogram: library.HistogramSeries,
      Candlestick: library.CandlestickSeries,
    };
    const options = chartOptions as { layout: object; timeScale: object };
    const built: { name: string; chart: Api }[] = [];
    for (const spec of charts) {
      const element = document.createElement("div");
      document.body.append(element);
      const chart = (library.createChart as (el: HTMLElement, o: unknown) => Api)(element, {
        ...options,
        layout: { ...options.layout, attributionLogo: false },
        timeScale: { ...options.timeScale, rightOffset: 0 },
      });
      const handles = new Map<string, { setData: (items: unknown) => void }>();
      for (const series of spec.series) {
        const seriesOptions = series.fixedBand
          ? { ...series.options, autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: markBandMax } }) }
          : series.options;
        handles.set(series.id, chart.addSeries(kinds[series.kind], seriesOptions, series.pane));
      }
      // The feeds in the fixture's order — for `design`, `hostSeriesFeeds`' order: the carrier first.
      for (const feed of spec.feeds) {
        handles.get(feed.series)!.setData(feed.items);
      }
      chart.timeScale().fitContent();
      built.push({ name: spec.name, chart });
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    const bytes = (chart: Api) => {
      const canvas = chart.takeScreenshot();
      return { data: canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data, w: canvas.width, h: canvas.height };
    };
    const shots = new Map(built.map(({ name, chart }) => [name, bytes(chart)]));
    const differing: Record<string, number> = {};
    for (const spec of charts) {
      const shot = shots.get(spec.name)!;
      const reference = shots.get(spec.reference)!;
      let n = 0;
      const length = Math.max(shot.data.length, reference.data.length);
      for (let i = 0; i < length; i += 1) {
        if (shot.data[i] !== reference.data[i]) n += 1;
      }
      differing[spec.name] = n;
    }
    const first = shots.get("lossless")!;
    return { differing, width: first.w, height: first.h, totalBytes: first.data.length };
  }, fixture);
  fact(SPEC, "arm_i_canvas", `${result.width}x${result.height}x4=${result.totalBytes}`);
  fact(SPEC, "arm_i_bytes_differing", result.differing);
  expect(result.totalBytes, "a captura não tem bytes — nada foi desenhado").toBeGreaterThan(0);
  expect(result.differing.design, "portadora + plotItemsOnly mudou o desenho (ADR-044/D2′)").toBe(0);
  expect(result.differing.mutant, "o mutante de um valor não diferiu — o instrumento é cego").toBeGreaterThan(0);
  expect(result.differing.design_no_marks, "portadora + plotItemsOnly mudou o desenho sem as marcas (ADR-044/D2′)").toBe(0);
  expect(
    result.differing.carrier_filtered_no_marks,
    "filtrar a portadora não mudou o desenho — o instrumento não enxerga o colapso das lacunas",
  ).toBeGreaterThan(0);
});

// ── arm (ii) ─────────────────────────────────────────────────────────────────────────────────

/** A deterministic stub with GAPS (price has no legitimate zero), so the sparse feed really drops
 * items: a 9-minute gap every 97 minutes. */
function stubValue(t: number): string | null {
  const minute = Math.floor(t / ONE_MINUTE_MS);
  if (minute % 97 < 9) {
    return null;
  }
  return (100 + (t % 1_000_000) / 100_000).toFixed(4);
}

const OHLC_REDUCTIONS = ["OPEN", "HIGH", "LOW", "CLOSE"] as const;

/** Copied from `e2e/23-pane-layer.spec.ts` (price OHLC only): the other panes get no series, so their
 * line series are all blanks (sparse = empty) and their absence marks are all plot items. */
function syntheticCatalogEnvelope(): { readonly query: string; readonly n_entries: number; readonly entries: unknown[] } {
  const entries = OHLC_REDUCTIONS.map((reduction) => ({
    key: {
      provider: "binance",
      venue: "binance",
      instrumentId: SYMBOL,
      metric: "klines_ohlc",
      cohort: "NA",
      interval: "1m",
      unit: "USD",
      denom: "USD",
      nature: "STOCK",
      tsConvention: "OHLC_OVER_BUCKET",
      reduction,
      quantityField: "NA",
      labelShift: 0,
      aggregationScope: "NA",
      verifiedBy: "T-01.10-synthetic-stub",
    },
    nativeGrid: "1m",
    maxStalenessMs: 600_000,
    priceUse: null,
    reconstructedFrom: null,
    publishedError: null,
  }));
  return { query: "series_catalog", n_entries: entries.length, entries };
}

async function startGappedStub(): Promise<{ readonly url: string; close(): Promise<void> }> {
  const catalog = syntheticCatalogEnvelope();
  const server = http.createServer((request, response) => {
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
      const rows: { event_time: number; available_at: number; value: string; absence: null; coverage: null }[] = [];
      for (let t = startMs; t <= endMsInclusive; t += ONE_MINUTE_MS) {
        const value = stubValue(t);
        if (value !== null) {
          rows.push({ event_time: t, available_at: t, value, absence: null, coverage: null });
        }
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          session: { principal_id: null, server_now_ms: Date.now() },
          panel: {
            series_key_id: seriesKeyId,
            source: "T-01.10-synthetic-stub",
            nature: "STOCK",
            unit: "USD",
            coverage: { earliest_bucket_ms: null, latest_bucket_ms: null, source_floor_ms: null },
          },
          rows,
          knowledge_time: Number.isFinite(knowledgeTimeMs) ? knowledgeTimeMs : Date.now(),
          bar_policy: "final_only",
        }),
      );
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

interface HostCapture {
  readonly windowStartMs: string | null;
  readonly seriesFeed: string | undefined;
  readonly canvases: readonly { readonly w: number; readonly h: number; readonly bytes: Buffer }[];
}

/** Loads the page, waits for the panes to be laid out and two quiet frames, and reads every canvas of
 * the chart host. The pointer never touches the page (no crosshair). The RGBA bytes cross back as
 * base64: the first run returned them as a JSON array of numbers (~9.2 M per load) and the test took
 * 1.9 min `[MEDIDO 2026-09-25, n=1]`. */
async function captureHost(page: Page, url: string): Promise<HostCapture> {
  const response = await page.goto(url, { waitUntil: "load" });
  expect(response?.ok(), `GET ${url} não respondeu ok`).toBe(true);
  const host = page.locator(`[data-testid="${CHART_HOST_TESTID}"]`);
  await expect(host).toHaveAttribute("data-pane-layers", "anchored", { timeout: 60_000 });
  await page.waitForTimeout(1_000);
  const raw = await page.evaluate(async (testId) => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const hostElement = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!;
    const canvases = Array.from(hostElement.querySelectorAll("canvas"))
      .filter((canvas) => canvas.width > 0 && canvas.height > 0)
      .map((canvas) => {
        const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
        let binary = "";
        for (let offset = 0; offset < data.length; offset += 0x8000) {
          binary += String.fromCharCode(...data.subarray(offset, offset + 0x8000));
        }
        return { w: canvas.width, h: canvas.height, base64: btoa(binary) };
      });
    return {
      windowStartMs: document.querySelector("main")?.getAttribute("data-window-start-ms") ?? null,
      seriesFeed: hostElement.dataset.seriesFeed,
      canvases,
    };
  }, CHART_HOST_TESTID);
  return {
    windowStartMs: raw.windowStartMs,
    seriesFeed: raw.seriesFeed,
    canvases: raw.canvases.map((canvas) => ({ w: canvas.w, h: canvas.h, bytes: Buffer.from(canvas.base64, "base64") })),
  };
}

function differingBytes(a: HostCapture, b: HostCapture): number {
  let differing = 0;
  const n = Math.max(a.canvases.length, b.canvases.length);
  for (let c = 0; c < n; c += 1) {
    const x = a.canvases[c]?.bytes ?? Buffer.alloc(0);
    const y = b.canvases[c]?.bytes ?? Buffer.alloc(0);
    const m = Math.max(x.length, y.length);
    for (let i = 0; i < m; i += 1) {
      if (x[i] !== y[i]) differing += 1;
    }
  }
  return differing;
}

test(`F-D(ii): no app real, esparso contra ?${DENSE_SERIES_ABLATION_QUERY_PARAM}=1 dá 0 byte de diferença nos canvases (${SPEC})`, async ({
  page,
}) => {
  test.setTimeout(240_000);
  const stub = await startGappedStub();
  let instance: NextInstanceHandle | undefined;
  try {
    instance = await startSecondaryNextInstance({ INGEST_HEALTH_API_BASE_URL: stub.url });
    const sparseUrl = `${instance.baseUrl}${SYMBOL_PATH}`;
    const denseUrl = `${instance.baseUrl}${SYMBOL_PATH}?${DENSE_SERIES_ABLATION_QUERY_PARAM}=1`;
    // The window trails the server's clock: a pair of loads that straddles a minute boundary compares
    // two different windows, which is not the question. Such a pair is retried, and counted.
    let sparse = await captureHost(page, sparseUrl);
    let dense = await captureHost(page, denseUrl);
    let straddledPairs = 0;
    while (sparse.windowStartMs !== dense.windowStartMs && straddledPairs < 3) {
      straddledPairs += 1;
      sparse = await captureHost(page, sparseUrl);
      dense = await captureHost(page, denseUrl);
    }
    const totalBytes = sparse.canvases.reduce((sum, canvas) => sum + canvas.bytes.length, 0);
    const differing = differingBytes(sparse, dense);
    fact(SPEC, "arm_ii_straddled_pairs_retried", straddledPairs);
    fact(SPEC, "arm_ii_canvases", sparse.canvases.map((canvas) => `${canvas.w}x${canvas.h}`));
    fact(SPEC, "arm_ii_total_bytes", totalBytes);
    fact(SPEC, "arm_ii_bytes_differing", differing);
    expect(sparse.seriesFeed, "a carga esparsa não declarou data-series-feed=sparse").toBe("sparse");
    expect(dense.seriesFeed, "a ablação não chegou ao host (data-series-feed)").toBe("dense");
    expect(sparse.windowStartMs, "as duas cargas pediram janelas diferentes mesmo após as novas tentativas").toBe(dense.windowStartMs);
    expect(sparse.canvases.length, "o host não tem canvas desenhado").toBeGreaterThan(0);
    expect(sparse.canvases.length).toBe(dense.canvases.length);
    expect(totalBytes, "os canvases não têm bytes").toBeGreaterThan(0);
    expect(differing, "o feed esparso desenhou bytes diferentes do lossless no app real (ADR-044/D2′)").toBe(0);
  } finally {
    await instance?.close();
    await stub.close();
  }
});
