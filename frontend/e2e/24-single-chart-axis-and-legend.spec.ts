import http from "node:http";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { chartSurfaceTheme } from "../src/charts/chart-theme.ts";
import { computeSeriesKeyId } from "../src/app/symbol/series-key-id.ts";
import type { SeriesKey } from "../src/features/s3-inspector/series-catalog.ts";
import { fact, sentimentoApiBaseUrl, startSecondaryNextInstance, type NextInstanceHandle } from "./helpers.ts";

/**
 * `paineis-de-fluxo` `T-01.9` (plan `01` DoD 2–5; `SPEC-009` §9 `CA-1′`, `CA-2′`, `CA-3′`; `PRD-009`
 * `CA-4`, `CA-5`) — THE PHASE-01 SKELETON, MEASURED ON THE REAL APP.
 *
 * ── WHAT EACH TEST ASSERTS, AND THE MUTATION THAT HAS TO REDDEN IT ──────────────────────────
 *
 *   CA-1′  `.tv-lightweight-charts` count `== 1`, and the SIX panes each have `N > 0` points: the
 *          data count the pane publishes AND non-background ink in that pane's own canvases.
 *          Bites: going back to 6 `createChart`.
 *   CA-2′  ONE axis, BY PIXEL: of the canvases shaped like a time axis (at least half the chart
 *          wide, at most 60px tall — a pane is never under the 72px floor, a price scale is never
 *          half the width), the ones carrying axis-text ink (`chartSurfaceTheme().textColor`) form
 *          exactly ONE band, and it lies below every pane. Colour alone cannot tell a label from a
 *          series: the doji, the volume and the absence marks share that token, and a first draft
 *          that scanned every canvas found 6 "strips" inside the panes of the ONE chart. Bites:
 *          the same ablation as CA-1′ (the 6-chart code gave every chart `timeVisible: true`).
 *   CA-3′  Hover at `n >= 5` positions of the PRICE pane (plus one over the CVD pane): every legend
 *          reads the crosshair's slot, the slot matches the pixel `x` through the visible logical
 *          range, and every legend value equals the `/series-history` row of that slot, as the stub
 *          SERVED it. Bites: filtering the legend update by `param.paneIndex`.
 *   CA-4   No hover: every legend is the last CLOSED bucket at `knowledge_time_ms`, computed here
 *          from the served rows, and its value. Bites: the last-closed index swapped by `−1`.
 *   CA-5   Swapping the `unit` of every resolved catalog entry changes every pane title, and the
 *          title carries the new term. Bites: a hand-written name.
 *
 * Every ablation was run by hand against a rebuilt app; the command and the reproved line are in
 * `docs/context/paineis-de-fluxo/gates/T-01.9-builder.md`.
 *
 * ── WHY A LOCAL STUB, AND WHICH HALF OF IT IS REAL ──────────────────────────────────────────
 *
 * The weak universe of `make e2e` serves no `/series-history` rows, and seeding the shared Postgres
 * is forbidden. The CATALOG is the real one: it is read, once, from the e2e API
 * (`E2E_SENTIMENTO_API_BASE_URL`, 76 entries), so the page resolves its panes through the same keys,
 * natures and units production serves. Only the VALUES are synthetic: a deterministic function of
 * the minute that changes on every slot (so a legend one slot off is a different number) and, for
 * the two 5-minute series, a staircase constant inside each 5-minute bucket (the shape the backend
 * serves on the 1-minute grid). Every row the stub answers is RECORDED, and the legends are compared
 * with that record, never with the generator. No `INSERT`, no Postgres, no shared state touched.
 *
 * Run with: `E2E_API_PORT=… E2E_NEXT_PORT=… make e2e` (or `npx playwright test 24-single-chart`).
 */

const SPEC = "24-single-chart-axis-and-legend";
const SYMBOL = "BTCUSDT";
const SYMBOL_PATH = `/symbol/${SYMBOL}`;
const CHART_HOST_TESTID = "symbol-chart-host";
const ONE_MINUTE_MS = 60_000;
const FIVE_MINUTES_MS = 300_000;
const INK_TOLERANCE = 12;
const HOVER_FRACTIONS = [0.12, 0.27, 0.41, 0.56, 0.7, 0.86] as const;
const MIN_HOVER_POSITIONS = 5;

/** The six panes, top to bottom, by the `data-testid` of their DOM layer (`T-01.6`), and the
 * attribute each publishes with its point count. */
const PANES = [
  { testId: "price-pane", pointsAttr: "data-price-candles" },
  { testId: "liquidation-cohort-long", pointsAttr: "data-liquidation-present-points" },
  { testId: "liquidation-cohort-short", pointsAttr: "data-liquidation-present-points" },
  { testId: "oi-pane", pointsAttr: "data-oi-wire-points" },
  { testId: "long-short-pane", pointsAttr: "data-long-short-wire-points" },
  { testId: "cvd-pane", pointsAttr: "data-cvd-present-points" },
] as const;

/** The pt-BR word that opens each derived name on the page (`CA-5`): six names, because the two
 * liquidation legs share one. */
const DERIVED_NAME_WORDS = ["Preço", "Volume", "Liquidações", "Open Interest", "Long/short de contas", "CVD"] as const;

// ── The catalog, and which entry each legend reads ─────────────────────────────────────────

interface CatalogEntryWire {
  readonly key: SeriesKey;
  readonly [field: string]: unknown;
}

interface CatalogEnvelope {
  readonly query: string;
  readonly n_entries: number;
  readonly entries: readonly CatalogEntryWire[];
}

/** The legend (`data-legend-value`) → the catalog row it has to read, written HERE from the
 * series' identity and not imported from `view-model.ts`, so a wrong selector in production would
 * disagree with this table instead of agreeing with itself. */
type LegendFactKey =
  | "price"
  | "volume"
  | "oi"
  | "cvd_delta"
  | "cvd_cumulative"
  | "liquidation_long"
  | "liquidation_short"
  | "long_short";

const LEGEND_FACT_KEYS: readonly LegendFactKey[] = [
  "price",
  "volume",
  "liquidation_long",
  "liquidation_short",
  "oi",
  "long_short",
  "cvd_delta",
  "cvd_cumulative",
];

function legendSelects(factKey: LegendFactKey, key: SeriesKey): boolean {
  if (key.instrumentId !== SYMBOL) return false;
  switch (factKey) {
    case "price":
      return key.metric === "klines_ohlc" && key.provider === "binance" && key.reduction === "CLOSE";
    case "volume":
      return key.metric === "klines_volume" && key.provider === "binance";
    case "oi":
      return key.metric === "sum_open_interest" && key.provider === "binance" && key.reduction === "POINT";
    case "cvd_delta":
    case "cvd_cumulative":
      return key.metric === "cvd_source" && key.provider === "binance" && key.quantityField === "NA";
    case "liquidation_long":
      return key.metric === "sum_liquidation" && key.provider === "coinalyze" && key.cohort === "long";
    case "liquidation_short":
      return key.metric === "sum_liquidation" && key.provider === "coinalyze" && key.cohort === "short";
    case "long_short":
      return key.metric === "count_long_short_ratio" && key.provider === "binance";
  }
}

/** The pane a legend lives in — the step of the reading policy the page applies to it. */
function nativeStepMsOf(factKey: LegendFactKey): number {
  return factKey === "oi" ? FIVE_MINUTES_MS : ONE_MINUTE_MS;
}

/** CA-5's swap: every unit becomes a DIFFERENT real unit, so the new title is plausible text and
 * the derivation has something to change. */
const UNIT_SWAP: Readonly<Record<string, string>> = { USDT: "USDC", BTC: "ETH", USD: "EUR", ratio: "pct" };

function withSwappedUnits(catalog: CatalogEnvelope): CatalogEnvelope {
  return {
    ...catalog,
    entries: catalog.entries.map((entry) => {
      const selected = LEGEND_FACT_KEYS.some((factKey) => legendSelects(factKey, entry.key));
      if (!selected) return entry;
      const swapped = UNIT_SWAP[entry.key.unit];
      if (swapped === undefined) throw new Error(`CA-5: no swap for unit ${entry.key.unit}`);
      return { ...entry, key: { ...entry.key, unit: swapped } };
    }),
  };
}

// ── The values: deterministic, different on every slot ─────────────────────────────────────

function wave(minute: number, salt: number): number {
  return (((minute * 37 + salt * 101) % 997) + 997) % 997;
}

/** The value of one series at one bucket, as the decimal string the API would serve. Quarters and
 * 1/512ths only, so every value is an exact binary fraction and `Number(served) === legend` is an
 * identity, not a tolerance. */
function syntheticValue(key: SeriesKey, bucketMs: number): string {
  const minute = Math.round(bucketMs / ONE_MINUTE_MS);
  const stair = Math.floor(minute / 5) * 5;
  const close = (m: number) => 100 + wave(m, 1) / 4;
  switch (key.metric) {
    case "klines_ohlc": {
      const open = close(minute - 1);
      const last = close(minute);
      if (key.reduction === "OPEN") return String(open);
      if (key.reduction === "HIGH") return String(Math.max(open, last) + 0.5);
      if (key.reduction === "LOW") return String(Math.min(open, last) - 0.5);
      return String(last);
    }
    case "klines_volume":
      return String(10 + wave(minute, 2) / 4);
    case "cvd_source":
      return String(wave(minute, 3) - 498);
    case "sum_liquidation":
      return String(1 + wave(minute, key.cohort === "long" ? 4 : 5) / 4);
    case "sum_open_interest":
      return String(50_000 + wave(stair, 6) / 4);
    case "count_long_short_ratio":
      return String(0.5 + wave(stair, 7) / 512);
    default:
      return String(wave(minute, 9) / 4);
  }
}

interface StubHandle {
  readonly url: string;
  /** series_key_id → bucket ms → the value string the stub served. */
  readonly served: Map<string, Map<number, string>>;
  setCatalog(catalog: CatalogEnvelope): void;
  close(): Promise<void>;
}

async function startCatalogBackedStub(initial: CatalogEnvelope, alternates: readonly CatalogEnvelope[]): Promise<StubHandle> {
  let catalog = initial;
  const keysById = new Map<string, SeriesKey>();
  for (const envelope of [initial, ...alternates]) {
    for (const entry of envelope.entries) keysById.set(computeSeriesKeyId(entry.key), entry.key);
  }
  const served = new Map<string, Map<number, string>>();
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
      const seriesKeyId = incoming.searchParams.get("series_key_id") ?? "";
      const key = keysById.get(seriesKeyId);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMsInclusive) || key === undefined) {
        response.writeHead(400, { "content-type": "text/plain" });
        response.end(`T-01.9 stub: bad request (${seriesKeyId || "no series_key_id"})`);
        return;
      }
      const record = served.get(seriesKeyId) ?? new Map<number, string>();
      served.set(seriesKeyId, record);
      const rows: { event_time: number; available_at: number; value: string; absence: null; coverage: null }[] = [];
      for (let t = startMs; t <= endMsInclusive; t += ONE_MINUTE_MS) {
        const value = syntheticValue(key, t);
        record.set(t, value);
        rows.push({ event_time: t, available_at: t, value, absence: null, coverage: null });
      }
      const envelope = {
        session: { principal_id: null, server_now_ms: Date.now() },
        panel: {
          series_key_id: seriesKeyId,
          source: "T-01.9-synthetic-values",
          nature: key.nature,
          unit: key.unit,
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
    response.end("T-01.9 stub: no route");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("T-01.9 stub: no port");
  return {
    url: `http://127.0.0.1:${address.port}`,
    served,
    setCatalog(next) {
      catalog = next;
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

async function fetchRealCatalog(): Promise<CatalogEnvelope> {
  const response = await fetch(`${sentimentoApiBaseUrl()}/series-catalog`);
  if (!response.ok) throw new Error(`GET /series-catalog on the e2e API answered ${response.status}`);
  return (await response.json()) as CatalogEnvelope;
}

function seriesKeyIdFor(catalog: CatalogEnvelope, factKey: LegendFactKey): string {
  const matches = catalog.entries.filter((entry) => legendSelects(factKey, entry.key));
  if (matches.length !== 1) throw new Error(`${factKey}: ${matches.length} catalog rows match, expected exactly 1`);
  return computeSeriesKeyId(matches[0]!.key);
}

// ── Page readings ──────────────────────────────────────────────────────────────────────────

async function openSymbol(page: Page, baseUrl: string): Promise<void> {
  await page.mouse.move(2, 2);
  const response = await page.goto(`${baseUrl}${SYMBOL_PATH}`, { waitUntil: "load" });
  expect(response?.ok(), `GET ${SYMBOL_PATH} não respondeu ok`).toBe(true);
  await expect(page.locator(".tv-lightweight-charts").first()).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(2_000);
}

interface LegendReadingDom {
  readonly factKey: string;
  readonly source: string | null;
  readonly kind: string | null;
  readonly slotIndex: number;
  readonly bucketMs: number;
  readonly raw: number;
}

async function readLegends(page: Page): Promise<LegendReadingDom[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("[data-legend-value]")).map((node) => {
      const num = (raw: string | undefined) => (raw === undefined || raw === "" ? Number.NaN : Number(raw));
      return {
        factKey: node.dataset.legendValue ?? "",
        source: node.dataset.legendSource ?? null,
        kind: node.dataset.legendKind ?? null,
        slotIndex: num(node.dataset.legendSlotIndex),
        bucketMs: num(node.dataset.legendBucketMs),
        raw: num(node.dataset.legendRaw),
      };
    }),
  );
}

interface WindowFrame {
  readonly windowStartMs: number;
  readonly knowledgeTimeMs: number;
}

async function readWindow(page: Page): Promise<WindowFrame> {
  const main = page.locator("main[data-window-start-ms]");
  return {
    windowStartMs: Number(await main.getAttribute("data-window-start-ms")),
    knowledgeTimeMs: Number(await main.getAttribute("data-knowledge-time-ms")),
  };
}

/** What the legend `factKey` must show at `bucketMs`, off the rows the stub SERVED. */
function expectedAt(
  stub: StubHandle,
  ids: Readonly<Record<LegendFactKey, string>>,
  factKey: LegendFactKey,
  bucketMs: number,
  windowStartMs: number,
): number {
  const rows = stub.served.get(ids[factKey]);
  if (rows === undefined) throw new Error(`${factKey}: the page never asked /series-history for ${ids[factKey]}`);
  if (factKey === "cvd_cumulative") {
    // `cvdCumulativeScaled`'s definition, restated: the running sum of the served deltas from the
    // window's own start through this bucket, inclusive. Integer deltas ⇒ an exact sum.
    let running = 0;
    for (const [t, value] of rows) if (t >= windowStartMs && t <= bucketMs) running += Number(value);
    return running;
  }
  // STOCK reads the value of the NATIVE bucket the slot belongs to (`resolveStockReading`); FLOW and
  // RATIO read the slot itself. Every series here is served on every minute, so this is a row.
  const step = nativeStepMsOf(factKey);
  const nativeBucketMs = Math.floor(bucketMs / step) * step;
  const served = rows.get(nativeBucketMs);
  if (served === undefined) throw new Error(`${factKey}: the stub served no row at ${nativeBucketMs}`);
  return Number(served);
}

// ── The suite ──────────────────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 1280, height: 1200 } });

// NOT `describe.serial`: each criterion has its own verdict. After a failure Playwright restarts the
// worker and `beforeAll` raises a fresh stub + instance, so one red criterion never hides the next.
test.describe(`T-01.9: um gráfico, um eixo, legenda == API (${SPEC})`, () => {
  let realCatalog: CatalogEnvelope;
  let swappedCatalog: CatalogEnvelope;
  let stub: StubHandle;
  let instance: NextInstanceHandle | undefined;
  let ids: Record<LegendFactKey, string>;

  test.beforeAll(async () => {
    realCatalog = await fetchRealCatalog();
    fact(SPEC, "real_catalog_entries", realCatalog.entries.length);
    swappedCatalog = withSwappedUnits(realCatalog);
    ids = Object.fromEntries(LEGEND_FACT_KEYS.map((k) => [k, seriesKeyIdFor(realCatalog, k)])) as Record<LegendFactKey, string>;
    stub = await startCatalogBackedStub(realCatalog, [swappedCatalog]);
    instance = await startSecondaryNextInstance({ INGEST_HEALTH_API_BASE_URL: stub.url });
  });

  test.afterAll(async () => {
    if (instance !== undefined) await instance.close();
    if (stub !== undefined) await stub.close();
  });

  test("CA-1′: um .tv-lightweight-charts, e os 6 panes com N > 0 pontos na tela", async ({ page }) => {
    await openSymbol(page, instance!.baseUrl);
    const chartCount = await page.locator(".tv-lightweight-charts").count();
    fact(SPEC, "tv_lightweight_charts_count", chartCount);
    expect(chartCount, "CA-1′: mais de um gráfico montado").toBe(1);

    const panes = await page.evaluate(
      ({ panes, background, tol }) => {
        const [br, bg, bb] = background;
        return panes.map(({ testId, pointsAttr }) => {
          const layer = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
          if (layer === null) return { testId, points: Number.NaN, ink: -1, insideChart: false };
          const canvases = Array.from(layer.parentElement?.children ?? []).filter(
            (c): c is HTMLCanvasElement => c instanceof HTMLCanvasElement,
          );
          let ink = 0;
          for (const canvas of canvases) {
            const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
            for (let at = 0; at < data.length; at += 4) {
              if (data[at + 3] === 0) continue;
              const isBackground =
                Math.abs(data[at]! - br) <= tol && Math.abs(data[at + 1]! - bg) <= tol && Math.abs(data[at + 2]! - bb) <= tol;
              if (!isBackground) ink += 1;
            }
          }
          return {
            testId,
            points: Number(layer.getAttribute(pointsAttr) ?? Number.NaN),
            ink,
            insideChart: layer.closest(".tv-lightweight-charts") !== null,
          };
        });
      },
      { panes: PANES.map((p) => ({ ...p })), background: hexToRgb(chartSurfaceTheme().backgroundColor), tol: INK_TOLERANCE },
    );
    fact(SPEC, "panes_points_and_ink", panes);
    expect(panes).toHaveLength(6);
    for (const pane of panes) {
      expect(pane.insideChart, `${pane.testId}: fora do gráfico único`).toBe(true);
      expect(pane.points, `${pane.testId}: N de pontos publicado`).toBeGreaterThan(0);
      expect(pane.ink, `${pane.testId}: nenhum pixel desenhado no pane`).toBeGreaterThan(0);
    }
  });

  test("CA-2′: um eixo de tempo, por pixel, só no rodapé", async ({ page }) => {
    await openSymbol(page, instance!.baseUrl);
    const strips = await page.evaluate(
      ({ text, tol, maxAxisHeightPx }) => {
        const [tr, tg, tb] = text;
        const hosts = Array.from(document.querySelectorAll<HTMLElement>(".tv-lightweight-charts"));
        const width =
          Math.max(...hosts.map((h) => h.getBoundingClientRect().right)) - Math.min(...hosts.map((h) => h.getBoundingClientRect().left));
        // A time-axis surface, by GEOMETRY and not by the library's DOM: a canvas at least half the
        // chart wide and shorter than any pane can be (the pane floor is 72px). Pane plots are tall,
        // price scales are narrow; neither qualifies. Each surface's axis-text ink is then COUNTED.
        const surfaces: { top: number; bottom: number; widthPx: number; heightPx: number; textInk: number }[] = [];
        for (const canvas of Array.from(document.querySelectorAll<HTMLCanvasElement>(".tv-lightweight-charts canvas"))) {
          const box = canvas.getBoundingClientRect();
          if (canvas.width === 0 || canvas.height === 0 || box.width < width / 2 || box.height > maxAxisHeightPx) continue;
          const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
          let textInk = 0;
          for (let at = 0; at < data.length; at += 4) {
            if (data[at + 3] === 0) continue;
            if (Math.abs(data[at]! - tr) <= tol && Math.abs(data[at + 1]! - tg) <= tol && Math.abs(data[at + 2]! - tb) <= tol) {
              textInk += 1;
            }
          }
          surfaces.push({ top: box.top, bottom: box.bottom, widthPx: box.width, heightPx: box.height, textInk });
        }
        // The library stacks two canvases per widget (drawing + top layer): one band per `top`.
        const labelled = surfaces.filter((s) => s.textInk > 0);
        const bands = [...new Set(labelled.map((s) => Math.round(s.top)))].sort((a, b) => a - b).map((top) => ({
          top,
          textInk: labelled.filter((s) => Math.round(s.top) === top).reduce((sum, s) => sum + s.textInk, 0),
        }));
        const paneBottoms = Array.from(document.querySelectorAll<HTMLElement>("[data-pane-legend]")).map(
          (legend) => legend.parentElement!.getBoundingClientRect().bottom,
        );
        return { strips: bands, surfaces, width, paneBottoms };
      },
      { text: hexToRgb(chartSurfaceTheme().textColor), tol: INK_TOLERANCE, maxAxisHeightPx: 60 },
    );
    fact(SPEC, "time_axis_strips", strips);
    expect(strips.surfaces.length, "nenhuma superfície de eixo de tempo — o instrumento está cego").toBeGreaterThan(0);
    expect(strips.strips, "CA-2′: o número de faixas com rótulo de tempo não é 1").toHaveLength(1);
    expect(strips.strips[0]!.textInk, "a faixa do rodapé não tem tinta de rótulo").toBeGreaterThan(0);
    expect(strips.paneBottoms, "a camada dos 6 panes não está na página").toHaveLength(6);
    const lowestPaneBottom = Math.max(...strips.paneBottoms);
    expect(strips.strips[0]!.top, "CA-2′: a faixa de rótulo de tempo não está abaixo do último pane").toBeGreaterThanOrEqual(
      lowestPaneBottom - 1,
    );
  });

  test("CA-3′ + CA-4: hover no Preço ⇒ as legendas == slot de x em /series-history; sem hover ⇒ último fechado", async ({ page }) => {
    await openSymbol(page, instance!.baseUrl);
    const frame = await readWindow(page);
    fact(SPEC, "window", frame);

    // ── CA-4 first, before any mouse enters the chart ──────────────────────────────────────
    const checkLastClosed = async (phase: string) => {
      const legends = await readLegends(page);
      fact(SPEC, `last_closed_${phase}`, legends);
      expect(legends.map((l) => l.factKey).sort()).toEqual([...LEGEND_FACT_KEYS].sort());
      for (const legend of legends) {
        const factKey = legend.factKey as LegendFactKey;
        const rows = stub.served.get(ids[factKey])!;
        const closed = [...rows.keys()].filter((t) => t + ONE_MINUTE_MS <= frame.knowledgeTimeMs);
        const lastClosedMs = Math.max(...closed);
        expect(legend.source, `${factKey}: sem hover a legenda não é last_closed`).toBe("last_closed");
        expect(legend.bucketMs, `CA-4 ${factKey}: o balde não é o último fechado em T`).toBe(lastClosedMs);
        expect(legend.raw, `CA-4 ${factKey}: o valor não é o do último balde fechado`).toBe(
          expectedAt(stub, ids, factKey, lastClosedMs, frame.windowStartMs),
        );
      }
    };
    await checkLastClosed("before_hover");

    // ── CA-3′: n >= 5 positions over the price pane, one over the CVD pane ────────────────
    const host = page.locator(`[data-testid="${CHART_HOST_TESTID}"]`);
    const from = Number(await host.getAttribute("data-visible-logical-from"));
    const to = Number(await host.getAttribute("data-visible-logical-to"));
    fact(SPEC, "visible_logical_range", { from, to });
    const priceBox = (await page.locator('[data-testid="price-pane"]').boundingBox())!;
    const cvdBox = (await page.locator('[data-testid="cvd-pane"]').boundingBox())!;
    const targets = [
      ...HOVER_FRACTIONS.map((fraction) => ({ pane: "price-pane", box: priceBox, fraction })),
      { pane: "cvd-pane", box: cvdBox, fraction: 0.33 },
    ];
    const seenSlots = new Set<number>();
    let priceHovers = 0;
    for (const target of targets) {
      const x = target.box.x + target.box.width * target.fraction;
      const y = target.box.y + target.box.height * 0.6;
      // `steps: 5`: a single move with no motion before it did not fire the crosshair (`T-01.7` §5).
      await page.mouse.move(x, y, { steps: 5 });
      await expect(
        page.locator('[data-legend-value="price"]'),
        `CA-3′: a legenda do Preço não acompanhou o crosshair sobre ${target.pane}`,
      ).toHaveAttribute("data-legend-source", "crosshair");
      await page.waitForTimeout(150);
      const legends = await readLegends(page);
      const slots = [...new Set(legends.map((l) => l.slotIndex))];
      const expectedLogical = from + ((x - target.box.x) / target.box.width) * (to - from);
      fact(SPEC, `hover_${target.pane}_${target.fraction}`, { x, expectedLogical, legends });
      expect(slots, `CA-3′: as legendas leem slots diferentes (${slots.join(",")})`).toHaveLength(1);
      const slot = slots[0]!;
      expect(Math.abs(slot - expectedLogical), `o slot ${slot} não corresponde ao x (lógico ${expectedLogical.toFixed(2)})`).toBeLessThanOrEqual(1.5);
      for (const legend of legends) {
        const factKey = legend.factKey as LegendFactKey;
        expect(legend.source, `CA-3′ ${factKey}: não acompanhou o crosshair sobre ${target.pane}`).toBe("crosshair");
        expect(legend.raw, `CA-3′ ${factKey}: legenda != /series-history no slot ${slot}`).toBe(
          expectedAt(stub, ids, factKey, legend.bucketMs, frame.windowStartMs),
        );
      }
      seenSlots.add(slot);
      if (target.pane === "price-pane") priceHovers += 1;
    }
    fact(SPEC, "hover_distinct_slots", [...seenSlots]);
    expect(priceHovers).toBeGreaterThanOrEqual(MIN_HOVER_POSITIONS);
    expect(seenSlots.size, "as posições de hover não deram slots distintos").toBeGreaterThanOrEqual(MIN_HOVER_POSITIONS);

    // ── CA-4 again, after the pointer leaves the chart ────────────────────────────────────
    await page.mouse.move(2, 2, { steps: 5 });
    await expect(page.locator('[data-legend-value="price"]')).toHaveAttribute("data-legend-source", "last_closed");
    await checkLastClosed("after_hover");
  });

  test("CA-5: trocar a unidade no catálogo muda o nome derivado de cada pane", async ({ page }) => {
    // The pt-BR word of each name is hand-written BY DESIGN (it is microcopy); the DERIVED part is
    // the parenthesis, `(cadence, unit)` off the served key (`pane-legend.ts::paneIdentityLabel`).
    // The two liquidation legs share ONE name, drawn in the upper leg (`T-01.7`, `LiquidationPane`):
    // the short leg's own heading is the cohort label, which carries no key term.
    const readNames = async () =>
      page.evaluate(
        ({ hostTestId, words }) => {
          const headings = Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="${hostTestId}"] h2, [data-testid="${hostTestId}"] h3`)).map(
            (h) => h.textContent?.trim() ?? "",
          );
          return words.map((word) => {
            const found = headings.filter((text) => text.startsWith(`${word} (`));
            return { word, count: found.length, name: found[0] ?? "" };
          });
        },
        { hostTestId: CHART_HOST_TESTID, words: [...DERIVED_NAME_WORDS] },
      );
    await openSymbol(page, instance!.baseUrl);
    const before = await readNames();
    try {
      stub.setCatalog(swappedCatalog);
      await openSymbol(page, instance!.baseUrl);
      const after = await readNames();
      fact(SPEC, "derived_names", { before, after });
      for (const [index, name] of before.entries()) {
        const swapped = after[index]!;
        expect(name.count, `${name.word}: não há exatamente um nome derivado na página`).toBe(1);
        expect(swapped.count, `${name.word}: o nome derivado sumiu com a chave trocada`).toBe(1);
        expect(swapped.name, `CA-5 ${name.word}: o nome não mudou com a chave`).not.toBe(name.name);
        const newUnit = Object.values(UNIT_SWAP).find((unit) => swapped.name.includes(unit));
        expect(newUnit, `CA-5 ${name.word}: o nome novo não carrega a unidade trocada (${swapped.name})`).toBeDefined();
      }
    } finally {
      stub.setCatalog(realCatalog);
    }
  });
});

function hexToRgb(hex: string): readonly [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (m === null) throw new Error(`hexToRgb: ${hex} is not #rrggbb`);
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}
