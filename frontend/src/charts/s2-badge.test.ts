// `T-05.3`: the badge's four fields (SPEC-001 §6.1) + the three-level hoisting that keeps
// panel/session metadata off the cell (ADR-005/D3, CA-F4-14).
//
// Run with: npm --prefix frontend run test:charts

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildBadge,
  buildCompletudeLabel,
  buildHoistedScreen,
  buildIdade,
  buildSerieLabel,
  countGapRuns,
  denormalizeCell,
  formatIdade,
  jsonByteLength,
  NegativeAgeError,
  SCREEN_PANEL_COUNT,
  SCREEN_TOTAL_CELLS,
  SCREEN_WIDTH_CELLS,
} from "./s2-badge.ts";
import type { CellEnvelope, PanelEnvelope, SessionEnvelope } from "./s2-badge.ts";

// ── fixtures ──────────────────────────────────────────────────────────────────────────────

const SESSION: SessionEnvelope = {
  timezone: "UTC",
  referenceTimeMs: Date.UTC(2026, 7, 23, 0, 5, 0), // "T" — D5.1's own example instant
  mode: "COMO_EM_T",
  bundleVersion: "b1",
  env: "dev",
  principalId: "u-1",
};

const OI_PANEL: PanelEnvelope = {
  metric: "OI",
  qualifier: "grade 5m",
  symbol: "BTC",
  source: "bn-dump",
  unit: "USD",
  denom: null,
  provenance: "OBSERVADO",
  labelShiftMs: null,
  universe: "BTCUSDT",
  completude: { kind: "grid", nLido: 285, nEsperado: 288, gapRuns: 1 },
};

function cell(overrides: Partial<CellEnvelope> = {}): CellEnvelope {
  return {
    value: 12_345.67,
    eventTimeMs: Date.UTC(2026, 7, 23, 0, 0, 0),
    availableAtMs: Date.UTC(2026, 7, 23, 0, 0, 0),
    ageBasis: "OBSERVED",
    columnRef: "p0",
    ...overrides,
  };
}

// ── série (§6.1: "OI · grade 5m · BTC · bn-dump", never the bare metric name) ────────────

test("buildSerieLabel: catalog label, qualifier and unit — never the bare metric name", () => {
  assert.equal(buildSerieLabel(OI_PANEL), "OI · grade 5m · BTC · bn-dump");
  assert.notEqual(buildSerieLabel(OI_PANEL), "OI");
});

// ── idade (§6.1: idade = tempo_de_referência − available_at, só na borda direita) ────────

test("buildIdade: absent off the right edge — a 4-day chart has zero age stamps, and that is correct", () => {
  assert.deepEqual(buildIdade(SESSION, cell(), false), { kind: "absent" });
});

test("buildIdade: idade ? when lag_ms was not measured (availableAtMs === null)", () => {
  const idade = buildIdade(SESSION, cell({ availableAtMs: null }), true);
  assert.deepEqual(idade, { kind: "unknown" });
  assert.equal(formatIdade(idade), "idade ?");
});

test("buildIdade: OBSERVED basis reads as a plain age, MODELED reads with the ~ glyph", () => {
  const availableAtMs = SESSION.referenceTimeMs - 5 * 60_000; // 5 minutes before T
  const observed = buildIdade(SESSION, cell({ availableAtMs, ageBasis: "OBSERVED" }), true);
  const modeled = buildIdade(SESSION, cell({ availableAtMs, ageBasis: "MODELED" }), true);
  assert.deepEqual(observed, { kind: "observed", ageMs: 5 * 60_000 });
  assert.deepEqual(modeled, { kind: "modeled", ageMs: 5 * 60_000 });
  assert.equal(formatIdade(observed), "5m");
  assert.equal(formatIdade(modeled), "~5m");
});

test("buildIdade: never now − available_at — age is measured against session.referenceTimeMs (T), not a clock", () => {
  const oldSession: SessionEnvelope = { ...SESSION, referenceTimeMs: Date.UTC(2020, 0, 1) };
  const idade = buildIdade(oldSession, cell({ availableAtMs: Date.UTC(2020, 0, 1) - 60_000 }), true);
  assert.deepEqual(idade, { kind: "observed", ageMs: 60_000 });
});

test("buildIdade: FALSIFIER — refuses an availableAtMs from the future relative to T (rejects, not clamps)", () => {
  const fromTheFuture = cell({ availableAtMs: SESSION.referenceTimeMs + 60_000 });
  assert.throws(() => buildIdade(SESSION, fromTheFuture, true), NegativeAgeError);
});

// ── completude (§6.1: "285/288 · 1 lacuna" for grid; "contiguidade (N saltos)" for tick) ─

test("countGapRuns: 3 ADJACENT missing slots are ONE lacuna, not three", () => {
  const values = [1, 2, null, null, null, 6, 7]; // 285/288's own shape: one 3-wide hole
  assert.equal(countGapRuns(values), 1);
});

test("countGapRuns: FALSIFIER — two separate single-slot gaps are two lacunas, not one and not the raw miss count", () => {
  const values = [1, null, 3, 4, null, 6]; // 2 missing points, in 2 separate runs
  assert.equal(countGapRuns(values), 2);
  // The bug this function exists to prevent: `nEsperado - nLido` (a naive miss COUNT) gives
  // the right answer here (2) by coincidence, but gives 3 — not 1 — for the contiguous case
  // right above. `countGapRuns` gives the right answer in BOTH shapes because it counts
  // RUNS, never raw misses.
});

test("buildCompletudeLabel: grid series with a gap — 285/288 · 1 lacuna, SPEC-001 §6.1's own example", () => {
  assert.equal(
    buildCompletudeLabel({ kind: "grid", nLido: 285, nEsperado: 288, gapRuns: 1 }),
    "285/288 · 1 lacuna",
  );
});

test("buildCompletudeLabel: grid series with zero gaps carries no lacuna suffix", () => {
  assert.equal(buildCompletudeLabel({ kind: "grid", nLido: 288, nEsperado: 288, gapRuns: 0 }), "288/288");
});

test("buildCompletudeLabel: plural lacunas — 2 SEPARATE gap runs, not 2 missing points miscounted as 1", () => {
  assert.equal(
    buildCompletudeLabel({ kind: "grid", nLido: 286, nEsperado: 288, gapRuns: 2 }),
    "286/288 · 2 lacunas",
  );
});

test("buildCompletudeLabel: tick series has no n_expected — contiguity by agg_id gap count instead", () => {
  assert.equal(buildCompletudeLabel({ kind: "tick", gapCount: 3 }), "contiguidade (3 saltos de agg_id)");
});

// ── buildBadge: the whole selo, sem hover — a plain data object, not a tooltip payload ───

test("buildBadge: assembles all four fields from session + panel + cell", () => {
  const badge = buildBadge(SESSION, OI_PANEL, cell({ availableAtMs: SESSION.referenceTimeMs - 300_000 }), true);
  assert.equal(badge.serie, "OI · grade 5m · BTC · bn-dump");
  assert.deepEqual(badge.idade, { kind: "observed", ageMs: 300_000 });
  assert.equal(badge.procedencia, "OBSERVADO");
  assert.equal(badge.completude, "285/288 · 1 lacuna");
});

// ── içamento em três níveis — o falsificador de custo (ADR-005/D3, CA-F4-14) ─────────────

function buildScreenFixture() {
  const panels: PanelEnvelope[] = Array.from({ length: SCREEN_PANEL_COUNT }, () => ({ ...OI_PANEL }));
  const cellsByPanelIndex = new Map<number, readonly CellEnvelope[]>();
  for (let panelIndex = 0; panelIndex < SCREEN_PANEL_COUNT; panelIndex += 1) {
    const cells = Array.from({ length: SCREEN_WIDTH_CELLS }, (_, i) =>
      cell({ eventTimeMs: SESSION.referenceTimeMs - i * 60_000, columnRef: `p${panelIndex}` }),
    );
    cellsByPanelIndex.set(panelIndex, cells);
  }
  return { panels, cellsByPanelIndex };
}

test("buildHoistedScreen: 570×6 = 3.420 cells, but panel identity is asserted 6 times, not 3.420", () => {
  const { panels, cellsByPanelIndex } = buildScreenFixture();
  const screen = buildHoistedScreen(SESSION, panels, cellsByPanelIndex);
  assert.equal(screen.cells.length, SCREEN_TOTAL_CELLS);
  assert.equal(SCREEN_TOTAL_CELLS, 3420); // the literal number tasks_review.md's T-05.3 line names
  assert.equal(screen.panels.length, SCREEN_PANEL_COUNT); // NOT 3420 — this is the whole point of hoisting
  // No cell carries panel-identity fields — the structural half of CA-F4-14's contract.
  for (const c of screen.cells) {
    assert.ok(!("metric" in c) && !("source" in c) && !("provenance" in c));
  }
});

test("buildHoistedScreen: FALSIFIER — refuses a screen that is not 570×6 rather than silently accepting it", () => {
  const { panels, cellsByPanelIndex } = buildScreenFixture();
  assert.throws(() => buildHoistedScreen(SESSION, panels.slice(0, 5), cellsByPanelIndex), RangeError);
  const shortMap = new Map(cellsByPanelIndex);
  shortMap.set(0, cellsByPanelIndex.get(0)!.slice(0, 10));
  assert.throws(() => buildHoistedScreen(SESSION, panels, shortMap), RangeError);
});

test(
  "denormalizeCell: FALSIFIER for the rejected alternative — inlining panel identity onto " +
    "every cell asserts the same SeriesKey identity 3.420 times per screen, not 6 (matches " +
    "the exact count CA-F4-14's screen size implies: 570 × 6)",
  () => {
    const { panels, cellsByPanelIndex } = buildScreenFixture();
    const screen = buildHoistedScreen(SESSION, panels, cellsByPanelIndex);
    const denormalized = screen.cells.map((c) => denormalizeCell(OI_PANEL, c));
    // Under the rejected shape, the panel's `metric` string is present once PER CELL.
    const metricAssertions = denormalized.filter((d) => d.metric === OI_PANEL.metric).length;
    assert.equal(metricAssertions, SCREEN_TOTAL_CELLS);
    assert.equal(metricAssertions, 3420);
    // Under hoisting, the same identity is present exactly `SCREEN_PANEL_COUNT` times —
    // once per panel object, never once per cell.
    assert.equal(screen.panels.filter((p) => p.metric === OI_PANEL.metric).length, SCREEN_PANEL_COUNT);
  },
);

test(
  "jsonByteLength: OWN measurement (not a re-derivation of ADR-005/D3's 519 B/54 B, whose " +
    "schema is not in this repo) — denormalizing a representative cell costs strictly more " +
    "bytes than the hoisted cell, over this module's own encoding",
  () => {
    const oneCell = cell({ availableAtMs: SESSION.referenceTimeMs - 300_000 });
    const hoistedBytes = jsonByteLength(oneCell);
    const denormalizedBytes = jsonByteLength(denormalizeCell(OI_PANEL, oneCell));
    assert.ok(
      denormalizedBytes > hoistedBytes,
      `expected denormalized (${denormalizedBytes} B) > hoisted (${hoistedBytes} B)`,
    );
    // Command that produced these two numbers: this very test, `node --test
    // 'src/charts/s2-badge.test.ts'` — printed here so the ratio travels with its origin
    // rather than being asserted as a bare pass/fail.
    /* eslint-disable-next-line no-console --
       deliberate: the number must be visible in the gate's own test output, not just
       encoded in a silent boolean assertion. */
    console.log(
      `[MEDIDO] s2-badge.test.ts jsonByteLength: hoisted=${hoistedBytes}B denormalized=${denormalizedBytes}B ` +
        `ratio=${(denormalizedBytes / hoistedBytes).toFixed(2)}x (own schema — see ADR-005/D3 for the ` +
        `519B/54B/9,6x historical figure, a different schema not reproduced here)`,
    );
  },
);
