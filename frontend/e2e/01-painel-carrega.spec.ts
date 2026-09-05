import { expect, test } from "@playwright/test";

import { PANEL_PATH, captureConsole, fact, shot } from "./helpers.ts";

const SPEC = "01-painel-carrega";

// (a) `/painel` loads. Assertions encode what an operator-facing screen is expected to
// have; each soft failure below is a finding in REVISAO-FB-playwright.md, not a flaky test.
test("/painel responde 200, hidrata sem erro, e tem título/estilo/ícones reais", async ({ page }) => {
  const console_ = captureConsole(page);
  const response = await page.goto(PANEL_PATH, { waitUntil: "networkidle" });

  fact(SPEC, "http_status", response?.status() ?? null);
  expect(response?.status()).toBe(200);

  // Hydration/runtime errors — hard requirement.
  fact(SPEC, "console_errors", console_.errors);
  fact(SPEC, "console_warnings", console_.warnings);
  fact(SPEC, "page_errors", console_.pageErrors);
  expect.soft(console_.pageErrors, "pageerror during load").toEqual([]);
  expect.soft(console_.errors, "console.error during load").toEqual([]);

  // The 3 mounted regions (S1 + S3 + quarantine drawer) — the DOM the ADR-018/D2 route promises.
  const headings = await page.locator("h2").allInnerTexts();
  fact(SPEC, "h2_headings", headings);
  expect(headings).toEqual(
    expect.arrayContaining(["Monitoramento de Coletores e Ingestão", "Catálogo de Séries", "Quarentena"]),
  );

  // Document title: what the tab shows the operator.
  const title = await page.title();
  fact(SPEC, "document_title", title);
  expect.soft(title, "document.title is empty — tab shows the URL").not.toBe("");

  // Stylesheets actually applied: the components carry Tailwind classes; is any CSS loaded?
  const styleSheetCount = await page.evaluate(() => document.styleSheets.length);
  const bodyBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  fact(SPEC, "stylesheets_applied", styleSheetCount);
  fact(SPEC, "body_background", bodyBackground);
  expect.soft(styleSheetCount, "no stylesheet reaches the browser — Tailwind classes are inert").toBeGreaterThan(0);

  // Icon font: `material-symbols-outlined` spans hold glyph NAMES; without the font they render as words.
  const glyphSpans = page.locator(".material-symbols-outlined");
  const glyphTexts = await glyphSpans.allInnerTexts();
  const glyphFonts = await glyphSpans.evaluateAll((nodes) =>
    nodes.map((node) => getComputedStyle(node).fontFamily),
  );
  fact(SPEC, "glyph_spans", glyphTexts);
  fact(SPEC, "glyph_font_families", [...new Set(glyphFonts)]);
  for (const family of new Set(glyphFonts)) {
    expect.soft(family, `glyph rendered as literal text ("${glyphTexts[0]}") — icon font not loaded`).toMatch(
      /Material Symbols/i,
    );
  }

  // Bench-only component leaking into the operator screen (`features/panel/Filter.tsx` header
  // says it is "Bench file 3 of 3 for D1.3b", not product copy).
  const benchText = page.getByText("Filtro: any resultado serve");
  fact(SPEC, "bench_filter_text_visible", await benchText.count());
  expect.soft(await benchText.count(), "lint-bench text is visible to the operator").toBe(0);

  await shot(page, "01-painel-1280-padrao");
});
