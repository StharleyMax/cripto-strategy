// Testes de `T-03.3` — o par MORDE/CALA de `parseCatalogEnvelope` e dos `TransportErrorKind` de
// `fetchSeriesCatalogProjectionViaHttp`, mais o mapeamento para `CatalogRow`.
//
// Run with: npm --prefix frontend run test:s3 (ou node --conditions=react-server --test
// 'src/features/s3-inspector/*.test.ts')
//
// Estilo espelhado em `collector-status-query.test.ts`: nenhum servidor real aqui — o par
// MORDE/CALA do parser roda sobre um objeto plano transcrito à mão de `series-catalog.ts:67-83`
// (`SeriesKey`, 15 campos) e `series-catalog.ts:134` (`SeriesCatalogEntry`, 6 campos), NÃO
// derivado de `KEY_FIELD_KINDS`/`ENTRY_FIELD_KINDS` (`series-catalog-query.ts`) — essa cobertura
// de rota real já existe em `backend/tests/api/test_series_catalog_route.py` (`T-03.2`).

import assert from "node:assert/strict";
import { test } from "node:test";

import { InvalidCatalogEntryError } from "./series-catalog.ts";
import {
  catalogRowsFromSeriesCatalogProjection,
  fetchSeriesCatalogProjectionViaHttp,
  parseCatalogEnvelope,
  SERIES_CATALOG_QUERY_NAME,
  TransportError,
} from "./series-catalog-query.ts";

/** `series-catalog.ts:67-83`'s 15 `SeriesKey` fields, in that interface's own order — hand
 * transcribed, an independent witness that has to disagree with a field reorder/drop rather
 * than echo the very map it is supposed to check (same discipline `ADR_030_ROW_FIELDS` already
 * carries in the sibling `s1-console` test). */
const SERIES_KEY_WIRE_FIELDS: readonly string[] = [
  "provider",
  "venue",
  "instrumentId",
  "metric",
  "cohort",
  "interval",
  "unit",
  "denom",
  "nature",
  "tsConvention",
  "reduction",
  "quantityField",
  "labelShift",
  "aggregationScope",
  "verifiedBy",
];

/** `series-catalog.ts:134`'s 6 `SeriesCatalogEntry` top-level fields, in that interface's own
 * order. */
const CATALOG_ENTRY_WIRE_FIELDS: readonly string[] = [
  "key",
  "nativeGrid",
  "maxStalenessMs",
  "priceUse",
  "reconstructedFrom",
  "publishedError",
];

function validKeyWire(): Record<string, unknown> {
  return {
    provider: "binance",
    venue: "binance-futures",
    instrumentId: "BTCUSDT",
    metric: "open_interest",
    cohort: "ALL",
    interval: "5m",
    unit: "BTC",
    denom: "NA",
    nature: "STOCK",
    tsConvention: "POINT_AT_BUCKET_END",
    reduction: "POINT",
    quantityField: "NA",
    labelShift: 0,
    aggregationScope: "SYMBOL",
    verifiedBy: "test_series_catalog_binance_oi_5m",
  };
}

function validEntryWire(): Record<string, unknown> {
  return {
    key: validKeyWire(),
    nativeGrid: "5m",
    maxStalenessMs: 900_000,
    priceUse: null,
    reconstructedFrom: null,
    publishedError: null,
  };
}

function validEnvelopeBody(entries: Array<Record<string, unknown>> = [validEntryWire()]): Record<string, unknown> {
  return {
    query: SERIES_CATALOG_QUERY_NAME,
    n_entries: entries.length,
    entries,
  };
}

test("universo declarado: 15 campos de SeriesKey + 6 de SeriesCatalogEntry, sem duplicata em nenhuma das duas listas", () => {
  assert.equal(SERIES_KEY_WIRE_FIELDS.length, 15);
  assert.equal(new Set(SERIES_KEY_WIRE_FIELDS).size, 15, "sem campo duplicado em SeriesKey");
  assert.equal(CATALOG_ENTRY_WIRE_FIELDS.length, 6);
  assert.equal(new Set(CATALOG_ENTRY_WIRE_FIELDS).size, 6, "sem campo duplicado em SeriesCatalogEntry");
});

test("CALA: parseCatalogEnvelope aceita um envelope bem formado", () => {
  const projection = parseCatalogEnvelope(validEnvelopeBody());
  assert.equal(projection.query, "series_catalog");
  assert.equal(projection.n_entries, 1);
  assert.equal(projection.entries.length, 1);
  assert.equal(projection.entries[0]!.key.provider, "binance");
});

test("MORDE: corpo que não é um objeto plano reprova (null, array, primitivo)", () => {
  for (const bad of [null, undefined, "uma string", 42, ["array", "não", "objeto"]]) {
    assert.throws(() => parseCatalogEnvelope(bad), /response body is not a plain JSON object/);
  }
});

test('MORDE: "query" com nome diferente do esperado reprova', () => {
  const body = validEnvelopeBody();
  body.query = "collector_status";
  assert.throws(() => parseCatalogEnvelope(body), /"query" is/);
});

test('MORDE: "entries" ausente ou não-array reprova', () => {
  const missing = validEnvelopeBody();
  delete missing.entries;
  assert.throws(() => parseCatalogEnvelope(missing), /"entries" is missing or not an array/);

  const wrongType = validEnvelopeBody();
  wrongType.entries = "não-é-um-array";
  assert.throws(() => parseCatalogEnvelope(wrongType), /"entries" is missing or not an array/);
});

test("MORDE: n_entries != entries.length reprova — exatamente a cara de uma resposta truncada", () => {
  const body = validEnvelopeBody();
  body.n_entries = 2;
  assert.throws(() => parseCatalogEnvelope(body), /"n_entries".*disagrees with entries\.length/);
});

// ── O falsificador do DoD: 1 campo removido por vez, universo = 21 (15 + 6) ───────────────────

for (const field of CATALOG_ENTRY_WIRE_FIELDS) {
  test(`MORDE: entries[0] sem o campo "${field}" reprova, identificando o campo`, () => {
    const body = validEnvelopeBody();
    const entry = (body.entries as Array<Record<string, unknown>>)[0]!;
    delete entry[field];
    assert.throws(() => parseCatalogEnvelope(body), new RegExp(`entries\\[0\\] is missing field "${field}"`));
  });
}

for (const field of SERIES_KEY_WIRE_FIELDS) {
  test(`MORDE: entries[0].key sem o campo "${field}" reprova, identificando o campo`, () => {
    const body = validEnvelopeBody();
    const entry = (body.entries as Array<Record<string, unknown>>)[0]!;
    delete (entry.key as Record<string, unknown>)[field];
    assert.throws(
      () => parseCatalogEnvelope(body),
      new RegExp(`entries\\[0\\]\\.key is missing field "${field}"`),
    );
  });
}

// ── Tipo/forma errada — um caso por família de validação, não só "ausente" ────────────────────

test('MORDE: "nature" fora do conjunto fechado reprova', () => {
  const body = validEnvelopeBody();
  ((body.entries as Array<Record<string, unknown>>)[0]!.key as Record<string, unknown>).nature = "DESCONHECIDO";
  assert.throws(() => parseCatalogEnvelope(body), /field "nature" failed validation/);
});

test('MORDE: "reduction" fora do conjunto fechado reprova (CA-F2-17: as 4 reduções da Coinalyze são nomeadas)', () => {
  const body = validEnvelopeBody();
  ((body.entries as Array<Record<string, unknown>>)[0]!.key as Record<string, unknown>).reduction = "AVG";
  assert.throws(() => parseCatalogEnvelope(body), /field "reduction" failed validation/);
});

test('MORDE: "labelShift" não-número reprova', () => {
  const body = validEnvelopeBody();
  ((body.entries as Array<Record<string, unknown>>)[0]!.key as Record<string, unknown>).labelShift = "0";
  assert.throws(() => parseCatalogEnvelope(body), /field "labelShift" failed validation/);
});

test('MORDE: "publishedError" com forma errada (falta "n") reprova', () => {
  const body = validEnvelopeBody([
    {
      ...validEntryWire(),
      reconstructedFrom: "aggtrade_q",
      publishedError: { medianBp: 0, p99Bp: 1 },
    },
  ]);
  assert.throws(() => parseCatalogEnvelope(body), /field "publishedError" failed validation/);
});

test("MORDE: camada de regra de negócio (assertValidCatalogEntry) ainda reprova depois da forma passar — reconstructedFrom sem publishedError", () => {
  const body = validEnvelopeBody([{ ...validEntryWire(), reconstructedFrom: "aggtrade_q" }]);
  assert.throws(() => parseCatalogEnvelope(body), InvalidCatalogEntryError);
});

test("MORDE: camada de regra de negócio ainda reprova metric proibido (SPEC-001 §3.1)", () => {
  const body = validEnvelopeBody([
    { ...validEntryWire(), key: { ...validKeyWire(), metric: "implied_avg_price" } },
  ]);
  assert.throws(() => parseCatalogEnvelope(body));
});

test('CALA: reconstrução com publishedError presente passa (a forma E a regra de negócio)', () => {
  const body = validEnvelopeBody([
    {
      ...validEntryWire(),
      reconstructedFrom: "aggtrade_q",
      publishedError: { medianBp: 0, p99Bp: 29.34, n: 699 },
    },
  ]);
  const projection = parseCatalogEnvelope(body);
  assert.equal(projection.entries[0]!.reconstructedFrom, "aggtrade_q");
  assert.deepEqual(projection.entries[0]!.publishedError, { medianBp: 0, p99Bp: 29.34, n: 699 });
});

// ── Mapeamento para `CatalogRow` — Completeness unmeasured, Provenance de reconstructedFrom,
//    Quarantine com available_at sempre ausente ────────────────────────────────────────────────

test("catalogRowsFromSeriesCatalogProjection: completeness é SEMPRE unmeasured, nunca um grid/tick inventado", () => {
  const projection = parseCatalogEnvelope(validEnvelopeBody());
  const [row] = catalogRowsFromSeriesCatalogProjection(projection);
  assert.deepEqual(row!.completeness, { kind: "unmeasured" });
});

test("catalogRowsFromSeriesCatalogProjection: provenance é OBSERVADO quando reconstructedFrom é null", () => {
  const projection = parseCatalogEnvelope(validEnvelopeBody());
  const [row] = catalogRowsFromSeriesCatalogProjection(projection);
  assert.equal(row!.provenance, "OBSERVADO");
});

test("catalogRowsFromSeriesCatalogProjection: provenance é DERIVADO quando reconstructedFrom não é null", () => {
  const body = validEnvelopeBody([
    {
      ...validEntryWire(),
      reconstructedFrom: "aggtrade_q",
      publishedError: { medianBp: 0, p99Bp: 29.34, n: 699 },
    },
  ]);
  const projection = parseCatalogEnvelope(body);
  const [row] = catalogRowsFromSeriesCatalogProjection(projection);
  assert.equal(row!.provenance, "DERIVADO");
});

test("catalogRowsFromSeriesCatalogProjection: labelShift/unit sempre presentes, available_at sempre ausente (T-03.4/T-03.5 ainda não wireados)", () => {
  const projection = parseCatalogEnvelope(validEnvelopeBody());
  const [row] = catalogRowsFromSeriesCatalogProjection(projection);
  assert.deepEqual(row!.quarantine, {
    labelShiftPresent: true,
    unitPresent: true,
    availableAtPresent: false,
  });
});

test("catalogRowsFromSeriesCatalogProjection: 1 CatalogRow por entrada, na mesma ordem", () => {
  const body = validEnvelopeBody([validEntryWire(), { ...validEntryWire(), key: { ...validKeyWire(), interval: "1m" } }]);
  const projection = parseCatalogEnvelope(body);
  const rows = catalogRowsFromSeriesCatalogProjection(projection);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.entry.key.interval, "5m");
  assert.equal(rows[1]!.entry.key.interval, "1m");
});

// ── `TransportErrorKind` — mesmos 4 kinds de `ingest-health-query.ts`, fetchImpl mockado ──────

test("MORDE TransportErrorKind=missing_base_url: sem baseUrl e sem env, rejeita com o kind certo", async () => {
  const previousBaseUrl = process.env.INGEST_HEALTH_API_BASE_URL;
  delete process.env.INGEST_HEALTH_API_BASE_URL;
  try {
    await assert.rejects(
      () => fetchSeriesCatalogProjectionViaHttp({}),
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
    () => fetchSeriesCatalogProjectionViaHttp({ baseUrl: "http://127.0.0.1:1", fetchImpl }),
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
    () => fetchSeriesCatalogProjectionViaHttp({ baseUrl: "http://127.0.0.1:1", fetchImpl }),
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
    () => fetchSeriesCatalogProjectionViaHttp({ baseUrl: "http://127.0.0.1:1", fetchImpl }),
    (error: unknown) => {
      assert.ok(error instanceof TransportError, "erro não é TransportError");
      assert.equal(error.kind, "malformed_envelope");
      return true;
    },
  );
});

test("MORDE TransportErrorKind=malformed_envelope (JSON válido, schema inválido — envelope de /collector-status)", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ query: "collector_status", as_of: "", window_hours: 24, n_rows: 0, rows: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  await assert.rejects(
    () => fetchSeriesCatalogProjectionViaHttp({ baseUrl: "http://127.0.0.1:1", fetchImpl }),
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
  const projection = await fetchSeriesCatalogProjectionViaHttp({
    baseUrl: "http://127.0.0.1:1",
    fetchImpl,
  });
  assert.equal(projection.n_entries, 1);
  assert.equal(projection.entries[0]!.key.provider, "binance");
});
