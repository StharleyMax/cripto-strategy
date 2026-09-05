import { expect, test } from "@playwright/test";

import { PANEL_PATH, fact } from "./helpers.ts";

const SPEC = "07-locale";

// (h) SPEC-001 §3.8: numerals on a DATA path are locale-invariant (dot decimal, no thousands
// separator); pt-BR is legitimate ONLY in microcopy and axis labels. On-screen cells are
// microcopy, so pt-BR is allowed — but ONE convention per screen is the minimum an operator
// can read without guessing which mark is the decimal.
test("numerais visíveis — que marca decimal e de milhar cada célula usa?", async ({ page }) => {
  await page.goto(PANEL_PATH, { waitUntil: "networkidle" });
  const text = await page.locator("main").innerText();

  const commaDecimal = text.match(/\d,\d/g) ?? []; // "7,0 dias"
  const dotDecimal = text.match(/\d\.\d(?!\d\d)/g) ?? []; // "99.8%", "1.2"
  const dotThousands = text.match(/\d\.\d{3}(?!\d)/g) ?? []; // "2.016 pts"
  const bareThousands = text.match(/\b\d{4,}\b/g) ?? []; // "1440/1440"
  const percent = text.match(/\d+[.,]\d+%/g) ?? [];

  const s1Retention = await page.locator("table").first().locator("tbody tr td:nth-child(2)").allInnerTexts();
  const s1Status = await page.locator("table").first().locator("tbody tr td:nth-child(4)").allInnerTexts();
  const s3Completeness = await page.locator("table").nth(1).locator("tbody tr td:nth-child(3)").allInnerTexts();
  const budget = await page.getByText(/GB\/DIA/).locator("..").innerText();

  fact(SPEC, "s1_retention_cells", s1Retention);
  fact(SPEC, "s1_status_cells", s1Status);
  fact(SPEC, "s3_completeness_cells", s3Completeness);
  fact(SPEC, "storage_budget_block", budget.replace(/\n/g, " | "));
  fact(SPEC, "comma_decimal_hits", commaDecimal);
  fact(SPEC, "dot_decimal_hits", dotDecimal);
  fact(SPEC, "dot_thousands_hits", dotThousands);
  fact(SPEC, "bare_thousands_hits", bareThousands);
  fact(SPEC, "percent_hits", percent);

  const decimalConventions = (commaDecimal.length > 0 ? 1 : 0) + (dotDecimal.length > 0 ? 1 : 0);
  const thousandsConventions = (dotThousands.length > 0 ? 1 : 0) + (bareThousands.length > 0 ? 1 : 0);
  fact(SPEC, "decimal_conventions_on_screen", decimalConventions);
  fact(SPEC, "thousands_conventions_on_screen", thousandsConventions);
  expect.soft(decimalConventions, "two decimal marks on one screen (`,` in dias, `.` in % and GB/dia)").toBeLessThanOrEqual(1);
  expect.soft(thousandsConventions, "two thousands conventions on one screen (`2.016` vs `1440`)").toBeLessThanOrEqual(1);
});
