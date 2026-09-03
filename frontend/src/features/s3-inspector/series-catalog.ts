/**
 * `T-06.10` — TypeScript mirror of `series_catalog.py`/`series_key.py` (backend, `T-06.1`),
 * "reuse, do not invent a different shape" per `docs/context/plataforma-dados/handoff/T-06.10.md`.
 *
 * This is a TRANSCRIPTION, the same class of move `ingest-health-query.ts` made for
 * `INGEST_HEALTH_RUN_COLUMNS`: typed by hand from the Python source (no cross-language import
 * exists), kept as an independent witness so `series-catalog.test.ts` has something to compare
 * against `SERIES_KEY_TERMS`/`SeriesCatalogEntry` if either side drifts.
 *
 * Sources read, verbatim field order preserved:
 *   - `backend/src/modules/sentimento/domain/series_key.py` — the 15-term `SeriesKey` identity
 *     (`SERIES_KEY_TERMS`), plus the four closed enums (`Nature`, `TsConvention`, `Reduction`,
 *     `QuantityField`).
 *   - `backend/src/modules/sentimento/domain/series_catalog.py` — `SeriesCatalogEntry`
 *     (`native_grid`, `max_staleness_ms`, `price_use`, `reconstructed_from`, `published_error`),
 *     `PRICE_USES`.
 *
 * `SeriesKey` fields keep their Python/wire NAMES (snake_case) rather than being re-cased to
 * camelCase: `SPEC-001` §2.1 names these as the columns `series_catalog` stores, the same reason
 * `IngestHealthGapRow` keeps `n_missing`/`series_key_id` instead of a JS-idiomatic rename — this
 * is a WIRE/contract shape, not an ordinary TS domain type. `QuarantineTerms` (`quarantine.ts`),
 * which is NOT a stored column shape, is camelCased instead — see that module's own note.
 */

/** `SPEC-001` §2.1, transcribed in the SPEC's own order — mirrors `SERIES_KEY_TERMS`
 * (`series_key.py:38`). The order is part of the contract there; it is reproduced here only so
 * a test can assert this list and the Python tuple never drift apart in silence. */
export const SERIES_KEY_TERMS: readonly string[] = [
  "provider",
  "venue",
  "instrument_id",
  "metric",
  "cohort",
  "interval",
  "unit",
  "denom",
  "nature",
  "ts_convention",
  "reduction",
  "quantity_field",
  "label_shift",
  "aggregation_scope",
  "verified_by",
];

/** `series_key.py::Nature` — what kind of quantity the series carries. */
export type Nature = "STOCK" | "FLOW" | "RATIO" | "EVENT" | "TICK";

/** `series_key.py::TsConvention` — what the row's timestamp MEANS. */
export type TsConvention = "POINT_AT_BUCKET_END" | "AGGREGATE_OVER_BUCKET" | "OHLC_OVER_BUCKET";

/** `series_key.py::Reduction` — WHICH reading of the bucket this series publishes (`CA-F2-17`). */
export type Reduction = "POINT" | "OPEN" | "HIGH" | "LOW" | "CLOSE" | "SUM" | "MEAN" | "LAST";

/** `series_key.py::QuantityField` — values are the source's OWN spelling (`ADR-001`), never
 * translated: `q`/`nq` are Binance payload field names, `NA` is the explicit non-`aggTrade` case. */
export type QuantityField = "q" | "nq" | "NA";

/** `SPEC-001` §3.1, literal: "`implied_avg_price` está PROIBIDO como nome". */
export const FORBIDDEN_METRIC_NAMES: ReadonlySet<string> = new Set(["implied_avg_price"]);

export class IncompleteSeriesKeyError extends Error {}

/** The complete identity of one series — the fifteen terms, `SPEC-001` §2.1. Mirrors
 * `series_key.py::SeriesKey`. `labelShift` stays the SPEC's name (in milliseconds), not
 * `labelShiftMs`, for the same reason the Python field is not `label_shift_ms`. */
export interface SeriesKey {
  readonly provider: string;
  readonly venue: string;
  readonly instrumentId: string;
  readonly metric: string;
  readonly cohort: string;
  readonly interval: string;
  readonly unit: string;
  readonly denom: string;
  readonly nature: Nature;
  readonly tsConvention: TsConvention;
  readonly reduction: Reduction;
  readonly quantityField: QuantityField;
  readonly labelShift: number;
  readonly aggregationScope: string;
  readonly verifiedBy: string;
}

/** Refuse a key with a blank textual term or a `metric` `SPEC-001` §3.1 forbids — mirrors
 * `SeriesKey.__post_init__`. Read-only surfaces (this feature never WRITES a `SeriesKey`) still
 * validate on construction so a fixture typo fails a test instead of rendering silently. */
export function assertValidSeriesKey(key: SeriesKey): void {
  const textTerms: ReadonlyArray<[string, string]> = [
    ["provider", key.provider],
    ["venue", key.venue],
    ["instrument_id", key.instrumentId],
    ["metric", key.metric],
    ["cohort", key.cohort],
    ["interval", key.interval],
    ["unit", key.unit],
    ["denom", key.denom],
    ["aggregation_scope", key.aggregationScope],
    ["verified_by", key.verifiedBy],
  ];
  for (const [term, value] of textTerms) {
    if (value.trim().length === 0) {
      throw new IncompleteSeriesKeyError(
        `term '${term}' is blank: a blank term of identity does not distinguish two series`,
      );
    }
  }
  if (FORBIDDEN_METRIC_NAMES.has(key.metric)) {
    throw new IncompleteSeriesKeyError(
      `metric '${key.metric}' is forbidden by SPEC-001 §3.1: it is 'price_mark_close'`,
    );
  }
}

/** `SPEC-001` §3.7, transcribed — mirrors `series_catalog.py::PRICE_USES`. */
export const PRICE_USES: ReadonlySet<string> = new Set([
  "structure_detection",
  "liquidation_trigger",
  "funding",
  "execution",
  "cost",
]);

/** `(median, p99, n)` a reconstruction publishes — mirrors `series_catalog.py::PublishedError`. */
export interface PublishedError {
  readonly medianBp: number;
  readonly p99Bp: number;
  readonly n: number;
}

export class InvalidCatalogEntryError extends Error {}

/** One row of `series_catalog` — mirrors `series_catalog.py::SeriesCatalogEntry`. */
export interface SeriesCatalogEntry {
  readonly key: SeriesKey;
  readonly nativeGrid: string;
  readonly maxStalenessMs: number;
  readonly priceUse: string | null;
  readonly reconstructedFrom: string | null;
  readonly publishedError: PublishedError | null;
}

/** Mirrors `SeriesCatalogEntry.__post_init__` — the combination rules, not full field
 * validation (this feature is a READER of the catalog, never its writer). */
export function assertValidCatalogEntry(entry: SeriesCatalogEntry): void {
  assertValidSeriesKey(entry.key);
  if (entry.nativeGrid.trim().length === 0) {
    throw new InvalidCatalogEntryError("native_grid is blank");
  }
  if (!(entry.maxStalenessMs > 0)) {
    throw new InvalidCatalogEntryError(`max_staleness_ms = ${entry.maxStalenessMs} must be positive`);
  }
  if (entry.priceUse !== null && !PRICE_USES.has(entry.priceUse)) {
    throw new InvalidCatalogEntryError(`price_use = ${entry.priceUse} is outside SPEC-001 §3.7's set`);
  }
  if (entry.reconstructedFrom !== null && entry.reconstructedFrom.trim().length === 0) {
    throw new InvalidCatalogEntryError("reconstructed_from is present but blank");
  }
  if (entry.reconstructedFrom !== null && entry.publishedError === null) {
    throw new InvalidCatalogEntryError(
      `series reconstructed from ${entry.reconstructedFrom} has no published_error`,
    );
  }
  if (entry.reconstructedFrom === null && entry.publishedError !== null) {
    throw new InvalidCatalogEntryError("published_error is set but reconstructed_from is None");
  }
}

/**
 * The full series label `STITCH_CONTEXT.md` §9 item 10 requires next to every market numeral —
 * "As palavras OI, funding, L/S e CVD SOZINHAS não existem nesta interface". Built from the same
 * four terms the §9 example itself uses ("OI · grade 5m · BTC · bn-dump" = metric · grade ·
 * instrument · provider), in that order.
 *
 * `[NÃO SEI]`, registered in `T-06.10-design.md` §4: whether exactly these four of the fifteen
 * terms, in this order, is what a `/design-critique` would approve for every row — this is a
 * reading of the one example the source text gives, not a rule that names all four explicitly.
 */
export function buildSeriesLabel(entry: SeriesCatalogEntry): string {
  return `${entry.key.metric} · grade ${entry.nativeGrid} · ${entry.key.instrumentId} · ${entry.key.provider}`;
}
