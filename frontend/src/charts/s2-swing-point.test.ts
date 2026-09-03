// `T-08.10` / plan item `8.7`, `SPEC-001` §3.6: "<Anotacao>`'s first primitive is `swing_point`
// … zero algoritmo, zero limiar, zero 'nível'". These tests prove the shape composes on top of
// `s2-annotation-price-binding.ts` (identity + price binding untouched) and that every field
// this module adds is refused independently when invalid — never silently defaulted.
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertSwingKind,
  createSwingPoint,
  InvalidSwingKindError,
  NonFiniteSwingEventTimeError,
  NonFiniteSwingPriceError,
  SWING_KINDS,
} from "./s2-swing-point.ts";
import { MissingPrincipalIdError } from "./s2-annotation-identity.ts";
import { MissingPriceUseError } from "./s2-price-source.ts";

test("SWING_KINDS is exactly {high, low} — the closed set SPEC-001 §3.6 reduces a swing to", () => {
  assert.deepEqual([...SWING_KINDS].sort(), ["high", "low"]);
});

test("createSwingPoint carries kind/eventTimeMs/price verbatim, plus the composed identity + price binding", () => {
  const swing = createSwingPoint("owner-stharley", 1_000, "structure_detection", "high", 1_700_000_000_000, 65_432.1);
  assert.equal(swing.primitive, "swing_point");
  assert.equal(swing.kind, "high");
  assert.equal(swing.eventTimeMs, 1_700_000_000_000);
  assert.equal(swing.price, 65_432.1);
  // composed, not reimplemented — same fields T-05.2/T-05.5 already validate
  assert.equal(swing.principalId, "owner-stharley");
  assert.equal(swing.createdAtMs, 1_000);
  assert.equal(swing.priceUse, "structure_detection");
  assert.equal(swing.priceSource, "klines_last");
});

test("the other kind, low, round-trips identically", () => {
  const swing = createSwingPoint("owner-stharley", 1_000, "structure_detection", "low", 1_700_000_000_000, 60_000);
  assert.equal(swing.kind, "low");
});

test("assertSwingKind refuses a kind outside {high, low} — zero silent default", () => {
  assert.throws(() => assertSwingKind("higher_high"), InvalidSwingKindError);
});

test("createSwingPoint refuses an invalid kind before touching eventTimeMs/price", () => {
  assert.throws(
    () => createSwingPoint("owner-stharley", 1_000, "structure_detection", "peak", 1_700_000_000_000, 65_432.1),
    InvalidSwingKindError,
  );
});

test("createSwingPoint refuses a non-finite eventTimeMs — NaN", () => {
  assert.throws(
    () => createSwingPoint("owner-stharley", 1_000, "structure_detection", "high", Number.NaN, 65_432.1),
    NonFiniteSwingEventTimeError,
  );
});

test("createSwingPoint refuses a negative eventTimeMs", () => {
  assert.throws(
    () => createSwingPoint("owner-stharley", 1_000, "structure_detection", "high", -1, 65_432.1),
    NonFiniteSwingEventTimeError,
  );
});

test("createSwingPoint refuses a non-finite price — Infinity", () => {
  assert.throws(
    () => createSwingPoint("owner-stharley", 1_000, "structure_detection", "high", 1_700_000_000_000, Number.POSITIVE_INFINITY),
    NonFiniteSwingPriceError,
  );
});

test("createSwingPoint refuses a zero or negative price — a crypto price is never <= 0", () => {
  assert.throws(
    () => createSwingPoint("owner-stharley", 1_000, "structure_detection", "high", 1_700_000_000_000, 0),
    NonFiniteSwingPriceError,
  );
  assert.throws(
    () => createSwingPoint("owner-stharley", 1_000, "structure_detection", "high", 1_700_000_000_000, -100),
    NonFiniteSwingPriceError,
  );
});

test("T-05.5's PS-1 propagates through composition: a swing without price_use throws MissingPriceUseError", () => {
  assert.throws(
    () => createSwingPoint("owner-stharley", 1_000, null, "high", 1_700_000_000_000, 65_432.1),
    MissingPriceUseError,
  );
});

test("T-05.2's D5.10 refusal propagates through composition: an empty principalId still throws", () => {
  assert.throws(
    () => createSwingPoint("", 1_000, "structure_detection", "high", 1_700_000_000_000, 65_432.1),
    MissingPrincipalIdError,
  );
});

// ── ZERO ALGORITMO, ZERO LIMIAR, ZERO "NÍVEL" — the falsifier this module's scope depends on ──
//
// `SPEC-001:282`'s boundary is not just prose here — it is checkable at the type level. A
// `SwingPoint` MUST NOT carry a threshold, a lookback window, a Fibonacci ratio, or a zone
// bound. This test is a structural falsifier: it lists the exact field set `createSwingPoint`
// returns and fails if a field outside that closed list ever appears (a future edit that
// smuggles in, say, `minMovePct` or `fibLevel` would trip this rather than pass silently).
test("falsifier: SwingPoint carries ONLY the declared fields — no threshold, no level, no zone smuggled in", () => {
  const swing = createSwingPoint("owner-stharley", 1_000, "structure_detection", "high", 1_700_000_000_000, 65_432.1);
  const allowedFields = new Set([
    "primitive",
    "kind",
    "eventTimeMs",
    "price",
    "principalId",
    "createdAtMs",
    "priceSource",
    "priceUse",
  ]);
  const actualFields = Object.keys(swing);
  const unexpected = actualFields.filter((field) => !allowedFields.has(field));
  assert.deepEqual(unexpected, [], `unexpected field(s) on SwingPoint: ${unexpected.join(", ")}`);
});
