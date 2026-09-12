import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { computeSeriesKeyId } from "../src/app/symbol/series-key-id.ts";
import type { SeriesKey } from "../src/features/s3-inspector/series-catalog.ts";
import { fact, sentimentoApiBaseUrl } from "./helpers.ts";

/**
 * `T-02.6` (`SPEC-007` plano `02` item `2.7`, `DoD-3`, `D2`/item 3 do `DoD-VERTICAL`) — o
 * `CvdPane` com dado real na tela, contado contra a API que a própria página leu.
 *
 * ── O QUE ELE ASSERTA, E POR QUE NÃO É "STATUS 200" ──────────────────────────────────────────
 *
 * `D2` recusou o DoD só-de-API COM NÚMERO: a fase `02` de `pagina-de-grafico-s2` passou SQL+HTTP
 * verdes e o dado não chegava na tela; quem achou o defeito de wiring foi a fase `04`, em uso ao
 * vivo pelo owner. Então o que este arquivo mede é o DOM: quantos pontos o painel DIZ ter, e se
 * esse número é o da API sobre EXATAMENTE a janela que o servidor declarou no `<main>`.
 *
 * ── AS DUAS ARMADILHAS QUE JÁ CUSTARAM UM CICLO DE GATE, E COMO ESTE ARQUIVO PAGA CADA UMA ────
 *
 *   1. `Number(null) === 0`. Sob `make e2e` a API compõe o engine sqlite, que `ADR-034/D9` não
 *      dá reader de `md.series` ⇒ a API serve `0` pontos; se a página parar de publicar
 *      `data-cvd-present-points`, `Number(null)` também é `0` e a asserção fica verde sobre um
 *      DOM sem contrato nenhum — foi o `BLOCKER-3` da wave `03`, `rc=0, 24 passed`. Por isso o
 *      atributo é exigido NÃO-NULO e NÃO-VAZIO, em dígitos, ANTES de virar número.
 *   2. `metric === "cvd_source"` casa QUATRO linhas do catálogo, não uma (`aggtrade_q`,
 *      `aggtrade_nq`, `coinalyze_bv`, `kline_takerbuy`). O filtro daqui é o de três termos, e
 *      este arquivo AINDA verifica que ele casa exatamente UMA linha do catálogo servido pela
 *      API sob teste — é o guarda de deriva da transcrição em `cvd-series-selector.test.ts`,
 *      que roda contra um fixture e portanto não vê o catálogo real.
 *
 * ── OS DOIS UNIVERSOS, DECLARADOS EM TODA RODADA ─────────────────────────────────────────────
 *
 * Mesma partição que `08-symbol-dado-real.spec.ts` publica como `series_window_reader_present`:
 *
 *   FRACO  (sqlite, o que `make e2e` compõe): `/series-history` RECUSA (`500`). O que se prova
 *          aqui é o que `RN-1` é: diante de um backend que não responde, a tela diz `SEM_PONTO`
 *          e NUNCA um `0` fabricado — e o contrato de DOM está publicado.
 *   FORTE  (Postgres com reader): `N >= 30` grades distintas no DOM, iguais às da API, e o painel
 *          NÃO diz `SEM_PONTO` na leitura que a API sabe responder. É este o item 3 do
 *          `DoD-VERTICAL`, e ele só existe depois que `T-02.7` publica o deploy e o coletor roda
 *          ~30 min ao vivo (`handoff/T-02.5-T-02.6-web.md` §3: o backfill de 7 dias é invisível
 *          ao `as_of` por `available_at`, e isso é `D15`/`D17`, fora desta fase).
 *
 * ⛔ O universo FRACO nunca é relatado como se fosse o FORTE: toda rodada imprime
 * `series_window_reader_present` e `cvd_dom_present_points`, e o veredito do gate cita os dois.
 * ⛔ NADA AQUI SEMEIA O POSTGRES COMPARTILHADO (`[P-seed]`, `D2`): não há `INSERT`, `psql` nem
 * `docker` neste arquivo fora deste parágrafo.
 */

const SPEC = "10-cvd-dado-real";
const SYMBOL_PATH = "/symbol";
const SYMBOL = "BTCUSDT";

const apiBaseUrl = sentimentoApiBaseUrl;

/** `SymbolClient.tsx`'s stable anchors for this pane. Spelled out, not imported — importing
 * `SymbolClient.tsx` would pull `lightweight-charts` (and `../src/app/symbol/view-model.ts`
 * would pull `charts/index.ts` → `jsdom`, which dies under Playwright's module loader here and
 * takes the whole COLLECTION to `Total: 0 tests`). `cvd-pane-dom-contract.test.ts` guards the
 * same strings from the other side, which is the point: two independent witnesses of one
 * contract, so a rename has to break one of them. */
const CVD_PANE_TESTID = "cvd-pane";
const ABSENCE_TOKEN = "SEM_PONTO";

/** `DoD-3`: `N >= 30` pontos DISTINTOS, não `N > 0`. Não há divisor de `RN-S1` aqui — a série é
 * `1m` NATIVA (`SPEC-007 §4.1`), então cada grade com valor é uma barra nativa distinta e
 * `presentPoints === nativeBars`. Aplicar o `/5` do `RN-S1` subcontaria por 5×. */
const MINIMUM_DISTINCT_POINTS = 30;

/** Os três termos que identificam a linha `kline_takerbuy` — a MESMA regra de
 * `view-model.ts::matchesKlineTakerBuyCvd`, escrita à mão aqui pelo motivo do parágrafo acima.
 * Cada termo exclui um irmão: sem `provider` casa `coinalyze_bv`; sem `quantityField` casam
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
    throw new Error(`the page did not declare ${name} — SymbolClient.tsx stopped publishing its own request`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} is ${JSON.stringify(value)}, not a finite epoch-ms instant`);
  }
  return parsed;
}

/** `fetch` com UMA retentativa, e só em erro de transporte — mesma razão medida que
 * `08-symbol-dado-real.spec.ts` documenta (`undici` reaproveita a conexão que um worker que
 * acabou de responder `500` já fechou). Nenhuma asserção é afrouxada: qualquer resposta HTTP,
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
  // `response.json()` viraria `SyntaxError` — escondendo o status que o chamador precisa julgar.
  const raw = await response.text();
  let rows: readonly HistoryRow[];
  try {
    rows = (JSON.parse(raw) as { rows?: readonly HistoryRow[] }).rows ?? [];
  } catch {
    rows = [];
  }
  return { status: response.status, rows };
}

/** Este deployment tem reader de janela de `md.series`? Perguntado À PRÓPRIA API, nunca a uma
 * variável de ambiente — env var aqui seria allowlist disfarçada ("entrada de allowlist é
 * indistinguível de bypass", `CLAUDE.md`). `/ready` publica `store.path`, e `ADR-034/D9` não dá
 * fallback sqlite para `md.series`. Mesma função de `08`, transcrita pelo mesmo motivo de
 * carregamento de módulo que o cabeçalho explica. */
async function seriesWindowReaderPresent(): Promise<boolean> {
  const response = await fetchWithOneRetry(`${apiBaseUrl()}/ready`);
  const body = (await response.json()) as { store?: { path?: string } };
  const storePath = body.store?.path;
  if (typeof storePath !== "string") {
    throw new Error(`GET /ready did not publish store.path — cannot tell which engine this API composed`);
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
    "a página não declara o próprio request (data-window-start-ms) — build anterior a esta wave?",
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

/** Lê `data-cvd-present-points` EXIGINDO que ele exista e seja dígitos, antes de converter.
 *
 * ⛔ A conversão vem depois da exigência, e a ordem é o ativo: `Number(null)` e `Number("")` são
 * ambos `0`, e `0` é exatamente o que a API serve no universo fraco ⇒ sem estas duas asserções
 * o `expect(dom).toBe(api)` compara `0 === 0` e fica verde com o contrato APAGADO do DOM. */
async function readPresentPoints(page: Page): Promise<number> {
  const pane = page.locator(`[data-testid="${CVD_PANE_TESTID}"]`);
  await expect(pane, `o painel de CVD não existe no DOM sob [data-testid="${CVD_PANE_TESTID}"]`).toHaveCount(1);
  const raw = await pane.getAttribute("data-cvd-present-points");
  expect(
    raw,
    "a página parou de publicar `data-cvd-present-points` — sem o atributo não há o que comparar " +
      "com a API, e `Number(null) === 0` faria esta asserção passar sobre um DOM sem contrato",
  ).not.toBeNull();
  expect(
    raw ?? "",
    "`data-cvd-present-points` tem de ser uma contagem em dígitos; vazio vira 0 em `Number()`",
  ).toMatch(/^\d+$/);
  return Number(raw);
}

test(`o catálogo servido casa EXATAMENTE UMA linha de CVD para ${SYMBOL} (${SPEC})`, async () => {
  // O guarda de deriva do seletor. `cvd-series-selector.test.ts` roda contra um fixture
  // TRANSCRITO de `cvd_source_catalog.py`; este teste roda contra o catálogo que a API sob teste
  // realmente serve. Se o backend acrescentar uma quinta linha `cvd_source` de `binance`/`NA`, o
  // seletor passa a casar duas e `Array.prototype.find` escolhe uma delas em silêncio — que é a
  // classe de defeito que só aparece na tela, semanas depois.
  const entries = await fetchCatalogEntries();
  const forSymbol = entries.filter((entry) => entry.key.instrumentId === SYMBOL);
  const cvdSourceRows = forSymbol.filter((entry) => entry.key.metric === "cvd_source");
  const matched = forSymbol.filter((entry) => isKlineTakerBuyCvd(entry.key));
  fact(SPEC, "catalog_entries_total", entries.length);
  fact(SPEC, "catalog_cvd_source_rows_for_symbol", cvdSourceRows.length);
  fact(SPEC, "catalog_kline_takerbuy_matches", matched.length);

  expect(
    matched.length,
    `o filtro de três termos casou ${matched.length} linhas — DoD-3 lê um painel só, e ` +
      "`find` escolheria uma delas sem dizer qual",
  ).toBe(1);
  // E a linha casada é a leitura DIRETA, não a reconstrução da Coinalyze: `T-02.1` mediu
  // `reconstructed_from=None` ANTES de a identidade ser gravada (`n=4.320` buckets, `276` runs
  // divergentes, ZERO com resíduo). Uma reconstrução na tela sem banda de erro é o par `D6.9`
  // quebrado, e seria invisível sem esta linha.
  expect(matched[0]!.reconstructedFrom, "a linha escolhida não pode ser a reconstrução").toBeNull();
  expect(matched[0]!.key.nature, "nature FLOW é o contrato em que SEM_PONTO se apoia").toBe("FLOW");
  // ...e o filtro de UM termo, que seria "o mesmo filtro, mais simples", casaria as quatro.
  expect(
    cvdSourceRows.length,
    "se houvesse só uma linha `cvd_source` no catálogo, o filtro de três termos seria indistinguível " +
      "do de um termo e este arquivo não provaria nada sobre ele",
  ).toBeGreaterThan(1);
});

test(`o número de pontos do CvdPane é o da API, sobre a MESMA janela (${SPEC})`, async ({ page }) => {
  const request = await loadRenderedRequest(page);
  // A grade da janela, derivada dos instantes que o SERVIDOR declarou no `<main>` — nunca do
  // relógio deste processo, que correria contra o do render.
  const windowGridSlots = (request.windowEndMsInclusive - request.windowStartMs) / 60_000 + 1;
  const entries = await fetchCatalogEntries();
  const cvdEntry = entries.find((entry) => entry.key.instrumentId === SYMBOL && isKlineTakerBuyCvd(entry.key));
  expect(cvdEntry, `nenhuma linha kline_takerbuy no catálogo para ${SYMBOL}`).toBeDefined();

  const seriesKeyId = computeSeriesKeyId(cvdEntry!.key);
  const { status, rows } = await fetchSeriesHistory(seriesKeyId, request);
  const apiPresent = rows.filter((row) => row.value !== null);
  const readerPresent = await seriesWindowReaderPresent();

  fact(SPEC, "series_window_reader_present", readerPresent);
  fact(SPEC, "cvd_series_key_id", seriesKeyId);
  fact(SPEC, "cvd_series_history_status", status);
  fact(SPEC, "cvd_series_history_rows", rows.length);
  fact(SPEC, "cvd_api_rows_with_value", apiPresent.length);

  // ── (a) o contrato de DOM existe, e é lido ANTES de qualquer comparação ────────────────────
  const domPresentPoints = await readPresentPoints(page);
  fact(SPEC, "cvd_dom_present_points", domPresentPoints);

  // ── (b) a contagem da tela é a da API, exata ───────────────────────────────────────────────
  //
  // Exata, não aproximada: os dois lados saíram da MESMA janela declarada, então divergir é
  // defeito de wiring, não corrida. Total sobre os dois universos — no fraco a API serve `0` e a
  // tela tem de servir `0` TAMBÉM PUBLICANDO o atributo, o que (a) já exigiu.
  expect(domPresentPoints).toBe(apiPresent.length);

  // ── (c) o horizonte legível é DECLARADO, com os dois números ───────────────────────────────
  //
  // Sem encolher o vão: o denominador é a grade inteira da janela, não um sub-intervalo recortado
  // em volta do dado. `[MEDIDO 2026-09-11]` só `769/5.761` grades da janela derivada carregam
  // valor, e a primeira fica ~86% adentro — o CVD herda isso exatamente, porque é a mesma linha
  // do mesmo coletor (`ACHADO-BACKFILL-INVISIVEL-AO-AS-OF.md`).
  const pane = page.locator(`[data-testid="${CVD_PANE_TESTID}"]`);
  const horizon = pane.locator('[data-fact^="cvd_readable_horizon:"]');
  await expect(horizon).toHaveCount(1);
  const horizonFact = await horizon.getAttribute("data-fact");
  fact(SPEC, "cvd_readable_horizon_fact", horizonFact);
  fact(SPEC, "cvd_window_grid_slots", windowGridSlots);
  // ⚠️ O DENOMINADOR É A GRADE DA JANELA, NÃO `rows.length`, E A DIFERENÇA É O PRÓPRIO PONTO.
  // O sub-eixo de Volume monta os slots a partir das LINHAS da API (`volumeSlotsFromHistoryRows`),
  // então lá os dois números coincidem e `08` pode comparar contra `rows.length`. O CVD passa por
  // `buildCvdPanel`, que alinha os deltas na grade canônica da JANELA — então quando a API recusa
  // (universo fraco, `rows = []`) o painel continua declarando `0/5760`, e é isso que ele deve
  // declarar: a janela não encolheu porque o backend não respondeu. Assertar `0/0` aqui exigiria
  // que a tela ESCONDESSE o vão, que é exatamente o oposto do que `RN-1` pede.
  expect(horizonFact).toBe(`cvd_readable_horizon:${apiPresent.length}/${windowGridSlots}`);
  const sinceMs = await horizon.getAttribute("data-readable-since-ms");
  fact(SPEC, "cvd_readable_since_ms", sinceMs);
  expect(sinceMs).toBe(apiPresent.length === 0 ? "" : String(apiPresent[0]!.event_time));

  // ── (d) a âncora do acumulado está na tela, e é a que o servidor declarou ───────────────────
  //
  // `delta` é âncora-livre; `cumulativo` é uma VIEW cujo sinal do total muda com a âncora
  // (`D4.7`). Uma curva acumulada sem âncora dita não é legível, e herdá-la em silêncio do
  // default de `charts` é o mesmo que não ter escolhido.
  const anchor = pane.locator('[data-fact^="cvd_cumulative_anchor:"]');
  await expect(anchor).toHaveCount(1);
  const anchorFact = await anchor.getAttribute("data-fact");
  fact(SPEC, "cvd_cumulative_anchor_fact", anchorFact);
  expect(anchorFact).toBe(`cvd_cumulative_anchor:${request.windowStartMs}`);

  // ── (d2) `DR-3`: o ACUMULADO tem leitura numérica, e ela é do mesmo TIPO que a do delta ────
  //
  // O design-review de 2026-09-12 bloqueou o painel por isto: ele desenhava DUAS séries e lia
  // exatamente UMA. A tela declarava a âncora do acumulado (`D4.7`, logo acima) e nunca dizia
  // qual valor tinha sido ancorado — "há uma série renderizada sem nenhum falsificador de DOM
  // sobre o seu valor".
  //
  // ⛔ E A ASSERÇÃO É DE ACORDO ENTRE OS DOIS READOUTS, não "existe um <p>". `cvdCumulativeScaled`
  // (`charts/s2-cvd.ts:176-193`) acumula SÓ sobre bucket presente, a partir de `anchorMs`, e a
  // âncora é `window.startMs` ⇒ o slot do acumulado é presente **se e somente se** o do delta é.
  // Logo os dois `kind` têm de ser o MESMO, nos dois universos. Um acumulado que diga um número
  // onde o delta diz `SEM_PONTO` é uma soma corrida inventada sobre um bucket sem observação,
  // que é o defeito de `RN-1` uma série ao lado.
  const cumulativeReadout = pane.locator('[data-fact^="cvd_cumulative_last_reading:"]');
  await expect(
    cumulativeReadout,
    "o acumulado do CVD tem de ter leitura numérica no DOM — sem ela a tela declara a âncora e nunca diz o valor " +
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

  // ── (d3) `DR-3`/WCAG 1.4.1: as duas linhas são NOMEADAS, não distinguidas só por cor ───────
  const legend = pane.locator('[data-fact="cvd_legend:2"]');
  await expect(legend).toHaveCount(1);
  const legendText = (await legend.textContent())?.trim() ?? "";
  fact(SPEC, "cvd_legend_text", legendText);
  expect(legendText).toContain("Delta");
  expect(legendText).toContain("Acumulado");

  // ── (e) o veredito por universo ────────────────────────────────────────────────────────────
  if (!readerPresent) {
    // A API acabou de declarar, sobre si mesma, que compôs o engine sqlite — que `ADR-034/D9` não
    // dá reader de `md.series`. A asserção que SIGNIFICA algo aqui é a oposta: a rota tem de
    // RECUSAR alto, nunca responder `200` com uma grade inventada, e a tela tem de dizer a
    // ausência com o token, nunca com um número.
    expect(status, "sem window reader a rota tem de RECUSAR, nunca responder 200 com grade inventada").toBe(500);
    expect(apiPresent).toHaveLength(0);
    const readoutText = (await pane.locator('[data-fact^="cvd_last_reading:"]').textContent())?.trim() ?? "";
    fact(SPEC, "cvd_last_reading_text", readoutText);
    expect(readoutText).toContain(ABSENCE_TOKEN);
    // ⛔ `RN-1` literal: nenhum dígito onde não há observação. Um `0` aqui seria a afirmação "não
    // houve desequilíbrio comprador/vendedor neste minuto", feita a partir de ignorância.
    expect(readoutText).not.toMatch(/\d/);
    return;
  }

  // ── UNIVERSO FORTE: o item 3 do DoD-VERTICAL ───────────────────────────────────────────────
  expect(status).toBe(200);
  // Uma linha por instante da grade, presente ou ausente — `rows.length` sozinho NÃO é evidência
  // de dado (`build_series_history_report` percorre a grade inteira); é evidência de que a grade
  // pedida é a grade devolvida.
  expect(rows.length).toBe(windowGridSlots);
  // Ausência DECLARADA, nunca implícita: toda linha sem valor nomeia o motivo.
  expect(rows.filter((row) => row.value === null && row.absence === null)).toHaveLength(0);

  // `DoD-3`: `N >= 30` grades DISTINTAS com valor, lidas do DOM.
  expect(
    domPresentPoints,
    `DoD-3 pede N >= ${MINIMUM_DISTINCT_POINTS} pontos distintos no CvdPane; a tela declara ${domPresentPoints}`,
  ).toBeGreaterThanOrEqual(MINIMUM_DISTINCT_POINTS);
  // ...e o painel NÃO está no estado todo-ausente: com `N > 0`, o horizonte legível tem começo.
  expect(sinceMs, "com pontos na janela o horizonte legível tem de ter um começo").not.toBe("");

  // A leitura atual, comparada nos DOIS sentidos contra a API no último instante da janela.
  const apiLast = rows.find((row) => row.event_time === request.windowEndMsInclusive);
  const readoutText = (await pane.locator('[data-fact^="cvd_last_reading:"]').textContent())?.trim() ?? "";
  fact(SPEC, "cvd_api_last_instant_value", apiLast?.value ?? null);
  fact(SPEC, "cvd_last_reading_text", readoutText);
  if (apiLast?.value == null) {
    // Ausência REAL no último instante, e ela é NORMAL, não falha: a cauda de publicação deste
    // endpoint passa de um passo de grade (máx medido 267 s, n=804 —
    // `ACHADO-FLOW-COM-ATRASO-MAIOR-QUE-A-GRADE.md`). O que `RN-1` proíbe é o que ela NÃO pode
    // dizer. ⚠️ É por isso que "não diz SEM_PONTO" do `DoD-3` é asserido sobre o HORIZONTE
    // (acima) e não sobre esta leitura: exigir um número no último minuto reprovaria a
    // implementação correta.
    expect(readoutText).toContain(ABSENCE_TOKEN);
    expect(readoutText).not.toMatch(/\d/);
  } else {
    // A API sabe o valor deste instante ⇒ a tela mostra ESSE número e NÃO diz SEM_PONTO.
    expect(readoutText).not.toContain(ABSENCE_TOKEN);
    expect(readoutText).toContain(String(Number(apiLast.value)));
  }
});
