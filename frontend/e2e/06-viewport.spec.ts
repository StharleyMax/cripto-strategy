import { expect, test } from "@playwright/test";

import { PANEL_PATH, fact, shot } from "./helpers.ts";

const SPEC = "06-viewport";

// 390 (phone). `T-01.5` wired the real Tailwind pipeline (`DESIGN_SYSTEM.md` tokens), so the
// responsive classes (`md:w-80`, `flex`) are live now.
//
// `T-10.17`: the 1280×800 case is a step of `01-console-carrega.spec.ts`'s first test — it was the
// project's default viewport (`playwright.config.ts`) on the same page, a mount paid twice
// (`E2E-analise` §3/06). That also retires this file's `[Q11]` note (`SPEC-003` §0.1 #12): the
// loop that turned ONE static `test` call site into TWO runner cases is gone, so a grep for the
// call-site token and the runner count agree again here (1 and 1).
test("viewport 390 — overflow horizontal e altura total", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(PANEL_PATH, { waitUntil: "networkidle" });
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    tablesWiderThanViewport: [...document.querySelectorAll("table")].filter(
      (table) => table.getBoundingClientRect().width > document.documentElement.clientWidth,
    ).length,
    tables: document.querySelectorAll("table").length,
  }));
  fact(SPEC, "metrics_390", metrics);
  await shot(page, "07-painel-390-mobile");
  expect.soft(metrics.scrollWidth, "horizontal overflow at 390px").toBeLessThanOrEqual(metrics.clientWidth);
  expect.soft(metrics.tablesWiderThanViewport, "tables wider than viewport at 390px").toBe(0);
  await page.close();
});
