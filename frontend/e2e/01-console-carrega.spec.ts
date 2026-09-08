import { expect, test } from "@playwright/test";

import {
  API_LOG_PATH,
  PANEL_PATH,
  captureConsole,
  countCollectorStatusAccessLogHits,
  fact,
  shot,
} from "./helpers.ts";

const SPEC = "01-console-carrega";

/**
 * `T-01.9`, `SPEC-003` §5 — this file no longer asks "did the browser call the API?" (`ADR-028/
 * D1` moved that call server-side; asking for it in the browser would reprove the CORRECT
 * implementation, `PRD-003` §1.4). What is ambient-independent here is STRUCTURE: title, CSS,
 * icon font, one `<h1>`, no leaked bench component, no five `source:none` markers turned into
 * something else, no fixture numeral surviving `T-01.4`'s removal of `fixtures.ts` imports.
 * `B1` (the one row that DOES depend on the API being reachable) is the second test, and it is
 * written to assert the "de pé" outcome UNCONDITIONALLY — `make e2e` with `E2E_API_UP=0`
 * (`T-01.8`) is expected to turn it red, and that flip IS `D1.11`'s falsifier, not a defect of
 * this suite (`docs/plans/SPEC-003-camada-de-leitura-do-painel/01_pagina_diz_a_verdade.md`'s own
 * falsifier: the OLD suite gave the same verdict either way, `05_fatia_visivel.md:225`).
 */
test("estrutura sempre presente: título, CSS, ícones, h1 único, sem vazamento de bancada (B7)", async ({ page }) => {
  const console_ = captureConsole(page);
  const response = await page.goto(PANEL_PATH, { waitUntil: "networkidle" });

  fact(SPEC, "http_status", response?.status() ?? null);
  expect(response?.status()).toBe(200);

  fact(SPEC, "console_errors", console_.errors);
  fact(SPEC, "page_errors", console_.pageErrors);
  expect.soft(console_.pageErrors, "pageerror during load").toEqual([]);
  expect.soft(console_.errors, "console.error during load").toEqual([]);

  const title = await page.title();
  fact(SPEC, "document_title", title);
  expect(title).not.toBe("");

  const h1Count = await page.locator("h1").count();
  fact(SPEC, "h1_count", h1Count);
  expect(h1Count).toBe(1);

  const styleSheetCount = await page.evaluate(() => document.styleSheets.length);
  fact(SPEC, "stylesheets_applied", styleSheetCount);
  expect(styleSheetCount).toBeGreaterThan(0);

  const glyphSpans = page.locator(".material-symbols-outlined");
  const glyphTexts = await glyphSpans.allInnerTexts();
  const glyphFonts = await glyphSpans.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).fontFamily));
  fact(SPEC, "glyph_spans", glyphTexts);
  fact(SPEC, "glyph_font_families", [...new Set(glyphFonts)]);
  for (const family of new Set(glyphFonts)) {
    expect.soft(family, "icon glyph rendered as literal text — icon font not loaded").toMatch(/Material Symbols/i);
  }

  // `T-01.6` moved `Filter.tsx` (bench-only, D1.3b) out of the route entirely — this must
  // stay 0, hard, not the `expect.soft` finding the pre-`T-01.6` suite carried.
  const benchText = page.getByText("Filtro: any resultado serve");
  fact(SPEC, "bench_filter_text_visible", await benchText.count());
  expect(await benchText.count()).toBe(0);

  // `SourceNoneMarker.tsx`: 5 blocks with no data source in `F1` (fila ETL, orçamento,
  // reconexões, completude do catálogo, Camada 2) — `SPEC-003` §3.3.
  const sourceNoneCount = await page.locator('[data-fact="source:none"]').count();
  fact(SPEC, "source_none_markers", sourceNoneCount);
  expect(sourceNoneCount).toBe(5);

  // `B7`: no fixture numeral survives (`fixtures.ts` is out of the production graph, `T-01.4`).
  // `T-03.8` moved the single formatter to `Intl.NumberFormat("pt-BR")` (comma decimal): the
  // fixture's own canonical figures ("1.6 GB"/"99.8%" before) would now leak as "1,6 GB"/
  // "99,8%" — the pattern below is updated for the SAME reason it exists at all, so a leak
  // does not silently stop matching just because the decimal mark moved.
  const fixtureLeakage = await page
    .locator("main")
    .evaluate((main) => (main.textContent ?? "").match(/1,6 GB|99,8%/g)?.length ?? 0);
  fact(SPEC, "fixture_numbers_visible", fixtureLeakage);
  expect(fixtureLeakage).toBe(0);

  await shot(page, "01-console-1280-padrao");
});

test("B1: API de pé — GET /console entrega >= 1 linha, incrementa o access log da API, e ui_state:ok", async ({
  page,
}) => {
  const before = countCollectorStatusAccessLogHits();
  await page.goto(PANEL_PATH, { waitUntil: "networkidle" });
  const after = countCollectorStatusAccessLogHits();

  fact(SPEC, "api_log_path", API_LOG_PATH ?? null);
  fact(SPEC, "collector_status_access_log_hits_before", before);
  fact(SPEC, "collector_status_access_log_hits_after", after);
  // `E2E_API_UP=0` (`T-01.8`): no `api.log` file exists at all, `before === after === 0` — this
  // assertion is EXPECTED to fail in that mode; that flip is the falsifier `D1.11` measures.
  expect(after, "GET /console never reached the API's own access log (uvicorn, --log)").toBeGreaterThan(before);

  const stateOk = page.locator('main[data-fact="ui_state:ok"]');
  fact(SPEC, "ui_state_ok_present", await stateOk.count());
  expect(await stateOk.count()).toBe(1);

  const rowsFact = page.locator('[data-fact^="rows:"]');
  const rowsAttr = await rowsFact.getAttribute("data-fact");
  fact(SPEC, "rows_data_fact", rowsAttr);
  expect(rowsAttr).toMatch(/^rows:[1-9]\d*$/);

  // `T-03.3`, `plano 03` `D3.1`: `GET /series-catalog` concatena os 3 módulos de catálogo já
  // populados (`cvd_source_catalog` 3 + `price_source_catalog` 2 + `open_interest_catalog` 5),
  // sempre 10 — não depende do store seedado (`series_catalog` é estático para `BTCUSDT`,
  // diferente de `S1`'s `rows:N` acima).
  const catalogRowsFact = page.locator('[data-fact^="catalog_rows:"]');
  const catalogRowsAttr = await catalogRowsFact.getAttribute("data-fact");
  fact(SPEC, "catalog_rows_data_fact", catalogRowsAttr);
  expect(catalogRowsAttr).toBe("catalog_rows:10");
});
