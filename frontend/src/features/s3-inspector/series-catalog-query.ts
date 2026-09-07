import "server-only";

/**
 * `ADR-028/D2` — this line has to stay the FIRST line of the module: `server-only` throws on
 * import outside the `react-server` condition, and `next build` walks the transitive module
 * graph looking for exactly this import to reject any client bundle that reaches it. Same
 * reasoning `ingest-health-query.ts`/`collector-status-query.ts` already document; this module
 * is the FIRST `server-only` consumer under `s3-inspector/`, so `test:s3`
 * (`frontend/package.json`) gained `--conditions=react-server` alongside it (same flag
 * `test:s1`/`test:app` already carry) — without it, `node --test` hits `server-only`'s default
 * export (which throws unconditionally) the instant this file is imported.
 *
 * `T-03.3` — the `web` HTTP consumer of `GET {API_PREFIX}/series-catalog`
 * (`SPEC-003` §3.4, `use_cases/series_catalog.py::series_catalog_envelope`, built by `T-03.2`).
 *
 * ── VALIDATION POSTURE, SAME AS `parseCollectorStatusEnvelope`/`parseIngestHealthEnvelope` ──
 *
 * Permissive on an UNKNOWN field, strict on a MISSING or MISTYPED one (`ADR-019/D2`) — this
 * module owns its OWN structural (wire-shape) check, entirely self-contained, the same posture
 * `collector-status-query.ts` picked over reaching into a sibling domain file for it. Once the
 * shape is confirmed, `assertValidCatalogEntry`/`assertValidSeriesKey` (`series-catalog.ts`,
 * `T-06.10`) are called for the BUSINESS-RULE layer this module does not re-derive: blank
 * textual terms, the forbidden-metric set, `max_staleness_ms` positivity, `price_use`
 * membership, and the `reconstructed_from`/`published_error` pairing. Two layers, two failure
 * modes: a wire-shape defect names the missing/mistyped FIELD; a business-rule defect names the
 * VIOLATED invariant — `assertValidCatalogEntry`'s own error messages, unchanged.
 *
 * `SeriesCatalogEntry` (`series-catalog.ts:134`) has SIX top-level fields; `SeriesKey`
 * (`series-catalog.ts:67-83`) nested under `key` has FIFTEEN — twenty-one total, the universe
 * `series-catalog-query.test.ts`'s "1 field removed at a time" falsifier sweeps over (both
 * levels, since `ADR-019/D2` is strict on ANY missing field, not only the outer six).
 *
 * ── QUARANTINE AND COMPLETENESS: NEITHER TRAVELS ON THIS WIRE ────────────────────────────────
 *
 * `SPEC-003` §3.4, literal: "`Completeness` não vai no fio — o front preenche `unmeasured`"
 * (`domain.ts`'s own note on that type). This module hardcodes `{ kind: "unmeasured" }` for
 * every row it builds — never a fabricated `grid`/`tick` reading.
 *
 * `QuarantineTerms` (`quarantine.ts`, `SPEC-001` §5.2) is a THREE-term predicate
 * (`label_shift`/`unit`/`available_at`), and only the first two are derivable from a catalog
 * entry at all: `entry.key.labelShift`/`entry.key.unit` are non-nullable fields of `SeriesKey`
 * (a `SeriesCatalogEntry` cannot exist with either missing — `quarantine_terms.py`'s own
 * docstring, backend, names this the same way), so both are always `true` here. `available_at`
 * lives in the availability-lag table, a DIFFERENT endpoint this task's scope does not read
 * (`T-03.4`/`T-03.5`, still `depends_on`-free of this one in `tasks.toml`) — mirrors backend's
 * own "silence is not `ok`" rule (`quarantine_terms.py::quarantine_drawer`: a `series_key_id`
 * absent from the availability mapping is treated as UNRESOLVED, never silently promoted to
 * `true`), so `availableAtPresent` is `false` for every row THIS task can build. Every one of
 * the 10 real rows therefore shows the `QUARENTENA` badge with `available_at` as the one open
 * term — a real, documented state of this phase, not a defect: `T-03.4`/`T-03.5` are the tasks
 * that wire the real answer.
 *
 * `Provenance` (`domain.ts`) is likewise absent from this wire (`SeriesCatalogEntry` carries no
 * such field, backend or TS) — derived instead from `entry.reconstructedFrom`: non-`null` means
 * the row is a RECONSTRUCTION of another published metric (`series_catalog.py`'s own docstring:
 * `reconstructed_from`/`published_error` describe exactly that), which is what `DERIVADO` names;
 * `null` means the row comes straight from the venue, `OBSERVADO`. Measured directly against the
 * real catalog (`open_interest_catalog.py`, `T-06.5`): none of today's 10 rows set
 * `reconstructed_from`, so all 10 read `OBSERVADO` today — the `DERIVADO` branch is exercised by
 * a synthetic entry in this module's own test, not by today's real data.
 */

import { assertNoTickLevelFields } from "../../app/history-transport.ts";
import { TransportError, type TransportErrorKind } from "../s1-console/ingest-health-query.ts";
import type { CatalogRow, Completeness, Provenance } from "./domain.ts";
import type { QuarantineTerms } from "./quarantine.ts";
import {
  assertValidCatalogEntry,
  type Nature,
  type PublishedError,
  type QuantityField,
  type Reduction,
  type SeriesCatalogEntry,
  type SeriesKey,
  type TsConvention,
} from "./series-catalog.ts";

/** Re-exported so `page.tsx`/`source-state.ts` can name the class/kind this module's own
 * transport throws without reaching into `ingest-health-query.ts` directly — same move
 * `collector-status-query.ts` already makes. */
export { TransportError };
export type { TransportErrorKind };

/** Mirrors `SERIES_CATALOG_QUERY_NAME` (`use_cases/series_catalog.py:68`). */
export const SERIES_CATALOG_QUERY_NAME = "series_catalog";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describeValue(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}

// ── THE 15 `SeriesKey` FIELDS, ONE ENTRY PER KIND OF CHECK ────────────────────────────────────

const NATURE_VALUES: ReadonlySet<Nature> = new Set(["STOCK", "FLOW", "RATIO", "EVENT", "TICK"]);
const TS_CONVENTION_VALUES: ReadonlySet<TsConvention> = new Set([
  "POINT_AT_BUCKET_END",
  "AGGREGATE_OVER_BUCKET",
  "OHLC_OVER_BUCKET",
]);
const REDUCTION_VALUES: ReadonlySet<Reduction> = new Set([
  "POINT",
  "OPEN",
  "HIGH",
  "LOW",
  "CLOSE",
  "SUM",
  "MEAN",
  "LAST",
]);
const QUANTITY_FIELD_VALUES: ReadonlySet<QuantityField> = new Set(["q", "nq", "NA"]);

type KeyFieldKind = "string" | "number" | "nature" | "ts_convention" | "reduction" | "quantity_field";

/** `series-catalog.ts:67-83`'s 15 fields, in that interface's own order — the sub-universe of
 * the "1 field removed at a time" falsifier that lives under `key`. */
const KEY_FIELD_KINDS: ReadonlyMap<string, KeyFieldKind> = new Map([
  ["provider", "string"],
  ["venue", "string"],
  ["instrumentId", "string"],
  ["metric", "string"],
  ["cohort", "string"],
  ["interval", "string"],
  ["unit", "string"],
  ["denom", "string"],
  ["nature", "nature"],
  ["tsConvention", "ts_convention"],
  ["reduction", "reduction"],
  ["quantityField", "quantity_field"],
  ["labelShift", "number"],
  ["aggregationScope", "string"],
  ["verifiedBy", "string"],
]);

function assertKeyFieldValue(value: unknown, field: string, kind: KeyFieldKind, context: string): void {
  const ok =
    (kind === "string" && typeof value === "string") ||
    (kind === "number" && typeof value === "number") ||
    (kind === "nature" && typeof value === "string" && NATURE_VALUES.has(value as Nature)) ||
    (kind === "ts_convention" && typeof value === "string" && TS_CONVENTION_VALUES.has(value as TsConvention)) ||
    (kind === "reduction" && typeof value === "string" && REDUCTION_VALUES.has(value as Reduction)) ||
    (kind === "quantity_field" && typeof value === "string" && QUANTITY_FIELD_VALUES.has(value as QuantityField));
  if (!ok) {
    throw new Error(
      `series_catalog envelope: ${context} field "${field}" failed validation for kind "${kind}" ` +
        `(got ${describeValue(value)})`,
    );
  }
}

function assertWireSeriesKey(value: unknown, context: string): asserts value is SeriesKey {
  if (!isPlainRecord(value)) {
    throw new Error(`series_catalog envelope: ${context} is not a plain object`);
  }
  for (const [field, kind] of KEY_FIELD_KINDS) {
    if (!(field in value)) {
      throw new Error(`series_catalog envelope: ${context} is missing field "${field}"`);
    }
    assertKeyFieldValue(value[field], field, kind, context);
  }
}

// ── THE 6 `SeriesCatalogEntry` TOP-LEVEL FIELDS ───────────────────────────────────────────────

type EntryFieldKind = "key" | "string" | "number" | "nullable-string" | "nullable-published-error";

/** `series-catalog.ts:134`'s 6 fields, in that interface's own order. */
const ENTRY_FIELD_KINDS: ReadonlyMap<string, EntryFieldKind> = new Map([
  ["key", "key"],
  ["nativeGrid", "string"],
  ["maxStalenessMs", "number"],
  ["priceUse", "nullable-string"],
  ["reconstructedFrom", "nullable-string"],
  ["publishedError", "nullable-published-error"],
]);

function isValidPublishedError(value: unknown): value is PublishedError {
  return (
    isPlainRecord(value) &&
    typeof value.medianBp === "number" &&
    typeof value.p99Bp === "number" &&
    typeof value.n === "number"
  );
}

function assertWireCatalogEntry(value: unknown, index: number): asserts value is SeriesCatalogEntry {
  const context = `entries[${index}]`;
  if (!isPlainRecord(value)) {
    throw new Error(`series_catalog envelope: ${context} is not a plain object`);
  }
  for (const [field, kind] of ENTRY_FIELD_KINDS) {
    if (!(field in value)) {
      throw new Error(`series_catalog envelope: ${context} is missing field "${field}"`);
    }
    const fieldValue = value[field];
    if (kind === "key") {
      assertWireSeriesKey(fieldValue, `${context}.key`);
      continue;
    }
    const ok =
      (kind === "string" && typeof fieldValue === "string") ||
      (kind === "number" && typeof fieldValue === "number") ||
      (kind === "nullable-string" && (fieldValue === null || typeof fieldValue === "string")) ||
      (kind === "nullable-published-error" && (fieldValue === null || isValidPublishedError(fieldValue)));
    if (!ok) {
      throw new Error(
        `series_catalog envelope: ${context} field "${field}" failed validation for kind "${kind}" ` +
          `(got ${describeValue(fieldValue)})`,
      );
    }
  }
  // Structural shape confirmed — hand off to the business-rule layer (`T-06.10`), which never
  // re-checks presence/type, only the invariants over already-typed fields.
  assertValidCatalogEntry(value as unknown as SeriesCatalogEntry);
}

/** What `series_catalog_envelope` returns, mirrored (`use_cases/series_catalog.py:176-187`). */
export interface SeriesCatalogProjection {
  readonly query: string;
  readonly n_entries: number;
  readonly entries: readonly SeriesCatalogEntry[];
}

/**
 * Parse `GET /series-catalog`'s decoded JSON body into a typed `SeriesCatalogProjection`.
 * Strict on a missing/mistyped one of the 21 fields (6 top-level + 15 under `key`, per entry);
 * permissive on any key beyond those (`ADR-019/D2`). `n_entries` has to agree with
 * `entries.length` — the same truncated-response guard `parseCollectorStatusEnvelope` carries.
 */
export function parseCatalogEnvelope(body: unknown): SeriesCatalogProjection {
  if (!isPlainRecord(body)) {
    throw new Error("series_catalog envelope: response body is not a plain JSON object");
  }
  if (body.query !== SERIES_CATALOG_QUERY_NAME) {
    throw new Error(
      `series_catalog envelope: "query" is ${JSON.stringify(body.query)}, expected ` +
        `${JSON.stringify(SERIES_CATALOG_QUERY_NAME)}`,
    );
  }
  if (!Array.isArray(body.entries)) {
    throw new Error('series_catalog envelope: "entries" is missing or not an array');
  }
  if (body.n_entries !== body.entries.length) {
    throw new Error(
      `series_catalog envelope: "n_entries" (${JSON.stringify(body.n_entries)}) disagrees with ` +
        `entries.length (${body.entries.length}) — this is exactly what a truncated response looks like`,
    );
  }

  const entries: SeriesCatalogEntry[] = body.entries.map((entry, index) => {
    assertWireCatalogEntry(entry, index);
    return entry;
  });

  return { query: body.query, n_entries: body.n_entries, entries };
}

// ── MAPEAMENTO PARA `CatalogRow` — Completeness sempre unmeasured, Provenance de reconstructedFrom,
//    Quarantine com available_at sempre ausente (nenhuma fonte para o termo nesta fase) ──────────

const UNMEASURED_COMPLETENESS: Completeness = { kind: "unmeasured" };

function provenanceForCatalogEntry(entry: SeriesCatalogEntry): Provenance {
  return entry.reconstructedFrom !== null ? "DERIVADO" : "OBSERVADO";
}

/** Mirrors `quarantine_terms.py::quarantine_terms_for_catalog_entry` — see this module's own
 * docstring for why `availableAtPresent` is always `false` here. */
function quarantineTermsForCatalogEntry(entry: SeriesCatalogEntry): QuarantineTerms {
  return {
    labelShiftPresent: Number.isInteger(entry.key.labelShift),
    unitPresent: entry.key.unit.trim().length > 0,
    availableAtPresent: false,
  };
}

function catalogRowFromEntry(entry: SeriesCatalogEntry): CatalogRow {
  return {
    entry,
    provenance: provenanceForCatalogEntry(entry),
    completeness: UNMEASURED_COMPLETENESS,
    quarantine: quarantineTermsForCatalogEntry(entry),
  };
}

export function catalogRowsFromSeriesCatalogProjection(
  projection: SeriesCatalogProjection,
): readonly CatalogRow[] {
  return projection.entries.map(catalogRowFromEntry);
}

// ── THE HTTP TRANSPORT — same base URL/API_PREFIX pattern as `collector-status-query.ts` ─────
//
// `INGEST_HEALTH_API_BASE_URL`/`API_PREFIX`: same FastAPI process, same env vars — see
// `collector-status-query.ts`'s own comment for the full reasoning (measured directly:
// `/series-catalog` without the prefix answers `404`, `/api/v1/series-catalog` answers `200`).
const DEFAULT_API_PREFIX = "/api/v1";

function resolveApiPrefix(): string {
  return process.env.API_PREFIX ?? DEFAULT_API_PREFIX;
}

export interface SeriesCatalogHttpOptions {
  /** Defaults to `process.env.INGEST_HEALTH_API_BASE_URL` — NEVER `NEXT_PUBLIC_*` (`ADR-019/D4`). */
  readonly baseUrl?: string;
  /** Injectable so a test can pass a real `fetch` bound to a test server. */
  readonly fetchImpl?: typeof fetch;
}

function resolveSeriesCatalogBaseUrl(explicit: string | undefined): string {
  const baseUrl = explicit ?? process.env.INGEST_HEALTH_API_BASE_URL;
  if (baseUrl === undefined || baseUrl === "") {
    throw new TransportError(
      "missing_base_url",
      "fetchSeriesCatalogProjectionViaHttp: no base URL configured — pass options.baseUrl or " +
        "set INGEST_HEALTH_API_BASE_URL. Never INGEST_HEALTH_API_BASE_URL prefixed with " +
        "NEXT_PUBLIC_ (ADR-019/D4): that family is inlined into the browser bundle, and this " +
        "module must stay server-only.",
    );
  }
  return baseUrl;
}

function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * The `web` HTTP consumer of `GET /series-catalog` (`SPEC-003` §3.4). No process-level cache and
 * no `ETag` — same reasoning `fetchCollectorStatusProjectionViaHttp` gives: this envelope has no
 * fingerprint of its own (`ADR-029/D4`'s conditional revalidation is specific to
 * `/ingest-health`'s `sha256`); `cache: "no-store"` alone keeps every render honest.
 *
 * Throws `TransportError` with the same four `TransportErrorKind`s the other two transports use:
 * `missing_base_url`, `connection_refused`, `non_2xx`, `malformed_envelope`.
 */
export async function fetchSeriesCatalogProjectionViaHttp(
  options: SeriesCatalogHttpOptions = {},
): Promise<SeriesCatalogProjection> {
  const baseUrl = resolveSeriesCatalogBaseUrl(options.baseUrl);
  const doFetch = options.fetchImpl ?? fetch;
  const url = new URL(`${resolveApiPrefix()}/series-catalog`, baseUrl);

  let response: Response;
  try {
    response = await doFetch(url, { cache: "no-store" });
  } catch (cause) {
    throw new TransportError(
      "connection_refused",
      `fetchSeriesCatalogProjectionViaHttp: GET ${url.toString()} never reached a server ` +
        `(${describeCause(cause)})`,
    );
  }

  if (!response.ok) {
    throw new TransportError(
      "non_2xx",
      `fetchSeriesCatalogProjectionViaHttp: GET ${url.toString()} answered ${response.status} ` +
        `${response.statusText}`,
      response.status,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    throw new TransportError(
      "malformed_envelope",
      `fetchSeriesCatalogProjectionViaHttp: GET ${url.toString()} body is not valid JSON ` +
        `(${describeCause(cause)})`,
    );
  }
  assertNoTickLevelFields(body);

  try {
    return parseCatalogEnvelope(body);
  } catch (cause) {
    throw new TransportError(
      "malformed_envelope",
      `fetchSeriesCatalogProjectionViaHttp: envelope failed validation (${describeCause(cause)})`,
    );
  }
}
