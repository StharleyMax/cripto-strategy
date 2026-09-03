/**
 * Absence policy BY `nature` (`T-05.4`, plan 05 item 5.5, `SPEC-001` §5.11) — plus the two
 * companion pieces the task title names: the FECHO age stamp (`D5.1`) and the backward
 * guide-line geometry for a held `STOCK` reading (`D5.2`).
 *
 * SCOPE — why this file covers exactly two of the six `nature` rows in §5.11's table, not
 * all six: item 5.1 (`T-05.2`, already in `master`) built exactly three panels — Price
 * (candles, not a `nature` row), OI (`STOCK`) and CVD delta/cumulative (`FLOW`). `RATIO`
 * (stock/flow), `EVENT` and quarantine have no panel anywhere in this phase (`05_fatia_
 * visivel.md` items 5.1..5.12) — writing their branches here would be a policy for a
 * consumer that does not exist yet, the exact "amplia escopo" this task's own dispatch
 * instructions forbid. `SeriesNature` is a 2-value type for that reason; a future task that
 * adds a `RATIO`/`EVENT` panel is where those branches belong.
 *
 * PURE — `ADR-003` FR-1, same discipline every sibling module in this directory follows:
 * every function below takes an already-built `ScalarSlot` grid (from `s2-scalar-grid.ts`,
 * via `buildOiPanel`/`buildCvdPanel` in `s2-panels.ts` — NOT reimplemented here) plus a query
 * instant, and returns a plain reading. Zero `node:fs`, zero clock read.
 *
 * ── `D5.1`: THE PRINTED STAMP IS THE FECHO, NEVER THE RAW BUCKET-START LABEL ──────────────
 *
 * `canonical-grid.ts`/`s2-scalar-grid.ts` key every slot by its bucket-START instant (the
 * OPEN convention `RawCandle.openTimeMs` already documents) — that convention is right for
 * the GRID (bucket math has to agree with the backtest accessor bit-for-bit, `D5.9`), but it
 * is the WRONG convention to PRINT: the plan's own falsifier is literal — "crosshair no
 * primeiro ponto de `met/2026-08-23.csv`" (bucket-start `00:00:00`) has to read `00:05:00Z`
 * on screen, its FECHO, not the raw `00:00:00Z` label ("três dos quatro desenhos de UX
 * imprimiram o rótulo cru — é o defeito que a fase existe para impedir"). `formatCloseStamp`
 * is the one place that conversion happens; every other function in this file that prints a
 * timestamp (`formatHeldStockLabel`) routes through it.
 *
 * ── `D5.2`: `STOCK` (OI) — HELD VALUE, CAPPED AT ONE NATIVE BUCKET, NEVER FURTHER ─────────
 *
 * OI publishes one point every 5 minutes; price plots one candle every 1 minute — so 4 of
 * every 5 one-minute bars have, literally, no OI point of their own (`SPEC-001` §5.12: "1m →
 * 0,2" points per bar). §5.11 says that absence is NOT read as "no OI here": it renders as
 * "ponto discreto na observação real + trilho de vigência ≤ grade nativa" — the last real
 * observation stays valid (held, secondary ink) across the rest of its own native bucket,
 * and — the forbidden half of the same row — the rail may NEVER extend past ONE native
 * bucket-width ("trilho maior que grade nativa": proibido). `resolveStockReading` enforces
 * exactly that cap: it looks at the query's own native bucket, and — only if that bucket
 * itself has no value — ONE bucket back, never further. A real second consecutive native gap
 * (the whole of `2026-08-22`, `[MEDIDO 2026-09-03]` in `s2-oi-loader.ts`'s header) comes back
 * `"absent"`, not held for a day — that is this cap being honored, proven against real data
 * in `s2-absence-policy.test.ts`, not merely asserted in prose.
 *
 * The guide-line endpoints are chart X-POSITIONS (bucket-start instants — the same instant
 * `lineSeriesLossless`/`candlestickSeriesLossless` in `s2-lightweight-adapter.ts` already
 * plot a slot at), which is why `guideLine`/`observedBucketStartMs` are bucket-starts while
 * the PRINTED label (`observedCloseMs`, via `formatHeldStockLabel`) is the FECHO — two
 * different concerns (geometry vs. text), not an inconsistency.
 *
 * ── `D5.3`: `FLOW` (CVD delta) — ABSENT IS ABSENT, NEVER HELD ─────────────────────────────
 *
 * §5.11's `FLOW` row forbids `LOCF` unconditionally ("`LOCF`, sempre" under "proibido") and
 * draws the line CVD's own module already states in prose (`s2-cvd.ts`: "a day with NO file
 * is not filled at all ... an honest gap, never a fabricated zero"): a measured `0` (the
 * market was quiet) is data; a `null` slot (the day was never observed) is not, and the two
 * must never render the same. `resolveFlowReading` never looks at a neighboring slot — no
 * bucket lends its value to another, in either direction.
 */

import { alignToTimeframeStart } from "./canonical-grid.ts";
import type { ScalarSlot } from "./s2-scalar-grid.ts";

export type SeriesNature = "STOCK" | "FLOW";

/** One resolved `STOCK` reading at a query instant — `exact` | `held` (≤ 1 native bucket back) | `absent`. */
export interface StockReading {
  readonly kind: "exact" | "held" | "absent";
  readonly value: number | null;
  /** Bucket-start (chart X-position) of the real observation behind `value` — `null` when `absent`. */
  readonly observedBucketStartMs: number | null;
  /** FECHO of that observation's own bucket (`D5.1`) — `null` when `absent`. */
  readonly observedCloseMs: number | null;
  /** Minutes from the query's own bucket-start back to `observedBucketStartMs` — `0` for `exact`, `null` for `absent`. */
  readonly staleMinutes: number | null;
  /** Backward guide-line endpoints (bucket-start instants) — present only when `kind === "held"`. */
  readonly guideLine: { readonly fromMs: number; readonly toMs: number } | null;
}

export interface FlowReading {
  readonly kind: "present" | "absent";
  readonly value: number | null;
}

/** Looks up the slot exactly at `bucketStartMs` in `nativeSlots`, or `null` if outside the grid's own extent. */
function findSlotAt(
  nativeSlots: readonly ScalarSlot[],
  nativeTimeframeMs: number,
  bucketStartMs: number,
): ScalarSlot | null {
  if (nativeSlots.length === 0) {
    throw new RangeError("nativeSlots must have at least one slot — an empty grid has no extent to query");
  }
  const gridStartMs = nativeSlots[0].time;
  const offset = bucketStartMs - gridStartMs;
  if (offset % nativeTimeframeMs !== 0) {
    throw new RangeError(
      `bucketStartMs ${bucketStartMs} does not land on a ${nativeTimeframeMs}ms grid instant — ` +
        `the caller passed a timestamp not built at this grid's own timeframe`,
    );
  }
  const index = offset / nativeTimeframeMs;
  return index >= 0 && index < nativeSlots.length ? nativeSlots[index] : null;
}

/**
 * Resolves what a crosshair at `queryBucketStartMs` should read from a `STOCK` (OI) grid —
 * `nativeSlots` at `nativeTimeframeMs` resolution (e.g. the 5-minute OI panel from
 * `buildOiPanel`). `queryBucketStartMs` need not land on `nativeSlots`' own grid (that is
 * exactly the 1-minute-price-vs-5-minute-OI case `D5.2` names) — it is floored to the native
 * timeframe internally, the same rule `alignToTimeframeStart` states for every other grid
 * consumer in this directory.
 */
export function resolveStockReading(
  nativeSlots: readonly ScalarSlot[],
  nativeTimeframeMs: number,
  queryBucketStartMs: number,
): StockReading {
  const nativeBucketStartMs = alignToTimeframeStart(queryBucketStartMs, nativeTimeframeMs);
  const exactSlot = findSlotAt(nativeSlots, nativeTimeframeMs, nativeBucketStartMs);

  if (exactSlot !== null && exactSlot.value !== null) {
    const isExactQuery = queryBucketStartMs === nativeBucketStartMs;
    return {
      kind: isExactQuery ? "exact" : "held",
      value: exactSlot.value,
      observedBucketStartMs: nativeBucketStartMs,
      observedCloseMs: nativeBucketStartMs + nativeTimeframeMs,
      staleMinutes: (queryBucketStartMs - nativeBucketStartMs) / 60_000,
      guideLine: isExactQuery ? null : { fromMs: queryBucketStartMs, toMs: nativeBucketStartMs },
    };
  }

  // §5.11: "trilho de vigência ≤ grade nativa" — hold back AT MOST one native bucket-width.
  // Looking further would be exactly the forbidden "trilho maior que grade nativa".
  const priorBucketStartMs = nativeBucketStartMs - nativeTimeframeMs;
  const priorSlot = findSlotAt(nativeSlots, nativeTimeframeMs, priorBucketStartMs);
  if (priorSlot !== null && priorSlot.value !== null) {
    return {
      kind: "held",
      value: priorSlot.value,
      observedBucketStartMs: priorBucketStartMs,
      observedCloseMs: priorBucketStartMs + nativeTimeframeMs,
      staleMinutes: (queryBucketStartMs - priorBucketStartMs) / 60_000,
      guideLine: { fromMs: queryBucketStartMs, toMs: priorBucketStartMs },
    };
  }

  return {
    kind: "absent",
    value: null,
    observedBucketStartMs: null,
    observedCloseMs: null,
    staleMinutes: null,
    guideLine: null,
  };
}

/**
 * Resolves what a crosshair at `queryBucketStartMs` should read from a `FLOW` (CVD delta)
 * grid. Unlike `resolveStockReading`, this NEVER inspects a neighboring slot — §5.11 forbids
 * `LOCF` for `FLOW` unconditionally, so a `null` slot (or an instant outside the grid's own
 * extent) is `"absent"`, full stop.
 */
export function resolveFlowReading(
  nativeSlots: readonly ScalarSlot[],
  nativeTimeframeMs: number,
  queryBucketStartMs: number,
): FlowReading {
  const slot = findSlotAt(nativeSlots, nativeTimeframeMs, queryBucketStartMs);
  const value = slot === null ? null : slot.value;
  return value === null ? { kind: "absent", value: null } : { kind: "present", value };
}

function formatUtcHms(ms: number): string {
  const date = new Date(ms);
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}Z`;
}

/** `D5.1`: the FECHO of the bucket `[bucketStartMs, bucketStartMs + timeframeMs)`. */
export function closeTimeMs(bucketStartMs: number, timeframeMs: number): number {
  return bucketStartMs + timeframeMs;
}

/** `D5.1`'s printed stamp — the FECHO, formatted `HH:MM:SSZ`. Never call this with a raw bucket-start and skip the close. */
export function formatCloseStamp(bucketStartMs: number, timeframeMs: number): string {
  return formatUtcHms(closeTimeMs(bucketStartMs, timeframeMs));
}

/** `D5.2`'s literal text: `de HH:MM:SSZ (−Xm)`. Throws for anything but a `"held"` reading. */
export function formatHeldStockLabel(reading: StockReading): string {
  if (reading.kind !== "held" || reading.observedCloseMs === null || reading.staleMinutes === null) {
    throw new RangeError('formatHeldStockLabel is only defined for a "held" reading');
  }
  return `de ${formatUtcHms(reading.observedCloseMs)} (−${reading.staleMinutes}m)`;
}

/** `D5.3`'s literal text: the value when present, or `—` (em dash) — never a carried-forward number. */
export function formatFlowValue(reading: FlowReading): string {
  return reading.kind === "absent" || reading.value === null ? "—" : String(reading.value);
}
