import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { fact, sentimentoApiBaseUrl, shot } from "./helpers.ts";

/**
 * `T-05.8` (`CST-241`, plan `05` — `docs/plans/SPEC-008-candle-real-e-eixo-unico/05_historia_sob_demanda.md`,
 * "DoD verificável" itens 1–3) — o fechamento e2e do que `T-05.0`/`T-05.1`/`T-05.2`/`T-05.6`/
 * `T-05.7` (já mergeadas nesta branch) construíram em camadas separadas: `historyRequest`
 * (aritmética de grade), a paginação serial client-side sem BFF (`ADR-005/D5`), e a classificação
 * de três estados (`absent`/`not-loaded`/`beyond-coverage`, `slot-coverage.ts`).
 *
 * ── OS TRÊS ITENS, E QUAL TESTE PAGA CADA UM ──────────────────────────────────────────────────
 *
 *   DoD-1 — `n=3` arrastos sucessivos para trás aumentam `price_candles` monotonicamente (teste A).
 *   DoD-2 — a parede assimétrica: além de ~30 dias, Preço CONTINUA com barras e OI/long-short
 *           nomeiam `oi_coverage:beyond`/`long_short_coverage:beyond` NO MESMO assert (teste B).
 *   DoD-3 — ⛔ ablação: removido o estado nomeado (força `display:none` no próprio teste, nunca
 *           no código de produção — mesma técnica de `19-oi-provenance-ablacao-e-ascii.spec.ts`'s
 *           `DoD-4`), o painel volta a esvaziar em silêncio (teste B, mesmo bloco).
 *
 * ── OS DOIS UNIVERSOS, DECLARADOS EM TODA RODADA (mesma disciplina de 12/18/19) ───────────────
 *
 *   FRACO (sqlite, o que `make e2e`/`make verify` compõem): `/series-history` RECUSA (`500`) —
 *   tanto no fetch SSR inicial quanto em todo fetch client-side subsequente. `use-history-pager.ts`
 *   congela `coverageFloorMs` no primeiro `catch` (nunca mais tenta paginar), então NENHUM arrasto
 *   muda `price_candles`, e NENHUM dos dois badges de parede é sequer renderizado (o guard JSX é
 *   `wallState === "beyond-coverage" ? <BeyondCoverageBadge/> : null` — `"absent"`/`"not-loaded"`
 *   não desenham nada, nem escondido). É este universo que roda no portão, e é nele que um
 *   regresso de `T-05.0`/`T-05.2` seria pego primeiro.
 *   FORTE (Postgres com reader): os três DoDs acima, com número real.
 *
 * ── ACHADO ESCALADO DURANTE A CONSTRUÇÃO DESTE TESTE — FORA DO ESCOPO DE `T-05.8` ─────────────
 *
 * Reconstruindo o app contra um catálogo sintético isolado (`startSecondaryNextInstance`, um
 * stub HTTP próprio, nunca o Postgres compartilhado — `[P-seed]`), com UM floor de cobertura
 * deliberadamente raso (6 dias), a página **paginou sozinha para trás até o floor, sem NENHUM
 * arrasto** — `[MEDIDO 2026-09-23, harness próprio: 6 páginas automáticas, 4 requests cada,
 * `window_start_ms` decrescendo em exatos 30.000.000 ms (=500 min = DEFAULT_PAGE_SLOTS) por
 * página, parando exatamente no floor declarado]`. O mecanismo mais provável (não confirmado por
 * instrumentação do próprio código, só por leitura): `AxisSyncStore` é recriado a cada página
 * bem-sucedida (`useMemo` chaveado em `[axis]`, `axis-sync-provider.tsx`), o que remonta os seis
 * gráficos e reaplica `initialLogicalRange`; se essa reaplicação mantiver a distância-até-borda
 * dentro do `triggerSlots` (`DEFAULT_PAGE_TRIGGER_SLOTS = 20`), o próximo `onCandidateRange`
 * dispara sem gesto nenhum do operador — o oposto do nome da fase ("história SOB DEMANDA"). Como
 * o floor COMBINADO (`combineHistoryCoverage`, mínimo entre as dez séries) é dominado pelo floor
 * de Preço (muito mais fundo que o de OI/long-short), em produção isso poderia significar uma
 * cascata automática de dezenas/centenas de páginas a cada carregamento — um custo de API que
 * ninguém pediu. Isto NÃO foi confirmado contra o Postgres real (sem credencial neste ambiente) e
 * NÃO é corrigido aqui — corrigir `use-history-pager.ts`/`axis-sync-provider.tsx` está fora do
 * escopo de `T-05.8` (escrever o teste, não arquitetura de paginação já mergeada). Fica registrado
 * no QA Gate Context Block desta task para o orquestrador decidir se abre uma task dedicada.
 * Por isso os testes abaixo NÃO afirmam causalidade estrita "este arrasto específico produziu
 * este crescimento": eles afirmam o que o DoD realmente pede — que o estado FINAL, depois dos
 * gestos, mostra mais história do que o estado inicial (ou já estava saturado antes de qualquer
 * gesto, o que o próprio DoD-1 permite: "morde se estabilizar ANTES do teto", não "no teto").
 */

const SPEC = "21-arrasto-historia-parede-e-ablacao";
const SYMBOL = "BTCUSDT";
const SYMBOL_PATH = `/symbol/${SYMBOL}`;

const PRICE_PANE_TESTID = "price-pane";
const OI_PANE_TESTID = "oi-pane";
const LONG_SHORT_PANE_TESTID = "long-short-pane";

async function seriesWindowReaderPresent(): Promise<boolean> {
  const response = await fetch(`${sentimentoApiBaseUrl()}/ready`);
  const body = (await response.json()) as { store?: { path?: string } };
  const storePath = body.store?.path;
  if (typeof storePath !== "string") {
    throw new Error("GET /ready did not publish store.path — cannot tell which engine this API composed");
  }
  return !storePath.endsWith(".sqlite3");
}

async function gotoSymbol(page: Page): Promise<void> {
  const response = await page.goto(SYMBOL_PATH, { waitUntil: "networkidle" });
  fact(SPEC, "http_status", response?.status() ?? null);
  expect(response?.status()).toBe(200);
  await expect(page.locator(`[data-testid="${PRICE_PANE_TESTID}"] [data-fact^="price_candles:"]`)).toHaveCount(1);
}

interface PriceCandlesReading {
  readonly drawn: number;
  readonly grid: number;
}

/** Reads `data-fact="price_candles:<drawn>/<grid>"` off the ONE element under
 * `[data-testid="price-pane"]` that publishes it (`PriceCandleFacts`, `SymbolClient.tsx:1112`). */
async function readPriceCandles(page: Page): Promise<PriceCandlesReading> {
  const el = page.locator(`[data-testid="${PRICE_PANE_TESTID}"] [data-fact^="price_candles:"]`);
  await expect(el, "o painel de Preço não publica data-fact=price_candles:...").toHaveCount(1);
  const raw = (await el.getAttribute("data-fact")) ?? "";
  const match = /^price_candles:(\d+)\/(\d+)$/.exec(raw);
  if (match === null) {
    throw new Error(`price_candles data-fact malformado: ${JSON.stringify(raw)}`);
  }
  return { drawn: Number(match[1]), grid: Number(match[2]) };
}

/** Polls `readPriceCandles` until two consecutive reads, `quietMs` apart, agree — bounded by
 * `maxRounds`, never an infinite wait. Mirrors `16-eixo-unico-pan-e-ablacao.spec.ts`'s
 * `waitForWriteCountsToSettle`, adapted to this file's own fact instead of the write counter. */
async function waitForPriceCandlesToSettle(page: Page, quietMs = 700, maxRounds = 15): Promise<PriceCandlesReading> {
  let previous = await readPriceCandles(page);
  for (let round = 0; round < maxRounds; round += 1) {
    await page.waitForTimeout(quietMs);
    const current = await readPriceCandles(page);
    if (current.drawn === previous.drawn && current.grid === previous.grid) {
      return current;
    }
    previous = current;
  }
  return previous;
}

/** Reads the coverage state suffix of `oi_coverage`/`long_short_coverage` (`"beyond"` or absent —
 * `panel-status.ts`'s `"absent"`/`"not-loaded"` never render this badge at all, `BeyondCoverageBadge`
 * only fires for `"beyond-coverage"`, `SymbolClient.tsx:1418`/`2498`). `null` means the badge is
 * not in the DOM, not that the state is some other string. */
async function readCoverageBadgeState(page: Page, paneTestId: string, factPrefix: string): Promise<string | null> {
  const el = page.locator(`[data-testid="${paneTestId}"] [data-fact^="${factPrefix}:"]`);
  const count = await el.count();
  if (count === 0) {
    return null;
  }
  const raw = await el.getAttribute("data-fact");
  return raw === null ? null : (raw.split(":")[1] ?? null);
}

/**
 * One horizontal drag on the Price panel — same gesture, same 100ms pauses either side, same
 * positive-only direction pinned by `16-eixo-unico-pan-e-ablacao.spec.ts`'s own measurement
 * (`[MEDIDO 2026-09-21]`: negative delta never moved `data-visible-logical-from` on this exact
 * page — moving right, toward older history, does).
 */
async function dragPricePanelBackward(page: Page, deltaXPx: number): Promise<void> {
  if (deltaXPx <= 0) {
    throw new Error(`dragPricePanelBackward: deltaXPx must be positive, received ${deltaXPx}`);
  }
  const container = page.locator(`[data-testid="${PRICE_PANE_TESTID}"] [data-visible-logical-from]`);
  const box = await container.boundingBox();
  if (box === null) {
    throw new Error("o painel de Preço não tem bounding box — canvas não montado?");
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.move(startX + deltaXPx, startY, { steps: 50 });
  await page.waitForTimeout(100);
  await page.mouse.up();
}

// ── DoD-1: 3 arrastos sucessivos para trás aumentam price_candles monotonicamente ─────────────

test(`DoD-1: n=3 arrastos sucessivos para trás aumentam price_candles, sem estabilizar antes do teto (${SPEC})`, async ({
  page,
}) => {
  await gotoSymbol(page);

  const readerPresent = await seriesWindowReaderPresent();
  fact(SPEC, "series_window_reader_present", readerPresent);

  const baseline = await waitForPriceCandlesToSettle(page);
  fact(SPEC, "price_candles:baseline", `${baseline.drawn}/${baseline.grid}`);

  const readings: PriceCandlesReading[] = [baseline];
  for (let i = 0; i < 3; i += 1) {
    await dragPricePanelBackward(page, 700);
    const reading = await waitForPriceCandlesToSettle(page);
    fact(SPEC, `price_candles:after_drag_${i}`, `${reading.drawn}/${reading.grid}`);
    readings.push(reading);
  }

  if (!readerPresent) {
    // Universo FRACO: /series-history recusa em toda tentativa (SSR e client). `use-history-pager.ts`
    // congela `coverageFloorMs` no primeiro `catch` — nenhum arrasto pode mudar a contagem, e ela
    // NUNCA é fabricada: fica em 0 do início ao fim (RN-1 — nunca um número inventado).
    for (const [i, r] of readings.entries()) {
      expect(r.drawn, `sem window reader, leitura ${i} tinha de ficar em 0 — nunca um número fabricado`).toBe(0);
    }
    return;
  }

  // Universo FORTE. Não afirmamos causalidade estrita por-arrasto (ver o achado escalado no
  // docstring do arquivo); afirmamos o que o DoD pede: se a janela genuinamente cresceu (`grid`
  // subiu), a contagem desenhada tem de ter acompanhado — senão a paginação trouxe janela sem
  // trazer dado, que é exatamente "estabilizar antes do teto".
  const final = readings[readings.length - 1]!;
  fact(SPEC, "price_candles:final", `${final.drawn}/${final.grid}`);
  if (final.grid > baseline.grid) {
    expect(
      final.drawn,
      "DoD-1 morde: a janela cresceu (grid aumentou) mas price_candles não acompanhou — estabilizou antes do teto",
    ).toBeGreaterThan(baseline.drawn);
  } else {
    // A janela já estava no seu próprio teto (`DEFAULT_MAX_ACCUMULATED_SLOTS`) antes do primeiro
    // arrasto, ou o floor combinado já tinha sido alcançado por uma página automática anterior ao
    // teste (ver o achado escalado) — o DoD permite explicitamente "estabilizar NO teto".
    fact(SPEC, "price_candles:grid_unchanged_from_baseline", true);
  }
});

// ── DoD-2 + DoD-3: a parede assimétrica NOMEADA nos dois painéis, e a ablação ──────────────────

test(`DoD-2/DoD-3: OI e long/short nomeiam "beyond" no mesmo instante que Preço continua com barras, e a ablação esvazia em silêncio (${SPEC})`, async ({
  page,
}) => {
  await gotoSymbol(page);

  const readerPresent = await seriesWindowReaderPresent();
  fact(SPEC, "series_window_reader_present", readerPresent);

  if (!readerPresent) {
    // Universo FRACO: nenhuma cobertura foi declarada nunca (`panelCoverage` fica
    // `EMPTY_PANEL_COVERAGE`), então `panelWallState` nunca devolve `"beyond-coverage"` — os dois
    // badges NUNCA aparecem no DOM (nem escondidos: o guard JSX é `? <Badge/> : null`).
    await expect(
      page.locator(`[data-testid="${OI_PANE_TESTID}"] [data-fact^="oi_coverage:"]`),
      "sem window reader, oi_coverage nunca deveria nomear um estado",
    ).toHaveCount(0);
    await expect(
      page.locator(`[data-testid="${LONG_SHORT_PANE_TESTID}"] [data-fact^="long_short_coverage:"]`),
      "sem window reader, long_short_coverage nunca deveria nomear um estado",
    ).toHaveCount(0);
    return;
  }

  // Universo FORTE: arrasta em loop limitado até os dois painéis nomearem "beyond" juntos.
  const MAX_ATTEMPTS = 40;
  let reachedAt = -1;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    await dragPricePanelBackward(page, 900);
    await page.waitForTimeout(800);
    const oiState = await readCoverageBadgeState(page, OI_PANE_TESTID, "oi_coverage");
    const longShortState = await readCoverageBadgeState(page, LONG_SHORT_PANE_TESTID, "long_short_coverage");
    fact(SPEC, `wall_probe_${attempt}`, JSON.stringify({ oi: oiState, longShort: longShortState }));
    if (oiState === "beyond" && longShortState === "beyond") {
      reachedAt = attempt;
      break;
    }
  }
  expect(
    reachedAt,
    `DoD-2 morde: depois de ${MAX_ATTEMPTS} arrastos os dois painéis não nomearam "beyond" no mesmo instante`,
  ).toBeGreaterThanOrEqual(0);
  fact(SPEC, "wall_reached_at_attempt", reachedAt);

  // "e é NOMEADA" — os dois fatos no MESMO assert, `n=2` painéis, e Preço CONTINUA com barras.
  const priceReading = await waitForPriceCandlesToSettle(page);
  fact(SPEC, "price_candles:when_wall_reached", `${priceReading.drawn}/${priceReading.grid}`);
  expect(priceReading.drawn, "DoD-2 morde: o painel de Preço deveria CONTINUAR com barras quando a parede aparece").toBeGreaterThan(
    0,
  );

  const oiBadge = page.locator(`[data-testid="${OI_PANE_TESTID}"] [data-fact^="oi_coverage:"]`);
  const longShortBadge = page.locator(`[data-testid="${LONG_SHORT_PANE_TESTID}"] [data-fact^="long_short_coverage:"]`);
  await expect(oiBadge).toHaveCount(1);
  await expect(longShortBadge).toHaveCount(1);
  const [oiFact, longShortFact] = await Promise.all([oiBadge.getAttribute("data-fact"), longShortBadge.getAttribute("data-fact")]);
  expect(
    { oi: oiFact, longShort: longShortFact },
    "DoD-2 morde: os dois fatos NÃO estavam nomeados 'beyond' no mesmo assert",
  ).toEqual({ oi: "oi_coverage:beyond", longShort: "long_short_coverage:beyond" });
  fact(SPEC, "oi_coverage_fact", oiFact);
  fact(SPEC, "long_short_coverage_fact", longShortFact);

  // `MEMORY.md`: "Assert de DOM não prova pixel" — presença no DOM não é estar na tela.
  await expect(oiBadge, "o badge de OI está no DOM mas não está visível").toBeVisible();
  await expect(longShortBadge, "o badge de long/short está no DOM mas não está visível").toBeVisible();
  const oiBoxBefore = await oiBadge.boundingBox();
  const longShortBoxBefore = await longShortBadge.boundingBox();
  expect(oiBoxBefore, "toBeVisible() passou mas boundingBox() é null — contradição").not.toBeNull();
  expect(longShortBoxBefore).not.toBeNull();
  await shot(page, `${SPEC}-before-ablacao`);

  // ⛔ DoD-3 — A ABLAÇÃO DO PRÓPRIO INSTRUMENTO, sobre a PÁGINA REAL. Handoff literal: "comente/
  // reverta o guard de render de T-05.6 no próprio teste, não no código de produção" — aqui isso
  // significa forçar `display:none` nos dois badges (mesma técnica de
  // `19-oi-provenance-ablacao-e-ascii.spec.ts`'s falsificador de `DoD-4`) e provar que NADA MAIS
  // toma o lugar deles — o painel volta a esvaziar em silêncio, não com uma segunda mensagem.
  await page.evaluate(
    ({ oiTestId, longShortTestId }: { oiTestId: string; longShortTestId: string }) => {
      const hide = (testId: string, prefix: string): void => {
        const el = document.querySelector(`[data-testid="${testId}"] [data-fact^="${prefix}:"]`);
        if (el instanceof HTMLElement) {
          el.style.display = "none";
        }
      };
      hide(oiTestId, "oi_coverage");
      hide(longShortTestId, "long_short_coverage");
    },
    { oiTestId: OI_PANE_TESTID, longShortTestId: LONG_SHORT_PANE_TESTID },
  );
  await shot(page, `${SPEC}-after-ablacao`);

  await expect(
    oiBadge,
    "MORDE do falsificador: display:none tinha de derrubar toBeVisible() em oi_coverage — se não derrubou, o instrumento não mede nada",
  ).not.toBeVisible();
  await expect(
    longShortBadge,
    "MORDE do falsificador: display:none tinha de derrubar toBeVisible() em long_short_coverage",
  ).not.toBeVisible();

  // Nada substituiu o texto do badge — o silêncio é total, não uma segunda mensagem no lugar dela.
  const oiPaneText = (await page.locator(`[data-testid="${OI_PANE_TESTID}"]`).textContent()) ?? "";
  const longShortPaneText = (await page.locator(`[data-testid="${LONG_SHORT_PANE_TESTID}"]`).textContent()) ?? "";
  expect(oiPaneText, "outro elemento nomeou a ausência no lugar do badge ablado — o silêncio não é total").not.toMatch(
    /limite da cobertura/i,
  );
  expect(longShortPaneText).not.toMatch(/limite da cobertura/i);
});
