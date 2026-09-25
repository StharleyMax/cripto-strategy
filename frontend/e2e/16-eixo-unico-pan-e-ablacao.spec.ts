import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { fact } from "./helpers.ts";

/**
 * `T-02.6` (`CST-213`, plan `02` `DoD-2`/`DoD-3`/`DoD-4`), RE-ANCHORED on the single chart host of
 * `T-01.5` (`paineis-de-fluxo`, `ARQ-1` §6, `handoff/FIX-regressoes-fase05.md` §3).
 *
 * ── WHAT CHANGED, AND WHY THE OLD ASSERTIONS ARE GONE ─────────────────────────────────────────
 *
 * Until `T-01.5` the page had SIX `IChartApi` instances and this file read six
 * `[data-testid="<pane>"] [data-visible-logical-from]` containers, asserting that the five
 * non-origin ones followed Price in lockstep. There is now ONE chart with six panes sharing ONE
 * `timeScale`: the five cannot disagree with Price, by construction, so a "the five follow" /
 * "the five stop following" assertion measures nothing. Per `FIX` §3, what this file proves now is
 * the property whose violation WAS the defect of `16` (a late echo written back into the panel
 * being dragged): **the dispatcher never writes into the origin during its own gesture** —
 * `data-axis-sync-write-count` on the host stays `0` across real drags, and stops moving once the
 * gestures stop. "One axis, pixel for pixel" is `CA-2'`, proven by `T-01.9`, not here.
 *
 * ── THE PAIR (MORDE/CALA) ───────────────────────────────────────────────────────────────────
 *
 * - `DoD-2/DoD-4` BITES on the mutation "the dispatcher writes into the origin" (drop the
 *   `index === originIndex` `continue` in `frontend/src/charts/range-dispatch.ts`): the host's
 *   counter goes above `0` on the first gesture.
 * - `DoD-3/CA-6` is the ablation (`?e2eAxisSyncDisabled=1`, `withAxisSyncAblation` silences the
 *   "despacha" verb): the SAME gesture still moves the chart natively, and the counter stays `0`
 *   EVEN UNDER that mutation — which is what proves the counter is fed by the dispatch path and
 *   by nothing else (a counter that stayed `0` for an unrelated reason would make the first test
 *   green by accident).
 *
 * Run with: `make e2e` (or `npx playwright test 16-eixo-unico-pan-e-ablacao`).
 */

const SPEC = "16-eixo-unico-pan-e-ablacao";
const SYMBOL = "BTCUSDT";
const SYMBOL_PATH = `/symbol/${SYMBOL}`;
const ABLATION_QUERY = "e2eAxisSyncDisabled=1";

/** `SymbolClient.tsx`'s `CHART_HOST_TESTID` — the element the ONE chart is created in. */
const CHART_HOST_TESTID = "symbol-chart-host";
/** The price pane is the TOP pane of the single chart — same constant `e2e/22` uses. `T-01.8`
 * (`paineis-de-fluxo`): since `T-01.6` set the stretch factors the pane is ~335px of a 910px chart
 * (`charts::stackedPaneLayout`, weight 34 of 89), so 110px from the host's top is still inside it —
 * no longer its middle, but the drag only needs to start in the pane. */
const PRICE_PANE_MID_Y_PX = 110;

interface HostPosition {
  readonly from: number;
  readonly to: number;
  readonly writeCount: number;
}

function hostLocator(page: Page) {
  return page.locator(`[data-testid="${CHART_HOST_TESTID}"]`);
}

/** Reads `data-visible-logical-from`/`-to`/`data-axis-sync-write-count` off the ONE host. */
async function readHostPosition(page: Page): Promise<HostPosition> {
  const host = hostLocator(page);
  await expect(host, "nenhum host de gráfico com data-visible-logical-from no DOM").toHaveAttribute(
    "data-visible-logical-from",
    /.+/,
  );
  const [from, to, writeCount] = await Promise.all([
    host.getAttribute("data-visible-logical-from"),
    host.getAttribute("data-visible-logical-to"),
    host.getAttribute("data-axis-sync-write-count"),
  ]);
  if (from === null || to === null || writeCount === null) {
    throw new Error("chart host: one of the three position/count attributes is missing");
  }
  return { from: Number(from), to: Number(to), writeCount: Number(writeCount) };
}

/** Waits until the host's `data-visible-logical-from` differs from `previousFrom` — the drag
 * registered as a range change, not merely a mouse move over the canvas. */
async function waitForRangeToChange(page: Page, previousFrom: number): Promise<void> {
  await expect
    .poll(async () => (await readHostPosition(page)).from, {
      message: "o gráfico não mudou de range após o arrasto",
      timeout: 10_000,
    })
    .not.toBe(previousFrom);
}

/**
 * One horizontal drag in the price pane of the single chart. `deltaXPx` MUST be POSITIVE —
 * `[MEDIDO 2026-09-21]`: dragging LEFT never changed the range over a 10s poll (the settled initial
 * view sits at the right edge of the real data), dragging RIGHT did immediately. The 100 ms pauses
 * either side of the move are what makes the library see a drag, not a teleport `[MEDIDO 2026-09-21]`.
 */
async function dragPricePane(
  page: Page,
  deltaXPx: number,
): Promise<{ readonly before: HostPosition; readonly duringGesture: HostPosition }> {
  if (deltaXPx <= 0) {
    throw new Error(`dragPricePane: deltaXPx must be positive (see this function's docstring), received ${deltaXPx}`);
  }
  const box = await hostLocator(page).boundingBox();
  if (box === null) {
    throw new Error("chart host has no bounding box — nothing mounted?");
  }
  const startX = box.x + box.width / 2;
  const y = box.y + PRICE_PANE_MID_Y_PX;
  const before = await readHostPosition(page);
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.move(startX + deltaXPx, y, { steps: 50 });
  await page.waitForTimeout(100);
  // Read while the pointer is still held: the pager defers its right-edge cut until the gesture
  // ends (`holdRightEdgeCap`), so this is the chart's own native pan, before anything else writes.
  const duringGesture = await readHostPosition(page);
  await page.mouse.up();
  return { before, duringGesture };
}

async function gotoSymbol(page: Page, query?: string): Promise<void> {
  const url = query === undefined ? SYMBOL_PATH : `${SYMBOL_PATH}?${query}`;
  const response = await page.goto(url, { waitUntil: "networkidle" });
  fact(SPEC, `http_status:${query ?? "none"}`, response?.status() ?? null);
  expect(response?.status()).toBe(200);
  // The one chart must have applied its INITIAL framing before any gesture is attempted.
  await expect(hostLocator(page)).toHaveCount(1);
  await readHostPosition(page);
}

/**
 * Polls the host until two consecutive reads, `quietMs` apart, agree on range AND counter — the
 * mount-time settle (or a gesture's tail of per-frame range notifications) is over.
 */
async function waitForHostToSettle(page: Page, quietMs = 400, maxRounds = 25): Promise<HostPosition> {
  let previous = await readHostPosition(page);
  for (let round = 0; round < maxRounds; round += 1) {
    await page.waitForTimeout(quietMs);
    const current = await readHostPosition(page);
    if (JSON.stringify(current) === JSON.stringify(previous)) {
      return current;
    }
    previous = current;
  }
  throw new Error(`chart host never settled after ${maxRounds} rounds of ${quietMs}ms — looks like DoD-4's feedback loop`);
}

// ── `DoD-2` + `DoD-4`: three distinct drags, the origin is never written, no loop ─────────────

test(`DoD-2/DoD-4: N=3 arrastos distintos no painel de Preço — o dispatcher NUNCA escreve na origem, e nada se move sem gesto (${SPEC})`, async ({ page }) => {
  await gotoSymbol(page);

  let previous = await waitForHostToSettle(page);
  fact(SPEC, "host_write_count:baseline", previous.writeCount);
  expect(previous.writeCount, "o dispatcher escreveu no host antes de qualquer gesto").toBe(0);

  const deltasPx = [150, 260, 90] as const; // n=3, distinct — all positive, see dragPricePane
  for (const [gestureIndex, deltaXPx] of deltasPx.entries()) {
    const { before } = await dragPricePane(page, deltaXPx);
    await waitForRangeToChange(page, before.from);
    const settled = await waitForHostToSettle(page);
    fact(SPEC, `host_from:gesture_${gestureIndex}`, settled.from);
    fact(SPEC, `host_to:gesture_${gestureIndex}`, settled.to);
    fact(SPEC, `host_write_count_delta:gesture_${gestureIndex}`, settled.writeCount - previous.writeCount);
    // ⛔ The defect of `16`: an echo written back into the chart being dragged.
    expect(
      settled.writeCount - previous.writeCount,
      `gesto ${gestureIndex} (Δ=${deltaXPx}px): o dispatcher escreveu na origem durante o próprio arrasto`,
    ).toBe(0);
    previous = settled;
  }

  // `DoD-4` — NO LOOP: after the last settled gesture, waiting with no input must move nothing.
  await page.waitForTimeout(1_000);
  const afterIdle = await readHostPosition(page);
  fact(SPEC, "host_write_count:after_idle", afterIdle.writeCount);
  expect(afterIdle, "o host continuou mudando sem nenhum gesto novo — laço de realimentação (DoD-4)").toEqual(previous);
});

// ── `DoD-3`/`CA-6`: the ablation — same gesture, native pan intact, dispatch silent ───────────

test(`DoD-3/CA-6 (ablação): com a assinatura desligada (?${ABLATION_QUERY}), o arrasto nativo continua e o dispatcher não escreve nenhuma vez (${SPEC})`, async ({ page }) => {
  await gotoSymbol(page, ABLATION_QUERY);

  const settledBefore = await waitForHostToSettle(page);
  const { before, duringGesture } = await dragPricePane(page, 150);
  const after = await waitForHostToSettle(page);

  fact(SPEC, "ablation_host_from_settled_before", settledBefore.from);
  fact(SPEC, "ablation_host_from_during_gesture", duringGesture.from);
  fact(SPEC, "ablation_host_from_after", after.from);
  fact(SPEC, "ablation_host_write_count_after", after.writeCount);
  // The gesture must still be REAL — the ablation silences only the "despacha" verb, never the
  // chart's own native pan. No movement here would make the counter assertion below meaningless.
  //
  // ⚠️ Read DURING the gesture, not after it, on purpose `[MEDIDO 2026-09-24, MutationObserver on
  // the host, n=1 drag each way]`: without the ablation the settled range stays where the drag left
  // it (`3313 → 3031`); WITH it the range reaches `3031` during the drag and then snaps back to
  // `3313` when the pager's deferred right-edge cut lands on pointer-up — that cut restores the
  // REGISTERED range, which the silenced dispatch never updated. The snap-back is itself the
  // ablation's footprint, but it depends on the cut firing (a data-dependent event), so it is a
  // fact here, not an assertion.
  expect(duringGesture.from, "o gráfico deveria continuar respondendo ao arrasto nativo").not.toBe(before.from);
  // With dispatch silenced the counter cannot move, even if the dispatcher were writing into the
  // origin — the negative control that ties the first test's counter to the dispatch path.
  expect(after.writeCount, "com a assinatura desligada, o dispatcher não deveria ter escrito nenhuma vez").toBe(0);
});
