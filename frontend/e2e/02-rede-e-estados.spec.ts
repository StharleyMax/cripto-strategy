import { createHash } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  PANEL_PATH,
  fact,
  isApiLike,
  shot,
  startSecondaryNextInstance,
  startStubCollectorStatusApi,
} from "./helpers.ts";

const SPEC = "02-rede-e-estados";

/**
 * `T-01.9`, `SPEC-003` §5. `T-03.7`: `S1`'s one call moved from `GET /ingest-health` to
 * `GET /collector-status` (`ADR-030`) — every stub below now answers the collector-status
 * envelope shape; the mechanisms this file proves are unchanged. Three different mechanisms,
 * one file:
 *
 * 1. The browser must make ZERO requests toward anything API-shaped — the exact INVERSE of
 *    what the suite this file replaces asked for (`ADR-028/D1`: the read moved server-side; a
 *    browser-side hit would mean the route regressed).
 * 2. `B2`: `<main>`'s bytes/sha256 are recorded as facts (not compared in-process — the
 *    falsifier is EXTERNAL, a diff between this run's `facts.jsonl` and a second `make e2e`
 *    invocation with the other `E2E_API_UP` value, same as `D1.4`'s own "servidor ausente"
 *    column says: "é a própria metade que morde"). The one thing asserted HERE, hard, is that
 *    a row actually rendered — which flips to red under `E2E_API_UP=0`, same falsifier as
 *    `01`'s `B1` test.
 * 3. `B3`/`B4`/`B5`/`B6` and `D1.5(b)` — the four `TransportErrorKind` causes plus the "empty
 *    store" state — are each proven by a SECOND, disposable `next start` (reusing the `.next`
 *    build `make e2e` already produced, `helpers.ts`) pointed at either nothing, or a small
 *    stub HTTP server this file owns. Self-contained: green under BOTH `E2E_API_UP` values,
 *    because none of the five depends on which one the ambient `make e2e` invocation chose —
 *    each row proves its OWN de-pé/no-chão pair internally (`RN-7`).
 */
test("o browser nunca fala com a API — toda leitura acontece no servidor (ADR-028/D1)", async ({ page }) => {
  const requests: string[] = [];
  const websockets: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  page.on("websocket", (socket) => websockets.push(socket.url()));

  await page.goto(PANEL_PATH, { waitUntil: "networkidle" });
  await page.waitForTimeout(1_000); // any client-side effect gets a chance to fire after hydration

  const apiRequests = requests.filter(isApiLike);
  fact(SPEC, "requests_total", requests.length);
  fact(SPEC, "requests_to_api_like_paths", apiRequests);
  fact(SPEC, "websockets", websockets);
  expect(apiRequests, "the browser itself reached an API-shaped path").toEqual([]);
  expect(websockets, "no websocket transport exists in F1").toEqual([]);
});

test("B2: <main> muda de conteúdo com a saúde da API — fact para diff entre invocações de make e2e", async ({
  page,
}) => {
  await page.goto(PANEL_PATH, { waitUntil: "networkidle" });
  const mainHtml = await page.locator("main").innerHTML();
  const mainBytes = Buffer.byteLength(mainHtml, "utf8");
  const mainSha256 = createHash("sha256").update(mainHtml).digest("hex");

  fact(SPEC, "main_bytes", mainBytes);
  fact(SPEC, "main_sha256", mainSha256);

  // `D1.4`'s hard half, reusing `B1`'s own signal: a rendered row only exists "de pé" — this
  // is EXPECTED to fail under `E2E_API_UP=0`, same flip as `01`'s `B1` test.
  const rowCount = await page.locator("table tbody tr").count();
  fact(SPEC, "table_row_count", rowCount);
  expect(rowCount, "no <tr> rendered — <main> carries no data to fingerprint").toBeGreaterThan(0);

  await shot(page, "02-painel-main-de-pe");
});

const CAUSES = [
  {
    name: "B3-env-ausente",
    envOverrides: { INGEST_HEALTH_API_BASE_URL: undefined },
    expectedFact: "error_kind:missing_base_url",
  },
  {
    name: "D1.5b-porta-sem-listener",
    // A free port nobody binds to — deliberately left unused by this test, the same shape
    // `scripts/e2e-env.sh`'s "API no chão" mode leaves the AMBIENT port in.
    envOverrides: { INGEST_HEALTH_API_BASE_URL: "http://127.0.0.1:1" },
    expectedFact: "error_kind:connection_refused",
  },
] as const;

for (const cause of CAUSES) {
  test(`${cause.name}: sob next start, ${cause.expectedFact}`, async ({ browser }) => {
    const instance = await startSecondaryNextInstance(cause.envOverrides);
    try {
      const page = await browser.newPage({ baseURL: instance.baseUrl });
      await page.goto(PANEL_PATH, { waitUntil: "networkidle" });
      const banner = page.locator(`[data-fact="${cause.expectedFact}"]`);
      fact(SPEC, cause.name, await banner.count());
      await expect(banner).toHaveCount(1);

      // `T-03.3`, `plano 03` `D3.1`, coluna "servidor ausente": as duas causas acima também
      // derrubam `GET /series-catalog` (mesmo host, mesma falta de listener/base URL) —
      // `catalog_rows:0`, nunca `FIXTURE_CATALOG_ROWS`.
      const catalogRowsFact = page.locator('[data-fact^="catalog_rows:"]');
      const catalogRowsAttr = await catalogRowsFact.getAttribute("data-fact");
      fact(SPEC, `${cause.name}_catalog_rows`, catalogRowsAttr);
      expect(catalogRowsAttr).toBe("catalog_rows:0");

      await page.close();
    } finally {
      await instance.close();
    }
  });
}

test("B4: stub HTTP 500 ⇒ error_kind:non_2xx, status:500", async ({ browser }) => {
  const stub = await startStubCollectorStatusApi({ status: 500 });
  const instance = await startSecondaryNextInstance({ INGEST_HEALTH_API_BASE_URL: stub.url });
  try {
    const page = await browser.newPage({ baseURL: instance.baseUrl });
    await page.goto(PANEL_PATH, { waitUntil: "networkidle" });
    const banner = page.locator('[data-fact="error_kind:non_2xx"]');
    const status = page.locator('[data-fact="status:500"]');
    fact(SPEC, "b4_error_banner", await banner.count());
    fact(SPEC, "b4_status_fact", await status.count());
    await expect(banner).toHaveCount(1);
    await expect(status).toHaveCount(1);
    await page.close();
  } finally {
    await instance.close();
    await stub.close();
  }
});

test("B5: store com 0 runs (stub 200 vazio) ⇒ ui_state:empty, 0 <tr>, 0 error_kind", async ({ browser }) => {
  const stub = await startStubCollectorStatusApi({ status: 200, rowCount: 0 });
  const instance = await startSecondaryNextInstance({ INGEST_HEALTH_API_BASE_URL: stub.url });
  try {
    const page = await browser.newPage({ baseURL: instance.baseUrl });
    await page.goto(PANEL_PATH, { waitUntil: "networkidle" });
    const empty = page.locator('[data-fact="ui_state:empty"]');
    const rows = await page.locator("table tbody tr").count();
    const errorBanner = await page.locator('[data-fact^="error_kind:"]').count();
    fact(SPEC, "b5_empty_banner", await empty.count());
    fact(SPEC, "b5_rows", rows);
    fact(SPEC, "b5_error_banners", errorBanner);
    await expect(empty).toHaveCount(1);
    expect(rows).toBe(0);
    expect(errorBanner).toBe(0);
    await page.close();
  } finally {
    await instance.close();
    await stub.close();
  }
});

test("B6: stub responde após 2 s ⇒ ui_state:loading visível antes de ui_state:ok", async ({ browser }) => {
  test.setTimeout(60_000);
  const stub = await startStubCollectorStatusApi({ status: 200, delayMs: 2_000, rowCount: 1 });
  const instance = await startSecondaryNextInstance({ INGEST_HEALTH_API_BASE_URL: stub.url });
  try {
    const page = await browser.newPage({ baseURL: instance.baseUrl });
    const navigation = page.goto(PANEL_PATH, { waitUntil: "networkidle" });
    // The Server Component is still awaiting the stub — `loading.tsx` is the Suspense
    // fallback for that window (`SPEC-003` §3.1). Polled instead of a fixed sleep so a slower
    // CI box does not turn a real "loading, then ok" into a false negative.
    await expect(page.locator('[data-fact="ui_state:loading"]')).toBeVisible({ timeout: 1_800 });
    fact(SPEC, "b6_loading_seen_before_ok", true);
    await navigation;
    await expect(page.locator('main[data-fact="ui_state:ok"]')).toBeVisible();
    fact(SPEC, "b6_ok_after_loading", true);
    await page.close();
  } finally {
    await instance.close();
    await stub.close();
  }
});
