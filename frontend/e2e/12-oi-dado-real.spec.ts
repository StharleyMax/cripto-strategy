import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { computeSeriesKeyId } from "../src/app/symbol/series-key-id.ts";
import type { SeriesKey } from "../src/features/s3-inspector/series-catalog.ts";
import { fact, sentimentoApiBaseUrl } from "./helpers.ts";

/**
 * `T-03.6` (`SPEC-007` plano `03` item `3.7`, `DoD-3`, item 3 do `DoD-VERTICAL`) â o `OiPane`
 * com dado real na tela, contado contra a API que a prÃ³pria pÃ¡gina leu, e contado em BARRAS
 * NATIVAS, nÃ£o em degraus de escada.
 *
 * â ï¸ O NOME DO ARQUIVO DIVERGE DA TASK, E A DIVERGÃNCIA Ã DELIBERADA: `tasks.toml` declara
 * `e2e/11-oi-dado-real.spec.ts`, e o prefixo `11` jÃ¡ estava ocupado por
 * `11-canvas-fundo.spec.ts`, criado em 2026-09-12 por `DR-11` â depois de a task ter sido
 * escrita. Dois arquivos com o mesmo prefixo confundiriam a leitura da ordem da suÃ­te sem
 * ganhar nada; o `12` preserva a intenÃ§Ã£o (um spec novo, dedicado, no fim da fila) sem colidir.
 *
 * ââ O QUE ELE ASSERTA, E POR QUE "STATUS 200" NÃO SERVE ââââââââââââââââââââââââââââââââââââââ
 *
 * `D2` recusou o DoD sÃ³-de-API COM NÃMERO, e esta fase Ã© a segunda prova disso: o backend estava
 * pronto, `md.series` tinha 8.064 linhas, `/series-history` respondia `200`, e o painel continuou
 * `SEM_PONTO` porque a PÃGINA pedia a sÃ©rie errada (`handoff/T-03.5-T-03.6-FRONT.md` Â§2). Nenhum
 * portÃ£o de backend podia ver isso. O que este arquivo mede Ã© o DOM: quantas barras o painel DIZ
 * ter, e se esse nÃºmero Ã© o da API sobre EXATAMENTE a janela que o servidor declarou no `<main>`.
 *
 * ââ O DIVISOR DE `RN-S1`, QUE Ã O FALSIFICADOR DA FASE âââââââââââââââââââââââââââââââââââââââ
 *
 * A sÃ©rie Ã© `5m` servida na grade de `1m` (`GA-2`): a rota nÃ£o reagrega, ela caminha a grade de
 * minuto e pergunta `as_of` a cada instante (`series_history.py`, `grid_instant +=
 * _GRID_STEP_MS`). UMA barra nativa aparece como atÃ© CINCO linhas â funÃ§Ã£o escada. Isso nÃ£o Ã©
 * bug, Ã© `RN-S1`.
 *
 *     barras_nativas = linhas_da_API_na_grade_de_5_min        # exato, sem heurÃ­stica
 *     degraus        = linhas_da_API_com_valor                # ~5x maior, e nÃ£o Ã© dado
 *
 * â Sem essa distinÃ§Ã£o, 6 barras reais "passariam" com `N = 30`. Este arquivo lÃª os DOIS nÃºmeros
 * do DOM (`data-oi-native-bars` e `data-oi-wire-points`), recalcula os DOIS da API, e exige que o
 * nÃºmero de manchete do painel seja o PRIMEIRO â e que o segundo seja estritamente maior quando
 * hÃ¡ dado, senÃ£o a distinÃ§Ã£o nÃ£o estaria sendo testada por este fixture (mesmo guarda que
 * `10-cvd-dado-real.spec.ts` usa para o filtro de trÃªs termos).
 *
 * â ï¸ NÃO SE CONTA "VALORES DISTINTOS CONSECUTIVOS" AQUI, e o motivo Ã© medido: open interest Ã©
 * `STOCK`, dois buckets nativos seguidos com o MESMO valor existem e sÃ£o duas observaÃ§Ãµes. A
 * contagem por grade nativa acerta esse caso; a por distinÃ§Ã£o, nÃ£o.
 *
 * ââ OS DOIS UNIVERSOS, DECLARADOS EM TODA RODADA âââââââââââââââââââââââââââââââââââââââââââââ
 *
 *   FRACO  (sqlite, o que `make e2e`/`make verify` compÃµem): `/series-history` RECUSA (`500`).
 *          O que se prova Ã© `RN-1`: diante de um backend que nÃ£o responde, a tela diz `SEM_PONTO`
 *          e NUNCA um `0`, o contrato de DOM estÃ¡ publicado, e o SELETOR DE TRÃS TERMOS Ã©
 *          conferido contra o catÃ¡logo real (que a API serve nos dois universos) â Ã© este
 *          universo que roda no portÃ£o, e Ã© nele que o defeito desta fase seria pego.
 *   FORTE  (Postgres com reader): `N >= 30` BARRAS NATIVAS no DOM, iguais Ã s da API. Ã o item 3
 *          do `DoD-VERTICAL`, e ele depende de `T-03.7` (coletor em produÃ§Ã£o: 30 x 5 min = 150
 *          min de coleta) â Ã© tempo, nÃ£o cÃ³digo.
 *
 * â O universo FRACO nunca Ã© relatado como se fosse o FORTE: toda rodada imprime
 * `series_window_reader_present`, `oi_dom_native_bars` e `oi_dom_wire_points`.
 * â NADA AQUI SEMEIA O POSTGRES COMPARTILHADO (`[P-seed]`, `D2`): nÃ£o hÃ¡ `INSERT`, `psql` nem
 * `docker` neste arquivo fora deste parÃ¡grafo.
 */

const SPEC = "12-oi-dado-real";
const SYMBOL = "BTCUSDT";
// `T-02.5` — a rota virou `/symbol/[symbol]`, segmento em ingles; a página do piloto é `SYMBOL`.
const SYMBOL_PATH = `/symbol/${SYMBOL}`;
const ONE_MINUTE_MS = 60_000;
/** A grade NATIVA desta sÃ©rie (`interval="5m"`, `native_grid="5min"` no catÃ¡logo). O divisor de
 * `RN-S1` mora aqui, e Ã© usado como PASSO DE GRADE â nunca como `/5` sobre uma contagem. */
const NATIVE_GRID_MS = 300_000;

const apiBaseUrl = sentimentoApiBaseUrl;

/** As Ã¢ncoras estÃ¡veis deste painel em `SymbolClient.tsx`. Escritas Ã  mÃ£o, nÃ£o importadas:
 * importar `SymbolClient.tsx` traria `lightweight-charts` (e `view-model.ts` traria
 * `charts/index.ts` -> `jsdom`, que morre sob o carregador de mÃ³dulos do Playwright e leva a
 * COLEÃÃO inteira para `Total: 0 tests`). `oi-pane-dom-contract.test.ts` guarda as mesmas strings
 * do outro lado â duas testemunhas independentes de um contrato sÃ³. */
const OI_PANE_TESTID = "oi-pane";
const ABSENCE_TOKEN = "SEM_PONTO";

/** `DoD-3`: `N >= 30` BARRAS NATIVAS, nÃ£o `N > 0` e nÃ£o 30 degraus. */
const MINIMUM_NATIVE_BARS = 30;

/** Os trÃªs termos que identificam a linha Binance de open interest â a MESMA regra de
 * `view-model.ts::matchesBinanceOpenInterest`, escrita Ã  mÃ£o aqui pelo motivo do parÃ¡grafo
 * acima. `provider` e `reduction` excluem, cada um por si, as quatro linhas OHLC da Coinalyze;
 * `metric` sozinho casa as CINCO, que Ã© exatamente o defeito que esta fase consertou. */
function isBinanceOpenInterest(key: SeriesKey): boolean {
  return key.metric === "sum_open_interest" && key.provider === "binance" && key.reduction === "POINT";
}

interface CatalogEntryWire {
  readonly key: SeriesKey;
  readonly maxStalenessMs: number;
  readonly nativeGrid: string;
  readonly reconstructedFrom: string | null;
}

interface HistoryRow {
  readonly event_time: number;
  /** `A-4.2`: o instante em que a leitura ficou CONHECÃVEL â o minuendo da idade que o painel
   * publica (`T â available_at`, `STITCH_CONTEXT.md:1774`). `null` exatamente quando `value` Ã©. */
  readonly available_at: number | null;
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
 * `08`/`10` documentam (`undici` reaproveita a conexÃ£o que um worker que acabou de responder
 * `500` jÃ¡ fechou). Nenhuma asserÃ§Ã£o Ã© afrouxada: qualquer resposta HTTP volta intacta. */
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

/** â AS DUAS CONTAGENS, LADO A LADO, DERIVADAS DA MESMA RESPOSTA. `native` filtra pela GRADE
 * (`event_time % 300_000`), que Ã© a mesma regra que `scalarPointsFromHistoryRows(rows,
 * FIVE_MINUTES_MS)` aplica do lado do servidor â nÃ£o Ã© uma segunda implementaÃ§Ã£o do divisor, Ã© a
 * mesma pergunta ("esta linha cai na grade nativa?") feita do lado de fora. */
function countRows(rows: readonly HistoryRow[]): { readonly native: number; readonly wire: number } {
  const present = rows.filter((row) => row.value !== null);
  return { native: present.filter((row) => row.event_time % NATIVE_GRID_MS === 0).length, wire: present.length };
}

/** Este deployment tem reader de janela de `md.series`? Perguntado Ã PRÃPRIA API, nunca a uma
 * variÃ¡vel de ambiente â env var aqui seria allowlist disfarÃ§ada. `/ready` publica `store.path`,
 * e `ADR-034/D9` nÃ£o dÃ¡ fallback sqlite para `md.series`. */
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
 * LÃª uma contagem do painel EXIGINDO que ela exista e seja dÃ­gitos, antes de converter.
 *
 * â A conversÃ£o vem depois da exigÃªncia, e a ordem Ã© o ativo: `Number(null)` e `Number("")` sÃ£o
 * ambos `0`, e `0` Ã© exatamente o que a API serve no universo fraco â sem estas duas asserÃ§Ãµes o
 * `expect(dom).toBe(api)` compara `0 === 0` e fica verde com o contrato APAGADO do DOM. Foi o
 * `BLOCKER-3` da wave `03`, `rc=0, 24 passed`.
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

test(`o catÃ¡logo servido casa EXATAMENTE UMA linha de open interest para ${SYMBOL} (${SPEC})`, async () => {
  // O guarda de deriva do seletor, e o teste que teria pego o defeito desta fase no dia em que
  // ele nasceu. `oi-series-selector.test.ts` roda contra um fixture TRANSCRITO de
  // `open_interest_catalog.py`; este roda contra o catÃ¡logo que a API sob teste realmente serve.
  const entries = await fetchCatalogEntries();
  const forSymbol = entries.filter((entry) => entry.key.instrumentId === SYMBOL);
  const openInterestRows = forSymbol.filter((entry) => entry.key.metric === "sum_open_interest");
  const matched = forSymbol.filter((entry) => isBinanceOpenInterest(entry.key));
  fact(SPEC, "catalog_entries_total", entries.length);
  fact(SPEC, "catalog_open_interest_rows_for_symbol", openInterestRows.length);
  fact(SPEC, "catalog_binance_point_matches", matched.length);

  expect(
    matched.length,
    `o filtro de trÃªs termos casou ${matched.length} linhas â DoD-3 lÃª um painel sÃ³, e \`find\` ` +
      "escolheria uma delas sem dizer qual",
  ).toBe(1);
  // â E O FILTRO DE UM TERMO, que seria "o mesmo filtro, mais simples", casa TODAS elas. Sem esta
  // asserÃ§Ã£o o teste acima nÃ£o provaria nada sobre os outros dois termos: um catÃ¡logo com uma
  // linha sÃ³ por mÃ©trica torna os dois filtros indistinguÃ­veis.
  expect(
    openInterestRows.length,
    "se houvesse uma linha `sum_open_interest` sÃ³, o filtro de trÃªs termos seria indistinguÃ­vel do de " +
      "um termo e este arquivo nÃ£o provaria nada sobre ele",
  ).toBeGreaterThan(1);
  // A linha escolhida Ã© a leitura DIRETA da origem, nÃ£o a reconstruÃ§Ã£o de terceiro (`ADR-036/D2`).
  expect(matched[0]!.reconstructedFrom, "a linha escolhida nÃ£o pode ser uma reconstruÃ§Ã£o").toBeNull();
  expect(matched[0]!.key.nature, "nature STOCK Ã© o contrato em que a polÃ­tica de leitura se apoia").toBe("STOCK");
  // E a grade nativa que este arquivo usa como divisor Ã© a que o catÃ¡logo declara â nÃ£o um `5`
  // digitado aqui. Se o backend mudar o intervalo desta sÃ©rie, o teste reprova em vez de contar
  // errado em silÃªncio.
  fact(SPEC, "catalog_native_grid", matched[0]!.nativeGrid);
  expect(matched[0]!.key.interval).toBe("5m");
  expect(matched[0]!.nativeGrid).toBe("5min");
  expect(matched[0]!.maxStalenessMs, "o teto de frescor de RNF-2 Ã© 2 x o bucket nativo").toBe(2 * NATIVE_GRID_MS);
});

test(`MORDE do instrumento: a contagem por grade nativa rejeita a escada (${SPEC})`, async () => {
  // â O FALSIFICADOR DO PRÃPRIO MEDIDOR, e ele roda NOS DOIS UNIVERSOS â inclusive no portÃ£o,
  // onde a API nÃ£o tem reader e nenhuma asserÃ§Ã£o sobre dado real pode morder. Sem ele, "o e2e
  // passa" no `make verify` Ã© compatÃ­vel com um contador que nÃ£o sabe contar.
  //
  // Um fixture sintÃ©tico, aqui e sÃ³ aqui (nada disto toca banco nenhum): 30 barras nativas
  // servidas como 150 linhas de grade de 1 min, que Ã© a forma EXATA que a rota devolve.
  const rows: HistoryRow[] = [];
  for (let bar = 0; bar < 30; bar += 1) {
    for (let step = 0; step < 5; step += 1) {
      rows.push({ event_time: bar * NATIVE_GRID_MS + step * ONE_MINUTE_MS, value: String(70_000 + bar), absence: null });
    }
  }
  const counted = countRows(rows);
  fact(SPEC, "morde_fixture_native", counted.native);
  fact(SPEC, "morde_fixture_wire", counted.wire);
  expect(counted.wire, "a escada tem 150 degraus").toBe(150);
  expect(counted.native, "e 30 barras nativas â Ã© ESTE o nÃºmero do DoD-3").toBe(30);

  // Se o dado sumir, a contagem some junto: nenhuma das duas sobra como constante.
  const erased = rows.map((row) => ({ ...row, value: null, absence: ABSENCE_TOKEN }));
  expect(countRows(erased)).toEqual({ native: 0, wire: 0 });

  // E seis barras reais NÃO passam por trinta: Ã© o cenÃ¡rio que o `DoD-3` nomeia como falsificador
  // da fase ("contar 150 pontos onde hÃ¡ 30 linhas"), aplicado ao seu prÃ³prio pior caso.
  const sixBars = rows.filter((row) => row.event_time < 6 * NATIVE_GRID_MS);
  expect(countRows(sixBars).wire, "trinta degraus...").toBe(30);
  expect(countRows(sixBars).native, "...que sÃ£o seis barras, e seis nÃ£o Ã© trinta").toBe(6);
  expect(countRows(sixBars).native).toBeLessThan(MINIMUM_NATIVE_BARS);
});

test(`o nÃºmero de barras do OiPane Ã© o da API, sobre a MESMA janela (${SPEC})`, async ({ page }) => {
  const request = await loadRenderedRequest(page);
  // A grade da janela, derivada dos instantes que o SERVIDOR declarou no `<main>` â nunca do
  // relÃ³gio deste processo, que correria contra o do render.
  const windowGridSlots = (request.windowEndMsInclusive - request.windowStartMs) / ONE_MINUTE_MS + 1;
  const nativeGridSlots = Math.floor((request.windowEndMsInclusive - request.windowStartMs) / NATIVE_GRID_MS) + 1;
  const entries = await fetchCatalogEntries();
  const oiEntry = entries.find((entry) => entry.key.instrumentId === SYMBOL && isBinanceOpenInterest(entry.key));
  expect(oiEntry, `nenhuma linha binance/POINT de open interest no catÃ¡logo para ${SYMBOL}`).toBeDefined();

  const seriesKeyId = computeSeriesKeyId(oiEntry!.key);
  const { status, rows } = await fetchSeriesHistory(seriesKeyId, request);
  const api = countRows(rows);
  const readerPresent = await seriesWindowReaderPresent();

  fact(SPEC, "series_window_reader_present", readerPresent);
  fact(SPEC, "oi_series_key_id", seriesKeyId);
  fact(SPEC, "oi_series_history_status", status);
  fact(SPEC, "oi_series_history_rows", rows.length);
  fact(SPEC, "oi_api_native_bars", api.native);
  fact(SPEC, "oi_api_wire_points", api.wire);

  // ââ (a) o contrato de DOM existe, e Ã© lido ANTES de qualquer comparaÃ§Ã£o ââââââââââââââââââââ
  const pane = page.locator(`[data-testid="${OI_PANE_TESTID}"]`);
  await expect(pane, `o painel de OI nÃ£o existe no DOM sob [data-testid="${OI_PANE_TESTID}"]`).toHaveCount(1);
  const domNativeBars = requireDigits(await pane.getAttribute("data-oi-native-bars"), "data-oi-native-bars");
  const domWirePoints = requireDigits(await pane.getAttribute("data-oi-wire-points"), "data-oi-wire-points");
  fact(SPEC, "oi_dom_native_bars", domNativeBars);
  fact(SPEC, "oi_dom_wire_points", domWirePoints);

  // ââ (b) as duas contagens da tela sÃ£o as da API, exatas âââââââââââââââââââââââââââââââââââ
  //
  // Exatas, nÃ£o aproximadas: os dois lados saÃ­ram da MESMA janela declarada, entÃ£o divergir Ã©
  // defeito de wiring, nÃ£o corrida.
  expect(domNativeBars, "a manchete do painel tem de ser a contagem de BARRAS NATIVAS da API").toBe(api.native);
  expect(domWirePoints, "e o degrau publicado ao lado tem de ser o degrau da API").toBe(api.wire);

  // ââ (c) `RNF-2`: o painel diz QUÃO VELHA Ã© a leitura, contra o teto que o catÃ¡logo serve âââ
  const freshness = pane.locator('[data-fact^="oi_freshness:"]');
  await expect(freshness, "RNF-2: o painel tem de declarar o frescor da prÃ³pria leitura").toHaveCount(1);
  const freshnessKind = (await freshness.getAttribute("data-fact"))!.split(":")[1];
  const ceilingRaw = await freshness.getAttribute("data-freshness-ceiling-ms");
  const ageRaw = await freshness.getAttribute("data-freshness-age-ms");
  const observedRaw = await freshness.getAttribute("data-freshness-observed-ms");
  fact(SPEC, "oi_freshness_kind", freshnessKind);
  fact(SPEC, "oi_freshness_age_ms", ageRaw);
  fact(SPEC, "oi_freshness_ceiling_ms", ceilingRaw);
  if (freshnessKind === "unknown") {
    // IgnorÃ¢ncia nÃ£o Ã© frescor: sem leitura na janela o painel nÃ£o publica idade nenhuma.
    expect(ageRaw).toBe("");
    expect(api.native, "unknown com barras na API seria o painel ignorando o prÃ³prio dado").toBe(0);
  } else {
    // O teto na tela Ã© o teto do CATÃLOGO â nÃ£o um nÃºmero inventado pelo renderizador.
    expect(Number(ceilingRaw)).toBe(oiEntry!.maxStalenessMs);
    // E o veredito Ã© consistente com os nÃºmeros que ele mesmo publica: `stale` se e somente se a
    // idade passou do teto. Um "fresh" com idade acima do teto seria a mentira que `RNF-2` proÃ­be.
    expect(freshnessKind === "stale").toBe(Number(ageRaw) > Number(ceilingRaw));
    // â ï¸ `A-4.2` MUDOU O QUE ESTE ATRIBUTO SIGNIFICA, e esta asserÃ§Ã£o diz isso em voz alta:
    // `data-freshness-observed-ms` Ã© o `available_at` da leitura mais Ã  direita â um instante de
    // PUBLICAÃÃO â, nÃ£o mais o Ãºltimo slot de grade que o LOCF do servidor conseguiu preencher.
    // A asserÃ§Ã£o anterior (`observed % NATIVE_GRID_MS === 0`) era verdadeira sÃ³ porque a grandeza
    // era de grade; mantÃª-la agora reprovaria o comportamento correto.
    const readable = rows.filter((row) => row.value !== null);
    const rightEdge = readable.reduce<HistoryRow | null>(
      (newest, row) => (newest === null || row.event_time > newest.event_time ? row : newest),
      null,
    );
    expect(rightEdge, "a API declarou barras nativas mas nenhuma linha legÃ­vel â contradiÃ§Ã£o dela, nÃ£o da tela").not
      .toBeNull();
    expect(Number(observedRaw)).toBe(rightEdge!.available_at);
    // E a idade Ã© a subtraÃ§Ã£o declarada, contra o instante que a prÃ³pria tela publicou.
    expect(Number(ageRaw)).toBe(request.windowEndMsInclusive - Number(observedRaw));
  }

  const readoutText = (await pane.locator('[data-fact^="oi_last_reading:"]').textContent())?.trim() ?? "";
  const readingKind = (await pane.locator('[data-fact^="oi_last_reading:"]').getAttribute("data-fact"))!.split(":")[1];
  fact(SPEC, "oi_last_reading_kind", readingKind);
  fact(SPEC, "oi_last_reading_text", readoutText);

  // ââ (d) o horizonte legÃ­vel Ã© DECLARADO, e o denominador Ã© a grade NATIVA âââââââââââââââââ
  const horizon = pane.locator('[data-fact^="oi_readable_horizon:"]');
  await expect(horizon).toHaveCount(1);
  const horizonFact = await horizon.getAttribute("data-fact");
  fact(SPEC, "oi_readable_horizon_fact", horizonFact);
  fact(SPEC, "oi_native_grid_slots", nativeGridSlots);
  // â ï¸ `nativeGridSlots`, NUNCA `windowGridSlots`: o painel desenha a grade de 5 min, e declarar
  // `N/5761` seria a escada vestida de mediÃ§Ã£o. Os dois nÃºmeros sÃ£o publicados como fatos para
  // que a razÃ£o entre eles (5) fique legÃ­vel no relatÃ³rio do gate.
  fact(SPEC, "oi_window_grid_slots", windowGridSlots);
  expect(horizonFact).toBe(`oi_readable_horizon:${api.native}/${nativeGridSlots}`);

  // ââ (e) o veredito por universo ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  if (!readerPresent) {
    // A API acabou de declarar, sobre si mesma, que compÃ´s o engine sqlite, que `ADR-034/D9` nÃ£o
    // dÃ¡ reader de `md.series`. A asserÃ§Ã£o que SIGNIFICA algo aqui Ã© a oposta: a rota tem de
    // RECUSAR alto, nunca responder `200` com uma grade inventada, e a tela tem de dizer a
    // ausÃªncia com o token, nunca com um nÃºmero.
    expect(status, "sem window reader a rota tem de RECUSAR, nunca responder 200 com grade inventada").toBe(500);
    expect(api.native).toBe(0);
    expect(api.wire).toBe(0);
    expect(readoutText).toContain(ABSENCE_TOKEN);
    // â `RN-1` literal: nenhum dÃ­gito onde nÃ£o hÃ¡ observaÃ§Ã£o. Um `0` aqui seria a afirmaÃ§Ã£o "o
    // open interest desta sÃ©rie Ã© zero", feita a partir de ignorÃ¢ncia.
    expect(readoutText).not.toMatch(/\d/);
    expect(freshnessKind, "sem leitura nenhuma, o frescor Ã© ignorÃ¢ncia declarada").toBe("unknown");
    return;
  }

  // ââ UNIVERSO FORTE: o item 3 do `DoD-VERTICAL` âââââââââââââââââââââââââââââââââââââââââââ
  expect(status).toBe(200);
  // Uma linha por instante da grade de PANEL (1 min), presente ou ausente â `rows.length` sozinho
  // NÃO Ã© evidÃªncia de dado; Ã© evidÃªncia de que a grade pedida Ã© a grade devolvida.
  expect(rows.length).toBe(windowGridSlots);
  // AusÃªncia DECLARADA, nunca implÃ­cita: toda linha sem valor nomeia o motivo.
  expect(rows.filter((row) => row.value === null && row.absence === null)).toHaveLength(0);

  // â A ESCADA EXISTE, E Ã POR ISSO QUE O DIVISOR Ã TESTÃVEL. Se `wire === native`, esta sÃ©rie
  // teria deixado de ser servida em escada e as asserÃ§Ãµes de (b) nÃ£o distinguiriam mais as duas
  // contagens â o teste passaria sem provar nada sobre `RN-S1`, que Ã© justamente o modo de falha
  // que esta fase nomeia. Mesma tÃ©cnica do guarda `> 1` do filtro, uma linha acima.
  expect(
    api.wire,
    "com dado real a grade de 1 min tem de carregar MAIS linhas que a de 5 min â sem isso o divisor de " +
      "RN-S1 nÃ£o estÃ¡ sendo exercitado por esta rodada",
  ).toBeGreaterThan(api.native);
  expect(domNativeBars, "e a manchete do painel NÃO Ã© o nÃºmero da escada").not.toBe(api.wire);

  // `DoD-3`: `N >= 30` BARRAS NATIVAS, lidas do DOM.
  expect(
    domNativeBars,
    `DoD-3 pede N >= ${MINIMUM_NATIVE_BARS} barras nativas no OiPane; a tela declara ${domNativeBars} ` +
      `(${domWirePoints} degraus na grade de 1 min)`,
  ).toBeGreaterThanOrEqual(MINIMUM_NATIVE_BARS);

  // A leitura atual, amarrada Ã  API nos dois sentidos â e ancorada na ÃLTIMA BARRA NATIVA LEGÃVEL,
  // que Ã© a linha de que o readout sai, nÃ£o no fim da janela: a cauda de publicaÃ§Ã£o desta sÃ©rie
  // passa de um passo de grade, e exigir nÃºmero no Ãºltimo minuto reprovaria a implementaÃ§Ã£o correta.
  //
  // â ESTA ÃNCORA JÃ FOI `observedRaw`, E ISSO VIROU DEFEITO QUANDO `A-4.2` TROCOU A GRANDEZA.
  // `data-freshness-observed-ms` deixou de ser um slot de grade e passou a ser o `available_at` da
  // leitura da borda direita â um instante de PUBLICAÃÃO (ver a asserÃ§Ã£o de (c) acima, que Ã© o
  // outro leitor do mesmo atributo). `rows.find(row => row.event_time === Number(observedRaw))`
  // entÃ£o nÃ£o casa nada: um `available_at` cai num instante da grade de 1 min com probabilidade
  // ~1/60.000, e o `!` que vinha depois transformava a divergÃªncia em `TypeError` ANTES do
  // `expect` â a amarra "o nÃºmero da tela Ã© o nÃºmero da API" parava de ASSERIR em vez de reprovar.
  // Medido pelo `frontend-qa` em 2/2 rodadas do universo FORTE, `rc=1`
  // (`gates/T-03.5-T-03.6-qa-remedicao.md` Â§A5).
  //
  // A Ã¢ncora correta Ã© a que a PRÃPRIA TELA usa: o readout Ã© `resolveStockReading(panels.oi.slots,
  // â¦)`, e `panels.oi.slots` sÃ£o as linhas da grade NATIVA (`event_time % 300_000 === 0`, o mesmo
  // filtro de `countRows`), de onde `lastPresentSlotMs` tira o Ãºltimo slot com valor. Recalculada
  // aqui a partir da resposta da API â o lado de fora do processo â para que a asserÃ§Ã£o continue
  // amarrando DOIS lados, e nÃ£o a tela a si mesma.
  if (readingKind === "absent") {
    expect(readoutText).toContain(ABSENCE_TOKEN);
    expect(readoutText).not.toMatch(/\d/);
  } else {
    const nativeReadable = rows.filter((row) => row.value !== null && row.event_time % NATIVE_GRID_MS === 0);
    // â A CONTRADIÃÃO, NOMEADA â e Ã© por isto que nÃ£o hÃ¡ mais `!` nesta linha. Um `!` sobre um
    // `find` que nÃ£o achou nada reprova com `TypeError: Cannot read properties of undefined`, que
    // nÃ£o distingue "a tela e a API divergiram" de "o teste quebrou"; e, pior, reprova ANTES de
    // chegar ao `expect`, matando a asserÃ§Ã£o seguinte junto.
    expect(
      nativeReadable.length,
      `a tela imprimiu a leitura ${JSON.stringify(readoutText)} e a API nÃ£o devolveu NENHUMA linha ` +
        "legÃ­vel na grade nativa desta mesma janela â os dois lados se contradizem sobre a mesma pergunta",
    ).toBeGreaterThan(0);
    const lastNativeReading = nativeReadable.reduce((newest, row) =>
      row.event_time > newest.event_time ? row : newest,
    );
    fact(SPEC, "oi_last_native_reading_ms", lastNativeReading.event_time);
    fact(SPEC, "oi_last_native_reading_value", lastNativeReading.value);
    expect(readoutText).not.toContain(ABSENCE_TOKEN);
    expect(
      readoutText,
      `o readout tem de imprimir o valor da Ãºltima barra nativa que a API serve nesta janela ` +
        `(${String(lastNativeReading.value)} no slot ${lastNativeReading.event_time})`,
    ).toContain(String(Number(lastNativeReading.value)));
  }
});
