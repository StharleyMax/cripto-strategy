/**
 * `T-02.4` (`CST-211`) — the "assina, despacha e aplica" wiring, tested without a DOM or a
 * chart: `createAxisSyncStore` only needs `TimeAxis`/`LogicalRange` values and plain callback
 * functions, the same discipline `range-dispatch.test.ts` (`T-02.3`) already exercises one
 * layer down.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AXIS_SYNC_ABLATION_QUERY_PARAM,
  createAxisSyncStore,
  CVD_PANEL_INDEX,
  isAxisSyncAblationRequested,
  LIQUIDATION_LONG_PANEL_INDEX,
  LIQUIDATION_SHORT_PANEL_INDEX,
  LONG_SHORT_PANEL_INDEX,
  OI_PANEL_INDEX,
  PANEL_COUNT,
  PRICE_PANEL_INDEX,
  withAxisSyncAblation,
} from "./axis-sync.ts";
import type { LogicalRange, TimeAxis } from "../../charts/index.ts";

const ONE_MINUTE_MS = 60_000;

function axisOf(slotCount: number, startMs = 0): TimeAxis {
  return { startMs, stepMs: ONE_MINUTE_MS, slotCount };
}

test("the six panel indices are 0..5, distinct, and PANEL_COUNT is 6 — the `T-02.4` baseline", () => {
  const indices = [
    PRICE_PANEL_INDEX,
    OI_PANEL_INDEX,
    CVD_PANEL_INDEX,
    LIQUIDATION_LONG_PANEL_INDEX,
    LIQUIDATION_SHORT_PANEL_INDEX,
    LONG_SHORT_PANEL_INDEX,
  ];
  assert.deepEqual([...indices].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5]);
  assert.equal(PANEL_COUNT, 6);
});

test("initialLogicalRange spans the WHOLE axis — [0, slotCount], the value that replaces fitContent()", () => {
  const axis = axisOf(10, 1_000);
  const store = createAxisSyncStore(axis, PANEL_COUNT);
  assert.deepEqual(store.initialLogicalRange, { from: 0, to: 10 });
  assert.equal(store.axis, axis);
});

test("registerPanel + notifyPanelRangeChanged: a real pan on the ORIGIN panel writes to every OTHER panel, never itself", () => {
  const axis = axisOf(10);
  const store = createAxisSyncStore(axis, PANEL_COUNT);
  const received: Array<Array<LogicalRange>> = Array.from({ length: PANEL_COUNT }, () => []);
  for (let index = 0; index < PANEL_COUNT; index += 1) {
    store.registerPanel(index, (logical) => {
      received[index]!.push(logical);
    });
  }

  // A candidate far enough from the initial `[0, 10]` range that `reduceRangeEvent`'s epsilon
  // (`DEFAULT_RANGE_EPSILON_MS = 0.5`) cannot mistake it for a repeat.
  store.notifyPanelRangeChanged(PRICE_PANEL_INDEX, { from: 2, to: 8 });

  assert.equal(received[PRICE_PANEL_INDEX]!.length, 0, "the panel that moved is never written back to");
  for (const index of [OI_PANEL_INDEX, CVD_PANEL_INDEX, LIQUIDATION_LONG_PANEL_INDEX, LIQUIDATION_SHORT_PANEL_INDEX, LONG_SHORT_PANEL_INDEX]) {
    assert.equal(received[index]!.length, 1, `panel ${index} should receive exactly one write`);
  }
});

test("CA-5c through the store: one real pan produces AT MOST panelCount-1 writes, never panelCount*(panelCount-1)", () => {
  const axis = axisOf(10);
  const store = createAxisSyncStore(axis, PANEL_COUNT);
  let totalWrites = 0;
  for (let index = 0; index < PANEL_COUNT; index += 1) {
    store.registerPanel(index, () => {
      totalWrites += 1;
    });
  }
  store.notifyPanelRangeChanged(OI_PANEL_INDEX, { from: 1, to: 9 });
  assert.ok(totalWrites <= PANEL_COUNT - 1, `expected <= ${PANEL_COUNT - 1} writes, got ${totalWrites}`);
  assert.equal(totalWrites, PANEL_COUNT - 1);
});

test("an echo of the CURRENT state is deduped — no write at all, the property that keeps a mesh from amplifying", () => {
  const axis = axisOf(10);
  const store = createAxisSyncStore(axis, PANEL_COUNT);
  let writes = 0;
  for (let index = 0; index < PANEL_COUNT; index += 1) {
    store.registerPanel(index, () => {
      writes += 1;
    });
  }
  // The store's registered state starts at `initialLogicalRange` — reporting it back is an
  // echo, not a gesture.
  store.notifyPanelRangeChanged(PRICE_PANEL_INDEX, store.initialLogicalRange);
  assert.equal(writes, 0);
});

test("unregisterPanel clears the slot: a later dispatch no longer calls the stale callback", () => {
  const axis = axisOf(10);
  const store = createAxisSyncStore(axis, PANEL_COUNT);
  let calls = 0;
  const unregister = store.registerPanel(OI_PANEL_INDEX, () => {
    calls += 1;
  });
  unregister();
  store.notifyPanelRangeChanged(PRICE_PANEL_INDEX, { from: 2, to: 8 });
  assert.equal(calls, 0, "the unregistered panel must not be written to");
});

test("unregister is guarded by IDENTITY: an older registration's cleanup cannot clear a newer one's slot", () => {
  const axis = axisOf(10);
  const store = createAxisSyncStore(axis, PANEL_COUNT);
  let newerCalls = 0;
  const unregisterOlder = store.registerPanel(OI_PANEL_INDEX, () => {
    throw new Error("the OLDER callback must never run once replaced");
  });
  store.registerPanel(OI_PANEL_INDEX, () => {
    newerCalls += 1;
  });
  // The older effect's cleanup fires AFTER the newer registration — e.g. React's
  // mount-newer-then-cleanup-older ordering on a fast remount.
  unregisterOlder();
  store.notifyPanelRangeChanged(PRICE_PANEL_INDEX, { from: 2, to: 8 });
  assert.equal(newerCalls, 1, "the newer registration must still receive the write");
});

test("registerPanel rejects an out-of-range index — the guard `RangeDispatcher` itself does not own", () => {
  const store = createAxisSyncStore(axisOf(10), PANEL_COUNT);
  assert.throws(() => store.registerPanel(-1, () => {}), RangeError);
  assert.throws(() => store.registerPanel(PANEL_COUNT, () => {}), RangeError);
  assert.throws(() => store.registerPanel(1.5, () => {}), RangeError);
});

test("createAxisSyncStore rejects a non-positive panelCount", () => {
  assert.throws(() => createAxisSyncStore(axisOf(10), 0), RangeError);
  assert.throws(() => createAxisSyncStore(axisOf(10), -1), RangeError);
  assert.throws(() => createAxisSyncStore(axisOf(10), 2.5), RangeError);
});

// ── `T-02.6` (`CST-213`, `DoD-3`/`CA-6`) — the ablation switch, par morde/cala ──────────────

test("isAxisSyncAblationRequested: MORDE — the exact param+value the Playwright spec sets", () => {
  assert.equal(isAxisSyncAblationRequested(`?${AXIS_SYNC_ABLATION_QUERY_PARAM}=1`), true);
});

test("isAxisSyncAblationRequested CALA — absent, a different value, or a look-alike param name", () => {
  assert.equal(isAxisSyncAblationRequested(""), false, "no query string at all");
  assert.equal(isAxisSyncAblationRequested("?symbol=BTCUSDT"), false, "an unrelated param");
  assert.equal(
    isAxisSyncAblationRequested(`?${AXIS_SYNC_ABLATION_QUERY_PARAM}=0`), false,
    "the param present but not '1' must not ablate",
  );
  assert.equal(
    isAxisSyncAblationRequested(`?${AXIS_SYNC_ABLATION_QUERY_PARAM}=true`), false,
    "only the literal string '1' ablates — 'true' is a different value",
  );
});

test("withAxisSyncAblation(store, false) returns the SAME store — zero cost on every real URL", () => {
  const store = createAxisSyncStore(axisOf(10), PANEL_COUNT);
  assert.equal(withAxisSyncAblation(store, false), store);
});

test("withAxisSyncAblation(store, true) MORDE: notifyPanelRangeChanged becomes a no-op — the five never hear about it", () => {
  const store = createAxisSyncStore(axisOf(10), PANEL_COUNT);
  let writes = 0;
  for (let index = 0; index < PANEL_COUNT; index += 1) {
    store.registerPanel(index, () => {
      writes += 1;
    });
  }
  const ablated = withAxisSyncAblation(store, true);
  ablated.notifyPanelRangeChanged(PRICE_PANEL_INDEX, { from: 2, to: 8 });
  assert.equal(writes, 0, "ablated: a gesture on one panel must write to none of the others");
});

test("withAxisSyncAblation(store, true) CALA: registerPanel and initialLogicalRange stay real — only the dispatch verb is silenced", () => {
  const store = createAxisSyncStore(axisOf(10), PANEL_COUNT);
  const ablated = withAxisSyncAblation(store, true);
  assert.deepEqual(ablated.initialLogicalRange, store.initialLogicalRange);
  let calls = 0;
  const unregister = ablated.registerPanel(OI_PANEL_INDEX, () => {
    calls += 1;
  });
  // Calling the UNABLATED store's own dispatch directly proves `registerPanel` really did
  // register on the SAME underlying table — ablation only replaced `notifyPanelRangeChanged`.
  store.notifyPanelRangeChanged(PRICE_PANEL_INDEX, { from: 2, to: 8 });
  assert.equal(calls, 1, "registerPanel must still be wired to the real store's write table");
  unregister();
});

// ── `T-02.7` — `onRangeApplied`, the hook `axis-latency-probe.ts` reads a timestamp from ──────

test("onRangeApplied MORDE: fires exactly once for a real pan, the event `T-02.7` measures", () => {
  const axis = axisOf(10);
  let calls = 0;
  const store = createAxisSyncStore(axis, PANEL_COUNT, () => {
    calls += 1;
  });
  store.notifyPanelRangeChanged(PRICE_PANEL_INDEX, { from: 2, to: 8 });
  assert.equal(calls, 1, "a genuine range change must fire the hook exactly once");
});

test("onRangeApplied CALA: an echo of the current state fires the hook ZERO times", () => {
  const axis = axisOf(10);
  let calls = 0;
  const store = createAxisSyncStore(axis, PANEL_COUNT, () => {
    calls += 1;
  });
  // Same echo `axis-sync.test.ts` already proves produces zero writes — the hook must agree
  // with the writes, not fire on every call regardless of whether anything actually applied.
  store.notifyPanelRangeChanged(PRICE_PANEL_INDEX, store.initialLogicalRange);
  assert.equal(calls, 0, "an echo of the current state is not an application");
});

test("onRangeApplied is a true no-op when omitted — every call site before `T-02.7` still works", () => {
  const store = createAxisSyncStore(axisOf(10), PANEL_COUNT);
  assert.doesNotThrow(() => store.notifyPanelRangeChanged(PRICE_PANEL_INDEX, { from: 2, to: 8 }));
});
