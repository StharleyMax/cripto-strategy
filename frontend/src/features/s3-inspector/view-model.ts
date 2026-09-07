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
import { buildSeriesLabel, type SeriesKey } from "./series-catalog.ts";
import { isQuarantined, openTerms as quarantineOpenTerms } from "./quarantine.ts";

/** Render an epoch-ms instant as the `...Z` ISO shape the rest of this codebase already uses
 * (`metrics_csv_reader.py`'s own docstring names the same shape). Deterministic: no locale, no
 * runtime timezone. */
export function formatEventTimeIso(eventTimeMs: number): string {
  return new Date(eventTimeMs).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** `STITCH_CONTEXT.md` §9 item 10, verbatim shape: grid series get `"N/M · k lacuna(s)"`; tick
 * series get `"contiguidade (N saltos)"` — never a denominator the series does not have.
 * `unmeasured` (`T-03.3`, `domain.ts`'s own note on the type) gets a THIRD, distinct text —
 * "não medido" — never one of the other two shapes with invented numbers: the column already
 * carries a `data-fact="source:none"` marker at the header (`S3Inspector.tsx`), and this text is
 * the per-row echo of that same absence, not a second, silently-numeric reading of it. */
export function completenessText(completeness: Completeness): string {
  if (completeness.kind === "grid") {
    const gapWord = completeness.gaps === 1 ? "lacuna" : "lacunas";
    return `${completeness.present}/${completeness.expected} · ${completeness.gaps} ${gapWord}`;
  }
  if (completeness.kind === "tick") {
    return `contiguidade (${completeness.jumps} saltos)`;
  }
  return "não medido";
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

/**
 * `T-03.3` fixed this to join ALL 15 `SeriesKey` terms, not the 6 this function used to pick
 * (`provider`/`venue`/`instrumentId`/`metric`/`reduction`/`interval`). Measured LIVE against the
 * real 10-row catalog (`T-03.3`'s own DoD): `cvd_source_catalog.py` builds TWO `binance` `cvd_source`
 * rows that share those exact 6 fields (`SUM`/`1m`) and differ ONLY in `quantityField`
 * (`q` vs `nq` — `ADR-001`'s whole reason that term is IN the identity at all, `series_key.py`'s
 * own module docstring). The 6-field string collided for those two rows, which is a real React
 * key collision (`unique ids: 9 of 10`, measured with a scratch script against the live API),
 * and a duplicate `<tr key>` is exactly the kind of defect that can render one row's DOM node
 * with another row's props after a list reflow (observed: filtering to the 5 `sum_open_interest`
 * rows also kept a stale `cvd_source` row visible — 6 `<tr>`, not 5). Backend's own
 * `SeriesKey.series_key_id()` (`series_key.py`) computes a `sha256` over all FIFTEEN terms for
 * exactly this reason ("two keys that differ in any ONE term get different ids"); this function
 * does not need a hash, only uniqueness, so it joins all 15 raw values instead of hashing them —
 * cheaper, and any future collision is a `SeriesKey` bug (two truly identical series), not a
 * `seriesKeyId` one.
 */
function fullSeriesKeyId(key: SeriesKey): string {
  return [
    key.provider,
    key.venue,
    key.instrumentId,
    key.metric,
    key.cohort,
    key.interval,
    key.unit,
    key.denom,
    key.nature,
    key.tsConvention,
    key.reduction,
    key.quantityField,
    key.labelShift,
    key.aggregationScope,
    key.verifiedBy,
  ].join(":");
}

export function buildCatalogRowView(row: CatalogRow): CatalogRowView {
  return {
    // No wire `series_key_id` (`sha256`) is computed here — this feature reads a fixture/store
    // catalog, it does not identify series; a stable per-row string suffices for React `key`s.
    seriesKeyId: fullSeriesKeyId(row.entry.key),
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
