import { expect, test } from "@playwright/test";

import { fact, shot } from "./helpers.ts";

const SPEC = "03-rotas";

/**
 * `T-01.9`, `SPEC-003` §5 `B8`/`B9`. Structural — `next.config.ts`'s redirect and
 * `not-found.tsx` do not depend on the ingest-health API being reachable (`CA-F1-14`), so
 * these three tests are expected to be green under BOTH `E2E_API_UP` values.
 */
test("B8: GET / → 3xx para /painel", async ({ page }) => {
  const response = await page.goto("/", { waitUntil: "networkidle" });
  const status = response?.status() ?? null;
  fact(SPEC, "root_status", status);
  fact(SPEC, "root_final_url", page.url());
  await shot(page, "03-raiz");
  expect(status).toBe(200); // Playwright follows the 307/308 — the final response is /painel's
  expect(page.url()).toContain("/painel");
});

test("B9: GET /nao-existe — not-found.tsx pt-BR com link de volta", async ({ page }) => {
  const response = await page.goto("/nao-existe", { waitUntil: "networkidle" });
  const status = response?.status() ?? null;
  const visibleText = (await page.locator("body").innerText()).trim().slice(0, 200);
  const hasLinkBack = await page.locator("a[href='/painel']").count();
  const lang = await page.locator("html").getAttribute("lang");

  fact(SPEC, "unknown_status", status);
  fact(SPEC, "unknown_visible_text", visibleText);
  fact(SPEC, "unknown_lang", lang);
  fact(SPEC, "unknown_has_link_to_panel", hasLinkBack);
  await shot(page, "04-rota-inexistente");

  expect(status).toBe(404);
  expect(lang).toBe("pt-BR");
  expect(hasLinkBack, "404 page offers no way back to /painel").toBeGreaterThan(0);
  expect(visibleText, "404 copy is Next's English default under <html lang=pt-BR>").not.toContain(
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
