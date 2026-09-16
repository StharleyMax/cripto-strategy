import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { computeSeriesKeyId } from "../src/app/symbol/series-key-id.ts";
import type { SeriesKey } from "../src/features/s3-inspector/series-catalog.ts";
import { fact, sentimentoApiBaseUrl } from "./helpers.ts";

/**
 * `T-05.11` (`SPEC-007` plano `05` item `5.9`, `DoD-3`, `RN-S2`) — o `LiquidationPane` com dado
 * real na tela, AS DUAS COORTES, contado contra a API que a própria página leu.
 *
 * ── O QUE TORNA ESTE e2e DIFERENTE DOS QUATRO ANTERIORES, E ESTÁ NO TÍTULO DA TASK ───────────
 *
 * Liquidação é EVENTO ESPARSO. `ACHADO-FORCEORDER.md`, literal: *"a fatia de liquidação não pode
 * ter como DoD 'apareceu ponto na tela em 1h': evento esparso não distingue conserto de
 * ausência"*. Um spec que rode numa janela sem liquidação passa VERDE sobre um cano morto — foi
 * exatamente assim que o coletor de `!forceOrder@arr` ficou `46h` em silêncio com `n_returned=0`
 * e o único sinal foi um `REJECTED` sem motivo.
 *
 * Este arquivo paga isso de TRÊS formas, e nenhuma delas é "rodar e torcer":
 *
 *   1. `MINIMUM_DISTINCT_POINTS` (`RN-S2`) — `N >= 30` grades DISTINTAS com observação, POR
 *      COORTE. Uma janela sem liquidação nenhuma não chega a `30` e o spec REPROVA em vez de
 *      passar em silêncio: o piso é o que transforma "não houve evento" em falha visível.
 *   2. `MINIMUM_NON_ZERO_OBSERVATIONS` — pelo menos uma observação com valor MAIOR QUE ZERO. Um
 *      fornecedor vivo publicando `0` o tempo todo satisfaz o item 1 e ainda assim não prova que
 *      HOUVE liquidação; só o valor positivo prova. Os dois pisos juntos são a janela que a task
 *      pede, expressa como asserção em vez de como escolha de horário.
 *   3. A partição das grades é asserida como TRÊS populações NÃO VAZIAS (ausente · zero · não
 *      zero). Se qualquer uma sumir, a distinção que o painel inteiro existe para fazer deixa de
 *      ser observável e o spec deixa de significar o que diz — então ele reprova.
 *
 * ⛔ NÃO É ESTE ARQUIVO QUEM PROVA QUE O CANO ESTÁ VIVO. `ACHADO-FORCEORDER.md` é explícito: quem
 * prova liveness é o detector de contiguidade/heartbeat (`T-05.7`), NUNCA a taxa. Aqui a taxa é
 * usada para a única coisa que ela mede honestamente — "nesta janela, estes pontos estão na
 * tela" — e o veredito de liveness é de outra task.
 *
 * ── CONTROLE PREVISTO PELO SQL ANTES DA RODADA (o método dos laudos anteriores) ───────────────
 *
 * `[MEDIDO 2026-09-16, janela `1789215600000` → `1789561140000`, `knowledge_time` `1789561440000`,
 * Postgres de produção SOMENTE LEITURA, nenhum `INSERT`]`:
 *
 *     docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -Atc "
 *       with b as (select series_key_id, bucket_end, min(available_at) mav, min(value_raw::numeric) v
 *         from md.series where series_key_id in ('23e4332…f539d5','bc0b8a…44c551')
 *         and bucket_end between 1789215600000 and 1789561140000 and is_final group by 1,2)
 *       select series_key_id, count(*) buckets,
 *              count(*) filter (where mav <= bucket_end+59999) visivel,
 *              count(*) filter (where mav <= bucket_end+59999 and v=0) zeros,
 *              count(*) filter (where mav <= bucket_end+59999 and v>0) naozero from b group by 1"
 *
 *   | coorte  | buckets no store | VISÍVEIS ao `as_of` | zeros | não zero |
 *   |---------|------------------|---------------------|-------|----------|
 *   | `long`  | `1.051`          | `195`               | `66`  | `129`    |
 *   | `short` | `1.047`          | `195`               | `121` | `74`     |
 *
 * ⚠️ O `mav <= bucket_end + 59999` NÃO é enfeite e é o que faz o controle PREVER o número da API
 * em vez de um número maior e errado: `series_history.py` pergunta `as_of` no instante
 * `grid + 59.999 ms` (`_read_instant`, `final_only`) e `as_of` exige `available_at <= t` (R-1).
 * O coletor da Coinalyze reamostra a cada 5 min, então a MAIORIA dos buckets que existem no store
 * só fica disponível DEPOIS do minuto em que fecha — `1.051` no store contra `195` legíveis. Sem
 * esse termo o controle diria `1.051` e acusaria a implementação CORRETA de perder `81%` do dado.
 * Com ele, o controle bateu com a API na casa da unidade (`195`/`66` previstos, `195`/`66`
 * servidos) ANTES da rodada.
 *
 * ⛔ NADA AQUI SEMEIA O POSTGRES COMPARTILHADO (`[P-seed]`): não há `INSERT`, `psql` nem `docker`
 * neste arquivo fora deste cabeçalho. O controle acima é `SELECT`, rodado à mão, e está citado
 * como EVIDÊNCIA — a asserção do spec é contra a API, nunca contra o banco.
 *
 * ── OS DOIS UNIVERSOS, DECLARADOS EM TODA RODADA ─────────────────────────────────────────────
 *
 * Mesma partição de `08`/`10`/`12`, publicada como `series_window_reader_present`:
 *
 *   FRACO  (sqlite, o que `make e2e` compõe): `/series-history` RECUSA (`500`). O que se prova é
 *          `RN-1`: a tela diz `SEM_PONTO`, NUNCA um `0` fabricado, e o contrato de DOM está
 *          publicado mesmo assim.
 *   FORTE  (Postgres com reader): os três pisos acima, POR COORTE. É o item que `DoD-3` pede.
 */

const SPEC = "13-liquidacoes-dado-real";
const SYMBOL_PATH = "/symbol";
const SYMBOL = "BTCUSDT";

const apiBaseUrl = sentimentoApiBaseUrl;

/** As âncoras estáveis de `SymbolClient.tsx` para este painel. Escritas por extenso, não
 * importadas, pelo motivo que `10-cvd-dado-real.spec.ts` já mediu: importar `SymbolClient.tsx`
 * (ou `view-model.ts`, ou `chart-options.ts`) puxa `charts/index.ts` → `jsdom`, que morre sob o
 * carregador de módulos do Playwright e leva a COLEÇÃO inteira a `Total: 0 tests`.
 * `liquidation-pane-dom-contract.test.ts` guarda as mesmas strings do outro lado — duas
 * testemunhas independentes de um contrato, de modo que um rename tenha de quebrar uma delas. */
const LIQUIDATION_PANE_TESTID = "liquidation-pane";
const ABSENCE_TOKEN = "SEM_PONTO";

/** `liquidation_catalog.py::COHORTS`, transcrito — e FECHADO aqui pelo mesmo motivo que lá: uma
 * terceira coorte seria uma terceira série com requisito próprio, não um valor que alguém passa.
 * ⛔ AS DUAS, SEMPRE: `DoD-2`/`DoD-3` pedem as duas SEPARADAMENTE porque somá-las apaga a
 * discriminação que a métrica existe para dar (long liquidation é venda forçada, short
 * liquidation é compra forçada). */
const LIQUIDATION_COHORTS = ["long", "short"] as const;
type LiquidationCohort = (typeof LIQUIDATION_COHORTS)[number];

function cohortTestId(cohort: LiquidationCohort): string {
  return `liquidation-cohort-${cohort}`;
}

/** `RN-S2`, literal: *"o limiar é `N >= 30` pontos distintos, não `N > 0`. `N > 0` não distingue
 * cano funcionando de ponto por acaso."* Sem divisor de `RN-S1`: `sum_liquidation` é `1m` NATIVA
 * (`liquidation_catalog.py`), então cada grade com valor é uma barra nativa distinta.
 *
 * O número que o justifica, e ele é o desta série e não uma folga inventada: o controle SQL acima
 * previu `195` grades legíveis por coorte na janela de 4 dias — `6,5x` o piso. Um piso de `30`
 * portanto NÃO reprova a implementação correta em janela típica, e reprova qualquer janela em que
 * o fornecedor tenha entregue menos de um sexto do que entrega hoje. */
const MINIMUM_DISTINCT_POINTS = 30;

/** O segundo piso, e é ele que responde ao título da task — *"numa janela em que HOUVE
 * liquidação"*.
 *
 * `ZL-3` (`domain/liquidation_zero_legitimacy.py`) torna o `0` do fornecedor uma OBSERVAÇÃO real,
 * e ela conta para `MINIMUM_DISTINCT_POINTS`. Logo o piso de `30` sozinho é satisfeito por um
 * fornecedor que responda `0` em todas as grades — cano vivo, mercado sem liquidação —, e essa é
 * uma janela legítima sobre a qual este spec NÃO pode ficar em silêncio, porque ela não prova
 * nada sobre o desenho da barra, sobre a escala `log10` nem sobre a colisão zero↔ausência.
 *
 * `1`, e não `30`: o piso existe para separar "houve evento" de "não houve evento", que é uma
 * distinção binária. O controle SQL mediu `129` (long) e `74` (short) não-zeros na janela de 4
 * dias — `74x` o piso —, então o número não é apertado; é o menor que ainda MORDE a janela vazia.
 * Subi-lo para 30 reprovaria uma janela real de mercado calmo, que é o par CALA desta proteção. */
const MINIMUM_NON_ZERO_OBSERVATIONS = 1;

/** `liquidation_catalog.py::coinalyze_liquidation_key` — os três termos que identificam UMA leg.
 * Transcritos de `view-model.ts::matchesLiquidationCohort` pelo motivo de carregamento de módulo
 * do parágrafo acima; `liquidation-series-selector.test.ts` roda a função REAL contra um fixture,
 * e este arquivo roda a transcrição contra o catálogo que a API sob teste de fato serve. */
const LIQUIDATION_METRIC = "sum_liquidation";
const LIQUIDATION_PROVIDER = "coinalyze";

function matchesLiquidationCohort(key: SeriesKey, cohort: LiquidationCohort): boolean {
  return key.metric === LIQUIDATION_METRIC && key.provider === LIQUIDATION_PROVIDER && key.cohort === cohort;
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

/** O que a API sabe sobre UMA coorte na janela que a página declarou — as três populações que o
 * painel tem de manter distintas. */
interface CohortFromApi {
  readonly status: number;
  readonly rows: readonly HistoryRow[];
  readonly presentPoints: number;
  readonly zeroPoints: number;
  readonly nonZeroPoints: number;
  readonly firstPresentMs: number | null;
  readonly lastInstantValue: string | null;
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
 * acabou de responder `500` já fechou). Nenhuma asserção é afrouxada: qualquer resposta HTTP, de
 * qualquer status, volta intacta. */
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

/** As três populações da coorte, derivadas das linhas que a API serviu.
 *
 * ⛔ `Number(row.value)` SÓ depois de `value !== null`, e a ordem é o ativo: `Number(null) === 0`
 * classificaria toda AUSÊNCIA como zero legítimo — exatamente a colisão que este spec existe para
 * reprovar, cometida pelo próprio spec. */
async function readCohortFromApi(
  cohort: LiquidationCohort,
  entries: readonly CatalogEntryWire[],
  request: RenderedRequest,
): Promise<CohortFromApi> {
  const entry = entries.find((row) => row.key.instrumentId === SYMBOL && matchesLiquidationCohort(row.key, cohort));
  expect(entry, `nenhuma linha ${LIQUIDATION_METRIC}/${cohort} no catálogo para ${SYMBOL}`).toBeDefined();
  const seriesKeyId = computeSeriesKeyId(entry!.key);
  const { status, rows } = await fetchSeriesHistory(seriesKeyId, request);
  const present = rows.filter((row) => row.value !== null);
  const zero = present.filter((row) => Number(row.value) === 0);
  fact(SPEC, `liquidation_series_key_id_${cohort}`, seriesKeyId);
  fact(SPEC, `liquidation_series_history_status_${cohort}`, status);
  fact(SPEC, `liquidation_series_history_rows_${cohort}`, rows.length);
  fact(SPEC, `liquidation_api_rows_with_value_${cohort}`, present.length);
  fact(SPEC, `liquidation_api_rows_with_zero_${cohort}`, zero.length);
  return {
    status,
    rows,
    presentPoints: present.length,
    zeroPoints: zero.length,
    nonZeroPoints: present.length - zero.length,
    firstPresentMs: present.length === 0 ? null : present[0]!.event_time,
    lastInstantValue: rows.find((row) => row.event_time === request.windowEndMsInclusive)?.value ?? null,
  };
}

/** Este deployment tem reader de janela de `md.series`? Perguntado À PRÓPRIA API, nunca a uma
 * variável de ambiente — env var aqui seria allowlist disfarçada ("entrada de allowlist é
 * indistinguível de bypass", `CLAUDE.md`). `/ready` publica `store.path`, e `ADR-034/D9` não dá
 * fallback sqlite para `md.series`. */
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

/** Quantas vezes `/symbol` é recarregado enquanto o PRÓPRIO RENDER declara que não alcançou a API
 * de leitura. Ver `loadRenderedRequestWithLiveRead` para o achado que obriga isto a existir. */
const SYMBOL_RENDER_ATTEMPTS = 3;

/** O motivo de ausência que este spec RECARREGA, e o único.
 *
 * `panel-status.ts` tem seis motivos. `connection_refused` é o do render que NÃO CONSEGUIU FALAR
 * com a API — dado nenhum chegou ao servidor do Next, e comparar a tela com a API nesse estado não
 * mede o painel, mede a rede. ⛔ `non_2xx` NÃO é recarregado DE PROPÓSITO: é exatamente o que o
 * universo FRACO produz (sqlite, `/series-history` responde `500`), e ali a recusa é o SUJEITO do
 * teste, não um acidente. Recarregar por `non_2xx` faria o spec girar 3 vezes em toda rodada de
 * `make verify` para acabar no mesmo lugar. */
const RETRIED_ABSENCE_REASON = "connection_refused";

/**
 * `/symbol` carregado até o render ter de fato lido a API — ou reprovado POR NOME quando não tem.
 *
 * ⛔ O ACHADO QUE OBRIGA ISTO A EXISTIR, e ele é de PRODUÇÃO, não do teste
 * `[MEDIDO 2026-09-16, n=6 carregamentos de `/symbol` contra a API de produção: 2 degradaram]`:
 * `page.tsx:305` dispara as SEIS leituras de painel em `Promise.all`, e a API de leitura
 * SERIALIZA as varreduras de grade inteira (`81,1 s` cada, medido por `curl -w %{time_total}`).
 * As duas últimas da fila são justamente as DUAS COORTES DE LIQUIDAÇÃO — e quando a soma passa do
 * teto de headers do `undici`, o render entrega o painel com `panel_absent:connection_refused` e
 * `0/0` grades. A tela NÃO mente nesse estado (diz `SEM_PONTO`, nunca um zero fabricado — `RN-1`
 * pago), mas ela também não tem o que comparar com a API.
 *
 * ⛔ E ISTO NÃO É CONSERTADO AQUI: mudar a ordem, o paralelismo ou o timeout de `page.tsx` é mexer
 * em `frontend/src/`, é transversal aos 6 painéis e é ANTERIOR a esta task — mesma classe de
 * `M-2`. O que esta task faz é REGISTRAR (o fato `symbol_render_degraded_attempts` sai em toda
 * rodada) e impedir que o achado vire um veredito falso nos DOIS sentidos:
 *   • falso VERMELHO — reprovar `DoD-3` por uma leitura que nunca chegou ao servidor;
 *   • falso VERDE — deixar a degradação passar como se fosse o universo fraco, que apagaria
 *     silenciosamente a única asserção de `N >= 30` desta fase. Por isso, esgotadas as tentativas,
 *     o teste REPROVA, e reprova dizendo exatamente o que aconteceu.
 */
async function loadRenderedRequestWithLiveRead(page: Page): Promise<RenderedRequest> {
  let request = await loadRenderedRequest(page);
  let degraded = await page
    .locator(`[data-testid="${LIQUIDATION_PANE_TESTID}"] [data-fact="panel_absent:${RETRIED_ABSENCE_REASON}"]`)
    .count();
  let attempts = 1;
  while (degraded > 0 && attempts < SYMBOL_RENDER_ATTEMPTS) {
    attempts += 1;
    request = await loadRenderedRequest(page);
    degraded = await page
      .locator(`[data-testid="${LIQUIDATION_PANE_TESTID}"] [data-fact="panel_absent:${RETRIED_ABSENCE_REASON}"]`)
      .count();
  }
  fact(SPEC, "symbol_render_attempts", attempts);
  fact(SPEC, "symbol_render_degraded_panes_last_attempt", degraded);
  expect(
    degraded,
    `o render de /symbol declarou "${RETRIED_ABSENCE_REASON}" no painel de liquidações em ${attempts} ` +
      "tentativas seguidas — o servidor do Next não alcançou a API de leitura, então não há leitura na " +
      "tela para confrontar com a API. Isto NÃO é o universo fraco (lá o motivo é non_2xx): é a " +
      "degradação por latência de page.tsx:305 descrita no cabeçalho desta função",
  ).toBe(0);
  return request;
}

/** Lê UM contador do DOM EXIGINDO que ele exista e seja dígitos, ANTES de converter, e reprovando
 * como ASSERÇÃO NOMEADA — nunca como `TypeError` de um `Number(null)` mais adiante.
 *
 * ⛔ A ordem é o ativo, e o preço dela já foi pago uma vez (`BLOCKER-3` da wave `03`,
 * `rc=0, 24 passed`): `Number(null)` e `Number("")` são ambos `0`, e `0` é exatamente o que a API
 * serve no universo fraco ⇒ sem estas duas asserções o `expect(dom).toBe(api)` compara `0 === 0` e
 * fica verde com o contrato APAGADO do DOM. */
async function readCountAttribute(page: Page, cohort: LiquidationCohort, attribute: string): Promise<number> {
  const group = page.locator(`[data-testid="${cohortTestId(cohort)}"]`);
  await expect(group, `a coorte ${cohort} não existe no DOM sob [data-testid="${cohortTestId(cohort)}"]`).toHaveCount(1);
  const raw = await group.getAttribute(attribute);
  expect(
    raw,
    `a página parou de publicar \`${attribute}\` na coorte ${cohort} — sem o atributo não há o que ` +
      "comparar com a API, e `Number(null) === 0` faria esta asserção passar sobre um DOM sem contrato",
  ).not.toBeNull();
  expect(
    raw ?? "",
    `\`${attribute}\` (${cohort}) tem de ser uma contagem em dígitos; vazio vira 0 em \`Number()\``,
  ).toMatch(/^\d+$/);
  return Number(raw);
}

test(`o catálogo servido casa EXATAMENTE UMA linha por coorte de liquidação (${SPEC})`, async () => {
  // O guarda de deriva do seletor, do lado do catálogo REAL — `liquidation-series-selector.test.ts`
  // roda contra um fixture transcrito.
  const entries = await fetchCatalogEntries();
  const forSymbol = entries.filter((entry) => entry.key.instrumentId === SYMBOL);
  const metricRows = forSymbol.filter((entry) => entry.key.metric === LIQUIDATION_METRIC);
  fact(SPEC, "catalog_entries_total", entries.length);
  fact(SPEC, "catalog_sum_liquidation_rows_for_symbol", metricRows.length);

  // ⛔ O TERMO `cohort` É CARREGANTE, E ISTO É O PAR MORDE/CALA DO SELETOR: `metric` sozinho casa
  // DUAS linhas, e `Array.prototype.find` escolheria uma delas em silêncio — um painel rotulado
  // "long" desenhando shorts é indistinguível a olho.
  expect(
    metricRows.length,
    `o filtro de UM termo (metric) casou ${metricRows.length} linhas — se fosse 1, o termo cohort ` +
      "seria decorativo e este arquivo não provaria nada sobre ele",
  ).toBe(2);

  const ids = new Set<string>();
  for (const cohort of LIQUIDATION_COHORTS) {
    const matched = forSymbol.filter((entry) => matchesLiquidationCohort(entry.key, cohort));
    fact(SPEC, `catalog_matches_${cohort}`, matched.length);
    expect(matched.length, `o filtro de três termos casou ${matched.length} linhas para cohort=${cohort}`).toBe(1);
    const key = matched[0]!.key;
    // `nature=FLOW` é o contrato em que `SEM_PONTO` se apoia: um bucket de FLOW sem observação NÃO
    // é um bucket de valor zero, e é essa a regra de TIPO que o painel inteiro depende.
    expect(key.nature, "nature FLOW é o contrato em que SEM_PONTO se apoia").toBe("FLOW");
    expect(key.reduction, "reduction SUM — a soma do bucket, não um ponto").toBe("SUM");
    expect(key.interval, "1m NATIVA — é o que dispensa o divisor de RN-S1").toBe("1m");
    // `RS-5`: a série é de TERCEIRO, e é LEITURA DIRETA dele — não uma reconstrução. Se um dia for
    // reconstruída, o painel precisa da banda de erro e esta linha reprova primeiro.
    expect(matched[0]!.reconstructedFrom, "a leg escolhida é leitura direta do terceiro").toBeNull();
    ids.add(computeSeriesKeyId(key));
  }
  // DUAS séries, não uma com duas views: dois `series_key_id` diferentes.
  expect(ids.size, "as duas coortes têm de ser DUAS séries distintas — mesmo id seria uma só").toBe(2);
});

test(`as DUAS coortes do painel de liquidações são as da API, sobre a MESMA janela (${SPEC})`, async ({ page }) => {
  // ⚠️ `test.slow()` (teto x3, versionado NO ARQUIVO) — e o número que o obriga foi medido, não
  // temido. Rodada 1 deste spec: **`6,5 min` = `390 s` contra o teto de `400 s`** do
  // `playwright.config.ts` `[MEDIDO 2026-09-16, universo FORTE: next start de `affc254` + API de
  // produção]`. A decomposição: `GET /symbol` com 6 séries (~`245 s`) + DUAS leituras de grade
  // INTEIRA em `/series-history` (`81,1 s` cada, `n=1`, `curl -w %{time_total}` sobre a mesma
  // janela). Um teste a `97,5%` do teto não está passando — está prestes a reprovar por relógio,
  // e reprovação por relógio é indistinguível de defeito, que é a classe de sinal que este
  // repositório recusa em toda parte.
  //
  // ⛔ POR QUE AQUI E NÃO NO `playwright.config.ts`: o teto global é de TODOS os specs e o número
  // dele é `3,2x` o PIOR render medido de `/symbol` — subi-lo por causa desta task afrouxaria os
  // outros 12 arquivos, que não pagam o custo das duas leituras de grade inteira. E não é
  // `--timeout` na linha de comando pelo motivo que `gates/T-03.5-T-03.6-qa-remedicao.md` §A6 já
  // mediu: *"um teste que depende de override fora do versionado não existe para o próximo que
  // rodar a suíte"*. `test.slow()` é versionado, local, e aparece no relatório.
  //
  // E o teto x3 (`1.200 s`) cobre o pior caso ARITMÉTICO deste teste, não um chute:
  // `SYMBOL_RENDER_ATTEMPTS` (`3`) x render (`~245 s`) + as duas leituras de grade (`~162 s`) =
  // `~897 s`. A folga de `~300 s` é o que separa "reprovou" de "estourou o relógio".
  //
  // ⚠️ O CONSERTO ÓBVIO FOI TENTADO E NÃO FUNCIONOU, e fica registrado para ninguém tentar de
  // novo: buscar as duas coortes em `Promise.all` deu `402 s` contra `390 s` em série (`n=1`
  // cada, rodadas 1 e 2 de 2026-09-16) — ou seja, NENHUM ganho. A API de leitura serializa as
  // duas varreduras de grade inteira, então o paralelismo do cliente não compra tempo; comprou só
  // uma linha a mais de código para o mesmo número. O custo é do servidor, e reduzi-lo não é
  // task de `web`.
  test.slow();
  const request = await loadRenderedRequestWithLiveRead(page);
  // A grade da janela, derivada dos instantes que o SERVIDOR declarou no `<main>` — nunca do
  // relógio deste processo, que correria contra o do render.
  const windowGridSlots = (request.windowEndMsInclusive - request.windowStartMs) / 60_000 + 1;
  const entries = await fetchCatalogEntries();
  const readerPresent = await seriesWindowReaderPresent();
  fact(SPEC, "series_window_reader_present", readerPresent);
  fact(SPEC, "liquidation_window_grid_slots", windowGridSlots);

  const pane = page.locator(`[data-testid="${LIQUIDATION_PANE_TESTID}"]`);
  await expect(pane, `o painel de liquidações não existe no DOM sob [data-testid="${LIQUIDATION_PANE_TESTID}"]`).toHaveCount(1);

  // ── `RS-5` — a série de TERCEIRO é rotulada COMO TAL, e o rótulo é do PAINEL, não da coorte ──
  //
  // `SPEC-007` §7, literal: *"o operador NÃO PODE LER DADO DE TERCEIRO SEM SABER QUE É DE
  // TERCEIRO"*. `sum_liquidation` é, depois de `GA-7`, a única série de terceiro da feature.
  const provenance = pane.locator('[data-fact^="liquidation_provenance:declared:"]');
  await expect(
    provenance,
    "RS-5: o painel tem de declarar a procedência de TERCEIRO — um painel de série de terceiro sem " +
      "rótulo é a violação que SPEC-007 §7 nomeia",
  ).toHaveCount(1);
  const provenanceFact = await provenance.getAttribute("data-fact");
  const publishedError = await provenance.getAttribute("data-published-error");
  fact(SPEC, "liquidation_provenance_fact", provenanceFact);
  fact(SPEC, "liquidation_published_error", publishedError);
  expect(provenanceFact).toBe(`liquidation_provenance:declared:${LIQUIDATION_PROVIDER}`);
  // ⛔ O `published_error` AUSENTE É DITO, NÃO OMITIDO: `none` é uma recusa declarada (não há
  // segunda fonte para medir fidelidade contra), e `""`/atributo ausente seria a mesma tela sem a
  // afirmação — a diferença entre "medimos e não há" e "ninguém perguntou".
  expect(publishedError, "o published_error ausente é DITO, não omitido").not.toBeNull();
  expect(publishedError ?? "", "published_error vazio é ausência não declarada").not.toBe("");

  for (const cohort of LIQUIDATION_COHORTS) {
    const api = await readCohortFromApi(cohort, entries, request);

    // ── (a) o contrato de DOM existe, e é lido ANTES de qualquer comparação ───────────────────
    const domPresent = await readCountAttribute(page, cohort, "data-liquidation-present-points");
    const domZeros = await readCountAttribute(page, cohort, "data-liquidation-zero-points");
    fact(SPEC, `liquidation_dom_present_points_${cohort}`, domPresent);
    fact(SPEC, `liquidation_dom_zero_points_${cohort}`, domZeros);

    // ── (b) as contagens da tela são as da API, exatas ────────────────────────────────────────
    //
    // Exatas, não aproximadas: os dois lados saíram da MESMA janela declarada, então divergir é
    // defeito de wiring, não corrida. Total sobre os dois universos.
    expect(domPresent, `a coorte ${cohort} declara ${domPresent} observações; a API serviu ${api.presentPoints}`).toBe(
      api.presentPoints,
    );
    expect(domZeros, `a coorte ${cohort} declara ${domZeros} zeros; a API serviu ${api.zeroPoints}`).toBe(api.zeroPoints);

    // ── (c) ⛔ AUSÊNCIA E ZERO SÃO DOIS NÚMEROS DIFERENTES NO DOM, NÃO UM SÓ ──────────────────
    //
    // A exigência é estrutural e vale nos DOIS universos: o painel publica `presentPoints` e
    // `zeroPoints` SEPARADOS, e um zero é um SUBCONJUNTO das observações — nunca o total delas, e
    // nunca uma ausência promovida a observação. Se `zeroPoints > presentPoints`, alguma ausência
    // virou zero em algum lugar do caminho; se os dois fossem publicados como um número só, a
    // pergunta nem poderia ser feita a partir da tela.
    expect(
      domZeros,
      `${cohort}: há mais zeros (${domZeros}) do que observações (${domPresent}) — uma ausência foi ` +
        "contada como zero legítimo, que é exatamente a colisão que RN-1/ZL-3 proíbem",
    ).toBeLessThanOrEqual(domPresent);

    // ── (d) o horizonte legível é DECLARADO, com os dois números e o começo ───────────────────
    //
    // Sem encolher o vão: o denominador tem de ser a grade INTEIRA da janela, não um sub-intervalo
    // recortado em volta do dado. Para uma série `96,7%` ausente, encolher a janela para caber o
    // dado é a mentira mais barata que esta tela poderia contar.
    //
    // ⚠️ ACHADO DESTA TASK, REGISTRADO E **NÃO** CONSERTADO AQUI (é `frontend/src/`, e a mesma
    // classe transversal de `M-2`): `LiquidationReadableHorizon` usa `data.slots.length` como
    // denominador, e `slots` é `[]` quando a leitura não chega ⇒ a tela diz `0/0`. `CvdPane`
    // resolve o MESMO caso dizendo `0/5760`, e a docstring dele nomeia a razão literalmente —
    // *"a janela não encolheu porque o backend não respondeu"*. Medido lado a lado no MESMO DOM
    // (`error-context` da rodada 3, render degradado): CVD `0/5760`, liquidação `0/0`
    // `[MEDIDO 2026-09-16]`. ⛔ Por isso a asserção abaixo compara o denominador contra o que o
    // PAINEL publica em `liquidation_slots:<coorte>:N` (contrato de DOM, sempre verificável) e a
    // igualdade com a janela é exigida no universo FORTE, logo adiante. Exigi-la aqui deixaria
    // `make verify` VERMELHO por um defeito que esta task não introduziu nem tem escopo para
    // consertar — e um portão vermelho por dívida de terceiro deixa de ser lido.
    const slotsHost = page.locator(`[data-testid="${cohortTestId(cohort)}"] [data-fact^="liquidation_slots:${cohort}:"]`);
    await expect(slotsHost, `a coorte ${cohort} não publica liquidation_slots no hospedeiro do canvas`).toHaveCount(1);
    const slotsFact = (await slotsHost.getAttribute("data-fact")) ?? "";
    const domSlots = Number(slotsFact.split(":")[2]);
    fact(SPEC, `liquidation_dom_slots_${cohort}`, domSlots);
    expect(slotsFact, `liquidation_slots (${cohort}) tem de terminar em dígitos`).toMatch(/:\d+$/);
    const horizon = pane.locator(`[data-fact^="liquidation_readable_horizon:${cohort}:"]`);
    await expect(horizon).toHaveCount(1);
    const horizonFact = await horizon.getAttribute("data-fact");
    fact(SPEC, `liquidation_readable_horizon_fact_${cohort}`, horizonFact);
    expect(horizonFact).toBe(`liquidation_readable_horizon:${cohort}:${api.presentPoints}/${domSlots}`);
    const sinceMs = await horizon.getAttribute("data-readable-since-ms");
    fact(SPEC, `liquidation_readable_since_ms_${cohort}`, sinceMs);
    expect(sinceMs).toBe(api.firstPresentMs === null ? "" : String(api.firstPresentMs));

    // ── (e) o veredito por universo ───────────────────────────────────────────────────────────
    const readout = pane.locator(`[data-fact^="liquidation_last_reading:${cohort}:"]`);
    await expect(readout).toHaveCount(1);
    const readoutFact = (await readout.getAttribute("data-fact")) ?? "";
    const readoutText = (await readout.textContent())?.trim() ?? "";
    fact(SPEC, `liquidation_last_reading_fact_${cohort}`, readoutFact);
    fact(SPEC, `liquidation_last_reading_text_${cohort}`, readoutText);

    if (!readerPresent) {
      // A API acabou de declarar, sobre si mesma, que compôs o engine sqlite — que `ADR-034/D9`
      // não dá reader de `md.series`. A asserção que SIGNIFICA algo aqui é a oposta: a rota tem de
      // RECUSAR alto, e a tela tem de dizer a ausência com o TOKEN, nunca com um número.
      expect(api.status, "sem window reader a rota tem de RECUSAR, nunca responder 200 com grade inventada").toBe(500);
      expect(api.presentPoints, `${cohort}: sem reader não há observação nenhuma`).toBe(0);
      expect(readoutText).toContain(ABSENCE_TOKEN);
      // ⛔ `RN-1` literal, e para FLOW é erro de TIPO: nenhum dígito onde não há observação. Um `0`
      // aqui seria a afirmação "ninguém foi liquidado neste minuto", feita a partir de ignorância.
      expect(readoutText, `${cohort}: SEM_PONTO não pode carregar dígito`).not.toMatch(/\d/);
      continue;
    }

    // ── UNIVERSO FORTE: `DoD-3`, coorte a coorte ──────────────────────────────────────────────
    expect(api.status).toBe(200);
    // Uma linha por instante da grade, presente ou ausente — `rows.length` sozinho NÃO é evidência
    // de dado; é evidência de que a grade pedida é a grade devolvida.
    expect(api.rows.length, `${cohort}: a grade devolvida não é a grade pedida`).toBe(windowGridSlots);
    // Ausência DECLARADA, nunca implícita: toda linha sem valor NOMEIA o motivo.
    expect(
      api.rows.filter((row) => row.value === null && row.absence === null),
      `${cohort}: há linha sem valor E sem motivo de ausência — ausência implícita`,
    ).toHaveLength(0);

    // ⛔ O VÃO NÃO ENCOLHE QUANDO HÁ DADO: com a leitura viva, o denominador do horizonte é a
    // grade INTEIRA da janela. É aqui que a asserção de `(d)` fecha — e é o par MORDE do achado
    // registrado lá: a tela pode dizer `0/0` quando não leu NADA (dívida transversal declarada),
    // mas dizer `197/197` quando leu `197` de `5.760` seria esconder `96,6%` da janela.
    expect(
      domSlots,
      `${cohort}: o painel declara ${domSlots} grades e a janela pedida tem ${windowGridSlots} — o vão ` +
        "foi encolhido para caber o dado",
    ).toBe(windowGridSlots);

    // `RN-S2`/`DoD-3`: `N >= 30` grades DISTINTAS com observação, lidas do DOM.
    expect(
      domPresent,
      `DoD-3/RN-S2 pede N >= ${MINIMUM_DISTINCT_POINTS} pontos distintos na coorte ${cohort}; a tela ` +
        `declara ${domPresent}`,
    ).toBeGreaterThanOrEqual(MINIMUM_DISTINCT_POINTS);
    // ...e o painel NÃO está no estado todo-ausente: com `N > 0`, o horizonte legível tem começo.
    expect(sinceMs, `${cohort}: com pontos na janela o horizonte legível tem de ter um começo`).not.toBe("");

    // ⛔ A JANELA EM QUE HOUVE LIQUIDAÇÃO — o piso que o piso de `30` não dá.
    const domNonZero = domPresent - domZeros;
    fact(SPEC, `liquidation_dom_non_zero_points_${cohort}`, domNonZero);
    expect(
      domNonZero,
      `${cohort}: a janela tem ${domPresent} observações e ${domZeros} delas são zero do fornecedor ⇒ ` +
        `${domNonZero} liquidações de fato. Evento esparso não distingue conserto de ausência ` +
        "(ACHADO-FORCEORDER.md): sem uma observação POSITIVA esta rodada não prova nada sobre o painel",
    ).toBeGreaterThanOrEqual(MINIMUM_NON_ZERO_OBSERVATIONS);

    // ⛔ AS TRÊS POPULAÇÕES, TODAS NÃO VAZIAS, E A SOMA FECHANDO A GRADE.
    //
    // É esta asserção que torna a distinção zero↔ausência OBSERVÁVEL em vez de afirmada: se todas
    // as grades tivessem observação, "ausência" não estaria na tela para ser confundida com nada;
    // se nenhuma observação fosse zero, o painel poderia colapsar os dois estados e ninguém veria.
    // A soma fechar contra `windowGridSlots` é o que impede a terceira população de ser inventada.
    const domAbsent = windowGridSlots - domPresent;
    fact(SPEC, `liquidation_dom_absent_slots_${cohort}`, domAbsent);
    expect(domAbsent, `${cohort}: nenhuma grade ausente — a série deixou de ser esparsa?`).toBeGreaterThan(0);
    expect(
      domZeros,
      `${cohort}: nenhum zero do fornecedor nesta janela — a colisão zero↔ausência não é observável ` +
        "aqui, então esta rodada não pode afirmar que o painel a evita",
    ).toBeGreaterThan(0);
    expect(domAbsent + domZeros + domNonZero, `${cohort}: as três populações não fecham a grade`).toBe(windowGridSlots);

    // ── (f) a leitura atual, comparada nos DOIS sentidos contra a API ─────────────────────────
    fact(SPEC, `liquidation_api_last_instant_value_${cohort}`, api.lastInstantValue);
    if (api.lastInstantValue === null) {
      // Ausência REAL no último instante, e ela é NORMAL, não falha — é o par CALA desta
      // proteção: a cauda de publicação deste endpoint passa de um passo de grade (o coletor da
      // Coinalyze reamostra a cada 5 min). O que `RN-1` proíbe é o que a tela NÃO pode DIZER.
      // ⚠️ É por isso que "não diz SEM_PONTO" do `DoD-3` é asserido sobre o HORIZONTE (acima) e
      // não sobre esta leitura: exigir um número no último minuto reprovaria a implementação
      // correta em quase toda rodada.
      expect(readoutFact).toBe(`liquidation_last_reading:${cohort}:absent`);
      expect(readoutText).toContain(ABSENCE_TOKEN);
      expect(readoutText, `${cohort}: SEM_PONTO não pode carregar dígito`).not.toMatch(/\d/);
    } else {
      // A API sabe o valor deste instante ⇒ a tela mostra ESSE número e NÃO diz SEM_PONTO —
      // INCLUSIVE quando o valor é `0`, que é o caso em que a tela mais facilmente mentiria: um
      // zero legítimo renderizado como `SEM_PONTO` apaga uma observação REAL do fornecedor, que é
      // a mesma colisão de `ZL-3` no sentido contrário.
      expect(readoutFact).toBe(`liquidation_last_reading:${cohort}:present`);
      expect(readoutText).not.toContain(ABSENCE_TOKEN);
      expect(readoutText).toContain(String(Number(api.lastInstantValue)));
    }
  }
});

// ── O FALSIFICADOR BARATO DE `M-2`, E ELE NÃO É UM CONSERTO ──────────────────────────────────
//
// `gates/design-05.md` §2 escalou `M-2`: `fitContent()` não cabe as `5.761` grades da janela
// porque `minBarSpacing` da biblioteca satura em `0,5px`, e a `600px` só `1.075` grades (`18,7%`)
// chegam ao canvas — o recorte ancora à direita e a esquerda sai em SILÊNCIO. Para esta série, em
// que `96,7%` das grades são ausentes, *fora-da-janela* e *ausente* renderizam idêntico.
//
// ⚠️ `[MEDIDO 2026-09-16 em jsdom com o shim do próprio repositório, n=4 larguras]` — e é essa a
// fraqueza que este teste remove: o número nasceu num DOM simulado. Aqui ele é medido em Chromium
// de verdade, com a LARGURA REAL que o painel tem na viewport versionada do `playwright.config.ts`.
//
// ⛔ O QUE ESTE TESTE MEDE E O QUE ELE NÃO MEDE, dito antes de qualquer número:
//   • ele NÃO lê o gráfico da aplicação. `lightweight-charts` não expõe a instância no `window`, e
//     expô-la exigiria mudar `frontend/src/` — que é justamente o que a instrução "registre, não
//     conserte" proíbe. O que ele faz é injetar o bundle standalone DA MESMA VERSÃO instalada
//     (`5.2.1`) na página real, construir um gráfico descartável com a LARGURA MEDIDA do painel e
//     a MESMA `timeScale` de `chart-options.ts`, e perguntar `getVisibleLogicalRange()`.
//   • ⇒ o número é sobre A BIBLIOTECA, NUM BROWSER REAL, NA LARGURA REAL DO PAINEL. Não é sobre o
//     canvas específico que a página pintou. Chamar uma coisa da outra seria inventar precisão.
//   • ele NÃO asserta a fração. Fixar `18,7%` num `expect` SANTIFICARIA o defeito: o dia em que
//     `M-2` for consertado, o teste reprovaria a correção. O que ele asserta é o que tem de valer
//     ANTES e DEPOIS do conserto — que o recorte existe e nunca mostra MAIS grades do que a janela
//     declarada tem. A fração vai para `facts.jsonl`, que é onde registro mora.
// Resolvido a partir DESTE arquivo, nunca do `cwd`: a receita do `Makefile` chama o Playwright da
// raiz do repositório e um operador o chama de `frontend/` — um caminho relativo ao `cwd` daria
// `ENOENT` num dos dois, e `addScriptTag` falharia como erro de arquivo em vez de asserção.
const LIGHTWEIGHT_CHARTS_STANDALONE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.js",
);

test(`quantas das grades declaradas chegam ao canvas, em browser real (M-2, registro) (${SPEC})`, async ({ page }) => {
  const request = await loadRenderedRequest(page);

  // ⛔ A CONTAGEM DE GRADES VEM DA JANELA (`<main>`), NÃO DO `data-fact` DO PAINEL — e a rodada 2
  // deste spec é o motivo, medido: naquele carregamento o painel publicou
  // `liquidation_slots:long:0` (a leitura do servidor degradou) e a versão anterior deste teste
  // reprovou por isso, num teste que não é sobre dado nenhum. Pior: no universo FRACO — o que
  // `make verify` roda — `/series-history` RECUSA por construção e `slots` é SEMPRE `0`, então o
  // teste reprovaria em TODA rodada do portão. A quantidade de grades DECLARADAS é propriedade da
  // JANELA, não da série: `M-2` é sobre quanto do que se PEDIU chega ao canvas, e o vão existe
  // igual com a série vazia.
  const declaredSlots = (request.windowEndMsInclusive - request.windowStartMs) / 60_000 + 1;
  const host = page.locator(`[data-testid="${cohortTestId("long")}"] [data-fact^="liquidation_slots:long:"]`);
  await expect(host, "o hospedeiro do canvas da coorte long não está no DOM").toHaveCount(1);
  const paneWidthPx = await host.evaluate((element) => element.clientWidth);
  fact(SPEC, "liquidation_pane_client_width_px", paneWidthPx);
  fact(SPEC, "liquidation_declared_slots", declaredSlots);
  expect(declaredSlots, "a janela declarada no <main> não tem grade").toBeGreaterThan(0);
  expect(paneWidthPx, "o hospedeiro do canvas tem largura zero — não há canvas para medir").toBeGreaterThan(0);

  await page.addScriptTag({ path: LIGHTWEIGHT_CHARTS_STANDALONE });
  const measured = await page.evaluate(
    async ({ width, slots }) => {
      const library = (globalThis as unknown as { LightweightCharts: Record<string, never> }).LightweightCharts;
      const create = library.createChart as unknown as (element: HTMLElement, options: unknown) => never;
      const host2 = document.createElement("div");
      document.body.append(host2);
      // `width`/`height` e a `timeScale` de `chart-options.ts::chartConstructorOptions`. As cores
      // ficam de fora DE PROPÓSITO e a omissão não muda o número: `barSpacing`/`minBarSpacing` não
      // dependem de `layout`/`grid`, e transcrever tokens de cor aqui criaria uma segunda verdade
      // sobre a paleta — a que `color-contrast.test.ts` mede — por um número que ela não afeta.
      const chart = create(host2, {
        width,
        height: 220,
        timeScale: { timeVisible: true, secondsVisible: false },
      }) as unknown as {
        addSeries: (kind: unknown, style: unknown) => { setData: (rows: unknown[]) => void };
        timeScale: () => {
          fitContent: () => void;
          getVisibleLogicalRange: () => { from: number; to: number } | null;
          options: () => { barSpacing: number };
        };
        remove: () => void;
      };
      const series = chart.addSeries(library.LineSeries, {});
      const rows: { time: number; value: number }[] = [];
      for (let index = 0; index < slots; index += 1) {
        rows.push({ time: 1_700_000_000 + index * 60, value: 1 });
      }
      series.setData(rows);
      chart.timeScale().fitContent();
      // ⛔ DUAS MOLDURAS DE ESPERA, E A PRIMEIRA RODADA DESTE SPEC PROVA POR QUE ELAS EXISTEM.
      // `fitContent()` NÃO muda nada de forma síncrona — ele AGENDA (o mesmo fato que
      // `charts/headless-chart.ts` já escreve em prosa para o shim de `jsdom`). Lido no mesmo
      // turno, `getVisibleLogicalRange()` devolve o estado ANTERIOR: rodada 1, a `1.280px`, deu
      // `213` grades visíveis com `barSpacing = 6` — que é exatamente `1280 / 6`, ou seja o
      // DEFAULT do fornecedor, o valor de antes do `fitContent`. Um número lido cedo demais não é
      // uma medição conservadora; é uma medição de outra coisa, e teria virado "3,7% chega ao
      // canvas" num laudo.
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const range = chart.timeScale().getVisibleLogicalRange();
      const barSpacing = chart.timeScale().options().barSpacing;
      chart.remove();
      host2.remove();
      return { from: range?.from ?? null, to: range?.to ?? null, barSpacing };
    },
    { width: paneWidthPx, slots: declaredSlots },
  );

  expect(measured.from, "getVisibleLogicalRange() devolveu nulo — o gráfico não chegou a ter faixa visível").not.toBeNull();
  const visibleSlots = Math.round(measured.to! - measured.from! + 1);
  const visibleFraction = visibleSlots / declaredSlots;
  fact(SPEC, "m2_visible_logical_range_from", measured.from);
  fact(SPEC, "m2_visible_logical_range_to", measured.to);
  fact(SPEC, "m2_bar_spacing_px", measured.barSpacing);
  fact(SPEC, "m2_visible_slots", visibleSlots);
  fact(SPEC, "m2_visible_fraction", Number(visibleFraction.toFixed(4)));

  // As duas asserções que valem ANTES e DEPOIS de `M-2` ser consertado:
  //  1. o recorte existe e é um intervalo real (não nulo, não vazio);
  //  2. ele nunca mostra MAIS grades do que a janela declarada tem — mostrar mais seria desenhar
  //     dado que não existe, defeito de classe pior que o recorte silencioso.
  expect(visibleSlots, "a faixa visível não tem largura").toBeGreaterThan(0);
  expect(
    visibleSlots,
    `a faixa visível (${visibleSlots}) é MAIOR que a janela declarada (${declaredSlots}) — o gráfico ` +
      "estaria desenhando grade que a janela não tem",
  ).toBeLessThanOrEqual(declaredSlots);
});
