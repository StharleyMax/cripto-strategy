/**
 * `paineis-de-fluxo` `T-05.4` (`handoff/T-05.4-desenho.md` §2, D1; plan `05` item 5.4, DoD 4) — HOW
 * MUCH of a regime-A panel (`Σ` volume, CVD delta, liquidation) is missing, in TIME, not in buckets.
 *
 * Before this module the warning said "11 de 96 buckets reagregados", which reads the same for eleven
 * buckets short of one minute each and for eleven empty buckets (`FIX-uso-2026-10-02.md` §D-C), and it
 * rendered "0 de N" whenever any reaggregation happened at all, because the guard looked at
 * `totalReaggregatedBuckets`, not at what was missing. The magnitude here is
 * `Σ (expected − present)` over the panel's reaggregated rows — native FACTS that are missing —
 * multiplied by the series' native grid: that product is time.
 *
 * Browser-safe on purpose (no `node:crypto`): `SymbolClient.tsx`, a Client Component, imports the
 * formatters and the type from here. `view-model.ts` cannot be imported there (`computeSeriesKeyId`
 * pulls `node:crypto`, `web-fullstack.browser-imports-server`), which is why the previous summary
 * type had to be DUPLICATED in `SymbolClient.tsx`; this module removes the duplicate instead of
 * growing it.
 *
 * Pure, no I/O, same tier as `view-model.ts` (`ADR-003` FR-1). Identifiers and docstrings in
 * English; the microcopy returned by the `*Text` functions is pt-BR (`CLAUDE.md`, table lines 1 and 8).
 */

import type { SeriesHistoryRow } from "./series-history-envelope.ts";

/** The one-minute WIRE grid `/series-history` steps its native instants on (`series_history.py`,
 * `native_instants = range(first_native_instant, window_end_ms + 1, _GRID_STEP_MS)`). `expected` of a
 * reaggregated row is `len(native_readings)` over exactly that grid, so this is the unit `expected`
 * is counted in when a catalog entry declares no parsable native grid. */
export const WIRE_GRID_MS = 60_000;

/**
 * How recent a row may be and still stay OUT of the warning (`T-05.4-desenho.md` §2.2): the newest
 * bucket of liquidation can be partial for up to one collector cadence (`300 s`,
 * `backend/src/modules/sentimento/infra/collectors_cli.py:439`, `_DEFAULT_LIQUIDATION_CYCLE_INTERVAL_S`)
 * plus the spread of one run (~227 s, `T-05.2-desenho.md` §1 and §3/D4). Latency is not a hole;
 * counting it would light the warning almost permanently, which is the alarm fatigue the owner asked
 * about. `[INFERRED: 2 × the default cadence covers one cadence plus one run's spread]`.
 *
 * ⚠️ A `web` constant mirroring a `sentimento` setting, declared rather than hidden: if the operator
 * slows the collector down (`RS-3.5`), the head starts showing as partial — one alarm MORE, never one
 * less. The unit of exclusion is the ROW: a `4h` bucket whose newest minute is inside the grace stays
 * out whole. Counting minute by minute would need a per-minute presence vector the route does not
 * serve.
 *
 * `event_time` of a reaggregated row is the OUTER bucket end (`series_history.py`,
 * `_reaggregated_row(outer_bucket_end, …)` → `event_time=outer_bucket_end`), the newest native instant
 * the bucket covers — so the rule reads "the bucket's newest minute is within the grace".
 */
export const COVERAGE_HEAD_GRACE_MS = 600_000;

/** One panel's coverage, folded. Every count is over rows with `coverage !== null` (reaggregated);
 * a native row (`coverage === null`, the `1m` request) contributes to none of them. */
export interface CoverageMagnitude {
  /** Rows OUTSIDE the head with `present < expected` — the `k` of "em k de K barras". */
  readonly partialBuckets: number;
  /** Every reaggregated row of the window, head included — the `K`. */
  readonly reaggregatedBuckets: number;
  /** `Σ (expected − present)` over the rows outside the head. The warning exists iff this is `>= 1`. */
  readonly missingFacts: number;
  /** `Σ expected` over EVERY reaggregated row, head included: the denominator is the LOADED WINDOW
   * (`T-05.4-desenho.md` §2.1), so a `4 d` window reads "de 4 d" and not "de 3 d 23 h" because the
   * head was set aside. The head's own shortfall is what stays out, in `headExcludedFacts`. */
  readonly expectedFacts: number;
  /** `Σ (expected − present)` over the head rows (`COVERAGE_HEAD_GRACE_MS`), kept OUT of the warning
   * and published on its own (`T-05.4-desenho.md` §2.6, falsifier F-3: it returns to `0` once the
   * collector catches up, or the head was a real hole). */
  readonly headExcludedFacts: number;
  /** The native grid `missingFacts`/`expectedFacts` are multiplied by to become time. */
  readonly nativeGridMs: number;
}

export interface CoverageClock {
  /** `knowledge_time_ms` of the request the rows answer (`request-window.ts`). */
  readonly knowledgeTimeMs: number;
  readonly nativeGridMs: number;
}

/** Folds a panel's rows into `CoverageMagnitude`. Order-independent: the pager may pass the whole
 * accumulated window and get the honest count for exactly the rows it passed. */
export function summarizeCoverageMagnitude(rows: readonly SeriesHistoryRow[], clock: CoverageClock): CoverageMagnitude {
  const headStartMs = clock.knowledgeTimeMs - COVERAGE_HEAD_GRACE_MS;
  let partialBuckets = 0;
  let reaggregatedBuckets = 0;
  let missingFacts = 0;
  let expectedFacts = 0;
  let headExcludedFacts = 0;
  for (const row of rows) {
    if (row.coverage === null) {
      continue;
    }
    reaggregatedBuckets += 1;
    expectedFacts += row.coverage.expected;
    const missing = Math.max(0, row.coverage.expected - row.coverage.present);
    if (row.event_time > headStartMs) {
      headExcludedFacts += missing;
      continue;
    }
    missingFacts += missing;
    if (missing > 0) {
      partialBuckets += 1;
    }
  }
  return { partialBuckets, reaggregatedBuckets, missingFacts, expectedFacts, headExcludedFacts, nativeGridMs: clock.nativeGridMs };
}

const NATIVE_GRID_PATTERN = /^(\d+)\s*(min|m|h|d)$/;
const NATIVE_GRID_UNIT_MS: Readonly<Record<string, number>> = { min: 60_000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/**
 * The catalog's `native_grid` (`"1min"`, `"5min"` — `GET /series-catalog`, `[MEDIDO 2026-10-02: 9
 * metrics of BTCUSDT, only `1min`/`5min`]`) in ms. `timeframeStepMs` cannot read it: it serves the
 * TF set (`"1m"`, `"5m"`, …) and throws on `"1min"`. `null` when the string is absent or unparsable —
 * the caller decides the fallback, never this parser.
 */
export function parseNativeGridMs(nativeGrid: string | null | undefined): number | null {
  if (nativeGrid === null || nativeGrid === undefined) {
    return null;
  }
  const match = NATIVE_GRID_PATTERN.exec(nativeGrid.trim());
  if (match === null) {
    return null;
  }
  const count = Number(match[1]);
  const unitMs = NATIVE_GRID_UNIT_MS[match[2]];
  return count > 0 && unitMs !== undefined ? count * unitMs : null;
}

/** One native grid per series that carries the warning — resolved once by `page.tsx` off the catalog
 * and frozen into the pager's static context (`panel-assembly.ts::AssemblyStaticContext`). */
export interface CoverageGridMs {
  readonly volume: number;
  readonly cvd: number;
  readonly liquidationLong: number;
  readonly liquidationShort: number;
}

/** The native grid a coverage is multiplied by: the catalog's, or the wire grid `expected` is
 * counted on when the catalog entry is missing (its rows are then `[]`, so nothing is multiplied). */
export function coverageGridMsOf(nativeGrid: string | null | undefined): number {
  return parseNativeGridMs(nativeGrid) ?? WIRE_GRID_MS;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const MINUTES_PER_DAY = 1_440;
const HOURS_PER_DAY = 24;

/**
 * A duration as the warning writes it (`T-05.4-desenho.md` §2.4): `N min` below one hour, `N h` or
 * `N h M min` below one day, `N d` or `N d H h` from one day on (whole hours). `formatSpan` of the OI
 * freshness is NOT reused: it writes `96 h` for four days, and its contract is another one.
 *
 * `rounding` — `CI-2` of `gates/T-05.4-design-critique.md`: a MISSING span is rounded UP and a
 * denominator DOWN, so the rounding can only make the warning look bigger, never smaller (the
 * "fail to the safe side" of §2.2). Exact values are unaffected either way.
 */
export function formatCoverageSpan(ms: number, rounding: "down" | "up" = "down"): string {
  const round = rounding === "up" ? Math.ceil : Math.floor;
  const totalMinutes = round(Math.max(0, ms) / MINUTE_MS);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  if (totalMinutes < MINUTES_PER_DAY) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
  }
  const totalHours = round(Math.max(0, ms) / HOUR_MS);
  const days = Math.floor(totalHours / HOURS_PER_DAY);
  const hours = totalHours % HOURS_PER_DAY;
  return hours === 0 ? `${days} d` : `${days} d ${hours} h`;
}

/**
 * `100 × missing / expected` with ONE decimal and a decimal POINT (`DESIGN_SYSTEM.md` §4: a numeral on
 * this screen never carries a decimal comma). Never `0.0` for a warning that exists (`<0.1`), and
 * never `100.0` while something is still present (`>99.9`). Returns the number only; the caller
 * writes the `%`.
 */
export function formatCoveragePercent(missing: number, expected: number): string {
  if (expected <= 0 || missing <= 0) {
    return "0.0";
  }
  const percent = (100 * missing) / expected;
  const text = percent.toFixed(1);
  if (text === "0.0") {
    return "<0.1";
  }
  if (text === "100.0" && missing < expected) {
    return ">99.9";
  }
  return text;
}

/** One series of a pane's warning: `label` is spoken only when the pane has more than one (the
 * liquidation legs, `short`/`long`). */
export interface CoverageLeg {
  readonly label: string;
  readonly magnitude: CoverageMagnitude;
}

function missingSpan(magnitude: CoverageMagnitude): string {
  return formatCoverageSpan(magnitude.missingFacts * magnitude.nativeGridMs, "up");
}

function expectedSpan(magnitude: CoverageMagnitude): string {
  return formatCoverageSpan(magnitude.expectedFacts * magnitude.nativeGridMs, "down");
}

function percentOf(magnitude: CoverageMagnitude): string {
  return formatCoveragePercent(magnitude.missingFacts, magnitude.expectedFacts);
}

/** The legs that warn: `missingFacts >= 1` (`T-05.4-desenho.md` §2.3 — no percentage threshold). */
export function warningLegs<Leg extends CoverageLeg>(legs: readonly Leg[]): readonly Leg[] {
  return legs.filter((leg) => leg.magnitude.missingFacts >= 1);
}

/**
 * The VISIBLE text after `cobertura parcial — `, or `null` when nothing is missing outside the head
 * (the chip then does not exist). `C-1` of the gate applied: `de`, never `em` (part of a whole — "em
 * 4 d" read as "há 4 dias"), and with two legs short by different amounts each one carries its own
 * VISIBLE percentage, because the percentage IS the proportionality §2.3 promises.
 *
 *   one series:                 `faltam 1 h 4 min de 4 d (1.1%)`
 *   two legs, same shortfall:   `faltam 1 h 4 min de 4 d (1.1%)`          (one chip per pane, §2.4)
 *   one leg of two:             `long: faltam 40 min de 4 d (0.7%)`
 *   two legs, different:        `short: faltam 12 min (0.2%) · long: faltam 40 min (0.7%), de 4 d`
 */
export function coverageChipBody(legs: readonly CoverageLeg[]): string | null {
  return chipBody(legs, "full");
}

/**
 * The COMPACT visible form of the chip (`T-05.4-desenho.md` §10.2, `C-3`), painted instead of the
 * full one when the pane legend is narrower than 1140 px: the same five branches as
 * `coverageChipBody`, without the `cobertura parcial — ` prefix and without the denominator
 * (`de <span>` / `, de <span>`). It is the full form minus those two declared pieces, so every
 * `faltam <span>` and every `(p%)` survives in the same order. `null` exactly when
 * `coverageChipText` is `null`. The denominator stays in the `sr-only` sentence and in
 * `data-coverage-expected-ms`.
 *
 *   one series:                 `faltam 1 h 4 min (1.1%)`
 *   one leg of two:             `long: faltam 40 min (0.7%)`
 *   two legs, different:        `short: faltam 12 min (0.2%) · long: faltam 40 min (0.7%)`
 */
export function coverageChipCompactText(legs: readonly CoverageLeg[]): string | null {
  return chipBody(legs, "compact");
}

function chipBody(legs: readonly CoverageLeg[], form: "full" | "compact"): string | null {
  const warning = warningLegs(legs);
  if (warning.length === 0) {
    return null;
  }
  const denominator = (magnitude: CoverageMagnitude) => (form === "full" ? ` de ${expectedSpan(magnitude)}` : "");
  const whole = (magnitude: CoverageMagnitude) =>
    `faltam ${missingSpan(magnitude)}${denominator(magnitude)} (${percentOf(magnitude)}%)`;
  if (legs.length === 1) {
    return whole(warning[0].magnitude);
  }
  const first = warning[0].magnitude;
  const allSame =
    warning.length === legs.length &&
    warning.every(
      (leg) => leg.magnitude.missingFacts === first.missingFacts && leg.magnitude.expectedFacts === first.expectedFacts,
    );
  if (allSame) {
    return whole(first);
  }
  if (warning.length === 1) {
    return `${warning[0].label}: ${whole(first)}`;
  }
  const sharedDenominator = warning.every((leg) => leg.magnitude.expectedFacts === first.expectedFacts);
  if (sharedDenominator) {
    const parts = warning.map((leg) => `${leg.label}: faltam ${missingSpan(leg.magnitude)} (${percentOf(leg.magnitude)}%)`);
    return form === "full" ? `${parts.join(" · ")}, de ${expectedSpan(first)}` : parts.join(" · ");
  }
  return warning.map((leg) => `${leg.label}: ${whole(leg.magnitude)}`).join(" · ");
}

/** The whole visible line of the chip (after the glyph). */
export function coverageChipText(legs: readonly CoverageLeg[]): string | null {
  const body = coverageChipBody(legs);
  return body === null ? null : `cobertura parcial — ${body}`;
}

/**
 * The long sentence of §2.4, for a REAL `sr-only` node (`C-2`: never `title`, which is a hover
 * affordance and read inconsistently by screen readers). One sentence per warning leg, then the head
 * sentence only when the head kept something out.
 */
export function coverageScreenReaderText(legs: readonly CoverageLeg[]): string {
  const sentences = warningLegs(legs).map((leg) => {
    const magnitude = leg.magnitude;
    const subject = legs.length > 1 ? `Cobertura parcial (${leg.label})` : "Cobertura parcial";
    return (
      `${subject}: faltam ${missingSpan(magnitude)} de dado nativo, de ${expectedSpan(magnitude)} nesta janela ` +
      `(${percentOf(magnitude)}%), em ${magnitude.partialBuckets} de ${magnitude.reaggregatedBuckets} barras — ` +
      "a soma dessas barras está subestimada."
    );
  });
  const headSentence = coverageHeadText(legs);
  return headSentence === null ? sentences.join(" ") : [...sentences, headSentence].join(" ");
}

/** "As barras mais recentes (…) ainda podem estar sendo consultadas…" — only when the head kept
 * something out of the count. Shared by the chip's `sr-only` node and by the pane's coverage ledger,
 * which exists without the chip (A-3). */
export function coverageHeadText(legs: readonly CoverageLeg[]): string | null {
  const headMs = Math.max(0, ...legs.map((leg) => leg.magnitude.headExcludedFacts * leg.magnitude.nativeGridMs));
  if (headMs <= 0) {
    return null;
  }
  return `As barras mais recentes (${formatCoverageSpan(headMs, "up")}) ainda podem estar sendo consultadas e não entram nesta conta.`;
}

/** The machine half of one series' coverage (`T-05.4-desenho.md` §2.6), on the chip AND on the
 * ledger. `data-fact` itself is NOT here: it exists only on the chip, so `[data-fact^="<key>:"]`
 * counts warnings and nothing else (A-2). */
export function coverageDataAttributes(magnitude: CoverageMagnitude): Readonly<Record<string, string>> {
  return {
    "data-coverage-missing-ms": String(magnitude.missingFacts * magnitude.nativeGridMs),
    "data-coverage-expected-ms": String(magnitude.expectedFacts * magnitude.nativeGridMs),
    "data-coverage-missing-facts": String(magnitude.missingFacts),
    "data-coverage-expected-facts": String(magnitude.expectedFacts),
    "data-coverage-partial-buckets": String(magnitude.partialBuckets),
    "data-coverage-reaggregated-buckets": String(magnitude.reaggregatedBuckets),
    "data-coverage-head-excluded-facts": String(magnitude.headExcludedFacts),
    "data-coverage-native-grid-ms": String(magnitude.nativeGridMs),
  };
}
