/**
 * `T-06.10` — turns the `S3` domain model (`domain.ts` + `series-catalog.ts` + `quarantine.ts` +
 * `fixtures.ts`) into display-ready text for `S3Inspector.tsx`.
 *
 * Same split `s1-console/view-model.ts` documents and the same reason: the domain layer never
 * locale-formats a number (`Q14`'s finding, binding here — dot decimal, no thousands separator
 * on anything that could feed a comparison); pt-BR is legitimate ONLY in microcopy/labels
 * (`CLAUDE.md` boundary table, row 8). `formatEventTimeIso` below uses `Date.prototype.
 * toISOString`, which is UTC and locale-INDEPENDENT (no `Intl`, no runtime-timezone read) — the
 * same determinism argument, applied to a timestamp instead of a decimal.
 */

import {
  buildQuarantineDrawer,
  EMPTY_CATALOG_FILTER,
  filterCatalogRows,
  mergeRawAndGapRows,
  type CatalogFilter,
  type CatalogRow,
  type Completeness,
  type DivergenceRow,
  type InspectorRow,
  type Provenance,
  type QuarantineDrawer,
} from "./domain.ts";
import type { IngestHealthGapRow } from "../s1-console/ingest-health-query.ts";
import { buildSeriesLabel } from "./series-catalog.ts";
import { isQuarantined, openTerms as quarantineOpenTerms } from "./quarantine.ts";

/** Render an epoch-ms instant as the `...Z` ISO shape the rest of this codebase already uses
 * (`metrics_csv_reader.py`'s own docstring names the same shape). Deterministic: no locale, no
 * runtime timezone. */
export function formatEventTimeIso(eventTimeMs: number): string {
  return new Date(eventTimeMs).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** `STITCH_CONTEXT.md` §9 item 10, verbatim shape: grid series get `"N/M · k lacuna(s)"`; tick
 * series get `"contiguidade (N saltos)"` — never a denominator the series does not have. */
export function completenessText(completeness: Completeness): string {
  if (completeness.kind === "grid") {
    const gapWord = completeness.gaps === 1 ? "lacuna" : "lacunas";
    return `${completeness.present}/${completeness.expected} · ${completeness.gaps} ${gapWord}`;
  }
  return `contiguidade (${completeness.jumps} saltos)`;
}

/** The catalog badge for quarantine — text is `null` when the series is NOT quarantined (the
 * component renders nothing rather than a "false" badge; absence of quarantine is a valid state,
 * `T-06.10-design.md` §3). `openTermsText` joins `openTerms()` with `, `, in the predicate's own
 * left-to-right order (`quarantine.ts`). Colour is deliberately NOT decided here — `S3Inspector.tsx`
 * applies the single integrity-violet token, this module only says WHETHER to. */
export interface QuarantineBadgeText {
  readonly isQuarantined: boolean;
  readonly word: string | null;
  readonly openTermsText: string | null;
}

export function quarantineBadgeText(terms: CatalogRow["quarantine"]): QuarantineBadgeText {
  const quarantined = isQuarantined(terms);
  if (!quarantined) {
    return { isQuarantined: false, word: null, openTermsText: null };
  }
  return {
    isQuarantined: true,
    word: "QUARENTENA",
    openTermsText: quarantineOpenTerms(terms).join(", "),
  };
}

/** One fully-formatted catalog row, ready for `S3Inspector.tsx`. */
export interface CatalogRowView {
  readonly seriesKeyId: string;
  readonly label: string;
  readonly instrumentId: string;
  readonly provider: string;
  readonly provenance: Provenance;
  readonly completenessText: string;
  readonly quarantineBadge: QuarantineBadgeText;
}

export function buildCatalogRowView(row: CatalogRow): CatalogRowView {
  return {
    // No wire `series_key_id` (`sha256`) is computed here — this feature reads a fixture/store
    // catalog, it does not identify series; a stable per-row string suffices for React `key`s.
    seriesKeyId: `${row.entry.key.provider}:${row.entry.key.venue}:${row.entry.key.instrumentId}:${row.entry.key.metric}:${row.entry.key.reduction}:${row.entry.key.interval}`,
    label: buildSeriesLabel(row.entry),
    instrumentId: row.entry.key.instrumentId,
    provider: row.entry.key.provider,
    provenance: row.provenance,
    completenessText: completenessText(row.completeness),
    quarantineBadge: quarantineBadgeText(row.quarantine),
  };
}

/** One formatted row of the raw-lines panel (Camada 2) — either a data row or a gap marker,
 * discriminated the same way `InspectorRow` is, so `S3Inspector.tsx` never has to re-derive the
 * kind from field presence. */
export type InspectorRowView =
  | {
      readonly kind: "data";
      readonly eventTimeText: string;
      readonly srcLabelRaw: string;
      readonly provenance: Provenance;
      readonly valuesText: string;
    }
  | {
      readonly kind: "gap";
      readonly intervalText: string;
      readonly nMissingText: string;
      readonly classText: string;
    };

function gapRowView(gap: IngestHealthGapRow): InspectorRowView {
  return {
    kind: "gap",
    intervalText: `${gap.from_ts} → ${gap.to_ts}`,
    nMissingText: `${gap.n_missing}`,
    classText: gap.class,
  };
}

export function buildInspectorRowViews(rows: readonly InspectorRow[]): readonly InspectorRowView[] {
  return rows.map((row): InspectorRowView => {
    if (row.kind === "gap") {
      return gapRowView(row.gap);
    }
    const valuesText = Object.entries(row.values)
      .map(([field, value]) => `${field}=${value}`)
      .join(" · ");
    return {
      kind: "data",
      eventTimeText: formatEventTimeIso(row.eventTime),
      srcLabelRaw: row.srcLabelRaw,
      provenance: row.provenance,
      valuesText,
    };
  });
}

/** One formatted divergence row — every reading survives formatting; nothing here picks one. */
export interface DivergenceRowView {
  readonly label: string;
  readonly readingsText: readonly string[];
}

export function buildDivergenceRowView(row: DivergenceRow): DivergenceRowView {
  return {
    label: row.label,
    readingsText: row.readings.map((reading) => `${reading.source}: ${reading.valueText} (${reading.provenance})`),
  };
}

/** The quarantine drawer, formatted: rows plus the empty-state sentence
 * (`T-06.10-design.md` §3 — absence of quarantine is a distinct, valid state). */
export interface QuarantineDrawerView {
  readonly rows: readonly { readonly seriesLabel: string; readonly openTermsText: string }[];
  readonly isEmpty: boolean;
  readonly emptyStateText: string;
}

export function buildQuarantineDrawerView(drawer: QuarantineDrawer): QuarantineDrawerView {
  return {
    rows: drawer.rows.map((row) => ({
      seriesLabel: row.seriesLabel,
      openTermsText: row.openTerms.join(", "),
    })),
    isEmpty: drawer.isEmpty,
    emptyStateText: "nenhuma série em quarentena no momento",
  };
}

/** The whole `S3` screen state, assembled from the raw catalog + the active filter + whichever
 * series is open + its raw/gap rows + any divergences — the single object `S3Inspector.tsx`
 * needs, formatted, so the component does no further arithmetic. */
export interface S3ViewModel {
  readonly filter: CatalogFilter;
  readonly catalogRows: readonly CatalogRowView[];
  readonly selectedSeriesLabel: string | null;
  readonly inspectorRows: readonly InspectorRowView[];
  readonly divergences: readonly DivergenceRowView[];
  readonly quarantineDrawer: QuarantineDrawerView;
}

export function buildS3ViewModel(
  catalog: readonly CatalogRow[],
  filter: CatalogFilter,
  selectedSeries: CatalogRow | null,
  selectedSeriesRawRows: readonly InspectorRow[],
  divergences: readonly DivergenceRow[],
): S3ViewModel {
  return {
    filter,
    catalogRows: filterCatalogRows(catalog, filter).map(buildCatalogRowView),
    selectedSeriesLabel: selectedSeries === null ? null : buildSeriesLabel(selectedSeries.entry),
    inspectorRows: buildInspectorRowViews(selectedSeriesRawRows),
    divergences: divergences.map(buildDivergenceRowView),
    quarantineDrawer: buildQuarantineDrawerView(
      buildQuarantineDrawer(catalog, (row) => buildSeriesLabel(row.entry)),
    ),
  };
}

export { EMPTY_CATALOG_FILTER, mergeRawAndGapRows };
