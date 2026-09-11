// `SPEC-007` fatia `01`, second defect of `ACHADO-SERIES-HISTORY-SEM-PONTO.md` — the window
// the `/symbol` route asked for was FOUR HARDCODED DAYS (`2026-08-20..08-23`, `s2-panels.ts:43`)
// while `klines_volume` only exists from `2026-09-04` on
// (`min(bucket_end) = 1788486120000`, `md.series`) => the route asked for a window that
// PRECEDES every row that exists, and the screen stayed empty even with the route wired right.
//
// This file is the `charts` half of the falsifier: a window is GEOMETRY (`ADR-003` FR-1,
// "série→geometria é `charts`"), so the derivation lives here, pure, and `web` only supplies
// the clock reading. The `web` half — that the route actually ASKS for the derived window —
// is `src/app/symbol/request-window.test.ts`.
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { test } from "node:test";

import { ONE_DAY_MS, S2_WINDOW_SPAN_MS, lastGridInstant, resolveTrailingWindow, utcDaysCovered } from "./s2-window.ts";
import { FIVE_MINUTES_MS, ONE_MINUTE_MS } from "./s2-panels.ts";

/** The literal window this defect was made of — kept here, and ONLY here, as the negative
 * control. Not exported: no production module can reach it. */
const FROZEN_START_MS = Date.UTC(2026, 7, 20, 0, 0, 0);
const FROZEN_END_MS_EXCLUSIVE = Date.UTC(2026, 7, 24, 0, 0, 0);

/** The instant the defect was measured at (`ACHADO-SERIES-HISTORY-SEM-PONTO.md`, 11:58Z). */
const MEASURED_NOW_MS = Date.UTC(2026, 8, 11, 11, 58, 17);

function trailing(nowMs: number, spanMs: number = S2_WINDOW_SPAN_MS): ReturnType<typeof resolveTrailingWindow> {
  return resolveTrailingWindow({ nowMs, lagMs: FIVE_MINUTES_MS, spanMs, alignmentMs: FIVE_MINUTES_MS });
}

test("MORDE (negative control): the frozen 4-day literal does NOT contain a recent instant — that IS the defect", () => {
  // Every row `md.series` holds for `klines_volume` is newer than `FROZEN_END_MS_EXCLUSIVE`
  // (`min(bucket_end) = 1788486120000`, 2026-09-04), which is why `/symbol` rendered nothing.
  assert.ok(
    !(MEASURED_NOW_MS >= FROZEN_START_MS && MEASURED_NOW_MS < FROZEN_END_MS_EXCLUSIVE),
    "if this ever passes, the negative control stopped describing the defect",
  );
  assert.ok(FROZEN_END_MS_EXCLUSIVE < 1788486120000, "the frozen window ends before the first row that exists");
});

test("resolveTrailingWindow: the window ends near the clock reading, never in the future", () => {
  const window = trailing(MEASURED_NOW_MS);

  assert.ok(window.endMsExclusive <= MEASURED_NOW_MS - FIVE_MINUTES_MS, "the right edge stays behind the lag");
  assert.ok(
    MEASURED_NOW_MS - window.endMsExclusive < 2 * FIVE_MINUTES_MS,
    "and never falls further behind than lag + one alignment bucket",
  );
  assert.equal(window.endMsExclusive % FIVE_MINUTES_MS, 0, "the right edge lands on a bucket boundary");
  assert.equal(window.startMs % FIVE_MINUTES_MS, 0, "so does the left edge");
  assert.equal(window.endMsExclusive - window.startMs, S2_WINDOW_SPAN_MS, "the span is exact");
});

test("resolveTrailingWindow: CONTAINS the recent past — the property the frozen literal violated", () => {
  const window = trailing(MEASURED_NOW_MS);

  // 20 minutes old is comfortably published (`available_at - event_time` measured at
  // 10.4s / 12.0s / 13.6s, n=3, `ACHADO-SERIES-HISTORY-SEM-PONTO.md`).
  const twentyMinutesAgo = MEASURED_NOW_MS - 20 * ONE_MINUTE_MS;
  assert.ok(
    twentyMinutesAgo >= window.startMs && twentyMinutesAgo < window.endMsExclusive,
    "a 20-minute-old instant must be inside the window the route asks for",
  );
});

test("resolveTrailingWindow: TRACKS the clock — two readings a week apart give two different windows", () => {
  const first = trailing(Date.UTC(2026, 8, 11, 12, 0, 0));
  const second = trailing(Date.UTC(2026, 8, 18, 12, 0, 0));

  assert.equal(second.startMs - first.startMs, 7 * ONE_DAY_MS, "the window moves with the clock");
  assert.notDeepEqual(second.days, first.days, "and so does the day list derived from it");
});

test("resolveTrailingWindow: `days` is DERIVED from the window, never a literal list", () => {
  const window = trailing(MEASURED_NOW_MS);

  // Independent witness: recomputed from the window's own edges, not copied from the
  // implementation — every UTC date a row of `[startMs, endMsExclusive)` can fall on.
  const expected: string[] = [];
  for (
    let dayStart = Math.floor(window.startMs / ONE_DAY_MS) * ONE_DAY_MS;
    dayStart < window.endMsExclusive;
    dayStart += ONE_DAY_MS
  ) {
    expected.push(new Date(dayStart).toISOString().slice(0, 10));
  }
  assert.deepEqual(window.days, expected);
  assert.equal(window.days.length, 5, "a 4-day trailing window that starts mid-day touches 5 UTC dates");
});

test("utcDaysCovered: a window fully inside one UTC date yields exactly that date", () => {
  const start = Date.UTC(2026, 8, 11, 3, 0, 0);
  assert.deepEqual(utcDaysCovered(start, start + 120 * ONE_MINUTE_MS), ["2026-09-11"]);
});

test("utcDaysCovered: the EXCLUSIVE end does not drag in the next date", () => {
  assert.deepEqual(utcDaysCovered(Date.UTC(2026, 8, 10, 23, 0, 0), Date.UTC(2026, 8, 11, 0, 0, 0)), ["2026-09-10"]);
});

test("resolveTrailingWindow REFUSES a span that is not a whole number of alignment buckets", () => {
  assert.throws(() => trailing(Date.UTC(2026, 8, 11, 12, 0, 0), S2_WINDOW_SPAN_MS + 1), { name: "RangeError" });
});

test("resolveTrailingWindow REFUSES a non-finite clock reading instead of producing a NaN window", () => {
  assert.throws(() => trailing(Number.NaN), { name: "RangeError" });
});

test("S2_WINDOW_SPAN_MS is the 4 days `PRD-006 §2`/item `5.1` names — the SPAN survived, only WHICH days changed", () => {
  // ⚠️ The citation, not the number, is what changed here: this test and the module docstring
  // both used to attribute the span to `ADR-034/D8`, which is the `charts`↔`web` BOUNDARY
  // (`ADR-034:177`). The span is `PRD-006 §2`/item `5.1`, quoted inside `ADR-034:127` ("4 dias,
  // painéis Preço+OI+CVD"). A wrong citation is a broken audit trail, and it cost the
  // `quant-architect` gate of wave `03` (C4) a lookup to find out.
  assert.equal(S2_WINDOW_SPAN_MS, 4 * ONE_DAY_MS);
  assert.equal(FROZEN_END_MS_EXCLUSIVE - FROZEN_START_MS, S2_WINDOW_SPAN_MS);
});

// ── `lastGridInstant` (wave `03`, C3) ───────────────────────────────────────────────────────
//
// The half-open→inclusive conversion `window_end_ms` needs, brought back into `charts` from the
// TWO copies of `endMsExclusive - ONE_MINUTE_MS` that had grown under `src/app/symbol/`
// (`ADR-003` FR-2: "web não calcula geometria … impede a segunda implementação da grade").

test("lastGridInstant: the last instant is a function of the PAIR (window, grid), not of the window alone", () => {
  const window = trailing(MEASURED_NOW_MS);

  // THE FALSIFIER FOR THE REJECTED DESIGN: an `endMsInclusive` FIELD on `S2Window` could only
  // be derived from `alignmentMs` (5 min here), so it would answer the 5-minute instant for a
  // route that queries at `1m` — a request that stays valid and comes back FOUR MINUTES SHORT.
  // These two values differing by exactly that much is why the field was refused.
  assert.equal(lastGridInstant(window, ONE_MINUTE_MS), window.endMsExclusive - ONE_MINUTE_MS);
  assert.equal(lastGridInstant(window, FIVE_MINUTES_MS), window.endMsExclusive - FIVE_MINUTES_MS);
  assert.equal(
    lastGridInstant(window, FIVE_MINUTES_MS) + 4 * ONE_MINUTE_MS,
    lastGridInstant(window, ONE_MINUTE_MS),
    "the two answers differ by 4 minutes — the silent shortfall a single field would have shipped",
  );
});

test("lastGridInstant: the answer is INSIDE the window and on the grid, at every clock reading", () => {
  for (let minute = 0; minute < 240; minute += 7) {
    const window = trailing(MEASURED_NOW_MS + minute * ONE_MINUTE_MS);
    const instant = lastGridInstant(window, ONE_MINUTE_MS);
    assert.ok(instant >= window.startMs && instant < window.endMsExclusive, `instant outside the window at +${minute}m`);
    assert.equal((instant - window.startMs) % ONE_MINUTE_MS, 0, `instant off the grid at +${minute}m`);
  }
});

test("lastGridInstant REFUSES a grid that does not divide the window instead of answering off-grid", () => {
  const window = trailing(MEASURED_NOW_MS);
  // 7 minutes does not divide 4 days: there IS no last instant of this window on that grid, and
  // answering with one off it is exactly the tela-vs-motor disagreement FR-2 forbids. Same
  // posture as `resolveTrailingWindow`'s `spanMs % alignmentMs` — refuse, never re-floor.
  assert.throws(() => lastGridInstant(window, 7 * ONE_MINUTE_MS), { name: "RangeError" });
  assert.throws(() => lastGridInstant(window, 0), { name: "RangeError" });
  assert.throws(() => lastGridInstant(window, -ONE_MINUTE_MS), { name: "RangeError" });
  assert.throws(() => lastGridInstant(window, Number.NaN), { name: "RangeError" });
  assert.throws(
    () => lastGridInstant({ startMs: 10, endMsExclusive: 10, days: [] }, ONE_MINUTE_MS),
    { name: "RangeError" },
    "an empty window has no last instant either",
  );
});
