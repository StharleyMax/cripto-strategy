import { expect, test } from "@playwright/test";

import { PANEL_PATH, fact, shot } from "./helpers.ts";

const SPEC = "04-interacoes";

// (e) Every visible control on S1/S3: does it do anything? The design decision
// (`T-06.10-design.md`) promises a filterable catalog (CAMADA 1) and a raw-rows layer that
// opens on "abrir" (CAMADA 2). `page.tsx` wires `filterText` into the component but builds the
// view-model with `EMPTY_CATALOG_FILTER`, and discards `openedSeriesId`.
test.beforeEach(async ({ page }) => {
  await page.goto(PANEL_PATH, { waitUntil: "networkidle" });
});

test("inventário de controles interativos", async ({ page }) => {
  const controls = page.locator("button, input, select, textarea, a[href], [role=button], [tabindex]:not([tabindex='-1'])");
  const inventory = await controls.evaluateAll((nodes) =>
    nodes.map((node) => ({
      tag: node.tagName.toLowerCase(),
      type: node.getAttribute("type"),
      text: (node.textContent ?? "").trim().slice(0, 40),
      placeholder: node.getAttribute("placeholder"),
      ariaLabel: node.getAttribute("aria-label"),
    })),
  );
  fact(SPEC, "interactive_controls", inventory);
  fact(SPEC, "interactive_controls_count", inventory.length);
  fact(SPEC, "s1_controls_count", await page.locator("section").first().locator("button, input, select, a[href]").count());
});

test("filtro do catálogo (S3) — digitar reduz as linhas?", async ({ page }) => {
  const input = page.getByPlaceholder("filtrar por símbolo, métrica, fonte...");
  await expect(input).toBeVisible();
  const catalogRows = page.locator("table").nth(1).locator("tbody tr");
  const before = await catalogRows.count();
  await input.fill("zzz-nenhuma-serie-casa");
  await expect(input).toHaveValue("zzz-nenhuma-serie-casa"); // controlled input echoes — the setter IS wired
  await page.waitForTimeout(500);
  const afterNoMatch = await catalogRows.count();
  await input.fill("open_interest");
  await page.waitForTimeout(500);
  const afterMatch = await catalogRows.count();
  await shot(page, "05-filtro-digitado-sem-efeito");

  fact(SPEC, "catalog_rows_before_filter", before);
  fact(SPEC, "catalog_rows_after_nonmatching_filter", afterNoMatch);
  fact(SPEC, "catalog_rows_after_matching_filter", afterMatch);
  expect.soft(afterNoMatch, "non-matching filter text leaves every row — the filter is inert").toBe(0);
});

test("botão 'abrir' (S3) — abre a CAMADA 2 'Linhas Cruas'?", async ({ page }) => {
  const openButtons = page.getByRole("button", { name: "abrir" });
  const count = await openButtons.count();
  fact(SPEC, "abrir_buttons", count);
  expect(count).toBeGreaterThan(0);

  await openButtons.first().click();
  await page.waitForTimeout(500);
  const rawRowsHeading = page.getByRole("heading", { name: /Linhas Cruas/ });
  const rawRowsVisible = await rawRowsHeading.count();
  const urlAfterClick = page.url();
  await shot(page, "06-abrir-clicado-sem-efeito");

  fact(SPEC, "linhas_cruas_heading_after_click", rawRowsVisible);
  fact(SPEC, "url_after_click", urlAfterClick);
  expect.soft(rawRowsVisible, "clicking 'abrir' renders nothing — CAMADA 2 never mounts").toBeGreaterThan(0);
});

test("gaveta de quarentena — colapsa/expande?", async ({ page }) => {
  const drawer = page.locator("aside");
  const toggles = await drawer.locator("button, summary, [aria-expanded]").count();
  const drawerText = (await drawer.innerText()).slice(0, 200);
  fact(SPEC, "quarantine_drawer_toggle_controls", toggles);
  fact(SPEC, "quarantine_drawer_text", drawerText);
  expect.soft(toggles, "design calls it 'painel colapsável'; there is no control to collapse it").toBeGreaterThan(0);
});

test("teclado — Tab alcança input e botões; foco é visível?", async ({ page }) => {
  await page.keyboard.press("Tab");
  const first = await page.evaluate(() => document.activeElement?.tagName.toLowerCase() ?? null);
  await page.keyboard.press("Tab");
  const second = await page.evaluate(() => document.activeElement?.tagName.toLowerCase() ?? null);
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el ? getComputedStyle(el).outlineStyle : null;
  });
  fact(SPEC, "tab_order_first_two", [first, second]);
  fact(SPEC, "focus_outline_style_on_second", outline);
  expect(first).toBe("input");
  expect(second).toBe("button");
});
