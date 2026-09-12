import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { computeSeriesKeyId } from "../src/app/symbol/series-key-id.ts";
import type { SeriesKey } from "../src/features/s3-inspector/series-catalog.ts";
import { fact, sentimentoApiBaseUrl } from "./helpers.ts";

/**
 * `T-03.6` (`SPEC-007` plano `03` item `3.7`, `DoD-3`, item 3 do `DoD-VERTICAL`) — o `OiPane`
 * com dado real na tela, contado contra a API que a própria página leu, e contado em BARRAS
 * NATIVAS, não em degraus de escada.
 *
 * ⚠️ O NOME DO ARQUIVO DIVERGE DA TASK, E A DIVERGÊNCIA É DELIBERADA: `tasks.toml` declara
 * `e2e/11-oi-dado-real.spec.ts`, e o prefixo `11` já estava ocupado por
 * `11-canvas-fundo.spec.ts`, criado em 2026-09-12 por `DR-11` — depois de a task ter sido
 * escrita. Dois arquivos com o mesmo prefixo confundiriam a leitura da ordem da suíte sem
 * ganhar nada; o `12` preserva a intenção (um spec novo, dedicado, no fim da fila) sem colidir.
 *
 * ── O QUE ELE ASSERTA, E POR QUE "STATUS 200" NÃO SERVE ──────────────────────────────────────
 *
 * `D2` recusou o DoD só-de-API COM NÚMERO, e esta fase é a segunda prova disso: o backend estava
 * pronto, `md.series` tinha 8.064 linhas, `/series-history` respondia `200`, e o painel continuou
 * `SEM_PONTO` porque a PÁGINA pedia a série errada (`handoff/T-03.5-T-03.6-FRONT.md` §2). Nenhum
 * portão de backend podia ver isso. O que este arquivo mede é o DOM: quantas barras o painel DIZ
 * ter, e se esse número é o da API sobre EXATAMENTE a janela que o servidor declarou no `<main>`.
 *
 * ── O DIVISOR DE `RN-S1`, QUE É O FALSIFICADOR DA FASE ───────────────────────────────────────
 *
 * A série é `5m` servida na grade de `1m` (`GA-2`): a rota não reagrega, ela caminha a grade de
 * minuto e pergunta `as_of` a cada instante (`series_history.py`, `grid_instant +=
 * _GRID_STEP_MS`). UMA barra nativa aparece como até CINCO linhas — função escada. Isso não é
 * bug, é `RN-S1`.
 *
 *     barras_nativas = linhas_da_API_na_grade_de_5_min        # exato, sem heurística
 *     degraus        = linhas_da_API_com_valor                # ~5x maior, e não é dado
 *
 * ⛔ Sem essa distinção, 6 barras reais "passariam" com `N = 30`. Este arquivo lê os DOIS números
 * do DOM (`data-oi-native-bars` e `data-oi-wire-points`), recalcula os DOIS da API, e exige que o
 * número de manchete do painel seja o PRIMEIRO — e que o segundo seja estritamente maior quando
 * há dado, senão a distinção não estaria sendo testada por este fixture (mesmo guarda que
 * `10-cvd-dado-real.spec.ts` usa para o filtro de três termos).
 *
 * ⚠️ NÃO SE CONTA "VALORES DISTINTOS CONSECUTIVOS" AQUI, e o motivo é medido: open interest é
 * `STOCK`, dois buckets nativos seguidos com o MESMO valor existem e são duas observações. A
 * contagem por grade nativa acerta esse caso; a por distinção, não.
 *
 * ── OS DOIS UNIVERSOS, DECLARADOS EM TODA RODADA ─────────────────────────────────────────────
 *
 *   FRACO  (sqlite, o que `make e2e`/`make verify` compõem): `/series-history` RECUSA (`500`).
 *          O que se prova é `RN-1`: diante de um backend que não responde, a tela diz `SEM_PONTO`
 *          e NUNCA um `0`, o contrato de DOM está publicado, e o SELETOR DE TRÊS TERMOS é
 *          conferido contra o catálogo real (que a API serve nos dois universos) — é este
 *          universo que roda no portão, e é nele que o defeito desta fase seria pego.
 *   FORTE  (Postgres com reader): `N >= 30` BARRAS NATIVAS no DOM, iguais às da API. É o item 3
 *          do `DoD-VERTICAL`, e ele depende de `T-03.7` (coletor em produção: 30 x 5 min = 150
 *          min de coleta) — é tempo, não código.
 *
 * ⛔ O universo FRACO nunca é relatado como se fosse o FORTE: toda rodada imprime
 * `series_window_reader_present`, `oi_dom_native_bars` e `oi_dom_wire_points`.
 * ⛔ NADA AQUI SEMEIA O POSTGRES COMPARTILHADO (`[P-seed]`, `D2`): não há `INSERT`, `psql` nem
 * `docker` neste arquivo fora deste parágrafo.
 */

const SPEC = "12-oi-dado-real";
const SYMBOL_PATH = "/symbol";
const SYMBOL = "BTCUSDT";
const ONE_MINUTE_MS = 60_000;
/** A grade NATIVA desta série (`interval="5m"`, `native_grid="5min"` no catálogo). O divisor de
 * `RN-S1` mora aqui, e é usado como PASSO DE GRADE — nunca como `/5` sobre uma contagem. */
const NATIVE_GRID_MS = 300_000;

const apiBaseUrl = sentimentoApiBaseUrl;

/** As âncoras estáveis deste painel em `SymbolClient.tsx`. Escritas à mão, não importadas:
 * importar `SymbolClient.tsx` traria `lightweight-charts` (e `view-model.ts` traria
 * `charts/index.ts` -> `jsdom`, que morre sob o carregador de módulos do Playwright e leva a
 * COLEÇÃO inteira para `Total: 0 tests`). `oi-pane-dom-contract.test.ts` guarda as mesmas strings
 * do outro lado — duas testemunhas independentes de um contrato só. */
const OI_PANE_TESTID = "oi-pane";
const ABSENCE_TOKEN = "SEM_PONTO";

/** `DoD-3`: `N >= 30` BARRAS NATIVAS, não `N > 0` e não 30 degraus. */
const MINIMUM_NATIVE_BARS = 30;

/** Os três termos que identificam a linha Binance de open interest — a MESMA regra de
 * `view-model.ts::matchesBinanceOpenInterest`, escrita à mão aqui pelo motivo do parágrafo
 * acima. `provider` e `reduction` excluem, cada um por si, as quatro linhas OHLC da Coinalyze;
 * `metric` sozinho casa as CINCO, que é exatamente o defeito que esta fase consertou. */
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
 * `08`/`10` documentam (`undici` reaproveita a conexão que um worker que acabou de responder
 * `500` já fechou). Nenhuma asserção é afrouxada: qualquer resposta HTTP volta intacta. */
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

/** ⛔ AS DUAS CONTAGENS, LADO A LADO, DERIVADAS DA MESMA RESPOSTA. `native` filtra pela GRADE
 * (`event_time % 300_000`), que é a mesma regra que `scalarPointsFromHistoryRows(rows,
 * FIVE_MINUTES_MS)` aplica do lado do servidor — não é uma segunda implementação do divisor, é a
 * mesma pergunta ("esta linha cai na grade nativa?") feita do lado de fora. */
function countRows(rows: readonly HistoryRow[]): { readonly native: number; readonly wire: number } {
  const present = rows.filter((row) => row.value !== null);
  return { native: present.filter((row) => row.event_time % NATIVE_GRID_MS === 0).length, wire: present.length };
}

/** Este deployment tem reader de janela de `md.series`? Perguntado À PRÓPRIA API, nunca a uma
 * variável de ambiente — env var aqui seria allowlist disfarçada. `/ready` publica `store.path`,
 * e `ADR-034/D9` não dá fallback sqlite para `md.series`. */
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
 * Lê uma contagem do painel EXIGINDO que ela exista e seja dígitos, antes de converter.
 *
 * ⛔ A conversão vem depois da exigência, e a ordem é o ativo: `Number(null)` e `Number("")` são
 * ambos `0`, e `0` é exatamente o que a API serve no universo fraco ⇒ sem estas duas asserções o
 * `expect(dom).toBe(api)` compara `0 === 0` e fica verde com o contrato APAGADO do DOM. Foi o
 * `BLOCKER-3` da wave `03`, `rc=0, 24 passed`.
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

test(`o catálogo servido casa EXATAMENTE UMA linha de open interest para ${SYMBOL} (${SPEC})`, async () => {
  // O guarda de deriva do seletor, e o teste que teria pego o defeito desta fase no dia em que
  // ele nasceu. `oi-series-selector.test.ts` roda contra um fixture TRANSCRITO de
  // `open_interest_catalog.py`; este roda contra o catálogo que a API sob teste realmente serve.
  const entries = await fetchCatalogEntries();
  const forSymbol = entries.filter((entry) => entry.key.instrumentId === SYMBOL);
  const openInterestRows = forSymbol.filter((entry) => entry.key.metric === "sum_open_interest");
  const matched = forSymbol.filter((entry) => isBinanceOpenInterest(entry.key));
  fact(SPEC, "catalog_entries_total", entries.length);
  fact(SPEC, "catalog_open_interest_rows_for_symbol", openInterestRows.length);
  fact(SPEC, "catalog_binance_point_matches", matched.length);

  expect(
    matched.length,
    `o filtro de três termos casou ${matched.length} linhas — DoD-3 lê um painel só, e \`find\` ` +
      "escolheria uma delas sem dizer qual",
  ).toBe(1);
  // ⛔ E O FILTRO DE UM TERMO, que seria "o mesmo filtro, mais simples", casa TODAS elas. Sem esta
  // asserção o teste acima não provaria nada sobre os outros dois termos: um catálogo com uma
  // linha só por métrica torna os dois filtros indistinguíveis.
  expect(
    openInterestRows.length,
    "se houvesse uma linha `sum_open_interest` só, o filtro de três termos seria indistinguível do de " +
      "um termo e este arquivo não provaria nada sobre ele",
  ).toBeGreaterThan(1);
  // A linha escolhida é a leitura DIRETA da origem, não a reconstrução de terceiro (`ADR-036/D2`).
  expect(matched[0]!.reconstructedFrom, "a linha escolhida não pode ser uma reconstrução").toBeNull();
  expect(matched[0]!.key.nature, "nature STOCK é o contrato em que a política de leitura se apoia").toBe("STOCK");
  // E a grade nativa que este arquivo usa como divisor é a que o catálogo declara — não um `5`
  // digitado aqui. Se o backend mudar o intervalo desta série, o teste reprova em vez de contar
  // errado em silêncio.
  fact(SPEC, "catalog_native_grid", matched[0]!.nativeGrid);
  expect(matched[0]!.key.interval).toBe("5m");
  expect(matched[0]!.nativeGrid).toBe("5min");
  expect(matched[0]!.maxStalenessMs, "o teto de frescor de RNF-2 é 2 x o bucket nativo").toBe(2 * NATIVE_GRID_MS);
});

test(`MORDE do instrumento: a contagem por grade nativa rejeita a escada (${SPEC})`, async () => {
  // ⛔ O FALSIFICADOR DO PRÓPRIO MEDIDOR, e ele roda NOS DOIS UNIVERSOS — inclusive no portão,
  // onde a API não tem reader e nenhuma asserção sobre dado real pode morder. Sem ele, "o e2e
  // passa" no `make verify` é compatível com um contador que não sabe contar.
  //
  // Um fixture sintético, aqui e só aqui (nada disto toca banco nenhum): 30 barras nativas
  // servidas como 150 linhas de grade de 1 min, que é a forma EXATA que a rota devolve.
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
  expect(counted.native, "e 30 barras nativas — é ESTE o número do DoD-3").toBe(30);

  // Se o dado sumir, a contagem some junto: nenhuma das duas sobra como constante.
  const erased = rows.map((row) => ({ ...row, value: null, absence: ABSENCE_TOKEN }));
  expect(countRows(erased)).toEqual({ native: 0, wire: 0 });

  // E seis barras reais NÃO passam por trinta: é o cenário que o `DoD-3` nomeia como falsificador
  // da fase ("contar 150 pontos onde há 30 linhas"), aplicado ao seu próprio pior caso.
  const sixBars = rows.filter((row) => row.event_time < 6 * NATIVE_GRID_MS);
  expect(countRows(sixBars).wire, "trinta degraus...").toBe(30);
  expect(countRows(sixBars).native, "...que são seis barras, e seis não é trinta").toBe(6);
  expect(countRows(sixBars).native).toBeLessThan(MINIMUM_NATIVE_BARS);
});

test(`o número de barras do OiPane é o da API, sobre a MESMA janela (${SPEC})`, async ({ page }) => {
  const request = await loadRenderedRequest(page);
  // A grade da janela, derivada dos instantes que o SERVIDOR declarou no `<main>` — nunca do
  // relógio deste processo, que correria contra o do render.
  const windowGridSlots = (request.windowEndMsInclusive - request.windowStartMs) / ONE_MINUTE_MS + 1;
  const nativeGridSlots = Math.floor((request.windowEndMsInclusive - request.windowStartMs) / NATIVE_GRID_MS) + 1;
  const entries = await fetchCatalogEntries();
  const oiEntry = entries.find((entry) => entry.key.instrumentId === SYMBOL && isBinanceOpenInterest(entry.key));
  expect(oiEntry, `nenhuma linha binance/POINT de open interest no catálogo para ${SYMBOL}`).toBeDefined();

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

  // ── (a) o contrato de DOM existe, e é lido ANTES de qualquer comparação ────────────────────
  const pane = page.locator(`[data-testid="${OI_PANE_TESTID}"]`);
  await expect(pane, `o painel de OI não existe no DOM sob [data-testid="${OI_PANE_TESTID}"]`).toHaveCount(1);
  const domNativeBars = requireDigits(await pane.getAttribute("data-oi-native-bars"), "data-oi-native-bars");
  const domWirePoints = requireDigits(await pane.getAttribute("data-oi-wire-points"), "data-oi-wire-points");
  fact(SPEC, "oi_dom_native_bars", domNativeBars);
  fact(SPEC, "oi_dom_wire_points", domWirePoints);

  // ── (b) as duas contagens da tela são as da API, exatas ───────────────────────────────────
  //
  // Exatas, não aproximadas: os dois lados saíram da MESMA janela declarada, então divergir é
  // defeito de wiring, não corrida.
  expect(domNativeBars, "a manchete do painel tem de ser a contagem de BARRAS NATIVAS da API").toBe(api.native);
  expect(domWirePoints, "e o degrau publicado ao lado tem de ser o degrau da API").toBe(api.wire);

  // ── (c) `RNF-2`: o painel diz QUÃO VELHA é a leitura, contra o teto que o catálogo serve ───
  const freshness = pane.locator('[data-fact^="oi_freshness:"]');
  await expect(freshness, "RNF-2: o painel tem de declarar o frescor da própria leitura").toHaveCount(1);
  const freshnessKind = (await freshness.getAttribute("data-fact"))!.split(":")[1];
  const ceilingRaw = await freshness.getAttribute("data-freshness-ceiling-ms");
  const ageRaw = await freshness.getAttribute("data-freshness-age-ms");
  const observedRaw = await freshness.getAttribute("data-freshness-observed-ms");
  fact(SPEC, "oi_freshness_kind", freshnessKind);
  fact(SPEC, "oi_freshness_age_ms", ageRaw);
  fact(SPEC, "oi_freshness_ceiling_ms", ceilingRaw);
  if (freshnessKind === "unknown") {
    // Ignorância não é frescor: sem leitura na janela o painel não publica idade nenhuma.
    expect(ageRaw).toBe("");
    expect(api.native, "unknown com barras na API seria o painel ignorando o próprio dado").toBe(0);
  } else {
    // O teto na tela é o teto do CATÁLOGO — não um número inventado pelo renderizador.
    expect(Number(ceilingRaw)).toBe(oiEntry!.maxStalenessMs);
    // E o veredito é consistente com os números que ele mesmo publica: `stale` se e somente se a
    // idade passou do teto. Um "fresh" com idade acima do teto seria a mentira que `RNF-2` proíbe.
    expect(freshnessKind === "stale").toBe(Number(ageRaw) > Number(ceilingRaw));
    // A idade é medida contra o instante que a tela declarou, e o instante observado é uma grade
    // NATIVA — se fosse um instante qualquer da escada, a idade seria menor do que a verdade.
    expect(Number(observedRaw) % NATIVE_GRID_MS).toBe(0);
    expect(Number(ageRaw)).toBe(request.windowEndMsInclusive - Number(observedRaw));
    // ...e a API concorda que existe leitura NAQUELE instante.
    expect(rows.find((row) => row.event_time === Number(observedRaw))?.value ?? null).not.toBeNull();
  }

  const readoutText = (await pane.locator('[data-fact^="oi_last_reading:"]').textContent())?.trim() ?? "";
  const readingKind = (await pane.locator('[data-fact^="oi_last_reading:"]').getAttribute("data-fact"))!.split(":")[1];
  fact(SPEC, "oi_last_reading_kind", readingKind);
  fact(SPEC, "oi_last_reading_text", readoutText);

  // ── (d) o horizonte legível é DECLARADO, e o denominador é a grade NATIVA ─────────────────
  const horizon = pane.locator('[data-fact^="oi_readable_horizon:"]');
  await expect(horizon).toHaveCount(1);
  const horizonFact = await horizon.getAttribute("data-fact");
  fact(SPEC, "oi_readable_horizon_fact", horizonFact);
  fact(SPEC, "oi_native_grid_slots", nativeGridSlots);
  // ⚠️ `nativeGridSlots`, NUNCA `windowGridSlots`: o painel desenha a grade de 5 min, e declarar
  // `N/5761` seria a escada vestida de medição. Os dois números são publicados como fatos para
  // que a razão entre eles (5) fique legível no relatório do gate.
  fact(SPEC, "oi_window_grid_slots", windowGridSlots);
  expect(horizonFact).toBe(`oi_readable_horizon:${api.native}/${nativeGridSlots}`);

  // ── (e) o veredito por universo ──────────────────────────────────────────────────────────
  if (!readerPresent) {
    // A API acabou de declarar, sobre si mesma, que compôs o engine sqlite, que `ADR-034/D9` não
    // dá reader de `md.series`. A asserção que SIGNIFICA algo aqui é a oposta: a rota tem de
    // RECUSAR alto, nunca responder `200` com uma grade inventada, e a tela tem de dizer a
    // ausência com o token, nunca com um número.
    expect(status, "sem window reader a rota tem de RECUSAR, nunca responder 200 com grade inventada").toBe(500);
    expect(api.native).toBe(0);
    expect(api.wire).toBe(0);
    expect(readoutText).toContain(ABSENCE_TOKEN);
    // ⛔ `RN-1` literal: nenhum dígito onde não há observação. Um `0` aqui seria a afirmação "o
    // open interest desta série é zero", feita a partir de ignorância.
    expect(readoutText).not.toMatch(/\d/);
    expect(freshnessKind, "sem leitura nenhuma, o frescor é ignorância declarada").toBe("unknown");
    return;
  }

  // ── UNIVERSO FORTE: o item 3 do `DoD-VERTICAL` ───────────────────────────────────────────
  expect(status).toBe(200);
  // Uma linha por instante da grade de PANEL (1 min), presente ou ausente — `rows.length` sozinho
  // NÃO é evidência de dado; é evidência de que a grade pedida é a grade devolvida.
  expect(rows.length).toBe(windowGridSlots);
  // Ausência DECLARADA, nunca implícita: toda linha sem valor nomeia o motivo.
  expect(rows.filter((row) => row.value === null && row.absence === null)).toHaveLength(0);

  // ⛔ A ESCADA EXISTE, E É POR ISSO QUE O DIVISOR É TESTÁVEL. Se `wire === native`, esta série
  // teria deixado de ser servida em escada e as asserções de (b) não distinguiriam mais as duas
  // contagens — o teste passaria sem provar nada sobre `RN-S1`, que é justamente o modo de falha
  // que esta fase nomeia. Mesma técnica do guarda `> 1` do filtro, uma linha acima.
  expect(
    api.wire,
    "com dado real a grade de 1 min tem de carregar MAIS linhas que a de 5 min — sem isso o divisor de " +
      "RN-S1 não está sendo exercitado por esta rodada",
  ).toBeGreaterThan(api.native);
  expect(domNativeBars, "e a manchete do painel NÃO é o número da escada").not.toBe(api.wire);

  // `DoD-3`: `N >= 30` BARRAS NATIVAS, lidas do DOM.
  expect(
    domNativeBars,
    `DoD-3 pede N >= ${MINIMUM_NATIVE_BARS} barras nativas no OiPane; a tela declara ${domNativeBars} ` +
      `(${domWirePoints} degraus na grade de 1 min)`,
  ).toBeGreaterThanOrEqual(MINIMUM_NATIVE_BARS);

  // A leitura atual, amarrada à API nos dois sentidos. ⚠️ Ancorada em `observed_ms` — o instante
  // que a TELA diz ter lido — e não no fim da janela: a cauda de publicação desta série passa de
  // um passo de grade, e exigir número no último minuto reprovaria a implementação correta.
  if (readingKind === "absent") {
    expect(readoutText).toContain(ABSENCE_TOKEN);
    expect(readoutText).not.toMatch(/\d/);
  } else {
    const apiValue = rows.find((row) => row.event_time === Number(observedRaw))!.value!;
    expect(readoutText).not.toContain(ABSENCE_TOKEN);
    expect(readoutText).toContain(String(Number(apiValue)));
  }
});
