// `T-05.2-FIX-adr005` — `browser-series-history-client.ts`'s own transport tests, same shape
// `series-history-client.test.ts` uses: `HistoryPageFetchErrorKind` is exercised with a mocked
// `fetchImpl` (synthetic `Response`/`Error`), never a real socket. `baseUrl` is now an ALREADY
// RESOLVED absolute URL (the shape `page.tsx`'s `seriesHistoryEndpointUrl` produces), never a
// relative path — the whole point of this correction (`ADR-005/D5`: no Next proxy in between).

import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchSeriesHistoryFromBrowser, HistoryPageFetchError } from "./browser-series-history-client.ts";
import type { HistoryRequestKey } from "../history-transport.ts";

const KEY: HistoryRequestKey = {
  series_key_id: "abc123",
  symbol: "BTCUSDT",
  interval: "1m",
  window_start_ms: 0,
  window_end_ms: 60_000,
  knowledge_time_ms: 120_000,
  bar_policy: "final_only",
};

const BASE_URL = "http://localhost:8765/api/v1/series-history";

function validEnvelopeBody(): unknown {
  return {
    session: { principal_id: null, server_now_ms: 1_000 },
    panel: { series_key_id: "abc123", source: "binance", nature: "STOCK", unit: "USD" },
    rows: [{ event_time: 0, available_at: 500, value: "42.5", absence: null, coverage: null }],
    knowledge_time: 120_000,
    bar_policy: "final_only",
  };
}

function fakeFetch(response: Response, captured?: { url?: string }): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    if (captured !== undefined) {
      captured.url = input.toString();
    }
    return response;
  }) as unknown as typeof fetch;
}

test("CALA: a well-formed FastAPI response, fetched DIRECTLY off the resolved base URL, resolves to the parsed envelope", async () => {
  const response = new Response(JSON.stringify(validEnvelopeBody()), { status: 200 });
  const captured: { url?: string } = {};
  const envelope = await fetchSeriesHistoryFromBrowser(KEY, BASE_URL, { fetchImpl: fakeFetch(response, captured) });
  assert.equal(envelope.rows.length, 1);
  assert.equal(envelope.rows[0]?.value, "42.5");
  // The falsificador desta correção: a URL fetched tem de ser ABSOLUTA, contra o MESMO base URL
  // recebido — nunca um caminho relativo tipo `/api/series-history` (o que T-05.2 fazia antes).
  assert.equal(captured.url?.startsWith(BASE_URL), true);
  assert.match(captured.url ?? "", /series_key_id=abc123/);
  assert.match(captured.url ?? "", /bar_policy=final_only/);
});

test("MORDE: baseUrl=null (INGEST_HEALTH_API_BASE_URL unset server-side) throws HistoryPageFetchError kind=missing_base_url, no fetch attempted", async () => {
  let fetchCalled = false;
  const neverFetch = (async () => {
    fetchCalled = true;
    throw new Error("fetch nunca deveria ter sido chamado");
  }) as unknown as typeof fetch;
  await assert.rejects(
    () => fetchSeriesHistoryFromBrowser(KEY, null, { fetchImpl: neverFetch }),
    (error: unknown) => {
      assert.ok(error instanceof HistoryPageFetchError);
      assert.equal(error.kind, "missing_base_url");
      return true;
    },
  );
  assert.equal(fetchCalled, false);
});

test("MORDE: a non-2xx response throws HistoryPageFetchError kind=non_2xx with the real status", async () => {
  const response = new Response(JSON.stringify({ error: "boom" }), { status: 422 });
  await assert.rejects(
    () => fetchSeriesHistoryFromBrowser(KEY, BASE_URL, { fetchImpl: fakeFetch(response) }),
    (error: unknown) => {
      assert.ok(error instanceof HistoryPageFetchError);
      assert.equal(error.kind, "non_2xx");
      assert.equal(error.status, 422);
      return true;
    },
  );
});

test("MORDE: a network failure throws HistoryPageFetchError kind=connection_refused", async () => {
  const failingFetch = (async () => {
    throw new Error("ECONNREFUSED");
  }) as unknown as typeof fetch;
  await assert.rejects(
    () => fetchSeriesHistoryFromBrowser(KEY, BASE_URL, { fetchImpl: failingFetch }),
    (error: unknown) => {
      assert.ok(error instanceof HistoryPageFetchError);
      assert.equal(error.kind, "connection_refused");
      return true;
    },
  );
});

test("MORDE: a tick-level field anywhere in the payload is refused — ADR-005's falsifier, exercised for real", async () => {
  const tainted = { ...(validEnvelopeBody() as Record<string, unknown>), agg_id: "1" };
  const response = new Response(JSON.stringify(tainted), { status: 200 });
  await assert.rejects(
    () => fetchSeriesHistoryFromBrowser(KEY, BASE_URL, { fetchImpl: fakeFetch(response) }),
    (error: unknown) => {
      assert.ok(error instanceof HistoryPageFetchError);
      assert.equal(error.kind, "malformed_envelope");
      assert.match(error.message, /agg_id/);
      return true;
    },
  );
});

test("MORDE: malformed JSON body throws HistoryPageFetchError kind=malformed_envelope", async () => {
  const response = new Response("not json", { status: 200 });
  await assert.rejects(
    () => fetchSeriesHistoryFromBrowser(KEY, BASE_URL, { fetchImpl: fakeFetch(response) }),
    (error: unknown) => {
      assert.ok(error instanceof HistoryPageFetchError);
      assert.equal(error.kind, "malformed_envelope");
      return true;
    },
  );
});
