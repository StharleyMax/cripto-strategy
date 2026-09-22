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
  createAxisSyncStore,
  CVD_PANEL_INDEX,
  LIQUIDATION_LONG_PANEL_INDEX,
  LIQUIDATION_SHORT_PANEL_INDEX,
  LONG_SHORT_PANEL_INDEX,
  OI_PANEL_INDEX,
  PANEL_COUNT,
  PRICE_PANEL_INDEX,
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
