"use client";

/**
 * `T-02.4` — the Client Component half of `/symbol`. `page.tsx` (Server Component, `async`)
 * does every network call and hands this component `{ panels, panelStatus, liveUrls }` by
 * props, all JSON-serializable (`S2Panels` is plain data; `PanelStatus`/the `liveUrls` record
 * are plain discriminated values/strings) — same RSC-boundary discipline `ConsoleClient.tsx`
 * documents for its own props.
 *
 * Mounts `lightweight-charts` directly (the library this repo already depends on,
 * `package.json`) for 3 panes — Price (candlestick), OI (line), CVD (two lines: delta and
 * cumulative) — feeding each one the LOSSLESS mapping (`candlestickSeriesLossless`/
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
import type { CandlestickSeriesOptions, IChartApi, LineSeriesOptions, ISeriesApi } from "lightweight-charts";
import { CandlestickSeries, createChart, LineSeries } from "lightweight-charts";

import {
  candlestickSeriesColors,
  candlestickSeriesLossless,
  colorTokens,
  formatFlowValue,
  formatHeldStockLabel,
  lineSeriesLossless,
  ONE_MINUTE_MS,
  RANGE_END_MS_EXCLUSIVE,
  resolveFlowReading,
  resolveStockReading,
  type S2Panels,
} from "../../charts/index.ts";
import { decodeBucketEnvelope, type LiveBucketEnvelope } from "../live-transport.ts";
import type { PanelStatus } from "./panel-status.ts";

export interface SymbolClientProps {
  readonly panels: S2Panels;
  readonly panelStatus: { readonly price: PanelStatus; readonly oi: PanelStatus; readonly cvd: PanelStatus };
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

/** The window's own last grid instant — used only to give the "leitura atual" readouts a fixed,
 * deterministic instant to query, the same one `page.tsx` requests as `window_end_ms`. */
const LAST_INSTANT_MS = RANGE_END_MS_EXCLUSIVE - ONE_MINUTE_MS;

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
function PricePane({ panels, status }: { readonly panels: S2Panels; readonly status: PanelStatus }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useLightweightChart(containerRef, (chart) => {
    const style: Partial<CandlestickSeriesOptions> = candlestickSeriesColors("light");
    const series: ISeriesApi<"Candlestick"> = chart.addSeries(CandlestickSeries, style);
    series.setData(candlestickSeriesLossless(panels.price.series.slots) as never);
  });
  const closeSlots = panels.price.series.slots.map((slot) => ({
    time: slot.time,
    value: slot.candle === null ? null : slot.candle.close,
  }));
  const reading = resolveStockReading(closeSlots, ONE_MINUTE_MS, LAST_INSTANT_MS);
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
    </section>
  );
}

function OiPane({ panels, status }: { readonly panels: S2Panels; readonly status: PanelStatus }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useLightweightChart(containerRef, (chart) => {
    const style: Partial<LineSeriesOptions> = { color: colorTokens("light").provenanceStrong };
    const series: ISeriesApi<"Line"> = chart.addSeries(LineSeries, style);
    series.setData(lineSeriesLossless(panels.oi.slots) as never);
  });
  const reading = resolveStockReading(panels.oi.slots, panels.oi.timeframeMs, LAST_INSTANT_MS);
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
    const tokens = colorTokens("light");
    const deltaSeries: ISeriesApi<"Line"> = chart.addSeries(LineSeries, { color: tokens.provenanceStrong });
    deltaSeries.setData(lineSeriesLossless(panels.cvd.deltaSlots) as never);
    const cumulativeSeries: ISeriesApi<"Line"> = chart.addSeries(LineSeries, { color: tokens.provenanceWeak });
    cumulativeSeries.setData(lineSeriesLossless(panels.cvd.cumulativeSlots) as never);
  });
  const deltaReading = resolveFlowReading(panels.cvd.deltaSlots, panels.cvd.timeframeMs, LAST_INSTANT_MS);
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

export function SymbolClient({ panels, panelStatus, liveUrls }: SymbolClientProps) {
  return (
    <main>
      <h1 className="sr-only">{panels.symbol} — Preço, Open Interest e CVD</h1>
      <PricePane panels={panels} status={panelStatus.price} />
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
