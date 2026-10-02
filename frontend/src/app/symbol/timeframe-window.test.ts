/**
 * `paineis-de-fluxo` `T-05.1` — the per-timeframe window table (`timeframe-window.ts`) and the two
 * unit-level falsifiers of defect `D-A` (`handoff/FIX-uso-2026-10-02.md`): the axis of a `4h`/`1h`
 * window is at the TIMEFRAME's step, not at one minute.
 *
 * The table's invariants are `handoff/T-05.1-desenho.md` §2 (i)–(iv). The two literals (`1h` = 168,
 * `4h` = 42) are the owner's decision of 2026-10-02 (7 days), COPIED here rather than read from the
 * module, so a change to the table is a change this file has to be told about.
 *
 * Run with: npm --prefix frontend run test:app
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { S2_PRICE_USE, axisForWindow } from "../../charts/index.ts";
import { DEFAULT_MAX_ACCUMULATED_SLOTS, effectiveMaxAccumulatedSlots } from "./history-page-window.ts";
import { EMPTY_OI_CANDLE_BUNDLE } from "./oi-candle-pane.ts";
import { assembleHistoryPage, type HistoryRowsBundle } from "./panel-assembly.ts";
import { resolveRouteWindow } from "./request-window.ts";
import { SUPPORTED_TIMEFRAMES, timeframeStepMs } from "./supported-timeframes.ts";
import { TIMEFRAME_WINDOW_BARS, VIEW_BARS, timeframeWindowBars } from "./timeframe-window.ts";

const ONE_MINUTE_MS = 60_000;
const FIVE_MINUTES_MS = 5 * ONE_MINUTE_MS;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
const FOUR_HOURS_MS = 4 * ONE_HOUR_MS;
const DAY_MS = 24 * ONE_HOUR_MS;
/** The budget the table is sized by: no request carries more than 7 days of native minutes
 * (`T-05.1-desenho.md` §0, measured wall-clock per screen). */
const MAX_REQUEST_SPAN_MS = 7 * DAY_MS;
/** A clock reading that is NOT aligned to anything — the route window must still come out whole. */
const NOW_MS = Date.UTC(2026, 9, 2, 14, 37, 21, 123);

const SERVED = SUPPORTED_TIMEFRAMES.map((option) => option.interval);

test("(i) one row per served timeframe — no more, no fewer", () => {
  assert.deepEqual(Object.keys(TIMEFRAME_WINDOW_BARS).sort(), [...SERVED].sort());
  for (const interval of SERVED) {
    assert.deepEqual(timeframeWindowBars(interval), TIMEFRAME_WINDOW_BARS[interval]);
  }
});

test("(i) an interval outside the served set has no row — it throws, never falls back to a default", () => {
  for (const bogus of ["2h", "1d", "", "1M", "toString", "__proto__"]) {
    assert.throws(() => timeframeWindowBars(bogus), RangeError, `"${bogus}" must not resolve to a row`);
  }
});

test("(ii) every initial span is a whole number of the route's alignment — resolveTrailingWindow would throw otherwise", () => {
  for (const interval of SERVED) {
    const stepMs = timeframeStepMs(interval);
    const { initialBars } = timeframeWindowBars(interval);
    assert.equal((initialBars * stepMs) % Math.max(FIVE_MINUTES_MS, stepMs), 0, interval);
    // And the route itself builds it, at an unaligned clock reading, with exactly that span.
    const route = resolveRouteWindow(NOW_MS, interval);
    assert.equal(route.window.endMsExclusive - route.window.startMs, initialBars * stepMs, interval);
  }
});

test("(iii) no initial window and no page carries more than 7 days of native minutes", () => {
  for (const interval of SERVED) {
    const stepMs = timeframeStepMs(interval);
    const { initialBars, pageBars } = timeframeWindowBars(interval);
    assert.ok(initialBars * stepMs <= MAX_REQUEST_SPAN_MS, `${interval}: initial window over 7 days`);
    assert.ok(pageBars * stepMs <= MAX_REQUEST_SPAN_MS, `${interval}: page over 7 days`);
    assert.ok(Number.isInteger(initialBars) && initialBars > 0, `${interval}: initialBars`);
    assert.ok(Number.isInteger(pageBars) && pageBars > 0, `${interval}: pageBars`);
  }
});

test("(iv) the seed plus one page fits the effective cap; only 1m lifts it past the uniform 5.000", () => {
  for (const interval of SERVED) {
    const stepMs = timeframeStepMs(interval);
    const { initialBars, pageBars } = timeframeWindowBars(interval);
    const seed = { startMs: 0, endMsExclusive: initialBars * stepMs };
    const cap = effectiveMaxAccumulatedSlots(seed, stepMs, pageBars);
    assert.ok(initialBars + pageBars <= cap, `${interval}: seed + page exceeds the cap`);
    assert.equal(cap, interval === "1m" ? 6_260 : DEFAULT_MAX_ACCUMULATED_SLOTS, interval);
  }
});

test("the rule the table follows: 4 days, unless 4 days is fewer bars than the view — then 7 days", () => {
  for (const interval of SERVED) {
    const stepMs = timeframeStepMs(interval);
    const fourDayBars = (4 * DAY_MS) / stepMs;
    const expectedSpanMs = fourDayBars >= VIEW_BARS ? 4 * DAY_MS : 7 * DAY_MS;
    assert.equal(timeframeWindowBars(interval).initialBars * stepMs, expectedSpanMs, interval);
  }
});

test("the owner's decision, literal: 1h opens on 168 bars and 4h on 42 (7 days); 1m is unchanged at 5.760/500", () => {
  // `[DECISÃO-OWNER: 2026-10-02, escolha entre alternativas apresentadas]` — `T-05.1-desenho.md`.
  assert.deepEqual(timeframeWindowBars("1h"), { initialBars: 168, pageBars: 168 });
  assert.deepEqual(timeframeWindowBars("4h"), { initialBars: 42, pageBars: 42 });
  assert.deepEqual(timeframeWindowBars("1m"), { initialBars: 5_760, pageBars: 500 });
  assert.equal(VIEW_BARS, 120);
});

// ── The unit-level falsifiers of `D-A`: the route window of a TF, on that TF's axis ──────────

test("MORDE D-A: the 4h route window is a 42-slot axis at 4h — at a 1-minute step it would be 10.080", () => {
  const route = resolveRouteWindow(NOW_MS, "4h");
  const axis = axisForWindow(route.window, timeframeStepMs("4h"));
  assert.equal(axis.stepMs, FOUR_HOURS_MS);
  assert.equal(axis.slotCount, 42);
  // The ablation arm, spelled: the defect put this same window on the 1-minute grid.
  assert.equal(axisForWindow(route.window, ONE_MINUTE_MS).slotCount, 10_080);
});

test("MORDE D-A: the 1h route window is a 168-slot axis at 1h", () => {
  const route = resolveRouteWindow(NOW_MS, "1h");
  assert.equal(axisForWindow(route.window, timeframeStepMs("1h")).slotCount, 168);
  assert.equal(axisForWindow(route.window, ONE_MINUTE_MS).slotCount, 10_080);
});

function emptyRows(): HistoryRowsBundle {
  return {
    open: [],
    high: [],
    low: [],
    close: [],
    oi: [],
    cvd: [],
    volume: [],
    liquidationLong: [],
    liquidationShort: [],
    longShort: [],
    oiCandles: EMPTY_OI_CANDLE_BUNDLE,
  };
}

function assembleOneHourRoute(axisStepMs: number) {
  const route = resolveRouteWindow(NOW_MS, "1h");
  const window = { startMs: route.window.startMs, endMsExclusive: route.window.endMsExclusive };
  return assembleHistoryPage(
    emptyRows(),
    window,
    {
      priceUse: S2_PRICE_USE,
      windowEndMsExclusive: window.endMsExclusive,
      cvdAnchorMs: window.startMs,
      windowEndMsInclusive: route.windowEndMsInclusive,
      longShortRecentSpanMs: 3 * ONE_MINUTE_MS,
      oiMaxStalenessMs: null,
    },
    axisStepMs,
  );
}

test("MORDE D-A: the paginator's assembly of a 1h page puts the price panel on 168 slots, at 1h", () => {
  const assembly = assembleOneHourRoute(timeframeStepMs("1h"));
  assert.equal(assembly.panels.price.series.slots.length, 168);
  assert.equal(assembly.priceCandles.gridSlots, 168);
  // The same assembly at the step the defect used: 10.080 slots, 60 empty between two 1h candles.
  assert.equal(assembleOneHourRoute(ONE_MINUTE_MS).panels.price.series.slots.length, 10_080);
});
