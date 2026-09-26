// `T-03.9` — the mechanism `supported-timeframes.ts`'s own docstring promises: this file reads
// `backend/src/modules/sentimento/use_cases/series_history.py` AS TEXT (never imports Python,
// never runs it — same "source scan, not a live boundary" discipline
// `long-short-pane-dom-contract.test.ts` already documents for cross-module contracts inside
// `web`) and fails the instant `SUPPORTED_TIMEFRAMES` disagrees with the backend's own
// `SUPPORTED_INTERVALS`/`_INTERVAL_STEP_MS`. This is the falsifier `ADR-040/D1` names literally:
// "senão o front oferece um TF que a rota recusa, e o 422 vira defeito de tela" — a divergence no
// backend test suite could never catch, because the backend suite has no opinion about what the
// frontend renders.
//
// Run with: npm --prefix frontend run test:app

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_TIMEFRAME, isSupportedTimeframe, SUPPORTED_TIMEFRAMES, timeframeStepMs } from "./supported-timeframes.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// `frontend/src/app/symbol` -> repo root is four levels up.
const BACKEND_SERIES_HISTORY_USE_CASE_PATH = path.join(
  HERE,
  "..",
  "..",
  "..",
  "..",
  "backend",
  "src",
  "modules",
  "sentimento",
  "use_cases",
  "series_history.py",
);
const backendSource = readFileSync(BACKEND_SERIES_HISTORY_USE_CASE_PATH, "utf8");

/** `_GRID_STEP_MS = 60_000` — every `_INTERVAL_STEP_MS` entry is `<multiplier> * _GRID_STEP_MS`
 * or the bare name itself (multiplier `1`, the `"1m"` row). Extracted, not assumed, so a change
 * to the backend's own grid width (today `60_000`) would move this test's expectation with it
 * instead of silently comparing against a stale copy. */
function extractGridStepMs(source: string): number {
  const match = source.match(/_GRID_STEP_MS\s*=\s*([\d_]+)/);
  assert.ok(match, "backend source must declare `_GRID_STEP_MS = <int>` — extraction pattern is stale");
  return Number(match![1]!.replace(/_/g, ""));
}

/** `SUPPORTED_INTERVALS: Final[frozenset[str]] = frozenset({"1m", "5m", ...})` — the SET of
 * interval strings the route accepts, extracted from the literal `frozenset({...})` block. */
function extractSupportedIntervals(source: string): readonly string[] {
  const match = source.match(/SUPPORTED_INTERVALS[^=]*=\s*frozenset\(\{([^}]*)\}\)/);
  assert.ok(match, "backend source must declare `SUPPORTED_INTERVALS: ... = frozenset({...})` — pattern is stale");
  return [...match![1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

/** `_INTERVAL_STEP_MS: Final[dict[str, int]] = { "1m": _GRID_STEP_MS, "5m": 5 * _GRID_STEP_MS,
 * ..., "4h": 4 * 60 * _GRID_STEP_MS }` — one `(interval, stepMs)` pair per entry, `stepMs`
 * resolved against the extracted `_GRID_STEP_MS` rather than hand-copied a second time.
 * `factors` is EVERY integer literal chained by `*` before `_GRID_STEP_MS` (zero or more — `4h`
 * has two, `5m`/`15m`/`1h` have one, `1m` has none), multiplied together. */
function extractIntervalStepMs(source: string, gridStepMs: number): ReadonlyMap<string, number> {
  const blockMatch = source.match(/_INTERVAL_STEP_MS[^=]*=\s*\{([^}]*)\}/);
  assert.ok(blockMatch, "backend source must declare `_INTERVAL_STEP_MS: ... = {...}` — pattern is stale");
  const entries = new Map<string, number>();
  const entryPattern = /"([^"]+)":\s*((?:\d+\s*\*\s*)*)_GRID_STEP_MS/g;
  for (const match of blockMatch![1]!.matchAll(entryPattern)) {
    const interval = match[1]!;
    const factorsRaw = match[2]!; // e.g. "4 * 60 * ", or "" for the bare "1m" entry.
    const factors = [...factorsRaw.matchAll(/\d+/g)].map((f) => Number(f[0]));
    const multiplier = factors.reduce((product, factor) => product * factor, 1);
    entries.set(interval, multiplier * gridStepMs);
  }
  return entries;
}

test("SUPPORTED_TIMEFRAMES carries the same SET of intervals as the backend's SUPPORTED_INTERVALS", () => {
  const backendIntervals = extractSupportedIntervals(backendSource);
  const frontendIntervals = SUPPORTED_TIMEFRAMES.map((option) => option.interval);

  assert.deepEqual(
    [...frontendIntervals].sort(),
    [...backendIntervals].sort(),
    `frontend TF list ${JSON.stringify(frontendIntervals)} must equal backend SUPPORTED_INTERVALS ${JSON.stringify(backendIntervals)} — a mismatch here means the TF bar either offers an interval the route 422s, or hides one the route would serve`,
  );
});

test("SUPPORTED_TIMEFRAMES carries the same stepMs as the backend's _INTERVAL_STEP_MS, per interval", () => {
  const gridStepMs = extractGridStepMs(backendSource);
  const backendSteps = extractIntervalStepMs(backendSource, gridStepMs);

  assert.ok(backendSteps.size > 0, "extraction must find at least one _INTERVAL_STEP_MS entry — pattern is stale");
  for (const option of SUPPORTED_TIMEFRAMES) {
    const backendStepMs = backendSteps.get(option.interval);
    assert.ok(backendStepMs !== undefined, `backend _INTERVAL_STEP_MS has no entry for "${option.interval}"`);
    assert.equal(
      option.stepMs,
      backendStepMs,
      `stepMs for "${option.interval}": frontend has ${option.stepMs}, backend has ${backendStepMs}`,
    );
  }
});

test("MORDE: extraction actually reads the backend file, not an empty/renamed one", () => {
  // Negative control — if the three regexes above ever stopped matching (backend renamed a
  // constant, or this test's relative path rotted), the two tests above would either throw
  // (assert.ok(match, ...) above) or silently compare against empty structures. This test pins
  // the SHAPE of what a successful extraction returns, so a rot in the plumbing fails LOUD.
  const gridStepMs = extractGridStepMs(backendSource);
  const intervals = extractSupportedIntervals(backendSource);
  const steps = extractIntervalStepMs(backendSource, gridStepMs);

  assert.equal(gridStepMs, 60_000, "MORDE: _GRID_STEP_MS drifted from the value every constant below assumes");
  assert.equal(intervals.length, 5, "MORDE: SUPPORTED_INTERVALS no longer has 5 members — extraction may be stale");
  assert.equal(steps.size, 5, "MORDE: _INTERVAL_STEP_MS no longer has 5 entries — extraction may be stale");
});

test("removing a member from SUPPORTED_TIMEFRAMES shrinks isSupportedTimeframe's domain by exactly that member", () => {
  // The DoD's own words: "remover um TF do conjunto servido remove o botão, sem tocar no
  // componente." `TimeframeBar` (`SymbolClient.tsx`) renders one button per element of
  // `SUPPORTED_TIMEFRAMES` via `.map()` (proven by `timeframe-bar-dom-contract.test.ts`) — so
  // this array shrinking is, by construction, the button disappearing. This test proves the
  // OTHER half: that the array's own membership predicate reacts to a removal, over a
  // synthetic shrink (never mutating the real module-level constant).
  const withoutFourHours = SUPPORTED_TIMEFRAMES.filter((option) => option.interval !== "4h");

  assert.equal(withoutFourHours.length, SUPPORTED_TIMEFRAMES.length - 1);
  assert.ok(isSupportedTimeframe("4h"), "sanity: the real module still accepts 4h");
  assert.ok(
    !withoutFourHours.some((option) => option.interval === "4h"),
    "the shrunken array must no longer carry the removed member",
  );
});

test("DEFAULT_TIMEFRAME is itself a supported timeframe", () => {
  assert.ok(isSupportedTimeframe(DEFAULT_TIMEFRAME));
  assert.equal(DEFAULT_TIMEFRAME, "1m", "the pre-T-03.9 behaviour — the only member ever servable before ADR-040/D1");
});

test("every stepMs is a positive integer multiple of the finest member's own stepMs", () => {
  const finestStepMs = Math.min(...SUPPORTED_TIMEFRAMES.map((option) => option.stepMs));
  for (const option of SUPPORTED_TIMEFRAMES) {
    assert.ok(Number.isInteger(option.stepMs) && option.stepMs > 0, `"${option.interval}".stepMs must be a positive integer`);
    assert.equal(
      option.stepMs % finestStepMs,
      0,
      `"${option.interval}".stepMs (${option.stepMs}) must be a multiple of the finest grid (${finestStepMs})`,
    );
  }
});

test("W1-FIX MF-B: timeframeStepMs gives each served interval's width, and refuses an outsider", () => {
  assert.deepEqual(
    SUPPORTED_TIMEFRAMES.map((option) => timeframeStepMs(option.interval)),
    [60_000, 300_000, 900_000, 3_600_000, 14_400_000],
  );
  assert.throws(() => timeframeStepMs("2h"), RangeError);
});
