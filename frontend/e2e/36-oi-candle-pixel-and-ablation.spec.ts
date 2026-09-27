import http from "node:http";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { colorTokens } from "../src/charts/color-tokens.ts";
import { computeSeriesKeyId } from "../src/app/symbol/series-key-id.ts";
import type { SeriesKey } from "../src/features/s3-inspector/series-catalog.ts";
import { fact, sentimentoApiBaseUrl, startSecondaryNextInstance, type NextInstanceHandle } from "./helpers.ts";

/**
 * `paineis-de-fluxo` `T-03.11` (plan `03` item `3b.4`, `DoD-6` of `03b`, `RF-8`, `RF-9`, `RN-6`) —
 * the OI pane as a CANDLESTICK, read off the canvas of the real app (`next start`, a secondary
 * instance), with the ablation `DoD-6` names: *"ao trocar a fonte do pane de volta para `line`, o
 * candle some"* (`?e2eOiLine=1` mounts the pane as the `line` it was, `pane-registry.ts::oiPaneSeriesKind`).
 *
 *   PX-1  design: the OI pane's canvas carries columns of the candle's UP ink and of its DOWN ink
 *         (`candlestickSeriesColors()`: up = hollow body with `directionUpFill` border/wick, down =
 *         `directionDownFill` body), and `data-oi-series-kind="candlestick"`.
 *   PX-2  ablation: under `?e2eOiLine=1` those columns are GONE (0 up, 0 down) and the line's ink
 *         (`provenanceStrong`) is there — so PX-1 reads the candle, not something else in the pane.
 *   PX-3  colour by CONTRACTS (`CA-7`, `DoD-3`'s morde "colorir pelo preço"): the stub makes the
 *         OI direction the OPPOSITE of the price direction on EVERY bucket (3 of 4 OI candles up, 3 of
 *         4 price candles down). The OI pane must be up-dominant; coloured by price it would be
 *         down-dominant. The price pane is the positive control (down-dominant).
 *   PX-4  `RN-6`: the legend's O·H·L·C is a candle the stub SERVED, and its `DERIVADO` label names
 *         the native grid of the source of THAT candle — `5m` before the capture boundary, `1m`
 *         after it, both seen by hovering the OI pane.
 *
 * ── WHY A LOCAL STUB ─────────────────────────────────────────────────────────────────────────
 *
 * Same posture as `e2e/24`: the CATALOG is the real one, read once from the e2e API; only the
 * values are synthetic. Nothing is written to Postgres (`memory: nao-seedar-teste-no-postgres`).
 *
 * Run with: `E2E_API_PORT=… E2E_NEXT_PORT=… make e2e` (or `npx playwright test 36-oi-candle`).
 */

const SPEC = "36-oi-candle-pixel-and-ablation";
const SYMBOL = "BTCUSDT";
const SYMBOL_PATH = `/symbol/${SYMBOL}`;
const CHART_HOST_TESTID = "symbol-chart-host";
const OI_PANE_TESTID = "oi-pane";
const PRICE_PANE_TESTID = "price-pane";
const ONE_MINUTE_MS = 60_000;
const FIVE_MINUTES_MS = 300_000;
const INK_TOLERANCE = 12;
/** Before this instant the OI candles are `5m` of `openInterestHist`; from it on, `1m` of polling. */
const CAPTURE_MS = Math.floor(Date.now() / FIVE_MINUTES_MS) * FIVE_MINUTES_MS - 25 * ONE_MINUTE_MS;

interface CatalogEnvelope {
  readonly query: string;
  readonly n_entries: number;
  readonly entries: readonly { readonly key: SeriesKey; readonly [field: string]: unknown }[];
}

type OiSource = "binance_point_5m" | "binance_poll_1m";

interface StubOiCandle {
  readonly bucket_end_ms: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly open_at_ms: number;
  readonly close_at_ms: number;
  readonly samples: { readonly present: number; readonly expected: number };
  readonly closed: boolean;
  readonly derived_from: OiSource;
}

/** OI rises on 3 of every 4 buckets; the price FALLS on those same buckets (and vice-versa). */
function oiRisesAt(t: number): boolean {
  return Math.round(t / ONE_MINUTE_MS) % 4 !== 0;
}

function syntheticOiCandle(t: number, knowledgeTimeMs: number): StubOiCandle | null {
  const polled = t >= CAPTURE_MS;
  if (!polled && t % FIVE_MINUTES_MS !== 0) return null;
  const width = polled ? ONE_MINUTE_MS : FIVE_MINUTES_MS;
  const base = 50_000 + (Math.round(t / ONE_MINUTE_MS) % 7) * 8;
  const up = oiRisesAt(t);
  return {
    bucket_end_ms: t,
    open: up ? base : base + 40,
    high: base + 50,
    low: base - 10,
    close: up ? base + 40 : base,
    open_at_ms: t - width,
    close_at_ms: t,
    samples: { present: 2, expected: 2 },
    closed: t <= knowledgeTimeMs,
    derived_from: polled ? "binance_poll_1m" : "binance_point_5m",
  };
}

function syntheticValue(key: SeriesKey, t: number): string {
  const minute = Math.round(t / ONE_MINUTE_MS);
  switch (key.metric) {
    case "klines_ohlc": {
      const open = 100 + (minute % 5);
      const close = oiRisesAt(t) ? open - 2 : open + 2; // the price goes the OTHER way
      if (key.reduction === "OPEN") return String(open);
      if (key.reduction === "HIGH") return String(Math.max(open, close) + 0.5);
      if (key.reduction === "LOW") return String(Math.min(open, close) - 0.5);
      return String(close);
    }
    case "sum_open_interest":
      return String(syntheticOiCandle(Math.floor(t / FIVE_MINUTES_MS) * FIVE_MINUTES_MS, Number.POSITIVE_INFINITY)!.close);
    case "cvd_source":
      return String((minute % 11) - 5);
    case "sum_liquidation":
      return String(1 + (minute % 9));
    case "count_long_short_ratio":
      return String(0.5 + (minute % 13) / 512);
    default:
      return String(10 + (minute % 17));
  }
}

interface StubHandle {
  readonly url: string;
  /** Every OI candle the stub served, by `bucket_end_ms`. */
  readonly oiCandles: Map<number, StubOiCandle>;
  /** The direction of every price candle the stub served, by bucket ms. */
  readonly priceUp: Map<number, boolean>;
  close(): Promise<void>;
}

async function startStub(catalog: CatalogEnvelope): Promise<StubHandle> {
  const keysById = new Map(catalog.entries.map((entry) => [computeSeriesKeyId(entry.key), entry.key]));
  const oiCandles = new Map<number, StubOiCandle>();
  const priceUp = new Map<number, boolean>();
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
      const knowledgeParam = Number(incoming.searchParams.get("knowledge_time_ms"));
      const knowledge = Number.isFinite(knowledgeParam) ? knowledgeParam : Date.now();
      const seriesKeyId = incoming.searchParams.get("series_key_id") ?? "";
      const key = keysById.get(seriesKeyId);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMsInclusive) || key === undefined) {
        response.writeHead(400, { "content-type": "text/plain" });
        response.end(`T-03.11 stub: bad request (${seriesKeyId || "no series_key_id"})`);
        return;
      }
      const rows: { event_time: number; available_at: number; value: string; absence: null; coverage: null }[] = [];
      const candles: StubOiCandle[] = [];
      for (let t = startMs; t <= endMsInclusive; t += ONE_MINUTE_MS) {
        rows.push({ event_time: t, available_at: t, value: syntheticValue(key, t), absence: null, coverage: null });
        if (key.metric === "klines_ohlc") priceUp.set(t, !oiRisesAt(t));
        if (key.metric === "sum_open_interest") {
          const candle = syntheticOiCandle(t, knowledge);
          if (candle !== null) {
            candles.push(candle);
            oiCandles.set(t, candle);
          }
        }
      }
      const oiBlock =
        key.metric === "sum_open_interest"
          ? {
              timeframe_ms: ONE_MINUTE_MS,
              sources: [
                { derived_from: "binance_point_5m", series_key_id: seriesKeyId, native_grid_ms: FIVE_MINUTES_MS, bucket_interval_ms: FIVE_MINUTES_MS },
                { derived_from: "binance_poll_1m", series_key_id: "t-03-11-stub-poll", native_grid_ms: ONE_MINUTE_MS, bucket_interval_ms: ONE_MINUTE_MS },
              ],
              candles,
            }
          : null;
      const envelope = {
        session: { principal_id: null, server_now_ms: Date.now() },
        panel: {
          series_key_id: seriesKeyId,
          source: "T-03.11-synthetic-values",
          nature: key.nature,
          unit: key.unit,
          coverage: { earliest_bucket_ms: null, latest_bucket_ms: null, source_floor_ms: null },
        },
        rows,
        oi_candles: oiBlock,
        knowledge_time: knowledge,
        bar_policy: "final_only",
      };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(envelope));
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("T-03.11 stub: no route");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("T-03.11 stub: no port");
  return {
    url: `http://127.0.0.1:${address.port}`,
    oiCandles,
    priceUp,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

function hexToRgb(hex: string): readonly [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (m === null) throw new Error(`hexToRgb: ${hex} is not #rrggbb`);
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

async function openSymbol(page: Page, baseUrl: string, query = ""): Promise<void> {
  await page.mouse.move(2, 2);
  const response = await page.goto(`${baseUrl}${SYMBOL_PATH}${query}`, { waitUntil: "load" });
  expect(response?.ok(), `GET ${SYMBOL_PATH}${query} não respondeu ok`).toBe(true);
  await expect(page.locator(".tv-lightweight-charts").first()).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(2_000);
}

interface PaneInk {
  readonly canvases: number;
  readonly upColumns: number;
  readonly downColumns: number;
  readonly lineInk: number;
  readonly seriesKind: string | null;
  readonly drawnCandles: number;
}

/** Columns of the pane's canvases carrying the candle's up ink / down ink, and the line's ink. A
 * COLUMN count and not a pixel count: the up body is hollow (border + wick) and the down body is
 * filled, so pixels would weigh a down candle several times an up one; a column is one per x. */
async function readPaneInk(page: Page, testId: string): Promise<PaneInk> {
  const tokens = colorTokens();
  return page.evaluate(
    ({ testId, up, down, line, tol }) => {
      const layer = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
      if (layer === null) return { canvases: 0, upColumns: -1, downColumns: -1, lineInk: -1, seriesKind: null, drawnCandles: -1 };
      const canvases = Array.from(layer.parentElement?.children ?? []).filter((c): c is HTMLCanvasElement => c instanceof HTMLCanvasElement);
      const near = (data: Uint8ClampedArray, at: number, rgb: readonly number[]) =>
        Math.abs(data[at]! - rgb[0]!) <= tol && Math.abs(data[at + 1]! - rgb[1]!) <= tol && Math.abs(data[at + 2]! - rgb[2]!) <= tol;
      const upCols = new Set<number>();
      const downCols = new Set<number>();
      let lineInk = 0;
      for (const canvas of canvases) {
        const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let at = 0; at < data.length; at += 4) {
          if (data[at + 3] === 0) continue;
          const x = (at / 4) % canvas.width;
          if (near(data, at, up)) upCols.add(x);
          else if (near(data, at, down)) downCols.add(x);
          else if (near(data, at, line)) lineInk += 1;
        }
      }
      return {
        canvases: canvases.length,
        upColumns: upCols.size,
        downColumns: downCols.size,
        lineInk,
        seriesKind: layer.getAttribute("data-oi-series-kind"),
        drawnCandles: Number(layer.getAttribute("data-oi-candles") ?? Number.NaN),
      };
    },
    {
      testId,
      up: hexToRgb(tokens.directionUpFill),
      down: hexToRgb(tokens.directionDownFill),
      line: hexToRgb(tokens.provenanceStrong),
      tol: INK_TOLERANCE,
    },
  );
}

interface OiLegendDom {
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly derivedFrom: string;
  readonly fact: string;
  readonly label: string;
  readonly bucketMs: number;
}

async function readOiLegend(page: Page): Promise<OiLegendDom> {
  return page.evaluate(() => {
    const node = document.querySelector<HTMLElement>('[data-legend-ohlc="oi"]');
    const num = (raw: string | undefined | null) => (raw === undefined || raw === null || raw === "" ? Number.NaN : Number(raw));
    const labelNode = node?.querySelector<HTMLElement>('[data-fact^="oi_candle_provenance:"]');
    return {
      open: num(node?.dataset.legendOpen),
      high: num(node?.dataset.legendHigh),
      low: num(node?.dataset.legendLow),
      close: num(node?.dataset.legendClose),
      derivedFrom: node?.dataset.legendDerivedFrom ?? "",
      fact: labelNode?.dataset.fact ?? "",
      label: labelNode?.textContent?.trim() ?? "",
      bucketMs: num(node?.querySelector<HTMLElement>('[data-legend-value="oi"]')?.dataset.legendBucketMs),
    };
  });
}

const EXPECTED_LABEL: Readonly<Record<OiSource, string>> = {
  binance_point_5m: "DERIVADO (OHLC de amostras 5m · ADR-045)",
  binance_poll_1m: "DERIVADO (OHLC de amostras 1m · ADR-045)",
};

/** The served candle the legend's four numbers are — `undefined` when they are no served candle. */
function servedCandleOf(stub: StubHandle, legend: OiLegendDom): StubOiCandle | undefined {
  return [...stub.oiCandles.values()].find(
    (candle) =>
      candle.open === legend.open &&
      candle.high === legend.high &&
      candle.low === legend.low &&
      candle.close === legend.close &&
      candle.derived_from === legend.derivedFrom &&
      candle.bucket_end_ms <= legend.bucketMs &&
      legend.bucketMs < candle.bucket_end_ms + (candle.derived_from === "binance_point_5m" ? FIVE_MINUTES_MS : ONE_MINUTE_MS),
  );
}

test.use({ viewport: { width: 1280, height: 1200 } });

test.describe(`T-03.11: pane de OI em candlestick, com ablação para line (${SPEC})`, () => {
  let stub: StubHandle;
  let instance: NextInstanceHandle | undefined;

  test.beforeAll(async () => {
    const response = await fetch(`${sentimentoApiBaseUrl()}/series-catalog`);
    if (!response.ok) throw new Error(`GET /series-catalog on the e2e API answered ${response.status}`);
    const catalog = (await response.json()) as CatalogEnvelope;
    fact(SPEC, "real_catalog_entries", catalog.entries.length);
    fact(SPEC, "capture_ms", CAPTURE_MS);
    stub = await startStub(catalog);
    instance = await startSecondaryNextInstance({ INGEST_HEALTH_API_BASE_URL: stub.url });
  });

  test.afterAll(async () => {
    if (instance !== undefined) await instance.close();
    if (stub !== undefined) await stub.close();
  });

  test("PX-1 + PX-3: candles of contracts on the canvas, coloured by the OI's own direction", async ({ page }) => {
    await openSymbol(page, instance!.baseUrl);
    const oi = await readPaneInk(page, OI_PANE_TESTID);
    const price = await readPaneInk(page, PRICE_PANE_TESTID);
    fact(SPEC, "design_oi_ink", oi);
    fact(SPEC, "design_price_ink", price);
    expect(oi.canvases, "o instrumento está cego: nenhum canvas no pane de OI").toBeGreaterThan(0);
    expect(oi.seriesKind, "o pane de OI não montou o kind do registry").toBe("candlestick");
    expect(oi.drawnCandles, "nenhuma vela de OI chegou ao setData").toBeGreaterThan(0);
    expect(oi.upColumns, "PX-1: nenhuma coluna de vela de alta no pane de OI").toBeGreaterThan(0);
    expect(oi.downColumns, "PX-1: nenhuma coluna de vela de baixa no pane de OI").toBeGreaterThan(0);

    // PX-3: the stub diverges on EVERY bucket — not inconclusive (DoD-3 needs at least one).
    const divergent = [...stub.oiCandles.values()].filter((candle) => {
      const priceUp = stub.priceUp.get(candle.bucket_end_ms);
      return priceUp !== undefined && priceUp !== candle.close > candle.open;
    }).length;
    fact(SPEC, "divergent_buckets", { divergent, served: stub.oiCandles.size });
    expect(divergent, "CA-7 inconclusivo: nenhum balde com sinais de preço e de OI divergentes").toBeGreaterThan(0);
    expect(oi.upColumns, "PX-3: o pane de OI não é dominado pela alta dos CONTRATOS (colorido pelo preço?)").toBeGreaterThan(
      oi.downColumns,
    );
    expect(price.downColumns, "controle PX-3: o pane de preço deveria ser dominado pela baixa").toBeGreaterThan(price.upColumns);
  });

  test("PX-2: sob ?e2eOiLine=1 (a fonte de volta para line) o candle SOME e a linha aparece", async ({ page }) => {
    await openSymbol(page, instance!.baseUrl, "?e2eOiLine=1");
    const oi = await readPaneInk(page, OI_PANE_TESTID);
    fact(SPEC, "ablation_oi_ink", oi);
    expect(oi.canvases).toBeGreaterThan(0);
    expect(oi.seriesKind, "a ablação não chegou ao pane").toBe("line");
    expect(oi.upColumns, "PX-2: tinta de vela de alta sobreviveu à ablação").toBe(0);
    expect(oi.downColumns, "PX-2: tinta de vela de baixa sobreviveu à ablação").toBe(0);
    expect(oi.lineInk, "PX-2: a linha da ablação não desenhou nada — o controle está cego").toBeGreaterThan(0);
  });

  test("PX-4: a legenda O·H·L·C é uma vela servida, e o rótulo DERIVADO segue o derived_from dela", async ({ page }) => {
    await openSymbol(page, instance!.baseUrl);
    const atRest = await readOiLegend(page);
    fact(SPEC, "legend_at_rest", atRest);
    const restCandle = servedCandleOf(stub, atRest);
    expect(restCandle, "sem hover: O·H·L·C da legenda não é uma vela servida").toBeDefined();
    expect(atRest.label).toBe(EXPECTED_LABEL[restCandle!.derived_from]);
    expect(atRest.fact).toBe(`oi_candle_provenance:${restCandle!.derived_from}`);

    const host = page.locator(`[data-testid="${CHART_HOST_TESTID}"]`);
    const from = Number(await host.getAttribute("data-visible-logical-from"));
    const to = Number(await host.getAttribute("data-visible-logical-to"));
    const windowStartMs = Number(await page.locator("main[data-window-start-ms]").getAttribute("data-window-start-ms"));
    const box = (await page.locator(`[data-testid="${OI_PANE_TESTID}"]`).boundingBox())!;
    const captureLogical = (CAPTURE_MS - windowStartMs) / ONE_MINUTE_MS;
    fact(SPEC, "visible_range", { from, to, windowStartMs, captureLogical });
    expect(captureLogical - 12, "a fronteira da captura não está na faixa visível").toBeGreaterThan(from);
    expect(captureLogical + 8, "a fronteira da captura não está na faixa visível").toBeLessThan(to);
    const seen = new Set<string>();
    for (const offset of [-12, -9, -6, 3, 6, 8]) {
      const logical = captureLogical + offset;
      const x = box.x + ((logical - from) / (to - from)) * box.width;
      await page.mouse.move(x, box.y + box.height * 0.5, { steps: 5 });
      await page.waitForTimeout(150);
      const legend = await readOiLegend(page);
      fact(SPEC, `legend_hover_${offset}`, { x, logical, legend });
      const served = servedCandleOf(stub, legend);
      expect(served, `hover ${offset}: O·H·L·C da legenda não é uma vela servida`).toBeDefined();
      expect(legend.label, `hover ${offset}: rótulo não derivado do derived_from da vela`).toBe(EXPECTED_LABEL[served!.derived_from]);
      expect(legend.fact).toBe(`oi_candle_provenance:${served!.derived_from}`);
      seen.add(served!.derived_from);
    }
    expect([...seen].sort(), "PX-4: o hover não viu os dois regimes").toEqual(["binance_point_5m", "binance_poll_1m"]);
  });
});
