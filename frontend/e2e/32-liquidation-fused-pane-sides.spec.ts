/**
 * `paineis-de-fluxo` `T-04.2` (plano `04` item `4.1`, parte `web`; `RF-10`; `[Q-LIQ-2]`, `SPEC-009`
 * §7.1) — O PANE DE LIQUIDAÇÃO FUNDIDO NO APP REAL, LIDO NO CANVAS, COM A ABLAÇÃO DO `scale_ref`.
 *
 * A página é a de produção (`next start` do build do portão), servida por um stub de API que devolve o
 * catálogo REAL da API de e2e e valores sintéticos — o mesmo arranjo do `e2e/24`, e pelo mesmo motivo:
 * **nada é semeado no Postgres compartilhado**. Os valores da liquidação são escolhidos para que a
 * IDENTIDADE da perna se leia no pixel sem depender da cor: `short` está na casa de `50.000`, `long` na
 * de `2..12`. Com o máximo compartilhado (`C-3`) e a escala log, a perna `short` sobe até o teto da
 * metade dela e a `long` fica em ~6–23% da sua. Então "qual perna está em cima" é "de que lado está a
 * barra alta", e isso sobrevive a um screenshot em cinza.
 *
 * ── O QUE O SPEC AFIRMA (desenho) ───────────────────────────────────────────────────────────────
 *
 *   (a) os lados vêm do registry: `short:up;long:down` na raiz da camada, e o grupo de cada coorte
 *       declara o seu; a escala de baixo foi aplicada INVERTIDA (lido de volta da biblioteca);
 *   (b) tinta do token de ALTA (`directionUpFill`) só ACIMA da linha do zero, a do token de BAIXA
 *       (`directionDownFill`) só ABAIXO — `0` pixel do lado errado —, cada uma em `>= 20` colunas;
 *   (c) as barras partem da linha do zero: a última linha de tinta de cima e a primeira de baixo
 *       ficam a `<= 2 px` dela (a coincidência exata das bases é o `F-6`, da `T-04.6`);
 *   (d) a barra ALTA (a `short`, pelo valor servido) está em cima: extensão de cima `> 2x` a de baixo.
 *
 * ── A ABLAÇÃO (`CA-LIQ`: *"Morde: trocar o `scale_ref` das duas pernas"*) ─────────────────────────
 *
 * `?e2eSwapLiquidationSides=1` troca os dois `scale_ref` do registry (`swappedLiquidationLegScaleRefs`)
 * e nada mais. O mesmo instrumento tem de REPROVAR o desenho: `short:down;long:up`, e a barra alta
 * (`short`) embaixo. A cor segue o LADO (`SPEC-009` §7.1: reverter a escolha é "uma troca de lado no
 * registry"), então sob a ablação o verde continua em cima — quem denuncia a troca é (a) e (d), e o
 * spec mostra que (d) do desenho é FALSO na página ablada.
 */

import http from "node:http";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { colorTokens } from "../src/charts/color-tokens.ts";
import { computeSeriesKeyId } from "../src/app/symbol/series-key-id.ts";
import type { SeriesKey } from "../src/features/s3-inspector/series-catalog.ts";
import { fact, sentimentoApiBaseUrl, startSecondaryNextInstance, type NextInstanceHandle } from "./helpers.ts";

const SPEC = "32-liquidation-fused-pane-sides";
const SYMBOL_PATH = "/symbol/BTCUSDT";
const CHART_HOST_TESTID = "symbol-chart-host";
const PANE_TESTID = "liquidation-pane";
const SWAP_QUERY = "e2eSwapLiquidationSides=1";
const ONE_MINUTE_MS = 60_000;
const INK_TOLERANCE = 12;
const MIN_COLUMNS = 20;
/** Rows of anti-aliasing allowed between a bar's base and the zero line the layout published. */
const BASE_SLACK_PX = 2;

interface CatalogEnvelope {
  readonly query: string;
  readonly n_entries: number;
  readonly entries: readonly { readonly key: SeriesKey; readonly [field: string]: unknown }[];
}

function wave(minute: number, salt: number): number {
  return (((minute * 37 + salt * 101) % 997) + 997) % 997;
}

/** The value of one series at one bucket. Every series of the page is served on every minute, so no
 * pane is empty; the two liquidation legs differ by four orders of magnitude on purpose. */
function syntheticValue(key: SeriesKey, bucketMs: number): string {
  const minute = Math.round(bucketMs / ONE_MINUTE_MS);
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
      return key.cohort === "short" ? String(50_000 + wave(minute, 5)) : String(2 + wave(minute, 4) / 100);
    case "sum_open_interest":
      return String(50_000 + wave(Math.floor(minute / 5) * 5, 6) / 4);
    case "count_long_short_ratio":
      return String(0.5 + wave(Math.floor(minute / 5) * 5, 7) / 512);
    default:
      return String(wave(minute, 9) / 4);
  }
}

interface StubHandle {
  readonly url: string;
  close(): Promise<void>;
}

async function startStub(catalog: CatalogEnvelope): Promise<StubHandle> {
  const keysById = new Map<string, SeriesKey>(catalog.entries.map((entry) => [computeSeriesKeyId(entry.key), entry.key]));
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
        response.end(`T-04.2 stub: bad request (${seriesKeyId || "no series_key_id"})`);
        return;
      }
      const rows: { event_time: number; available_at: number; value: string; absence: null; coverage: null }[] = [];
      for (let t = startMs; t <= endMsInclusive; t += ONE_MINUTE_MS) {
        rows.push({ event_time: t, available_at: t, value: syntheticValue(key, t), absence: null, coverage: null });
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          session: { principal_id: null, server_now_ms: Date.now() },
          panel: {
            series_key_id: seriesKeyId,
            source: "T-04.2-synthetic-values",
            nature: key.nature,
            unit: key.unit,
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
    response.end("T-04.2 stub: no route");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("T-04.2 stub: no port");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

function hexToRgb(hex: string): readonly [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (m === null) throw new Error(`hexToRgb: ${hex} is not #rrggbb`);
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

/** What the fused pane shows: the facts on its layer root and the ink of its canvases. */
interface PaneReading {
  readonly sides: string | null;
  readonly barScales: string | null;
  readonly legSides: Readonly<Record<string, string | null>>;
  readonly zeroLinePx: number;
  readonly paneHeightPx: number;
  readonly dpr: number;
  readonly up: InkStats;
  readonly down: InkStats;
}

interface InkStats {
  /** Pixels of this token, all canvases of the pane. */
  readonly pixels: number;
  /** Distinct pixel columns carrying this token. */
  readonly columns: number;
  readonly minRowCss: number | null;
  readonly maxRowCss: number | null;
  /** Pixels on the WRONG side of the zero line (up token below it, down token above it). */
  readonly wrongSide: number;
}

async function openAndRead(page: Page, baseUrl: string, query: string): Promise<PaneReading> {
  await page.mouse.move(2, 2);
  const response = await page.goto(`${baseUrl}${SYMBOL_PATH}${query === "" ? "" : `?${query}`}`, { waitUntil: "load" });
  expect(response?.ok(), `GET ${SYMBOL_PATH} não respondeu ok`).toBe(true);
  await expect(page.locator(`[data-testid="${CHART_HOST_TESTID}"]`)).toHaveAttribute("data-pane-layers", "anchored", {
    timeout: 120_000,
  });
  const pane = page.locator(`[data-testid="${PANE_TESTID}"]`);
  await expect(pane).toHaveCount(1);
  await expect(pane).toHaveAttribute("data-liquidation-zero-line-px", /^\d/);
  await page.waitForTimeout(1_500);
  return page.evaluate(
    ({ paneTestId, upInk, downInk, tol }) => {
      const layer = document.querySelector<HTMLElement>(`[data-testid="${paneTestId}"]`)!;
      const canvases = Array.from(layer.parentElement?.children ?? []).filter(
        (c): c is HTMLCanvasElement => c instanceof HTMLCanvasElement && c.width > 0 && c.height > 0,
      );
      const zeroLinePx = Number(layer.dataset.liquidationZeroLinePx);
      const dpr = canvases.length === 0 ? 1 : canvases[0]!.width / canvases[0]!.getBoundingClientRect().width;
      const zeroRow = zeroLinePx * dpr;
      const near = (data: Uint8ClampedArray, at: number, rgb: readonly number[]) =>
        Math.abs(data[at]! - rgb[0]!) <= tol && Math.abs(data[at + 1]! - rgb[1]!) <= tol && Math.abs(data[at + 2]! - rgb[2]!) <= tol;
      const stats = (rgb: readonly number[], wrongIsBelow: boolean) => {
        let pixels = 0;
        let wrongSide = 0;
        let minRow = Number.POSITIVE_INFINITY;
        let maxRow = Number.NEGATIVE_INFINITY;
        const columns = new Set<number>();
        for (const canvas of canvases) {
          const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
          for (let y = 0; y < canvas.height; y += 1) {
            for (let x = 0; x < canvas.width; x += 1) {
              const at = (y * canvas.width + x) * 4;
              if (data[at + 3] === 0 || !near(data, at, rgb)) continue;
              pixels += 1;
              columns.add(x);
              minRow = Math.min(minRow, y);
              maxRow = Math.max(maxRow, y);
              // One device row of slack each way: the two bases are ADJACENT rows (`T-04.0` §2.1).
              if (wrongIsBelow ? y > zeroRow + dpr : y < zeroRow - dpr) wrongSide += 1;
            }
          }
        }
        return {
          pixels,
          columns: columns.size,
          minRowCss: pixels === 0 ? null : minRow / dpr,
          maxRowCss: pixels === 0 ? null : maxRow / dpr,
          wrongSide,
        };
      };
      const legSides: Record<string, string | null> = {};
      for (const group of Array.from(layer.querySelectorAll<HTMLElement>('[data-testid^="liquidation-cohort-"]'))) {
        legSides[(group.dataset.testid ?? "").replace("liquidation-cohort-", "")] = group.dataset.liquidationSide ?? null;
      }
      return {
        sides: layer.dataset.liquidationSides ?? null,
        barScales: layer.dataset.liquidationBarScales ?? null,
        legSides,
        zeroLinePx,
        paneHeightPx: Number(layer.dataset.paneHeightPx),
        dpr,
        up: stats(upInk, true),
        down: stats(downInk, false),
      };
    },
    {
      paneTestId: PANE_TESTID,
      upInk: [...hexToRgb(colorTokens().directionUpFill)],
      downInk: [...hexToRgb(colorTokens().directionDownFill)],
      tol: INK_TOLERANCE,
    },
  );
}

/** How far each side's ink reaches from the zero line, CSS px. */
function extents(reading: PaneReading): { readonly up: number; readonly down: number } {
  return {
    up: reading.up.minRowCss === null ? 0 : reading.zeroLinePx - reading.up.minRowCss,
    down: reading.down.maxRowCss === null ? 0 : reading.down.maxRowCss - reading.zeroLinePx,
  };
}

/** Criterion (d): the TALL leg — `short`, by the value the stub serves — is the one above the zero. */
function shortIsAbove(reading: PaneReading): boolean {
  const reach = extents(reading);
  return reach.up > 2 * reach.down;
}

test.use({ viewport: { width: 1280, height: 1200 } });

test.describe(`T-04.2: o pane de liquidação fundido, short em cima (alta), long embaixo (baixa) (${SPEC})`, () => {
  let stub: StubHandle | undefined;
  let instance: NextInstanceHandle | undefined;

  test.beforeAll(async () => {
    const response = await fetch(`${sentimentoApiBaseUrl()}/series-catalog`);
    if (!response.ok) throw new Error(`GET /series-catalog on the e2e API answered ${response.status}`);
    const catalog = (await response.json()) as CatalogEnvelope;
    fact(SPEC, "real_catalog_entries", catalog.entries.length);
    stub = await startStub(catalog);
    instance = await startSecondaryNextInstance({ INGEST_HEALTH_API_BASE_URL: stub.url });
  });

  test.afterAll(async () => {
    if (instance !== undefined) await instance.close();
    if (stub !== undefined) await stub.close();
  });

  test("desenho: short acima do zero no token de alta, long abaixo no de baixa, lado vindo do registry", async ({ page }) => {
    const reading = await openAndRead(page, instance!.baseUrl, "");
    fact(SPEC, "design_reading", reading);
    fact(SPEC, "design_extents", extents(reading));

    // (a) the sides are the registry's, on the layer and on each cohort group; the lower scale is inverted
    expect(reading.sides, "(a) os lados não são os do registry").toBe("short:up;long:down");
    expect(reading.legSides, "(a) cada coorte declara o seu lado").toEqual({ short: "up", long: "down" });
    expect(reading.barScales, "(a) a escala de baixo não foi aplicada invertida").toBe("up:upright:logarithmic;down:inverted:logarithmic");
    expect(reading.zeroLinePx).toBeGreaterThan(0);
    expect(reading.zeroLinePx).toBeLessThan(reading.paneHeightPx);

    // (b) each token on its own side of the zero line, in >= 20 columns
    expect(reading.up.columns, "(b) poucas colunas com tinta de alta — o instrumento está cego").toBeGreaterThanOrEqual(MIN_COLUMNS);
    expect(reading.down.columns, "(b) poucas colunas com tinta de baixa — o instrumento está cego").toBeGreaterThanOrEqual(MIN_COLUMNS);
    expect(reading.up.wrongSide, "(b) tinta de ALTA abaixo da linha do zero").toBe(0);
    expect(reading.down.wrongSide, "(b) tinta de BAIXA acima da linha do zero").toBe(0);

    // (c) the bars start at the zero line
    expect(reading.up.maxRowCss!, "(c) a barra de cima não parte do zero").toBeGreaterThanOrEqual(reading.zeroLinePx - BASE_SLACK_PX);
    expect(reading.down.minRowCss!, "(c) a barra de baixo não parte do zero").toBeLessThanOrEqual(reading.zeroLinePx + BASE_SLACK_PX);

    // (d) the tall leg (short) is the upper one
    expect(shortIsAbove(reading), "(d) a barra alta (short) não está em cima").toBe(true);
  });

  test("ablação: trocar o scale_ref das duas pernas REPROVA o desenho", async ({ page }) => {
    const reading = await openAndRead(page, instance!.baseUrl, SWAP_QUERY);
    fact(SPEC, "ablation_reading", reading);
    fact(SPEC, "ablation_extents", extents(reading));

    // The instrument still sees both sides (the ablation moved the legs, it did not blank the pane).
    expect(reading.up.columns).toBeGreaterThanOrEqual(MIN_COLUMNS);
    expect(reading.down.columns).toBeGreaterThanOrEqual(MIN_COLUMNS);
    // What the swap changes, and the two criteria of the design that catch it:
    expect(reading.sides, "a ablação não chegou à página").toBe("short:down;long:up");
    expect(reading.legSides).toEqual({ short: "down", long: "up" });
    expect(shortIsAbove(reading), "MORDE: com os scale_ref trocados, (d) do desenho tinha de reprovar").toBe(false);
    const reach = extents(reading);
    expect(reach.down, "a barra alta (short) foi para baixo").toBeGreaterThan(2 * reach.up);
  });
});
