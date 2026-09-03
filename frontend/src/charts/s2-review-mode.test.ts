// `T-08.9` (plan `08_superficie_e_reprodutibilidade.md` item 8.6, `SPEC-001` §6, `ADR-017`
// `D2`/`D3` cited literally) — falsifiers for `s2-review-mode.ts`. Every negative case plants
// the WRONG value and asserts the module rejects it, per the builder mandate: "se voce afirma
// que uma protecao funciona, mostre o caso que ela rejeita".
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  InvalidReviewCandidateKindError,
  MouseSourcedReviewInputError,
  NoCurrentCandidateError,
  REVIEW_CANDIDATE_KINDS,
  REVIEW_KEYS,
  REVIEW_VERDICTS,
  UnboundReviewKeyError,
  assertKeyboardSourced,
  assertReviewCandidateKind,
  resolveReviewKey,
} from "./s2-review-mode.ts";
import type { ReviewCandidate, ReviewInput } from "./s2-review-mode.ts";

test("REVIEW_CANDIDATE_KINDS is exactly {swing, zone} — Q20 ('coexistem') closes the set", () => {
  assert.deepEqual([...REVIEW_CANDIDATE_KINDS].sort(), ["swing", "zone"]);
});

test("assertReviewCandidateKind accepts both declared kinds", () => {
  assert.equal(assertReviewCandidateKind("swing"), "swing");
  assert.equal(assertReviewCandidateKind("zone"), "zone");
});

test("MORDE: assertReviewCandidateKind refuses an undeclared kind", () => {
  assert.throws(() => assertReviewCandidateKind("ob"), InvalidReviewCandidateKindError);
  assert.throws(() => assertReviewCandidateKind(""), InvalidReviewCandidateKindError);
});

test("REVIEW_VERDICTS is exactly {accept, reject, add} — D2, verbatim", () => {
  assert.deepEqual([...REVIEW_VERDICTS].sort(), ["accept", "add", "reject"]);
});

test("REVIEW_KEYS is exactly {a, r, h, l} — the piloto's own keys, reused verbatim", () => {
  assert.deepEqual([...REVIEW_KEYS].sort(), ["a", "h", "l", "r"]);
});

test("CALA: assertKeyboardSourced accepts a keyboard-sourced input", () => {
  assert.doesNotThrow(() => assertKeyboardSourced({ source: "keyboard" }));
});

test("MORDE: assertKeyboardSourced refuses a mouse-sourced input", () => {
  assert.throws(() => assertKeyboardSourced({ source: "mouse" }), MouseSourcedReviewInputError);
  assert.throws(() => assertKeyboardSourced({ source: "click" }), MouseSourcedReviewInputError);
});

const KEYBOARD = (key: string): ReviewInput => ({ source: "keyboard", key });
const SWING_CANDIDATE: ReviewCandidate = { candidateId: "swing@1700000000000", kind: "swing" };
const ZONE_CANDIDATE: ReviewCandidate = { candidateId: "ob@1700000000000", kind: "zone" };

test("'a' accepts the current SWING candidate", () => {
  assert.deepEqual(resolveReviewKey(KEYBOARD("a"), SWING_CANDIDATE), {
    verdict: "accept",
    candidateId: "swing@1700000000000",
  });
});

test("Q20 'coexistem': 'a'/'r' judge a ZONE candidate through the exact same two keys", () => {
  assert.deepEqual(resolveReviewKey(KEYBOARD("a"), ZONE_CANDIDATE), {
    verdict: "accept",
    candidateId: "ob@1700000000000",
  });
  assert.deepEqual(resolveReviewKey(KEYBOARD("r"), ZONE_CANDIDATE), {
    verdict: "reject",
    candidateId: "ob@1700000000000",
  });
});

test("'r' rejects the current candidate", () => {
  assert.deepEqual(resolveReviewKey(KEYBOARD("r"), SWING_CANDIDATE), {
    verdict: "reject",
    candidateId: "swing@1700000000000",
  });
});

test("MORDE: 'a'/'r' with no current candidate refuse instead of accepting/rejecting nothing", () => {
  assert.throws(() => resolveReviewKey(KEYBOARD("a"), null), NoCurrentCandidateError);
  assert.throws(() => resolveReviewKey(KEYBOARD("r"), null), NoCurrentCandidateError);
});

test("'h'/'l' add a swing from scratch and need no current candidate", () => {
  assert.deepEqual(resolveReviewKey(KEYBOARD("h"), null), { verdict: "add", swingKind: "high" });
  assert.deepEqual(resolveReviewKey(KEYBOARD("l"), null), { verdict: "add", swingKind: "low" });
});

test("'h'/'l' ignore whatever is under review — add is always from scratch", () => {
  assert.deepEqual(resolveReviewKey(KEYBOARD("h"), SWING_CANDIDATE), { verdict: "add", swingKind: "high" });
});

test("MORDE: resolveReviewKey refuses a mouse-sourced input BEFORE reading the key", () => {
  const smuggled = { source: "mouse", key: "a" } as unknown as ReviewInput;
  assert.throws(() => resolveReviewKey(smuggled, SWING_CANDIDATE), MouseSourcedReviewInputError);
});

test("MORDE: an unbound key fails loudly instead of doing nothing", () => {
  assert.throws(() => resolveReviewKey(KEYBOARD("x"), SWING_CANDIDATE), UnboundReviewKeyError);
  assert.throws(() => resolveReviewKey(KEYBOARD("u"), null), UnboundReviewKeyError);
});

test("MORDE: key matching is case-sensitive — 'A' is not 'a'", () => {
  assert.throws(() => resolveReviewKey(KEYBOARD("A"), SWING_CANDIDATE), UnboundReviewKeyError);
});
