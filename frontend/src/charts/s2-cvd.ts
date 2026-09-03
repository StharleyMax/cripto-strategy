/**
 * CVD delta/cumulative for the browser chart (`T-05.2`, plan 05 item 5.1).
 *
 * FORMULA REPLICATED, NOT REINVENTED — `backend/src/modules/sentimento/domain/cvd.py`
 * (read-only citation; `backend/` is out of scope for this task):
 *
 *   - bucket width: 1 minute, `transact_time_ms // 60_000` — NOT a parameter
 *     (`cvd.py:27-31`, `CVD_BUCKET_WIDTH_MS`);
 *   - sign convention: `is_buyer_maker` is the aggressor side. Buyer-is-maker means the
 *     SELLER was the aggressor (the negative side): `-quantity if is_buyer_maker else
 *     +quantity` (`cvd.py:65-68`, `_signed_quantity` at `cvd.py:158-168`);
 *   - `cvd_cum` requires an explicit anchor and accumulates ONLY over present buckets —
 *     a bucket the source never reports is skipped, never zeroed (`cvd.py:126-155`).
 *
 * ── WHY BIGINT, NOT `Decimal`, AND NOT PLAIN `number` EITHER ─────────────────────────────
 *
 * `cvd.py`'s contract is explicit that the persisted FACT must sum `Decimal` over the raw
 * string, never `float` (`D4.8`'s falsifier: `OFMT=%.6g` rounds the text and produces a
 * total off by +4 mBTC). This module does not persist a fact — it feeds a chart — so it is
 * not bound by that DoD; but plain `number` addition of ~millions of quantities (`[MEDIDO
 * 2026-09-03]` `data/binance/aggtrades/BTCUSDT-aggTrades-2026-08-21.csv` alone has 4,802,005
 * trade rows) accumulates IEEE-754 rounding error across a running sum without ever
 * declaring how much. Quantities in this fixture have at most 3 decimal digits (`[MEDIDO
 * 2026-09-03: tail -n +2 <file> | cut -d, -f3 | awk -F. '{print length($2)}' | sort -u`
 * → `1,2,3`]`), so scaling by `1e8` (satoshi-equivalent precision, one order of magnitude
 * above what BTC amounts ever carry) and summing as `BigInt` is EXACT — no accumulated
 * error at all, at a fraction of the cost of a full arbitrary-precision decimal library
 * this project does not otherwise depend on. `parseQuantityToScaled` REFUSES a value with
 * more than 8 decimal digits rather than silently truncating it.
 */

/**
 * PURE — `ADR-003` FR-1 ("`charts` não faz I/O ... Toda entrada é argumento"): this module
 * takes already-read `aggTrades` CSV text and returns accumulated/assembled deltas, zero
 * `node:fs`. A prior version of this file called `readFileSync` directly in
 * `loadCvdDeltaScaled`; `/review` (`T-05.2-review.md`, WARNING) found that a production
 * (non-`.test.ts`) module under `frontend/src/charts/` calling `node:fs` cannot be bundled
 * for a browser, contradicting FR-1 — fixed here by moving the disk read to the caller (the
 * `.test.ts` files that need real fixture data, same discipline
 * `canonical-grid-sha256-proof.test.ts` already set for `T-05.1`).
 */

/** `cvd.py:31` — one minute, not a parameter. */
export const CVD_BUCKET_WIDTH_MS = 60_000;

/** Satoshi-equivalent precision: `10**8`. See header comment for why this is exact here. */
export const QUANTITY_SCALE = 100_000_000n;

export class ImprecisePrecisionError extends Error {}

/** Parses a non-negative decimal string into a `QUANTITY_SCALE`-scaled `BigInt`, exactly. */
export function parseQuantityToScaled(raw: string): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(raw.trim());
  if (match === null) {
    throw new RangeError(`quantity "${raw}" is not a plain non-negative decimal`);
  }
  const [, wholePart, fractionPart = ""] = match;
  if (fractionPart.length > 8) {
    throw new ImprecisePrecisionError(
      `quantity "${raw}" carries ${fractionPart.length} decimal digits, more than the 8 this ` +
        `loader scales to — refused instead of silently truncated`,
    );
  }
  const paddedFraction = fractionPart.padEnd(8, "0");
  return BigInt(wholePart) * QUANTITY_SCALE + BigInt(paddedFraction === "" ? "0" : paddedFraction);
}

/** One bucket's exact signed sum, in `QUANTITY_SCALE` units — the FACT, anchor-free. */
export interface ScaledCvdDelta {
  readonly bucketStartMs: number;
  readonly valueScaled: bigint;
}

const AGG_TRADES_HEADER = "agg_trade_id,price,quantity,first_trade_id,last_trade_id,transact_time,is_buyer_maker";

/**
 * Folds one day's already-read `aggTrades` CSV text into the exact signed per-minute sums.
 *
 * Takes the whole day's text already in memory (the caller reads it once, e.g. via
 * `readFileSync`; this function itself does no I/O) but never materializes a `RawCandle`-
 * shaped array of trades — it walks the buffer as text and folds directly into `totals`, so
 * peak memory is the text plus one `Map` of at most 1,440 entries, not one object per trade
 * (`[MEDIDO 2026-09-03]` the 21st alone has 4,802,005 trade rows).
 */
export function accumulateDayIntoTotals(csvText: string, totals: Map<number, bigint>): void {
  const trimmed = csvText.endsWith("\n") ? csvText.slice(0, -1) : csvText;
  let lineStart = 0;
  let isFirstLine = true;
  const length = trimmed.length;
  while (lineStart <= length) {
    let lineEnd = trimmed.indexOf("\n", lineStart);
    if (lineEnd === -1) {
      lineEnd = length;
    }
    const line = trimmed.slice(lineStart, lineEnd);
    lineStart = lineEnd + 1;
    if (isFirstLine) {
      isFirstLine = false;
      if (line !== AGG_TRADES_HEADER) {
        throw new Error(`unexpected aggTrades header: "${line}"`);
      }
      continue;
    }
    if (line.length === 0) {
      continue;
    }
    // Columns, by position (header verified above): agg_trade_id,price,quantity,
    // first_trade_id,last_trade_id,transact_time,is_buyer_maker.
    const firstComma = line.indexOf(",");
    const secondComma = line.indexOf(",", firstComma + 1);
    const thirdComma = line.indexOf(",", secondComma + 1);
    const lastCommaBeforeMaker = line.lastIndexOf(",");
    const transactTimeStart = line.lastIndexOf(",", lastCommaBeforeMaker - 1) + 1;
    const quantityRaw = line.slice(secondComma + 1, thirdComma);
    const transactTimeMs = Number(line.slice(transactTimeStart, lastCommaBeforeMaker));
    const isBuyerMaker = line.slice(lastCommaBeforeMaker + 1) === "true";

    const bucketStartMs = Math.floor(transactTimeMs / CVD_BUCKET_WIDTH_MS) * CVD_BUCKET_WIDTH_MS;
    const signedScaled = isBuyerMaker ? -parseQuantityToScaled(quantityRaw) : parseQuantityToScaled(quantityRaw);
    totals.set(bucketStartMs, (totals.get(bucketStartMs) ?? 0n) + signedScaled);
  }
}

/**
 * Assembles `cvd_delta`, exact and anchor-free, over the days that HAVE an `aggTrades` file
 * already read into `csvTextByDay` (a day absent from that map means no file exists for it)
 * — the pure remainder of what used to be `loadCvdDeltaScaled` (I/O version, removed; see
 * header comment).
 *
 * A minute inside a COVERED day that this pass never touched (zero trades that minute) is
 * filled with an explicit `0n` — that is a MEASURED fact for a covered day (we saw the whole
 * day and it is quiet), not a guess. A day with NO file is not filled at all: its minutes
 * stay absent from the returned map, so the grid aligner (`s2-scalar-grid.ts`) reports them
 * as `null` — an honest gap, never a fabricated zero.
 */
export function assembleCvdDeltas(
  allDays: readonly string[],
  csvTextByDay: ReadonlyMap<string, string>,
): { deltas: readonly ScaledCvdDelta[]; missingDays: readonly string[]; coveredDays: readonly string[] } {
  const totals = new Map<number, bigint>();
  const missingDays: string[] = [];
  const coveredDays: string[] = [];
  for (const day of allDays) {
    const csvText = csvTextByDay.get(day);
    if (csvText === undefined) {
      missingDays.push(day);
      continue;
    }
    coveredDays.push(day);
    accumulateDayIntoTotals(csvText, totals);
    fillCoveredDayZeros(totals, day);
  }
  const deltas = [...totals.entries()]
    .map(([bucketStartMs, valueScaled]) => ({ bucketStartMs, valueScaled }))
    .sort((left, right) => left.bucketStartMs - right.bucketStartMs);
  return { deltas, missingDays, coveredDays };
}

/** Adds an explicit `0n` for every one-minute bucket of `day` (UTC) not already in `totals`. */
function fillCoveredDayZeros(totals: Map<number, bigint>, day: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (match === null) {
    throw new RangeError(`day "${day}" is not "YYYY-MM-DD"`);
  }
  const [, year, month, dayOfMonth] = match;
  const dayStartMs = Date.UTC(Number(year), Number(month) - 1, Number(dayOfMonth));
  const slotsPerDay = (24 * 60 * 60_000) / CVD_BUCKET_WIDTH_MS;
  for (let index = 0; index < slotsPerDay; index += 1) {
    const bucketStartMs = dayStartMs + index * CVD_BUCKET_WIDTH_MS;
    if (!totals.has(bucketStartMs)) {
      totals.set(bucketStartMs, 0n);
    }
  }
}

/** `cvd_cum(anchor)` — accumulates ONLY over present buckets, `cvd.py:126-155` ported. */
export function cvdCumulativeScaled(
  deltas: readonly ScaledCvdDelta[],
  anchorMs: number,
): readonly ScaledCvdDelta[] {
  let running = 0n;
  const points: ScaledCvdDelta[] = [];
  for (const fact of [...deltas].sort((left, right) => left.bucketStartMs - right.bucketStartMs)) {
    if (fact.bucketStartMs < anchorMs) {
      continue;
    }
    running += fact.valueScaled;
    points.push({ bucketStartMs: fact.bucketStartMs, valueScaled: running });
  }
  return points;
}

/** Converts a `QUANTITY_SCALE`-scaled `BigInt` back to a `number`, only at the display edge. */
export function unscale(valueScaled: bigint): number {
  return Number(valueScaled) / Number(QUANTITY_SCALE);
}
