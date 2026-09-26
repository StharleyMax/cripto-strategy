import fs from "node:fs";

import { expect, test } from "@playwright/test";

import { API_LOG_PATH, fact } from "./helpers.ts";

/**
 * `T-03.11` (`CST-226`, plan `03` DoD 6/7/8, `RN-4`) — the TF bar's `onSelect` now drives a REAL
 * refetch (`page.tsx`'s `?interval=`, `request-window.ts`'s `requestIntervalMs`), and this file
 * is the Playwright falsifier for the wiring itself, run against a REAL browser and a REAL
 * (ephemeral, `make e2e`'s own) Next + FastAPI pair — never a mock, per the handoff's own
 * correction over an earlier report ("sem servidor Playwright" referred to the MCP, not
 * `@playwright/test`, which this repo has and this file uses).
 *
 * ── WHAT THIS FILE CAN PROVE IN THE WEAK (sqlite, `make e2e`/`make verify`) UNIVERSE, FOR REAL ──
 *
 * `/series-history` REFUSES (`500`) in this universe (`ADR-034/D9`: no `md.series` reader over
 * sqlite) regardless of `interval` — so the SIX panels' bar counts stay `0`/absent under every
 * TF, and DoD 6's literal "a contagem muda" cannot be measured on real numbers here (same
 * constraint `12-oi-dado-real.spec.ts` already documents for its own DoD-3). What CAN be proven
 * for real, and is the actual falsifier of the WIRING (not of the reaggregation math, which
 * `T-03.3`/`T-03.7`/`T-03.8` already proved server-side against real Postgres):
 *
 *   1. **the window itself moves** — `request-window.ts`'s `alignmentMs` rise (`T-03.11`'s own
 *      fix over the "day a 15m/1h/4h aggregate is drawn" comment `quant-architect` left in wave
 *      `03`, C1) is computed by `page.tsx` BEFORE any `/series-history` call and survives every
 *      one of them failing — `<main data-window-end-ms-inclusive>` is a real, TF-dependent
 *      number even when all ten fetches 500.
 *   2. **the backend actually receives the new `interval`** — read off `uvicorn`'s own access
 *      log (`API_LOG_PATH`, the SAME B1 instrument `01-console-carrega.spec.ts` uses for
 *      `/collector-status`), never off the browser's own belief that it asked. A client-only
 *      `useState` (the `T-03.9` shape this task retires) would pass every DOM assertion below
 *      and log ZERO new `interval=4h` requests.
 *   3. **ablation is exact** — TF back to `1m` reproduces the ORIGINAL `<main>` attributes
 *      byte-for-byte, not merely "some other value" (`RN-4`: a TF bar that does not round-trip is
 *      not neutral, it is a leak).
 *   4. **an unsupported `?interval=` degrades to the served default**, never reaching the
 *      backend with a value it would `422` on — `page.tsx`'s own `isSupportedTimeframe` guard.
 *
 * ── WHAT IT CANNOT, AND WHY THAT GAP IS NAMED HERE RATHER THAN PAPERED OVER ─────────────────────
 *
 * DoD 6 ("a contagem de barras de CADA UM dos 6 painéis muda") and DoD 8 ("wire-points deixa de
 * ser 5x native-bars") on REAL numbers need the STRONG universe (Postgres `SeriesWindowReader`)
 * running THIS branch's backend — `12-oi-dado-real.spec.ts` already needs the same thing for its
 * own `DoD-3` and names it "é tempo, não código" (`T-03.7`'s collector, not yet run long enough).
 * `interval-reduction-shape.test.ts` (sibling `node:test`, same directory as `SymbolClient.tsx`)
 * is where DoD 8's ratio claim is falsified instead — against the EXACT row-shaping the backend
 * route emits (`series_history.py`'s `outer_bucket_ends`/`group_size`, read, never re-derived),
 * the same "synthetic, same discipline" posture `T-03.10`'s own gate report used for the
 * equivalent gap under its own scope.
 *
 * Run with: npm --prefix frontend run test:e2e (needs `make e2e`'s ephemeral env — see
 * `scripts/e2e-env.sh`) or `make e2e`.
 */

const SPEC = "18-tf-refetch-e-ablacao";
const SYMBOL = "BTCUSDT";
const SYMBOL_PATH = `/symbol/${SYMBOL}`;
const FOUR_HOURS_MS = 4 * 60 * 60_000;

interface RenderedWindow {
  readonly startMs: number;
  readonly endMsInclusive: number;
  readonly knowledgeTimeMs: number;
}

/**
 * W1-FIX (`gates/W1-QA.md` BLOCKER-1) — whether the `1m` window ALREADY ends on a `4h` boundary.
 * `request-window.ts` aligns the `1m` right edge to 5 min and the `4h` one to 4 h: when
 * `floor_5m(now − 5 min)` lands on a 4-hour boundary (`HH:05`–`HH:10` UTC, HH ∈ {00,04,…,20} —
 * 5 of every 240 min, 2,08 % of clock readings), the two windows are IDENTICAL by construction and
 * "4h moves the edge" is false, with the product correct. In that band this file measures the
 * identity instead (and keeps the access-log proof); that the click swaps the drawn grid even
 * there is `e2e/26`'s proof, which does not depend on the clock.
 */
function oneMinuteEdgeIsOnFourHourBoundary(window: RenderedWindow): boolean {
  return (window.endMsInclusive + 60_000) % FOUR_HOURS_MS === 0;
}

async function readRenderedWindow(page: import("@playwright/test").Page): Promise<RenderedWindow> {
  const main = page.locator("main[data-window-start-ms]");
  await expect(main, "a página não declara o próprio request (data-window-start-ms)").toHaveCount(1);
  const startRaw = await main.getAttribute("data-window-start-ms");
  const endRaw = await main.getAttribute("data-window-end-ms-inclusive");
  const knowledgeRaw = await main.getAttribute("data-knowledge-time-ms");
  if (startRaw === null || endRaw === null || knowledgeRaw === null) {
    throw new Error("SymbolClient.tsx stopped publishing one of the three request attributes on <main>");
  }
  return { startMs: Number(startRaw), endMsInclusive: Number(endRaw), knowledgeTimeMs: Number(knowledgeRaw) };
}

/** Counts of `GET .../series-history` requests in the API's own access log carrying `needle`
 * (e.g. `interval=4h`) in the query string — never the browser's own belief that it asked.
 * Mirrors `helpers.ts::countCollectorStatusAccessLogHits`, generalized over the query fragment
 * because `/series-history` (unlike `/collector-status`) is asked with a varying `interval`. */
function countSeriesHistoryAccessLogHits(needle: string): number {
  if (!API_LOG_PATH || !fs.existsSync(API_LOG_PATH)) return 0;
  const content = fs.readFileSync(API_LOG_PATH, "utf8");
  const pattern = new RegExp(`GET [^"]*/series-history\\?[^"]*${needle}[^"]*`, "g");
  return (content.match(pattern) ?? []).length;
}

test(`primeiro paint: TF=1m selecionado, sem query string (${SPEC})`, async ({ page }) => {
  const response = await page.goto(SYMBOL_PATH, { waitUntil: "networkidle" });
  fact(SPEC, "http_status", response?.status() ?? null);
  expect(response?.status()).toBe(200);

  const oneMinuteButton = page.locator('[data-testid="timeframe-button-1m"]');
  await expect(oneMinuteButton, "a barra de TF precisa existir no DOM").toHaveCount(1);
  expect(await oneMinuteButton.getAttribute("aria-pressed")).toBe("true");

  const fourHourButton = page.locator('[data-testid="timeframe-button-4h"]');
  expect(await fourHourButton.getAttribute("aria-pressed")).toBe("false");

  const url = new URL(page.url());
  fact(SPEC, "first_paint_search", url.search);
  expect(url.searchParams.has("interval"), "1m é o default — não precisa aparecer na URL").toBe(false);
});

test(`clicar 4h navega, MOVE A JANELA DO SERVIDOR e chega no access log da API (${SPEC})`, async ({ page }) => {
  await page.goto(SYMBOL_PATH, { waitUntil: "networkidle" });
  const before = await readRenderedWindow(page);
  const hitsBefore = countSeriesHistoryAccessLogHits("interval=4h");
  fact(SPEC, "window_before", before);
  fact(SPEC, "series_history_interval_4h_hits_before", hitsBefore);

  await page.locator('[data-testid="timeframe-button-4h"]').click();
  await page.waitForURL(/interval=4h/);
  await page.waitForLoadState("networkidle");

  // ── (a) a URL É a fonte da verdade, e o botão certo lê "pressed" a partir dela ────────────
  const url = new URL(page.url());
  fact(SPEC, "after_click_search", url.search);
  expect(url.searchParams.get("interval")).toBe("4h");
  expect(await page.locator('[data-testid="timeframe-button-4h"]').getAttribute("aria-pressed")).toBe("true");
  expect(await page.locator('[data-testid="timeframe-button-1m"]').getAttribute("aria-pressed")).toBe("false");

  // ── (b) DoD 6/8's PRECONDITION: a janela do SERVIDOR mudou, não só o destaque do botão ────
  //
  // `request-window.ts`'s `alignmentMs` rise (`T-03.11`) é o que faz isto acontecer mesmo com
  // `/series-history` recusando nos dois lados — a janela é computada ANTES de qualquer fetch.
  const after = await readRenderedWindow(page);
  fact(SPEC, "window_after_4h", after);
  const coincident = oneMinuteEdgeIsOnFourHourBoundary(before);
  fact(SPEC, "one_minute_edge_on_4h_boundary", coincident);
  if (coincident) {
    // The 2,08 % band: the two alignments give the same edge by construction (see the helper).
    expect(after.endMsInclusive, "na faixa HH:05–HH:10, as janelas de 1m e 4h coincidem por construção").toBe(
      before.endMsInclusive,
    );
  } else {
    expect(after.endMsInclusive, "MORDE de DoD 6/7: selecionar 4h tem de mover a borda da janela").not.toBe(
      before.endMsInclusive,
    );
  }
  // A borda nova cai numa fronteira de 4h — não apenas "um valor diferente qualquer".
  expect((after.endMsInclusive + 60_000) % FOUR_HOURS_MS, "a borda direita, +1 grid de 1min, cai num limite de 4h").toBe(
    0,
  );

  // ── (c) o backend REALMENTE recebeu interval=4h — não é o browser fingindo que perguntou ──
  const hitsAfter = countSeriesHistoryAccessLogHits("interval=4h");
  fact(SPEC, "series_history_interval_4h_hits_after", hitsAfter);
  if (API_LOG_PATH) {
    // Dez séries (`preço x4`, oi, cvd, volume, liquidação x2, long/short) — cada uma um fetch.
    expect(
      hitsAfter,
      "GET /series-history?...interval=4h... nunca chegou ao access log da API — a barra de TF " +
        "não está religada a um refetch real, só ao próprio destaque",
    ).toBeGreaterThan(hitsBefore);
    expect(hitsAfter - hitsBefore, "os DEZ fetches desta rota devem carregar o interval selecionado").toBe(10);
  }
});

test(`ablação (DoD 7): voltar a 1m restaura a janela ORIGINAL, byte a byte (${SPEC})`, async ({ page }) => {
  // W1-FIX (`gates/W1-QA.md` BLOCKER-1, second mode): `knowledgeTimeMs` is read off the SERVER's
  // clock on every render, aligned to 5 min. If a 5-minute boundary falls between the first render
  // and the round trip back to `1m`, `original` and `restored` differ by the clock, not by the TF.
  // The round trip is then re-run from scratch (at most 3 attempts; the ~2 s round trip crosses a
  // 5-min boundary ~0,7 % of the time, so a second crossing in a row is a real leak, not the clock).
  const MAX_ATTEMPTS = 3;
  let original: RenderedWindow | null = null;
  let under4h: RenderedWindow | null = null;
  let restored: RenderedWindow | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    await page.goto(SYMBOL_PATH, { waitUntil: "networkidle" });
    original = await readRenderedWindow(page);

    await page.locator('[data-testid="timeframe-button-4h"]').click();
    await page.waitForURL(/interval=4h/);
    await page.waitForLoadState("networkidle");
    under4h = await readRenderedWindow(page);

    await page.locator('[data-testid="timeframe-button-1m"]').click();
    await page.waitForURL((url) => !url.searchParams.has("interval"));
    await page.waitForLoadState("networkidle");
    restored = await readRenderedWindow(page);
    fact(SPEC, `ablation_attempt_${attempt}_knowledge_moved`, restored.knowledgeTimeMs !== original.knowledgeTimeMs);
    if (restored.knowledgeTimeMs === original.knowledgeTimeMs) {
      break;
    }
  }
  if (original === null || under4h === null || restored === null) {
    throw new Error("ablation round trip never ran");
  }
  fact(SPEC, "window_original", original);
  fact(SPEC, "window_under_4h", under4h);
  fact(SPEC, "window_restored_1m", restored);

  // Precondition: 4h must have moved the window, or the ablation proves nothing about it — except
  // in the `HH:05`–`HH:10` band, where the two windows coincide by construction (the helper above).
  const coincident = oneMinuteEdgeIsOnFourHourBoundary(original);
  fact(SPEC, "ablation_one_minute_edge_on_4h_boundary", coincident);
  if (coincident) {
    expect(under4h.endMsInclusive, "na faixa HH:05–HH:10, as janelas de 1m e 4h coincidem por construção").toBe(
      original.endMsInclusive,
    );
  } else {
    expect(under4h.endMsInclusive, "pré-condição: 4h precisa ter movido a janela, senão a ablação não prova nada").not.toBe(
      original.endMsInclusive,
    );
  }

  expect(await page.locator('[data-testid="timeframe-button-1m"]').getAttribute("aria-pressed")).toBe("true");
  expect(new URL(page.url()).searchParams.has("interval")).toBe(false);
  // ⛔ `RN-4`: um pixel que não volta sob ablação não estava seguindo o mestre — a mesma frase
  // que `plano 03` usa para a ladder de `GA-2` vale aqui para a JANELA, que é o mestre de todo
  // painel nesta tela (`AxisSyncProvider axis={axis}`, derivado de `panels.window`).
  expect(restored).toEqual(original);
});

test(`?interval= não reconhecido degrada para o TF default, sem alcançar a API com valor inválido (${SPEC})`, async ({
  page,
}) => {
  const withDefault = await page.goto(SYMBOL_PATH, { waitUntil: "networkidle" });
  const defaultWindow = await readRenderedWindow(page);
  expect(withDefault?.status()).toBe(200);

  const hitsBefore = countSeriesHistoryAccessLogHits("interval=7m");
  const response = await page.goto(`${SYMBOL_PATH}?interval=7m`, { waitUntil: "networkidle" });
  fact(SPEC, "unsupported_interval_http_status", response?.status() ?? null);
  // `PILOT_SYMBOLS`/`isSupportedTimeframe` refusam por VALOR, não por rota — a página continua
  // servindo `200`, só que com o TF que `SUPPORTED_TIMEFRAMES` de fato reconhece.
  expect(response?.status()).toBe(200);

  const oneMinuteButton = page.locator('[data-testid="timeframe-button-1m"]');
  expect(await oneMinuteButton.getAttribute("aria-pressed")).toBe("true");
  const degraded = await readRenderedWindow(page);
  fact(SPEC, "window_with_unsupported_interval", degraded);
  fact(SPEC, "window_with_default_interval", defaultWindow);
  expect(degraded, "?interval=7m tem de degradar para EXATAMENTE a mesma janela do default (1m)").toEqual(
    defaultWindow,
  );

  const hitsAfter = countSeriesHistoryAccessLogHits("interval=7m");
  fact(SPEC, "series_history_interval_7m_hits", hitsAfter - hitsBefore);
  expect(
    hitsAfter,
    "um interval não reconhecido nunca pode alcançar /series-history — isso seria um 422 " +
      "comprado pela tela em nome de um clique arbitrário na URL",
  ).toBe(hitsBefore);
});
