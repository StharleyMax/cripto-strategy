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
 * `T-02.2` (plan `02` DoD 2, `gates/T-02.2-build.md` §3): the `paneIndex` is derived AT MOUNT from the
 * ACTIVE set — four synthetic panes, one off, land on `1, 2, 3` in the order given, whichever order
 * they registered in. An index by registration position inverts them on the reversed registration,
 * asserted below as the ablation pair.
 *
 * `T-02.3` (plan `02` DoD 3, `E-1`, `gates/T-02.3-build.md` §3): `refeed(key)` of a SYNTHETIC
 * `indicator-endpoint` indicator runs that key's `apply` alone and hands its feed to the host's loop
 * (`feedOutsidePage`) ONCE; no other series receives `setData`. A refeed that re-applies every
 * binding feeds the others, asserted below as the ablation pair.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import type { IChartApi } from "lightweight-charts";

import { flushFrames, installGlobals } from "../../../../charts/index.ts";
import { chartConstructorOptions } from "../../chart-options.ts";
import {
  createBindingTable,
  derivePaneIndex,
  F1_HOST_PANE_ORDER,
  type BindingTable,
  type PaneIndexDerivation,
  type PaneOrder,
} from "./binding-table.ts";
import type { AnyIndicatorBinding, HostPlacement, HostSeries, HostSeriesFeed, IndicatorBinding } from "./indicator-binding.ts";

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
  table.attach({ chart, feedOutsidePage: () => undefined });
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
  const mounted = table.attach({ chart, feedOutsidePage: (feeds) => fed.push(feeds.length) });
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
  table.attach({ chart, feedOutsidePage: () => undefined });
  assert.equal(seriesOnChart(chart), initial + 2);
  table.detach();
  assert.equal(seriesOnChart(chart), initial);
  assert.deepEqual(table.mounted(), []);
  chart.remove();
});

// ── `T-02.2` — the `paneIndex` derived at mount ─────────────────────────────────────────────

/** Four SYNTHETIC pane indicators in a given order (`SPEC-011 §7.3`, F2); the core's pane is `core`. */
const SYNTHETIC_ORDER: PaneOrder = { corePaneId: "core", indicatorPaneIds: ["pane_a", "pane_b", "pane_c", "pane_d"] };
/** `pane_c` is OFF: it never registers. */
const ACTIVE_SYNTHETIC = ["pane_a", "pane_b", "pane_d"] as const;

function paneAt(paneId: string): HostPlacement {
  return { kind: "pane", paneId };
}

const deriveSynthetic: PaneIndexDerivation = (placement, active) => derivePaneIndex(placement, active, SYNTHETIC_ORDER);

/** The ablation's derivation: `1 +` the position among the panes in REGISTRATION order (the table
 * hands `active` in that order), blind to the catalog's. */
const deriveByRegistration: PaneIndexDerivation = (placement, active) => {
  if (placement.kind === "overlay") {
    return 0;
  }
  const panes = active.flatMap((other) => (other.kind === "pane" ? [other.paneId] : []));
  return 1 + panes.indexOf(placement.paneId);
};

/** Registers the active synthetic panes in `registrationOrder` on a real chart, attaches, and reads
 * back each pane's `paneIndex` AND the library's series count on panes 1..3. */
async function mountSynthetic(
  derive: PaneIndexDerivation,
  registrationOrder: readonly string[],
): Promise<{ readonly indices: Readonly<Record<string, number>>; readonly perPane: readonly number[] }> {
  const { lc, chart } = await realChart();
  const table = createBindingTable(derive);
  for (const paneId of registrationOrder) {
    table.register(paneId, paneAt(paneId), refOf(syntheticBinding(lc)));
  }
  const mounted = table.attach({ chart, feedOutsidePage: () => undefined });
  const indices = Object.fromEntries(mounted.map(({ instanceKey, paneIndex }) => [instanceKey, paneIndex]));
  const perPane = [1, 2, 3].map((paneIndex) => seriesOnPane(chart, paneIndex));
  table.detach();
  chart.remove();
  return { indices, perPane };
}

const EXPECTED_SYNTHETIC = { pane_a: 1, pane_b: 2, pane_d: 3 };

test("T-02.2: four synthetic panes, one off, land on 1, 2, 3 in the order given, whatever the registration order", async () => {
  const forward = await mountSynthetic(deriveSynthetic, ACTIVE_SYNTHETIC);
  const reversed = await mountSynthetic(deriveSynthetic, [...ACTIVE_SYNTHETIC].reverse());
  assert.deepEqual(forward.indices, EXPECTED_SYNTHETIC);
  assert.deepEqual(reversed.indices, EXPECTED_SYNTHETIC);
  // Not vacuous: the library really holds one series on each of panes 1, 2 and 3.
  assert.deepEqual(forward.perPane, [1, 1, 1]);
  assert.deepEqual(reversed.perPane, [1, 1, 1]);
});

test("T-02.2 ablation: an index by registration position inverts the indices on the reversed registration", async () => {
  const forward = await mountSynthetic(deriveByRegistration, ACTIVE_SYNTHETIC);
  const reversed = await mountSynthetic(deriveByRegistration, [...ACTIVE_SYNTHETIC].reverse());
  // Forward it happens to agree, which is why the reversed registration is the case that bites.
  assert.deepEqual(forward.indices, EXPECTED_SYNTHETIC);
  assert.deepEqual(reversed.indices, { pane_d: 1, pane_b: 2, pane_a: 3 });
  assert.notDeepEqual(reversed.indices, EXPECTED_SYNTHETIC);
});

test("T-02.2: the index is read at MOUNT over the whole active set, not when each binding registered", async () => {
  const { lc, chart } = await realChart();
  const seen: { readonly paneId: string; readonly active: number }[] = [];
  const table = createBindingTable((placement, active) => {
    seen.push({ paneId: placement.kind === "pane" ? placement.paneId : "overlay", active: active.length });
    return deriveSynthetic(placement, active);
  });
  for (const paneId of [...ACTIVE_SYNTHETIC].reverse()) {
    table.register(paneId, paneAt(paneId), refOf(syntheticBinding(lc)));
  }
  assert.deepEqual(seen, [], "nothing is derived before the chart exists");
  table.attach({ chart, feedOutsidePage: () => undefined });
  assert.deepEqual(
    seen.map(({ active }) => active),
    [3, 3, 3],
    "each index is derived over the three active panes",
  );
  table.detach();
  chart.remove();
});

test("T-02.2: F1_PANE_ORDER — price and overlays on 0; with the five panes on, today's indices; a pane off moves the ones below up", () => {
  const five = ["price", "liquidation", "oi", "long_short", "cvd"].map(paneAt);
  const overlay: HostPlacement = { kind: "overlay", on: "price" };
  assert.deepEqual(
    five.map((placement) => derivePaneIndex(placement, [overlay, ...five], F1_HOST_PANE_ORDER)),
    [0, 1, 2, 3, 4],
  );
  assert.equal(derivePaneIndex(overlay, five, F1_HOST_PANE_ORDER), 0);
  const withoutOi = five.filter((placement) => placement.kind === "pane" && placement.paneId !== "oi");
  assert.deepEqual(
    withoutOi.map((placement) => derivePaneIndex(placement, withoutOi, F1_HOST_PANE_ORDER)),
    [0, 1, 2, 3],
  );
  assert.throws(() => derivePaneIndex(paneAt("funding"), five, F1_HOST_PANE_ORDER), /not in the host's pane order/);
});

// ── `T-02.3` — `refeed(instanceKey)`, the `indicator-endpoint` path (`E-1`) ────────────────────

const ENDPOINT_KEY = "synthetic_endpoint";
const T0 = 1_700_000_000;

/** Every `setData` that reached a series, by key, and every `apply` the table ran, by key. */
interface FeedLog {
  readonly setData: string[];
  readonly apply: string[];
  /** What went through the HOST's loop (the attachment's `feedOutsidePage`), by key. */
  readonly throughHost: string[];
}

/**
 * A synthetic binding whose `apply` returns `value` as the render it closes over — the shape of a
 * `useHostedPane` binding, whose ref is re-pointed at every render. Its series counts its own
 * `setData` calls, so a write that bypasses the host's loop is seen too.
 */
function loggedBinding(
  lc: LightweightCharts,
  key: string,
  value: number,
  log: FeedLog,
  seriesKeys: Map<HostSeries, string>,
): IndicatorBinding<SyntheticHandles> {
  return {
    mount: (chart, paneIndex) => {
      const series = chart.addSeries(lc.LineSeries, {}, paneIndex);
      const setData = series.setData.bind(series);
      series.setData = (items) => {
        log.setData.push(key);
        setData(items);
      };
      seriesKeys.set(series, key);
      return { series };
    },
    apply: ({ series }) => {
      log.apply.push(key);
      return [{ series, items: [{ time: T0 as never, value }] }];
    },
    unmount: (chart, { series }) => chart.removeSeries(series),
  };
}

/** The host's loop as `ChartHost.tsx::feedSeries` runs it: each feed's `setData`, in order. */
function hostLoop(log: FeedLog, seriesKeys: Map<HostSeries, string>): (feeds: readonly HostSeriesFeed[]) => void {
  return (feeds) => {
    for (const { series, items } of feeds) {
      log.throughHost.push(seriesKeys.get(series) ?? "?");
      series.setData(items as never);
    }
  };
}

function lastValue(series: HostSeries): number | undefined {
  const data = series.data();
  const last = data[data.length - 1] as { readonly value?: number } | undefined;
  return last?.value;
}

/**
 * Three bindings mounted and fed as the host's mount effect feeds them, then the endpoint's data
 * "arrives": its ref is re-pointed at a render with `42`, and the logs are cleared.
 */
async function endpointScene() {
  const { lc, chart } = await realChart();
  const log: FeedLog = { setData: [], apply: [], throughHost: [] };
  const seriesKeys = new Map<HostSeries, string>();
  const table = createBindingTable(resolvePaneIndex);
  const endpointRef: { current: AnyIndicatorBinding } = refOf(loggedBinding(lc, ENDPOINT_KEY, 1, log, seriesKeys));
  table.register("synthetic_overlay", OVERLAY, refOf(loggedBinding(lc, "synthetic_overlay", 1, log, seriesKeys)));
  table.register(ENDPOINT_KEY, OVERLAY, endpointRef);
  table.register("synthetic_pane", SYNTHETIC_PANE, refOf(loggedBinding(lc, "synthetic_pane", 1, log, seriesKeys)));
  const feed = hostLoop(log, seriesKeys);
  const mounted = table.attach({ chart, feedOutsidePage: feed });
  feed(mounted.flatMap(({ binding, handles }) => binding.current.apply(handles)));
  // Not vacuous: the first render reached every series through the host's loop.
  assert.deepEqual([...log.setData].sort(), ["synthetic_endpoint", "synthetic_overlay", "synthetic_pane"]);
  // The fetch the indicator made on its own resolved: its next render carries the new value.
  endpointRef.current = loggedBinding(lc, ENDPOINT_KEY, 42, log, seriesKeys) as AnyIndicatorBinding;
  for (const entries of [log.setData, log.apply, log.throughHost]) {
    entries.length = 0;
  }
  const seriesOf = (key: string): HostSeries => {
    const series = [...seriesKeys].find(([, own]) => own === key)?.[0];
    assert.ok(series !== undefined, `broken invariant: ${key} has no series`);
    return series;
  };
  return { chart, table, log, feed, seriesOf };
}

test("T-02.3: refeed(key) of a synthetic indicator-endpoint runs ITS apply once, through the host's loop, and touches no other series", async () => {
  const { chart, table, log, seriesOf } = await endpointScene();
  table.refeed(ENDPOINT_KEY);
  assert.deepEqual(log.apply, [ENDPOINT_KEY], "only the refed key is applied, once");
  assert.deepEqual(log.throughHost, [ENDPOINT_KEY], "its feed goes through the host's setData loop, once");
  assert.deepEqual(log.setData, [ENDPOINT_KEY], "no other series receives setData");
  // Read off the library: the endpoint shows its LATEST render, the others keep theirs.
  assert.equal(lastValue(seriesOf(ENDPOINT_KEY)), 42);
  assert.equal(lastValue(seriesOf("synthetic_overlay")), 1);
  assert.equal(lastValue(seriesOf("synthetic_pane")), 1);
  chart.remove();
});

test("T-02.3 ablation: a refeed that re-applies EVERY binding feeds the other series — the instrument above can fail", async () => {
  const { chart, table, log, feed } = await endpointScene();
  // The mutation the DoD names, played here so it runs on every execution.
  feed(table.mounted().flatMap(({ binding, handles }) => binding.current.apply(handles)));
  assert.notDeepEqual(log.setData, [ENDPOINT_KEY]);
  assert.deepEqual([...log.setData].sort(), ["synthetic_endpoint", "synthetic_overlay", "synthetic_pane"]);
  chart.remove();
});

test("T-02.3: refeed feeds nothing for a key that is not mounted — before attach, unknown, or unregistered", async () => {
  const { lc, chart } = await realChart();
  const log: FeedLog = { setData: [], apply: [], throughHost: [] };
  const seriesKeys = new Map<HostSeries, string>();
  const table = createBindingTable(resolvePaneIndex);
  const unregister = table.register(ENDPOINT_KEY, OVERLAY, refOf(loggedBinding(lc, ENDPOINT_KEY, 1, log, seriesKeys)));
  table.refeed(ENDPOINT_KEY);
  assert.deepEqual(log.apply, [], "before attach the mount applies the latest render itself");
  table.attach({ chart, feedOutsidePage: hostLoop(log, seriesKeys) });
  table.refeed("never_registered");
  unregister();
  table.refeed(ENDPOINT_KEY);
  assert.deepEqual(log, { setData: [], apply: [], throughHost: [] });
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
