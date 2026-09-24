// `T-01.2` — the pane registry's invariants (i)–(v), `SPEC-009` §5. Every invariant has a case
// that FAILS and a case that PASSES, and each failing case asserts that exactly the expected
// invariant fired, so a validator that rejects everything cannot pass this suite.
//
// Run with: npm --prefix frontend run test:app

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// `ADR-034/D8`: this route reaches `charts` only through the barrel.
import { absenceMarkSeries, lineSeriesLossless, zeroMarkSeries } from "../../charts/index.ts";
import type { Nature, SeriesCatalogEntry, SeriesKey } from "../../features/s3-inspector/series-catalog.ts";
import {
  F1_PANE_ORDER,
  F1_PANE_STRETCH,
  PaneRegistryError,
  assertValidPaneRegistry,
  paneIndexOf,
  paneLayerTestId,
  resolvePaneLegend,
  validatePaneRegistry,
  validateSetDataOnCanonicalGrid,
  type PaneId,
  type PaneInvariant,
  type PaneRegistry,
  type PaneRegistryViolation,
  type PaneSeriesSpec,
  type PaneSpec,
  type RegistryPayloads,
  type ServedCatalog,
} from "./pane-registry.ts";
import { computeSeriesKeyId } from "./series-key-id.ts";

// ── `T-01.6`: the layer testids and the stretch weights are derived from `pane_id` ──────────────

test("T-01.6: every pane's layer testid, derived from pane_id, is the literal SymbolClient.tsx renders", () => {
  const source = readFileSync(fileURLToPath(new URL("./SymbolClient.tsx", import.meta.url)), "utf8");
  const rendered = new Set<string>();
  for (const match of source.matchAll(/const [A-Z_]+_PANE_TESTID = "([a-z-]+)";/g)) rendered.add(match[1] as string);
  // The two liquidation cohorts are derived in SymbolClient.tsx too: `liquidation-cohort-${cohort}`.
  assert.ok(source.includes("return `liquidation-cohort-${cohort}`;"), "the cohort testid derivation moved");
  for (const cohort of ["long", "short"]) rendered.add(`liquidation-cohort-${cohort}`);
  for (const paneId of F1_PANE_ORDER) {
    const testId = paneLayerTestId(paneId);
    assert.ok(rendered.has(testId), `${paneId} → "${testId}" is not a testid SymbolClient.tsx renders`);
  }
  // MORDE: a derivation that forgets the `_` → `-` rule yields a testid nobody renders.
  assert.equal(rendered.has("long_short-pane"), false);
});

test("T-01.6: F1_PANE_STRETCH weighs exactly the panes of F1_PANE_ORDER, all positive, both liquidation legs equal", () => {
  assert.deepEqual(Object.keys(F1_PANE_STRETCH).sort(), [...F1_PANE_ORDER].sort());
  for (const paneId of F1_PANE_ORDER) assert.ok(F1_PANE_STRETCH[paneId] > 0, `${paneId} has no weight`);
  assert.equal(F1_PANE_STRETCH.liquidation_long, F1_PANE_STRETCH.liquidation_short);
});

// ── Catalog fixture: one entry per series the six panes of phase 01 draw ──────────────────

function entry(metric: string, nature: Nature, overrides: Partial<SeriesKey> = {}): SeriesCatalogEntry {
  const key: SeriesKey = {
    provider: "binance",
    venue: "binance_usdm",
    instrumentId: "BTCUSDT",
    metric,
    cohort: "all",
    interval: "1m",
    unit: "USDT",
    denom: "NA",
    nature,
    tsConvention: nature === "FLOW" ? "AGGREGATE_OVER_BUCKET" : "POINT_AT_BUCKET_END",
    reduction: nature === "FLOW" ? "SUM" : "POINT",
    quantityField: "NA",
    labelShift: 0,
    aggregationScope: "instrument",
    verifiedBy: "fixture",
    ...overrides,
  };
  return { key, nativeGrid: "1m", maxStalenessMs: 120_000, priceUse: null, reconstructedFrom: null, publishedError: null };
}

const ENTRIES = {
  close: entry("klines_ohlc", "STOCK", { reduction: "CLOSE", tsConvention: "OHLC_OVER_BUCKET" }),
  volume: entry("klines_volume", "FLOW"),
  liquidationLong: entry("liquidation", "FLOW", { provider: "coinalyze", cohort: "long" }),
  liquidationShort: entry("liquidation", "FLOW", { provider: "coinalyze", cohort: "short" }),
  oi: entry("sum_open_interest", "STOCK", { interval: "5m" }),
  longShort: entry("long_short_ratio", "RATIO", { unit: "ratio", interval: "5m" }),
  cvd: entry("cvd_source", "FLOW"),
} as const;

type EntryName = keyof typeof ENTRIES;

const ID: Record<EntryName, string> = Object.fromEntries(
  Object.entries(ENTRIES).map(([name, value]) => [name, computeSeriesKeyId(value.key)]),
) as Record<EntryName, string>;

function catalogOf(entries: readonly SeriesCatalogEntry[]): ServedCatalog {
  return new Map(entries.map((value) => [computeSeriesKeyId(value.key), value]));
}

const CATALOG: ServedCatalog = catalogOf(Object.values(ENTRIES));

// ── Registry fixture ─────────────────────────────────────────────────────────────────────

function data(role: "primary" | "secondary", name: EntryName, kind: PaneSeriesSpec["kind"], scaleRef: string): PaneSeriesSpec {
  return { role, seriesKeyId: ID[name], kind, scaleRef, slotsRef: name };
}

function marks(name: EntryName, scaleRef: string): readonly PaneSeriesSpec[] {
  return [
    { role: "absence_mark", seriesKeyId: ID[name], kind: "histogram", scaleRef, slotsRef: name },
    { role: "zero_mark", seriesKeyId: ID[name], kind: "histogram", scaleRef, slotsRef: name },
  ];
}

function pane(paneId: PaneId, labelFrom: EntryName, series: readonly PaneSeriesSpec[], catalog = CATALOG): PaneSpec {
  return {
    paneId,
    stretch: 9,
    series,
    legend: resolvePaneLegend(ID[labelFrom], catalog),
    statusRef: paneId,
    coverageRef: paneId,
  };
}

function validRegistry(): PaneRegistry {
  return [
    pane("price", "close", [
      data("primary", "close", "candlestick", "right"),
      data("secondary", "volume", "histogram", "volume"),
      ...marks("volume", "volume_marks"),
    ]),
    pane("liquidation_long", "liquidationLong", [
      data("primary", "liquidationLong", "histogram", "right"),
      ...marks("liquidationLong", "liquidation_marks"),
    ]),
    pane("liquidation_short", "liquidationShort", [
      data("primary", "liquidationShort", "histogram", "right"),
      ...marks("liquidationShort", "liquidation_marks"),
    ]),
    pane("oi", "oi", [data("primary", "oi", "line", "right")]),
    pane("long_short", "longShort", [data("primary", "longShort", "line", "right")]),
    pane("cvd", "cvd", [data("primary", "cvd", "line", "right"), ...marks("cvd", "cvd_marks")]),
  ];
}

/** Replaces the pane `paneId` with `edit(pane)`, leaving every other pane untouched. */
function withPane(registry: PaneRegistry, paneId: PaneId, edit: (value: PaneSpec) => PaneSpec): PaneRegistry {
  return registry.map((value) => (value.paneId === paneId ? edit(value) : value));
}

function firedInvariants(violations: readonly PaneRegistryViolation[]): readonly PaneInvariant[] {
  return [...new Set(violations.map((violation) => violation.invariant))];
}

function validate(registry: PaneRegistry): readonly PaneRegistryViolation[] {
  return validatePaneRegistry(registry, { catalog: CATALOG });
}

// ── The baseline: the valid registry passes every check ─────────────────────────────────

test("a registry built from the catalog passes every invariant", () => {
  assert.deepEqual(validate(validRegistry()), []);
  assert.doesNotThrow(() => assertValidPaneRegistry(validRegistry(), { catalog: CATALOG }));
});

test("the paneIndex is the position in the array, and the phase-01 order is the six English keys", () => {
  assert.deepEqual(F1_PANE_ORDER, ["price", "liquidation_long", "liquidation_short", "oi", "long_short", "cvd"]);
  for (const paneId of F1_PANE_ORDER) {
    assert.match(paneId, /^[a-z]+(?:_[a-z]+)*$/);
  }
  const registry = validRegistry();
  assert.deepEqual(
    registry.map((value) => value.paneId),
    F1_PANE_ORDER,
  );
  F1_PANE_ORDER.forEach((paneId, position) => assert.equal(paneIndexOf(registry, paneId), position));
  assert.throws(() => paneIndexOf(registry.slice(1), "price"), PaneRegistryError);
});

// ── (i) every seriesKeyId exists in the served catalog ───────────────────────────────────

test("(i) FAILS: a series pointing at an id the catalog does not serve", () => {
  const registry = withPane(validRegistry(), "oi", (value) => ({
    ...value,
    series: [{ ...value.series[0], seriesKeyId: "0".repeat(64) }, ...value.series.slice(1)],
  }));
  const violations = validate(registry);
  assert.deepEqual(firedInvariants(violations), ["i", "iv"]); // the legend source is no longer drawn
  assert.equal(violations.find((v) => v.invariant === "i")?.paneIndex, 3);
});

test("(i) FAILS: the catalog stopped serving a series the registry draws", () => {
  const catalog = catalogOf(Object.values(ENTRIES).filter((value) => value !== ENTRIES.volume));
  const violations = validatePaneRegistry(validRegistry(), { catalog });
  // volume, its absence mark and its zero mark: three series, one missing id
  assert.deepEqual(firedInvariants(violations), ["i"]);
  assert.equal(violations.length, 3);
});

test("(i) PASSES: every id the registry carries is in the catalog", () => {
  const ids = validRegistry().flatMap((value) => value.series.map((series) => series.seriesKeyId));
  assert.ok(ids.every((id) => CATALOG.has(id)));
  assert.equal(firedInvariants(validate(validRegistry())).includes("i"), false);
});

// ── (ii) every pane has at least one primary ─────────────────────────────────────────────

test("(ii) FAILS: a pane whose only data series is secondary", () => {
  const registry = withPane(validRegistry(), "long_short", (value) => ({
    ...value,
    series: value.series.map((series) => ({ ...series, role: "secondary" as const })),
  }));
  const violations = validate(registry);
  assert.deepEqual(firedInvariants(violations), ["ii"]);
  assert.equal(violations[0].paneIndex, 4);
});

test("(ii) FAILS: a pane with no series at all", () => {
  const registry = withPane(validRegistry(), "oi", (value) => ({ ...value, series: [] }));
  assert.deepEqual(firedInvariants(validate(registry)), ["ii", "iv"]); // nothing drawn, so nothing names it
});

test("(ii) PASSES: a primary plus secondaries and marks", () => {
  const price = validRegistry()[0];
  assert.equal(price.series.filter((series) => series.role === "primary").length, 1);
  assert.equal(firedInvariants(validate(validRegistry())).includes("ii"), false);
});

// ── (iii) every FLOW data series carries the absence_mark + zero_mark pair ──────────────

test("(iii) FAILS: removing the absence_mark of a FLOW series", () => {
  const registry = withPane(validRegistry(), "liquidation_long", (value) => ({
    ...value,
    series: value.series.filter((series) => series.role !== "absence_mark"),
  }));
  const violations = validate(registry);
  assert.deepEqual(firedInvariants(violations), ["iii"]);
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /absence_mark/);
});

test("(iii) FAILS: removing the zero_mark of the volume (a FLOW secondary)", () => {
  const registry = withPane(validRegistry(), "price", (value) => ({
    ...value,
    series: value.series.filter((series) => series.role !== "zero_mark"),
  }));
  const violations = validate(registry);
  assert.deepEqual(firedInvariants(violations), ["iii"]);
  assert.match(violations[0].message, /zero_mark/);
});

test("(iii) FAILS: a mark that marks ANOTHER series does not count", () => {
  // the long leg's pane carrying the SHORT leg's marks: two marks present, neither is its own
  const registry = withPane(validRegistry(), "liquidation_long", (value) => ({
    ...value,
    series: [value.series[0], ...marks("liquidationShort", "liquidation_marks")],
  }));
  const violations = validate(registry);
  assert.deepEqual(firedInvariants(violations), ["iii"]);
  assert.equal(violations.length, 2);
});

test("(iii) FAILS: today's CVD pane — two FLOW lines, no marks — is refused", () => {
  // `SymbolClient.tsx` CvdPane draws delta and cumulative as two lines without the pair. This
  // is the shape the invariant refuses, and it is here so the conflict is measured, not guessed.
  const registry = withPane(validRegistry(), "cvd", (value) => ({
    ...value,
    series: [data("primary", "cvd", "line", "right"), data("secondary", "cvd", "line", "cvd_cumulative")],
  }));
  const violations = validate(registry);
  assert.deepEqual(firedInvariants(violations), ["iii"]);
  assert.equal(violations.length, 4); // 2 series x 2 missing marks
});

test("(iii) PASSES: STOCK and RATIO series need no marks; FLOW with the pair passes", () => {
  const registry = validRegistry();
  assert.equal(registry[paneIndexOf(registry, "oi")].series.length, 1);
  assert.equal(registry[paneIndexOf(registry, "long_short")].series.length, 1);
  assert.equal(firedInvariants(validate(registry)).includes("iii"), false);
});

// ── (iv) the legend is derived from the SeriesKey, never written by hand ────────────────

test("(iv) FAILS: a label written by hand", () => {
  const registry = withPane(validRegistry(), "oi", (value) => ({
    ...value,
    legend: { ...value.legend, label: "Open Interest" },
  }));
  const violations = validate(registry);
  assert.deepEqual(firedInvariants(violations), ["iv"]);
  assert.match(violations[0].message, /not derived/);
});

test("(iv) FAILS: a reading policy written by hand", () => {
  const registry = withPane(validRegistry(), "long_short", (value) => ({
    ...value,
    legend: { ...value.legend, readingPolicy: "STOCK" as const },
  }));
  assert.deepEqual(firedInvariants(validate(registry)), ["iv"]);
});

test("(iv) FAILS: a legend named after a series the pane does not draw", () => {
  const registry = withPane(validRegistry(), "oi", (value) => ({
    ...value,
    legend: resolvePaneLegend(ID.cvd, CATALOG),
  }));
  assert.deepEqual(firedInvariants(validate(registry)), ["iv"]);
});

test("(iv) FAILS: a label that was derived once goes stale when the catalog changes (CA-5)", () => {
  const registry = validRegistry();
  const catalog = new Map(CATALOG);
  catalog.set(ID.oi, { ...ENTRIES.oi, nativeGrid: "15m" });
  const violations = validatePaneRegistry(registry, { catalog });
  assert.deepEqual(firedInvariants(violations), ["iv"]);
  assert.equal(violations[0].paneIndex, paneIndexOf(registry, "oi"));
});

test("(iv) PASSES: changing the key in the test catalog changes the name", () => {
  const before = resolvePaneLegend(ID.oi, CATALOG);
  const catalog = new Map(CATALOG);
  catalog.set(ID.oi, { ...ENTRIES.oi, nativeGrid: "15m" });
  const after = resolvePaneLegend(ID.oi, catalog);
  assert.notEqual(before.label, after.label);
  assert.equal(before.readingPolicy, "STOCK");

  const byCohort = (value: SeriesCatalogEntry): string => `${value.key.metric}:${value.key.cohort}`;
  const registry = [pane("liquidation_long", "liquidationLong", validRegistry()[1].series)].map((value) => ({
    ...value,
    legend: resolvePaneLegend(ID.liquidationLong, CATALOG, byCohort),
  }));
  assert.equal(registry[0].legend.label, "liquidation:long");
  assert.deepEqual(validatePaneRegistry(registry, { catalog: CATALOG, deriveLabel: byCohort }), []);
  assert.throws(() => resolvePaneLegend("f".repeat(64), CATALOG), PaneRegistryError);
});

// ── (v) every setData time belongs to the canonical grid ─────────────────────────────────

const ONE_MINUTE_MS = 60_000;
const GRID_START_MS = 1_758_000_000_000 - (1_758_000_000_000 % ONE_MINUTE_MS);
/** Six consecutive bucket starts — the canonical grid (`charts/canonical-grid.ts`) of a 6-minute
 * window at `1m`, written out because the barrel does not export the builder. */
const GRID_MS: readonly number[] = Array.from({ length: 6 }, (_, slot) => GRID_START_MS + slot * ONE_MINUTE_MS);

type ScalarSlot = Parameters<typeof lineSeriesLossless>[0][number];

/** Six slots with one absent and one legitimate zero, placed on the grid. */
const SLOTS: readonly ScalarSlot[] = GRID_MS.map((time, index) => ({
  time,
  value: index === 2 ? null : index === 4 ? 0 : index + 1,
}));

function losslessPayloads(registry: PaneRegistry): RegistryPayloads {
  return registry.map((value) =>
    value.series.map((series) => {
      if (series.role === "absence_mark") return absenceMarkSeries(SLOTS, 1);
      if (series.role === "zero_mark") return zeroMarkSeries(SLOTS, 2);
      return lineSeriesLossless(SLOTS);
    }),
  );
}

function replaceSeriesPayload(
  payloads: RegistryPayloads,
  paneIndex: number,
  seriesIndex: number,
  items: readonly { readonly time: number }[],
): RegistryPayloads {
  return payloads.map((panePayloads, p) =>
    panePayloads.map((seriesPayload, s) => (p === paneIndex && s === seriesIndex ? items : seriesPayload)),
  );
}

test("(v) FAILS: one time off the grid (half a bucket late) in one series", () => {
  const registry = validRegistry();
  const shifted = lineSeriesLossless(SLOTS).map((item, index) => (index === 3 ? { ...item, time: item.time + 30 } : item));
  const payloads = replaceSeriesPayload(losslessPayloads(registry), paneIndexOf(registry, "oi"), 0, shifted);
  const violations = validateSetDataOnCanonicalGrid(registry, payloads, GRID_MS);
  assert.deepEqual(firedInvariants(violations), ["v"]);
  assert.equal(violations.length, 1);
  assert.match(violations[0].message, /off the canonical grid/);
});

test("(v) FAILS: epoch milliseconds handed where UNIX seconds belong", () => {
  const registry = validRegistry();
  const inMs = lineSeriesLossless(SLOTS).map((item) => ({ ...item, time: item.time * 1000 }));
  const payloads = replaceSeriesPayload(losslessPayloads(registry), 0, 0, inMs);
  assert.deepEqual(firedInvariants(validateSetDataOnCanonicalGrid(registry, payloads, GRID_MS)), ["v"]);
});

test("(v) FAILS: dropping the absent slot instead of sending whitespace", () => {
  const registry = validRegistry();
  // what `naiveDropGapsLine` does: the absent slot is not sent at all
  const droppedGaps = lineSeriesLossless(SLOTS).filter((item) => "value" in item);
  const payloads = replaceSeriesPayload(losslessPayloads(registry), paneIndexOf(registry, "cvd"), 0, droppedGaps);
  const violations = validateSetDataOnCanonicalGrid(registry, payloads, GRID_MS);
  assert.deepEqual(firedInvariants(violations), ["v"]);
  assert.match(violations[0].message, /5 time\(s\) for a grid of 6/);
});

test("(v) FAILS: a payload that stops early — every time on the grid, the tail missing", () => {
  const registry = validRegistry();
  const truncated = lineSeriesLossless(SLOTS).slice(0, 4);
  const payloads = replaceSeriesPayload(losslessPayloads(registry), paneIndexOf(registry, "oi"), 0, truncated);
  const violations = validateSetDataOnCanonicalGrid(registry, payloads, GRID_MS);
  assert.deepEqual(firedInvariants(violations), ["v"]);
  assert.match(violations[0].message, /4 time\(s\) for a grid of 6/);
});

test("(v) FAILS: a series with no payload, and a pane count that disagrees", () => {
  const registry = validRegistry();
  const payloads = losslessPayloads(registry);
  const missingSeries = payloads.map((panePayloads, p) => (p === 1 ? panePayloads.slice(0, 1) : panePayloads));
  assert.equal(validateSetDataOnCanonicalGrid(registry, missingSeries, GRID_MS).length, 2);
  const missingPane = payloads.slice(0, 5);
  const violations = validateSetDataOnCanonicalGrid(registry, missingPane, GRID_MS);
  assert.deepEqual(firedInvariants(violations), ["v"]);
  assert.equal(violations.find((v) => v.paneIndex === null)?.message, "5 pane payload(s) for 6 pane(s)");
});

test("(v) PASSES: every series through the lossless adapters lands exactly on the grid", () => {
  const registry = validRegistry();
  assert.deepEqual(validateSetDataOnCanonicalGrid(registry, losslessPayloads(registry), GRID_MS), []);
});

// ── Structure: not one of the five, but the registry cannot be read without it ──────────

test("structure FAILS: duplicate pane_id, a non-ASCII pane_id, a zero stretch, an empty registry", () => {
  const registry = validRegistry();
  const duplicated = [...registry, registry[3]];
  assert.deepEqual(firedInvariants(validate(duplicated)), ["structure"]);

  const accented = withPane(registry, "oi", (value) => ({ ...value, paneId: "preço" as PaneId }));
  assert.deepEqual(firedInvariants(validate(accented)), ["structure"]);

  const flat = withPane(registry, "cvd", (value) => ({ ...value, stretch: 0 }));
  assert.deepEqual(firedInvariants(validate(flat)), ["structure"]);

  assert.deepEqual(firedInvariants(validate([])), ["structure"]);
  assert.throws(() => assertValidPaneRegistry([], { catalog: CATALOG }), PaneRegistryError);
});
