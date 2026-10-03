/**
 * `estrutura-do-front` `T-02.1` (plan `02` DoD 1, `SPEC-011 §4.2` + `§7.3`, `ADR-050` `F-3`) — the
 * host's binding table on a REAL chart under `jsdom` (the pattern of `price-candle.test.ts`): the
 * series count of pane 0 is read off the library, never off the table's own bookkeeping.
 *
 * What bites, and how it was checked (`gates/T-02.1-build.md` §3):
 *   - `CA-11`: an EMPTY `unmount` leaves pane 0 with `+5` series after five cycles — asserted below as
 *     the ablation pair, so the instrument is shown able to fail on every run, not once;
 *   - a repeated key that does not unmount the previous binding leaves `+1` on pane 0;
 *   - a stale unregister that removes the binding that replaced it leaves the newer one's series
 *     orphaned and the key empty;
 *   - a `detach` that does not unmount leaves the bindings' series on the chart.
 * The type half — a binding without `unmount` does not compile — is the `@ts-expect-error` at the
 * end, checked by `npm run typecheck`.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import type { IChartApi } from "lightweight-charts";

import { flushFrames, installGlobals } from "../../../../charts/index.ts";
import { chartConstructorOptions } from "../../chart-options.ts";
import { createBindingTable, type BindingTable } from "./binding-table.ts";
import type { AnyIndicatorBinding, HostPlacement, HostSeries, IndicatorBinding } from "./indicator-binding.ts";

const OVERLAY: HostPlacement = { kind: "overlay", on: "price" };
const SYNTHETIC_PANE: HostPlacement = { kind: "pane", paneId: "synthetic_pane" };
const CYCLES = 5;

/** The test's own resolver: overlay on pane 0, the one synthetic pane on pane 1. */
function resolvePaneIndex(placement: HostPlacement): number {
  return placement.kind === "overlay" ? 0 : 1;
}

type LightweightCharts = typeof import("lightweight-charts");

async function realChart(): Promise<{ readonly lc: LightweightCharts; readonly chart: IChartApi; readonly dom: JSDOM }> {
  const dom = new JSDOM('<!doctype html><html><body><div id="chart"></div></body></html>', { pretendToBeVisual: true });
  installGlobals(dom);
  const lc = await import("lightweight-charts");
  const container = dom.window.document.getElementById("chart");
  assert.ok(container !== null, "broken invariant: the chart container does not exist in the DOM");
  const chart = lc.createChart(container, chartConstructorOptions(600, 300));
  // What pane 0 holds before any binding: the price series the host's own pane would have drawn.
  chart.addSeries(lc.LineSeries, {}, 0);
  return { lc, chart, dom };
}

function seriesOnPane(chart: IChartApi, paneIndex: number): number {
  return chart.panes()[paneIndex]?.getSeries().length ?? 0;
}

function seriesOnChart(chart: IChartApi): number {
  return chart.panes().reduce((total, pane) => total + pane.getSeries().length, 0);
}

interface SyntheticHandles {
  readonly series: HostSeries;
}

/** A SYNTHETIC overlay, declared here (`SPEC-011 §7.3`, F2): one line series on the pane it is given. */
function syntheticBinding(
  lc: LightweightCharts,
  options: { readonly emptyUnmount?: boolean; readonly unmountCalls?: { count: number } } = {},
): IndicatorBinding<SyntheticHandles> {
  return {
    mount: (chart, paneIndex) => ({ series: chart.addSeries(lc.LineSeries, {}, paneIndex) }),
    apply: ({ series }) => [{ series, items: [{ time: 1_700_000_000 as never, value: 1 }] }],
    unmount: (chart, { series }) => {
      if (options.unmountCalls !== undefined) {
        options.unmountCalls.count += 1;
      }
      if (options.emptyUnmount !== true) {
        chart.removeSeries(series);
      }
    },
  };
}

function refOf(binding: IndicatorBinding<SyntheticHandles>): { readonly current: AnyIndicatorBinding } {
  return { current: binding as AnyIndicatorBinding };
}

function attached(chart: IChartApi): BindingTable {
  const table = createBindingTable(resolvePaneIndex);
  table.attach({ chart, feedLateMount: () => undefined });
  return table;
}

/** `CA-11`: register and unregister ONE synthetic overlay `CYCLES` times; returns pane 0's count after. */
function cycle(chart: IChartApi, binding: IndicatorBinding<SyntheticHandles>): number {
  const table = attached(chart);
  const initial = seriesOnPane(chart, 0);
  for (let index = 0; index < CYCLES; index += 1) {
    const unregister = table.register("synthetic_overlay", OVERLAY, refOf(binding));
    // Not vacuous: the overlay really landed on pane 0 before it is taken away.
    assert.ok(seriesOnPane(chart, 0) > initial, `cycle ${index}: the overlay mounted nothing on pane 0`);
    unregister();
  }
  return seriesOnPane(chart, 0);
}

test("CA-11: five register/unregister cycles of a synthetic overlay leave pane 0 with its initial series count", async () => {
  const { lc, chart, dom } = await realChart();
  const initial = seriesOnPane(chart, 0);
  assert.equal(cycle(chart, syntheticBinding(lc)), initial);
  await flushFrames(dom, 1);
  chart.remove();
});

test("CA-11 ablation: an EMPTY unmount leaves pane 0 with +5 series — the instrument above can fail", async () => {
  const { lc, chart } = await realChart();
  const initial = seriesOnPane(chart, 0);
  assert.equal(cycle(chart, syntheticBinding(lc, { emptyUnmount: true })), initial + CYCLES);
  chart.remove();
});

test("a repeated key unmounts the previous binding, and the previous binding's unregister no longer owns the key", async () => {
  const { lc, chart } = await realChart();
  const initial = seriesOnPane(chart, 0);
  const table = attached(chart);
  const first = { count: 0 };
  const second = { count: 0 };
  const unregisterFirst = table.register("sma", OVERLAY, refOf(syntheticBinding(lc, { unmountCalls: first })));
  const secondRef = refOf(syntheticBinding(lc, { unmountCalls: second }));
  const unregisterSecond = table.register("sma", OVERLAY, secondRef);
  // One binding per key: the first was unmounted, so pane 0 holds ONE overlay, not two.
  assert.equal(first.count, 1);
  assert.equal(seriesOnPane(chart, 0), initial + 1);
  assert.deepEqual(
    table.mounted().map(({ instanceKey, binding }) => [instanceKey, binding === secondRef]),
    [["sma", true]],
  );
  // The stale unregister does nothing: the key is the second binding's.
  unregisterFirst();
  assert.equal(second.count, 0);
  assert.equal(seriesOnPane(chart, 0), initial + 1);
  assert.equal(table.mounted().length, 1);
  unregisterSecond();
  assert.equal(second.count, 1);
  assert.equal(seriesOnPane(chart, 0), initial);
  chart.remove();
});

test("attach mounts by paneIndex then registration order; a late binding is mounted and fed on arrival", async () => {
  const { lc, chart } = await realChart();
  const table = createBindingTable(resolvePaneIndex);
  // Registered BEFORE the chart exists, pane first: the mount order is still pane 0 → pane 1.
  table.register("synthetic_pane", SYNTHETIC_PANE, refOf(syntheticBinding(lc)));
  table.register("synthetic_overlay", OVERLAY, refOf(syntheticBinding(lc)));
  const fed: number[] = [];
  const mounted = table.attach({ chart, feedLateMount: (feeds) => fed.push(feeds.length) });
  assert.deepEqual(
    mounted.map(({ instanceKey, paneIndex }) => [instanceKey, paneIndex]),
    [
      ["synthetic_overlay", 0],
      ["synthetic_pane", 1],
    ],
  );
  assert.deepEqual(fed, [], "attach mounts; the host feeds the first render itself");
  table.register("late", OVERLAY, refOf(syntheticBinding(lc)));
  assert.deepEqual(fed, [1], "a binding registered after attach is fed its own apply, once");
  assert.deepEqual(
    table.mounted().map(({ instanceKey }) => instanceKey),
    ["synthetic_overlay", "synthetic_pane", "late"],
  );
  chart.remove();
});

test("detach unmounts every binding still mounted, before the host removes the chart", async () => {
  const { lc, chart } = await realChart();
  const initial = seriesOnChart(chart);
  const table = createBindingTable(resolvePaneIndex);
  table.register("synthetic_pane", SYNTHETIC_PANE, refOf(syntheticBinding(lc)));
  table.register("synthetic_overlay", OVERLAY, refOf(syntheticBinding(lc)));
  table.attach({ chart, feedLateMount: () => undefined });
  assert.equal(seriesOnChart(chart), initial + 2);
  table.detach();
  assert.equal(seriesOnChart(chart), initial);
  assert.deepEqual(table.mounted(), []);
  chart.remove();
});

test("unmount is MANDATORY in the type (`ADR-050/D3`): a binding without it does not compile", () => {
  const withoutUnmount = {
    mount: () => ({}),
    apply: () => [],
  };
  // `npm run typecheck` fails on an UNUSED `@ts-expect-error`: if `unmount` became optional, this line
  // would compile and the typecheck would reprove.
  // @ts-expect-error — `unmount` is missing.
  const binding: AnyIndicatorBinding = withoutUnmount;
  assert.equal(typeof binding.mount, "function");
});
