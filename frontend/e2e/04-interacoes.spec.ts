import { expect, test } from "@playwright/test";

import { PANEL_PATH, fact } from "./helpers.ts";

const SPEC = "04-interacoes";

/**
 * `T-01.9`, `PRD-003` `RN-5`/`M3`. `T-03.3` (`F3`): `GET /series-catalog` now answers for real
 * (`T-03.2`'s backend), so `catalog` is the 10 real rows (`3` `cvd_source` + `2` price + `5`
 * `sum_open_interest`, `plano 03` item `3.1`/`D3.1`) — the "casante" half of `D1.9` (`1 <= n <=
 * before`) is testable now, not `DECLARED, not silently skipped` the way the pre-`T-03.3`
 * version of this test named it. `T-01.4`'s `M3` decision (remove "abrir") never depended on
 * the API either way.
 */
test.beforeEach(async ({ page }) => {
  await page.goto(PANEL_PATH, { waitUntil: "networkidle" });
});

test("filtro do catálogo (S3) é controlado e recomputa — 10 linhas reais desde T-03.3, reduz e some", async ({
  page,
}) => {
  const input = page.getByPlaceholder("filtrar por símbolo, métrica, fonte...");
  await expect(input).toBeVisible();

  const catalogRows = page.locator("table").nth(1).locator("tbody tr");
  const before = await catalogRows.count();
  fact(SPEC, "catalog_rows_before_filter", before);
  expect(before, "10 real rows since T-03.2/T-03.3 — GET /series-catalog is wired now").toBe(10);

  // `"sum_open_interest"` (`open_interest_catalog.py`) matches EXACTLY 5 of the 10 rows — the
  // genuine "casante" half of `D1.9` (`1 <= n <= before`, and strictly less, proving the filter
  // actually REDUCES rather than merely echoing the input): `RN-5` requires this on every
  // keystroke, `catalogRowMatchesText` (`domain.ts`) matches on `metric` among other fields.
  await input.fill("sum_open_interest");
  await expect(input).toHaveValue("sum_open_interest"); // controlled input echoes — RN-5
  await page.waitForTimeout(300);
  const afterMatch = await catalogRows.count();
  fact(SPEC, "catalog_rows_after_matching_filter", afterMatch);
  expect(afterMatch, "'sum_open_interest' matches the 5 open-interest rows, not all 10").toBe(5);

  await input.fill("zzz-nenhuma-serie-casa");
  await expect(input).toHaveValue("zzz-nenhuma-serie-casa");
  await page.waitForTimeout(300);
  const afterNoMatch = await catalogRows.count();
  fact(SPEC, "catalog_rows_after_nonmatching_filter", afterNoMatch);
  expect(afterNoMatch, "non-matching filter text leaves a row — the filter is inert").toBe(0);
});

test("botão 'abrir' (Camada 2) foi removido — M3, tasks_review.md §1", async ({ page }) => {
  const openButtons = page.getByRole("button", { name: "abrir" });
  const count = await openButtons.count();
  fact(SPEC, "abrir_buttons", count);
  expect(count, "'abrir' still mounted — M3 removed it (openedSeriesId has no setter left)").toBe(0);
});
