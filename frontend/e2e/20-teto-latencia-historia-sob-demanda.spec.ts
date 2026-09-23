import http from "node:http";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { fact, startSecondaryNextInstance, type NextInstanceHandle } from "./helpers.ts";

/**
 * `T-05.9` (`CST-242`, plan `05` `docs/plans/SPEC-008-candle-real-e-eixo-unico/05_historia_sob_demanda.md`
 * DoD 7) — the teto de latência da história sob demanda: **`p95 <= 400 ms`**, `n >= 10`
 * paginações **disparadas por arrasto**, do instante em que a borda é detectada até o primeiro
 * frame em que a barra nova está **desenhada** — nunca até a resposta HTTP chegar
 * (`[DECISÃO-OWNER: 2026-09-19]`). Fecha `[M-5]` do lado da paginação; o outro lado (`16 ms` por
 * quadro de pan, recalibrado para `160 ms` — ver abaixo) é `T-02.7`'s
 * `17-teto-latencia-eixo.spec.ts`.
 *
 * ── OS DOIS RELÓGIOS, E POR QUE NENHUM DOS DOIS É "A RESPOSTA CHEGOU" ─────────────────────────
 *
 * `history-page-latency-probe.ts` é o `web`'s side deste contrato — mesmo desenho que
 * `axis-latency-probe.ts` já estabelece para `T-02.7`: `requestedMs` é escrito em
 * `use-history-pager.ts`'s `onCandidateRange`, no instante em que `historyRequest` decide que uma
 * página é warranted (antes de `fetchPage`/`fetch()` sequer rodar) — "a borda é detectada".
 * `drawnMs` é escrito no `build` callback do painel de Preço (`SymbolClient.tsx`), logo depois de
 * `candleSeries.setData(...)` — porque uma página bem-sucedida troca a IDENTIDADE do `axis`
 * (`use-history-pager.ts`'s `windowState`), e `AxisSyncProvider`'s `useMemo(() => ..., [axis])`
 * reconstrói o `AxisSyncStore` inteiro, o que faz `useLightweightChart`'s efeito (dependente de
 * `axisSync`) desmontar e REMONTAR os seis `IChartApi` — o `build` do painel de Preço roda de
 * novo, com o `slots` já widened, e `setData` é a primeira vez que a vela nova existe na
 * biblioteca. `p95(drawnMs[i] - requestedMs[i])` é portanto o teto medido no PIXEL, nunca na
 * chegada da resposta — a diferença que o DoD 7 nomeia literalmente ("e aqui a diferença é o
 * `setData`").
 *
 * ── POR QUE UM ESTOQUE SINTÉTICO PRÓPRIO, MESMA RECEITA DE `17-teto-latencia-eixo.spec.ts` ────
 *
 * `make e2e`'s universo fraco (sqlite efêmero) responde `500` para `/series-history`
 * (`ADR-034/D9`) — sem NENHUM valor real, `lightweight-charts` não reconhece um arrasto de mouse
 * como pan (`17-teto-latencia-eixo.spec.ts`'s próprio achado medido). Este spec reusa a MESMA
 * receita: um `http.createServer` LOCAL, sem upstream, que responde `/series-catalog` com as 4
 * entradas `klines_ohlc` e `/series-history` com um valor numérico real a cada minuto de
 * QUALQUER janela pedida — nenhum `INSERT`, nenhum Postgres tocado (`[P-seed]` continua zero).
 *
 * ── COMO O ARRASTO DISPARA UMA PÁGINA, MEDIDO NESTE AMBIENTE ──────────────────────────────────
 *
 * `AxisSyncStore`'s default `initialRange` é O GRID INTEIRO (`axis-sync.ts:177-178`:
 * `{fromMs: axis.startMs, toMs: axis.startMs + slotCount*stepMs}`), então a borda esquerda já
 * está EXATAMENTE em `axis.startMs` desde o primeiro mount — `historyRequest`'s predicado
 * (`range.fromMs - axis.startMs < triggerSlots(20)*stepMs`) já é satisfeito antes de qualquer
 * gesto. `16-eixo-unico-pan-e-ablacao.spec.ts` já MEDIU (2026-09-21) que arrastar o MOUSE PARA A
 * DIREITA (`deltaXPx > 0`) move `data-visible-logical-from` para valores mais NEGATIVOS — revela
 * passado, a direção que aproxima da borda esquerda. Este spec usa a MESMA convenção.
 *
 * ── ⛔ ACHADO, FORA DO ESCOPO DESTA TASK (o handoff é explícito: "registre, não conserte") ──────
 *
 * `[MEDIDO 2026-09-23, esta worktree]`: a paginação AUTO-DISPARA a partir do próprio settle do
 * MOUNT — sem nenhum arrasto, `requestedMs.length` cresceu `6 -> 13 -> 21 -> 28 -> 35 -> 43 -> 52
 * -> 59` a cada `1,5 s` de espera pura (`n=8` amostras, zero interação de mouse), e
 * `data-visible-logical-from` do painel de Preço ficou PARADO em `-1` o tempo todo. A causa: CADA
 * remonte de `IChartApi` (`useLightweightChart`'s efeito, disparado pela troca de identidade do
 * `AxisSyncStore` a cada página bem-sucedida) sofre o MESMO artefato de relayout que o mount
 * ORIGINAL sofre (largura real do container vs a largura assumida na primeira renderização,
 * pousando `from` perto de `-1` de novo) — e como `-1` está dentro da zona de gatilho (`20`
 * slots), cada página REARMA o próprio gatilho que a produziu, indefinidamente. `[P-sonda]`: só
 * uma FALHA (`coverageFloorMs`, permanente — ver `use-history-pager.ts`'s "never loop forever")
 * ou um `reset()` interrompe; sem o teto real de cobertura de um backend de produção (`D5.3`,
 * `~90` dias), este estoque sintético — que deliberadamente nunca recusa — não o alcança sozinho.
 *
 * Consequência prática para ESTE spec: não há uma janela "quieta" para esperar antes de medir —
 * qualquer tentativa de `reset()`-então-esperar-silêncio nunca retorna. Este spec por isso NÃO
 * reseta nenhuma das duas sondas: mede sobre a série INTEIRA desde o `load`, usando a invariante
 * que sobrevive à descoberta — a cada instante, `drawnMs.length` é `requestedMs.length` (o ÚLTIMO
 * pedido ainda em voo) ou `requestedMs.length + 1` (nada em voo; o "+1" é o `setData` do MOUNT
 * inicial, sem pedido por trás) — nunca outro valor, dado o contrato serial (`D-C3.5`). Este
 * spec descarta a cauda possivelmente não resolvida (`pairCount = min(requestedMs.length,
 * drawnMs.length - 1)`) em vez de assumir qual dos dois casos vale no instante da leitura, e
 * pareia `requestedMs[i]` com `drawnMs[i+1]` sobre esse `pairCount`. Um arrasto real ainda é
 * disparado (DoD 7 pede "disparadas por arrasto"), mas a amostra medida mistura páginas por
 * arrasto e páginas do laço-achado — os dois indistinguíveis nesta medição, que é exatamente o
 * que este achado documenta.
 *
 * ── A COMPOSIÇÃO DOS DOIS TETOS (DoD 7, último parágrafo) ─────────────────────────────────────
 *
 * O DoD pede que NENHUM quadro de pan durante a paginação estoure o teto irmão de `T-02.7`. Esse
 * teto nasceu `16 ms` e foi RECALIBRADO para `160 ms` (`[DECISÃO-OWNER: 2026-09-22]`,
 * `17-teto-latencia-eixo.spec.ts`) depois de medir que `16 ms` nunca foi alcançável neste MESMO
 * ambiente de teste (Chromium headless dirigido por CDP) — este spec usa o MESMO teto recalibrado
 * para o mesmo instrumento, não o número original que já foi substituído. Dado o achado acima
 * (paginação roda continuamente desde o mount, nunca "quieta"), não há uma janela limpa "durante
 * a paginação" para isolar — os `6` primeiros samples de `window.__axisLatencyProbe` são o mount
 * (`17-*.spec.ts`'s próprio achado, "6 aplicações do próprio mount"); todo o resto é, pelo
 * raciocínio acima, inerentemente "durante paginação" nesta medição — por instrução explícita do
 * handoff desta task, um achado aqui é REGISTRADO, não "consertado" fora do escopo (a correção,
 * se houver, é da fase `02`).
 *
 * Run with: `make e2e` (ou `npx playwright test 20-teto-latencia-historia-sob-demanda
 * --config=frontend/playwright.config.ts`), contra `E2E_API_PORT=8811 E2E_NEXT_PORT=4311`.
 */

const SPEC = "20-teto-latencia-historia-sob-demanda";
const SYMBOL = "BTCUSDT";
const SYMBOL_PATH = `/symbol/${SYMBOL}`;
const PRICE_PANE_TESTID = "price-pane";

/** `[DECISÃO-OWNER: 2026-09-19, escolha entre alternativas apresentadas]` — plan `05` DoD 7,
 * literal: "400 ms até aparecer". */
const LATENCY_CEILING_MS = 400;
/** Plan `05` DoD 7, literal: "n >= 10 paginações". */
const MIN_PAGES = 10;

/** `17-teto-latencia-eixo.spec.ts`'s own recalibrated ceiling (`[DECISÃO-OWNER: 2026-09-22]`) —
 * the sibling DoD this spec's own composition check (DoD 7's last paragraph) cites. Reusing the
 * SAME number, not the original `16 ms` that recalibration replaced, on the SAME instrument
 * (CDP-driven headless Chromium) that made `16 ms` unreachable in this exact test environment. */
const PAN_FRAME_CEILING_MS = 160;

/** `history-page-window.ts::DEFAULT_PAGE_SLOTS` — copied as a literal, not imported: this spec
 * only needs the VOCABULARY (how many grid slots one page widens by) to size a drag large enough
 * to cross the newly-widened edge with margin, never the pagination logic itself. */
const PAGE_SLOTS = 500;
/** Comfortably above `PAGE_SLOTS` so a single drag both closes the ~500-slot gap a landed page
 * leaves AND crosses `time-axis-controller.ts::DEFAULT_PAGE_TRIGGER_SLOTS` (20) into the trigger
 * zone, with margin for the small amount of panning consumed before the FIRST page of a session
 * ever landed (mount already sits at the edge — see this file's own docstring). */
const TARGET_SHIFT_SLOTS = PAGE_SLOTS + 140;

const ONE_MINUTE_MS = 60_000;
const OHLC_METRIC = "klines_ohlc";
const OHLC_PROVIDER = "binance";
const OHLC_REDUCTIONS = ["OPEN", "HIGH", "LOW", "CLOSE"] as const;

declare global {
  interface Window {
    __historyPageLatencyProbe?: { requestedMs: number[]; drawnMs: number[]; reset(): void };
    __axisLatencyProbe?: { samplesMs: number[]; reset(): void };
  }
}

// ── O ESTOQUE SINTÉTICO — mesma receita de `17-teto-latencia-eixo.spec.ts`, própria cópia ─────
// (o repositório não compartilha stubs entre specs — `19-oi-provenance-ablacao-e-ascii.spec.ts`
// e `15-vela-e-ablacao.spec.ts` também têm o seu próprio, cada um privado ao seu arquivo).

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
    verifiedBy: "T-05.9-synthetic-stub",
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

/** Responde `/series-catalog` com as 4 entradas `klines_ohlc` e `/series-history` com um valor
 * numérico real a cada minuto da janela pedida, para QUALQUER `series_key_id` — o mesmo achado
 * medido em `17-teto-latencia-eixo.spec.ts`: sem ao menos uma série com valor real, a biblioteca
 * não reconhece um arrasto de mouse como pan.
 *
 * ⛔ `floorMs` nunca aparece aqui — este estoque nunca recusa, e é exatamente essa ausência que
 * expõe o achado deste arquivo's docstring de topo: sem um teto real de cobertura (`D5.3`, que
 * um backend de produção aplicaria depois de ~90 dias de recuo), o cliente não tem NENHUM outro
 * freio contra o laço de auto-paginação — a única coisa que já o interrompe hoje é uma FALHA
 * (`coverageFloorMs`, que trava permanentemente). Modelar `D5.3` aqui SUPRIMIRIA o achado em vez
 * de expô-lo (o laço pararia sozinho, cedo, e pareceria que nunca existiu) — deliberadamente
 * fora de escopo desta correção, ver o docstring de topo.
 */
async function startSyntheticOhlcStub(): Promise<{ readonly url: string; close(): Promise<void> }> {
  const catalog = syntheticCatalogEnvelope();
  const server = http.createServer((request, response) => {
    // `T-05.9`'s own achado, MEDIDO: `browser-series-history-client.ts` (`T-05.2-FIX-adr005`) is
    // a REAL cross-origin `fetch()` from the browser against this stub's own port — never the
    // Next server's Node `fetch` (that half is SSR-only, `page.tsx`'s ten initial fetches, which
    // hit no CORS wall). Without `Access-Control-Allow-Origin` here, EVERY client-triggered page
    // request after the very first one is a `net::ERR_FAILED` the browser's own CORS check
    // blocks before this spec's code ever sees a status — caught as `HistoryPageFetchError`,
    // which PERMANENTLY freezes `coverageFloorMs` at the axis edge of that first attempt
    // (`use-history-pager.ts`'s own "never loop forever" contract) and silently stops every
    // later `historyRequest` from firing again, no matter how far a subsequent drag goes.
    // `17-teto-latencia-eixo.spec.ts` never surfaces this because it only cares about PAN
    // latency, never whether a page actually landed.
    response.setHeader("access-control-allow-origin", "*");
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
      const rows: {
        event_time: number;
        available_at: number;
        value: string;
        absence: null;
        coverage: null;
      }[] = [];
      for (let t = startMs; t <= endMsInclusive; t += ONE_MINUTE_MS) {
        const value = 100 + (t % 1_000_000) / 100_000;
        rows.push({ event_time: t, available_at: t, value: value.toFixed(4), absence: null, coverage: null });
      }
      const envelope = {
        session: { principal_id: null, server_now_ms: Date.now() },
        panel: {
          series_key_id: seriesKeyId,
          source: "T-05.9-synthetic-stub",
          nature: "STOCK",
          unit: "USD",
          // `T-05.7`/`D-C3.7` tornou `panel.coverage` obrigatório (`series-history-envelope.ts`,
          // `assertWirePanelCoverage`) DEPOIS que este stub foi escrito — sem isto, TODA resposta
          // reprovava a validação de envelope no cliente, e nenhuma vela era desenhada
          // (`stub_drawn_candles=0`, achado independente do que este arquivo mede).
          // `null` nos três campos == "nenhum teto conhecido", coerente com o docstring de
          // `startSyntheticOhlcStub` acima ("este estoque nunca recusa").
          coverage: { earliest_bucket_ms: null, latest_bucket_ms: null, source_floor_ms: null },
        },
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

async function waitForPaintedChart(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll("canvas")).some((c) => c.width > 0 && c.height > 0),
    undefined,
    { timeout: 120_000 },
  );
  await page.waitForTimeout(2_000);
}

interface PriceRange {
  readonly from: number;
  readonly to: number;
}

function priceContainerLocator(page: Page) {
  return page.locator(`[data-testid="${PRICE_PANE_TESTID}"] [data-visible-logical-from]`);
}

async function readPriceRange(page: Page): Promise<PriceRange> {
  const container = priceContainerLocator(page);
  const [from, to] = await Promise.all([
    container.getAttribute("data-visible-logical-from"),
    container.getAttribute("data-visible-logical-to"),
  ]);
  if (from === null || to === null) {
    throw new Error("painel de Preço: data-visible-logical-from/-to ausente — canvas não montado?");
  }
  return { from: Number(from), to: Number(to) };
}

/** Um arrasto, para a DIREITA (`16-eixo-unico-pan-e-ablacao.spec.ts`'s convenção medida: mover o
 * mouse para a direita revela passado). `deltaXPx` é calculado pelo CHAMADOR a partir do range
 * CORRENTE — esta função só executa o gesto, com a mesma pausa de 100 ms antes/depois de
 * `dragPricePanel` (`16-*.spec.ts`), medida como necessária para o handler de ponteiro da
 * biblioteca reconhecer um arrasto real em vez de um teleporte.
 */
async function dragRight(page: Page, deltaXPx: number): Promise<void> {
  const box = await priceContainerLocator(page).boundingBox();
  if (box === null) {
    throw new Error("painel de Preço: sem bounding box — nada montado");
  }
  const startX = box.x + box.width * 0.5;
  const y = box.y + box.height / 2;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.move(startX + deltaXPx, y, { steps: 30 });
  await page.waitForTimeout(100);
  await page.mouse.up();
}

test(`RNF-2/DoD-7: p95 <= ${LATENCY_CEILING_MS} ms da borda detectada até a barra desenhada, sobre n >= ${MIN_PAGES} paginações disparadas por arrasto (${SPEC})`, async ({
  page,
}) => {
  const stub = await startSyntheticOhlcStub();
  let instance: NextInstanceHandle | undefined;
  try {
    instance = await startSecondaryNextInstance({ INGEST_HEALTH_API_BASE_URL: stub.url });

    const response = await page.goto(`${instance.baseUrl}${SYMBOL_PATH}`, { waitUntil: "load" });
    expect(response?.ok(), `GET ${SYMBOL_PATH} não respondeu ok`).toBe(true);
    await waitForPaintedChart(page);

    const drawnCandles = await page
      .locator(`[data-testid="${PRICE_PANE_TESTID}"]`)
      .getAttribute("data-price-candles");
    fact(SPEC, "stub_drawn_candles", drawnCandles);
    expect(
      Number(drawnCandles ?? "0"),
      "o stub sintético não produziu nenhuma vela real — pré-requisito medido de " +
        "17-teto-latencia-eixo.spec.ts (a biblioteca exige ao menos um valor real para o pan " +
        "por mouse) não satisfeito",
    ).toBeGreaterThan(0);

    // ⛔ ACHADO (`T-05.9`, `[MEDIDO 2026-09-23]`, não corrigido aqui — fora do escopo desta task,
    // ver o docstring deste arquivo): a paginação AUTO-DISPARA a partir do próprio mount, sem
    // NENHUM arrasto — `requestedMs.length` cresceu `6 -> 13 -> 21 -> 28 -> 35 -> 43 -> 52 -> 59`
    // a cada 1,5 s de espera pura (`n=8` amostras, zero interação), e `data-visible-logical-from`
    // do painel de Preço ficou PARADO em `-1` o tempo todo — cada remonte reintroduz o MESMO
    // artefato de "settle" que o produziu da primeira vez, então cada página bem-sucedida
    // rearma o próprio gatilho. Sem um teto real de cobertura (`D5.3`, que este estoque
    // deliberadamente não modela — ver `startSyntheticOhlcStub`'s docstring), isto NUNCA
    // sozinho — só um `reset()` OU uma resposta que falha (`coverageFloorMs`, que trava
    // PERMANENTEMENTE) o interrompe. Por isso este spec NÃO tenta esperar "silêncio" antes de
    // medir (`waitForHistoryProbeQuiet` teria feito isso — e nunca teria retornado): a única
    // invariante que sobrevive a essa descoberta é GLOBAL, válida desde o load da página —
    // `drawnMs.length === requestedMs.length + 1` sempre (o "+1" é o `setData` do MOUNT inicial,
    // sem pedido por trás) — e é essa invariante, não um reset, que este spec usa para parear.

    // Um arrasto real de qualquer forma — DoD 7 pede "disparadas por arrasto", e este spec
    // dirige um gesto genuíno mesmo sabendo (achado acima) que páginas já se acumulam sem ele.
    const before = await readPriceRange(page);
    const box = await priceContainerLocator(page).boundingBox();
    if (box === null) {
      throw new Error("painel de Preço: sem bounding box — nada montado");
    }
    const pxPerSlot = box.width / (before.to - before.from);
    const deltaXPx = Math.max(10, pxPerSlot * TARGET_SHIFT_SLOTS);
    fact(SPEC, "drag_delta_px", Number(deltaXPx.toFixed(2)));
    await dragRight(page, deltaXPx);

    // Espera n >= MIN_PAGES + margem pedidos acumulados — pelo arrasto acima e/ou pelo
    // laço-achado, os dois indistinguíveis nesta medição (é exatamente o que o achado documenta).
    // A margem (+2) existe porque o laço nunca fica quieto (achado acima): no instante exato em
    // que lemos as duas sondas, o ÚLTIMO pedido pode ainda estar em voo (`drawnMs.length ===
    // requestedMs.length`, não `+1`) — `[MEDIDO 2026-09-23]` — então o par abaixo DESCARTA
    // deliberadamente essa cauda em vez de assumir a instantânea "+1" como garantida.
    const PAIR_MARGIN = 2;
    await expect
      .poll(async () => (await page.evaluate(() => window.__historyPageLatencyProbe?.requestedMs.length ?? 0)), {
        timeout: 20_000,
        message: `menos de ${MIN_PAGES + PAIR_MARGIN} páginas solicitadas em 20s`,
      })
      .toBeGreaterThanOrEqual(MIN_PAGES + PAIR_MARGIN);

    const probe = await page.evaluate(() => ({
      requestedMs: window.__historyPageLatencyProbe?.requestedMs ?? [],
      drawnMs: window.__historyPageLatencyProbe?.drawnMs ?? [],
    }));
    fact(SPEC, "history_page_requested_n", probe.requestedMs.length);
    fact(SPEC, "history_page_drawn_n", probe.drawnMs.length);
    // `drawnMs.length` no instante da leitura é `requestedMs.length` (um pedido ainda em voo) ou
    // `requestedMs.length + 1` (nada em voo, o "+1" é o setData do mount inicial) — nunca outro
    // valor, dado o contrato serial (`D-C3.5`: uma requisição em voo por grade). `pairCount`
    // descarta a cauda possivelmente não resolvida em vez de assumir qual dos dois casos vale.
    expect(
      probe.drawnMs.length,
      `drawnMs (${probe.drawnMs.length}) deveria ser requestedMs (${probe.requestedMs.length}) ` +
        "ou requestedMs+1 — nenhum outro valor é possível sob o contrato serial (D-C3.5)",
    ).toBeGreaterThanOrEqual(probe.requestedMs.length);
    const pairCount = Math.min(probe.requestedMs.length, probe.drawnMs.length - 1);
    fact(SPEC, "history_page_pair_n", pairCount);
    expect(
      pairCount,
      `apenas ${pairCount} pares requested/drawn completos — esperado >= ${MIN_PAGES} (plan 05 DoD 7)`,
    ).toBeGreaterThanOrEqual(MIN_PAGES);

    const latenciesMs = Array.from({ length: pairCount }, (_, i) => probe.drawnMs[i + 1]! - probe.requestedMs[i]!);
    const sorted = [...latenciesMs].sort((a, b) => a - b);
    const p95Index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.95 * sorted.length) - 1));
    const p95 = sorted[p95Index]!;
    const max = sorted[sorted.length - 1]!;
    const p50 = sorted[Math.floor(sorted.length / 2)]!;

    fact(SPEC, "history_page_latencies_ms", latenciesMs.map((v) => Number(v.toFixed(2))));
    fact(SPEC, "history_page_latency_p50_ms", Number(p50.toFixed(2)));
    fact(SPEC, "history_page_latency_p95_ms", Number(p95.toFixed(2)));
    fact(SPEC, "history_page_latency_max_ms", Number(max.toFixed(2)));

    expect(
      p95,
      `p95 da latência borda->desenho é ${p95.toFixed(2)} ms (max ${max.toFixed(2)} ms, p50 ` +
        `${p50.toFixed(2)} ms, n=${latenciesMs.length}) — teto é ${LATENCY_CEILING_MS} ms (plan 05 DoD 7)`,
    ).toBeLessThanOrEqual(LATENCY_CEILING_MS);
    // Nenhuma latência pode ser negativa — negativa seria evidência de que o pareamento por
    // índice (a invariante acima) quebrou, não um resultado válido rápido demais.
    expect(
      Math.min(...latenciesMs),
      `latência negativa encontrada — pareamento requestedMs[i]/drawnMs[i+1] quebrou: ${JSON.stringify(latenciesMs)}`,
    ).toBeGreaterThanOrEqual(0);

    // ── Composição dos dois tetos (DoD 7, último parágrafo) ──────────────────────────────────
    // Achado, não conserto: se isto morder, é sintoma de que a paginação entrou no quadro de
    // pan — registrado no QA Gate Context Block desta task, correção (se houver) é da fase 02.
    // Dado o achado acima (paginação roda continuamente desde o mount, nunca "quieta"), não há
    // uma janela limpa "durante a paginação" para isolar — os `6` primeiros samples são o mount
    // (`17-teto-latencia-eixo.spec.ts`'s próprio achado, "6 aplicações do próprio mount"); todo
    // o resto, pelo raciocínio acima, é inerentemente "durante paginação" nesta medição.
    const axisSamplesMs = await page.evaluate(() => window.__axisLatencyProbe?.samplesMs ?? []);
    const MOUNT_SAMPLES = 6;
    const pagingSamplesMs = axisSamplesMs.slice(MOUNT_SAMPLES);
    const axisIntervalsMs: number[] = [];
    for (let i = 1; i < pagingSamplesMs.length; i += 1) {
      axisIntervalsMs.push(pagingSamplesMs[i]! - pagingSamplesMs[i - 1]!);
    }
    const axisMaxIntervalMs = axisIntervalsMs.length > 0 ? Math.max(...axisIntervalsMs) : 0;
    fact(SPEC, "axis_samples_total_n", axisSamplesMs.length);
    fact(SPEC, "axis_samples_during_paging_n", pagingSamplesMs.length);
    fact(SPEC, "axis_max_interval_during_paging_ms", Number(axisMaxIntervalMs.toFixed(2)));
    expect(
      axisMaxIntervalMs,
      `intervalo máximo entre aplicações de eixo DURANTE a paginação foi ${axisMaxIntervalMs.toFixed(2)} ms ` +
        `(teto recalibrado de T-02.7 é ${PAN_FRAME_CEILING_MS} ms) — sintoma de que a paginação entrou no quadro de pan`,
    ).toBeLessThanOrEqual(PAN_FRAME_CEILING_MS);
  } finally {
    if (instance !== undefined) await instance.close();
    await stub.close();
  }
});
