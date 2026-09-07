import "server-only";

/**
 * `T-03.5` — the `web` HTTP consumer of `GET {API_PREFIX}/series-quarantine`
 * (`SPEC-003` §3.6, `use_cases/series_quarantine.py::series_quarantine_query`, built by `T-03.4`).
 *
 * Same `server-only` reasoning `series-catalog-query.ts`/`collector-status-query.ts` already
 * document — this module is a THIRD `server-only` consumer under `s3-inspector/`, so it needs no
 * new `--conditions=react-server` flag (`T-01.1` already carries it on `test:s3`).
 *
 * ── VALIDATION POSTURE, SAME AS `parseCatalogEnvelope`/`parseCollectorStatusEnvelope` ──
 *
 * Permissive on an UNKNOWN field, strict on a MISSING or MISTYPED one (`ADR-019/D2`) — every one
 * of `ROW_FIELD_KINDS`' 8 entries (`series_quarantine_report.py::QuarantineRow.to_wire()`'s row
 * shape) has to be present with the right shape, or `assertQuarantineRow` throws.
 *
 * ── WHAT THIS MODULE REPLACES ──────────────────────────────────────────────────────────────
 *
 * Before this task, `S3`'s quarantine drawer was derived from `CatalogRow.quarantine`
 * (`series-catalog-query.ts`'s own docstring: `availableAtPresent` is ALWAYS `false` there,
 * because `GET /series-catalog` carries no availability-lag term at all). This module reads the
 * REAL third term from `GET /series-quarantine` instead — `availableAtPresent` here is
 * `available_at IS NOT NULL` in the store (`sqlite_series_quarantine_store.py`'s own comment),
 * not a hardcoded guess. `domain.ts::buildQuarantineDrawer` no longer takes `CatalogRow[]` — it
 * takes the `QuarantineSourceRow[]` this module builds, so the drawer stops being a shadow of
 * the catalog and starts being its own read.
 */

import { assertNoTickLevelFields } from "../../app/history-transport.ts";
import { TransportError, type TransportErrorKind } from "../s1-console/ingest-health-query.ts";
import type { QuarantineSourceRow } from "./domain.ts";
import type { QuarantineTerms } from "./quarantine.ts";

/** Re-exported so `page.tsx`/`source-state.ts` can name the class/kind this module's own
 * transport throws without reaching into `ingest-health-query.ts` directly — same move
 * `series-catalog-query.ts`/`collector-status-query.ts` already make. */
export { TransportError };
export type { TransportErrorKind };

/** Mirrors `SERIES_QUARANTINE_QUERY_NAME` (`domain/series_quarantine_report.py:19`). */
export const SERIES_QUARANTINE_QUERY_NAME = "series_quarantine";

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

/** One projected `/series-quarantine` row — `QuarantineRow.to_wire()`'s 9 keys verbatim
 * (`source`/`series_kind`/`binance_symbol`/`coinalyze_symbol`/`n_points`/`recorded_at`, plus the
 * three `QuarantineTerms` keys spread inline, camelCased). Never `points_json` — `D3.2`'s
 * guarantee lives in the backend query, not here; this type has no field to carry it even if a
 * future edit tried. */
export interface QuarantineWireRow {
  readonly source: string;
  readonly series_kind: string;
  readonly binance_symbol: string;
  readonly coinalyze_symbol: string;
  readonly n_points: number;
  readonly recorded_at: string;
  readonly labelShiftPresent: boolean;
  readonly unitPresent: boolean;
  readonly availableAtPresent: boolean;
}

/** What `series_quarantine_query` returns, mirrored (`series_quarantine_report.py:81-95`). */
export interface SeriesQuarantineProjection {
  readonly query: string;
  readonly n_rows: number;
  readonly rows: readonly QuarantineWireRow[];
}

type RowFieldKind = "string" | "number" | "boolean";

/** `QuarantineRow.to_wire()`'s 9 keys, in that method's own order — the universe the "1 field
 * removed at a time" falsifier (`T-03.5`'s DoD) sweeps over. */
const ROW_FIELD_KINDS: ReadonlyMap<string, RowFieldKind> = new Map([
  ["source", "string"],
  ["series_kind", "string"],
  ["binance_symbol", "string"],
  ["coinalyze_symbol", "string"],
  ["n_points", "number"],
  ["recorded_at", "string"],
  ["labelShiftPresent", "boolean"],
  ["unitPresent", "boolean"],
  ["availableAtPresent", "boolean"],
]);

function assertRowFieldValue(value: unknown, field: string, kind: RowFieldKind, context: string): void {
  const ok =
    (kind === "string" && typeof value === "string") ||
    (kind === "number" && typeof value === "number") ||
    (kind === "boolean" && typeof value === "boolean");
  if (!ok) {
    throw new Error(
      `series_quarantine envelope: ${context} field "${field}" failed validation for kind ` +
        `"${kind}" (got ${describeValue(value)})`,
    );
  }
}

function assertQuarantineRow(value: unknown, index: number): asserts value is QuarantineWireRow {
  const context = `rows[${index}]`;
  if (!isPlainRecord(value)) {
    throw new Error(`series_quarantine envelope: ${context} is not a plain object`);
  }
  for (const [field, kind] of ROW_FIELD_KINDS) {
    if (!(field in value)) {
      throw new Error(`series_quarantine envelope: ${context} is missing field "${field}"`);
    }
    assertRowFieldValue(value[field], field, kind, context);
  }
}

/**
 * Parse `GET /series-quarantine`'s decoded JSON body into a typed `SeriesQuarantineProjection`.
 * Strict on a missing/mistyped one of the 9 row fields; permissive on any key beyond those
 * (`ADR-019/D2`). `n_rows` has to agree with `rows.length` — the same truncated-response guard
 * `parseCatalogEnvelope`/`parseCollectorStatusEnvelope` carry.
 */
export function parseQuarantineEnvelope(body: unknown): SeriesQuarantineProjection {
  if (!isPlainRecord(body)) {
    throw new Error("series_quarantine envelope: response body is not a plain JSON object");
  }
  if (body.query !== SERIES_QUARANTINE_QUERY_NAME) {
    throw new Error(
      `series_quarantine envelope: "query" is ${JSON.stringify(body.query)}, expected ` +
        `${JSON.stringify(SERIES_QUARANTINE_QUERY_NAME)}`,
    );
  }
  if (!Array.isArray(body.rows)) {
    throw new Error('series_quarantine envelope: "rows" is missing or not an array');
  }
  if (body.n_rows !== body.rows.length) {
    throw new Error(
      `series_quarantine envelope: "n_rows" (${JSON.stringify(body.n_rows)}) disagrees with ` +
        `rows.length (${body.rows.length}) — this is exactly what a truncated response looks like`,
    );
  }

  const rows: QuarantineWireRow[] = body.rows.map((row, index) => {
    assertQuarantineRow(row, index);
    return row;
  });

  return { query: body.query, n_rows: body.n_rows, rows };
}

// ── MAPEAMENTO PARA `QuarantineSourceRow` — a gaveta lê ISTO, não `CatalogRow` ────────────────

/** `seriesLabel` built from the table's own primary key (`source, series_kind, binance_symbol`,
 * `sqlite_series_quarantine_store.py`'s `_DDL`) plus `coinalyze_symbol` for the reader who wants
 * to cross-check against the venue Coinalyze itself names — no `SeriesKey`/catalog join here:
 * this endpoint's row is not one of the catalog's 10 entries, it is one captured-and-quarantined
 * symbol pair. */
function quarantineSourceRowFromWireRow(row: QuarantineWireRow): QuarantineSourceRow {
  const terms: QuarantineTerms = {
    labelShiftPresent: row.labelShiftPresent,
    unitPresent: row.unitPresent,
    availableAtPresent: row.availableAtPresent,
  };
  return {
    seriesLabel: `${row.binance_symbol} · ${row.series_kind} · ${row.source} (${row.coinalyze_symbol})`,
    terms,
  };
}

export function quarantineSourceRowsFromProjection(
  projection: SeriesQuarantineProjection,
): readonly QuarantineSourceRow[] {
  return projection.rows.map(quarantineSourceRowFromWireRow);
}

// ── THE HTTP TRANSPORT — same base URL/API_PREFIX pattern as the other two `s3-inspector`
//    transports (`series-catalog-query.ts`'s own comment gives the full reasoning) ────────────
const DEFAULT_API_PREFIX = "/api/v1";

function resolveApiPrefix(): string {
  return process.env.API_PREFIX ?? DEFAULT_API_PREFIX;
}

export interface SeriesQuarantineHttpOptions {
  /** Defaults to `process.env.INGEST_HEALTH_API_BASE_URL` — NEVER `NEXT_PUBLIC_*` (`ADR-019/D4`). */
  readonly baseUrl?: string;
  /** Injectable so a test can pass a real `fetch` bound to a test server. */
  readonly fetchImpl?: typeof fetch;
}

function resolveSeriesQuarantineBaseUrl(explicit: string | undefined): string {
  const baseUrl = explicit ?? process.env.INGEST_HEALTH_API_BASE_URL;
  if (baseUrl === undefined || baseUrl === "") {
    throw new TransportError(
      "missing_base_url",
      "fetchSeriesQuarantineProjectionViaHttp: no base URL configured — pass options.baseUrl or " +
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
 * The `web` HTTP consumer of `GET /series-quarantine` (`SPEC-003` §3.6). No process-level cache
 * and no `ETag` — same reasoning `fetchSeriesCatalogProjectionViaHttp` gives: this envelope has
 * no fingerprint of its own; `cache: "no-store"` alone keeps every render honest.
 *
 * Throws `TransportError` with the same four `TransportErrorKind`s the other two `s3-inspector`
 * transports use: `missing_base_url`, `connection_refused`, `non_2xx`, `malformed_envelope`.
 */
export async function fetchSeriesQuarantineProjectionViaHttp(
  options: SeriesQuarantineHttpOptions = {},
): Promise<SeriesQuarantineProjection> {
  const baseUrl = resolveSeriesQuarantineBaseUrl(options.baseUrl);
  const doFetch = options.fetchImpl ?? fetch;
  const url = new URL(`${resolveApiPrefix()}/series-quarantine`, baseUrl);

  let response: Response;
  try {
    response = await doFetch(url, { cache: "no-store" });
  } catch (cause) {
    throw new TransportError(
      "connection_refused",
      `fetchSeriesQuarantineProjectionViaHttp: GET ${url.toString()} never reached a server ` +
        `(${describeCause(cause)})`,
    );
  }

  if (!response.ok) {
    throw new TransportError(
      "non_2xx",
      `fetchSeriesQuarantineProjectionViaHttp: GET ${url.toString()} answered ${response.status} ` +
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
      `fetchSeriesQuarantineProjectionViaHttp: GET ${url.toString()} body is not valid JSON ` +
        `(${describeCause(cause)})`,
    );
  }
  assertNoTickLevelFields(body);

  try {
    return parseQuarantineEnvelope(body);
  } catch (cause) {
    throw new TransportError(
      "malformed_envelope",
      `fetchSeriesQuarantineProjectionViaHttp: envelope failed validation (${describeCause(cause)})`,
    );
  }
}
