// Tests for `T-08.5` — `SPEC-001` §3.7 (`ThresholdSpec` sum type) and `DoD D8.3`.
//
// Run with: npm --prefix frontend run test:app (or node --test 'src/app/*.test.ts')

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertValidBundle,
  assertValidThresholdSpec,
  bundleHash,
  bundleUrl,
  CURRENT_THRESHOLD_SPEC_VERSION,
  decodeBundle,
  decodeThresholdSpec,
  encodeBundle,
  parseBundleFromUrl,
} from "./threshold-spec-bundle.ts";
import type { AbsoluteSpec, PercentileSpec, RobustZSpec, ThresholdSpecBundle } from "./threshold-spec-bundle.ts";

// Not a production address — `bundleUrl` requires an absolute `base` to build a `URL`; no
// real host is contacted by these tests.
const TEST_BASE_URL = "https://painel.local/simbolo";

const ABSOLUTE: AbsoluteSpec = { variant: "absolute", pct: 5.0, op: ">" };
const PERCENTILE: PercentileSpec = {
  variant: "percentile",
  q: 99.9,
  window: 2016,
  scope: "CrossSection",
  minObs: 576,
  interpolation: "linear",
  op: ">=",
};
const ROBUST_Z: RobustZSpec = { variant: "robust_z", k: 3, window: 2016, minObs: 576, op: ">" };

const ABSOLUTE_BUNDLE: ThresholdSpecBundle = { specVersion: CURRENT_THRESHOLD_SPEC_VERSION, spec: ABSOLUTE };
const PERCENTILE_BUNDLE: ThresholdSpecBundle = { specVersion: CURRENT_THRESHOLD_SPEC_VERSION, spec: PERCENTILE };
const ROBUST_Z_BUNDLE: ThresholdSpecBundle = { specVersion: CURRENT_THRESHOLD_SPEC_VERSION, spec: ROBUST_Z };

// ── Round trips, one per variant ────────────────────────────────────────────────────────

test("encodeBundle/decodeBundle round-trips an Absolute bundle", () => {
  const params = encodeBundle(ABSOLUTE_BUNDLE);
  assert.equal(params.get("variant"), "absolute");
  assert.equal(params.get("pct"), "5");
  assert.equal(params.get("op"), ">");
  assert.deepEqual(decodeBundle(params), ABSOLUTE_BUNDLE);
});

test("encodeBundle/decodeBundle round-trips a Percentile bundle, every axis present", () => {
  const params = encodeBundle(PERCENTILE_BUNDLE);
  assert.equal(params.get("variant"), "percentile");
  assert.equal(params.get("q"), "99.9");
  assert.equal(params.get("window"), "2016");
  assert.equal(params.get("scope"), "CrossSection");
  assert.equal(params.get("minObs"), "576");
  assert.equal(params.get("interpolation"), "linear");
  assert.equal(params.get("op"), ">=");
  assert.deepEqual(decodeBundle(params), PERCENTILE_BUNDLE);
});

test("encodeBundle/decodeBundle round-trips a RobustZ bundle", () => {
  const params = encodeBundle(ROBUST_Z_BUNDLE);
  assert.equal(params.get("variant"), "robust_z");
  assert.equal(params.get("k"), "3");
  assert.equal(params.get("window"), "2016");
  assert.equal(params.get("minObs"), "576");
  assert.deepEqual(decodeBundle(params), ROBUST_Z_BUNDLE);
});

test("bundleUrl/parseBundleFromUrl close the loop: the bundle only exists as a URL", () => {
  const url = bundleUrl(TEST_BASE_URL, PERCENTILE_BUNDLE);
  assert.match(url.toString(), /[?&]variant=percentile/);
  assert.deepEqual(parseBundleFromUrl(url), PERCENTILE_BUNDLE);
});

// ── D8.3, the mandatory negative test: no `ThresholdSpec` on the URL -> ZERO derived numbers,
// never a silently completed default. ───────────────────────────────────────────────────

test("D8.3: decodeBundle on an EMPTY URL refuses instead of assuming a variant", () => {
  const params = new URLSearchParams();
  assert.throws(() => decodeBundle(params), /"specVersion" is missing/);
});

test("D8.3: decodeThresholdSpec on an EMPTY URL refuses instead of assuming a variant", () => {
  const params = new URLSearchParams();
  assert.throws(() => decodeThresholdSpec(params), /"variant" is missing/);
});

test("D8.3: a URL missing only the discriminator still refuses, even with every other axis present", () => {
  const params = new URLSearchParams({
    specVersion: String(CURRENT_THRESHOLD_SPEC_VERSION),
    pct: "5",
    op: ">",
  });
  assert.throws(() => decodeBundle(params), /"variant" is missing/);
});

// ── `op` is the axis SPEC-001:303 calls the most dangerous (20x): it can never default ──

test("decode REFUSES a bundle missing op, on every variant", () => {
  const withoutOp = (spec: ThresholdSpecBundle["spec"]): URLSearchParams => {
    const p = encodeBundle({ specVersion: CURRENT_THRESHOLD_SPEC_VERSION, spec });
    p.delete("op");
    return p;
  };
  assert.throws(() => decodeBundle(withoutOp(ABSOLUTE)), /"op" is missing/);
  assert.throws(() => decodeBundle(withoutOp(PERCENTILE)), /"op" is missing/);
  assert.throws(() => decodeBundle(withoutOp(ROBUST_Z)), /"op" is missing/);
});

test("decode REFUSES an op outside the closed vocabulary, rather than coercing it", () => {
  const params = encodeBundle(ABSOLUTE_BUNDLE);
  params.set("op", "!=");
  assert.throws(() => decodeBundle(params), /"op" must be one of/);
});

test("assertValidThresholdSpec REFUSES an op that bypassed decode (constructed directly)", () => {
  const bad = { variant: "absolute", pct: 5, op: "~=" } as unknown as AbsoluteSpec;
  assert.throws(() => assertValidThresholdSpec(bad), /"op" must be one of/);
});

// ── `minObs` is mandatory on Percentile/RobustZ — the type must not permit omitting it ──

test("decode REFUSES a Percentile bundle missing minObs", () => {
  const params = encodeBundle(PERCENTILE_BUNDLE);
  params.delete("minObs");
  assert.throws(() => decodeBundle(params), /"minObs" is missing/);
});

test("decode REFUSES a RobustZ bundle missing minObs", () => {
  const params = encodeBundle(ROBUST_Z_BUNDLE);
  params.delete("minObs");
  assert.throws(() => decodeBundle(params), /"minObs" is missing/);
});

test("assertValidThresholdSpec REFUSES minObs greater than window (cannot observe more than the window holds)", () => {
  const bad: PercentileSpec = { ...PERCENTILE, minObs: 3000 };
  assert.throws(() => assertValidThresholdSpec(bad), /"minObs".*cannot exceed "window"/);
});

// ── `Custom{expr}` stays disabled by default (SPEC-001 §3.7) ────────────────────────────

test("decode REFUSES variant=custom explicitly, naming the SPEC clause that disables it", () => {
  const params = new URLSearchParams({ specVersion: String(CURRENT_THRESHOLD_SPEC_VERSION), variant: "custom", expr: "oi > 5" });
  assert.throws(() => decodeBundle(params), /variant "custom" is disabled by default/);
});

test("decode REFUSES a variant outside the closed vocabulary", () => {
  const params = new URLSearchParams({ specVersion: String(CURRENT_THRESHOLD_SPEC_VERSION), variant: "not-a-real-variant" });
  assert.throws(() => decodeBundle(params), /"absolute", "percentile", "robust_z"/);
});

// ── `spec_version` versions the bundle ───────────────────────────────────────────────────

test("decode REFUSES an unsupported specVersion instead of guessing a field mapping", () => {
  const params = encodeBundle(ABSOLUTE_BUNDLE);
  params.set("specVersion", "999");
  assert.throws(() => decodeBundle(params), /unsupported specVersion/);
});

test("decode REFUSES a bundle missing specVersion even when the spec itself is complete", () => {
  const params = encodeBundle(ABSOLUTE_BUNDLE);
  params.delete("specVersion");
  assert.throws(() => decodeBundle(params), /"specVersion" is missing/);
});

// ── other per-axis validation ────────────────────────────────────────────────────────────

test("assertValidThresholdSpec REFUSES q outside (0, 100)", () => {
  assert.throws(() => assertValidThresholdSpec({ ...PERCENTILE, q: 100 }), /"q" must satisfy 0 < q < 100/);
  assert.throws(() => assertValidThresholdSpec({ ...PERCENTILE, q: 0 }), /"q" must satisfy 0 < q < 100/);
});

test("assertValidThresholdSpec REFUSES a non-positive window", () => {
  assert.throws(() => assertValidThresholdSpec({ ...ROBUST_Z, window: 0 }), /"window" must be a positive integer/);
});

test("assertValidThresholdSpec REFUSES an empty scope", () => {
  assert.throws(() => assertValidThresholdSpec({ ...PERCENTILE, scope: "  " }), /"scope" cannot be empty/);
});

test("assertValidThresholdSpec REFUSES an interpolation outside the closed vocabulary", () => {
  const bad = { ...PERCENTILE, interpolation: "cubic" } as unknown as PercentileSpec;
  assert.throws(() => assertValidThresholdSpec(bad), /"interpolation" must be one of/);
});

test("assertValidThresholdSpec REFUSES a non-positive k", () => {
  assert.throws(() => assertValidThresholdSpec({ ...ROBUST_Z, k: 0 }), /"k" must be > 0/);
});

test("assertValidBundle REFUSES a non-integer specVersion", () => {
  assert.throws(() => assertValidBundle({ specVersion: 1.5, spec: ABSOLUTE }), /"specVersion" must be a positive integer/);
});

// ── bundleHash: sensitive to every axis, including the dangerous one (`op`, 20x) ────────

test("bundleHash is deterministic: the same bundle always hashes the same", () => {
  assert.equal(bundleHash(PERCENTILE_BUNDLE), bundleHash({ ...PERCENTILE_BUNDLE }));
});

test("bundleHash changes when op changes, even though every other axis is identical", () => {
  const gt = bundleHash(ABSOLUTE_BUNDLE);
  const gte = bundleHash({ specVersion: CURRENT_THRESHOLD_SPEC_VERSION, spec: { ...ABSOLUTE, op: ">=" } });
  assert.notEqual(gt, gte, "SPEC-001:303 measures op alone at 20x — the hash must not collapse that difference");
});

test("bundleHash changes when specVersion changes, even though the spec itself is identical", () => {
  const v1 = bundleHash(ABSOLUTE_BUNDLE);
  const v2 = bundleHash({ specVersion: 2, spec: ABSOLUTE });
  assert.notEqual(
    v2,
    v1,
    "SPEC-001:568 versions the bundle by spec_version — the hash must not collapse two different versions of the same spec into the same identity",
  );
});

test("bundleHash differs across variants even with the same op", () => {
  assert.notEqual(bundleHash(ABSOLUTE_BUNDLE), bundleHash(PERCENTILE_BUNDLE));
  assert.notEqual(bundleHash(PERCENTILE_BUNDLE), bundleHash(ROBUST_Z_BUNDLE));
});

test("bundleHash is a sha256 hex digest (64 hex chars)", () => {
  assert.match(bundleHash(ABSOLUTE_BUNDLE), /^[0-9a-f]{64}$/);
});
