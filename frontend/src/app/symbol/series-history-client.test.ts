// `T-02.4` — `series-history-client.ts`'s own transport tests, same shape as
// `collector-status-query.test.ts`/`series-catalog-query.test.ts`: `TransportErrorKind` is
// exercised with a mocked `fetchImpl` (synthetic `Response`/`Error`), never a real socket.
//
// Run with: npm --prefix frontend run test:app (`--conditions=react-server`, this module
// imports `server-only`).

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  fetchSeriesHistoryViaHttp,
  parseSeriesHistoryEnvelope,
  TransportError,
} from "./series-history-client.ts";
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

function validEnvelopeBody(): unknown {
  return {
    session: { principal_id: null, server_now_ms: 1_000 },
    panel: { series_key_id: "abc123", source: "binance", nature: "STOCK", unit: "USD" },
    rows: [
      { event_time: 0, available_at: 500, value: "42.5", absence: null },
      { event_time: 60_000, available_at: null, value: null, absence: "SEM_PONTO" },
    ],
    knowledge_time: 120_000,
    bar_policy: "final_only",
  };
}

test("CALA: parseSeriesHistoryEnvelope aceita um envelope bem formado, presente e ausente juntos", () => {
  const envelope = parseSeriesHistoryEnvelope(validEnvelopeBody());
  assert.equal(envelope.rows.length, 2);
  assert.equal(envelope.rows[0]?.value, "42.5");
  assert.equal(envelope.rows[0]?.absence, null);
  assert.equal(envelope.rows[1]?.value, null);
  assert.equal(envelope.rows[1]?.absence, "SEM_PONTO");
});

test("MORDE: corpo que nao e um objeto plano reprova", () => {
  assert.throws(() => parseSeriesHistoryEnvelope(null));
  assert.throws(() => parseSeriesHistoryEnvelope([1, 2, 3]));
});

test('MORDE CA-F1-5: rows[i] com value E absence nao-nulos (ou ambos nulos) reprova', () => {
  const bothNonNull = { ...validEnvelopeBody() as Record<string, unknown> };
  (bothNonNull.rows as unknown[])[0] = { event_time: 0, available_at: 500, value: "1", absence: "SEM_PONTO" };
  assert.throws(() => parseSeriesHistoryEnvelope(bothNonNull), /CA-F1-5/);

  const bothNull = { ...validEnvelopeBody() as Record<string, unknown> };
  (bothNull.rows as unknown[])[0] = { event_time: 0, available_at: null, value: null, absence: null };
  assert.throws(() => parseSeriesHistoryEnvelope(bothNull), /CA-F1-5/);
});

test("MORDE TransportErrorKind=missing_base_url: sem baseUrl e sem env, rejeita com o kind certo", async () => {
  const previousBaseUrl = process.env.INGEST_HEALTH_API_BASE_URL;
  delete process.env.INGEST_HEALTH_API_BASE_URL;
  try {
    await assert.rejects(
      () => fetchSeriesHistoryViaHttp(KEY, {}),
      (error: unknown) => {
        assert.ok(error instanceof TransportError, "erro nao e TransportError");
        assert.equal(error.kind, "missing_base_url");
        return true;
      },
    );
  } finally {
    if (previousBaseUrl !== undefined) {
      process.env.INGEST_HEALTH_API_BASE_URL = previousBaseUrl;
    }
  }
});

test("MORDE TransportErrorKind=connection_refused: fetchImpl rejeita ⇒ kind certo", async () => {
  const fetchImpl: typeof fetch = async () => {
    throw new Error("ECONNREFUSED (mock)");
  };
  await assert.rejects(
    () => fetchSeriesHistoryViaHttp(KEY, { baseUrl: "http://127.0.0.1:1", fetchImpl }),
    (error: unknown) => {
      assert.ok(error instanceof TransportError, "erro nao e TransportError");
      assert.equal(error.kind, "connection_refused");
      return true;
    },
  );
});

test("MORDE TransportErrorKind=non_2xx: resposta 500 ⇒ kind certo, com status preservado", async () => {
  const fetchImpl: typeof fetch = async () => new Response("erro interno", { status: 500 });
  await assert.rejects(
    () => fetchSeriesHistoryViaHttp(KEY, { baseUrl: "http://127.0.0.1:1", fetchImpl }),
    (error: unknown) => {
      assert.ok(error instanceof TransportError, "erro nao e TransportError");
      assert.equal(error.kind, "non_2xx");
      assert.equal(error.status, 500);
      return true;
    },
  );
});

test("MORDE TransportErrorKind=malformed_envelope: corpo com um campo de nivel de tick reprova (ADR-005)", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        ...(validEnvelopeBody() as Record<string, unknown>),
        rows: [{ event_time: 0, available_at: 0, value: "1", absence: null, agg_id: 7 }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  await assert.rejects(
    () => fetchSeriesHistoryViaHttp(KEY, { baseUrl: "http://127.0.0.1:1", fetchImpl }),
    (error: unknown) => {
      assert.ok(error instanceof TransportError, "erro nao e TransportError");
      assert.equal(error.kind, "malformed_envelope");
      return true;
    },
  );
});

test("CALA: envelope bem formado via fetchImpl mockado", async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(input as string | URL);
    assert.equal(url.pathname, "/api/v1/series-history");
    assert.equal(url.searchParams.get("series_key_id"), "abc123");
    return new Response(JSON.stringify(validEnvelopeBody()), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const envelope = await fetchSeriesHistoryViaHttp(KEY, { baseUrl: "http://127.0.0.1:1", fetchImpl });
  assert.equal(envelope.rows.length, 2);
  assert.equal(envelope.panel.series_key_id, "abc123");
});
