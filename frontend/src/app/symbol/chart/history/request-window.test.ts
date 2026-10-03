// `SPEC-007` fatia `01`, second defect of `ACHADO-SERIES-HISTORY-SEM-PONTO.md` — the `web`
// half of the falsifier. The `charts` half (`src/charts/s2-window.test.ts`) proves the
// geometry of a trailing window; THIS file proves the thing that actually broke the screen:
// the route asked for `2026-08-20..08-24`, a window that PRECEDES every row `md.series` holds
// for `klines_volume` (`min(bucket_end) = 1788486120000`, 2026-09-04), so `/symbol` rendered
// nothing at all even with the route wired right.
//
// Nothing here touches Postgres or any HTTP surface (`[P-seed]`): the window is a pure
// function of one clock reading, which is the whole point — it can be falsified at every
// instant, not only on the four days somebody typed in once.
//
// Run with: npm --prefix frontend run test:app

import assert from "node:assert/strict";
import { test } from "node:test";

import { ONE_MINUTE_MS } from "../../../../charts/index.ts";
import { assertValidHistoryRequestKey, type HistoryRequestKey } from "../../../history-transport.ts";
import {
  KNOWLEDGE_TIME_LAG_MS,
  LIVE_PUBLICATION_LAG_MAX_MS,
  RIGHT_EDGE_LAG_MS,
  resolveRouteWindow,
} from "./request-window.ts";
import { SUPPORTED_TIMEFRAMES } from "../axis/supported-timeframes.ts";
import { TIMEFRAME_WINDOW_BARS } from "../axis/timeframe-window.ts";

/** The literal window the defect was made of — the negative control, and the ONLY place in
 * this tree those four days still appear as a hardcoded pair. */
const FROZEN_START_MS = Date.UTC(2026, 7, 20, 0, 0, 0);
const FROZEN_END_MS_EXCLUSIVE = Date.UTC(2026, 7, 24, 0, 0, 0);

/** The instant the defect was measured at (`ACHADO-SERIES-HISTORY-SEM-PONTO.md`, 11:58Z). */
const MEASURED_NOW_MS = Date.UTC(2026, 8, 11, 11, 58, 17);

/** ⛔ THIS CONSTANT IS NOT DECLARED HERE ANY MORE, and that is the point.
 *
 * It used to be `14_000` — the worst of THREE rows (10.434s / 12.034s / 13.591s,
 * `ACHADO-SERIES-HISTORY-SEM-PONTO.md`, n=3) — written out as a second literal next to the
 * constant it was supposed to hold to account. A test whose expected value is a copy of the
 * same sample the code was sized from PASSES BY CONSTRUCTION: it cannot fail unless someone
 * edits both, which is the definition of a test that measures nothing (`quant-architect`, wave
 * `03`, C2 item 3).
 *
 * Imported instead from the module under test, where it is `267_000` — the MAXIMUM of the live
 * class, `n=804` (`ACHADO-BACKFILL-INVISIVEL-AO-AS-OF.md`, SQL in the module docstring). That
 * makes the assertions below a real constraint on `KNOWLEDGE_TIME_LAG_MS`: at the old value of
 * `1 min` the first of them FAILS (120s of tolerance against a 267s tail), which is the
 * mutation that proves it bites. */
const MEASURED_PUBLICATION_LAG_MS = LIVE_PUBLICATION_LAG_MAX_MS;

test("REPRO: the frozen window misses the data, the derived window does not", () => {
  // The row that existed when the defect was measured (`event_time = 1789117860000`).
  const realRowEventTimeMs = 1789117860000;

  assert.ok(
    !(realRowEventTimeMs >= FROZEN_START_MS && realRowEventTimeMs < FROZEN_END_MS_EXCLUSIVE),
    "negative control: a real row of `klines_volume` is OUTSIDE the frozen window — the defect",
  );

  const resolved = resolveRouteWindow(realRowEventTimeMs + 30 * ONE_MINUTE_MS, "1m");
  assert.ok(
    realRowEventTimeMs >= resolved.window.startMs && realRowEventTimeMs < resolved.window.endMsExclusive,
    "the derived window must contain that same real row",
  );
});

test("the route's window TRACKS the clock — a replanted literal cannot pass this", () => {
  const first = resolveRouteWindow(MEASURED_NOW_MS, "1m");
  const second = resolveRouteWindow(MEASURED_NOW_MS + 7 * 24 * 60 * ONE_MINUTE_MS, "1m");

  assert.notEqual(first.window.startMs, second.window.startMs, "two clock readings a week apart, two windows");
  assert.notEqual(first.window.endMsExclusive, second.window.endMsExclusive);
  assert.notDeepEqual(first.window.days, second.window.days);
});

test("the route never asks for the future — every instant it sends is behind the clock reading", () => {
  const { window, knowledgeTimeMs, windowEndMsInclusive } = resolveRouteWindow(MEASURED_NOW_MS, "1m");

  assert.ok(window.endMsExclusive <= MEASURED_NOW_MS - RIGHT_EDGE_LAG_MS, "right edge is behind the lag");
  assert.ok(windowEndMsInclusive < window.endMsExclusive, "the inclusive end is a grid instant of the window");
  assert.ok(
    knowledgeTimeMs < MEASURED_NOW_MS,
    "knowledge_time_ms in the future is a 422 against the backend's own server_now_ms",
  );
});

test("the as-of margin covers the LIVE publication tail (n=804), not the n=3 sample it was sized from", () => {
  // `observed_at <= knowledge_time` (`as_of_accessor.py:310`) is the predicate this constant
  // moves. The bar the page reads out closes at `windowEndMsInclusive`, so the tolerance the
  // request grants it is `knowledgeTimeMs - windowEndMsInclusive`. Against `n=804` that has to
  // cover 267s; at the previous `KNOWLEDGE_TIME_LAG_MS = 1 min` it was 120s and did not.
  const { knowledgeTimeMs, windowEndMsInclusive } = resolveRouteWindow(MEASURED_NOW_MS, "1m");
  const toleranceMs = knowledgeTimeMs - windowEndMsInclusive;

  assert.ok(
    toleranceMs >= MEASURED_PUBLICATION_LAG_MS,
    `tolerance ${toleranceMs}ms must cover the worst live lag ${MEASURED_PUBLICATION_LAG_MS}ms (n=804)`,
  );
  assert.equal(toleranceMs, 300_000, "300s against 267s — the margin this request actually has, 1,12x");
});

test("MORDE: the as-of margin cannot be widened past the right-edge lag — that would ask about the present", () => {
  // The ceiling is structural, not stylistic: `knowledgeTimeMs = endMsExclusive + K` and
  // `endMsExclusive <= nowMs - RIGHT_EDGE_LAG_MS`, so `K >= RIGHT_EDGE_LAG_MS` puts the as-of
  // instant AT or AFTER the clock reading whenever that reading is already aligned — a `422`
  // against the backend's `server_now_ms`. This is why the `>= 300_000` the gate suggested was
  // not taken literally; `4 min` is the largest value that keeps the invariant with headroom.
  assert.ok(KNOWLEDGE_TIME_LAG_MS < RIGHT_EDGE_LAG_MS, "as-of margin must stay under the right-edge lag");

  // The worst case is a clock reading EXACTLY on the alignment boundary, where the floor takes
  // nothing away — the one instant a test picked at random would miss.
  const alignedNowMs = Date.UTC(2026, 8, 11, 12, 0, 0) + RIGHT_EDGE_LAG_MS;
  const { knowledgeTimeMs } = resolveRouteWindow(alignedNowMs, "1m");
  assert.ok(knowledgeTimeMs < alignedNowMs, "even at a perfectly aligned clock reading, the as-of stays in the past");
  assert.equal(alignedNowMs - knowledgeTimeMs, RIGHT_EDGE_LAG_MS - KNOWLEDGE_TIME_LAG_MS, "60s of skew headroom");
});

test("the derived window builds a request key the transport ACCEPTS", () => {
  const { window, knowledgeTimeMs, windowEndMsInclusive } = resolveRouteWindow(MEASURED_NOW_MS, "1m");
  const key: HistoryRequestKey = {
    series_key_id: "ef3033e6ad5a487330c9e669dd1ed3105a7a40ba274b78302b4d3eb624244e42",
    symbol: "BTCUSDT",
    interval: "1m",
    window_start_ms: window.startMs,
    window_end_ms: windowEndMsInclusive,
    knowledge_time_ms: knowledgeTimeMs,
    bar_policy: "final_only",
  };
  assert.doesNotThrow(() => assertValidHistoryRequestKey(key));
});

// ── `T-03.11` (`CST-226`) — the SELECTED TF widens `alignmentMs`; `T-05.1` — and sizes the span ─

test("T-05.1: the span is `initialBars` of the selected TF, and `1m` keeps the 4 days (5.760 bars) it had", () => {
  // `paineis-de-fluxo` `T-05.1` (`handoff/T-05.1-desenho.md` §2): the span used to be
  // `S2_WINDOW_SPAN_MS` (4 days) in every TF, so `1h` fetched 96 bars and `4h` 24. The interval is a
  // REQUIRED argument now — the one-minute default this function had is how that survived.
  for (const option of SUPPORTED_TIMEFRAMES) {
    const { window } = resolveRouteWindow(MEASURED_NOW_MS, option.interval);
    const bars = (window.endMsExclusive - window.startMs) / option.stepMs;
    assert.equal(bars, TIMEFRAME_WINDOW_BARS[option.interval]!.initialBars, `interval=${option.interval}`);
  }
  const oneMinute = resolveRouteWindow(MEASURED_NOW_MS, "1m").window;
  assert.equal(oneMinute.endMsExclusive - oneMinute.startMs, 4 * 24 * 60 * ONE_MINUTE_MS, "1m: unchanged, 4 days");
  const oneHour = resolveRouteWindow(MEASURED_NOW_MS, "1h").window;
  assert.equal(oneHour.endMsExclusive - oneHour.startMs, 7 * 24 * 60 * ONE_MINUTE_MS, "1h: 7 days, the owner's choice");
});

test("MORDE: an interval outside the served set is refused, never read as `1m`", () => {
  assert.throws(() => resolveRouteWindow(MEASURED_NOW_MS, "2h"), RangeError);
});

test("resolveRouteWindow never throws for any SUPPORTED_TIMEFRAMES member, and the right edge lands on ITS OWN boundary", () => {
  // `resolveTrailingWindow` refuses (`RangeError`) when `spanMs % alignmentMs !== 0` — this is
  // the guard that a TF whose span (`initialBars · step`, `timeframe-window.ts`) does not divide
  // into its alignment would trip. `timeframe-window.test.ts` checks the same property on the
  // table; this test is what would catch it through the route's own call.
  for (const option of SUPPORTED_TIMEFRAMES) {
    const { window } = resolveRouteWindow(MEASURED_NOW_MS, option.interval);
    assert.equal(
      window.endMsExclusive % option.stepMs,
      0,
      `interval=${option.interval}: the window's right edge must land on a ${option.interval} boundary`,
    );
  }
});

test("MORDE: the interval-aware alignment is load-bearing — a 5-minute-only floor lands on a DIFFERENT edge than a 4h-aware one", () => {
  // `MEASURED_NOW_MS` (2026-09-11 11:58:17.000Z) minus `RIGHT_EDGE_LAG_MS` (5 min) floors to a
  // 5-minute boundary that is NOT also a 4-hour boundary — the exact silent-truncation case the
  // module's own comment warned about (`quant-architect`, wave `03`, C1). If this assertion ever
  // fails because the two edges coincide, replace `MEASURED_NOW_MS` with an instant that does not
  // — a test that cannot tell the two code paths apart proves nothing about the fix.
  const fiveMinuteAware = resolveRouteWindow(MEASURED_NOW_MS, "1m"); // alignmentMs floors to FIVE_MINUTES_MS regardless
  const fourHourAware = resolveRouteWindow(MEASURED_NOW_MS, "4h");

  assert.notEqual(
    fiveMinuteAware.window.endMsExclusive,
    fourHourAware.window.endMsExclusive,
    "a 5-minute-only alignment and a 4h-aware one must disagree at this instant — otherwise T-03.11's " +
      "fix is a no-op that this test cannot distinguish from the pre-fix bug",
  );
  assert.equal(fourHourAware.window.endMsExclusive % (4 * 60 * 60_000), 0, "the 4h-aware edge lands on a 4h boundary");
  assert.notEqual(
    fiveMinuteAware.window.endMsExclusive % (4 * 60 * 60_000),
    0,
    "the 5-minute-only edge does NOT land on a 4h boundary — this is the outermost-bar truncation the rise fixes",
  );
});

test("the day list the route passes to `daysWithPresence` is the window's own, not a literal", () => {
  const { window } = resolveRouteWindow(MEASURED_NOW_MS, "1m");

  assert.ok(window.days.includes("2026-09-11"), "the day of the clock reading must be covered");
  assert.ok(!window.days.includes("2026-08-20"), "and the frozen literal's days must not be");
  for (const day of window.days) {
    const dayStart = Date.parse(`${day}T00:00:00Z`);
    assert.ok(
      dayStart + 24 * 60 * ONE_MINUTE_MS > window.startMs && dayStart < window.endMsExclusive,
      `day ${day} must actually intersect the window`,
    );
  }
});

// ── W1-FIX (`gates/W1-QA.md` BLOCKER-1): the predicate `e2e/18` branches on, proven exact ─────

test("W1-FIX: the 1m and 4h RIGHT EDGES coincide IFF the 1m edge (+1 min) is on a 4h boundary — 30 of 1440 minutes", () => {
  // `T-05.1`: only the right edge is compared — the spans differ since then (4 days at `1m`, 7 at
  // `4h`), and the right edge (`windowEndMsInclusive`) is what `e2e/18` branches on.
  const FOUR_HOURS_MS = 4 * 60 * ONE_MINUTE_MS;
  const dayStartMs = Date.UTC(2026, 8, 25, 0, 0, 0);
  let coincident = 0;
  for (let minute = 0; minute < 1440; minute += 1) {
    const nowMs = dayStartMs + minute * ONE_MINUTE_MS + 17_000; // off-grid second, like a real clock
    const oneMinute = resolveRouteWindow(nowMs, "1m");
    const fourHours = resolveRouteWindow(nowMs, "4h");
    const same = oneMinute.windowEndMsInclusive === fourHours.windowEndMsInclusive;
    const predicate = (oneMinute.windowEndMsInclusive + ONE_MINUTE_MS) % FOUR_HOURS_MS === 0;
    assert.equal(same, predicate, `minute ${minute}: identity ${same}, e2e/18 predicate ${predicate}`);
    if (same) {
      coincident += 1;
      const hhmm = new Date(nowMs).toISOString().slice(11, 16);
      assert.match(hhmm, /^(00|04|08|12|16|20):0[5-9]$/, `coincidence outside HH:05–HH:10 at ${hhmm}`);
    }
  }
  assert.equal(coincident, 30); // 6 boundaries x 5 minutes = 2,08 % of clock readings
});
