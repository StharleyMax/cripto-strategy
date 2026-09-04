// Testes de `T-07.13` — o controle de `fingerprint`, e o par MORDE/CALA de
// `parseIngestHealthEnvelope`.
//
// Run with: npm --prefix frontend run test:s1 (ou node --test 'src/features/s1-console/*.test.ts')
//
// `T-05.14`/`ADR-019` ja tinha movido a cobertura de `DoD-2` (sha256 servidor x reconstrucao
// TS) e o mapeamento para `CollectorRow`/`S1ViewModel` para `ingest-health-query-http.test.ts`,
// que os exercita sobre a rota real (`GET /ingest-health`) em vez do parser NDJSON do CLI, que
// morreu com `ADR-005/D6.1` (`SectionMarker`/`isHeaderLine`/`parseCanonicalProjection`,
// `fetchIngestHealthProjectionViaCli`/`IngestHealthQueryResult` — todos apagados por
// `ADR-019/D1`).
//
// `T-05.15` apaga o resto do transporte CLI (`runIngestHealthCli` e companhia — `spawnSync`
// nao existe em browser, em nenhuma variante) e, com ele, o teste de `ADR-008/DoD-3` que
// invocava o CLI como subprocesso a partir daqui. Esse `DoD-3` (um `verdict` inedito faz a
// consulta reprovar) continua provado no lado Python
// (`backend/tests/sentimento/test_ingest_health_query.py:312-360`); reabrir uma testemunha
// cruzada Python x TS sobre a rota HTTP e pergunta de `A1`, dono `quant-architect`, nao desta
// task (`docs/context/plataforma-dados/tasks.toml`, `T-05.15` refs).

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  fingerprint,
  INGEST_HEALTH_QUERY_NAME,
  parseIngestHealthEnvelope,
  type IngestHealthProjection,
} from "./ingest-health-query.ts";

// ── `fingerprint`: controle positivo (mesmo estado) e negativo (estado diferente) ──────────

test("fingerprint: o MESMO estado produz o MESMO sha256, duas vezes", () => {
  const projection: IngestHealthProjection = {
    runs: [
      {
        run_id: "r1",
        source: "binance-futures",
        endpoint: "/fapi/v1/klines",
        window: "w1",
        n_expected: 1,
        n_returned: 1,
        n_written: 1,
        verdict: "ACCEPTED",
        api_code: 200,
        src_sha256: "0".repeat(64),
        weight_used: 1,
        observer_id: "obs",
        observer_region: "sa-east-1",
        clock_skew_ms: 1,
        janela_de_perda: null,
      },
    ],
    gaps: [],
  };
  assert.equal(fingerprint(projection), fingerprint(projection));
});

test("fingerprint: um ESTADO diferente MOVE o sha256 — controle negativo, D7.17 nao e vacuo", () => {
  const base: IngestHealthProjection = {
    runs: [
      {
        run_id: "r1",
        source: "binance-futures",
        endpoint: "/fapi/v1/klines",
        window: "w1",
        n_expected: 1,
        n_returned: 1,
        n_written: 1,
        verdict: "ACCEPTED",
        api_code: 200,
        src_sha256: "0".repeat(64),
        weight_used: 1,
        observer_id: "obs",
        observer_region: "sa-east-1",
        clock_skew_ms: 1,
        janela_de_perda: null,
      },
    ],
    gaps: [],
  };
  const changed: IngestHealthProjection = {
    runs: [{ ...base.runs[0], verdict: "REJECTED" }],
    gaps: [],
  };
  assert.notEqual(fingerprint(base), fingerprint(changed));
});

// ── `parseIngestHealthEnvelope` — `ADR-019/D2`: "tipagem estrita... em toda entrada de rede" ──
// `T-05.14` rodada 2, achado 3 do QA (`T-05.14-qa.md`): até aqui só o lado CALA (4 respostas
// bem-formadas, em `ingest-health-query-http.test.ts`, vindas de um `uvicorn` real) estava
// testado. Os testes abaixo são o par MORDE que faltava — cada um alimenta o parser com um
// corpo que o `ADR-019/D2` promete rejeitar, e confirma que ele rejeita por engano, não em
// silêncio (nunca devolve uma projeção parcial/default-preenchida).

function validEnvelopeBody(): Record<string, unknown> {
  return {
    query: INGEST_HEALTH_QUERY_NAME,
    n_runs: 1,
    n_gaps: 1,
    runs: [
      {
        run_id: "r1",
        source: "binance-futures",
        endpoint: "/fapi/v1/klines",
        window: "w1",
        n_expected: 1,
        n_returned: 1,
        n_written: 1,
        verdict: "ACCEPTED",
        api_code: 200,
        src_sha256: "0".repeat(64),
        weight_used: 1,
        observer_id: "obs",
        observer_region: "sa-east-1",
        clock_skew_ms: 1,
        janela_de_perda: null,
      },
    ],
    gaps: [
      {
        source: "binance-futures",
        symbol: "BTCUSDT",
        series_key_id: "binance-futures:BTCUSDT:openInterest",
        from_ts: "2026-08-01T00:00:00Z",
        to_ts: "2026-08-01T00:05:00Z",
        n_missing: 5,
        class: "MISSING",
        detected_at: "2026-08-01T00:06:00Z",
      },
    ],
  };
}

test("CALA: parseIngestHealthEnvelope aceita um envelope bem formado (controle positivo do par abaixo)", () => {
  const projection = parseIngestHealthEnvelope(validEnvelopeBody());
  assert.equal(projection.runs.length, 1);
  assert.equal(projection.gaps.length, 1);
});

test("MORDE: corpo que nao e um objeto plano reprova (null, array, primitivo)", () => {
  for (const bad of [null, undefined, "uma string", 42, ["array", "nao", "objeto"]]) {
    assert.throws(() => parseIngestHealthEnvelope(bad), /response body is not a plain JSON object/);
  }
});

test("MORDE: \"runs\" ausente ou nao-array reprova", () => {
  const missing = validEnvelopeBody();
  delete missing.runs;
  assert.throws(() => parseIngestHealthEnvelope(missing), /"runs" is missing or not an array/);

  const wrongType = validEnvelopeBody();
  wrongType.runs = "nao-e-um-array";
  assert.throws(() => parseIngestHealthEnvelope(wrongType), /"runs" is missing or not an array/);
});

test("MORDE: \"gaps\" ausente ou nao-array reprova", () => {
  const missing = validEnvelopeBody();
  delete missing.gaps;
  assert.throws(() => parseIngestHealthEnvelope(missing), /"gaps" is missing or not an array/);
});

test("MORDE: coluna faltando em runs[] reprova, identificando a coluna", () => {
  const body = validEnvelopeBody();
  const run = (body.runs as Array<Record<string, unknown>>)[0]!;
  delete run.window;
  assert.throws(() => parseIngestHealthEnvelope(body), /runs\[0\] is missing column "window"/);
});

test("MORDE: coluna faltando em gaps[] reprova, identificando a coluna", () => {
  const body = validEnvelopeBody();
  const gap = (body.gaps as Array<Record<string, unknown>>)[0]!;
  delete gap.class;
  assert.throws(() => parseIngestHealthEnvelope(body), /gaps\[0\] is missing column "class"/);
});

test("MORDE: tipo errado numa coluna de runs[] reprova (numero onde o contrato pede string)", () => {
  const body = validEnvelopeBody();
  const run = (body.runs as Array<Record<string, unknown>>)[0]!;
  run.source = 42;
  assert.throws(() => parseIngestHealthEnvelope(body), /column "source" has the wrong type/);
});

test("MORDE: tipo errado numa coluna nullable de runs[] reprova (string onde o contrato pede numero|null)", () => {
  const body = validEnvelopeBody();
  const run = (body.runs as Array<Record<string, unknown>>)[0]!;
  run.janela_de_perda = "nao-e-numero-nem-null";
  assert.throws(() => parseIngestHealthEnvelope(body), /column "janela_de_perda" has the wrong type/);
});

test("MORDE: n_runs != runs.length reprova — exatamente a cara de uma resposta truncada", () => {
  const body = validEnvelopeBody();
  body.n_runs = 2;
  assert.throws(() => parseIngestHealthEnvelope(body), /"n_runs".*disagrees with runs\.length/);
});

test("MORDE: n_gaps != gaps.length reprova — exatamente a cara de uma resposta truncada", () => {
  const body = validEnvelopeBody();
  body.n_gaps = 0;
  assert.throws(() => parseIngestHealthEnvelope(body), /"n_gaps".*disagrees with gaps\.length/);
});

test("MORDE: \"query\" com nome diferente do esperado reprova", () => {
  const body = validEnvelopeBody();
  body.query = "outra_consulta_qualquer";
  assert.throws(() => parseIngestHealthEnvelope(body), /"query" is/);
});
