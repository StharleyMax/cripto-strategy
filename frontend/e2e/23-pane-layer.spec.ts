import http from "node:http";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { colorTokens, dojiItemColors } from "../src/charts/color-tokens.ts";
import { fact, startSecondaryNextInstance, type NextInstanceHandle } from "./helpers.ts";

/**
 * `paineis-de-fluxo` `T-01.6` (plan `01` item `1.5`, `RF-4`, `CA-12`, `[Q-DG-1]`; gate r2 `C-4`,
 * `C-5`, `C-6`) — A CAMADA DE DOM POR PANE, MEDIDA NO RENDER.
 *
 * ── O QUE ESTE SPEC AFIRMA, CADA UM SOBRE A PÁGINA REAL ───────────────────────────────────────
 *
 *   (a) UM gráfico, e as 6 raízes de camada (`data-pane-legend` → pai) DENTRO dele, uma por pane,
 *       com `pointer-events: none` computado e altura de pane `>= 72px` (o piso).
 *   (b) `C-6`: 5 separadores (`td[colspan="3"]`) com fundo `rgb(139, 148, 158)` (`#8b949e`,
 *       `provenanceWeak`) e SEM a alça de arrasto (`enableResize = false`).
 *   (c) `scaleMargins.top` reserva a legenda: em cada pane, o topo da escala lido de volta da
 *       biblioteca fica em/abaixo do fundo MEDIDO da legenda; e no pane de preço, ZERO pixel de
 *       vela na faixa da legenda — com tinta de vela > 0 no resto do pane (o instrumento não é cego).
 *   (d) `C-5`: um `<button>` injetado na camada continua clicável (é o `elementFromPoint` do próprio
 *       centro, e o clique chega) e alcançável por Tab; um `<span>` no mesmo lugar NÃO recebe o
 *       ponteiro (ablação: sem ela, "clicável" não distinguiria nada). Hoje NENHUM filho interativo
 *       existe nas camadas (`grep -nE '<(a|button)[ >]'` dentro dos panes → 0), por isso a sonda.
 *   (e) `C-4`: o modo está explícito no chrome (`data-fact="chrome_mode:as_of"`).
 *
 * **Morde** (rodado à mão na construção, resultado em `gates/T-01.6-builder.md`): tirar o bloco
 * `panes` de `chart-options.ts` reprova (b); não aplicar a reserva `belowLegend` reprova (c).
 *
 * ── POR QUE UM ESTOQUE SINTÉTICO PRÓPRIO (receita de `22-*.spec.ts`, cópia própria) ───────────
 *
 * O universo fraco de `make e2e` não serve `/series-history`, e sem vela não há o que medir sob a
 * legenda. Um `http.createServer` LOCAL responde o catálogo `klines_ohlc` e um valor por minuto —
 * nenhum `INSERT`, nenhum Postgres tocado. Os quatro `reduction` recebem o MESMO valor, então toda
 * vela é doji, pintada com `dojiItemColors().color`; é essa a tinta contada em (c). Sem volume no
 * catálogo, nada mais neste canvas usa essa cor.
 *
 * Run with: `E2E_API_PORT=… E2E_NEXT_PORT=… make e2e` (ou `npx playwright test 23-pane-layer`).
 */

const SPEC = "23-pane-layer";
const SYMBOL = "BTCUSDT";
const SYMBOL_PATH = `/symbol/${SYMBOL}`;
const CHART_HOST_TESTID = "symbol-chart-host";
const PRICE_PANE_TESTID = "price-pane";
const EXPECTED_PANES = 6;
const PANE_FLOOR_PX = 72;
const ONE_MINUTE_MS = 60_000;
const OHLC_REDUCTIONS = ["OPEN", "HIGH", "LOW", "CLOSE"] as const;
const INK_TOLERANCE = 12;

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
      verifiedBy: "T-01.6-synthetic-stub",
    },
    nativeGrid: "1m",
    maxStalenessMs: 600_000,
    priceUse: null,
    reconstructedFrom: null,
    publishedError: null,
  }));
  return { query: "series_catalog", n_entries: entries.length, entries };
}

async function startSyntheticOhlcStub(): Promise<{ readonly url: string; close(): Promise<void> }> {
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
        const value = 100 + (t % 1_000_000) / 100_000;
        rows.push({ event_time: t, available_at: t, value: value.toFixed(4), absence: null, coverage: null });
      }
      const envelope = {
        session: { principal_id: null, server_now_ms: Date.now() },
        panel: {
          series_key_id: seriesKeyId,
          source: "T-01.6-synthetic-stub",
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

function hexToRgb(hex: string): readonly [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (m === null) throw new Error(`hexToRgb: ${hex} is not #rrggbb`);
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

interface LayerReading {
  readonly testId: string | null;
  readonly insideChart: boolean;
  readonly pointerEvents: string;
  readonly paneHeightPx: number;
  readonly legendBottomPx: number;
  readonly reservedScaleTopPx: number;
  readonly legendReserve: string | null;
}

async function readLayers(page: Page): Promise<LayerReading[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("[data-pane-legend]")).map((legend) => {
      const root = legend.parentElement!;
      const num = (raw: string | undefined) => (raw === undefined || raw === "" ? Number.NaN : Number(raw));
      return {
        testId: root.getAttribute("data-testid"),
        insideChart: root.closest(".tv-lightweight-charts") !== null,
        pointerEvents: getComputedStyle(root).pointerEvents,
        paneHeightPx: num(root.dataset.paneHeightPx),
        legendBottomPx: num(root.dataset.legendBottomPx),
        reservedScaleTopPx: num(root.dataset.reservedScaleTopPx),
        legendReserve: root.dataset.legendReserve ?? null,
      };
    }),
  );
}

/** Candle ink (the doji colour) in the price pane's canvases, split at the legend's measured bottom. */
async function measureInkAroundPriceLegend(
  page: Page,
): Promise<{
  readonly underLegend: number;
  readonly belowLegend: number;
  readonly legendBottomBitmapPx: number;
  readonly topInkCssPx: number | null;
}> {
  const ink = hexToRgb(dojiItemColors().color);
  return page.evaluate(
    ({ testid, ink: rgb, tol }) => {
      const layer = document.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
      if (layer === null) throw new Error(`no [data-testid="${testid}"]`);
      const wrapper = layer.parentElement!;
      const legend = layer.querySelector<HTMLElement>("[data-pane-legend]");
      if (legend === null) throw new Error("the price layer has no legend");
      const canvases = Array.from(wrapper.children).filter((c): c is HTMLCanvasElement => c instanceof HTMLCanvasElement);
      if (canvases.length === 0) throw new Error("the price layer is not beside the pane canvases — not anchored");
      let underLegend = 0;
      let belowLegend = 0;
      let legendBottomBitmapPx = 0;
      let topInkCssPx: number | null = null;
      for (const canvas of canvases) {
        const box = canvas.getBoundingClientRect();
        const scale = canvas.width / box.width;
        const cut = Math.ceil((legend.getBoundingClientRect().bottom - box.top) * scale);
        legendBottomBitmapPx = cut;
        const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let y = 0; y < canvas.height; y += 1) {
          for (let x = 0; x < canvas.width; x += 1) {
            const at = (y * canvas.width + x) * 4;
            if (data[at + 3] === 0) continue;
            const hit =
              Math.abs(data[at]! - rgb[0]) <= tol &&
              Math.abs(data[at + 1]! - rgb[1]) <= tol &&
              Math.abs(data[at + 2]! - rgb[2]) <= tol;
            if (!hit) continue;
            if (y < cut) underLegend += 1;
            else belowLegend += 1;
            const cssY = y / scale;
            if (topInkCssPx === null || cssY < topInkCssPx) topInkCssPx = cssY;
          }
        }
      }
      return { underLegend, belowLegend, legendBottomBitmapPx, topInkCssPx };
    },
    { testid: PRICE_PANE_TESTID, ink: [...ink], tol: INK_TOLERANCE },
  );
}

test(`T-01.6: a camada de DOM por pane, o separador testado e a reserva da legenda, no render (${SPEC})`, async ({ page }) => {
  const stub = await startSyntheticOhlcStub();
  let instance: NextInstanceHandle | undefined;
  try {
    instance = await startSecondaryNextInstance({ INGEST_HEALTH_API_BASE_URL: stub.url });
    const response = await page.goto(`${instance.baseUrl}${SYMBOL_PATH}`, { waitUntil: "load" });
    expect(response?.ok(), `GET ${SYMBOL_PATH} não respondeu ok`).toBe(true);
    await expect(page.locator(`[data-testid="${CHART_HOST_TESTID}"]`)).toHaveAttribute("data-pane-layers", "anchored", {
      timeout: 120_000,
    });
    await page.waitForTimeout(2_000);

    // ── (a) one chart, six anchored layers, pointer-events none, the floor ────────────────────
    const chartCount = await page.locator(".tv-lightweight-charts").count();
    fact(SPEC, "tv_lightweight_charts_count", chartCount);
    expect(chartCount).toBe(1);
    const anchorFrames = await page.locator(`[data-testid="${CHART_HOST_TESTID}"]`).getAttribute("data-pane-anchor-frames");
    fact(SPEC, "pane_anchor_frames", anchorFrames);
    const layers = await readLayers(page);
    fact(SPEC, "layers", layers);
    expect(layers.map((l) => l.testId)).toEqual([
      "price-pane",
      "liquidation-cohort-long",
      "liquidation-cohort-short",
      "oi-pane",
      "long-short-pane",
      "cvd-pane",
    ]);
    expect(layers).toHaveLength(EXPECTED_PANES);
    for (const layer of layers) {
      expect(layer.insideChart, `${layer.testId}: a camada não está dentro do gráfico`).toBe(true);
      expect(layer.pointerEvents, `${layer.testId}: a camada intercepta o ponteiro`).toBe("none");
      expect(layer.paneHeightPx, `${layer.testId}: pane abaixo do piso`).toBeGreaterThanOrEqual(PANE_FLOOR_PX);
    }

    // ── (b) C-6: the separators ─────────────────────────────────────────────────────────────
    const separators = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLTableCellElement>('.tv-lightweight-charts td[colspan="3"]')).map((td) => ({
        background: getComputedStyle(td).backgroundColor,
        heightPx: td.getBoundingClientRect().height,
        handles: td.children.length,
      })),
    );
    fact(SPEC, "separators", separators);
    const [r, g, b] = hexToRgb(colorTokens().provenanceWeak);
    expect(separators).toHaveLength(EXPECTED_PANES - 1);
    for (const separator of separators) {
      expect(separator.background, "C-6: o separador não é o token provenanceWeak").toBe(`rgb(${r}, ${g}, ${b})`);
      expect(separator.handles, "enableResize=false: não pode haver alça de arrasto").toBe(0);
    }

    // ── (c) the legend reserve, read back from the library, and in pixels ──────────────────
    for (const layer of layers) {
      expect(layer.legendReserve, `${layer.testId}: reserva não aplicada`).toBe("margins");
      expect(
        layer.reservedScaleTopPx,
        `${layer.testId}: o topo da escala (${layer.reservedScaleTopPx}px) está acima do fundo da legenda (${layer.legendBottomPx}px)`,
      ).toBeGreaterThanOrEqual(layer.legendBottomPx);
    }
    const drawn = Number((await page.locator(`[data-testid="${PRICE_PANE_TESTID}"]`).getAttribute("data-price-candles")) ?? "0");
    fact(SPEC, "price_candles_drawn", drawn);
    expect(drawn, "o stub não produziu vela — nada a medir sob a legenda").toBeGreaterThan(0);
    const ink = await measureInkAroundPriceLegend(page);
    fact(SPEC, "price_ink_around_legend", ink);
    expect(ink.belowLegend, "zero tinta de vela no pane de preço — o instrumento está cego").toBeGreaterThan(0);
    expect(ink.underLegend, "tinta de vela sob a legenda: a marca intersecta a camada de DOM").toBe(0);
    // The read-back above is not a fiction: the topmost candle pixel sits at the scale top the
    // library reports (auto-scale puts the highest high there), within 2px of anti-aliasing. This
    // ties pixel <-> read-back <-> legend, so the read-back assertion is the one that bites on panes
    // the stub has no data for (`gates/T-01.6-builder.md` §5: on the price pane the library's own
    // 0,2 top margin — 67px of 335 — already clears a 54px legend, so ink alone would not bite here).
    const priceLayer = layers[0]!;
    expect(ink.topInkCssPx, "sem tinta — nada a comparar").not.toBeNull();
    expect(ink.topInkCssPx!, "a tinta sobe acima do topo de escala lido de volta").toBeGreaterThanOrEqual(
      priceLayer.reservedScaleTopPx - 2,
    );

    // ── (d) C-5: an interactive child stays clickable and keyboard-reachable ───────────────
    const probe = await page.evaluate(() => {
      const legend = document.querySelector<HTMLElement>('[data-testid="price-pane"] [data-pane-legend]')!;
      const button = document.createElement("button");
      button.type = "button";
      button.id = "t016-probe-button";
      button.textContent = "sonda";
      let clicks = 0;
      button.addEventListener("click", () => {
        clicks += 1;
        button.dataset.clicks = String(clicks);
      });
      const span = document.createElement("span");
      span.id = "t016-probe-span";
      span.textContent = "sonda inerte";
      legend.append(button, span);
      button.scrollIntoView({ block: "center" });
      const hitAt = (el: HTMLElement) => {
        const box = el.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return hit === el || (hit !== null && el.contains(hit));
      };
      return {
        buttonPointerEvents: getComputedStyle(button).pointerEvents,
        spanPointerEvents: getComputedStyle(span).pointerEvents,
        buttonHit: hitAt(button),
        spanHit: hitAt(span),
      };
    });
    fact(SPEC, "c5_probe", probe);
    expect(probe.buttonPointerEvents, "C-5: o botão herdou pointer-events none").toBe("auto");
    expect(probe.buttonHit, "C-5: o botão não é o alvo do ponteiro no próprio centro").toBe(true);
    expect(probe.spanPointerEvents, "ablação: um filho não-interativo tem de continuar transparente").toBe("none");
    expect(probe.spanHit, "ablação: o span recebeu o ponteiro — a camada não é transparente").toBe(false);
    await page.locator("#t016-probe-button").click();
    await expect(page.locator("#t016-probe-button")).toHaveAttribute("data-clicks", "1");
    await page.locator("body").focus();
    let reachedByTab = false;
    for (let presses = 0; presses < 80 && !reachedByTab; presses += 1) {
      await page.keyboard.press("Tab");
      reachedByTab = await page.evaluate(() => document.activeElement?.id === "t016-probe-button");
    }
    fact(SPEC, "c5_probe_reached_by_tab", reachedByTab);
    expect(reachedByTab, "C-5: o botão da camada não é alcançável por Tab").toBe(true);

    // ── (e) C-4: the mode in the chrome ─────────────────────────────────────────────────────
    const mode = page.locator('[data-fact="chrome_mode:as_of"]');
    await expect(mode).toHaveCount(1);
    await expect(mode).toBeVisible();
    fact(SPEC, "chrome_mode_text", (await mode.textContent())?.trim() ?? "");
  } finally {
    if (instance !== undefined) await instance.close();
    await stub.close();
  }
});
