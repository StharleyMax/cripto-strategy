// `T-05.14`/`ADR-019/D5` — the parity falsifier over the REAL route, `GET /ingest-health`
// (`ADR-005/D6.1`), not the CLI's NDJSON `stdout`. Separate file from
// `ingest-health-query.test.ts` on purpose — same split the backend already carries between
// `test_ingest_health_query.py` (in-process) and `test_ingest_health_route_over_the_network.py`
// (real socket).
//
// Run with: npm --prefix frontend run test:s1 (ou node --test 'src/features/s1-console/*.test.ts')
//
// Technique, mirrored from `backend/tests/api/test_ingest_health_route_over_the_network.py`'s
// `_served`: `uvicorn.Server` on a `daemon` thread, `port=0` (OS-assigned, never collides with
// a parallel run). The difference here is `spawn`, never `spawnSync` — the server process has
// to stay ALIVE between the `fetch` this file issues and the assertion that reads it, so it
// cannot be a synchronous, run-to-completion child process the way the CLI transport's tests
// are.
//
// The embedded Python script never edits `backend/src/` — every mutation (`reordered_columns`/
// `extra_run_field`/`extra_envelope_field`) is a `monkeypatch` of a module attribute, applied
// only inside THIS throwaway process, before `create_app` wires the route. Needs
// `backend/.venv` (`bash backend/scripts/bootstrap.sh`), and refuses loud if it is missing —
// never a silent fall-back to a PATH interpreter.

import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn, spawnSync } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildS1ViewModelFromIngestHealthProjection,
  collectorRowsFromIngestHealthProjection,
  fetchIngestHealthProjectionViaHttp,
} from "./ingest-health-query.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(THIS_DIR, "../../../../backend");
const PYTHON_BIN = path.join(BACKEND_ROOT, ".venv", "bin", "python3");

function assertPythonAvailable(): void {
  if (!existsSync(PYTHON_BIN)) {
    throw new Error(
      `REFUSAL: ${PYTHON_BIN} does not exist. Run 'bash backend/scripts/bootstrap.sh' (needs ` +
        "network) or reuse an already-built .venv — falling back to a PATH interpreter would " +
        "run ADR-019's falsifier in an environment the repository never declared.",
    );
  }
}

// ── ONE fixture (one run, one gap), built once in Python, reused by every mode ──────────────
//
// `ADR-019/D5`: the fingerprint a mode is compared against is always derived from these SAME
// objects, constructed directly — never read back from the SQLite store, so the expected
// value is never compared against its own reconstruction.
// `view_model_multi_run` carries NO server-side mutation (`apply_mutation` treats it exactly
// like `"original"`) — it only selects a RICHER seed dataset (4 runs across 3 `(source,
// endpoint)` keys, 1 gap) so `T-05.14` rodada 2's G1 test has two runs sharing a key to prove
// "most recent wins" over the REAL route, not just over a CLI fixture.
type MutationMode =
  | "original"
  | "reordered_columns"
  | "extra_run_field"
  | "extra_envelope_field"
  | "view_model_multi_run";

const SERVER_SCRIPT = `
import json
import sys
import threading
import time
from pathlib import Path

import uvicorn

from src.main import create_app
from src.modules.sentimento.domain import ingest_record as ingest_record_module
from src.modules.sentimento.domain.ingest_record import IngestGap, IngestHealthReport, IngestRun
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore


def build_run():
    return IngestRun(
        run_id="run-1", source="binance-futures", endpoint="/fapi/v1/klines", window="w1",
        n_expected=100, n_returned=100, n_written=100, verdict="ACCEPTED", api_code=200,
        src_sha256="a" * 64, weight_used=1, observer_id="observer-0",
        observer_region="sa-east-1", clock_skew_ms=5,
        started_at="2026-08-01T00:00:00Z", ended_at="2026-08-01T00:00:00Z",
    )


def build_gap():
    return IngestGap(
        source="binance-futures", symbol="BTCUSDT",
        series_key_id="binance-futures:BTCUSDT:openInterest",
        from_ts="2026-08-01T00:00:00Z", to_ts="2026-08-01T00:05:00Z", n_missing=5,
        gap_class="MISSING", detected_at="2026-08-01T00:06:00Z",
    )


# T-05.14 rodada 2 (achado 2, QA T-05.14-qa.md): 4 runs, 2 of them sharing the SAME
# (source, endpoint) key at different started_at -- the exact shape
# collectorRowsFromIngestHealthProjection's "most recent wins" needs to have something real
# to disagree about, mirrored from the fixture ADR-019's "Consequencia" said would migrate.
def build_runs_multi():
    return (
        IngestRun(
            run_id="r1", source="binance-futures", endpoint="/fapi/v1/klines", window="w1",
            n_expected=100, n_returned=100, n_written=100, verdict="ACCEPTED", api_code=200,
            src_sha256="a" * 64, weight_used=1, observer_id="observer-0",
            observer_region="sa-east-1", clock_skew_ms=5,
            started_at="2026-08-01T00:00:00Z", ended_at="2026-08-01T00:00:00Z",
        ),
        IngestRun(
            run_id="r2", source="binance-futures", endpoint="/fapi/v1/klines", window="w2",
            n_expected=100, n_returned=95, n_written=95, verdict="ACCEPTED_WITH_WARNING",
            api_code=200, src_sha256="b" * 64, weight_used=1, observer_id="observer-0",
            observer_region="sa-east-1", clock_skew_ms=5,
            started_at="2026-08-02T00:00:00Z", ended_at="2026-08-02T00:00:00Z",
        ),
        IngestRun(
            run_id="r3", source="coinalyze", endpoint="/oi", window="w3",
            n_expected=60, n_returned=60, n_written=60, verdict="ACCEPTED", api_code=200,
            src_sha256="c" * 64, weight_used=1, observer_id="observer-0",
            observer_region="sa-east-1", clock_skew_ms=5,
            started_at="2026-08-01T00:00:00Z", ended_at="2026-08-01T00:00:00Z",
        ),
        IngestRun(
            run_id="r4", source="bybit", endpoint="/public/v5/market/open-interest", window="w4",
            n_expected=50, n_returned=0, n_written=0, verdict="REJECTED", api_code=-1130,
            src_sha256="d" * 64, weight_used=1, observer_id="observer-0",
            observer_region="sa-east-1", clock_skew_ms=5,
            started_at="2026-08-01T00:00:00Z", ended_at="2026-08-01T00:00:00Z",
        ),
    )


def build_gaps_multi():
    return (
        IngestGap(
            source="binance-futures", symbol="MATICUSDT", series_key_id="oi-5m",
            from_ts="2026-08-01T11:45:00Z", to_ts="2026-08-01T12:05:00Z", n_missing=3,
            gap_class="SOURCE_GAP", detected_at="2026-08-01T12:10:00Z",
        ),
    )


def apply_mutation(mode):
    if mode in ("original", "view_model_multi_run"):
        return
    if mode == "reordered_columns":
        # F-D6-1 negative: the ORDER the shared projection iterates moves, so
        # IngestHealthReport.fingerprint() (server side) moves too.
        ingest_record_module.INGEST_HEALTH_RUN_COLUMNS = tuple(
            reversed(ingest_record_module.INGEST_HEALTH_RUN_COLUMNS)
        )
        return
    if mode == "extra_run_field":
        # F-D6-2(i): a 16th key INSIDE a runs[] object — both fingerprint() (via
        # canonical_lines -> _project_run) and to_envelope() read this same function.
        original = ingest_record_module._project_run_dict

        def mutated(run):
            payload = original(run)
            payload["debug_extra_run_field"] = "mutated"
            return payload

        ingest_record_module._project_run_dict = mutated
        return
    if mode == "extra_envelope_field":
        # F-D6-2(ii): a field on the envelope ROOT, never inside runs[]/gaps[] — patches only
        # to_envelope(), never fingerprint()'s own canonical_projection() chain.
        original_to_envelope = ingest_record_module.IngestHealthReport.to_envelope

        def mutated_to_envelope(self):
            envelope = original_to_envelope(self)
            envelope["debug_note"] = "mutated-envelope-root"
            return envelope

        ingest_record_module.IngestHealthReport.to_envelope = mutated_to_envelope
        return
    raise SystemExit(f"unknown mutation mode: {mode}")


def main():
    store_path, mode, action = sys.argv[1], sys.argv[2], sys.argv[3]
    if mode == "view_model_multi_run":
        runs = build_runs_multi()
        gaps = build_gaps_multi()
    else:
        runs = (build_run(),)
        gaps = (build_gap(),)

    apply_mutation(mode)

    if action == "print-fingerprint":
        expected_fingerprint = IngestHealthReport(runs=runs, gaps=gaps).fingerprint()
        print(json.dumps({"fingerprint": expected_fingerprint}), flush=True)
        return

    if action != "serve":
        raise SystemExit(f"unknown action: {action}")

    target = Path(store_path)
    if target.exists():
        target.unlink()
    store = SqliteIngestRecordStore(target)
    store.initialise()
    for run in runs:
        store.record_run(run)
    for gap in gaps:
        store.record_gap(gap)

    # Computed from the SAME "runs"/"gaps" tuples that seeded the store — never read back.
    expected_fingerprint = IngestHealthReport(runs=runs, gaps=gaps).fingerprint()

    app = create_app(target)
    config = uvicorn.Config(app, host="127.0.0.1", port=0, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    while not server.started:
        time.sleep(0.005)
    port = server.servers[0].sockets[0].getsockname()[1]
    print(json.dumps({"port": port, "fingerprint": expected_fingerprint}), flush=True)
    thread.join()


if __name__ == "__main__":
    main()
`;

/** Run the script in `print-fingerprint` mode — no server, no store, just the Python-side
 * reference value for `mode`. Synchronous: the process runs to completion on its own. */
function printFingerprint(mode: MutationMode): string {
  assertPythonAvailable();
  const result = spawnSync(PYTHON_BIN, ["-c", SERVER_SCRIPT, "-", mode, "print-fingerprint"], {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `print-fingerprint (mode=${mode}) failed: ${result.stderr}`);
  const firstLine = result.stdout.trim().split("\n")[0] ?? "";
  return (JSON.parse(firstLine) as { fingerprint: string }).fingerprint;
}

interface ServedFixture {
  readonly port: number;
  readonly fingerprint: string;
}

/** Spawn the script in `serve` mode, wait for its one JSON line on `stdout` (port +
 * Python-side fingerprint), run `body` against it, then always kill the process. */
async function withServedFixture<T>(
  mode: MutationMode,
  tmpDir: string,
  body: (served: ServedFixture) => Promise<T>,
): Promise<T> {
  assertPythonAvailable();
  const storePath = path.join(tmpDir, `${mode}.sqlite3`);
  const child = spawn(PYTHON_BIN, ["-c", SERVER_SCRIPT, storePath, mode, "serve"], {
    cwd: BACKEND_ROOT,
  });

  const served = await new Promise<ServedFixture>((resolve, reject) => {
    let settled = false;
    let stdoutBuffer = "";
    let stderrBuffer = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBuffer += chunk.toString("utf8");
    });
    child.once("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.once("exit", (code) => {
      if (!settled) {
        settled = true;
        reject(new Error(`server process (mode=${mode}) exited early with code ${code}: ${stderrBuffer}`));
      }
    });
    child.stdout.on("data", (chunk: Buffer) => {
      if (settled) {
        return;
      }
      stdoutBuffer += chunk.toString("utf8");
      const newlineIndex = stdoutBuffer.indexOf("\n");
      if (newlineIndex === -1) {
        return;
      }
      settled = true;
      resolve(JSON.parse(stdoutBuffer.slice(0, newlineIndex)) as ServedFixture);
    });
  });

  try {
    return await body(served);
  } finally {
    child.kill();
  }
}

// Async on purpose, unlike the CLI test file's synchronous `withTmpDir`: the body here awaits
// a live server, so the `finally` cleanup has to wait for that promise to settle too — a
// synchronous `try`/`finally` around an unawaited promise would delete `tmpDir` while the
// server is still writing its SQLite file.
async function withTmpDir<T>(run: (tmpDir: string) => Promise<T>): Promise<T> {
  const tmpDir = mkdtempSync(path.join(tmpdir(), "t0514-"));
  try {
    return await run(tmpDir);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── CALA (`F-D6-1` positive) — server real, sem mutação ──────────────────────────────────────

test("CALA F-D6-1: fingerprint TS via HTTP == fingerprint Python sobre o MESMO fixture congelado", async () => {
  await withTmpDir(async (tmpDir) =>
    withServedFixture("original", tmpDir, async ({ port, fingerprint: expectedFingerprint }) => {
      const result = await fetchIngestHealthProjectionViaHttp({
        baseUrl: `http://127.0.0.1:${port}`,
      });

      assert.match(result.fingerprint, /^[0-9a-f]{64}$/);
      assert.equal(result.fingerprint, expectedFingerprint);
      assert.equal(result.projection.runs.length, 1);
      assert.equal(result.projection.gaps.length, 1);
      assert.equal(result.projection.runs[0]?.verdict, "ACCEPTED");
    }),
  );
});

// ── MORDE `F-D6-1` (controle negativo obrigatório) — coluna reordenada no servidor ───────────

test("MORDE F-D6-1: coluna reordenada no servidor move o hash do servidor; TS fica ancorado no original — paridade REPROVA", async () => {
  const originalFingerprint = printFingerprint("original");

  await withTmpDir(async (tmpDir) =>
    withServedFixture(
      "reordered_columns",
      tmpDir,
      async ({ port, fingerprint: mutatedServerFingerprint }) => {
        assert.notEqual(
          mutatedServerFingerprint,
          originalFingerprint,
          "a mutação em si tem de mover o hash do lado Python — senão o teste é vazio",
        );

        const result = await fetchIngestHealthProjectionViaHttp({
          baseUrl: `http://127.0.0.1:${port}`,
        });

        // O parse não quebra (D6.2: projectRun lê por nome) — mas a reconstrução TS usa a
        // ordem que o PRÓPRIO TS declara, então fica igual ao servidor ORIGINAL, e diferente
        // do servidor mutado. Se os dois lados baterem apesar da mutação, DoD-2 está vazio.
        assert.notEqual(result.fingerprint, mutatedServerFingerprint);
        assert.equal(result.fingerprint, originalFingerprint);
      },
    ),
  );
});

// ── MORDE `F-D6-2(i)` — campo extra DENTRO de runs[] move o hash ─────────────────────────────

test("MORDE F-D6-2(i): campo extra dentro de runs[] move o hash do servidor; TS ignora e fica ancorado no original", async () => {
  const originalFingerprint = printFingerprint("original");

  await withTmpDir(async (tmpDir) =>
    withServedFixture(
      "extra_run_field",
      tmpDir,
      async ({ port, fingerprint: mutatedServerFingerprint }) => {
        assert.notEqual(mutatedServerFingerprint, originalFingerprint);

        const result = await fetchIngestHealthProjectionViaHttp({
          baseUrl: `http://127.0.0.1:${port}`,
        });

        // parseIngestHealthEnvelope ignores an unknown key (ADR-019/D2) — the TS
        // reconstruction never sees "debug_extra_run_field", so it stays at the ORIGINAL
        // fingerprint, diverging from the server's mutated one.
        assert.notEqual(result.fingerprint, mutatedServerFingerprint);
        assert.equal(result.fingerprint, originalFingerprint);
      },
    ),
  );
});

// ── CALA `F-D6-2(ii)` — campo extra NO ENVELOPE raiz não afeta nenhum lado ───────────────────

test("CALA F-D6-2(ii): campo extra no envelope raiz (fora de runs[]/gaps[]) NÃO afeta nenhum hash", async () => {
  const originalFingerprint = printFingerprint("original");

  await withTmpDir(async (tmpDir) =>
    withServedFixture(
      "extra_envelope_field",
      tmpDir,
      async ({ port, fingerprint: serverFingerprint }) => {
        // `to_envelope()` foi mutado para acrescentar "debug_note" ao dict de topo, mas
        // `fingerprint()` nunca chama `to_envelope()` — o valor impresso pelo servidor
        // continua igual ao original.
        assert.equal(serverFingerprint, originalFingerprint);

        const result = await fetchIngestHealthProjectionViaHttp({
          baseUrl: `http://127.0.0.1:${port}`,
        });

        assert.equal(result.fingerprint, originalFingerprint);
        assert.equal(result.projection.runs.length, 1);
        assert.equal(result.projection.gaps.length, 1);
      },
    ),
  );
});

// ── G1 (`ADR-019` falsificador) — envelope real vira `S1ViewModel` MONTADO, não só projeção ──
// `T-05.14` rodada 2, achado 2 do QA (`T-05.14-qa.md`): `buildS1ViewModelFromIngestHealthProjection`
// / `collectorRowsFromIngestHealthProjection` nunca tinham sido chamados sobre o resultado de
// `fetchIngestHealthProjectionViaHttp` — só `projection`/`fingerprint` eram verificados.

test("CALA G1: fetchIngestHealthProjectionViaHttp -> S1ViewModel completo, sobre a rota real (4 runs, 3 series, PARADO primeiro)", async () => {
  await withTmpDir(async (tmpDir) =>
    withServedFixture("view_model_multi_run", tmpDir, async ({ port }) => {
      const result = await fetchIngestHealthProjectionViaHttp({
        baseUrl: `http://127.0.0.1:${port}`,
      });

      assert.equal(result.projection.runs.length, 4);
      assert.equal(result.projection.gaps.length, 1);

      const rows = collectorRowsFromIngestHealthProjection(result.projection);
      assert.equal(rows.length, 3, "4 runs, 2 deles compartilham chave -> 3 series");

      const bySeries = new Map(rows.map((row) => [row.series, row]));
      // r1 (2026-08-01, ACCEPTED) e r2 (2026-08-02, ACCEPTED_WITH_WARNING) compartilham
      // (binance-futures, /fapi/v1/klines) — r2, o mais recente, tem de vencer.
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

      const viewModel = buildS1ViewModelFromIngestHealthProjection(result.projection, 0, [], []);
      assert.equal(viewModel.rows.length, 3);
      assert.equal(viewModel.rows[0]?.statusCell.status, "PARADO", "D17: PARADO ordena primeiro");
    }),
  );
});

test("CALA D7.12: janela_de_perda esta presente e null na projecao real — F0 nunca inventa a formula", async () => {
  await withTmpDir(async (tmpDir) =>
    withServedFixture("view_model_multi_run", tmpDir, async ({ port }) => {
      const result = await fetchIngestHealthProjectionViaHttp({
        baseUrl: `http://127.0.0.1:${port}`,
      });
      assert.equal(result.projection.runs.length, 4);
      for (const run of result.projection.runs) {
        assert.equal(run.janela_de_perda, null);
      }
    }),
  );
});

// ── `D5.14` MORDE(i) — servidor ausente ⇒ reprova, nunca engole o erro em silêncio ──────────
// `T-05.14` rodada 2, achado 1 do QA: o comportamento já estava correto (ataque manual do QA
// confirmou), mas nenhum teste VERSIONADO provava. `docs/plans/.../05_fatia_visivel.md:225`:
// "Se o teste novo passar com o servidor no chão, o item novo repetiu o defeito que ele existe
// para consertar" — os dois testes abaixo são os dois jeitos de "servidor no chão".

function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createTcpServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (address === null || typeof address === "string") {
        probe.close(() => reject(new Error("unexpected address shape from a TCP probe socket")));
        return;
      }
      const port = address.port;
      probe.close(() => resolve(port));
    });
  });
}

test("MORDE D5.14(i): porta sem listener nenhum ⇒ fetchIngestHealthProjectionViaHttp REJEITA", async () => {
  // A porta é reservada e IMEDIATAMENTE liberada — nada volta a escutar nela dentro da vida
  // deste teste, então o `fetch` seguinte encontra `ECONNREFUSED`, nunca um servidor real.
  const port = await reservePort();
  await assert.rejects(() =>
    fetchIngestHealthProjectionViaHttp({ baseUrl: `http://127.0.0.1:${port}` }),
  );
});

test("MORDE D5.14(i): servidor cai NO MEIO do fetch ⇒ a promise REJEITA, nunca resolve com corpo parcial/vazio", async () => {
  const server = createHttpServer((_request, response) => {
    // Nunca termina a resposta — o handler só manda o cabeçalho e prende a conexão aberta até
    // o teste matar o processo/servidor no meio, simulando o servidor caindo durante o fetch.
    response.flushHeaders();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("unexpected address shape from the http test server");
  }
  const port = address.port;
  let closed = false;
  const closeServerOnce = (): Promise<void> =>
    new Promise((resolve) => {
      if (closed) {
        resolve();
        return;
      }
      closed = true;
      server.closeAllConnections();
      server.close(() => resolve());
    });

  try {
    const fetchPromise = fetchIngestHealthProjectionViaHttp({
      baseUrl: `http://127.0.0.1:${port}`,
    });
    // Deixa o `fetch` sair de verdade antes de derrubar o servidor no meio da conexão aberta.
    await new Promise((resolve) => setTimeout(resolve, 200));
    await closeServerOnce();

    await assert.rejects(() => fetchPromise);
  } finally {
    await closeServerOnce();
  }
});
