/**
 * `T-02.4` — the `web` HTTP consumer of `GET {API_PREFIX}/series-history` (`ADR-034/D1`/`D5`,
 * `SPEC-006 §5.2`). Same shape as `features/s1-console/collector-status-query.ts` and
 * `features/s3-inspector/series-catalog-query.ts`: builds the request through the transport
 * module (`../history-transport.ts`, `T-01.5`) rather than a hand-built query string, fetches
 * with `cache: "no-store"`, and turns every failure into the SAME `TransportError` class the
 * other two `web` transports already throw (`kind` values `missing_base_url` /
 * `connection_refused` / `non_2xx` / `malformed_envelope`) — reused, not reinvented, so
 * `page.tsx` has ONE error vocabulary to switch on across all five HTTP calls it makes
 * (catalog + 4× history — the 3 panels plus `T-01.7`'s `klines_volume` sub-axis, `SPEC-007
 * §3.6`; the request shape is identical for it, so this module needs no change of its own).
 *
 * `assertNoTickLevelFields`/`assertBucketSpacingWithinInterval` are IMPORTED from
 * `../history-transport.ts`, not reimplemented — same discipline `../live-transport.ts`
 * already follows for the live edge of the SAME `ADR-005` falsifier.
 *
 * `T-05.2` — THE ENVELOPE TYPE AND ITS PARSER MOVED TO `./series-history-envelope.ts`. This
 * file used to define `BucketCoverage`/`SeriesHistoryRow`/`SeriesHistoryEnvelope`/
 * `parseSeriesHistoryEnvelope` itself, and the `import "server-only"` below made every one of
 * those exports unreachable from a client bundle too — including the parser, which reads no
 * secret and makes no network call. `browser-series-history-client.ts` needs exactly that
 * parser for the client-side paging fetch `D-C3.5` requires, so the pure half moved out and this
 * file now re-exports it unchanged (`series-history-client.test.ts` is untouched by the split —
 * same names, same behaviour, same import path for every existing caller).
 */

import "server-only";

import {
  assertBucketSpacingWithinInterval,
  assertNoTickLevelFields,
  historyRequestUrl,
  type HistoryRequestKey,
} from "../history-transport.ts";
import { TransportError, type TransportErrorKind } from "../../features/s1-console/ingest-health-query.ts";
import { parseSeriesHistoryEnvelope } from "./series-history-envelope.ts";
import type {
  BucketCoverage,
  SeriesHistoryEnvelope,
  SeriesHistoryRow,
} from "./series-history-envelope.ts";

export { TransportError, parseSeriesHistoryEnvelope };
export type { TransportErrorKind, BucketCoverage, SeriesHistoryEnvelope, SeriesHistoryRow };

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
 * `T-05.2-FIX-adr005` — the ONE place that turns `INGEST_HEALTH_API_BASE_URL` into the absolute
 * `GET /series-history` endpoint URL, for a SERVER caller to resolve once and hand the browser
 * an already-resolved string (`page.tsx`'s own `buildLiveUrl` precedent for the live edge,
 * `ADR-019/D4`). Returns `null` — never throws — when the variable is unset: `page.tsx` already
 * treats a missing base URL as "degrade this feature to absent", the same posture it takes for
 * `liveUrls` (`baseUrl === undefined ? { price: null, oi: null, cvd: null } : …`), so this
 * mirrors that rather than forcing a try/catch at the one call site that only ever wants a
 * string or a `null`.
 *
 * The browser NEVER calls this function — it lives in this `import "server-only"` module on
 * purpose, same as `fetchSeriesHistoryViaHttp` itself. What the browser gets is the STRING this
 * returns, carried across the RSC boundary as a plain prop (`SymbolClientProps.historyBaseUrl`),
 * then combined client-side with a `HistoryRequestKey` via `historyRequestUrl`
 * (`../history-transport.ts`, which has no `server-only` import and is therefore safe in a
 * client bundle) — exactly the same division of labour `buildLiveUrl`/`liveStreamUrl` already
 * establish for the SSE edge.
 */
export function seriesHistoryEndpointUrl(explicitBaseUrl?: string): string | null {
  const baseUrl = explicitBaseUrl ?? process.env.INGEST_HEALTH_API_BASE_URL;
  if (baseUrl === undefined || baseUrl === "") {
    return null;
  }
  return new URL(`${resolveApiPrefix()}/series-history`, baseUrl).toString();
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
