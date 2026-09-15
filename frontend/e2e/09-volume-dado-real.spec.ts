import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { computeSeriesKeyId } from "../src/app/symbol/series-key-id.ts";
import type { SeriesKey } from "../src/features/s3-inspector/series-catalog.ts";
import { fact, sentimentoApiBaseUrl } from "./helpers.ts";

/**
 * `T-01.9` (`SPEC-007` plano `01` item `1.11`, `DoD-3`, `RN-S2`, item 3 do `DoD-VERTICAL`) — o
 * SUB-EIXO DE VOLUME com dado real na tela, contado contra a API que a própria página leu, e
 * com PISO: `N >= 30` pontos distintos, nunca `N > 0`.
 *
 * ── O BURACO QUE ESTE ARQUIVO FECHA, COM O NÚMERO QUE O MEDIU ────────────────────────────────
 *
 * O portão desta fase era VERDE com ZERO ponto de volume na tela — as duas linhas saíam LADO A
 * LADO no mesmo log `[MEDIDO 2026-09-15, gates/QA-FASE-01-fechamento.md §4.1]`:
 *
 *     E2E-FACT 08-symbol-dado-real volume_dom_present_points=0
 *     [OK       ] e2e             rc=0  30 passed (34.6s)
 *
 * `08-symbol-dado-real.spec.ts` compara DOM CONTRA API — e `0 === 0` passa. Ele diz isso de si
 * mesmo na própria linha 60 (*"NOT the `DoD-3` of `T-01.9`"*). As fases `02` e `03` escreveram o
 * piso (`MINIMUM_DISTINCT_POINTS` em `10-cvd`, `MINIMUM_NATIVE_BARS` em `12-oi`); a `01`, que
 * INVENTOU a exigência, não tinha nenhum ⇒ o verde dela não significava nada. O dado já estava na
 * tela: `volume_api_rows_with_value = volume_dom_present_points = 3.374` numa rodada SOMENTE
 * LEITURA contra a stack viva `[MEDIDO 2026-09-15, gates/QA-FASE-01-fechamento.md §4.3]`. O que
 * faltava era a AMARRA, não o pipeline: nada no repositório reprovava se a métrica parasse de
 * chegar.
 *
 * ── ⛔ POR QUE O MOLDE NÃO É O `08`, QUE É O QUE `tasks.toml:228` MANDA COPIAR ────────────────
 *
 * Porque o `08` pergunta a coisa errada para uma série que não é `1m` nativa, e isso já custou um
 * falso negativo medido (`gates/QA-FASE-01-fechamento.md` §5): ele crava `interval: "1m"` +
 * `bar_policy: "final_only"` (`08:169`) para TODA série, mas `klines_last` é `interval=5m`,
 * `nativeGrid=5min`, `maxStaleness=600000` — a grade de 1 min devolve `5.760` linhas com `0`
 * valor, enquanto a manchete do painel vem do endpoint LIVE (`page.tsx:407 buildLiveUrl`) e
 * declara a própria idade na tela. O assert comparava grade histórica vazia contra leitura viva.
 *
 * O molde adotado é `10-cvd-dado-real.spec.ts` (piso nomeado + desdobramento FRACO/FORTE +
 * controle negativo), e a lição do `08` vira ASSERÇÃO aqui, não comentário: a pergunta `1m` só é
 * legítima porque o CATÁLOGO declara esta série `1m`/`1min` nativa, e o primeiro teste deste
 * arquivo exige exatamente isso. Se o backend reintervalar `klines_volume`, este arquivo REPROVA
 * em vez de contar degraus de escada como se fossem barras (`RN-S1`).
 *
 * ── O PISO, E POR QUE ELE NÃO PODE SER SATISFEITO POR AUSÊNCIA ───────────────────────────────
 *
 * `countPresentRows` conta LINHA COM VALOR, nunca linha da grade: a rota devolve uma linha por
 * instante da janela, presente ou ausente (`build_series_history_report` caminha a grade inteira),
 * então `rows.length >= 30` é verdade num universo sem NENHUM dado. O teste `MORDE do
 * instrumento` executa essa distinção contra um fixture sintético, roda NOS DOIS UNIVERSOS —
 * inclusive no portão, onde nada sobre dado real pode morder — e é o par morde/cala do piso.
 *
 * ── OS DOIS UNIVERSOS, DECLARADOS EM TODA RODADA ─────────────────────────────────────────────
 *
 *   FRACO  (sqlite, o que `make e2e`/`make verify` compõem): `/series-history` RECUSA (`500`).
 *          Prova-se `RN-1`: diante de um backend que não responde, a tela diz `SEM_PONTO` e NUNCA
 *          um `0` fabricado, e o contrato de DOM está publicado.
 *   FORTE  (Postgres com reader): `N >= 30` pontos no DOM, IGUAIS aos da API sobre a MESMA janela
 *          declarada pelo servidor. É o item 3 do `DoD-VERTICAL`.
 *
 * ⛔ O universo FRACO nunca é relatado como se fosse o FORTE: toda rodada imprime
 * `series_window_reader_present` e `volume_dom_present_points`.
 * ⛔ NADA AQUI SEMEIA O POSTGRES COMPARTILHADO (`[P-seed]`, `D2`): não há `INSERT`, `psql` nem
 * `docker` neste arquivo fora deste parágrafo. O backfill de `T-01.3` já entrega ponto legítimo —
 * leitura da origem NÃO é dado de teste (`SPEC-007 §3.7`).
 */

const SPEC = "09-volume-dado-real";
const SYMBOL_PATH = "/symbol";
const SYMBOL = "BTCUSDT";
const ONE_MINUTE_MS = 60_000;

const apiBaseUrl = sentimentoApiBaseUrl;

/** As âncoras estáveis do sub-eixo em `SymbolClient.tsx` (`VOLUME_SUBAXIS_TESTID`, fixado por
 * `T-01.7` justamente para esta task). Escritas à mão, não importadas: importar `SymbolClient.tsx`
 * traria `lightweight-charts`, e `view-model.ts` traria `charts/index.ts` -> `jsdom`, que morre sob
 * o carregador de módulos do Playwright e leva a COLEÇÃO inteira para `Total: 0 tests` — o sinal
 * que custou 21 testes nesta feature. `volume-subaxis-dom-contract.test.ts` guarda as mesmas
 * strings do outro lado: duas testemunhas independentes de um contrato só.
 *
 * ⛔ E o seletor é o `data-testid`, NUNCA o `aria-label`/texto: é o que desacopla este assert do
 * veredito de design de `T-01.8` — um `NEEDS_FIX` de cor, altura ou escala não pode quebrar uma
 * asserção sobre DADO. */
const VOLUME_SUBAXIS_TESTID = "price-pane-volume-subaxis";
const ABSENCE_TOKEN = "SEM_PONTO";

/**
 * `DoD-3`/`RN-S2`: o piso é `N >= 30` pontos DISTINTOS, e o `30` não é gosto.
 *
 * `N > 0` não distingue *"o cano funcionou"* de *"caiu um ponto por acaso"*, e `D2` (owner) existe
 * para acabar com sinal indistinguível. Não há divisor de `RN-S1` aqui: `klines_volume` é `1m`
 * NATIVA (`SPEC-007 §4.1`, e o primeiro teste deste arquivo o EXIGE do catálogo), então cada grade
 * com valor é uma barra nativa distinta e `presentPoints === nativeBars`. Aplicar o `/5` do
 * `RN-S1` subcontaria por 5x.
 *
 * FOLGA MEDIDA, para que o piso seja exigente e não profético: a rodada somente-leitura contra a
 * stack viva deu `volume_api_rows_with_value = volume_dom_present_points = 3.374` — 112x o piso
 * `[MEDIDO 2026-09-15, gates/QA-FASE-01-fechamento.md §4.3]`. ⇒ este número NÃO é o que a
 * implementação de hoje entrega (seria um piso que nunca morde); é o mínimo abaixo do qual a
 * métrica deixou de chegar à tela.
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

/** A linha de volume do catálogo: `klines_volume` é UMA linha por instrumento hoje, e a rota lê
 * exatamente assim (`page.tsx::VOLUME_METRIC` + `resolveCatalogEntry`, que RESOLVE PARA NADA se
 * casar mais de uma). Transcrito, não importado, pelo mesmo motivo do bloco de seletores. */
function isKlinesVolume(key: SeriesKey): boolean {
  return key.metric === "klines_volume";
}

/**
 * ⛔ O INSTRUMENTO DO PISO, E ELE CONTA VALOR — NÃO LINHA DE GRADE.
 *
 * `/series-history` devolve UMA LINHA POR INSTANTE da janela, presente ou ausente
 * (`use_cases/series_history.py`, que caminha a grade inteira), então `rows.length` é ~5.761 num
 * universo sem NENHUM dado ingerido. Um piso lido sobre `rows.length` estaria satisfeito por
 * ausência — que é a forma exata do verde vazio que este arquivo existe para matar. O teste
 * `MORDE do instrumento` executa essa diferença contra um fixture sintético.
 */
function countPresentRows(rows: readonly HistoryRow[]): number {
  return rows.filter((row) => row.value !== null).length;
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

/** `fetch` com UMA retentativa, e só em erro de transporte — mesma razão medida que `08`/`10`/`12`
 * documentam (`undici` reaproveita a conexão que um worker que acabou de responder `500` já
 * fechou). Nenhuma asserção é afrouxada: qualquer resposta HTTP, de qualquer status, volta
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
 * A MESMA pergunta que a página faz (`page.tsx::fetchPanelRows`: grade de 1 min, `final_only`).
 *
 * ⚠️ O `interval: "1m"` daqui NÃO é o do `08`, e a diferença é de FUNDAMENTO, não de valor: lá ele
 * é cravado para qualquer série (e mente sobre `klines_last`, que é `5m`); aqui ele é a grade que
 * o catálogo DECLARA nativa para esta série, e o primeiro teste deste arquivo reprova se essa
 * declaração mudar. A rota só serve a grade de 1 min de qualquer forma (`interval=5m` → `422`
 * `[MEDIDO 2026-09-15, §5 do laudo]`), então o que protege o número não é o parâmetro — é a
 * asserção sobre o que a série É.
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
 * indistinguível de bypass", `CLAUDE.md`), e qualquer um silenciaria o ramo FORTE sem mudar o que
 * o deployment É. `/ready` publica `store.path`, e `ADR-034/D9` não dá fallback sqlite para
 * `md.series`. */
async function seriesWindowReaderPresent(): Promise<boolean> {
  const response = await fetchWithOneRetry(`${apiBaseUrl()}/ready`);
  const body = (await response.json()) as { store?: { path?: string } };
  const storePath = body.store?.path;
  if (typeof storePath !== "string") {
    throw new Error("GET /ready did not publish store.path — cannot tell which engine this API composed");
  }
  return !storePath.endsWith(".sqlite3");
}

async function loadRenderedRequest(page: Page): Promise<RenderedRequest> {
  const response = await page.goto(SYMBOL_PATH, { waitUntil: "networkidle" });
  fact(SPEC, "http_status", response?.status() ?? null);
  expect(response?.status()).toBe(200);

  const main = page.locator("main[data-window-start-ms]");
  await expect(main, "a página não declara o próprio request (data-window-start-ms)").toHaveCount(1);
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
 * Lê uma contagem do DOM EXIGINDO que ela exista e seja dígitos, ANTES de converter.
 *
 * ⛔ A ordem é o ativo: `Number(null)` e `Number("")` são ambos `0`, e `0` é exatamente o que a API
 * serve no universo fraco ⇒ sem estas duas asserções o `expect(dom).toBe(api)` compara `0 === 0` e
 * fica verde com o contrato APAGADO do DOM. Foi o `BLOCKER-3` da wave `03`, `rc=0, 24 passed`.
 */
function requireDigits(raw: string | null, attribute: string): number {
  expect(
    raw,
    `a página parou de publicar \`${attribute}\` — sem o atributo não há o que comparar com a API, e ` +
      "`Number(null) === 0` faria a asserção passar sobre um DOM sem contrato",
  ).not.toBeNull();
  expect(raw ?? "", `\`${attribute}\` tem de ser uma contagem em dígitos; vazio vira 0 em \`Number()\``).toMatch(
    /^\d+$/,
  );
  return Number(raw);
}

test(`o catálogo casa UMA linha de volume, e ela é 1m NATIVA — a premissa do piso (${SPEC})`, async () => {
  // ⛔ ESTE TESTE É A CORREÇÃO DO MOLDE DO `08`, e não decoração de catálogo. O piso deste arquivo
  // conta GRADE COM VALOR e chama isso de "ponto distinto". Essa igualdade só vale porque a série
  // é `1m` nativa; se `klines_volume` virar `5m` servida na grade de 1 min, a MESMA contagem passa
  // a somar degraus de escada e `30` degraus viram `6` barras reais (`RN-S1`) — exatamente o
  // subconto que `12-oi-dado-real.spec.ts` existe para evitar do outro lado. Aqui a premissa é
  // ASSERIDA contra o catálogo que a API sob teste realmente serve, em vez de ficar em comentário.
  const entries = await fetchCatalogEntries();
  const forSymbol = entries.filter((entry) => entry.key.instrumentId === SYMBOL);
  const matched = forSymbol.filter((entry) => isKlinesVolume(entry.key));
  fact(SPEC, "catalog_entries_total", entries.length);
  fact(SPEC, "catalog_volume_rows_for_symbol", matched.length);

  // UMA linha, e a exigência é a da PRÓPRIA ROTA: `resolveCatalogEntry` devolve `ambiguous` — que
  // degrada o sub-eixo para vazio — assim que o mesmo seletor casar duas. Um catálogo que ganhe
  // uma segunda linha `klines_volume` apaga o painel sem dizer por quê; aqui isso reprova.
  expect(
    matched.length,
    `o seletor de volume casou ${matched.length} linhas — a rota resolve AMBIGUOUS e o sub-eixo ` +
      "degrada para vazio, com o portão verde",
  ).toBe(1);

  const volume = matched[0]!;
  fact(SPEC, "catalog_volume_interval", volume.key.interval);
  fact(SPEC, "catalog_volume_native_grid", volume.nativeGrid);
  fact(SPEC, "catalog_volume_max_staleness_ms", volume.maxStalenessMs);
  // A premissa do piso, em duas asserções: grade nativa de 1 min ⇒ 1 slot com valor = 1 barra.
  expect(volume.key.interval, "o piso conta slot-com-valor como barra nativa; isso exige interval 1m").toBe("1m");
  expect(volume.nativeGrid, "e a grade nativa declarada tem de ser a mesma coisa dita do outro campo").toBe("1min");
  // `RNF-2`: o teto de frescor é 2x o bucket nativo — o mesmo invariante que `12-oi` cobra para a
  // série de 5 min, aplicado à de 1 min. Um teto que deixe de casar com o intervalo é a primeira
  // evidência de reintervalamento silencioso.
  expect(volume.maxStalenessMs).toBe(2 * ONE_MINUTE_MS);
  // `FLOW`/`SUM` é o contrato em que `SEM_PONTO` se apoia: para uma soma de quantidade negociada,
  // imprimir `0` onde não houve observação é erro de TIPO (`RN-1`), não de gosto.
  expect(volume.key.nature).toBe("FLOW");
  expect(volume.key.reduction).toBe("SUM");
  // E a linha é leitura DIRETA da origem, não reconstrução de terceiro (`ADR-036/D2`).
  expect(volume.reconstructedFrom, "a linha escolhida não pode ser uma reconstrução").toBeNull();
});

test(`MORDE do instrumento: o piso REJEITA grade vazia e CALA sobre dado legítimo (${SPEC})`, async () => {
  // ⛔ O FALSIFICADOR DO PRÓPRIO MEDIDOR, e ele roda NOS DOIS UNIVERSOS — inclusive no portão,
  // onde a API não tem reader e nenhuma asserção sobre dado real pode morder. Sem ele, "o e2e
  // passa" no `make verify` continuaria compatível com um contador que não sabe contar, que é
  // literalmente o estado que esta task encontrou.
  //
  // Um fixture sintético, aqui e só aqui — nada disto toca banco nenhum (`[P-seed]`).
  const grid = (count: number, presentUpTo: number): HistoryRow[] =>
    Array.from({ length: count }, (_unused, index) => ({
      event_time: index * ONE_MINUTE_MS,
      value: index < presentUpTo ? String(12.5 + index) : null,
      absence: index < presentUpTo ? null : "NO_OBSERVATION",
    }));

  // ── MORDE (1): a grade INTEIRA da janela, sem UM valor. `rows.length` diria 5.761 e o piso
  // estaria "satisfeito" por ausência pura — o verde vazio que este arquivo mata.
  const emptyWindow = grid(5_761, 0);
  fact(SPEC, "morde_empty_window_rows", emptyWindow.length);
  fact(SPEC, "morde_empty_window_present", countPresentRows(emptyWindow));
  expect(emptyWindow.length, "a grade tem 5.761 linhas...").toBeGreaterThanOrEqual(MINIMUM_DISTINCT_POINTS);
  expect(countPresentRows(emptyWindow), "...e ZERO pontos — o piso tem de ler o segundo número").toBe(0);
  expect(countPresentRows(emptyWindow)).toBeLessThan(MINIMUM_DISTINCT_POINTS);

  // ── MORDE (2): a BORDA. 29 pontos reais numa grade cheia não passam por 30 — o piso não é
  // `> 0` disfarçado, e é aqui que se vê que o `>=` está do lado certo.
  const justBelow = grid(5_761, MINIMUM_DISTINCT_POINTS - 1);
  fact(SPEC, "morde_just_below_present", countPresentRows(justBelow));
  expect(countPresentRows(justBelow)).toBe(29);
  expect(countPresentRows(justBelow)).toBeLessThan(MINIMUM_DISTINCT_POINTS);

  // ── CALA: exatamente o piso, e a folga real da produção. Um instrumento que reprovasse aqui
  // seria um piso que nunca cala — tão inútil quanto um que nunca morde.
  const atFloor = grid(5_761, MINIMUM_DISTINCT_POINTS);
  const measuredLive = grid(5_761, 3_374);
  fact(SPEC, "cala_at_floor_present", countPresentRows(atFloor));
  fact(SPEC, "cala_measured_live_present", countPresentRows(measuredLive));
  expect(countPresentRows(atFloor)).toBeGreaterThanOrEqual(MINIMUM_DISTINCT_POINTS);
  expect(countPresentRows(measuredLive)).toBeGreaterThanOrEqual(MINIMUM_DISTINCT_POINTS);

  // E se o dado sumir, a contagem some junto: nada aqui sobra como constante.
  expect(countPresentRows(measuredLive.map((row) => ({ ...row, value: null, absence: ABSENCE_TOKEN })))).toBe(0);
});

test(`o sub-eixo de Volume mostra o número da API, e N >= ${MINIMUM_DISTINCT_POINTS} no universo FORTE (${SPEC})`, async ({
  page,
}) => {
  const request = await loadRenderedRequest(page);
  // A grade da janela, derivada dos instantes que o SERVIDOR declarou no `<main>` — nunca do
  // relógio deste processo, que correria contra o do render.
  const windowGridSlots = (request.windowEndMsInclusive - request.windowStartMs) / ONE_MINUTE_MS + 1;

  const entries = await fetchCatalogEntries();
  const volumeEntry = entries.find((entry) => entry.key.instrumentId === SYMBOL && isKlinesVolume(entry.key));
  expect(volumeEntry, `nenhuma linha klines_volume no catálogo para ${SYMBOL}`).toBeDefined();

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

  // ── (a) o contrato de DOM existe, e é lido ANTES de qualquer comparação ─────────────────────
  const subAxis = page.locator(`[data-testid="${VOLUME_SUBAXIS_TESTID}"]`);
  await expect(
    subAxis,
    `o sub-eixo de volume não existe no DOM sob [data-testid="${VOLUME_SUBAXIS_TESTID}"]`,
  ).toHaveCount(1);
  const domPresentPoints = requireDigits(
    await subAxis.getAttribute("data-volume-present-points"),
    "data-volume-present-points",
  );
  fact(SPEC, "volume_dom_present_points", domPresentPoints);

  // ── (b) A INVARIANTE `DOM == API`, exata e TOTAL sobre os dois universos ────────────────────
  //
  // Exata, não aproximada: os dois lados saíram da MESMA janela declarada pelo servidor, então
  // divergir é defeito de WIRING, não corrida. É a asserção que a fase `04` de
  // `pagina-de-grafico-s2` teve de descobrir EM USO AO VIVO porque nenhum teste comparava as duas
  // superfícies (`D2`, owner, recusou o DoD só-de-API COM NÚMERO).
  expect(
    domPresentPoints,
    `a tela declara ${domPresentPoints} pontos e a API serve ${countPresentRows(rows)} sobre a MESMA janela`,
  ).toBe(countPresentRows(rows));

  // ── (c) o horizonte legível é DECLARADO, com os dois números ────────────────────────────────
  //
  // Sem encolher o vão: o denominador é a grade que a rota devolveu, não um sub-intervalo
  // recortado em volta do dado. `[MEDIDO 2026-09-11]` os pontos do backfill entram tarde na janela
  // (`available_at = quando buscamos`, que `R-1` recusa no próprio instante de grade —
  // `ACHADO-BACKFILL-INVISIVEL-AO-AS-OF.md`), e a tela tem de NOMEAR esse limite: uma borda
  // esquerda estruturalmente vazia se lê como "o mercado não teve dado".
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

  // ── (d) o veredito por universo ─────────────────────────────────────────────────────────────
  if (!readerPresent) {
    // A API acabou de declarar, sobre si mesma, que compôs o engine sqlite — que `ADR-034/D9` não
    // dá reader de `md.series`. A asserção que SIGNIFICA algo aqui é a oposta: a rota tem de
    // RECUSAR alto, nunca responder `200` com uma grade inventada, e a tela tem de dizer a
    // ausência com o token, nunca com um número.
    expect(status, "sem window reader a rota tem de RECUSAR, nunca responder 200 com grade inventada").toBe(500);
    expect(countPresentRows(rows)).toBe(0);
    expect(readoutText).toContain(ABSENCE_TOKEN);
    // ⛔ `RN-1` literal: nenhum dígito onde não há observação. Um `0` aqui seria a afirmação "não
    // se negociou nada neste minuto", feita a partir de ignorância.
    expect(readoutText).not.toMatch(/\d/);
    return;
  }

  // ── UNIVERSO FORTE: o item 3 do `DoD-VERTICAL`, que é o que faltava na fase 01 ──────────────
  expect(status).toBe(200);
  // Uma linha por instante da grade, presente ou ausente — `rows.length` sozinho NÃO é evidência
  // de dado; é evidência de que a grade pedida é a grade devolvida.
  expect(rows.length).toBe(windowGridSlots);
  // Ausência DECLARADA, nunca implícita: toda linha sem valor nomeia o motivo.
  expect(rows.filter((row) => row.value === null && row.absence === null)).toHaveLength(0);

  // ⛔ O PISO DO `DoD-3`, LIDO DO DOM — a asserção que NÃO EXISTIA em lugar nenhum do repositório
  // e por cuja falta `volume_dom_present_points=0` convivia com `rc=0` no mesmo log.
  expect(
    domPresentPoints,
    `DoD-3 pede N >= ${MINIMUM_DISTINCT_POINTS} pontos distintos no sub-eixo de Volume; a tela ` +
      `declara ${domPresentPoints} em ${windowGridSlots} grades de 1 min`,
  ).toBeGreaterThanOrEqual(MINIMUM_DISTINCT_POINTS);

  // ...e "o painel NÃO exibe `SEM_PONTO`" (item 3 do DoD) é asserido sobre o HORIZONTE, não sobre
  // a leitura do último minuto — e a escolha é medida, não conveniente: a cauda de publicação
  // deste endpoint passa de um passo de grade (máx medido 267 s, n=804,
  // `ACHADO-FLOW-COM-ATRASO-MAIOR-QUE-A-GRADE.md`), então exigir número no último instante
  // reprovaria a implementação CORRETA. Com `N >= 30`, o horizonte legível tem começo e a tela
  // não está no estado todo-ausente.
  expect(sinceMs, "com pontos na janela o horizonte legível tem de ter um começo").not.toBe("");
  expect(Number((horizonFact ?? "").split(":")[1]?.split("/")[0]), "e a manchete do horizonte é o mesmo N").toBe(
    domPresentPoints,
  );

  // A leitura atual, amarrada à API nos DOIS sentidos sobre o último instante da janela.
  fact(SPEC, "volume_api_last_instant_value", apiLast?.value ?? null);
  if (apiLast?.value == null) {
    // Ausência REAL no último instante — NORMAL pela cauda de publicação acima, não falha. O que
    // `RN-1` proíbe é o que ela NÃO pode dizer.
    expect(readoutText).toContain(ABSENCE_TOKEN);
    expect(readoutText).not.toMatch(/\d/);
  } else {
    // A API sabe o valor deste instante ⇒ a tela mostra ESSE número e NÃO diz SEM_PONTO.
    expect(readoutText).not.toContain(ABSENCE_TOKEN);
    expect(readoutText).toContain(String(Number(apiLast.value)));
  }
});
