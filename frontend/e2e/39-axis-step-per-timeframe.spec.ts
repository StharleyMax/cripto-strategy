import { expect, test, type Page } from "@playwright/test";

import { fact, waitForChartSettled } from "./helpers.ts";

/**
 * `paineis-de-fluxo` `T-05.1` (`CST-?`, plan `05_correcoes_de_uso.md` item 5.1 + DoD 1,
 * `handoff/T-05.1-desenho.md` §5) — the axis is at the TIMEFRAME's step, in every TF.
 *
 * The defect (`handoff/FIX-uso-2026-10-02.md` §D-A): the shared axis was built at ONE MINUTE in every
 * timeframe. At `?interval=1h` the price panel sat on 5.760 one-minute slots holding 96 hourly
 * candles — 60 empty slots between two candles, ~0,2 px per bar, nothing legible on screen.
 *
 * What this spec asserts, for each of the 5 served TFs, against the app under test:
 *
 *   1. `price_candles:<drawn>/<gridSlots>` (the price pane's `data-fact`): `gridSlots` is EXACTLY
 *      `TIMEFRAME_WINDOW_BARS[tf].initialBars` — copied below as literals, not imported (precedent
 *      `e2e/20`'s `PAGE_SLOTS`): a change to the table is a change this spec has to be told about;
 *   2. `drawn / gridSlots >= 0,90` — no empty slot between candles (the real kline holes are 1,1%,
 *      `FIX-uso` §D-C). Only measurable where `/series-history` serves real rows; in the WEAK universe
 *      (`make e2e`'s sqlite, `ADR-034/D9`) it is SKIPPED with the reason — a skip is not a pass;
 *   3. the host's `data-bar-spacing-px >= 4` — the mount view frames the last `VIEW_BARS` (120)
 *      bars, not the whole axis.
 *
 * ⚠️ WHICH ASSERT BITES, declared so nobody cites the wrong one as the falsifier: under the ablation
 * (`timeframeStepMs(interval)` → `ONE_MINUTE_MS` in `use-history-pager.ts` AND `[symbol]/page.tsx`)
 * `1h`/`4h`/`5m`/`15m` reprove (1): the grid becomes 10.080 / 10.080 / 5.760 / 5.760 slots. `1m` passes
 * — it is the control, proving the assert is not vacuous. The bar-spacing assert (3) does NOT bite
 * under that ablation: the 120-slot view stays legible on any grid. Measured arms in
 * `gates/T-05.1-build.md`.
 *
 * Run against the live stack: `E2E_BASE_URL=http://127.0.0.1:<next> E2E_SENTIMENTO_API_BASE_URL=
 * http://127.0.0.1:8000/api/v1 npx playwright test 39-axis-step-per-timeframe`. Under `make e2e` the
 * universe is the weak one and (2) is skipped per TF; (1) and (3) still run.
 */

const SPEC = "39-axis-step-per-timeframe";
const SYMBOL_PATH = "/symbol/BTCUSDT";
const CHART_HOST_TESTID = "symbol-chart-host";

/** `timeframe-window.ts::TIMEFRAME_WINDOW_BARS[tf].initialBars`, literal — `[DECISÃO-OWNER:
 * 2026-10-02]` for `1h`/`4h` (7 days). */
const INITIAL_BARS: Readonly<Record<string, number>> = {
  "1m": 5_760,
  "5m": 1_152,
  "15m": 384,
  "1h": 168,
  "4h": 42,
};
/** No empty slot between candles: the real kline holes are ~1,1% (`FIX-uso` §D-C). */
const MIN_DRAWN_FRACTION = 0.9;
/** The width at which a candle still reads as one (`T-05.1-desenho.md` §5, DoD 1). */
const MIN_BAR_SPACING_PX = 4;

/** `GET /ready`'s store: a `.sqlite3` path is the WEAK universe, where `/series-history` refuses
 * (`e2e/09`'s own predicate). Without `E2E_SENTIMENTO_API_BASE_URL` the universe is not declared,
 * and the drawn-fraction assert is skipped rather than guessed. */
async function realUniverse(): Promise<boolean | null> {
  const base = process.env.E2E_SENTIMENTO_API_BASE_URL?.replace(/\/+$/, "");
  if (base === undefined || base === "") {
    return null;
  }
  const response = await fetch(`${base}/ready`);
  const body = (await response.json()) as { store?: { path?: string } };
  const storePath = body.store?.path;
  if (typeof storePath !== "string") {
    throw new Error("GET /ready did not publish store.path — cannot tell which engine this API composed");
  }
  return !storePath.endsWith(".sqlite3");
}

interface MountFacts {
  readonly drawn: number;
  readonly gridSlots: number;
  readonly barSpacingPx: number;
  readonly visibleFrom: number;
  readonly visibleTo: number;
}

async function readMountFacts(page: Page): Promise<MountFacts> {
  const priceFact = page.locator('[data-fact^="price_candles:"]');
  await expect(priceFact, "o painel de preço não publicou price_candles").toHaveCount(1);
  const raw = (await priceFact.getAttribute("data-fact")) ?? "";
  const match = /^price_candles:(\d+)\/(\d+)$/.exec(raw);
  if (match === null) {
    throw new Error(`price_candles fact malformed: ${JSON.stringify(raw)}`);
  }
  const host = page.locator(`[data-testid="${CHART_HOST_TESTID}"]`);
  await expect(host, "o host do gráfico não publicou data-bar-spacing-px").toHaveAttribute("data-bar-spacing-px", /.+/, {
    timeout: 60_000,
  });
  const [spacing, from, to] = await Promise.all([
    host.getAttribute("data-bar-spacing-px"),
    host.getAttribute("data-visible-logical-from"),
    host.getAttribute("data-visible-logical-to"),
  ]);
  return {
    drawn: Number(match[1]),
    gridSlots: Number(match[2]),
    barSpacingPx: Number(spacing),
    visibleFrom: Number(from),
    visibleTo: Number(to),
  };
}

for (const [interval, initialBars] of Object.entries(INITIAL_BARS)) {
  test(`T-05.1 DoD 1: ?interval=${interval} abre num eixo de ${initialBars} barras do próprio TF, legível (${SPEC})`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const universe = await realUniverse();
    fact(SPEC, `universe:${interval}`, universe === null ? "undeclared" : universe ? "REAL" : "FRACO");

    // `T-05.1-desenho.md` §3: at `4h` the view IS the whole axis (42 < 120 bars), so the left edge sits
    // inside the paging trigger from the first frame. Paging must stay ON DEMAND (a drag), never fire
    // from the mount itself — every browser-side `/series-history` request is a page.
    const browserHistoryRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/series-history")) browserHistoryRequests.push(request.url());
    });
    const response = await page.goto(`${SYMBOL_PATH}?interval=${interval}`, { waitUntil: "load" });
    expect(response?.ok(), `GET ${SYMBOL_PATH}?interval=${interval} não respondeu ok`).toBe(true);
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll("canvas")).some((c) => c.width > 0 && c.height > 0),
      undefined,
      { timeout: 120_000 },
    );
    // The host publishes the spacing on the mount's rAF: wait for the chart to settle (`T-10.1`).
    await waitForChartSettled(page);
    // NEGATIVE WINDOW (`T-10.1`), the only one in this test: "the mount asked for no page" is an
    // ABSENCE, proven only by waiting. 1.5 s past a settled chart, the value under which the mount
    // paging of `ab293210` (10 requests at 4h) and the lock ablation of `b7af6bca` were caught; the
    // pager decides synchronously on the library's first range callback, a few frames after the mount.
    await page.waitForTimeout(1_500);

    const facts = await readMountFacts(page);
    fact(SPEC, `grid_slots:${interval}`, facts.gridSlots);
    fact(SPEC, `drawn:${interval}`, facts.drawn);
    fact(SPEC, `drawn_fraction:${interval}`, Number((facts.drawn / Math.max(1, facts.gridSlots)).toFixed(4)));
    fact(SPEC, `bar_spacing_px:${interval}`, facts.barSpacingPx);
    fact(SPEC, `visible_from:${interval}`, facts.visibleFrom);
    fact(SPEC, `visible_to:${interval}`, facts.visibleTo);
    fact(SPEC, `browser_history_requests_at_mount:${interval}`, browserHistoryRequests.length);

    expect(
      browserHistoryRequests,
      `?interval=${interval}: a montagem pediu página sem gesto (${browserHistoryRequests.length})`,
    ).toEqual([]);

    // (1) — the assert that bites under the ablation.
    expect(
      facts.gridSlots,
      `?interval=${interval}: o eixo tem ${facts.gridSlots} slots, não as ${initialBars} barras do TF — ` +
        "o passo do eixo não é o do timeframe",
    ).toBe(initialBars);

    // (3) — the mount view frames the last 120 bars (or the whole axis, when it is shorter).
    expect(
      facts.barSpacingPx,
      `?interval=${interval}: ${facts.barSpacingPx} px por barra na montagem, abaixo de ${MIN_BAR_SPACING_PX}`,
    ).toBeGreaterThanOrEqual(MIN_BAR_SPACING_PX);

    // (2) — only where real rows exist.
    test.skip(
      universe !== true,
      universe === null
        ? "E2E_SENTIMENTO_API_BASE_URL não declarado: o universo não é conhecido, drawn/grid não é julgado (skip não é verde)"
        : "universo FRACO: /series-history recusa, não há vela real para contar (skip não é verde)",
    );
    expect(
      facts.drawn / facts.gridSlots,
      `?interval=${interval}: ${facts.drawn}/${facts.gridSlots} velas desenhadas — slots vazios entre velas`,
    ).toBeGreaterThanOrEqual(MIN_DRAWN_FRACTION);
  });
}

/**
 * The other half of the mount assert above: at `4h` the lock that keeps the MOUNT from paging must
 * not keep the OPERATOR from paging. The view is the whole 42-bar axis, so one drag toward the past
 * already crosses the trigger (`T-05.1-desenho.md` §3, "sob demanda") — and the page is asked for.
 */
test(`T-05.1: em 4h o primeiro arrasto para o passado pede página — sob demanda, não na montagem (${SPEC})`, async ({
  page,
}) => {
  test.setTimeout(180_000);
  const browserHistoryRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/series-history")) browserHistoryRequests.push(request.url());
  });
  const response = await page.goto(`${SYMBOL_PATH}?interval=4h`, { waitUntil: "load" });
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll("canvas")).some((c) => c.width > 0 && c.height > 0),
    undefined,
    { timeout: 120_000 },
  );
  await waitForChartSettled(page);
  // NEGATIVE WINDOW (`T-10.1`), the only one in this test: the mount asked for no page, BEFORE the drag
  // that must ask for one. 1.5 s past a settled chart, the same value and reason as the mount window
  // of the per-timeframe tests above.
  await page.waitForTimeout(1_500);
  fact(SPEC, "drag_4h_requests_before", browserHistoryRequests.length);
  expect(browserHistoryRequests, "a montagem em 4h pediu página sem gesto").toEqual([]);

  const box = await page.locator(`[data-testid="${CHART_HOST_TESTID}"]`).boundingBox();
  if (box === null) {
    throw new Error("chart host: no bounding box — nothing mounted");
  }
  const startX = box.x + box.width * 0.5;
  const y = box.y + Math.min(200, box.height * 0.3);
  // Right = toward the past (`e2e/16`'s measured convention).
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX + 200, y, { steps: 20 });
  await page.mouse.up();
  await expect
    .poll(() => browserHistoryRequests.length, { message: "o arrasto em 4h não pediu página", timeout: 15_000 })
    .toBeGreaterThan(0);
  fact(SPEC, "drag_4h_requests_after", browserHistoryRequests.length);
});

/**
 * `handoff/T-05.1-revisao-ab29321.md` §5 item 3 — the case that SEPARATES the two fixes. At `4h` the
 * view is born inside the paging trigger; a zoom-IN by the wheel asks to see LESS, and must not
 * fetch 7 more days. The gesture gate of `ab29321` opened on the first `wheel` and then paged (10
 * requests = 1 page); the position lock of the pager (`isLeftOfMountView`) keeps it at 0, because the
 * zoom moves the left edge RIGHT of the mount framing. The range is asserted to have moved, so a
 * wheel the chart ignored cannot pass as a lock that held.
 */
test(`T-05.1: em 4h o zoom-in pela roda não pede página (${SPEC})`, async ({ page }) => {
  test.setTimeout(180_000);
  const browserHistoryRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/series-history")) browserHistoryRequests.push(request.url());
  });
  const response = await page.goto(`${SYMBOL_PATH}?interval=4h`, { waitUntil: "load" });
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll("canvas")).some((c) => c.width > 0 && c.height > 0),
    undefined,
    { timeout: 120_000 },
  );
  // `T-10.1`: a positive wait only. The mount-paging absence is still judged, cumulatively, by the
  // negative window after the wheel below, the one window of this test.
  await waitForChartSettled(page);
  expect(browserHistoryRequests, "a montagem em 4h pediu página sem gesto").toEqual([]);

  const host = page.locator(`[data-testid="${CHART_HOST_TESTID}"]`);
  const box = await host.boundingBox();
  if (box === null) {
    throw new Error("chart host: no bounding box — nothing mounted");
  }
  const fromBefore = Number(await host.getAttribute("data-visible-logical-from"));
  await page.mouse.move(box.x + box.width * 0.5, box.y + Math.min(200, box.height * 0.3));
  for (let i = 0; i < 3; i += 1) await page.mouse.wheel(0, -200);
  // NEGATIVE WINDOW (`T-10.1`), the only one in this test: "the zoom-in asked for no page" is an
  // ABSENCE, proven only by waiting. 3 s, the value `b7af6bca` measured the 10-request page under (the
  // gesture gate of `ab29321`); it also covers the mount, because `browserHistoryRequests` accumulates.
  await page.waitForTimeout(3_000);
  const fromAfter = Number(await host.getAttribute("data-visible-logical-from"));
  fact(SPEC, "zoom_in_4h_from", { before: fromBefore, after: fromAfter });
  fact(SPEC, "zoom_in_4h_requests", browserHistoryRequests.length);
  expect(fromAfter, "a roda não aproximou a vista — o teste não julgaria nada").toBeGreaterThan(fromBefore + 1);
  expect(browserHistoryRequests, "o zoom-in em 4h pediu página (o operador pediu para ver menos)").toEqual([]);
});
