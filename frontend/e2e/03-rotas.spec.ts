import { expect, test } from "@playwright/test";

import { fact, shot } from "./helpers.ts";

const SPEC = "03-rotas";

/**
 * `T-01.9`, `SPEC-003` §5 `B8`/`B9`. Structural — `next.config.ts`'s redirect and
 * `not-found.tsx` do not depend on the ingest-health API being reachable (`CA-F1-14`), so
 * these three tests are expected to be green under BOTH `E2E_API_UP` values.
 */
test("B8: GET / → 3xx para /console", async ({ page }) => {
  const response = await page.goto("/", { waitUntil: "networkidle" });
  const status = response?.status() ?? null;
  fact(SPEC, "root_status", status);
  fact(SPEC, "root_final_url", page.url());
  await shot(page, "03-raiz");
  expect(status).toBe(200); // Playwright follows the 307/308 — the final response is /console's
  expect(page.url()).toContain("/console");
});

test("B9: GET /nao-existe — not-found.tsx pt-BR com link de volta", async ({ page }) => {
  const response = await page.goto("/nao-existe", { waitUntil: "networkidle" });
  const status = response?.status() ?? null;
  const visibleText = (await page.locator("body").innerText()).trim().slice(0, 200);
  const hasLinkBack = await page.locator("a[href='/console']").count();
  const lang = await page.locator("html").getAttribute("lang");

  fact(SPEC, "unknown_status", status);
  fact(SPEC, "unknown_visible_text", visibleText);
  fact(SPEC, "unknown_lang", lang);
  fact(SPEC, "unknown_has_link_to_panel", hasLinkBack);
  await shot(page, "04-rota-inexistente");

  expect(status).toBe(404);
  expect(lang).toBe("pt-BR");
  expect(hasLinkBack, "404 page offers no way back to /console").toBeGreaterThan(0);
  expect(visibleText, "404 copy is Next's English default under <html lang=pt-BR>").not.toContain(
    "This page could not be found",
  );
});

test("/console/ (barra final) e /Console (caixa) — o operador chega?", async ({ page }) => {
  const trailing = await page.goto("/console/", { waitUntil: "networkidle" });
  fact(SPEC, "trailing_slash_status", trailing?.status() ?? null);
  fact(SPEC, "trailing_slash_final_url", page.url());
  const upper = await page.goto("/Console", { waitUntil: "networkidle" });
  fact(SPEC, "uppercase_status", upper?.status() ?? null);
  expect(trailing?.status()).toBe(200);
});

// `SPEC-006` plan `03`, `CA-F3-3`/`CA-F3-4`: the redirect from the RETIRED route (the segment
// this fase renamed to `console` — `ROUTES` used to call it `panel`) is deliberately NOT
// exercised by a spec in this directory. `CA-F3-4`'s own falsifier greps this directory for the
// old path and expects zero live hits (spelled out instead of quoted verbatim here, same
// technique `ConsoleClient.tsx`'s own docstring uses, so this comment is never counted as a hit
// by that very grep) — a request literal for it here would fail the check this fase adds. The
// redirect's own falsifier (`curl -sD -` against the old path expects `308` + `Location:
// /console`) is exercised at the QA gate instead, against a running `next start`.
