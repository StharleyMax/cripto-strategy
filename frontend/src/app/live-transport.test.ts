// Tests for `T-08.11` — `ADR-005/D1`(live route)/D2/D4, plan `08` item 8.8.
//
// Run with: npm --prefix frontend run test:app (or node --test 'src/app/*.test.ts')

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertValidLiveStreamOpenRequest,
  assertValidBucketEnvelope,
  decodeBucketEnvelope,
  decodeLiveStreamOpenRequest,
  encodeLiveStreamOpenRequest,
  liveStreamUrl,
  LiveEnvelopeRateGuard,
  LiveSeqGapTracker,
} from "./live-transport.ts";
import type {
  FinalBucketEnvelope,
  InProgressBucketEnvelope,
  LiveStreamOpenRequest,
} from "./live-transport.ts";

const TEST_BASE_URL = "https://painel.local/ao-vivo";

const REQUEST_INTRABAR: LiveStreamOpenRequest = {
  seriesKeyId: "BTCUSDT.cvd.5m",
  symbol: "BTCUSDT",
  interval: "5m",
  barPolicy: "intrabar",
};

const REQUEST_FINAL_ONLY: LiveStreamOpenRequest = { ...REQUEST_INTRABAR, barPolicy: "final_only" };

const IN_PROGRESS_ENVELOPE: InProgressBucketEnvelope = {
  bucket_open_ts: "2026-09-02T00:00:00Z",
  cvd_delta_parcial: "1.5",
  last_price: "72998.8",
  n_trades: 42,
  seq: 7,
  is_final: false,
};

const FINAL_ENVELOPE: FinalBucketEnvelope = { ...IN_PROGRESS_ENVELOPE, is_final: true };

// ── The stream-open request (D1 + D4: bar_policy declared by the consumer) ─────────────────

test("encodeLiveStreamOpenRequest/decodeLiveStreamOpenRequest round-trip for intrabar", () => {
  const params = encodeLiveStreamOpenRequest(REQUEST_INTRABAR);
  assert.equal(params.get("barPolicy"), "intrabar");
  assert.deepEqual(decodeLiveStreamOpenRequest(params), REQUEST_INTRABAR);
});

test("encodeLiveStreamOpenRequest/decodeLiveStreamOpenRequest round-trip for final_only", () => {
  const params = encodeLiveStreamOpenRequest(REQUEST_FINAL_ONLY);
  assert.equal(params.get("barPolicy"), "final_only");
  assert.deepEqual(decodeLiveStreamOpenRequest(params), REQUEST_FINAL_ONLY);
});

test("liveStreamUrl carries the four open-request terms in the URL", () => {
  const url = liveStreamUrl(TEST_BASE_URL, REQUEST_INTRABAR);
  assert.match(url.toString(), /seriesKeyId=BTCUSDT\.cvd\.5m/);
  assert.match(url.toString(), /symbol=BTCUSDT/);
  assert.match(url.toString(), /interval=5m/);
  assert.match(url.toString(), /barPolicy=intrabar/);
});

test("assertValidLiveStreamOpenRequest rejects an empty seriesKeyId", () => {
  assert.throws(
    () => assertValidLiveStreamOpenRequest({ ...REQUEST_INTRABAR, seriesKeyId: "  " }),
    /seriesKeyId/,
  );
});

// D4 falsifier: bar_policy is mandatory, never defaulted — especially never to "intrabar".

test("decodeLiveStreamOpenRequest REFUSES a request with barPolicy missing from the URL — no default", () => {
  const params = encodeLiveStreamOpenRequest(REQUEST_INTRABAR);
  params.delete("barPolicy");
  assert.throws(() => decodeLiveStreamOpenRequest(params), /barPolicy.*missing/);
});

test("decodeLiveStreamOpenRequest REFUSES a barPolicy outside the closed set", () => {
  const params = encodeLiveStreamOpenRequest(REQUEST_INTRABAR);
  params.set("barPolicy", "secret_intrabar");
  assert.throws(() => decodeLiveStreamOpenRequest(params), /final_only.*or.*intrabar/);
});

// ── The bucket envelope (D2) ─────────────────────────────────────────────────────────────────

test("decodeBucketEnvelope accepts a legitimate in-progress envelope (is_final=false, explicit)", () => {
  const raw = JSON.parse(JSON.stringify(IN_PROGRESS_ENVELOPE)) as unknown;
  const decoded = decodeBucketEnvelope(raw);
  assert.deepEqual(decoded, IN_PROGRESS_ENVELOPE);
  assert.equal(decoded.is_final, false);
});

test("decodeBucketEnvelope accepts a legitimate final envelope (is_final=true, explicit)", () => {
  const raw = JSON.parse(JSON.stringify(FINAL_ENVELOPE)) as unknown;
  const decoded = decodeBucketEnvelope(raw);
  assert.deepEqual(decoded, FINAL_ENVELOPE);
  assert.equal(decoded.is_final, true);
});

test("assertValidBucketEnvelope rejects an empty last_price", () => {
  assert.throws(
    () => assertValidBucketEnvelope({ ...IN_PROGRESS_ENVELOPE, last_price: "" }),
    /last_price/,
  );
});

test("assertValidBucketEnvelope rejects a negative n_trades", () => {
  assert.throws(
    () => assertValidBucketEnvelope({ ...IN_PROGRESS_ENVELOPE, n_trades: -1 }),
    /n_trades/,
  );
});

// "is_final nunca omitido/implícito" — the requirement's own words, as a falsifier.

test("decodeBucketEnvelope REFUSES a payload with is_final entirely omitted", () => {
  const withoutIsFinal: Record<string, unknown> = { ...IN_PROGRESS_ENVELOPE };
  delete withoutIsFinal.is_final;
  assert.throws(() => decodeBucketEnvelope(withoutIsFinal), /is_final.*explicit boolean/);
});

test("decodeBucketEnvelope REFUSES is_final=null (an implicit/inferred value, not an explicit boolean)", () => {
  const poisoned = { ...IN_PROGRESS_ENVELOPE, is_final: null };
  assert.throws(() => decodeBucketEnvelope(poisoned), /is_final.*explicit boolean/);
});

test("decodeBucketEnvelope REFUSES is_final as a string instead of a literal boolean", () => {
  const poisoned = { ...IN_PROGRESS_ENVELOPE, is_final: "false" };
  assert.throws(() => decodeBucketEnvelope(poisoned), /is_final.*explicit boolean/);
});

test("decodeBucketEnvelope REFUSES a non-object payload", () => {
  assert.throws(() => decodeBucketEnvelope("not-an-envelope"), /expected a JSON object/);
});

// ── Falsifier 1 of ADR-005 (live edge): zero tick-level field in the envelope ───────────────

test("assertValidBucketEnvelope REFUSES agg_id smuggled onto an otherwise-legitimate envelope", () => {
  const poisoned = { ...IN_PROGRESS_ENVELOPE, agg_id: 3415253153 } as unknown as InProgressBucketEnvelope;
  assert.throws(() => assertValidBucketEnvelope(poisoned), /agg_id/);
});

test("decodeBucketEnvelope REFUSES a nested tick-level field (price inside a plain object field)", () => {
  const poisoned = { ...IN_PROGRESS_ENVELOPE, trade: { price: "72998.8" } };
  assert.throws(() => decodeBucketEnvelope(poisoned), /"price"/);
});

test("assertValidBucketEnvelope is a MUTATION guard: a clean envelope stops passing the moment it gains 1 tick field", () => {
  const clean: InProgressBucketEnvelope = { ...IN_PROGRESS_ENVELOPE };
  assert.doesNotThrow(() => assertValidBucketEnvelope(clean));
  const poisoned = { ...clean, quantity: "0.045" } as unknown as InProgressBucketEnvelope;
  assert.throws(() => assertValidBucketEnvelope(poisoned), /quantity/);
});

// ── Falsifier 2 of ADR-005 (live edge): seq is monotonic, gap is detectable without the clock ─

test("LiveSeqGapTracker reports no gap for a contiguous seq sequence", () => {
  const tracker = new LiveSeqGapTracker();
  assert.deepEqual(tracker.observe(1), { gapDetected: false, missedCount: 0 });
  assert.deepEqual(tracker.observe(2), { gapDetected: false, missedCount: 0 });
  assert.deepEqual(tracker.observe(3), { gapDetected: false, missedCount: 0 });
});

test("LiveSeqGapTracker DETECTS a gap by seq alone — no wall-clock input anywhere in this test", () => {
  const tracker = new LiveSeqGapTracker();
  tracker.observe(10);
  const result = tracker.observe(14);
  assert.equal(result.gapDetected, true);
  assert.equal(result.missedCount, 3); // 11, 12, 13 were skipped
});

test("LiveSeqGapTracker throws when seq repeats — monotonicity broken, not merely a gap", () => {
  const tracker = new LiveSeqGapTracker();
  tracker.observe(5);
  assert.throws(() => tracker.observe(5), /monotonically/);
});

test("LiveSeqGapTracker throws when seq goes backward", () => {
  const tracker = new LiveSeqGapTracker();
  tracker.observe(9);
  assert.throws(() => tracker.observe(3), /monotonically/);
});

test("LiveSeqGapTracker: MUTATION — a healthy run of seq stops being healthy the instant one value is skipped", () => {
  const tracker = new LiveSeqGapTracker();
  assert.equal(tracker.observe(1).gapDetected, false);
  assert.equal(tracker.observe(2).gapDetected, false);
  assert.equal(tracker.observe(4).gapDetected, true); // plants the defect: 3 never arrived
});

// ── Falsifier 3 of ADR-005 (live edge): rate never exceeds max(1 Hz, 1/TF) per series ───────

test("LiveEnvelopeRateGuard accepts arrivals spaced exactly at the requested interval", () => {
  const guard = new LiveEnvelopeRateGuard(1_000);
  assert.doesNotThrow(() => {
    guard.observe("2026-09-02T00:00:00.000Z");
    guard.observe("2026-09-02T00:00:01.000Z");
    guard.observe("2026-09-02T00:00:02.000Z");
  });
});

test("LiveEnvelopeRateGuard accepts arrivals MORE spaced than the interval (a slow tick is not a violation)", () => {
  const guard = new LiveEnvelopeRateGuard(1_000);
  assert.doesNotThrow(() => {
    guard.observe("2026-09-02T00:00:00.000Z");
    guard.observe("2026-09-02T00:00:05.000Z");
  });
});

test("LiveEnvelopeRateGuard REFUSES two arrivals closer together than max(1 Hz, 1/TF) — literal ADR falsifier", () => {
  const guard = new LiveEnvelopeRateGuard(1_000);
  guard.observe("2026-09-02T00:00:00.000Z");
  assert.throws(
    () => guard.observe("2026-09-02T00:00:00.400Z"),
    /taxa acima de max\(1 Hz, 1\/TF\)/,
  );
});

test("LiveEnvelopeRateGuard: MUTATION — a healthy stream at exactly the interval stops being healthy the instant one arrival is too fast", () => {
  const guard = new LiveEnvelopeRateGuard(60_000);
  assert.doesNotThrow(() => guard.observe("2026-09-02T00:00:00Z"));
  assert.doesNotThrow(() => guard.observe("2026-09-02T00:01:00Z"));
  assert.throws(() => guard.observe("2026-09-02T00:01:00.500Z")); // plants the defect
});

test("LiveEnvelopeRateGuard constructor rejects a non-positive intervalMs", () => {
  assert.throws(() => new LiveEnvelopeRateGuard(0), /intervalMs must be positive/);
  assert.throws(() => new LiveEnvelopeRateGuard(-1), /intervalMs must be positive/);
});
