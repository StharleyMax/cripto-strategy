/**
 * `T-02.6` (`CST-213`) — `CA-5b`, `loop-probe2.mjs` PROMOTED TO A VERSIONED TEST. The two
 * measured lines that named this criterion are quoted verbatim in
 * `docs/context/candle-real-e-eixo-unico/handoff/JULGAMENTO-FRONTEND-ARCHITECT.md:175-179`:
 *
 *     CALA  (6 paineis lossless, 5760 slots cada):       desalinhamento=0 min
 *     MORDE (6 paineis podados, 5760/1152/5412/300/300/1152): desalinhamento=5460 min
 *
 * This file does not copy that number — it reconstructs the SAME wiring (the real
 * `AxisSyncStore`/`RangeDispatcher`, six real `IChartApi` instances, headless under `jsdom`)
 * and measures the misalignment again, here, under `node --test`.
 *
 * ── THE MECHANISM THIS TEST PROVES, NOT PRESUMES ────────────────────────────────────────────
 *
 * `range-dispatch.ts`'s `RangeDispatcher.onPanelRangeChanged` converts the ORIGIN panel's raw
 * bar-index range to an INSTANT range using the shared `axis`, converts that instant range
 * back to a bar-index number using the SAME shared axis, and writes that number VERBATIM to
 * every other panel's own `setVisibleLogicalRange`. That round-trip is correct **if and only
 * if** every panel's own bar-index-to-instant mapping equals the shared axis (`D-C3.2`'s
 * invariant, "todo painel sobre EXATAMENTE a mesma grade") — this file measures both sides of
 * that "if and only if": CALA when it holds, MORDE when a panel's own data is a shorter,
 * evenly-respaced ("podado") series over the same real window instead of one item per
 * canonical slot.
 *
 * ⛔ Why the MORDE case is not vacuous (`docs/plans/SPEC-008-candle-real-e-eixo-unico/02_eixo_unico.md`
 * DoD `CA-5b`'s own warning): a test that only checks "something moved" would also pass if the
 * misalignment measure were broken and always returned a positive constant. The CALA case is
 * the falsifier for THAT failure mode — it must land on EXACTLY `0`, not merely "small".
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

import { createAxisSyncStore, PANEL_COUNT, PRICE_PANEL_INDEX, type AxisSyncStore } from "./axis-sync.ts";
import { chartConstructorOptions } from "./chart-options.ts";
import { installGlobals, flushFrames } from "../../charts/index.ts";
import type { TimeAxis } from "../../charts/index.ts";

const ONE_MINUTE_S = 60;
/** 4 days of 1-minute slots — the same magnitude as `T-02.1`'s real canonical grid
 * (`s2-panels.ts`'s `S2_WINDOW_SPAN_MS`), not a smaller stand-in: `CA-5b`'s reference
 * misalignment (`5.460 min`) was measured at this scale, and a materially smaller axis would
 * risk hiding a rounding-only "misalignment" behind a scale that happens to divide evenly.
 */
const AXIS_SLOT_COUNT = 5_760;
const AXIS: TimeAxis = { startMs: 0, stepMs: ONE_MINUTE_S * 1000, slotCount: AXIS_SLOT_COUNT };
/** Total real span of the axis, in seconds — every "podado" panel below still covers this
 * SAME real window, just with fewer, evenly-spaced points (never a shorter window). */
const WINDOW_SPAN_S = AXIS_SLOT_COUNT * ONE_MINUTE_S;

/** The MORDE configuration's six item counts, `PRICE/OI/CVD/LIQ_LONG/LIQ_SHORT/LONG_SHORT`
 * panel-index order — `loop-probe2.mjs`'s own numbers
 * (`JULGAMENTO-FRONTEND-ARCHITECT.md:176`). CALA uses `AXIS_SLOT_COUNT` for all six instead. */
const PODADO_ITEM_COUNTS: readonly number[] = [5_760, 1_152, 5_412, 300, 300, 1_152];
const LOSSLESS_ITEM_COUNTS: readonly number[] = Array.from({ length: PANEL_COUNT }, () => AXIS_SLOT_COUNT);

const FRAMES_TO_SETTLE = 20;

interface HeadlessPanel {
  readonly chart: Awaited<ReturnType<typeof buildOneChart>>;
}

/** `DR-1` (`chart-construction.test.ts`) requires every `createChart(` under `app/`/`features/`
 * to take its options from `chartConstructorOptions()`, unmodified — this file lives under
 * `app/symbol/` (`ADR-034/D8`'s barrel-exception directory) even though it is headless, so it
 * pays that same discipline. The `minBarSpacing` override this harness needs (so 5.760 slots
 * fit a 1.200 px pane, same reasoning as `s2-headless-run.ts`'s own comment) is applied
 * AFTERWARDS via `timeScale().applyOptions(...)`, never spelled inside the `createChart(` call
 * itself — that keeps the call site itself clean for `DR-1`'s scanner. */
async function buildOneChart(charts: typeof import("lightweight-charts"), container: Element) {
  const chart = charts.createChart(container as never, chartConstructorOptions(1_200, 600));
  // `localization.locale` is NOT one of `BUILDER_OWNED_KEYS` — a top-level `chart.applyOptions`
  // call, never inside `createChart(`, so `DR-1`'s scanner is untouched by it. Pinned to avoid
  // `RangeError: Incorrect locale information provided` from the library's own tick-mark
  // formatter reading `navigator.language` off jsdom's stub navigator (irrelevant to this
  // file's measurement — no tick label is ever read — but noisy in test output if left default).
  chart.applyOptions({ localization: { locale: "en-US" } });
  chart.timeScale().applyOptions({ rightOffset: 0, minBarSpacing: 0.001 });
  return chart;
}

/**
 * Builds six independent `IChartApi` instances under one `jsdom`, each `setData` with
 * `itemCounts[panelIndex]` points EVENLY spaced across the SAME `WINDOW_SPAN_S` — i.e. a
 * shorter `itemCounts[i]` means a WIDER own bar spacing over the identical real window,
 * reproducing "podado" (pruned to the series' own native cadence) rather than a shorter
 * window.
 */
async function buildSixHeadlessPanels(dom: JSDOM, itemCounts: readonly number[]): Promise<HeadlessPanel[]> {
  const charts = await import("lightweight-charts");
  const panels: HeadlessPanel[] = [];
  for (let index = 0; index < PANEL_COUNT; index += 1) {
    const container = dom.window.document.createElement("div");
    dom.window.document.body.appendChild(container);
    const chart = await buildOneChart(charts, container);
    const series = chart.addSeries(charts.LineSeries, {});
    const itemCount = itemCounts[index]!;
    const stepS = WINDOW_SPAN_S / itemCount;
    const items = Array.from({ length: itemCount }, (_unused, slot) => ({
      time: Math.round(slot * stepS) as never,
      value: slot,
    }));
    series.setData(items as never);
    panels.push({ chart });
  }
  return panels;
}

/**
 * Wires the SAME production machinery `SymbolClient.tsx`'s `useLightweightChart` does — one
 * `AxisSyncStore` over `AXIS`, all six panels registered, all six subscribed to their own
 * `subscribeVisibleLogicalRangeChange` — over real `IChartApi` instances instead of React refs.
 */
function wireAxisSync(panels: readonly HeadlessPanel[]): AxisSyncStore {
  const store = createAxisSyncStore(AXIS, PANEL_COUNT);
  for (let index = 0; index < PANEL_COUNT; index += 1) {
    const timeScale = panels[index]!.chart.timeScale();
    timeScale.setVisibleLogicalRange(store.initialLogicalRange as never);
    store.registerPanel(index, (logical) => {
      timeScale.setVisibleLogicalRange(logical as never);
    });
    timeScale.subscribeVisibleLogicalRangeChange((range) => {
      if (range === null) {
        return;
      }
      store.notifyPanelRangeChanged(index, range);
    });
  }
  return store;
}

function visibleFromSecondsOf(panel: HeadlessPanel): number | null {
  const range = panel.chart.timeScale().getVisibleRange();
  if (range === null) {
    return null;
  }
  return range.from as unknown as number;
}

/** Builds the six panels, wires the real `AxisSyncStore`, performs ONE gesture on the PRICE
 * panel (a direct `setVisibleLogicalRange` — what a real drag ends in), lets the mesh settle,
 * and returns the desalinhamento in MINUTES: the spread (max - min) of the six panels' own
 * `getVisibleRange().from`, converted from seconds. */
async function measureDesalinhamentoMinutes(itemCounts: readonly number[]): Promise<number> {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
  installGlobals(dom);
  try {
    const panels = await buildSixHeadlessPanels(dom, itemCounts);
    await flushFrames(dom, 3);
    wireAxisSync(panels);
    await flushFrames(dom, 3);

    // ONE gesture: a real drag on the Price panel always ends in exactly this call.
    panels[PRICE_PANEL_INDEX]!.chart.timeScale().setVisibleLogicalRange({ from: 1_000, to: 4_000 } as never);
    await flushFrames(dom, FRAMES_TO_SETTLE);

    const fromsSeconds = panels.map((panel) => visibleFromSecondsOf(panel));
    const known = fromsSeconds.filter((value): value is number => value !== null);
    assert.equal(
      known.length,
      PANEL_COUNT,
      `every one of the ${PANEL_COUNT} panels must report a visible range after the gesture, got ${known.length}: ${JSON.stringify(fromsSeconds)}`,
    );
    const desalinhamentoS = Math.max(...known) - Math.min(...known);
    return desalinhamentoS / 60;
  } finally {
    for (const document_ of [dom]) {
      document_.window.close();
    }
  }
}

test("CA-5b CALA: all six panels on the SAME canonical grid (5.760 slots each) — 0 min of misalignment after a real gesture", async () => {
  const desalinhamentoMin = await measureDesalinhamentoMinutes(LOSSLESS_ITEM_COUNTS);
  assert.equal(
    desalinhamentoMin,
    0,
    `CALA must land on EXACTLY 0 min of misalignment (D-C3.2 holding) — measured ${desalinhamentoMin} min`,
  );
});

test("CA-5b MORDE: six panels PRUNED to their own native length (5760/1152/5412/300/300/1152) — non-zero misalignment (reference 5.460 min, JULGAMENTO-FRONTEND-ARCHITECT.md:176)", async () => {
  const desalinhamentoMin = await measureDesalinhamentoMinutes(PODADO_ITEM_COUNTS);
  assert.ok(
    desalinhamentoMin > 0,
    "MORDE must show misalignment > 0 — a 0 here would mean this instrument only proves " +
      `"algo se moveu", not alignment (exactly what CA-5b's own DoD warns against); measured ${desalinhamentoMin} min`,
  );
});
