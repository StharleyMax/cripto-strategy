"use client";

/**
 * `T-02.4` — the Client Component half of `/symbol`. `page.tsx` (Server Component, `async`)
 * does every network call and hands this component `{ panels, panelStatus, liveUrls }` by
 * props, all JSON-serializable (`S2Panels` is plain data; `PanelStatus`/the `liveUrls` record
 * are plain discriminated values/strings) — same RSC-boundary discipline `ConsoleClient.tsx`
 * documents for its own props.
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
import { CandlestickSeries, createChart, HistogramSeries, LineSeries } from "lightweight-charts";

import {
  candlestickSeriesColors,
  candlestickSeriesLossless,
  colorTokens,
  formatFlowValue,
  formatHeldStockLabel,
  lastGridInstant,
  lineSeriesLossless,
  ONE_MINUTE_MS,
  resolveFlowReading,
  resolveStockReading,
  type FlowReading,
  type S2Panels,
} from "../../charts/index.ts";
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

export interface SymbolClientProps {
  readonly panels: S2Panels;
  readonly volume: VolumeSubAxisData;
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

function useLightweightChart(containerRef: RefObject<HTMLDivElement | null>, build: (chart: IChartApi) => void): void {
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    const chart = createChart(container, {
      width: container.clientWidth || 600,
      height: 220,
      timeScale: { timeVisible: true, secondsVisible: false },
    });
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

/** `RN-1`'s literal token: absence is `SEM_PONTO`, and for a `FLOW` series rendering it as `0`
 * is an error of TYPE, not of taste. `formatFlowValue`'s `"—"` (`D5.3`) is the CVD readout's
 * own wording and is deliberately NOT reused here — `SEM_PONTO` is the string `DoD-3` asserts
 * the absence of, and the price/OI readouts above already print it. */
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

function CvdPane({ panels, status }: { readonly panels: S2Panels; readonly status: PanelStatus }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useLightweightChart(containerRef, (chart) => {
    const tokens = colorTokens();
    const deltaSeries: ISeriesApi<"Line"> = chart.addSeries(LineSeries, { color: tokens.provenanceStrong });
    deltaSeries.setData(lineSeriesLossless(panels.cvd.deltaSlots) as never);
    const cumulativeSeries: ISeriesApi<"Line"> = chart.addSeries(LineSeries, { color: tokens.provenanceWeak });
    cumulativeSeries.setData(lineSeriesLossless(panels.cvd.cumulativeSlots) as never);
  });
  const deltaReading = resolveFlowReading(panels.cvd.deltaSlots, panels.cvd.timeframeMs, lastInstantMs(panels));
  return (
    <section aria-label="CVD">
      <h2 className="font-label-caps text-label-caps text-on-surface">CVD (delta e acumulado)</h2>
      <div ref={containerRef} data-fact={`cvd_slots:${panels.cvd.deltaSlots.length}`} />
      <p data-fact={`cvd_last_reading:${deltaReading.kind}`} className="text-sm text-provenance-weak">
        Delta atual: {formatFlowValue(deltaReading)}
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

export function SymbolClient({ panels, volume, panelStatus, knowledgeTimeMs, liveUrls }: SymbolClientProps) {
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
      <CvdPane panels={panels} status={panelStatus.cvd} />
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
