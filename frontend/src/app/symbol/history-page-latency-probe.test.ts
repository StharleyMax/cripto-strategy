/**
 * `T-05.9` — `history-page-latency-probe.ts` under `node --test`, where `window` does not exist.
 * What is provable here is the guard (never throws without a browser); the browser-only behaviour
 * (the probe actually landing on `window`, `performance.now()` values, pairing) is
 * `frontend/e2e/20-teto-latencia-historia-sob-demanda.spec.ts`'s job, against the real production
 * build — same split `axis-latency-probe.test.ts` already documents for its own sibling gate.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  recordHistoryPageApplied,
  recordHistoryPageDrawn,
  recordHistoryPageRequested,
} from "./history-page-latency-probe.ts";

test("recordHistoryPageRequested/recordHistoryPageDrawn never throw outside a browser — `window` is undefined under node --test", () => {
  assert.equal(typeof window, "undefined", "this test's own premise: no `window` under node --test");
  assert.doesNotThrow(() => {
    recordHistoryPageRequested();
    recordHistoryPageDrawn();
    recordHistoryPageRequested();
    recordHistoryPageDrawn();
    recordHistoryPageApplied(12.5);
  });
});
