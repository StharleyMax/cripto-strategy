import http from "node:http";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { fact, startSecondaryNextInstance, type NextInstanceHandle } from "./helpers.ts";
import { readView, showView, type ViewState } from "./view.ts";

/**
 * `paineis-de-fluxo` `T-06.1` (`handoff/T-06.1-desenho.md` §1.5 `F3`) — THE HELPER PROVES ITSELF
 * before any spec leans on it.
 *
 *   (a) `lastBars` 60 / 600 / 2.000 at `1m` land inside the tolerance           — CALA
 *   (b) `timeRange` at `5m` lands inside the tolerance                           — CALA
 *   (c) a target already on screen costs `0` gestures                            — CALA
 *   (d) a target wider than the library's floor THROWS, and moves nothing         — MORDE
 *   (e) `allowPaging: false` with a target left of the window THROWS              — MORDE
 *   (f) with `allowPaging`, the target left of the window is reached through a page, and
 *       `<main data-window-start-ms>` still names logical slot 0 afterwards (`[NÃO SEI]` (a) of
 *       §1.3), read off the crosshair legend's `slotIndex`/`bucketMs`; the same reading also
 *       settles `[NÃO SEI]` (c) — no left price scale shifting `x(logical)`.
 *
 * WHY A SYNTHETIC STORE (same recipe as `22-*.spec.ts`, own copy): the weak universe of `make e2e`
 * answers `500` to `/series-history`, and without a real value the library does not take a drag as
 * a pan (`17-*.spec.ts`); (e)/(f) also need a history that never ends, so a page is always
 * warranted. A LOCAL `http.createServer`, no `INSERT`, no Postgres.
 */

const SPEC = "42-view-helper";
const SYMBOL = "BTCUSDT";
const SYMBOL_PATH = `/symbol/${SYMBOL}`;
const CHART_HOST_TESTID = "symbol-chart-host";
const PRICE_PANE_TESTID = "price-pane";
const ONE_MINUTE_MS = 60_000;
const FIVE_MINUTES_MS = 5 * ONE_MINUTE_MS;
const STEP_MS_BY_INTERVAL: Readonly<Record<string, number>> = { "1m": ONE_MINUTE_MS, "5m": FIVE_MINUTES_MS };
const OHLC_REDUCTIONS = ["OPEN", "HIGH", "LOW", "CLOSE"] as const;
/** `timeframe-window.ts::TIMEFRAME_WINDOW_BARS[tf].initialBars`, literal — importing that module pulls
 * the `charts/index.ts` barrel, which Playwright's loader cannot evaluate (`08-*.spec.ts`, `39-*.spec.ts`). */
const INITIAL_BARS = { "1m": 5_760, "5m": 1_152 } as const;
/** `F3` (a): narrower than every mount `VIEW_BARS` ever had, wider, and near the floor. */
const LAST_BARS_TARGETS = [60, 600, 2_000] as const;
/** `F3` (d): wider than any plot at 1280 px can draw at 0.5 px per bar (~2.400). */
const PAST_THE_FLOOR_BARS = 10_000;

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
      verifiedBy: "T-06.1-synthetic-stub",
    },
    nativeGrid: "1m",
    maxStalenessMs: 600_000,
    priceUse: null,
    reconstructedFrom: null,
    publishedError: null,
  }));
  return { query: "series_catalog", n_entries: entries.length, entries };
}

/** A value on every bucket of any window asked for, at the asked `interval` — history never ends. */
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
      const stepMs = STEP_MS_BY_INTERVAL[incoming.searchParams.get("interval") ?? "1m"] ?? ONE_MINUTE_MS;
      if (!Number.isFinite(startMs) || !Number.isFinite(endMsInclusive)) {
        response.writeHead(400, { "content-type": "text/plain" });
        response.end("synthetic stub: window_start_ms/window_end_ms missing or not numeric");
        return;
      }
      const rows: { event_time: number; available_at: number; value: string; absence: null; coverage: null }[] = [];
      for (let t = Math.ceil(startMs / stepMs) * stepMs; t <= endMsInclusive; t += stepMs) {
        const value = 100 + (t % 1_000_000) / 100_000;
        rows.push({ event_time: t, available_at: t, value: value.toFixed(4), absence: null, coverage: null });
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          session: { principal_id: null, server_now_ms: Date.now() },
          panel: {
            series_key_id: incoming.searchParams.get("series_key_id") ?? "unknown",
            source: "T-06.1-synthetic-stub",
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

async function openSymbol(page: Page, baseUrl: string, query: string): Promise<void> {
  const response = await page.goto(`${baseUrl}${SYMBOL_PATH}${query}`, { waitUntil: "load" });
  expect(response?.ok(), `GET ${SYMBOL_PATH}${query} não respondeu ok`).toBe(true);
  await expect(page.locator(`[data-testid="${CHART_HOST_TESTID}"]`)).toHaveAttribute("data-pane-layers", "anchored", { timeout: 120_000 });
  await expect
    .poll(async () => Number(await page.locator(`[data-testid="${PRICE_PANE_TESTID}"]`).getAttribute("data-price-candles")), { timeout: 60_000 })
    .toBeGreaterThan(0);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

/** The crosshair on the centre of slot `logical`, and what the price legend names there. */
async function legendAt(page: Page, state: ViewState, logical: number): Promise<{ readonly slotIndex: number; readonly bucketMs: number }> {
  const x = state.plot.x + ((logical + 0.5 - state.fromLogical) / (state.toLogical - state.fromLogical)) * state.plot.width;
  // `steps: 5`: a single move with no motion before it did not fire the crosshair (`e2e/24`).
  await page.mouse.move(x, state.plot.y + state.plot.height * 0.5, { steps: 5 });
  const legend = page.locator('[data-legend-value="price"]');
  await expect(legend, "a legenda do Preço não acompanhou o crosshair").toHaveAttribute("data-legend-source", "crosshair");
  await page.waitForTimeout(150);
  const reading = {
    slotIndex: Number(await legend.getAttribute("data-legend-slot-index")),
    bucketMs: Number(await legend.getAttribute("data-legend-bucket-ms")),
  };
  await page.mouse.move(2, 2, { steps: 5 });
  return reading;
}

/** `[NÃO SEI]` (a)/(c) of §1.3: the slot under `x(logical)` is `logical`, and it starts at
 * `windowStartMs + logical · stepMs`. */
async function expectAxisIdentity(page: Page, state: ViewState, label: string): Promise<void> {
  const logical = Math.floor((state.fromLogical + state.toLogical) / 2);
  const reading = await legendAt(page, state, logical);
  fact(SPEC, `axis_identity_${label}`, { logical, ...reading, windowStartMs: state.windowStartMs, stepMs: state.stepMs });
  expect(Math.abs(reading.slotIndex - logical), `${label}: x(lógico ${logical}) caiu no slot ${reading.slotIndex}`).toBeLessThanOrEqual(1);
  expect(
    reading.bucketMs,
    `${label}: o slot ${reading.slotIndex} não começa em data-window-start-ms + slot × passo`,
  ).toBe(state.windowStartMs + reading.slotIndex * state.stepMs);
}

test.describe(`T-06.1 F3: o helper que posiciona o eixo se prova (${SPEC})`, () => {
  test.describe.configure({ mode: "serial" });
  let stub: Awaited<ReturnType<typeof startSyntheticOhlcStub>> | undefined;
  let instance: NextInstanceHandle | undefined;

  test.beforeAll(async () => {
    stub = await startSyntheticOhlcStub();
    instance = await startSecondaryNextInstance({ INGEST_HEALTH_API_BASE_URL: stub.url });
  });

  test.afterAll(async () => {
    if (instance !== undefined) await instance.close();
    if (stub !== undefined) await stub.close();
  });

  test("(a) lastBars 60/600/2.000 em 1m dentro da tolerância; (c) alvo já na tela ⇒ 0 gestos", async ({ page }) => {
    await openSymbol(page, instance!.baseUrl, "");
    const mount = await readView(page);
    fact(SPEC, "mount_1m", { from: mount.fromLogical, to: mount.toLogical, spacing: mount.barSpacingPx, slotCount: mount.slotCount, plot: mount.plot });
    expect(mount.slotCount, "1m: slotCount != a linha de TIMEFRAME_WINDOW_BARS").toBe(INITIAL_BARS["1m"]);
    for (const bars of LAST_BARS_TARGETS) {
      const reached = await showView(page, { kind: "lastBars", bars });
      const tolerance = Math.max(1, 0.02 * bars);
      fact(SPEC, `last_bars_${bars}`, { iterations: reached.iterations, from: reached.fromLogical, to: reached.toLogical, spacing: reached.barSpacingPx, trace: reached.trace });
      expect(Math.abs(reached.toLogical - reached.slotCount), `lastBars ${bars}: borda direita`).toBeLessThanOrEqual(tolerance);
      expect(Math.abs(reached.fromLogical - (reached.slotCount - bars)), `lastBars ${bars}: borda esquerda`).toBeLessThanOrEqual(tolerance);
      expect(reached.pagesRequestedDuring, `lastBars ${bars}: pediu página`).toBe(0);
    }
    const again = await showView(page, { kind: "lastBars", bars: LAST_BARS_TARGETS[LAST_BARS_TARGETS.length - 1]! });
    fact(SPEC, "already_on_screen_iterations", again.iterations);
    expect(again.iterations, "(c) o alvo já estava na tela e o helper gesticulou").toBe(0);
    await expectAxisIdentity(page, again, "1m");
  });

  test("(b) timeRange em 5m dentro da tolerância", async ({ page }) => {
    await openSymbol(page, instance!.baseUrl, "?interval=5m");
    const mount = await readView(page);
    fact(SPEC, "mount_5m", { from: mount.fromLogical, to: mount.toLogical, spacing: mount.barSpacingPx, slotCount: mount.slotCount });
    expect(mount.stepMs).toBe(FIVE_MINUTES_MS);
    expect(mount.slotCount, "5m: slotCount != a linha de TIMEFRAME_WINDOW_BARS").toBe(INITIAL_BARS["5m"]);
    const fromMs = mount.windowStartMs + 300 * FIVE_MINUTES_MS;
    const toMs = fromMs + 100 * FIVE_MINUTES_MS;
    const reached = await showView(page, { kind: "timeRange", fromMs, toMs });
    fact(SPEC, "time_range_5m", { iterations: reached.iterations, from: reached.fromLogical, to: reached.toLogical, trace: reached.trace });
    expect(Math.abs(reached.fromLogical - 300), "5m: borda esquerda").toBeLessThanOrEqual(2);
    expect(Math.abs(reached.toLogical - 400), "5m: borda direita").toBeLessThanOrEqual(2);
    expect(reached.pagesRequestedDuring).toBe(0);
    await expectAxisIdentity(page, reached, "5m");
  });

  test("(d) MORDE: alvo além do piso lança, sem gesto", async ({ page }) => {
    await openSymbol(page, instance!.baseUrl, "");
    const before = await readView(page);
    await expect(showView(page, { kind: "lastBars", bars: PAST_THE_FLOOR_BARS })).rejects.toThrow(/below the floor: 10000\.0 slots asked, floor \d+/);
    const after = await readView(page);
    expect([after.fromLogical, after.toLogical], "(d) o helper gesticulou antes de recusar").toEqual([before.fromLogical, before.toLogical]);
  });

  test("(e) MORDE: allowPaging falso com alvo à esquerda da janela lança 'requested a history page'", async ({ page }) => {
    await openSymbol(page, instance!.baseUrl, "");
    const mount = await readView(page);
    const target = { kind: "timeRange" as const, fromMs: mount.windowStartMs - 200 * ONE_MINUTE_MS, toMs: mount.windowStartMs - 100 * ONE_MINUTE_MS };
    await expect(showView(page, target)).rejects.toThrow(/requested a history page/);
  });

  test("(f) com allowPaging o alvo à esquerda chega por página, e data-window-start-ms continua nomeando o slot 0", async ({ page }) => {
    await openSymbol(page, instance!.baseUrl, "");
    const mount = await readView(page);
    const fromMs = mount.windowStartMs - 150 * ONE_MINUTE_MS;
    const toMs = mount.windowStartMs - 30 * ONE_MINUTE_MS;
    const reached = await showView(page, { kind: "timeRange", fromMs, toMs }, { allowPaging: true });
    fact(SPEC, "paged", {
      iterations: reached.iterations,
      pages: reached.pagesRequestedDuring,
      windowStartMs: [mount.windowStartMs, reached.windowStartMs],
      from: reached.fromLogical,
      to: reached.toLogical,
      trace: reached.trace,
    });
    expect(reached.pagesRequestedDuring, "(f) nenhuma página foi pedida").toBeGreaterThanOrEqual(1);
    expect(reached.windowStartMs, "(f) a janela não cresceu para a esquerda").toBeLessThan(mount.windowStartMs);
    const tolerance = Math.max(1, 0.02 * 120);
    expect(Math.abs(reached.windowStartMs + reached.fromLogical * ONE_MINUTE_MS - fromMs) / ONE_MINUTE_MS, "(f) borda esquerda").toBeLessThanOrEqual(tolerance);
    expect(Math.abs(reached.windowStartMs + reached.toLogical * ONE_MINUTE_MS - toMs) / ONE_MINUTE_MS, "(f) borda direita").toBeLessThanOrEqual(tolerance);
    await expectAxisIdentity(page, reached, "after_page");
  });
});
