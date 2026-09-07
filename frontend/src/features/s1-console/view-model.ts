/**
 * `T-07.12` — turns the `S1` domain model (`domain.ts` + `fixtures.ts`) into display-ready
 * text for `S1Console.tsx`.
 *
 * Deliberately separate from `domain.ts`: the domain layer stores plain numbers (`days: 1.5`,
 * never a locale-formatted string), because `docs/context/plataforma-dados/handoff_to_architect.md`
 * `Q14`'s finding is binding on this repository — number SERIALIZATION on a data path is a
 * locale INVARIANT (dot decimal, no thousands separator); pt-BR formatting is legitimate
 * ONLY in microcopy/labels (`CLAUDE.md`, boundary table row 8). This module is exactly that
 * boundary: everything it returns is a string meant for a label, never fed back into a
 * calculation or a comparison.
 *
 * `T-03.8`, `SPEC-003` §3.7: **one** formatter, `Intl.NumberFormat("pt-BR")`, for every
 * on-screen numeral this feature renders — replacing the three hand-rolled functions
 * (`formatPtBrThousands`/`formatPtBrDecimal`/`formatDotDecimal`) this module used to carry,
 * which reproduced a real split in the approved canonical HTML (retention days in `,`,
 * uptime-%/GB-dia in `.` — `[MEDIDO 2026-09-02]`, registered in the previous revision of this
 * docstring as "out of scope"; this task is the scope that closes it). The previous revision
 * also argued `toLocaleString`/`Intl` should be avoided because they "read the RUNTIME
 * locale" — true for a LOCALE-LESS call (`value.toLocaleString()`, `Intl.NumberFormat()`
 * with no argument), which resolves against the HOST's default locale and is exactly the
 * non-determinism `Q14` flags. It does NOT hold for `new Intl.NumberFormat("pt-BR", …)`: an
 * EXPLICIT locale argument pins the output to that locale regardless of where the code runs —
 * deterministic in the same sense the hand-rolled functions were, just built on the platform's
 * own formatter instead of reimplementing grouping/rounding by hand.
 */

import {
  badgeClassForStatus,
  orderRowsBySeverity,
  totalStorageBudgetGbPerDay,
  NEUTRAL_STATUS_BADGE_CLASS,
  STOPPED_STATUS_GLYPH,
  type CollectorRow,
  type CollectorStatus,
  type ReconnectionEvent,
  type ResilienceLabel,
  type RetentionWindow,
  type StorageBudgetLine,
} from "./domain.ts";

/**
 * THE single locale formatter this feature uses on any presented numeral (`SPEC-003` §3.7):
 * `,` decimal mark, `.` thousands separator, `fractionDigits` decimals exactly (padded with
 * trailing zeros — `formatPtBrNumber(7, 1)` reads `"7,0"`, matching the approved screen's own
 * rounding, never a bare `"7"`). Built on `Intl.NumberFormat("pt-BR", …)` with the locale
 * argument ALWAYS explicit — see this module's docstring for why that is deterministic where
 * a locale-less call would not be.
 */
export function formatPtBrNumber(value: number, fractionDigits: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** The two-line retention cell the screen shows: a primary value, and — only for the sparse
 * case — the secondary regime-note line that `D7.14` requires. */
export interface RetentionCellText {
  readonly primary: string;
  readonly secondary: string | null;
}

export function retentionCellText(window: RetentionWindow): RetentionCellText {
  switch (window.kind) {
    case "computed_uniform":
      return {
        primary: `${formatPtBrNumber(window.points, 0)} pts × ${window.intervalMinutes}m ≈ ${formatPtBrNumber(window.days, 1)} ${window.days < 2 ? "dia" : "dias"}`,
        secondary: null,
      };
    case "measured_sparse":
      // `formatPtBrNumber(…, 0)` rather than an integer truncation: a declared/measured
      // window is not guaranteed to be a whole number, and truncating would silently drop a
      // fraction instead of rounding it — `Intl.NumberFormat` with `fractionDigits: 0` rounds.
      return {
        primary: `${formatPtBrNumber(window.points, 0)} pts × ${window.intervalMinutes}m ≈ ${formatPtBrNumber(window.days, 0)} ${window.days < 2 ? "dia" : "dias"}`,
        secondary: window.regimeNote,
      };
    case "doc_only":
      return { primary: "[DOC-ONLY]", secondary: null };
    case "declared_constant":
      return { primary: `${formatPtBrNumber(window.days, 0)} dias`, secondary: null };
    case "unmeasured":
      return { primary: "NÃO MEDIDA", secondary: null };
    case "not_applicable":
      return { primary: "-", secondary: null };
  }
}

export function resilienceCellText(resilience: ResilienceLabel): string {
  switch (resilience.kind) {
    case "slo_multiplier":
      return `${resilience.grade} / SLO ~${formatPtBrNumber(resilience.multiplier, 1)}x`;
    case "unavailable":
      return "-";
    case "not_scored":
      return "N/A";
    case "external_sla":
      return resilience.label;
  }
}

/** The status cell: badge text/class, the optional glyph (`D17`: position + glyph, never
 * color), the optional free-form detail, and uptime formatted with the ONE formatter this
 * module exposes (`formatPtBrNumber` — `SPEC-003` §3.7, `T-03.8`). */
export interface StatusCellText {
  readonly status: CollectorStatus;
  readonly badgeClass: string;
  readonly glyph: string | null;
  readonly detailText: string | null;
  readonly uptimeText: string | null;
}

export function statusCellText(row: CollectorRow): StatusCellText {
  return {
    status: row.status,
    badgeClass: badgeClassForStatus(row.status),
    glyph: row.status === "PARADO" ? STOPPED_STATUS_GLYPH : null,
    detailText: row.statusDetail,
    uptimeText: row.uptimePercent === null ? null : `${formatPtBrNumber(row.uptimePercent, 1)}%`,
  };
}

/** One fully-formatted table row, ready for `S1Console.tsx` to render without doing any
 * further arithmetic or formatting itself. */
export interface CollectorRowView {
  readonly series: string;
  readonly retention: RetentionCellText;
  readonly resilience: string;
  readonly statusCell: StatusCellText;
}

export function buildCollectorRowView(row: CollectorRow): CollectorRowView {
  return {
    series: row.series,
    retention: retentionCellText(row.retention),
    resilience: resilienceCellText(row.resilience),
    statusCell: statusCellText(row),
  };
}

/** One formatted line of the storage-budget panel. */
export interface StorageBudgetLineView {
  readonly label: string;
  readonly valueText: string;
}

/** The full, formatted "Orçamento Aritmético & ETL" panel. `totalText` is computed from
 * `lines` by `totalStorageBudgetGbPerDay` — never a hand-typed figure sitting next to the
 * parts it is supposed to be the sum of. */
export interface StorageBudgetView {
  readonly etlQueueDepthText: string;
  readonly lines: readonly StorageBudgetLineView[];
  readonly totalGbPerDay: number;
  readonly totalText: string;
}

export function buildStorageBudgetView(
  etlQueueDepthPending: number,
  lines: readonly StorageBudgetLine[],
): StorageBudgetView {
  const totalGbPerDay = totalStorageBudgetGbPerDay(lines);
  return {
    etlQueueDepthText: formatPtBrNumber(etlQueueDepthPending, 0),
    lines: lines.map((line) => ({
      label: line.label,
      valueText: line.gbPerDay === null ? "PARADO" : formatPtBrNumber(line.gbPerDay, 1),
    })),
    totalGbPerDay,
    totalText: `${formatPtBrNumber(totalGbPerDay, 1)} GB`,
  };
}

/** The whole `S1` screen, assembled and formatted — the single object `S1Console.tsx` needs. */
export interface S1ViewModel {
  readonly rows: readonly CollectorRowView[];
  readonly storageBudget: StorageBudgetView;
  readonly reconnectionEvents: readonly ReconnectionEvent[];
  readonly neutralBadgeClass: string;
}

export function buildS1ViewModel(
  rows: readonly CollectorRow[],
  etlQueueDepthPending: number,
  storageBudgetLines: readonly StorageBudgetLine[],
  reconnectionEvents: readonly ReconnectionEvent[],
): S1ViewModel {
  return {
    rows: orderRowsBySeverity(rows).map(buildCollectorRowView),
    storageBudget: buildStorageBudgetView(etlQueueDepthPending, storageBudgetLines),
    reconnectionEvents,
    neutralBadgeClass: NEUTRAL_STATUS_BADGE_CLASS,
  };
}
