import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { fact } from "./helpers.ts";

/**
 * W1-FIX (`docs/context/paineis-de-fluxo/gates/W1-DESIGN-REVIEW.md` MF-A) — a drag must never
 * discard the most recent edge of the loaded window.
 *
 * The defect: the seed window of every TF is 5.760 slots (4 days of the `1m` grid) and
 * `D-C3.5`'s cap is 5.000. The pager defers its right-edge cut while a pointer gesture is held
 * and applies it on release (`use-history-pager.ts::holdRightEdgeCap`), so the FIRST release —
 * with no page fetched at all — cut 760 slots off the right: the 12 h 40 min most recent, on
 * screen, with no page toward the future to bring them back. `e2e/16`/`20`/`22` measured writes,
 * mounts and jumps, and none of them looked at the right edge after the release.
 *
 * What this file reads is `<main data-window-end-ms-inclusive>`, which `SymbolClient` derives from
 * the PAGER's window (`pager.assembly.panels.window`) — so it moves exactly when the pager cuts,
 * with or without data (the weak universe of `make e2e` serves 0 bars and still has the window).
 *
 * THE PAIR:
 * - MORDE: revert `effectiveMaxAccumulatedSlots` to the raw cap (`use-history-pager.ts`,
 *   `maxSlots = seed.maxAccumulatedSlots ?? DEFAULT_MAX_ACCUMULATED_SLOTS`) and the first release
 *   moves the edge back by `760 × 60 000` ms.
 * - CALA: two drags toward the past (at most one page, which the effective cap absorbs) leave the
 *   edge where the route served it.
 *
 * Run with: `make e2e` (or `npx playwright test 27-drag-keeps-right-edge`).
 */

const SPEC = "27-drag-keeps-right-edge";
const SYMBOL_PATH = "/symbol/BTCUSDT";
/** `SymbolClient.tsx`'s `CHART_HOST_TESTID`. */
const CHART_HOST_TESTID = "symbol-chart-host";
/** Inside the price pane, the top pane of the single chart (same constant as `e2e/16`). */
const PRICE_PANE_Y_PX = 110;

async function readWindowEnd(page: Page): Promise<number> {
  const main = page.locator("main[data-window-end-ms-inclusive]");
  await expect(main, "a página não declara data-window-end-ms-inclusive").toHaveCount(1);
  const raw = await main.getAttribute("data-window-end-ms-inclusive");
  if (raw === null) {
    throw new Error("SymbolClient.tsx stopped publishing data-window-end-ms-inclusive on <main>");
  }
  return Number(raw);
}

async function readVisibleFrom(page: Page): Promise<number> {
  const host = page.locator(`[data-testid="${CHART_HOST_TESTID}"]`);
  await expect(host).toHaveAttribute("data-visible-logical-from", /.+/);
  return Number(await host.getAttribute("data-visible-logical-from"));
}

/** One drag toward the past (pointer moves RIGHT), released — the release is what applies the cut. */
async function dragTowardPast(page: Page, deltaXPx: number): Promise<void> {
  const box = await page.locator(`[data-testid="${CHART_HOST_TESTID}"]`).boundingBox();
  if (box === null) {
    throw new Error("chart host has no bounding box — nothing mounted?");
  }
  const startX = box.x + box.width / 2;
  const y = box.y + PRICE_PANE_Y_PX;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.move(startX + deltaXPx, y, { steps: 40 });
  await page.waitForTimeout(100);
  await page.mouse.up();
  await page.mouse.move(5, 5);
}

test(`MF-A: soltar o arrasto não descarta a borda direita servida (${SPEC})`, async ({ page }) => {
  const response = await page.goto(SYMBOL_PATH, { waitUntil: "networkidle" });
  expect(response?.status()).toBe(200);
  await expect(page.locator(`[data-testid="${CHART_HOST_TESTID}"]`)).toHaveCount(1);

  const servedEnd = await readWindowEnd(page);
  fact(SPEC, "window_end_served", servedEnd);

  for (const [index, deltaXPx] of [150, 150].entries()) {
    const fromBefore = await readVisibleFrom(page);
    await dragTowardPast(page, deltaXPx);
    // The drag must be REAL (the range moved), or "the edge stayed" would prove nothing.
    await expect
      .poll(() => readVisibleFrom(page), { message: "o arrasto não moveu o gráfico", timeout: 10_000 })
      .not.toBe(fromBefore);
    // Give the release's deferred cut (and a page, if one fired) time to land.
    await page.waitForTimeout(1_500);
    const endAfter = await readWindowEnd(page);
    fact(SPEC, `window_end_after_release_${index}`, endAfter);
    fact(SPEC, `window_end_lost_minutes_${index}`, (servedEnd - endAfter) / 60_000);
    expect(
      endAfter,
      `soltura ${index}: a borda direita recuou ${(servedEnd - endAfter) / 60_000} min — o teto cortou o trecho mais recente`,
    ).toBe(servedEnd);
  }
});
