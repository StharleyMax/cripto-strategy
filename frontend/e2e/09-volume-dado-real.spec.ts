import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { computeSeriesKeyId } from "../src/app/symbol/series-key-id.ts";
import type { SeriesKey } from "../src/features/s3-inspector/series-catalog.ts";
import { fact, sentimentoApiBaseUrl } from "./helpers.ts";

/**
 * `T-01.9` (`SPEC-007` plano `01` item `1.11`, `DoD-3`, `RN-S2`, item 3 do `DoD-VERTICAL`) â o
 * SUB-EIXO DE VOLUME com dado real na tela, contado contra a API que a prÃ³pria pÃ¡gina leu, e
 * com PISO: `N >= 30` pontos distintos, nunca `N > 0`.
 *
 * ââ O BURACO QUE ESTE ARQUIVO FECHA, COM O NÃMERO QUE O MEDIU ââââââââââââââââââââââââââââââââ
 *
 * O portÃ£o desta fase era VERDE com ZERO ponto de volume na tela â as duas linhas saÃ­am LADO A
 * LADO no mesmo log `[MEDIDO 2026-09-15, gates/QA-FASE-01-fechamento.md Â§4.1]`:
 *
 *     E2E-FACT 08-symbol-dado-real volume_dom_present_points=0
 *     [OK       ] e2e             rc=0  30 passed (34.6s)
 *
 * `08-symbol-dado-real.spec.ts` compara DOM CONTRA API â e `0 === 0` passa. Ele diz isso de si
 * mesmo na prÃ³pria linha 60 (*"NOT the `DoD-3` of `T-01.9`"*). As fases `02` e `03` escreveram o
 * piso (`MINIMUM_DISTINCT_POINTS` em `10-cvd`, `MINIMUM_NATIVE_BARS` em `12-oi`); a `01`, que
 * INVENTOU a exigÃªncia, nÃ£o tinha nenhum â o verde dela nÃ£o significava nada. O dado jÃ¡ estava na
 * tela: `volume_api_rows_with_value = volume_dom_present_points = 3.374` numa rodada SOMENTE
 * LEITURA contra a stack viva `[MEDIDO 2026-09-15, gates/QA-FASE-01-fechamento.md Â§4.3]`. O que
 * faltava era a AMARRA, nÃ£o o pipeline: nada no repositÃ³rio reprovava se a mÃ©trica parasse de
 * chegar.
 *
 * ââ â POR QUE O MOLDE NÃO Ã O `08`, QUE Ã O QUE `tasks.toml:228` MANDA COPIAR ââââââââââââââââ
 *
 * Porque o `08` pergunta a coisa errada para uma sÃ©rie que nÃ£o Ã© `1m` nativa, e isso jÃ¡ custou um
 * falso negativo medido (`gates/QA-FASE-01-fechamento.md` Â§5): ele crava `interval: "1m"` +
 * `bar_policy: "final_only"` (`08:169`) para TODA sÃ©rie, mas `klines_last` Ã© `interval=5m`,
 * `nativeGrid=5min`, `maxStaleness=600000` â a grade de 1 min devolve `5.760` linhas com `0`
 * valor, enquanto a manchete do painel vem do endpoint LIVE (`page.tsx:407 buildLiveUrl`) e
 * declara a prÃ³pria idade na tela. O assert comparava grade histÃ³rica vazia contra leitura viva.
 *
 * O molde adotado Ã© `10-cvd-dado-real.spec.ts` (piso nomeado + desdobramento FRACO/FORTE +
 * controle negativo), e a liÃ§Ã£o do `08` vira ASSERÃÃO aqui, nÃ£o comentÃ¡rio: a pergunta `1m` sÃ³ Ã©
 * legÃ­tima porque o CATÃLOGO declara esta sÃ©rie `1m`/`1min` nativa, e o primeiro teste deste
 * arquivo exige exatamente isso. Se o backend reintervalar `klines_volume`, este arquivo REPROVA
 * em vez de contar degraus de escada como se fossem barras (`RN-S1`).
 *
 * ââ O PISO, E POR QUE ELE NÃO PODE SER SATISFEITO POR AUSÃNCIA âââââââââââââââââââââââââââââââ
 *
 * `countPresentRows` conta LINHA COM VALOR, nunca linha da grade: a rota devolve uma linha por
 * instante da janela, presente ou ausente (`build_series_history_report` caminha a grade inteira),
 * entÃ£o `rows.length >= 30` Ã© verdade num universo sem NENHUM dado. O teste `MORDE do
 * instrumento` executa essa distinÃ§Ã£o contra um fixture sintÃ©tico, roda NOS DOIS UNIVERSOS â
 * inclusive no portÃ£o, onde nada sobre dado real pode morder â e Ã© o par morde/cala do piso.
 *
 * ââ OS DOIS UNIVERSOS, DECLARADOS EM TODA RODADA âââââââââââââââââââââââââââââââââââââââââââââ
 *
 *   FRACO  (sqlite, o que `make e2e`/`make verify` compÃµem): `/series-history` RECUSA (`500`).
 *          Prova-se `RN-1`: diante de um backend que nÃ£o responde, a tela diz `SEM_PONTO` e NUNCA
 *          um `0` fabricado, e o contrato de DOM estÃ¡ publicado.
 *   FORTE  (Postgres com reader): `N >= 30` pontos no DOM, IGUAIS aos da API sobre a MESMA janela
 *          declarada pelo servidor. Ã o item 3 do `DoD-VERTICAL`.
 *
 * â O universo FRACO nunca Ã© relatado como se fosse o FORTE: toda rodada imprime
 * `series_window_reader_present` e `volume_dom_present_points`.
 * â NADA AQUI SEMEIA O POSTGRES COMPARTILHADO (`[P-seed]`, `D2`): nÃ£o hÃ¡ `INSERT`, `psql` nem
 * `docker` neste arquivo fora deste parÃ¡grafo. O backfill de `T-01.3` jÃ¡ entrega ponto legÃ­timo â
 * leitura da origem NÃO Ã© dado de teste (`SPEC-007 Â§3.7`).
 */

const SPEC = "09-volume-dado-real";
const SYMBOL = "BTCUSDT";
// `T-02.5` — a rota virou `/symbol/[symbol]`, segmento em ingles; a página do piloto é `SYMBOL`.
const SYMBOL_PATH = `/symbol/${SYMBOL}`;
const ONE_MINUTE_MS = 60_000;

const apiBaseUrl = sentimentoApiBaseUrl;

/** As Ã¢ncoras estÃ¡veis do sub-eixo em `SymbolClient.tsx` (`VOLUME_SUBAXIS_TESTID`, fixado por
 * `T-01.7` justamente para esta task). Escritas Ã  mÃ£o, nÃ£o importadas: importar `SymbolClient.tsx`
 * traria `lightweight-charts`, e `view-model.ts` traria `charts/index.ts` -> `jsdom`, que morre sob
 * o carregador de mÃ³dulos do Playwright e leva a COLEÃÃO inteira para `Total: 0 tests` â o sinal
 * que custou 21 testes nesta feature. `volume-subaxis-dom-contract.test.ts` guarda as mesmas
 * strings do outro lado: duas testemunhas independentes de um contrato sÃ³.
 *
 * â E o seletor Ã© o `data-testid`, NUNCA o `aria-label`/texto: Ã© o que desacopla este assert do
 * veredito de design de `T-01.8` â um `NEEDS_FIX` de cor, altura ou escala nÃ£o pode quebrar uma
 * asserÃ§Ã£o sobre DADO. */
const VOLUME_SUBAXIS_TESTID = "price-pane-volume-subaxis";
const ABSENCE_TOKEN = "SEM_PONTO";

/**
 * `DoD-3`/`RN-S2`: o piso Ã© `N >= 30` pontos DISTINTOS, e o `30` nÃ£o Ã© gosto.
 *
 * `N > 0` nÃ£o distingue *"o cano funcionou"* de *"caiu um ponto por acaso"*, e `D2` (owner) existe
 * para acabar com sinal indistinguÃ­vel. NÃ£o hÃ¡ divisor de `RN-S1` aqui: `klines_volume` Ã© `1m`
 * NATIVA (`SPEC-007 Â§4.1`, e o primeiro teste deste arquivo o EXIGE do catÃ¡logo), entÃ£o cada grade
 * com valor Ã© uma barra nativa distinta e `presentPoints === nativeBars`. Aplicar o `/5` do
 * `RN-S1` subcontaria por 5x.
 *
 * FOLGA MEDIDA, para que o piso seja exigente e nÃ£o profÃ©tico: a rodada somente-leitura contra a
 * stack viva deu `volume_api_rows_with_value = volume_dom_present_points = 3.374` â 112x o piso
 * `[MEDIDO 2026-09-15, gates/QA-FASE-01-fechamento.md Â§4.3]`. â este nÃºmero NÃO Ã© o que a
 * implementaÃ§Ã£o de hoje entrega (seria um piso que nunca morde); Ã© o mÃ­nimo abaixo do qual a
 * mÃ©trica deixou de chegar Ã  tela.
 */
const MINIMUM_DISTINCT_POINTS = 30;

interface CatalogEntryWire {
  readonly key: SeriesKey;
  readonly nativeGrid: string;
  readonly maxStalenessMs: number;
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

/** A linha de volume do catÃ¡logo: `klines_volume` Ã© UMA linha por instrumento hoje, e a rota lÃª
 * exatamente assim (`page.tsx::VOLUME_METRIC` + `resolveCatalogEntry`, que RESOLVE PARA NADA se
 * casar mais de uma). Transcrito, nÃ£o importado, pelo mesmo motivo do bloco de seletores. */
function isKlinesVolume(key: SeriesKey): boolean {
  return key.metric === "klines_volume";
}

/**
 * â O INSTRUMENTO DO PISO, E ELE CONTA VALOR â NÃO LINHA DE GRADE.
 *
 * `/series-history` devolve UMA LINHA POR INSTANTE da janela, presente ou ausente
 * (`use_cases/series_history.py`, que caminha a grade inteira), entÃ£o `rows.length` Ã© ~5.761 num
 * universo sem NENHUM dado ingerido. Um piso lido sobre `rows.length` estaria satisfeito por
 * ausÃªncia â que Ã© a forma exata do verde vazio que este arquivo existe para matar. O teste
 * `MORDE do instrumento` executa essa diferenÃ§a contra um fixture sintÃ©tico.
 */
function countPresentRows(rows: readonly HistoryRow[]): number {
  return rows.filter((row) => row.value !== null).length;
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

/** `fetch` com UMA retentativa, e sÃ³ em erro de transporte â mesma razÃ£o medida que `08`/`10`/`12`
 * documentam (`undici` reaproveita a conexÃ£o que um worker que acabou de responder `500` jÃ¡
 * fechou). Nenhuma asserÃ§Ã£o Ã© afrouxada: qualquer resposta HTTP, de qualquer status, volta
 * intacta. */
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

/**
 * A MESMA pergunta que a pÃ¡gina faz (`page.tsx::fetchPanelRows`: grade de 1 min, `final_only`).
 *
 * â ï¸ O `interval: "1m"` daqui NÃO Ã© o do `08`, e a diferenÃ§a Ã© de FUNDAMENTO, nÃ£o de valor: lÃ¡ ele
 * Ã© cravado para qualquer sÃ©rie (e mente sobre `klines_last`, que Ã© `5m`); aqui ele Ã© a grade que
 * o catÃ¡logo DECLARA nativa para esta sÃ©rie, e o primeiro teste deste arquivo reprova se essa
 * declaraÃ§Ã£o mudar. A rota sÃ³ serve a grade de 1 min de qualquer forma (`interval=5m` â `422`
 * `[MEDIDO 2026-09-15, Â§5 do laudo]`), entÃ£o o que protege o nÃºmero nÃ£o Ã© o parÃ¢metro â Ã© a
 * asserÃ§Ã£o sobre o que a sÃ©rie Ã.
 */
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
 * indistinguÃ­vel de bypass", `CLAUDE.md`), e qualquer um silenciaria o ramo FORTE sem mudar o que
 * o deployment Ã. `/ready` publica `store.path`, e `ADR-034/D9` nÃ£o dÃ¡ fallback sqlite para
 * `md.series`. */
async function seriesWindowReaderPresent(): Promise<boolean> {
  const response = await fetchWithOneRetry(`${apiBaseUrl()}/ready`);
  const body = (await response.json()) as { store?: { path?: string } };
  const storePath = body.store?.path;
  if (typeof storePath !== "string") {
    throw new Error("GET /ready did not publish store.path â cannot tell which engine this API composed");
  }
  return !storePath.endsWith(".sqlite3");
}

async function loadRenderedRequest(page: Page): Promise<RenderedRequest> {
  const response = await page.goto(SYMBOL_PATH, { waitUntil: "networkidle" });
  fact(SPEC, "http_status", response?.status() ?? null);
  expect(response?.status()).toBe(200);

  const main = page.locator("main[data-window-start-ms]");
  await expect(main, "a pÃ¡gina nÃ£o declara o prÃ³prio request (data-window-start-ms)").toHaveCount(1);
  return {
    windowStartMs: requiredNumberAttribute(await main.getAttribute("data-window-start-ms"), "data-window-start-ms"),
    windowEndMsInclusive: requiredNumberAttribute(
      await main.getAttribute("data-window-end-ms-inclusive"),
      "data-window-end-ms-inclusive",
    ),
    knowledgeTimeMs: requiredNumberAttribute(
      await main.getAttribute("data-knowledge-time-ms"),
      "data-knowledge-time-ms",
    ),
  };
}

/**
 * LÃª uma contagem do DOM EXIGINDO que ela exista e seja dÃ­gitos, ANTES de converter.
 *
 * â A ordem Ã© o ativo: `Number(null)` e `Number("")` sÃ£o ambos `0`, e `0` Ã© exatamente o que a API
 * serve no universo fraco â sem estas duas asserÃ§Ãµes o `expect(dom).toBe(api)` compara `0 === 0` e
 * fica verde com o contrato APAGADO do DOM. Foi o `BLOCKER-3` da wave `03`, `rc=0, 24 passed`.
 */
function requireDigits(raw: string | null, attribute: string): number {
  expect(
    raw,
    `a pÃ¡gina parou de publicar \`${attribute}\` â sem o atributo nÃ£o hÃ¡ o que comparar com a API, e ` +
      "`Number(null) === 0` faria a asserÃ§Ã£o passar sobre um DOM sem contrato",
  ).not.toBeNull();
  expect(raw ?? "", `\`${attribute}\` tem de ser uma contagem em dÃ­gitos; vazio vira 0 em \`Number()\``).toMatch(
    /^\d+$/,
  );
  return Number(raw);
}

test(`o catÃ¡logo casa UMA linha de volume, e ela Ã© 1m NATIVA â a premissa do piso (${SPEC})`, async () => {
  // â ESTE TESTE Ã A CORREÃÃO DO MOLDE DO `08`, e nÃ£o decoraÃ§Ã£o de catÃ¡logo. O piso deste arquivo
  // conta GRADE COM VALOR e chama isso de "ponto distinto". Essa igualdade sÃ³ vale porque a sÃ©rie
  // Ã© `1m` nativa; se `klines_volume` virar `5m` servida na grade de 1 min, a MESMA contagem passa
  // a somar degraus de escada e `30` degraus viram `6` barras reais (`RN-S1`) â exatamente o
  // subconto que `12-oi-dado-real.spec.ts` existe para evitar do outro lado. Aqui a premissa Ã©
  // ASSERIDA contra o catÃ¡logo que a API sob teste realmente serve, em vez de ficar em comentÃ¡rio.
  const entries = await fetchCatalogEntries();
  const forSymbol = entries.filter((entry) => entry.key.instrumentId === SYMBOL);
  const matched = forSymbol.filter((entry) => isKlinesVolume(entry.key));
  fact(SPEC, "catalog_entries_total", entries.length);
  fact(SPEC, "catalog_volume_rows_for_symbol", matched.length);

  // UMA linha, e a exigÃªncia Ã© a da PRÃPRIA ROTA: `resolveCatalogEntry` devolve `ambiguous` â que
  // degrada o sub-eixo para vazio â assim que o mesmo seletor casar duas. Um catÃ¡logo que ganhe
  // uma segunda linha `klines_volume` apaga o painel sem dizer por quÃª; aqui isso reprova.
  expect(
    matched.length,
    `o seletor de volume casou ${matched.length} linhas â a rota resolve AMBIGUOUS e o sub-eixo ` +
      "degrada para vazio, com o portÃ£o verde",
  ).toBe(1);

  const volume = matched[0]!;
  fact(SPEC, "catalog_volume_interval", volume.key.interval);
  fact(SPEC, "catalog_volume_native_grid", volume.nativeGrid);
  fact(SPEC, "catalog_volume_max_staleness_ms", volume.maxStalenessMs);
  // A premissa do piso, em duas asserÃ§Ãµes: grade nativa de 1 min â 1 slot com valor = 1 barra.
  expect(volume.key.interval, "o piso conta slot-com-valor como barra nativa; isso exige interval 1m").toBe("1m");
  expect(volume.nativeGrid, "e a grade nativa declarada tem de ser a mesma coisa dita do outro campo").toBe("1min");
  // `RNF-2`: o teto de frescor Ã© 2x o bucket nativo â o mesmo invariante que `12-oi` cobra para a
  // sÃ©rie de 5 min, aplicado Ã  de 1 min. Um teto que deixe de casar com o intervalo Ã© a primeira
  // evidÃªncia de reintervalamento silencioso.
  expect(volume.maxStalenessMs).toBe(2 * ONE_MINUTE_MS);
  // `FLOW`/`SUM` Ã© o contrato em que `SEM_PONTO` se apoia: para uma soma de quantidade negociada,
  // imprimir `0` onde nÃ£o houve observaÃ§Ã£o Ã© erro de TIPO (`RN-1`), nÃ£o de gosto.
  expect(volume.key.nature).toBe("FLOW");
  expect(volume.key.reduction).toBe("SUM");
  // E a linha Ã© leitura DIRETA da origem, nÃ£o reconstruÃ§Ã£o de terceiro (`ADR-036/D2`).
  expect(volume.reconstructedFrom, "a linha escolhida nÃ£o pode ser uma reconstruÃ§Ã£o").toBeNull();
});

test(`MORDE do instrumento: o piso REJEITA grade vazia e CALA sobre dado legÃ­timo (${SPEC})`, async () => {
  // â O FALSIFICADOR DO PRÃPRIO MEDIDOR, e ele roda NOS DOIS UNIVERSOS â inclusive no portÃ£o,
  // onde a API nÃ£o tem reader e nenhuma asserÃ§Ã£o sobre dado real pode morder. Sem ele, "o e2e
  // passa" no `make verify` continuaria compatÃ­vel com um contador que nÃ£o sabe contar, que Ã©
  // literalmente o estado que esta task encontrou.
  //
  // Um fixture sintÃ©tico, aqui e sÃ³ aqui â nada disto toca banco nenhum (`[P-seed]`).
  const grid = (count: number, presentUpTo: number): HistoryRow[] =>
    Array.from({ length: count }, (_unused, index) => ({
      event_time: index * ONE_MINUTE_MS,
      value: index < presentUpTo ? String(12.5 + index) : null,
      absence: index < presentUpTo ? null : "NO_OBSERVATION",
    }));

  // ââ MORDE (1): a grade INTEIRA da janela, sem UM valor. `rows.length` diria 5.761 e o piso
  // estaria "satisfeito" por ausÃªncia pura â o verde vazio que este arquivo mata.
  const emptyWindow = grid(5_761, 0);
  fact(SPEC, "morde_empty_window_rows", emptyWindow.length);
  fact(SPEC, "morde_empty_window_present", countPresentRows(emptyWindow));
  expect(emptyWindow.length, "a grade tem 5.761 linhas...").toBeGreaterThanOrEqual(MINIMUM_DISTINCT_POINTS);
  expect(countPresentRows(emptyWindow), "...e ZERO pontos â o piso tem de ler o segundo nÃºmero").toBe(0);
  expect(countPresentRows(emptyWindow)).toBeLessThan(MINIMUM_DISTINCT_POINTS);

  // ââ MORDE (2): a BORDA. 29 pontos reais numa grade cheia nÃ£o passam por 30 â o piso nÃ£o Ã©
  // `> 0` disfarÃ§ado, e Ã© aqui que se vÃª que o `>=` estÃ¡ do lado certo.
  const justBelow = grid(5_761, MINIMUM_DISTINCT_POINTS - 1);
  fact(SPEC, "morde_just_below_present", countPresentRows(justBelow));
  expect(countPresentRows(justBelow)).toBe(29);
  expect(countPresentRows(justBelow)).toBeLessThan(MINIMUM_DISTINCT_POINTS);

  // ââ CALA: exatamente o piso, e a folga real da produÃ§Ã£o. Um instrumento que reprovasse aqui
  // seria um piso que nunca cala â tÃ£o inÃºtil quanto um que nunca morde.
  const atFloor = grid(5_761, MINIMUM_DISTINCT_POINTS);
  const measuredLive = grid(5_761, 3_374);
  fact(SPEC, "cala_at_floor_present", countPresentRows(atFloor));
  fact(SPEC, "cala_measured_live_present", countPresentRows(measuredLive));
  expect(countPresentRows(atFloor)).toBeGreaterThanOrEqual(MINIMUM_DISTINCT_POINTS);
  expect(countPresentRows(measuredLive)).toBeGreaterThanOrEqual(MINIMUM_DISTINCT_POINTS);

  // E se o dado sumir, a contagem some junto: nada aqui sobra como constante.
  expect(countPresentRows(measuredLive.map((row) => ({ ...row, value: null, absence: ABSENCE_TOKEN })))).toBe(0);
});

test(`o sub-eixo de Volume mostra o nÃºmero da API, e N >= ${MINIMUM_DISTINCT_POINTS} no universo FORTE (${SPEC})`, async ({
  page,
}) => {
  const request = await loadRenderedRequest(page);
  // A grade da janela, derivada dos instantes que o SERVIDOR declarou no `<main>` â nunca do
  // relÃ³gio deste processo, que correria contra o do render.
  const windowGridSlots = (request.windowEndMsInclusive - request.windowStartMs) / ONE_MINUTE_MS + 1;

  const entries = await fetchCatalogEntries();
  const volumeEntry = entries.find((entry) => entry.key.instrumentId === SYMBOL && isKlinesVolume(entry.key));
  expect(volumeEntry, `nenhuma linha klines_volume no catÃ¡logo para ${SYMBOL}`).toBeDefined();

  const seriesKeyId = computeSeriesKeyId(volumeEntry!.key);
  const { status, rows } = await fetchSeriesHistory(seriesKeyId, request);
  const apiPresent = rows.filter((row) => row.value !== null);
  const apiLast = rows.find((row) => row.event_time === request.windowEndMsInclusive);
  const readerPresent = await seriesWindowReaderPresent();

  fact(SPEC, "series_window_reader_present", readerPresent);
  fact(SPEC, "volume_series_key_id", seriesKeyId);
  fact(SPEC, "volume_series_history_status", status);
  fact(SPEC, "volume_series_history_rows", rows.length);
  fact(SPEC, "volume_api_rows_with_value", countPresentRows(rows));
  fact(SPEC, "volume_window_grid_slots", windowGridSlots);

  // ââ (a) o contrato de DOM existe, e Ã© lido ANTES de qualquer comparaÃ§Ã£o âââââââââââââââââââââ
  const subAxis = page.locator(`[data-testid="${VOLUME_SUBAXIS_TESTID}"]`);
  await expect(
    subAxis,
    `o sub-eixo de volume nÃ£o existe no DOM sob [data-testid="${VOLUME_SUBAXIS_TESTID}"]`,
  ).toHaveCount(1);
  const domPresentPoints = requireDigits(
    await subAxis.getAttribute("data-volume-present-points"),
    "data-volume-present-points",
  );
  fact(SPEC, "volume_dom_present_points", domPresentPoints);

  // ââ (b) A INVARIANTE `DOM == API`, exata e TOTAL sobre os dois universos ââââââââââââââââââââ
  //
  // Exata, nÃ£o aproximada: os dois lados saÃ­ram da MESMA janela declarada pelo servidor, entÃ£o
  // divergir Ã© defeito de WIRING, nÃ£o corrida. Ã a asserÃ§Ã£o que a fase `04` de
  // `pagina-de-grafico-s2` teve de descobrir EM USO AO VIVO porque nenhum teste comparava as duas
  // superfÃ­cies (`D2`, owner, recusou o DoD sÃ³-de-API COM NÃMERO).
  expect(
    domPresentPoints,
    `a tela declara ${domPresentPoints} pontos e a API serve ${countPresentRows(rows)} sobre a MESMA janela`,
  ).toBe(countPresentRows(rows));

  // ââ (c) o horizonte legÃ­vel Ã© DECLARADO, com os dois nÃºmeros ââââââââââââââââââââââââââââââââ
  //
  // Sem encolher o vÃ£o: o denominador Ã© a grade que a rota devolveu, nÃ£o um sub-intervalo
  // recortado em volta do dado. `[MEDIDO 2026-09-11]` os pontos do backfill entram tarde na janela
  // (`available_at = quando buscamos`, que `R-1` recusa no prÃ³prio instante de grade â
  // `ACHADO-BACKFILL-INVISIVEL-AO-AS-OF.md`), e a tela tem de NOMEAR esse limite: uma borda
  // esquerda estruturalmente vazia se lÃª como "o mercado nÃ£o teve dado".
  const horizon = subAxis.locator('[data-fact^="volume_readable_horizon:"]');
  await expect(horizon).toHaveCount(1);
  const horizonFact = await horizon.getAttribute("data-fact");
  fact(SPEC, "volume_readable_horizon_fact", horizonFact);
  expect(horizonFact).toBe(`volume_readable_horizon:${apiPresent.length}/${rows.length}`);
  const sinceMs = await horizon.getAttribute("data-readable-since-ms");
  fact(SPEC, "volume_readable_since_ms", sinceMs);
  expect(sinceMs).toBe(apiPresent.length === 0 ? "" : String(apiPresent[0]!.event_time));

  const readout = subAxis.locator('[data-fact^="volume_last_reading:"]');
  const readoutText = (await readout.textContent())?.trim() ?? "";
  fact(SPEC, "volume_last_reading_text", readoutText);

  // ââ (d) o veredito por universo âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  if (!readerPresent) {
    // A API acabou de declarar, sobre si mesma, que compÃ´s o engine sqlite â que `ADR-034/D9` nÃ£o
    // dÃ¡ reader de `md.series`. A asserÃ§Ã£o que SIGNIFICA algo aqui Ã© a oposta: a rota tem de
    // RECUSAR alto, nunca responder `200` com uma grade inventada, e a tela tem de dizer a
    // ausÃªncia com o token, nunca com um nÃºmero.
    expect(status, "sem window reader a rota tem de RECUSAR, nunca responder 200 com grade inventada").toBe(500);
    expect(countPresentRows(rows)).toBe(0);
    expect(readoutText).toContain(ABSENCE_TOKEN);
    // â `RN-1` literal: nenhum dÃ­gito onde nÃ£o hÃ¡ observaÃ§Ã£o. Um `0` aqui seria a afirmaÃ§Ã£o "nÃ£o
    // se negociou nada neste minuto", feita a partir de ignorÃ¢ncia.
    expect(readoutText).not.toMatch(/\d/);
    return;
  }

  // ââ UNIVERSO FORTE: o item 3 do `DoD-VERTICAL`, que Ã© o que faltava na fase 01 ââââââââââââââ
  expect(status).toBe(200);
  // Uma linha por instante da grade, presente ou ausente â `rows.length` sozinho NÃO Ã© evidÃªncia
  // de dado; Ã© evidÃªncia de que a grade pedida Ã© a grade devolvida.
  expect(rows.length).toBe(windowGridSlots);
  // AusÃªncia DECLARADA, nunca implÃ­cita: toda linha sem valor nomeia o motivo.
  expect(rows.filter((row) => row.value === null && row.absence === null)).toHaveLength(0);

  // â O PISO DO `DoD-3`, LIDO DO DOM â a asserÃ§Ã£o que NÃO EXISTIA em lugar nenhum do repositÃ³rio
  // e por cuja falta `volume_dom_present_points=0` convivia com `rc=0` no mesmo log.
  expect(
    domPresentPoints,
    `DoD-3 pede N >= ${MINIMUM_DISTINCT_POINTS} pontos distintos no sub-eixo de Volume; a tela ` +
      `declara ${domPresentPoints} em ${windowGridSlots} grades de 1 min`,
  ).toBeGreaterThanOrEqual(MINIMUM_DISTINCT_POINTS);

  // ...e "o painel NÃO exibe `SEM_PONTO`" (item 3 do DoD) Ã© asserido sobre o HORIZONTE, nÃ£o sobre
  // a leitura do Ãºltimo minuto â e a escolha Ã© medida, nÃ£o conveniente: a cauda de publicaÃ§Ã£o
  // deste endpoint passa de um passo de grade (mÃ¡x medido 267 s, n=804,
  // `ACHADO-FLOW-COM-ATRASO-MAIOR-QUE-A-GRADE.md`), entÃ£o exigir nÃºmero no Ãºltimo instante
  // reprovaria a implementaÃ§Ã£o CORRETA. Com `N >= 30`, o horizonte legÃ­vel tem comeÃ§o e a tela
  // nÃ£o estÃ¡ no estado todo-ausente.
  expect(sinceMs, "com pontos na janela o horizonte legÃ­vel tem de ter um comeÃ§o").not.toBe("");
  expect(Number((horizonFact ?? "").split(":")[1]?.split("/")[0]), "e a manchete do horizonte Ã© o mesmo N").toBe(
    domPresentPoints,
  );

  // A leitura atual, amarrada Ã  API nos DOIS sentidos sobre o Ãºltimo instante da janela.
  fact(SPEC, "volume_api_last_instant_value", apiLast?.value ?? null);
  if (apiLast?.value == null) {
    // AusÃªncia REAL no Ãºltimo instante â NORMAL pela cauda de publicaÃ§Ã£o acima, nÃ£o falha. O que
    // `RN-1` proÃ­be Ã© o que ela NÃO pode dizer.
    expect(readoutText).toContain(ABSENCE_TOKEN);
    expect(readoutText).not.toMatch(/\d/);
  } else {
    // A API sabe o valor deste instante â a tela mostra ESSE nÃºmero e NÃO diz SEM_PONTO.
    expect(readoutText).not.toContain(ABSENCE_TOKEN);
    expect(readoutText).toContain(String(Number(apiLast.value)));
  }
});
