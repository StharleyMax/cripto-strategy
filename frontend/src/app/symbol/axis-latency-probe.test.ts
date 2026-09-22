/**
 * `T-02.7` — `axis-latency-probe.ts` under `node --test`, where `window` does not exist. What is
 * provable here is the guard (never throws without a browser) and the ring-buffer cap; the
 * browser-only behaviour (the probe actually landing on `window`, `performance.now()` values) is
 * `frontend/e2e/16-teto-latencia-eixo.spec.ts`'s job, against the real production build.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { recordAxisRangeApplied } from "./axis-latency-probe.ts";

test("recordAxisRangeApplied never throws outside a browser — `window` is undefined under node --test", () => {
  assert.equal(typeof window, "undefined", "this test's own premise: no `window` under node --test");
  assert.doesNotThrow(() => {
    recordAxisRangeApplied();
    recordAxisRangeApplied();
  });
});
