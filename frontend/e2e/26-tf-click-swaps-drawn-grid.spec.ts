/**
 * `W1-QA` (`paineis-de-fluxo`, plano 01 DoD 9, `handoff/FIX-regressoes-fase05.md` §2) — clicking a TF
 * REPLACES the seed the chart was built from, instead of leaving the pager on the old one.
 *
 * Why this spec exists next to `e2e/18`, measured rather than supposed (`gates/W1-QA.md` §3):
 *
 *  1. `e2e/18` cannot see the `interval` term of `seedIdentityKey` (`T-01.F1-builder.md` §3
 *     `[ACHADO]`): `1m → 4h` also moves `knowledgeTimeMs`, so the key changes without `interval`.
 *     `1m → 5m` shares the 5-minute alignment (`request-window.ts`, `alignmentMs = max(5m, interval)`),
 *     hence the SAME `knowledgeTimeMs` — there `interval` is the ONLY term that changes, and this is
 *     the case that bites the mutation "drop `interval` from the key".
 *  2. `e2e/18`'s "the 4h click moves the right edge" is FALSE in the 5 minutes after each 4h boundary
 *     (`HH:05..HH:10` UTC, HH ∈ {00,04,…,20}): the 1m edge is 5-minute aligned and lands on the 4h
 *     boundary there `[MEDIDO 2026-09-26T00:04Z: window_before == window_after_4h, 3/3 rounds]`.
 *     This spec does not depend on the clock minute.
 *  3. The weak universe of `make e2e` serves 0 candles (`e2e/15` skips on that), so the drawn-candle
 *     count cannot tell the TFs apart there. Two readings, then:
 *       (A) ALWAYS — the chart host surface is a NEW DOM node after the click, i.e. the instance
 *           built from the old seed is gone. This is the contract `FIX-regressoes-fase05.md` §2
 *           chose (`key` = seed identity; the old seed dies with its instance, in-flight pages
 *           included). If that contract is ever replaced (e.g. `ADR-043` Perna 2 switching TF by
 *           `setData`), this reading changes WITH it, not silently.
 *       (B) when the store serves candles (the real universe) — the drawn count after the click
 *           equals a direct load of `?interval=`, and differs from the `1m` one. In the weak
 *           universe it records a fact and asserts nothing, rather than a vacuous `0 == 0`.
 *
 * Bites: (a) removing `key` from `<SymbolClient>` (both tests); (b) replacing `interval` by a
 * constant in `seedIdentityKey`'s input (the `5m` test). Silent on: the fixed code.
 */
import { expect, test, type Page } from "@playwright/test";

import { fact } from "./helpers.ts";

const SPEC = "26-tf-click-swaps-drawn-grid";
const SYMBOL_PATH = "/symbol/BTCUSDT";
const HOST = '[data-testid="symbol-chart-host"]';

async function readDrawn(page: Page): Promise<{ drawn: number; gridSlots: number; knowledgeTimeMs: number }> {
  const node = page.locator('[data-fact^="price_candles:"]');
  await expect(node, "o pane de Preço não publica price_candles:<drawn>/<gridSlots>").toHaveCount(1);
  const raw = (await node.getAttribute("data-fact")) ?? "";
  const match = /^price_candles:(\d+)\/(\d+)$/.exec(raw);
  if (match === null) {
    throw new Error(`price_candles fact has an unexpected shape: ${raw}`);
  }
  const knowledge = await page.locator("main[data-knowledge-time-ms]").getAttribute("data-knowledge-time-ms");
  return { drawn: Number(match[1]), gridSlots: Number(match[2]), knowledgeTimeMs: Number(knowledge) };
}

for (const interval of ["5m", "4h"] as const) {
  test(`clicar ${interval} troca o seed do gráfico (instância nova) e, com dado, o desenho == carga direta (${SPEC})`, async ({
    page,
  }) => {
    await page.goto(SYMBOL_PATH, { waitUntil: "networkidle" });
    await expect(page.locator(HOST)).toHaveCount(1);
    const before = await readDrawn(page);
    // Tag the CURRENT host node. A node that survives the click still carries the tag.
    await page.locator(HOST).evaluate((node) => node.setAttribute("data-qa-seed-tag", "old"));

    await page.locator(`[data-testid="timeframe-button-${interval}"]`).click();
    await page.waitForURL(new RegExp(`interval=${interval}`));
    await page.waitForLoadState("networkidle");
    await expect(page.locator(HOST)).toHaveCount(1);
    const afterClick = await readDrawn(page);
    const survivingTag = await page.locator(HOST).getAttribute("data-qa-seed-tag");

    await page.goto(`${SYMBOL_PATH}?interval=${interval}`, { waitUntil: "networkidle" });
    const direct = await readDrawn(page);
    fact(SPEC, `before_${interval}`, before);
    fact(SPEC, `after_click_${interval}`, afterClick);
    fact(SPEC, `direct_load_${interval}`, direct);
    fact(SPEC, `host_node_survived_click_${interval}`, survivingTag === "old");
    fact(SPEC, `same_knowledge_time_${interval}`, before.knowledgeTimeMs === afterClick.knowledgeTimeMs);

    // (A) — the instance built from the 1m seed must be gone.
    expect(survivingTag, `clique em ${interval}: o host do gráfico do seed de 1m sobreviveu (TF inerte, 718cb1a)`).toBeNull();

    // (B) — only where the store serves candles; otherwise the count cannot tell TFs apart.
    if (before.drawn === 0 && direct.drawn === 0) {
      fact(SPEC, `drawn_reading_${interval}`, "universo fraco: 0 velas servidas, leitura (B) não mensurável");
      return;
    }
    expect(afterClick.drawn, `velas desenhadas depois do clique ≠ carga direta de ?interval=${interval}`).toBe(direct.drawn);
    expect(afterClick.drawn, `o desenho depois do clique em ${interval} ainda é o de 1m`).not.toBe(before.drawn);
  });
}
