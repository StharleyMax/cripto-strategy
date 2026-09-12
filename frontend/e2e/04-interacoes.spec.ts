import { expect, test } from "@playwright/test";

import {
  PANEL_PATH,
  fact,
  seriesCatalogEntryCount,
  seriesCatalogMetricRowCount,
} from "./helpers.ts";

const SPEC = "04-interacoes";

/**
 * `T-01.9`, `PRD-003` `RN-5`/`M3`. `T-03.3` (`F3`): `GET /series-catalog` now answers for real
 * (`T-03.2`'s backend), so `catalog` holds the rows the API actually publishes — the "casante"
 * half of `D1.9` (`1 <= n <= before`) is testable now, not `DECLARED, not silently skipped` the
 * way the pre-`T-03.3` version of this test named it. `T-01.4`'s `M3` decision (remove "abrir")
 * never depended on the API either way.
 *
 * ⚠️ THE TOTAL IS NOT TYPED IN HERE ANY MORE. It was `10` (`3` `cvd_source` + `2` price + `5`
 * `sum_open_interest`, `plano 03` item `3.1`/`D3.1`) and went red the day `T-01.6` appended an
 * eleventh row (`klines_volume`, `series_catalog.py:128`) — a feature whose whole point is adding
 * metrics cannot keep a literal count in a spec about FILTERING.
 */
test.beforeEach(async ({ page }) => {
  await page.goto(PANEL_PATH, { waitUntil: "networkidle" });
});

test("filtro do catálogo (S3) é controlado e recomputa — as linhas reais da API, reduz e some", async ({
  page,
}) => {
  const input = page.getByPlaceholder("filtrar por símbolo, métrica, fonte...");
  await expect(input).toBeVisible();

  // O TOTAL VEM DA API, não de um literal: este teste fixava `10` (`T-03.3`) e ficou vermelho
  // quando `T-01.6` acrescentou a 11ª linha (`klines_volume`, `series_catalog.py:128`), sem que
  // o FILTRO — o que ele de fato mede — tivesse mudado.
  //
  // ⚠️ E O SUBTOTAL TAMBÉM VEM DA API DESDE 2026-09-12, pelo motivo que a versão anterior
  // desta frase não previu. Ela dizia que o `5` de `sum_open_interest` "continua literal de
  // propósito"; o literal morreu quando o catálogo servido deixou de descrever UM instrumento
  // e passou a concatenar QUATRO (`list_pilot_series_catalog`, `INITIAL_SYMBOLS` =
  // BTCUSDT/ETHUSDT/LINKUSDT/SOLUSDT) — as mesmas 5 linhas de open interest são publicadas 4
  // vezes `[MEDIDO 2026-09-12: n_entries=48, sum_open_interest=20]`. O que prova que o filtro
  // REDUZ não é o número `5`: é `0 < casadas < total`, asserido abaixo sobre dois números que
  // a API acabou de declarar. Um literal aqui é falha agendada, exatamente como o `10` era.
  const expectedRows = await seriesCatalogEntryCount();
  fact(SPEC, "series_catalog_n_entries", expectedRows);
  const catalogRows = page.locator("table").nth(1).locator("tbody tr");
  const before = await catalogRows.count();
  fact(SPEC, "catalog_rows_before_filter", before);
  expect(before, "a tabela tem de mostrar exatamente as linhas que GET /series-catalog publica").toBe(expectedRows);

  // `"sum_open_interest"` (`open_interest_catalog.py`) is a `key.metric` value, and HOW MANY
  // rows carry it is asked of the API — the genuine "casante" half of `D1.9`
  // (`1 <= n < before`, strictly less, proving the filter actually REDUCES rather than merely
  // echoing the input): `RN-5` requires this on every keystroke, and `catalogRowMatchesText`
  // (`domain.ts`) matches on `metric` among other fields. The expectation is computed from
  // `key.metric` ALONE, never by re-implementing that predicate here — a test that re-derives
  // the production filter agrees with it even when both are wrong.
  const expectedMatches = await seriesCatalogMetricRowCount("sum_open_interest");
  fact(SPEC, "series_catalog_n_sum_open_interest", expectedMatches);
  expect(
    expectedMatches,
    "a API tem de publicar ALGUMA linha de open interest — sem ela o filtro nao e testavel",
  ).toBeGreaterThan(0);
  expect(
    expectedMatches,
    "o filtro so prova que REDUZ se o subtotal casado for menor que o total publicado",
  ).toBeLessThan(expectedRows);

  await input.fill("sum_open_interest");
  await expect(input).toHaveValue("sum_open_interest"); // controlled input echoes — RN-5
  await page.waitForTimeout(300);
  const afterMatch = await catalogRows.count();
  fact(SPEC, "catalog_rows_after_matching_filter", afterMatch);
  expect(
    afterMatch,
    "'sum_open_interest' casa as linhas de open interest que a API publica, nao o total dela",
  ).toBe(expectedMatches);

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
