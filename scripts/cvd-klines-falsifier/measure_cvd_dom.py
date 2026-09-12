"""`DoD-3`/item 3 do `DoD-VERTICAL`: o `CvdPane` com `N >= 30` pontos, medido NO DOM.

`T-02.6`, fase `02` de `SPEC-007`. Irmão de `measure_cvd_vertical.py` — aquele fecha o MECANISMO
de `DoD 1`/`DoD 2`/`DoD 4` (banco → leitor → relatório); este leva o mesmo dado real até o
BROWSER, porque `D2` recusou o DoD só-de-API com número:

    a fase 02 de `pagina-de-grafico-s2` passou SQL+HTTP verdes e o dado não chegava na tela;
    quem achou o defeito de wiring foi a fase 04, em uso ao vivo pelo owner.

A pilha que ele sobe é a de PRODUÇÃO, componente por componente, sem mock em lugar nenhum:

    /fapi/v1/klines (real)  ->  build_klines_to_rows (mapeamento real)
                            ->  PostgresSeriesSink (sink real, TimescaleDB real)
                            ->  src.main (a MESMA FastAPI que o deploy roda, engine postgres)
                            ->  next build + next start (o MESMO app)
                            ->  Playwright -> e2e/10-cvd-dado-real.spec.ts  (o DOM)

⛔ O QUE ELE NÃO É, e a distinção importa para quem for citar o número: **não é a medição de
produção**. O Postgres é um contêiner descartável que este script cria e destrói — o mesmo idioma
de `test_postgres_series_window_reader.py` e de `measure_cvd_vertical.py` —, deliberadamente,
porque semear o Postgres COMPARTILHADO é proibido (`[P-seed]`, `D2`: "dado sintético já vazou para
a tela do owner uma vez") e porque uma worktree não pode virar o project directory da stack do
owner (o defeito que `gates/T-01.10-infra.md` registra). A leitura de PRODUÇÃO é de `T-02.7`, que
publica o deploy e mede depois de ~30 min de coleta ao vivo.

⚠️ E O DADO É REAL. São klines de verdade, buscados agora, publicados na CADÊNCIA AO VIVO (um bar
por ciclo, `bucket_end + 58 s`, a latência medida deste endpoint `[MEDIDO 2026-09-10, T-01.3]`) —
nada aqui é sintético, então um zero no fim seria um zero de verdade. O que o script NÃO faz é
backfill de boot: `available_at` viraria "quando buscamos" e `R-1` (anti-lookahead, e está
CORRETA) recusaria cada bucket no seu próprio instante de grade — `769` legíveis em `5.761` grades
`[MEDIDO 2026-09-11, handoff/ACHADO-BACKFILL-INVISIVEL-AO-AS-OF.md]`. Esse conserto é `D15`/`D17`,
fora desta fase.

Uso:

    backend/.venv/bin/python scripts/cvd-klines-falsifier/measure_cvd_dom.py

`rc` é o do Playwright — é ele que decide o veredito, e o teardown roda de qualquer jeito.
"""

from __future__ import annotations

import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "backend"))

import psycopg  # noqa: E402

from src.modules.sentimento.infra.postgres_ingest_record_store import (  # noqa: E402
    PostgresIngestRecordStore,
)
from src.modules.sentimento.infra.binance_klines_client import BinanceKlinesClient  # noqa: E402
from src.modules.sentimento.infra.postgres_series_sink import (  # noqa: E402
    PostgresSeriesSink,
    ensure_schema,
)
from src.modules.sentimento.use_cases.collector_series_mapping import (  # noqa: E402
    INITIAL_SYMBOLS,
    build_klines_to_rows,
)

IMAGE = "timescale/timescaledb:2.17.2-pg15"
TAIL_BARS = 300
# A latência de publicação medida de `/fapi/v1/klines` `[MEDIDO 2026-09-10, T-01.3]`: o elemento
# mais novo da página é o minuto em curso, ~58 s atrás do relógio de parede.
PUBLICATION_LAG_MS = 58_000
SPEC = "e2e/10-cvd-dado-real.spec.ts"
BACKEND = REPO_ROOT / "backend"
FRONTEND = REPO_ROOT / "frontend"
API_PREFIX = "/api/v1"


def _docker(*args: str) -> subprocess.CompletedProcess[str]:
    """Run one `docker` subcommand, capturing output."""
    return subprocess.run(["docker", *args], capture_output=True, text=True, timeout=180)  # noqa: S603, S607


def _free_port() -> int:
    """Ask the kernel for an ephemeral port and hand back the number it picked."""
    import socket

    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def _start_postgres() -> tuple[str, str, int]:
    """Start a throwaway TimescaleDB and return `(container_name, conninfo, host_port)`."""
    name = f"cvd-dom-{uuid.uuid4().hex[:8]}"
    started = _docker(
        "run", "-d", "--rm", "--name", name,
        "-e", "POSTGRES_PASSWORD=test", "-e", "POSTGRES_USER=test", "-e", "POSTGRES_DB=test",
        "-p", "127.0.0.1::5432", IMAGE,
    )  # fmt: skip
    if started.returncode != 0:
        raise RuntimeError(f"could not start {IMAGE}: {started.stderr.strip()}")
    host_port = int(_docker("port", name, "5432/tcp").stdout.strip().rsplit(":", maxsplit=1)[-1])
    conninfo = f"host=127.0.0.1 port={host_port} dbname=test user=test password=test"
    deadline = time.monotonic() + 90.0
    while True:
        try:
            psycopg.connect(conninfo, connect_timeout=3).close()
            return name, conninfo, host_port
        except psycopg.Error:
            if time.monotonic() > deadline:
                raise
            time.sleep(0.5)


def _publish_live_cadence(conninfo: str) -> int:
    """Write the last `TAIL_BARS` real klines of every pilot symbol, one publication per bar.

    Returns the number of rows written — `DoD-4`'s own `n_written`, in the same shape
    `measure_cvd_vertical.py` reports it. TWO rows per closed bar (`klines_volume` and
    `cvd_source`/`kline_takerbuy`), because they are two readings OF THE SAME observation off one
    12-field array — which is the capability this whole phase exists to demonstrate.
    """
    connection = psycopg.connect(conninfo)
    ensure_schema(connection)
    # The API composes `PostgresIngestRecordStore` too (`INGEST_RECORD_BACKEND=postgres`), and it
    # does NOT create its own tables at composition time — `/ready` would answer with an error
    # about a missing relation instead of about the store. Idempotent, by its own docstring.
    PostgresIngestRecordStore(connection).initialise()
    sink = PostgresSeriesSink(connection)
    to_rows = build_klines_to_rows()
    client = BinanceKlinesClient()
    written = 0
    for symbol in sorted(INITIAL_SYMBOLS):
        page = client.klines(symbol, "1m", TAIL_BARS)
        for kline in page.rows:
            received_at = kline.close_time_ms + PUBLICATION_LAG_MS
            for row in to_rows(received_at, symbol, (kline,)):
                sink.accept(row)
                written += 1
        print(f"{symbol}: {len(page.rows)} bars published at the live cadence", flush=True)
    return written


def _wait_for_http(url: str, timeout_s: float, what: str) -> None:
    """Block until `url` answers ANY HTTP status, or give up loudly.

    Any status counts as "up" on purpose: `/ready` answers `503` while a dependency is still
    warming, and treating that as "not up" would hide the process being alive and answering.
    """
    deadline = time.monotonic() + timeout_s
    last = ""
    while time.monotonic() < deadline:
        try:
            urllib.request.urlopen(url, timeout=3)  # noqa: S310
            return
        except urllib.error.HTTPError:
            return
        except Exception as exc:  # noqa: BLE001 - retried until the deadline, then re-raised below
            last = str(exc)
            time.sleep(0.4)
    raise RuntimeError(f"{what} did not answer {url} within {timeout_s}s ({last})")


def main() -> int:
    """Bring the whole vertical up on real data, run the DOM spec against it, tear it all down."""
    state_dir = Path(tempfile.mkdtemp(prefix="cvd-dom-e2e."))
    container = ""
    api: subprocess.Popen[bytes] | None = None
    nextjs: subprocess.Popen[bytes] | None = None
    try:
        container, conninfo, pg_port = _start_postgres()
        written = _publish_live_cadence(conninfo)
        print(f"n_written = {written}", flush=True)

        api_port = _free_port()
        next_port = _free_port()
        api_base_url = f"http://127.0.0.1:{api_port}"

        api_env = {
            **os.environ,
            "INGEST_RECORD_BACKEND": "postgres",
            "POSTGRES_HOST": "127.0.0.1",
            "POSTGRES_PORT": str(pg_port),
            "POSTGRES_DB": "test",
            "POSTGRES_USER": "test",
            "POSTGRES_PASSWORD": "test",
            "QUARANTINE_STORE_PATH": str(state_dir / "series_quarantine.sqlite3"),
            "APP_PORT": str(api_port),
            "API_PREFIX": API_PREFIX,
        }
        api_log = (state_dir / "api.log").open("wb")
        api = subprocess.Popen(  # noqa: S603
            [str(BACKEND / ".venv/bin/python"), "-m", "src.main"],
            cwd=BACKEND, env=api_env, stdout=api_log, stderr=subprocess.STDOUT,
        )  # fmt: skip
        _wait_for_http(f"{api_base_url}{API_PREFIX}/ready", 60.0, "API")

        # `next build` then `next start`, with the SAME `INGEST_HEALTH_API_BASE_URL` the spec is
        # given as `E2E_SENTIMENTO_API_BASE_URL` — one origin, declared once. Two origins is the
        # `BLOCKER-2` of wave `03`: the page read one API and the test read another, and the two
        # sides could never agree (916 against 0).
        build_env = {**os.environ, "INGEST_HEALTH_API_BASE_URL": api_base_url}
        build_log = (state_dir / "next-build.log").open("wb")
        build = subprocess.run(  # noqa: S603
            [str(FRONTEND / "node_modules/.bin/next"), "build"],
            cwd=FRONTEND, env=build_env, stdout=build_log, stderr=subprocess.STDOUT, timeout=900,
        )  # fmt: skip
        if build.returncode != 0:
            print(f"RECUSA: next build falhou — ver {state_dir}/next-build.log", file=sys.stderr)
            return 3
        next_log = (state_dir / "next.log").open("wb")
        nextjs = subprocess.Popen(  # noqa: S603
            [str(FRONTEND / "node_modules/.bin/next"), "start", "-p", str(next_port)],
            cwd=FRONTEND, env=build_env, stdout=next_log, stderr=subprocess.STDOUT,
        )  # fmt: skip
        _wait_for_http(f"http://127.0.0.1:{next_port}/", 90.0, "next start")

        spec_env = {
            **os.environ,
            "E2E_BASE_URL": f"http://127.0.0.1:{next_port}",
            "E2E_SENTIMENTO_API_BASE_URL": f"{api_base_url}{API_PREFIX}",
            "E2E_FACTS_FILE": str(state_dir / "facts.jsonl"),
        }
        played = subprocess.run(  # noqa: S603
            [str(FRONTEND / "node_modules/.bin/playwright"), "test",
             "--config=playwright.config.ts", SPEC.removeprefix("e2e/")],
            cwd=FRONTEND, env=spec_env,
        )  # fmt: skip
        print(f"state dir (logs e facts): {state_dir}", flush=True)
        return played.returncode
    finally:
        for process in (nextjs, api):
            if process is not None and process.poll() is None:
                process.send_signal(signal.SIGTERM)
                try:
                    process.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    process.kill()
        if container:
            _docker("rm", "-f", container)
        # The state dir is kept ONLY when something failed, so a green run leaves nothing behind
        # and a red one leaves every log the reader needs.
        if os.environ.get("CVD_DOM_KEEP_STATE") is None and state_dir.exists():
            shutil.rmtree(state_dir, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
