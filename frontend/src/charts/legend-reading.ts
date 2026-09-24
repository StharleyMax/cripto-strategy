/**
 * The LEGEND READING of one pane as a pure function — `T-01.4` (`paineis-de-fluxo`, plan `01`
 * item `1.6`, the PURE half of the split; the crosshair wiring is `T-01.7`, in `web`).
 *
 *   (param.logical, slots, nature) → value | held | forming | absent
 *
 * ── WHERE THE NUMBER COMES FROM (`ADR-044/D2`) ────────────────────────────────────────────
 *
 * The legend is resolved from `param.logical` against the SLOTS of the canonical grid, never
 * from `param.seriesData`: on a whitespace slot the series vanishes from that `Map` (so "no
 * point" and "series not mounted" look the same), the mark series appear in it with their
 * HEIGHT IN PX as the value, and it knows nothing of the `STOCK` hold. The index is safe to use
 * as a slot index because of invariant (v) of the pane registry: every series is handed exactly
 * the canonical grid, so logical index `i` IS slot `i` in every pane (`pane-registry.ts`,
 * `validateSetDataOnCanonicalGrid`).
 *
 * ── HOW IT IS READ, BY `nature` (`SPEC-009` §4, `RF-4`) ──────────────────────────────────
 *
 *   - `STOCK` → the held rule that already exists, `resolveStockReading` (`s2-absence-policy.ts`),
 *     called, not reimplemented: exact, or held for AT MOST one native bucket, or absent.
 *   - `FLOW`  → the value of the bucket, `resolveFlowReading`: a neighbour never lends its value.
 *   - `RATIO` → the value of the bucket, the SAME rule as `FLOW` — shared RULE, not shared nature.
 *     The server refuses to carry a ratio forward (`CARRY_FORWARD_BY_NATURE[Nature.RATIO] =
 *     False`), so an absent ratio slot is a slot the read path itself refused to fill.
 *   - `EVENT` / `TICK` → no pane draws them, and no rule is written for a consumer that does not
 *     exist: they throw `LegendNatureNotCoveredError` — high failure until classified, the same
 *     principle as `UncoveredReductionPairError`.
 *
 * ── ABSENT IS ABSENT, NEVER `0` (`RN-4`) ───────────────────────────────────────────────────
 *
 * The `absent` variant has NO `value` field at all. A caller holding a `LegendReading` cannot
 * write `reading.value ?? 0` without first narrowing on `kind`, and after narrowing to `absent`
 * there is no field to read. A measured `0` (a quiet minute) is a `value` reading of `0` — a
 * datum — and the two never collapse into the same shape.
 *
 * ── WITHOUT A CROSSHAIR: THE LAST **CLOSED** BUCKET (`ADR-026`, `SPEC-009` §4) ─────────────
 *
 * `logical === undefined` (the pointer left the chart) reads the last bucket of the grid that
 * has CLOSED at `asOfMs`: the largest index `i` with `slots[i].time + axisStepMs <= asOfMs`.
 * Not the last slot (that may be the bucket in formation), and not the last slot WITH A VALUE
 * (walking back past an absent bucket to find a number would show an older bucket as if it were
 * the latest — `LOCF` by another name). If that closed bucket is absent, the legend says absent.
 *
 * `asOfMs` is an INPUT, never a clock read, so the function stays pure (`ADR-003/FR-1`); `web`
 * passes the instant it evaluates at.
 *
 * ── THE BUCKET IN FORMATION IS NEVER READ AS FINAL (`ADR-026/D3`) ─────────────────────────
 *
 * A reading whose OBSERVED bucket has not closed at `asOfMs` comes back as `forming`, and the
 * number sits under `valueSoFar`, never under `value`. The NAME is the barrier, exactly as
 * `InProgressBar.last` is never `close` in `ADR-026/D3`: a consumer that reads `.value` without
 * narrowing does not compile. That is `SPEC-009` §4's "proíbe mostrar o valor em formação sem
 * marca" made structural — the crosshair CAN land on the bucket in formation, and when it does
 * the legend has the mark to show.
 *
 * "Observed bucket" matters for a `STOCK` held from a coarser native cadence: an OI value held
 * from the 5-minute bucket that opened at 10:00 is still forming at 10:02:30 even though the
 * 1-minute axis bucket 10:01 has closed. `[INFERRED: the 5-minute OI value is only final when
 * its own bucket closes; the axis bucket being closed does not make the observation final]`.
 *
 * ── `nativeTimeframeMs` VS `axisStepMs` ────────────────────────────────────────────────────
 *
 * Same split `resolveStockReading` documents: `axisStepMs` indexes `slots`; `nativeTimeframeMs`
 * is the series' own cadence, used for the hold and for the close of the observed bucket. When
 * the axis is COARSER than the native cadence (a 5-minute OI on a 4-hour axis, served already
 * aggregated to 4 hours), the series' cadence ON THIS AXIS is the axis step — the width used is
 * `max(nativeTimeframeMs, axisStepMs)`, which has to be a whole number of axis steps.
 */

import { resolveFlowReading, resolveStockReading } from "./s2-absence-policy.ts";
import type { ScalarSlot } from "./s2-scalar-grid.ts";

/** Mirrors `series_key.py::Nature` (the same five values `web`'s catalog type carries), so the
 * registry's `readingPolicy` can be passed in as is. Only three of them have a reading rule. */
export type ReadingNature = "STOCK" | "FLOW" | "RATIO" | "EVENT" | "TICK";

/** The natures this module reads. */
export type LegendNature = "STOCK" | "FLOW" | "RATIO";

/** Where the slot being read was picked from. */
export type LegendSource = "crosshair" | "last_closed";

export interface LegendReadingInput {
  /** `param.logical` of the crosshair event, or `undefined` when there is no crosshair. */
  readonly logical: number | undefined;
  /** The pane's slots on the canonical grid, in grid order — slot `i` is logical index `i`. */
  readonly slots: readonly ScalarSlot[];
  readonly nature: ReadingNature;
  /** The spacing of `slots` (the axis timeframe), in ms. */
  readonly axisStepMs: number;
  /** The series' own cadence, in ms. Pass `axisStepMs` when the two are the same. */
  readonly nativeTimeframeMs: number;
  /** The instant the legend is evaluated at, epoch ms. A bucket is closed iff its close `<=` this. */
  readonly asOfMs: number;
}

/** The slot the reading is about. */
interface LocatedFields {
  readonly source: LegendSource;
  readonly slotIndex: number;
  /** Bucket-start (chart X-position) of that slot. */
  readonly bucketStartMs: number;
}

/** The real observation behind the number. */
interface ObservedFields {
  /** Bucket-start of the observation — the slot itself, or up to one native bucket back (`STOCK`). */
  readonly observedBucketStartMs: number;
  /** Close of the observation's own bucket (`D5.1`, the FECHO). */
  readonly observedCloseMs: number;
}

/** A closed bucket, read from its own slot. */
export interface LegendValueReading extends LocatedFields, ObservedFields {
  readonly kind: "value";
  readonly value: number;
}

/** `STOCK` only: a closed observation held forward, at most one native bucket (`D5.2`). */
export interface LegendHeldReading extends LocatedFields, ObservedFields {
  readonly kind: "held";
  readonly value: number;
  /** Minutes from the slot's bucket-start back to `observedBucketStartMs`. */
  readonly staleMinutes: number;
}

/** The observed bucket has NOT closed at `asOfMs`. `valueSoFar`, never `value` (`ADR-026/D3`). */
export interface LegendFormingReading extends LocatedFields, ObservedFields {
  readonly kind: "forming";
  readonly valueSoFar: number;
  /** `0` when the observation is the slot's own; `> 0` when a `STOCK` holds it from an earlier slot. */
  readonly staleMinutes: number;
}

/** No observation. There is no `value` field, so it cannot be shown as `0` (`RN-4`). */
export interface LegendAbsentReading {
  readonly kind: "absent";
  readonly source: LegendSource;
  /** `null` when there is no slot to point at: crosshair off the grid, empty grid, or no closed bucket yet. */
  readonly slotIndex: number | null;
  readonly bucketStartMs: number | null;
}

export type LegendReading = LegendValueReading | LegendHeldReading | LegendFormingReading | LegendAbsentReading;

/** A nature with no legend rule reached the legend. */
export class LegendNatureNotCoveredError extends Error {}

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive, finite number of ms, received ${value}`);
  }
}

function assertLegendNature(nature: ReadingNature): asserts nature is LegendNature {
  if (nature !== "STOCK" && nature !== "FLOW" && nature !== "RATIO") {
    throw new LegendNatureNotCoveredError(
      `no legend reading rule for nature ${String(nature)}: only STOCK, FLOW and RATIO are read`,
    );
  }
}

/**
 * The index of the last slot whose bucket has closed at `asOfMs`, or `null` when none has.
 * The grid is ascending, so the closed slots are a prefix of it.
 */
export function lastClosedSlotIndex(
  slots: readonly ScalarSlot[],
  axisStepMs: number,
  asOfMs: number,
): number | null {
  assertPositiveFinite(axisStepMs, "axisStepMs");
  if (!Number.isFinite(asOfMs)) {
    throw new RangeError(`asOfMs must be a finite epoch ms, received ${asOfMs}`);
  }
  for (let index = slots.length - 1; index >= 0; index -= 1) {
    if (slots[index].time + axisStepMs <= asOfMs) {
      return index;
    }
  }
  return null;
}

/**
 * The slot index a crosshair `logical` points at, or `null` when it points outside the grid.
 * A logical index may carry a fraction (`LogicalRange` docs: `.5` is the middle of a bar), so it
 * rounds to the nearest bar — bar `i` spans `[i - 0.5, i + 0.5)`.
 */
function crosshairSlotIndex(logical: number, slotCount: number): number | null {
  if (!Number.isFinite(logical)) {
    throw new RangeError(`param.logical must be a finite number, received ${logical}`);
  }
  // `+ 0` turns the `-0` that `Math.round(-0.4)` returns into `0`, so the index is a plain integer.
  const index = Math.round(logical) + 0;
  return index >= 0 && index < slotCount ? index : null;
}

function absent(source: LegendSource, slotIndex: number | null, slots: readonly ScalarSlot[]): LegendAbsentReading {
  return {
    kind: "absent",
    source,
    slotIndex,
    bucketStartMs: slotIndex === null ? null : slots[slotIndex].time,
  };
}

/** Reads the legend value of one pane. See the module note for every rule it applies. */
export function resolveLegendReading(input: LegendReadingInput): LegendReading {
  const { logical, slots, nature, axisStepMs, nativeTimeframeMs, asOfMs } = input;
  assertLegendNature(nature);
  assertPositiveFinite(axisStepMs, "axisStepMs");
  assertPositiveFinite(nativeTimeframeMs, "nativeTimeframeMs");
  if (!Number.isFinite(asOfMs)) {
    throw new RangeError(`asOfMs must be a finite epoch ms, received ${asOfMs}`);
  }
  const seriesStepMs = Math.max(nativeTimeframeMs, axisStepMs);
  if (seriesStepMs % axisStepMs !== 0) {
    throw new RangeError(
      `nativeTimeframeMs ${nativeTimeframeMs} is not a whole number of axis steps (${axisStepMs} ms)`,
    );
  }

  const source: LegendSource = logical === undefined ? "last_closed" : "crosshair";
  const slotIndex =
    logical === undefined
      ? lastClosedSlotIndex(slots, axisStepMs, asOfMs)
      : crosshairSlotIndex(logical, slots.length);
  if (slotIndex === null) {
    return absent(source, null, slots);
  }
  const bucketStartMs = slots[slotIndex].time;

  let value: number;
  let observedBucketStartMs: number;
  let staleMinutes: number;
  if (nature === "STOCK") {
    const stock = resolveStockReading(slots, axisStepMs, seriesStepMs, bucketStartMs);
    if (stock.kind === "absent" || stock.value === null || stock.observedBucketStartMs === null) {
      return absent(source, slotIndex, slots);
    }
    value = stock.value;
    observedBucketStartMs = stock.observedBucketStartMs;
    staleMinutes = stock.staleMinutes ?? 0;
  } else {
    // FLOW and RATIO: the bucket's own slot, never a neighbour. `slots` is spaced at the axis
    // step, so that is the stride `resolveFlowReading` indexes with.
    const flow = resolveFlowReading(slots, axisStepMs, bucketStartMs);
    if (flow.kind === "absent" || flow.value === null) {
      return absent(source, slotIndex, slots);
    }
    value = flow.value;
    observedBucketStartMs = bucketStartMs;
    staleMinutes = 0;
  }

  const observedCloseMs = observedBucketStartMs + seriesStepMs;
  const located = { source, slotIndex, bucketStartMs, observedBucketStartMs, observedCloseMs };
  if (observedCloseMs > asOfMs) {
    return { kind: "forming", ...located, valueSoFar: value, staleMinutes };
  }
  if (observedBucketStartMs !== bucketStartMs) {
    return { kind: "held", ...located, value, staleMinutes };
  }
  return { kind: "value", ...located, value };
}
