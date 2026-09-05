import { expect, test } from "@playwright/test";

import { PANEL_PATH, fact, shot } from "./helpers.ts";

const SPEC = "06-viewport";

// (g) 1280 (desktop console) and 390 (phone). Without CSS the Tailwind responsive classes
// (`md:w-80`, `flex`) do nothing, so the question is what the raw HTML does at each width.
for (const viewport of [
  { width: 1280, height: 800, tag: "1280" },
  { width: 390, height: 844, tag: "390" },
]) {
  test(`viewport ${viewport.tag} — overflow horizontal e altura total`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    await page.goto(PANEL_PATH, { waitUntil: "networkidle" });
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      tablesWiderThanViewport: [...document.querySelectorAll("table")].filter(
        (table) => table.getBoundingClientRect().width > document.documentElement.clientWidth,
      ).length,
      tables: document.querySelectorAll("table").length,
      firstRowCellsClipped: [...document.querySelectorAll("tbody tr:first-child td")].filter(
        (cell) => cell.scrollWidth > cell.clientWidth,
      ).length,
    }));
    fact(SPEC, `metrics_${viewport.tag}`, metrics);
    if (viewport.tag === "390") await shot(page, "07-painel-390-mobile");
    expect.soft(metrics.scrollWidth, `horizontal overflow at ${viewport.tag}px`).toBeLessThanOrEqual(metrics.clientWidth);
    expect.soft(metrics.tablesWiderThanViewport, `tables wider than viewport at ${viewport.tag}px`).toBe(0);
    await page.close();
  });
}
