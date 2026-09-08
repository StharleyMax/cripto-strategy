"""`create_app` wires `PostgresSeriesWindowReader` — `T-04.1`, `ADR-034/D9` item 1, `CST-190`.

`ADR-034/D9`'s own falsifier fired for real: `01`/`02`'s tests only ever call
`app.dependency_overrides[get_series_window_reader_source] = <fake>` directly on a test
instance, never through `create_app`'s own composition — so `GET /series-history` had been
`500`/`NotImplementedError` against the REAL, composed app since F1 shipped, invisible to every
gate until the owner opened `/symbol` in a browser (`docs/context/pagina-de-grafico-s2/handoff/
T-04.md`). These two tests are this fase's falsifier: one CALA (`sqlite` backend, no docker,
proves the conditional wiring leaves the pre-existing stub alone), one MORDE (`postgres`
backend, a real ephemeral TimescaleDB, `GET /series-history` served over a real loopback
socket by the REAL composed `app` — not a fixture, not a direct `dependency_overrides` write).

Same throwaway-container idiom `test_create_app_selects_ingest_record_backend.py` and
`test_postgres_series_window_reader.py` already use — skipped, not failed, absent `docker`.
"""

from __future__ import annotations

import http.client
import json
import shutil
import subprocess
import threading
import time
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import psycopg
import pytest
import uvicorn
from fastapi import FastAPI

from src.api.dependencies import get_series_window_reader_source
from src.main import create_app
from src.modules.sentimento.domain.provenance import (
    UNKNOWN_OBSERVER_REGION,
    AvailabilitySource,
    Provenance,
    SeriesRow,
)
from src.modules.sentimento.infra.postgres_ingest_record_store import PostgresIngestRecordStore
from src.modules.sentimento.infra.postgres_series_sink import PostgresSeriesSink, ensure_schema
from src.modules.sentimento.use_cases.series_catalog import list_series_catalog

_STARTUP_POLL_S = 0.005
_JOIN_TIMEOUT_S = 5.0

# The real `klines_last` row `T-04.2` now assigns `price_use="structure_detection"` to — the
# SAME catalog `create_app` wires by default (`list_series_catalog()`), so its `series_key_id`
# is stable across the suite as long as neither task's fifteen terms change.
_KLINES_LAST_ENTRY = next(
    entry for entry in list_series_catalog().entries if entry.key.metric == "klines_last"
)
_SERIES_KEY_ID = _KLINES_LAST_ENTRY.key.series_key_id()
_SYMBOL = "BTCUSDT"
_BUCKET_END_MS = 1_757_339_400_000
_GRID_MS = 60_000


def test_sqlite_backend_leaves_series_window_reader_unwired(tmp_path: Path) -> None:
    """CALA: `sqlite` (`md.series` has no fallback for it) — the pre-`T-04.1` stub stays.

    Proves the conditional wiring in `create_app` (only for the `postgres` engine) does not
    regress the default, `docker`-free path every other `create_app(store_path=...)` test in
    `backend/tests/api/` already relies on.
    """
    app = create_app(store_path=tmp_path / "ih.sqlite3")

    assert get_series_window_reader_source not in app.dependency_overrides
    with pytest.raises(NotImplementedError, match="get_series_window_reader_source"):
        get_series_window_reader_source()


# ── MORDE — a real, ephemeral TimescaleDB, over the wire ─────────────────────────────────────

_IMAGE = "timescale/timescaledb:2.17.2-pg15"
_CONTAINER_NAME_PREFIX = "t-04-1-create-app-window-reader-"
_READY_TIMEOUT_S = 30.0
_POSTGRES_USER = "series_reader"
_POSTGRES_DB = "series_history_test"
_POSTGRES_PASSWORD = "do-not-leak-me"  # noqa: S105 - throwaway container password, not a secret

_skip_without_docker = pytest.mark.skipif(
    shutil.which("docker") is None, reason="docker not on PATH — see module docstring"
)


def _run_docker(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(  # noqa: S603 — argv is a literal list, never shell-interpolated
        ["docker", *args], capture_output=True, text=True, timeout=60
    )


def _wait_until_ready(conninfo: str) -> psycopg.Connection:
    deadline = time.monotonic() + _READY_TIMEOUT_S
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            return psycopg.connect(conninfo)
        except psycopg.OperationalError as error:
            last_error = error
            time.sleep(0.5)
    raise TimeoutError(f"postgres did not become ready within {_READY_TIMEOUT_S}s") from last_error


@pytest.fixture
def _postgres_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Start a throwaway TimescaleDB, seed `md.series`, point env at it.

    Seeds one real `klines_last` row, then sets `INGEST_RECORD_BACKEND=postgres` (and every
    `POSTGRES_*` var) at it — the SAME shape `create_app()`'s module-level `app` resolves in
    production (`deploy/compose.yml`'s `api` service, `[MEDIDO 2026-09-08]`:
    `INGEST_RECORD_BACKEND=postgres` there).
    """
    name = f"{_CONTAINER_NAME_PREFIX}{uuid.uuid4().hex[:8]}"
    started = _run_docker(
        "run",
        "-d",
        "--rm",
        "--name",
        name,
        "-e",
        f"POSTGRES_PASSWORD={_POSTGRES_PASSWORD}",
        "-e",
        f"POSTGRES_USER={_POSTGRES_USER}",
        "-e",
        f"POSTGRES_DB={_POSTGRES_DB}",
        "-p",
        "127.0.0.1::5432",
        _IMAGE,
    )
    if started.returncode != 0:
        pytest.skip(f"could not start {_IMAGE}: {started.stderr.strip()}")
    try:
        port_output = _run_docker("port", name, "5432/tcp")
        host_port = port_output.stdout.strip().rsplit(":", maxsplit=1)[-1]
        conninfo = (
            f"host=127.0.0.1 port={host_port} dbname={_POSTGRES_DB} user={_POSTGRES_USER} "
            f"password={_POSTGRES_PASSWORD}"
        )
        connection = _wait_until_ready(conninfo)
        try:
            PostgresIngestRecordStore(connection).initialise()
            ensure_schema(connection)
            PostgresSeriesSink(connection).accept(
                SeriesRow(
                    series_key_id=_SERIES_KEY_ID,
                    symbol=_SYMBOL,
                    source="binance",
                    bucket_end=_BUCKET_END_MS,
                    event_time=_BUCKET_END_MS,
                    available_at=_BUCKET_END_MS,
                    availability_source=AvailabilitySource.OBSERVED,
                    ingested_at=_BUCKET_END_MS,
                    observed_at=_BUCKET_END_MS,
                    provenance=Provenance.OBSERVED,
                    src_label_raw="klines",
                    observer_id="vps-01",
                    observer_region=UNKNOWN_OBSERVER_REGION,
                    is_final=True,
                    value_raw="65432.10",
                )
            )
        finally:
            connection.close()

        monkeypatch.setenv("INGEST_RECORD_BACKEND", "postgres")
        monkeypatch.setenv("POSTGRES_HOST", "127.0.0.1")
        monkeypatch.setenv("POSTGRES_PORT", host_port)
        monkeypatch.setenv("POSTGRES_DB", _POSTGRES_DB)
        monkeypatch.setenv("POSTGRES_USER", _POSTGRES_USER)
        monkeypatch.setenv("POSTGRES_PASSWORD", _POSTGRES_PASSWORD)
        yield
    finally:
        _run_docker("rm", "-f", "-v", name)


@contextmanager
def _served(app: FastAPI) -> Iterator[int]:
    """Run `app` on a real loopback socket, in-thread, and yield the port it bound."""
    config = uvicorn.Config(app, host="127.0.0.1", port=0, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    while not server.started:
        time.sleep(_STARTUP_POLL_S)
    port = server.servers[0].sockets[0].getsockname()[1]
    try:
        yield port
    finally:
        server.should_exit = True
        thread.join(timeout=_JOIN_TIMEOUT_S)


def _get_series_history(port: int) -> tuple[int, dict[str, object]]:
    query = (
        f"series_key_id={_SERIES_KEY_ID}&symbol={_SYMBOL}&interval=1m"
        f"&window_start_ms={_BUCKET_END_MS}&window_end_ms={_BUCKET_END_MS}"
        f"&knowledge_time_ms={_BUCKET_END_MS + 100_000}&bar_policy=final_only"
    )
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    connection.request("GET", f"/api/v1/series-history?{query}")
    response = connection.getresponse()
    body = json.loads(response.read())
    connection.close()
    return response.status, body


@_skip_without_docker
def test_postgres_backend_wires_a_real_reader_and_series_history_answers_200(
    _postgres_env: None,
) -> None:
    """`CA-F4-1`'s falsifier: the REAL composed `app`, over a real socket, never `500`.

    This is exactly the gap `ADR-034/D9` named and `01`/`02` missed: `create_app()` here is
    called with NO explicit `store_path` and NO manual `dependency_overrides` write — the same
    shape the module-level `app` in `src.main` uses. A regression that removes `T-04.1`'s wiring
    turns this back into `500`/`NotImplementedError`, not a fixture staying green.
    """
    app = create_app()

    assert get_series_window_reader_source in app.dependency_overrides
    with _served(app) as port:
        status, body = _get_series_history(port)

    assert status == 200, body
    rows = body["rows"]
    assert isinstance(rows, list)
    assert len(rows) >= 1
    assert rows[0]["value"] == "65432.10"
    assert rows[0]["absence"] is None
