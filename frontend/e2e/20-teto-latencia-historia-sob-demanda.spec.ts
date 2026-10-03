import fs from "node:fs";
import http from "node:http";
import { monitorEventLoopDelay, performance as nodePerformance } from "node:perf_hooks";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { fact, startSecondaryNextInstance, waitForChartSettled, type NextInstanceHandle } from "./helpers.ts";
import { showView } from "./view.ts";

/**
 * `T-05.9` (`CST-242`, plan `05` `docs/plans/SPEC-008-candle-real-e-eixo-unico/05_historia_sob_demanda.md`
 * DoD 7) — the teto de latência da história sob demanda: **`p95 <= 400 ms`**, `n >= 10`
 * paginações **disparadas por arrasto**, do instante em que a borda é detectada até o primeiro
 * frame em que a barra nova está **desenhada** — nunca até a resposta HTTP chegar
 * (`[DECISÃO-OWNER: 2026-09-19]`). Fecha `[M-5]` do lado da paginação; o outro lado (`16 ms` por
 * quadro de pan, recalibrado para `160 ms` — ver abaixo) é `T-02.7`'s
 * the former `e2e/17` (`T-02.7`).
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
 * ── POR QUE UM ESTOQUE SINTÉTICO PRÓPRIO, MESMA RECEITA DE the former `e2e/17` (`T-02.7`) ────
 *
 * `make e2e`'s universo fraco (sqlite efêmero) responde `500` para `/series-history`
 * (`ADR-034/D9`) — sem NENHUM valor real, `lightweight-charts` não reconhece um arrasto de mouse
 * como pan (the former `e2e/17` (`T-02.7`)'s próprio achado medido). Este spec reusa a MESMA
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
 * the former `e2e/17` (`T-02.7`)) depois de medir que `16 ms` nunca foi alcançável neste MESMO
 * ambiente de teste (Chromium headless dirigido por CDP) — este spec usa o MESMO teto recalibrado
 * para o mesmo instrumento, não o número original que já foi substituído. Com o auto-disparo
 * fechado (`T-05-FIX`), a paginação só roda enquanto este spec a dirige: os `6` primeiros samples
 * de `window.__axisLatencyProbe` são o mount (the former `e2e/17`'s próprio achado, "6 aplicações do
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
 * ── `T-01.8` (paineis-de-fluxo): RE-ANCHORED ON THE SINGLE HOST ─────────────────────────────
 *
 *  1. PRE-WALK (`walkToLeftEdge`): with one chart the mount view is the RIGHT end of the seed, not
 *     the whole grid, so the view is walked to `PREWALK_PARK_SLOTS` from the left edge BEFORE the
 *     probe `reset()` — without paging (guarded) — and every measured drag is on the paging path;
 *  2. the legacy "first 6 samples are the mount" cut is now measured on the run;
 *  3. the instant of a sample is computed against the window start the CHART holds
 *     (`timePriceSamples`): `<main>`'s start and the host's logical range are not written atomically;
 *  4. the `T-01.F2` assertion above is GREEN on this code (the host survives the page), and the
 *     boundary jump is now an ASSERTION (`PAGE_BOUNDARY_JUMP_CEILING_SLOTS`, calibrated);
 *  5. NO CASCADE: 2 s with no input after the last page must request no page.
 *
 *  Bites (`gates/T-01.8-builder.md` §4): `axis` back in the host's mount deps (a remount per page).
 *
 * ── `T-10.20` (`estrutura-do-front`): THIS SPEC HOSTS THE FORMER `e2e/17` AND `e2e/22` ────────
 *
 * `E2E-analise.md` §5 C-5: the three specs each paid the same stub, the same second `next start`
 * and the same mount; `17` and `22` are folded in here and deleted. ONE test, in a FIXED order,
 * every verdict in its own `test.step`:
 *
 *  1. `mount` — one chart (`.tv-lightweight-charts == 1`) and one `createChart`
 *     (`data-chart-mount-count == 1`), from the former `22`;
 *  2. `cadence` — the former `17` (`T-02.7`, `RNF-2`): ONE continuous drag of `CADENCE_DRAG_STEPS`
 *     mouse steps on the mount's view, BEFORE the pre-walk, with its two verdicts — the floor of
 *     `>= CADENCE_MIN_SAMPLES` range applications and `p95 <= AXIS_CADENCE_CEILING_MS` of the
 *     intervals between them. Both SOFT: a cadence red must not hide the paging verdicts below
 *     (C-5's own risk). The ceiling and the floor are `17`'s, unchanged;
 *  3. `paging` — this spec's own flow (`T-05.9`/`T-01.8`/`T-00.4`), unchanged in what it judges;
 *  4. `host survives the pages` — the former `22` (`T-01.5`, DoD `11(b)`): after every page,
 *     `data-chart-mount-count` is still `1`. HARD, with its own message, and it runs even when step
 *     3 failed (the error of step 3 is re-thrown after it): a remount per page also breaks step 3,
 *     and the verdict that NAMES the remount must not be hidden behind it.
 *
 *  Bites (`gates/T-10.20-build.md` §4): `axis.startMs` back in the host's mount deps (step 4, with
 *  its own message); a busy main thread on every axis range application (step 2).
 *
 * Run with: `make e2e` (ou `npx playwright test 20-teto-latencia-historia-sob-demanda
 * --config=frontend/playwright.config.ts`), contra `E2E_API_PORT=8811 E2E_NEXT_PORT=4311`.
 */

const SPEC = "20-teto-latencia-historia-sob-demanda";
const SYMBOL = "BTCUSDT";
const SYMBOL_PATH = `/symbol/${SYMBOL}`;
/** `T-01.10` (`handoff/T-01.10-desenho.md` §4, `F-B`/`F-C`) — an optional query string appended to
 * the page URL, so the SAME spec measures the fix and its controls in the lot run:
 * `E2E20_SYMBOL_QUERY='?e2eDenseSeries=1'` (the ablation) or `'?e2ePageApplyBusyMs=80'` (the
 * instrument's negative control). Empty by default: `make verify` measures the shipped path. */
const SYMBOL_QUERY = process.env.E2E20_SYMBOL_QUERY ?? "";
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
/**
 * `T-00.4` (`estrutura-do-front`, achado A1) — the smallest `n` whose nearest-rank p95 is NOT the
 * maximum. The index below is `ceil(0.95·n) − 1`, which is `n − 1` for every `n <= 19`: with the 15
 * pages this spec used to draw, "p95 <= 400" was "max <= 400", and ONE page held by the host failed
 * it. At `n >= 20` the p95 tolerates exactly one such page per run and still fails on two.
 *
 * Why one page is the host and not the product, MEASURED (`gates/T-00.4-build.md` §A1, the facts
 * `history_page_latency_breakdown` below, 30 runs × 15 pages): on the 2 756 ms page the stub
 * answered in 1,5 ms, the four responses reached the browser together 2,67 s later, and the host
 * logged 2 585 ms of `io` FULL stall (every non-idle task waiting on I/O) and 20 swap-ins inside
 * that one page. All 7 of 450 pages whose responses landed more than 50 ms late carried >= 36,8 ms
 * of that stall; the other 443 carried p95 22,4 ms. The ceiling (`400`) does NOT move.
 * `MIN_PAGES` stays the plan's literal floor; this is the floor of the statistic the plan names.
 */
const P95_MIN_PAGES = 20;
/** `T-05.9` — how many REAL, sequential drags this spec drives: the page floor plus the same `+2`
 * margin the earlier version of this spec kept for a tail possibly still in flight (see `pairCount`
 * below), now covering that risk under real gestures instead of a background loop. `T-00.4`: the
 * floor is `P95_MIN_PAGES` now (12 drags drew 15 pages in 74 of 74 logged runs, so 22 drags clear 20
 * with room). */
const DRAG_COUNT = P95_MIN_PAGES + 2;
/** `T-00.4` — the pan-frame ceiling (`160`, below) is judged on an extreme order statistic of the
 * intra-gesture intervals, so its exposure grows with the number of gestures. It keeps judging the
 * 12 gestures it judged before `T-00.4` (the old `DRAG_COUNT`); the extra gestures exist for the
 * latency sample only, and their intra-gesture maximum is reported as a `fact`. */
const PAN_FRAME_GESTURE_COUNT = 12;
/**
 * `T-00.4` (cycle 2) — how many EPISODES above `PAN_FRAME_CEILING_MS` (`overCeilingEpisodes`) the
 * block tolerates: exactly ONE. The ceiling judges the slowest interval outside that episode.
 *
 * Why not the maximum: the same defect the `400` block had at `n = 15` (`P95_MIN_PAGES`). ONE host
 * stall failed a run whose other ~318 intervals were fine. MEASURED (`gates/T-00.4-build.md`
 * §A1-bis, 20 runs of this spec alone on the host, every interval attributed): one run failed on
 * an I/O stall — 747,1 ms with no long task in the renderer, 676 ms of host `io` FULL, then 168,9 ms
 * on the next sample. And the former `e2e/17` (`T-02.7`), which owns `160`, calls it a `p95`
 * ceiling, with `max` "never a failure criterion".
 *
 * Why an episode and not one interval: that stall held TWO adjacent intervals.
 *
 * Why not the `p95` of `17`: the slowest intervals are the ones a page lands in (57 of the 60
 * slowest in those 20 runs; median 116 ms, max 201,3), i.e. one per page, ~12 of ~319 (3,8 %). A
 * `p95` would never see the page leaving the pan frame's budget; one tolerated episode does — two
 * pages over the ceiling are two episodes, and fail.
 */
const PAN_FRAME_TOLERATED_EPISODES_N = 1;
/** `T-00.4` (cycle 2) — how many of the slowest intra-gesture intervals are attributed in a `fact`. */
const PAN_FRAME_ATTRIBUTED_N = 3;
/** Teto de espera, por arrasto, para (a) a página que ELE disparou aparecer em `requestedMs` e
 * (b) essa mesma página ser DESENHADA (`drawnMs` alcançar `requestedMs`) antes do próximo arrasto
 * começar — bem acima do teto de `400 ms` que DoD 7 mede, para não confundir um timeout de
 * sincronização do PRÓPRIO spec com uma violação do teto medido abaixo. */
const PER_DRAG_TIMEOUT_MS = 10_000;

// ── `T-10.20` — the cadence step (the former `e2e/17`, `T-02.7`, `RNF-2`) ─────────────────────
//
// What a "frame" is here: a RANGE APPLICATION, the instant `axis-sync.ts`'s `onRangeApplied` fires
// (a real rewrite of the store's range, never an echo nor a guard-dropped reentrant notification),
// timestamped by `axis-latency-probe.ts` into `window.__axisLatencyProbe.samplesMs` — the only clock
// of this path; the spec reads it, never a second one. `n` samples give `n - 1` intervals, and the
// ceiling judges the interval BETWEEN two applications: a long one is a dropped frame.
//
// The drag is ONE `page.mouse.move(…, { steps })` call, never a manual `move` + `waitForTimeout`
// loop: measured (`T-02.7`), the manual loop put the p50 interval at ~33 ms, i.e. it measured the
// CDP round trip of the driver; with `steps` Chromium interpolates and dispatches internally and
// the p50 drops to ~16,7 ms, one frame at 60 fps.
//
// ⛔ NO MEAN, anywhere, not even as a fact: a 200 ms stall among 60 frames of 10 ms vanishes in a
// mean and is exactly what the operator sees. Only the tail (`p95`; `p50`/`max` as context).

/**
 * `[DECISÃO-OWNER: 2026-09-22, escolha entre alternativas apresentadas]` — recalibrated from `16 ms`
 * (`[DECISAO-OWNER: 2026-09-19]`) to `160 ms` = `3,2x` the WORST `p95` measured over 6 runs
 * (`49,70 ms`, `candle-real-e-eixo-unico/gates/T-02.7-builder.md` + `gates/T-02-latencia-fix.md`), the
 * same multiplier `frontend/playwright.config.ts` uses for the same problem. `16 ms` was never
 * reachable on this instrument: `T-02-latencia-fix` timestamped the RAW event of the origin pane,
 * before any dispatch, and the `p95` was already ~33 ms — the cost lives in CDP-driven headless
 * Chromium over one real `lightweight-charts@5.2.1`, not in the axis sync (acquitted by mutation).
 * `p50` stayed at 16,7–16,8 ms in the 6 runs; only `p95`/`max` vary, by frames the driver drops.
 * `T-10.20` moved it here from `17-teto-latencia-eixo.spec.ts`; the number did not change.
 */
const AXIS_CADENCE_CEILING_MS = 160;
/** `T-02.7` DoD 7 — `n >= 60` frames ⇒ `>= 61` samples (`n - 1` intervals). Fewer samples is a BITE
 * on its own, whatever the `p95`: a dropped rate disguised as a short sample. */
const CADENCE_MIN_FRAMES = 60;
const CADENCE_MIN_SAMPLES = CADENCE_MIN_FRAMES + 1;
/** The continuous drag of the former `17`: 90 mouse steps of 3 px, from 75 % of the Price pane's
 * width towards its left (≈ 1,5 s at 60 fps), on the view the mount framed. */
const CADENCE_DRAG_STEPS = 90;
const CADENCE_STEP_PX = 3;
const CADENCE_DRAG_START_X_FRACTION = 0.75;

/** The pan-frame ceiling of this spec's composition check (DoD 7's last paragraph): the SAME number
 * as the cadence step, on the SAME instrument (CDP-driven headless Chromium) that made `16 ms`
 * unreachable in this exact test environment. */
const PAN_FRAME_CEILING_MS = AXIS_CADENCE_CEILING_MS;

/** The `1m` page (`timeframe-window.ts::TIMEFRAME_WINDOW_BARS["1m"].pageBars`, `DEFAULT_PAGE_SLOTS`
 * until `T-05.1`) — copied as a literal, not imported: this spec
 * only needs the VOCABULARY (how many grid slots one page widens by) to size a drag large enough
 * to cross the newly-widened edge with margin, never the pagination logic itself. */
const PAGE_SLOTS = 500;
/** Comfortably above `PAGE_SLOTS` so a single drag both closes the ~500-slot gap a landed page
 * leaves AND crosses `time-axis-controller.ts::DEFAULT_PAGE_TRIGGER_SLOTS` (20) into the trigger
 * zone, with margin for the small amount of panning consumed before the FIRST page of a session
 * ever landed. Since `T-01.5` the mount no longer sits at the edge (the library clamps the initial
 * range at `minBarSpacing`); `walkToLeftEdge` walks there before the counted drags start. */
const TARGET_SHIFT_SLOTS = PAGE_SLOTS + 140;

const ONE_MINUTE_MS = 60_000;
const OHLC_METRIC = "klines_ohlc";
const OHLC_PROVIDER = "binance";
const OHLC_REDUCTIONS = ["OPEN", "HIGH", "LOW", "CLOSE"] as const;

/** The `1m` axis step (`timeframeStepMs("1m")`; it was `s2-panels.ts::S2_AXIS_STEP_MS` until
 * `paineis-de-fluxo` `T-05.1` made the step the TF's) — the grid step that converts the Price
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

/** `T-01.8` — a sample with its instant computed against the window start the CHART holds. */
interface TimedPriceSample extends PriceTimeSample {
  readonly timeMs: number;
}

declare global {
  interface Window {
    __historyPageLatencyProbe?: { requestedMs: number[]; drawnMs: number[]; applyMs?: number[]; reset(): void };
    __axisLatencyProbe?: { samplesMs: number[]; reset(): void };
    __priceTimeSamples?: PriceTimeSample[];
    /** `T-01.8` — `<main>`'s `data-window-start-ms`, the value at recorder start then every change. */
    __windowStartHistory?: number[];
  }
}

// ── O ESTOQUE SINTÉTICO — mesma receita de the former `e2e/17` (`T-02.7`), própria cópia ─────
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
 * medido em the former `e2e/17` (`T-02.7`): sem ao menos uma série com valor real, a biblioteca
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
/** `T-00.4` (A1) — one request as the STUB saw it, on the epoch clock (`timeOrigin + now()`, the
 * same base the browser's `performance.timeOrigin + startTime` uses on this one host). */
interface StubRequestLog {
  readonly url: string;
  readonly receivedAtEpochMs: number;
  readonly respondedAtEpochMs: number;
}

async function startSyntheticOhlcStub(): Promise<{
  readonly url: string;
  readonly requests: readonly StubRequestLog[];
  close(): Promise<void>;
}> {
  const catalog = syntheticCatalogEnvelope();
  const requests: StubRequestLog[] = [];
  const server = http.createServer((request, response) => {
    const receivedAtEpochMs = nodePerformance.timeOrigin + nodePerformance.now();
    response.on("finish", () => {
      requests.push({
        url: request.url ?? "",
        receivedAtEpochMs,
        respondedAtEpochMs: nodePerformance.timeOrigin + nodePerformance.now(),
      });
    });
    // `T-00.4` (A1) — without this a cross-origin Resource Timing entry zeroes every phase but
    // `startTime`/`responseEnd`, and the breakdown of an outlier below could not say WHERE it was.
    response.setHeader("timing-allow-origin", "*");
    // `T-05.9`'s own achado, MEDIDO: `browser-series-history-client.ts` (`T-05.2-FIX-adr005`) is
    // a REAL cross-origin `fetch()` from the browser against this stub's own port — never the
    // Next server's Node `fetch` (that half is SSR-only, `page.tsx`'s ten initial fetches, which
    // hit no CORS wall). Without `Access-Control-Allow-Origin` here, EVERY client-triggered page
    // request after the very first one is a `net::ERR_FAILED` the browser's own CORS check
    // blocks before this spec's code ever sees a status — caught as `HistoryPageFetchError`,
    // which PERMANENTLY freezes `coverageFloorMs` at the axis edge of that first attempt
    // (`use-history-pager.ts`'s own "never loop forever" contract) and silently stops every
    // later `historyRequest` from firing again, no matter how far a subsequent drag goes.
    // the former `e2e/17` (`T-02.7`) never surfaces this because it only cares about PAN
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
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** A canvas with area (an ATTACHED canvas is not yet a PAINTED one), then a settled chart. `T-10.20`:
 * `waitForChartSettled` (`T-10.1`'s helper) instead of the fixed 2 s sleep after the mount. */
async function waitForPaintedChart(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll("canvas")).some((c) => c.width > 0 && c.height > 0),
    undefined,
    { timeout: 120_000 },
  );
  await waitForChartSettled(page);
}

/** Nearest-rank percentile of an ascending, NON-EMPTY sample (the caller checks the length). */
function percentile(sortedAscending: readonly number[], p: number): number {
  if (sortedAscending.length === 0) {
    throw new Error("percentile: empty sample — caller must check length first");
  }
  const index = Math.min(sortedAscending.length - 1, Math.max(0, Math.ceil(p * sortedAscending.length) - 1));
  return sortedAscending[index]!;
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
  // The library needs the press and the move in separate frames. `T-10.20`: a settled chart (`T-10.1`'s
  // helper, >= 6 frames) instead of a 100 ms pause. Safe HERE: the caller waited for the previous
  // page to be drawn, so no page latency window is open, and the axis window starts at `moveStartMs`.
  await waitForChartSettled(page);
  const moveStartMs = await page.evaluate(() => performance.now());
  await page.mouse.move(startX + deltaXPx, y, { steps: 30 });
  const moveEndMs = await page.evaluate(() => performance.now());
  // ⛔ NOT `waitForChartSettled` (`T-10.20`, deliberate): the page this move asked for is usually in
  // flight HERE, inside the edge→draw window the `400` ceiling judges, and the helper polls the whole
  // DOM every animation frame on the main thread that window measures. It is a fixed part of the
  // gesture (hold, then release), not a bet that the app is done.
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

/** `T-01.8` — how long the spec waits, with no input, after the last page is drawn, for a page
 * that nobody asked for (the cascade `T-05-FIX` closed). 2 s is ~20× the p95 borda→desenho the
 * single-host code measured on this stub (97,8 ms, `gates/T-01.8-builder.md`). */
const IDLE_AFTER_PAGING_MS = 2_000;

/** `T-01.8` — ceiling on how far the view may move, in grid slots, across a page boundary and
 * between two consecutive samples after it, inside one gesture.
 *
 * CALIBRATED `[MEDIDO 2026-09-24, single-host code, 5 runs × 12 gestures = 60 boundaries,
 * `gates/T-01.8-builder.md` §3]`: every boundary jump was `0`, `−22` or `−24` slots, and the largest
 * step between two consecutive samples of the same gesture BEFORE its page was `24` in all 60 — the
 * jump across a page is one pan frame of this drag (640 slots over 30 mouse steps), nothing more.
 * The ceiling is TWO such frames. The defects it exists to catch are an order of magnitude above:
 * `500` (a page drawn without its prepend offset — `PAGE_SLOTS`), `1 260` (the right-edge cut
 * applied mid-drag on the first `1m` page, `T-01.5-builder.md` §2) and `−3 274` (the six-chart
 * remount re-framing the view, `T-01.F2-facts.txt`). */
const PAGE_BOUNDARY_JUMP_CEILING_SLOTS = 48;

/** `T-01.8` — where the pre-walk parks the left edge of the view, in grid slots from the axis
 * start: far enough above `DEFAULT_PAGE_TRIGGER_SLOTS` (20) that no pre-walk drag pages, close
 * enough that the FIRST measured drag (`TARGET_SHIFT_SLOTS` = 640) crosses the trigger. */
const PREWALK_PARK_SLOTS = 200;
/** A pre-walk drag never moves the mouse more than this fraction of the host's width from its
 * middle start point, so the pointer stays over the chart. */
const PREWALK_MAX_WIDTH_FRACTION = 0.4;
/** Upper bound on pre-walk drags: from `PREWALK_VIEW_BARS` the view spans 2k slots of the
 * 5.76k-slot seed (near the `minBarSpacing` floor — the geometry the mount itself had before `T-05.1`),
 * so ~6 drags reach the park; 12 only fails a run whose drags stopped moving the chart at all. */
const PREWALK_MAX_DRAGS = 12;

/** `paineis-de-fluxo` `T-06.1` — where the pre-walk starts, put there explicitly
 * (`view.ts::showView`), not wherever the mount frames (`VIEW_BARS`). `T-05.1` made the mount 120 bars
 * (~9,6 px/slot): a 40%-of-width drag moved ~48 slots, and reaching the left edge would take ~117
 * drags (`T-05.1-desenho.md` §4); the fix then was a private zoom-out to the floor. 2.000 slots sit
 * under the floor of a 1280-px plot (`showView` refuses past it) and keep the geometry
 * `PREWALK_MAX_DRAGS` was set on. `showView` also throws if positioning asks for a page — the
 * `requested`/`drawn` pair must not cross the `reset()` below. */
const PREWALK_VIEW_BARS = 2_000;

/**
 * `T-01.8` — walks the view to `PREWALK_PARK_SLOTS` from the left edge BEFORE the probe `reset()`,
 * without paging.
 *
 * Why this exists `[MEDIDO 2026-09-24, this spec on the single-host code, n=1 run]`: with six
 * charts the mount view was the whole grid (the empty panes of the stub echoed `0..5760` into the
 * store), so the FIRST drag already sat at the left edge. With one chart the Price series rules
 * the time scale and the library frames its right end (`from ≈ 3317` of 5760 at ~0.52 px/slot),
 * so the first 5 of 12 drags only WALKED to the edge (`drag_requested_new_page:0..4=false`), each
 * one paying the 10 s wait for a page that never came, and the run ended with 9 pages < 10.
 * Walking first keeps all `DRAG_COUNT` measured drags on the paging path the DoD measures.
 *
 * Guard: a pre-walk drag that paged would leave a request unpaired across the `reset()` — so the
 * number of page requests is compared before and after, and must not move.
 */
async function walkToLeftEdge(page: Page): Promise<number> {
  const requestedBefore = (await probeCounts(page)).requested;
  let drags = 0;
  for (; drags < PREWALK_MAX_DRAGS; drags += 1) {
    const range = await readPriceRange(page);
    const remainingSlots = range.from - PREWALK_PARK_SLOTS;
    if (remainingSlots <= 0) {
      break;
    }
    const box = await page.locator(`[data-testid="${CHART_HOST_TESTID}"]`).boundingBox();
    if (box === null) {
      throw new Error("chart host: no bounding box — nothing mounted");
    }
    const pxPerSlot = box.width / (range.to - range.from);
    const deltaXPx = Math.max(10, Math.min(remainingSlots * pxPerSlot, box.width * PREWALK_MAX_WIDTH_FRACTION));
    await dragRight(page, deltaXPx);
    await expect
      .poll(async () => (await readPriceRange(page)).from, { message: "o pré-arrasto não moveu o gráfico", timeout: 10_000 })
      .not.toBe(range.from);
  }
  const parked = await readPriceRange(page);
  fact(SPEC, "prewalk_drags_n", drags);
  fact(SPEC, "prewalk_parked_from", Number(parked.from.toFixed(2)));
  expect(
    parked.from,
    `o pré-arrasto não levou a borda esquerda da vista a <= ${PREWALK_PARK_SLOTS} slots em ${PREWALK_MAX_DRAGS} arrastos`,
  ).toBeLessThanOrEqual(PREWALK_PARK_SLOTS);
  expect(
    (await probeCounts(page)).requested,
    "um pré-arrasto pediu página — o par requested/drawn atravessaria o reset()",
  ).toBe(requestedBefore);
  return drags;
}

/** `T-01.F2` — starts recording the Price range IN TIME. Every `MutationObserver` callback that
 * saw a `data-visible-logical-from` write on the chart host (since `T-01.6` the one element that
 * carries the shared range) reads, in that same callback, the host's current
 * `data-visible-logical-from` and `<main>`'s current `data-window-start-ms` (the
 * pager's window start, re-rendered on every landed page). Installed after the probe `reset()`,
 * so only the drags below are recorded.
 *
 * `T-01.8`: it ALSO records every change of `<main>`'s `data-window-start-ms`
 * (`__windowStartHistory`), because the two attributes are NOT written atomically — see
 * `timePriceSamples`. */
async function startPriceTimeRecorder(page: Page): Promise<void> {
  await page.evaluate((hostTestId) => {
    const samples: PriceTimeSample[] = [];
    window.__priceTimeSamples = samples;
    const mainSelector = "main[data-window-start-ms]";
    const startHistory = [Number(document.querySelector(mainSelector)?.getAttribute("data-window-start-ms"))];
    window.__windowStartHistory = startHistory;
    new MutationObserver(() => {
      const current = Number(document.querySelector(mainSelector)?.getAttribute("data-window-start-ms"));
      if (Number.isFinite(current) && current !== startHistory[startHistory.length - 1]) {
        startHistory.push(current);
      }
    }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ["data-window-start-ms"] });
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

/**
 * `T-01.8` — the instant of each sample, against the window start the CHART holds at that moment.
 *
 * `T-01.F2` read `<main>`'s `data-window-start-ms` in the same callback as the host's logical range
 * and assumed the pair was consistent. It is not `[MEDIDO 2026-09-24, n=1 run, 2 of 12 gestures]`:
 * React commits `<main>`'s new start during render, and the host's page effect (`SymbolClient.tsx`,
 * "PAGE") only `setData`s the prepended bars — and records `drawnMs` — later, in a passive effect. A
 * pan frame that lands in between `[INFERRED: reading of the two write sites]` pairs the NEW start
 * with the OLD logical index: the instant reads
 * `−PAGE_SLOTS` too early, then `+PAGE_SLOTS` once the chart gets the page. On the single-host code
 * that showed up as a boundary "jump" of exactly `500` slots (and a `524`-slot "pan step" before the
 * page) in gestures 0 and 11, while the chart itself never moved.
 *
 * The start the chart holds is known without guessing: every page changes the start exactly once,
 * so after `k` pages drawn (`drawnMs <= atMs`) the chart holds `startHistory[k]`. The pairing is
 * checked by the caller (`startHistory.length === drawnMs.length + 1`).
 */
function timePriceSamples(
  samples: readonly PriceTimeSample[],
  drawnMs: readonly number[],
  startHistory: readonly number[],
): TimedPriceSample[] {
  return samples.map((s) => {
    const pagesDrawn = drawnMs.filter((d) => d <= s.atMs).length;
    const chartStartMs = startHistory[Math.min(pagesDrawn, startHistory.length - 1)]!;
    return { ...s, timeMs: Math.round(chartStartMs + s.logicalFrom * GRID_STEP_MS) };
  });
}

function sampleTimeMs(sample: TimedPriceSample): number {
  return sample.timeMs;
}

/** Axis-application intervals split by the gesture windows (`DIAG-e2e-master-20-intra-inter
 * .spec.ts.txt`, same `+1 ms` tolerance on the window's end): an interval is INTRA-gesture only if
 * both of its samples fall inside one `[moveStart, moveEnd]`. Everything else crosses the
 * driver's own idle between gestures. */
function splitAxisIntervals(
  axisSamplesMs: readonly number[],
  gestures: readonly GestureWindow[],
): { readonly intraMs: number[]; readonly otherMs: number[]; readonly intra: IntraGestureInterval[] } {
  const intraMs: number[] = [];
  const otherMs: number[] = [];
  const intra: IntraGestureInterval[] = [];
  for (let i = 1; i < axisSamplesMs.length; i += 1) {
    const a = axisSamplesMs[i - 1]!;
    const b = axisSamplesMs[i]!;
    const gesture = gestures.findIndex((g) => a >= g.moveStartMs && b <= g.moveEndMs + 1);
    if (gesture >= 0) {
      intraMs.push(b - a);
      intra.push({ gesture, fromMs: a, toMs: b });
    } else {
      otherMs.push(b - a);
    }
  }
  return { intraMs, otherMs, intra };
}

/** `T-00.4` (cycle 2) — one intra-gesture interval with its endpoints on the browser's clock, so
 * the slowest ones can be attributed (`attributeIntraInterval`). */
interface IntraGestureInterval {
  readonly gesture: number;
  readonly fromMs: number;
  readonly toMs: number;
}

/**
 * `T-00.4` (cycle 2) — the intra-gesture intervals above `ceilingMs`, grouped into EPISODES: a
 * maximal run of ADJACENT intervals (one ends on the very sample the next starts on) that are all
 * above the ceiling. One host stall can hold more than one frame: in run `r2` of the cycle-2
 * baseline (`gates/T-00.4-build.md` §A1-bis) one I/O stall made 747,1 ms and then, on the next
 * sample, 168,9 ms — two intervals, one stall. A page applied inside the pan frame costs one
 * episode PER PAGE, so it never merges into one.
 */
function overCeilingEpisodes(
  intra: readonly IntraGestureInterval[],
  ceilingMs: number,
): IntraGestureInterval[][] {
  const episodes: IntraGestureInterval[][] = [];
  let previousOver: IntraGestureInterval | undefined;
  for (const interval of intra) {
    if (interval.toMs - interval.fromMs <= ceilingMs) {
      previousOver = undefined;
      continue;
    }
    if (previousOver !== undefined && previousOver.toMs === interval.fromMs) {
      episodes[episodes.length - 1]!.push(interval);
    } else {
      episodes.push([interval]);
    }
    previousOver = interval;
  }
  return episodes;
}

/**
 * `T-00.4` (cycle 2) — where one slow intra-gesture interval came from. A `fact`, never asserted:
 * it is what lets the next red of the `160` ceiling diagnose itself, as the `400` one already does.
 *
 * - `longTaskOverlapMs`: browser main-thread long tasks clipped to the interval (the renderer was
 *   busy — the app, a GC, or the renderer starved of CPU);
 * - `host`: the host's PSI stall and swap-ins over the interval (`pressureDuring`, sampled every
 *   `PRESSURE_SAMPLE_PERIOD_MS`, so it over-covers by up to two periods — never under-covers);
 * - `workerTimerGapMaxMs`: the largest gap between two consecutive pressure samples spanning the
 *   interval. The sampler is a `setInterval` in THIS Playwright worker, the process that also sends
 *   the CDP mouse moves; a gap far above the period means the driver itself was not running, and
 *   no `mousemove` reached the page meanwhile;
 * - `pageDrawnInside` / `msSincePageDrawn`: whether a history page landed in (or just before) it —
 *   the failure mode the ceiling exists for.
 */
function attributeIntraInterval(
  interval: IntraGestureInterval,
  context: {
    readonly gestures: readonly GestureWindow[];
    readonly timeOriginMs: number;
    readonly longTasks: readonly { readonly startMs: number; readonly durationMs: number }[] | null;
    readonly drawnMs: readonly number[];
    readonly pressure: readonly PressureSample[];
  },
) {
  const { fromMs, toMs } = interval;
  const overlapMs = (startMs: number, durationMs: number): number =>
    Math.max(0, Math.min(toMs, startMs + durationMs) - Math.max(fromMs, startMs));
  const tasks = context.longTasks?.filter((t) => overlapMs(t.startMs, t.durationMs) > 0) ?? null;
  const drawnBefore = context.drawnMs.filter((d) => d <= toMs);
  const fromEpochMs = context.timeOriginMs + fromMs;
  const toEpochMs = context.timeOriginMs + toMs;
  let workerTimerGapMaxMs: number | null = null;
  for (let i = 1; i < context.pressure.length; i += 1) {
    const a = context.pressure[i - 1]!.epochMs;
    const b = context.pressure[i]!.epochMs;
    if (b > fromEpochMs && a < toEpochMs) workerTimerGapMaxMs = Math.max(workerTimerGapMaxMs ?? 0, b - a);
  }
  return {
    gesture: interval.gesture,
    durationMs: round1(toMs - fromMs),
    atMsIntoMove: round1(fromMs - context.gestures[interval.gesture]!.moveStartMs),
    longTaskOverlapMs: tasks === null ? null : round1(tasks.reduce((sum, t) => sum + overlapMs(t.startMs, t.durationMs), 0)),
    longTasks: tasks === null ? null : tasks.map((t) => [round1(t.startMs - fromMs), round1(t.durationMs)]),
    pageDrawnInside: context.drawnMs.some((d) => d > fromMs && d <= toMs),
    msSincePageDrawn: drawnBefore.length === 0 ? null : round1(toMs - Math.max(...drawnBefore)),
    workerTimerGapMaxMs: workerTimerGapMaxMs === null ? null : round1(workerTimerGapMaxMs),
    host: pressureDuring(context.pressure, fromEpochMs, toEpochMs),
  };
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
  /** Time jump across the page boundary, in grid slots (last sample before the page vs first
   * after). `T-01.F2` recorded it; `T-01.8` asserts it (`PAGE_BOUNDARY_JUMP_CEILING_SLOTS`). */
  readonly boundaryJumpSlots: number | null;
  /** `T-01.8` — the largest step, in grid slots, between two consecutive samples of the SAME
   * gesture before the page: how far one pan frame of this very drag moved the view. */
  readonly maxPanStepBeforePageSlots: number | null;
  /** `T-01.8` — the same, AFTER the page and until `moveEnd`: a view that jumps a few frames after
   * the boundary (a right-edge cut mid-drag that the next `mousemove` undoes) shows up here, not in
   * `boundaryJumpSlots`. */
  readonly maxPanStepAfterPageSlots: number | null;
  /** `T-01.8` — steps between consecutive samples AFTER the page that a pan frame could produce
   * (`0 < |Δ| <= PAGE_BOUNDARY_JUMP_CEILING_SLOTS`): the drag continuing, frame by frame. */
  readonly panStepsAfterPage: number;
}

/** Largest absolute difference between two consecutive values, or `null` with fewer than two. */
function maxAbsStep(values: readonly number[]): number | null {
  let max: number | null = null;
  for (let i = 1; i < values.length; i += 1) {
    const step = Math.abs(values[i]! - values[i - 1]!);
    max = max === null ? step : Math.max(max, step);
  }
  return max;
}

/** For every gesture in which a page was DRAWN while the mouse was still moving: how many
 * distinct Price-range instants the rest of the move produced after that (first) page. */
function judgePagesDrawnMidGesture(
  gestures: readonly GestureWindow[],
  drawnMs: readonly number[],
  samples: readonly TimedPriceSample[],
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
    const inGestureBefore = samples.filter((s) => s.atMs >= g.moveStartMs && s.atMs <= pageMs).map(sampleTimeMs);
    const maxPanStepMs = maxAbsStep(inGestureBefore);
    const afterTimes = after.map(sampleTimeMs);
    const maxPanStepAfterMs = maxAbsStep(afterTimes);
    let panStepsAfterPage = 0;
    for (let i = 1; i < afterTimes.length; i += 1) {
      const stepSlots = Math.abs(afterTimes[i]! - afterTimes[i - 1]!) / GRID_STEP_MS;
      if (stepSlots > 0 && stepSlots <= PAGE_BOUNDARY_JUMP_CEILING_SLOTS) {
        panStepsAfterPage += 1;
      }
    }
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
      maxPanStepBeforePageSlots: maxPanStepMs === null ? null : Number((maxPanStepMs / GRID_STEP_MS).toFixed(2)),
      maxPanStepAfterPageSlots: maxPanStepAfterMs === null ? null : Number((maxPanStepAfterMs / GRID_STEP_MS).toFixed(2)),
      panStepsAfterPage,
    });
  });
  return verdicts;
}

// ── `T-00.4` (A1) — WHERE a page's latency went, per page, emitted as `fact`s (never asserted) ──
//
// The achado that opened `T-00.4` (`gates/W-F0-e2e-instavel.md` §A1) was ONE sample of 1 053,3 ms
// among 15 (the others 59,8–114,5) with nothing on the log saying which leg of the round trip held
// it. These facts split every page into: the pager's own delay before the first fetch, the
// browser's queue + connect, the stub's wait, the download, and what came after the last byte up
// to the draw — plus the main-thread long tasks inside the page's interval and the Node event-loop
// delay of THIS process, which hosts the stub. Cheap (one evaluate at the end), and it is what makes
// the next outlier name its own cause.

declare global {
  interface Window {
    __t004LongTasks?: { startMs: number; durationMs: number }[];
  }
}

/** Installed before the first navigation: long tasks of the main thread, and a resource buffer
 * large enough that no page fetch is dropped (the default is 250 entries; the mount alone loads the
 * Next chunks). */
function installMainThreadRecorder(): void {
  performance.setResourceTimingBufferSize(10_000);
  window.__t004LongTasks = [];
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__t004LongTasks?.push({ startMs: entry.startTime, durationMs: entry.duration });
      }
    }).observe({ type: "longtask", buffered: true });
  } catch {
    // `longtask` is Chromium-only; the facts below then report `null` instead of zero.
    window.__t004LongTasks = undefined;
  }
}

/** `T-00.4` (A1) — the host's stall counters (Linux PSI, `/proc/pressure/*`, microseconds of stall
 * accumulated since boot) and the swap-in page count (`/proc/vmstat` `pswpin`), sampled on a timer
 * in this process. The counters are CUMULATIVE, so a delta between two samples is right even when
 * this process itself was stalled in between. Off Linux, or without PSI, the facts say `null`. */
interface PressureSample {
  readonly epochMs: number;
  readonly cpuSomeUs: number;
  readonly memorySomeUs: number;
  readonly memoryFullUs: number;
  readonly ioSomeUs: number;
  readonly ioFullUs: number;
  readonly swapInPages: number;
}

const PRESSURE_SAMPLE_PERIOD_MS = 50;

function readPsiTotals(resource: "cpu" | "memory" | "io"): { some: number; full: number } | null {
  try {
    const text = fs.readFileSync(`/proc/pressure/${resource}`, "utf8");
    const total = (kind: string): number => Number(new RegExp(`^${kind} .*total=(\\d+)`, "m").exec(text)?.[1] ?? NaN);
    return { some: total("some"), full: total("full") };
  } catch {
    return null;
  }
}

function readPressureSample(): PressureSample | null {
  const cpu = readPsiTotals("cpu");
  const memory = readPsiTotals("memory");
  const io = readPsiTotals("io");
  if (cpu === null || memory === null || io === null) return null;
  let swapInPages = NaN;
  try {
    swapInPages = Number(/^pswpin (\d+)$/m.exec(fs.readFileSync("/proc/vmstat", "utf8"))?.[1] ?? NaN);
  } catch {
    // `/proc/vmstat` missing: the swap delta below is reported as `null`.
  }
  return {
    epochMs: nodePerformance.timeOrigin + nodePerformance.now(),
    cpuSomeUs: cpu.some,
    memorySomeUs: memory.some,
    memoryFullUs: memory.full,
    ioSomeUs: io.some,
    ioFullUs: io.full,
    swapInPages,
  };
}

function startPressureSampler(): { readonly samples: PressureSample[]; stop(): void } {
  const samples: PressureSample[] = [];
  const take = (): void => {
    const sample = readPressureSample();
    if (sample !== null) samples.push(sample);
  };
  take();
  const timer = setInterval(take, PRESSURE_SAMPLE_PERIOD_MS);
  let stopped = false;
  return {
    samples,
    // Idempotent: the test stops it right after the drags AND in its `finally` (`T-10.20`, the
    // `T-00.4` QA W-6 follow-up), so a throwing drag never leaves the 50 ms timer alive in the worker.
    stop: () => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      take();
    },
  };
}

/** Stall accumulated on the host between the last sample at or before `fromEpochMs` and the first
 * at or after `toEpochMs` — a slight over-cover of the page's interval, never an under-cover. */
function pressureDuring(samples: readonly PressureSample[], fromEpochMs: number, toEpochMs: number) {
  const before = [...samples].reverse().find((x) => x.epochMs <= fromEpochMs);
  const after = samples.find((x) => x.epochMs >= toEpochMs);
  if (before === undefined || after === undefined) return null;
  const ms = (a: number, b: number): number => round1((b - a) / 1000);
  return {
    cpuSomeMs: ms(before.cpuSomeUs, after.cpuSomeUs),
    memorySomeMs: ms(before.memorySomeUs, after.memorySomeUs),
    memoryFullMs: ms(before.memoryFullUs, after.memoryFullUs),
    ioSomeMs: ms(before.ioSomeUs, after.ioSomeUs),
    ioFullMs: ms(before.ioFullUs, after.ioFullUs),
    swapInPages: Number.isNaN(after.swapInPages - before.swapInPages) ? null : after.swapInPages - before.swapInPages,
  };
}

interface ResourceSample {
  readonly name: string;
  readonly startMs: number;
  readonly requestStartMs: number;
  readonly responseStartMs: number;
  readonly responseEndMs: number;
  readonly connectMs: number;
}

const round1 = (value: number): number => Number(value.toFixed(1));

async function emitPageLatencyBreakdown(
  page: Page,
  stubUrl: string,
  stubRequests: readonly StubRequestLog[],
  requestedMs: readonly number[],
  drawnMs: readonly number[],
  pressure: readonly PressureSample[],
): Promise<readonly { readonly page: number; readonly totalMs?: number }[]> {
  const browser = await page.evaluate((origin) => {
    const resources = performance
      .getEntriesByType("resource")
      .filter((e) => e.name.startsWith(origin) && e.name.includes("/series-history"))
      .map((e) => {
        const r = e as PerformanceResourceTiming;
        return {
          name: r.name,
          startMs: r.startTime,
          requestStartMs: r.requestStart,
          responseStartMs: r.responseStart,
          responseEndMs: r.responseEnd,
          connectMs: r.connectEnd - r.connectStart,
        };
      });
    return {
      timeOriginMs: performance.timeOrigin,
      resources,
      longTasks: window.__t004LongTasks ?? null,
    };
  }, stubUrl);
  const resources: ResourceSample[] = browser.resources;
  const breakdown = requestedMs.map((requested, i) => {
    const drawn = drawnMs[i];
    const nextRequested = requestedMs[i + 1] ?? Number.POSITIVE_INFINITY;
    const own = resources.filter((r) => r.startMs >= requested - 1 && r.startMs < nextRequested);
    if (drawn === undefined || own.length === 0) {
      return { page: i, fetches: own.length };
    }
    const firstStart = Math.min(...own.map((r) => r.startMs));
    const lastEnd = Math.max(...own.map((r) => r.responseEndMs));
    // The stub's own receive instant, moved onto the browser's timeline; matched by the full URL.
    const stubLagMs = own.map((r) => {
      const seen = stubRequests.find((q) => r.name.endsWith(q.url));
      return seen === undefined ? null : seen.receivedAtEpochMs - browser.timeOriginMs - r.requestStartMs;
    });
    const stubServeMs = own.map((r) => {
      const seen = stubRequests.find((q) => r.name.endsWith(q.url));
      return seen === undefined ? null : seen.respondedAtEpochMs - seen.receivedAtEpochMs;
    });
    const longTaskMs =
      browser.longTasks === null
        ? null
        : browser.longTasks
            .filter((t) => t.startMs < drawn && t.startMs + t.durationMs > requested)
            .reduce((sum, t) => sum + t.durationMs, 0);
    return {
      page: i,
      fetches: own.length,
      totalMs: round1(drawn - requested),
      beforeFirstFetchMs: round1(firstStart - requested),
      queueAndConnectMaxMs: round1(Math.max(...own.map((r) => r.requestStartMs - r.startMs))),
      connectMaxMs: round1(Math.max(...own.map((r) => r.connectMs))),
      waitMaxMs: round1(Math.max(...own.map((r) => r.responseStartMs - r.requestStartMs))),
      downloadMaxMs: round1(Math.max(...own.map((r) => r.responseEndMs - r.responseStartMs))),
      fetchSpanMs: round1(lastEnd - firstStart),
      afterLastByteMs: round1(drawn - lastEnd),
      stubReceiveLagMaxMs: stubLagMs.some((v) => v === null) ? null : round1(Math.max(...(stubLagMs as number[]))),
      stubServeMaxMs: stubServeMs.some((v) => v === null) ? null : round1(Math.max(...(stubServeMs as number[]))),
      longTaskMs: longTaskMs === null ? null : round1(longTaskMs),
      // Per fetch, relative to the page's request: [requestStart, responseStart, responseEnd]. One
      // stall that holds every socket at once shows as the same late instant on all of them.
      fetchTimelineMs: own.map((r) => [
        round1(r.requestStartMs - requested),
        round1(r.responseStartMs - requested),
        round1(r.responseEndMs - requested),
      ]),
      requestedEpochMs: Math.round(browser.timeOriginMs + requested),
      hostStall: pressureDuring(pressure, browser.timeOriginMs + requested, browser.timeOriginMs + drawn),
    };
  });
  fact(SPEC, "history_page_latency_breakdown", breakdown);
  fact(SPEC, "history_page_resource_entries_n", resources.length);
  fact(
    SPEC,
    "main_thread_long_tasks_ms",
    browser.longTasks === null ? null : browser.longTasks.map((t) => [round1(t.startMs), round1(t.durationMs)]),
  );
  return breakdown;
}

/** `T-10.20` (the former `e2e/22`, `T-01.5` DoD `11(b)`, literal: "depois de ≥ 2 páginas") — the
 * floor that keeps the host-survival verdict from passing on a run that drew no page. */
const HOST_SURVIVAL_MIN_PAGES = 2;

/** `T-10.20` — the chart host counts its `createChart` calls (`ChartHost.tsx`, `data-chart-mount-count`). */
async function readMountCount(page: Page): Promise<number> {
  const raw = await page.locator(`[data-testid="${CHART_HOST_TESTID}"]`).getAttribute("data-chart-mount-count");
  if (raw === null) {
    throw new Error("the chart host does not publish data-chart-mount-count — nothing mounted?");
  }
  return Number(raw);
}

/**
 * `T-10.20` — the cadence step (the former `e2e/17`, `T-02.7`, `RNF-2`): ONE continuous drag on the
 * view the mount framed, then the floor of range applications and the `p95` of the intervals between
 * them. Both verdicts are SOFT, so a cadence red never hides the paging and host verdicts after it.
 */
async function judgeAxisCadence(page: Page): Promise<void> {
  const box = await priceContainerLocator(page).boundingBox();
  if (box === null) {
    throw new Error("price pane: no bounding box — nothing mounted");
  }
  await page.evaluate(() => window.__axisLatencyProbe?.reset());
  const startX = box.x + box.width * CADENCE_DRAG_START_X_FRACTION;
  const y = box.y + box.height / 2;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX - CADENCE_DRAG_STEPS * CADENCE_STEP_PX, y, { steps: CADENCE_DRAG_STEPS });
  await page.mouse.up();

  const samplesMs = await page.evaluate(() => window.__axisLatencyProbe?.samplesMs ?? []);
  fact(SPEC, "axis_latency_samples", samplesMs.length);
  // A BITE on its own, whatever the `p95`: a dropped rate disguised as a short sample.
  expect
    .soft(
      samplesMs.length,
      `cadência: apenas ${samplesMs.length} aplicações de range registradas para ${CADENCE_DRAG_STEPS} passos de arrasto — ` +
        `esperado >= ${CADENCE_MIN_SAMPLES} (>= ${CADENCE_MIN_FRAMES} quadros); queda de taxa disfarçada de amostra curta`,
    )
    .toBeGreaterThanOrEqual(CADENCE_MIN_SAMPLES);
  if (samplesMs.length < 2) {
    // No interval to judge; the floor above already failed.
    return;
  }
  const intervalsMs: number[] = [];
  for (let i = 1; i < samplesMs.length; i += 1) {
    intervalsMs.push(samplesMs[i]! - samplesMs[i - 1]!);
  }
  const sorted = [...intervalsMs].sort((a, b) => a - b);
  const p50 = percentile(sorted, 0.5);
  const p95 = percentile(sorted, 0.95);
  const max = sorted[sorted.length - 1]!;
  // ⛔ NO MEAN — only the tail.
  fact(SPEC, "axis_latency_intervals_n", intervalsMs.length);
  fact(SPEC, "axis_latency_p50_ms", p50);
  fact(SPEC, "axis_latency_p95_ms", p95);
  fact(SPEC, "axis_latency_max_ms", max);
  expect
    .soft(
      p95,
      `cadência: p95 dos intervalos entre aplicações de range é ${p95.toFixed(2)} ms (max ${max.toFixed(2)} ms, ` +
        `p50 ${p50.toFixed(2)} ms, n=${intervalsMs.length}) — teto é ${AXIS_CADENCE_CEILING_MS} ms (T-02.7, recalibrado)`,
    )
    .toBeLessThanOrEqual(AXIS_CADENCE_CEILING_MS);
}

test(`RNF-2/DoD-7: cadência do eixo (p95 <= ${AXIS_CADENCE_CEILING_MS} ms), p95 <= ${LATENCY_CEILING_MS} ms da borda detectada até a barra desenhada sobre n >= ${MIN_PAGES} paginações por arrasto, e o host sobrevive às páginas (${SPEC})`, async ({
  page,
}) => {
  const stub = await startSyntheticOhlcStub();
  let instance: NextInstanceHandle | undefined;
  // `T-10.20` — declared here so the `finally` stops them even when a drag throws (`T-00.4` QA W-6).
  let pressureSampler: ReturnType<typeof startPressureSampler> | undefined;
  const stubLoopDelay = monitorEventLoopDelay({ resolution: 10 });
  try {
    instance = await startSecondaryNextInstance({ INGEST_HEALTH_API_BASE_URL: stub.url });
    await page.addInitScript(installMainThreadRecorder);

    fact(SPEC, "symbol_query", SYMBOL_QUERY);
    const response = await page.goto(`${instance.baseUrl}${SYMBOL_PATH}${SYMBOL_QUERY}`, { waitUntil: "load" });
    expect(response?.ok(), `GET ${SYMBOL_PATH}${SYMBOL_QUERY} não respondeu ok`).toBe(true);
    await waitForPaintedChart(page);
    // `T-01.10` — which feed the host is running (`sparse`, or `dense` under the ablation).
    fact(SPEC, "series_feed", await page.locator('[data-testid="symbol-chart-host"]').getAttribute("data-series-feed"));

    // ── 1. mount (the former `e2e/22`'s preconditions) ──────────────────────────────────────────
    await test.step("mount: one chart, one createChart, real candles drawn", async () => {
      const drawnCandles = await page
        .locator(`[data-testid="${PRICE_PANE_TESTID}"]`)
        .getAttribute("data-price-candles");
      fact(SPEC, "stub_drawn_candles", drawnCandles);
      // Precondition of every drag below (`T-02.7`, measured): the library needs at least one real
      // value to treat a mouse drag as a pan.
      expect(
        Number(drawnCandles ?? "0"),
        "o stub sintético não produziu nenhuma vela real — pré-requisito medido por T-02.7 (a biblioteca " +
          "exige ao menos um valor real para o pan por mouse) não satisfeito",
      ).toBeGreaterThan(0);
      // CA-1′ in passing: the page mounts ONE chart, not six.
      const chartCount = await page.locator(".tv-lightweight-charts").count();
      fact(SPEC, "tv_lightweight_charts_count", chartCount);
      expect(chartCount, "a página monta UM gráfico (plano 01, item 1.3)").toBe(1);
      const mountBefore = await readMountCount(page);
      fact(SPEC, "chart_mount_count_before", mountBefore);
      expect(mountBefore, "um createChart na carga da página").toBe(1);
    });

    // Pre-roll: where the mount frames the view, BEFORE any drag moves it (the wave's `b809756` fact).
    fact(SPEC, "preroll_logical_from_at_mount", Number((await readPriceRange(page)).from.toFixed(2)));

    // ── 2. cadence (the former `e2e/17`), on the mount's view, BEFORE the pre-walk ─────────────
    await test.step(`cadence: >= ${CADENCE_MIN_SAMPLES} range applications and p95 <= ${AXIS_CADENCE_CEILING_MS} ms over one continuous drag`, async () => {
      const requestedBefore = (await probeCounts(page)).requested;
      await judgeAxisCadence(page);
      // Whatever the drag set in motion lands BEFORE the pre-walk reads the view.
      await waitForChartSettled(page);
      fact(SPEC, "cadence_drag_requested_pages_n", (await probeCounts(page)).requested - requestedBefore);
    });

    // ── 3. paging (this spec's own flow) ───────────────────────────────────────────────────────
    let pagingError: unknown;
    try {
      await test.step(`paging: p95 <= ${LATENCY_CEILING_MS} ms edge→draw over n >= ${Math.max(MIN_PAGES, P95_MIN_PAGES)} drag-triggered pages`, async () => {
        // `reset()` BEFORE the first measured drag (`history-page-latency-probe.ts`: "a caller that
        // wants only page-triggered pairs calls `reset()` once the initial paint has settled, before
        // driving any drag"): without it `drawnMs` would carry the MOUNT's `setData` (no request
        // behind it), and `requestedMs[i]`/`drawnMs[i]` would not be the `DRAG_COUNT` drags below.
        // `T-01.8`: the pre-walk runs BEFORE the reset, so its drags are neither paired nor recorded.
        // `T-06.1`: the pre-walk starts from an explicit view, not from the mount's (see `PREWALK_VIEW_BARS`).
        const view = await showView(page, { kind: "lastBars", bars: PREWALK_VIEW_BARS });
        fact(SPEC, "prewalk_view", { iterations: view.iterations, from: view.fromLogical, to: view.toLogical, spacingPx: view.barSpacingPx });
        await walkToLeftEdge(page);
        await page.evaluate(() => window.__historyPageLatencyProbe?.reset());
        // `T-01.8`: the axis probe is never reset here; everything before this index is mount,
        // cadence drag (`T-10.20`) and pre-walk.
        const axisSamplesBeforePaging = await page.evaluate(() => window.__axisLatencyProbe?.samplesMs.length ?? 0);
        await startPriceTimeRecorder(page);

        // `T-05.9` — `DRAG_COUNT` REAL, sequential drags, each waiting for the previous drag's page
        // to be drawn (`driveSequentialDrags`: `D-C3.5`'s serial contract at the gesture's cadence).
        // `T-00.4` (A1) — the Node event loop that serves the stub, during exactly the measured drags.
        stubLoopDelay.enable();
        pressureSampler = startPressureSampler();
        const gestures = await driveSequentialDrags(page, DRAG_COUNT);
        pressureSampler.stop();
        stubLoopDelay.disable();
        const pressureSamples = pressureSampler.samples;
        fact(SPEC, "host_pressure_samples_n", pressureSamples.length);
        fact(SPEC, "stub_event_loop_delay_ms", {
          max: round1(stubLoopDelay.max / 1e6),
          p99: round1(stubLoopDelay.percentile(99) / 1e6),
          mean: round1(stubLoopDelay.mean / 1e6),
        });

        // `T-01.8` — NO CASCADE (`handoff/FIX-regressoes-fase05.md` §4.3 item 4): once the last page
        // is drawn, the page's own echo must not page again. The ONE negative window of this test
        // (`T-10.20`: the former `22`'s per-drag `NO_REQUEST_WAIT_MS` windows left with its loop).
        await test.step(`no cascade: no page requested in ${IDLE_AFTER_PAGING_MS} ms without input`, async () => {
          const requestedAtRest = (await probeCounts(page)).requested;
          await page.waitForTimeout(IDLE_AFTER_PAGING_MS);
          const requestedAfterIdle = (await probeCounts(page)).requested;
          fact(SPEC, "history_page_requested_during_idle_n", requestedAfterIdle - requestedAtRest);
          expect(
            requestedAfterIdle - requestedAtRest,
            `${requestedAfterIdle - requestedAtRest} página(s) pedida(s) em ${IDLE_AFTER_PAGING_MS} ms sem gesto — cascata de páginas`,
          ).toBe(0);
        });

        const probe = await page.evaluate(() => ({
          requestedMs: window.__historyPageLatencyProbe?.requestedMs ?? [],
          drawnMs: window.__historyPageLatencyProbe?.drawnMs ?? [],
          applyMs: window.__historyPageLatencyProbe?.applyMs ?? [],
        }));
        fact(SPEC, "history_page_requested_n", probe.requestedMs.length);
        fact(SPEC, "history_page_drawn_n", probe.drawnMs.length);
        // `T-01.10` (`F-B`, `handoff/T-01.10-desenho.md` §3 item 6) — the host's page application
        // time, one per page: a `fact`, never asserted. Compared against `?e2eDenseSeries=1` in the lot run.
        const applySorted = [...probe.applyMs].sort((a, b) => a - b);
        fact(SPEC, "history_page_apply_ms", probe.applyMs.map((v) => Number(v.toFixed(2))));
        fact(
          SPEC,
          "history_page_apply_p50_ms",
          applySorted.length === 0 ? null : Number(applySorted[Math.floor(applySorted.length / 2)]!.toFixed(2)),
        );

        const pairCount = probe.requestedMs.length;
        await test.step(`pairing and page floor: drawn == requested, n >= ${Math.max(MIN_PAGES, P95_MIN_PAGES)}`, async () => {
          // After the `reset()`, every drag that asked for a page also waited (inside the loop) for
          // that SAME page to be drawn before the next one started, so `drawnMs.length` must be
          // EXACTLY `requestedMs.length` here — index by index, no tail in flight.
          // `T-01.8`: SOFT, for the reason the intra-gesture ceiling below is soft. A remount per page
          // records every page twice (once by the new chart's mount, once by the page path), so this
          // pairing is the FIRST thing the remount ablation breaks — hard, it would hide the verdicts
          // on the range and the boundary below, which are the ones `FIX` §4.3 names.
          expect
            .soft(
              probe.drawnMs.length,
              `drawnMs (${probe.drawnMs.length}) deveria ser EXATAMENTE requestedMs (${probe.requestedMs.length}) ` +
                "pós-reset — driveSequentialDrags espera cada página desenhar antes do próximo arrasto",
            )
            .toBe(probe.requestedMs.length);
          fact(SPEC, "history_page_pair_n", pairCount);
          expect(
            pairCount,
            `apenas ${pairCount} páginas disparadas por arrasto — esperado >= ${Math.max(MIN_PAGES, P95_MIN_PAGES)} ` +
              `(plan 05 DoD 7: n >= ${MIN_PAGES}; T-00.4: n >= ${P95_MIN_PAGES} para o p95 não ser o máximo)`,
          ).toBeGreaterThanOrEqual(Math.max(MIN_PAGES, P95_MIN_PAGES));
        });

        // `T-01.8`: the range and boundary verdicts come BEFORE the latency block. They are the ones
        // `FIX` §4.3 names, and a remount per page (the ablation) also breaks the drawn/requested
        // index pairing the latency block computes on — so, placed after it, a negative latency would
        // stop the test before either verdict ran.
        const rawPriceSamples = await page.evaluate(() => window.__priceTimeSamples ?? []);
        const windowStartHistory = await page.evaluate(() => window.__windowStartHistory ?? []);
        // `T-01.8` — instrument integrity: every drawn page changed `<main>`'s start exactly once, so
        // the k-th change IS the k-th page (`timePriceSamples`).
        fact(SPEC, "window_start_changes_n", windowStartHistory.length - 1);
        // Soft, same reason as the drawn/requested pairing above.
        expect
          .soft(
            windowStartHistory.length - 1,
            `<main> mudou de data-window-start-ms ${windowStartHistory.length - 1} vez(es) para ${probe.drawnMs.length} ` +
              "página(s) desenhada(s) — o pareamento página↔início da janela quebrou",
          )
          .toBe(probe.drawnMs.length);
        const priceSamples = timePriceSamples(rawPriceSamples, probe.drawnMs, windowStartHistory);
        fact(
          SPEC,
          "price_time_samples_non_atomic_n",
          priceSamples.filter((s) => s.timeMs !== Math.round(s.windowStartMs + s.logicalFrom * GRID_STEP_MS)).length,
        );
        const verdicts = judgePagesDrawnMidGesture(gestures, probe.drawnMs, priceSamples);

        // ── `T-01.F2`: the Price range, IN TIME, keeps moving after a page drawn mid-gesture ──────
        // Eligible gesture: its (first) page was drawn while the mouse was still moving, with at
        // least one pan-frame ceiling of movement left — the same `160 ms` inside which a live pan
        // must apply a frame, so an eligible gesture that stays parked is not "too little movement
        // left", it is a dropped drag.
        await test.step("range keeps moving after a page drawn mid-gesture", async () => {
          const eligible = verdicts.filter((v) => v.moveLeftAfterPageMs >= PAN_FRAME_CEILING_MS);
          // `T-01.8` — "keeps changing" now also has to be reached by a PAN step. `[MEDIDO 2026-09-24,
          // ablation "axis.startMs back in the host's mount deps", n=1 run]`: on the single host a
          // remount per page leaves exactly 2 samples after the page — the old view, then the
          // re-framed initial range, `3 317` slots away — so "≥ 2 distinct values" passed 12/12 by
          // accident. A drag that continues moves in pan-sized steps (`≤ 24` slots here, see
          // `PAGE_BOUNDARY_JUMP_CEILING_SLOTS`); a re-frame does not.
          const parked = eligible.filter((v) => v.distinctTimesAfterPage < 2 || v.panStepsAfterPage === 0);
          fact(SPEC, "price_time_samples_n", priceSamples.length);
          fact(SPEC, "gestures_with_page_drawn_mid_move_n", verdicts.length);
          fact(SPEC, "gestures_with_page_drawn_mid_move_eligible_n", eligible.length);
          fact(SPEC, "gestures_parked_after_page_n", parked.length);
          fact(SPEC, "gesture_page_verdicts", verdicts);
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
          // `T-01.8`: soft, so the boundary verdict below is also reported when this one fails.
          expect
            .soft(
              parked.map((v) => v.gesture),
              `range parado depois da página: em ${parked.length}/${eligible.length} gestos com página desenhada enquanto ` +
                `o mouse se movia, o range do Preço (em tempo) assumiu < 2 valores distintos, ou nenhum passo do tamanho de um ` +
                `quadro de pan, até o fim do movimento — ` +
                `o arrasto em curso foi descartado. ${JSON.stringify(parked)}`,
            )
            .toEqual([]);
        });

        // ── `T-01.8`: the page boundary does not move the view (FIX §4.1 item 3, §4.3) ─────────────
        // `T-01.F2` recorded this jump as a `fact`; here it is an assertion, on EVERY gesture with a
        // page drawn mid-move (eligible or not — a jump is a jump even with little movement left).
        await test.step(`page boundary: the view moves <= ${PAGE_BOUNDARY_JUMP_CEILING_SLOTS} slots across a page`, async () => {
          const jumped = verdicts.filter(
            (v) =>
              (v.boundaryJumpSlots !== null && Math.abs(v.boundaryJumpSlots) > PAGE_BOUNDARY_JUMP_CEILING_SLOTS) ||
              (v.maxPanStepAfterPageSlots !== null && v.maxPanStepAfterPageSlots > PAGE_BOUNDARY_JUMP_CEILING_SLOTS),
          );
          expect(
            verdicts.filter((v) => v.boundaryJumpSlots !== null).length,
            "nenhum gesto tem amostra antes E depois da página — o salto de fronteira ficaria sem medida",
          ).toBeGreaterThan(0);
          expect(
            jumped.map((v) => v.gesture),
            `a vista saltou na fronteira da página: em ${jumped.length}/${verdicts.length} gestos o range do Preço, em tempo, ` +
              `andou mais de ${PAGE_BOUNDARY_JUMP_CEILING_SLOTS} slots (dois quadros de pan) entre a última amostra antes da página ` +
              "e a primeira depois, ou entre duas amostras seguidas depois dela. " +
              JSON.stringify(jumped),
          ).toEqual([]);
        });

        await test.step(`edge→draw latency: p95 <= ${LATENCY_CEILING_MS} ms, no negative latency`, async () => {
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
          const breakdown = await emitPageLatencyBreakdown(
            page,
            stub.url,
            stub.requests,
            probe.requestedMs,
            probe.drawnMs,
            pressureSamples,
          );
          const slowest = breakdown.filter((b) => (b.totalMs ?? 0) > LATENCY_CEILING_MS);
          fact(SPEC, "history_page_over_ceiling_n", slowest.length);

          expect(
            p95,
            `p95 da latência borda->desenho é ${p95.toFixed(2)} ms (max ${max.toFixed(2)} ms, p50 ` +
              `${p50.toFixed(2)} ms, n=${latenciesMs.length}) — teto é ${LATENCY_CEILING_MS} ms (plan 05 DoD 7). ` +
              `Páginas acima do teto, com onde o tempo ficou (T-00.4): ${JSON.stringify(slowest)}`,
          ).toBeLessThanOrEqual(LATENCY_CEILING_MS);
          // No latency may be negative — a negative one is evidence that the index pairing (the
          // invariant above) broke, not a valid result that was too fast.
          expect(
            Math.min(...latenciesMs),
            `latência negativa encontrada — pareamento requestedMs[i]/drawnMs[i+1] quebrou: ${JSON.stringify(latenciesMs)}`,
          ).toBeGreaterThanOrEqual(0);
        });

        // ── Composition of the two ceilings (DoD 7, last paragraph) ───────────────────────────────
        // An honest measurement, not a fix: if it bites, paging entered the pan frame — a finding for
        // phase `02` (owner of `T-02.7`'s ceiling), not for this spec.
        //
        // `T-01.F2`: the ceiling applies only to intervals inside one gesture's `[moveStart, moveEnd]`;
        // the old cut (every sample after the mount) also held the driver's idle BETWEEN gestures,
        // 242-293 ms per `DIAG-e2e-master.md` §4, and that idle is what failed `160`. The old number
        // stays as a `fact` so `T-01.10` can see both on the same run.
        //
        // `T-01.8`: the cut is the probe's length read right before the first measured drag
        // (`axisSamplesBeforePaging`), measured on the run instead of assumed.
        await test.step(`pan-frame composition: intra-gesture intervals <= ${PAN_FRAME_CEILING_MS} ms outside ${PAN_FRAME_TOLERATED_EPISODES_N} tolerated episode`, async () => {
          const axisSamplesMs = await page.evaluate(() => window.__axisLatencyProbe?.samplesMs ?? []);
          const pagingSamplesMs = axisSamplesMs.slice(axisSamplesBeforePaging);
          fact(SPEC, "axis_samples_before_paging_n", axisSamplesBeforePaging);
          const legacyIntervalsMs: number[] = [];
          for (let i = 1; i < pagingSamplesMs.length; i += 1) {
            legacyIntervalsMs.push(pagingSamplesMs[i]! - pagingSamplesMs[i - 1]!);
          }
          const legacyMaxIntervalMs = legacyIntervalsMs.length > 0 ? Math.max(...legacyIntervalsMs) : 0;
          fact(SPEC, "axis_samples_total_n", axisSamplesMs.length);
          fact(SPEC, "axis_samples_during_paging_n", pagingSamplesMs.length);
          fact(SPEC, "axis_max_interval_during_paging_ms_incl_driver_idle", Number(legacyMaxIntervalMs.toFixed(2)));

          const panFrameGestures = gestures.slice(0, PAN_FRAME_GESTURE_COUNT);
          const { intraMs, otherMs, intra } = splitAxisIntervals(axisSamplesMs, panFrameGestures);
          // `T-00.4` — the latency-only gestures, reported and never judged (see `PAN_FRAME_GESTURE_COUNT`).
          // Their intervals also land in `otherMs` above, i.e. in `axis_other_interval_*`.
          const latencyOnlyIntraMs = splitAxisIntervals(axisSamplesMs, gestures.slice(PAN_FRAME_GESTURE_COUNT)).intraMs;
          fact(SPEC, "axis_intra_gesture_interval_judged_gestures_n", panFrameGestures.length);
          fact(
            SPEC,
            "axis_intra_gesture_interval_max_ms_latency_only_gestures",
            latencyOnlyIntraMs.length > 0 ? Number(Math.max(...latencyOnlyIntraMs).toFixed(2)) : null,
          );
          const intraSorted = [...intraMs].sort((a, b) => a - b);
          const intraMaxMs = intraSorted.length > 0 ? intraSorted[intraSorted.length - 1]! : 0;
          fact(SPEC, "gesture_windows_n", gestures.length);
          // `T-00.4`: judged by the `160` ceiling — the first `PAN_FRAME_GESTURE_COUNT` of them.
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
          // `T-00.4` (cycle 2) — the slowest intra-gesture intervals, each with where its time went.
          const browserClock = await page.evaluate(() => ({
            timeOriginMs: performance.timeOrigin,
            longTasks: window.__t004LongTasks ?? null,
          }));
          const attributionContext = {
            gestures: panFrameGestures,
            timeOriginMs: browserClock.timeOriginMs,
            longTasks: browserClock.longTasks,
            drawnMs: probe.drawnMs,
            pressure: pressureSamples,
          };
          const slowestIntra = [...intra]
            .sort((a, b) => b.toMs - b.fromMs - (a.toMs - a.fromMs))
            .slice(0, PAN_FRAME_ATTRIBUTED_N)
            .map((iv) => attributeIntraInterval(iv, attributionContext));
          fact(SPEC, "axis_intra_gesture_interval_slowest", slowestIntra);
          // The statistic the ceiling judges (see `PAN_FRAME_TOLERATED_EPISODES_N`): the slowest
          // interval OUTSIDE the tolerated episodes, the worst ones first.
          const episodeMaxMs = (e: readonly IntraGestureInterval[]): number => Math.max(...e.map((iv) => iv.toMs - iv.fromMs));
          const episodes = overCeilingEpisodes(intra, PAN_FRAME_CEILING_MS).sort((a, b) => episodeMaxMs(b) - episodeMaxMs(a));
          const tolerated = new Set(episodes.slice(0, PAN_FRAME_TOLERATED_EPISODES_N).flat());
          const outsideToleratedMs = intra.filter((iv) => !tolerated.has(iv)).map((iv) => iv.toMs - iv.fromMs);
          const intraJudgedMs = outsideToleratedMs.length > 0 ? Math.max(...outsideToleratedMs) : 0;
          fact(SPEC, "axis_intra_gesture_over_ceiling_episodes_ms", episodes.map((e) => e.map((iv) => round1(iv.toMs - iv.fromMs))));
          fact(SPEC, "axis_intra_gesture_interval_judged_ms", Number(intraJudgedMs.toFixed(2)));
          // Non-vacuity: a cut that keeps nothing would pass any ceiling.
          expect(
            intraMs.length,
            "nenhum intervalo de eixo caiu dentro de [moveStart, moveEnd] — o corte intra-gesto ficou vazio e não mede nada",
          ).toBeGreaterThan(0);
          // Soft (`T-01.8`). `T-00.4` (cycle 2): judged on `intraJudgedMs`, the slowest interval outside
          // the one tolerated episode — not on the maximum. The ceiling (`160`) does not move.
          const episodesAttributed = episodes.map((e) => e.map((iv) => attributeIntraInterval(iv, attributionContext)));
          expect
            .soft(
              intraJudgedMs,
              `${episodes.length} episódios de intervalos entre aplicações de eixo DENTRO de um gesto passaram de ` +
                `${PAN_FRAME_CEILING_MS} ms (n=${intraMs.length} intervalos, ${intraMs.filter((v) => v > PAN_FRAME_CEILING_MS).length} ` +
                `acima do teto; máximo ${intraMaxMs.toFixed(2)} ms). A tolerância é de ${PAN_FRAME_TOLERATED_EPISODES_N} episódio, e o ` +
                `maior intervalo fora dele foi ${intraJudgedMs.toFixed(2)} ms; teto recalibrado de T-02.7 é ${PAN_FRAME_CEILING_MS} ms. ` +
                `A paginação entrou no quadro de pan. Os episódios, com onde o tempo ficou (T-00.4): ${JSON.stringify(episodesAttributed)}`,
            )
            .toBeLessThanOrEqual(PAN_FRAME_CEILING_MS);
        });
      });
    } catch (error) {
      // Held, not swallowed: re-thrown right after the host verdict below, which must run anyway.
      pagingError = error;
    }

    // ── 4. the host survives the pages (the former `e2e/22`, `T-01.5` DoD `11(b)`) ──────────────
    // HARD, own message, and it runs even when step 3 failed: a remount per page breaks step 3 too,
    // and the verdict that NAMES the remount must not hide behind it.
    await test.step("host survives the pages: data-chart-mount-count == 1 after every drag-triggered page", async () => {
      const pages = await probeCounts(page);
      const mountAfter = await readMountCount(page);
      fact(SPEC, "chart_mount_count_after", mountAfter);
      fact(SPEC, "chart_mount_count_pages_drawn_n", pages.drawn);
      const alsoFailed =
        pagingError === undefined
          ? ""
          : ` [o passo de paginação também reprovou: ${String(pagingError instanceof Error ? pagingError.message : pagingError)
              .split("\n")
              .find((line) => line.trim() !== "")
              ?.slice(0, 300)}]`;
      expect(
        mountAfter,
        `HOST REMONTADO: o gráfico foi recriado ${mountAfter - 1} vez(es) em ${pages.drawn} página(s) desenhada(s) — a página ` +
          "tem de ser setData no chart que já existe, não chart.remove() + createChart (FIX-regressoes-fase05.md §4.3)" +
          alsoFailed,
      ).toBe(1);
      // Non-vacuity: `== 1` after no page proves nothing.
      expect(
        pages.drawn,
        `apenas ${pages.drawn} página(s) desenhada(s) — o veredito do host precisa de >= ${HOST_SURVIVAL_MIN_PAGES}` + alsoFailed,
      ).toBeGreaterThanOrEqual(HOST_SURVIVAL_MIN_PAGES);
    });
    if (pagingError !== undefined) {
      throw pagingError;
    }
  } finally {
    pressureSampler?.stop();
    stubLoopDelay.disable();
    if (instance !== undefined) await instance.close();
    await stub.close();
  }
});
