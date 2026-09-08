import "server-only";

/**
 * `T-03.7` — the `web` HTTP consumer of `GET {API_PREFIX}/collector-status`
 * (`ADR-030` D5, `use_cases/collector_status.py`'s `collector_status_query`).
 *
 * `T-03.6` built the backend side of `ADR-030`: a SEPARATE envelope from `/ingest-health`
 * (`query: "collector_status"`, never `"ingest_health_query"`) that projects the four formulas
 * `ADR-030` D1-D4 decide per `(source, endpoint)` — `status` calibrated by the series' OWN
 * observed cadence (not a global constant), `uptimePercent` over a trailing 24h window, and
 * `retention`/`resilience` gated to `unmeasured`/`not_scored` (or `not_applicable`/`unavailable`
 * when the series is `PARADO`) — never a guessed number, never a plan constant relabeled as a
 * per-series measurement (`ADR-030`'s own falsifiers F-7/F-8).
 *
 * `ingest-health-query.ts`'s `collectorRowsFromIngestHealthProjection` (the FIRST, pre-`ADR-030`
 * reading) derived `CollectorRow.status` from the single MOST RECENT `md.ingest_run` row per
 * series — the `frontend-architect` already named that "não é uptime" (`ADR-030`'s own Contexto
 * section, quoting `REVISAO-FB` §4). This module REPLACES that reading for `S1Console.tsx`: `S1`
 * now shows the per-series AGGREGATE `ADR-030` computes, not the last run
 * (`docs/plans/SPEC-003-camada-de-leitura-do-painel/03_recursos_baratos.md` item `3.6`). The
 * `ingest-health-query.ts` module and its `/ingest-health` transport are UNCHANGED and still
 * fully tested on their own — this file adds a second, independent transport/parser next to it,
 * exactly the same class of move `ADR-030` D5 describes ("envelope SEPARADO").
 *
 * ── THE 6 FIELDS THIS MODULE HANDS TO `CollectorRow`, AND THE 9 IT DOES NOT ────────────────
 *
 * `ADR-030` D5: "Os 6 primeiros campos de cada linha são `CollectorRow` **verbatim**; os demais
 * são **os insumos das fórmulas**, para que a conferência não dependa de confiar no código."
 * `collectorRowFromCollectorStatusRow` below picks exactly those 6
 * (`series`/`retention`/`resilience`/`status`/`uptimePercent`/`statusDetail`) — the other 9
 * (`n_runs_total`, `n_runs_in_window`, `last_run_id`, `last_verdict`, `last_ended_at`, `age_s`,
 * `liveness`, plus the envelope-level `as_of`/`window_hours`) stay on `CollectorStatusRow`/
 * `CollectorStatusProjection`, available to a reader who wants to re-derive the row without
 * trusting this module, but never fed to `S1Console.tsx` (`view-model.ts` has no slot for them).
 *
 * `retention`/`resilience` need NO new domain type: `ADR-030` D3/D4 only ever emit
 * `{"kind":"unmeasured"}`/`{"kind":"not_applicable"}` and `{"kind":"not_scored"}`/
 * `{"kind":"unavailable"}` — four of the six/four variants `domain.ts`'s `RetentionWindow`/
 * `ResilienceLabel` already declare (`domain.ts:59-79`, `T-03.1`'s own refs). This module's
 * `Retention`/`Resilience` types below are the NARROW subset the wire actually carries, and are
 * structurally assignable to the wider domain types without a cast.
 *
 * `RN-4` (`SPEC-003` §3.7): this module never recomputes `janela_de_perda` — it does not even
 * read it; `ADR-030`'s formulas are defined over `runs()` alone and never touch that column.
 *
 * ── VALIDATION POSTURE, SAME AS `ingest-health-query.ts`'s `parseIngestHealthEnvelope` ────────
 *
 * Permissive on an UNKNOWN field, strict on a MISSING or MISTYPED one (`ADR-019/D2`) — every one
 * of `ROW_FIELD_KINDS`' 15 entries (`ADR-030` D5's row shape, one entry per field `T-03.1`'s ADR
 * fixes) has to be present with the right shape, or `assertCollectorStatusRow` throws; an extra
 * key beyond those 15 is ignored, never rejected.
 */

import { assertNoTickLevelFields } from "../../app/history-transport.ts";
import type { CollectorRow, CollectorStatus, ReconnectionEvent, StorageBudgetLine } from "./domain.ts";
import { TransportError, type TransportErrorKind } from "./ingest-health-query.ts";
import { buildS1ViewModel, type S1ViewModel } from "./view-model.ts";

/** Re-exported so `source-state.ts`/`page.tsx` can name the class/kind this module's own
 * transport throws without reaching back into `ingest-health-query.ts` for a type that is,
 * semantically, shared plumbing between the two transports, not that other module's alone. */
export { TransportError };
export type { TransportErrorKind };

/** Mirror of `COLLECTOR_STATUS_QUERY_NAME` (`domain/collector_status.py:25`) — how this, the
 * second envelope, is told apart from `ingest_health_query`'s, by name, never by shape guessing. */
export const COLLECTOR_STATUS_QUERY_NAME = "collector_status";

/** `ADR-030` D1: the series had `>= MIN_RUNS_FOR_LIVENESS` runs, so staleness WAS judged. */
export interface LivenessJudged {
  readonly kind: "judged";
  readonly period_s: number;
  readonly stale_after_s: number;
}

/** `ADR-030` D1: fewer than `MIN_RUNS_FOR_LIVENESS` runs — staleness is NOT judged. */
export interface LivenessNotJudged {
  readonly kind: "not_judged";
  readonly n_runs: number;
}

export type Liveness = LivenessJudged | LivenessNotJudged;

/** `ADR-030` D3's two wire variants — a narrow subset of `domain.ts`'s `RetentionWindow`,
 * structurally assignable to it (both variants below carry only `kind`, matching that union's
 * `unmeasured`/`not_applicable` members exactly). */
export type Retention = { readonly kind: "unmeasured" } | { readonly kind: "not_applicable" };

/** `ADR-030` D4's two wire variants — a narrow subset of `domain.ts`'s `ResilienceLabel`, same
 * reasoning as `Retention` above. */
export type Resilience = { readonly kind: "not_scored" } | { readonly kind: "unavailable" };

/** One projected `/collector-status` row — `ADR-030` D5's envelope example, verbatim field set.
 * The first 6 fields are `CollectorRow` verbatim; the other 9 are the formulas' own insumos. */
export interface CollectorStatusRow {
  readonly series: string;
  readonly source: string;
  readonly endpoint: string;
  readonly status: CollectorStatus;
  readonly uptimePercent: number | null;
  readonly statusDetail: string | null;
  readonly retention: Retention;
  readonly resilience: Resilience;
  readonly n_runs_total: number;
  readonly n_runs_in_window: number;
  readonly last_run_id: string;
  readonly last_verdict: string;
  readonly last_ended_at: string;
  readonly age_s: number;
  readonly liveness: Liveness;
}

/** What `collector_status_query` returns, mirrored — `as_of`/`window_hours` are envelope-level,
 * never per-row (`ADR-030` D0/D2). */
export interface CollectorStatusProjection {
  readonly as_of: string;
  readonly window_hours: number;
  readonly rows: readonly CollectorStatusRow[];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `ADR-030` D1's closed set — `ARQUIVO`/`PENDENTE` are never emitted in `F3` (D1's own closing
 * bullet, falsifier `F-4`), but this parser validates against `domain.ts`'s full 4-value
 * `CollectorStatus` type, not the 2-value subset `F3` happens to emit today: a parser narrower
 * than the type it produces would be the wrong place to encode that scope limit. */
const KNOWN_STATUSES: ReadonlySet<string> = new Set<CollectorStatus>(["ATIVO", "PARADO", "ARQUIVO", "PENDENTE"]);

function isValidRetention(value: unknown): value is Retention {
  return isPlainRecord(value) && (value.kind === "unmeasured" || value.kind === "not_applicable");
}

function isValidResilience(value: unknown): value is Resilience {
  return isPlainRecord(value) && (value.kind === "not_scored" || value.kind === "unavailable");
}

function isValidLiveness(value: unknown): value is Liveness {
  if (!isPlainRecord(value)) {
    return false;
  }
  if (value.kind === "judged") {
    return typeof value.period_s === "number" && typeof value.stale_after_s === "number";
  }
  if (value.kind === "not_judged") {
    return typeof value.n_runs === "number";
  }
  return false;
}

type RowFieldKind =
  | "string"
  | "number"
  | "nullable-number"
  | "nullable-string"
  | "status"
  | "retention"
  | "resilience"
  | "liveness";

/** `ADR-030` D5's 15 row fields, in the ADR's own order — the universe the "1 field removed at a
 * time" falsifier (`T-03.7`'s DoD) sweeps over. */
const ROW_FIELD_KINDS: ReadonlyMap<string, RowFieldKind> = new Map([
  ["series", "string"],
  ["source", "string"],
  ["endpoint", "string"],
  ["status", "status"],
  ["uptimePercent", "nullable-number"],
  ["statusDetail", "nullable-string"],
  ["retention", "retention"],
  ["resilience", "resilience"],
  ["n_runs_total", "number"],
  ["n_runs_in_window", "number"],
  ["last_run_id", "string"],
  ["last_verdict", "string"],
  ["last_ended_at", "string"],
  ["age_s", "number"],
  ["liveness", "liveness"],
]);

function describeValue(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}

function assertRowFieldValue(value: unknown, column: string, kind: RowFieldKind, context: string): void {
  const ok =
    (kind === "string" && typeof value === "string") ||
    (kind === "number" && typeof value === "number") ||
    (kind === "nullable-number" && (value === null || typeof value === "number")) ||
    (kind === "nullable-string" && (value === null || typeof value === "string")) ||
    (kind === "status" && typeof value === "string" && KNOWN_STATUSES.has(value)) ||
    (kind === "retention" && isValidRetention(value)) ||
    (kind === "resilience" && isValidResilience(value)) ||
    (kind === "liveness" && isValidLiveness(value));
  if (!ok) {
    throw new Error(
      `collector_status envelope: ${context} column "${column}" failed validation for kind ` +
        `"${kind}" (got ${describeValue(value)})`,
    );
  }
}

function assertCollectorStatusRow(value: unknown, index: number): asserts value is CollectorStatusRow {
  const context = `rows[${index}]`;
  if (!isPlainRecord(value)) {
    throw new Error(`collector_status envelope: ${context} is not a plain object`);
  }
  for (const [column, kind] of ROW_FIELD_KINDS) {
    if (!(column in value)) {
      throw new Error(`collector_status envelope: ${context} is missing column "${column}"`);
    }
    assertRowFieldValue(value[column], column, kind, context);
  }
}

/**
 * Parse `GET /collector-status`'s decoded JSON body into a typed `CollectorStatusProjection`
 * (`ADR-030` D5's envelope). Strict on a missing/mistyped one of the 15 row columns; permissive
 * on any key beyond those 15 (`ADR-019/D2`, same posture `parseIngestHealthEnvelope` already
 * has). `n_rows` has to agree with `rows.length` — the same truncated-response guard that
 * envelope carries.
 */
export function parseCollectorStatusEnvelope(body: unknown): CollectorStatusProjection {
  if (!isPlainRecord(body)) {
    throw new Error("collector_status envelope: response body is not a plain JSON object");
  }
  if (body.query !== COLLECTOR_STATUS_QUERY_NAME) {
    throw new Error(
      `collector_status envelope: "query" is ${JSON.stringify(body.query)}, expected ` +
        `${JSON.stringify(COLLECTOR_STATUS_QUERY_NAME)}`,
    );
  }
  if (typeof body.as_of !== "string") {
    throw new Error('collector_status envelope: "as_of" is missing or not a string');
  }
  if (typeof body.window_hours !== "number") {
    throw new Error('collector_status envelope: "window_hours" is missing or not a number');
  }
  if (!Array.isArray(body.rows)) {
    throw new Error('collector_status envelope: "rows" is missing or not an array');
  }
  if (body.n_rows !== body.rows.length) {
    throw new Error(
      `collector_status envelope: "n_rows" (${JSON.stringify(body.n_rows)}) disagrees with ` +
        `rows.length (${body.rows.length}) — this is exactly what a truncated response looks like`,
    );
  }

  const rows: CollectorStatusRow[] = body.rows.map((row, index) => {
    assertCollectorStatusRow(row, index);
    return row;
  });

  return { as_of: body.as_of, window_hours: body.window_hours, rows };
}

// ── MAPEAMENTO PARA `CollectorRow` — OS 6 CAMPOS VERBATIM, `ADR-030` D5 ─────────────────────

function collectorRowFromCollectorStatusRow(row: CollectorStatusRow): CollectorRow {
  return {
    series: row.series,
    retention: row.retention,
    resilience: row.resilience,
    status: row.status,
    uptimePercent: row.uptimePercent,
    statusDetail: row.statusDetail,
  };
}

/** One `CollectorRow` per `CollectorStatusRow` — no de-duplication needed here: `ADR-030` D0
 * already fixes ONE row per `(source, endpoint)` server-side, unlike
 * `collectorRowsFromIngestHealthProjection` (`ingest-health-query.ts`), which has to fold
 * multiple runs down to the latest one itself. */
export function collectorRowsFromCollectorStatusProjection(
  projection: CollectorStatusProjection,
): readonly CollectorRow[] {
  return projection.rows.map(collectorRowFromCollectorStatusRow);
}

/** The full `S1ViewModel`, with `rows` sourced from `collector_status_query` — same caveat
 * `buildS1ViewModelFromIngestHealthProjection` already carries for the other three arguments:
 * `etlQueueDepthPending`/`storageBudgetLines`/`reconnectionEvents` have no data source in this
 * feature (Redis Streams consumer-group depth, a different feature's scope). */
export function buildS1ViewModelFromCollectorStatusProjection(
  projection: CollectorStatusProjection,
  etlQueueDepthPending: number,
  storageBudgetLines: readonly StorageBudgetLine[],
  reconnectionEvents: readonly ReconnectionEvent[],
): S1ViewModel {
  return buildS1ViewModel(
    collectorRowsFromCollectorStatusProjection(projection),
    etlQueueDepthPending,
    storageBudgetLines,
    reconnectionEvents,
  );
}

// ── THE HTTP TRANSPORT — same base URL as `ingest-health-query.ts`'s, same API process ────────
//
// `INGEST_HEALTH_API_BASE_URL` names the Next server's ONE backend base URL (`.env.example`:
// "base URL que o servidor Next usa"), not an ingest-health-specific address — `/collector-status`
// is served by the SAME FastAPI process, over the SAME `API_PREFIX`, so reusing the variable
// name is not a scope stretch: introducing a second base-URL env var for the identical host
// would be the actual invented scope. `ConsoleClient.tsx`'s `missing_base_url` microcopy already
// names this exact variable and stays correct unchanged.
//
// `API_PREFIX` (`ADR-029/D2`, `T-02.2`, `backend/src/main/__init__.py:47,103`): EVERY route —
// `/collector-status` included — is mounted under this prefix, default `/api/v1`, "sem prefixo
// -> 404" by that task's own DoD. `T-02.2` closed TODAY (2026-09-07), backend-only
// (`depends_on`/`arquivos` name only `backend/src/main`, `backend/src/api/routes/*` — no
// frontend file), and no task in this feature's `tasks.toml` updates a `web` fetch's URL
// construction to add it — measured directly against a real, freshly-seeded server: `curl
// http://127.0.0.1:.../collector-status` → `404`; `curl .../api/v1/collector-status` → `200`
// with the real envelope. Left as `new URL("/collector-status", baseUrl)` (no prefix), THIS
// module's own transport would be unreachable in exactly the same way — not a hypothetical, the
// `make e2e` run this task's own DoD requires measured it directly (`ui_state:ok` never true,
// access log still +1 per request — the 404 IS the malformed response `TransportError` catches
// as `non_2xx`). Fixed HERE, narrowly, because it is this module's own deliverable that would
// otherwise not work outside a unit test; `ingest-health-query.ts` carries the identical
// pre-existing gap, UNTOUCHED by this task (out of `T-03.7`'s declared file scope) — flagged in
// this task's own gate report as a cross-cutting finding, not silently duplicated-around.
const DEFAULT_API_PREFIX = "/api/v1";

/** Mirrors `backend/src/main/__init__.py`'s own `os.environ.get("API_PREFIX", "/api/v1")` — same
 * variable, same default, read from the SAME process environment `make api`/`next start` share
 * in dev (`docker compose`, `T-02.6`, passes the identical `.env` to both containers). */
function resolveApiPrefix(): string {
  return process.env.API_PREFIX ?? DEFAULT_API_PREFIX;
}

export interface CollectorStatusHttpOptions {
  /** Defaults to `process.env.INGEST_HEALTH_API_BASE_URL` — NEVER `NEXT_PUBLIC_*` (`ADR-019/D4`),
   * same rule `ingest-health-query.ts`'s `resolveIngestHealthBaseUrl` already enforces. */
  readonly baseUrl?: string;
  /** Injectable so a test can pass a real `fetch` bound to a test server. */
  readonly fetchImpl?: typeof fetch;
}

function resolveCollectorStatusBaseUrl(explicit: string | undefined): string {
  const baseUrl = explicit ?? process.env.INGEST_HEALTH_API_BASE_URL;
  if (baseUrl === undefined || baseUrl === "") {
    throw new TransportError(
      "missing_base_url",
      "fetchCollectorStatusProjectionViaHttp: no base URL configured — pass options.baseUrl or " +
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
 * The `web` HTTP consumer of `GET /collector-status` (`ADR-030` D5). No process-level cache and
 * no `ETag`/`If-None-Match` here — `ADR-030` D5 declares no fingerprint for this envelope
 * (`ADR-029/D4`'s conditional revalidation is specific to `/ingest-health`'s `sha256`, `T-02.5`);
 * `cache: "no-store"` alone is enough to keep every render honest about the current aggregate.
 *
 * Throws `TransportError` with the same four `TransportErrorKind`s `fetchIngestHealthProjectionViaHttp`
 * uses: `missing_base_url`, `connection_refused`, `non_2xx`, `malformed_envelope` (a `2xx` body
 * that is not valid JSON, or that fails `parseCollectorStatusEnvelope`'s schema check).
 */
export async function fetchCollectorStatusProjectionViaHttp(
  options: CollectorStatusHttpOptions = {},
): Promise<CollectorStatusProjection> {
  const baseUrl = resolveCollectorStatusBaseUrl(options.baseUrl);
  const doFetch = options.fetchImpl ?? fetch;
  const url = new URL(`${resolveApiPrefix()}/collector-status`, baseUrl);

  let response: Response;
  try {
    response = await doFetch(url, { cache: "no-store" });
  } catch (cause) {
    throw new TransportError(
      "connection_refused",
      `fetchCollectorStatusProjectionViaHttp: GET ${url.toString()} never reached a server ` +
        `(${describeCause(cause)})`,
    );
  }

  if (!response.ok) {
    throw new TransportError(
      "non_2xx",
      `fetchCollectorStatusProjectionViaHttp: GET ${url.toString()} answered ${response.status} ` +
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
      `fetchCollectorStatusProjectionViaHttp: GET ${url.toString()} body is not valid JSON ` +
        `(${describeCause(cause)})`,
    );
  }
  assertNoTickLevelFields(body);

  try {
    return parseCollectorStatusEnvelope(body);
  } catch (cause) {
    throw new TransportError(
      "malformed_envelope",
      `fetchCollectorStatusProjectionViaHttp: envelope failed validation (${describeCause(cause)})`,
    );
  }
}
