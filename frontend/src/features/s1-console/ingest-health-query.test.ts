// Testes de `T-07.13` — `ADR-008/D3`+`DoD-2`+`DoD-3`, o falsificador da fase (`D7.17`):
// "a consulta e UMA... e um verdict INEDITO ⇒ os dois mudam juntos ou os dois reprovam."
//
// Run with: npm --prefix frontend run test:s1 (ou node --test 'src/features/s1-console/*.test.ts')
//
// Estes testes RODAM O CLI REAL (`backend/src/modules/sentimento/infra/ingest_health_cli.py`)
// como subprocesso, contra um fixture SQLite construido por um script Python embutido abaixo
// (nenhum arquivo sob `backend/` e criado ou editado — o script so ESCREVE num `.sqlite3`
// temporario fora da arvore do backend, exatamente o padrao que o handoff de T-07.13
// autoriza). Precisam de `backend/.venv` (`bash backend/scripts/bootstrap.sh`), e reprovam
// alto se ele faltar — nunca caem silenciosamente para um interprete do PATH.

import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildS1ViewModelFromIngestHealthProjection,
  canonicalLines,
  collectorRowsFromIngestHealthProjection,
  fetchIngestHealthProjectionViaCli,
  fingerprint,
  INGEST_HEALTH_GAP_COLUMNS,
  INGEST_HEALTH_RUN_COLUMNS,
  runIngestHealthCli,
  type IngestHealthProjection,
} from "./ingest-health-query.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(THIS_DIR, "../../../../backend");
const PYTHON_BIN = path.join(BACKEND_ROOT, ".venv", "bin", "python3");

// ── Fixture builder: escreve UM `.sqlite3` fora de `backend/`, via o `SqliteIngestRecordStore`
// REAL importado do backend — nenhuma reimplementacao do schema aqui. `mode` escolhe entre um
// estado valido (>= 1 run de CADA verdict conhecido, DoD-2) e um estado com UM verdict inedito
// (DoD-3). Os quatro `run(...)` do modo "valid" cobrem os tres verdicts conhecidos e DOIS runs
// para a MESMA chave (source, endpoint) em janelas de tempo diferentes, para que o teste de
// `collectorRowsFromIngestHealthProjection` abaixo tenha algo real para "mais recente vence".
const FIXTURE_BUILDER_SCRIPT = `
import sys
from pathlib import Path
from src.modules.sentimento.domain.ingest_record import IngestGap, IngestRun
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore

store_path, mode = sys.argv[1], sys.argv[2]
target = Path(store_path)
if target.exists():
    target.unlink()
store = SqliteIngestRecordStore(target)
store.initialise()


def run(run_id, source, endpoint, window, n_expected, n_returned, n_written, verdict, api_code, started_at):
    store.record_run(IngestRun(
        run_id=run_id, source=source, endpoint=endpoint, window=window,
        n_expected=n_expected, n_returned=n_returned, n_written=n_written,
        verdict=verdict, api_code=api_code, src_sha256="0" * 64, weight_used=1,
        observer_id="t0713-observer", observer_region="sa-east-1", clock_skew_ms=7,
        started_at=started_at, ended_at=started_at,
    ))


if mode == "valid":
    run("r1", "binance-futures", "/fapi/v1/klines", "w1", 100, 100, 100, "ACCEPTED", 200, "2026-08-01T00:00:00Z")
    run("r2", "binance-futures", "/fapi/v1/klines", "w2", 100, 95, 95, "ACCEPTED_WITH_WARNING", 200, "2026-08-02T00:00:00Z")
    run("r3", "coinalyze", "/oi", "w3", 60, 60, 60, "ACCEPTED", 200, "2026-08-01T00:00:00Z")
    run("r4", "bybit", "/public/v5/market/open-interest", "w4", 50, 0, 0, "REJECTED", -1130, "2026-08-01T00:00:00Z")
    store.record_gap(IngestGap(
        source="binance-futures", symbol="MATICUSDT", series_key_id="oi-5m",
        from_ts="2026-08-01T11:45:00Z", to_ts="2026-08-01T12:05:00Z", n_missing=3,
        gap_class="SOURCE_GAP", detected_at="2026-08-01T12:10:00Z",
    ))
elif mode == "unknown_verdict":
    run("r1", "binance-futures", "/fapi/v1/klines", "w1", 10, 10, 10, "JAMAIS_VISTO_T0713", 200, "2026-08-01T00:00:00Z")
else:
    raise SystemExit(f"modo de fixture desconhecido: {mode}")
`;

function buildFixtureStore(tmpDir: string, mode: "valid" | "unknown_verdict"): string {
  const storePath = path.join(tmpDir, `${mode}.sqlite3`);
  const result = spawnSync(PYTHON_BIN, ["-c", FIXTURE_BUILDER_SCRIPT, storePath, mode], {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `fixture builder falhou (mode=${mode}): ${result.stderr}`,
  );
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

// ── `ADR-008/DoD-2` — a mesma consulta, os DOIS lados concordam, sha256 comparado de verdade ──

test("fetchIngestHealthProjectionViaCli: sha256 do CLI e da reconstrucao TS de S1 sao IGUAIS, com >=1 run de cada verdict conhecido", () => {
  withTmpDir((tmpDir) => {
    const storePath = buildFixtureStore(tmpDir, "valid");
    const result = fetchIngestHealthProjectionViaCli(storePath, { backendRoot: BACKEND_ROOT });

    assert.equal(result.projection.runs.length, 4);
    assert.equal(result.projection.gaps.length, 1);

    const verdicts = new Set(result.projection.runs.map((run) => run.verdict));
    assert.deepEqual(verdicts, new Set(["ACCEPTED", "ACCEPTED_WITH_WARNING", "REJECTED"]));

    // A afirmacao central de D7.17, explicita — nao so "nao lancou excecao".
    assert.equal(result.cliFingerprint, result.reconstructedFingerprint);
    assert.match(result.cliFingerprint, /^[0-9a-f]{64}$/);
  });
});

test("runIngestHealthCli sozinho reproduz o mesmo sha256 que fetchIngestHealthProjectionViaCli calcula", () => {
  withTmpDir((tmpDir) => {
    const storePath = buildFixtureStore(tmpDir, "valid");
    const cli = runIngestHealthCli(storePath, { backendRoot: BACKEND_ROOT });
    assert.equal(cli.exitCode, 0);

    const result = fetchIngestHealthProjectionViaCli(storePath, { backendRoot: BACKEND_ROOT });
    const rawCliText = cli.stdout.endsWith("\n") ? cli.stdout.slice(0, -1) : cli.stdout;
    assert.equal(rawCliText, canonicalLines(result.projection).join("\n"));
  });
});

// ── Contrato de coluna — transcricao INDEPENDENTE de `ADR-008/D3`, nao o proprio `projectRun` ──

test("a projecao de UM run carrega exatamente as 15 colunas de ADR-008/D3, nesta ordem", () => {
  withTmpDir((tmpDir) => {
    const storePath = buildFixtureStore(tmpDir, "valid");
    const result = fetchIngestHealthProjectionViaCli(storePath, { backendRoot: BACKEND_ROOT });
    const lines = canonicalLines(result.projection);
    // lines[0]=header, lines[1]=marcador de secao ingest_run, lines[2..5]=4 runs,
    // lines[6]=marcador de secao ingest_gap, lines[7]=1 gap.
    const runLineKeys = Object.keys(JSON.parse(lines[2]) as Record<string, unknown>);
    assert.deepEqual(runLineKeys, INGEST_HEALTH_RUN_COLUMNS);

    const gapLineKeys = Object.keys(JSON.parse(lines[7]) as Record<string, unknown>);
    assert.deepEqual(gapLineKeys, INGEST_HEALTH_GAP_COLUMNS);
  });
});

test("janela_de_perda esta presente e null na projecao — F0 nunca inventa a formula (D7.12)", () => {
  withTmpDir((tmpDir) => {
    const storePath = buildFixtureStore(tmpDir, "valid");
    const result = fetchIngestHealthProjectionViaCli(storePath, { backendRoot: BACKEND_ROOT });
    for (const run of result.projection.runs) {
      assert.equal(run.janela_de_perda, null);
    }
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

// ── `ADR-008/DoD-3` — O FALSIFICADOR DA FASE: verdict inedito reprova OS DOIS CONSUMIDORES ──

test("DoD-3: um verdict inedito faz o CLI (consumidor #1) reprovar, sem gravar linha nenhuma no stdout", () => {
  withTmpDir((tmpDir) => {
    const storePath = buildFixtureStore(tmpDir, "unknown_verdict");
    const cli = runIngestHealthCli(storePath, { backendRoot: BACKEND_ROOT });
    assert.notEqual(cli.exitCode, 0);
    assert.equal(cli.stdout, "");
    assert.match(cli.stderr, /UnknownVerdictError/);
    assert.match(cli.stderr, /JAMAIS_VISTO_T0713/);
  });
});

test("DoD-3: o MESMO verdict inedito faz o adaptador de S1 (consumidor #2) reprovar tambem — nunca silenciosamente", () => {
  withTmpDir((tmpDir) => {
    const storePath = buildFixtureStore(tmpDir, "unknown_verdict");
    assert.throws(
      () => fetchIngestHealthProjectionViaCli(storePath, { backendRoot: BACKEND_ROOT }),
      /JAMAIS_VISTO_T0713/,
      "o consumidor de S1 tem de reprovar EXPLICITAMENTE, nao devolver uma projecao parcial",
    );
  });
});

// ── Mapeamento minimo para `CollectorRow`/`S1ViewModel` — grounded apenas no que a consulta da ──

test("collectorRowsFromIngestHealthProjection: uma linha por (source,endpoint), mantendo o run MAIS RECENTE", () => {
  withTmpDir((tmpDir) => {
    const storePath = buildFixtureStore(tmpDir, "valid");
    const result = fetchIngestHealthProjectionViaCli(storePath, { backendRoot: BACKEND_ROOT });
    const rows = collectorRowsFromIngestHealthProjection(result.projection);

    assert.equal(rows.length, 3, "4 runs, 2 deles compartilham chave -> 3 series");

    const bySeries = new Map(rows.map((row) => [row.series, row]));
    // r1 (2026-08-01, ACCEPTED) e r2 (2026-08-02, ACCEPTED_WITH_WARNING) compartilham
    // (binance-futures, /fapi/v1/klines) — r2 e mais recente e tem de vencer.
    const binance = bySeries.get("binance-futures · /fapi/v1/klines");
    assert.ok(binance, "linha binance-futures ausente");
    assert.equal(binance?.status, "ATIVO");
    assert.equal(binance?.uptimePercent, 95);

    const bybit = bySeries.get("bybit · /public/v5/market/open-interest");
    assert.ok(bybit, "linha bybit ausente");
    assert.equal(bybit?.status, "PARADO");
    assert.equal(bybit?.uptimePercent, 0);
    assert.deepEqual(bybit?.retention, { kind: "unmeasured" });
    assert.deepEqual(bybit?.resilience, { kind: "not_scored" });
  });
});

test("buildS1ViewModelFromIngestHealthProjection: PARADO ordena primeiro (D17), rows vem da consulta real", () => {
  withTmpDir((tmpDir) => {
    const storePath = buildFixtureStore(tmpDir, "valid");
    const result = fetchIngestHealthProjectionViaCli(storePath, { backendRoot: BACKEND_ROOT });
    const viewModel = buildS1ViewModelFromIngestHealthProjection(result.projection, 0, [], []);

    assert.equal(viewModel.rows.length, 3);
    assert.equal(viewModel.rows[0]?.statusCell.status, "PARADO");
  });
});
