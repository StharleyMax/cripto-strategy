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
  isAxisSyncAblationRequested,
  SINGLE_CHART_PANEL_COUNT,
  SINGLE_CHART_PANEL_INDEX,
  withAxisSyncAblation,
} from "./axis-sync.ts";
import type { LogicalRange, TimeAxis, TimeRange } from "../../charts/index.ts";

const ONE_MINUTE_MS = 60_000;

function axisOf(slotCount: number, startMs = 0): TimeAxis {
  return { startMs, stepMs: ONE_MINUTE_MS, slotCount };
}

// `paineis-de-fluxo` `T-01.5`: production no longer exports six fixed indices — the page is ONE
// chart and the store runs with `panelCount = 1`. The store's multi-panel ALGEBRA is unchanged and
// is still pinned below with six panels, through these test-local constants, so that every
// assertion written for `T-02.4`/`T-02.6`/`T-02.7`/`T-05.2` keeps its exact text.
const PANEL_COUNT = 6;
const PRICE_PANEL_INDEX = 0;
const OI_PANEL_INDEX = 1;
const CVD_PANEL_INDEX = 2;
const LIQUIDATION_LONG_PANEL_INDEX = 3;
const LIQUIDATION_SHORT_PANEL_INDEX = 4;
const LONG_SHORT_PANEL_INDEX = 5;

test("T-01.5: production runs ONE panel at index 0, and that is the store's default panelCount", () => {
  assert.equal(SINGLE_CHART_PANEL_COUNT, 1);
  assert.equal(SINGLE_CHART_PANEL_INDEX, 0);
  const store = createAxisSyncStore(axisOf(10));
  assert.doesNotThrow(() => store.registerPanel(SINGLE_CHART_PANEL_INDEX, () => {}));
  assert.throws(() => store.registerPanel(1, () => {}), RangeError, "a second panel index must not exist by default");
});

test("T-01.5: with the default single panel, a gesture is registered and nothing is ever written", () => {
  const store = createAxisSyncStore(axisOf(100));
  let writes = 0;
  store.registerPanel(SINGLE_CHART_PANEL_INDEX, () => {
    writes += 1;
  });
  store.notifyPanelRangeChanged(SINGLE_CHART_PANEL_INDEX, { from: 10, to: 60 });
  store.notifyPanelRangeChanged(SINGLE_CHART_PANEL_INDEX, { from: 5, to: 55 });
  assert.equal(writes, 0, "the only panel is always the origin");
  assert.deepEqual(store.currentRange, { fromMs: 5 * ONE_MINUTE_MS, toMs: 55 * ONE_MINUTE_MS });
});

test("T-01.5 rebase: the page's own echo (from + k on the NEW axis) does not reach onCandidateRange", () => {
  // MORDE: a rebase that keeps the OLD axis reads `from + k` as a move of `k` slots to the right,
  // fires `onCandidateRange`, and the pager asks for another page with no gesture — the cascade
  // `T-05-FIX` closed, back through the page path.
  const candidates: TimeRange[] = [];
  const applied: number[] = [];
  const oldAxis = axisOf(1_000, 500 * ONE_MINUTE_MS);
  const store = createAxisSyncStore(oldAxis, SINGLE_CHART_PANEL_COUNT, () => applied.push(1), {
    onCandidateRange: (range) => candidates.push(range),
  });
  store.notifyPanelRangeChanged(SINGLE_CHART_PANEL_INDEX, { from: 10, to: 210 });
  assert.equal(candidates.length, 1, "sanity: a real gesture reaches the pager");
  const registered = store.currentRange;

  const k = 500;
  const newAxis = axisOf(1_000 + k, 0);
  store.rebase(newAxis);
  assert.equal(store.axis, newAxis, "conversions now run on the new axis");
  assert.equal(store.currentRange, registered, "rebase keeps the state, same reference");
  store.notifyPanelRangeChanged(SINGLE_CHART_PANEL_INDEX, { from: 10 + k, to: 210 + k });
  assert.equal(candidates.length, 1, "the echo converts to the same milliseconds — no new candidate");
  assert.equal(applied.length, 1, "and no new application either");

  store.notifyPanelRangeChanged(SINGLE_CHART_PANEL_INDEX, { from: 9 + k, to: 209 + k });
  assert.equal(candidates.length, 2, "a real move after the rebase still reaches the pager");
  assert.deepEqual(candidates[1], { fromMs: 509 * ONE_MINUTE_MS, toMs: 709 * ONE_MINUTE_MS });
});

test("T-01.5 rebase through the ablation wrapper reaches the real store (no frozen spread)", () => {
  const store = createAxisSyncStore(axisOf(10));
  const ablated = withAxisSyncAblation(store, true);
  const next = axisOf(20);
  ablated.rebase(next);
  assert.equal(store.axis, next);
  assert.equal(ablated.axis, next, "the wrapper reads the live axis, not a copy taken at wrap time");
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

// ── `T-05.2` — `options.initialRange`/`options.onCandidateRange`, the paginator's own wiring ──

test("options.initialRange CALA: a page-triggered axis swap preserves the operator's OWN visible range, not the whole axis", () => {
  const axis = axisOf(20, 0); // a widened axis, e.g. after a history page arrived
  const preserved: TimeRange = { fromMs: 5 * ONE_MINUTE_MS, toMs: 15 * ONE_MINUTE_MS };
  const store = createAxisSyncStore(axis, PANEL_COUNT, undefined, { initialRange: preserved });
  assert.deepEqual(store.initialLogicalRange, { from: 5, to: 15 }, "never [0, slotCount] when a range was preserved");
});

test("options.initialRange omitted MORDE: falls back to the whole axis — the pre-T-05.2 default, byte for byte", () => {
  const axis = axisOf(10, 1_000);
  const store = createAxisSyncStore(axis, PANEL_COUNT, undefined, {});
  assert.deepEqual(store.initialLogicalRange, { from: 0, to: 10 });
});

test("options.onCandidateRange MORDE: fires with the CURRENT TimeRange on a real pan, panel-agnostic", () => {
  const axis = axisOf(10);
  const seen: TimeRange[] = [];
  const store = createAxisSyncStore(axis, PANEL_COUNT, undefined, {
    onCandidateRange: (range) => seen.push(range),
  });
  store.notifyPanelRangeChanged(OI_PANEL_INDEX, { from: 1, to: 7 });
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0], { fromMs: 1 * ONE_MINUTE_MS, toMs: 7 * ONE_MINUTE_MS });
});

test("options.onCandidateRange CALA: an echo of the current state fires it ZERO times — same gate as onRangeApplied", () => {
  const axis = axisOf(10);
  let calls = 0;
  const store = createAxisSyncStore(axis, PANEL_COUNT, undefined, {
    onCandidateRange: () => {
      calls += 1;
    },
  });
  store.notifyPanelRangeChanged(PRICE_PANEL_INDEX, store.initialLogicalRange);
  assert.equal(calls, 0);
});

test("onRangeApplied and onCandidateRange BOTH fire, independently, off the SAME dispatch", () => {
  const axis = axisOf(10);
  let latencyCalls = 0;
  const seenRanges: TimeRange[] = [];
  const store = createAxisSyncStore(
    axis,
    PANEL_COUNT,
    () => {
      latencyCalls += 1;
    },
    { onCandidateRange: (range) => seenRanges.push(range) },
  );
  store.notifyPanelRangeChanged(CVD_PANEL_INDEX, { from: 2, to: 9 });
  assert.equal(latencyCalls, 1);
  assert.equal(seenRanges.length, 1);
});

test("withAxisSyncAblation(store, true) also silences onCandidateRange — ablation disables the whole dispatch verb", () => {
  const axis = axisOf(10);
  let calls = 0;
  const real = createAxisSyncStore(axis, PANEL_COUNT, undefined, {
    onCandidateRange: () => {
      calls += 1;
    },
  });
  const ablated = withAxisSyncAblation(real, true);
  ablated.notifyPanelRangeChanged(PRICE_PANEL_INDEX, { from: 2, to: 8 });
  assert.equal(calls, 0);
});
