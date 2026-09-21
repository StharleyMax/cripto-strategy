import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { computeSeriesKeyId } from "../src/app/symbol/series-key-id.ts";
import type { SeriesKey } from "../src/features/s3-inspector/series-catalog.ts";
import { fact, sentimentoApiBaseUrl } from "./helpers.ts";

/**
 * `T-02.6` (`SPEC-007` plano `02` item `2.7`, `DoD-3`, `D2`/item 3 do `DoD-VERTICAL`) â o
 * `CvdPane` com dado real na tela, contado contra a API que a prÃ³pria pÃ¡gina leu.
 *
 * ââ O QUE ELE ASSERTA, E POR QUE NÃO Ã "STATUS 200" ââââââââââââââââââââââââââââââââââââââââââ
 *
 * `D2` recusou o DoD sÃ³-de-API COM NÃMERO: a fase `02` de `pagina-de-grafico-s2` passou SQL+HTTP
 * verdes e o dado nÃ£o chegava na tela; quem achou o defeito de wiring foi a fase `04`, em uso ao
 * vivo pelo owner. EntÃ£o o que este arquivo mede Ã© o DOM: quantos pontos o painel DIZ ter, e se
 * esse nÃºmero Ã© o da API sobre EXATAMENTE a janela que o servidor declarou no `<main>`.
 *
 * ââ AS DUAS ARMADILHAS QUE JÃ CUSTARAM UM CICLO DE GATE, E COMO ESTE ARQUIVO PAGA CADA UMA ââââ
 *
 *   1. `Number(null) === 0`. Sob `make e2e` a API compÃµe o engine sqlite, que `ADR-034/D9` nÃ£o
 *      dÃ¡ reader de `md.series` â a API serve `0` pontos; se a pÃ¡gina parar de publicar
 *      `data-cvd-present-points`, `Number(null)` tambÃ©m Ã© `0` e a asserÃ§Ã£o fica verde sobre um
 *      DOM sem contrato nenhum â foi o `BLOCKER-3` da wave `03`, `rc=0, 24 passed`. Por isso o
 *      atributo Ã© exigido NÃO-NULO e NÃO-VAZIO, em dÃ­gitos, ANTES de virar nÃºmero.
 *   2. `metric === "cvd_source"` casa QUATRO linhas do catÃ¡logo, nÃ£o uma (`aggtrade_q`,
 *      `aggtrade_nq`, `coinalyze_bv`, `kline_takerbuy`). O filtro daqui Ã© o de trÃªs termos, e
 *      este arquivo AINDA verifica que ele casa exatamente UMA linha do catÃ¡logo servido pela
 *      API sob teste â Ã© o guarda de deriva da transcriÃ§Ã£o em `cvd-series-selector.test.ts`,
 *      que roda contra um fixture e portanto nÃ£o vÃª o catÃ¡logo real.
 *
 * ââ OS DOIS UNIVERSOS, DECLARADOS EM TODA RODADA âââââââââââââââââââââââââââââââââââââââââââââ
 *
 * Mesma partiÃ§Ã£o que `08-symbol-dado-real.spec.ts` publica como `series_window_reader_present`:
 *
 *   FRACO  (sqlite, o que `make e2e` compÃµe): `/series-history` RECUSA (`500`). O que se prova
 *          aqui Ã© o que `RN-1` Ã©: diante de um backend que nÃ£o responde, a tela diz `SEM_PONTO`
 *          e NUNCA um `0` fabricado â e o contrato de DOM estÃ¡ publicado.
 *   FORTE  (Postgres com reader): `N >= 30` grades distintas no DOM, iguais Ã s da API, e o painel
 *          NÃO diz `SEM_PONTO` na leitura que a API sabe responder. Ã este o item 3 do
 *          `DoD-VERTICAL`, e ele sÃ³ existe depois que `T-02.7` publica o deploy e o coletor roda
 *          ~30 min ao vivo (`handoff/T-02.5-T-02.6-web.md` Â§3: o backfill de 7 dias Ã© invisÃ­vel
 *          ao `as_of` por `available_at`, e isso Ã© `D15`/`D17`, fora desta fase).
 *
 * â O universo FRACO nunca Ã© relatado como se fosse o FORTE: toda rodada imprime
 * `series_window_reader_present` e `cvd_dom_present_points`, e o veredito do gate cita os dois.
 * â NADA AQUI SEMEIA O POSTGRES COMPARTILHADO (`[P-seed]`, `D2`): nÃ£o hÃ¡ `INSERT`, `psql` nem
 * `docker` neste arquivo fora deste parÃ¡grafo.
 */

const SPEC = "10-cvd-dado-real";
const SYMBOL = "BTCUSDT";
// `T-02.5` — a rota virou `/symbol/[symbol]`, segmento em ingles; a página do piloto é `SYMBOL`.
const SYMBOL_PATH = `/symbol/${SYMBOL}`;

const apiBaseUrl = sentimentoApiBaseUrl;

/** `SymbolClient.tsx`'s stable anchors for this pane. Spelled out, not imported â importing
 * `SymbolClient.tsx` would pull `lightweight-charts` (and `../src/app/symbol/view-model.ts`
 * would pull `charts/index.ts` â `jsdom`, which dies under Playwright's module loader here and
 * takes the whole COLLECTION to `Total: 0 tests`). `cvd-pane-dom-contract.test.ts` guards the
 * same strings from the other side, which is the point: two independent witnesses of one
 * contract, so a rename has to break one of them. */
const CVD_PANE_TESTID = "cvd-pane";
const ABSENCE_TOKEN = "SEM_PONTO";

/** `DoD-3`: `N >= 30` pontos DISTINTOS, nÃ£o `N > 0`. NÃ£o hÃ¡ divisor de `RN-S1` aqui â a sÃ©rie Ã©
 * `1m` NATIVA (`SPEC-007 Â§4.1`), entÃ£o cada grade com valor Ã© uma barra nativa distinta e
 * `presentPoints === nativeBars`. Aplicar o `/5` do `RN-S1` subcontaria por 5Ã. */
const MINIMUM_DISTINCT_POINTS = 30;

/** Os trÃªs termos que identificam a linha `kline_takerbuy` â a MESMA regra de
 * `view-model.ts::matchesKlineTakerBuyCvd`, escrita Ã  mÃ£o aqui pelo motivo do parÃ¡grafo acima.
 * Cada termo exclui um irmÃ£o: sem `provider` casa `coinalyze_bv`; sem `quantityField` casam
 * `aggtrade_q`/`aggtrade_nq`. */
function isKlineTakerBuyCvd(key: SeriesKey): boolean {
  return key.metric === "cvd_source" && key.provider === "binance" && key.quantityField === "NA";
}

interface CatalogEntryWire {
  readonly key: SeriesKey;
  readonly priceUse: string | null;
  readonly reconstructedFrom: string | null;
}

interface HistoryRow {
  readonly event_time: number;
  readonly value: string | null;
  readonly absence: string | null;
}

interface RenderedRequest {
  readonly windowStartMs: number;
  readonly windowEndMsInclusive: number;
  readonly knowledgeTimeMs: number;
}

function requiredNumberAttribute(value: string | null, name: string): number {
  if (value === null) {
    throw new Error(`the page did not declare ${name} â SymbolClient.tsx stopped publishing its own request`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} is ${JSON.stringify(value)}, not a finite epoch-ms instant`);
  }
  return parsed;
}

/** `fetch` com UMA retentativa, e sÃ³ em erro de transporte â mesma razÃ£o medida que
 * `08-symbol-dado-real.spec.ts` documenta (`undici` reaproveita a conexÃ£o que um worker que
 * acabou de responder `500` jÃ¡ fechou). Nenhuma asserÃ§Ã£o Ã© afrouxada: qualquer resposta HTTP,
 * de qualquer status, volta intacta. */
async function fetchWithOneRetry(url: string): Promise<Response> {
  try {
    return await fetch(url);
  } catch {
    return await fetch(url);
  }
}

async function fetchCatalogEntries(): Promise<readonly CatalogEntryWire[]> {
  const response = await fetchWithOneRetry(`${apiBaseUrl()}/series-catalog`);
  if (!response.ok) {
    throw new Error(`GET /series-catalog: HTTP ${response.status}`);
  }
  const body = (await response.json()) as { entries: readonly CatalogEntryWire[] };
  return body.entries;
}

async function fetchSeriesHistory(
  seriesKeyId: string,
  request: RenderedRequest,
): Promise<{ readonly status: number; readonly rows: readonly HistoryRow[] }> {
  const query = new URLSearchParams({
    series_key_id: seriesKeyId,
    symbol: SYMBOL,
    interval: "1m",
    window_start_ms: String(request.windowStartMs),
    window_end_ms: String(request.windowEndMsInclusive),
    knowledge_time_ms: String(request.knowledgeTimeMs),
    bar_policy: "final_only",
  });
  const response = await fetchWithOneRetry(`${apiBaseUrl()}/series-history?${query.toString()}`);
  // Corpo lido como TEXTO primeiro: uma rota que recusa responde `Internal Server Error`, e
  // `response.json()` viraria `SyntaxError` â escondendo o status que o chamador precisa julgar.
  const raw = await response.text();
  let rows: readonly HistoryRow[];
  try {
    rows = (JSON.parse(raw) as { rows?: readonly HistoryRow[] }).rows ?? [];
  } catch {
    rows = [];
  }
  return { status: response.status, rows };
}

/** Este deployment tem reader de janela de `md.series`? Perguntado Ã PRÃPRIA API, nunca a uma
 * variÃ¡vel de ambiente â env var aqui seria allowlist disfarÃ§ada ("entrada de allowlist Ã©
 * indistinguÃ­vel de bypass", `CLAUDE.md`). `/ready` publica `store.path`, e `ADR-034/D9` nÃ£o dÃ¡
 * fallback sqlite para `md.series`. Mesma funÃ§Ã£o de `08`, transcrita pelo mesmo motivo de
 * carregamento de mÃ³dulo que o cabeÃ§alho explica. */
async function seriesWindowReaderPresent(): Promise<boolean> {
  const response = await fetchWithOneRetry(`${apiBaseUrl()}/ready`);
  const body = (await response.json()) as { store?: { path?: string } };
  const storePath = body.store?.path;
  if (typeof storePath !== "string") {
    throw new Error(`GET /ready did not publish store.path â cannot tell which engine this API composed`);
  }
  return !storePath.endsWith(".sqlite3");
}

async function loadRenderedRequest(page: Page): Promise<RenderedRequest> {
  const response = await page.goto(SYMBOL_PATH, { waitUntil: "networkidle" });
  fact(SPEC, "http_status", response?.status() ?? null);
  expect(response?.status()).toBe(200);

  const main = page.locator("main[data-window-start-ms]");
  await expect(
    main,
    "a pÃ¡gina nÃ£o declara o prÃ³prio request (data-window-start-ms) â build anterior a esta wave?",
  ).toHaveCount(1);
  return {
    windowStartMs: requiredNumberAttribute(await main.getAttribute("data-window-start-ms"), "data-window-start-ms"),
    windowEndMsInclusive: requiredNumberAttribute(
      await main.getAttribute("data-window-end-ms-inclusive"),
      "data-window-end-ms-inclusive",
    ),
    knowledgeTimeMs: requiredNumberAttribute(await main.getAttribute("data-knowledge-time-ms"), "data-knowledge-time-ms"),
  };
}

/** LÃª `data-cvd-present-points` EXIGINDO que ele exista e seja dÃ­gitos, antes de converter.
 *
 * â A conversÃ£o vem depois da exigÃªncia, e a ordem Ã© o ativo: `Number(null)` e `Number("")` sÃ£o
 * ambos `0`, e `0` Ã© exatamente o que a API serve no universo fraco â sem estas duas asserÃ§Ãµes
 * o `expect(dom).toBe(api)` compara `0 === 0` e fica verde com o contrato APAGADO do DOM. */
async function readPresentPoints(page: Page): Promise<number> {
  const pane = page.locator(`[data-testid="${CVD_PANE_TESTID}"]`);
  await expect(pane, `o painel de CVD nÃ£o existe no DOM sob [data-testid="${CVD_PANE_TESTID}"]`).toHaveCount(1);
  const raw = await pane.getAttribute("data-cvd-present-points");
  expect(
    raw,
    "a pÃ¡gina parou de publicar `data-cvd-present-points` â sem o atributo nÃ£o hÃ¡ o que comparar " +
      "com a API, e `Number(null) === 0` faria esta asserÃ§Ã£o passar sobre um DOM sem contrato",
  ).not.toBeNull();
  expect(
    raw ?? "",
    "`data-cvd-present-points` tem de ser uma contagem em dÃ­gitos; vazio vira 0 em `Number()`",
  ).toMatch(/^\d+$/);
  return Number(raw);
}

test(`o catÃ¡logo servido casa EXATAMENTE UMA linha de CVD para ${SYMBOL} (${SPEC})`, async () => {
  // O guarda de deriva do seletor. `cvd-series-selector.test.ts` roda contra um fixture
  // TRANSCRITO de `cvd_source_catalog.py`; este teste roda contra o catÃ¡logo que a API sob teste
  // realmente serve. Se o backend acrescentar uma quinta linha `cvd_source` de `binance`/`NA`, o
  // seletor passa a casar duas e `Array.prototype.find` escolhe uma delas em silÃªncio â que Ã© a
  // classe de defeito que sÃ³ aparece na tela, semanas depois.
  const entries = await fetchCatalogEntries();
  const forSymbol = entries.filter((entry) => entry.key.instrumentId === SYMBOL);
  const cvdSourceRows = forSymbol.filter((entry) => entry.key.metric === "cvd_source");
  const matched = forSymbol.filter((entry) => isKlineTakerBuyCvd(entry.key));
  fact(SPEC, "catalog_entries_total", entries.length);
  fact(SPEC, "catalog_cvd_source_rows_for_symbol", cvdSourceRows.length);
  fact(SPEC, "catalog_kline_takerbuy_matches", matched.length);

  expect(
    matched.length,
    `o filtro de trÃªs termos casou ${matched.length} linhas â DoD-3 lÃª um painel sÃ³, e ` +
      "`find` escolheria uma delas sem dizer qual",
  ).toBe(1);
  // E a linha casada Ã© a leitura DIRETA, nÃ£o a reconstruÃ§Ã£o da Coinalyze: `T-02.1` mediu
  // `reconstructed_from=None` ANTES de a identidade ser gravada (`n=4.320` buckets, `276` runs
  // divergentes, ZERO com resÃ­duo). Uma reconstruÃ§Ã£o na tela sem banda de erro Ã© o par `D6.9`
  // quebrado, e seria invisÃ­vel sem esta linha.
  expect(matched[0]!.reconstructedFrom, "a linha escolhida nÃ£o pode ser a reconstruÃ§Ã£o").toBeNull();
  expect(matched[0]!.key.nature, "nature FLOW Ã© o contrato em que SEM_PONTO se apoia").toBe("FLOW");
  // ...e o filtro de UM termo, que seria "o mesmo filtro, mais simples", casaria as quatro.
  expect(
    cvdSourceRows.length,
    "se houvesse sÃ³ uma linha `cvd_source` no catÃ¡logo, o filtro de trÃªs termos seria indistinguÃ­vel " +
      "do de um termo e este arquivo nÃ£o provaria nada sobre ele",
  ).toBeGreaterThan(1);
});

test(`o nÃºmero de pontos do CvdPane Ã© o da API, sobre a MESMA janela (${SPEC})`, async ({ page }) => {
  const request = await loadRenderedRequest(page);
  // A grade da janela, derivada dos instantes que o SERVIDOR declarou no `<main>` â nunca do
  // relÃ³gio deste processo, que correria contra o do render.
  const windowGridSlots = (request.windowEndMsInclusive - request.windowStartMs) / 60_000 + 1;
  const entries = await fetchCatalogEntries();
  const cvdEntry = entries.find((entry) => entry.key.instrumentId === SYMBOL && isKlineTakerBuyCvd(entry.key));
  expect(cvdEntry, `nenhuma linha kline_takerbuy no catÃ¡logo para ${SYMBOL}`).toBeDefined();

  const seriesKeyId = computeSeriesKeyId(cvdEntry!.key);
  const { status, rows } = await fetchSeriesHistory(seriesKeyId, request);
  const apiPresent = rows.filter((row) => row.value !== null);
  const readerPresent = await seriesWindowReaderPresent();

  fact(SPEC, "series_window_reader_present", readerPresent);
  fact(SPEC, "cvd_series_key_id", seriesKeyId);
  fact(SPEC, "cvd_series_history_status", status);
  fact(SPEC, "cvd_series_history_rows", rows.length);
  fact(SPEC, "cvd_api_rows_with_value", apiPresent.length);

  // ââ (a) o contrato de DOM existe, e Ã© lido ANTES de qualquer comparaÃ§Ã£o ââââââââââââââââââââ
  const domPresentPoints = await readPresentPoints(page);
  fact(SPEC, "cvd_dom_present_points", domPresentPoints);

  // ââ (b) a contagem da tela Ã© a da API, exata âââââââââââââââââââââââââââââââââââââââââââââââ
  //
  // Exata, nÃ£o aproximada: os dois lados saÃ­ram da MESMA janela declarada, entÃ£o divergir Ã©
  // defeito de wiring, nÃ£o corrida. Total sobre os dois universos â no fraco a API serve `0` e a
  // tela tem de servir `0` TAMBÃM PUBLICANDO o atributo, o que (a) jÃ¡ exigiu.
  expect(domPresentPoints).toBe(apiPresent.length);

  // ââ (c) o horizonte legÃ­vel Ã© DECLARADO, com os dois nÃºmeros âââââââââââââââââââââââââââââââ
  //
  // Sem encolher o vÃ£o: o denominador Ã© a grade inteira da janela, nÃ£o um sub-intervalo recortado
  // em volta do dado. `[MEDIDO 2026-09-11]` sÃ³ `769/5.761` grades da janela derivada carregam
  // valor, e a primeira fica ~86% adentro â o CVD herda isso exatamente, porque Ã© a mesma linha
  // do mesmo coletor (`ACHADO-BACKFILL-INVISIVEL-AO-AS-OF.md`).
  const pane = page.locator(`[data-testid="${CVD_PANE_TESTID}"]`);
  const horizon = pane.locator('[data-fact^="cvd_readable_horizon:"]');
  await expect(horizon).toHaveCount(1);
  const horizonFact = await horizon.getAttribute("data-fact");
  fact(SPEC, "cvd_readable_horizon_fact", horizonFact);
  fact(SPEC, "cvd_window_grid_slots", windowGridSlots);
  // â ï¸ O DENOMINADOR Ã A GRADE DA JANELA, NÃO `rows.length`, E A DIFERENÃA Ã O PRÃPRIO PONTO.
  // O sub-eixo de Volume monta os slots a partir das LINHAS da API (`volumeSlotsFromHistoryRows`),
  // entÃ£o lÃ¡ os dois nÃºmeros coincidem e `08` pode comparar contra `rows.length`. O CVD passa por
  // `buildCvdPanel`, que alinha os deltas na grade canÃ´nica da JANELA â entÃ£o quando a API recusa
  // (universo fraco, `rows = []`) o painel continua declarando `0/5760`, e Ã© isso que ele deve
  // declarar: a janela nÃ£o encolheu porque o backend nÃ£o respondeu. Assertar `0/0` aqui exigiria
  // que a tela ESCONDESSE o vÃ£o, que Ã© exatamente o oposto do que `RN-1` pede.
  expect(horizonFact).toBe(`cvd_readable_horizon:${apiPresent.length}/${windowGridSlots}`);
  const sinceMs = await horizon.getAttribute("data-readable-since-ms");
  fact(SPEC, "cvd_readable_since_ms", sinceMs);
  expect(sinceMs).toBe(apiPresent.length === 0 ? "" : String(apiPresent[0]!.event_time));

  // ââ (d) a Ã¢ncora do acumulado estÃ¡ na tela, e Ã© a que o servidor declarou âââââââââââââââââââ
  //
  // `delta` Ã© Ã¢ncora-livre; `cumulativo` Ã© uma VIEW cujo sinal do total muda com a Ã¢ncora
  // (`D4.7`). Uma curva acumulada sem Ã¢ncora dita nÃ£o Ã© legÃ­vel, e herdÃ¡-la em silÃªncio do
  // default de `charts` Ã© o mesmo que nÃ£o ter escolhido.
  const anchor = pane.locator('[data-fact^="cvd_cumulative_anchor:"]');
  await expect(anchor).toHaveCount(1);
  const anchorFact = await anchor.getAttribute("data-fact");
  fact(SPEC, "cvd_cumulative_anchor_fact", anchorFact);
  expect(anchorFact).toBe(`cvd_cumulative_anchor:${request.windowStartMs}`);

  // ââ (d2) `DR-3`: o ACUMULADO tem leitura numÃ©rica, e ela Ã© do mesmo TIPO que a do delta ââââ
  //
  // O design-review de 2026-09-12 bloqueou o painel por isto: ele desenhava DUAS sÃ©ries e lia
  // exatamente UMA. A tela declarava a Ã¢ncora do acumulado (`D4.7`, logo acima) e nunca dizia
  // qual valor tinha sido ancorado â "hÃ¡ uma sÃ©rie renderizada sem nenhum falsificador de DOM
  // sobre o seu valor".
  //
  // â E A ASSERÃÃO Ã DE ACORDO ENTRE OS DOIS READOUTS, nÃ£o "existe um <p>". `cvdCumulativeScaled`
  // (`charts/s2-cvd.ts:176-193`) acumula SÃ sobre bucket presente, a partir de `anchorMs`, e a
  // Ã¢ncora Ã© `window.startMs` â o slot do acumulado Ã© presente **se e somente se** o do delta Ã©.
  // Logo os dois `kind` tÃªm de ser o MESMO, nos dois universos. Um acumulado que diga um nÃºmero
  // onde o delta diz `SEM_PONTO` Ã© uma soma corrida inventada sobre um bucket sem observaÃ§Ã£o,
  // que Ã© o defeito de `RN-1` uma sÃ©rie ao lado.
  const cumulativeReadout = pane.locator('[data-fact^="cvd_cumulative_last_reading:"]');
  await expect(
    cumulativeReadout,
    "o acumulado do CVD tem de ter leitura numÃ©rica no DOM â sem ela a tela declara a Ã¢ncora e nunca diz o valor " +
      "ancorado (DR-3 do design-review de 2026-09-12)",
  ).toHaveCount(1);
  const cumulativeKind = (await cumulativeReadout.getAttribute("data-fact"))?.split(":")[1] ?? "";
  const deltaKind = (await pane.locator('[data-fact^="cvd_last_reading:"]').getAttribute("data-fact"))?.split(":")[1] ?? "";
  const cumulativeText = (await cumulativeReadout.textContent())?.trim() ?? "";
  fact(SPEC, "cvd_cumulative_last_reading_kind", cumulativeKind);
  fact(SPEC, "cvd_cumulative_last_reading_text", cumulativeText);
  expect(cumulativeKind).toBe(deltaKind);
  if (cumulativeKind === "absent") {
    expect(cumulativeText).toContain(ABSENCE_TOKEN);
    expect(cumulativeText).not.toMatch(/\d/);
  } else {
    expect(cumulativeText).not.toContain(ABSENCE_TOKEN);
    expect(cumulativeText).toMatch(/\d/);
  }

  // ââ (d3) `DR-3`/WCAG 1.4.1: as duas linhas sÃ£o NOMEADAS, nÃ£o distinguidas sÃ³ por cor âââââââ
  const legend = pane.locator('[data-fact="cvd_legend:2"]');
  await expect(legend).toHaveCount(1);
  const legendText = (await legend.textContent())?.trim() ?? "";
  fact(SPEC, "cvd_legend_text", legendText);
  expect(legendText).toContain("Delta");
  expect(legendText).toContain("Acumulado");

  // ââ (e) o veredito por universo ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  if (!readerPresent) {
    // A API acabou de declarar, sobre si mesma, que compÃ´s o engine sqlite â que `ADR-034/D9` nÃ£o
    // dÃ¡ reader de `md.series`. A asserÃ§Ã£o que SIGNIFICA algo aqui Ã© a oposta: a rota tem de
    // RECUSAR alto, nunca responder `200` com uma grade inventada, e a tela tem de dizer a
    // ausÃªncia com o token, nunca com um nÃºmero.
    expect(status, "sem window reader a rota tem de RECUSAR, nunca responder 200 com grade inventada").toBe(500);
    expect(apiPresent).toHaveLength(0);
    const readoutText = (await pane.locator('[data-fact^="cvd_last_reading:"]').textContent())?.trim() ?? "";
    fact(SPEC, "cvd_last_reading_text", readoutText);
    expect(readoutText).toContain(ABSENCE_TOKEN);
    // â `RN-1` literal: nenhum dÃ­gito onde nÃ£o hÃ¡ observaÃ§Ã£o. Um `0` aqui seria a afirmaÃ§Ã£o "nÃ£o
    // houve desequilÃ­brio comprador/vendedor neste minuto", feita a partir de ignorÃ¢ncia.
    expect(readoutText).not.toMatch(/\d/);
    return;
  }

  // ââ UNIVERSO FORTE: o item 3 do DoD-VERTICAL âââââââââââââââââââââââââââââââââââââââââââââââ
  expect(status).toBe(200);
  // Uma linha por instante da grade, presente ou ausente â `rows.length` sozinho NÃO Ã© evidÃªncia
  // de dado (`build_series_history_report` percorre a grade inteira); Ã© evidÃªncia de que a grade
  // pedida Ã© a grade devolvida.
  expect(rows.length).toBe(windowGridSlots);
  // AusÃªncia DECLARADA, nunca implÃ­cita: toda linha sem valor nomeia o motivo.
  expect(rows.filter((row) => row.value === null && row.absence === null)).toHaveLength(0);

  // `DoD-3`: `N >= 30` grades DISTINTAS com valor, lidas do DOM.
  expect(
    domPresentPoints,
    `DoD-3 pede N >= ${MINIMUM_DISTINCT_POINTS} pontos distintos no CvdPane; a tela declara ${domPresentPoints}`,
  ).toBeGreaterThanOrEqual(MINIMUM_DISTINCT_POINTS);
  // ...e o painel NÃO estÃ¡ no estado todo-ausente: com `N > 0`, o horizonte legÃ­vel tem comeÃ§o.
  expect(sinceMs, "com pontos na janela o horizonte legÃ­vel tem de ter um comeÃ§o").not.toBe("");

  // A leitura atual, comparada nos DOIS sentidos contra a API no Ãºltimo instante da janela.
  const apiLast = rows.find((row) => row.event_time === request.windowEndMsInclusive);
  const readoutText = (await pane.locator('[data-fact^="cvd_last_reading:"]').textContent())?.trim() ?? "";
  fact(SPEC, "cvd_api_last_instant_value", apiLast?.value ?? null);
  fact(SPEC, "cvd_last_reading_text", readoutText);
  if (apiLast?.value == null) {
    // AusÃªncia REAL no Ãºltimo instante, e ela Ã© NORMAL, nÃ£o falha: a cauda de publicaÃ§Ã£o deste
    // endpoint passa de um passo de grade (mÃ¡x medido 267 s, n=804 â
    // `ACHADO-FLOW-COM-ATRASO-MAIOR-QUE-A-GRADE.md`). O que `RN-1` proÃ­be Ã© o que ela NÃO pode
    // dizer. â ï¸ Ã por isso que "nÃ£o diz SEM_PONTO" do `DoD-3` Ã© asserido sobre o HORIZONTE
    // (acima) e nÃ£o sobre esta leitura: exigir um nÃºmero no Ãºltimo minuto reprovaria a
    // implementaÃ§Ã£o correta.
    expect(readoutText).toContain(ABSENCE_TOKEN);
    expect(readoutText).not.toMatch(/\d/);
  } else {
    // A API sabe o valor deste instante â a tela mostra ESSE nÃºmero e NÃO diz SEM_PONTO.
    expect(readoutText).not.toContain(ABSENCE_TOKEN);
    expect(readoutText).toContain(String(Number(apiLast.value)));
  }
});
