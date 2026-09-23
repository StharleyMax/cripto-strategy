// Unit tests for `range-dispatch.ts` (`T-02.3`, `D-C3.2`, `CA-5c`). Same discipline as
// `time-axis-controller.test.ts`: no `jsdom`, no `lightweight-charts`, no real `IChartApi` —
// panels are plain closures over an array, which is all `D-C3.1`'s boundary requires this
// module to know about a "panel".
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRangeDispatcher, createReentrancyGuard } from "./range-dispatch.ts";
import type { RangeDispatcher } from "./range-dispatch.ts";
import { toLogicalRange } from "./time-axis-controller.ts";
import type { LogicalRange, TimeAxis, TimeRange } from "./time-axis-controller.ts";

const THIS_FILE = fileURLToPath(import.meta.url);
const SOURCE_FILE = path.join(path.dirname(THIS_FILE), "range-dispatch.ts");

test("PURITY (D-C3.2 boundary): the module CODE names neither IChartApi, fetch, nor lightweight-charts", () => {
  // Same MORDE/CALA pair `time-axis-controller.test.ts` runs for `D-C3.1`: strip comments
  // first so the assertion is about CODE, and prove the strip has teeth by asserting the RAW
  // source (prose included) still mentions `IChartApi`.
  const source = readFileSync(SOURCE_FILE, "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.equal(code.includes("IChartApi"), false, "module code must not reference IChartApi");
  assert.equal(/\bfetch\s*\(/.test(code), false, "module code must not call fetch(...)");
  assert.equal(
    code.includes("lightweight-charts"),
    false,
    "module code must not import the charting library",
  );
  assert.equal(code.includes("jsdom"), false, "module code must not depend on jsdom");
  assert.equal(source.includes("IChartApi"), true, "sanity: the docstring must still discuss IChartApi in prose");
});

test("createReentrancyGuard starts released and is held only during runApplying", () => {
  const guard = createReentrancyGuard();
  assert.equal(guard.isApplying, false);
  let observedDuring: boolean | undefined;
  guard.runApplying(() => {
    observedDuring = guard.isApplying;
  });
  assert.equal(observedDuring, true);
  assert.equal(guard.isApplying, false, "guard must release once runApplying returns");
});

test("createReentrancyGuard.holdApplying holds until released, unlike runApplying's synchronous release", () => {
  const guard = createReentrancyGuard();
  assert.equal(guard.isApplying, false);
  const release = guard.holdApplying();
  assert.equal(guard.isApplying, true, "held immediately, synchronously");
  assert.equal(guard.isApplying, true, "still held on a LATER read — this is what runApplying cannot do");
  release();
  assert.equal(guard.isApplying, false, "released once the caller calls the returned function");
});

test("createReentrancyGuard.holdApplying's release is idempotent — a second call is a harmless no-op", () => {
  const guard = createReentrancyGuard();
  const release = guard.holdApplying();
  release();
  assert.equal(guard.isApplying, false);
  release(); // must not throw, must not re-acquire, must not affect a later independent hold
  assert.equal(guard.isApplying, false, "a double release must not leave applying stuck true");
});

test("T-05-FIX falsifier: a candidate that arrives WHILE holdApplying is held is dropped — the exact deferred-echo shape a synchronous runApplying cannot cover", () => {
  // Models `SymbolClient.tsx`'s mount-time fix precisely: `setVisibleLogicalRange` is a
  // synchronous CALL whose own change notification is delivered on a LATER turn (the library's
  // `requestAnimationFrame`, per `lightweight-charts.development.mjs:11196`) — by which point a
  // synchronous `runApplying(fn)` has already released. Only a hold that survives past the
  // synchronous call can catch it.
  const axis: TimeAxis = { startMs: 0, stepMs: 60_000, slotCount: 5_760 };
  const initialState: TimeRange = { fromMs: 0, toMs: 500 * 60_000 };
  let writes = 0;
  const dispatcher: RangeDispatcher = createRangeDispatcher(axis, initialState, 3, () => {
    writes += 1;
  });

  const release = dispatcher.guard.holdApplying();
  // The deferred echo of the mount's own "aplica" — landing later, wildly different from
  // `initialState` (simulating the relayout-driven mismatch T-05.9 measured on a widened axis),
  // exactly the shape plain dedupe (`reduceRangeEvent`) alone does not catch.
  dispatcher.onPanelRangeChanged(0, { from: 9_999, to: 10_499 });
  assert.equal(writes, 0, "held: the deferred echo must be dropped before dedupe even runs");
  assert.equal(dispatcher.state, initialState, "held: state must not move from the echo");

  release();
  // MUTATION THIS FALSIFIER REJECTS: a caller that forgot to hold (or released too early, back
  // to `runApplying`'s synchronous-only contract) — proven by NOT holding at all here, over the
  // SAME candidate, on a fresh dispatcher.
  const unguarded: RangeDispatcher = createRangeDispatcher(axis, initialState, 3, () => {
    writes += 1;
  });
  unguarded.onPanelRangeChanged(0, { from: 9_999, to: 10_499 });
  assert.ok(writes > 0, "sanity: unguarded, the same candidate DOES write — proving the guard above was load-bearing, not dead");
});

test("createReentrancyGuard releases even if the wrapped function throws", () => {
  const guard = createReentrancyGuard();
  assert.throws(() => {
    guard.runApplying(() => {
      throw new Error("boom");
    });
  });
  assert.equal(guard.isApplying, false, "a mid-sequence exception must not leave the guard stuck");
});

test("T-05-FIX RODADA 3 falsifier: TWO concurrent holdApplying calls — releasing the FIRST must not open the guard while the SECOND is still held (the six-panel mount shape)", () => {
  // Models `useLightweightChart`'s real interleaving precisely: `axisSync.guard` is ONE
  // instance shared by all six panels (`axis-sync.ts::guard` === `dispatcher.guard`), and each
  // panel's own mount effect calls `holdApplying()` independently, then releases from its OWN
  // `requestAnimationFrame` — panel 0's release (`releaseA` here) fires BEFORE panel 1's own
  // deferred echo has had its chance to arrive, because `lightweight-charts` schedules its own
  // `window.requestAnimationFrame` per chart instance and same-frame callbacks fire in
  // REGISTRATION order: [chart0-lib-raf, chart0-release-raf, chart1-lib-raf, chart1-release-raf].
  // A guard that is a plain boolean (release = "set applying=false", no counting) fails this:
  // `releaseA()` would flip `isApplying` to `false` before `releaseB` ever runs, reopening the
  // door for panel 1's own deferred echo to be misread as a real gesture — the exact mechanism
  // `[MEDIDO 2026-09-23]` found still looping after RODADA 1's single-hold fix.
  const guard = createReentrancyGuard();
  assert.equal(guard.isApplying, false);
  const releaseA = guard.holdApplying();
  const releaseB = guard.holdApplying();
  assert.equal(guard.isApplying, true, "held once either caller has opened it");
  releaseA();
  assert.equal(
    guard.isApplying,
    true,
    "MUTATION THIS FALSIFIER REJECTS: the guard must STILL be held — releaseB has not run yet",
  );
  releaseB();
  assert.equal(guard.isApplying, false, "released only once EVERY outstanding hold has been released");
});

test("T-05-FIX RODADA 3 falsifier: a candidate for panel 1 is still dropped after panel 0's own release, while panel 1's hold is outstanding", () => {
  // Same shape as the test above, but through the dispatcher end-to-end (not just the guard's
  // own boolean), proving the six-panel mount race actually keeps a SECOND panel's deferred echo
  // from reaching `write` — the falsifier from `range-dispatch.test.ts`'s existing single-hold
  // test does not cover this because it only ever opens ONE hold.
  const axis: TimeAxis = { startMs: 0, stepMs: 60_000, slotCount: 5_760 };
  const initialState: TimeRange = { fromMs: 0, toMs: 500 * 60_000 };
  let writes = 0;
  const dispatcher: RangeDispatcher = createRangeDispatcher(axis, initialState, 3, () => {
    writes += 1;
  });

  // Panel 0 and panel 1 both mount and both hold, exactly like `useLightweightChart`'s effect
  // running twice in the same commit for two sibling panels sharing `axisSync.guard`.
  const releasePanel0 = dispatcher.guard.holdApplying();
  const releasePanel1 = dispatcher.guard.holdApplying();
  // Panel 0's own deferred echo lands and is (correctly) dropped, then panel 0 releases ITS OWN
  // hold — this is chart0-lib-raf then chart0-release-raf, in that order.
  dispatcher.onPanelRangeChanged(0, { from: 9_999, to: 10_499 });
  releasePanel0();
  // Panel 1's own deferred echo has not arrived yet (its lib-raf is queued AFTER panel 0's
  // release-raf) — but it is about to, and panel 1 has not released its own hold.
  dispatcher.onPanelRangeChanged(1, { from: 9_999, to: 10_499 });
  assert.equal(
    writes,
    0,
    "MUTATION THIS FALSIFIER REJECTS: panel 1's deferred echo must still be dropped — panel 1's own hold is outstanding",
  );
  assert.equal(dispatcher.state, initialState, "state must not move from either panel's own deferred echo");

  releasePanel1();
});

test("createRangeDispatcher rejects a negative or non-integer panelCount", () => {
  const axis: TimeAxis = { startMs: 0, stepMs: 60_000, slotCount: 10 };
  const state: TimeRange = { fromMs: 0, toMs: 60_000 };
  assert.throws(() => createRangeDispatcher(axis, state, -1, () => {}), RangeError);
  assert.throws(() => createRangeDispatcher(axis, state, 1.5, () => {}), RangeError);
});

test("createRangeDispatcher ignores an echo within epsilon — zero writes, unchanged state reference", () => {
  const axis: TimeAxis = { startMs: 0, stepMs: 60_000, slotCount: 10 };
  const state: TimeRange = { fromMs: 0, toMs: 60_000 };
  let writes = 0;
  const dispatcher = createRangeDispatcher(axis, state, 3, () => {
    writes += 1;
  });
  dispatcher.onPanelRangeChanged(0, toLogicalRange(state, axis));
  assert.equal(writes, 0, "an identical (echo) candidate must not write to any panel");
  assert.equal(dispatcher.state, state, "state reference must be unchanged (T-02.2's `next===state` contract)");
});

// --- CA-5c ------------------------------------------------------------------------------

const N = 6;
const AXIS: TimeAxis = { startMs: 0, stepMs: 60_000, slotCount: 5_760 };
const INITIAL_STATE: TimeRange = { fromMs: 0, toMs: 500 * 60_000 };
const PAN_TARGET: LogicalRange = { from: 12, to: 512 };

test("CA-5c negative control: the naive 'every panel echoes to every panel' mesh amplifies to 30 writes for N=6", () => {
  // Reproduces `JULGAMENTO-FRONTEND-ARCHITECT.md:151-155`'s measured naive-mesh shape: NO
  // dispatcher, NO guard — every panel, on ANY notification (including the five echoes its
  // own first-round writes produce), unconditionally re-broadcasts its value to the other
  // five. This is the malha ingênua this task's title says does NOT stack-overflow (depth 1
  // in the real library) but DOES waste writes.
  let writes = 0;
  let notifications = 0;
  const values: Array<LogicalRange | undefined> = new Array(N).fill(undefined);

  // The panel's own `subscribeVisibleLogicalRangeChange` firing — user drag (panel 0, called
  // once below) OR a value actually changing because of `naiveWrite`. The naive handler does
  // not distinguish the two: on ANY notification it unconditionally re-broadcasts to the
  // other five, which is the bug.
  function onNotification(panelIndex: number, logical: LogicalRange): void {
    notifications += 1;
    for (let other = 0; other < N; other += 1) {
      if (other !== panelIndex) {
        naiveWrite(other, logical);
      }
    }
  }

  function naiveWrite(panelIndex: number, logical: LogicalRange): void {
    writes += 1;
    const previous = values[panelIndex];
    values[panelIndex] = logical;
    const changed = !previous || previous.from !== logical.from || previous.to !== logical.to;
    if (changed) {
      onNotification(panelIndex, logical); // measured: a set to an IDENTICAL range does not re-notify.
    }
  }

  values[0] = PAN_TARGET; // the user's drag sets panel 0 directly — not a `naiveWrite` call
  onNotification(0, PAN_TARGET);

  assert.equal(notifications, 6, "sanity: same 6 notifications the correct dispatcher also sees");
  assert.equal(
    writes,
    5 * notifications,
    "every notification unconditionally re-broadcasts to the other 5 panels — the naive bug",
  );
  assert.equal(writes, 30, "naive mesh reproduces the measured 30-write amplification for N=6");
});

test("CA-5c: the correct RangeDispatcher never exceeds panelCount-1 writes for one real pan (N=6)", () => {
  let writes = 0;
  let notifications = 0;

  function write(panelIndex: number, logical: LogicalRange): void {
    writes += 1;
    notifications += 1; // the panel's own subscribeVisibleLogicalRangeChange firing, re-entrant
    dispatcher.onPanelRangeChanged(panelIndex, logical);
  }

  const dispatcher: RangeDispatcher = createRangeDispatcher(AXIS, INITIAL_STATE, N, write);
  notifications += 1; // the origin panel's own drag notification (not a `write` call)
  dispatcher.onPanelRangeChanged(0, PAN_TARGET);

  assert.equal(notifications, 6, "same 6 notifications as the naive mesh — same gesture, same N panels");
  assert.ok(writes <= N - 1, `CA-5c: writes must not exceed panelCount-1 (${N - 1}), got ${writes} (naive gives 30)`);
  assert.equal(writes, 5, "the design's exact figure, matching JULGAMENTO-FRONTEND-ARCHITECT.md:154 ('5 escritas')");
});

test("the guard drops a transient candidate mid-apply that dedupe alone would NOT catch — D-C3.2's distinct job", () => {
  // During a real suspend -> setData(all six) -> apply sequence, a panel can report a value
  // FAR from the target (e.g. clamped to its own still-native length mid-remount) — not a
  // sub-epsilon near-duplicate `reduceRangeEvent` would dedupe away. Only checking the guard
  // BEFORE dedupe stops this from being mistaken for a fresh user gesture.
  const axis: TimeAxis = { startMs: 0, stepMs: 60_000, slotCount: 5_760 };
  const initialState: TimeRange = { fromMs: 0, toMs: 500 * 60_000 };
  let writes = 0;

  function write(panelIndex: number, logical: LogicalRange): void {
    writes += 1;
    // Mid-apply, this panel reports a wildly different transient range (simulating a
    // still-mounting series). Only the guard — checked first, before dedupe — can drop it.
    dispatcher.onPanelRangeChanged(panelIndex, { from: logical.from + 9_999, to: logical.to + 9_999 });
  }

  const dispatcher: RangeDispatcher = createRangeDispatcher(axis, initialState, 3, write);
  dispatcher.onPanelRangeChanged(0, { from: 1, to: 501 });

  assert.equal(writes, 2, "only the two non-origin panels are written once each");
  assert.deepEqual(
    dispatcher.state,
    { fromMs: 60_000, toMs: 501 * 60_000 },
    "the far-away transient candidates reported mid-apply must NOT have moved the registered state",
  );
});
