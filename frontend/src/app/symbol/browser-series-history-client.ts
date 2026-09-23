/**
 * `T-05.2` — the CLIENT-SIDE half of `D-C3.5`'s history paginator
 * (`docs/context/candle-real-e-eixo-unico/handoff/JULGAMENTO-FRONTEND-ARCHITECT.md:281-308`):
 * "quem pagina é `web`, serial, uma requisição em voo por grade". Every history fetch before
 * this task ran on the server (`page.tsx`, `T-02.4`) — the SAME `HistoryRequestKey` this module
 * builds, but resolved against `INGEST_HEALTH_API_BASE_URL`, which `series-history-client.ts`'s
 * own docstring says a browser can never read (`ADR-019/D4`). This module instead calls
 * `../api/series-history/route.ts` (`T-05.2`'s own new Route Handler) — a RELATIVE path, so no
 * base URL or origin resolution is needed in the browser — and that handler is the pass-through
 * that still reads `INGEST_HEALTH_API_BASE_URL`, server-side, via the SAME
 * `fetchSeriesHistoryViaHttp` `page.tsx` calls.
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
 * against the proxy's response instead of the backend's own. One implementation of "no tick
 * chages the browser", two callers.
 */

import {
  assertBucketSpacingWithinInterval,
  assertNoTickLevelFields,
  encodeHistoryRequest,
  type HistoryRequestKey,
} from "../history-transport.ts";
import { parseSeriesHistoryEnvelope, type SeriesHistoryEnvelope } from "./series-history-envelope.ts";

/** The proxy this module always targets — a path relative to the app's own origin, never an
 * absolute URL: the browser resolves it against `document.baseURI` on its own, so this module
 * reads no environment variable at all (unlike `series-history-client.ts`, which reads
 * `INGEST_HEALTH_API_BASE_URL` — a variable this file must never touch, `ADR-019/D4`). */
export const SERIES_HISTORY_PROXY_PATH = "/api/series-history";

/**
 * The one error class this module throws. Deliberately NOT `TransportError`
 * (`features/s1-console/ingest-health-query.ts`): that class lives behind an `import
 * "server-only"` (`ADR-019/D4`'s own guard), so importing it here — even just the type — would
 * make this file, and therefore `SymbolClient.tsx`, fail the client build. `kind` mirrors the
 * SAME three failure shapes `TransportError` already names for the two other transports
 * (`connection_refused`/`non_2xx`/`malformed_envelope`) — never `missing_base_url`, which cannot
 * happen from the browser's side of a relative-path fetch — so the paginator's error handling
 * reads the same way every other `web` transport's does, without importing a server-only type.
 */
export type HistoryPageFetchErrorKind = "connection_refused" | "non_2xx" | "malformed_envelope";

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

/** The URL this module fetches for `key` — relative, `SERIES_HISTORY_PROXY_PATH` plus the SAME
 * canonical query parameters `historyRequestUrl` writes against the real backend
 * (`encodeHistoryRequest`, `history-transport.ts`, shared and unchanged). */
export function browserHistoryRequestPath(key: HistoryRequestKey): string {
  return `${SERIES_HISTORY_PROXY_PATH}?${encodeHistoryRequest(key).toString()}`;
}

export interface BrowserSeriesHistoryOptions {
  /** Injectable so a test can pass a fake `fetch` bound to a mocked proxy response — the same
   * pattern `fetchSeriesHistoryViaHttp`'s `SeriesHistoryHttpOptions.fetchImpl` already uses. */
  readonly fetchImpl?: typeof fetch;
}

/**
 * The `web` client-side consumer of `T-05.2`'s Route Handler, for ONE `HistoryRequestKey`. This
 * is what `SymbolClient.tsx`'s paginator calls for each of the (up to ten) series a widened page
 * needs — never the server-only `fetchSeriesHistoryViaHttp`, and never a second copy of its
 * validation logic: the two ADR-005 gates and the envelope parser below are the SAME functions
 * that transport already runs, imported, not rewritten.
 */
export async function fetchSeriesHistoryFromBrowser(
  key: HistoryRequestKey,
  options: BrowserSeriesHistoryOptions = {},
): Promise<SeriesHistoryEnvelope> {
  const doFetch = options.fetchImpl ?? fetch;
  const path = browserHistoryRequestPath(key);

  let response: Response;
  try {
    response = await doFetch(path, { cache: "no-store" });
  } catch (cause) {
    throw new HistoryPageFetchError(
      "connection_refused",
      `fetchSeriesHistoryFromBrowser: GET ${path} never reached the proxy (${describeCause(cause)})`,
    );
  }

  if (!response.ok) {
    throw new HistoryPageFetchError(
      "non_2xx",
      `fetchSeriesHistoryFromBrowser: GET ${path} answered ${response.status} ${response.statusText}`,
      response.status,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    throw new HistoryPageFetchError(
      "malformed_envelope",
      `fetchSeriesHistoryFromBrowser: GET ${path} body is not valid JSON (${describeCause(cause)})`,
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
