import { expect, test } from "@playwright/test";

import { PANEL_PATH, fact, isApiLike, shot } from "./helpers.ts";

const SPEC = "02-rede-e-estados";

// (b) Every network request the page makes, classified. ADR-005/D5 says the read port is the
// backend; a `/painel` that never talks to it is a fixture, not a panel.
test("/painel faz alguma requisição a uma API? (esperado pelo ADR-005: sim)", async ({ page }) => {
  const requests: { url: string; resourceType: string }[] = [];
  const websockets: string[] = [];
  page.on("request", (request) => requests.push({ url: request.url(), resourceType: request.resourceType() }));
  page.on("websocket", (socket) => websockets.push(socket.url()));

  await page.goto(PANEL_PATH, { waitUntil: "networkidle" });
  // Give any client-side effect a chance to fire after hydration.
  await page.waitForTimeout(3_000);

  const apiRequests = requests.filter((request) => isApiLike(request.url));
  const nextAssets = requests.filter((request) => !isApiLike(request.url));
  const byType = Object.fromEntries(
    [...new Set(requests.map((r) => r.resourceType))].map((type) => [
      type,
      requests.filter((r) => r.resourceType === type).length,
    ]),
  );

  fact(SPEC, "requests_total", requests.length);
  fact(SPEC, "requests_by_resource_type", byType);
  fact(SPEC, "requests_to_api_like_hosts", apiRequests.map((r) => r.url));
  fact(SPEC, "requests_to_next_dev_server", nextAssets.length);
  fact(SPEC, "websockets", websockets);

  expect.soft(
    apiRequests.length,
    "0 requests leave the Next dev server — every value on screen is a compiled-in fixture",
  ).toBeGreaterThan(0);
});

// (d) Does the screen change when the API is unreachable? Blocking every non-Next host from
// the browser is indistinguishable, for the page, from the API being down.
test("/painel com API no ar vs API inalcançável — a tela muda? (esperado: sim, com estado de erro)", async ({
  browser,
}) => {
  const apiUp = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await apiUp.goto(PANEL_PATH, { waitUntil: "networkidle" });
  const textApiUp = await apiUp.locator("main").innerText();
  await apiUp.close();

  const apiDown = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  let blocked = 0;
  await apiDown.route("**/*", async (route) => {
    if (isApiLike(route.request().url())) {
      blocked += 1;
      await route.abort("connectionrefused");
      return;
    }
    await route.continue();
  });
  await apiDown.goto(PANEL_PATH, { waitUntil: "networkidle" });
  await apiDown.waitForTimeout(2_000);
  const textApiDown = await apiDown.locator("main").innerText();
  await shot(apiDown, "02-painel-1280-api-inalcancavel");
  await apiDown.close();

  fact(SPEC, "requests_blocked_as_api_down", blocked);
  fact(SPEC, "main_text_bytes_api_up", textApiUp.length);
  fact(SPEC, "main_text_bytes_api_down", textApiDown.length);
  fact(SPEC, "main_text_identical", textApiUp === textApiDown);

  expect.soft(
    textApiUp,
    "byte-identical <main> with and without a reachable API — no loading/error/empty state exists",
  ).not.toEqual(textApiDown);
});
