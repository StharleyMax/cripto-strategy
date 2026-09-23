/**
 * `T-05.2` — the Route Handler `D-C3.5` needs to exist for the client-side history paginator to
 * have anywhere to call.
 *
 * `ADR-005/D5` ("Next não é segunda verdade") and `ADR-019/D4` (`INGEST_HEALTH_API_BASE_URL` is
 * NEVER `NEXT_PUBLIC_*`) together mean the browser cannot open a direct connection to the read
 * API — `series-history-client.ts`'s own docstring on `SeriesHistoryHttpOptions.baseUrl` says so
 * verbatim, and it is why every existing history fetch has been a Server Component's job so far
 * (`page.tsx`, `T-02.4`). `D-C3.5` now requires a SECOND history fetch, fired from the browser on
 * a pan gesture — and that fetch still cannot read `INGEST_HEALTH_API_BASE_URL` directly.
 *
 * This Route Handler is the ONLY new server surface `T-05.2` adds, and it is a PASS-THROUGH, not
 * a second implementation: it decodes the same `HistoryRequestKey` (`history-transport.ts`,
 * already shared by every history caller) off the query string and calls the SAME
 * `fetchSeriesHistoryViaHttp` (`series-history-client.ts`, `T-02.4`) `page.tsx` already calls —
 * one function, one base-URL read, one set of ADR-005 falsifier gates, reached from two entry
 * points (a Server Component render and this handler) instead of two. `ADR-005/D5`'s "porta de
 * leitura é o backend" holds: this route relays, it never re-derives.
 *
 * `dynamic = "force-dynamic"`: same reasoning `page.tsx`/`console/page.tsx` give — a history page
 * is per-request, never a candidate for Next's static/ISR cache (the backend's own envelope is
 * already the content-addressable cache, `ADR-005/D1`; caching the PROXY on top would be a
 * second, competing cache with its own invalidation rules this task does not want to own).
 */

import { NextResponse, type NextRequest } from "next/server";

import { decodeHistoryRequest } from "../../history-transport.ts";
import { fetchSeriesHistoryViaHttp, TransportError } from "../../symbol/series-history-client.ts";
import { statusForTransportErrorKind } from "./status-mapping.ts";

export const dynamic = "force-dynamic";

function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  let key;
  try {
    key = decodeHistoryRequest(request.nextUrl.searchParams);
  } catch (cause) {
    return NextResponse.json(
      { error: `series-history proxy: invalid request — ${describeCause(cause)}` },
      { status: 400 },
    );
  }

  try {
    const envelope = await fetchSeriesHistoryViaHttp(key);
    return NextResponse.json(envelope);
  } catch (cause) {
    if (cause instanceof TransportError) {
      return NextResponse.json(
        { error: cause.message, kind: cause.kind },
        { status: statusForTransportErrorKind(cause.kind, cause.status) },
      );
    }
    throw cause;
  }
}
