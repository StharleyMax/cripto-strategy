import { expect, test } from "@playwright/test";

import { PANEL_PATH, fact } from "./helpers.ts";

const SPEC = "04-interacoes";

/**
 * `T-01.9`, `PRD-003` `RN-5`/`M3`. Both tests here are ambient-independent: `GET
 * /series-catalog` does not exist until `T-03.2` (`F3`), so `catalog` is `EMPTY_CATALOG`
 * (`page.tsx:49`) regardless of whether `ingest-health` answers — the filter has nothing to
 * reduce either way, and `T-01.4`'s `M3` decision (remove "abrir") does not depend on the API.
 */
test.beforeEach(async ({ page }) => {
  await page.goto(PANEL_PATH, { waitUntil: "networkidle" });
});

test("filtro do catálogo (S3) é controlado e recomputa — 0 linhas em F1, sem GET /series-catalog ainda", async ({
  page,
}) => {
  const input = page.getByPlaceholder("filtrar por símbolo, métrica, fonte...");
  await expect(input).toBeVisible();

  const catalogRows = page.locator("table").nth(1).locator("tbody tr");
  const before = await catalogRows.count();
  fact(SPEC, "catalog_rows_before_filter", before);

  await input.fill("zzz-nenhuma-serie-casa");
  await expect(input).toHaveValue("zzz-nenhuma-serie-casa"); // controlled input echoes — RN-5
  await page.waitForTimeout(300);
  const afterNoMatch = await catalogRows.count();
  fact(SPEC, "catalog_rows_after_nonmatching_filter", afterNoMatch);

  // `T-03.2` (`F3`) is the task that gives the catalog real rows; until then the "casante"
  // half of `D1.9` (`1 <= n <= before`) has no non-empty catalog to prove it against —
  // DECLARED, not silently skipped (`plano 01`: "e2e 04 não roda sem catálogo").
  fact(SPEC, "catalog_matching_case_testable_in_f1", before > 0);

  expect(before).toBe(0);
  expect(afterNoMatch, "non-matching filter text leaves a row — the filter is inert").toBe(0);
});

test("botão 'abrir' (Camada 2) foi removido — M3, tasks_review.md §1", async ({ page }) => {
  const openButtons = page.getByRole("button", { name: "abrir" });
  const count = await openButtons.count();
  fact(SPEC, "abrir_buttons", count);
  expect(count, "'abrir' still mounted — M3 removed it (openedSeriesId has no setter left)").toBe(0);
});
