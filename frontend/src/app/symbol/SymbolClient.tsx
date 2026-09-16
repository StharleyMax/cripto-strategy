"use client";

/**
 * `T-02.4` — the Client Component half of `/symbol`. `page.tsx` (Server Component, `async`)
 * does every network call and hands this component `{ panels, panelStatus, liveUrls }` by
 * props, all JSON-serializable (`S2Panels` is plain data; `PanelStatus`/the `liveUrls` record
 * are plain discriminated values/strings) — same RSC-boundary discipline `ConsoleClient.tsx`
 * documents for its own props.
 *
 * `T-02.5` (`SPEC-007` plan `02` item `2.6`) gives the CVD pane REAL DATA: the route now selects
 * the `cvd_source`/`binance`/`NA` catalog row (`kline_takerbuy`) instead of a `cvd_delta` metric
 * no backend builder ever produced, and this component gains one more plain prop (`cvd`) with
 * what the pane DECLARES about itself — how many grades of the window are readable, since when,
 * and which instant the cumulative curve is anchored at.
 *
 * `T-01.7` (`SPEC-007 §3.6`) adds a VOLUME SUB-AXIS to the Price pane — `klines_volume`, `1m`,
 * a histogram on its own price scale INSIDE the price chart, not a fourth pane. It arrives here
 * as one more prop (`volume`), computed server-side like every other, and it degrades on its
 * own (`panelStatus.volume`): price present with volume absent is a real, expected state.
 *
 * Mounts `lightweight-charts` directly (the library this repo already depends on,
 * `package.json`) for 3 panes — Price (candlestick + volume histogram), OI (line), CVD (two
 * lines: delta and cumulative) — feeding each one the LOSSLESS mapping (`candlestickSeriesLossless`/
 * `lineSeriesLossless`, the barrel's "adaptador lightweight" category): an absent grid slot
 * becomes a bare `{time}` `WhitespaceItem`, which the library places on the axis and draws
 * NOTHING for — never a `0` (`CA-F2-3`).
 *
 * ⛔ THE `design_gate` OF 2026-09-12 BLOCKED THIS FILE ON THREE FINDINGS, and the three are paid
 * here (`docs/context/cinco-metricas-do-core/gates/design-review-painel-cvd.md`):
 *   - `DR-1` — `createChart` had no `layout`, so every canvas kept the library default `#FFFFFF`
 *     inside a `#131722` page and the CVD delta line measured 1,22:1 ON SCREEN against 14,72:1 in
 *     the contrast gate. Options now come from `chartConstructorOptions()`, and three instruments
 *     make the divergence detectable instead of silent — see that module's docstring.
 *   - `DR-2` — delta and cumulative shared the default price scale, which flattens one of the two
 *     by construction (`max|cum| >= max|delta|`). The cumulative got a scale of its own.
 *   - `DR-3` — the two lines were distinguished ONLY by hue (WCAG 1.4.1) and the cumulative had no
 *     number anywhere in the DOM. Dash pattern + legend + `Acumulado atual:` readout.
 *
 * Below each chart, a small "leitura atual" readout exercises the barrel's absence-policy
 * functions (`resolveStockReading`/`resolveFlowReading`) at the window's own last instant —
 * `D5.2`/`D5.3`'s STOCK-held/FLOW-absent rules, genuinely read here, not merely imported.
 *
 * The live section is intentionally minimal: `GET /series-live`'s own backend producer is NOT
 * wired yet (`docs/context/pagina-de-grafico-s2/gates/F1-builder.md`, "Bloqueado" item 3 —
 * `LiveBucketSource`/`SeriesWindowReader` are unconnected Protocol stubs) — so an `EventSource`
 * opened against `liveUrls` will fail to connect in this phase, and this component shows that
 * failure as "ao vivo indisponível", the SAME absence-as-absence posture the rest of this page
 * follows, rather than pretending a live feed exists.
 */

import { useEffect, useRef, useState, type RefObject } from "react";
import type {
  CandlestickSeriesOptions,
  HistogramSeriesOptions,
  IChartApi,
  LineSeriesOptions,
  ISeriesApi,
} from "lightweight-charts";
import {
  CandlestickSeries,
  createChart,
  HistogramSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
} from "lightweight-charts";

import {
  absenceMarkSeries,
  candlestickSeriesColors,
  candlestickSeriesLossless,
  colorTokens,
  formatHeldStockLabel,
  lastGridInstant,
  lineSeriesLossless,
  ONE_MINUTE_MS,
  positiveValueSeriesLossless,
  resolveFlowReading,
  resolveStockReading,
  zeroMarkSeries,
  type FlowReading,
  type S2Panels,
} from "../../charts/index.ts";
import { chartConstructorOptions } from "./chart-options.ts";
import { decodeBucketEnvelope, type LiveBucketEnvelope } from "../live-transport.ts";
import type { FreshnessVerdict, PanelStatus, SeriesProvenance, SymbolPanelStatuses } from "./panel-status.ts";

/** `ScalarSlot`'s shape, read off the barrel's own `S2Panels` (`ADR-034/D8` — no deep import
 * into `charts`, and no import of `view-model.ts`, which is server-side: it pulls
 * `node:crypto`, and `web-fullstack.browser-imports-server` is a BLOQUEIO). */
type VolumeSlot = S2Panels["oi"]["slots"][number];

/**
 * `T-01.7` — everything the volume sub-axis needs, computed server-side (`page.tsx` +
 * `view-model.ts`) and handed over as plain, JSON-serializable data, same RSC-boundary
 * discipline as `panels`/`panelStatus`. This component draws it; it decides nothing about it.
 */
export interface VolumeSubAxisData {
  readonly slots: readonly VolumeSlot[];
  /** Slots carrying a real value — the number `DoD-3`/`RN-S2` count against `N >= 30`. */
  readonly presentPoints: number;
  /** The FIRST grid instant of the window that carries a real value, or `null` when none does.
   *
   * Exists because of a measured fact about this screen, not for decoration: over the derived
   * 4-day window only `769/5.761` grades carry a value and the first one sits at index
   * `4.971/5.761` `[MEDIDO 2026-09-11, ACHADO-BACKFILL-INVISIVEL-AO-AS-OF.md]` — the leftmost
   * 86% of the chart is structurally empty because backfilled rows carry `available_at = the
   * instant we FETCHED them`, which `R-1` correctly refuses at their own grid instant. That
   * absence is REAL (we did not know it then), so the chart is not lying — but an operator
   * cannot tell it apart from "o mercado não teve dado", and `RN-1` is exactly about not
   * letting one kind of absence pass for another. So the screen DECLARES the horizon as a
   * measured fact (`quant-architect`, wave `03`, C4). ⛔ The span is NOT shrunk to fit the data:
   * it is `PRD-006 §2`/item `5.1`'s, and a window that shrinks to hide its own hole is worse
   * than one that names it. */
  readonly firstPresentMs: number | null;
  readonly reading: FlowReading;
}

/**
 * `T-02.5` — everything the CVD pane DECLARES about itself that is not already in
 * `panels.cvd`, computed server-side (`page.tsx`) and handed over as plain data, same
 * RSC-boundary discipline as `volume`. This component draws it; it decides nothing about it.
 */
export interface CvdPaneData {
  /** Delta slots carrying a real value — the number `DoD-3` counts against `N >= 30`. For a
   * `1m`-NATIVE series this is also the count of DISTINCT native bars, with no `RN-S1` `/5`
   * divisor (`view-model.ts::countPresentSlots`, same argument it gives for M1). */
  readonly presentPoints: number;
  /** The FIRST grid instant of the window whose delta is readable, or `null` when none is —
   * the left end of the readable horizon, DECLARED instead of left to look like a dead market.
   * Same measured reason as `VolumeSubAxisData.firstPresentMs`, and CVD inherits it exactly:
   * it is the same collector, the same row, the same `available_at`
   * (`handoff/ACHADO-BACKFILL-INVISIVEL-AO-AS-OF.md`). ⛔ The span is NOT shrunk to fit. */
  readonly firstPresentMs: number | null;
  /** WHERE THE CUMULATIVE CURVE STARTS COUNTING FROM, chosen by the route and printed on
   * screen. `delta` is anchor-free; `cumulativo` is a VIEW whose every point depends on this
   * instant, and three anchors over the SAME deltas invert the sign of the total (`D4.7`) — so
   * an anchor inherited in silence is a chart that cannot be read. */
  readonly anchorMs: number;
}

/**
 * `T-03.5` — everything the OI pane DECLARES about itself beyond `panels.oi`, computed
 * server-side (`page.tsx`) and handed over as plain data, same RSC-boundary discipline as
 * `volume`/`cvd`. This component draws it; it decides nothing about it.
 */
export interface OiPaneData {
  /** ⛔ NATIVE 5-MINUTE BUCKETS carrying a real value — the number `DoD-3` counts against
   * `N >= 30`, and the `RN-S1` divisor paid in the TYPE instead of in a `/5`.
   *
   * `page.tsx` derives it from `panels.oi.slots`, which is the 5-minute canonical grid
   * (`buildOiPanel`, `FIVE_MINUTES_MS`) — one slot per native bucket. It is NOT the count of
   * readable wire rows: the route serves this `5m` series on the `1m` grid (`GA-2`), so one
   * native bucket appears as up to five rows and that count runs ~5x high. */
  readonly nativeBars: number;
  /** The STAIRCASE count — readable rows on the `1m` wire grid, i.e. the number `nativeBars`
   * would have been if nobody applied `RN-S1`. On screen beside it, and never quoted as the
   * amount of data: it is here so the ratio is visible and so `e2e/12-oi-dado-real.spec.ts` can
   * assert that the pane publishes the OTHER one. A falsifier needs both figures. */
  readonly wirePoints: number;
  /** Left end of the readable horizon (first native bucket with a value), `null` when none —
   * same measured reason as `VolumeSubAxisData.firstPresentMs`, and OI has it worse: over the
   * 4-day window the backfilled rows carry `available_at = the instant we fetched them`, so
   * `as_of` correctly refuses them at their own grid instant
   * (`ACHADO-BACKFILL-INVISIVEL-AO-AS-OF.md`). ⛔ The span is NOT shrunk to fit the data. */
  readonly firstPresentMs: number | null;
  /** Right end of the same horizon — the input of the `RNF-2` verdict below, on screen so the
   * age the pane claims can be recomputed from the instant it was computed against. */
  readonly lastPresentMs: number | null;
  /** `RNF-2`'s ceiling: the catalog's OWN `max_staleness_ms` for this series (`600_000` = 2 x
   * the `5m` native bucket), already served in every `GET /series-catalog` row. `null` when the
   * panel resolved no entry. */
  readonly maxStalenessMs: number | null;
  /** `RNF-2` — whether the newest readable point is past that ceiling. The pane must not show a
   * number older than the series' own periodicity without SAYING it is old. */
  readonly freshness: FreshnessVerdict;
}

/**
 * `T-05.9` — ONE COHORT of `sum_liquidation` (M4), computed server-side (`page.tsx` +
 * `view-model.ts`) and handed over as plain, JSON-serializable data, same RSC-boundary discipline
 * as `volume`/`cvd`/`oi`. This component draws it; it decides nothing about it.
 *
 * ⛔ TWO OF THESE, NEVER ONE SUMMED — `liquidation_catalog.py`'s own argument, quoted in
 * `view-model.ts`'s selector section: long liquidation is forced SELLING and short liquidation is
 * forced BUYING, and their sum moves identically whether the market flushed longs, flushed shorts
 * or flushed both, erasing the discrimination the metric exists to provide (`RF-2`).
 */
export interface LiquidationCohortData {
  readonly slots: readonly VolumeSlot[];
  /** Slots carrying a real OBSERVATION — a value, possibly the legitimate zero of `ZL-3`. The
   * number `DoD-3` counts against `N >= 30`. `1m` native, so no `RN-S1` `/5` divisor. */
  readonly presentPoints: number;
  /** How many of those observations are a LEGITIMATE ZERO. Published beside `presentPoints` and
   * never folded into it: over the route's own 4-day window the long cohort answers `191` present
   * of `5.761`, and `62` of the `191` are zeros `[MEDIDO 2026-09-16]` — a pane quoting only the
   * first number lets a reader take all `191` for liquidation events, overstating by `1,5x`. Same
   * "a falsifier needs both figures" discipline `OiPaneData.wirePoints` already applies. */
  readonly zeroPoints: number;
  /** The FIRST grid instant carrying an observation, or `null` when none does — the left end of
   * the readable horizon, DECLARED rather than left to look like a market with no liquidations.
   * ⛔ The span is NOT shrunk to fit the data; same rule as `VolumeSubAxisData.firstPresentMs`. */
  readonly firstPresentMs: number | null;
  readonly reading: FlowReading;
}

/**
 * `T-05.9` — the liquidation pane as a whole: both legs plus the ONE fact that belongs to the
 * series rather than to a cohort, `RS-5`'s provenance.
 *
 * `provenance` is resolved from the LONG entry and applies to both: the two rows differ only in
 * `cohort`, so `provider`/`venue`/`reconstructed_from`/`published_error` are identical by
 * construction (`liquidation_catalog.py` builds both from one comprehension over `COHORTS`).
 * `page.tsx` states that out loud at the call site rather than leaving it implied here.
 */
export interface LiquidationPaneData {
  readonly long: LiquidationCohortData;
  readonly short: LiquidationCohortData;
  readonly provenance: SeriesProvenance;
  /** The `unit` term of the series' own identity (`USD` for M4), read off the resolved catalog
   * entry and printed beside the numeral — `null` when no entry resolved, in which case there is
   * no number on screen to give a unit to either.
   *
   * Carried instead of spelled as a literal here because of `W-1` of `gates/design-01.md`: the
   * volume sub-axis shipped a numeral with no unit and the ambiguity was five orders of magnitude.
   * A literal `"USD"` in this file would say the same thing while being free to drift away from
   * the identity the backend actually published. */
  readonly unit: string | null;
}

export interface SymbolClientProps {
  readonly panels: S2Panels;
  readonly volume: VolumeSubAxisData;
  readonly cvd: CvdPaneData;
  readonly oi: OiPaneData;
  readonly liquidation: LiquidationPaneData;
  readonly panelStatus: SymbolPanelStatuses;
  /** `knowledge_time_ms` of the request this render was built from (`request-window.ts`). Shown
   * nowhere; carried to the DOM as a `data-` attribute so the screen can be AUDITED against the
   * read API over exactly the window the server used — which is what lets `e2e/08` cross-check
   * DOM against `/series-history` without seeding anything (`[P-seed]`). */
  readonly knowledgeTimeMs: number;
  readonly liveUrls: { readonly price: string | null; readonly oi: string | null; readonly cvd: string | null };
}

const ABSENCE_REASON_LABEL: Record<Exclude<PanelStatus, { kind: "ok" }>["reason"], string> = {
  not_in_catalog: "sem série cadastrada no catálogo",
  // `T-03.5`: the catalog answered with MORE THAN ONE candidate and the route refuses to choose
  // by position. Said on screen because the alternative — drawing whichever row came first — is
  // the defect that put this panel on an empty series for a whole phase.
  ambiguous_in_catalog: "o catálogo tem mais de uma série candidata e a escolha seria por posição",
  missing_base_url: "configuração de API ausente",
  connection_refused: "API de leitura inacessível",
  non_2xx: "API respondeu com erro",
  malformed_envelope: "resposta em formato inválido",
};

function AbsenceNote({ status }: { readonly status: PanelStatus }) {
  if (status.kind === "ok") {
    return null;
  }
  return (
    <p role="status" data-fact={`panel_absent:${status.reason}`} className="text-sm text-provenance-weak">
      Sem dado real neste painel — {ABSENCE_REASON_LABEL[status.reason]}. Nenhum número é mostrado no lugar
      (nunca um zero fabricado).
    </p>
  );
}

/** The window's own last grid instant — the one the "leitura atual" readouts query, and the
 * same one `page.tsx` sends as `window_end_ms`.
 *
 * READ OFF THE PANELS, not off a constant: the window is derived per request now
 * (`request-window.ts`), so a module-level constant here would drift away from the data the
 * server actually fetched — which is the very shape of the defect this replaced
 * (`ACHADO-SERIES-HISTORY-SEM-PONTO.md`, second defect: a frozen window outliving its data).
 *
 * ⛔ AND IT IS NOT COMPUTED HERE. Subtracting one minute from the exclusive edge used to be
 * written out in this file AND in `request-window.ts` — two copies of the same half-open →
 * inclusive bucket conversion inside `web`, which is literally the "segunda implementação da
 * grade canônica"
 * `ADR-003` FR-2 names as the failure mode where the screen and the engine disagree about what
 * happened. `lastGridInstant` is that conversion, living in `charts` where geometry belongs
 * (`quant-architect`, wave `03`, C3). */
function lastInstantMs(panels: S2Panels): number {
  return lastGridInstant(panels.window, ONE_MINUTE_MS);
}

/** ⛔ FORM, submitted to the `design_gate` — `DR-4` of `gates/design-review-painel-cvd.md` asks
 * for a `ResizeObserver`/`autoSize` on top of this, and that is a MEDIUM item of that report's
 * roadmap, not one of the three blockers this pass exists to clear. Named as a constant here so
 * the next pass has one place to change instead of a literal inside a call. */
const CHART_HEIGHT_PX = 220;

function useLightweightChart(containerRef: RefObject<HTMLDivElement | null>, build: (chart: IChartApi) => void): void {
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    // ⛔ THE OPTIONS ARE NOT SPELLED HERE, AND THAT IS THE FIX — `DR-1` of
    // `gates/design-review-painel-cvd.md`. This call used to pass `width`/`height`/`timeScale`
    // only, so the canvas kept the library default `#FFFFFF` background inside a `#131722`
    // page and the CVD delta line measured `1,22:1` on screen while `color-contrast.test.ts`
    // read `14,72:1` against a surface nothing was painted on. Building the options here
    // instead of naming them would have fixed THIS pane and left the next one free to do it
    // again: `chart-construction.test.ts` can only require a NAME.
    const chart = createChart(container, chartConstructorOptions(container.clientWidth || 600, CHART_HEIGHT_PX));
    build(chart);
    chart.timeScale().fitContent();
    return () => {
      chart.remove();
    };
    // `build` intentionally excluded from the dependency list: it is a fresh closure every
    // render by construction (it captures this render's own panel slots), and
    // `lightweight-charts` owns its own mount/unmount lifecycle — re-running this effect on
    // every render would tear the chart down and rebuild it constantly instead of once per
    // mount. No `react-hooks` plugin is configured in this project's `eslint.config.mjs`, so
    // no rule enforces exhaustive deps here; this comment names the intent for a reader.
  }, [containerRef]);
}

/** `T-04.3` (`CA-F4-3`): a "leitura atual" readout for Preço, same shape `OiPane` already has
 * for OI — the falsifier this fase exists for needs a REAL NUMBER in the DOM, not only the
 * chart canvas (`lightweight-charts` draws to `<canvas>`, opaque to a DOM assertion). No new
 * absence policy: `panels.price.series.slots` (`GridSlot[]`, `candle: RawCandle | null`) is
 * mapped onto the exact `{ time, value }` shape `resolveStockReading` already takes for OI —
 * the SAME pure function, reused, not a price-specific reimplementation. `nativeTimeframeMs =
 * ONE_MINUTE_MS` because price's own native grid IS 1 minute (unlike OI's 5), so this always
 * resolves `"exact"` or `"absent"`, never `"held"` — there is no coarser native grid to hold
 * across for this panel.
 */
// ── The volume sub-axis (`T-01.7`, `SPEC-007 §3.6`) ─────────────────────────────────────────
//
// ⛔ THE STABLE SELECTOR. `T-01.9`'s e2e finds the sub-axis by THIS string and reads
// `data-volume-present-points` off it. It is a CONTRACT, not styling: the `design_gate`
// (`T-01.8`) may change height, scale, color and how absence LOOKS without touching it, which
// is exactly what makes the two tasks parallelizable — a `NEEDS_FIX` about form must not be
// able to break an assert about data.
const VOLUME_SUBAXIS_TESTID = "price-pane-volume-subaxis";

// ⛔ THE STABLE SELECTOR OF THE CVD PANE (`T-02.5`), and it is the same KIND of contract the
// line above is for `T-01.9`: `e2e/10-cvd-dado-real.spec.ts` finds this pane by THIS string and
// reads `data-cvd-present-points` off it. Form — colour, height, where the readout sits, how
// absence LOOKS — belongs to the `ui-designer` with the `ux-ui-mastery` verdict and may change
// without touching either string. `section[aria-label="CVD"]` is NOT used as the handle: the
// label is user-visible pt-BR microcopy, and selecting by text of UI is what `T-02.6` forbids.
const CVD_PANE_TESTID = "cvd-pane";

// ⛔ AND THE SAME CONTRACT FOR THE OI PANE (`T-03.5`): `e2e/12-oi-dado-real.spec.ts` finds it by
// THIS string. `section[aria-label="Open Interest"]` is NOT the handle — that label is
// user-visible pt-BR microcopy the `design_gate` may restyle or reword, and selecting a DATA
// assertion by the TEXT OF UI is what makes a form change break a data test.
const OI_PANE_TESTID = "oi-pane";

/** `RN-1`'s literal token: absence is `SEM_PONTO`, and for a `FLOW` series rendering it as `0`
 * is an error of TYPE, not of taste. `DoD-3` asserts this exact string's ABSENCE from the CVD
 * pane once data is present, so it is as load-bearing as a testid.
 *
 * ⚠️ `T-02.5` MADE THE CVD READOUT USE IT TOO, and the previous version of this comment said the
 * opposite ("`formatFlowValue`'s `—` is the CVD readout's own wording and is deliberately NOT
 * reused here"). Why it changed: `formatFlowValue` (`D5.3`) is the CROSSHAIR wording and stays
 * exactly as it is inside `charts` — but on THIS screen it made CVD the only one of four
 * readouts spelling absence differently from the other three (Preço, OI and o sub-eixo de Volume
 * all print `SEM_PONTO`), and `DoD-3`'s "não diz `SEM_PONTO`" is unfalsifiable against a pane
 * that could never say it: a test that passes whether or not the data arrived proves nothing.
 * One token, four readouts, one thing for an operator to learn. ⛔ FORM SUBMITTED TO THE
 * `design_gate`, not decided here — `CLAUDE.md` §"Design — autonomia delegada, com gate de
 * validação"; what a builder decides is that absence is DISTINGUISHABLE and machine-readable. */
const ABSENCE_TOKEN = "SEM_PONTO";

// ⛔ FORM, NOT CONTRACT — every constant in this block belongs to the `ui-designer` WITH the
// `ux-ui-mastery` verdict (`T-01.8`, `CLAUDE.md` §"Design — autonomia delegada, com gate de
// validação"). What is here is the sober, functional placeholder a builder is allowed to write
// so the data can be seen at all; it is NOT a design decision and must not be read as one.
// `priceScaleId` is a scale of its OWN, separate from price's — that part IS structural
// (`SPEC-007 §3.6`: a SUB-AXIS of `PricePane`), since sharing price's scale would flatten one
// of the two series into nothing.
const VOLUME_PRICE_SCALE_ID = "volume";
const VOLUME_SCALE_MARGINS = { top: 0.8, bottom: 0 } as const;

// ⛔ `BLOCKER-1` DO `design_gate` DE `T-01.8`, E ELE ERA ARITMÉTICO, NÃO DE GOSTO
// (`docs/context/cinco-metricas-do-core/gates/design-01.md` §2). Com a escala LINEAR ancorada no
// máximo da janela, o volume de 1 min do BTCUSDT (`max/p50 = 60,8x`) dava uma barra mediana de
// `0,62 px` e punha `954/1.404` barras presentes (`67,9%`) abaixo de 1 pixel físico — e uma barra
// sub-pixel é, no canvas, a mesma coisa que a ausência: nada. WCAG 1.4.11 reprova (um objeto
// gráfico necessário para entender o conteúdo tem de ser PERCEPTÍVEL, e nenhum contraste torna
// perceptível uma marca de 0,62 px).
// `[MEDIDO 2026-09-15 contra a própria `lightweight-charts@5.2.1` em jsdom, n=1.404 grades
//  presentes em 24h de dado real; linear p50=0,62px / log10 p50=19,34px, 0 abaixo de 1px]`
//
// ⛔ CLIP NO `p95` FOI CONSIDERADO E RECUSADO PELO LAUDO, e não se ressuscita: ele também
// resolve a legibilidade, mas MENTE sobre o pico — uma barra recortada afirma `4931` e `1017`
// com a mesma altura.
//
// O QUE A BASE FAZ, e por que ela é `1` e não `0`: numa escala logarítmica a altura da barra é
// `log10(valor/base)`, então a base é o ZERO da leitura. `1` é uma âncora ABSOLUTA na unidade da
// própria série — a mesma altura significa o mesmo volume em qualquer janela —, ao contrário de
// ancorar no mínimo da janela, que faz o desenho mudar de significado quando a janela muda
// `[MEDIDO: base=1 -> menor barra 10,39px, p50 19,34px, 0/1403 abaixo de 1px; base=mínimo da
//  janela -> menor barra 0,00px e 9 abaixo de 1px]`.
const VOLUME_LOG_BASE = 1;

// ⛔ `BLOCKER-2`: A AUSÊNCIA NÃO TINHA MARCA, E A REGRA TRAVADA EXIGE UMA.
// `STITCH_CONTEXT.md:1821-1825`, verbatim: *"Zero legitimo do fornecedor e uma MARCA desenhada na
// linha de base, distinguivel de ausencia. 'Nao houve liquidacao' e 'nao sabemos' nao sao a mesma
// afirmacao."* — e `:223` registra que a tela materializada JÁ satisfazia isso (`D5.3`, "lacuna de
// `FLOW` como traço na linha de base"). O sub-eixo não herdou o traço: `WhitespaceItem` acerta
// dois dos três canais (não interpola, não zera) e falha o terceiro, a MARCA.
// `[MEDIDO 2026-09-15: 36 lacunas isoladas de 1 min em 24h (2,5%) e `zeros_exatos = 0` — a
//  colisão zero<->ausência não está viva HOJE, mas é estrutural, não sortuda]`
//
// AS MARCAS VIVEM NUMA ESCALA SÓ DELAS, e isso é estrutural e não estético: penduradas na escala
// do volume elas mudariam de altura com o dado (e entrariam no autoscale dele). A escala das
// marcas declara uma faixa FIXA em "pixels nominais da banda do sub-eixo", então o valor de cada
// marca se lê direto como altura.
const VOLUME_MARKS_PRICE_SCALE_ID = "volume_marks";
const VOLUME_MARKS_BAND_PX = CHART_HEIGHT_PX * (1 - VOLUME_SCALE_MARGINS.top);
// ⚠️ NOMINAL, NÃO MEDIDO — a banda real é ~15% menor que `VOLUME_MARKS_BAND_PX` porque o eixo de
// tempo come altura do painel. As alturas ABAIXO são as nominais; as MEDIDAS contra a biblioteca
// real, e a ordenação estrita entre elas, estão em `volume-subaxis-geometry.test.ts`
// `[MEDIDO 2026-09-15: ausência 1,70px < zero 5,10px < menor barra positiva 10,39px]`.
const ABSENCE_MARK_PX = 2;
const ZERO_MARK_PX = 6;
// ⛔ `ADR-010` GOVERNA A TINTA, E AS DUAS SÃO DA RAMPA DE PROCEDÊNCIA (`D-4`: luminância, hue
// zero). Nem verde/vermelho (são `fill` de DIREÇÃO de preço, e volume não tem direção) nem
// violeta (`dataBrokenInk` é INTEGRIDADE do dado, e uma lacuna de grade não é dado quebrado — é
// operacional; `S3Inspector.tsx:26` escreve a mesma distinção). A atribuição segue a semântica da
// rampa: ausência é o que NÃO se sabe, então tinta FRACA; zero legítimo é um fato OBSERVADO,
// então tinta FORTE. A distinção viaja por dois canais no canvas (luminância E altura) e por um
// terceiro em texto (`VolumeMarksLegend`), para que nenhuma perda isolada a apague.
const ABSENCE_MARK_COLOR_ROLE = "provenanceWeak" as const;
const ZERO_MARK_COLOR_ROLE = "provenanceStrong" as const;

// ⛔ AND THE SAME ARGUMENT, APPLIED WHERE IT IS STRONGER — `DR-2` of
// `gates/design-review-painel-cvd.md`. The two CVD series used to share the default right
// scale, in the same commit that wrote the sentence four lines above. The review's point is
// arithmetic, not taste: the cumulative IS the running sum of the very deltas plotted beside
// it, anchored at `window.startMs` (`page.tsx`, `cvdAnchorMs`), i.e. BEFORE the first plotted
// point — so `max|cum| >= max|delta|` BY CONSTRUCTION, with equality only in the degenerate
// single-bucket case. On a shared scale the axis reads in units of cumulative and the delta
// gets `max|delta| / max|cum|` of the panel's height. That is the flattening the volume
// sub-axis already refuses.
//
// So: delta keeps the default right scale (it is the series the readout and `DoD-3` are about,
// and it is the one that gets axis labels), and the cumulative goes to a scale of its own,
// stacked under it — the same `priceScaleId` + `scaleMargins` idiom as the volume sub-axis.
// ⛔ The MARGINS are form (`ui-designer` + `ux-ui-mastery`); the SEPARATION is structural.
const CVD_CUMULATIVE_PRICE_SCALE_ID = "cvd_cumulative";
const CVD_DELTA_SCALE_MARGINS = { top: 0.05, bottom: 0.55 } as const;
const CVD_CUMULATIVE_SCALE_MARGINS = { top: 0.55, bottom: 0.05 } as const;

// ── `T-05.9` — O PAINEL DE LIQUIDAÇÕES (M4), E A SÉRIE MAIS ESPARSA DA TELA ───────────────────
//
// ⛔ A ESTABILIDADE DOS SELETORES, primeiro: `e2e/13-liquidacoes-dado-real.spec.ts` (`T-05.11`)
// encontra o painel por ESTAS strings e lê `data-liquidation-present-points` de cada coorte. São
// CONTRATO, não estilo — o `design_gate` (`T-05.10`) pode mudar altura, cor, palavra e ordem sem
// tocar em nenhuma delas, que é o que torna as duas tasks paralelizáveis. `section[aria-label=
// "Liquidações"]` NÃO é o gancho: rótulo é microcopy pt-BR que o `ui-designer` pode reescrever, e
// prender um assert de DADO ao TEXTO DA UI é como uma mudança de forma quebra um teste de dado.
const LIQUIDATION_PANE_TESTID = "liquidation-pane";
/** Um testid por COORTE, derivado do nome da coorte — as duas legs são duas séries e o e2e tem de
 * poder afirmar sobre cada uma. Derivar em vez de enumerar mantém o par colado ao `cohort` que o
 * catálogo publica (`liquidation_catalog.py::COHORTS`), então uma terceira leg não poderia nascer
 * sem gancho. */
function liquidationCohortTestId(cohort: string): string {
  return `liquidation-cohort-${cohort}`;
}

// ⛔ AS TRÊS ESCALAS DESTE PAINEL, E A SEPARAÇÃO É GEOMÉTRICA — NÃO É CUIDADO, É IMPOSSIBILIDADE.
//
// A lição da fase `01` é literal (`gates/design-01.md` §A3, `BLOCKER-2`): a distinção entre "não
// sabemos" e "foi zero" tem de viajar em SÉRIES SEPARADAS, nunca num `if` de cor — *"duas séries
// fazem a colisão deixar de ser expressável"*. Aqui a forma é reusada E ENDURECIDA, porque nesta
// série a colisão não é estrutural-mas-adormecida como era no volume (`zeros_exatos = 0` lá): ela
// está VIVA HOJE. Na janela de 4 dias que a rota pede, a coorte `long` responde `191` observações
// em `5.761` grades, e `62` delas são ZERO LEGÍTIMO; a `short`, `50` zeros em `76` observações em
// 24 h `[MEDIDO 2026-09-16, GET /api/v1/series-history, bar_policy=final_only]`. Zero legítimo é
// um fato de tipo aqui: `ZL-3` de `domain/liquidation_zero_legitimacy.py`.
//
// O QUE A FASE `01` DEIXOU EM ABERTO E ESTE PAINEL FECHA: lá a ordenação ausência < zero < menor
// barra foi MEDIDA sobre um universo sintético — verdadeira para aquele dado, não garantida para
// todo dado. Uma liquidação de 2 USD desenharia, numa escala log de base `1`, uma barra mais baixa
// que a marca de zero, e voltaria a colidir. Aqui as duas faixas são DISJUNTAS por margem de
// escala: as marcas vivem nos 12% de baixo do painel e a linha de base das barras começa aos 15%.
// Nenhuma barra, de nenhum valor, alcança a faixa das marcas — a colisão deixa de depender do dado.
const LIQUIDATION_BAR_SCALE_MARGINS = { top: 0.05, bottom: 0.15 } as const;
const LIQUIDATION_MARKS_PRICE_SCALE_ID = "liquidation_marks";
const LIQUIDATION_MARKS_SCALE_MARGINS = { top: 0.88, bottom: 0 } as const;
const LIQUIDATION_MARKS_BAND_PX = CHART_HEIGHT_PX * (1 - LIQUIDATION_MARKS_SCALE_MARGINS.top);

// ⛔ ESCALA `log10`, PELO MESMO ARGUMENTO ARITMÉTICO DO `BLOCKER-1` DA FASE `01` — e aqui ele é
// MAIS FORTE, não menos: o volume de 1 min tinha `max/p50 = 60,8x` e já punha 67,9% das barras
// abaixo de 1 px; a liquidação tem `max/p50 = 443,8x` (`min 75,62 · p50 6.489,82 · max
// 2.880.132,45`) `[MEDIDO 2026-09-16, n=191 grades presentes em 4 dias de dado real]`. Numa escala
// linear ancorada no máximo, a barra MEDIANA desta série ficaria abaixo de meio pixel.
// `PriceScaleMode.Logarithmic` move a GEOMETRIA e deixa o número intacto (`ADR-003` FR-2 aplicada a
// uma escala); transformar o DADO poria `log10(v)` dentro da série e de lá sairia toda leitura que
// a biblioteca faz dela.
//
// Base `1` pelo mesmo motivo do sub-eixo de volume: âncora ABSOLUTA na unidade da série (USD), de
// modo que a mesma altura significa o mesmo valor em qualquer janela.
const LIQUIDATION_LOG_BASE = 1;

// As duas marcas da faixa de baixo, em "pixels nominais da faixa". A razão 3:1 entre elas é a mesma
// ordem de grandeza que a fase `01` mediu como suficiente para separar as duas afirmações; o que
// prova a separação em pixels REAIS, contra a biblioteca, é `liquidation-geometry.test.ts`.
const LIQUIDATION_ABSENCE_MARK_PX = 6;
const LIQUIDATION_ZERO_MARK_PX = 18;
// ⛔ `ADR-010` GOVERNA A TINTA, e a atribuição aqui segue a SEMÂNTICA da rampa de procedência
// (`D-4`: luminância, hue zero), não o gosto: ausência é o que NÃO se sabe ⇒ tinta FRACA; zero
// legítimo e barra presente são OBSERVAÇÕES ⇒ tinta FORTE, e o que as separa é a altura, que é
// justamente a grandeza que difere entre elas. Nem verde/vermelho (são `fill` de DIREÇÃO de preço,
// e `long`/`short` aqui são COORTES de liquidação, não direção de vela — pintar de vermelho a
// liquidação de comprados convidaria a ler a coorte como direção do mercado) nem violeta
// (`dataBrokenInk` é INTEGRIDADE do dado, e uma lacuna de grade não é dado quebrado).
const LIQUIDATION_ABSENCE_MARK_COLOR_ROLE = "provenanceWeak" as const;
const LIQUIDATION_ZERO_MARK_COLOR_ROLE = "provenanceStrong" as const;
const LIQUIDATION_BAR_COLOR_ROLE = "provenanceStrong" as const;

/**
 * The sub-axis' DOM anchor. The bars themselves are drawn on the price panel's own `<canvas>`
 * (`lightweight-charts`), which a DOM assertion cannot see — so this element carries the facts
 * about them: `data-volume-present-points` (how many 1-minute buckets have a real number) and
 * the "leitura atual" readout, which prints `SEM_PONTO` when the last instant has nothing.
 *
 * For M1 the present-slot count IS the count of distinct native bars — no `RN-S1` `/5` divisor,
 * because `klines_volume` is `1m` native and nothing here is a ladder (`view-model.ts`
 * `countPresentSlots`).
 */
/** `YYYY-MM-DD HH:MM UTC`, built off the epoch instant with no locale in the path: this string
 * is a FACT about the data (which instant), not a presentation choice, and a locale-dependent
 * rendering of it would make the same screen say different things to different readers. */
function formatUtcMinute(instantMs: number): string {
  return `${new Date(instantMs).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** The readable horizon, DECLARED rather than left to be inferred from a flat left edge — see
 * `VolumeSubAxisData.firstPresentMs` for the measurement that made this necessary. It reports
 * two numbers and one instant, all of them the route's own; it never hides, shortens or
 * fabricates anything.
 *
 * ⛔ THE WORDING AND THE PLACEMENT ARE FORM, AND FORM IS THE `ui-designer`'S WITH THE
 * `ux-ui-mastery` VERDICT (`CLAUDE.md` §"Design — autonomia delegada, com gate de validação").
 * What a builder is allowed to decide, and all that is decided here, is that the FACT is on
 * screen and machine-readable — the sentence itself is a sober placeholder, submitted to
 * `T-01.8`, not a design decision. The `data-fact`/`data-readable-since-ms` pair is the CONTRACT
 * half and must survive any restyling, same split the volume sub-axis already declares. */
function ReadableHorizon({ volume }: { readonly volume: VolumeSubAxisData }) {
  const gridSlots = volume.slots.length;
  const sinceText =
    volume.firstPresentMs === null
      ? "Nenhuma grade legível no período"
      : `Dado legível desde ${formatUtcMinute(volume.firstPresentMs)}`;
  return (
    <p
      data-fact={`volume_readable_horizon:${volume.presentPoints}/${gridSlots}`}
      data-readable-since-ms={volume.firstPresentMs ?? ""}
      className="text-sm text-provenance-weak"
    >
      {sinceText} — {volume.presentPoints}/{gridSlots} grades de 1 min na janela.
    </p>
  );
}

/** ⛔ O RÓTULO QUE O `BLOCKER-1` EXIGE JUNTO COM A ESCALA, e a exigência é literal no laudo:
 * *"`log10` exige rótulo de eixo declarando a escala — um eixo logarítmico não rotulado é pior
 * que um linear ilegível."* Pior porque um eixo log não declarado convida à leitura errada: quem
 * lê uma barra com o dobro da altura como o dobro do volume está lendo o quadrado dele.
 *
 * A escala do sub-eixo é uma escala SOBREPOSTA (`priceScaleId` próprio), e uma dessas não desenha
 * rótulo numérico nenhum no canvas — então o rótulo de eixo só pode existir aqui, no DOM. Isso é
 * uma vantagem, não um remendo: aqui ele é texto, alcança leitor de tela e é asserível. */
function VolumeScaleNote() {
  return (
    <p data-fact="volume_scale:log10" className="text-sm text-provenance-weak">
      Altura da barra em escala log10 (base {VOLUME_LOG_BASE}) — cada degrau de altura é uma ordem de
      grandeza, não uma diferença absoluta.
    </p>
  );
}

/** As DUAS marcas de linha de base, nomeadas — o terceiro canal do `BLOCKER-2`, pelo mesmo motivo
 * que `CvdLegend` existe: dentro do `<canvas>` nenhuma legenda alcança, e uma distinção que só
 * vive em pixels morre num screenshot monocromático ou num leitor de tela. Aqui ela viaja em
 * palavras, e as palavras dizem a diferença que o gate cobra: *"não houve"* ≠ *"não sabemos"*.
 *
 * `aria-hidden` no glifo é deliberado, mesmo critério de `CvdLegend`: ele é a cópia redundante do
 * que as palavras ao lado já carregam, e anunciar "▁" não acrescenta nada. A tinta sai de
 * `colorTokens()`, a MESMA chamada de onde sai a da série, então uma legenda que mente sobre a
 * cor da marca não é expressável. */
function VolumeMarksLegend() {
  const tokens = colorTokens();
  return (
    <ul className="flex gap-4 text-sm text-provenance-weak" data-fact="volume_marks_legend:2">
      <li>
        <span aria-hidden="true" style={{ color: tokens[ABSENCE_MARK_COLOR_ROLE] }}>
          ▁
        </span>{" "}
        Sem dado — traço baixo e apagado na linha de base (não sabemos)
      </li>
      <li>
        <span aria-hidden="true" style={{ color: tokens[ZERO_MARK_COLOR_ROLE] }}>
          ▃
        </span>{" "}
        Zero do fornecedor — traço alto e claro na linha de base (sabemos: foi zero)
      </li>
    </ul>
  );
}

function VolumeSubAxis({ volume, status }: { readonly volume: VolumeSubAxisData; readonly status: PanelStatus }) {
  const readingText =
    volume.reading.kind === "absent" || volume.reading.value === null ? ABSENCE_TOKEN : String(volume.reading.value);
  return (
    <div
      role="group"
      aria-label="Volume (sub-eixo de Preço)"
      data-testid={VOLUME_SUBAXIS_TESTID}
      data-volume-present-points={volume.presentPoints}
    >
      <h3 className="font-label-caps text-label-caps text-on-surface">Volume (1m)</h3>
      <VolumeScaleNote />
      <VolumeMarksLegend />
      <p data-fact={`volume_last_reading:${volume.reading.kind}`} className="text-sm text-provenance-weak">
        Leitura atual: {readingText}
      </p>
      <ReadableHorizon volume={volume} />
      <AbsenceNote status={status} />
    </div>
  );
}

function PricePane({
  panels,
  status,
  volume,
  volumeStatus,
}: {
  readonly panels: S2Panels;
  readonly status: PanelStatus;
  readonly volume: VolumeSubAxisData;
  readonly volumeStatus: PanelStatus;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useLightweightChart(containerRef, (chart) => {
    const style: Partial<CandlestickSeriesOptions> = candlestickSeriesColors();
    const series: ISeriesApi<"Candlestick"> = chart.addSeries(CandlestickSeries, style);
    series.setData(candlestickSeriesLossless(panels.price.series.slots) as never);

    // The volume sub-axis, on the SAME chart as price (`SPEC-007 §3.6`) and on its own price
    // scale. `lineSeriesLossless` is REUSED, not copied: it already maps a `value: null` slot
    // to a bare `{time}` `WhitespaceItem`, which a histogram series renders as NO BAR — never
    // a zero-height bar at zero, which is what `RN-1` forbids. A histogram accepts the same
    // `{time, value}` / `{time}` items a line does.
    //
    // ⚠️ The two series on this panel run on DIFFERENT native grids, and that is deliberate and
    // visible (`SPEC-007 §4.1`): price is `klines_last` at `5m` served on the `1m` grid — a
    // ladder — while volume is `klines_volume` at `1m` native. The `design_gate` of `T-01.8` is
    // meant to see it, so nothing here hides it.
    const volumeStyle: Partial<HistogramSeriesOptions> = {
      color: colorTokens().provenanceWeak,
      priceScaleId: VOLUME_PRICE_SCALE_ID,
      base: VOLUME_LOG_BASE,
      priceLineVisible: false,
      lastValueVisible: false,
    };
    const volumeSeries: ISeriesApi<"Histogram"> = chart.addSeries(HistogramSeries, volumeStyle);
    // ⛔ `BLOCKER-1`, pago aqui: `PriceScaleMode.Logarithmic`, NÃO uma transformação do DADO. A
    // diferença importa e não é de estilo — transformar o dado poria `log10(v)` dentro da série,
    // e daí sai toda leitura que a biblioteca faz dela (crosshair, `priceFormat`, qualquer
    // rótulo futuro). O modo de escala move a GEOMETRIA e deixa o número intacto, que é a
    // fronteira de `ADR-003` FR-2 aplicada a uma escala.
    volumeSeries.priceScale().applyOptions({
      scaleMargins: VOLUME_SCALE_MARGINS,
      mode: PriceScaleMode.Logarithmic,
    });
    // E a série de barras recebe só o que uma escala log consegue posicionar: `log10(0)` não tem
    // coordenada, e um `0` desenhado como barra de altura zero seria, pixel a pixel, a marca da
    // ausência. Os dois estados saem daqui e ganham marca própria abaixo.
    volumeSeries.setData(positiveValueSeriesLossless(volume.slots) as never);

    // ⛔ `BLOCKER-2`, pago aqui — DUAS séries de marca, numa escala de faixa FIXA, para que
    // "não sabemos" e "foi zero" nunca sejam os mesmos pixels. Uma só série com cor condicional
    // resolveria a aparência e deixaria a distinção depender de um `if` que um refactor apaga
    // sem que nada reprove; duas séries fazem a colisão deixar de ser expressável.
    const markStyle = (color: string): Partial<HistogramSeriesOptions> => ({
      color,
      priceScaleId: VOLUME_MARKS_PRICE_SCALE_ID,
      priceLineVisible: false,
      lastValueVisible: false,
      // A faixa fixa: a altura da marca é a da própria marca, não a do dado ao lado dela.
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: VOLUME_MARKS_BAND_PX } }),
    });
    const absenceSeries: ISeriesApi<"Histogram"> = chart.addSeries(
      HistogramSeries,
      markStyle(colorTokens()[ABSENCE_MARK_COLOR_ROLE]),
    );
    absenceSeries.priceScale().applyOptions({ scaleMargins: VOLUME_SCALE_MARGINS });
    absenceSeries.setData(absenceMarkSeries(volume.slots, ABSENCE_MARK_PX) as never);
    const zeroSeries: ISeriesApi<"Histogram"> = chart.addSeries(
      HistogramSeries,
      markStyle(colorTokens()[ZERO_MARK_COLOR_ROLE]),
    );
    zeroSeries.setData(zeroMarkSeries(volume.slots, ZERO_MARK_PX) as never);
  });
  const closeSlots = panels.price.series.slots.map((slot) => ({
    time: slot.time,
    value: slot.candle === null ? null : slot.candle.close,
  }));
  const reading = resolveStockReading(closeSlots, ONE_MINUTE_MS, lastInstantMs(panels));
  const readingText =
    reading.kind === "absent"
      ? "SEM_PONTO"
      : reading.kind === "held"
        ? `${reading.value} (${formatHeldStockLabel(reading)})`
        : String(reading.value);
  return (
    <section aria-label="Preço">
      <h2 className="font-label-caps text-label-caps text-on-surface">
        Preço ({panels.price.priceSource}, {panels.price.priceUse})
      </h2>
      <div ref={containerRef} data-fact={`price_slots:${panels.price.series.slots.length}`} />
      <p data-fact={`price_last_reading:${reading.kind}`} className="text-sm text-provenance-weak">
        Leitura atual: {readingText}
      </p>
      <AbsenceNote status={status} />
      <VolumeSubAxis volume={volume} status={volumeStatus} />
    </section>
  );
}

/** The readable horizon of the OI pane — the same two numbers and one instant the other two
 * panes declare, over the OI pane's own NATIVE 5-minute grid.
 *
 * ⛔ THE DENOMINATOR IS THE NATIVE GRID, NOT THE WIRE GRID, and the difference is the whole
 * `RN-S1` point: `panels.oi.slots` has one slot per 5-minute bucket of the window (1.152 over 4
 * days), while the route answered 5.761 rows on the 1-minute grid. Writing `N/5761` here would
 * be the staircase wearing the costume of a measurement.
 *
 * Written out rather than shared with `ReadableHorizon`/`CvdReadableHorizon` for the reason that
 * one already states in full: the literal `data-fact` expressions are pinned, character for
 * character, by three different contract tests, and merging them into one parameterized
 * component is how a refactor silently re-points somebody else's falsifier. */
function OiReadableHorizon({ oi, gridSlots }: { readonly oi: OiPaneData; readonly gridSlots: number }) {
  const sinceText =
    oi.firstPresentMs === null
      ? "Nenhuma grade legível no período"
      : `Dado legível desde ${formatUtcMinute(oi.firstPresentMs)}`;
  return (
    <p
      data-fact={`oi_readable_horizon:${oi.nativeBars}/${gridSlots}`}
      data-readable-since-ms={oi.firstPresentMs ?? ""}
      className="text-sm text-provenance-weak"
    >
      {sinceText} — {oi.nativeBars}/{gridSlots} barras nativas de 5 min na janela.
    </p>
  );
}

/**
 * `RNF-2` — THE PANE DOES NOT SHOW A NUMBER OLDER THAN THE SERIES' OWN PERIODICITY WITHOUT
 * SAYING SO.
 *
 * The ceiling is `max_staleness_ms` from the catalog row this panel resolved (`600_000` for open
 * interest = 2 x the `5m` native bucket) — already served, not invented, and the SAME number
 * `as_of` applied server-side. No route changed form for this (`RF-5`).
 *
 * ⚠️ WHY THIS IS NOT REDUNDANT WITH `formatHeldStockLabel` ON THE READOUT ABOVE IT, which also
 * says "held since": that label only exists while `resolveStockReading` still HAS a value to
 * hold — at most one native bucket back (`s2-absence-policy.ts` §5.11). Past that the readout
 * goes to `SEM_PONTO` and says nothing at all about WHEN the data stopped. This line covers the
 * whole range, including the state the readout cannot describe: "a última leitura desta série é
 * de 6 horas atrás", which is exactly the thing an operator must not have to infer from a flat
 * line. `unknown` prints as ignorance, never as freshness.
 *
 * ⛔ WORDING AND PLACEMENT ARE FORM — the `ui-designer`'s, with the `ux-ui-mastery` verdict
 * (`CLAUDE.md` §"Design — autonomia delegada, com gate de validação"). What a builder decides,
 * and all that is decided here, is that the FACT is on screen and machine-readable.
 */
function OiFreshness({ oi }: { readonly oi: OiPaneData }) {
  // ⚠️ `A-4.2` (2026-09-15): `freshness.observedMs`, published below as
  // `data-freshness-observed-ms`, is the `available_at` of the right-edge reading — a PUBLICATION
  // instant, no longer the last grid slot the server's carry-forward managed to fill. The
  // attribute NAME did not change and its MEANING did; the out-of-process reader
  // (`e2e/12-oi-dado-real.spec.ts`) was corrected in the same commit.
  const { freshness } = oi;
  const text =
    freshness.kind === "unknown"
      ? "Frescor não avaliável — nenhuma leitura nesta janela."
      : `Última leitura há ${formatSpan(freshness.ageMs)} em relação ao fecho da janela ` +
        // ⚠️ NO ` UTC` HERE: `formatUtcMinute` already ends in it (`:351`). The literal that used to
        // sit after this call printed `UTC UTC` on screen, in 8 of 8 renderings — `design-review`
        // `V-1`. The other four call sites (`:370`, `:481`, `:636`, `:771`) never repeated it; this
        // one did — which is why the fix is HERE and not in the formatter.
        `(${formatUtcMinute(freshness.referenceMs)}) — teto desta série: ${formatSpan(freshness.ceilingMs)}.` +
        (freshness.kind === "stale" ? " ⚠️ Mais velha que o teto — o valor acima é DADO VELHO." : "");
  return (
    <p
      role={freshness.kind === "stale" ? "status" : undefined}
      data-fact={`oi_freshness:${freshness.kind}`}
      data-freshness-age-ms={freshness.ageMs ?? ""}
      data-freshness-ceiling-ms={freshness.ceilingMs ?? ""}
      data-freshness-observed-ms={freshness.observedMs ?? ""}
      data-freshness-reference-ms={freshness.referenceMs}
      className="text-sm text-provenance-weak"
    >
      {text}
    </p>
  );
}

/**
 * A millisecond span as a UNIT LADDER, pt-BR — presentation of a number this component was handed,
 * never a recomputation of it (the `data-` attributes beside it carry the raw ms).
 *
 * ⛔ FLOOR, NOT ROUND, and the difference is the whole point (`design-review` `QW-1`): the `stale`
 * verdict asserts `ageMs > ceilingMs`, and `Math.round` printed BOTH sides of that inequality as
 * `10 min` for every age in `(600_000, 630_000)` ms — the screen contradicting its own sentence in
 * the same line. Flooring plus a seconds term makes the two numerals differ exactly when the
 * verdict says they differ.
 *
 * And the hour rung is not decoration: the largest age actually measured on this series is
 * `31_740_000 ms` [DOC: gates/T-03.5-T-03.6-builder.md], which the old function printed as
 * `529 min` — making the operator divide by 60 in his head on the very screen where he is deciding
 * whether to trust the number.
 */
function formatSpan(spanMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(spanMs / 1_000));
  if (totalSeconds < 3_600) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`;
  }
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

function OiPane({
  panels,
  status,
  oi,
}: {
  readonly panels: S2Panels;
  readonly status: PanelStatus;
  readonly oi: OiPaneData;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useLightweightChart(containerRef, (chart) => {
    const style: Partial<LineSeriesOptions> = { color: colorTokens().provenanceStrong };
    const series: ISeriesApi<"Line"> = chart.addSeries(LineSeries, style);
    series.setData(lineSeriesLossless(panels.oi.slots) as never);
  });
  const reading = resolveStockReading(panels.oi.slots, panels.oi.timeframeMs, lastInstantMs(panels));
  const readingText =
    reading.kind === "absent"
      ? ABSENCE_TOKEN
      : reading.kind === "held"
        ? `${reading.value} (${formatHeldStockLabel(reading)})`
        : String(reading.value);
  return (
    <section
      aria-label="Open Interest"
      // ⛔ THE STABLE SELECTOR (`T-03.5`), and the same KIND of contract `VOLUME_SUBAXIS_TESTID`
      // and `CVD_PANE_TESTID` already are: `e2e/12-oi-dado-real.spec.ts` finds this pane by THIS
      // string and reads `data-oi-native-bars` off it. Form may change without touching either.
      data-testid={OI_PANE_TESTID}
      // ⛔ THE TWO NUMBERS, SIDE BY SIDE, AND ONLY ONE OF THEM IS "QUANTO DADO EXISTE".
      // `data-oi-native-bars` is the count of 5-minute NATIVE buckets with a value — `DoD-3`'s
      // `N >= 30`. `data-oi-wire-points` is the staircase: readable rows on the 1-minute grid the
      // route serves (`GA-2`), ~5x larger for the same data. Both are published so the ratio is
      // checkable from outside; the e2e asserts the pane's headline number is the FIRST one.
      data-oi-native-bars={oi.nativeBars}
      data-oi-wire-points={oi.wirePoints}
    >
      <h2 className="font-label-caps text-label-caps text-on-surface">Open Interest (5m)</h2>
      <div ref={containerRef} data-fact={`oi_slots:${panels.oi.slots.length}`} />
      <p data-fact={`oi_last_reading:${reading.kind}`} className="text-sm text-provenance-weak">
        Leitura atual: {readingText}
      </p>
      <OiFreshness oi={oi} />
      <OiReadableHorizon oi={oi} gridSlots={panels.oi.slots.length} />
      <AbsenceNote status={status} />
    </section>
  );
}

/** The readable horizon of the CVD pane — the SAME two numbers and one instant `ReadableHorizon`
 * declares for the volume sub-axis, over the CVD pane's own slots.
 *
 * ⛔ WRITTEN OUT RATHER THAN SHARED WITH `ReadableHorizon`, ON PURPOSE. Generalizing that
 * component would rewrite the literal expressions
 * `volume_readable_horizon:${volume.presentPoints}/${gridSlots}` and
 * `const gridSlots = volume.slots.length`, and those two are PINNED, character for character, BY
 * ANOTHER TASK'S CONTRACT TEST (`volume-subaxis-dom-contract.test.ts`, `T-01.7`/`T-01.9`, in
 * flight in a parallel worktree). Merging two contracts into one parameterized component is how a
 * refactor silently re-points somebody else's falsifier; the duplication is ~12 lines and each
 * copy is guarded from its own side. Same reasoning `08-symbol-dado-real.spec.ts` gives for
 * duplicating a selector instead of importing it. */
function CvdReadableHorizon({ cvd, gridSlots }: { readonly cvd: CvdPaneData; readonly gridSlots: number }) {
  const sinceText =
    cvd.firstPresentMs === null
      ? "Nenhuma grade legível no período"
      : `Dado legível desde ${formatUtcMinute(cvd.firstPresentMs)}`;
  return (
    <p
      data-fact={`cvd_readable_horizon:${cvd.presentPoints}/${gridSlots}`}
      data-readable-since-ms={cvd.firstPresentMs ?? ""}
      className="text-sm text-provenance-weak"
    >
      {sinceText} — {cvd.presentPoints}/{gridSlots} grades de 1 min na janela.
    </p>
  );
}

/** `DR-3`/WCAG 1.4.1 — the pane's two lines, named. Before this, the ONLY thing on screen that
 * mentioned them was the `<h2>` ("CVD (delta e acumulado)"); which line was which could be
 * discovered by trial and error and nothing else, and with `DR-1` unfixed the operator did not
 * even see two lines.
 *
 * Three channels carry the same distinction, on purpose, so no single loss erases it: the COLOR
 * (`provenanceStrong`/`provenanceWeak`), the DASH PATTERN (`LineStyle.Solid`/`Dashed`, drawn in
 * the canvas), and this TEXT. `aria-hidden` on the swatch is deliberate — it is the redundant
 * copy of information the adjacent words already carry, and announcing "▬" adds nothing.
 *
 * The swatch's color comes from `colorTokens()`, the SAME call the series style comes from, so a
 * legend that lies about a series colour is not expressible here.
 *
 * ⛔ WORDING AND PLACEMENT ARE FORM — the `ui-designer`'s with the `ux-ui-mastery` verdict
 * (`CLAUDE.md` §"Design — autonomia delegada, com gate de validação"). What a builder decides is
 * that the encoding is not colour-only. */
function CvdLegend() {
  const tokens = colorTokens();
  return (
    <ul className="flex gap-4 text-sm text-provenance-weak" data-fact="cvd_legend:2">
      <li>
        <span aria-hidden="true" style={{ color: tokens.provenanceStrong }}>
          ▬
        </span>{" "}
        Delta (linha cheia)
      </li>
      <li>
        <span aria-hidden="true" style={{ color: tokens.provenanceWeak }}>
          ▬ ▬
        </span>{" "}
        Acumulado (linha tracejada)
      </li>
    </ul>
  );
}

function CvdPane({
  panels,
  status,
  cvd,
}: {
  readonly panels: S2Panels;
  readonly status: PanelStatus;
  readonly cvd: CvdPaneData;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useLightweightChart(containerRef, (chart) => {
    const tokens = colorTokens();
    // ⛔ `LineStyle.Dashed` is NOT decoration — it is `DR-3`/WCAG 1.4.1 (Use of Color) inside the
    // canvas, where no legend reaches: with two lines distinguished ONLY by hue, a dicromata or a
    // monochrome screenshot carries no way to tell delta from cumulative. Dash vs solid is a
    // SECOND channel, and the legend below repeats it in words, so the information survives the
    // loss of any one of the three.
    const deltaSeries: ISeriesApi<"Line"> = chart.addSeries(LineSeries, {
      color: tokens.provenanceStrong,
      lineStyle: LineStyle.Solid,
    });
    deltaSeries.priceScale().applyOptions({ scaleMargins: CVD_DELTA_SCALE_MARGINS });
    deltaSeries.setData(lineSeriesLossless(panels.cvd.deltaSlots) as never);
    const cumulativeSeries: ISeriesApi<"Line"> = chart.addSeries(LineSeries, {
      color: tokens.provenanceWeak,
      lineStyle: LineStyle.Dashed,
      priceScaleId: CVD_CUMULATIVE_PRICE_SCALE_ID,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    cumulativeSeries.priceScale().applyOptions({ scaleMargins: CVD_CUMULATIVE_SCALE_MARGINS });
    cumulativeSeries.setData(lineSeriesLossless(panels.cvd.cumulativeSlots) as never);
  });
  const deltaReading = resolveFlowReading(panels.cvd.deltaSlots, panels.cvd.timeframeMs, lastInstantMs(panels));
  // `DR-3`, second half: the pane drew TWO series and read exactly ONE. The screen went to the
  // trouble of naming the anchor of the cumulative curve (`D4.7`) and then never said what value
  // that anchor produced. Same function, same absence policy, same token as the delta — the
  // cumulative is a running sum of `FLOW` buckets, so a missing bucket is a missing sum, never a
  // `0`. (`resolveFlowReading`, not `resolveStockReading`: carrying the previous total forward
  // would be LOCF over a series whose absences are real gaps in observation.)
  const cumulativeReading = resolveFlowReading(
    panels.cvd.cumulativeSlots,
    panels.cvd.timeframeMs,
    lastInstantMs(panels),
  );
  // `RN-1` at the RENDERING layer, and for this series it is a rule of TYPE: a `FLOW` bucket with
  // no observation is NOT a bucket where buyers and sellers balanced out. A `0` there would be an
  // ASSERTION about the market ("não houve desequilíbrio comprador/vendedor neste minuto") made
  // out of ignorance — `series_key.py`: "LOCF over it is a type error, never UX".
  const readingText =
    deltaReading.kind === "absent" || deltaReading.value === null ? ABSENCE_TOKEN : String(deltaReading.value);
  const cumulativeReadingText =
    cumulativeReading.kind === "absent" || cumulativeReading.value === null
      ? ABSENCE_TOKEN
      : String(cumulativeReading.value);
  const gridSlots = panels.cvd.deltaSlots.length;
  return (
    <section
      aria-label="CVD"
      data-testid={CVD_PANE_TESTID}
      data-cvd-present-points={cvd.presentPoints}
    >
      <h2 className="font-label-caps text-label-caps text-on-surface">CVD (delta e acumulado)</h2>
      <CvdLegend />
      {/* ⛔ `aria-hidden` on the canvas host — `DR-6`. `lightweight-charts` paints into a
          `<canvas>` with no accessible name, so a screen reader finds an empty node here and a
          user cannot tell an empty chart from an unlabelled one. The readouts below ARE the
          declared textual alternative for the last instant; hiding the host says so instead of
          leaving a nameless node in the tree. A per-point alternative (a keyboard-navigable
          table) is `DR-10`, strategic, not this pass. */}
      <div
        ref={containerRef}
        aria-hidden="true"
        data-fact={`cvd_slots:${panels.cvd.deltaSlots.length}`}
      />
      <p data-fact={`cvd_last_reading:${deltaReading.kind}`} className="text-sm text-provenance-weak">
        Delta atual: {readingText}
      </p>
      <p data-fact={`cvd_cumulative_last_reading:${cumulativeReading.kind}`} className="text-sm text-provenance-weak">
        Acumulado atual: {cumulativeReadingText}
      </p>
      <CvdReadableHorizon cvd={cvd} gridSlots={gridSlots} />
      {/* The anchor of the CUMULATIVE curve, named on screen. The delta line above needs none;
          the cumulative one is unreadable without this instant, and `page.tsx` chooses it
          EXPLICITLY (`cvdAnchorMs`) instead of letting `buildCvdPanel`'s default decide in
          silence — three anchors over the same deltas invert the sign of the total (`D4.7`). */}
      <p data-fact={`cvd_cumulative_anchor:${cvd.anchorMs}`} className="text-sm text-provenance-weak">
        Acumulado ancorado em {formatUtcMinute(cvd.anchorMs)}.
      </p>
      <AbsenceNote status={status} />
    </section>
  );
}

/** ⛔ `RS-5`, PAGO AQUI — E O QUE O TORNA DIFÍCIL DE ESQUECER É O TIPO, NÃO ESTA FUNÇÃO.
 * `SeriesProvenance` (`panel-status.ts`) tem três membros, e só o membro `declared` carrega
 * `provider`/`reconstructedFrom`/`publishedError`: um painel de série de TERCEIRO sem rótulo não é
 * um estado que esta árvore de componentes consiga expressar. A alternativa — uma prop booleana que
 * o renderizador pode simplesmente não ler — é como `RS-5` seria satisfeita no papel e violada na
 * tela.
 *
 * ⚠️ E O `published_error` AUSENTE É DITO, NÃO OMITIDO. Para M4 ele é `null`, e isso é uma RECUSA
 * MEDIDA, não um esquecimento: `liquidation_catalog.py` escreve o motivo — a Binance não tem
 * endpoint REST de liquidação e `!forceOrder@arr`, a única comparação possível, está fora do
 * caminho crítico por `ADR-036/D4` e não escreveu nada (`5` runs, todos `REJECTED`, `n_written=0`
 * `[MEDIDO 2026-09-12 em md.ingest_run]`). *"Inventar um `(median, p99, n)` aqui publicaria uma
 * fidelidade que ninguém mediu, o que é pior do que não publicar nenhuma."* Uma tela que some com o
 * campo faz o operador ler ausência de erro como ausência de dúvida.
 *
 * ⛔ PALAVRA E POSIÇÃO SÃO FORMA — do `ui-designer` com o veredito do `ux-ui-mastery` (`T-05.10`,
 * `CLAUDE.md` §"Design — autonomia delegada, com gate de validação"). O que um builder decide, e
 * tudo o que está decidido aqui, é que o FATO está na tela e é legível por máquina. */
function LiquidationProvenance({ provenance }: { readonly provenance: SeriesProvenance }) {
  if (provenance.kind === "unresolved") {
    return (
      <p data-fact="liquidation_provenance:unresolved" className="text-sm text-provenance-weak">
        Procedência não declarada — nenhuma série foi identificada no catálogo para este painel.
      </p>
    );
  }
  if (provenance.kind === "origin") {
    return (
      <p data-fact={`liquidation_provenance:origin:${provenance.provider}`} className="text-sm text-provenance-weak">
        Dado da própria fonte ({provenance.provider}).
      </p>
    );
  }
  const { publishedError } = provenance;
  return (
    <p
      role="status"
      data-fact={`liquidation_provenance:declared:${provenance.provider}`}
      data-reconstructed-from={provenance.reconstructedFrom ?? ""}
      data-published-error={
        publishedError === null
          ? "none"
          : `median_bp=${publishedError.medianBp};p99_bp=${publishedError.p99Bp};n=${publishedError.n}`
      }
      className="text-sm text-provenance-weak"
    >
      ⚠️ Dado de TERCEIRO ({provenance.provider}), não da corretora de origem
      {provenance.reconstructedFrom === null
        ? ""
        : ` — reconstruído a partir de ${provenance.reconstructedFrom}`}
      .{" "}
      {publishedError === null
        ? "Erro publicado: NENHUM — não há segunda fonte para medir a fidelidade contra, e publicar um número que ninguém mediu seria pior do que não publicar."
        : `Erro publicado: mediana ${publishedError.medianBp} bp, p99 ${publishedError.p99Bp} bp, n = ${publishedError.n}.`}
    </p>
  );
}

/** O rótulo que a escala `log10` exige, pelo mesmo motivo literal do laudo da fase `01`: *"um eixo
 * logarítmico não rotulado é pior que um linear ilegível"* — quem lê uma barra com o dobro da altura
 * como o dobro do valor está lendo o quadrado dele. A escala do painel não desenha rótulo numérico
 * no canvas, então ele só pode existir aqui, no DOM; e aqui ele é texto, alcança leitor de tela e é
 * asserível. */
function LiquidationScaleNote() {
  return (
    <p data-fact="liquidation_scale:log10" className="text-sm text-provenance-weak">
      Altura da barra em escala log10 (base {LIQUIDATION_LOG_BASE}) — cada degrau de altura é uma
      ordem de grandeza, não uma diferença absoluta.
    </p>
  );
}

/** Os TRÊS estados, nomeados em palavras — o terceiro canal, pelo mesmo motivo que `CvdLegend` e
 * `VolumeMarksLegend` existem: dentro do `<canvas>` nenhuma legenda alcança, e uma distinção que só
 * vive em pixels morre num screenshot monocromático ou num leitor de tela. Aqui ela viaja em
 * palavras, e as palavras dizem a diferença que `RN-1` cobra: *"não houve"* ≠ *"não sabemos"*.
 *
 * A tinta sai de `colorTokens()`, a MESMA chamada de onde sai a das séries, então uma legenda que
 * minta sobre a cor da marca não é expressável. `aria-hidden` no glifo é deliberado: ele é a cópia
 * redundante do que as palavras ao lado já carregam. */
function LiquidationMarksLegend() {
  const tokens = colorTokens();
  return (
    <ul className="flex gap-4 text-sm text-provenance-weak" data-fact="liquidation_marks_legend:3">
      <li>
        <span aria-hidden="true" style={{ color: tokens[LIQUIDATION_ABSENCE_MARK_COLOR_ROLE] }}>
          ▁
        </span>{" "}
        Sem ponto — traço baixo e apagado (não sabemos se houve liquidação neste minuto)
      </li>
      <li>
        <span aria-hidden="true" style={{ color: tokens[LIQUIDATION_ZERO_MARK_COLOR_ROLE] }}>
          ▃
        </span>{" "}
        Zero do fornecedor — traço médio e claro (sabemos: não houve liquidação)
      </li>
      <li>
        <span aria-hidden="true" style={{ color: tokens[LIQUIDATION_BAR_COLOR_ROLE] }}>
          ▇
        </span>{" "}
        Liquidação — barra acima da faixa das marcas, altura em ordem de grandeza
      </li>
    </ul>
  );
}

/** O horizonte legível de UMA coorte — os mesmos dois números e um instante que os outros painéis
 * declaram, mais a fração que só esta série precisa: quantas das observações são ZERO LEGÍTIMO.
 *
 * Escrito por extenso em vez de compartilhado com `ReadableHorizon`/`CvdReadableHorizon` pelo motivo
 * que aquele já declara em full: as expressões literais de `data-fact` estão presas, caractere a
 * caractere, por testes de contrato diferentes, e fundir dois contratos num componente
 * parametrizado é como um refactor re-aponta, em silêncio, o falsificador de outra task. */
function LiquidationReadableHorizon({
  cohort,
  data,
}: {
  readonly cohort: string;
  readonly data: LiquidationCohortData;
}) {
  const gridSlots = data.slots.length;
  const sinceText =
    data.firstPresentMs === null
      ? "Nenhuma grade legível no período"
      : `Dado legível desde ${formatUtcMinute(data.firstPresentMs)}`;
  return (
    <p
      data-fact={`liquidation_readable_horizon:${cohort}:${data.presentPoints}/${gridSlots}`}
      data-readable-since-ms={data.firstPresentMs ?? ""}
      className="text-sm text-provenance-weak"
    >
      {sinceText} — {data.presentPoints}/{gridSlots} grades de 1 min observadas, das quais{" "}
      {data.zeroPoints} são zero do fornecedor.
    </p>
  );
}

/**
 * UMA coorte: um gráfico, três séries, e a colisão zero↔ausência tornada geometricamente
 * impossível — ver o bloco de constantes `LIQUIDATION_*` para o argumento inteiro.
 *
 * ⛔ AS TRÊS SÉRIES NÃO SÃO TRÊS CORES DE UMA. `positiveValueSeriesLossless` manda para whitespace
 * tanto a ausência quanto o zero (numa escala log, `log10(0)` não tem coordenada, e uma barra de
 * altura zero na linha de base é, pixel a pixel, a marca de "nada foi desenhado aqui"), e então
 * `absenceMarkSeries` e `zeroMarkSeries` desenham cada um dos dois estados com marca própria. Um
 * `if` de cor resolveria a aparência e deixaria a distinção presa a um ramo que um refactor apaga
 * sem que nada reprove.
 */
function LiquidationCohortSurface({
  cohort,
  label,
  data,
  unit,
  status,
}: {
  readonly cohort: string;
  readonly label: string;
  readonly data: LiquidationCohortData;
  readonly unit: string | null;
  readonly status: PanelStatus;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useLightweightChart(containerRef, (chart) => {
    const tokens = colorTokens();
    const barStyle: Partial<HistogramSeriesOptions> = {
      color: tokens[LIQUIDATION_BAR_COLOR_ROLE],
      base: LIQUIDATION_LOG_BASE,
      priceLineVisible: false,
      lastValueVisible: false,
    };
    const barSeries: ISeriesApi<"Histogram"> = chart.addSeries(HistogramSeries, barStyle);
    barSeries.priceScale().applyOptions({
      scaleMargins: LIQUIDATION_BAR_SCALE_MARGINS,
      mode: PriceScaleMode.Logarithmic,
    });
    barSeries.setData(positiveValueSeriesLossless(data.slots) as never);

    const markStyle = (color: string): Partial<HistogramSeriesOptions> => ({
      color,
      priceScaleId: LIQUIDATION_MARKS_PRICE_SCALE_ID,
      priceLineVisible: false,
      lastValueVisible: false,
      // A faixa fixa: a altura da marca é a da própria marca, nunca a do dado ao lado dela.
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: LIQUIDATION_MARKS_BAND_PX } }),
    });
    const absenceSeries: ISeriesApi<"Histogram"> = chart.addSeries(
      HistogramSeries,
      markStyle(tokens[LIQUIDATION_ABSENCE_MARK_COLOR_ROLE]),
    );
    // ⛔ A MARGEM É O QUE SEPARA AS DUAS FAIXAS, e ela é aplicada na escala das MARCAS: com
    // `top: 0.88` elas ocupam os 12% de baixo do painel, enquanto a linha de base das barras fica
    // aos 15%. Nenhuma barra alcança a faixa das marcas — para NENHUM valor, não só para os que
    // este dado calhou de ter.
    absenceSeries.priceScale().applyOptions({ scaleMargins: LIQUIDATION_MARKS_SCALE_MARGINS });
    absenceSeries.setData(absenceMarkSeries(data.slots, LIQUIDATION_ABSENCE_MARK_PX) as never);
    const zeroSeries: ISeriesApi<"Histogram"> = chart.addSeries(
      HistogramSeries,
      markStyle(tokens[LIQUIDATION_ZERO_MARK_COLOR_ROLE]),
    );
    zeroSeries.setData(zeroMarkSeries(data.slots, LIQUIDATION_ZERO_MARK_PX) as never);
  });
  // `RN-1` na camada de renderização, e para esta série é regra de TIPO: um bucket de `FLOW` sem
  // observação NÃO é um bucket em que ninguém foi liquidado. Um `0` ali seria uma AFIRMAÇÃO sobre o
  // mercado feita a partir de ignorância — e ela é a mais cara desta tela, porque `77` de `1.440`
  // grades carregam ponto: se ausência e zero colidissem, o painel mentiria na maior parte da
  // janela.
  const readingText =
    data.reading.kind === "absent" || data.reading.value === null
      ? ABSENCE_TOKEN
      : unit === null
        ? String(data.reading.value)
        : `${data.reading.value} ${unit}`;
  return (
    <div
      role="group"
      aria-label={label}
      data-testid={liquidationCohortTestId(cohort)}
      data-liquidation-present-points={data.presentPoints}
      data-liquidation-zero-points={data.zeroPoints}
    >
      <h3 className="font-label-caps text-label-caps text-on-surface">{label}</h3>
      {/* ⛔ `aria-hidden` no hospedeiro do canvas — mesmo critério de `CvdPane`/`DR-6`:
          `lightweight-charts` pinta num `<canvas>` sem nome acessível, e as leituras abaixo SÃO a
          alternativa textual declarada. */}
      <div
        ref={containerRef}
        aria-hidden="true"
        data-fact={`liquidation_slots:${cohort}:${data.slots.length}`}
      />
      <p data-fact={`liquidation_last_reading:${cohort}:${data.reading.kind}`} className="text-sm text-provenance-weak">
        Leitura atual: {readingText}
      </p>
      <LiquidationReadableHorizon cohort={cohort} data={data} />
      <AbsenceNote status={status} />
    </div>
  );
}

/**
 * `T-05.9` — o painel de liquidações: DUAS coortes, o rótulo de `RS-5` e a ausência que nunca vira
 * zero.
 *
 * ⛔ AS DUAS LEGS NÃO SÃO UMA SÓ SÉRIE COM DUAS CORES, e a razão não é de UX: somá-las apaga
 * exatamente a discriminação que a métrica existe para dar (`liquidation_catalog.py`, literal —
 * *"a long liquidation is forced selling and a short liquidation is forced buying"*). Duas
 * superfícies, dois `series_key_id`, dois status que degradam sozinhos.
 *
 * E as duas ficam em GRÁFICOS separados, com título próprio, em vez de duas cores num gráfico só:
 * assim a distinção entre as coortes não depende de hue nenhum (WCAG 1.4.1) e as marcas de ausência
 * de uma leg não se sobrepõem às da outra — o que importa quando `94,7%` das grades são ausentes em
 * ambas `[MEDIDO 2026-09-16: 1.365 ausentes de 1.441 grades em 24 h, por coorte]`.
 */
function LiquidationPane({
  liquidation,
  longStatus,
  shortStatus,
}: {
  readonly liquidation: LiquidationPaneData;
  readonly longStatus: PanelStatus;
  readonly shortStatus: PanelStatus;
}) {
  return (
    <section aria-label="Liquidações" data-testid={LIQUIDATION_PANE_TESTID}>
      <h2 className="font-label-caps text-label-caps text-on-surface">
        Liquidações (1m{liquidation.unit === null ? "" : `, ${liquidation.unit}`})
      </h2>
      <LiquidationProvenance provenance={liquidation.provenance} />
      <LiquidationScaleNote />
      <LiquidationMarksLegend />
      <LiquidationCohortSurface
        cohort="long"
        label="Liquidação de posições compradas (long)"
        data={liquidation.long}
        unit={liquidation.unit}
        status={longStatus}
      />
      <LiquidationCohortSurface
        cohort="short"
        label="Liquidação de posições vendidas (short)"
        data={liquidation.short}
        unit={liquidation.unit}
        status={shortStatus}
      />
    </section>
  );
}

/** One `EventSource`, decoded through `../live-transport.ts` — see this module's own docstring
 * for why this reads "ao vivo indisponível" in this phase (no real producer wired yet). */
function useLiveReadout(url: string | null): string {
  const [text, setText] = useState<string>(url === null ? "sem série resolvida" : "conectando…");

  useEffect(() => {
    if (url === null) {
      return;
    }
    let cancelled = false;
    const source = new EventSource(url);
    source.onmessage = (event) => {
      if (cancelled) {
        return;
      }
      try {
        const envelope: LiveBucketEnvelope = decodeBucketEnvelope(JSON.parse(event.data as string));
        setText(`${envelope.last_price} @ ${envelope.bucket_open_ts} (seq ${envelope.seq})`);
      } catch {
        setText("ao vivo indisponível (envelope inválido)");
      }
    };
    source.onerror = () => {
      if (!cancelled) {
        setText("ao vivo indisponível");
      }
    };
    return () => {
      cancelled = true;
      source.close();
    };
  }, [url]);

  return text;
}

function LiveRow({ label, url }: { readonly label: string; readonly url: string | null }) {
  const text = useLiveReadout(url);
  return (
    <li data-fact={`live_${label}:${url === null ? "no_series" : "attempted"}`}>
      {label}: {text}
    </li>
  );
}

export function SymbolClient({
  panels,
  volume,
  cvd,
  oi,
  liquidation,
  panelStatus,
  knowledgeTimeMs,
  liveUrls,
}: SymbolClientProps) {
  return (
    // The three instants of the request this render was built from, on the root element: the
    // screen declares WHAT IT ASKED, so an assertion (or an operator) can re-issue exactly that
    // query against the read API instead of guessing the window from its own clock.
    <main
      data-window-start-ms={panels.window.startMs}
      data-window-end-ms-inclusive={lastInstantMs(panels)}
      data-knowledge-time-ms={knowledgeTimeMs}
    >
      <h1 className="sr-only">{panels.symbol} — Preço (com volume), Open Interest, CVD e Liquidações</h1>
      <PricePane panels={panels} status={panelStatus.price} volume={volume} volumeStatus={panelStatus.volume} />
      <OiPane panels={panels} status={panelStatus.oi} oi={oi} />
      <CvdPane panels={panels} status={panelStatus.cvd} cvd={cvd} />
      <LiquidationPane
        liquidation={liquidation}
        longStatus={panelStatus.liquidationLong}
        shortStatus={panelStatus.liquidationShort}
      />
      <section aria-label="Ao vivo">
        <h2 className="font-label-caps text-label-caps text-on-surface">Ao vivo</h2>
        <ul>
          <LiveRow label="preço" url={liveUrls.price} />
          <LiveRow label="oi" url={liveUrls.oi} />
          <LiveRow label="cvd" url={liveUrls.cvd} />
        </ul>
      </section>
    </main>
  );
}
