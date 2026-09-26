/**
 * `W1-REVIEW-r2` BLOCKER-2 — the volume legend reads the CANONICAL grid, at both call sites.
 *
 * `panel-assembly.test.ts` proves the data side (a `4h` window's `legendSlots` read the served bar,
 * and the native vector read by `param.logical` is `ausente`). It proves nothing about the two
 * places that WIRE it: the SSR builder in `[symbol]/page.tsx` and the `<LegendValue>` in
 * `SymbolClient.tsx`. Pointing the legend back at `volume.slots`, or dropping `routeWindow.window`
 * from the SSR `legendSlots`, reproduces `W1-QA-r2` §3 on first paint, and no unit test would see it.
 *
 * Source scan, not a render — same instrument and same stated weakness as
 * `volume-subaxis-dom-contract.test.ts`: it proves the literal is spelled where the contract needs
 * it. The browser half is the live-app falsifier in `W1-DESIGN-REVIEW-r2` §8.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const clientSource = readFileSync(path.join(HERE, "SymbolClient.tsx"), "utf8");
const pageSource = readFileSync(path.join(HERE, "[symbol]", "page.tsx"), "utf8");
const assemblySource = readFileSync(path.join(HERE, "panel-assembly.ts"), "utf8");

const LEGEND_CALL = /<LegendValue\s+seriesId="volume"[^>]*\bslots=\{volume\.(\w+)\}/;

test("MORDE: the volume <LegendValue> reads volume.legendSlots, never the native volume.slots", () => {
  const match = LEGEND_CALL.exec(clientSource);
  assert.ok(match, "the volume <LegendValue> call site must exist");
  assert.equal(match[1], "legendSlots");
});

test("MORDE: the SSR legendSlots is built WITH the route window (canonical grid)", () => {
  assert.match(
    pageSource,
    /legendSlots:\s*nonNegativeFlowSlotsFromHistoryRows\(\s*volumeResult\.rows,\s*routeWindow\.window\s*\)/,
  );
});

test("MORDE: the paginator's legendSlots is built WITH the page window (canonical grid)", () => {
  assert.match(assemblySource, /legendSlots:\s*nonNegativeFlowSlotsFromHistoryRows\(\s*rows\.volume,\s*s2Window\s*\)/);
});

test("CALA: the regex bites — a legend pointed at the native vector is refused", () => {
  const mutated = clientSource.replace(
    /(<LegendValue\s+seriesId="volume"[^>]*\bslots=\{volume\.)legendSlots\}/,
    "$1slots}",
  );
  assert.notEqual(mutated, clientSource, "the mutation must apply");
  assert.equal(LEGEND_CALL.exec(mutated)?.[1], "slots");
});
