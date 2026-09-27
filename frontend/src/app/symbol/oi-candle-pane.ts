/**
 * `T-03.11` (`paineis-de-fluxo`, plan `03` item `3b.4`, `RF-8`, `RF-9`, `RN-6`) — the `web` half of
 * the OI candle: the `oi_candles` block the route serves (`ADR-045/D2`, `T-03.9`) turned into what
 * the OI pane DRAWS (a candlestick on the canonical grid) and what its legend SAYS (O·H·L·C and the
 * `DERIVADO` label, derived from `derived_from`).
 *
 * ── WHAT THIS MODULE DOES NOT DO ─────────────────────────────────────────────────────────────
 *
 * It does not DERIVE a candle. `ADR-045` refused "derivar no browser" (`ADR-040/D1`: one
 * implementation, in one place), and the projection lives in `sentimento`
 * (`domain/oi_candle.py`, `domain/oi_candle_regimes.py`). Every number here is a number the route
 * served, placed on the grid — never an `open`, a `high` or a `low` computed from `rows`. The
 * choice of ONE series per bucket (`D2-bis`) was already made server-side, and this module keeps
 * it: a candle carries its own `derived_from`, and the label of a candle is read off THAT candle.
 *
 * ── WHERE THE CANDLE SITS ON THE GRID ────────────────────────────────────────────────────────
 *
 * At `bucket_end_ms`, the instant the route labels the bucket with — the same instant the line of
 * before placed `p(T1)` at, and the same instant a reaggregated price row is keyed by
 * (`series_history.py::_reaggregated_row`, `event_time=outer_bucket_end`). So `close` lands where
 * the old line's point was (`ADR-045` falsifier 1, `close == last`, measured held in `T-03.10`), and
 * on a TF bar the OI candle and the price candle of the same bucket share a slot. The grid itself
 * is `charts`' (`buildScalarSeries`, `ADR-003/FR-2`): this module joins by time, it never counts
 * slots.
 *
 * ── BROWSER-SAFE ─────────────────────────────────────────────────────────────────────────────
 *
 * Imported by `panel-assembly.ts`, which the client-side paginator runs on every page, so it pulls
 * nothing server-side (no `node:crypto`, no `view-model.ts`).
 */

import { buildScalarSeries, ONE_MINUTE_MS, type S2Panels, type S2RawInputs } from "../../charts/index.ts";
import type { AccumulatedWindow } from "./history-page-window.ts";
import type { OiCandleSource, OiCandleSourceWire, OiCandleWire, OiCandlesWire } from "./series-history-envelope.ts";

/** `GridSlot` and `ScalarSlot`, read off the barrel's own `S2Panels` (`ADR-034/D8`: no deep import
 * into `charts`) — the SAME technique `view-model.ts`'s `CandleSlotShape` uses. */
export type OiCandleGridSlot = S2Panels["price"]["series"]["slots"][number];
type ScalarSlot = S2Panels["oi"]["slots"][number];
type RawCandleShape = S2RawInputs["candles"][number];

/**
 * `GridSlot.candle` is a `RawCandle`, which carries a `volume` nothing on this path reads — the
 * price pane's own `VOLUME_IS_ITS_OWN_SERIES` filler, for the same reason: `candlestickSeriesLossless`
 * hands `setData` `{time, open, high, low, close}` only (`price-candle.test.ts` pins that no `volume`
 * key reaches the library). Open interest has no volume at all; this is structure, not a measurement.
 */
const NO_VOLUME_ON_AN_OI_CANDLE = 0;

// ── The paginated bundle ─────────────────────────────────────────────────────────────────────

/** What the pager keeps of the `oi_candles` blocks it has fetched: the sources declared so far and
 * the candles of the accumulated window, ascending by `bucket_end_ms`. */
export interface OiCandleBundle {
  readonly sources: readonly OiCandleSourceWire[];
  readonly candles: readonly OiCandleWire[];
}

export const EMPTY_OI_CANDLE_BUNDLE: OiCandleBundle = { sources: [], candles: [] };

export class OiCandleBundleError extends Error {}

/** The bundle of ONE response: `null` (no `oi_candles` block) is the empty bundle. */
export function oiCandleBundleOf(block: OiCandlesWire | null): OiCandleBundle {
  return block === null ? EMPTY_OI_CANDLE_BUNDLE : { sources: block.sources, candles: block.candles };
}

/** Union of two source declarations. The same `derived_from` must name the same series on the same
 * grid in every page — a page that disagrees would relabel the candles of the other. */
function mergeSources(
  older: readonly OiCandleSourceWire[],
  existing: readonly OiCandleSourceWire[],
): readonly OiCandleSourceWire[] {
  const byName = new Map<OiCandleSource, OiCandleSourceWire>();
  for (const source of [...existing, ...older]) {
    const seen = byName.get(source.derived_from);
    if (seen === undefined) {
      byName.set(source.derived_from, source);
      continue;
    }
    if (
      seen.series_key_id !== source.series_key_id ||
      seen.native_grid_ms !== source.native_grid_ms ||
      seen.bucket_interval_ms !== source.bucket_interval_ms
    ) {
      throw new OiCandleBundleError(
        `two pages declare ${source.derived_from} differently (${JSON.stringify(seen)} vs ${JSON.stringify(source)})`,
      );
    }
  }
  return [...byName.values()];
}

/**
 * Prepends an OLDER page's candles to the ones already loaded — the `mergeOlderPage` contract of
 * `history-page-window.ts`, keyed by `bucket_end_ms`: never re-sorts, never dedupes, and refuses a
 * pair that overlaps (a page covers exactly the gap before what is loaded, so its last bucket end
 * is strictly before the first one already held).
 */
export function mergeOlderOiCandles(older: OiCandleBundle, existing: OiCandleBundle): OiCandleBundle {
  const lastOlder = older.candles.at(-1);
  const firstExisting = existing.candles[0];
  if (lastOlder !== undefined && firstExisting !== undefined && lastOlder.bucket_end_ms >= firstExisting.bucket_end_ms) {
    throw new OiCandleBundleError(
      `the older page's last candle (bucket_end_ms=${lastOlder.bucket_end_ms}) is not strictly before the ` +
        `loaded first one (bucket_end_ms=${firstExisting.bucket_end_ms})`,
    );
  }
  return { sources: mergeSources(older.sources, existing.sources), candles: [...older.candles, ...existing.candles] };
}

/** Keeps the candles whose `bucket_end_ms` lies in `window` — `trimRowsToWindow`'s rule for the
 * rows, so the candle and the rows of one pane never disagree about which slots are loaded. */
export function trimOiCandlesToWindow(bundle: OiCandleBundle, window: AccumulatedWindow): OiCandleBundle {
  const candles = bundle.candles.filter(
    (candle) => candle.bucket_end_ms >= window.startMs && candle.bucket_end_ms < window.endMsExclusive,
  );
  return candles.length === bundle.candles.length ? bundle : { sources: bundle.sources, candles };
}

// ── What the pane draws ──────────────────────────────────────────────────────────────────────

/** Everything the OI pane needs of its candles, plain and JSON-serializable. */
export interface OiCandlePaneData {
  /** One slot per canonical grid instant: the candle at its `bucket_end_ms`, `candle: null` on
   * every other slot. What `candlestickSeriesLossless` feeds `setData`. */
  readonly slots: readonly OiCandleGridSlot[];
  /** The candles that landed on `slots`, ascending — the legend reads the regime and the
   * `closed` flag off these, by `bucket_end_ms`. */
  readonly candles: readonly OiCandleWire[];
  readonly sources: readonly OiCandleSourceWire[];
  /** How many slots carry a candle — counted off `slots`, the array `setData` receives. */
  readonly drawnCandles: number;
  /** The hold cap of the legend (`resolveLegendReading`'s `nativeTimeframeMs`): the WIDEST bucket
   * of the regimes whose candles are loaded, `null` when none is. A held `STOCK` value is never
   * held past its own bucket, and in the pre-capture regime that bucket is 5 minutes wide even on
   * the `1m` TF (`SPEC-009` §6.5). */
  readonly holdCapMs: number | null;
}

/**
 * Places the served candles on the window's canonical grid. A candle whose `bucket_end_ms` is not
 * inside the window is left out (the pager's trim already did the same to the rows); one that is
 * inside but off the grid makes `buildScalarSeries` throw — never snapped to a neighbour.
 */
export function oiCandlePaneData(bundle: OiCandleBundle, window: AccumulatedWindow): OiCandlePaneData {
  const candles = trimOiCandlesToWindow(bundle, window).candles;
  const grid = buildScalarSeries(
    candles.map((candle) => ({ timeMs: candle.bucket_end_ms, value: candle.close })),
    ONE_MINUTE_MS,
    window.startMs,
    window.endMsExclusive,
  ).slots;
  const byEnd = new Map(candles.map((candle) => [candle.bucket_end_ms, candle]));
  const slots: OiCandleGridSlot[] = grid.map((slot) => {
    const candle = byEnd.get(slot.time);
    if (candle === undefined) {
      return { time: slot.time, candle: null };
    }
    const raw: RawCandleShape = {
      openTimeMs: slot.time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: NO_VOLUME_ON_AN_OI_CANDLE,
    };
    return { time: slot.time, candle: raw };
  });
  const usedSources = new Set(candles.map((candle) => candle.derived_from));
  const intervals = bundle.sources
    .filter((source) => usedSources.has(source.derived_from))
    .map((source) => source.bucket_interval_ms);
  return {
    slots,
    candles,
    sources: bundle.sources,
    drawnCandles: slots.filter((slot) => slot.candle !== null).length,
    holdCapMs: intervals.length === 0 ? null : Math.max(...intervals),
  };
}

/** One of the four prices of each slot, on the grid — what a `STOCK` legend reading walks. */
export type OiCandleField = "open" | "high" | "low" | "close";

export function oiCandleFieldSlots(slots: readonly OiCandleGridSlot[], field: OiCandleField): readonly ScalarSlot[] {
  return slots.map((slot) => ({ time: slot.time, value: slot.candle === null ? null : slot.candle[field] }));
}

// ── What the legend says (`RN-6`) ────────────────────────────────────────────────────────────

/** A native grid, as the cadence term of the label: `60000` → `1m`, `300000` → `5m`, `3600000` →
 * `1h`. Throws on a grid that is not a whole number of minutes: a label must never round. */
export function nativeGridTerm(nativeGridMs: number): string {
  if (!Number.isInteger(nativeGridMs) || nativeGridMs <= 0 || nativeGridMs % ONE_MINUTE_MS !== 0) {
    throw new RangeError(`native grid ${nativeGridMs} ms is not a whole number of minutes`);
  }
  const minutes = nativeGridMs / ONE_MINUTE_MS;
  return minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`;
}

/**
 * The procedência of an OI candle, off the `derived_from` it carries — `SPEC-009` §6.2, approved by
 * the `design_gate` (`handoff/DESIGN-LAYOUT.md` §6-§7): *"DERIVADO (OHLC de amostras 5m · ADR-045)"*
 * before the capture, *"… 1m …"* after. Never `OBSERVADO`: `high`/`low` are extremes of discrete
 * samples, a LOWER bound of the true range (`ADR-045/D1`).
 *
 * The cadence term is the declared source's `native_grid_ms`, never a string keyed by the enum —
 * so the day the polled series moves to another grid, the label moves with it (`RF-5`), and a
 * `derived_from` that no source declares throws instead of printing a guess.
 */
export function oiCandleProvenanceLabel(derivedFrom: OiCandleSource, sources: readonly OiCandleSourceWire[]): string {
  const source = sources.find((candidate) => candidate.derived_from === derivedFrom);
  if (source === undefined) {
    throw new OiCandleBundleError(`derived_from ${derivedFrom} is not declared by any source of this block`);
  }
  return `DERIVADO (OHLC de amostras ${nativeGridTerm(source.native_grid_ms)} · ADR-045)`;
}

/** The candle at `bucketEndMs`, or `null` — binary search over the ascending `candles`. */
export function oiCandleAt(candles: readonly OiCandleWire[], bucketEndMs: number): OiCandleWire | null {
  let low = 0;
  let high = candles.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const at = candles[middle]!.bucket_end_ms;
    if (at === bucketEndMs) {
      return candles[middle]!;
    }
    if (at < bucketEndMs) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return null;
}
