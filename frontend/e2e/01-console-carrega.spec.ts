import { createHash } from "node:crypto";

import { type Locator, expect, test } from "@playwright/test";

import {
  API_LOG_PATH,
  PANEL_PATH,
  captureConsole,
  countCollectorStatusAccessLogHits,
  fact,
  seriesCatalogEntryCount,
  shot,
} from "./helpers.ts";

const SPEC = "01-console-carrega";

/** The `data-fact` of the first match, or `null` when nothing matches — without waiting for one to
 * appear (a bare `locator.getAttribute` waits up to the test timeout for an absent element). */
async function dataFactOrNull(locator: Locator): Promise<string | null> {
  return (await locator.count()) > 0 ? locator.first().getAttribute("data-fact") : null;
}

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
 *
 * `T-10.17`: this file is the ONE host of the default `/console` mount (`E2E-analise` §6.3). The
 * at-rest reads `04`, `05`, `06` and `07` used to pay a `goto` each for are steps of the first test
 * (they are ambient-independent, like it); `02`'s `B2` is a step of `B1` (it flips with the API, like
 * it). Every verdict is `expect.soft` inside a `test.step`, so one red never hides the next.
 */
test("estrutura sempre presente: título, CSS, ícones, h1 único, sem vazamento de bancada (B7)", async ({ page }) => {
  const console_ = captureConsole(page);
  const response = await page.goto(PANEL_PATH, { waitUntil: "networkidle" });

  // The ONE hard precondition: without a 200 every step below reads an error page, and its reds
  // would be noise. Every verdict after this line is `expect.soft` inside its own `test.step`,
  // so the first red never hides the next one (`T-10.17`, `E2E-analise` §3/01 "risco").
  fact(SPEC, "http_status", response?.status() ?? null);
  expect(response?.status()).toBe(200);

  await test.step("B7: sem erro de console nem pageerror na hidratação", async () => {
    fact(SPEC, "console_errors", console_.errors);
    fact(SPEC, "page_errors", console_.pageErrors);
    expect.soft(console_.pageErrors, "pageerror during load").toEqual([]);
    expect.soft(console_.errors, "console.error during load").toEqual([]);
  });

  await test.step("B7: título, h1 único, CSS aplicado, fonte de ícones", async () => {
    const title = await page.title();
    fact(SPEC, "document_title", title);
    expect.soft(title, "empty <title>").not.toBe("");

    const h1Count = await page.locator("h1").count();
    fact(SPEC, "h1_count", h1Count);
    expect.soft(h1Count, "no <h1> — the page has no accessible name, or more than one").toBe(1);

    const styleSheetCount = await page.evaluate(() => document.styleSheets.length);
    fact(SPEC, "stylesheets_applied", styleSheetCount);
    expect.soft(styleSheetCount, "no stylesheet applied").toBeGreaterThan(0);

    const glyphSpans = page.locator(".material-symbols-outlined");
    const glyphTexts = await glyphSpans.allInnerTexts();
    const glyphFonts = await glyphSpans.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).fontFamily));
    fact(SPEC, "glyph_spans", glyphTexts);
    fact(SPEC, "glyph_font_families", [...new Set(glyphFonts)]);
    for (const family of new Set(glyphFonts)) {
      expect.soft(family, "icon glyph rendered as literal text — icon font not loaded").toMatch(/Material Symbols/i);
    }
  });

  await test.step("B7: sem bancada, 5 source:none, nenhum numeral de fixture", async () => {
    // `T-01.6` moved `Filter.tsx` (bench-only, D1.3b) out of the route entirely — this must stay 0.
    const benchText = page.getByText("Filtro: any resultado serve");
    const benchCount = await benchText.count();
    fact(SPEC, "bench_filter_text_visible", benchCount);
    expect.soft(benchCount, "bench-only filter text leaked into /console").toBe(0);

    // `SourceNoneMarker.tsx`: 5 blocks with no data source in `F1` (fila ETL, orçamento,
    // reconexões, completude do catálogo, Camada 2) — `SPEC-003` §3.3.
    const sourceNoneCount = await page.locator('[data-fact="source:none"]').count();
    fact(SPEC, "source_none_markers", sourceNoneCount);
    expect.soft(sourceNoneCount, "source:none markers are not exactly the five blocks without a source").toBe(5);

    // `B7`: no fixture numeral survives (`fixtures.ts` is out of the production graph, `T-01.4`).
    // `T-03.8` moved the single formatter to `Intl.NumberFormat("pt-BR")` (comma decimal): the
    // fixture's own canonical figures ("1.6 GB"/"99.8%" before) would now leak as "1,6 GB"/
    // "99,8%" — the pattern below is updated for the SAME reason it exists at all, so a leak
    // does not silently stop matching just because the decimal mark moved.
    const fixtureLeakage = await page
      .locator("main")
      .evaluate((main) => (main.textContent ?? "").match(/1,6 GB|99,8%/g)?.length ?? 0);
    fact(SPEC, "fixture_numbers_visible", fixtureLeakage);
    expect.soft(fixtureLeakage, "a fixture numeral reached the screen").toBe(0);
  });

  // ── fused in by `T-10.17` (`E2E-analise` §2, §6.3: one host per page) — each step names its
  // origin spec and test, and keeps that test's own fact names, so a `facts.jsonl` reader finds the
  // same key under `01-console-carrega`. ──

  await test.step("04-t2: botão 'abrir' (Camada 2) foi removido — M3, tasks_review.md §1", async () => {
    const count = await page.getByRole("button", { name: "abrir" }).count();
    fact(SPEC, "abrir_buttons", count);
    expect.soft(count, "'abrir' still mounted — M3 removed it (openedSeriesId has no setter left)").toBe(0);
  });

  await test.step("05-t2: landmarks e cabeçalhos — lang, main único, inputs e tabelas nomeados", async () => {
    const main = await page.locator("main").count();
    const lang = await page.locator("html").getAttribute("lang");
    const labelledInputs = await page.locator("input[aria-label], input[id]").count();
    const inputs = await page.locator("input").count();
    const tablesWithCaption = await page.locator("table caption, table[aria-label], table[aria-labelledby]").count();
    const tables = await page.locator("table").count();
    fact(SPEC, "main_count", main);
    fact(SPEC, "html_lang", lang);
    fact(SPEC, "inputs_total_vs_labelled", [inputs, labelledInputs]);
    fact(SPEC, "tables_total_vs_named", [tables, tablesWithCaption]);
    // `h1 == 1` was asserted by `05-t2` too; it is the B7 step above now, one assertion, not two.
    expect.soft(lang, "<html lang> is not pt-BR").toBe("pt-BR");
    expect.soft(main, "not exactly one <main> landmark").toBe(1);
    expect.soft(labelledInputs, "filter input has placeholder only, no label").toBe(inputs);
    expect.soft(tablesWithCaption, "tables have no caption/aria-label").toBe(tables);
  });

  await test.step("06-1280: viewport 1280 — sem overflow horizontal, nenhuma tabela mais larga que a tela", async () => {
    // `06` opened its own 1280×800 page; this one IS that viewport (`playwright.config.ts`'s
    // project default). Asserted, not assumed: a config change must not turn this step into a
    // measurement of some other width while its name still says 1280.
    const viewport = page.viewportSize();
    fact(SPEC, "viewport_1280_actual", viewport);
    expect.soft(viewport, "the fused 1280 step is not running at 1280×800").toEqual({ width: 1280, height: 800 });
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      tablesWiderThanViewport: [...document.querySelectorAll("table")].filter(
        (table) => table.getBoundingClientRect().width > document.documentElement.clientWidth,
      ).length,
      tables: document.querySelectorAll("table").length,
    }));
    fact(SPEC, "metrics_1280", metrics);
    expect.soft(metrics.scrollWidth, "horizontal overflow at 1280px").toBeLessThanOrEqual(metrics.clientWidth);
    expect.soft(metrics.tablesWiderThanViewport, "tables wider than viewport at 1280px").toBe(0);
  });

  await test.step("07-D3.5: <th> mostra 'Janela de perda' (rótulo, linha 8), nunca 'JANELA_DE_PERDA' (coluna, linha 11)", async () => {
    const header = page.locator("th", { hasText: "Janela de perda" });
    const headerCount = await header.count();
    fact(SPEC, "th_janela_de_perda_count", headerCount);
    expect.soft(headerCount, "the 'Janela de perda' <th> label is not rendered exactly once").toBe(1);

    const shoutingCount = await page.getByText("JANELA_DE_PERDA", { exact: false }).count();
    fact(SPEC, "th_shouting_column_name_count", shoutingCount);
    expect.soft(shoutingCount, "the contract column name leaked to the screen instead of its label").toBe(0);
  });

  await test.step("07-ambiente: registra a(s) marca(s) decimal(is) visível(is) na página seedada", async () => {
    // FACT-only record, not a hard gate: the ambient seed never produces a decimal at all
    // (`07-locale.spec.ts`'s docstring), so this reads `0` and stays soft — `07`'s `D3.4` stub is
    // the test that exercises a real decimal.
    const text = await page.locator("main").innerText();
    const commaDecimal = text.match(/\d,\d/g) ?? [];
    const dotDecimal = text.match(/\d\.\d(?!\d\d)/g) ?? [];
    const dotThousands = text.match(/\d\.\d{3}(?!\d)/g) ?? []; // "2.016 pts"
    const bareThousands = text.match(/\b\d{4,}\b/g) ?? []; // "1440/1440"
    fact(SPEC, "ambient_comma_decimal_hits", commaDecimal);
    fact(SPEC, "ambient_dot_decimal_hits", dotDecimal);
    fact(SPEC, "ambient_dot_thousands_hits", dotThousands);
    fact(SPEC, "ambient_bare_thousands_hits", bareThousands);
    const decimalConventions = (commaDecimal.length > 0 ? 1 : 0) + (dotDecimal.length > 0 ? 1 : 0);
    fact(SPEC, "ambient_decimal_conventions_on_screen", decimalConventions);
    expect.soft(decimalConventions, "two decimal marks on one screen at once").toBeLessThanOrEqual(1);
  });

  await shot(page, "01-console-1280-padrao");

  await test.step("05-t2: primeiro foco por Tab (registro, sem asserção — como no 05)", async () => {
    // Last on purpose: it is the one GESTURE in this test, and the shot above must not carry a
    // focus ring. `05-t2` never asserted on it either — facts only.
    await page.keyboard.press("Tab");
    const first = await page.evaluate(() => document.activeElement?.tagName.toLowerCase() ?? null);
    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el ? getComputedStyle(el).outlineStyle : null;
    });
    fact(SPEC, "tab_first_focusable", first);
    fact(SPEC, "focus_outline_style", outline);
  });
});

test("B1: API de pé — GET /console entrega >= 1 linha, incrementa o access log da API, e ui_state:ok", async ({
  page,
}) => {
  const before = countCollectorStatusAccessLogHits();
  await page.goto(PANEL_PATH, { waitUntil: "networkidle" });
  const after = countCollectorStatusAccessLogHits();

  await test.step("B1: GET /console chegou ao access log da API", async () => {
    fact(SPEC, "api_log_path", API_LOG_PATH ?? null);
    fact(SPEC, "collector_status_access_log_hits_before", before);
    fact(SPEC, "collector_status_access_log_hits_after", after);
    // `E2E_API_UP=0` (`T-01.8`): no `api.log` file exists at all, `before === after === 0` — this
    // assertion is EXPECTED to fail in that mode; that flip is the falsifier `D1.11` measures.
    expect.soft(after, "GET /console never reached the API's own access log (uvicorn, --log)").toBeGreaterThan(before);
  });

  await test.step("B1: ui_state:ok e rows:N >= 1", async () => {
    const stateOkCount = await page.locator('main[data-fact="ui_state:ok"]').count();
    fact(SPEC, "ui_state_ok_present", stateOkCount);
    expect.soft(stateOkCount, "main[data-fact=ui_state:ok] is not rendered exactly once").toBe(1);

    // Read through `dataFactOrNull`, never a bare `getAttribute`: with the API down `rows:N` is not
    // rendered at all, and `getAttribute` would WAIT for it until the test timeout — the soft verdict
    // above would never be reported, and neither would the steps after this one.
    const rowsAttr = await dataFactOrNull(page.locator('[data-fact^="rows:"]'));
    fact(SPEC, "rows_data_fact", rowsAttr);
    expect.soft(rowsAttr, "S1 published no row").toMatch(/^rows:[1-9]\d*$/);
  });

  // `T-10.17`: `02-rede-e-estados`'s `B2` lives here now (`E2E-analise` §3/02 — it made the SAME
  // de-pé/no-chão flip as `B1`, "reusing B1's own signal", on its own `goto` of the same page).
  await test.step("02-B2: <main> muda de conteúdo com a saúde da API — fact para diff entre invocações de make e2e", async () => {
    // `D1.4`'s external half: `main_bytes`/`main_sha256` are diffed between this run's `facts.jsonl`
    // and a second `make e2e` with the other `E2E_API_UP` value — recorded here, never compared
    // in-process. The fact NAMES are the ones `02` wrote; their `spec` field is now this file's.
    const mainHtml = await page.locator("main").innerHTML();
    fact(SPEC, "main_bytes", Buffer.byteLength(mainHtml, "utf8"));
    fact(SPEC, "main_sha256", createHash("sha256").update(mainHtml).digest("hex"));

    // `D1.4`'s hard half: a rendered row only exists "de pé" — EXPECTED to fail under `E2E_API_UP=0`.
    const rowCount = await page.locator("table tbody tr").count();
    fact(SPEC, "table_row_count", rowCount);
    expect.soft(rowCount, "no <tr> rendered — <main> carries no data to fingerprint").toBeGreaterThan(0);

    await shot(page, "02-painel-main-de-pe");
  });

  // Last on purpose: `seriesCatalogEntryCount()` asks the API from Node and THROWS when it is down
  // (`E2E_API_UP=0`), which ends the test — every step above has already reported by then.
  await test.step("B1: catalog_rows:N igual ao n_entries de GET /series-catalog", async () => {
    // `T-03.3`, `plano 03` `D3.1`: `GET /series-catalog` concatena os módulos de catálogo já
    // populados — não depende do store seedado (`series_catalog` é estático para `BTCUSDT`,
    // diferente de `S1`'s `rows:N` acima).
    //
    // O NÚMERO VEM DA API, não de um literal: este teste dizia `catalog_rows:10` (os 3
    // `cvd_source` + 2 price + 5 `sum_open_interest` de `T-03.3`) e ficou VERMELHO quando `T-01.6`
    // acrescentou a 11ª linha (`klines_volume`, `series_catalog.py:128` — "APPENDS `klines_volume`
    // … as the eleventh row"), sem que nada do que este teste mede tivesse mudado
    // `[MEDIDO 2026-09-11: GET /api/v1/series-catalog → n_entries=11; `git diff --name-only
    // master..HEAD -- backend/src` → 0 arquivos, ou seja o 11º já estava em master]`. A asserção
    // forte é a MESMA de sempre e agora não envelhece: a tela mostra o que a API publica.
    const expectedCatalogRows = await seriesCatalogEntryCount();
    fact(SPEC, "series_catalog_n_entries", expectedCatalogRows);
    const catalogRowsAttr = await dataFactOrNull(page.locator('[data-fact^="catalog_rows:"]'));
    fact(SPEC, "catalog_rows_data_fact", catalogRowsAttr);
    expect.soft(catalogRowsAttr, "the catalog shows a count the API did not publish").toBe(
      `catalog_rows:${expectedCatalogRows}`,
    );
  });

});
