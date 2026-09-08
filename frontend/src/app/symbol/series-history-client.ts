import "server-only";

/**
 * `T-02.4` — the `web` HTTP consumer of `GET {API_PREFIX}/series-history` (`ADR-034/D1`/`D5`,
 * `SPEC-006 §5.2`). Same shape as `features/s1-console/collector-status-query.ts` and
 * `features/s3-inspector/series-catalog-query.ts`: builds the request through the transport
 * module (`../history-transport.ts`, `T-01.5`) rather than a hand-built query string, fetches
 * with `cache: "no-store"`, and turns every failure into the SAME `TransportError` class the
 * other two `web` transports already throw (`kind` values `missing_base_url` /
 * `connection_refused` / `non_2xx` / `malformed_envelope`) — reused, not reinvented, so
 * `page.tsx` has ONE error vocabulary to switch on across all four HTTP calls it makes
 * (catalog + 3× history).
 *
 * `assertNoTickLevelFields`/`assertBucketSpacingWithinInterval` are IMPORTED from
 * `../history-transport.ts`, not reimplemented — same discipline `../live-transport.ts`
 * already follows for the live edge of the SAME `ADR-005` falsifier.
 */

import {
  assertBucketSpacingWithinInterval,
  assertNoTickLevelFields,
  historyRequestUrl,
  type HistoryRequestKey,
} from "../history-transport.ts";
import { TransportError, type TransportErrorKind } from "../../features/s1-console/ingest-health-query.ts";

export { TransportError };
export type { TransportErrorKind };

/** One row of the `rows` array — `SeriesHistoryRow.to_wire()` (`series_history_report.py`),
 * mirrored field-for-field. `available_at`/`value`/`absence` are `null` exactly when there is
 * no point (`(value === null) !== (absence === null)` never both, per `CA-F1-5`) — this module
 * does not re-derive that invariant, it is asserted below at the point the wire is trusted. */
export interface SeriesHistoryRow {
  readonly event_time: number;
  readonly available_at: number | null;
  readonly value: string | null;
  readonly absence: string | null;
}

/** The 3-level envelope `GET /series-history` serves (`ADR-005/D3`, `session`/`panel`/`rows`). */
export interface SeriesHistoryEnvelope {
  readonly session: { readonly principal_id: string | null; readonly server_now_ms: number };
  readonly panel: {
    readonly series_key_id: string;
    readonly source: string;
    readonly nature: string;
    readonly unit: string;
  };
  readonly rows: readonly SeriesHistoryRow[];
  readonly knowledge_time: number;
  readonly bar_policy: string;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertWireRow(value: unknown, index: number): asserts value is SeriesHistoryRow {
  if (!isPlainRecord(value)) {
    throw new Error(`series_history envelope: rows[${index}] is not a plain object`);
  }
  if (typeof value.event_time !== "number") {
    throw new Error(`series_history envelope: rows[${index}].event_time must be a number`);
  }
  if (value.available_at !== null && typeof value.available_at !== "number") {
    throw new Error(`series_history envelope: rows[${index}].available_at must be a number or null`);
  }
  if (value.value !== null && typeof value.value !== "string") {
    throw new Error(`series_history envelope: rows[${index}].value must be a string or null`);
  }
  if (value.absence !== null && typeof value.absence !== "string") {
    throw new Error(`series_history envelope: rows[${index}].absence must be a string or null`);
  }
  if ((value.value === null) === (value.absence === null)) {
    throw new Error(
      `series_history envelope: rows[${index}] has value=${JSON.stringify(value.value)} and ` +
        `absence=${JSON.stringify(value.absence)} — CA-F1-5 requires exactly one of the two to be null`,
    );
  }
}

/**
 * Parse `GET /series-history`'s decoded JSON body. Strict on the envelope shape; delegates the
 * two ADR-005 falsifier gates (`assertNoTickLevelFields`/`assertBucketSpacingWithinInterval`)
 * to the caller (`fetchSeriesHistoryViaHttp`, below), which runs them on `body` BEFORE this
 * narrows it — same order `series-catalog-query.ts` uses, so a smuggled tick-level field
 * anywhere in the payload is caught before this function trusts any of it.
 */
export function parseSeriesHistoryEnvelope(body: unknown): SeriesHistoryEnvelope {
  if (!isPlainRecord(body)) {
    throw new Error("series_history envelope: response body is not a plain JSON object");
  }
  const session = body.session;
  if (!isPlainRecord(session) || typeof session.server_now_ms !== "number") {
    throw new Error('series_history envelope: "session.server_now_ms" is missing or not a number');
  }
  if (session.principal_id !== null && typeof session.principal_id !== "string") {
    throw new Error('series_history envelope: "session.principal_id" must be a string or null');
  }
  const panel = body.panel;
  if (
    !isPlainRecord(panel) ||
    typeof panel.series_key_id !== "string" ||
    typeof panel.source !== "string" ||
    typeof panel.nature !== "string" ||
    typeof panel.unit !== "string"
  ) {
    throw new Error('series_history envelope: "panel" is missing one of series_key_id/source/nature/unit');
  }
  if (!Array.isArray(body.rows)) {
    throw new Error('series_history envelope: "rows" is missing or not an array');
  }
  body.rows.forEach((row, index) => assertWireRow(row, index));
  if (typeof body.knowledge_time !== "number") {
    throw new Error('series_history envelope: "knowledge_time" must be a number');
  }
  if (typeof body.bar_policy !== "string") {
    throw new Error('series_history envelope: "bar_policy" must be a string');
  }

  return {
    session: { principal_id: session.principal_id as string | null, server_now_ms: session.server_now_ms },
    panel: {
      series_key_id: panel.series_key_id,
      source: panel.source,
      nature: panel.nature,
      unit: panel.unit,
    },
    rows: body.rows as readonly SeriesHistoryRow[],
    knowledge_time: body.knowledge_time,
    bar_policy: body.bar_policy,
  };
}

// ── THE HTTP TRANSPORT — same base URL/API_PREFIX pattern as the other two `web` HTTP clients ──
const DEFAULT_API_PREFIX = "/api/v1";

function resolveApiPrefix(): string {
  return process.env.API_PREFIX ?? DEFAULT_API_PREFIX;
}

export interface SeriesHistoryHttpOptions {
  /** Defaults to `process.env.INGEST_HEALTH_API_BASE_URL` — NEVER `NEXT_PUBLIC_*` (`ADR-019/D4`),
   * same variable `collector-status-query.ts`/`series-catalog-query.ts` already read: one
   * FastAPI process serves all of `/collector-status`, `/series-catalog`, `/series-history`. */
  readonly baseUrl?: string;
  /** Injectable so a test can pass a real `fetch` bound to a test server. */
  readonly fetchImpl?: typeof fetch;
}

function resolveSeriesHistoryBaseUrl(explicit: string | undefined): string {
  const baseUrl = explicit ?? process.env.INGEST_HEALTH_API_BASE_URL;
  if (baseUrl === undefined || baseUrl === "") {
    throw new TransportError(
      "missing_base_url",
      "fetchSeriesHistoryViaHttp: no base URL configured — pass options.baseUrl or set " +
        "INGEST_HEALTH_API_BASE_URL. Never NEXT_PUBLIC_-prefixed (ADR-019/D4): that family is " +
        "inlined into the browser bundle, and this module must stay server-only.",
    );
  }
  return baseUrl;
}

function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * The `web` HTTP consumer of `GET /series-history` for ONE `HistoryRequestKey`. Throws
 * `TransportError` with the same four kinds every other `web` transport in this codebase uses.
 *
 * `assertBucketSpacingWithinInterval` is checked against the row TIMESTAMPS as ISO instants
 * (converted from `event_time`, epoch-ms) — the same falsifier `history-transport.test.ts`
 * already exercises for the historical route's own gate, applied here to a REAL response.
 */
export async function fetchSeriesHistoryViaHttp(
  key: HistoryRequestKey,
  options: SeriesHistoryHttpOptions = {},
): Promise<SeriesHistoryEnvelope> {
  const baseUrl = resolveSeriesHistoryBaseUrl(options.baseUrl);
  const doFetch = options.fetchImpl ?? fetch;
  const url = historyRequestUrl(new URL(`${resolveApiPrefix()}/series-history`, baseUrl), key);

  let response: Response;
  try {
    response = await doFetch(url, { cache: "no-store" });
  } catch (cause) {
    throw new TransportError(
      "connection_refused",
      `fetchSeriesHistoryViaHttp: GET ${url.toString()} never reached a server (${describeCause(cause)})`,
    );
  }

  if (!response.ok) {
    throw new TransportError(
      "non_2xx",
      `fetchSeriesHistoryViaHttp: GET ${url.toString()} answered ${response.status} ${response.statusText}`,
      response.status,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    throw new TransportError(
      "malformed_envelope",
      `fetchSeriesHistoryViaHttp: GET ${url.toString()} body is not valid JSON (${describeCause(cause)})`,
    );
  }

  try {
    assertNoTickLevelFields(body);
    const envelope = parseSeriesHistoryEnvelope(body);
    assertBucketSpacingWithinInterval(
      envelope.rows.map((row) => new Date(row.event_time).toISOString()),
      60_000,
    );
    return envelope;
  } catch (cause) {
    throw new TransportError(
      "malformed_envelope",
      `fetchSeriesHistoryViaHttp: envelope failed validation (${describeCause(cause)})`,
    );
  }
}
