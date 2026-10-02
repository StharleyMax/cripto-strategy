import { expect, test, type Page } from "@playwright/test";

import { fact, shot } from "./helpers.ts";

/**
 * `T-05.6` of `paineis-de-fluxo` — the two findings of `gates/W7-DESIGN-REVIEW.md` this task closes,
 * measured in the browser against the REAL app (no fixture, no route interception).
 *
 * N-1 — the long/short band's tag ("Últimas 4 h"). Since the band became `span / step` bars it is ONE
 * bar wide on `4h` and four on `1h`, narrower than the tag. Anchored on the band's LEFT border the
 * tag ran past the plot: cut to "Última" at the price scale on `4h`, over the scale on `1024/1h`
 * (x=909..1000 against a plot edge of 944). The fix hangs it from the band's RIGHT border and clamps
 * the band to the plot. Measured at the two widths and the two TFs the review named.
 *
 * N-2 — the pane headings said `(1m, …)` beside the selected `1h` button. They now name the active
 * TF beside the native cadence: `Preço (1h · nativo 1m, USDT)`.
 *
 * Both are independent of how much data the database holds: the band is drawn over the axis grid
 * whether or not its slots are readable (`e2e/14`, weak universe), and the headings come off the
 * catalog entry and the URL.
 */

const SPEC = "41-band-tag-and-timeframe-heading";
const SYMBOL_PATH = "/symbol/BTCUSDT";
const LONG_SHORT_PANE_TESTID = "long-short-pane";

async function open(page: Page, interval: string): Promise<void> {
  const response = await page.goto(`${SYMBOL_PATH}?interval=${interval}`, { waitUntil: "networkidle" });
  expect(response?.status()).toBe(200);
  await expect(page.locator("main[data-window-start-ms]")).toHaveCount(1);
}

for (const width of [1024, 1280] as const) {
  for (const interval of ["1h", "4h"] as const) {
    test(`N-1: at ${width}/${interval} the band's tag is whole and never crosses into the price scale (${SPEC})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1100 });
      await open(page, interval);
      const pane = page.locator(`[data-testid="${LONG_SHORT_PANE_TESTID}"]`);
      const band = page.locator('[data-fact^="long_short_recent_band:"]');
      await expect(band, `the band must be drawn at ${width}/${interval}`).toHaveCount(1);
      const tag = band.locator("[data-recent-band-label]");
      await expect(tag).toHaveText(/^\s*Últimas 4 h\s*$/);
      const geometry = await band.evaluate((bandEl) => {
        const host = (bandEl as HTMLElement).offsetParent!.getBoundingClientRect();
        const bandBox = bandEl.getBoundingClientRect();
        const tagEl = bandEl.querySelector("[data-recent-band-label]") as HTMLElement;
        const tagBox = tagEl.getBoundingClientRect();
        // What is ON SCREEN of the tag: an ancestor's `overflow-hidden` cuts the paint without
        // moving the bounding box, so the box alone cannot see the "Última" defect. Hit-testing
        // cannot either (the band is `pointer-events-none`), so the tag's box is intersected with
        // every clipping ancestor's box, up to the viewport.
        let visibleLeft = Math.max(0, tagBox.left);
        let visibleRight = Math.min(window.innerWidth, tagBox.right);
        for (let node = tagEl.parentElement; node !== null; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (style.overflowX !== "visible") {
            const clip = node.getBoundingClientRect();
            visibleLeft = Math.max(visibleLeft, clip.left);
            visibleRight = Math.min(visibleRight, clip.right);
          }
        }
        return {
          hostLeft: host.left,
          plotWidth: Number(bandEl.getAttribute("data-recent-band-plot-width-px")),
          bandLeft: bandBox.left,
          bandRight: bandBox.right,
          tagLeft: tagBox.left,
          tagRight: tagBox.right,
          tagScrollWidth: tagEl.scrollWidth,
          tagClientWidth: tagEl.clientWidth,
          tagWidth: tagBox.width,
          tagVisibleWidth: Math.max(0, visibleRight - visibleLeft),
        };
      });
      for (const [key, value] of Object.entries(geometry)) {
        fact(SPEC, `n1_${width}_${interval}_${key}`, typeof value === "number" ? Math.round(value * 10) / 10 : value);
      }
      const plotRight = geometry.hostLeft + geometry.plotWidth;
      expect(geometry.plotWidth, "the chart must report the plot width the band was clamped to").toBeGreaterThan(0);
      expect(geometry.bandRight, "the band ends inside the plot").toBeLessThanOrEqual(plotRight + 1);
      expect(geometry.tagRight, "the tag must not cross into the price scale").toBeLessThanOrEqual(plotRight + 1);
      expect(geometry.tagLeft, "nor leave the plot on the left").toBeGreaterThanOrEqual(geometry.hostLeft);
      expect(geometry.tagRight, "the tag hangs from the band's right border").toBeCloseTo(geometry.bandRight, 0);
      expect(geometry.tagScrollWidth, "the tag's text is whole, not cut inside the tag").toBeLessThanOrEqual(
        geometry.tagClientWidth,
      );
      expect(geometry.tagVisibleWidth, "the whole tag is painted — no clipping ancestor cuts it").toBeGreaterThanOrEqual(
        geometry.tagWidth - 0.5,
      );
      await pane.scrollIntoViewIfNeeded();
      await shot(page, `t05-6-n1-${width}-${interval}`);
    });
  }
}

for (const interval of ["1h", "4h"] as const) {
  test(`N-2: on ${interval} every pane heading names ${interval}, beside the native cadence (${SPEC})`, async ({ page }) => {
    await open(page, interval);
    const headings = await page.locator("h2, h3").allInnerTexts();
    fact(SPEC, `n2_${interval}_headings`, headings.join(" | "));
    for (const name of ["Preço", "Volume", "Open Interest", "CVD", "Liquidações", "Long/short de contas"]) {
      const heading = headings.find((text) => text.trim().startsWith(`${name} (`));
      expect(heading, `no heading for ${name}`).toBeDefined();
      expect(heading!, `the ${name} heading must name the active TF`).toContain(`(${interval} · nativo `);
    }
  });
}

test(`N-2 CALA: on 1m the price heading is unchanged — the TF IS its native cadence (${SPEC})`, async ({ page }) => {
  await open(page, "1m");
  const headings = await page.locator("h2, h3").allInnerTexts();
  fact(SPEC, "n2_1m_headings", headings.join(" | "));
  const price = headings.find((text) => text.trim().startsWith("Preço ("));
  expect(price).toBeDefined();
  expect(price!).toContain("Preço (1m, ");
  expect(price!).not.toContain("nativo");
});
