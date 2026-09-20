import http from "node:http";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { computeSeriesKeyId } from "../src/app/symbol/series-key-id.ts";
import { candlestickSeriesColors } from "../src/charts/color-tokens.ts";
import type { SeriesKey } from "../src/features/s3-inspector/series-catalog.ts";
import {
  fact,
  sentimentoApiBaseUrl,
  shot,
  startSecondaryNextInstance,
  type NextInstanceHandle,
} from "./helpers.ts";

/**
 * `T-01.11` (`CST-207`) — **o único instrumento desta fase que pergunta se a VELA foi PINTADA.**
 *
 * ── O VÃO QUE ELE FECHA, MEDIDO ──────────────────────────────────────────────────────────────
 *
 * A suíte de e2e tinha **40 asserções** sobre `/symbol` e **nenhuma** olhava a forma da vela:
 * `grep -rn 'candle\|vela' frontend/e2e/*.ts` devolvia **1 linha**, e era um comentário
 * `[MEDIDO 2026-09-19, n=15 arquivos em frontend/e2e/]`. O painel de Preço publica
 * `data-price-candles` no DOM, e `price-pane-dom-contract.test.ts` o verifica — mas
 * **asserção de DOM não prova pixel**: o elemento passa em tudo e não existe na tela. Esta
 * lição já foi paga neste repositório (memória `assert-de-dom-nao-prova-pixel`), e o preço
 * anterior dela foi um defeito de wiring achado **em produção, a olho**, na fase `04` de
 * `pagina-de-grafico-s2`.
 *
 * ── OS TRÊS CRITÉRIOS DO PLANO, E QUAL TESTE PAGA CADA UM ────────────────────────────────────
 *
 * `docs/plans/SPEC-008-candle-real-e-eixo-unico/01_vela.md`, "DoD verificável":
 *
 *   - **`CA-2`** — "a vela tem faixa … **≥ 1** bucket com `high > low` … morde quando toda barra
 *     tem `high == low` … e morde também se `open == close` em 500 de 500". Pago em DOIS níveis
 *     pelo teste `CA-2`: no DADO (a API serve faixa) e no PIXEL (a tinta da vela tem extensão
 *     vertical, e o corpo/pavio saem onde os números da API dizem).
 *   - **`CA-3`** — "a leitura deixa de ser ausente": `data-fact="price_last_reading:…"` ≠
 *     `:absent`. Pago pelo teste `CA-3`, **condicionado ao que a API serve** para continuar
 *     total sobre os dois universos (ver abaixo).
 *   - ⛔ **`CA-4`, a ablação** — "removido o produtor de preço, o corpo e o pavio somem da tela
 *     — captura antes/depois, assert de posição". Pago pelo teste `CA-4`, com o **par
 *     morde/cala** que este repositório exige: ablar `klines_ohlc` apaga a tinta da vela
 *     (MORDE); ablar `sum_open_interest` — outra série, mesma página — deixa a tinta da vela
 *     **byte a byte no mesmo lugar** (CALA). Sem o segundo, "a tinta sumiu" seria
 *     indistinguível de "a página quebrou".
 *
 * ── ⛔ `[P-seed]`: ESTE ARQUIVO NÃO SEMEIA NADA ──────────────────────────────────────────────
 *
 * Nenhum `INSERT`, nenhum `psql`, nenhum `docker`. A ablação **não toca o banco**: ela põe um
 * **proxy HTTP de leitura** na frente da API (`GET` encaminhado verbatim) e reescreve, na
 * RESPOSTA, as linhas de UMA métrica para o estado de ausência que o próprio envelope já
 * carrega em `5.680` das `5.760` linhas. O Postgres compartilhado é o de PRODUÇÃO — dado sintético
 * de e2e já vazou para a tela real do owner, e a regra que saiu daquele episódio é literal:
 * nunca semear. Um proxy de leitura respeita isso por construção: ele não tem caminho de
 * escrita.
 *
 * ── OS DOIS UNIVERSOS, E POR QUE NENHUMA ASSERÇÃO AQUI É CONDICIONADA A UMA `env` ────────────
 *
 * Sob `make e2e` a API é sqlite efêmera e `/series-history` responde `500` (`ADR-034/D9`: sem
 * fallback sqlite para `md.series`) — universo FRACO, zero vela. Contra o deployment do owner
 * a API é Postgres — universo FORTE. O universo é decidido **perguntando à API quantas velas
 * ela serve**, nunca lendo uma variável de ambiente: variável aqui seria allowlist disfarçada
 * (`CLAUDE.md`), e qualquer um a desligaria sem mudar o que o deployment É. Os dois universos
 * têm asserção própria e o número medido vai para `facts.jsonl` em toda rodada.
 *
 * ── O QUE ESTE ARQUIVO **NÃO** PROVA, DECLARADO EM VEZ DE ESCONDIDO ──────────────────────────
 *
 * `DoD-1` pede **≥ 500 pontos não-nulos por chave**, `n=4` chaves. No momento em que ele foi
 * escrito a API servia **80** `[MEDIDO 2026-09-19T23:0xZ]`, com o backfill de 90 dias em voo.
 * Este arquivo **não** afirma `DoD-1`: ele publica `candles_full` toda rodada, e o relatório do
 * gate é quem confronta o número com o alvo. Um teste que passasse com 80 e se chamasse "500"
 * seria pior que nenhum.
 */

const SPEC = "15-vela-e-ablacao";
const SYMBOL_PATH = "/symbol";
const SYMBOL = "BTCUSDT";
const PRICE_PANE_TESTID = "price-pane";
const ABSENCE_FACT_SUFFIX = ":absent";

/** As DUAS tintas que **só** a série de velas usa neste `<canvas>`, lidas do módulo de tokens e
 * não transcritas: `directionUpFill`/`directionDownFill` chegam aqui por
 * `borderUpColor`/`borderDownColor` (= `wickUpColor`/`wickDownColor`), e o corpo de alta é
 * `HOLLOW_BODY_FILL` (transparente), então a borda é a tinta do corpo também.
 *
 * ⚠️ O NEUTRO DO DOJI (`dojiItemColors().color` = `provenanceWeak`) FICA DE FORA, e a omissão é
 * deliberada: é **a mesma cor** que a sub-eixo de volume usa para as barras
 * (`SymbolClient.tsx:909`, `color: colorTokens().provenanceWeak`), no MESMO `<canvas>` — contá-la
 * como tinta de vela mediria volume e chamaria de preço. O custo disso é real e está coberto:
 * uma tela em que TODA vela fosse doji mediria `0` de tinta, então o teste só exige tinta depois
 * de checar, na API, que existe ao menos uma vela com `open != close`. */
function candleInkColors(): readonly (readonly [number, number, number])[] {
  const style = candlestickSeriesColors();
  return [style.borderUpColor, style.borderDownColor].map((hex) => {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (m === null) throw new Error(`candleInkColors: ${hex} não é #rrggbb — os tokens mudaram de grafia`);
    return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] as const;
  });
}

// ── A API SOB TESTE ──────────────────────────────────────────────────────────────────────────

interface CatalogEntryWire {
  readonly key: SeriesKey;
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

/** Uma vela montada: os quatro `STOCK` do MESMO bucket. `assembleOhlcCandles` (`view-model.ts`)
 * exige os quatro, e esta reconstrução do lado do teste usa a mesma regra — bucket com 1..3
 * leituras é lacuna, não vela. */
interface AssembledCandle {
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
}

async function fetchWithOneRetry(url: string): Promise<Response> {
  try {
    return await fetch(url);
  } catch {
    return await fetch(url);
  }
}

async function fetchCatalogEntries(): Promise<readonly CatalogEntryWire[]> {
  const response = await fetchWithOneRetry(`${sentimentoApiBaseUrl()}/series-catalog`);
  if (!response.ok) throw new Error(`GET /series-catalog: HTTP ${response.status}`);
  return ((await response.json()) as { entries: readonly CatalogEntryWire[] }).entries;
}

function historyQuery(seriesKeyId: string, request: RenderedRequest): string {
  return new URLSearchParams({
    series_key_id: seriesKeyId,
    symbol: SYMBOL,
    interval: "1m",
    window_start_ms: String(request.windowStartMs),
    window_end_ms: String(request.windowEndMsInclusive),
    knowledge_time_ms: String(request.knowledgeTimeMs),
    bar_policy: "final_only",
  }).toString();
}

/** Mesmo tratamento de `08-symbol-dado-real.spec.ts`: o corpo é lido como TEXTO primeiro, porque
 * a API do universo fraco responde `Internal Server Error` e `response.json()` trocaria o status
 * — que é o que decide o universo — por um `SyntaxError`. */
async function fetchSeriesHistory(
  seriesKeyId: string,
  request: RenderedRequest,
): Promise<{ readonly status: number; readonly rows: readonly HistoryRow[] }> {
  const response = await fetchWithOneRetry(`${sentimentoApiBaseUrl()}/series-history?${historyQuery(seriesKeyId, request)}`);
  const raw = await response.text();
  let rows: readonly HistoryRow[];
  try {
    rows = (JSON.parse(raw) as { rows?: readonly HistoryRow[] }).rows ?? [];
  } catch {
    rows = [];
  }
  return { status: response.status, rows };
}

const OHLC_REDUCTIONS = ["OPEN", "HIGH", "LOW", "CLOSE"] as const;

/** As quatro chaves `klines_ohlc` do símbolo, remontadas em velas — a MESMA regra do painel. */
async function fetchAssembledCandles(request: RenderedRequest): Promise<{
  readonly status: number;
  readonly candles: readonly AssembledCandle[];
}> {
  const entries = await fetchCatalogEntries();
  const readings: Record<string, Map<number, number>> = {};
  let lastStatus = 0;
  for (const reduction of OHLC_REDUCTIONS) {
    const entry = entries.find(
      (candidate) =>
        candidate.key.metric === "klines_ohlc" &&
        candidate.key.instrumentId === SYMBOL &&
        candidate.key.reduction === reduction,
    );
    if (entry === undefined) {
      throw new Error(`o catálogo servido não tem klines_ohlc/${reduction} para ${SYMBOL} — RF-2 regrediu`);
    }
    const { status, rows } = await fetchSeriesHistory(computeSeriesKeyId(entry.key), request);
    lastStatus = status;
    const map = new Map<number, number>();
    for (const row of rows) if (row.value !== null) map.set(row.event_time, Number(row.value));
    readings[reduction] = map;
  }
  const candles: AssembledCandle[] = [];
  for (const [time, open] of readings.OPEN!) {
    const high = readings.HIGH!.get(time);
    const low = readings.LOW!.get(time);
    const close = readings.CLOSE!.get(time);
    if (high === undefined || low === undefined || close === undefined) continue;
    candles.push({ time, open, high, low, close });
  }
  candles.sort((a, b) => a.time - b.time);
  return { status: lastStatus, candles };
}

// ── O PIXEL ──────────────────────────────────────────────────────────────────────────────────

/** A geometria da tinta de vela no `<canvas>` do painel de Preço, em coordenadas do PRÓPRIO
 * canvas (não da página): uma coluna por `x` com tinta, com o topo e o fundo dela. Isso é o
 * suficiente para corpo, pavio e posição, e é estável sob deslocamento de layout dos painéis
 * vizinhos — que é exatamente o que a ablação da OUTRA série provoca. */
interface InkColumn {
  readonly x: number;
  readonly top: number;
  readonly bottom: number;
  readonly pixels: number;
}

interface InkMeasurement {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly columns: readonly InkColumn[];
  readonly inkPixels: number;
}

/** Roda DENTRO do browser: `getImageData` do canvas do painel de Preço. Mesma técnica de
 * `11-canvas-fundo.spec.ts` (o único portão que já lia pixel) — `lightweight-charts` pinta em
 * `<canvas>` 2D, opaco a qualquer asserção de DOM. */
async function measureCandleInk(page: Page): Promise<InkMeasurement> {
  const tolerance = 12;
  return page.evaluate(
    ({ colors, testid, tolerance: tol }) => {
      const pane = document.querySelector(`[data-testid="${testid}"]`);
      if (pane === null) throw new Error(`não há [data-testid="${testid}"] na página`);
      const canvas = Array.from(pane.querySelectorAll("canvas")).find((c) => c.width > 200 && c.height > 100);
      if (canvas === undefined) throw new Error("o painel de Preço não tem um canvas de gráfico com área");
      const width = canvas.width;
      const height = canvas.height;
      const data = canvas.getContext("2d")!.getImageData(0, 0, width, height).data;
      const columns = new Map<number, { top: number; bottom: number; pixels: number }>();
      let inkPixels = 0;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const at = (y * width + x) * 4;
          if (data[at + 3] === 0) continue;
          const r = data[at]!;
          const g = data[at + 1]!;
          const b = data[at + 2]!;
          const isInk = colors.some(
            (c) => Math.abs(r - c[0]!) <= tol && Math.abs(g - c[1]!) <= tol && Math.abs(b - c[2]!) <= tol,
          );
          if (!isInk) continue;
          inkPixels += 1;
          const column = columns.get(x) ?? { top: y, bottom: y, pixels: 0 };
          column.top = Math.min(column.top, y);
          column.bottom = Math.max(column.bottom, y);
          column.pixels += 1;
          columns.set(x, column);
        }
      }
      return {
        canvasWidth: width,
        canvasHeight: height,
        inkPixels,
        columns: [...columns.entries()].map(([x, c]) => ({ x, ...c })).sort((a, b) => a.x - b.x),
      };
    },
    { colors: candleInkColors().map((c) => [...c]), testid: PRICE_PANE_TESTID, tolerance },
  );
}

/** Espera o `<canvas>` existir E ter área — um canvas ANEXADO ainda não é um canvas PINTADO,
 * distinção que `11-canvas-fundo.spec.ts` já pagou. */
async function waitForPaintedChart(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll("canvas")).some((c) => c.width > 0 && c.height > 0),
    undefined,
    { timeout: 120_000 },
  );
  // Os painéis montam por `useEffect` e a série é `setData`-ada depois do primeiro frame.
  await page.waitForTimeout(2_000);
}

async function readRenderedRequest(page: Page): Promise<RenderedRequest> {
  const main = page.locator("main[data-window-start-ms]");
  await expect(main, "a página não declara o próprio request — build anterior a esta wave?").toHaveCount(1);
  const number = async (name: string): Promise<number> => {
    const raw = await main.getAttribute(name);
    if (raw === null) throw new Error(`a página parou de publicar ${name}`);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) throw new Error(`${name}=${JSON.stringify(raw)} não é um instante em ms`);
    return parsed;
  };
  return {
    windowStartMs: await number("data-window-start-ms"),
    windowEndMsInclusive: await number("data-window-end-ms-inclusive"),
    knowledgeTimeMs: await number("data-knowledge-time-ms"),
  };
}

/** Quantas velas o painel DIZ ter desenhado (`data-price-candles`), como número e nunca como
 * `Number(null)` — que é `0` e faria a comparação com a API passar sobre um DOM sem contrato
 * (`BLOCKER-3` da wave `03`). */
async function readDrawnCandlesAttribute(page: Page): Promise<number> {
  const raw = await page.locator(`[data-testid="${PRICE_PANE_TESTID}"]`).getAttribute("data-price-candles");
  expect(raw, "o painel de Preço parou de publicar `data-price-candles`").not.toBeNull();
  expect(raw ?? "", "`data-price-candles` tem de ser uma contagem em dígitos").toMatch(/^\d+$/);
  return Number(raw);
}

// ── ZOOM: o único jeito de separar CORPO de PAVIO neste eixo ──────────────────────────────────
//
// ⛔ O NÚMERO QUE OBRIGA O ZOOM, MEDIDO: a janela da rota tem `5.760` buckets de 1 min e o canvas
// do painel tem `1208 px` — `0,21 px por bucket`. Com `fitContent()` (`SymbolClient.tsx:460`) as
// 80 velas servidas hoje ocupam `43 colunas` de tinta, ~`0,54 px` por vela
// `[MEDIDO 2026-09-19T23:0xZ, canvas 1208x192, dpr=1]`. Nessa largura **corpo e pavio são a
// MESMA coluna**, e "o pavio ultrapassa o corpo" não é uma proposição que o pixel possa
// responder. Depois de `30` passos de roda aparecem `70` velas com corpo de `7 a 16` colunas,
// `49` delas com pixel FORA das arestas do corpo — o pavio
// `[MEDIDO na mesma rodada: `candle_groups_on_screen=70`, `groups_with_drawn_wick=49`]`.
//
// Esta é uma interação de UI com teto, não um laço de espera (`R9`): ela para no primeiro
// instante em que a largura pedida existe, e desiste depois de `MAX_ZOOM_STEPS`.

const ZOOM_STEP_DELTA = -200;
const MAX_ZOOM_STEPS = 160;
/** Passos de roda entre duas medições — medir a cada passo custaria 160 varreduras do canvas. */
const ZOOM_BURST = 5;
/** Quantas colunas o corpo da última vela precisa ter para que "o pavio ultrapassa o corpo"
 * deixe de ser uma proposição sobre a mesma coluna. `6` é folgado contra as `15` medidas em
 * `40` passos de roda `[MEDIDO 2026-09-19]`. */
const MIN_BODY_COLUMNS = 6;
/** Quantas velas o alinhamento precisa ter para que casar com a API deixe de ser coincidência.
 * Com `3`, são `12` arestas presas a uma escala derivada dos extremos do próprio conjunto. */
const MIN_ALIGNED_GROUPS = 3;
/** Teto do trecho alinhado. Mais velas é prova mais forte, mas um trecho longo tem mais chance
 * de conter uma lacuna que o espaçamento não delate. */
const MAX_ALIGNED_GROUPS = 12;
/** Folga da asserção afim. A biblioteca arredonda cada aresta para a grade de pixels e a borda
 * do corpo tem `1 px` de espessura própria, então `3` é geometria e não tolerância a erro —
 * contra `0,54 px` medidos sobre `12` velas, isto é, `48` arestas `[MEDIDO 2026-09-19]`. */
const MAX_ALIGNMENT_ERROR_PX = 3;
/** Quantas vezes a tolerância vale a mutação do falsificador. `3x` em PIXELS, convertido para
 * USDT pela escala MEDIDA na própria rodada — um literal em USDT ficaria abaixo da tolerância
 * assim que o zoom mudasse, e foi o que aconteceu `[MEDIDO 2026-09-19: 5 USDT = 1,9 px < 3 px,
 * e o falsificador reprovou a si mesmo]`. */
const MUTATION_SCALE = 3;

/** Uma vela reconhecida no canvas: o vão de `x` do CORPO (as colunas que compartilham as duas
 * arestas) e as quatro coordenadas que a biblioteca desenhou. `wickTop`/`wickBottom` saem de
 * TODA coluna dentro do vão — dentro do corpo de uma vela, a única coisa que sai das arestas é
 * o pavio. */
interface CandleGroup {
  readonly xLeft: number;
  readonly xRight: number;
  readonly bodyTop: number;
  readonly bodyBottom: number;
  readonly wickTop: number;
  readonly wickBottom: number;
}

/**
 * Todas as velas reconhecíveis no canvas ampliado, da esquerda para a direita.
 *
 * ⛔ POR QUE O CORPO É PROCURADO EM DOIS PEDAÇOS: o pavio é UMA coluna no CENTRO da vela e ela
 * **parte o corpo em dois trechos** de colunas idênticas. Uma versão anterior pegou só o trecho
 * da direita e concluiu "esta vela não tem pavio" com o pavio a 8 colunas de distância
 * `[MEDIDO 2026-09-19: corpo "61..70", pavio idêntico ao corpo]`.
 *
 * ⛔ E POR QUE "O AGLOMERADO CONTÍGUO MAIS À DIREITA" NÃO SERVE: no zoom padrão as ~70 velas
 * ocupam `38` colunas CONTÍGUAS (`0,21 px` por bucket), então o aglomerado é a janela inteira e
 * o topo/fundo dele são os da janela, não os de uma vela `[MEDIDO 2026-09-19: grupo de 31
 * colunas, corpo "122..133", contra `open/close` de `81033,2/81021,8`]`.
 */
function extractCandleGroups(columns: readonly InkColumn[], minBodyColumns: number): readonly CandleGroup[] {
  // 1. Trechos maximais de colunas consecutivas com as MESMAS duas arestas.
  const runs: InkColumn[][] = [];
  for (const column of columns) {
    const current = runs.at(-1);
    const head = current?.[0];
    if (
      current !== undefined &&
      head !== undefined &&
      column.x === current.at(-1)!.x + 1 &&
      column.top === head.top &&
      column.bottom === head.bottom
    ) {
      current.push(column);
    } else {
      runs.push([column]);
    }
  }
  // 2. Trechos com as mesmas arestas separados por até 2 colunas são as duas METADES do mesmo
  //    corpo, partido pelo pavio.
  const merged: InkColumn[][] = [];
  for (const run of runs) {
    if (run.length < 2) continue;
    const previous = merged.at(-1);
    if (
      previous !== undefined &&
      previous[0]!.top === run[0]!.top &&
      previous[0]!.bottom === run[0]!.bottom &&
      run[0]!.x - previous.at(-1)!.x <= 3
    ) {
      previous.push(...run);
    } else {
      merged.push([...run]);
    }
  }
  return merged
    .filter((body) => body.length >= minBodyColumns)
    .map((body) => {
      const xLeft = body[0]!.x;
      const xRight = body.at(-1)!.x;
      const spanned = columns.filter((c) => c.x >= xLeft && c.x <= xRight);
      return {
        xLeft,
        xRight,
        bodyTop: body[0]!.top,
        bodyBottom: body[0]!.bottom,
        wickTop: Math.min(...spanned.map((c) => c.top)),
        wickBottom: Math.max(...spanned.map((c) => c.bottom)),
      };
    });
}

/** ⛔ DESCARTA OS GRUPOS QUE SÃO MAIS DE UMA VELA, e sem isto `bestAlignmentError` mente.
 *
 * `extractCandleGroups` funde trechos que compartilham as DUAS arestas — o que é certo para o
 * corpo partido pelo pavio e ERRADO para velas VIZINHAS que fecharam no mesmo par de preços.
 * Com pouca vela na tela isso não acontece; com muita, acontece o tempo todo: medi um corpo de
 * **25 colunas** onde o passo entre velas é **~8,6 px** — três buckets num "grupo" só
 * `[MEDIDO 2026-09-20: groups_px[2]="39-63", passo mediano 8,6 px, n=113 grupos, 1.515 velas]`.
 * `bestAlignmentError` casa **um grupo com um bucket**; um grupo que vale três desloca todo o
 * resto e o erro sai em `13,77 px` contra uma tolerância de `3` — **do instrumento, não da
 * tela**, exatamente como já tinha acontecido com a penúltima vela (ver o cabeçalho daquela
 * função).
 *
 * O corte é pela largura MODAL, não por um literal: a vela larga é a exceção e a mediana é dela
 * mesma. */
function dropMergedGroups(groups: readonly CandleGroup[]): readonly CandleGroup[] {
  if (groups.length < 3) return groups;
  const widths = groups.map((g) => g.xRight - g.xLeft + 1).sort((a, b) => a - b);
  const median = widths[Math.floor(widths.length / 2)]!;
  return groups.filter((g) => g.xRight - g.xLeft + 1 <= median * 1.5);
}

/** A maior sequência de velas UNIFORMEMENTE espaçadas no eixo — isto é, buckets CONSECUTIVOS.
 *
 * ⛔ POR QUE ELA É NECESSÁRIA: as velas servidas hoje têm LACUNAS (buckets sem as quatro
 * leituras não desenham nada), então as `70` velas na tela não são `70` minutos seguidos — há
 * saltos de `21 px` onde o espaçamento normal é `8,6 px` `[MEDIDO 2026-09-19]`. Alinhar a lista
 * inteira contra minutos consecutivos comparava pixel de um instante com número de outro, e o
 * erro saía em `77 px` — do instrumento, não da tela. */
function longestUniformRun(groups: readonly CandleGroup[], maxLength: number): readonly CandleGroup[] {
  if (groups.length < 2) return groups;
  const center = (g: CandleGroup): number => (g.xLeft + g.xRight) / 2;
  const gaps = groups.slice(1).map((g, i) => center(g) - center(groups[i]!));
  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  let best: CandleGroup[] = [];
  let run: CandleGroup[] = [groups[0]!];
  for (const [i, gap] of gaps.entries()) {
    if (Math.abs(gap - median) <= 1.5 && run.length < maxLength) {
      run.push(groups[i + 1]!);
    } else {
      if (run.length > best.length) best = run;
      run = [groups[i + 1]!];
    }
  }
  if (run.length > best.length) best = run;
  return best;
}

/** O erro máximo, em pixels, entre as 4 arestas que a tela desenhou para `m` velas e as 4
 * leituras que a API serve para `m` velas CONSECUTIVAS — sobre o melhor alinhamento possível.
 *
 * ⛔ POR QUE ALINHAR EM VEZ DE ASSUMIR "a de mais à direita é a última": ela NÃO é. Com zoom e
 * arrasto a última vela sai do canvas, e a versão anterior deste teste comparou os pixels da
 * penúltima com os números da última — e o erro que apareceu era do instrumento
 * `[MEDIDO 2026-09-19: grupo mais à direita = penúltima vela; px/unidade 1,55 casava com a
 * penúltima e não com a última]`. Alinhar `m >= 3` velas de uma vez é uma prova MAIS forte que a
 * de uma só: a escala é derivada dos extremos do conjunto e as `4m` arestas têm de cair todas
 * no lugar.
 */
function bestAlignmentError(
  groups: readonly CandleGroup[],
  candles: readonly AssembledCandle[],
): {
  readonly maxErrorPx: number;
  readonly firstCandleTime: number | null;
  readonly pxPerPrice: number;
  readonly worstEdge: string;
} {
  if (groups.length === 0 || candles.length < groups.length) {
    return { maxErrorPx: Number.POSITIVE_INFINITY, firstCandleTime: null, pxPerPrice: 0, worstEdge: "n/a" };
  }
  const yTop = Math.min(...groups.map((g) => g.wickTop));
  const yBottom = Math.max(...groups.map((g) => g.wickBottom));
  let best = {
    maxErrorPx: Number.POSITIVE_INFINITY,
    firstCandleTime: null as number | null,
    pxPerPrice: 0,
    worstEdge: "n/a",
  };
  for (let offset = 0; offset + groups.length <= candles.length; offset += 1) {
    const window = candles.slice(offset, offset + groups.length);
    // Velas desenhadas lado a lado são buckets CONSECUTIVOS: um bucket sem leitura é lacuna e
    // não desenha nada, então um alinhamento que pule tempo é impossível por construção.
    const consecutive = window.every((c, i) => i === 0 || c.time - window[i - 1]!.time === 60_000);
    if (!consecutive) continue;
    const priceHigh = Math.max(...window.map((c) => c.high));
    const priceLow = Math.min(...window.map((c) => c.low));
    if (priceHigh === priceLow) continue;
    const pxPerPrice = (yBottom - yTop) / (priceHigh - priceLow);
    const y = (price: number): number => yTop + (priceHigh - price) * pxPerPrice;
    let maxError = 0;
    // ⛔ QUAL ARESTA erra, e não só QUANTO: "13,77 px" não diz se a tela encurtou o PAVIO ou
    // deslocou o CORPO, e os dois são reparos opostos. O rótulo sai junto com o número.
    let worstEdge = "n/a";
    for (const [i, group] of groups.entries()) {
      const candle = window[i]!;
      const edges: readonly (readonly [string, number])[] = [
        ["wickTop/high", Math.abs(group.wickTop - y(candle.high))],
        ["wickBottom/low", Math.abs(group.wickBottom - y(candle.low))],
        ["bodyTop/max(open,close)", Math.abs(group.bodyTop - y(Math.max(candle.open, candle.close)))],
        ["bodyBottom/min(open,close)", Math.abs(group.bodyBottom - y(Math.min(candle.open, candle.close)))],
      ];
      for (const [label, error] of edges) {
        if (error > maxError) {
          maxError = error;
          worstEdge = `${label}@${String(i)}`;
        }
      }
    }
    if (maxError < best.maxErrorPx) {
      best = { maxErrorPx: maxError, firstCandleTime: window[0]!.time, pxPerPrice, worstEdge };
    }
  }
  return best;
}

/** Amplia até haver ao menos `minGroups` velas com corpo de `MIN_BODY_COLUMNS` colunas. Interação
 * de UI com teto, não laço de espera (`R9`): para no primeiro instante em que a largura existe e
 * desiste em `MAX_ZOOM_STEPS`. */
async function zoomUntilCandlesAreWide(
  page: Page,
  minGroups: number,
): Promise<{ readonly measurement: InkMeasurement; readonly steps: number }> {
  const box = await page.locator(`[data-testid="${PRICE_PANE_TESTID}"] canvas`).first().boundingBox();
  if (box === null) throw new Error("o canvas do painel de Preço não tem caixa — nada foi montado");
  const midY = box.y + box.height / 2;
  let measurement = await measureCandleInk(page);
  let steps = 0;
  // ⛔ O CURSOR FICA SOBRE A TINTA: a roda da biblioteca mantém fixo o ponto sob o cursor e
  // espalha o resto, então ancorar longe das velas as empurra para fora do canvas
  // `[MEDIDO 2026-09-19: ancorado a 20 px da borda, 120 passos, corpo ainda com 4 colunas]`.
  // ⛔ A CONDIÇÃO DE PARADA É O QUE O ASSERT PRECISA, NÃO UM PRIMO DELE. Ela pedia `minGroups`
  // velas LARGAS; o assert que vem depois pede `minGroups` velas largas **em buckets
  // CONSECUTIVOS** (`longestUniformRun`). As duas coincidem quando há pouca vela na tela e
  // divergem quando há muita — foi o que aconteceu: com `1.515` velas servidas o laço parou em
  // `20` passos com `8` grupos dos quais só `2` eram consecutivos, e o `CA-2` reprovou por uma
  // PRÉ-CONDIÇÃO que o próprio laço deveria ter estabelecido
  // `[MEDIDO 2026-09-20: candle_groups_on_screen=8, aligned_groups=2, n=1515 velas]`. Um teste
  // que passa com `80` velas e reprova com `1.515` estava medindo a densidade do dado, não a
  // tela.
  while (
    steps < MAX_ZOOM_STEPS &&
    longestUniformRun(dropMergedGroups(extractCandleGroups(measurement.columns, MIN_BODY_COLUMNS)), MAX_ALIGNED_GROUPS)
      .length < minGroups
  ) {
    const anchorX =
      measurement.columns.length === 0
        ? box.width / 2
        : (measurement.columns.at(-1)!.x * box.width) / measurement.canvasWidth;
    await page.mouse.move(box.x + Math.min(Math.max(anchorX, 2), box.width - 2), midY);
    for (let i = 0; i < ZOOM_BURST; i += 1) await page.mouse.wheel(0, ZOOM_STEP_DELTA);
    steps += ZOOM_BURST;
    await page.waitForTimeout(250);
    measurement = await measureCandleInk(page);
  }
  await page.waitForTimeout(500);
  measurement = await measureCandleInk(page);
  return { measurement, steps };
}

// ── O PROXY DE ABLAÇÃO — leitura encaminhada, UMA métrica apagada na volta ────────────────────

interface AblationProxy {
  readonly url: string;
  ablate(metric: string | null): void;
  readonly rewrittenResponses: () => number;
  close(): Promise<void>;
}

/**
 * Um proxy `GET` na frente da API de leitura. Encaminha caminho e query **verbatim**; quando a
 * métrica ablada está armada, reescreve as linhas de `/series-history` daquela métrica para o
 * estado de AUSÊNCIA — `value: null`, `available_at: null`, `absence` copiada de uma linha
 * ausente do MESMO envelope.
 *
 * ⛔ POR QUE COPIAR O TOKEN DE AUSÊNCIA EM VEZ DE INVENTAR UM: `CA-F1-5`
 * (`series-history-client.ts:76`) exige exatamente um de `value`/`absence` nulo, e o vocabulário
 * de `absence` é do backend. Um literal aqui seria uma segunda verdade sobre o contrato, e o dia
 * em que ele divergisse esta ablação passaria a medir o VALIDADOR em vez da tela.
 *
 * ⛔ E POR QUE A ABLAÇÃO É AQUI E NÃO NO BANCO: `[P-seed]`. Este processo não tem caminho de
 * escrita — ele lê `GET` e devolve JSON. O Postgres de produção fica intocado, o que é a única
 * forma aceitável de ablar em cima do deployment do owner.
 */
async function startAblationProxy(): Promise<AblationProxy> {
  const upstream = new URL(sentimentoApiBaseUrl()).origin;
  const entries = await fetchCatalogEntries();
  const metricById = new Map<string, string>();
  for (const entry of entries) metricById.set(computeSeriesKeyId(entry.key), entry.key.metric);

  let ablated: string | null = null;
  let rewritten = 0;

  const server = http.createServer((request, response) => {
    void (async () => {
      const incoming = new URL(request.url ?? "/", "http://placeholder");
      const target = `${upstream}${incoming.pathname}${incoming.search}`;
      let upstreamResponse: Response;
      try {
        upstreamResponse = await fetch(target);
      } catch (cause) {
        response.writeHead(502, { "content-type": "text/plain" });
        response.end(`ablation proxy: upstream unreachable (${String(cause)})`);
        return;
      }
      const body = await upstreamResponse.text();
      const requestedId = incoming.searchParams.get("series_key_id");
      const isAblated =
        ablated !== null &&
        incoming.pathname.endsWith("/series-history") &&
        requestedId !== null &&
        metricById.get(requestedId) === ablated;
      if (!isAblated) {
        response.writeHead(upstreamResponse.status, { "content-type": "application/json" });
        response.end(body);
        return;
      }
      let rewrittenBody = body;
      try {
        const envelope = JSON.parse(body) as { rows?: { value?: unknown; absence?: unknown }[] };
        const rows = envelope.rows ?? [];
        const borrowed = rows.find((row) => row.value === null && typeof row.absence === "string")?.absence;
        if (typeof borrowed !== "string") {
          throw new Error(
            "ablation proxy: nenhuma linha ausente no envelope para tomar emprestado o token de `absence` — " +
              "sem ele a ablação teria de inventar vocabulário de contrato, e isso é proibido aqui",
          );
        }
        envelope.rows = rows.map((row) => ({ ...row, value: null, available_at: null, absence: borrowed }));
        rewrittenBody = JSON.stringify(envelope);
        rewritten += 1;
      } catch (cause) {
        response.writeHead(500, { "content-type": "text/plain" });
        response.end(`ablation proxy: ${String(cause)}`);
        return;
      }
      response.writeHead(upstreamResponse.status, { "content-type": "application/json" });
      response.end(rewrittenBody);
    })();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("ablation proxy: sem porta");
  return {
    url: `http://127.0.0.1:${address.port}`,
    ablate: (metric) => {
      ablated = metric;
    },
    rewrittenResponses: () => rewritten,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

// ── OS TESTES ────────────────────────────────────────────────────────────────────────────────

test(`CA-3: /symbol declara a leitura de preço, e ela é ausente só quando a API é (${SPEC})`, async ({ page }) => {
  const response = await page.goto(SYMBOL_PATH, { waitUntil: "load" });
  fact(SPEC, "http_status", response?.status() ?? null);
  expect(response?.status()).toBe(200);
  const request = await readRenderedRequest(page);
  const { status, candles } = await fetchAssembledCandles(request);
  fact(SPEC, "series_history_status", status);
  fact(SPEC, "candles_full", candles.length);

  const readingFact = page.locator('[data-fact^="price_last_reading:"]');
  await expect(readingFact, "o painel de Preço parou de publicar `price_last_reading`").toHaveCount(1);
  const published = await readingFact.getAttribute("data-fact");
  fact(SPEC, "price_last_reading_fact", published);

  // TOTAL SOBRE OS DOIS UNIVERSOS, e a condição sai da API e não de uma `env`: a leitura só pode
  // deixar de ser ausente se existir uma vela no último instante da janela que a própria página
  // declarou. Sem esta condição o teste reprovaria o universo fraco — onde `:absent` é a resposta
  // CORRETA — e verde ali seria verde sobre a ausência do dado, não sobre a presença dele.
  const lastCandle = candles.at(-1);
  const servesLastInstant = lastCandle !== undefined && lastCandle.time === request.windowEndMsInclusive;
  fact(SPEC, "api_serves_last_instant", servesLastInstant);
  if (servesLastInstant) {
    expect(
      published,
      "a API serve vela no último instante da janela e a tela ainda diz `absent` — é o defeito de wiring de `CA-3`",
    ).not.toContain(ABSENCE_FACT_SUFFIX);
  } else if (candles.length === 0) {
    expect(published, "a API não serve vela nenhuma e a tela afirma uma leitura — número fabricado").toContain(
      ABSENCE_FACT_SUFFIX,
    );
  }

  // O NÚMERO NA TELA É O NÚMERO DA API — exato, porque os dois lados saíram da MESMA janela
  // declarada pela página (`knowledge_time` fixa a resposta), então divergência é wiring.
  const drawn = await readDrawnCandlesAttribute(page);
  fact(SPEC, "dom_price_candles", drawn);
  expect(drawn, "`data-price-candles` diverge das velas que a API serve para a janela da própria página").toBe(
    candles.length,
  );
});

test(`CA-2: a vela tem faixa — no dado E no pixel, com o pavio onde a API diz (${SPEC})`, async ({ page }) => {
  await page.goto(SYMBOL_PATH, { waitUntil: "load" });
  const request = await readRenderedRequest(page);
  const { candles } = await fetchAssembledCandles(request);
  const withRange = candles.filter((c) => c.high > c.low).length;
  const withBody = candles.filter((c) => c.open !== c.close).length;
  fact(SPEC, "candles_full", candles.length);
  fact(SPEC, "candles_with_range_high_gt_low", withRange);
  fact(SPEC, "candles_with_body_open_ne_close", withBody);
  fact(SPEC, "dod1_target_points_per_key", 500);

  await waitForPaintedChart(page);
  const flat = await measureCandleInk(page);
  fact(SPEC, "ink_pixels_default_zoom", flat.inkPixels);
  fact(SPEC, "ink_columns_default_zoom", flat.columns.length);
  fact(SPEC, "canvas", `${flat.canvasWidth}x${flat.canvasHeight}`);

  // ── UNIVERSO FRACO: a API não serve vela ⇒ a tela não pode ter pintado uma ────────────────
  //
  // Isto é a metade CALA do par, e não é decoração: é a asserção que distingue "não desenhou
  // porque não há dado" de "não desenhou porque quebrou". Ela reprova se a página inventar uma
  // vela sobre um backend que não respondeu.
  if (candles.length === 0) {
    expect(await readDrawnCandlesAttribute(page)).toBe(0);
    expect(flat.inkPixels, "a API não serve vela e o canvas tem tinta de vela — pixel fabricado").toBe(0);
    await shot(page, `${SPEC}-universo-fraco`);
    test.skip(true, "universo FRACO: a API sob teste serve 0 velas — CA-2 forte e CA-4 não são mensuráveis aqui");
    return;
  }

  // ── `CA-2` NO DADO ────────────────────────────────────────────────────────────────────────
  expect(
    withRange,
    "TODA barra tem `high == low` — é a vela degenerada de novo, agora com dado real por trás (`RN-2`)",
  ).toBeGreaterThanOrEqual(1);
  expect(
    withBody,
    "`open == close` em TODAS as velas — é o colapso dos quatro STOCK num só que `ADR-040/D2` nomeia",
  ).toBeGreaterThanOrEqual(1);

  // ── `CA-2` NO PIXEL, parte 1: existe tinta, e ela tem EXTENSÃO VERTICAL ────────────────────
  expect(flat.inkPixels, "a API serve vela e o canvas não tem um pixel da tinta da vela").toBeGreaterThan(0);
  const bboxTop = Math.min(...flat.columns.map((c) => c.top));
  const bboxBottom = Math.max(...flat.columns.map((c) => c.bottom));
  const bboxHeight = bboxBottom - bboxTop + 1;
  fact(SPEC, "ink_bbox_height_px", bboxHeight);
  fact(SPEC, "ink_bbox_height_share", Number((bboxHeight / flat.canvasHeight).toFixed(3)));
  // A escala do painel autoescala para a faixa do dado dentro da banda da série (as margens
  // publicadas da biblioteca deixam ~70% da altura). Uma tela em que toda vela fosse um ponto
  // colapsaria isso para poucos pixels — que é o MORDE desta asserção
  // `[MEDIDO 2026-09-19: 129/192 px = 67%, n=60 velas]`.
  expect(bboxHeight / flat.canvasHeight, "a tinta da vela é uma linha achatada — a faixa não chegou ao eixo").toBeGreaterThan(
    0.4,
  );

  // ── `CA-2` NO PIXEL, parte 2: POSIÇÃO — a vela mais nova no lugar mais novo ────────────────
  const lastCandle = candles.at(-1)!;
  if (lastCandle.time === request.windowEndMsInclusive) {
    const xMax = Math.max(...flat.columns.map((c) => c.x));
    fact(SPEC, "ink_x_max", xMax);
    fact(SPEC, "ink_x_gap_to_right_edge_px", flat.canvasWidth - 1 - xMax);
    // `fitContent()` ancora a última barra na borda direita; a vela do último instante tem de
    // sair LÁ. Folga de 12 px sobre `1208` (1%) contra `1 px` medido — o bug de wiring que a
    // fase `04` de `pagina-de-grafico-s2` achou a olho em produção era exatamente uma série
    // desenhada no lugar errado do eixo `[MEDIDO 2026-09-19: xMax=1207, canvas 1208]`.
    expect(flat.canvasWidth - 1 - xMax, "a vela do último instante não está na borda direita do eixo").toBeLessThanOrEqual(12);
  }

  // ── `CA-2` NO PIXEL, parte 3: CORPO e PAVIO, com os números da API PREVENDO os pixels ─────
  //
  // ⛔ O ZOOM É OBRIGATÓRIO, E O NÚMERO QUE O OBRIGA ESTÁ MEDIDO: a janela da rota tem `5.760`
  // buckets de 1 min num canvas de `1208 px` — `0,21 px por bucket`. Com `fitContent()`
  // (`SymbolClient.tsx:460`) as ~70 velas servidas hoje ocupam `38` colunas de tinta, `~0,93 px`
  // por vela `[MEDIDO 2026-09-19, canvas 1208x192, dpr=1]`. Nessa largura **corpo e pavio são a
  // MESMA coluna**, e "o pavio ultrapassa o corpo" não é proposição que o pixel possa responder.
  const { measurement: zoomed, steps } = await zoomUntilCandlesAreWide(page, MIN_ALIGNED_GROUPS);
  const groups = extractCandleGroups(zoomed.columns, MIN_BODY_COLUMNS);
  fact(SPEC, "zoom_steps", steps);
  fact(SPEC, "candle_groups_on_screen", groups.length);
  await shot(page, `${SPEC}-vela-ampliada`);

  expect(
    groups.length,
    "nem com o zoom no teto apareceram velas largas o bastante para separar corpo de pavio — " +
      "sem isso `CA-2` fica só no dado, e o relatório do gate tem de dizer isso",
  ).toBeGreaterThanOrEqual(MIN_ALIGNED_GROUPS);

  // O PAVIO EXISTE na tela: ao menos uma das velas visíveis tem pixel fora das arestas do corpo.
  // É a metade "morde" de `CA-2` no pixel — a vela degenerada (`high == low`) não produz nenhum.
  const withDrawnWick = groups.filter((g) => g.wickTop < g.bodyTop || g.wickBottom > g.bodyBottom);
  fact(SPEC, "groups_with_drawn_wick", withDrawnWick.length);
  fact(
    SPEC,
    "groups_px",
    groups.map((g) => `${g.xLeft}-${g.xRight}:corpo ${g.bodyTop}..${g.bodyBottom}:pavio ${g.wickTop}..${g.wickBottom}`),
  );
  expect(
    withDrawnWick.length,
    "nenhuma vela na tela tem um pixel fora do corpo — não há pavio desenhado, só retângulo",
  ).toBeGreaterThanOrEqual(1);

  // ⛔ A ASSERÇÃO QUE LIGA NÚMERO A PIXEL, e é a que morde um `close` desenhado sozinho ou a
  // degenerada com dado real por trás: a escala de preço é afim, então uma escala derivada dos
  // EXTREMOS do conjunto de velas visíveis tem de prever, dentro de poucos pixels, as `4 x m`
  // arestas que a biblioteca desenhou — `high`, `low`, e as duas do corpo (`open`/`close`).
  // Nenhum alinhamento é assumido: o teste procura o deslocamento que melhor casa e é o ERRO
  // desse melhor caso que a asserção julga.
  const aligned = longestUniformRun(dropMergedGroups(groups), MAX_ALIGNED_GROUPS);
  fact(SPEC, "aligned_groups", aligned.length);
  expect(
    aligned.length,
    "não há três velas em buckets CONSECUTIVOS na tela — sem isso o alinhamento com a API não é ancorável",
  ).toBeGreaterThanOrEqual(MIN_ALIGNED_GROUPS);
  const alignment = bestAlignmentError(aligned, candles);
  fact(SPEC, "alignment_max_error_px", Number(alignment.maxErrorPx.toFixed(2)));
  fact(SPEC, "alignment_first_candle_time", alignment.firstCandleTime);
  fact(SPEC, "alignment_worst_edge", alignment.worstEdge);
  fact(SPEC, "alignment_px_per_price", Number(alignment.pxPerPrice.toFixed(4)));
  fact(
    SPEC,
    "aligned_groups_px",
    aligned.map((g) => `${g.xLeft}-${g.xRight}:corpo ${g.bodyTop}..${g.bodyBottom}:pavio ${g.wickTop}..${g.wickBottom}`),
  );
  // `3 px`: a biblioteca arredonda cada aresta para a grade de pixels e a borda do corpo tem
  // `1 px` de espessura própria, então `2 px` de folga já é geometria e não tolerância a erro.
  expect(
    alignment.maxErrorPx,
    "as arestas desenhadas não são as quatro leituras da API — a tela está desenhando outra coisa",
  ).toBeLessThanOrEqual(MAX_ALIGNMENT_ERROR_PX);

  // ⛔ O FALSIFICADOR DO PRÓPRIO INSTRUMENTO — verde não prova nada até uma mutação reprovar.
  // A asserção acima é um `<=` sobre um número calculado aqui dentro; se o cálculo fosse
  // degenerado (uma escala que absorve qualquer coisa, um alinhamento que sempre acha um
  // encaixe), ela ficaria verde sobre qualquer tela. A mutação desloca AS DUAS arestas do corpo
  // de todas as velas em `BODY_MUTATION_USDT`, deixando `high`/`low` — e portanto a escala —
  // intactos, e exige que o mesmo cálculo REPROVE.
  const mutationUsdt = (MUTATION_SCALE * MAX_ALIGNMENT_ERROR_PX) / alignment.pxPerPrice;
  fact(SPEC, "alignment_px_per_usdt", Number(alignment.pxPerPrice.toFixed(3)));
  fact(SPEC, "mutation_usdt", Number(mutationUsdt.toFixed(2)));
  const mutatedCandles = candles.map((c) => ({
    ...c,
    open: c.open - mutationUsdt,
    close: c.close - mutationUsdt,
  }));
  const mutatedError = bestAlignmentError(aligned, mutatedCandles).maxErrorPx;
  fact(SPEC, "mutated_alignment_max_error_px", Number(mutatedError.toFixed(2)));
  expect(
    mutatedError,
    "o alinhamento aceitou um corpo deslocado — o instrumento não mede nada, e o verde acima é vazio",
  ).toBeGreaterThan(MAX_ALIGNMENT_ERROR_PX);
});

test(`CA-4: ablação de P1 — sem o produtor de preço, corpo e pavio somem (${SPEC})`, async ({ page }) => {
  // O universo é decidido pela API, antes de subir processo nenhum.
  await page.goto(SYMBOL_PATH, { waitUntil: "load" });
  const probeRequest = await readRenderedRequest(page);
  const probe = await fetchAssembledCandles(probeRequest);
  fact(SPEC, "ablation_candles_available", probe.candles.length);
  test.skip(
    probe.candles.length === 0,
    "universo FRACO: a API sob teste serve 0 velas — não há produtor de preço para ablar",
  );

  const proxy = await startAblationProxy();
  let instance: NextInstanceHandle | null = null;
  try {
    // ⛔ A instância secundária existe porque `/symbol` é Server Component: o `fetch` acontece no
    // processo do Next, nunca no browser, então `page.route()` NÃO alcança a chamada que precisa
    // ser ablada. `INGEST_HEALTH_API_BASE_URL` é lida de `process.env` a cada chamada (jamais
    // inlinada no build), que é o que torna este redirecionamento possível sem rebuild.
    instance = await startSecondaryNextInstance({ INGEST_HEALTH_API_BASE_URL: proxy.url });

    const load = async (): Promise<{ ink: InkMeasurement; drawn: number; request: RenderedRequest }> => {
      await page.goto(`${instance!.baseUrl}${SYMBOL_PATH}`, { waitUntil: "load" });
      await waitForPaintedChart(page);
      return {
        ink: await measureCandleInk(page),
        drawn: await readDrawnCandlesAttribute(page),
        request: await readRenderedRequest(page),
      };
    };

    // ── ANTES ─────────────────────────────────────────────────────────────────────────────
    proxy.ablate(null);
    const before = await load();
    await shot(page, `${SPEC}-1-antes`);
    fact(SPEC, "ablation_before_ink_pixels", before.ink.inkPixels);
    fact(SPEC, "ablation_before_ink_columns", before.ink.columns.length);
    fact(SPEC, "ablation_before_drawn_candles", before.drawn);
    expect(
      before.ink.inkPixels,
      "o controle da ablação já sai sem tinta de vela — sem isso não há o que ablar, e um " +
        "'sumiu' medido sobre o nada não prova nada",
    ).toBeGreaterThan(0);

    // ── DEPOIS: o produtor de preço REMOVIDO (MORDE) ──────────────────────────────────────
    proxy.ablate("klines_ohlc");
    const ablated = await load();
    await shot(page, `${SPEC}-2-depois-sem-preco`);
    fact(SPEC, "ablation_after_ink_pixels", ablated.ink.inkPixels);
    fact(SPEC, "ablation_after_drawn_candles", ablated.drawn);
    fact(SPEC, "ablation_rewritten_responses", proxy.rewrittenResponses());
    expect(proxy.rewrittenResponses(), "o proxy não chegou a reescrever resposta nenhuma — a ablação não aconteceu").toBe(
      OHLC_REDUCTIONS.length,
    );
    expect(ablated.drawn, "sem o produtor de preço o painel ainda diz ter desenhado velas").toBe(0);
    // ⛔ ASSERÇÃO DE POSIÇÃO: nenhuma das colunas que carregavam a vela pode ter sobrado. Pixel
    // que sobrevive à ablação estava desenhando outra coisa.
    const survivors = ablated.ink.columns.filter((c) => before.ink.columns.some((b) => b.x === c.x));
    fact(SPEC, "ablation_surviving_columns", survivors.map((c) => c.x));
    expect(
      survivors.map((c) => c.x),
      "sobrou tinta de vela exatamente onde ela estava — esse pixel não vinha do produtor de preço",
    ).toEqual([]);
    expect(ablated.ink.inkPixels, "removido o produtor de preço ainda há tinta de vela no canvas").toBe(0);

    // ── PLACEBO: outra série ablada, a vela INTACTA (CALA) ────────────────────────────────
    //
    // Sem esta metade, "a tinta sumiu" seria indistinguível de "a página parou de renderizar".
    // Ablar `sum_open_interest` mexe no painel de OI e não pode mover um pixel do de Preço.
    proxy.ablate("sum_open_interest");
    const placebo = await load();
    await shot(page, `${SPEC}-3-placebo-sem-oi`);
    fact(SPEC, "placebo_ink_pixels", placebo.ink.inkPixels);
    fact(SPEC, "placebo_drawn_candles", placebo.drawn);
    expect(placebo.ink.inkPixels, "ablar OUTRA série apagou a vela — a medição não é específica do preço").toBeGreaterThan(
      0,
    );
    expect(placebo.drawn, "ablar OUTRA série mudou a contagem de velas do painel de Preço").toBe(before.drawn);

    // A identidade de POSIÇÃO só é exigível quando as duas renderizações caíram na MESMA janela:
    // a rota ancora a janela no relógio do servidor, então duas cargas em minutos diferentes
    // desenham instantes diferentes — e reprovar por isso mediria o relógio, não a tela.
    const sameWindow = placebo.request.windowStartMs === before.request.windowStartMs;
    fact(SPEC, "placebo_same_window", sameWindow);
    if (sameWindow) {
      expect(
        placebo.ink.columns.map((c) => `${c.x}:${c.top}:${c.bottom}`),
        "ablar OUTRA série moveu a geometria da vela — o painel de Preço não é independente do de OI",
      ).toEqual(before.ink.columns.map((c) => `${c.x}:${c.top}:${c.bottom}`));
    }
  } finally {
    if (instance !== null) await instance.close();
    await proxy.close();
  }
});
