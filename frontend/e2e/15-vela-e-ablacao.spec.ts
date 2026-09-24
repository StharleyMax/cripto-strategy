import { readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";

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
 * `T-01.11` (`CST-207`) â **o Ãºnico instrumento desta fase que pergunta se a VELA foi PINTADA.**
 *
 * ââ O VÃO QUE ELE FECHA, MEDIDO ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
 *
 * A suÃ­te de e2e tinha **40 asserÃ§Ãµes** sobre `/symbol` e **nenhuma** olhava a forma da vela:
 * `grep -rn 'candle\|vela' frontend/e2e/*.ts` devolvia **1 linha**, e era um comentÃ¡rio
 * `[MEDIDO 2026-09-19, n=15 arquivos em frontend/e2e/]`. O painel de PreÃ§o publica
 * `data-price-candles` no DOM, e `price-pane-dom-contract.test.ts` o verifica â mas
 * **asserÃ§Ã£o de DOM nÃ£o prova pixel**: o elemento passa em tudo e nÃ£o existe na tela. Esta
 * liÃ§Ã£o jÃ¡ foi paga neste repositÃ³rio (memÃ³ria `assert-de-dom-nao-prova-pixel`), e o preÃ§o
 * anterior dela foi um defeito de wiring achado **em produÃ§Ã£o, a olho**, na fase `04` de
 * `pagina-de-grafico-s2`.
 *
 * ââ OS TRÃS CRITÃRIOS DO PLANO, E QUAL TESTE PAGA CADA UM ââââââââââââââââââââââââââââââââââââ
 *
 * `docs/plans/SPEC-008-candle-real-e-eixo-unico/01_vela.md`, "DoD verificÃ¡vel":
 *
 *   - **`CA-2`** â "a vela tem faixa â¦ **â¥ 1** bucket com `high > low` â¦ morde quando toda barra
 *     tem `high == low` â¦ e morde tambÃ©m se `open == close` em 500 de 500". Pago em DOIS nÃ­veis
 *     pelo teste `CA-2`: no DADO (a API serve faixa) e no PIXEL (a tinta da vela tem extensÃ£o
 *     vertical, e o corpo/pavio saem onde os nÃºmeros da API dizem).
 *   - **`CA-3`** â "a leitura deixa de ser ausente": `data-fact="price_last_reading:â¦"` â 
 *     `:absent`. Pago pelo teste `CA-3`, **condicionado ao que a API serve** para continuar
 *     total sobre os dois universos (ver abaixo).
 *   - â **`CA-4`, a ablaÃ§Ã£o** â "removido o produtor de preÃ§o, o corpo e o pavio somem da tela
 *     â captura antes/depois, assert de posiÃ§Ã£o". Pago pelo teste `CA-4`, com o **par
 *     morde/cala** que este repositÃ³rio exige: ablar `klines_ohlc` apaga a tinta da vela
 *     (MORDE); ablar `sum_open_interest` â outra sÃ©rie, mesma pÃ¡gina â deixa a tinta da vela
 *     **byte a byte no mesmo lugar** (CALA). Sem o segundo, "a tinta sumiu" seria
 *     indistinguÃ­vel de "a pÃ¡gina quebrou".
 *
 * ââ â `[P-seed]`: ESTE ARQUIVO NÃO SEMEIA NADA ââââââââââââââââââââââââââââââââââââââââââââââ
 *
 * Nenhum `INSERT`, nenhum `psql`, nenhum `docker`. A ablaÃ§Ã£o **nÃ£o toca o banco**: ela pÃµe um
 * **proxy HTTP de leitura** na frente da API (`GET` encaminhado verbatim) e reescreve, na
 * RESPOSTA, as linhas de UMA mÃ©trica para o estado de ausÃªncia que o prÃ³prio envelope jÃ¡
 * carrega em `5.680` das `5.760` linhas. O Postgres compartilhado Ã© o de PRODUÃÃO â dado sintÃ©tico
 * de e2e jÃ¡ vazou para a tela real do owner, e a regra que saiu daquele episÃ³dio Ã© literal:
 * nunca semear. Um proxy de leitura respeita isso por construÃ§Ã£o: ele nÃ£o tem caminho de
 * escrita.
 *
 * ââ OS DOIS UNIVERSOS, E POR QUE NENHUMA ASSERÃÃO AQUI Ã CONDICIONADA A UMA `env` ââââââââââââ
 *
 * Sob `make e2e` a API Ã© sqlite efÃªmera e `/series-history` responde `500` (`ADR-034/D9`: sem
 * fallback sqlite para `md.series`) â universo FRACO, zero vela. Contra o deployment do owner
 * a API Ã© Postgres â universo FORTE. O universo Ã© decidido **perguntando Ã  API quantas velas
 * ela serve**, nunca lendo uma variÃ¡vel de ambiente: variÃ¡vel aqui seria allowlist disfarÃ§ada
 * (`CLAUDE.md`), e qualquer um a desligaria sem mudar o que o deployment Ã. Os dois universos
 * tÃªm asserÃ§Ã£o prÃ³pria e o nÃºmero medido vai para `facts.jsonl` em toda rodada.
 *
 * ââ O QUE ESTE ARQUIVO **NÃO** PROVA, DECLARADO EM VEZ DE ESCONDIDO ââââââââââââââââââââââââââ
 *
 * `DoD-1` pede **â¥ 500 pontos nÃ£o-nulos por chave**, `n=4` chaves. No momento em que ele foi
 * escrito a API servia **80** `[MEDIDO 2026-09-19T23:0xZ]`, com o backfill de 90 dias em voo.
 * Este arquivo **nÃ£o** afirma `DoD-1`: ele publica `candles_full` toda rodada, e o relatÃ³rio do
 * gate Ã© quem confronta o nÃºmero com o alvo. Um teste que passasse com 80 e se chamasse "500"
 * seria pior que nenhum.
 */

const SPEC = "15-vela-e-ablacao";
const SYMBOL = "BTCUSDT";
// `T-02.5` — a rota virou `/symbol/[symbol]`, segmento em ingles; a página do piloto é `SYMBOL`.
const SYMBOL_PATH = `/symbol/${SYMBOL}`;
const PRICE_PANE_TESTID = "price-pane";
const ABSENCE_FACT_SUFFIX = ":absent";

/** As DUAS tintas que **sÃ³** a sÃ©rie de velas usa neste `<canvas>`, lidas do mÃ³dulo de tokens e
 * nÃ£o transcritas: `directionUpFill`/`directionDownFill` chegam aqui por
 * `borderUpColor`/`borderDownColor` (= `wickUpColor`/`wickDownColor`), e o corpo de alta Ã©
 * `HOLLOW_BODY_FILL` (transparente), entÃ£o a borda Ã© a tinta do corpo tambÃ©m.
 *
 * â ï¸ O NEUTRO DO DOJI (`dojiItemColors().color` = `provenanceWeak`) FICA DE FORA, e a omissÃ£o Ã©
 * deliberada: Ã© **a mesma cor** que a sub-eixo de volume usa para as barras
 * (`SymbolClient.tsx:909`, `color: colorTokens().provenanceWeak`), no MESMO `<canvas>` â contÃ¡-la
 * como tinta de vela mediria volume e chamaria de preÃ§o. O custo disso Ã© real e estÃ¡ coberto:
 * uma tela em que TODA vela fosse doji mediria `0` de tinta, entÃ£o o teste sÃ³ exige tinta depois
 * de checar, na API, que existe ao menos uma vela com `open != close`. */
function candleInkColors(): readonly (readonly [number, number, number])[] {
  const style = candlestickSeriesColors();
  return [style.borderUpColor, style.borderDownColor].map((hex) => {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (m === null) throw new Error(`candleInkColors: ${hex} nÃ£o Ã© #rrggbb â os tokens mudaram de grafia`);
    return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] as const;
  });
}

// ââ A API SOB TESTE ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

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
 * exige os quatro, e esta reconstruÃ§Ã£o do lado do teste usa a mesma regra â bucket com 1..3
 * leituras Ã© lacuna, nÃ£o vela. */
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

/** Mesmo tratamento de `08-symbol-dado-real.spec.ts`: o corpo Ã© lido como TEXTO primeiro, porque
 * a API do universo fraco responde `Internal Server Error` e `response.json()` trocaria o status
 * â que Ã© o que decide o universo â por um `SyntaxError`. */
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

/** As quatro chaves `klines_ohlc` do sÃ­mbolo, remontadas em velas â a MESMA regra do painel. */
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
      throw new Error(`o catÃ¡logo servido nÃ£o tem klines_ohlc/${reduction} para ${SYMBOL} â RF-2 regrediu`);
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

// ââ O PIXEL ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

/** A geometria da tinta de vela no `<canvas>` do painel de PreÃ§o, em coordenadas do PRÃPRIO
 * canvas (nÃ£o da pÃ¡gina): uma coluna por `x` com tinta, com o topo e o fundo dela. Isso Ã© o
 * suficiente para corpo, pavio e posiÃ§Ã£o, e Ã© estÃ¡vel sob deslocamento de layout dos painÃ©is
 * vizinhos â que Ã© exatamente o que a ablaÃ§Ã£o da OUTRA sÃ©rie provoca. */
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

/** Roda DENTRO do browser: `getImageData` do canvas do painel de PreÃ§o. Mesma tÃ©cnica de
 * `11-canvas-fundo.spec.ts` (o Ãºnico portÃ£o que jÃ¡ lia pixel) â `lightweight-charts` pinta em
 * `<canvas>` 2D, opaco a qualquer asserÃ§Ã£o de DOM. */
async function measureCandleInk(page: Page): Promise<InkMeasurement> {
  const tolerance = 12;
  return page.evaluate(
    ({ colors, testid, tolerance: tol }) => {
      const pane = document.querySelector(`[data-testid="${testid}"]`);
      if (pane === null) throw new Error(`nÃ£o hÃ¡ [data-testid="${testid}"] na pÃ¡gina`);
      // `paineis-de-fluxo` `T-01.6`: the layer sits NEXT to the pane's canvases, inside the
      // pane wrapper — the canvases are its parent's direct children.
      const wrapper = pane.parentElement;
      const siblings = wrapper === null ? [] : Array.from(wrapper.children).filter((c) => c instanceof HTMLCanvasElement);
      const canvas = (siblings as HTMLCanvasElement[]).find((c) => c.width > 200 && c.height > 100);
      if (canvas === undefined) throw new Error("o painel de PreÃ§o nÃ£o tem um canvas de grÃ¡fico com Ã¡rea");
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

/** Espera o `<canvas>` existir E ter Ã¡rea â um canvas ANEXADO ainda nÃ£o Ã© um canvas PINTADO,
 * distinÃ§Ã£o que `11-canvas-fundo.spec.ts` jÃ¡ pagou. */
async function waitForPaintedChart(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll("canvas")).some((c) => c.width > 0 && c.height > 0),
    undefined,
    { timeout: 120_000 },
  );
  // Os painÃ©is montam por `useEffect` e a sÃ©rie Ã© `setData`-ada depois do primeiro frame.
  await page.waitForTimeout(2_000);
}

async function readRenderedRequest(page: Page): Promise<RenderedRequest> {
  const main = page.locator("main[data-window-start-ms]");
  await expect(main, "a pÃ¡gina nÃ£o declara o prÃ³prio request â build anterior a esta wave?").toHaveCount(1);
  const number = async (name: string): Promise<number> => {
    const raw = await main.getAttribute(name);
    if (raw === null) throw new Error(`a pÃ¡gina parou de publicar ${name}`);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) throw new Error(`${name}=${JSON.stringify(raw)} nÃ£o Ã© um instante em ms`);
    return parsed;
  };
  return {
    windowStartMs: await number("data-window-start-ms"),
    windowEndMsInclusive: await number("data-window-end-ms-inclusive"),
    knowledgeTimeMs: await number("data-knowledge-time-ms"),
  };
}

/** Quantas velas o painel DIZ ter desenhado (`data-price-candles`), como nÃºmero e nunca como
 * `Number(null)` â que Ã© `0` e faria a comparaÃ§Ã£o com a API passar sobre um DOM sem contrato
 * (`BLOCKER-3` da wave `03`). */
async function readDrawnCandlesAttribute(page: Page): Promise<number> {
  const raw = await page.locator(`[data-testid="${PRICE_PANE_TESTID}"]`).getAttribute("data-price-candles");
  expect(raw, "o painel de PreÃ§o parou de publicar `data-price-candles`").not.toBeNull();
  expect(raw ?? "", "`data-price-candles` tem de ser uma contagem em dÃ­gitos").toMatch(/^\d+$/);
  return Number(raw);
}

// ââ ZOOM: o Ãºnico jeito de separar CORPO de PAVIO neste eixo ââââââââââââââââââââââââââââââââââ
//
// â O NÃMERO QUE OBRIGA O ZOOM, MEDIDO: a janela da rota tem `5.760` buckets de 1 min e o canvas
// do painel tem `1208 px` â `0,21 px por bucket`. Com `fitContent()` (`SymbolClient.tsx:460`) as
// 80 velas servidas hoje ocupam `43 colunas` de tinta, ~`0,54 px` por vela
// `[MEDIDO 2026-09-19T23:0xZ, canvas 1208x192, dpr=1]`. Nessa largura **corpo e pavio sÃ£o a
// MESMA coluna**, e "o pavio ultrapassa o corpo" nÃ£o Ã© uma proposiÃ§Ã£o que o pixel possa
// responder. Depois de `30` passos de roda aparecem `70` velas com corpo de `7 a 16` colunas,
// `49` delas com pixel FORA das arestas do corpo â o pavio
// `[MEDIDO na mesma rodada: `candle_groups_on_screen=70`, `groups_with_drawn_wick=49`]`.
//
// Esta Ã© uma interaÃ§Ã£o de UI com teto, nÃ£o um laÃ§o de espera (`R9`): ela para no primeiro
// instante em que a largura pedida existe, e desiste depois de `MAX_ZOOM_STEPS`.

const ZOOM_STEP_DELTA = -200;
const MAX_ZOOM_STEPS = 160;
/** Passos de roda entre duas mediÃ§Ãµes â medir a cada passo custaria 160 varreduras do canvas. */
const ZOOM_BURST = 5;
/** Quantas colunas o corpo da Ãºltima vela precisa ter para que "o pavio ultrapassa o corpo"
 * deixe de ser uma proposiÃ§Ã£o sobre a mesma coluna. `6` Ã© folgado contra as `15` medidas em
 * `40` passos de roda `[MEDIDO 2026-09-19]`. */
const MIN_BODY_COLUMNS = 6;
/** Quantas velas o alinhamento precisa ter para que casar com a API deixe de ser coincidÃªncia.
 * Com `3`, sÃ£o `12` arestas presas a uma escala derivada dos extremos do prÃ³prio conjunto. */
const MIN_ALIGNED_GROUPS = 3;
/** Teto do trecho alinhado. Mais velas Ã© prova mais forte, mas um trecho longo tem mais chance
 * de conter uma lacuna que o espaÃ§amento nÃ£o delate. */
const MAX_ALIGNED_GROUPS = 12;
/** Folga da asserÃ§Ã£o afim. A biblioteca arredonda cada aresta para a grade de pixels e a borda
 * do corpo tem `1 px` de espessura prÃ³pria, entÃ£o `3` Ã© geometria e nÃ£o tolerÃ¢ncia a erro â
 * contra `0,54 px` medidos sobre `12` velas, isto Ã©, `48` arestas `[MEDIDO 2026-09-19]`. */
const MAX_ALIGNMENT_ERROR_PX = 3;
/** Quantas vezes a tolerÃ¢ncia vale a mutaÃ§Ã£o do falsificador. `3x` em PIXELS, convertido para
 * USDT pela escala MEDIDA na prÃ³pria rodada â um literal em USDT ficaria abaixo da tolerÃ¢ncia
 * assim que o zoom mudasse, e foi o que aconteceu `[MEDIDO 2026-09-19: 5 USDT = 1,9 px < 3 px,
 * e o falsificador reprovou a si mesmo]`. */
const MUTATION_SCALE = 3;

/** â ONDE A BANDA DE PREÃO TERMINA, e por que o teste precisa saber disso.
 *
 * O `<canvas>` do painel de PreÃ§o carrega DUAS escalas: a do preÃ§o e a do sub-eixo de volume,
 * que ocupa a faixa de baixo (`VOLUME_SCALE_MARGINS = { top: 0.8, bottom: 0 }`,
 * `SymbolClient.tsx:556`). Em `192 px` de painel isso pÃµe o piso da banda de preÃ§o em
 * `192 Ã 0,8 = 153,6 px` â **e um pavio que caia abaixo disso nÃ£o tem onde ser desenhado**.
 *
 * Foi exatamente o que produziu o falso `13,77 px`: o pavio inferior de uma vela parou em
 * `154` (o piso da banda) enquanto o nÃºmero da API o punha em `167,4`, e como o estimador
 * antigo ANCORAVA nos extremos, esse pixel cortado virou a Ã¢ncora â reportou o prÃ³prio erro
 * como `0,00` e espalhou a culpa pelo meio do trecho `[MEDIDO 2026-09-20: 47 das 48 arestas
 * dentro de 3,3 px por ajuste robusto, mediana 0,84 px; a Ãºnica fora era a Ã¢ncora]`. */
const PRICE_BAND_BOTTOM_FRACTION = 0.8;


/** Uma vela reconhecida no canvas: o vÃ£o de `x` do CORPO (as colunas que compartilham as duas
 * arestas) e as quatro coordenadas que a biblioteca desenhou. `wickTop`/`wickBottom` saem de
 * TODA coluna dentro do vÃ£o â dentro do corpo de uma vela, a Ãºnica coisa que sai das arestas Ã©
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
 * Todas as velas reconhecÃ­veis no canvas ampliado, da esquerda para a direita.
 *
 * â POR QUE O CORPO Ã PROCURADO EM DOIS PEDAÃOS: o pavio Ã© UMA coluna no CENTRO da vela e ela
 * **parte o corpo em dois trechos** de colunas idÃªnticas. Uma versÃ£o anterior pegou sÃ³ o trecho
 * da direita e concluiu "esta vela nÃ£o tem pavio" com o pavio a 8 colunas de distÃ¢ncia
 * `[MEDIDO 2026-09-19: corpo "61..70", pavio idÃªntico ao corpo]`.
 *
 * â E POR QUE "O AGLOMERADO CONTÃGUO MAIS Ã DIREITA" NÃO SERVE: no zoom padrÃ£o as ~70 velas
 * ocupam `38` colunas CONTÃGUAS (`0,21 px` por bucket), entÃ£o o aglomerado Ã© a janela inteira e
 * o topo/fundo dele sÃ£o os da janela, nÃ£o os de uma vela `[MEDIDO 2026-09-19: grupo de 31
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
  // 2. Trechos com as mesmas arestas separados por atÃ© 2 colunas sÃ£o as duas METADES do mesmo
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

/** â DESCARTA OS GRUPOS QUE SÃO MAIS DE UMA VELA, e sem isto `bestAlignmentError` mente.
 *
 * `extractCandleGroups` funde trechos que compartilham as DUAS arestas â o que Ã© certo para o
 * corpo partido pelo pavio e ERRADO para velas VIZINHAS que fecharam no mesmo par de preÃ§os.
 * Com pouca vela na tela isso nÃ£o acontece; com muita, acontece o tempo todo: medi um corpo de
 * **25 colunas** onde o passo entre velas Ã© **~8,6 px** â trÃªs buckets num "grupo" sÃ³
 * `[MEDIDO 2026-09-20: groups_px[2]="39-63", passo mediano 8,6 px, n=113 grupos, 1.515 velas]`.
 * `bestAlignmentError` casa **um grupo com um bucket**; um grupo que vale trÃªs desloca todo o
 * resto e o erro sai em `13,77 px` contra uma tolerÃ¢ncia de `3` â **do instrumento, nÃ£o da
 * tela**, exatamente como jÃ¡ tinha acontecido com a penÃºltima vela (ver o cabeÃ§alho daquela
 * funÃ§Ã£o).
 *
 * O corte Ã© pela largura MODAL, nÃ£o por um literal: a vela larga Ã© a exceÃ§Ã£o e a mediana Ã© dela
 * mesma. */
function dropMergedGroups(groups: readonly CandleGroup[]): readonly CandleGroup[] {
  if (groups.length < 3) return groups;
  const widths = groups.map((g) => g.xRight - g.xLeft + 1).sort((a, b) => a - b);
  const median = widths[Math.floor(widths.length / 2)]!;
  return groups.filter((g) => g.xRight - g.xLeft + 1 <= median * 1.5);
}

/** A maior sequÃªncia de velas UNIFORMEMENTE espaÃ§adas no eixo â isto Ã©, buckets CONSECUTIVOS.
 *
 * â POR QUE ELA Ã NECESSÃRIA: as velas servidas hoje tÃªm LACUNAS (buckets sem as quatro
 * leituras nÃ£o desenham nada), entÃ£o as `70` velas na tela nÃ£o sÃ£o `70` minutos seguidos â hÃ¡
 * saltos de `21 px` onde o espaÃ§amento normal Ã© `8,6 px` `[MEDIDO 2026-09-19]`. Alinhar a lista
 * inteira contra minutos consecutivos comparava pixel de um instante com nÃºmero de outro, e o
 * erro saÃ­a em `77 px` â do instrumento, nÃ£o da tela. */
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

/** O erro mÃ¡ximo, em pixels, entre as 4 arestas que a tela desenhou para `m` velas e as 4
 * leituras que a API serve para `m` velas CONSECUTIVAS â sobre o melhor alinhamento possÃ­vel.
 *
 * â POR QUE ALINHAR EM VEZ DE ASSUMIR "a de mais Ã  direita Ã© a Ãºltima": ela NÃO Ã©. Com zoom e
 * arrasto a Ãºltima vela sai do canvas, e a versÃ£o anterior deste teste comparou os pixels da
 * penÃºltima com os nÃºmeros da Ãºltima â e o erro que apareceu era do instrumento
 * `[MEDIDO 2026-09-19: grupo mais Ã  direita = penÃºltima vela; px/unidade 1,55 casava com a
 * penÃºltima e nÃ£o com a Ãºltima]`. Alinhar `m >= 3` velas de uma vez Ã© uma prova MAIS forte que a
 * de uma sÃ³: a escala Ã© derivada dos extremos do conjunto e as `4m` arestas tÃªm de cair todas
 * no lugar.
 */
function bestAlignmentError(
  groups: readonly CandleGroup[],
  candles: readonly AssembledCandle[],
  canvasHeight: number,
): {
  readonly maxErrorPx: number;
  readonly firstCandleTime: number | null;
  readonly pxPerPrice: number;
  readonly worstEdge: string;
  readonly clippedEdges: number;
  readonly table: readonly string[];
} {
  const empty = {
    maxErrorPx: Number.POSITIVE_INFINITY,
    firstCandleTime: null as number | null,
    pxPerPrice: 0,
    worstEdge: "n/a",
    clippedEdges: 0,
    table: [] as string[],
  };
  if (groups.length === 0 || candles.length < groups.length) return empty;
  // O piso da banda de preÃ§o. Uma aresta medida EM CIMA dele nÃ£o Ã© leitura do nÃºmero: Ã© o
  // desenho batendo na parede, e comparÃ¡-la com o preÃ§o mede a parede.
  const bandBottom = canvasHeight * PRICE_BAND_BOTTOM_FRACTION;
  let best = empty;
  for (let offset = 0; offset + groups.length <= candles.length; offset += 1) {
    const window = candles.slice(offset, offset + groups.length);
    // Velas desenhadas lado a lado sÃ£o buckets CONSECUTIVOS: um bucket sem leitura Ã© lacuna e
    // nÃ£o desenha nada, entÃ£o um alinhamento que pule tempo Ã© impossÃ­vel por construÃ§Ã£o.
    const consecutive = window.every((c, i) => i === 0 || c.time - window[i - 1]!.time === 60_000);
    if (!consecutive) continue;
    const edges = groups.flatMap((group, i) => {
      const candle = window[i]!;
      return [
        { label: `wickTop/high@${String(i)}`, price: candle.high, y: group.wickTop },
        { label: `wickBottom/low@${String(i)}`, price: candle.low, y: group.wickBottom },
        { label: `bodyTop/max(o,c)@${String(i)}`, price: Math.max(candle.open, candle.close), y: group.bodyTop },
        { label: `bodyBottom/min(o,c)@${String(i)}`, price: Math.min(candle.open, candle.close), y: group.bodyBottom },
      ];
    });
    const usable = edges.filter((edge) => edge.y < bandBottom - 1);
    const clippedEdges = edges.length - usable.length;
    if (usable.length < 8) continue;
    // â A ESCALA SAI DE MÃNIMOS QUADRADOS SOBRE AS `4m` ARESTAS, NÃO DE DOIS EXTREMOS.
    // O estimador anterior mapeava `min(y)`â`max(preÃ§o)` e `max(y)`â`min(preÃ§o)`: dois pontos,
    // e cada um deles Ã© justamente o candidato mais provÃ¡vel a estar errado (extremo cortado,
    // pavio de um minuto volÃ¡til). Um extremo ruim ali nÃ£o aparece â ele vira a Ã¢ncora, reporta
    // erro `0,00` para si mesmo e transfere a acusaÃ§Ã£o para o meio do trecho. Com o ajuste
    // robusto toda aresta pesa igual e o outlier aparece ONDE ELE ESTÃ.
    const n = usable.length;
    const meanPrice = usable.reduce((acc, e) => acc + e.price, 0) / n;
    const meanY = usable.reduce((acc, e) => acc + e.y, 0) / n;
    const sxx = usable.reduce((acc, e) => acc + (e.price - meanPrice) ** 2, 0);
    if (sxx === 0) continue;
    const slope = usable.reduce((acc, e) => acc + (e.price - meanPrice) * (e.y - meanY), 0) / sxx;
    const intercept = meanY - slope * meanPrice;
    const y = (price: number): number => slope * price + intercept;
    let maxError = 0;
    let worstEdge = "n/a";
    for (const edge of usable) {
      const residual = Math.abs(edge.y - y(edge.price));
      if (residual > maxError) {
        maxError = residual;
        worstEdge = edge.label;
      }
    }
    if (maxError < best.maxErrorPx) {
      best = {
        maxErrorPx: maxError,
        firstCandleTime: window[0]!.time,
        pxPerPrice: Math.abs(slope),
        worstEdge,
        clippedEdges,
        table: groups.map((group, i) => {
          const candle = window[i]!;
          return (
            `${String(i)}|t=${String(candle.time)}` +
            `|corpo=${String(group.bodyTop)}..${String(group.bodyBottom)}` +
            `|pavio=${String(group.wickTop)}..${String(group.wickBottom)}` +
            `|prev_h=${y(candle.high).toFixed(1)}|prev_l=${y(candle.low).toFixed(1)}`
          );
        }),
      };
    }
  }
  return best;
}

/** Amplia atÃ© haver ao menos `minGroups` velas com corpo de `MIN_BODY_COLUMNS` colunas. InteraÃ§Ã£o
 * de UI com teto, nÃ£o laÃ§o de espera (`R9`): para no primeiro instante em que a largura existe e
 * desiste em `MAX_ZOOM_STEPS`. */
async function zoomUntilCandlesAreWide(
  page: Page,
  minGroups: number,
): Promise<{ readonly measurement: InkMeasurement; readonly steps: number }> {
  // `paineis-de-fluxo` `T-01.6`: the pane layer is the canvases' sibling (portalled into the
  // pane wrapper), no longer their ancestor.
  const box = await page.locator(`[data-testid="${PRICE_PANE_TESTID}"]`).locator("xpath=../canvas").first().boundingBox();
  if (box === null) throw new Error("o canvas do painel de PreÃ§o nÃ£o tem caixa â nada foi montado");
  const midY = box.y + box.height / 2;
  let measurement = await measureCandleInk(page);
  let steps = 0;
  // â O CURSOR FICA SOBRE A TINTA: a roda da biblioteca mantÃ©m fixo o ponto sob o cursor e
  // espalha o resto, entÃ£o ancorar longe das velas as empurra para fora do canvas
  // `[MEDIDO 2026-09-19: ancorado a 20 px da borda, 120 passos, corpo ainda com 4 colunas]`.
  // â A CONDIÃÃO DE PARADA Ã O QUE O ASSERT PRECISA, NÃO UM PRIMO DELE. Ela pedia `minGroups`
  // velas LARGAS; o assert que vem depois pede `minGroups` velas largas **em buckets
  // CONSECUTIVOS** (`longestUniformRun`). As duas coincidem quando hÃ¡ pouca vela na tela e
  // divergem quando hÃ¡ muita â foi o que aconteceu: com `1.515` velas servidas o laÃ§o parou em
  // `20` passos com `8` grupos dos quais sÃ³ `2` eram consecutivos, e o `CA-2` reprovou por uma
  // PRÃ-CONDIÃÃO que o prÃ³prio laÃ§o deveria ter estabelecido
  // `[MEDIDO 2026-09-20: candle_groups_on_screen=8, aligned_groups=2, n=1515 velas]`. Um teste
  // que passa com `80` velas e reprova com `1.515` estava medindo a densidade do dado, nÃ£o a
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

// ââ O PROXY DE ABLAÃÃO â leitura encaminhada, UMA mÃ©trica apagada na volta ââââââââââââââââââââ

interface AblationProxy {
  readonly url: string;
  ablate(metric: string | null): void;
  readonly rewrittenResponses: () => number;
  close(): Promise<void>;
}

/**
 * Um proxy `GET` na frente da API de leitura. Encaminha caminho e query **verbatim**; quando a
 * mÃ©trica ablada estÃ¡ armada, reescreve as linhas de `/series-history` daquela mÃ©trica para o
 * estado de AUSÃNCIA â `value: null`, `available_at: null`, `absence` copiada de uma linha
 * ausente do MESMO envelope.
 *
 * â POR QUE COPIAR O TOKEN DE AUSÃNCIA EM VEZ DE INVENTAR UM: `CA-F1-5`
 * (`series-history-client.ts:76`) exige exatamente um de `value`/`absence` nulo, e o vocabulÃ¡rio
 * de `absence` Ã© do backend. Um literal aqui seria uma segunda verdade sobre o contrato, e o dia
 * em que ele divergisse esta ablaÃ§Ã£o passaria a medir o VALIDADOR em vez da tela.
 *
 * â E POR QUE A ABLAÃÃO Ã AQUI E NÃO NO BANCO: `[P-seed]`. Este processo nÃ£o tem caminho de
 * escrita â ele lÃª `GET` e devolve JSON. O Postgres de produÃ§Ã£o fica intocado, o que Ã© a Ãºnica
 * forma aceitÃ¡vel de ablar em cima do deployment do owner.
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
            "ablation proxy: nenhuma linha ausente no envelope para tomar emprestado o token de `absence` â " +
              "sem ele a ablaÃ§Ã£o teria de inventar vocabulÃ¡rio de contrato, e isso Ã© proibido aqui",
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

// ââ OS TESTES ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

test(`CA-0: a banda de preÃ§o ainda termina onde este teste acha que termina (${SPEC})`, () => {
  // â ESTE TESTE EXISTE PORQUE `PRICE_BAND_BOTTOM_FRACTION` Ã UMA CÃPIA. O valor mora em
  // produÃ§Ã£o (`SymbolClient.tsx:556`, `VOLUME_SCALE_MARGINS`) e nÃ£o Ã© exportado; copiÃ¡-lo aqui
  // sem guarda criaria uma segunda verdade que o dia da mudanÃ§a tornaria MUDA â o `CA-2`
  // passaria a excluir a faixa errada e ninguÃ©m saberia. Com a guarda, a deriva REPROVA aqui,
  // com o nome do arquivo, em vez de virar um `13,77 px` misterioso lÃ¡.
  const source = readFileSync(path.join(import.meta.dirname, "..", "src", "app", "symbol", "SymbolClient.tsx"), "utf8");
  const declared = /const VOLUME_SCALE_MARGINS = \{ top: ([0-9.]+), bottom: ([0-9.]+) \} as const;/.exec(source);
  expect(declared, "`VOLUME_SCALE_MARGINS` mudou de grafia em SymbolClient.tsx â a cÃ³pia deste teste ficou Ã³rfÃ£").not.toBeNull();
  expect(
    Number(declared![1]),
    "o sub-eixo de volume mudou de margem: `PRICE_BAND_BOTTOM_FRACTION` aqui precisa acompanhar",
  ).toBe(PRICE_BAND_BOTTOM_FRACTION);
  fact(SPEC, "price_band_bottom_fraction", PRICE_BAND_BOTTOM_FRACTION);
});

test(`CA-3: /symbol declara a leitura de preÃ§o, e ela Ã© ausente sÃ³ quando a API Ã© (${SPEC})`, async ({ page }) => {
  const response = await page.goto(SYMBOL_PATH, { waitUntil: "load" });
  fact(SPEC, "http_status", response?.status() ?? null);
  expect(response?.status()).toBe(200);
  const request = await readRenderedRequest(page);
  const { status, candles } = await fetchAssembledCandles(request);
  fact(SPEC, "series_history_status", status);
  fact(SPEC, "candles_full", candles.length);

  const readingFact = page.locator('[data-fact^="price_last_reading:"]');
  await expect(readingFact, "o painel de PreÃ§o parou de publicar `price_last_reading`").toHaveCount(1);
  const published = await readingFact.getAttribute("data-fact");
  fact(SPEC, "price_last_reading_fact", published);

  // TOTAL SOBRE OS DOIS UNIVERSOS, e a condiÃ§Ã£o sai da API e nÃ£o de uma `env`: a leitura sÃ³ pode
  // deixar de ser ausente se existir uma vela no Ãºltimo instante da janela que a prÃ³pria pÃ¡gina
  // declarou. Sem esta condiÃ§Ã£o o teste reprovaria o universo fraco â onde `:absent` Ã© a resposta
  // CORRETA â e verde ali seria verde sobre a ausÃªncia do dado, nÃ£o sobre a presenÃ§a dele.
  const lastCandle = candles.at(-1);
  const servesLastInstant = lastCandle !== undefined && lastCandle.time === request.windowEndMsInclusive;
  fact(SPEC, "api_serves_last_instant", servesLastInstant);
  if (servesLastInstant) {
    expect(
      published,
      "a API serve vela no Ãºltimo instante da janela e a tela ainda diz `absent` â Ã© o defeito de wiring de `CA-3`",
    ).not.toContain(ABSENCE_FACT_SUFFIX);
  } else if (candles.length === 0) {
    expect(published, "a API nÃ£o serve vela nenhuma e a tela afirma uma leitura â nÃºmero fabricado").toContain(
      ABSENCE_FACT_SUFFIX,
    );
  }

  // O NÃMERO NA TELA Ã O NÃMERO DA API â exato, porque os dois lados saÃ­ram da MESMA janela
  // declarada pela pÃ¡gina (`knowledge_time` fixa a resposta), entÃ£o divergÃªncia Ã© wiring.
  const drawn = await readDrawnCandlesAttribute(page);
  fact(SPEC, "dom_price_candles", drawn);
  expect(drawn, "`data-price-candles` diverge das velas que a API serve para a janela da prÃ³pria pÃ¡gina").toBe(
    candles.length,
  );
});

test(`CA-2: a vela tem faixa â no dado E no pixel, com o pavio onde a API diz (${SPEC})`, async ({ page }) => {
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

  // ââ UNIVERSO FRACO: a API nÃ£o serve vela â a tela nÃ£o pode ter pintado uma ââââââââââââââââ
  //
  // Isto Ã© a metade CALA do par, e nÃ£o Ã© decoraÃ§Ã£o: Ã© a asserÃ§Ã£o que distingue "nÃ£o desenhou
  // porque nÃ£o hÃ¡ dado" de "nÃ£o desenhou porque quebrou". Ela reprova se a pÃ¡gina inventar uma
  // vela sobre um backend que nÃ£o respondeu.
  if (candles.length === 0) {
    expect(await readDrawnCandlesAttribute(page)).toBe(0);
    expect(flat.inkPixels, "a API nÃ£o serve vela e o canvas tem tinta de vela â pixel fabricado").toBe(0);
    await shot(page, `${SPEC}-universo-fraco`);
    test.skip(true, "universo FRACO: a API sob teste serve 0 velas â CA-2 forte e CA-4 nÃ£o sÃ£o mensurÃ¡veis aqui");
    return;
  }

  // ââ `CA-2` NO DADO ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
  expect(
    withRange,
    "TODA barra tem `high == low` â Ã© a vela degenerada de novo, agora com dado real por trÃ¡s (`RN-2`)",
  ).toBeGreaterThanOrEqual(1);
  expect(
    withBody,
    "`open == close` em TODAS as velas â Ã© o colapso dos quatro STOCK num sÃ³ que `ADR-040/D2` nomeia",
  ).toBeGreaterThanOrEqual(1);

  // ââ `CA-2` NO PIXEL, parte 1: existe tinta, e ela tem EXTENSÃO VERTICAL ââââââââââââââââââââ
  expect(flat.inkPixels, "a API serve vela e o canvas nÃ£o tem um pixel da tinta da vela").toBeGreaterThan(0);
  const bboxTop = Math.min(...flat.columns.map((c) => c.top));
  const bboxBottom = Math.max(...flat.columns.map((c) => c.bottom));
  const bboxHeight = bboxBottom - bboxTop + 1;
  fact(SPEC, "ink_bbox_height_px", bboxHeight);
  fact(SPEC, "ink_bbox_height_share", Number((bboxHeight / flat.canvasHeight).toFixed(3)));
  // A escala do painel autoescala para a faixa do dado dentro da banda da sÃ©rie (as margens
  // publicadas da biblioteca deixam ~70% da altura). Uma tela em que toda vela fosse um ponto
  // colapsaria isso para poucos pixels â que Ã© o MORDE desta asserÃ§Ã£o
  // `[MEDIDO 2026-09-19: 129/192 px = 67%, n=60 velas]`.
  expect(bboxHeight / flat.canvasHeight, "a tinta da vela Ã© uma linha achatada â a faixa nÃ£o chegou ao eixo").toBeGreaterThan(
    0.4,
  );

  // ââ `CA-2` NO PIXEL, parte 2: POSIÃÃO â a vela mais nova no lugar mais novo ââââââââââââââââ
  const lastCandle = candles.at(-1)!;
  if (lastCandle.time === request.windowEndMsInclusive) {
    const xMax = Math.max(...flat.columns.map((c) => c.x));
    fact(SPEC, "ink_x_max", xMax);
    fact(SPEC, "ink_x_gap_to_right_edge_px", flat.canvasWidth - 1 - xMax);
    // `fitContent()` ancora a Ãºltima barra na borda direita; a vela do Ãºltimo instante tem de
    // sair LÃ. Folga de 12 px sobre `1208` (1%) contra `1 px` medido â o bug de wiring que a
    // fase `04` de `pagina-de-grafico-s2` achou a olho em produÃ§Ã£o era exatamente uma sÃ©rie
    // desenhada no lugar errado do eixo `[MEDIDO 2026-09-19: xMax=1207, canvas 1208]`.
    expect(flat.canvasWidth - 1 - xMax, "a vela do Ãºltimo instante nÃ£o estÃ¡ na borda direita do eixo").toBeLessThanOrEqual(12);
  }

  // ââ `CA-2` NO PIXEL, parte 3: CORPO e PAVIO, com os nÃºmeros da API PREVENDO os pixels âââââ
  //
  // â O ZOOM Ã OBRIGATÃRIO, E O NÃMERO QUE O OBRIGA ESTÃ MEDIDO: a janela da rota tem `5.760`
  // buckets de 1 min num canvas de `1208 px` â `0,21 px por bucket`. Com `fitContent()`
  // (`SymbolClient.tsx:460`) as ~70 velas servidas hoje ocupam `38` colunas de tinta, `~0,93 px`
  // por vela `[MEDIDO 2026-09-19, canvas 1208x192, dpr=1]`. Nessa largura **corpo e pavio sÃ£o a
  // MESMA coluna**, e "o pavio ultrapassa o corpo" nÃ£o Ã© proposiÃ§Ã£o que o pixel possa responder.
  const { measurement: zoomed, steps } = await zoomUntilCandlesAreWide(page, MIN_ALIGNED_GROUPS);
  const groups = extractCandleGroups(zoomed.columns, MIN_BODY_COLUMNS);
  fact(SPEC, "zoom_steps", steps);
  fact(SPEC, "candle_groups_on_screen", groups.length);
  await shot(page, `${SPEC}-vela-ampliada`);

  expect(
    groups.length,
    "nem com o zoom no teto apareceram velas largas o bastante para separar corpo de pavio â " +
      "sem isso `CA-2` fica sÃ³ no dado, e o relatÃ³rio do gate tem de dizer isso",
  ).toBeGreaterThanOrEqual(MIN_ALIGNED_GROUPS);

  // O PAVIO EXISTE na tela: ao menos uma das velas visÃ­veis tem pixel fora das arestas do corpo.
  // Ã a metade "morde" de `CA-2` no pixel â a vela degenerada (`high == low`) nÃ£o produz nenhum.
  const withDrawnWick = groups.filter((g) => g.wickTop < g.bodyTop || g.wickBottom > g.bodyBottom);
  fact(SPEC, "groups_with_drawn_wick", withDrawnWick.length);
  fact(
    SPEC,
    "groups_px",
    groups.map((g) => `${g.xLeft}-${g.xRight}:corpo ${g.bodyTop}..${g.bodyBottom}:pavio ${g.wickTop}..${g.wickBottom}`),
  );
  expect(
    withDrawnWick.length,
    "nenhuma vela na tela tem um pixel fora do corpo â nÃ£o hÃ¡ pavio desenhado, sÃ³ retÃ¢ngulo",
  ).toBeGreaterThanOrEqual(1);

  // â A ASSERÃÃO QUE LIGA NÃMERO A PIXEL, e Ã© a que morde um `close` desenhado sozinho ou a
  // degenerada com dado real por trÃ¡s: a escala de preÃ§o Ã© afim, entÃ£o uma escala derivada dos
  // EXTREMOS do conjunto de velas visÃ­veis tem de prever, dentro de poucos pixels, as `4 x m`
  // arestas que a biblioteca desenhou â `high`, `low`, e as duas do corpo (`open`/`close`).
  // Nenhum alinhamento Ã© assumido: o teste procura o deslocamento que melhor casa e Ã© o ERRO
  // desse melhor caso que a asserÃ§Ã£o julga.
  const aligned = longestUniformRun(dropMergedGroups(groups), MAX_ALIGNED_GROUPS);
  fact(SPEC, "aligned_groups", aligned.length);
  expect(
    aligned.length,
    "nÃ£o hÃ¡ trÃªs velas em buckets CONSECUTIVOS na tela â sem isso o alinhamento com a API nÃ£o Ã© ancorÃ¡vel",
  ).toBeGreaterThanOrEqual(MIN_ALIGNED_GROUPS);
  const alignment = bestAlignmentError(aligned, candles, zoomed.canvasHeight);
  fact(SPEC, "alignment_max_error_px", Number(alignment.maxErrorPx.toFixed(2)));
  fact(SPEC, "alignment_first_candle_time", alignment.firstCandleTime);
  fact(SPEC, "alignment_worst_edge", alignment.worstEdge);
  fact(SPEC, "alignment_clipped_edges", alignment.clippedEdges);
  fact(SPEC, "alignment_table", alignment.table);
  fact(SPEC, "alignment_px_per_price", Number(alignment.pxPerPrice.toFixed(4)));
  fact(
    SPEC,
    "aligned_groups_px",
    aligned.map((g) => `${g.xLeft}-${g.xRight}:corpo ${g.bodyTop}..${g.bodyBottom}:pavio ${g.wickTop}..${g.wickBottom}`),
  );
  // `3 px`: a biblioteca arredonda cada aresta para a grade de pixels e a borda do corpo tem
  // `1 px` de espessura prÃ³pria, entÃ£o `2 px` de folga jÃ¡ Ã© geometria e nÃ£o tolerÃ¢ncia a erro.
  expect(
    alignment.maxErrorPx,
    "as arestas desenhadas nÃ£o sÃ£o as quatro leituras da API â a tela estÃ¡ desenhando outra coisa",
  ).toBeLessThanOrEqual(MAX_ALIGNMENT_ERROR_PX);

  // â O FALSIFICADOR DO PRÃPRIO INSTRUMENTO â verde nÃ£o prova nada atÃ© uma mutaÃ§Ã£o reprovar.
  // A asserÃ§Ã£o acima Ã© um `<=` sobre um nÃºmero calculado aqui dentro; se o cÃ¡lculo fosse
  // degenerado (uma escala que absorve qualquer coisa, um alinhamento que sempre acha um
  // encaixe), ela ficaria verde sobre qualquer tela. A mutaÃ§Ã£o desloca AS DUAS arestas do corpo
  // de todas as velas em `BODY_MUTATION_USDT`, deixando `high`/`low` â e portanto a escala â
  // intactos, e exige que o mesmo cÃ¡lculo REPROVE.
  const mutationUsdt = (MUTATION_SCALE * MAX_ALIGNMENT_ERROR_PX) / alignment.pxPerPrice;
  fact(SPEC, "alignment_px_per_usdt", Number(alignment.pxPerPrice.toFixed(3)));
  fact(SPEC, "mutation_usdt", Number(mutationUsdt.toFixed(2)));
  const mutatedCandles = candles.map((c) => ({
    ...c,
    open: c.open - mutationUsdt,
    close: c.close - mutationUsdt,
  }));
  const mutatedError = bestAlignmentError(aligned, mutatedCandles, zoomed.canvasHeight).maxErrorPx;
  fact(SPEC, "mutated_alignment_max_error_px", Number(mutatedError.toFixed(2)));
  expect(
    mutatedError,
    "o alinhamento aceitou um corpo deslocado â o instrumento nÃ£o mede nada, e o verde acima Ã© vazio",
  ).toBeGreaterThan(MAX_ALIGNMENT_ERROR_PX);
});

test(`CA-4: ablaÃ§Ã£o de P1 â sem o produtor de preÃ§o, corpo e pavio somem (${SPEC})`, async ({ page }) => {
  // O universo Ã© decidido pela API, antes de subir processo nenhum.
  await page.goto(SYMBOL_PATH, { waitUntil: "load" });
  const probeRequest = await readRenderedRequest(page);
  const probe = await fetchAssembledCandles(probeRequest);
  fact(SPEC, "ablation_candles_available", probe.candles.length);
  test.skip(
    probe.candles.length === 0,
    "universo FRACO: a API sob teste serve 0 velas â nÃ£o hÃ¡ produtor de preÃ§o para ablar",
  );

  const proxy = await startAblationProxy();
  let instance: NextInstanceHandle | null = null;
  try {
    // â A instÃ¢ncia secundÃ¡ria existe porque `/symbol` Ã© Server Component: o `fetch` acontece no
    // processo do Next, nunca no browser, entÃ£o `page.route()` NÃO alcanÃ§a a chamada que precisa
    // ser ablada. `INGEST_HEALTH_API_BASE_URL` Ã© lida de `process.env` a cada chamada (jamais
    // inlinada no build), que Ã© o que torna este redirecionamento possÃ­vel sem rebuild.
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

    // ââ ANTES âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    proxy.ablate(null);
    const before = await load();
    await shot(page, `${SPEC}-1-antes`);
    fact(SPEC, "ablation_before_ink_pixels", before.ink.inkPixels);
    fact(SPEC, "ablation_before_ink_columns", before.ink.columns.length);
    fact(SPEC, "ablation_before_drawn_candles", before.drawn);
    expect(
      before.ink.inkPixels,
      "o controle da ablaÃ§Ã£o jÃ¡ sai sem tinta de vela â sem isso nÃ£o hÃ¡ o que ablar, e um " +
        "'sumiu' medido sobre o nada nÃ£o prova nada",
    ).toBeGreaterThan(0);

    // ââ DEPOIS: o produtor de preÃ§o REMOVIDO (MORDE) ââââââââââââââââââââââââââââââââââââââ
    proxy.ablate("klines_ohlc");
    const ablated = await load();
    await shot(page, `${SPEC}-2-depois-sem-preco`);
    fact(SPEC, "ablation_after_ink_pixels", ablated.ink.inkPixels);
    fact(SPEC, "ablation_after_drawn_candles", ablated.drawn);
    fact(SPEC, "ablation_rewritten_responses", proxy.rewrittenResponses());
    expect(proxy.rewrittenResponses(), "o proxy nÃ£o chegou a reescrever resposta nenhuma â a ablaÃ§Ã£o nÃ£o aconteceu").toBe(
      OHLC_REDUCTIONS.length,
    );
    expect(ablated.drawn, "sem o produtor de preÃ§o o painel ainda diz ter desenhado velas").toBe(0);
    // â ASSERÃÃO DE POSIÃÃO: nenhuma das colunas que carregavam a vela pode ter sobrado. Pixel
    // que sobrevive Ã  ablaÃ§Ã£o estava desenhando outra coisa.
    const survivors = ablated.ink.columns.filter((c) => before.ink.columns.some((b) => b.x === c.x));
    fact(SPEC, "ablation_surviving_columns", survivors.map((c) => c.x));
    expect(
      survivors.map((c) => c.x),
      "sobrou tinta de vela exatamente onde ela estava â esse pixel nÃ£o vinha do produtor de preÃ§o",
    ).toEqual([]);
    expect(ablated.ink.inkPixels, "removido o produtor de preÃ§o ainda hÃ¡ tinta de vela no canvas").toBe(0);

    // ââ PLACEBO: outra sÃ©rie ablada, a vela INTACTA (CALA) ââââââââââââââââââââââââââââââââ
    //
    // Sem esta metade, "a tinta sumiu" seria indistinguÃ­vel de "a pÃ¡gina parou de renderizar".
    // Ablar `sum_open_interest` mexe no painel de OI e nÃ£o pode mover um pixel do de PreÃ§o.
    proxy.ablate("sum_open_interest");
    const placebo = await load();
    await shot(page, `${SPEC}-3-placebo-sem-oi`);
    fact(SPEC, "placebo_ink_pixels", placebo.ink.inkPixels);
    fact(SPEC, "placebo_drawn_candles", placebo.drawn);
    expect(placebo.ink.inkPixels, "ablar OUTRA sÃ©rie apagou a vela â a mediÃ§Ã£o nÃ£o Ã© especÃ­fica do preÃ§o").toBeGreaterThan(
      0,
    );
    expect(placebo.drawn, "ablar OUTRA sÃ©rie mudou a contagem de velas do painel de PreÃ§o").toBe(before.drawn);

    // A identidade de POSIÃÃO sÃ³ Ã© exigÃ­vel quando as duas renderizaÃ§Ãµes caÃ­ram na MESMA janela:
    // a rota ancora a janela no relÃ³gio do servidor, entÃ£o duas cargas em minutos diferentes
    // desenham instantes diferentes â e reprovar por isso mediria o relÃ³gio, nÃ£o a tela.
    const sameWindow = placebo.request.windowStartMs === before.request.windowStartMs;
    fact(SPEC, "placebo_same_window", sameWindow);
    if (sameWindow) {
      expect(
        placebo.ink.columns.map((c) => `${c.x}:${c.top}:${c.bottom}`),
        "ablar OUTRA sÃ©rie moveu a geometria da vela â o painel de PreÃ§o nÃ£o Ã© independente do de OI",
      ).toEqual(before.ink.columns.map((c) => `${c.x}:${c.top}:${c.bottom}`));
    }
  } finally {
    if (instance !== null) await instance.close();
    await proxy.close();
  }
});
