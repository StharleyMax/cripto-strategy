// `T-03.11` — the `oi_candles` block of `GET /series-history` (`ADR-045/D2`, served since `T-03.9`),
// validated against `OiCandleReport.to_wire()` field for field. Each refusal below is a candle the
// pane would otherwise DRAW wrong (a wick that does not contain its body, two bars on one slot) or
// LABEL wrong (a `derived_from` with no declared grid to name — the hand-written label `RN-6`
// forbids, by the back door).
//
// Run with: npm --prefix frontend run test:app

import assert from "node:assert/strict";
import { test } from "node:test";

import { parseOiCandlesBlock, parseSeriesHistoryEnvelope } from "./series-history-envelope.ts";

const MINUTE = 60_000;
const FIVE = 5 * MINUTE;
const T1 = 1_780_000_500_000;

function validBlock(): Record<string, unknown> {
  return {
    timeframe_ms: MINUTE,
    sources: [
      { derived_from: "binance_point_5m", series_key_id: "hist-id", native_grid_ms: FIVE, bucket_interval_ms: FIVE },
      { derived_from: "binance_poll_1m", series_key_id: "poll-id", native_grid_ms: MINUTE, bucket_interval_ms: MINUTE },
    ],
    candles: [
      {
        bucket_end_ms: T1,
        open: 100.5,
        high: 130,
        low: 90,
        close: 120.25,
        open_at_ms: T1 - FIVE,
        close_at_ms: T1,
        samples: { present: 2, expected: 2 },
        closed: true,
        derived_from: "binance_point_5m",
      },
      {
        bucket_end_ms: T1 + MINUTE,
        open: 120.25,
        high: 121,
        low: 119,
        close: 119,
        open_at_ms: T1,
        close_at_ms: T1 + MINUTE,
        samples: { present: 2, expected: 2 },
        closed: false,
        derived_from: "binance_poll_1m",
      },
    ],
  };
}

function withCandle(index: number, patch: Record<string, unknown>): Record<string, unknown> {
  const block = validBlock();
  const candles = block.candles as Record<string, unknown>[];
  candles[index] = { ...candles[index], ...patch };
  return block;
}

function body(oiCandles: unknown, includeKey = true): Record<string, unknown> {
  const envelope: Record<string, unknown> = {
    session: { principal_id: null, server_now_ms: T1 },
    panel: {
      series_key_id: "hist-id",
      source: "binance",
      nature: "STOCK",
      unit: "BTC",
      coverage: { earliest_bucket_ms: null, latest_bucket_ms: null, source_floor_ms: null },
    },
    rows: [],
    knowledge_time: T1,
    bar_policy: "final_only",
  };
  if (includeKey) envelope.oi_candles = oiCandles;
  return envelope;
}

test("a valid block passes through verbatim, numbers as numbers", () => {
  const parsed = parseOiCandlesBlock(validBlock());
  assert.ok(parsed !== null);
  assert.equal(parsed.candles.length, 2);
  assert.equal(parsed.candles[0]!.close, 120.25);
  assert.equal(parsed.sources[1]!.native_grid_ms, MINUTE);
});

test("the envelope carries the block; explicit null and a MISSING key both read as null", () => {
  assert.equal(parseSeriesHistoryEnvelope(body(validBlock())).oi_candles?.candles.length, 2);
  assert.equal(parseSeriesHistoryEnvelope(body(null)).oi_candles, null);
  assert.equal(parseSeriesHistoryEnvelope(body(undefined, false)).oi_candles, null);
});

test("a malformed block is REFUSED — one case per rule, each on an otherwise valid block", () => {
  const cases: readonly [string, unknown][] = [
    ["not an object", "candles"],
    ["timeframe_ms zero", { ...validBlock(), timeframe_ms: 0 }],
    ["no sources array", { ...validBlock(), sources: undefined }],
    ["unknown source (the refused O-2)", { ...validBlock(), sources: [{ derived_from: "coinalyze_ohlc_5m", series_key_id: "x", native_grid_ms: FIVE, bucket_interval_ms: FIVE }] }],
    ["a source declared twice", { ...validBlock(), sources: [...(validBlock().sources as unknown[]), (validBlock().sources as unknown[])[0]] }],
    ["native_grid_ms not positive", { ...validBlock(), sources: [{ derived_from: "binance_point_5m", series_key_id: "x", native_grid_ms: 0, bucket_interval_ms: FIVE }] }],
    ["price as a decimal string", withCandle(0, { close: "120.25" })],
    ["price NaN", withCandle(0, { high: Number.NaN })],
    ["high below the body", withCandle(0, { high: 110 })],
    ["low above the body", withCandle(0, { low: 101 })],
    ["open_at_ms == close_at_ms", withCandle(0, { open_at_ms: T1 })],
    ["close_at_ms after the bucket end", withCandle(0, { close_at_ms: T1 + 1 })],
    ["samples as a percentage", withCandle(0, { samples: 1 })],
    ["samples.present a float", withCandle(0, { samples: { present: 1.5, expected: 2 } })],
    ["closed as a string", withCandle(0, { closed: "true" })],
    ["derived_from not declared by sources", { ...validBlock(), sources: [(validBlock().sources as unknown[])[0]] }],
    ["two candles on one instant", withCandle(1, { bucket_end_ms: T1, open_at_ms: T1 - MINUTE, close_at_ms: T1 })],
    ["candles out of order", { ...validBlock(), candles: [...(validBlock().candles as unknown[])].reverse() }],
  ];
  for (const [name, block] of cases) {
    assert.throws(() => parseOiCandlesBlock(block), Error, `accepted: ${name}`);
    assert.throws(() => parseSeriesHistoryEnvelope(body(block)), Error, `the envelope accepted: ${name}`);
  }
});

test("a doji (open == close) and a candle with high == low == open == close are VALID", () => {
  assert.doesNotThrow(() => parseOiCandlesBlock(withCandle(0, { open: 120.25, close: 120.25 })));
  assert.doesNotThrow(() => parseOiCandlesBlock(withCandle(0, { open: 100, high: 100, low: 100, close: 100 })));
});
