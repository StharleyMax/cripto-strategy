import http from "node:http";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { fact, startSecondaryNextInstance, type NextInstanceHandle } from "./helpers.ts";

/**
 * `T-02.7` (`CST-214`, `RNF-2`) — o teto de latência do eixo único: **`p95 <= 16 ms`** sobre
 * **`n >= 60` quadros** de UM arrasto contínuo (≈1 s a 60 fps), contra o app real (`next
 * build`/`next start` — `scripts/e2e-env.sh`, nunca `next dev`).
 *
 * ── O QUE É UM "QUADRO", AQUI, E POR QUE NÃO É UM `mousemove` ─────────────────────────────────
 *
 * Um `mousemove` é entrada — o navegador manda quantos quiser. Um "quadro", para este teto, é
 * uma APLICAÇÃO DE RANGE: o instante em que `axis-sync.ts`'s `notifyPanelRangeChanged` conclui
 * que o `RangeDispatcher` (`T-02.3`) reescreveu de fato o `state` (não um eco do valor atual,
 * não uma notificação derrubada pela guarda de reentrância — `D-C3.2`) e por isso escreveu nos
 * outros cinco painéis. `axis-sync.ts`'s `onRangeApplied` (`T-02.7`) é chamado exatamente nesse
 * instante; `axis-latency-probe.ts` é quem lê `performance.now()` e empilha em
 * `window.__axisLatencyProbe.samplesMs` — o ÚNICO relógio deste caminho inteiro. Este spec não
 * inventa um segundo: ele só lê o que a produção já publica.
 *
 * ── ACHADO, MEDIDO, QUE MOLDA TODO O RESTO DESTE ARQUIVO ──────────────────────────────────────
 *
 * A hipótese inicial deste builder era rodar o arrasto contra o `E2E_BASE_URL` normal (a app
 * subida por `scripts/e2e-env.sh`) nos dois universos, como `15-vela-e-ablacao.spec.ts` já faz
 * para asserções de pixel. **Ela não sobrevive à medição.** Sob `make e2e` a API é sqlite
 * efêmera e `/series-history` responde `500` para TODA série (`ADR-034/D9`: sem fallback sqlite
 * para `md.series`) — as seis séries do `/symbol` nascem 100% `WhitespaceItem` (nenhum ponto
 * real), e nesse estado `lightweight-charts@5.2.1` **não reconhece um arrasto de mouse como
 * pan**: `handleScroll.pressedMouseMove` (`true` por padrão, nunca desligado em
 * `chart-options.ts`) continua ativo — o `pointerdown`/`pointermove` chegam ao `<canvas>`
 * (confirmado com listeners de `window` na fase de captura) e o ZOOM por roda continua
 * funcionando (confirmado: 20 `wheel` produzem 60 aplicações de range) — mas o PAN por
 * pressionar-e-arrastar fica mudo: **0 aplicações em 90 passos de arrasto real, medido `n=3`
 * vezes**, contra as MESMAS 6 aplicações de sempre (uma por painel, do próprio mount). Injetando
 * `series.setData()` com 5.760 velas REAIS na mesma página, sem tocar em mais nada, o MESMO
 * gesto passou a produzir 8 aplicações imediatamente `[MEDIDO 2026-09-22, ambiente desta
 * worktree]`. A biblioteca exige ao menos uma série com valor real para habilitar o pan por
 * mouse — um fato da biblioteca, não deste app, e não documentado em lugar nenhum que este
 * builder tenha achado no pacote publicado.
 *
 * **Consequência prática, e é o motivo de este spec não usar `E2E_BASE_URL`:** sob `make
 * verify`/`make e2e` (o portão real), o universo é SEMPRE o fraco (não há Postgres na
 * ephemeral store) — então um teste que dependesse de dado real vindo do `E2E_BASE_URL` NUNCA
 * exerceria o gesto sob o portão, e um teste condicionado a "se tiver dado real" viraria
 * `test.skip()` de fato, sempre, silenciosamente — a mesma classe de `rc=0` ambíguo que
 * `ADR-012` já nomeia.
 *
 * ── A SOLUÇÃO: UM STUB SINTÉTICO PRÓPRIO, NUNCA O POSTGRES COMPARTILHADO ──────────────────────
 *
 * Mesma receita que `15-vela-e-ablacao.spec.ts` já usa para a ablação (`startAblationProxy` +
 * `startSecondaryNextInstance`), com uma diferença: aquele proxy ENCAMINHA um upstream real (só
 * reescreve na volta); este stub NÃO tem upstream — ele PRODUZ, sozinho, um `/series-catalog`
 * com as 4 entradas `klines_ohlc` (`OPEN`/`HIGH`/`LOW`/`CLOSE`) e um `/series-history` com valor
 * numérico real em CADA minuto da janela pedida, para QUALQUER `series_key_id` que a página
 * peça. Nenhum `INSERT`, nenhum `psql`, nenhum `docker` — só um `http.createServer` deste
 * processo, encerrado no `finally`. `[P-seed]` continua zero: o Postgres do owner nunca é
 * tocado, porque este stub não tem NENHUM caminho até ele.
 *
 * A segunda instância `next start` (`startSecondaryNextInstance`) reaproveita o `.next` que
 * `scripts/e2e-env.sh` já compilou — nenhum `next build` novo acontece aqui.
 *
 * ── POR QUE O CRITÉRIO É SOBRE O INTERVALO ENTRE QUADROS, NÃO SOBRE O QUADRO EM SI ────────────
 *
 * O teto (`p95 <= 16 ms`) é sobre quanto tempo passa ENTRE duas aplicações consecutivas — 16 ms
 * é um quadro a 60 fps (`[DECISAO-OWNER: 2026-09-19]`, `tasks.toml:349`), então um intervalo
 * maior que isso é uma queda de quadro DE VERDADE, visível a olho. `n` amostras de
 * `performance.now()` dão `n-1` intervalos; o DoD pede `n >= 60` QUADROS, então este spec exige
 * `samplesMs.length >= 61` (⇒ `>= 60` intervalos) antes mesmo de olhar o `p95` — `n < 60` é
 * MORDE por si só, queda de taxa disfarçada de amostra curta, e nenhum `p95` a salva.
 *
 * ⛔ MÉDIA É PROIBIDA COMO CRITÉRIO, E ESTE ARQUIVO NÃO A CALCULA EM LUGAR NENHUM — nem para
 * relatório: um travamento de 200 ms em 60 quadros de 10 ms some numa média (13,2 ms, "passa") e
 * é exatamente o que o operador percebe. Só `p95` (e `max`/`p50` como contexto, nunca como
 * critério de reprovação) vão para `fact()`.
 *
 * ── O ARRASTO ──────────────────────────────────────────────────────────────────────────────
 *
 * `page.mouse.down()` seguido de UM `page.mouse.move(..., { steps: N_STEPS })` — não um laço
 * manual de `move()` + `waitForTimeout()` por passo. Medido, não suposto: o laço manual (mesmo
 * pedindo `16,67 ms` entre passos) media o `p50` do intervalo em torno de `33 ms` — o RTT do
 * próprio CDP por chamada dominava o intervalo, então o número media o DRIVER do teste, não o
 * app. Com `steps` (uma única chamada, o Chromium interpola e despacha internamente), `p50` cai
 * para `~16,7 ms` — exatamente um quadro a 60 fps — que é o sinal de que o COALESCING nativo do
 * navegador está pacing a entrada, e o que sobra no `p95`/`max` é o app, não o transporte.
 */

const SPEC = "16-teto-latencia-eixo";
const SYMBOL = "BTCUSDT";
const SYMBOL_PATH = `/symbol/${SYMBOL}`;
const PRICE_PANE_TESTID = "price-pane";

/** `[DECISAO-OWNER: 2026-09-19]` — 16 ms = um quadro a 60 fps, `tasks.toml:349-352`. */
const LATENCY_CEILING_MS = 16;
/** DoD 7 — `n >= 60` quadros ⇒ `>= 61` amostras de `performance.now()` (`n-1` intervalos). */
const MIN_FRAMES = 60;
const MIN_SAMPLES = MIN_FRAMES + 1;

const N_STEPS = 90;
const STEP_PX = 3;

const ONE_MINUTE_MS = 60_000;
/** `view-model.ts::KLINES_OHLC_METRIC`/`KLINES_OHLC_PROVIDER` — copiados como literais, não
 * importados: importar de `view-model.ts` puxaria `node:crypto`/RSC-only code para dentro do
 * stub, que só precisa saber o VOCABULÁRIO do contrato, não a lógica que o consome. */
const OHLC_METRIC = "klines_ohlc";
const OHLC_PROVIDER = "binance";
const OHLC_REDUCTIONS = ["OPEN", "HIGH", "LOW", "CLOSE"] as const;

declare global {
  interface Window {
    __axisLatencyProbe?: { samplesMs: number[]; reset(): void };
  }
}

/** Uma `SeriesKey` sintética válida (`series-catalog.ts`'s 15 campos) — todo termo textual
 * não-branco, enums dentro do vocabulário fechado que `series-catalog-query.ts` valida. */
function syntheticOhlcKey(reduction: (typeof OHLC_REDUCTIONS)[number]): Record<string, unknown> {
  return {
    provider: OHLC_PROVIDER,
    venue: OHLC_PROVIDER,
    instrumentId: SYMBOL,
    metric: OHLC_METRIC,
    cohort: "NA",
    interval: "1m",
    unit: "USD",
    denom: "USD",
    nature: "STOCK",
    tsConvention: "OHLC_OVER_BUCKET",
    reduction,
    quantityField: "NA",
    labelShift: 0,
    aggregationScope: "NA",
    verifiedBy: "T-02.7-synthetic-stub",
  };
}

function syntheticCatalogEnvelope(): { readonly query: string; readonly n_entries: number; readonly entries: unknown[] } {
  const entries = OHLC_REDUCTIONS.map((reduction) => ({
    key: syntheticOhlcKey(reduction),
    nativeGrid: "1m",
    maxStalenessMs: 600_000,
    priceUse: null,
    reconstructedFrom: null,
    publishedError: null,
  }));
  return { query: "series_catalog", n_entries: entries.length, entries };
}

/**
 * O stub que substitui a API de leitura inteira para ESTA instância secundária do `next start`.
 * Responde `/series-catalog` com as 4 entradas `klines_ohlc` e `/series-history` com um valor
 * numérico real a cada minuto da janela pedida — QUALQUER `series_key_id`, porque este teste não
 * precisa distinguir OPEN de CLOSE, só precisa que a série NÃO seja 100% `WhitespaceItem` (o
 * achado medido acima). Nenhuma outra rota é servida — as outras nove séries da página ficam
 * `not_in_catalog`, um estado já suportado e testado em todo o resto de `frontend/e2e/`.
 */
async function startSyntheticOhlcStub(): Promise<{ readonly url: string; close(): Promise<void> }> {
  const catalog = syntheticCatalogEnvelope();
  const server = http.createServer((request, response) => {
    const incoming = new URL(request.url ?? "/", "http://placeholder");
    if (incoming.pathname.endsWith("/series-catalog")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(catalog));
      return;
    }
    if (incoming.pathname.endsWith("/series-history")) {
      const startMs = Number(incoming.searchParams.get("window_start_ms"));
      const endMsInclusive = Number(incoming.searchParams.get("window_end_ms"));
      const knowledgeTimeMs = Number(incoming.searchParams.get("knowledge_time_ms"));
      const seriesKeyId = incoming.searchParams.get("series_key_id") ?? "unknown";
      if (!Number.isFinite(startMs) || !Number.isFinite(endMsInclusive)) {
        response.writeHead(400, { "content-type": "text/plain" });
        response.end("synthetic stub: window_start_ms/window_end_ms missing or not numeric");
        return;
      }
      const rows: { event_time: number; available_at: number; value: string; absence: null }[] = [];
      for (let t = startMs; t <= endMsInclusive; t += ONE_MINUTE_MS) {
        // Um valor plausível, monotônico o bastante para não parecer um erro de dado — nunca
        // lido por nenhuma asserção deste spec, só precisa existir para não ser `WhitespaceItem`.
        const value = 100 + (t % 1_000_000) / 100_000;
        rows.push({ event_time: t, available_at: t, value: value.toFixed(4), absence: null });
      }
      const envelope = {
        session: { principal_id: null, server_now_ms: Date.now() },
        panel: { series_key_id: seriesKeyId, source: "T-02.7-synthetic-stub", nature: "STOCK", unit: "USD" },
        rows,
        knowledge_time: Number.isFinite(knowledgeTimeMs) ? knowledgeTimeMs : Date.now(),
        bar_policy: "final_only",
      };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(envelope));
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("synthetic stub: no route");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("synthetic stub: sem porta");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** Espera o `<canvas>` existir E ter área — um canvas ANEXADO ainda não é um canvas PINTADO
 * (mesma distinção que `15-vela-e-ablacao.spec.ts::waitForPaintedChart` já paga). */
async function waitForPaintedChart(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll("canvas")).some((c) => c.width > 0 && c.height > 0),
    undefined,
    { timeout: 120_000 },
  );
  await page.waitForTimeout(2_000);
}

function percentile(sortedAscending: readonly number[], p: number): number {
  if (sortedAscending.length === 0) {
    throw new Error("percentile: empty sample — caller must check length first");
  }
  const index = Math.min(sortedAscending.length - 1, Math.max(0, Math.ceil(p * sortedAscending.length) - 1));
  return sortedAscending[index]!;
}

test(`RNF-2: p95 <= ${LATENCY_CEILING_MS} ms sobre n >= ${MIN_FRAMES} quadros de um arrasto contínuo (${SPEC})`, async ({
  page,
}) => {
  const stub = await startSyntheticOhlcStub();
  let instance: NextInstanceHandle | undefined;
  try {
    instance = await startSecondaryNextInstance({ INGEST_HEALTH_API_BASE_URL: stub.url });

    const response = await page.goto(`${instance.baseUrl}${SYMBOL_PATH}`, { waitUntil: "load" });
    expect(response?.ok(), `GET ${SYMBOL_PATH} não respondeu ok`).toBe(true);
    await waitForPaintedChart(page);

    // Confirma a PRECONDIÇÃO medida antes de confiar no gesto: se o stub não conseguiu dar à
    // página nenhuma vela real, o arrasto abaixo mediria silêncio, não latência.
    const drawnCandles = await page
      .locator(`[data-testid="${PRICE_PANE_TESTID}"]`)
      .getAttribute("data-price-candles");
    fact(SPEC, "stub_drawn_candles", drawnCandles);
    expect(
      Number(drawnCandles ?? "0"),
      "o stub sintético não produziu nenhuma vela real — o pré-requisito medido (biblioteca " +
        "exige ao menos um valor real para habilitar o pan por mouse) não foi satisfeito",
    ).toBeGreaterThan(0);

    const pane = page.locator(`[data-testid="${PRICE_PANE_TESTID}"]`);
    const box = await pane.locator("canvas").first().boundingBox();
    if (box === null) throw new Error("o canvas do painel de Preço não tem caixa — nada foi montado");

    await page.evaluate(() => window.__axisLatencyProbe?.reset());

    const startX = box.x + box.width * 0.75;
    const y = box.y + box.height / 2;
    await page.mouse.move(startX, y);
    await page.mouse.down();
    await page.mouse.move(startX - N_STEPS * STEP_PX, y, { steps: N_STEPS });
    await page.mouse.up();

    const samplesMs = await page.evaluate(() => window.__axisLatencyProbe?.samplesMs ?? []);
    fact(SPEC, "axis_latency_samples", samplesMs.length);

    // MORDE independente do `p95`: menos amostras que o esperado é queda de taxa disfarçada de
    // amostra curta (`tasks.toml:351`), e nenhum `p95` bom a salva.
    expect(
      samplesMs.length,
      `apenas ${samplesMs.length} aplicações de range registradas para ${N_STEPS} passos de arrasto — ` +
        `esperado >= ${MIN_SAMPLES} (>= ${MIN_FRAMES} quadros); queda de taxa disfarçada de amostra curta`,
    ).toBeGreaterThanOrEqual(MIN_SAMPLES);

    const intervalsMs: number[] = [];
    for (let i = 1; i < samplesMs.length; i += 1) {
      intervalsMs.push(samplesMs[i]! - samplesMs[i - 1]!);
    }
    const sorted = [...intervalsMs].sort((a, b) => a - b);
    const p50 = percentile(sorted, 0.5);
    const p95 = percentile(sorted, 0.95);
    const max = sorted[sorted.length - 1]!;

    // ⛔ NENHUMA MÉDIA CALCULADA — nem para diagnóstico. Só cauda.
    fact(SPEC, "axis_latency_intervals_n", intervalsMs.length);
    fact(SPEC, "axis_latency_p50_ms", p50);
    fact(SPEC, "axis_latency_p95_ms", p95);
    fact(SPEC, "axis_latency_max_ms", max);

    expect(
      p95,
      `p95 dos intervalos entre aplicações de range é ${p95.toFixed(2)} ms (max ${max.toFixed(2)} ms, ` +
        `p50 ${p50.toFixed(2)} ms, n=${intervalsMs.length}) — teto é ${LATENCY_CEILING_MS} ms (um quadro a 60 fps)`,
    ).toBeLessThanOrEqual(LATENCY_CEILING_MS);
  } finally {
    if (instance !== undefined) await instance.close();
    await stub.close();
  }
});
