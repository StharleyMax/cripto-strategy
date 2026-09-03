// D5.10: "identidade é dimensão" — principal_id filled, never NULL, never an implicit
// constant. The falsifier for "never a constant" is literally calling this twice with two
// DIFFERENT principals and asserting the outputs differ — a hardcoded default would pass a
// single-call test and fail this one.
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { test } from "node:test";
import { createAnnotationIdentity, MissingPrincipalIdError } from "./s2-annotation-identity.ts";

test("createAnnotationIdentity carries the given principalId, verbatim", () => {
  const identity = createAnnotationIdentity("owner-stharley", 1_000);
  assert.equal(identity.principalId, "owner-stharley");
  assert.equal(identity.createdAtMs, 1_000);
});

test("D5.10 falsifier: principal_id is a DIMENSION, not an implicit constant — two calls, two identities", () => {
  const first = createAnnotationIdentity("owner-stharley", 1_000);
  const second = createAnnotationIdentity("owner-guest", 2_000);
  assert.notEqual(first.principalId, second.principalId);
});

test("createAnnotationIdentity refuses an empty principalId instead of defaulting it", () => {
  assert.throws(() => createAnnotationIdentity("", 1_000), MissingPrincipalIdError);
  assert.throws(() => createAnnotationIdentity("   ", 1_000), MissingPrincipalIdError);
});
