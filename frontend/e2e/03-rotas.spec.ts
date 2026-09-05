import { expect, test } from "@playwright/test";

import { fact, shot } from "./helpers.ts";

const SPEC = "03-rotas";

// (c) What the operator sees at `/` and at a typo. `routes.ts` declares exactly one route
// (`panel: "/painel"`) and there is no `app/page.tsx`, so `/` has no owner.
test("/ (raiz) leva o operador ao painel? (esperado: redirect ou página inicial)", async ({ page }) => {
  const response = await page.goto("/", { waitUntil: "networkidle" });
  const status = response?.status() ?? null;
  const title = await page.title();
  const visibleText = (await page.locator("body").innerText()).trim().slice(0, 200);
  fact(SPEC, "root_status", status);
  fact(SPEC, "root_title", title);
  fact(SPEC, "root_visible_text", visibleText);
  fact(SPEC, "root_final_url", page.url());
  await shot(page, "03-raiz");
  expect.soft(status, "`/` returns the Next default 404 — no landing, no redirect to /painel").toBe(200);
  expect.soft(page.url(), "`/` did not land on /painel").toContain("/painel");
});

test("rota inexistente (/nao-existe) — o que o operador vê", async ({ page }) => {
  const response = await page.goto("/nao-existe", { waitUntil: "networkidle" });
  const status = response?.status() ?? null;
  const visibleText = (await page.locator("body").innerText()).trim().slice(0, 200);
  const hasLinkBack = await page.locator("a[href='/painel']").count();
  fact(SPEC, "unknown_status", status);
  fact(SPEC, "unknown_visible_text", visibleText);
  fact(SPEC, "unknown_lang", await page.locator("html").getAttribute("lang"));
  fact(SPEC, "unknown_has_link_to_panel", hasLinkBack);
  await shot(page, "04-rota-inexistente");
  expect(status).toBe(404);
  expect.soft(hasLinkBack, "404 page offers no way back to /painel").toBeGreaterThan(0);
  expect.soft(visibleText, "404 copy is Next's English default under <html lang=pt-BR>").not.toContain(
    "This page could not be found",
  );
});

test("/painel/ (barra final) e /Painel (caixa) — o operador chega?", async ({ page }) => {
  const trailing = await page.goto("/painel/", { waitUntil: "networkidle" });
  fact(SPEC, "trailing_slash_status", trailing?.status() ?? null);
  fact(SPEC, "trailing_slash_final_url", page.url());
  const upper = await page.goto("/Painel", { waitUntil: "networkidle" });
  fact(SPEC, "uppercase_status", upper?.status() ?? null);
  expect(trailing?.status()).toBe(200);
});
