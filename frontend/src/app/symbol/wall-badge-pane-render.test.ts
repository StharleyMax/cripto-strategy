/**
 * `estrutura-do-front` `W-1` of the wave-2 QA (`gates/W-P2-QA.md`) — THE WALL BADGE'S GUARD INSIDE
 * EACH PANE, RENDERED. `T-10.11` retired the source-scan tests of `beyond-coverage-badge-dom-contract`
 * (they fired on refactors with no effect, R01–R03), and with them the only tests that failed when
 * `OiPane` stopped rendering its badge (`OI-NOBADGE`, measured green on 726/0 by the wave QA). This
 * file gives that guard back by RENDER: `OiPane` and `LongShortPane` (exported for this, decision P1
 * of `gates/T-10.11-padrao.md` §5) under `../component-render.ts`, with literal, typed props.
 *
 * What it proves, per pane: the badge is in the pane's DOM with `wallState="beyond-coverage"`, under
 * THAT pane's own machine key, and it is NOT there for the two other verdicts. Every absence is
 * anchored on the pane having rendered, and read by the same predicate the presence case reads.
 *
 * ⚠️ WHERE THE WIRING IN `SymbolClient` IS PROVEN: that `SymbolClient` feeds each pane the verdict
 * of ITS OWN series (`LS-WRONGFEED`) is not reachable from a pane render; it is
 * `wall-state-call-site.test.ts`, by AST over the call site.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, render } from "../component-render.ts";
import { buildS2Panels, ONE_MINUTE_MS, S2_PRICE_USE } from "../../charts/index.ts";
import type { PaneRegistrar } from "./chart/host/registrar.ts";
import type { LegendFrame } from "./chart/legend/legend-frame.ts";
import type { LegendSeriesId, PaneHeading } from "./chart/legend/pane-legend.ts";
import type { OiCandlePaneData } from "./oi-candle-pane.ts";
import type { SlotCoverageState } from "./panel-status.ts";
import type { LongShortPaneData, OiPaneData } from "./SymbolClient.tsx";

const { OiPane, LongShortPane } = await import("./SymbolClient.tsx");
const { ChartHostContext } = await import("./chart/host/registrar.ts");
const { LegendFrameContext } = await import("./chart/legend/legend-frame.ts");
const { createCrosshairSlotStore, EMPTY_PANE_HEADING } = await import("./chart/legend/pane-legend.ts");

// `OiPane` schedules its regime-label placement on an animation frame, which JSDOM does not ship
// without `pretendToBeVisual`. The placement is the regime marks' concern, not the badge's: the frame
// is accepted and never run.
Object.assign(globalThis, { requestAnimationFrame: () => 1, cancelAnimationFrame: () => undefined });

/** The three verdicts `slot-coverage.ts::panelWallState` can hand a pane. Only the first names the wall. */
const OTHER_VERDICTS: readonly SlotCoverageState[] = ["not-loaded", "absent"];

const WINDOW_START_MS = Date.UTC(2026, 9, 3, 0, 0);
const WINDOW = { startMs: WINDOW_START_MS, endMsExclusive: WINDOW_START_MS + 3 * ONE_MINUTE_MS, days: ["2026-10-03"] };
const PANELS = buildS2Panels({
  window: WINDOW,
  axisStepMs: ONE_MINUTE_MS,
  candles: [],
  priceUse: S2_PRICE_USE,
  oiPoints: [],
  oiMissingDays: [],
  cvdDeltas: [],
  cvdMissingDays: [],
  cvdCoveredDays: [],
});
const OI: OiPaneData = {
  nativeBars: 0,
  wirePoints: 0,
  firstPresentMs: null,
  lastPresentMs: null,
  maxStalenessMs: null,
  freshness: { kind: "unknown", ageMs: null, observedMs: null, referenceMs: WINDOW.endMsExclusive, ceilingMs: null },
  provenance: null,
};
const OI_CANDLES: OiCandlePaneData = { slots: [], candles: [], sources: [], drawnCandles: 0 };
const LONG_SHORT: LongShortPaneData = {
  slots: PANELS.oi.slots,
  nativeBars: 0,
  wirePoints: 0,
  firstPresentMs: null,
  lastPresentMs: null,
  observedAtMs: null,
  ageMs: null,
  trailingAbsentSlots: 0,
  windowStats: null,
  recentStats: null,
  recentSpanMs: ONE_MINUTE_MS,
  provenance: { kind: "unresolved" },
  reading: { kind: "absent", value: null },
  unit: null,
  nativeInterval: null,
  nativeGrid: null,
};
const HEADINGS: Readonly<Record<LegendSeriesId, PaneHeading>> = {
  price: EMPTY_PANE_HEADING,
  volume: EMPTY_PANE_HEADING,
  oi: EMPTY_PANE_HEADING,
  cvd: EMPTY_PANE_HEADING,
  liquidation_long: EMPTY_PANE_HEADING,
  liquidation_short: EMPTY_PANE_HEADING,
  long_short: EMPTY_PANE_HEADING,
};
const LEGEND_FRAME: LegendFrame = {
  legends: { price: null, volume: null, oi: null, cvd: null, liquidation_long: null, liquidation_short: null, long_short: null },
  axisStepMs: ONE_MINUTE_MS,
  asOfMs: WINDOW.endMsExclusive,
  bucketMs: ONE_MINUTE_MS,
  headings: HEADINGS,
};

/** The two contexts every pane reads: a chart host that only RECORDS registrations (no canvas — the
 * series are other files' subject) and the legend frame. Same shape as `price-pane-dom-contract`'s. */
async function renderInHost(pane: ReturnType<typeof createElement>) {
  const registered: string[] = [];
  const registrar: PaneRegistrar = {
    surfaceRef: { current: null },
    crosshairStore: createCrosshairSlotStore(),
    register: (instanceKey) => {
      registered.push(instanceKey);
      return () => undefined;
    },
    refeed: () => undefined,
  };
  const rendered = await render(
    createElement(ChartHostContext.Provider, { value: registrar }, createElement(LegendFrameContext.Provider, { value: LEGEND_FRAME }, pane)),
  );
  return { ...rendered, registered };
}

const renderOiPane = (wallState: SlotCoverageState) =>
  renderInHost(createElement(OiPane, { panels: PANELS, status: { kind: "ok" }, oi: OI, oiCandles: OI_CANDLES, wallState }));
const renderLongShortPane = (wallState: SlotCoverageState) =>
  renderInHost(createElement(LongShortPane, { longShort: LONG_SHORT, status: { kind: "ok" }, symbol: "BTCUSDT", wallState }));

/** The predicates under test — each one read by the presence case AND by every absence case. */
function paneOf(container: HTMLElement, testId: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
}
function wallFactsIn(root: ParentNode): string[] {
  return [...root.querySelectorAll('[data-fact$=":beyond"]')].map((element) => element.getAttribute("data-fact") ?? "");
}

const PANES = [
  { name: "OiPane", testId: "oi-pane", hostKey: "oi", fact: "oi_coverage:beyond", renderPane: renderOiPane },
  {
    name: "LongShortPane",
    testId: "long-short-pane",
    hostKey: "long_short",
    fact: "long_short_coverage:beyond",
    renderPane: renderLongShortPane,
  },
] as const;

for (const { name, testId, hostKey, fact, renderPane } of PANES) {
  test(`T-05.6 DoD item 2: ${name} names the wall — ONE badge, under its OWN key, on "beyond-coverage"`, async () => {
    const rendered = await renderPane("beyond-coverage");
    const pane = paneOf(rendered.container, testId);
    assert.ok(pane !== null, `no [data-testid="${testId}"] — the pane did not render`);
    assert.deepEqual(rendered.registered, [hostKey], "the pane declared itself to the chart host, once");
    // The whole list, not a count: the other pane's key here is a badge naming the wrong series.
    assert.deepEqual(wallFactsIn(pane), [fact], `${name} must name the wall with "${fact}", once`);
    rendered.unmount();
  });

  for (const verdict of OTHER_VERDICTS) {
    test(`${name} does NOT name the wall on "${verdict}" — the guard is the strict verdict, not any non-ok one`, async () => {
      const rendered = await renderPane(verdict);
      const pane = paneOf(rendered.container, testId);
      assert.ok(pane !== null, "anchor: the pane rendered — an empty render would pass the absence below");
      assert.deepEqual(wallFactsIn(pane), [], `"${verdict}" is not the wall: no badge`);
      rendered.unmount();
    });
  }
}
