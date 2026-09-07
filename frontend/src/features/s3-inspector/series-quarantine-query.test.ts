// Testes de `T-03.5` — o par MORDE/CALA de `parseQuarantineEnvelope` e dos `TransportErrorKind`
// de `fetchSeriesQuarantineProjectionViaHttp`, mais o mapeamento para `QuarantineSourceRow`.
//
// Run with: npm --prefix frontend run test:s3 (ou node --conditions=react-server --test
// 'src/features/s3-inspector/*.test.ts')
//
// Estilo espelhado em `series-catalog-query.test.ts`: nenhum servidor real aqui — o par
// MORDE/CALA do parser roda sobre um objeto plano transcrito à mão de
// `series_quarantine_report.py::QuarantineRow.to_wire()` (9 campos), NÃO derivado de
// `ROW_FIELD_KINDS` (`series-quarantine-query.ts`) — essa cobertura de rota real já existe em
// `backend/tests/api/test_series_quarantine_route_over_the_network.py` (`T-03.4`).

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  fetchSeriesQuarantineProjectionViaHttp,
  parseQuarantineEnvelope,
  quarantineSourceRowsFromProjection,
  SERIES_QUARANTINE_QUERY_NAME,
  TransportError,
} from "./series-quarantine-query.ts";

/** `QuarantineRow.to_wire()`'s 9 keys, in that method's own order — hand transcribed, an
 * independent witness that has to disagree with a field reorder/drop rather than echo the very
 * map it is supposed to check (same discipline `series-catalog-query.test.ts` already carries). */
const QUARANTINE_ROW_WIRE_FIELDS: readonly string[] = [
  "source",
  "series_kind",
  "binance_symbol",
  "coinalyze_symbol",
  "n_points",
  "recorded_at",
  "labelShiftPresent",
  "unitPresent",
  "availableAtPresent",
];

function validRowWire(): Record<string, unknown> {
  return {
    source: "coinalyze",
    series_kind: "open_interest",
    binance_symbol: "BTCUSDT",
    coinalyze_symbol: "BTCUSDT_PERP.A",
    n_points: 1440,
    recorded_at: "2026-08-12T12:06:00Z",
    labelShiftPresent: true,
    unitPresent: true,
    availableAtPresent: false,
  };
}

function validEnvelopeBody(rows: Array<Record<string, unknown>> = [validRowWire()]): Record<string, unknown> {
  return {
    query: SERIES_QUARANTINE_QUERY_NAME,
    n_rows: rows.length,
    rows,
  };
}

test("universo declarado: 9 campos de QuarantineRow, sem duplicata", () => {
  assert.equal(QUARANTINE_ROW_WIRE_FIELDS.length, 9);
  assert.equal(new Set(QUARANTINE_ROW_WIRE_FIELDS).size, 9, "sem campo duplicado");
});

test("CALA: parseQuarantineEnvelope aceita um envelope bem formado", () => {
  const projection = parseQuarantineEnvelope(validEnvelopeBody());
  assert.equal(projection.query, "series_quarantine");
  assert.equal(projection.n_rows, 1);
  assert.equal(projection.rows.length, 1);
  assert.equal(projection.rows[0]!.source, "coinalyze");
});

test("MORDE: corpo que não é um objeto plano reprova (null, array, primitivo)", () => {
  for (const bad of [null, undefined, "uma string", 42, ["array", "não", "objeto"]]) {
    assert.throws(() => parseQuarantineEnvelope(bad), /response body is not a plain JSON object/);
  }
});

test('MORDE: "query" com nome diferente do esperado reprova', () => {
  const body = validEnvelopeBody();
  body.query = "series_catalog";
  assert.throws(() => parseQuarantineEnvelope(body), /"query" is/);
});

test('MORDE: "rows" ausente ou não-array reprova', () => {
  const missing = validEnvelopeBody();
  delete missing.rows;
  assert.throws(() => parseQuarantineEnvelope(missing), /"rows" is missing or not an array/);

  const wrongType = validEnvelopeBody();
  wrongType.rows = "não-é-um-array";
  assert.throws(() => parseQuarantineEnvelope(wrongType), /"rows" is missing or not an array/);
});

test("MORDE: n_rows != rows.length reprova — exatamente a cara de uma resposta truncada", () => {
  const body = validEnvelopeBody();
  body.n_rows = 2;
  assert.throws(() => parseQuarantineEnvelope(body), /"n_rows".*disagrees with rows\.length/);
});

// ── O falsificador do DoD: 1 campo removido por vez, universo = 9 ────────────────────────────

for (const field of QUARANTINE_ROW_WIRE_FIELDS) {
  test(`MORDE: rows[0] sem o campo "${field}" reprova, identificando o campo`, () => {
    const body = validEnvelopeBody();
    const row = (body.rows as Array<Record<string, unknown>>)[0]!;
    delete row[field];
    assert.throws(() => parseQuarantineEnvelope(body), new RegExp(`rows\\[0\\] is missing field "${field}"`));
  });
}

// ── Tipo/forma errada — um caso por campo booleano/numérico, não só "ausente" ─────────────────

test('MORDE: "n_points" não-número reprova', () => {
  const body = validEnvelopeBody();
  (body.rows as Array<Record<string, unknown>>)[0]!.n_points = "1440";
  assert.throws(() => parseQuarantineEnvelope(body), /field "n_points" failed validation/);
});

test('MORDE: "availableAtPresent" não-booleano reprova', () => {
  const body = validEnvelopeBody();
  (body.rows as Array<Record<string, unknown>>)[0]!.availableAtPresent = "false";
  assert.throws(() => parseQuarantineEnvelope(body), /field "availableAtPresent" failed validation/);
});

// ── Mapeamento para `QuarantineSourceRow` — terms verbatim, label não inventa dado ────────────

test("quarantineSourceRowsFromProjection: terms são os 3 booleanos verbatim do fio", () => {
  const projection = parseQuarantineEnvelope(validEnvelopeBody());
  const [row] = quarantineSourceRowsFromProjection(projection);
  assert.deepEqual(row!.terms, { labelShiftPresent: true, unitPresent: true, availableAtPresent: false });
});

test("quarantineSourceRowsFromProjection: seriesLabel contém symbol, series_kind e source", () => {
  const projection = parseQuarantineEnvelope(validEnvelopeBody());
  const [row] = quarantineSourceRowsFromProjection(projection);
  assert.ok(row!.seriesLabel.includes("BTCUSDT"));
  assert.ok(row!.seriesLabel.includes("open_interest"));
  assert.ok(row!.seriesLabel.includes("coinalyze"));
});

test("quarantineSourceRowsFromProjection: 1 QuarantineSourceRow por linha, na mesma ordem", () => {
  const body = validEnvelopeBody([
    validRowWire(),
    { ...validRowWire(), binance_symbol: "ETHUSDT", coinalyze_symbol: "ETHUSDT_PERP.A" },
  ]);
  const projection = parseQuarantineEnvelope(body);
  const rows = quarantineSourceRowsFromProjection(projection);
  assert.equal(rows.length, 2);
  assert.ok(rows[0]!.seriesLabel.includes("BTCUSDT"));
  assert.ok(rows[1]!.seriesLabel.includes("ETHUSDT"));
});

// ── `TransportErrorKind` — mesmos 4 kinds das outras transportes de `s3-inspector` ────────────

test("MORDE TransportErrorKind=missing_base_url: sem baseUrl e sem env, rejeita com o kind certo", async () => {
  const previousBaseUrl = process.env.INGEST_HEALTH_API_BASE_URL;
  delete process.env.INGEST_HEALTH_API_BASE_URL;
  try {
    await assert.rejects(
      () => fetchSeriesQuarantineProjectionViaHttp({}),
      (error: unknown) => {
        assert.ok(error instanceof TransportError, "erro não é TransportError");
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
    () => fetchSeriesQuarantineProjectionViaHttp({ baseUrl: "http://127.0.0.1:1", fetchImpl }),
    (error: unknown) => {
      assert.ok(error instanceof TransportError, "erro não é TransportError");
      assert.equal(error.kind, "connection_refused");
      return true;
    },
  );
});

test("MORDE TransportErrorKind=non_2xx: resposta 500 ⇒ kind certo, com status preservado", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response("erro interno", { status: 500, statusText: "Internal Server Error" });
  await assert.rejects(
    () => fetchSeriesQuarantineProjectionViaHttp({ baseUrl: "http://127.0.0.1:1", fetchImpl }),
    (error: unknown) => {
      assert.ok(error instanceof TransportError, "erro não é TransportError");
      assert.equal(error.kind, "non_2xx");
      assert.equal(error.status, 500);
      return true;
    },
  );
});

test("MORDE TransportErrorKind=malformed_envelope (corpo não-JSON): kind certo", async () => {
  const fetchImpl: typeof fetch = async () => new Response("isto não é json", { status: 200 });
  await assert.rejects(
    () => fetchSeriesQuarantineProjectionViaHttp({ baseUrl: "http://127.0.0.1:1", fetchImpl }),
    (error: unknown) => {
      assert.ok(error instanceof TransportError, "erro não é TransportError");
      assert.equal(error.kind, "malformed_envelope");
      return true;
    },
  );
});

test("MORDE TransportErrorKind=malformed_envelope (JSON válido, schema inválido — envelope de /series-catalog)", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ query: "series_catalog", n_entries: 0, entries: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  await assert.rejects(
    () => fetchSeriesQuarantineProjectionViaHttp({ baseUrl: "http://127.0.0.1:1", fetchImpl }),
    (error: unknown) => {
      assert.ok(error instanceof TransportError, "erro não é TransportError");
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
  const projection = await fetchSeriesQuarantineProjectionViaHttp({
    baseUrl: "http://127.0.0.1:1",
    fetchImpl,
  });
  assert.equal(projection.n_rows, 1);
  assert.equal(projection.rows[0]!.source, "coinalyze");
});
