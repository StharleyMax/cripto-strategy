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
 * TF outside the parenthesis and the series inside it: `Preço 1h (1m, USDT)` (norm:
 * `gates/T-05.6-DESIGN-GATE.md` §(b).4). The word "nativa" is NOT on the visible line — it would cut
 * `(escala linear)` at 1024 (`e2e/40` C-3) — but in a screen-reader-only suffix inside the heading and
 * in its `title`, and NEVER in an `aria-label` (which would replace the heading's accessible name).
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

/** The pane names and, for the two the design handoff spells out, the exact series terms. The others
 * are read off the catalog, so only the SHAPE is judged for them. */
const PANE_NAMES = ["Preço", "Volume", "Open Interest", "CVD", "Liquidações", "Long/short de contas"] as const;
const EXACT_SERIES: Readonly<Record<string, string>> = { Preço: "1m, USDT", Volume: "1m, BTC" };

interface HeadingReading {
  readonly visible: string;
  readonly srOnly: string;
  readonly title: string | null;
  readonly ariaLabel: string | null;
  readonly textTransform: string;
}

/** Every `h2`/`h3`: its VISIBLE text (the `sr-only` nodes taken out), the `sr-only` text, `title`,
 * `aria-label` and computed `text-transform`. `innerText` alone cannot separate the two, because an
 * `sr-only` node is rendered (clipped, not `display:none`) and its text is in `innerText`. */
async function readHeadings(page: Page): Promise<HeadingReading[]> {
  return page.locator("h2, h3").evaluateAll((nodes) =>
    nodes.map((node) => {
      const clone = node.cloneNode(true) as HTMLElement;
      const hidden = [...clone.querySelectorAll(".sr-only")];
      const srOnly = hidden.map((el) => el.textContent ?? "").join("");
      for (const el of hidden) el.remove();
      return {
        visible: (clone.textContent ?? "").replace(/\s+/g, " ").trim(),
        srOnly,
        title: node.getAttribute("title"),
        ariaLabel: node.getAttribute("aria-label"),
        textTransform: getComputedStyle(node).textTransform,
      };
    }),
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

for (const interval of ["1m", "15m", "1h", "4h"] as const) {
  test(`N-2: on ${interval} every pane heading reads '<name> ${interval} (<native>, <unit>)', the TF token is the active button's glyph, and "nativa" reaches the screen reader without an aria-label (${SPEC})`, async ({
    page,
  }) => {
    await open(page, interval);
    const button = page.locator(`[data-testid="timeframe-button-${interval}"][aria-pressed="true"]`);
    await expect(button, `the ${interval} button must be the pressed one`).toHaveCount(1);
    // CASE-EXACT: the token after the name is compared with what the pressed button PRINTS, not with
    // the URL — `toUpperCase()` on either side would make `1m` read `1M`, which is MONTH.
    const buttonText = (await button.textContent())?.trim() ?? "";
    expect(buttonText).toBe(interval);
    const buttonTransform = await button.evaluate((el) => getComputedStyle(el).textTransform);
    expect(buttonTransform, "the TF button is never case-transformed").toBe("none");

    const headings = await readHeadings(page);
    fact(SPEC, `n2_${interval}_headings`, headings.map((h) => `${h.visible} [sr:${h.srOnly}] [title:${h.title}]`).join(" | "));
    for (const name of PANE_NAMES) {
      const heading = headings.find((h) => h.visible.startsWith(`${name} `));
      expect(heading, `no heading for ${name}`).toBeDefined();
      const match = new RegExp(`^${escapeRegExp(name)} (\\S+) \\(([^,()]+), ([^()]+)\\)$`).exec(heading!.visible);
      expect(match, `the ${name} heading is not '<name> <TF> (<native>, <unit>)': '${heading!.visible}'`).not.toBeNull();
      const [, token, native, unit] = match!;
      expect(token, `the token after ${name} is the pressed button's text, case and all`).toBe(buttonText);
      if (EXACT_SERIES[name] !== undefined) expect(`${native}, ${unit}`).toBe(EXACT_SERIES[name]);
      expect(heading!.visible, `the word "nativa" is off the visible ${name} line`).not.toMatch(/nativ/);
      expect(heading!.srOnly).toBe(` — barras de ${buttonText}, série nativa de ${native}`);
      expect(heading!.title).toBe(`Barras de ${buttonText} · série nativa de ${native}, ${unit}`);
      expect(heading!.ariaLabel, `an aria-label on the ${name} heading would REPLACE its accessible name`).toBeNull();
      expect(heading!.textTransform, `the ${name} heading is never case-transformed`).toBe("none");
      // The accessible name is the visible text FOLLOWED by the suffix — it starts with what is on
      // screen (WCAG 2.5.3), and the heading list still says the pane's name.
      await expect(
        page.getByRole("heading", { name: `${heading!.visible}${heading!.srOnly}`, exact: true }),
        `the ${name} heading's accessible name`,
      ).toHaveCount(1);
    }
  });
}
