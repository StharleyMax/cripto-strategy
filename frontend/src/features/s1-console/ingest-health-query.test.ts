// Testes de `T-07.13` — `ADR-008/DoD-3` sobre o transporte CLI, e o controle de `fingerprint`.
//
// Run with: npm --prefix frontend run test:s1 (ou node --test 'src/features/s1-console/*.test.ts')
//
// `T-05.14`/`ADR-019` moveu a cobertura de `DoD-2` (sha256 CLI x reconstrucao TS) e o
// mapeamento para `CollectorRow`/`S1ViewModel` para `ingest-health-query-http.test.ts`, que os
// exercita sobre a rota real (`GET /ingest-health`) em vez do parser NDJSON do CLI, que
// morreu com `ADR-005/D6.1` (`SectionMarker`/`isHeaderLine`/`parseCanonicalProjection`,
// `fetchIngestHealthProjectionViaCli`/`IngestHealthQueryResult` — todos apagados por
// `ADR-019/D1`). O que fica aqui e o que `ADR-019` explicitamente NAO reabre: `DoD-3` sobre o
// CLI (consumidor #1, `runIngestHealthCli`, intocado por `T-05.14`) e o controle de
// `fingerprint` sobre fixture pura, sem CLI nenhum. `DoD-3` sobre a rota HTTP (o consumidor #2
// novo) fica fora do escopo desta task (`ADR-019`, "Nao fecha").
//
// O teste de DoD-3 abaixo RODA O CLI REAL (`backend/src/modules/sentimento/infra/
// ingest_health_cli.py`) como subprocesso, contra um fixture SQLite construido por um script
// Python embutido abaixo (nenhum arquivo sob `backend/` e criado ou editado — o script so
// ESCREVE num `.sqlite3` temporario fora da arvore do backend). Precisa de `backend/.venv`
// (`bash backend/scripts/bootstrap.sh`), e reprova alto se ele faltar — nunca cai
// silenciosamente para um interprete do PATH.

import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  fingerprint,
  INGEST_HEALTH_QUERY_NAME,
  parseIngestHealthEnvelope,
  runIngestHealthCli,
  type IngestHealthProjection,
} from "./ingest-health-query.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(THIS_DIR, "../../../../backend");
const PYTHON_BIN = path.join(BACKEND_ROOT, ".venv", "bin", "python3");

// ── Fixture builder: escreve UM `.sqlite3` fora de `backend/`, via o `SqliteIngestRecordStore`
// REAL importado do backend — nenhuma reimplementacao do schema aqui. Um unico run, com um
// `verdict` que a consulta compartilhada nao conhece — o unico modo que o teste abaixo precisa.
const FIXTURE_BUILDER_SCRIPT = `
import sys
from pathlib import Path
from src.modules.sentimento.domain.ingest_record import IngestRun
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore

store_path = sys.argv[1]
target = Path(store_path)
if target.exists():
    target.unlink()
store = SqliteIngestRecordStore(target)
store.initialise()
store.record_run(IngestRun(
    run_id="r1", source="binance-futures", endpoint="/fapi/v1/klines", window="w1",
    n_expected=10, n_returned=10, n_written=10, verdict="JAMAIS_VISTO_T0713", api_code=200,
    src_sha256="0" * 64, weight_used=1, observer_id="t0713-observer",
    observer_region="sa-east-1", clock_skew_ms=7,
    started_at="2026-08-01T00:00:00Z", ended_at="2026-08-01T00:00:00Z",
))
`;

function buildUnknownVerdictFixtureStore(tmpDir: string): string {
  const storePath = path.join(tmpDir, "unknown_verdict.sqlite3");
  const result = spawnSync(PYTHON_BIN, ["-c", FIXTURE_BUILDER_SCRIPT, storePath], {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `fixture builder falhou: ${result.stderr}`);
  return storePath;
}

function withTmpDir<T>(run: (tmpDir: string) => T): T {
  const tmpDir = mkdtempSync(path.join(tmpdir(), "t0713-"));
  try {
    return run(tmpDir);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── `ADR-008/DoD-3` sobre o CLI (consumidor #1) — o falsificador que T-05.14 nao reabre ──────

test("DoD-3: um verdict inedito faz o CLI (consumidor #1) reprovar, sem gravar linha nenhuma no stdout", () => {
  withTmpDir((tmpDir) => {
    const storePath = buildUnknownVerdictFixtureStore(tmpDir);
    const cli = runIngestHealthCli(storePath, { backendRoot: BACKEND_ROOT });
    assert.notEqual(cli.exitCode, 0);
    assert.equal(cli.stdout, "");
    assert.match(cli.stderr, /UnknownVerdictError/);
    assert.match(cli.stderr, /JAMAIS_VISTO_T0713/);
  });
});

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
