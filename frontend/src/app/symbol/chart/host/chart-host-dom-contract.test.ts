/**
 * `estrutura-do-front` `T-01.2` — the host's own source contracts, read off `ChartHost.tsx`. The host
 * left `SymbolClient.tsx` for `chart/host/` in this task, and the test that pins it came along to the
 * owner's folder (`SPEC-011` `RN-12`). The body is unchanged: it was `DR-6` in
 * `cvd-pane-dom-contract.test.ts`, which read the host through `SymbolClient.tsx`.
 *
 * Run with: npm --prefix frontend run test:app
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(HERE, "ChartHost.tsx"), "utf8");

test("DR-6: the canvas host is hidden from the accessibility tree, with the readouts as its alternative", () => {
  // `lightweight-charts` paints into a `<canvas>` with no accessible name; a screen reader used
  // to find a nameless empty node. This does not make the SERIES accessible (that is DR-10, a
  // keyboard-navigable table, strategic) — it stops the tree from carrying a node that says
  // nothing, next to readouts that say the last instant.
  // `paineis-de-fluxo` `T-01.5`: the canvas host is now the ONE chart's surface
  // (`ChartHostSurface`), not a per-pane `containerRef` — re-anchored on the same property.
  // `paineis-de-fluxo` `T-01.6`: RE-ANCHORED AGAIN, one level down, and the property is the same.
  // The per-pane readouts now live INSIDE the chart's DOM (each pane's layer is portaled into its
  // pane), so an `aria-hidden` host would hide the very readouts that are the canvas' alternative.
  // What is hidden now is each `<canvas>` (and the library's layout `<table>` is presentational),
  // and the surface must NOT be hidden — both halves are asserted, so neither regression passes.
  assert.match(
    source,
    /for \(const canvas of container\.querySelectorAll\("canvas"\)\) \{\s*\n\s*canvas\.setAttribute\("aria-hidden", "true"\);/,
    "every canvas of the one chart must be hidden from the accessibility tree",
  );
  assert.match(source, /hideChartGraphicsFromAssistiveTech\(container\);/, "declared is not called: the host must run it");
  assert.doesNotMatch(
    source,
    /ref=\{registrar\.surfaceRef\}\s*\n\s*aria-hidden="true"/,
    "the surface now CONTAINS the pane readouts; hiding it would hide the canvas' textual alternative",
  );
});
