/**
 * `T-05.2-FIX-adr005` — the CLIENT-SIDE half of `D-C3.5`'s history paginator
 * (`docs/context/candle-real-e-eixo-unico/handoff/JULGAMENTO-FRONTEND-ARCHITECT.md:281-308`):
 * "quem pagina é `web`, serial, uma requisição em voo por grade".
 *
 * `T-05.2`'s FIRST version of this module called a Next Route Handler
 * (`../api/series-history/route.ts`) as a pass-through proxy — and the `frontend-architect`'s
 * post-QA review found that this violates `ADR-005/D5` ("Next não é segunda verdade"): a
 * pass-through is still a SECOND HTTP surface with the same response contract as the FastAPI
 * route, which is exactly the "BFF em Next Route Handler" `ADR-005`'s own rejected-alternatives
 * table names, cost declared *"reabre a porta de segunda verdade que o M3 está fechando"*.
 *
 * This correction deletes that Route Handler entirely and follows the precedent already in this
 * repo for the SAME problem, on the live edge (`ADR-019/D4`,
 * `frontend/src/app/symbol/[symbol]/page.tsx`'s `buildLiveUrl`): the Server Component
 * (`page.tsx`) reads `INGEST_HEALTH_API_BASE_URL` ONCE, server-side, and resolves it into an
 * absolute `GET /series-history` endpoint URL (`series-history-client.ts`'s own
 * `seriesHistoryEndpointUrl`) — handed down as a plain string prop
 * (`SymbolClientProps.historyBaseUrl`, `use-history-pager.ts`'s own `HistoryPagingSeed`), never
 * an environment variable this module reads itself. This module then combines that ALREADY
 * RESOLVED base URL with a `HistoryRequestKey` via `historyRequestUrl` (`../history-transport.ts`
 * — no `server-only` import, safe in a client bundle) and calls `fetch` DIRECTLY against
 * FastAPI: a real cross-origin connection from the browser, the same shape `EventSource` already
 * opens for the live edge today, never a relative path through Next.
 *
 * No `"server-only"` import anywhere in this file, on purpose — this is the module a "use
 * client" component (`SymbolClient.tsx`) is allowed to import, and a build would fail loudly if
 * a transitive `"server-only"` import ever crept back in.
 *
 * `parseSeriesHistoryEnvelope` and the two `ADR-005` falsifier gates
 * (`assertNoTickLevelFields`/`assertBucketSpacingWithinInterval`) are IMPORTED, not
 * reimplemented — `series-history-envelope.ts` (`T-05.2`, split out of `series-history-client.ts`
 * for exactly this reuse) and `history-transport.ts` already carry them, and this module runs
 * the SAME two gates on the SAME kind of payload `fetchSeriesHistoryViaHttp` already checks,
 * against FastAPI's own response directly instead of a proxy's copy of it. One implementation of
 * "no tick reaches the browser", two callers.
 */

import { assertBucketSpacingWithinInterval, assertNoTickLevelFields, historyRequestUrl, type HistoryRequestKey } from "../history-transport.ts";
import { parseSeriesHistoryEnvelope, type SeriesHistoryEnvelope } from "./series-history-envelope.ts";

/**
 * The one error class this module throws. Deliberately NOT `TransportError`
 * (`features/s1-console/ingest-health-query.ts`): that class lives behind an `import
 * "server-only"` (`ADR-019/D4`'s own guard), so importing it here — even just the type — would
 * make this file, and therefore `SymbolClient.tsx`, fail the client build. `kind` mirrors the
 * SAME four failure shapes `TransportError` already names for the two other transports
 * (`missing_base_url`/`connection_refused`/`non_2xx`/`malformed_envelope`) — `missing_base_url`
 * is no longer unreachable here (`T-05.2-FIX-adr005`): `page.tsx` degrades `historyBaseUrl` to
 * `null` exactly like it already does for `liveUrls` when `INGEST_HEALTH_API_BASE_URL` is unset,
 * and this module has to name that failure the same way every other `web` transport does.
 */
export type HistoryPageFetchErrorKind = "missing_base_url" | "connection_refused" | "non_2xx" | "malformed_envelope";

export class HistoryPageFetchError extends Error {
  readonly kind: HistoryPageFetchErrorKind;
  readonly status?: number;

  constructor(kind: HistoryPageFetchErrorKind, message: string, status?: number) {
    super(message);
    this.name = "HistoryPageFetchError";
    this.kind = kind;
    if (status !== undefined) {
      this.status = status;
    }
  }
}

function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export interface BrowserSeriesHistoryOptions {
  /** Injectable so a test can pass a fake `fetch` bound to a mocked FastAPI response — the same
   * pattern `fetchSeriesHistoryViaHttp`'s `SeriesHistoryHttpOptions.fetchImpl` already uses. */
  readonly fetchImpl?: typeof fetch;
}

/**
 * The `web` client-side consumer of `GET /series-history`, for ONE `HistoryRequestKey`, called
 * DIRECTLY against FastAPI — never through Next. This is what `SymbolClient.tsx`'s paginator
 * calls for each of the (up to ten) series a widened page needs.
 *
 * `baseUrl` is the ALREADY RESOLVED absolute endpoint URL `page.tsx` computed once, server-side,
 * via `seriesHistoryEndpointUrl` (`series-history-client.ts`) — `null` when
 * `INGEST_HEALTH_API_BASE_URL` was unset at render time, which this function refuses immediately
 * rather than attempting a request against `undefined`.
 */
export async function fetchSeriesHistoryFromBrowser(
  key: HistoryRequestKey,
  baseUrl: string | null,
  options: BrowserSeriesHistoryOptions = {},
): Promise<SeriesHistoryEnvelope> {
  if (baseUrl === null) {
    throw new HistoryPageFetchError(
      "missing_base_url",
      "fetchSeriesHistoryFromBrowser: no series-history base URL was resolved server-side " +
        "(INGEST_HEALTH_API_BASE_URL unset at render time) — never attempted against a relative " +
        "path or an inferred origin.",
    );
  }

  const doFetch = options.fetchImpl ?? fetch;
  const url = historyRequestUrl(baseUrl, key);

  let response: Response;
  try {
    response = await doFetch(url, { cache: "no-store" });
  } catch (cause) {
    throw new HistoryPageFetchError(
      "connection_refused",
      `fetchSeriesHistoryFromBrowser: GET ${url.toString()} never reached a server (${describeCause(cause)})`,
    );
  }

  if (!response.ok) {
    throw new HistoryPageFetchError(
      "non_2xx",
      `fetchSeriesHistoryFromBrowser: GET ${url.toString()} answered ${response.status} ${response.statusText}`,
      response.status,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    throw new HistoryPageFetchError(
      "malformed_envelope",
      `fetchSeriesHistoryFromBrowser: GET ${url.toString()} body is not valid JSON (${describeCause(cause)})`,
    );
  }

  try {
    assertNoTickLevelFields(body);
    const envelope = parseSeriesHistoryEnvelope(body);
    // `60_000` — the SAME literal `fetchSeriesHistoryViaHttp` checks against
    // (`series-history-client.ts`): the wire is always the 1-minute grid regardless of the
    // requested `interval` (`series_history.py`'s own `_GRID_STEP_MS`, cited there), so the
    // spacing floor is the grid's native step, never `key.interval`'s.
    assertBucketSpacingWithinInterval(
      envelope.rows.map((row) => new Date(row.event_time).toISOString()),
      60_000,
    );
    return envelope;
  } catch (cause) {
    throw new HistoryPageFetchError(
      "malformed_envelope",
      `fetchSeriesHistoryFromBrowser: envelope failed validation (${describeCause(cause)})`,
    );
  }
}
