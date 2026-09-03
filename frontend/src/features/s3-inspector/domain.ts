/**
 * `T-06.10` — domain model of `S3`, the series inspector (fase 06, `CST-54`).
 *
 * Job (`STITCH_CONTEXT.md:485-487`, `PRD-001-plataforma-dados.md:580`): "o que este número é, e
 * quais linhas exatas o produziram." `D6.15`
 * (`docs/plans/SPEC-001-plataforma-dados/06_semantica_declarada.md:47`): abrir as linhas cruas de
 * uma série faz `src_label_raw` aparecer NA MESMA LINHA que `event_time`, mais as lacunas de
 * `md.ingest_gap` com `n_missing`.
 *
 * Design decision and its open items: `docs/context/plataforma-dados/gates/T-06.10-design.md`.
 *
 * ── SCOPE: headless data/formula module, same tier as `s1-console/domain.ts` ──────────────────
 *
 * No Next.js application exists yet in `frontend/` (`frontend/README.md` §1,
 * `src/app/routes.ts`) — this module and `fixtures.ts` are FIXTURE/SYNTHETIC data, never read
 * from a store. `S3Inspector.tsx` follows the same lint-only presentational tier `S1Console.tsx`
 * established.
 *
 * `Provenance` here reuses the SPEC's own Portuguese VALUES (`OBSERVADO`/`DERIVADO`/`MODELADO`/
 * `HUMANO`) verbatim from `backend/.../provenance.py::Provenance` — contract data crossing to a
 * consumer, same reasoning that module gives for not translating either side.
 */

import type { IngestHealthGapRow } from "../s1-console/ingest-health-query.ts";
import {
  isQuarantined,
  openTerms,
  type QuarantineTerms,
} from "./quarantine.ts";
import type { SeriesCatalogEntry } from "./series-catalog.ts";

export type Provenance = "OBSERVADO" | "DERIVADO" | "MODELADO" | "HUMANO";

/**
 * `STITCH_CONTEXT.md` §9 item 10, "completude" field: a GRID series (Coinalyze/Binance grade
 * series) has an EXPECTED denominator; a TICK series does not, and inventing one is a defect.
 * Mirrors the two branches the source text names, no third invented here.
 */
export type Completeness =
  | { readonly kind: "grid"; readonly present: number; readonly expected: number; readonly gaps: number }
  | { readonly kind: "tick"; readonly contiguous: number; readonly jumps: number };

/** One row of the S3 catalog panel (Camada 1) — `SeriesCatalogEntry` plus the two facts the
 * catalog table needs that are not columns of the entry itself: completeness and quarantine. */
export interface CatalogRow {
  readonly entry: SeriesCatalogEntry;
  readonly provenance: Provenance;
  readonly completeness: Completeness;
  readonly quarantine: QuarantineTerms;
}

/** One raw data row of the inspection panel (Camada 2) — `event_time` (epoch ms, `SPEC-001`
 * §2.2's own type: an injected int, never a parsed string) and `src_label_raw` ON THE SAME ROW,
 * per `D6.15`. `values` is a generic column bag: the raw shift is auditable for ANY series'
 * metric columns without this module hard-coding one series' schema. */
export interface RawDataRow {
  readonly kind: "data";
  readonly eventTime: number;
  readonly srcLabelRaw: string;
  readonly provenance: Provenance;
  readonly values: Readonly<Record<string, string>>;
}

/** One gap marker row — wraps `IngestHealthGapRow` (`md.ingest_gap`, the SAME 8-column shape
 * `ingest-health-query.ts` already ports; reused rather than re-invented) as a DISTINCT row kind
 * from `RawDataRow`, never blended into a data row: `STITCH_CONTEXT.md` §9 item 5 makes
 * incomplete-completeness SEVERITY OPERACIONAL, never tinted, and a gap row needs to be visually
 * (and structurally) unmistakable from a data row for that to hold. */
export interface GapMarkerRow {
  readonly kind: "gap";
  readonly gap: IngestHealthGapRow;
}

export type InspectorRow = RawDataRow | GapMarkerRow;

/** The sort key of any `InspectorRow`: a data row sorts by its own `eventTime`; a gap sorts by
 * `from_ts` (parsed as an ISO instant) — both are the START of what the row covers. */
function inspectorRowSortKeyMs(row: InspectorRow): number {
  return row.kind === "data" ? row.eventTime : Date.parse(row.gap.from_ts);
}

/**
 * Merge data rows and gap markers into one chronological sequence — the literal shape `D6.15`
 * asks for: opening the raw lines of a series shows both, interleaved by time, never gaps
 * collected in a separate table a reader has to correlate by hand.
 */
export function mergeRawAndGapRows(
  dataRows: readonly RawDataRow[],
  gapRows: readonly IngestHealthGapRow[],
): readonly InspectorRow[] {
  const rows: InspectorRow[] = [
    ...dataRows.map((row): InspectorRow => row),
    ...gapRows.map((gap): InspectorRow => ({ kind: "gap", gap })),
  ];
  return rows.slice().sort((a, b) => inspectorRowSortKeyMs(a) - inspectorRowSortKeyMs(b));
}

/** One reading of a fact that two sources disagree about — a divergence is shown as MULTIPLE
 * of these, never resolved into one. No field here can hold "the chosen value": the type itself
 * is the falsifier for the DoD's "não reconcilia automaticamente" (`handoff/T-06.10.md:22`). */
export interface DivergenceReading {
  readonly source: string;
  readonly valueText: string;
  readonly provenance: Provenance;
}

/** A named fact with two or more `DivergenceReading`s that disagree. `label` names WHAT is
 * being compared (e.g. "OI @ 2026-08-24T00:00:00Z"), never which reading is "right". */
export interface DivergenceRow {
  readonly label: string;
  readonly readings: readonly DivergenceReading[];
}

/** Free-text + structured filter over the catalog panel (Camada 1)'s filter bar. `null`/`""`
 * fields mean "no constraint on this axis" — an AND across whichever axes are set. */
export interface CatalogFilter {
  readonly text: string;
  readonly provenance: Provenance | null;
  readonly onlyQuarantined: boolean;
}

export const EMPTY_CATALOG_FILTER: CatalogFilter = {
  text: "",
  provenance: null,
  onlyQuarantined: false,
};

function catalogRowMatchesText(row: CatalogRow, needleLower: string): boolean {
  if (needleLower.length === 0) {
    return true;
  }
  const haystack = [
    row.entry.key.instrumentId,
    row.entry.key.metric,
    row.entry.key.provider,
    row.entry.key.venue,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needleLower);
}

/** The catalog panel's filter, AND-ing whichever axes `filter` sets. Pure function over the
 * full catalog — `view-model.ts` is what turns the result into display text. */
export function filterCatalogRows(
  rows: readonly CatalogRow[],
  filter: CatalogFilter,
): readonly CatalogRow[] {
  const needleLower = filter.text.trim().toLowerCase();
  return rows.filter((row) => {
    if (!catalogRowMatchesText(row, needleLower)) {
      return false;
    }
    if (filter.provenance !== null && row.provenance !== filter.provenance) {
      return false;
    }
    if (filter.onlyQuarantined && !isQuarantined(row.quarantine)) {
      return false;
    }
    return true;
  });
}

/** One row of the quarantine drawer: which series, and which of the three terms are open —
 * `openTerms` is the falsifier's own explanation, carried through rather than collapsed to a
 * boolean the drawer would have to re-derive. */
export interface QuarantineDrawerRow {
  readonly seriesLabel: string;
  readonly openTerms: readonly string[];
}

/** The quarantine drawer's content: rows plus whether it is empty. An EXPLICIT `isEmpty` field,
 * not `rows.length === 0` re-derived at render time, so `S3Inspector.tsx` can show the "nenhuma
 * série em quarentena no momento" text from a value instead of an inferred absence — the same
 * absence-by-VALUE choice `s1-console/domain.ts` makes for `ReconnectionEvent`. */
export interface QuarantineDrawer {
  readonly rows: readonly QuarantineDrawerRow[];
  readonly isEmpty: boolean;
}

export function buildQuarantineDrawer(
  rows: readonly CatalogRow[],
  labelFor: (row: CatalogRow) => string,
): QuarantineDrawer {
  const quarantined = rows.filter((row) => isQuarantined(row.quarantine));
  return {
    rows: quarantined.map((row) => ({
      seriesLabel: labelFor(row),
      openTerms: openTerms(row.quarantine),
    })),
    isEmpty: quarantined.length === 0,
  };
}
