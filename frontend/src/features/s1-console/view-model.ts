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
 * The formatters below do NOT use `toLocaleString`/`Intl`: those read the RUNTIME locale,
 * which makes output depend on where the code executes rather than on the number itself —
 * the same class of non-determinism `Q14` flags for a data path, and there is no reason a
 * label should be allowed to drift by host environment either.
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

/** Groups digits with `.` every three places — pt-BR thousands separator, deterministic. */
export function formatPtBrThousands(value: number): string {
  const sign = value < 0 ? "-" : "";
  const digits = Math.trunc(Math.abs(value)).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${grouped}`;
}

/**
 * `fractionDigits` decimals with `,` as the decimal mark and `.` as the thousands separator —
 * the format the retention-day column uses on the approved screen ("1,5 dia", "7,0 dias").
 */
export function formatPtBrDecimal(value: number, fractionDigits: number): string {
  const sign = value < 0 ? "-" : "";
  const fixed = Math.abs(value).toFixed(fractionDigits);
  const separatorIndex = fixed.indexOf(".");
  const intPart = separatorIndex === -1 ? fixed : fixed.slice(0, separatorIndex);
  const fracPart = separatorIndex === -1 ? "" : fixed.slice(separatorIndex + 1);
  const groupedInt = formatPtBrThousands(Number(intPart));
  return fracPart ? `${sign}${groupedInt},${fracPart}` : `${sign}${groupedInt}`;
}

/**
 * ⚠️ Registered, not fixed: the approved canonical HTML itself mixes decimal marks — the
 * retention-day column uses `,` ("1,5 dia") while the uptime-% and GB/dia columns use `.`
 * ("99.8%", "1.2") `[MEDIDO 2026-09-02, grep on the downloaded Rev. B HTML —
 * see the builder gate report]`. This module reproduces that split faithfully rather than
 * silently normalizing it: `formatPtBrDecimal` (comma) is used only for retention days;
 * this function (dot) is used for uptime% and GB/dia, matching the canonical screen exactly.
 * Fixing the inconsistency is a design-system decision, out of this task's DoD (`D7.12`-`D7.15`).
 */
function formatDotDecimal(value: number, fractionDigits: number): string {
  return value.toFixed(fractionDigits);
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
        primary: `${formatPtBrThousands(window.points)} pts × ${window.intervalMinutes}m ≈ ${formatPtBrDecimal(window.days, 1)} ${window.days < 2 ? "dia" : "dias"}`,
        secondary: null,
      };
    case "measured_sparse":
      // `formatPtBrDecimal(…, 0)` rather than `formatPtBrThousands`: a declared/measured
      // window is not guaranteed to be a whole number, and truncating would silently drop a
      // fraction instead of rounding it — `toFixed(0)` rounds.
      return {
        primary: `${formatPtBrThousands(window.points)} pts × ${window.intervalMinutes}m ≈ ${formatPtBrDecimal(window.days, 0)} ${window.days < 2 ? "dia" : "dias"}`,
        secondary: window.regimeNote,
      };
    case "doc_only":
      return { primary: "[DOC-ONLY]", secondary: null };
    case "declared_constant":
      return { primary: `${formatPtBrDecimal(window.days, 0)} dias`, secondary: null };
    case "unmeasured":
      return { primary: "NÃO MEDIDA", secondary: null };
    case "not_applicable":
      return { primary: "-", secondary: null };
  }
}

export function resilienceCellText(resilience: ResilienceLabel): string {
  switch (resilience.kind) {
    case "slo_multiplier":
      return `${resilience.grade} / SLO ~${formatDotDecimal(resilience.multiplier, 1)}x`;
    case "unavailable":
      return "-";
    case "not_scored":
      return "N/A";
    case "external_sla":
      return resilience.label;
  }
}

/** The status cell: badge text/class, the optional glyph (`D17`: position + glyph, never
 * color), the optional free-form detail, and uptime formatted with the screen's own dot
 * decimal (`formatDotDecimal`, not the comma formatter above — see that function's note). */
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
    uptimeText: row.uptimePercent === null ? null : `${formatDotDecimal(row.uptimePercent, 1)}%`,
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
    etlQueueDepthText: formatPtBrThousands(etlQueueDepthPending),
    lines: lines.map((line) => ({
      label: line.label,
      valueText: line.gbPerDay === null ? "PARADO" : formatDotDecimal(line.gbPerDay, 1),
    })),
    totalGbPerDay,
    totalText: `${formatDotDecimal(totalGbPerDay, 1)} GB`,
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
