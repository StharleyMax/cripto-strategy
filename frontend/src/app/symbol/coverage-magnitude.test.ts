/**
 * `paineis-de-fluxo` `T-05.4` — the coverage warning says HOW MUCH is missing, and disappears when
 * nothing is (`handoff/T-05.4-desenho.md` §6.2, items 1-8, with `C-1` of
 * `gates/T-05.4-design-critique.md` applied: `de`, not `em`, and a visible `%` per leg).
 *
 * Items 1-7 run the pure functions. Item 8 is a SOURCE SCAN of `SymbolClient.tsx`, the technique the
 * `*-dom-contract.test.ts` files of this directory use (no component renderer in any suite — see
 * `volume-subaxis-dom-contract.test.ts`'s own "WHY A SOURCE SCAN"): it proves where the chip is
 * SPELLED; that a browser painted it in one line is `e2e/40`'s job (A-4, A-6).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  COVERAGE_HEAD_GRACE_MS,
  coverageChipBody,
  coverageChipCompactText,
  coverageChipText,
  coverageDataAttributes,
  coverageGridMsOf,
  coverageHeadText,
  coverageScreenReaderText,
  formatCoveragePercent,
  formatCoverageSpan,
  parseNativeGridMs,
  summarizeCoverageMagnitude,
  WIRE_GRID_MS,
  type CoverageMagnitude,
} from "./coverage-magnitude.ts";
import type { SeriesHistoryRow } from "./series-history-envelope.ts";

const MINUTE_MS = 60_000;
const QUARTER_HOUR_MS = 15 * MINUTE_MS;
const HOUR_MS = 60 * MINUTE_MS;
/** A knowledge instant far from every row, so the head rule stays out of tests 1, 2, 4-7. */
const FAR_KNOWLEDGE_MS = 10_000 * HOUR_MS;

function row(eventTime: number, present: number, expected: number): SeriesHistoryRow {
  return {
    event_time: eventTime,
    available_at: present > 0 ? eventTime : null,
    value: present > 0 ? "1" : null,
    absence: present > 0 ? null : "NO_POINT",
    coverage: { present, expected },
  };
}

/** 96 hourly rows of 60 native facts — the `1h` window of `FIX-uso` §D-C, 5 760 facts = 4 days. */
function hourlyWindow(shortfalls: Readonly<Record<number, number>> = {}): SeriesHistoryRow[] {
  return Array.from({ length: 96 }, (_unused, index) => row((index + 1) * HOUR_MS, 60 - (shortfalls[index] ?? 0), 60));
}

function summarize(rows: readonly SeriesHistoryRow[], knowledgeTimeMs = FAR_KNOWLEDGE_MS): CoverageMagnitude {
  return summarizeCoverageMagnitude(rows, { knowledgeTimeMs, nativeGridMs: MINUTE_MS });
}

// ── §6.2 item 1 — a complete window has NO warning (the "0 de N" of `FIX-uso` §D-C) ────────────────

test("1: 96 rows answered in full ⇒ missingFacts 0, and the chip text is null (nothing renders)", () => {
  const magnitude = summarize(hourlyWindow());
  assert.equal(magnitude.missingFacts, 0);
  assert.equal(magnitude.expectedFacts, 5_760);
  assert.equal(magnitude.reaggregatedBuckets, 96, "the window WAS reaggregated — the old guard looked only at this");
  assert.equal(coverageChipText([{ label: "volume", magnitude }]), null);
});

// ── item 2 — the magnitude, in time, and the exact visible line ────────────────────────────────────

test("2: 11 partial rows summing 64 missing facts in 5 760 ⇒ 64/5760, 1.1, and the exact visible text", () => {
  const shortfalls = { 3: 10, 7: 5, 12: 4, 20: 6, 31: 3, 40: 9, 52: 7, 60: 2, 71: 8, 80: 5, 90: 5 };
  assert.equal(Object.values(shortfalls).reduce((sum, value) => sum + value, 0), 64);
  const magnitude = summarize(hourlyWindow(shortfalls));
  assert.equal(magnitude.missingFacts, 64);
  assert.equal(magnitude.expectedFacts, 5_760);
  assert.equal(magnitude.partialBuckets, 11);
  assert.equal(formatCoveragePercent(magnitude.missingFacts, magnitude.expectedFacts), "1.1");
  assert.equal(coverageChipBody([{ label: "volume", magnitude }]), "faltam 1 h 4 min de 4 d (1.1%)");
  assert.equal(coverageChipText([{ label: "volume", magnitude }]), "cobertura parcial — faltam 1 h 4 min de 4 d (1.1%)");
  assert.deepEqual(
    {
      missingMs: coverageDataAttributes(magnitude)["data-coverage-missing-ms"],
      expectedMs: coverageDataAttributes(magnitude)["data-coverage-expected-ms"],
    },
    { missingMs: String(64 * MINUTE_MS), expectedMs: String(5_760 * MINUTE_MS) },
    "the machine half carries missing × grid and expected × grid",
  );
});

// ── item 3 — the head: latency is not a hole ───────────────────────────────────────────────────────

test("3: the only partial row inside the head (knowledge − 300 000) ⇒ missing 0, head > 0; at − 600 001 it counts", () => {
  const knowledgeTimeMs = 100 * QUARTER_HOUR_MS;
  const rows = (headRowEventTime: number) => [
    row(knowledgeTimeMs - 3 * QUARTER_HOUR_MS, 15, 15),
    row(knowledgeTimeMs - 2 * QUARTER_HOUR_MS, 15, 15),
    row(headRowEventTime, 11, 15),
  ];
  const inside = summarize(rows(knowledgeTimeMs - 300_000), knowledgeTimeMs);
  assert.equal(inside.missingFacts, 0, "a bucket still being collected is not a hole");
  assert.equal(inside.headExcludedFacts, 4);
  assert.equal(inside.expectedFacts, 45, "the denominator is the loaded window, head included");
  assert.equal(coverageChipText([{ label: "liquidação", magnitude: inside }]), null);
  assert.equal(
    coverageHeadText([{ label: "x", magnitude: inside }]),
    "As barras mais recentes (4 min) ainda podem estar sendo consultadas e não entram nesta conta.",
  );

  const outside = summarize(rows(knowledgeTimeMs - (COVERAGE_HEAD_GRACE_MS + 1)), knowledgeTimeMs);
  assert.equal(outside.missingFacts, 4, "one millisecond past the grace, the same shortfall is a hole");
  assert.equal(outside.headExcludedFacts, 0);
  assert.equal(coverageHeadText([{ label: "x", magnitude: outside }]), null);
});

test("3 boundary: a row exactly one grace old is counted — the head is (knowledge − grace, knowledge]", () => {
  assert.equal(COVERAGE_HEAD_GRACE_MS, 600_000, "the grace is 2 × the 300 s collector cadence (§2.2)");
  const headRow = row(1_000 * MINUTE_MS, 11, 15);
  assert.equal(summarize([headRow], headRow.event_time + COVERAGE_HEAD_GRACE_MS).missingFacts, 4);
  assert.equal(summarize([headRow], headRow.event_time + COVERAGE_HEAD_GRACE_MS - 1).missingFacts, 0);
});

// ── item 4 — a native window (`1m`) has nothing to report ──────────────────────────────────────────

test("4: coverage null on every row (the 1m native request) ⇒ 0/0 and nothing rendered", () => {
  const rows: SeriesHistoryRow[] = Array.from({ length: 10 }, (_unused, index) => ({
    event_time: index * MINUTE_MS,
    available_at: index * MINUTE_MS,
    value: "1",
    absence: null,
    coverage: null,
  }));
  const magnitude = summarize(rows);
  assert.deepEqual(
    [magnitude.missingFacts, magnitude.expectedFacts, magnitude.reaggregatedBuckets, magnitude.headExcludedFacts],
    [0, 0, 0, 0],
  );
  assert.equal(coverageChipText([{ label: "cvd", magnitude }]), null);
  assert.equal(coverageScreenReaderText([{ label: "cvd", magnitude }]), "");
});

// ── item 5 — never `0.0%` on a warning that exists ─────────────────────────────────────────────────

test("5: one missing fact in 5 760 ⇒ <0.1, never 0.0; and never 100.0 while something is present", () => {
  const magnitude = summarize(hourlyWindow({ 50: 1 }));
  assert.equal(formatCoveragePercent(magnitude.missingFacts, magnitude.expectedFacts), "<0.1");
  assert.equal(coverageChipBody([{ label: "volume", magnitude }]), "faltam 1 min de 4 d (<0.1%)");
  assert.equal(formatCoveragePercent(5_759, 5_760), ">99.9");
  assert.equal(formatCoveragePercent(5_760, 5_760), "100.0");
});

// ── item 6 — the duration format ───────────────────────────────────────────────────────────────────

test("6: formatCoverageSpan writes min / h min / d h, truncated on the hour from one day on", () => {
  assert.equal(formatCoverageSpan(720_000), "12 min");
  assert.equal(formatCoverageSpan(3_840_000), "1 h 4 min");
  assert.equal(formatCoverageSpan(345_600_000), "4 d");
  assert.equal(formatCoverageSpan(601_200_000), "6 d 23 h");
  assert.equal(formatCoverageSpan(3_600_000), "1 h");
  assert.equal(formatCoverageSpan(60_000), "1 min");
  assert.equal(formatCoverageSpan(4 * HOUR_MS), "4 h");
});

test("6 CI-2: a missing span rounds UP and a denominator DOWN — the rounding can only enlarge the warning", () => {
  const sixDays22h30 = 6 * 24 * HOUR_MS + 22 * HOUR_MS + 30 * MINUTE_MS;
  assert.equal(formatCoverageSpan(sixDays22h30, "down"), "6 d 22 h");
  assert.equal(formatCoverageSpan(sixDays22h30, "up"), "6 d 23 h");
  assert.equal(formatCoverageSpan(59.5 * MINUTE_MS, "up"), "1 h", "the carry into the next unit is formatted in that unit");
});

// ── item 7 — liquidation: ONE chip, the legs named only when they differ ───────────────────────────

test("7: legs short by different amounts ⇒ each leg with its own visible % (C-1), one shared denominator", () => {
  const short = summarize(hourlyWindow({ 10: 12 }));
  const long = summarize(hourlyWindow({ 10: 20, 30: 20 }));
  assert.equal(
    coverageChipBody([
      { label: "short", magnitude: short },
      { label: "long", magnitude: long },
    ]),
    "short: faltam 12 min (0.2%) · long: faltam 40 min (0.7%), de 4 d",
  );
});

test("7: legs short by the SAME amount ⇒ the single-series line, no labels (no redundant twin chip)", () => {
  const leg = summarize(hourlyWindow({ 5: 30, 6: 34 }));
  assert.equal(
    coverageChipBody([
      { label: "short", magnitude: leg },
      { label: "long", magnitude: leg },
    ]),
    "faltam 1 h 4 min de 4 d (1.1%)",
  );
});

test("7: only one leg short ⇒ that leg named, with its own denominator and %", () => {
  const whole = summarize(hourlyWindow());
  const long = summarize(hourlyWindow({ 10: 20, 30: 20 }));
  assert.equal(
    coverageChipBody([
      { label: "short", magnitude: whole },
      { label: "long", magnitude: long },
    ]),
    "long: faltam 40 min de 4 d (0.7%)",
  );
});

test("C-2: the long sentence names magnitude, window, %, bars and the head — for a real sr-only node", () => {
  const knowledgeTimeMs = 97 * HOUR_MS + 5 * MINUTE_MS;
  const rows = hourlyWindow({ 3: 10, 7: 5 });
  rows.push(row(97 * HOUR_MS, 57, 60));
  const magnitude = summarize(rows, knowledgeTimeMs);
  assert.equal(
    coverageScreenReaderText([{ label: "volume", magnitude }]),
    "Cobertura parcial: faltam 15 min de dado nativo, de 4 d 1 h nesta janela (0.3%), em 2 de 97 barras — " +
      "a soma dessas barras está subestimada. " +
      "As barras mais recentes (3 min) ainda podem estar sendo consultadas e não entram nesta conta.",
  );
});

test("native grid: the catalog's `1min`/`5min` parse; anything else falls back to the wire grid", () => {
  assert.equal(parseNativeGridMs("1min"), MINUTE_MS);
  assert.equal(parseNativeGridMs("5min"), 5 * MINUTE_MS);
  assert.equal(parseNativeGridMs("1h"), HOUR_MS);
  assert.equal(parseNativeGridMs("weekly"), null);
  assert.equal(parseNativeGridMs(null), null);
  assert.equal(coverageGridMsOf(undefined), WIRE_GRID_MS);
  assert.equal(coverageGridMsOf("5min"), 5 * MINUTE_MS);
});

// ── item 8 — WHERE the chip is spelled (source scan) ───────────────────────────────────────────────

/** `estrutura-do-front` `T-01.3` — the legend and the absence/coverage marks left `SymbolClient.tsx` for
 * `chart/legend/` and `chart/marks/`. The files are read together with it, so the universe this file scans
 * is the one `SymbolClient.tsx` alone was before the move. */
const LEGEND_AND_MARKS_FILES = [
  "chart/legend/PaneLegend.tsx",
  "chart/legend/legend-frame.ts",
  "chart/legend/LegendValue.tsx",
  "chart/marks/AbsenceNote.tsx",
  "chart/marks/PartialCoverageMark.tsx",
  "chart/marks/BeyondCoverageBadge.tsx",
] as const;
const SYMBOL_CLIENT = ["SymbolClient.tsx", ...LEGEND_AND_MARKS_FILES]
  .map((file) => readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), file), "utf8"))
  .join("\n");

/** The body of `function <name>(` up to the next top-level `function `/`const ` declaration. */
function componentSource(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} not found — the anchor moved, fix this test`);
  const rest = source.slice(start + 1);
  const next = rest.search(/\n(?:function |const |type |interface )/);
  return next < 0 ? rest : rest.slice(0, next);
}

/** For every `<PartialCoverageMark` in `jsx`: is it inside a `<PaneLegendLine>`, and what follows it
 * before that line closes. */
function chipPlacements(jsx: string): { insideLine: boolean; followedBySibling: boolean }[] {
  const placements: { insideLine: boolean; followedBySibling: boolean }[] = [];
  let index = jsx.indexOf("<PartialCoverageMark");
  while (index >= 0) {
    const before = jsx.slice(0, index);
    const opens = before.split("<PaneLegendLine>").length - 1;
    const closes = before.split("</PaneLegendLine>").length - 1;
    const afterSelfClose = jsx.indexOf("/>", index) + 2;
    const lineEnd = jsx.indexOf("</PaneLegendLine>", afterSelfClose);
    const between = jsx.slice(afterSelfClose, lineEnd).replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    placements.push({ insideLine: opens > closes, followedBySibling: /<[A-Za-z]/.test(between) });
    index = jsx.indexOf("<PartialCoverageMark", index + 1);
  }
  return placements;
}

function assertChipPlacement(source: string, component: string, mustHaveSiblingAfter: boolean): void {
  const placements = chipPlacements(componentSource(source, component));
  assert.equal(placements.length, 1, `${component}: exactly one coverage chip`);
  assert.ok(placements[0].insideLine, `${component}: the chip must be a DESCENDANT of the series' PaneLegendLine, not a block after it`);
  if (mustHaveSiblingAfter) {
    assert.ok(placements[0].followedBySibling, `${component}: the chip must not be the line's LAST child — the last child is the one that truncates`);
  }
}

test("8: the chip is inside the PaneLegendLine that names the series — volume and liquidation not as the last child", () => {
  assertChipPlacement(SYMBOL_CLIENT, "VolumeSubAxis", true);
  assertChipPlacement(SYMBOL_CLIENT, "LiquidationPane", true);
  assertChipPlacement(SYMBOL_CLIENT, "CvdPane", false);
  assert.equal(
    chipPlacements(componentSource(SYMBOL_CLIENT, "LiquidationLegGroup")).length,
    0,
    "liquidation has ONE chip per pane (§2.4), never one per leg",
  );
});

test("8 MORDE: the T-03.12 form — the chip as a block after the line — is caught", () => {
  const volume = componentSource(SYMBOL_CLIENT, "VolumeSubAxis");
  const chip = /\s*<PartialCoverageMark legs=\{\[[^\n]*\]\} \/>/.exec(volume);
  assert.ok(chip !== null, "volume chip anchor moved — fix this MORDE");
  const moved = volume.replace(chip[0], "").replace("</PaneLegendLine>", `</PaneLegendLine>${chip[0]}`);
  assert.notEqual(moved, volume);
  assert.equal(chipPlacements(moved)[0].insideLine, false, "MORDE: a block after the line must read as outside it");
  const last = volume.replace(chip[0], "").replace("<VolumeScaleNote />", `<VolumeScaleNote />${chip[0]}`);
  assert.equal(chipPlacements(last)[0].followedBySibling, false, "MORDE: the chip as the last child must be caught");
});

test("8: the two liquidation legs sit in ONE flex-row, wrapping, not stacked in the legend column", () => {
  const pane = componentSource(SYMBOL_CLIENT, "LiquidationPane");
  assert.match(pane, /<div data-liquidation-legs-row="" className="flex flex-row flex-wrap[^"]*">\s*\{cohortsTopFirst\.map\(\(cohort\) => \(\s*<LiquidationLegGroup/);
});

test("the null rule lives in the pure function: the component renders nothing exactly when coverageChipText is null", () => {
  const mark = componentSource(SYMBOL_CLIENT, "PartialCoverageMark");
  assert.match(mark, /const visible = coverageChipText\(legs\);\s*\n\s*if \(visible === null\) \{\s*\n\s*return null;/);
  assert.doesNotMatch(mark, /totalReaggregatedBuckets|reaggregatedBuckets === 0/, "the T-03.12 guard (rendered '0 de N') must not come back");
  assert.match(mark, /<PartialCoverageGlyph \/>\s*\n[\s\S]*?<span aria-hidden="true" data-coverage-visible="full"/, "the glyph leads the word");
  assert.match(
    mark,
    /data-fact=\{`\$\{leg\.factKey\}:\$\{leg\.magnitude\.missingFacts\}\/\$\{leg\.magnitude\.expectedFacts\}`\}/,
    "the data-fact carries the magnitude in FACTS (§2.6), not partialBuckets/reaggregatedBuckets",
  );
  assert.match(mark, /<span className="sr-only">\{coverageScreenReaderText\(legs\)\}<\/span>/, "C-2: a real sr-only node");
  assert.doesNotMatch(mark, /\btitle=/, "C-2: never title");
});

test("MORDE: the T-03.12 guard and data-fact put back are caught", () => {
  const mark = componentSource(SYMBOL_CLIENT, "PartialCoverageMark");
  const guarded = mark.replace("if (visible === null) {", "if (legs[0].magnitude.reaggregatedBuckets === 0) {");
  assert.notEqual(guarded, mark);
  assert.doesNotMatch(guarded, /const visible = coverageChipText\(legs\);\s*\n\s*if \(visible === null\) \{/);
  const buckets = mark.replace(
    "${leg.magnitude.missingFacts}/${leg.magnitude.expectedFacts}",
    "${leg.magnitude.partialBuckets}/${leg.magnitude.reaggregatedBuckets}",
  );
  assert.notEqual(buckets, mark);
  assert.doesNotMatch(buckets, /\$\{leg\.magnitude\.missingFacts\}\/\$\{leg\.magnitude\.expectedFacts\}/);
});

// ── §10.5 (`C-3`) — the COMPACT form, painted below 1140 px of legend content width ───────────────────

/** The five branches of `coverageChipBody`, each with the spans it must carry. */
function compactCases(): ReadonlyArray<{ readonly name: string; readonly legs: Parameters<typeof coverageChipBody>[0]; readonly compact: string }> {
  const single = summarize(hourlyWindow({ 5: 30, 6: 34 }));
  const short = summarize(hourlyWindow({ 10: 12 }));
  const long = summarize(hourlyWindow({ 10: 20, 30: 20 }));
  const whole = summarize(hourlyWindow());
  /** 48 hourly rows = 2 d: a leg whose denominator differs from the 4 d one. */
  const shortWindow = summarize(hourlyWindow({ 2: 6 }).slice(0, 48));
  return [
    { name: "one series", legs: [{ label: "volume", magnitude: single }], compact: "faltam 1 h 4 min (1.1%)" },
    {
      name: "two legs, same shortfall",
      legs: [
        { label: "short", magnitude: single },
        { label: "long", magnitude: single },
      ],
      compact: "faltam 1 h 4 min (1.1%)",
    },
    {
      name: "one leg of two",
      legs: [
        { label: "short", magnitude: whole },
        { label: "long", magnitude: long },
      ],
      compact: "long: faltam 40 min (0.7%)",
    },
    {
      name: "two legs, shared denominator",
      legs: [
        { label: "short", magnitude: short },
        { label: "long", magnitude: long },
      ],
      compact: "short: faltam 12 min (0.2%) · long: faltam 40 min (0.7%)",
    },
    {
      name: "two legs, different denominators",
      legs: [
        { label: "short", magnitude: shortWindow },
        { label: "long", magnitude: long },
      ],
      compact: "short: faltam 6 min (0.2%) · long: faltam 40 min (0.7%)",
    },
  ];
}

test("C-3: the five compact forms — no `cobertura parcial — `, no denominator", () => {
  for (const { name, legs, compact } of compactCases()) {
    assert.equal(coverageChipCompactText(legs), compact, name);
    assert.doesNotMatch(compact, /cobertura parcial/, name);
    assert.doesNotMatch(compact, / de \d/, `${name}: no \` de <span>\``);
  }
});

test("C-3: compact is null exactly when the full chip is null", () => {
  const whole = summarize(hourlyWindow());
  assert.equal(coverageChipText([{ label: "volume", magnitude: whole }]), null);
  assert.equal(coverageChipCompactText([{ label: "volume", magnitude: whole }]), null);
  for (const { name, legs } of compactCases()) {
    assert.notEqual(coverageChipText(legs), null, name);
    assert.notEqual(coverageChipCompactText(legs), null, name);
  }
});

test("C-3 (CI-1): the compact form IS the full form minus the two declared pieces, so nothing else is lost", () => {
  for (const { name, legs } of compactCases()) {
    const full = coverageChipText(legs) ?? "";
    const compact = coverageChipCompactText(legs) ?? "";
    assert.ok(compact.length < full.length, `${name}: compact (${compact.length}) < full (${full.length})`);
    const stripped = full
      .replace(/^cobertura parcial — /, "")
      .replace(/ de \d[^()]*(?= \()/g, "")
      .replace(/, de \d.*$/, "");
    assert.equal(compact, stripped, `${name}: compact = full − prefix − denominator`);
  }
});

test("MORDE C-3 (ablation C3-4 at unit level): the full body returned as the compact form is caught in all five branches", () => {
  for (const { name, legs, compact } of compactCases()) {
    assert.notEqual(coverageChipBody(legs), compact, `${name}: the full body must NOT pass as the compact form`);
    assert.notEqual(coverageChipText(legs), compact, name);
  }
});

test("C-3: the chip renders BOTH forms, aria-hidden, and the legend is the named container that picks one", () => {
  const mark = componentSource(SYMBOL_CLIENT, "PartialCoverageMark");
  assert.match(
    mark,
    /<span aria-hidden="true" data-coverage-visible="full" className="@max-\[1140px\]\/legend:hidden">\s*\{visible\}/,
  );
  assert.match(
    mark,
    /<span aria-hidden="true" data-coverage-visible="compact" className="hidden @max-\[1140px\]\/legend:inline">\s*\{coverageChipCompactText\(legs\)\}/,
  );
  const legend = componentSource(SYMBOL_CLIENT, "PaneLegend");
  assert.match(legend, /data-pane-legend=""\s*\n\s*className="@container\/legend /);
});

// W7-QA-FRONT (`gates/W7-QA-FRONT.md`, mutation U4): the envelope only checks that `present`/`expected`
// are INTEGERS (`series-history-envelope.ts`), never `present <= expected`. The `Math.max(0, …)` in
// `summarizeCoverageMagnitude` is therefore the only guard against a row reporting MORE facts than it
// expects (a revision double-count upstream), and it had no test: removing it left the suite green.
// Without the clamp, the surplus row cancels a real hole elsewhere and the warning under-reports.
test("QA U4: a row with present > expected never cancels a real hole elsewhere (the clamp bites)", () => {
  const rows = hourlyWindow({ 10: 3 });
  rows[20] = row(21 * HOUR_MS, 62, 60);
  const magnitude = summarize(rows);
  assert.equal(magnitude.missingFacts, 3);
  assert.equal(magnitude.partialBuckets, 1);
});

test("QA U4 (cala): with no surplus row the same window counts the same hole", () => {
  assert.equal(summarize(hourlyWindow({ 10: 3 })).missingFacts, 3);
});
