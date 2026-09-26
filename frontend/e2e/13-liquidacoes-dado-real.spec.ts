import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { computeSeriesKeyId } from "../src/app/symbol/series-key-id.ts";
import type { SeriesKey } from "../src/features/s3-inspector/series-catalog.ts";
import { fact, sentimentoApiBaseUrl } from "./helpers.ts";

/**
 * `T-05.11` (`SPEC-007` plano `05` item `5.9`, `DoD-3`, `RN-S2`) â o `LiquidationPane` com dado
 * real na tela, AS DUAS COORTES, contado contra a API que a prÃ³pria pÃ¡gina leu.
 *
 * ââ O QUE TORNA ESTE e2e DIFERENTE DOS QUATRO ANTERIORES, E ESTÃ NO TÃTULO DA TASK âââââââââââ
 *
 * LiquidaÃ§Ã£o Ã© EVENTO ESPARSO. `ACHADO-FORCEORDER.md`, literal: *"a fatia de liquidaÃ§Ã£o nÃ£o pode
 * ter como DoD 'apareceu ponto na tela em 1h': evento esparso nÃ£o distingue conserto de
 * ausÃªncia"*. Um spec que rode numa janela sem liquidaÃ§Ã£o passa VERDE sobre um cano morto â foi
 * exatamente assim que o coletor de `!forceOrder@arr` ficou `46h` em silÃªncio com `n_returned=0`
 * e o Ãºnico sinal foi um `REJECTED` sem motivo.
 *
 * Este arquivo paga isso de TRÃS formas, e nenhuma delas Ã© "rodar e torcer":
 *
 *   1. `MINIMUM_DISTINCT_POINTS` (`RN-S2`) â `N >= 30` grades DISTINTAS com observaÃ§Ã£o, POR
 *      COORTE. Uma janela sem liquidaÃ§Ã£o nenhuma nÃ£o chega a `30` e o spec REPROVA em vez de
 *      passar em silÃªncio: o piso Ã© o que transforma "nÃ£o houve evento" em falha visÃ­vel.
 *   2. `MINIMUM_NON_ZERO_OBSERVATIONS` â pelo menos uma observaÃ§Ã£o com valor MAIOR QUE ZERO. Um
 *      fornecedor vivo publicando `0` o tempo todo satisfaz o item 1 e ainda assim nÃ£o prova que
 *      HOUVE liquidaÃ§Ã£o; sÃ³ o valor positivo prova. Os dois pisos juntos sÃ£o a janela que a task
 *      pede, expressa como asserÃ§Ã£o em vez de como escolha de horÃ¡rio.
 *   3. A partiÃ§Ã£o das grades Ã© asserida como TRÃS populaÃ§Ãµes NÃO VAZIAS (ausente Â· zero Â· nÃ£o
 *      zero). Se qualquer uma sumir, a distinÃ§Ã£o que o painel inteiro existe para fazer deixa de
 *      ser observÃ¡vel e o spec deixa de significar o que diz â entÃ£o ele reprova.
 *
 * â NÃO Ã ESTE ARQUIVO QUEM PROVA QUE O CANO ESTÃ VIVO. `ACHADO-FORCEORDER.md` Ã© explÃ­cito: quem
 * prova liveness Ã© o detector de contiguidade/heartbeat (`T-05.7`), NUNCA a taxa. Aqui a taxa Ã©
 * usada para a Ãºnica coisa que ela mede honestamente â "nesta janela, estes pontos estÃ£o na
 * tela" â e o veredito de liveness Ã© de outra task.
 *
 * ââ CONTROLE PREVISTO PELO SQL ANTES DA RODADA (o mÃ©todo dos laudos anteriores) âââââââââââââââ
 *
 * `[MEDIDO 2026-09-16, janela `1789215600000` â `1789561140000`, `knowledge_time` `1789561440000`,
 * Postgres de produÃ§Ã£o SOMENTE LEITURA, nenhum `INSERT`]`:
 *
 *     docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -Atc "
 *       with b as (select series_key_id, bucket_end, min(available_at) mav, min(value_raw::numeric) v
 *         from md.series where series_key_id in ('23e4332â¦f539d5','bc0b8aâ¦44c551')
 *         and bucket_end between 1789215600000 and 1789561140000 and is_final group by 1,2)
 *       select series_key_id, count(*) buckets,
 *              count(*) filter (where mav <= bucket_end+59999) visivel,
 *              count(*) filter (where mav <= bucket_end+59999 and v=0) zeros,
 *              count(*) filter (where mav <= bucket_end+59999 and v>0) naozero from b group by 1"
 *
 *   | coorte  | buckets no store | VISÃVEIS ao `as_of` | zeros | nÃ£o zero |
 *   |---------|------------------|---------------------|-------|----------|
 *   | `long`  | `1.051`          | `195`               | `66`  | `129`    |
 *   | `short` | `1.047`          | `195`               | `121` | `74`     |
 *
 * â ï¸ O `mav <= bucket_end + 59999` NÃO Ã© enfeite e Ã© o que faz o controle PREVER o nÃºmero da API
 * em vez de um nÃºmero maior e errado: `series_history.py` pergunta `as_of` no instante
 * `grid + 59.999 ms` (`_read_instant`, `final_only`) e `as_of` exige `available_at <= t` (R-1).
 * O coletor da Coinalyze reamostra a cada 5 min, entÃ£o a MAIORIA dos buckets que existem no store
 * sÃ³ fica disponÃ­vel DEPOIS do minuto em que fecha â `1.051` no store contra `195` legÃ­veis. Sem
 * esse termo o controle diria `1.051` e acusaria a implementaÃ§Ã£o CORRETA de perder `81%` do dado.
 * Com ele, o controle bateu com a API na casa da unidade (`195`/`66` previstos, `195`/`66`
 * servidos) ANTES da rodada.
 *
 * â NADA AQUI SEMEIA O POSTGRES COMPARTILHADO (`[P-seed]`): nÃ£o hÃ¡ `INSERT`, `psql` nem `docker`
 * neste arquivo fora deste cabeÃ§alho. O controle acima Ã© `SELECT`, rodado Ã  mÃ£o, e estÃ¡ citado
 * como EVIDÃNCIA â a asserÃ§Ã£o do spec Ã© contra a API, nunca contra o banco.
 *
 * ââ OS DOIS UNIVERSOS, DECLARADOS EM TODA RODADA âââââââââââââââââââââââââââââââââââââââââââââ
 *
 * Mesma partiÃ§Ã£o de `08`/`10`/`12`, publicada como `series_window_reader_present`:
 *
 *   FRACO  (sqlite, o que `make e2e` compÃµe): `/series-history` RECUSA (`500`). O que se prova Ã©
 *          `RN-1`: a tela diz `SEM_PONTO`, NUNCA um `0` fabricado, e o contrato de DOM estÃ¡
 *          publicado mesmo assim.
 *   FORTE  (Postgres com reader): os trÃªs pisos acima, POR COORTE. Ã o item que `DoD-3` pede.
 */

const SPEC = "13-liquidacoes-dado-real";
const SYMBOL = "BTCUSDT";
// `T-02.5` — a rota virou `/symbol/[symbol]`, segmento em ingles; a página do piloto é `SYMBOL`.
const SYMBOL_PATH = `/symbol/${SYMBOL}`;

const apiBaseUrl = sentimentoApiBaseUrl;

/** As Ã¢ncoras estÃ¡veis de `SymbolClient.tsx` para este painel. Escritas por extenso, nÃ£o
 * importadas, pelo motivo que `10-cvd-dado-real.spec.ts` jÃ¡ mediu: importar `SymbolClient.tsx`
 * (ou `view-model.ts`, ou `chart-options.ts`) puxa `charts/index.ts` â `jsdom`, que morre sob o
 * carregador de mÃ³dulos do Playwright e leva a COLEÃÃO inteira a `Total: 0 tests`.
 * `liquidation-pane-dom-contract.test.ts` guarda as mesmas strings do outro lado â duas
 * testemunhas independentes de um contrato, de modo que um rename tenha de quebrar uma delas. */
const LIQUIDATION_PANE_TESTID = "liquidation-pane";
const ABSENCE_TOKEN = "SEM_PONTO";

/** `liquidation_catalog.py::COHORTS`, transcrito â e FECHADO aqui pelo mesmo motivo que lÃ¡: uma
 * terceira coorte seria uma terceira sÃ©rie com requisito prÃ³prio, nÃ£o um valor que alguÃ©m passa.
 * â AS DUAS, SEMPRE: `DoD-2`/`DoD-3` pedem as duas SEPARADAMENTE porque somÃ¡-las apaga a
 * discriminaÃ§Ã£o que a mÃ©trica existe para dar (long liquidation Ã© venda forÃ§ada, short
 * liquidation Ã© compra forÃ§ada). */
const LIQUIDATION_COHORTS = ["long", "short"] as const;
type LiquidationCohort = (typeof LIQUIDATION_COHORTS)[number];

function cohortTestId(cohort: LiquidationCohort): string {
  return `liquidation-cohort-${cohort}`;
}

/** `paineis-de-fluxo` `T-01.6`: each cohort is now its OWN pane of the one chart, with its own DOM
 * layer rooted at `cohortTestId(cohort)`. `liquidation-pane` survives as the panel HEADER inside
 * the long cohort's layer (title + third-party provenance), so it no longer encloses the short
 * cohort — per-cohort facts are read under the cohort root. */
const ANY_COHORT_ROOT = '[data-testid^="liquidation-cohort-"]';

/** `RN-S2`, literal: *"o limiar Ã© `N >= 30` pontos distintos, nÃ£o `N > 0`. `N > 0` nÃ£o distingue
 * cano funcionando de ponto por acaso."* Sem divisor de `RN-S1`: `sum_liquidation` Ã© `1m` NATIVA
 * (`liquidation_catalog.py`), entÃ£o cada grade com valor Ã© uma barra nativa distinta.
 *
 * O nÃºmero que o justifica, e ele Ã© o desta sÃ©rie e nÃ£o uma folga inventada: o controle SQL acima
 * previu `195` grades legÃ­veis por coorte na janela de 4 dias â `6,5x` o piso. Um piso de `30`
 * portanto NÃO reprova a implementaÃ§Ã£o correta em janela tÃ­pica, e reprova qualquer janela em que
 * o fornecedor tenha entregue menos de um sexto do que entrega hoje. */
const MINIMUM_DISTINCT_POINTS = 30;

/** O segundo piso, e Ã© ele que responde ao tÃ­tulo da task â *"numa janela em que HOUVE
 * liquidaÃ§Ã£o"*.
 *
 * `ZL-3` (`domain/liquidation_zero_legitimacy.py`) torna o `0` do fornecedor uma OBSERVAÃÃO real,
 * e ela conta para `MINIMUM_DISTINCT_POINTS`. Logo o piso de `30` sozinho Ã© satisfeito por um
 * fornecedor que responda `0` em todas as grades â cano vivo, mercado sem liquidaÃ§Ã£o â, e essa Ã©
 * uma janela legÃ­tima sobre a qual este spec NÃO pode ficar em silÃªncio, porque ela nÃ£o prova
 * nada sobre o desenho da barra, sobre a escala `log10` nem sobre a colisÃ£o zeroâausÃªncia.
 *
 * `1`, e nÃ£o `30`: o piso existe para separar "houve evento" de "nÃ£o houve evento", que Ã© uma
 * distinÃ§Ã£o binÃ¡ria. O controle SQL mediu `129` (long) e `74` (short) nÃ£o-zeros na janela de 4
 * dias â `74x` o piso â, entÃ£o o nÃºmero nÃ£o Ã© apertado; Ã© o menor que ainda MORDE a janela vazia.
 * Subi-lo para 30 reprovaria uma janela real de mercado calmo, que Ã© o par CALA desta proteÃ§Ã£o. */
const MINIMUM_NON_ZERO_OBSERVATIONS = 1;

/** `liquidation_catalog.py::coinalyze_liquidation_key` â os trÃªs termos que identificam UMA leg.
 * Transcritos de `view-model.ts::matchesLiquidationCohort` pelo motivo de carregamento de mÃ³dulo
 * do parÃ¡grafo acima; `liquidation-series-selector.test.ts` roda a funÃ§Ã£o REAL contra um fixture,
 * e este arquivo roda a transcriÃ§Ã£o contra o catÃ¡logo que a API sob teste de fato serve. */
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

/** O que a API sabe sobre UMA coorte na janela que a pÃ¡gina declarou â as trÃªs populaÃ§Ãµes que o
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
 * acabou de responder `500` jÃ¡ fechou). Nenhuma asserÃ§Ã£o Ã© afrouxada: qualquer resposta HTTP, de
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

/** As trÃªs populaÃ§Ãµes da coorte, derivadas das linhas que a API serviu.
 *
 * â `Number(row.value)` SÃ depois de `value !== null`, e a ordem Ã© o ativo: `Number(null) === 0`
 * classificaria toda AUSÃNCIA como zero legÃ­timo â exatamente a colisÃ£o que este spec existe para
 * reprovar, cometida pelo prÃ³prio spec. */
async function readCohortFromApi(
  cohort: LiquidationCohort,
  entries: readonly CatalogEntryWire[],
  request: RenderedRequest,
): Promise<CohortFromApi> {
  const entry = entries.find((row) => row.key.instrumentId === SYMBOL && matchesLiquidationCohort(row.key, cohort));
  expect(entry, `nenhuma linha ${LIQUIDATION_METRIC}/${cohort} no catÃ¡logo para ${SYMBOL}`).toBeDefined();
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

/** Este deployment tem reader de janela de `md.series`? Perguntado Ã PRÃPRIA API, nunca a uma
 * variÃ¡vel de ambiente â env var aqui seria allowlist disfarÃ§ada ("entrada de allowlist Ã©
 * indistinguÃ­vel de bypass", `CLAUDE.md`). `/ready` publica `store.path`, e `ADR-034/D9` nÃ£o dÃ¡
 * fallback sqlite para `md.series`. */
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

/** Quantas vezes `/symbol` Ã© recarregado enquanto o PRÃPRIO RENDER declara que nÃ£o alcanÃ§ou a API
 * de leitura. Ver `loadRenderedRequestWithLiveRead` para o achado que obriga isto a existir. */
const SYMBOL_RENDER_ATTEMPTS = 3;

/** O motivo de ausÃªncia que este spec RECARREGA, e o Ãºnico.
 *
 * `panel-status.ts` tem seis motivos. `connection_refused` Ã© o do render que NÃO CONSEGUIU FALAR
 * com a API â dado nenhum chegou ao servidor do Next, e comparar a tela com a API nesse estado nÃ£o
 * mede o painel, mede a rede. â `non_2xx` NÃO Ã© recarregado DE PROPÃSITO: Ã© exatamente o que o
 * universo FRACO produz (sqlite, `/series-history` responde `500`), e ali a recusa Ã© o SUJEITO do
 * teste, nÃ£o um acidente. Recarregar por `non_2xx` faria o spec girar 3 vezes em toda rodada de
 * `make verify` para acabar no mesmo lugar. */
const RETRIED_ABSENCE_REASON = "connection_refused";

/**
 * `/symbol` carregado atÃ© o render ter de fato lido a API â ou reprovado POR NOME quando nÃ£o tem.
 *
 * â O ACHADO QUE OBRIGA ISTO A EXISTIR, e ele Ã© de PRODUÃÃO, nÃ£o do teste
 * `[MEDIDO 2026-09-16, n=6 carregamentos de `/symbol` contra a API de produÃ§Ã£o: 2 degradaram]`:
 * `page.tsx:305` dispara as SEIS leituras de painel em `Promise.all`, e a API de leitura
 * SERIALIZA as varreduras de grade inteira (`81,1 s` cada, medido por `curl -w %{time_total}`).
 * As duas Ãºltimas da fila sÃ£o justamente as DUAS COORTES DE LIQUIDAÃÃO â e quando a soma passa do
 * teto de headers do `undici`, o render entrega o painel com `panel_absent:connection_refused` e
 * `0/0` grades. A tela NÃO mente nesse estado (diz `SEM_PONTO`, nunca um zero fabricado â `RN-1`
 * pago), mas ela tambÃ©m nÃ£o tem o que comparar com a API.
 *
 * â E ISTO NÃO Ã CONSERTADO AQUI: mudar a ordem, o paralelismo ou o timeout de `page.tsx` Ã© mexer
 * em `frontend/src/`, Ã© transversal aos 6 painÃ©is e Ã© ANTERIOR a esta task â mesma classe de
 * `M-2`. O que esta task faz Ã© REGISTRAR (o fato `symbol_render_degraded_attempts` sai em toda
 * rodada) e impedir que o achado vire um veredito falso nos DOIS sentidos:
 *   â¢ falso VERMELHO â reprovar `DoD-3` por uma leitura que nunca chegou ao servidor;
 *   â¢ falso VERDE â deixar a degradaÃ§Ã£o passar como se fosse o universo fraco, que apagaria
 *     silenciosamente a Ãºnica asserÃ§Ã£o de `N >= 30` desta fase. Por isso, esgotadas as tentativas,
 *     o teste REPROVA, e reprova dizendo exatamente o que aconteceu.
 */
async function loadRenderedRequestWithLiveRead(page: Page): Promise<RenderedRequest> {
  let request = await loadRenderedRequest(page);
  let degraded = await page
    .locator(`${ANY_COHORT_ROOT} [data-fact="panel_absent:${RETRIED_ABSENCE_REASON}"]`)
    .count();
  let attempts = 1;
  while (degraded > 0 && attempts < SYMBOL_RENDER_ATTEMPTS) {
    attempts += 1;
    request = await loadRenderedRequest(page);
    degraded = await page
      .locator(`${ANY_COHORT_ROOT} [data-fact="panel_absent:${RETRIED_ABSENCE_REASON}"]`)
      .count();
  }
  fact(SPEC, "symbol_render_attempts", attempts);
  fact(SPEC, "symbol_render_degraded_panes_last_attempt", degraded);
  expect(
    degraded,
    `o render de /symbol declarou "${RETRIED_ABSENCE_REASON}" no painel de liquidaÃ§Ãµes em ${attempts} ` +
      "tentativas seguidas â o servidor do Next nÃ£o alcanÃ§ou a API de leitura, entÃ£o nÃ£o hÃ¡ leitura na " +
      "tela para confrontar com a API. Isto NÃO Ã© o universo fraco (lÃ¡ o motivo Ã© non_2xx): Ã© a " +
      "degradaÃ§Ã£o por latÃªncia de page.tsx:305 descrita no cabeÃ§alho desta funÃ§Ã£o",
  ).toBe(0);
  return request;
}

/** LÃª UM contador do DOM EXIGINDO que ele exista e seja dÃ­gitos, ANTES de converter, e reprovando
 * como ASSERÃÃO NOMEADA â nunca como `TypeError` de um `Number(null)` mais adiante.
 *
 * â A ordem Ã© o ativo, e o preÃ§o dela jÃ¡ foi pago uma vez (`BLOCKER-3` da wave `03`,
 * `rc=0, 24 passed`): `Number(null)` e `Number("")` sÃ£o ambos `0`, e `0` Ã© exatamente o que a API
 * serve no universo fraco â sem estas duas asserÃ§Ãµes o `expect(dom).toBe(api)` compara `0 === 0` e
 * fica verde com o contrato APAGADO do DOM. */
async function readCountAttribute(page: Page, cohort: LiquidationCohort, attribute: string): Promise<number> {
  const group = page.locator(`[data-testid="${cohortTestId(cohort)}"]`);
  await expect(group, `a coorte ${cohort} nÃ£o existe no DOM sob [data-testid="${cohortTestId(cohort)}"]`).toHaveCount(1);
  const raw = await group.getAttribute(attribute);
  expect(
    raw,
    `a pÃ¡gina parou de publicar \`${attribute}\` na coorte ${cohort} â sem o atributo nÃ£o hÃ¡ o que ` +
      "comparar com a API, e `Number(null) === 0` faria esta asserÃ§Ã£o passar sobre um DOM sem contrato",
  ).not.toBeNull();
  expect(
    raw ?? "",
    `\`${attribute}\` (${cohort}) tem de ser uma contagem em dÃ­gitos; vazio vira 0 em \`Number()\``,
  ).toMatch(/^\d+$/);
  return Number(raw);
}

test(`o catÃ¡logo servido casa EXATAMENTE UMA linha por coorte de liquidaÃ§Ã£o (${SPEC})`, async () => {
  // O guarda de deriva do seletor, do lado do catÃ¡logo REAL â `liquidation-series-selector.test.ts`
  // roda contra um fixture transcrito.
  const entries = await fetchCatalogEntries();
  const forSymbol = entries.filter((entry) => entry.key.instrumentId === SYMBOL);
  const metricRows = forSymbol.filter((entry) => entry.key.metric === LIQUIDATION_METRIC);
  fact(SPEC, "catalog_entries_total", entries.length);
  fact(SPEC, "catalog_sum_liquidation_rows_for_symbol", metricRows.length);

  // â O TERMO `cohort` Ã CARREGANTE, E ISTO Ã O PAR MORDE/CALA DO SELETOR: `metric` sozinho casa
  // DUAS linhas, e `Array.prototype.find` escolheria uma delas em silÃªncio â um painel rotulado
  // "long" desenhando shorts Ã© indistinguÃ­vel a olho.
  expect(
    metricRows.length,
    `o filtro de UM termo (metric) casou ${metricRows.length} linhas â se fosse 1, o termo cohort ` +
      "seria decorativo e este arquivo nÃ£o provaria nada sobre ele",
  ).toBe(2);

  const ids = new Set<string>();
  for (const cohort of LIQUIDATION_COHORTS) {
    const matched = forSymbol.filter((entry) => matchesLiquidationCohort(entry.key, cohort));
    fact(SPEC, `catalog_matches_${cohort}`, matched.length);
    expect(matched.length, `o filtro de trÃªs termos casou ${matched.length} linhas para cohort=${cohort}`).toBe(1);
    const key = matched[0]!.key;
    // `nature=FLOW` Ã© o contrato em que `SEM_PONTO` se apoia: um bucket de FLOW sem observaÃ§Ã£o NÃO
    // Ã© um bucket de valor zero, e Ã© essa a regra de TIPO que o painel inteiro depende.
    expect(key.nature, "nature FLOW Ã© o contrato em que SEM_PONTO se apoia").toBe("FLOW");
    expect(key.reduction, "reduction SUM â a soma do bucket, nÃ£o um ponto").toBe("SUM");
    expect(key.interval, "1m NATIVA â Ã© o que dispensa o divisor de RN-S1").toBe("1m");
    // `RS-5`: a sÃ©rie Ã© de TERCEIRO, e Ã© LEITURA DIRETA dele â nÃ£o uma reconstruÃ§Ã£o. Se um dia for
    // reconstruÃ­da, o painel precisa da banda de erro e esta linha reprova primeiro.
    expect(matched[0]!.reconstructedFrom, "a leg escolhida Ã© leitura direta do terceiro").toBeNull();
    ids.add(computeSeriesKeyId(key));
  }
  // DUAS sÃ©ries, nÃ£o uma com duas views: dois `series_key_id` diferentes.
  expect(ids.size, "as duas coortes tÃªm de ser DUAS sÃ©ries distintas â mesmo id seria uma sÃ³").toBe(2);
});

test(`as DUAS coortes do painel de liquidaÃ§Ãµes sÃ£o as da API, sobre a MESMA janela (${SPEC})`, async ({ page }) => {
  // â ï¸ `test.slow()` (teto x3, versionado NO ARQUIVO) â e o nÃºmero que o obriga foi medido, nÃ£o
  // temido. Rodada 1 deste spec: **`6,5 min` = `390 s` contra o teto de `400 s`** do
  // `playwright.config.ts` `[MEDIDO 2026-09-16, universo FORTE: next start de `affc254` + API de
  // produÃ§Ã£o]`. A decomposiÃ§Ã£o: `GET /symbol` com 6 sÃ©ries (~`245 s`) + DUAS leituras de grade
  // INTEIRA em `/series-history` (`81,1 s` cada, `n=1`, `curl -w %{time_total}` sobre a mesma
  // janela). Um teste a `97,5%` do teto nÃ£o estÃ¡ passando â estÃ¡ prestes a reprovar por relÃ³gio,
  // e reprovaÃ§Ã£o por relÃ³gio Ã© indistinguÃ­vel de defeito, que Ã© a classe de sinal que este
  // repositÃ³rio recusa em toda parte.
  //
  // â POR QUE AQUI E NÃO NO `playwright.config.ts`: o teto global Ã© de TODOS os specs e o nÃºmero
  // dele Ã© `3,2x` o PIOR render medido de `/symbol` â subi-lo por causa desta task afrouxaria os
  // outros 12 arquivos, que nÃ£o pagam o custo das duas leituras de grade inteira. E nÃ£o Ã©
  // `--timeout` na linha de comando pelo motivo que `gates/T-03.5-T-03.6-qa-remedicao.md` Â§A6 jÃ¡
  // mediu: *"um teste que depende de override fora do versionado nÃ£o existe para o prÃ³ximo que
  // rodar a suÃ­te"*. `test.slow()` Ã© versionado, local, e aparece no relatÃ³rio.
  //
  // E o teto x3 (`1.200 s`) cobre o pior caso ARITMÃTICO deste teste, nÃ£o um chute:
  // `SYMBOL_RENDER_ATTEMPTS` (`3`) x render (`~245 s`) + as duas leituras de grade (`~162 s`) =
  // `~897 s`. A folga de `~300 s` Ã© o que separa "reprovou" de "estourou o relÃ³gio".
  //
  // â ï¸ O CONSERTO ÃBVIO FOI TENTADO E NÃO FUNCIONOU, e fica registrado para ninguÃ©m tentar de
  // novo: buscar as duas coortes em `Promise.all` deu `402 s` contra `390 s` em sÃ©rie (`n=1`
  // cada, rodadas 1 e 2 de 2026-09-16) â ou seja, NENHUM ganho. A API de leitura serializa as
  // duas varreduras de grade inteira, entÃ£o o paralelismo do cliente nÃ£o compra tempo; comprou sÃ³
  // uma linha a mais de cÃ³digo para o mesmo nÃºmero. O custo Ã© do servidor, e reduzi-lo nÃ£o Ã©
  // task de `web`.
  test.slow();
  const request = await loadRenderedRequestWithLiveRead(page);
  // A grade da janela, derivada dos instantes que o SERVIDOR declarou no `<main>` â nunca do
  // relÃ³gio deste processo, que correria contra o do render.
  const windowGridSlots = (request.windowEndMsInclusive - request.windowStartMs) / 60_000 + 1;
  const entries = await fetchCatalogEntries();
  const readerPresent = await seriesWindowReaderPresent();
  fact(SPEC, "series_window_reader_present", readerPresent);
  fact(SPEC, "liquidation_window_grid_slots", windowGridSlots);

  const pane = page.locator(`[data-testid="${LIQUIDATION_PANE_TESTID}"]`);
  await expect(pane, `o painel de liquidaÃ§Ãµes nÃ£o existe no DOM sob [data-testid="${LIQUIDATION_PANE_TESTID}"]`).toHaveCount(1);

  // ââ `RS-5` â a sÃ©rie de TERCEIRO Ã© rotulada COMO TAL, e o rÃ³tulo Ã© do PAINEL, nÃ£o da coorte ââ
  //
  // `SPEC-007` Â§7, literal: *"o operador NÃO PODE LER DADO DE TERCEIRO SEM SABER QUE Ã DE
  // TERCEIRO"*. `sum_liquidation` Ã©, depois de `GA-7`, a Ãºnica sÃ©rie de terceiro da feature.
  const provenance = pane.locator('[data-fact^="liquidation_provenance:declared:"]');
  await expect(
    provenance,
    "RS-5: o painel tem de declarar a procedÃªncia de TERCEIRO â um painel de sÃ©rie de terceiro sem " +
      "rÃ³tulo Ã© a violaÃ§Ã£o que SPEC-007 Â§7 nomeia",
  ).toHaveCount(1);
  const provenanceFact = await provenance.getAttribute("data-fact");
  const publishedError = await provenance.getAttribute("data-published-error");
  fact(SPEC, "liquidation_provenance_fact", provenanceFact);
  fact(SPEC, "liquidation_published_error", publishedError);
  expect(provenanceFact).toBe(`liquidation_provenance:declared:${LIQUIDATION_PROVIDER}`);
  // â O `published_error` AUSENTE Ã DITO, NÃO OMITIDO: `none` Ã© uma recusa declarada (nÃ£o hÃ¡
  // segunda fonte para medir fidelidade contra), e `""`/atributo ausente seria a mesma tela sem a
  // afirmaÃ§Ã£o â a diferenÃ§a entre "medimos e nÃ£o hÃ¡" e "ninguÃ©m perguntou".
  expect(publishedError, "o published_error ausente Ã© DITO, nÃ£o omitido").not.toBeNull();
  expect(publishedError ?? "", "published_error vazio Ã© ausÃªncia nÃ£o declarada").not.toBe("");

  for (const cohort of LIQUIDATION_COHORTS) {
    const api = await readCohortFromApi(cohort, entries, request);

    // ââ (a) o contrato de DOM existe, e Ã© lido ANTES de qualquer comparaÃ§Ã£o âââââââââââââââââââ
    const domPresent = await readCountAttribute(page, cohort, "data-liquidation-present-points");
    const domZeros = await readCountAttribute(page, cohort, "data-liquidation-zero-points");
    fact(SPEC, `liquidation_dom_present_points_${cohort}`, domPresent);
    fact(SPEC, `liquidation_dom_zero_points_${cohort}`, domZeros);

    // ââ (b) as contagens da tela sÃ£o as da API, exatas ââââââââââââââââââââââââââââââââââââââââ
    //
    // Exatas, nÃ£o aproximadas: os dois lados saÃ­ram da MESMA janela declarada, entÃ£o divergir Ã©
    // defeito de wiring, nÃ£o corrida. Total sobre os dois universos.
    expect(domPresent, `a coorte ${cohort} declara ${domPresent} observaÃ§Ãµes; a API serviu ${api.presentPoints}`).toBe(
      api.presentPoints,
    );
    expect(domZeros, `a coorte ${cohort} declara ${domZeros} zeros; a API serviu ${api.zeroPoints}`).toBe(api.zeroPoints);

    // ââ (c) â AUSÃNCIA E ZERO SÃO DOIS NÃMEROS DIFERENTES NO DOM, NÃO UM SÃ ââââââââââââââââââ
    //
    // A exigÃªncia Ã© estrutural e vale nos DOIS universos: o painel publica `presentPoints` e
    // `zeroPoints` SEPARADOS, e um zero Ã© um SUBCONJUNTO das observaÃ§Ãµes â nunca o total delas, e
    // nunca uma ausÃªncia promovida a observaÃ§Ã£o. Se `zeroPoints > presentPoints`, alguma ausÃªncia
    // virou zero em algum lugar do caminho; se os dois fossem publicados como um nÃºmero sÃ³, a
    // pergunta nem poderia ser feita a partir da tela.
    expect(
      domZeros,
      `${cohort}: hÃ¡ mais zeros (${domZeros}) do que observaÃ§Ãµes (${domPresent}) â uma ausÃªncia foi ` +
        "contada como zero legÃ­timo, que Ã© exatamente a colisÃ£o que RN-1/ZL-3 proÃ­bem",
    ).toBeLessThanOrEqual(domPresent);

    // ââ (d) o horizonte legÃ­vel Ã© DECLARADO, com os dois nÃºmeros e o comeÃ§o âââââââââââââââââââ
    //
    // Sem encolher o vÃ£o: o denominador tem de ser a grade INTEIRA da janela, nÃ£o um sub-intervalo
    // recortado em volta do dado. Para uma sÃ©rie `96,7%` ausente, encolher a janela para caber o
    // dado Ã© a mentira mais barata que esta tela poderia contar.
    //
    // â ï¸ ACHADO DESTA TASK, REGISTRADO E **NÃO** CONSERTADO AQUI (Ã© `frontend/src/`, e a mesma
    // classe transversal de `M-2`): `LiquidationReadableHorizon` usa `data.slots.length` como
    // denominador, e `slots` Ã© `[]` quando a leitura nÃ£o chega â a tela diz `0/0`. `CvdPane`
    // resolve o MESMO caso dizendo `0/5760`, e a docstring dele nomeia a razÃ£o literalmente â
    // *"a janela nÃ£o encolheu porque o backend nÃ£o respondeu"*. Medido lado a lado no MESMO DOM
    // (`error-context` da rodada 3, render degradado): CVD `0/5760`, liquidaÃ§Ã£o `0/0`
    // `[MEDIDO 2026-09-16]`. â Por isso a asserÃ§Ã£o abaixo compara o denominador contra o que o
    // PAINEL publica em `liquidation_slots:<coorte>:N` (contrato de DOM, sempre verificÃ¡vel) e a
    // igualdade com a janela Ã© exigida no universo FORTE, logo adiante. Exigi-la aqui deixaria
    // `make verify` VERMELHO por um defeito que esta task nÃ£o introduziu nem tem escopo para
    // consertar â e um portÃ£o vermelho por dÃ­vida de terceiro deixa de ser lido.
    const slotsHost = page.locator(`[data-testid="${cohortTestId(cohort)}"] [data-fact^="liquidation_slots:${cohort}:"]`);
    await expect(slotsHost, `a coorte ${cohort} nÃ£o publica liquidation_slots no hospedeiro do canvas`).toHaveCount(1);
    const slotsFact = (await slotsHost.getAttribute("data-fact")) ?? "";
    const domSlots = Number(slotsFact.split(":")[2]);
    fact(SPEC, `liquidation_dom_slots_${cohort}`, domSlots);
    expect(slotsFact, `liquidation_slots (${cohort}) tem de terminar em dÃ­gitos`).toMatch(/:\d+$/);
    const cohortRoot = page.locator(`[data-testid="${cohortTestId(cohort)}"]`);
    const horizon = cohortRoot.locator(`[data-fact^="liquidation_readable_horizon:${cohort}:"]`);
    await expect(horizon).toHaveCount(1);
    const horizonFact = await horizon.getAttribute("data-fact");
    fact(SPEC, `liquidation_readable_horizon_fact_${cohort}`, horizonFact);
    expect(horizonFact).toBe(`liquidation_readable_horizon:${cohort}:${api.presentPoints}/${domSlots}`);
    const sinceMs = await horizon.getAttribute("data-readable-since-ms");
    fact(SPEC, `liquidation_readable_since_ms_${cohort}`, sinceMs);
    expect(sinceMs).toBe(api.firstPresentMs === null ? "" : String(api.firstPresentMs));

    // ââ (e) o veredito por universo âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    const readout = cohortRoot.locator(`[data-fact^="liquidation_last_reading:${cohort}:"]`);
    await expect(readout).toHaveCount(1);
    const readoutFact = (await readout.getAttribute("data-fact")) ?? "";
    const readoutText = (await readout.textContent())?.trim() ?? "";
    fact(SPEC, `liquidation_last_reading_fact_${cohort}`, readoutFact);
    fact(SPEC, `liquidation_last_reading_text_${cohort}`, readoutText);

    if (!readerPresent) {
      // A API acabou de declarar, sobre si mesma, que compÃ´s o engine sqlite â que `ADR-034/D9`
      // nÃ£o dÃ¡ reader de `md.series`. A asserÃ§Ã£o que SIGNIFICA algo aqui Ã© a oposta: a rota tem de
      // RECUSAR alto, e a tela tem de dizer a ausÃªncia com o TOKEN, nunca com um nÃºmero.
      expect(api.status, "sem window reader a rota tem de RECUSAR, nunca responder 200 com grade inventada").toBe(500);
      expect(api.presentPoints, `${cohort}: sem reader nÃ£o hÃ¡ observaÃ§Ã£o nenhuma`).toBe(0);
      expect(readoutText).toContain(ABSENCE_TOKEN);
      // â `RN-1` literal, e para FLOW Ã© erro de TIPO: nenhum dÃ­gito onde nÃ£o hÃ¡ observaÃ§Ã£o. Um `0`
      // aqui seria a afirmaÃ§Ã£o "ninguÃ©m foi liquidado neste minuto", feita a partir de ignorÃ¢ncia.
      expect(readoutText, `${cohort}: SEM_PONTO nÃ£o pode carregar dÃ­gito`).not.toMatch(/\d/);
      continue;
    }

    // ââ UNIVERSO FORTE: `DoD-3`, coorte a coorte ââââââââââââââââââââââââââââââââââââââââââââââ
    expect(api.status).toBe(200);
    // Uma linha por instante da grade, presente ou ausente â `rows.length` sozinho NÃO Ã© evidÃªncia
    // de dado; Ã© evidÃªncia de que a grade pedida Ã© a grade devolvida.
    expect(api.rows.length, `${cohort}: a grade devolvida nÃ£o Ã© a grade pedida`).toBe(windowGridSlots);
    // AusÃªncia DECLARADA, nunca implÃ­cita: toda linha sem valor NOMEIA o motivo.
    expect(
      api.rows.filter((row) => row.value === null && row.absence === null),
      `${cohort}: hÃ¡ linha sem valor E sem motivo de ausÃªncia â ausÃªncia implÃ­cita`,
    ).toHaveLength(0);

    // â O VÃO NÃO ENCOLHE QUANDO HÃ DADO: com a leitura viva, o denominador do horizonte Ã© a
    // grade INTEIRA da janela. Ã aqui que a asserÃ§Ã£o de `(d)` fecha â e Ã© o par MORDE do achado
    // registrado lÃ¡: a tela pode dizer `0/0` quando nÃ£o leu NADA (dÃ­vida transversal declarada),
    // mas dizer `197/197` quando leu `197` de `5.760` seria esconder `96,6%` da janela.
    expect(
      domSlots,
      `${cohort}: o painel declara ${domSlots} grades e a janela pedida tem ${windowGridSlots} â o vÃ£o ` +
        "foi encolhido para caber o dado",
    ).toBe(windowGridSlots);

    // `RN-S2`/`DoD-3`: `N >= 30` grades DISTINTAS com observaÃ§Ã£o, lidas do DOM.
    expect(
      domPresent,
      `DoD-3/RN-S2 pede N >= ${MINIMUM_DISTINCT_POINTS} pontos distintos na coorte ${cohort}; a tela ` +
        `declara ${domPresent}`,
    ).toBeGreaterThanOrEqual(MINIMUM_DISTINCT_POINTS);
    // ...e o painel NÃO estÃ¡ no estado todo-ausente: com `N > 0`, o horizonte legÃ­vel tem comeÃ§o.
    expect(sinceMs, `${cohort}: com pontos na janela o horizonte legÃ­vel tem de ter um comeÃ§o`).not.toBe("");

    // â A JANELA EM QUE HOUVE LIQUIDAÃÃO â o piso que o piso de `30` nÃ£o dÃ¡.
    const domNonZero = domPresent - domZeros;
    fact(SPEC, `liquidation_dom_non_zero_points_${cohort}`, domNonZero);
    expect(
      domNonZero,
      `${cohort}: a janela tem ${domPresent} observaÃ§Ãµes e ${domZeros} delas sÃ£o zero do fornecedor â ` +
        `${domNonZero} liquidaÃ§Ãµes de fato. Evento esparso nÃ£o distingue conserto de ausÃªncia ` +
        "(ACHADO-FORCEORDER.md): sem uma observaÃ§Ã£o POSITIVA esta rodada nÃ£o prova nada sobre o painel",
    ).toBeGreaterThanOrEqual(MINIMUM_NON_ZERO_OBSERVATIONS);

    // â AS TRÃS POPULAÃÃES, TODAS NÃO VAZIAS, E A SOMA FECHANDO A GRADE.
    //
    // Ã esta asserÃ§Ã£o que torna a distinÃ§Ã£o zeroâausÃªncia OBSERVÃVEL em vez de afirmada: se todas
    // as grades tivessem observaÃ§Ã£o, "ausÃªncia" nÃ£o estaria na tela para ser confundida com nada;
    // se nenhuma observaÃ§Ã£o fosse zero, o painel poderia colapsar os dois estados e ninguÃ©m veria.
    // A soma fechar contra `windowGridSlots` Ã© o que impede a terceira populaÃ§Ã£o de ser inventada.
    const domAbsent = windowGridSlots - domPresent;
    fact(SPEC, `liquidation_dom_absent_slots_${cohort}`, domAbsent);
    expect(domAbsent, `${cohort}: nenhuma grade ausente â a sÃ©rie deixou de ser esparsa?`).toBeGreaterThan(0);
    expect(
      domZeros,
      `${cohort}: nenhum zero do fornecedor nesta janela â a colisÃ£o zeroâausÃªncia nÃ£o Ã© observÃ¡vel ` +
        "aqui, entÃ£o esta rodada nÃ£o pode afirmar que o painel a evita",
    ).toBeGreaterThan(0);
    expect(domAbsent + domZeros + domNonZero, `${cohort}: as trÃªs populaÃ§Ãµes nÃ£o fecham a grade`).toBe(windowGridSlots);

    // ââ (f) a leitura atual, comparada nos DOIS sentidos contra a API âââââââââââââââââââââââââ
    fact(SPEC, `liquidation_api_last_instant_value_${cohort}`, api.lastInstantValue);
    if (api.lastInstantValue === null) {
      // AusÃªncia REAL no Ãºltimo instante, e ela Ã© NORMAL, nÃ£o falha â Ã© o par CALA desta
      // proteÃ§Ã£o: a cauda de publicaÃ§Ã£o deste endpoint passa de um passo de grade (o coletor da
      // Coinalyze reamostra a cada 5 min). O que `RN-1` proÃ­be Ã© o que a tela NÃO pode DIZER.
      // â ï¸ Ã por isso que "nÃ£o diz SEM_PONTO" do `DoD-3` Ã© asserido sobre o HORIZONTE (acima) e
      // nÃ£o sobre esta leitura: exigir um nÃºmero no Ãºltimo minuto reprovaria a implementaÃ§Ã£o
      // correta em quase toda rodada.
      expect(readoutFact).toBe(`liquidation_last_reading:${cohort}:absent`);
      expect(readoutText).toContain(ABSENCE_TOKEN);
      expect(readoutText, `${cohort}: SEM_PONTO nÃ£o pode carregar dÃ­gito`).not.toMatch(/\d/);
    } else {
      // A API sabe o valor deste instante â a tela mostra ESSE nÃºmero e NÃO diz SEM_PONTO â
      // INCLUSIVE quando o valor Ã© `0`, que Ã© o caso em que a tela mais facilmente mentiria: um
      // zero legÃ­timo renderizado como `SEM_PONTO` apaga uma observaÃ§Ã£o REAL do fornecedor, que Ã©
      // a mesma colisÃ£o de `ZL-3` no sentido contrÃ¡rio.
      expect(readoutFact).toBe(`liquidation_last_reading:${cohort}:present`);
      expect(readoutText).not.toContain(ABSENCE_TOKEN);
      expect(readoutText).toContain(String(Number(api.lastInstantValue)));
    }
  }
});

// ââ O FALSIFICADOR BARATO DE `M-2`, E ELE NÃO Ã UM CONSERTO ââââââââââââââââââââââââââââââââââ
//
// `gates/design-05.md` Â§2 escalou `M-2`: `fitContent()` nÃ£o cabe as `5.761` grades da janela
// porque `minBarSpacing` da biblioteca satura em `0,5px`, e a `600px` sÃ³ `1.075` grades (`18,7%`)
// chegam ao canvas â o recorte ancora Ã  direita e a esquerda sai em SILÃNCIO. Para esta sÃ©rie, em
// que `96,7%` das grades sÃ£o ausentes, *fora-da-janela* e *ausente* renderizam idÃªntico.
//
// â ï¸ `[MEDIDO 2026-09-16 em jsdom com o shim do prÃ³prio repositÃ³rio, n=4 larguras]` â e Ã© essa a
// fraqueza que este teste remove: o nÃºmero nasceu num DOM simulado. Aqui ele Ã© medido em Chromium
// de verdade, com a LARGURA REAL que o painel tem na viewport versionada do `playwright.config.ts`.
//
// â O QUE ESTE TESTE MEDE E O QUE ELE NÃO MEDE, dito antes de qualquer nÃºmero:
//   â¢ ele NÃO lÃª o grÃ¡fico da aplicaÃ§Ã£o. `lightweight-charts` nÃ£o expÃµe a instÃ¢ncia no `window`, e
//     expÃ´-la exigiria mudar `frontend/src/` â que Ã© justamente o que a instruÃ§Ã£o "registre, nÃ£o
//     conserte" proÃ­be. O que ele faz Ã© injetar o bundle standalone DA MESMA VERSÃO instalada
//     (`5.2.1`) na pÃ¡gina real, construir um grÃ¡fico descartÃ¡vel com a LARGURA MEDIDA do painel e
//     a MESMA `timeScale` de `chart-options.ts`, e perguntar `getVisibleLogicalRange()`.
//   â¢ â o nÃºmero Ã© sobre A BIBLIOTECA, NUM BROWSER REAL, NA LARGURA REAL DO PAINEL. NÃ£o Ã© sobre o
//     canvas especÃ­fico que a pÃ¡gina pintou. Chamar uma coisa da outra seria inventar precisÃ£o.
//   â¢ ele NÃO asserta a fraÃ§Ã£o. Fixar `18,7%` num `expect` SANTIFICARIA o defeito: o dia em que
//     `M-2` for consertado, o teste reprovaria a correÃ§Ã£o. O que ele asserta Ã© o que tem de valer
//     ANTES e DEPOIS do conserto â que o recorte existe e nunca mostra MAIS grades do que a janela
//     declarada tem. A fraÃ§Ã£o vai para `facts.jsonl`, que Ã© onde registro mora.
// Resolvido a partir DESTE arquivo, nunca do `cwd`: a receita do `Makefile` chama o Playwright da
// raiz do repositÃ³rio e um operador o chama de `frontend/` â um caminho relativo ao `cwd` daria
// `ENOENT` num dos dois, e `addScriptTag` falharia como erro de arquivo em vez de asserÃ§Ã£o.
const LIGHTWEIGHT_CHARTS_STANDALONE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.js",
);

test(`quantas das grades declaradas chegam ao canvas, em browser real (M-2, registro) (${SPEC})`, async ({ page }) => {
  const request = await loadRenderedRequest(page);

  // â A CONTAGEM DE GRADES VEM DA JANELA (`<main>`), NÃO DO `data-fact` DO PAINEL â e a rodada 2
  // deste spec Ã© o motivo, medido: naquele carregamento o painel publicou
  // `liquidation_slots:long:0` (a leitura do servidor degradou) e a versÃ£o anterior deste teste
  // reprovou por isso, num teste que nÃ£o Ã© sobre dado nenhum. Pior: no universo FRACO â o que
  // `make verify` roda â `/series-history` RECUSA por construÃ§Ã£o e `slots` Ã© SEMPRE `0`, entÃ£o o
  // teste reprovaria em TODA rodada do portÃ£o. A quantidade de grades DECLARADAS Ã© propriedade da
  // JANELA, nÃ£o da sÃ©rie: `M-2` Ã© sobre quanto do que se PEDIU chega ao canvas, e o vÃ£o existe
  // igual com a sÃ©rie vazia.
  const declaredSlots = (request.windowEndMsInclusive - request.windowStartMs) / 60_000 + 1;
  const host = page.locator(`[data-testid="${cohortTestId("long")}"] [data-fact^="liquidation_slots:long:"]`);
  await expect(host, "o hospedeiro do canvas da coorte long nÃ£o estÃ¡ no DOM").toHaveCount(1);
  const paneWidthPx = await host.evaluate((element) => element.clientWidth);
  fact(SPEC, "liquidation_pane_client_width_px", paneWidthPx);
  fact(SPEC, "liquidation_declared_slots", declaredSlots);
  expect(declaredSlots, "a janela declarada no <main> nÃ£o tem grade").toBeGreaterThan(0);
  expect(paneWidthPx, "o hospedeiro do canvas tem largura zero â nÃ£o hÃ¡ canvas para medir").toBeGreaterThan(0);

  await page.addScriptTag({ path: LIGHTWEIGHT_CHARTS_STANDALONE });
  const measured = await page.evaluate(
    async ({ width, slots }) => {
      const library = (globalThis as unknown as { LightweightCharts: Record<string, never> }).LightweightCharts;
      const create = library.createChart as unknown as (element: HTMLElement, options: unknown) => never;
      const host2 = document.createElement("div");
      document.body.append(host2);
      // `width`/`height` e a `timeScale` de `chart-options.ts::chartConstructorOptions`. As cores
      // ficam de fora DE PROPÃSITO e a omissÃ£o nÃ£o muda o nÃºmero: `barSpacing`/`minBarSpacing` nÃ£o
      // dependem de `layout`/`grid`, e transcrever tokens de cor aqui criaria uma segunda verdade
      // sobre a paleta â a que `color-contrast.test.ts` mede â por um nÃºmero que ela nÃ£o afeta.
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
      // â DUAS MOLDURAS DE ESPERA, E A PRIMEIRA RODADA DESTE SPEC PROVA POR QUE ELAS EXISTEM.
      // `fitContent()` NÃO muda nada de forma sÃ­ncrona â ele AGENDA (o mesmo fato que
      // `charts/headless-chart.ts` jÃ¡ escreve em prosa para o shim de `jsdom`). Lido no mesmo
      // turno, `getVisibleLogicalRange()` devolve o estado ANTERIOR: rodada 1, a `1.280px`, deu
      // `213` grades visÃ­veis com `barSpacing = 6` â que Ã© exatamente `1280 / 6`, ou seja o
      // DEFAULT do fornecedor, o valor de antes do `fitContent`. Um nÃºmero lido cedo demais nÃ£o Ã©
      // uma mediÃ§Ã£o conservadora; Ã© uma mediÃ§Ã£o de outra coisa, e teria virado "3,7% chega ao
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

  expect(measured.from, "getVisibleLogicalRange() devolveu nulo â o grÃ¡fico nÃ£o chegou a ter faixa visÃ­vel").not.toBeNull();
  const visibleSlots = Math.round(measured.to! - measured.from! + 1);
  const visibleFraction = visibleSlots / declaredSlots;
  fact(SPEC, "m2_visible_logical_range_from", measured.from);
  fact(SPEC, "m2_visible_logical_range_to", measured.to);
  fact(SPEC, "m2_bar_spacing_px", measured.barSpacing);
  fact(SPEC, "m2_visible_slots", visibleSlots);
  fact(SPEC, "m2_visible_fraction", Number(visibleFraction.toFixed(4)));

  // As duas asserÃ§Ãµes que valem ANTES e DEPOIS de `M-2` ser consertado:
  //  1. o recorte existe e Ã© um intervalo real (nÃ£o nulo, nÃ£o vazio);
  //  2. ele nunca mostra MAIS grades do que a janela declarada tem â mostrar mais seria desenhar
  //     dado que nÃ£o existe, defeito de classe pior que o recorte silencioso.
  expect(visibleSlots, "a faixa visÃ­vel nÃ£o tem largura").toBeGreaterThan(0);
  expect(
    visibleSlots,
    `a faixa visÃ­vel (${visibleSlots}) Ã© MAIOR que a janela declarada (${declaredSlots}) â o grÃ¡fico ` +
      "estaria desenhando grade que a janela nÃ£o tem",
  ).toBeLessThanOrEqual(declaredSlots);
});
