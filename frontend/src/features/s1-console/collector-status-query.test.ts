// Testes de `T-03.7` — o par MORDE/CALA de `parseCollectorStatusEnvelope` e dos
// `TransportErrorKind` de `fetchCollectorStatusProjectionViaHttp`.
//
// Run with: npm --prefix frontend run test:s1 (ou node --conditions=react-server --test
// 'src/features/s1-console/*.test.ts')
//
// Estilo espelhado em `ingest-health-query.test.ts`: nenhum servidor real aqui — o par
// MORDE/CALA do parser roda sobre um objeto plano transcrito à mão de `ADR-030` D5 (não
// derivado do código de produção, para que o teste tenha algo com que discordar), e os quatro
// `TransportErrorKind` são exercitados com `fetchImpl` mockado (`Response`/`Error` sintéticos),
// nunca um `uvicorn` de verdade — essa cobertura de rota real já existe em
// `backend/tests/api/test_collector_status_route.py` (`T-03.6`).

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  COLLECTOR_STATUS_QUERY_NAME,
  collectorRowsFromCollectorStatusProjection,
  fetchCollectorStatusProjectionViaHttp,
  parseCollectorStatusEnvelope,
  TransportError,
  type CollectorStatusRow,
} from "./collector-status-query.ts";

/** `ADR-030` D5's row shape, one entry per field it fixes — the universe the "1 field removed
 * at a time" falsifier below sweeps over. Hand-transcribed, not read off `ROW_FIELD_KINDS`
 * (`collector-status-query.ts`), same discipline `INGEST_HEALTH_RUN_COLUMNS` already carries in
 * the sibling module: an independent witness has to disagree with a column reorder/drop, not
 * echo the very map it is supposed to check. */
const ADR_030_ROW_FIELDS: readonly string[] = [
  "series",
  "source",
  "endpoint",
  "status",
  "uptimePercent",
  "statusDetail",
  "retention",
  "resilience",
  "n_runs_total",
  "n_runs_in_window",
  "last_run_id",
  "last_verdict",
  "last_ended_at",
  "age_s",
  "liveness",
];

function validRow(): Record<string, unknown> {
  return {
    series: "binance-futures · /fapi/v1/openInterestHist",
    source: "binance-futures",
    endpoint: "/fapi/v1/openInterestHist",
    status: "ATIVO",
    uptimePercent: 95.83,
    statusDetail: null,
    retention: { kind: "unmeasured" },
    resilience: { kind: "not_scored" },
    n_runs_total: 31,
    n_runs_in_window: 24,
    last_run_id: "run-1",
    last_verdict: "ACCEPTED",
    last_ended_at: "2026-09-05T17:20:00.000Z",
    age_s: 2400,
    liveness: { kind: "judged", period_s: 3600, stale_after_s: 10800 },
  };
}

function validEnvelopeBody(): Record<string, unknown> {
  return {
    query: COLLECTOR_STATUS_QUERY_NAME,
    as_of: "2026-09-05T18:00:00.000Z",
    window_hours: 24,
    n_rows: 1,
    rows: [validRow()],
  };
}

test("universo declarado: ADR_030_ROW_FIELDS tem exatamente 15 campos, o mesmo n que ADR-030 D5 fixa", () => {
  assert.equal(ADR_030_ROW_FIELDS.length, 15);
  assert.deepEqual(new Set(ADR_030_ROW_FIELDS).size, 15, "sem campo duplicado na lista");
});

test("CALA: parseCollectorStatusEnvelope aceita um envelope bem formado", () => {
  const projection = parseCollectorStatusEnvelope(validEnvelopeBody());
  assert.equal(projection.as_of, "2026-09-05T18:00:00.000Z");
  assert.equal(projection.window_hours, 24);
  assert.equal(projection.rows.length, 1);
  assert.equal(projection.rows[0]!.series, "binance-futures · /fapi/v1/openInterestHist");
});

test("MORDE: corpo que nao e um objeto plano reprova (null, array, primitivo)", () => {
  for (const bad of [null, undefined, "uma string", 42, ["array", "nao", "objeto"]]) {
    assert.throws(() => parseCollectorStatusEnvelope(bad), /response body is not a plain JSON object/);
  }
});

test('MORDE: "query" com nome diferente do esperado reprova', () => {
  const body = validEnvelopeBody();
  body.query = "ingest_health_query";
  assert.throws(() => parseCollectorStatusEnvelope(body), /"query" is/);
});

test('MORDE: "as_of" ausente ou nao-string reprova', () => {
  const missing = validEnvelopeBody();
  delete missing.as_of;
  assert.throws(() => parseCollectorStatusEnvelope(missing), /"as_of" is missing or not a string/);

  const wrongType = validEnvelopeBody();
  wrongType.as_of = 123;
  assert.throws(() => parseCollectorStatusEnvelope(wrongType), /"as_of" is missing or not a string/);
});

test('MORDE: "window_hours" ausente ou nao-numero reprova', () => {
  const missing = validEnvelopeBody();
  delete missing.window_hours;
  assert.throws(() => parseCollectorStatusEnvelope(missing), /"window_hours" is missing or not a number/);

  const wrongType = validEnvelopeBody();
  wrongType.window_hours = "24";
  assert.throws(() => parseCollectorStatusEnvelope(wrongType), /"window_hours" is missing or not a number/);
});

test('MORDE: "rows" ausente ou nao-array reprova', () => {
  const missing = validEnvelopeBody();
  delete missing.rows;
  assert.throws(() => parseCollectorStatusEnvelope(missing), /"rows" is missing or not an array/);

  const wrongType = validEnvelopeBody();
  wrongType.rows = "nao-e-um-array";
  assert.throws(() => parseCollectorStatusEnvelope(wrongType), /"rows" is missing or not an array/);
});

test("MORDE: n_rows != rows.length reprova — exatamente a cara de uma resposta truncada", () => {
  const body = validEnvelopeBody();
  body.n_rows = 2;
  assert.throws(() => parseCollectorStatusEnvelope(body), /"n_rows".*disagrees with rows\.length/);
});

// ── O falsificador do DoD: 1 campo removido por vez, universo = 15 (ADR-030 D5) ──────────────

for (const field of ADR_030_ROW_FIELDS) {
  test(`MORDE: rows[0] sem a coluna "${field}" reprova, identificando a coluna`, () => {
    const body = validEnvelopeBody();
    const row = (body.rows as Array<Record<string, unknown>>)[0]!;
    delete row[field];
    assert.throws(
      () => parseCollectorStatusEnvelope(body),
      new RegExp(`rows\\[0\\] is missing column "${field}"`),
    );
  });
}

// ── Tipo/forma errada — um caso por família de validação, não só "ausente" ────────────────────

test('MORDE: "status" fora do conjunto fechado reprova', () => {
  const body = validEnvelopeBody();
  (body.rows as Array<Record<string, unknown>>)[0]!.status = "DESCONHECIDO";
  assert.throws(() => parseCollectorStatusEnvelope(body), /column "status" failed validation/);
});

test('MORDE: "retention.kind" fora das 2 variantes do fio reprova', () => {
  const body = validEnvelopeBody();
  (body.rows as Array<Record<string, unknown>>)[0]!.retention = { kind: "computed_uniform" };
  assert.throws(() => parseCollectorStatusEnvelope(body), /column "retention" failed validation/);
});

test('MORDE: "resilience.kind" fora das 2 variantes do fio reprova', () => {
  const body = validEnvelopeBody();
  (body.rows as Array<Record<string, unknown>>)[0]!.resilience = { kind: "slo_multiplier" };
  assert.throws(() => parseCollectorStatusEnvelope(body), /column "resilience" failed validation/);
});

test('MORDE: "liveness" kind="judged" sem "period_s" numerico reprova', () => {
  const body = validEnvelopeBody();
  (body.rows as Array<Record<string, unknown>>)[0]!.liveness = { kind: "judged", stale_after_s: 10800 };
  assert.throws(() => parseCollectorStatusEnvelope(body), /column "liveness" failed validation/);
});

test('MORDE: "liveness" kind="not_judged" sem "n_runs" numerico reprova', () => {
  const body = validEnvelopeBody();
  (body.rows as Array<Record<string, unknown>>)[0]!.liveness = { kind: "not_judged", n_runs: "tres" };
  assert.throws(() => parseCollectorStatusEnvelope(body), /column "liveness" failed validation/);
});

test('CALA: "liveness" kind="not_judged" bem formado passa (a serie com poucos runs)', () => {
  const body = validEnvelopeBody();
  (body.rows as Array<Record<string, unknown>>)[0]!.liveness = { kind: "not_judged", n_runs: 2 };
  const projection = parseCollectorStatusEnvelope(body);
  assert.deepEqual(projection.rows[0]!.liveness, { kind: "not_judged", n_runs: 2 });
});

test('CALA: "retention"/"resilience" na variante PARADO (not_applicable/unavailable) passam', () => {
  const body = validEnvelopeBody();
  const row = (body.rows as Array<Record<string, unknown>>)[0]!;
  row.status = "PARADO";
  row.retention = { kind: "not_applicable" };
  row.resilience = { kind: "unavailable" };
  const projection = parseCollectorStatusEnvelope(body);
  assert.equal(projection.rows[0]!.status, "PARADO");
});

// ── Mapeamento para `CollectorRow` — os 6 campos verbatim, nenhum insumo vaza ─────────────────

test("collectorRowsFromCollectorStatusProjection: 1 CollectorRow com EXATAMENTE os 6 campos verbatim, nenhum insumo", () => {
  const projection = parseCollectorStatusEnvelope(validEnvelopeBody());
  const rows = collectorRowsFromCollectorStatusProjection(projection);
  assert.equal(rows.length, 1);
  const row = rows[0]!;
  assert.deepEqual(Object.keys(row).sort(), [
    "resilience",
    "retention",
    "series",
    "status",
    "statusDetail",
    "uptimePercent",
  ]);
  assert.equal(row.series, "binance-futures · /fapi/v1/openInterestHist");
  assert.equal(row.status, "ATIVO");
  assert.equal(row.uptimePercent, 95.83);
  assert.equal(row.statusDetail, null);
  assert.deepEqual(row.retention, { kind: "unmeasured" });
  assert.deepEqual(row.resilience, { kind: "not_scored" });
});

test("collectorRowsFromCollectorStatusProjection: prova que e o AGREGADO, nao o ultimo run — nenhuma chave de insumo (n_runs_total etc.) sobrevive", () => {
  const projection = parseCollectorStatusEnvelope(validEnvelopeBody());
  const [row] = collectorRowsFromCollectorStatusProjection(projection);
  const asRecord = row as unknown as Record<string, unknown>;
  for (const insumoField of [
    "n_runs_total",
    "n_runs_in_window",
    "last_run_id",
    "last_verdict",
    "last_ended_at",
    "age_s",
    "liveness",
  ] satisfies ReadonlyArray<keyof CollectorStatusRow>) {
    assert.equal(insumoField in asRecord, false, `"${insumoField}" nao deveria vazar para CollectorRow`);
  }
});

// ── `TransportErrorKind` — mesmos 4 kinds de `ingest-health-query.ts`, fetchImpl mockado ──────

test("MORDE TransportErrorKind=missing_base_url: sem baseUrl e sem env, rejeita com o kind certo", async () => {
  const previousBaseUrl = process.env.INGEST_HEALTH_API_BASE_URL;
  delete process.env.INGEST_HEALTH_API_BASE_URL;
  try {
    await assert.rejects(
      () => fetchCollectorStatusProjectionViaHttp({}),
      (error: unknown) => {
        assert.ok(error instanceof TransportError, "erro nao e TransportError");
        assert.equal(error.kind, "missing_base_url");
        assert.equal(error.status, undefined);
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
    () => fetchCollectorStatusProjectionViaHttp({ baseUrl: "http://127.0.0.1:1", fetchImpl }),
    (error: unknown) => {
      assert.ok(error instanceof TransportError, "erro nao e TransportError");
      assert.equal(error.kind, "connection_refused");
      return true;
    },
  );
});

test("MORDE TransportErrorKind=non_2xx: resposta 500 ⇒ kind certo, com status preservado", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response("erro interno", { status: 500, statusText: "Internal Server Error" });
  await assert.rejects(
    () => fetchCollectorStatusProjectionViaHttp({ baseUrl: "http://127.0.0.1:1", fetchImpl }),
    (error: unknown) => {
      assert.ok(error instanceof TransportError, "erro nao e TransportError");
      assert.equal(error.kind, "non_2xx");
      assert.equal(error.status, 500);
      return true;
    },
  );
});

test("MORDE TransportErrorKind=malformed_envelope (corpo nao-JSON): kind certo", async () => {
  const fetchImpl: typeof fetch = async () => new Response("isto nao e json", { status: 200 });
  await assert.rejects(
    () => fetchCollectorStatusProjectionViaHttp({ baseUrl: "http://127.0.0.1:1", fetchImpl }),
    (error: unknown) => {
      assert.ok(error instanceof TransportError, "erro nao e TransportError");
      assert.equal(error.kind, "malformed_envelope");
      return true;
    },
  );
});

test("MORDE TransportErrorKind=malformed_envelope (JSON valido, schema invalido — envelope de /ingest-health)", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ query: "ingest_health_query", n_runs: 0, n_gaps: 0, runs: [], gaps: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  await assert.rejects(
    () => fetchCollectorStatusProjectionViaHttp({ baseUrl: "http://127.0.0.1:1", fetchImpl }),
    (error: unknown) => {
      assert.ok(error instanceof TransportError, "erro nao e TransportError");
      assert.equal(error.kind, "malformed_envelope");
      return true;
    },
  );
});

test("CALA: envelope bem formado via fetchImpl mockado", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify(validEnvelopeBody()), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  const projection = await fetchCollectorStatusProjectionViaHttp({
    baseUrl: "http://127.0.0.1:1",
    fetchImpl,
  });
  assert.equal(projection.rows.length, 1);
  assert.equal(projection.window_hours, 24);
});
