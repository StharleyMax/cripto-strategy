import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { PANEL_PATH, fact } from "./helpers.ts";

const SPEC = "05-a11y";

// (f) axe-core over the whole page, WCAG 2.0/2.1 A+AA, plus the structural landmarks a
// single-page operator console is expected to have.
test("axe-core: violações A/AA no /painel", async ({ page }) => {
  await page.goto(PANEL_PATH, { waitUntil: "networkidle" });
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.length,
    help: violation.help,
    sample: violation.nodes[0]?.html.slice(0, 120),
  }));
  fact(SPEC, "axe_violations", summary);
  fact(SPEC, "axe_violations_count", summary.length);
  fact(SPEC, "axe_passes_count", results.passes.length);
  fact(SPEC, "axe_incomplete_count", results.incomplete.length);
  const seriousOrCritical = summary.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect.soft(seriousOrCritical, "serious/critical axe violations").toEqual([]);
  expect.soft(summary, "any axe violation").toEqual([]);
});

test("landmarks e cabeçalhos", async ({ page }) => {
  await page.goto(PANEL_PATH, { waitUntil: "networkidle" });
  const h1 = await page.locator("h1").count();
  const main = await page.locator("main").count();
  const nav = await page.locator("nav, [role=navigation]").count();
  const lang = await page.locator("html").getAttribute("lang");
  const labelledInputs = await page.locator("input[aria-label], input[id]").count();
  const inputs = await page.locator("input").count();
  const tablesWithCaption = await page.locator("table caption, table[aria-label], table[aria-labelledby]").count();
  const tables = await page.locator("table").count();
  fact(SPEC, "h1_count", h1);
  fact(SPEC, "main_count", main);
  fact(SPEC, "nav_count", nav);
  fact(SPEC, "html_lang", lang);
  fact(SPEC, "inputs_total_vs_labelled", [inputs, labelledInputs]);
  fact(SPEC, "tables_total_vs_named", [tables, tablesWithCaption]);
  expect(lang).toBe("pt-BR");
  expect(main).toBe(1);
  expect.soft(h1, "no <h1> — page has no name, headings start at h2").toBeGreaterThan(0);
  expect.soft(labelledInputs, "filter input has placeholder only, no label").toBe(inputs);
  expect.soft(tablesWithCaption, "tables have no caption/aria-label").toBe(tables);
});
