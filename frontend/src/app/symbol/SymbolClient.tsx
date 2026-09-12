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
import { CandlestickSeries, createChart, HistogramSeries, LineSeries, LineStyle } from "lightweight-charts";

import {
  candlestickSeriesColors,
  candlestickSeriesLossless,
  colorTokens,
  formatHeldStockLabel,
  lastGridInstant,
  lineSeriesLossless,
  ONE_MINUTE_MS,
  resolveFlowReading,
  resolveStockReading,
  type FlowReading,
  type S2Panels,
} from "../../charts/index.ts";
import { chartConstructorOptions } from "./chart-options.ts";
import { decodeBucketEnvelope, type LiveBucketEnvelope } from "../live-transport.ts";
import type { PanelStatus, SymbolPanelStatuses } from "./panel-status.ts";

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

export interface SymbolClientProps {
  readonly panels: S2Panels;
  readonly volume: VolumeSubAxisData;
  readonly cvd: CvdPaneData;
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
      priceLineVisible: false,
      lastValueVisible: false,
    };
    const volumeSeries: ISeriesApi<"Histogram"> = chart.addSeries(HistogramSeries, volumeStyle);
    volumeSeries.priceScale().applyOptions({ scaleMargins: VOLUME_SCALE_MARGINS });
    volumeSeries.setData(lineSeriesLossless(volume.slots) as never);
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

function OiPane({ panels, status }: { readonly panels: S2Panels; readonly status: PanelStatus }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useLightweightChart(containerRef, (chart) => {
    const style: Partial<LineSeriesOptions> = { color: colorTokens().provenanceStrong };
    const series: ISeriesApi<"Line"> = chart.addSeries(LineSeries, style);
    series.setData(lineSeriesLossless(panels.oi.slots) as never);
  });
  const reading = resolveStockReading(panels.oi.slots, panels.oi.timeframeMs, lastInstantMs(panels));
  const readingText =
    reading.kind === "absent"
      ? "SEM_PONTO"
      : reading.kind === "held"
        ? `${reading.value} (${formatHeldStockLabel(reading)})`
        : String(reading.value);
  return (
    <section aria-label="Open Interest">
      <h2 className="font-label-caps text-label-caps text-on-surface">Open Interest</h2>
      <div ref={containerRef} data-fact={`oi_slots:${panels.oi.slots.length}`} />
      <p data-fact={`oi_last_reading:${reading.kind}`} className="text-sm text-provenance-weak">
        Leitura atual: {readingText}
      </p>
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

export function SymbolClient({ panels, volume, cvd, panelStatus, knowledgeTimeMs, liveUrls }: SymbolClientProps) {
  return (
    // The three instants of the request this render was built from, on the root element: the
    // screen declares WHAT IT ASKED, so an assertion (or an operator) can re-issue exactly that
    // query against the read API instead of guessing the window from its own clock.
    <main
      data-window-start-ms={panels.window.startMs}
      data-window-end-ms-inclusive={lastInstantMs(panels)}
      data-knowledge-time-ms={knowledgeTimeMs}
    >
      <h1 className="sr-only">{panels.symbol} — Preço (com volume), Open Interest e CVD</h1>
      <PricePane panels={panels} status={panelStatus.price} volume={volume} volumeStatus={panelStatus.volume} />
      <OiPane panels={panels} status={panelStatus.oi} />
      <CvdPane panels={panels} status={panelStatus.cvd} cvd={cvd} />
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
