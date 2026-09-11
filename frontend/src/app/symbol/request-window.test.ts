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

import { ONE_MINUTE_MS } from "../../charts/index.ts";
import { assertValidHistoryRequestKey, type HistoryRequestKey } from "../history-transport.ts";
import {
  KNOWLEDGE_TIME_LAG_MS,
  LIVE_PUBLICATION_LAG_MAX_MS,
  RIGHT_EDGE_LAG_MS,
  resolveRouteWindow,
} from "./request-window.ts";

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

  const resolved = resolveRouteWindow(realRowEventTimeMs + 30 * ONE_MINUTE_MS);
  assert.ok(
    realRowEventTimeMs >= resolved.window.startMs && realRowEventTimeMs < resolved.window.endMsExclusive,
    "the derived window must contain that same real row",
  );
});

test("the route's window TRACKS the clock — a replanted literal cannot pass this", () => {
  const first = resolveRouteWindow(MEASURED_NOW_MS);
  const second = resolveRouteWindow(MEASURED_NOW_MS + 7 * 24 * 60 * ONE_MINUTE_MS);

  assert.notEqual(first.window.startMs, second.window.startMs, "two clock readings a week apart, two windows");
  assert.notEqual(first.window.endMsExclusive, second.window.endMsExclusive);
  assert.notDeepEqual(first.window.days, second.window.days);
});

test("the route never asks for the future — every instant it sends is behind the clock reading", () => {
  const { window, knowledgeTimeMs, windowEndMsInclusive } = resolveRouteWindow(MEASURED_NOW_MS);

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
  const { knowledgeTimeMs, windowEndMsInclusive } = resolveRouteWindow(MEASURED_NOW_MS);
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
  const { knowledgeTimeMs } = resolveRouteWindow(alignedNowMs);
  assert.ok(knowledgeTimeMs < alignedNowMs, "even at a perfectly aligned clock reading, the as-of stays in the past");
  assert.equal(alignedNowMs - knowledgeTimeMs, RIGHT_EDGE_LAG_MS - KNOWLEDGE_TIME_LAG_MS, "60s of skew headroom");
});

test("the derived window builds a request key the transport ACCEPTS", () => {
  const { window, knowledgeTimeMs, windowEndMsInclusive } = resolveRouteWindow(MEASURED_NOW_MS);
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

test("the day list the route passes to `daysWithPresence` is the window's own, not a literal", () => {
  const { window } = resolveRouteWindow(MEASURED_NOW_MS);

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
