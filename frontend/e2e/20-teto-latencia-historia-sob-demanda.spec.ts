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
 * ── `T-05-FIX` FECHOU O AUTO-DISPARO; `T-05.9` FECHOU A CORRIDA QUE ELE ESCONDIA ────────────────
 *
 * Três achados em sequência sobre este MESMO mecanismo, cada um só visível depois do anterior
 * fechar. `T-05-FIX` (3 rodadas, mergeadas antes desta task) mediu e fechou o auto-disparo da
 * paginação a partir do próprio settle do mount (`requestedMs.length` crescendo sem nenhum
 * arrasto) — verificado com uma sonda de zero-gesto, estável (probe de zero-gesto, estável em
 * `12 s`). Isso tirou o disfarce de um SEGUNDO defeito: sob arrastos REAIS rápidos e sucessivos
 * (não mais sob o loop-bug), `use-history-pager.ts`'s `inFlightRef` deixava passar uma segunda
 * requisição antes da primeira aplicar seu resultado — `widenAndCapWindow`'s "page.toMs must
 * equal current.startMs" disparava depois de ~7 páginas reais em sequência rápida (achado da
 * rodada 3 do `T-05-FIX`, não corrigido ali).
 *
 * A CAUSA (`T-05.9`, `use-history-pager.ts`): `inFlightRef.current` era limpo em `finally`, mas
 * `axisRef.current`/`windowRef.current` só eram atualizados pela LINHA DE RENDER
 * (`axisRef.current = axis;`), que só corre depois que React comita o `setWindowState` daquele
 * mesmo `fetchPage`. Entre o `finally` (guarda liberada) e o commit (refs atualizadas) havia uma
 * fresta: um segundo `onCandidateRange` — disparado por um arrasto rápido seguinte — lia
 * `axisRef.current` ainda apontando para a janela ANTERIOR, calculava `req.toMs` a partir dela, e
 * só descobria o descompasso quando a SUA PRÓPRIA resposta chegava (por essa altura, o commit do
 * primeiro `fetchPage` já tinha avançado `windowRef.current` para a janela nova). O fix: as refs
 * agora são escritas SINCRONAMENTE dentro do próprio `fetchPage`, no mesmo trecho síncrono que
 * limpa `inFlightRef` — a guarda e os dados que ela protege ficam consistentes no MESMO instante,
 * nunca um render-tick adiantado.
 *
 * Com os dois fechados, este spec dirige `n >= 12` arrastos REAIS em sequência — nunca mais
 * dependendo de nenhum comportamento auto-disparado — cada um esperando (pela sonda) a página do
 * arrasto anterior ter sido DESENHADA antes do próximo começar, o mesmo contrato serial `D-C3.5`
 * pede da própria paginação, aplicado aqui na cadência do GESTO.
 *
 * ── A COMPOSIÇÃO DOS DOIS TETOS (DoD 7, último parágrafo) ─────────────────────────────────────
 *
 * O DoD pede que NENHUM quadro de pan durante a paginação estoure o teto irmão de `T-02.7`. Esse
 * teto nasceu `16 ms` e foi RECALIBRADO para `160 ms` (`[DECISÃO-OWNER: 2026-09-22]`,
 * `17-teto-latencia-eixo.spec.ts`) depois de medir que `16 ms` nunca foi alcançável neste MESMO
 * ambiente de teste (Chromium headless dirigido por CDP) — este spec usa o MESMO teto recalibrado
 * para o mesmo instrumento, não o número original que já foi substituído. Com o auto-disparo
 * fechado (`T-05-FIX`), a paginação só roda enquanto este spec a dirige: os `6` primeiros samples
 * de `window.__axisLatencyProbe` são o mount (`17-*.spec.ts`'s próprio achado, "6 aplicações do
 * próprio mount"); cada sample seguinte é um remonte disparado por uma página que ESTE spec
 * pediu via arrasto — a janela "durante a paginação" agora é exatamente essa cauda, sem
 * ambiguidade com nenhum laço de fundo.
 *
 * ── `T-01.F2` (paineis-de-fluxo): THE INSTRUMENT MEASURED THE DRIVER, AND HID A REAL DEFECT ──
 *
 * `gates/DIAG-e2e-master.md` §4 (paineis-de-fluxo) measured that the composition check above
 * summed the DRIVER's own pause between two gestures (`waitForTimeout(100)` + `mouse.up` + probe
 * waits + `boundingBox` reads + `waitForTimeout(100)`: 242-293 ms no user ever produces) into
 * "one pan frame": 10 intervals above 160 ms per round, 3/3 rounds, ALL of them between
 * gestures; inside `[moveStart, moveEnd]` the max was 66.5-82.6 ms (`n = 243` per round). So
 * (`handoff/FIX-regressoes-fase05.md` §4.1):
 *
 *  1. the pan-frame ceiling (still `160 ms`) is now checked ONLY on intervals whose two samples
 *     both fall inside the `[moveStart, moveEnd]` of one gesture — the DIAG's own method;
 *  2. a NEW assertion: in every gesture where a page was DRAWN while the mouse was still moving
 *     (with at least one pan-frame ceiling of movement left), the Price range, IN TIME, keeps
 *     changing after the page — `>= 2` distinct values. In time (`data-window-start-ms` on
 *     `<main>` + `data-visible-logical-from` × grid step, read in the SAME `MutationObserver`
 *     callback), never in logical index: without a remount, a page that prepends `k` bars shifts
 *     the logical index by `+k` without moving the view. Today every page REMOUNTS the six charts
 *     and the rest of the drag is dropped (DIAG §4: 24/24 gestures parked on the re-frame value),
 *     so this assertion is RED on purpose — the honest red, until `T-01.8` re-anchors it on the
 *     single-host code;
 *  3. the time jump AT the page boundary (last sample before the page vs first after) is only a
 *     `fact`, never asserted: its threshold depends on code that does not exist yet (`T-01.8`
 *     calibrates it and turns it into an assertion with an ablation).
 *
 * Run with: `make e2e` (ou `npx playwright test 20-teto-latencia-historia-sob-demanda
 * --config=frontend/playwright.config.ts`), contra `E2E_API_PORT=8811 E2E_NEXT_PORT=4311`.
 */

const SPEC = "20-teto-latencia-historia-sob-demanda";
const SYMBOL = "BTCUSDT";
const SYMBOL_PATH = `/symbol/${SYMBOL}`;
const PRICE_PANE_TESTID = "price-pane";
/** `paineis-de-fluxo` `T-01.6`: the ONE chart host publishes `data-visible-logical-from`/`-to`
 * (`SymbolClient.tsx::ChartHostSurface`); the panes share one time scale, so the host's range IS
 * the Price pane's range. The Price pane's DOM is now a layer portalled into the pane's canvas
 * wrapper — the canvases' sibling, not their ancestor — so it no longer contains that attribute. */
const CHART_HOST_TESTID = "symbol-chart-host";

/** `[DECISÃO-OWNER: 2026-09-19, escolha entre alternativas apresentadas]` — plan `05` DoD 7,
 * literal: "400 ms até aparecer". */
const LATENCY_CEILING_MS = 400;
/** Plan `05` DoD 7, literal: "n >= 10 paginações". */
const MIN_PAGES = 10;
/** `T-05.9` — número de arrastos REAIS, sequenciais, este spec dirige. Acima de `MIN_PAGES` com
 * a mesma margem (`+2`) que a versão anterior deste spec usava para a cauda possivelmente em
 * voo (`pairCount`'s próprio docstring, abaixo) — só que agora a margem cobre o mesmo risco sob
 * gestos reais, não sob um laço de fundo. */
const DRAG_COUNT = MIN_PAGES + 2;
/** Teto de espera, por arrasto, para (a) a página que ELE disparou aparecer em `requestedMs` e
 * (b) essa mesma página ser DESENHADA (`drawnMs` alcançar `requestedMs`) antes do próximo arrasto
 * começar — bem acima do teto de `400 ms` que DoD 7 mede, para não confundir um timeout de
 * sincronização do PRÓPRIO spec com uma violação do teto medido abaixo. */
const PER_DRAG_TIMEOUT_MS = 10_000;

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
 * ever landed. Since `T-01.5` the mount no longer sits at the edge (the library clamps the initial
 * range at `minBarSpacing`); `panToLoadedLeftEdge` walks there before the counted drags start. */
const TARGET_SHIFT_SLOTS = PAGE_SLOTS + 140;

const ONE_MINUTE_MS = 60_000;
const OHLC_METRIC = "klines_ohlc";
const OHLC_PROVIDER = "binance";
const OHLC_REDUCTIONS = ["OPEN", "HIGH", "LOW", "CLOSE"] as const;

/** `s2-panels.ts::S2_AXIS_STEP_MS` (`= ONE_MINUTE_MS`) — the grid step that converts the Price
 * pane's logical index into an instant. Copied as a literal for the same reason as `PAGE_SLOTS`:
 * the spec needs the vocabulary, not the module. This spec only drives the default `1m` TF. */
const GRID_STEP_MS = ONE_MINUTE_MS;

/** One Price-range sample: the instant (`performance.now()`, the same clock both probes use) and
 * the two attributes read in the SAME `MutationObserver` callback. */
interface PriceTimeSample {
  readonly atMs: number;
  readonly logicalFrom: number;
  readonly windowStartMs: number;
}

declare global {
  interface Window {
    __historyPageLatencyProbe?: { requestedMs: number[]; drawnMs: number[]; reset(): void };
    __axisLatencyProbe?: { samplesMs: number[]; reset(): void };
    __priceTimeSamples?: PriceTimeSample[];
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

/** The Price pane's canvas — the rectangle a drag must start in (same re-anchoring as
 * `21-arrasto-historia-parede-e-ablacao.spec.ts` after `T-01.6`). */
function priceContainerLocator(page: Page) {
  return page.locator(`[data-testid="${PRICE_PANE_TESTID}"]`).locator("xpath=../canvas").first();
}

async function readPriceRange(page: Page): Promise<PriceRange> {
  const container = page.locator(`[data-testid="${CHART_HOST_TESTID}"]`);
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
 *
 * `T-01.F2`: returns the gesture's `[moveStart, moveEnd]` on the page's own `performance.now()`
 * clock — read right before the first `move` and right after the last one resolves, so neither
 * 100 ms pause nor anything the driver does between gestures is inside the window
 * (`DIAG-e2e-master-20-intra-inter.spec.ts.txt`'s method).
 */
interface GestureWindow {
  readonly moveStartMs: number;
  readonly moveEndMs: number;
}

async function dragRight(page: Page, deltaXPx: number): Promise<GestureWindow> {
  const box = await priceContainerLocator(page).boundingBox();
  if (box === null) {
    throw new Error("price pane: no bounding box — nothing mounted");
  }
  const startX = box.x + box.width * 0.5;
  const y = box.y + box.height / 2;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.waitForTimeout(100);
  const moveStartMs = await page.evaluate(() => performance.now());
  await page.mouse.move(startX + deltaXPx, y, { steps: 30 });
  const moveEndMs = await page.evaluate(() => performance.now());
  await page.waitForTimeout(100);
  await page.mouse.up();
  return { moveStartMs, moveEndMs };
}

async function probeCounts(page: Page): Promise<{ readonly requested: number; readonly drawn: number }> {
  return page.evaluate(() => ({
    requested: window.__historyPageLatencyProbe?.requestedMs.length ?? 0,
    drawn: window.__historyPageLatencyProbe?.drawnMs.length ?? 0,
  }));
}

/**
 * `T-05.9` — dirige `DRAG_COUNT` arrastos REAIS, um de cada vez, cada um esperando (pela sonda,
 * nunca por um tempo fixo) que a PRÓPRIA página desse arrasto tenha sido pedida e então DESENHADA
 * antes do próximo arrasto começar. Isto é o contrato serial de `D-C3.5` reaplicado na cadência
 * do GESTO: sem esta espera, dois arrastos rápidos poderiam disparar dois `onCandidateRange`
 * antes de qualquer um resolver — exatamente a corrida que o fix de `use-history-pager.ts` fecha
 * DENTRO do pager, mas que só não se manifesta aqui porque este spec nunca tenta produzi-la (a
 * corrida em si já está coberta pelo fix; este spec mede latência, não re-testa a corrida).
 *
 * Recalcula `pxPerSlot` a cada iteração (em vez de uma vez só no início) porque cada página
 * aterrissada pode ter mudado a relação pixel/slot do range visível — o mesmo raciocínio que já
 * levou `TARGET_SHIFT_SLOTS` a somar margem ao `PAGE_SLOTS` de uma página.
 *
 * Nem todo arrasto necessariamente cruza a zona de gatilho (`historyRequest`'s próprio
 * `distanceFromEdgeMs >= triggerMs` — variação de layout entre iterações pode deixar um arrasto
 * curto demais); quando isso acontece, `requested` não cresce e a espera por essa metade é
 * dispensada (não há pedido novo para esperar), e a iteração conta como um arrasto sem página —
 * o loop segue, e a asserção de `pairCount >= MIN_PAGES` no fim do teste é quem cobra o total.
 */
async function driveSequentialDrags(page: Page, count: number): Promise<GestureWindow[]> {
  const gestures: GestureWindow[] = [];
  for (let i = 0; i < count; i += 1) {
    const before = await readPriceRange(page);
    // The host's width is the chart's full width — the same width the pre-`T-01.6` Price
    // container had — so `pxPerSlot` keeps the geometry the drag delta was calibrated on.
    const box = await page.locator(`[data-testid="${CHART_HOST_TESTID}"]`).boundingBox();
    if (box === null) {
      throw new Error("chart host: no bounding box — nothing mounted");
    }
    const pxPerSlot = box.width / (before.to - before.from);
    const deltaXPx = Math.max(10, pxPerSlot * TARGET_SHIFT_SLOTS);
    fact(SPEC, `drag_delta_px:${i}`, Number(deltaXPx.toFixed(2)));
    fact(SPEC, `drag_logical_from_before:${i}`, Number(before.from.toFixed(2)));

    const counts = await probeCounts(page);
    gestures.push(await dragRight(page, deltaXPx));

    const requestedGrew = await page
      .waitForFunction((n) => (window.__historyPageLatencyProbe?.requestedMs.length ?? 0) > n, counts.requested, {
        timeout: PER_DRAG_TIMEOUT_MS,
      })
      .then(() => true)
      .catch(() => false);
    fact(SPEC, `drag_requested_new_page:${i}`, requestedGrew);
    if (!requestedGrew) {
      continue;
    }
    const afterRequest = await probeCounts(page);
    // Espera a PRÓPRIA página deste arrasto ser desenhada antes do próximo arrasto começar —
    // nunca dispara dois arrastos com uma página ainda em voo.
    await page.waitForFunction((n) => (window.__historyPageLatencyProbe?.drawnMs.length ?? 0) >= n, afterRequest.requested, {
      timeout: PER_DRAG_TIMEOUT_MS,
    });
  }
  return gestures;
}

/** Most pre-roll drags `panToLoadedLeftEdge` may drive before giving up. The seed is 5 760 slots,
 * and each pre-roll drag moves up to `TARGET_SHIFT_SLOTS` (640) of them, so ~9 would cross the
 * whole seed even from `from = 5760`. */
const MAX_PREROLL_DRAGS = 20;
/** Where a pre-roll drag parks the left edge at the closest: half a page from the loaded edge,
 * well outside `DEFAULT_PAGE_TRIGGER_SLOTS` (20), so pre-roll does not normally fire a page. */
const PREROLL_PARK_SLOTS = PAGE_SLOTS / 2;

/**
 * Pans the view back until its left edge is within ONE counted drag (`TARGET_SHIFT_SLOTS`) of the
 * loaded edge, so every drag `driveSequentialDrags` counts after this is an EDGE drag.
 *
 * Why this exists: until `T-01.5` the pager read its range from the store's `initialRange` (the
 * WHOLE grid), so the mount "already sat at the edge" and every drag fired a page (12/12). Since
 * `T-01.5` the store follows the time scale's REAL range, and with 5 760 slots in a 1 280 px host
 * the library clamps at its default `minBarSpacing` (0.5 px) and shows only the right-most
 * ~2 443 slots `[MEDIDO 2026-09-25: logical range at mount 3317..5760, w=1280]`. The first 5 drags
 * then only panned through loaded data and fired no page: 9 pages instead of >= 10. Those drags
 * measure no paging latency, so they run here, BEFORE the probe `reset()`, and not in the counted
 * loop.
 *
 * Every drag waits for any page it happened to fire to be drawn, so nothing is in flight at the
 * `reset()` that follows.
 */
async function panToLoadedLeftEdge(page: Page): Promise<number> {
  for (let i = 0; i < MAX_PREROLL_DRAGS; i += 1) {
    const before = await readPriceRange(page);
    if (before.from <= TARGET_SHIFT_SLOTS) {
      return i;
    }
    const box = await page.locator(`[data-testid="${CHART_HOST_TESTID}"]`).boundingBox();
    if (box === null) {
      throw new Error("chart host: no bounding box — nothing mounted");
    }
    const pxPerSlot = box.width / (before.to - before.from);
    const shiftSlots = Math.min(TARGET_SHIFT_SLOTS, before.from - PREROLL_PARK_SLOTS);
    await dragRight(page, Math.max(10, pxPerSlot * shiftSlots));
    await page.waitForFunction(
      () =>
        (window.__historyPageLatencyProbe?.drawnMs.length ?? 0) >=
        (window.__historyPageLatencyProbe?.requestedMs.length ?? 0),
      undefined,
      { timeout: PER_DRAG_TIMEOUT_MS },
    );
  }
  const last = await readPriceRange(page);
  throw new Error(
    `pre-roll: left edge still at logical ${last.from} after ${MAX_PREROLL_DRAGS} drags — ` +
      `expected <= ${TARGET_SHIFT_SLOTS}; the drag is not panning`,
  );
}

/** `T-01.F2` — starts recording the Price range IN TIME. Every `MutationObserver` callback that
 * saw a `data-visible-logical-from` write on the chart host (since `T-01.6` the one element that
 * carries the shared range) reads, in that same callback, the host's current
 * `data-visible-logical-from` and `<main>`'s current `data-window-start-ms` (the
 * pager's window start, re-rendered on every landed page). Installed after the probe `reset()`,
 * so only the drags below are recorded. */
async function startPriceTimeRecorder(page: Page): Promise<void> {
  await page.evaluate((hostTestId) => {
    const samples: PriceTimeSample[] = [];
    window.__priceTimeSamples = samples;
    const hostSelector = `[data-testid="${hostTestId}"]`;
    new MutationObserver((records) => {
      const touchedHost = records.some((r) => r.target instanceof Element && r.target.matches(hostSelector));
      if (!touchedHost) {
        return;
      }
      const container = document.querySelector(hostSelector);
      const main = document.querySelector("main[data-window-start-ms]");
      const logicalFrom = Number(container?.getAttribute("data-visible-logical-from"));
      const windowStartMs = Number(main?.getAttribute("data-window-start-ms"));
      if (!Number.isFinite(logicalFrom) || !Number.isFinite(windowStartMs)) {
        return;
      }
      samples.push({ atMs: performance.now(), logicalFrom, windowStartMs });
    }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ["data-visible-logical-from"] });
  }, CHART_HOST_TESTID);
}

function sampleTimeMs(sample: PriceTimeSample): number {
  return Math.round(sample.windowStartMs + sample.logicalFrom * GRID_STEP_MS);
}

/** Axis-application intervals split by the gesture windows (`DIAG-e2e-master-20-intra-inter
 * .spec.ts.txt`, same `+1 ms` tolerance on the window's end): an interval is INTRA-gesture only if
 * both of its samples fall inside one `[moveStart, moveEnd]`. Everything else crosses the
 * driver's own idle between gestures. */
function splitAxisIntervals(
  axisSamplesMs: readonly number[],
  gestures: readonly GestureWindow[],
): { readonly intraMs: number[]; readonly otherMs: number[] } {
  const intraMs: number[] = [];
  const otherMs: number[] = [];
  for (let i = 1; i < axisSamplesMs.length; i += 1) {
    const a = axisSamplesMs[i - 1]!;
    const b = axisSamplesMs[i]!;
    const inside = gestures.some((g) => a >= g.moveStartMs && b <= g.moveEndMs + 1);
    (inside ? intraMs : otherMs).push(b - a);
  }
  return { intraMs, otherMs };
}

interface GesturePageVerdict {
  readonly gesture: number;
  readonly pageDrawnAfterMoveStartMs: number;
  readonly moveLeftAfterPageMs: number;
  readonly samplesAfterPage: number;
  readonly distinctTimesAfterPage: number;
  /** Control on the same gesture: distinct instants between `moveStart` and the page. `>= 2`
   * here while `distinctTimesAfterPage < 2` shows the recorder sees a moving range — it is the
   * drag that stopped, not the instrument that is blind. */
  readonly distinctTimesBeforePage: number;
  /** Time jump across the page boundary, in grid slots — `fact` only, never asserted (T-01.8). */
  readonly boundaryJumpSlots: number | null;
}

/** For every gesture in which a page was DRAWN while the mouse was still moving: how many
 * distinct Price-range instants the rest of the move produced after that (first) page. */
function judgePagesDrawnMidGesture(
  gestures: readonly GestureWindow[],
  drawnMs: readonly number[],
  samples: readonly PriceTimeSample[],
): GesturePageVerdict[] {
  const verdicts: GesturePageVerdict[] = [];
  gestures.forEach((g, gesture) => {
    const pageMs = drawnMs.find((d) => d >= g.moveStartMs && d < g.moveEndMs);
    if (pageMs === undefined) {
      return;
    }
    const after = samples.filter((s) => s.atMs > pageMs && s.atMs <= g.moveEndMs);
    const before = samples.filter((s) => s.atMs <= pageMs);
    const lastBefore = before.length > 0 ? before[before.length - 1]! : undefined;
    const firstAfter = samples.find((s) => s.atMs > pageMs);
    verdicts.push({
      gesture,
      pageDrawnAfterMoveStartMs: Number((pageMs - g.moveStartMs).toFixed(1)),
      moveLeftAfterPageMs: Number((g.moveEndMs - pageMs).toFixed(1)),
      samplesAfterPage: after.length,
      distinctTimesAfterPage: new Set(after.map(sampleTimeMs)).size,
      distinctTimesBeforePage: new Set(
        samples.filter((s) => s.atMs >= g.moveStartMs && s.atMs <= pageMs).map(sampleTimeMs),
      ).size,
      boundaryJumpSlots:
        lastBefore !== undefined && firstAfter !== undefined
          ? Number(((sampleTimeMs(firstAfter) - sampleTimeMs(lastBefore)) / GRID_STEP_MS).toFixed(2))
          : null,
    });
  });
  return verdicts;
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

    // Pre-roll: pan through the loaded seed to its left edge first, so the counted drags below
    // are all edge drags (see `panToLoadedLeftEdge`'s docstring for the measured why).
    fact(SPEC, "preroll_logical_from_at_mount", Number((await readPriceRange(page)).from.toFixed(2)));
    fact(SPEC, "preroll_drags_n", await panToLoadedLeftEdge(page));

    // `reset()` ANTES do primeiro arrasto — `history-page-latency-probe.ts`'s próprio docstring:
    // "a caller that wants only page-triggered pairs calls `reset()` once the initial paint has
    // settled, before driving any drag". Sem isto, `drawnMs` carregaria o `setData` do MOUNT
    // inicial (sem pedido atrás) e o predicado de borda já satisfeito no mount
    // (`AxisSyncStore`'s `initialRange` é o grid inteiro, ver docstring deste arquivo) poderia
    // somar um pedido "de graça" antes do loop — o `reset()` faz `requestedMs[i]`/`drawnMs[i]`
    // (MESMO índice, sem deslocamento) ser exclusivamente os `DRAG_COUNT` arrastos abaixo.
    await page.evaluate(() => window.__historyPageLatencyProbe?.reset());
    await startPriceTimeRecorder(page);

    // `T-05.9` — `DRAG_COUNT` arrastos REAIS, sequenciais, cada um esperando a página do arrasto
    // anterior ter sido desenhada antes do próximo começar. Ver `driveSequentialDrags`'s próprio
    // docstring para o porquê da espera por-arrasto (é o contrato serial de `D-C3.5` reaplicado
    // na cadência do gesto).
    const gestures = await driveSequentialDrags(page, DRAG_COUNT);

    const probe = await page.evaluate(() => ({
      requestedMs: window.__historyPageLatencyProbe?.requestedMs ?? [],
      drawnMs: window.__historyPageLatencyProbe?.drawnMs ?? [],
    }));
    fact(SPEC, "history_page_requested_n", probe.requestedMs.length);
    fact(SPEC, "history_page_drawn_n", probe.drawnMs.length);
    // Pós-`reset()`, cada arrasto que efetivamente pediu uma página também esperou (dentro do
    // loop) essa MESMA página ser desenhada antes do próximo começar — então, ao chegar aqui,
    // `drawnMs.length` tem de ser EXATAMENTE `requestedMs.length` (índice a índice, sem o "+1" do
    // mount que o `reset()` acima já descartou, e sem cauda em voo — o loop nunca avança para o
    // próximo arrasto com um pedido pendente).
    expect(
      probe.drawnMs.length,
      `drawnMs (${probe.drawnMs.length}) deveria ser EXATAMENTE requestedMs (${probe.requestedMs.length}) ` +
        "pós-reset — driveSequentialDrags espera cada página desenhar antes do próximo arrasto",
    ).toBe(probe.requestedMs.length);
    const pairCount = probe.requestedMs.length;
    fact(SPEC, "history_page_pair_n", pairCount);
    expect(
      pairCount,
      `apenas ${pairCount} páginas disparadas por arrasto — esperado >= ${MIN_PAGES} (plan 05 DoD 7)`,
    ).toBeGreaterThanOrEqual(MIN_PAGES);

    const latenciesMs = Array.from({ length: pairCount }, (_, i) => probe.drawnMs[i]! - probe.requestedMs[i]!);
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
    // Medição honesta, não conserto: este bloco pode morder, e se morder é sintoma de que a
    // paginação entrou no quadro de pan — este spec MEDE a composição (`T-05.9`'s próprio
    // handoff: "pode passar ou reprovar honestamente, mas TEM que medir"), não a conserta; se
    // reprovar, é achado para a fase `02` (dona do teto de `T-02.7`), não desta task. Os `6`
    // primeiros samples de `window.__axisLatencyProbe` são o mount (`17-teto-latencia-eixo
    // .spec.ts`'s próprio achado, "6 aplicações do próprio mount"); todo sample depois desses `6`
    // é, sob os `DRAG_COUNT` arrastos que este spec agora dirige, um remonte disparado por uma
    // página que ESTE spec pediu — a janela "durante a paginação" é exatamente essa cauda.
    //
    // `T-01.F2`: the paragraph above is kept for history, but the cut changed. The old cut (every
    // sample after the first 6) also held the driver's idle BETWEEN gestures, 242-293 ms per
    // `DIAG-e2e-master.md` §4, and that idle is what failed `160`. The ceiling now applies only to
    // intervals inside one gesture's `[moveStart, moveEnd]`; the old number stays as a `fact` so
    // `T-01.10` can see both on the same run.
    const axisSamplesMs = await page.evaluate(() => window.__axisLatencyProbe?.samplesMs ?? []);
    const MOUNT_SAMPLES = 6;
    const pagingSamplesMs = axisSamplesMs.slice(MOUNT_SAMPLES);
    const legacyIntervalsMs: number[] = [];
    for (let i = 1; i < pagingSamplesMs.length; i += 1) {
      legacyIntervalsMs.push(pagingSamplesMs[i]! - pagingSamplesMs[i - 1]!);
    }
    const legacyMaxIntervalMs = legacyIntervalsMs.length > 0 ? Math.max(...legacyIntervalsMs) : 0;
    fact(SPEC, "axis_samples_total_n", axisSamplesMs.length);
    fact(SPEC, "axis_samples_during_paging_n", pagingSamplesMs.length);
    fact(SPEC, "axis_max_interval_during_paging_ms_incl_driver_idle", Number(legacyMaxIntervalMs.toFixed(2)));

    const { intraMs, otherMs } = splitAxisIntervals(axisSamplesMs, gestures);
    const intraSorted = [...intraMs].sort((a, b) => a - b);
    const intraMaxMs = intraSorted.length > 0 ? intraSorted[intraSorted.length - 1]! : 0;
    fact(SPEC, "gesture_windows_n", gestures.length);
    fact(SPEC, "gesture_move_duration_ms", gestures.map((g) => Number((g.moveEndMs - g.moveStartMs).toFixed(1))));
    fact(SPEC, "axis_intra_gesture_interval_n", intraMs.length);
    fact(SPEC, "axis_intra_gesture_interval_max_ms", Number(intraMaxMs.toFixed(2)));
    fact(
      SPEC,
      "axis_intra_gesture_interval_p95_ms",
      intraSorted.length > 0 ? Number(intraSorted[Math.ceil(0.95 * intraSorted.length) - 1]!.toFixed(2)) : null,
    );
    fact(SPEC, "axis_intra_gesture_interval_over_ceiling_n", intraMs.filter((v) => v > PAN_FRAME_CEILING_MS).length);
    fact(SPEC, "axis_other_interval_n", otherMs.length);
    fact(SPEC, "axis_other_interval_over_ceiling_n", otherMs.filter((v) => v > PAN_FRAME_CEILING_MS).length);
    // Non-vacuity: a cut that keeps nothing would pass any ceiling.
    expect(
      intraMs.length,
      "nenhum intervalo de eixo caiu dentro de [moveStart, moveEnd] — o corte intra-gesto ficou vazio e não mede nada",
    ).toBeGreaterThan(0);
    // Soft, so a regression here never hides the verdict on the range assertion below.
    expect
      .soft(
        intraMaxMs,
        `intervalo máximo entre aplicações de eixo DENTRO de um gesto foi ${intraMaxMs.toFixed(2)} ms ` +
          `(n=${intraMs.length}; teto recalibrado de T-02.7 é ${PAN_FRAME_CEILING_MS} ms) — a paginação entrou no quadro de pan`,
      )
      .toBeLessThanOrEqual(PAN_FRAME_CEILING_MS);

    // ── `T-01.F2`: the Price range, IN TIME, keeps moving after a page drawn mid-gesture ──────
    // Eligible gesture: its (first) page was drawn while the mouse was still moving, with at
    // least one pan-frame ceiling of movement left — the same `160 ms` inside which a live pan
    // must apply a frame, so an eligible gesture that stays parked is not "too little movement
    // left", it is a dropped drag.
    const priceSamples = await page.evaluate(() => window.__priceTimeSamples ?? []);
    const verdicts = judgePagesDrawnMidGesture(gestures, probe.drawnMs, priceSamples);
    const eligible = verdicts.filter((v) => v.moveLeftAfterPageMs >= PAN_FRAME_CEILING_MS);
    const parked = eligible.filter((v) => v.distinctTimesAfterPage < 2);
    fact(SPEC, "price_time_samples_n", priceSamples.length);
    fact(SPEC, "gestures_with_page_drawn_mid_move_n", verdicts.length);
    fact(SPEC, "gestures_with_page_drawn_mid_move_eligible_n", eligible.length);
    fact(SPEC, "gestures_parked_after_page_n", parked.length);
    fact(SPEC, "gesture_page_verdicts", verdicts);
    // Recorded, never asserted: `T-01.8` measures the threshold on the single-host code.
    fact(
      SPEC,
      "page_boundary_jump_slots",
      verdicts.map((v) => v.boundaryJumpSlots),
    );
    expect(
      eligible.length,
      `nenhum gesto teve página desenhada com >= ${PAN_FRAME_CEILING_MS} ms de movimento pela frente ` +
        `(${verdicts.length} com página no meio do gesto) — a asserção abaixo ficaria vazia`,
    ).toBeGreaterThan(0);
    expect(
      parked.map((v) => v.gesture),
      `range parado depois da página: em ${parked.length}/${eligible.length} gestos com página desenhada enquanto ` +
        `o mouse se movia, o range do Preço (em tempo) assumiu < 2 valores distintos até o fim do movimento — ` +
        `o arrasto em curso foi descartado. ${JSON.stringify(parked)}`,
    ).toEqual([]);
  } finally {
    if (instance !== undefined) await instance.close();
    await stub.close();
  }
});
