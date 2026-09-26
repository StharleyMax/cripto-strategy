import http from "node:http";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { fact, startSecondaryNextInstance, type NextInstanceHandle } from "./helpers.ts";

/**
 * `paineis-de-fluxo` `T-01.5` (plan `01` item `1.3′`, DoD `11(b)`;
 * `docs/context/paineis-de-fluxo/handoff/FIX-regressoes-fase05.md` §4.2–§4.3) — O HOST SOBREVIVE À
 * PÁGINA.
 *
 * Até esta task, cada página de história alargava a janela, o `axis` mudava de identidade,
 * `AxisSyncProvider` recriava a store em `useMemo([axis])`, e o efeito do gráfico — que dependia
 * dela — chamava `chart.remove()` e um `createChart` novo. O arrasto em curso morria com o canvas
 * removido (`gates/DIAG-e2e-master.md` §4: 24/24 gestos parados). Agora a store é uma por mount,
 * a página vira `setData` nas séries que já existem mais `store.rebase(axis)`, e o efeito de
 * montagem do host não depende nem do `axis` nem da store.
 *
 * ── O QUE ESTE SPEC AFIRMA ────────────────────────────────────────────────────────────────────
 *
 * `data-chart-mount-count`, na raiz do host (`SymbolClient.tsx::SymbolChartHost`), sobe a cada
 * `createChart`. Depois de `>= 2` páginas disparadas por arrasto e DESENHADAS, ele continua `== 1`.
 *
 * **Morde:** devolver `axis` (ou uma store recriada por `axis`) às dependências do efeito de
 * montagem do host faz a contagem virar `1 + páginas`. A mutação foi rodada à mão na construção
 * desta task e o resultado está em `docs/context/paineis-de-fluxo/gates/T-01.5-builder.md`.
 *
 * ── POR QUE UM ESTOQUE SINTÉTICO PRÓPRIO (mesma receita de `20-*.spec.ts`, cópia própria) ──────
 *
 * O universo fraco de `make e2e` (sqlite efêmero) responde `500` para `/series-history`, e sem
 * nenhum valor real a biblioteca não reconhece o arrasto como pan (`17-*.spec.ts`). Um
 * `http.createServer` LOCAL responde o catálogo `klines_ohlc` e um valor a cada minuto de qualquer
 * janela pedida — nenhum `INSERT`, nenhum Postgres tocado. Arquivo novo, e não um teste dentro do
 * `e2e/20`, para não conflitar com a `T-01.F2`, que edita aquele arquivo no mesmo lote.
 *
 * Run with: `E2E_API_PORT=… E2E_NEXT_PORT=… make e2e` (ou `npx playwright test 22-single-host`).
 */

const SPEC = "22-single-host-survives-paging";
const SYMBOL = "BTCUSDT";
const SYMBOL_PATH = `/symbol/${SYMBOL}`;
const CHART_HOST_TESTID = "symbol-chart-host";

/** Plan `01` DoD `11(b)`, literal: "depois de ≥ 2 páginas". */
const MIN_PAGES = 2;
/** Drags attempted before giving up on reaching `MIN_PAGES`. The first drags only WALK to the
 * left edge: at mount the library clamps the bar spacing to its minimum, so the visible range is
 * the RIGHT ~2.300 of the 5.760 slots, and a drag is capped at half the chart's width. */
const MAX_DRAGS = 12;
const PER_DRAG_TIMEOUT_MS = 10_000;
/** How long to wait for a request after a drag that may not have reached the trigger zone. */
const NO_REQUEST_WAIT_MS = 2_500;
/** Slots past the left edge each drag aims at — above `DEFAULT_PAGE_TRIGGER_SLOTS` (20). */
const EDGE_OVERSHOOT_SLOTS = 60;
/** The price pane is the TOP pane of the single chart. Since `T-01.6` set the stretch factors it is
 * ~335px of a 910px chart (`charts::stackedPaneLayout`, weight 34 of 89), so 110px from the host's
 * top is still inside it — no longer its middle, but the drag only needs to start in the pane. */
const PRICE_PANE_MID_Y_PX = 110;

const ONE_MINUTE_MS = 60_000;
const OHLC_REDUCTIONS = ["OPEN", "HIGH", "LOW", "CLOSE"] as const;

declare global {
  interface Window {
    __historyPageLatencyProbe?: { requestedMs: number[]; drawnMs: number[]; reset(): void };
  }
}

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
      verifiedBy: "T-01.5-synthetic-stub",
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
    // The browser pages with a real cross-origin `fetch()` against this port (`20-*.spec.ts`'s
    // own measured finding) — without this header every client page is a CORS failure.
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
          source: "T-01.5-synthetic-stub",
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

function hostLocator(page: Page) {
  return page.locator(`[data-testid="${CHART_HOST_TESTID}"]`);
}

async function readMountCount(page: Page): Promise<number> {
  const raw = await hostLocator(page).getAttribute("data-chart-mount-count");
  if (raw === null) {
    throw new Error("the chart host does not publish data-chart-mount-count — nothing mounted?");
  }
  return Number(raw);
}

async function readVisibleRange(page: Page): Promise<{ readonly from: number; readonly to: number }> {
  const host = hostLocator(page);
  const [from, to] = await Promise.all([
    host.getAttribute("data-visible-logical-from"),
    host.getAttribute("data-visible-logical-to"),
  ]);
  if (from === null || to === null) {
    throw new Error("the chart host does not publish data-visible-logical-from/-to");
  }
  return { from: Number(from), to: Number(to) };
}

/** One drag to the RIGHT (reveals the past — `16-*.spec.ts`'s measured convention), in the middle
 * of the price pane, with the 100 ms pauses the library needs to see a drag, not a teleport. */
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

test(`DoD-11(b): data-chart-mount-count continua 1 depois de >= ${MIN_PAGES} páginas disparadas por arrasto (${SPEC})`, async ({
  page,
}) => {
  const stub = await startSyntheticOhlcStub();
  let instance: NextInstanceHandle | undefined;
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

    // CA-1′ in passing: the page mounts ONE chart, not six.
    const chartCount = await page.locator(".tv-lightweight-charts").count();
    fact(SPEC, "tv_lightweight_charts_count", chartCount);
    expect(chartCount, "a página monta UM gráfico (plano 01, item 1.3)").toBe(1);

    const mountBefore = await readMountCount(page);
    fact(SPEC, "chart_mount_count_before", mountBefore);
    expect(mountBefore, "um createChart na carga da página").toBe(1);

    await page.evaluate(() => window.__historyPageLatencyProbe?.reset());
    for (let i = 0; i < MAX_DRAGS; i += 1) {
      const counts = await probeCounts(page);
      if (counts.drawn >= MIN_PAGES && counts.drawn >= counts.requested) {
        break;
      }
      const box = await hostLocator(page).boundingBox();
      if (box === null) throw new Error("the chart host has no bounding box — nothing mounted");
      const range = await readVisibleRange(page);
      const pxPerSlot = box.width / (range.to - range.from);
      // Aim just past the left edge of the loaded grid (logical 0), never more than half the width.
      const deltaXPx = Math.min(box.width * 0.45, Math.max(10, pxPerSlot * (Math.max(range.from, 0) + EDGE_OVERSHOOT_SLOTS)));
      fact(SPEC, `drag_delta_px:${i}`, Number(deltaXPx.toFixed(2)));
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
      await page.waitForFunction((n) => (window.__historyPageLatencyProbe?.drawnMs.length ?? 0) >= n, afterRequest.requested, {
        timeout: PER_DRAG_TIMEOUT_MS,
      });
    }

    const final = await probeCounts(page);
    fact(SPEC, "history_pages_requested", final.requested);
    fact(SPEC, "history_pages_drawn", final.drawn);
    expect(
      final.drawn,
      `apenas ${final.drawn} páginas desenhadas depois de ${MAX_DRAGS} arrastos — o spec precisa de >= ${MIN_PAGES}`,
    ).toBeGreaterThanOrEqual(MIN_PAGES);

    const mountAfter = await readMountCount(page);
    fact(SPEC, "chart_mount_count_after", mountAfter);
    expect(
      mountAfter,
      `o gráfico foi recriado ${mountAfter - 1} vez(es) em ${final.drawn} páginas — a página tem de ser setData no ` +
        "chart que já existe, não chart.remove() + createChart (FIX-regressoes-fase05.md §4.3)",
    ).toBe(1);
  } finally {
    if (instance !== undefined) await instance.close();
    await stub.close();
  }
});
