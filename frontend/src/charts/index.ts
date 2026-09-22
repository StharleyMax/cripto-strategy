/**
 * `charts/index.ts` — the ONE sanctioned crossing point from `web` into `charts`
 * (`ADR-034/D8`, plan `02` item `2.1`). Before this file, `eslint.config.mjs` forbade EVERY
 * `web -> charts` import (`ADR-003/D5.12`) — correctly, because nothing under `src/app/`
 * mounted a chart yet (`T-05.2`'s own handoff: "no actual chart rendering"). `T-02.4` is that
 * first mount, and `ADR-034/D8` carves the exception NARROWLY: one file, re-exporting exactly
 * the surfaces a page needs to assemble the S2-mínima screen, nothing wider.
 *
 * SO REEXPORTAÇÃO — zero função nova de geometria (plan `02` item `2.1`, literal). Every name
 * below is defined and already tested in its own sibling module; this file adds no behavior,
 * only a single, narrow doorway to it. `eslint.config.mjs`'s new block (`files:
 * ["src/app/symbol/**"]`) is what actually enforces "only this file, never a deep
 * `charts/s2-*` import" — `eslint-boundary.test.ts` proves both halves (morde on the deep
 * import, cala on this one) in the same run.
 *
 * THE SIX CATEGORIES `ADR-034/D8` NAMES (a sixth added by `T-02.4`, see below), one
 * `export *`/named block per category:
 *
 *   1. execução headless S2       — `s2-headless-run.ts` (`runHeadlessChart` + its types).
 *      Not a browser-mount API — a jsdom-backed `lightweight-charts` runner. Its production
 *      consumer is a TEST under `src/app/symbol/` (`CA-F2-5`, axis fidelity at full 4-day/
 *      1-minute density) that lives OUTSIDE `src/charts/` and therefore has to cross this
 *      same boundary, same as `page.tsx` does for the rest.
 *   2. composição de painéis       — `s2-panels.ts` (`buildS2Panels` and the panel shapes/
 *      constants it is built from: `SYMBOL` and the timeframe constants, incluindo
 *      `S2_AXIS_STEP_MS` — `T-02.1`/`D-C3.2`'s ONE shared axis grid step), mais a janela
 *      (`s2-window.ts`, categoria `2b` abaixo), que deixou de ser constante deste módulo.
 *   3. adaptador lightweight       — `s2-lightweight-adapter.ts`'s LOSSLESS mappings only
 *      (`candlestickSeriesLossless`/`lineSeriesLossless`). `naiveDropGapsLine` is
 *      DELIBERATELY NOT re-exported: that module's own docstring names it "the WRONG mapping
 *      ... dead code from production's point of view", kept only as `charts`' own internal
 *      negative control (`s2-axis-integration.test.ts`) — sanctioning it here would hand a
 *      `web` caller the one function whose entire purpose is to demonstrate a bug.
 *   4. tokens de cor               — `color-tokens.ts` (`colorTokens`/`candlestickSeriesColors`
 *      and the guard `assertNoForbiddenColorRoles`/`FORBIDDEN_COLOR_ROLE_SUBSTRINGS`), mais o
 *      SUPORTE em que essa tinta é aplicada (`chart-theme.ts`: `chartSurfaceTheme`). Os dois
 *      andam juntos de propósito — `DR-1` mediu o que acontece quando só a tinta é governada e
 *      o fundo fica no default da biblioteca (`#FFFFFF`): a linha de delta do CVD a `1,22:1`
 *      numa página `#131722`, com o portão de contraste verde o tempo todo.
 *   5. tipos de política de ausência — `s2-absence-policy.ts` (`resolveStockReading`/
 *      `resolveFlowReading` and their formatters) — `D5.2`/`D5.3`'s STOCK-held/FLOW-absent
 *      rules, exercised by `T-02.4` on real (or really-absent) OI/CVD data for the first time.
 *   6. eixo único (`D-C3.1`, `T-02.4`) — `time-axis-controller.ts` (`toLogicalRange`/
 *      `fromLogicalRange`, plus `TimeAxis`/`TimeRange`/`LogicalRange` as VALUES) and
 *      `range-dispatch.ts` (`createRangeDispatcher`/`RangeDispatcher`/`PanelWrite`). This is
 *      the fewest names `web` needs to stop `fitContent()` being a per-chart decision (plan
 *      `02` item `2.3`): neither the bound `TimeAxisController` object nor
 *      `ReentrancyGuard`/`createReentrancyGuard` cross here — `createRangeDispatcher` already
 *      builds and owns a guard internally (`range-dispatch.ts`, `T-02.3`) — and
 *      `anchorTimeframeSwitch` (`timeframe-switch.ts`) does not either: this route has no
 *      timeframe selector yet, so sanctioning it now would hand `web` a function with no
 *      caller, the same over-wide-door mistake `naiveDropGapsLine` (category 3) already
 *      refuses to make.
 */

// ── 1. execução headless S2 ─────────────────────────────────────────────────────────────────
export { runHeadlessChart } from "./s2-headless-run.ts";
// ⛔ `T-01.8` acrescenta a esta MESMA categoria o shim de jsdom em que `runHeadlessChart` já é
// construído, e pelo MOTIVO QUE A CATEGORIA 1 JÁ DECLARA acima, palavra por palavra: o consumidor
// de produção dela é um TESTE sob `src/app/symbol/` que vive FORA de `src/charts/` e por isso tem
// de cruzar esta mesma porta. `volume-subaxis-geometry.test.ts` mede a altura EM PIXEL das barras
// do sub-eixo contra a biblioteca real, com as constantes lidas do próprio `SymbolClient.tsx` — e
// `runHeadlessChart` não serve: ele fixa `height = 600`, monta só `candlestick`/`line` e não expõe
// `priceToCoordinate`, que é justamente a medida. Reexportar o shim é a alternativa mais estreita
// que existe; a outra era duplicar ~60 linhas de proxy de `CanvasRenderingContext2D` em `web`.
export { installGlobals, flushFrames } from "./headless-chart.ts";
export type {
  HeadlessSeriesSpec,
  HeadlessSeriesResult,
  HeadlessRunHandle,
} from "./s2-headless-run.ts";

// ── 2. composição de painéis ─────────────────────────────────────────────────────────────────
export {
  SYMBOL,
  ONE_MINUTE_MS,
  FIVE_MINUTES_MS,
  S2_AXIS_STEP_MS,
  S2_PRICE_USE,
  buildPricePanel,
  buildOiPanel,
  buildCvdPanel,
  buildS2Panels,
} from "./s2-panels.ts";
export type { OiPanel, CvdPanel, PricePanel, S2Panels, S2RawInputs } from "./s2-panels.ts";

// ── 2b. janela (`s2-window.ts`) — a geometria da janela que os painéis cobrem ────────────────
//
// `web` deriva a janela por esta função e NÃO a calcula: "série→geometria é `charts`"
// (`ADR-003` FR-2). O que `web` fornece é a leitura do relógio, que é I/O e por isso é dele.
// `lastGridInstant(window, gridMs)` entra aqui pelo mesmo motivo (wave `03`, C3 do
// `quant-architect`): a conversão meia-aberta→inclusiva é aritmética de bucket, e ela estava
// escrita DUAS VEZES sob `src/app/symbol/` — a segunda implementação da grade que FR-2 nomeia.
// ⛔ `s2-fixture-window.ts` (a janela das 4 dias de CSV em disco) NÃO é reexportada aqui, de
// propósito — ver o docstring daquele módulo: é o que impede uma rota de voltar a ler uma
// janela congelada (`ACHADO-SERIES-HISTORY-SEM-PONTO.md`, segundo defeito).
export { ONE_DAY_MS, S2_WINDOW_SPAN_MS, lastGridInstant, resolveTrailingWindow, utcDaysCovered } from "./s2-window.ts";
export type { S2Window, TrailingWindowRequest } from "./s2-window.ts";

// ── `T-02.1`/`CA-5a` follow-up — THE SAME PRIMITIVE `buildOiPanel`/`buildCvdPanel` ALREADY GRID-
// PAD WITH, NOW REACHABLE FROM `web` DIRECTLY. `long_short`/`liquidation` are NOT part of
// `S2Panels` (`ADR-003`; those two panes are `components = ["web"]`, `[symbol]/page.tsx`'s own
// comment on why), so before this line the ONE grid-alignment function every OTHER panel goes
// through (`buildScalarSeries`, already used inside `s2-panels.ts` — not new geometry) was
// unreachable outside `charts`, and `view-model.ts::nonNegativeFlowSlotsFromHistoryRows` fell
// back to counting wire rows one-for-one — correct only while `/series-history` always answers
// the full grid, and silently wrong the moment an upstream failure makes it answer `rows: []`
// (`gates/FASE-02-qa.md`, achado bloqueante `CA-5a`: `long_short_slots`/`liquidation_slots`
// collapsed to `0` while `price`/`oi`/`cvd` stayed grid-padded at the full window). Exporting the
// primitive itself, rather than adding a fourth panel-shaped wrapper, keeps `web` the one place
// that composes non-`S2Panels` panes while `charts` stays the one place grid alignment is coded.
export { buildScalarSeries } from "./s2-scalar-grid.ts";

// ── 3. adaptador lightweight (LOSSLESS mappings only — see module docstring above) ───────────
// `T-01.8` (design_gate da fase `01`) acrescenta TRÊS mapeamentos a esta MESMA categoria — e
// eles não alargam a porta: continuam sendo `ScalarSlot[] -> (LineItem|WhitespaceItem)[]`, a
// assinatura exata que `lineSeriesLossless` já expõe. São a geometria que os dois `BLOCKER` do
// laudo exigem: `positiveValueSeriesLossless` (o que uma escala log10 consegue posicionar) e o
// par `absenceMarkSeries`/`zeroMarkSeries` (a MARCA que distingue "não sabemos" de "foi zero",
// `STITCH_CONTEXT.md:1821-1825`). ⛔ Nenhum deles decide ALTURA, COR ou ESCALA: o valor da marca
// é argumento do chamador, porque isso é forma e forma é de `web` (`ADR-003` FR-1).
export {
  candlestickSeriesLossless,
  lineSeriesLossless,
  positiveValueSeriesLossless,
  absenceMarkSeries,
  zeroMarkSeries,
} from "./s2-lightweight-adapter.ts";
export type {
  UnixSeconds,
  CandlestickItem,
  LineItem,
  WhitespaceItem,
} from "./s2-lightweight-adapter.ts";

// ── 4. tokens de cor ─────────────────────────────────────────────────────────────────────────
export {
  colorTokens,
  candlestickSeriesColors,
  dojiItemColors,
  HOLLOW_BODY_FILL,
  assertNoForbiddenColorRoles,
  FORBIDDEN_COLOR_ROLE_SUBSTRINGS,
  CONTRAST_BACKDROP,
  SURFACE_BASE,
} from "./color-tokens.ts";
export type { ColorRole, ColorTokens, ContrastBackdrop } from "./color-tokens.ts";
export { relativeLuminance, contrastRatio } from "./contrast.ts";
// The surface the canvas is CLEARED to — the value `createChart` receives and the value every
// `kind: "surface"` contrast ratio is measured against, so the two cannot be different things
// (`DR-1` of `gates/design-review-painel-cvd.md`).
export { chartSurfaceTheme, CHART_GRID_LINE } from "./chart-theme.ts";
export type { ChartSurfaceTheme } from "./chart-theme.ts";

// ── 5. tipos de política de ausência ─────────────────────────────────────────────────────────
export {
  resolveStockReading,
  resolveFlowReading,
  closeTimeMs,
  formatCloseStamp,
  formatHeldStockLabel,
  formatFlowValue,
} from "./s2-absence-policy.ts";
export type { SeriesNature, StockReading, FlowReading } from "./s2-absence-policy.ts";

// ── 6. eixo único ────────────────────────────────────────────────────────────────────────────
//
// `D-C3.1`: `web` assina, despacha e aplica; a álgebra pura mora aqui. `toLogicalRange`/
// `fromLogicalRange` são o que `axis-sync.ts` usa para converter o `TimeRange` inicial (a
// janela inteira do eixo) na `LogicalRange` que substitui o `fitContent()` por painel (plan
// `02` item `2.3`) — `createRangeDispatcher` é o que liga os seis painéis a ESSE `TimeRange`
// registrado, com a guarda de reentrância (`T-02.3`) já embutida.
export { toLogicalRange, fromLogicalRange } from "./time-axis-controller.ts";
export type { TimeAxis, TimeRange, LogicalRange } from "./time-axis-controller.ts";
export { createRangeDispatcher } from "./range-dispatch.ts";
export type { RangeDispatcher, PanelWrite } from "./range-dispatch.ts";
