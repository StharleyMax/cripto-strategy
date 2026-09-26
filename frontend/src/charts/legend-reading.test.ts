// `T-01.4` (`paineis-de-fluxo`, plan `01` item `1.6`, pure half): the legend reading of a pane,
// `(param.logical, slots, nature) -> value | held | forming | absent` (`RF-4`, `RN-4`,
// `ADR-044/D2`, `ADR-026`).
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  lastClosedSlotIndex,
  LegendNatureNotCoveredError,
  resolveLegendReading,
} from "./legend-reading.ts";
import type { LegendReading, LegendReadingInput, ReadingNature } from "./legend-reading.ts";
import type { ScalarSlot } from "./s2-scalar-grid.ts";

const ONE_MINUTE_MS = 60_000;
const FIVE_MINUTES_MS = 5 * ONE_MINUTE_MS;
const FOUR_HOURS_MS = 4 * 60 * ONE_MINUTE_MS;

/** 2026-08-23T08:00:00Z — aligned to 1m, 5m and 4h. */
const T0 = Date.UTC(2026, 7, 23, 8, 0, 0);

function grid(values: readonly (number | null)[], stepMs = ONE_MINUTE_MS, startMs = T0): readonly ScalarSlot[] {
  return values.map((value, index) => ({ time: startMs + index * stepMs, value }));
}

/** An instant where every slot of `slots` has closed — so nothing is forming. */
function afterAll(slots: readonly ScalarSlot[], stepMs = ONE_MINUTE_MS): number {
  return slots[slots.length - 1].time + stepMs;
}

function read(overrides: Partial<LegendReadingInput> & Pick<LegendReadingInput, "slots" | "nature">): LegendReading {
  return resolveLegendReading({
    logical: undefined,
    axisStepMs: ONE_MINUTE_MS,
    nativeTimeframeMs: ONE_MINUTE_MS,
    ...overrides,
    asOfMs: overrides.asOfMs ?? afterAll(overrides.slots, overrides.axisStepMs ?? ONE_MINUTE_MS),
  });
}

function assertAbsent(reading: LegendReading, slotIndex: number | null): void {
  assert.equal(reading.kind, "absent", `expected absent, got ${JSON.stringify(reading)}`);
  assert.equal(reading.slotIndex, slotIndex);
  // RN-4: the absent shape has no number to show — not `0`, not `null`, no field at all.
  assert.equal("value" in reading, false, `an absent reading carries a value: ${JSON.stringify(reading)}`);
  assert.equal("valueSoFar" in reading, false);
}

// ── FLOW: the bucket's own value; absent is absent, never 0 ───────────────────────────────────

test("FLOW: the crosshair reads the slot at param.logical", () => {
  const slots = grid([10, 20, 30, 40]);
  const reading = read({ slots, nature: "FLOW", logical: 2 });
  assert.deepEqual(reading, {
    kind: "value",
    source: "crosshair",
    slotIndex: 2,
    bucketStartMs: T0 + 2 * ONE_MINUTE_MS,
    observedBucketStartMs: T0 + 2 * ONE_MINUTE_MS,
    observedCloseMs: T0 + 3 * ONE_MINUTE_MS,
    value: 30,
  });
});

test("FLOW: a measured 0 is a datum — it reads as value 0, not as absent", () => {
  const reading = read({ slots: grid([5, 0, 7]), nature: "FLOW", logical: 1 });
  assert.equal(reading.kind, "value");
  assert.equal(reading.kind === "value" ? reading.value : Number.NaN, 0);
});

test("FLOW: an absent slot reads ABSENT, never 0, and neither neighbour lends its value", () => {
  const reading = read({ slots: grid([5, null, 7]), nature: "FLOW", logical: 1 });
  assertAbsent(reading, 1);
  assert.equal(reading.bucketStartMs, T0 + ONE_MINUTE_MS);
});

// ── RATIO: same rule as FLOW (the server never carries a ratio forward) ───────────────────────

test("RATIO: the crosshair reads the bucket's own ratio", () => {
  const reading = read({ slots: grid([1.2, 0.8, 1.05]), nature: "RATIO", logical: 2 });
  assert.equal(reading.kind, "value");
  assert.equal(reading.kind === "value" ? reading.value : Number.NaN, 1.05);
});

test("RATIO: an absent slot between two present ones is absent — no hold, no interpolation", () => {
  assertAbsent(read({ slots: grid([1.2, null, 1.05]), nature: "RATIO", logical: 1 }), 1);
});

// ── STOCK: the existing held rule (resolveStockReading), capped at one native bucket ──────────

// OI at a 5-minute native cadence on the 1-minute axis: values only on the native starts.
//   index:  0   1    2    3    4    5    6    7    8    9   10 ... 14   15
//   time :  :00 :01  :02  :03  :04  :05  :06  :07  :08  :09  :10 ... :14  :15
const OI_VALUES: readonly (number | null)[] = [
  100, null, null, null, null, // native bucket :00 — observed
  null, null, null, null, null, // native bucket :05 — NOT observed
  null, null, null, null, null, // native bucket :10 — not observed either (a 2nd consecutive gap)
  130, // native bucket :15 — observed
];

function readOi(logical: number | undefined, asOfMs?: number): LegendReading {
  const slots = grid(OI_VALUES);
  return read({
    slots,
    nature: "STOCK",
    logical,
    nativeTimeframeMs: FIVE_MINUTES_MS,
    asOfMs: asOfMs ?? T0 + 20 * ONE_MINUTE_MS,
  });
}

test("STOCK: on the native bucket start the reading is the exact value", () => {
  const reading = readOi(0);
  assert.equal(reading.kind, "value");
  assert.equal(reading.kind === "value" ? reading.value : Number.NaN, 100);
  assert.equal(reading.kind === "value" ? reading.observedCloseMs : Number.NaN, T0 + FIVE_MINUTES_MS);
});

test("STOCK: inside its own native bucket the value is HELD, with its age", () => {
  const reading = readOi(3);
  assert.equal(reading.kind, "held", JSON.stringify(reading));
  if (reading.kind !== "held") return;
  assert.equal(reading.value, 100);
  assert.equal(reading.staleMinutes, 3);
  assert.equal(reading.observedBucketStartMs, T0);
  assert.equal(reading.bucketStartMs, T0 + 3 * ONE_MINUTE_MS);
});

test("STOCK: the hold reaches ONE native bucket back when the slot's own native bucket is empty", () => {
  const reading = readOi(7);
  assert.equal(reading.kind, "held", JSON.stringify(reading));
  if (reading.kind !== "held") return;
  assert.equal(reading.value, 100);
  assert.equal(reading.staleMinutes, 7);
});

test("STOCK: two native buckets back is past the cap — ABSENT, never held for longer", () => {
  assertAbsent(readOi(12), 12);
});

// ── without a crosshair: the last CLOSED bucket ───────────────────────────────────────────────

test("no crosshair: reads the last CLOSED bucket, not the one in formation", () => {
  // asOf sits inside the bucket of index 4: indices 0..3 closed, index 4 forming.
  const slots = grid([10, 20, 30, 40, 50]);
  const asOfMs = T0 + 4 * ONE_MINUTE_MS + 30_000;
  const reading = read({ slots, nature: "FLOW", logical: undefined, asOfMs });
  assert.equal(reading.kind, "value", JSON.stringify(reading));
  assert.equal(reading.source, "last_closed");
  assert.equal(reading.slotIndex, 3);
  assert.equal(reading.kind === "value" ? reading.value : Number.NaN, 40);
});

test("no crosshair: when every slot has closed, the last slot is the last closed", () => {
  const slots = grid([10, 20, 30]);
  const reading = read({ slots, nature: "FLOW", logical: undefined, asOfMs: afterAll(slots) });
  assert.equal(reading.slotIndex, 2);
  assert.equal(reading.kind === "value" ? reading.value : Number.NaN, 30);
});

test("no crosshair: a bucket closes exactly at its close instant (`<=`), not one ms later", () => {
  const slots = grid([10, 20, 30]);
  assert.equal(lastClosedSlotIndex(slots, ONE_MINUTE_MS, T0 + 3 * ONE_MINUTE_MS), 2);
  assert.equal(lastClosedSlotIndex(slots, ONE_MINUTE_MS, T0 + 3 * ONE_MINUTE_MS - 1), 1);
});

test("no crosshair: an ABSENT last closed bucket reads absent — it does not walk back to an older number", () => {
  const slots = grid([10, 20, null, 99]);
  const asOfMs = T0 + 3 * ONE_MINUTE_MS + 1; // index 2 closed, index 3 forming
  assertAbsent(read({ slots, nature: "FLOW", logical: undefined, asOfMs }), 2);
});

test("no crosshair: before any bucket has closed there is nothing to read — absent, no slot", () => {
  const slots = grid([10]);
  const reading = read({ slots, nature: "FLOW", logical: undefined, asOfMs: T0 + 1 });
  assertAbsent(reading, null);
  assert.equal(reading.bucketStartMs, null);
  assert.equal(reading.source, "last_closed");
});

test("an empty grid reads absent with and without a crosshair", () => {
  assertAbsent(read({ slots: [], nature: "FLOW", logical: undefined, asOfMs: T0 }), null);
  assertAbsent(read({ slots: [], nature: "STOCK", logical: 0, asOfMs: T0 }), null);
});

// ── the bucket in formation: only ever with its mark ──────────────────────────────────────────

test("the crosshair on the bucket in formation reads FORMING, with valueSoFar and no `value`", () => {
  const slots = grid([10, 20, 30, 40, 50]);
  const asOfMs = T0 + 4 * ONE_MINUTE_MS + 30_000;
  const reading = read({ slots, nature: "FLOW", logical: 4, asOfMs });
  assert.equal(reading.kind, "forming", JSON.stringify(reading));
  assert.equal("value" in reading, false, "a forming reading must not expose its number as `value`");
  if (reading.kind !== "forming") return;
  assert.equal(reading.valueSoFar, 50);
  assert.equal(reading.staleMinutes, 0);
  // Compile-time half of the barrier (`ADR-026/D3`): the unnarrowed union has no `value` to read.
  // @ts-expect-error — `value` does not exist on `LegendFormingReading`.
  assert.equal(reading.value, undefined);
});

test("the crosshair on an ABSENT bucket in formation reads absent — absence wins over the mark", () => {
  const slots = grid([10, 20, null]);
  assertAbsent(read({ slots, nature: "FLOW", logical: 2, asOfMs: T0 + 2 * ONE_MINUTE_MS + 1 }), 2);
});

test("STOCK held from a native bucket that has not closed is FORMING, even on a closed axis bucket", () => {
  // asOf 10:02:30 — axis bucket :01 closed at :02, but the 5m OI bucket of :00 closes only at :05.
  const asOfMs = T0 + 2 * ONE_MINUTE_MS + 30_000;
  const reading = readOi(undefined, asOfMs);
  assert.equal(reading.kind, "forming", JSON.stringify(reading));
  if (reading.kind !== "forming") return;
  assert.equal(reading.slotIndex, 1);
  assert.equal(reading.valueSoFar, 100);
  assert.equal(reading.staleMinutes, 1);
  assert.equal(reading.observedCloseMs, T0 + FIVE_MINUTES_MS);
});

// ── the crosshair index ───────────────────────────────────────────────────────────────────────

test("a crosshair off the grid (left or right of the data) reads absent with no slot", () => {
  const slots = grid([10, 20, 30]);
  assertAbsent(read({ slots, nature: "FLOW", logical: -1 }), null);
  assertAbsent(read({ slots, nature: "FLOW", logical: 3 }), null);
});

test("a fractional logical index rounds to the nearest bar (bar i spans [i-0.5, i+0.5))", () => {
  const slots = grid([10, 20, 30]);
  assert.equal(read({ slots, nature: "FLOW", logical: 1.4 }).slotIndex, 1);
  assert.equal(read({ slots, nature: "FLOW", logical: 1.5 }).slotIndex, 2);
  assert.equal(read({ slots, nature: "FLOW", logical: -0.4 }).slotIndex, 0);
});

test("a non-finite logical index is a contract violation, not an absent reading", () => {
  assert.throws(() => read({ slots: grid([1]), nature: "FLOW", logical: Number.NaN }), RangeError);
});

// ── the axis coarser than the native cadence ──────────────────────────────────────────────────

test("a 5m STOCK served on a 4h axis reads on the axis cadence — no off-grid hold lookup", () => {
  const slots = grid([100, null, 300], FOUR_HOURS_MS);
  const base = { slots, nature: "STOCK" as const, axisStepMs: FOUR_HOURS_MS, nativeTimeframeMs: FIVE_MINUTES_MS };
  const exact = read({ ...base, logical: 2 });
  assert.equal(exact.kind, "value");
  assert.equal(exact.kind === "value" ? exact.observedCloseMs : Number.NaN, T0 + 3 * FOUR_HOURS_MS);
  const held = read({ ...base, logical: 1 });
  assert.equal(held.kind, "held", JSON.stringify(held));
  assert.equal(held.kind === "held" ? held.staleMinutes : Number.NaN, 240);
});

// ── W1-FIX (`gates/W1-DESIGN-REVIEW.md` MF-B): a 4h bar served on the 1m grid ────────────────

/** Two `4h` bars on the `1m` grid: a point on the OPEN slot of each bar (0 and 240), the other
 * 478 minutes empty — exactly what the page feeds the legend after a click on `4h`. */
const FOUR_H_SLOTS = 2 * 240;
function fourHourBarsOnMinuteGrid(first: number, second: number): readonly ScalarSlot[] {
  return grid(Array.from({ length: FOUR_H_SLOTS }, (_, index) => (index === 0 ? first : index === 240 ? second : null)));
}
const FOUR_H_BASE = { axisStepMs: ONE_MINUTE_MS, nativeTimeframeMs: ONE_MINUTE_MS } as const;

test("MF-B MORDE: without bucketMs, a 4h bar on the 1m grid reads ABSENT at rest — the defect, kept measured", () => {
  const slots = fourHourBarsOnMinuteGrid(84_000, 84_100);
  for (const nature of ["STOCK", "FLOW"] as const) {
    assertAbsent(read({ ...FOUR_H_BASE, slots, nature, asOfMs: T0 + 2 * FOUR_HOURS_MS }), FOUR_H_SLOTS - 1);
  }
});

test("MF-B CALA: with bucketMs = 4h, at rest the legend reads the LAST CLOSED BAR, on its open slot", () => {
  const slots = fourHourBarsOnMinuteGrid(84_000, 84_100);
  for (const nature of ["STOCK", "FLOW", "RATIO"] as const) {
    const reading = read({ ...FOUR_H_BASE, slots, nature, bucketMs: FOUR_HOURS_MS, asOfMs: T0 + 2 * FOUR_HOURS_MS });
    assert.equal(reading.kind, "value", `${nature}: ${JSON.stringify(reading)}`);
    assert.equal(reading.kind === "value" ? reading.value : Number.NaN, 84_100);
    assert.equal(reading.slotIndex, 240);
    assert.equal(reading.bucketStartMs, T0 + FOUR_HOURS_MS);
    assert.equal(reading.kind === "value" ? reading.observedCloseMs : Number.NaN, T0 + 2 * FOUR_HOURS_MS);
  }
});

test("MF-B CALA: under the crosshair, ANY minute inside a bar reads that bar's value", () => {
  const slots = fourHourBarsOnMinuteGrid(84_000, 84_100);
  const asOfMs = T0 + 2 * FOUR_HOURS_MS;
  for (const [logical, expected, openIndex] of [
    [0, 84_000, 0],
    [1, 84_000, 0],
    [239, 84_000, 0],
    [240, 84_100, 240],
    [241, 84_100, 240],
    [479, 84_100, 240],
  ] as const) {
    const reading = read({ ...FOUR_H_BASE, slots, nature: "FLOW", bucketMs: FOUR_HOURS_MS, asOfMs, logical });
    assert.equal(reading.kind, "value", `logical ${logical}: ${JSON.stringify(reading)}`);
    assert.equal(reading.kind === "value" ? reading.value : Number.NaN, expected);
    assert.equal(reading.slotIndex, openIndex);
  }
});

test("MF-B: mid-bar, at rest reads the previous (closed) bar, and the crosshair on the open bar reads FORMING", () => {
  const slots = fourHourBarsOnMinuteGrid(84_000, 84_100);
  const asOfMs = T0 + FOUR_HOURS_MS + 60 * ONE_MINUTE_MS;
  const rest = read({ ...FOUR_H_BASE, slots, nature: "FLOW", bucketMs: FOUR_HOURS_MS, asOfMs });
  assert.equal(rest.kind === "value" ? rest.value : Number.NaN, 84_000, JSON.stringify(rest));
  const forming = read({ ...FOUR_H_BASE, slots, nature: "FLOW", bucketMs: FOUR_HOURS_MS, asOfMs, logical: 250 });
  assert.equal(forming.kind, "forming", JSON.stringify(forming));
});

test("MF-B: an absent bar reads absent on its open slot, and a bar whose open is before the grid reads absent with no slot", () => {
  const slots = fourHourBarsOnMinuteGrid(84_000, Number.NaN).map((slot, index) => (index === 240 ? { ...slot, value: null } : slot));
  assertAbsent(read({ ...FOUR_H_BASE, slots, nature: "FLOW", bucketMs: FOUR_HOURS_MS, logical: 300 }), 240);
  const late = grid(Array.from({ length: 300 }, () => 1), ONE_MINUTE_MS, T0 + 60 * ONE_MINUTE_MS);
  assertAbsent(read({ ...FOUR_H_BASE, slots: late, nature: "FLOW", bucketMs: FOUR_HOURS_MS, logical: 10 }), null);
});

test("MF-B: bucketMs must be a whole number of axis steps", () => {
  const slots = fourHourBarsOnMinuteGrid(1, 2);
  assert.throws(() => read({ ...FOUR_H_BASE, slots, nature: "FLOW", bucketMs: 90_000 }), RangeError);
  assert.throws(() => read({ ...FOUR_H_BASE, slots, nature: "FLOW", bucketMs: 0 }), RangeError);
});

// ── what is not read ──────────────────────────────────────────────────────────────────────────

test("EVENT and TICK have no legend rule — high failure, never a guessed reading", () => {
  for (const nature of ["EVENT", "TICK"] as const satisfies readonly ReadingNature[]) {
    assert.throws(() => read({ slots: grid([1]), nature, logical: 0 }), LegendNatureNotCoveredError);
  }
});

test("invalid steps and instants are refused", () => {
  const slots = grid([1, 2]);
  assert.throws(() => read({ slots, nature: "FLOW", axisStepMs: 0 }), RangeError);
  assert.throws(() => read({ slots, nature: "FLOW", nativeTimeframeMs: Number.NaN }), RangeError);
  assert.throws(() => read({ slots, nature: "FLOW", nativeTimeframeMs: 90_000 }), RangeError);
  assert.throws(() => read({ slots, nature: "FLOW", asOfMs: Number.POSITIVE_INFINITY }), RangeError);
});

test("the absent shape is closed at compile time: `value` cannot be read without narrowing", () => {
  const reading = read({ slots: grid([null]), nature: "FLOW", logical: 0 });
  assertAbsent(reading, 0);
  // @ts-expect-error — `value` does not exist on every member of `LegendReading` (not on `absent`).
  const leaked: unknown = reading.value;
  assert.equal(leaked, undefined);
  if (reading.kind === "absent") {
    // @ts-expect-error — and narrowed to `absent`, there is still no `value` field to read.
    const narrowedLeak: unknown = reading.value;
    assert.equal(narrowedLeak, undefined);
  }
});
