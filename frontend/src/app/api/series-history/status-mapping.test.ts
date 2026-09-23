import assert from "node:assert/strict";
import { test } from "node:test";

import { statusForTransportErrorKind } from "./status-mapping.ts";

test("CALA: missing_base_url is a 503, a deployment defect never the backend's fault", () => {
  assert.equal(statusForTransportErrorKind("missing_base_url", undefined), 503);
});

test("CALA: non_2xx forwards the UPSTREAM status verbatim, e.g. T-05.4's 422 ceiling refusal", () => {
  assert.equal(statusForTransportErrorKind("non_2xx", 422), 422);
});

test("MORDE: non_2xx with no upstream status recorded falls back to 502, never a silent 200", () => {
  assert.equal(statusForTransportErrorKind("non_2xx", undefined), 502);
});

test("CALA: connection_refused and malformed_envelope are both 502 — the proxy's own upstream failed", () => {
  assert.equal(statusForTransportErrorKind("connection_refused", undefined), 502);
  assert.equal(statusForTransportErrorKind("malformed_envelope", undefined), 502);
});
