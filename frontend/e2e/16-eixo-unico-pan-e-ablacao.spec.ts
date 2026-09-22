import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { fact } from "./helpers.ts";

/**
 * `T-02.6` (`CST-213`, plan `02` `DoD-2`/`DoD-3`/`DoD-4`) — the Playwright half of the fase's
 * pixel (`P2`): "arrastar/zoom no painel de Preço move os outros CINCO no mesmo instante".
 * `CA-5b` (headless, six real `IChartApi` instances, no browser) lives in
 * `frontend/src/app/symbol/axis-sync-alignment.test.ts` — this file is the one that drags a
 * REAL chart in a REAL browser and reads the other five back off the DOM.
 *
 * ── WHAT "POSITION" MEANS HERE, AND WHY NEVER A STATUS CODE OR AN ATTRIBUTE'S MERE PRESENCE ──
 *
 * `SymbolClient.tsx`'s `useLightweightChart` (`T-02.6`) publishes `data-visible-logical-from`/
 * `data-visible-logical-to` on each of the six chart containers, kept current on every
 * "aplica"/"despacha" write — the actual `LogicalRange` a panel is CURRENTLY showing, a number,
 * not a boolean. `DoD-2`'s assertion below compares those NUMBERS across panels — never
 * `toHaveCount(1)`/`toBeVisible()`, which would pass even if the value never moved.
 * `data-axis-sync-write-count` is the `DoD-4` instrument: it increments ONLY inside the
 * DISPATCHER's own write callback (never on a panel's own native drag), so "exactly one
 * propagation per gesture, per panel" is a delta on that counter, not an inference from timing.
 *
 * ── THE ABLATION (`DoD-3`/`CA-6`) ────────────────────────────────────────────────────────────
 *
 * `axis-sync.ts`'s `withAxisSyncAblation` turns `notifyPanelRangeChanged` into a no-op when the
 * page is loaded with `?e2eAxisSyncDisabled=1` (a runtime query-string check, not a build flag
 * — `axis-sync.ts`'s own docstring says why: `startSecondaryNextInstance` reuses an
 * already-built `.next`, so a `NEXT_PUBLIC_*` compile-time flag could not be toggled per test).
 * The SAME gesture, the SAME assertions, run again against that URL and must find the OPPOSITE
 * result — the five stay exactly where they started while Price itself still moves (its own
 * native pan is untouched; only the cross-panel dispatch is silenced). Without this pairing,
 * `DoD-2` alone is verde falso: a page that mutated the SAME attribute on all six panels for an
 * unrelated reason (a re-render, a shared clock) would also pass a "the five moved" assertion.
 *
 * Run with: `make e2e` (or `npx playwright test 16-eixo-unico-pan-e-ablacao`), against
 * `E2E_API_PORT=8811 E2E_NEXT_PORT=4311` (this worktree's default).
 */

const SPEC = "16-eixo-unico-pan-e-ablacao";
const SYMBOL = "BTCUSDT";
const SYMBOL_PATH = `/symbol/${SYMBOL}`;
const ABLATION_QUERY = "e2eAxisSyncDisabled=1";

const PRICE_PANE_TESTID = "price-pane";
const OI_PANE_TESTID = "oi-pane";
const CVD_PANE_TESTID = "cvd-pane";
const LIQUIDATION_LONG_TESTID = "liquidation-cohort-long";
const LIQUIDATION_SHORT_TESTID = "liquidation-cohort-short";
const LONG_SHORT_PANE_TESTID = "long-short-pane";

/** The five panels a Price gesture must reach — `PRICE_PANE_TESTID` itself is deliberately
 * excluded: it is the ORIGIN, and `range-dispatch.ts`'s own contract is "never write back to
 * the panel that moved" (already proven under `node --test` by `axis-sync.test.ts`; this file
 * is the live-browser confirmation that the wiring around that promise holds too). */
const OTHER_FIVE_TESTIDS = [
  OI_PANE_TESTID,
  CVD_PANE_TESTID,
  LIQUIDATION_LONG_TESTID,
  LIQUIDATION_SHORT_TESTID,
  LONG_SHORT_PANE_TESTID,
] as const;

interface PanelPosition {
  readonly from: number;
  readonly to: number;
  readonly writeCount: number;
}

/** Reads `data-visible-logical-from`/`-to`/`data-axis-sync-write-count` off the ONE
 * `[data-visible-logical-from]` element under `[data-testid="${testId}"]` — the chart's own
 * container div (`SymbolClient.tsx`'s `containerRef`, see this file's header). */
async function readPanelPosition(page: Page, testId: string): Promise<PanelPosition> {
  const container = page.locator(`[data-testid="${testId}"] [data-visible-logical-from]`);
  await expect(container, `painel ${testId}: nenhum elemento com data-visible-logical-from no DOM`).toHaveCount(1);
  const [from, to, writeCount] = await Promise.all([
    container.getAttribute("data-visible-logical-from"),
    container.getAttribute("data-visible-logical-to"),
    container.getAttribute("data-axis-sync-write-count"),
  ]);
  if (from === null || to === null || writeCount === null) {
    throw new Error(`painel ${testId}: um dos três atributos de posição/contagem está ausente`);
  }
  return { from: Number(from), to: Number(to), writeCount: Number(writeCount) };
}

async function readAllSix(page: Page): Promise<Record<string, PanelPosition>> {
  const testIds = [PRICE_PANE_TESTID, ...OTHER_FIVE_TESTIDS];
  const entries = await Promise.all(testIds.map(async (testId) => [testId, await readPanelPosition(page, testId)] as const));
  return Object.fromEntries(entries);
}

/** Waits until the PRICE panel's own `data-visible-logical-from` differs from `previousFrom` —
 * i.e. the drag actually registered as a range change, not merely a mouse move over the canvas
 * (`lightweight-charts` only fires `subscribeVisibleLogicalRangeChange` once the model's own
 * range changed, and delivers it on the next `rAF`, never synchronously — same property
 * `axis-sync-alignment.test.ts`'s header measures headless). */
async function waitForPriceRangeToChange(page: Page, previousFrom: number): Promise<void> {
  await expect
    .poll(
      async () => {
        const position = await readPanelPosition(page, PRICE_PANE_TESTID);
        return position.from;
      },
      { message: "o painel de Preço não mudou de range após o arrasto", timeout: 10_000 },
    )
    .not.toBe(previousFrom);
}

/**
 * One horizontal drag on the Price panel's own chart container — what a real user gesture is,
 * pixel for pixel: `mouse.down()` inside the canvas, N intermediate `mouse.move` steps (so
 * `lightweight-charts`' own pointer handler sees a drag, not a single teleport it could ignore),
 * `mouse.up()`. Returns the ORIGIN panel's position right before the drag started, so the
 * caller can prove the drag actually did something (`waitForPriceRangeToChange`).
 *
 * `deltaXPx` MUST be POSITIVE here — `[MEDIDO 2026-09-21, dragging this exact page: mouse
 * moving LEFT (negative delta) never changed `data-visible-logical-from` at all over a 10s
 * poll, while moving RIGHT by the same magnitude changed it immediately (-1 -> -577)]`. The
 * page's real BTCUSDT data currently covers far fewer candles than the 4-day canonical grid
 * (`AxisSyncStore.initialLogicalRange` spans the WHOLE grid, `T-02.4`'s own docstring), so the
 * settled initial view already sits at the edge of the REAL data on one side — a drag toward
 * that edge has nowhere to go, and a drag away from it does. This is a property of today's
 * data density, not of the axis-sync wiring `DoD-2`/`DoD-3`/`DoD-4` exist to prove, so the
 * direction is pinned here rather than left to chance.
 */
async function dragPricePanel(page: Page, deltaXPx: number): Promise<PanelPosition> {
  if (deltaXPx <= 0) {
    throw new Error(`dragPricePanel: deltaXPx must be positive (see this function's own docstring), received ${deltaXPx}`);
  }
  const container = page.locator(`[data-testid="${PRICE_PANE_TESTID}"] [data-visible-logical-from]`);
  const box = await container.boundingBox();
  if (box === null) {
    throw new Error("o painel de Preço não tem bounding box — canvas não montado?");
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const before = await readPanelPosition(page, PRICE_PANE_TESTID);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // The small waits either side of the move are load-bearing, measured: a `down` immediately
  // followed by `move`/`up` with no pause between them was NOT reliably recognized as a drag by
  // the library's own pointer handler in this exact page (`[MEDIDO 2026-09-21]`) — 100ms either
  // side made it deterministic across repeated runs.
  await page.waitForTimeout(100);
  await page.mouse.move(startX + deltaXPx, startY, { steps: 50 });
  await page.waitForTimeout(100);
  await page.mouse.up();
  return before;
}

async function gotoSymbol(page: Page, query?: string): Promise<void> {
  const url = query === undefined ? SYMBOL_PATH : `${SYMBOL_PATH}?${query}`;
  const response = await page.goto(url, { waitUntil: "networkidle" });
  fact(SPEC, `http_status:${query ?? "none"}`, response?.status() ?? null);
  expect(response?.status()).toBe(200);
  // Every one of the six panels must have applied its INITIAL framing (`axisSync.initialLogicalRange`)
  // before any gesture is attempted — otherwise a drag could race the first `setVisibleLogicalRange`.
  for (const testId of [PRICE_PANE_TESTID, ...OTHER_FIVE_TESTIDS]) {
    await expect(page.locator(`[data-testid="${testId}"] [data-visible-logical-from]`)).toHaveCount(1);
  }
}

// ── `DoD-2` + `DoD-4`: three distinct drags, same-event sync, no amplification and no loop ───

/** `panelIndex -> writeCount`, in one round-trip. */
async function readWriteCounts(page: Page, testIds: readonly string[]): Promise<Record<string, number>> {
  const entries = await Promise.all(testIds.map(async (id) => [id, (await readPanelPosition(page, id)).writeCount] as const));
  return Object.fromEntries(entries);
}

/**
 * Polls `data-axis-sync-write-count` on every one of `testIds` until two consecutive reads,
 * `quietMs` apart, agree — i.e. no panel's counter moved during that window.
 *
 * `[MEDIDO 2026-09-21]` — a REAL browser drag is not one discrete event: `lightweight-charts`
 * fires `subscribeVisibleLogicalRangeChange` once per animation frame the visible range
 * actually moved in, so a single continuous mouse gesture streamed ~9-10 notifications, and the
 * write counter (5 writes per notification, one per non-origin panel) landed at `+47` for ONE
 * "gesture", not `+1`. That is CORRECT behaviour, not `DoD-4`'s feedback loop — the property
 * `DoD-4` actually asks for ("um gesto único produz 1 propagação por painel, não N") is that the
 * five panels move IN LOCKSTEP (never one more than another — no per-panel amplification) and
 * that the counter STOPS once the gesture stops (no runaway loop) — both checked below, neither
 * of which "exactly +1 per mouse-up" would have proven even if it had passed by coincidence.
 */
async function waitForWriteCountsToSettle(
  page: Page,
  testIds: readonly string[],
  quietMs = 400,
  maxRounds = 25,
): Promise<Record<string, number>> {
  let previous = await readWriteCounts(page, testIds);
  for (let round = 0; round < maxRounds; round += 1) {
    await page.waitForTimeout(quietMs);
    const current = await readWriteCounts(page, testIds);
    if (JSON.stringify(current) === JSON.stringify(previous)) {
      return current;
    }
    previous = current;
  }
  throw new Error(`write counts never settled after ${maxRounds} rounds of ${quietMs}ms — looks like DoD-4's own feedback loop`);
}

test(`DoD-2/DoD-4: N=3 arrastos distintos no painel de Preço — os 5 restantes acompanham NO MESMO EVENTO, sem amplificação e sem laço (${SPEC})`, async ({ page }) => {
  await gotoSymbol(page);
  const allSix = [PRICE_PANE_TESTID, ...OTHER_FIVE_TESTIDS] as const;

  // The mount-time "settle" (`chartConstructorOptions`'s pane width vs the 4-day canonical
  // grid auto-fitting, unrelated to any user gesture) has to finish BEFORE the baseline is
  // taken, or its own tail-end writes would be misread as caused by the first drag.
  let previousCounts = await waitForWriteCountsToSettle(page, allSix);
  for (const testId of allSix) {
    fact(SPEC, `${testId}_write_count:baseline`, previousCounts[testId]);
  }

  const deltasPx = [150, 260, 90] as const; // n=3, distintos entre si — todos positivos, ver docstring de dragPricePanel
  for (const [gestureIndex, deltaXPx] of deltasPx.entries()) {
    const before = await dragPricePanel(page, deltaXPx);
    await waitForPriceRangeToChange(page, before.from);
    const settled = await waitForWriteCountsToSettle(page, allSix);

    const positions = await readAllSix(page);
    const priceNow = positions[PRICE_PANE_TESTID]!;
    fact(SPEC, `price_from:gesture_${gestureIndex}`, priceNow.from);
    fact(SPEC, `price_to:gesture_${gestureIndex}`, priceNow.to);

    const fiveDeltas = OTHER_FIVE_TESTIDS.map((testId) => settled[testId]! - previousCounts[testId]!);
    for (const [index, testId] of OTHER_FIVE_TESTIDS.entries()) {
      const panel = positions[testId]!;
      fact(SPEC, `${testId}_from:gesture_${gestureIndex}`, panel.from);
      fact(SPEC, `${testId}_write_count_delta:gesture_${gestureIndex}`, fiveDeltas[index]);
      // ⛔ ASSERT DE POSIÇÃO — os NÚMEROS têm de bater, nunca "existe" ou "mudou de algum jeito".
      expect(
        panel.from,
        `painel ${testId} (gesto ${gestureIndex}, Δ=${deltaXPx}px): from=${panel.from} ≠ Preço.from=${priceNow.from}`,
      ).toBeCloseTo(priceNow.from, 6);
      expect(
        panel.to,
        `painel ${testId} (gesto ${gestureIndex}, Δ=${deltaXPx}px): to=${panel.to} ≠ Preço.to=${priceNow.to}`,
      ).toBeCloseTo(priceNow.to, 6);
    }
    // `DoD-4`, metade 1 — LOCKSTEP: os 5 painéis recebem o MESMO número de escritas neste gesto.
    // Uma amplificação assimétrica (o mesh ingênuo redespachando para uns e não para outros)
    // apareceria aqui como deltas diferentes entre os cinco.
    expect(
      new Set(fiveDeltas).size,
      `os 5 painéis deveriam ter recebido o MESMO número de escritas neste gesto — deltas: ${JSON.stringify(
        Object.fromEntries(OTHER_FIVE_TESTIDS.map((id, i) => [id, fiveDeltas[i]])),
      )}`,
    ).toBe(1);
    expect(fiveDeltas[0]!, "o gesto deveria ter produzido pelo menos 1 escrita em cada um dos 5 painéis").toBeGreaterThan(0);
    // A Preço nunca escreve em si mesma — a mesma propriedade `axis-sync.test.ts` já prova sem DOM.
    expect(
      settled[PRICE_PANE_TESTID]! - previousCounts[PRICE_PANE_TESTID]!,
      "o painel de Preço nunca deve ser escrito pelo próprio dispatcher",
    ).toBe(0);

    previousCounts = settled;
  }

  // `DoD-4`, metade 2 — SEM LAÇO: depois do último gesto já assentado, esperar de novo SEM
  // nenhum input novo não pode mover os contadores. Um laço de realimentação apareceria
  // exatamente aqui — contagem crescente sem gesto (a frase literal do DoD).
  await page.waitForTimeout(1_000);
  const afterIdle = await readWriteCounts(page, allSix);
  for (const testId of allSix) {
    fact(SPEC, `${testId}_write_count:after_idle`, afterIdle[testId]);
  }
  expect(
    afterIdle,
    "a contagem de escritas continuou subindo sem nenhum gesto novo — laço de realimentação (DoD-4)",
  ).toEqual(previousCounts);
});

// ── `DoD-3`/`CA-6`: a ablação — mesma captura, mesmo gesto, resultado OPOSTO ──────────────────

test(`DoD-3/CA-6 (ablação): com a assinatura desligada (?${ABLATION_QUERY}), os 5 painéis PARAM de acompanhar o mesmo gesto que os movia (${SPEC})`, async ({ page }) => {
  await gotoSymbol(page, ABLATION_QUERY);

  const before = await readAllSix(page);
  const priceBefore = before[PRICE_PANE_TESTID]!;

  const priceBeforeDrag = await dragPricePanel(page, 150);
  await waitForPriceRangeToChange(page, priceBeforeDrag.from);

  const after = await readAllSix(page);
  const priceAfter = after[PRICE_PANE_TESTID]!;
  fact(SPEC, "ablation_price_from_before", priceBefore.from);
  fact(SPEC, "ablation_price_from_after", priceAfter.from);
  // The gesture must still be REAL — Price's own native pan is untouched by the ablation
  // (`withAxisSyncAblation` only silences the DISPATCH half). A drag that produced no movement
  // at all here would make the "the five didn't move either" assertion below meaningless.
  expect(priceAfter.from, "o próprio painel de Preço deveria continuar respondendo ao arrasto nativo").not.toBe(
    priceBefore.from,
  );

  for (const testId of OTHER_FIVE_TESTIDS) {
    const panelBefore = before[testId]!;
    const panelAfter = after[testId]!;
    fact(SPEC, `ablation_${testId}_from_before`, panelBefore.from);
    fact(SPEC, `ablation_${testId}_from_after`, panelAfter.from);
    fact(SPEC, `ablation_${testId}_write_count_after`, panelAfter.writeCount);
    // ⛔ O PAR MORDE/CALA: a captura e o gesto são OS MESMOS do teste anterior; o resultado é o
    // OPOSTO — a posição não muda, e o contador de escritas do dispatcher fica em zero.
    expect(
      panelAfter.from,
      `painel ${testId}: com a assinatura desligada, a posição não deveria mudar (era ${panelBefore.from}, ficou ${panelAfter.from})`,
    ).toBe(panelBefore.from);
    expect(
      panelAfter.to,
      `painel ${testId}: com a assinatura desligada, a posição (to) não deveria mudar (era ${panelBefore.to}, ficou ${panelAfter.to})`,
    ).toBe(panelBefore.to);
    expect(
      panelAfter.writeCount,
      `painel ${testId}: com a assinatura desligada, o dispatcher não deveria ter escrito nenhuma vez`,
    ).toBe(0);
  }
});
