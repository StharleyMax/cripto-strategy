// `T-03.12` (`paineis-de-fluxo`, plan `03` item `3b.5`) — the pure derivation of the OI pane's regime
// marks (`oi-regime-marks.ts`), case by case as `gates/T-03.12-design-gate.md` §4 writes them:
// `Q-1` (rules), `Q-3` (the three channels, 5 cases), `Q-3b` (the left edge), `Q-4` (the `H/L não
// medidos` predicate, 4 cases + the monotone control) and `DG-3` (which label goes where).
//
// Every case is built so that ONE named mutation of the source turns it red — the mutation list,
// and the count of failures each one produces, is in `gates/T-03.12-builder.md` §3.
//
// The numbers in the fixtures are the ones the gate publishes for the real candles (the island of
// BTC `15m` 09-27T11:45Z, ETH `5m` 09-27T00:25Z); the raw data they come from is not versioned.
//
// Run with: npm --prefix frontend run test:app

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  hlUnmeasured,
  OI_PRE_CAPTURE_SOURCE,
  oiRegimeBandsAtFact,
  oiRegimeLabelText,
  oiRegimeMarks,
  OiRegimeMarksError,
  placeOiRegimeLabels,
  type OiRegimeLabelSpan,
} from "./oi-regime-marks.ts";
import type { OiCandleSource, OiCandleSourceWire, OiCandleWire } from "./series-history-envelope.ts";

const MIN = 60_000;
const A: OiCandleSource = "binance_point_5m";
const B: OiCandleSource = "binance_poll_1m";

/** 2026-09-26T00:00Z — an arbitrary day; every instant below is `DAY + h·60 + m` minutes. */
const DAY = Date.UTC(2026, 8, 26);
const at = (hours: number, minutes: number) => DAY + (hours * 60 + minutes) * MIN;

/** The two sources as the route declares them in a TF: `bucket_interval_ms` is the bucket's, not the grid's. */
function sourcesFor(tfMs: number): readonly OiCandleSourceWire[] {
  return [
    { derived_from: A, series_key_id: "hist", native_grid_ms: 5 * MIN, bucket_interval_ms: Math.max(5 * MIN, tfMs) },
    { derived_from: B, series_key_id: "poll", native_grid_ms: MIN, bucket_interval_ms: tfMs },
  ];
}

const SOURCES_1M = sourcesFor(MIN);
const SOURCES_5M = sourcesFor(5 * MIN);
const SOURCES_15M = sourcesFor(15 * MIN);

function widthOf(derivedFrom: OiCandleSource, sources: readonly OiCandleSourceWire[]): number {
  return sources.find((source) => source.derived_from === derivedFrom)!.bucket_interval_ms;
}

/** A served candle. `anchor` = the reading at `T0` exists (`open_at_ms == T0`); otherwise the open is
 * the first sample, `openAtMs` (default: one native grid after `T0`). */
function candle(
  bucketEndMs: number,
  derivedFrom: OiCandleSource,
  sources: readonly OiCandleSourceWire[],
  options: {
    readonly present?: number;
    readonly expected?: number;
    readonly anchor?: boolean;
    readonly openAtMs?: number;
    readonly ohlc?: readonly [number, number, number, number];
  } = {},
): OiCandleWire {
  const width = widthOf(derivedFrom, sources);
  const native = sources.find((source) => source.derived_from === derivedFrom)!.native_grid_ms;
  const t0 = bucketEndMs - width;
  const anchor = options.anchor ?? true;
  const [open, high, low, close] = options.ohlc ?? [100, 101, 100, 101];
  return {
    bucket_end_ms: bucketEndMs,
    open,
    high,
    low,
    close,
    open_at_ms: anchor ? t0 : (options.openAtMs ?? t0 + native),
    close_at_ms: bucketEndMs,
    samples: { present: options.present ?? 1, expected: options.expected ?? Math.max(1, width / native) },
    closed: true,
    derived_from: derivedFrom,
  };
}

const run = (derivedFrom: OiCandleSource, sources: readonly OiCandleSourceWire[], ends: readonly number[]) =>
  ends.map((end) => candle(end, derivedFrom, sources));

/** Slots of step `stepMs` in `[fromMs, toMs]` with no served candle, split by inside/outside a band. */
function blanks(candles: readonly OiCandleWire[], sources: readonly OiCandleSourceWire[], stepMs: number, fromMs: number, toMs: number) {
  const marks = oiRegimeMarks(candles, sources);
  const served = new Set(candles.map((each) => each.bucket_end_ms));
  const inside: number[] = [];
  const outside: number[] = [];
  for (let t = fromMs; t <= toMs; t += stepMs) {
    if (served.has(t)) continue;
    (marks.bands.some((band) => band.leftExclusiveMs < t && t <= band.rightInclusiveMs) ? inside : outside).push(t);
  }
  return { inside, outside };
}

// ── Q-3 (i) — the 4 blanks between two pre-capture candles in `1m` are INSIDE the band ─────────────

test("Q-3 (i): in 1m the 4 blanks between two pre-capture candles are inside ONE band, and no rule", () => {
  const candles = run(A, SOURCES_1M, [at(2, 0), at(2, 5), at(2, 10)]);
  const marks = oiRegimeMarks(candles, SOURCES_1M);
  assert.equal(marks.bands.length, 1);
  assert.deepEqual(
    { left: marks.bands[0]!.leftExclusiveMs, right: marks.bands[0]!.rightInclusiveMs, candles: marks.bands[0]!.candles },
    { left: at(1, 55), right: at(2, 10), candles: 3 },
  );
  assert.equal(marks.rules.length, 0);
  const { inside, outside } = blanks(candles, SOURCES_1M, MIN, at(2, 0), at(2, 10));
  assert.equal(inside.length, 8, "02:01–02:04 and 02:06–02:09 are the grid of A, not holes");
  assert.equal(outside.length, 0);
});

// ── Q-3 (ii) + Q-3b — a hole INSIDE A breaks the band, draws no rule, and the band after it covers
//    the first candle's own interval ─────────────────────────────────────────────────────────────

test("Q-3 (ii): a hole inside the pre-capture regime breaks the band and draws NO rule", () => {
  const candles = run(A, SOURCES_1M, [at(2, 0), at(2, 5), at(3, 0), at(3, 5)]);
  const marks = oiRegimeMarks(candles, SOURCES_1M);
  assert.equal(marks.rules.length, 0, "a hole is not a change of source");
  assert.equal(oiRegimeBandsAtFact(marks), `${at(1, 55)}-${at(2, 5)},${at(2, 55)}-${at(3, 5)}`);
  const { inside, outside } = blanks(candles, SOURCES_1M, MIN, at(2, 0), at(3, 5));
  assert.deepEqual(outside, Array.from({ length: 50 }, (_, index) => at(2, 6 + index)), "02:06–02:55 are the hole");
  assert.equal(inside.length, 12, "02:01–02:04, then 02:56–02:59 (Q-3b) and 03:01–03:04");
});

test("Q-3b: the first pre-capture candle after a hole has the band from its own T0 (exclusive): 4 slots before it", () => {
  const candles = run(A, SOURCES_1M, [at(2, 0), at(3, 0)]);
  const second = oiRegimeMarks(candles, SOURCES_1M).bands[1]!;
  assert.equal(second.leftExclusiveMs, at(2, 55));
  const { inside } = blanks(candles, SOURCES_1M, MIN, at(2, 56), at(2, 59));
  assert.deepEqual(inside, [at(2, 56), at(2, 57), at(2, 58), at(2, 59)], "13:26Z–13:29Z of the gate, here 02:56–02:59");
});

// ── Q-3 (iii) — a change with suppression blanks: 1 rule, blanks OUTSIDE the band ──────────────────

test("Q-3 (iii): A→B in 1m with 3 suppression blanks — 1 rule at the band's right edge, the blanks outside", () => {
  const candles = [...run(A, SOURCES_1M, [at(2, 55), at(3, 0)]), ...run(B, SOURCES_1M, [at(3, 4), at(3, 5), at(3, 6)])];
  const marks = oiRegimeMarks(candles, SOURCES_1M);
  assert.deepEqual(marks.rules, [{ atMs: at(3, 0), from: A, to: B }]);
  assert.equal(marks.bands.length, 1);
  assert.equal(marks.bands[0]!.rightInclusiveMs, at(3, 0));
  const { inside, outside } = blanks(candles, SOURCES_1M, MIN, at(3, 0), at(3, 6));
  assert.deepEqual(outside, [at(3, 1), at(3, 2), at(3, 3)]);
  assert.deepEqual(inside, []);
});

// ── Q-3 (iv) — a change that coincides with a hole (`15m`, 00:30Z → 11:45Z): the rule AND the blanks ─

test("Q-3 (iv): in 15m poll 00:30 → hist island 11:45 → poll 12:00 — 2 rules, the island band, 44 blanks outside", () => {
  const candles = [
    candle(at(0, 30), B, SOURCES_15M, { present: 15, expected: 15 }),
    candle(at(11, 45), A, SOURCES_15M, { present: 2, expected: 3, anchor: false }),
    candle(at(12, 0), B, SOURCES_15M, { present: 15, expected: 15 }),
  ];
  const marks = oiRegimeMarks(candles, SOURCES_15M);
  assert.deepEqual(marks.rules, [
    { atMs: at(11, 30), from: B, to: A },
    { atMs: at(11, 45), from: A, to: B },
  ]);
  assert.equal(oiRegimeBandsAtFact(marks), `${at(11, 30)}-${at(11, 45)}`);
  const { inside, outside } = blanks(candles, SOURCES_15M, 15 * MIN, at(0, 30), at(12, 0));
  assert.equal(outside.length, 44, "00:45Z–11:30Z, in the TF's step (O-2)");
  assert.deepEqual(inside, []);
});

// ── Q-3 (v) — B→A with the last B less than one A-bucket before the first A ───────────────────────

test("Q-3 (v): B→A in 1m with the last B at 12:02 and the first A at 12:05 — the band starts AT 12:02, never over a B slot", () => {
  const candles = [...run(B, SOURCES_1M, [at(12, 0), at(12, 1), at(12, 2)]), ...run(A, SOURCES_1M, [at(12, 5)])];
  const marks = oiRegimeMarks(candles, SOURCES_1M);
  assert.equal(oiRegimeBandsAtFact(marks), `${at(12, 2)}-${at(12, 5)}`);
  assert.deepEqual(marks.rules, [{ atMs: at(12, 2), from: B, to: A }]);
  for (const b of candles.filter((each) => each.derived_from === B)) {
    assert.ok(
      !marks.bands.some((band) => band.leftExclusiveMs < b.bucket_end_ms && b.bucket_end_ms <= band.rightInclusiveMs),
      `the band covers the slot ${new Date(b.bucket_end_ms).toISOString()} a polled candle served`,
    );
  }
});

// ── Q-1 — one rule per change of `derived_from`, with or without a hole in between ────────────────

test("Q-1: poll → hist → poll: rules == changes of derived_from, with and without a hole between them", () => {
  const cases: readonly (readonly OiCandleWire[])[] = [
    [...run(B, SOURCES_5M, [at(1, 0), at(1, 5)]), ...run(A, SOURCES_5M, [at(1, 10)]), ...run(B, SOURCES_5M, [at(1, 15)])],
    [...run(B, SOURCES_5M, [at(1, 0)]), ...run(A, SOURCES_5M, [at(4, 0), at(4, 5)]), ...run(B, SOURCES_5M, [at(7, 0)])],
    [...run(A, SOURCES_5M, [at(1, 0)]), ...run(B, SOURCES_5M, [at(1, 5), at(1, 10)])],
  ];
  for (const candles of cases) {
    const changes = candles.slice(1).filter((each, index) => each.derived_from !== candles[index]!.derived_from).length;
    assert.equal(oiRegimeMarks(candles, SOURCES_5M).rules.length, changes);
  }
  assert.equal(oiRegimeMarks(cases[1]!, SOURCES_5M).rules.length, 2, "both changes of case 2 coincide with a hole");
});

test("no candle, no mark; a derived_from no source declares throws instead of guessing a width", () => {
  assert.deepEqual(oiRegimeMarks([], SOURCES_1M), { bands: [], rules: [], labelSpans: [] });
  assert.throws(() => oiRegimeMarks(run(A, SOURCES_1M, [at(1, 0)]), SOURCES_1M.filter((s) => s.derived_from === B)), OiRegimeMarksError);
});

test("the band marks the pre-capture regime, binance_point_5m — never the polled one", () => {
  assert.equal(OI_PRE_CAPTURE_SOURCE, "binance_point_5m");
  assert.equal(oiRegimeMarks(run(B, SOURCES_1M, [at(1, 0), at(1, 1)]), SOURCES_1M).bands.length, 0);
});

// ── DG-3 — the label spans and where a label goes ─────────────────────────────────────────────────

test("DG-3: a band label per band and one per run of the polled regime; the term is native_grid_ms'", () => {
  const candles = [...run(A, SOURCES_1M, [at(2, 0), at(2, 5), at(3, 0)]), ...run(B, SOURCES_1M, [at(3, 1), at(3, 2)])];
  const spans = oiRegimeMarks(candles, SOURCES_1M).labelSpans;
  assert.deepEqual(
    spans.map((span) => [span.derivedFrom, span.leftExclusiveMs, span.rightInclusiveMs, span.text]),
    [
      [A, at(1, 55), at(2, 5), "amostras 5m"],
      [A, at(2, 55), at(3, 0), "amostras 5m"],
      [B, at(3, 0), at(3, 2), "amostras 1m"],
    ],
  );
  const moved = { ...SOURCES_1M[1]!, native_grid_ms: 2 * MIN };
  assert.equal(oiRegimeLabelText(moved), "amostras 2m", "the term follows the source's grid, not the enum");
});

/** A 1-px-per-minute axis starting at `DAY`: the right edge of the slot of `ms`. */
const edge = (ms: number) => (ms - DAY) / MIN + 0.5;
const width60 = () => 60;

test("DG-3: only the polled regime on screen → no label at all (the daily use)", () => {
  const spans: readonly OiRegimeLabelSpan[] = [{ derivedFrom: B, leftExclusiveMs: at(0, 0), rightInclusiveMs: at(20, 0), text: "amostras 1m" }];
  assert.deepEqual(placeOiRegimeLabels(spans, edge, 1000, width60), []);
});

test("DG-3: a screen entirely inside a band still gets its label, glued to the visible left edge + 4 px", () => {
  const spans: readonly OiRegimeLabelSpan[] = [{ derivedFrom: A, leftExclusiveMs: at(0, 0), rightInclusiveMs: at(30, 0), text: "amostras 5m" }];
  const placed = placeOiRegimeLabels((spans), (ms) => edge(ms) - 500, 1000, width60);
  assert.deepEqual(placed, [{ derivedFrom: A, text: "amostras 5m", leftPx: 4 }]);
});

test("DG-3: two regimes visible → both labelled; a band narrower than label + 8 px (the 15m island) gets none", () => {
  const spans: readonly OiRegimeLabelSpan[] = [
    { derivedFrom: A, leftExclusiveMs: at(0, 0), rightInclusiveMs: at(3, 0), text: "amostras 5m" },
    { derivedFrom: B, leftExclusiveMs: at(3, 0), rightInclusiveMs: at(11, 30), text: "amostras 1m" },
    { derivedFrom: A, leftExclusiveMs: at(11, 30), rightInclusiveMs: at(11, 45), text: "amostras 5m" },
    { derivedFrom: B, leftExclusiveMs: at(11, 45), rightInclusiveMs: at(14, 0), text: "amostras 1m" },
  ];
  const placed = placeOiRegimeLabels(spans, edge, 1000, width60);
  assert.deepEqual(
    placed.map((label) => [label.derivedFrom, label.leftPx]),
    [
      [A, 4.5],
      [B, 184.5],
      [B, 709.5],
    ],
    "the island (15 px wide) is too narrow for a 60 px label: the band and the two rules stay, no label",
  );
});

test("DG-3: a span off screen, or at an x the chart cannot give yet (NaN), gets no label", () => {
  const spans: readonly OiRegimeLabelSpan[] = [{ derivedFrom: A, leftExclusiveMs: at(30, 0), rightInclusiveMs: at(40, 0), text: "amostras 5m" }];
  assert.deepEqual(placeOiRegimeLabels(spans, edge, 1000, width60), []);
  assert.deepEqual(placeOiRegimeLabels(spans, () => Number.NaN, 1000, width60), []);
});

// ── Q-4 — `H/L não medidos` iff the bucket had at most 2 readings (present + the anchor) ──────────

test("Q-4 (i): the island, BTC 15m 09-27T11:45Z, binance_point_5m 2/3 WITHOUT anchor → not measured", () => {
  const island = candle(Date.UTC(2026, 8, 27, 11, 45), A, SOURCES_15M, {
    present: 2,
    expected: 3,
    anchor: false,
    openAtMs: Date.UTC(2026, 8, 27, 11, 40),
    ohlc: [94562.41, 94566.411, 94562.41, 94566.411],
  });
  assert.equal(hlUnmeasured(island, SOURCES_15M), true);
});

test("Q-4 (ii): BTC 15m 09-25T03:00Z, 1/3 WITH anchor → not measured", () => {
  const one = candle(Date.UTC(2026, 8, 25, 3, 0), A, SOURCES_15M, { present: 1, expected: 3, anchor: true, ohlc: [5, 6, 5, 6] });
  assert.equal(hlUnmeasured(one, SOURCES_15M), true);
});

test("Q-4 (iii): ETH 5m 09-27T00:25Z, binance_poll_1m 2/5 WITH anchor, a measured wick → numerals", () => {
  const eth = candle(Date.UTC(2026, 8, 27, 0, 25), B, SOURCES_5M, {
    present: 2,
    expected: 5,
    anchor: true,
    ohlc: [2274256.923, 2274431.615, 2274228.806, 2274228.806],
  });
  assert.equal(hlUnmeasured(eth, SOURCES_5M), false);
});

test("Q-4 (iv): every 1m candle (polled 1/1 or historical 1/1, both anchored) → not measured", () => {
  assert.equal(hlUnmeasured(candle(at(5, 1), B, SOURCES_1M, { present: 1, expected: 1 }), SOURCES_1M), true);
  assert.equal(hlUnmeasured(candle(at(5, 5), A, SOURCES_1M, { present: 1, expected: 1 }), SOURCES_1M), true);
});

test("Q-4 control: 5/5 anchored with H == C and L == O is MEASURED and monotone — numerals stay (the refused trigger by value)", () => {
  const monotone = candle(at(0, 25), B, SOURCES_5M, { present: 5, expected: 5, anchor: true, ohlc: [10, 12, 10, 12] });
  assert.equal(hlUnmeasured(monotone, SOURCES_5M), false);
  // and 3/3 without anchor (ETH 15m 09-25T05:45Z) has 3 readings: measured.
  assert.equal(hlUnmeasured(candle(at(5, 45), B, SOURCES_15M, { present: 3, expected: 15, anchor: false }), SOURCES_15M), false);
});
