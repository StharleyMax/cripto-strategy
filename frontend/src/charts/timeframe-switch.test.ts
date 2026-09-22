// Unit tests for `timeframe-switch.ts` (`T-02.3`, `D-C3.3`, `CA-5d`). No `jsdom`, no
// `lightweight-charts` — same purity discipline as `time-axis-controller.test.ts` and
// `range-dispatch.test.ts`.
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { anchorTimeframeSwitch } from "./timeframe-switch.ts";
import { fromLogicalRange, toLogicalRange } from "./time-axis-controller.ts";
import type { TimeAxis, TimeRange } from "./time-axis-controller.ts";

const THIS_FILE = fileURLToPath(import.meta.url);
const SOURCE_FILE = path.join(path.dirname(THIS_FILE), "timeframe-switch.ts");

test("PURITY (D-C3.3 boundary): the module CODE names neither IChartApi, fetch, nor lightweight-charts", () => {
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
});

const ONE_MINUTE_MS = 60_000;
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

test("anchorTimeframeSwitch preserves the right-edge instant exactly", () => {
  const current: TimeRange = { fromMs: 200_000_000, toMs: 200_000_000 + 500 * ONE_MINUTE_MS };
  const newAxis: TimeAxis = { startMs: 0, stepMs: FOUR_HOURS_MS, slotCount: 2_000 };
  const anchored = anchorTimeframeSwitch(current, 500, newAxis);
  assert.equal(anchored.toMs, current.toMs, "right-edge instant must be preserved exactly");
});

test("anchorTimeframeSwitch sizes the window to barCount bars of the NEW axis, never the old spanMs", () => {
  const current: TimeRange = { fromMs: 0, toMs: 500 * ONE_MINUTE_MS }; // 8,3h span in 1m
  const newAxis: TimeAxis = { startMs: 0, stepMs: FOUR_HOURS_MS, slotCount: 2_000 };
  const anchored = anchorTimeframeSwitch(current, 500, newAxis);
  const newSpanMs = anchored.toMs - anchored.fromMs;
  assert.equal(newSpanMs, 500 * FOUR_HOURS_MS, "span must be barCount * newAxis.stepMs");
  assert.notEqual(
    newSpanMs,
    current.toMs - current.fromMs,
    "preserving the OLD span would show 498 empty 4h candles — the alternative D-C3.3 ruled out",
  );
});

test("anchorTimeframeSwitch rejects a non-positive barCount or newAxis.stepMs", () => {
  const newAxis: TimeAxis = { startMs: 0, stepMs: FOUR_HOURS_MS, slotCount: 10 };
  assert.throws(() => anchorTimeframeSwitch({ fromMs: 0, toMs: 1 }, 0, newAxis), RangeError);
  assert.throws(() => anchorTimeframeSwitch({ fromMs: 0, toMs: 1 }, -5, newAxis), RangeError);
  assert.throws(
    () => anchorTimeframeSwitch({ fromMs: 0, toMs: 1 }, 500, { startMs: 0, stepMs: 0, slotCount: 1 }),
    RangeError,
  );
});

test("anchorTimeframeSwitch ignores currentRange.fromMs entirely — only the right edge and barCount matter", () => {
  const newAxis: TimeAxis = { startMs: 0, stepMs: FOUR_HOURS_MS, slotCount: 2_000 };
  const sameToDifferentFrom1: TimeRange = { fromMs: 0, toMs: 1_000_000 };
  const sameToDifferentFrom2: TimeRange = { fromMs: -999_999, toMs: 1_000_000 };
  assert.deepEqual(
    anchorTimeframeSwitch(sameToDifferentFrom1, 500, newAxis),
    anchorTimeframeSwitch(sameToDifferentFrom2, 500, newAxis),
  );
});

// --- CA-5d --------------------------------------------------------------------------------

test("CA-5d: reconverting through TIME keeps the error at 0 (< 1 bucket); reusing the RAW logical index does not", () => {
  // Reproduces the DEFECT CLASS `D-C3.3` measured (`325,3 h` vs `2,7 h`,
  // `JULGAMENTO-FRONTEND-ARCHITECT.md:229-231`) using this module's own axes. The exact
  // numbers differ from the architect's probe — that one crosses the REAL library's own
  // fractional-logical-index rendering at `setVisibleLogicalRange` time, which is out of
  // reach for a `jsdom`-free, `lightweight-charts`-free module by construction (`D-C3.1`) —
  // but the SAME two properties hold: raw logical-index reuse across axes with a different
  // `stepMs` blows up (proportional to the `stepMs` ratio, here 240x for `1m -> 4h`, same as
  // the judgment's axes), and the time-preserving path stays inside 1 bucket of the new TF.
  const oldAxis: TimeAxis = { startMs: 0, stepMs: ONE_MINUTE_MS, slotCount: 130_000 };
  // A window far from epoch, 500 bars (8,3h) wide — same shape as the judgment's example.
  const target: TimeRange = {
    fromMs: 100_000 * ONE_MINUTE_MS,
    toMs: (100_000 + 500) * ONE_MINUTE_MS,
  };
  const oldLogical = toLogicalRange(target, oldAxis);

  const newAxis: TimeAxis = { startMs: 0, stepMs: FOUR_HOURS_MS, slotCount: 5_000 };
  const newBucketHours = FOUR_HOURS_MS / (60 * 60 * 1000);

  // WRONG — D-C3.3's ruled-out path: the SAME logical index, reused verbatim as a logical
  // index on the new axis, skipping the instant conversion entirely.
  const wrongRange = fromLogicalRange(oldLogical, newAxis);
  const wrongErrorHours = Math.abs(wrongRange.toMs - target.toMs) / (60 * 60 * 1000);

  // RIGHT — because the registered state is ALWAYS an instant (`T-02.2`'s `D-C3.3`
  // decision), "converting" across a TF switch is just reading `target` again against
  // `newAxis` — no reuse of the old logical index at all.
  const rightLogical = toLogicalRange(target, newAxis);
  const rightRange = fromLogicalRange(rightLogical, newAxis);
  const rightErrorHours = Math.abs(rightRange.toMs - target.toMs) / (60 * 60 * 1000);

  assert.ok(
    wrongErrorHours > newBucketHours,
    `sanity: the ruled-out raw-logical-reuse path must exceed 1 bucket (got ${wrongErrorHours}h) — same defect class as the measured 325,3h`,
  );
  assert.ok(
    rightErrorHours < newBucketHours,
    `CA-5d: the time-preserving path must stay under 1 bucket of the new TF (${newBucketHours}h), got ${rightErrorHours}h`,
  );
  assert.ok(
    rightErrorHours < 1e-6,
    "this module's own arithmetic round-trips exactly (T-02.2's no-rounding decision); " +
      "the 2,7h residual JULGAMENTO measured belongs to the real library's fractional-index " +
      "rendering at apply time, out of this pure module's scope",
  );
});
