"""`create_app` selects `md.ingest_run`/`md.ingest_gap`'s engine by `INGEST_RECORD_BACKEND`.

`T-02.6`/`D2.7`: `src.main` composes through `compose_ingest_record_store` (`T-02.4`) — the SAME
function `collectors_cli`/`single_writer_cli` call — the moment `create_app` is invoked with no
explicit `store_path` (the shape the module-level `app = create_app(...)` below always uses).
Four falsifiers, in ascending realism:

- `test_an_unknown_backend_refuses_at_the_python_level` — CALA/MORDE with no process boundary:
  `INGEST_RECORD_BACKEND=foo` raises, naming the variable, before any socket is touched.
- `test_an_unreachable_postgres_refuses_at_the_python_level` — same shape, one stage deeper: a
  closed loopback port (never blocks on a timeout, unlike a black-holed address) proves the ONE
  `connect` attempt (no retry) surfaces `IngestRecordStoreConnectionError` naming `POSTGRES_HOST`.
- `test_running_the_process_exits_non_zero_and_names_the_variable_for_an_unknown_backend` — the
  DoD's literal command at the OTHER end: a real `python -m src.main` subprocess, `rc != 0`,
  stderr names `INGEST_RECORD_BACKEND` — mirrors
  `test_create_app_refuses_missing_store_parent.py`'s subprocess test for the sqlite-only check.
- `test_ready_reports_a_masked_dsn_and_true_schema_present_over_a_real_postgres` (skipped absent
  `docker`) — the DoD's OTHER literal command, positive case: `INGEST_RECORD_BACKEND=postgres`
  against a REAL, already-initialised `timescale/timescaledb` container, served over a REAL
  loopback socket, `GET /api/v1/ready` -> `schema_present: true` and a `path` that is the exact
  `postgresql://<user>@<host>:<port>/<db>` `SPEC-004` §3.5 fixes, the password NOWHERE in it —
  `user`/`db`/`password` are three DIFFERENT strings below specifically so a leaked password
  could not hide behind a coincidental match on the user or database name.
"""

from __future__ import annotations

import http.client
import json
import os
import shutil
import socket
import subprocess
import sys
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

from src.main import create_app
from src.modules.sentimento.infra.ingest_record_store_composition import (
    IngestRecordStoreConfigurationError,
    IngestRecordStoreConnectionError,
)
from src.modules.sentimento.infra.postgres_ingest_record_store import PostgresIngestRecordStore

BACKEND_ROOT = Path(__file__).resolve().parents[2]
BOOT_DEADLINE_S = 5.0
_STARTUP_POLL_S = 0.005
_JOIN_TIMEOUT_S = 5.0


def _closed_loopback_port() -> int:
    """Return a `127.0.0.1` port nothing listens on — refuses immediately, never times out.

    Same trick `test_collectors_cli_boot.py` uses for the identical reason: an unreachable
    address that blocks would race `BOOT_DEADLINE_S` instead of falsifying it.
    """
    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    probe.bind(("127.0.0.1", 0))
    port = int(probe.getsockname()[1])
    probe.close()
    return port


# ── CALA/MORDE at the Python level — no process boundary ─────────────────────────────────────


def test_an_unknown_backend_refuses_at_the_python_level(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`INGEST_RECORD_BACKEND=foo` -> `create_app()` raises, naming the variable."""
    monkeypatch.setenv("INGEST_RECORD_BACKEND", "foo")

    with pytest.raises(IngestRecordStoreConfigurationError) as excinfo:
        create_app()

    assert excinfo.value.variable == "INGEST_RECORD_BACKEND"
    assert "INGEST_RECORD_BACKEND" in str(excinfo.value)


def test_an_unreachable_postgres_refuses_at_the_python_level(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`postgres` + a closed port -> `create_app()` raises, naming `POSTGRES_HOST`, no retry."""
    monkeypatch.setenv("INGEST_RECORD_BACKEND", "postgres")
    monkeypatch.setenv("POSTGRES_HOST", "127.0.0.1")
    monkeypatch.setenv("POSTGRES_PORT", str(_closed_loopback_port()))
    monkeypatch.setenv("POSTGRES_DB", "test")
    monkeypatch.setenv("POSTGRES_USER", "test")
    monkeypatch.setenv("POSTGRES_PASSWORD", "test")

    with pytest.raises(IngestRecordStoreConnectionError) as excinfo:
        create_app()

    assert excinfo.value.variable == "POSTGRES_HOST"
    assert "POSTGRES_HOST" in str(excinfo.value)


# ── THE DoD's LITERAL COMMAND — a real subprocess, `rc != 0` inside `BOOT_DEADLINE_S` ────────


def test_running_the_process_exits_non_zero_and_names_the_variable_for_an_unknown_backend() -> None:
    """`python -m src.main` with `INGEST_RECORD_BACKEND=foo` -> `rc != 0`, stderr names it.

    The module-level `app = create_app(...)` raises during `from src.main import app` inside
    `__main__.py` (`src/main/__main__.py`'s own docstring), so the process never reaches
    `uvicorn.run` and exits with Python's default non-zero code for an uncaught exception —
    same shape `test_create_app_refuses_missing_store_parent.py` proves for the sqlite-only
    parent-directory check, one composition-root layer up (`T-02.4`'s shared function).
    """
    environment = {**os.environ, "INGEST_RECORD_BACKEND": "foo"}
    started = time.monotonic()

    completed = subprocess.run(
        [sys.executable, "-m", "src.main"],
        cwd=BACKEND_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        timeout=BOOT_DEADLINE_S,
    )

    elapsed = time.monotonic() - started
    assert elapsed <= BOOT_DEADLINE_S, f"boot took {elapsed:.2f}s, over the {BOOT_DEADLINE_S}s cap"
    assert completed.returncode != 0, "INGEST_RECORD_BACKEND=foo must not boot successfully"
    output = completed.stdout + completed.stderr
    assert "INGEST_RECORD_BACKEND" in output, f"failure must name the variable; got: {output!r}"


# ── THE DoD's OTHER LITERAL COMMAND — a real, already-initialised Postgres, over the wire ────

_IMAGE = "timescale/timescaledb:2.17.2-pg15"
_CONTAINER_NAME_PREFIX = "t-02-6-src-main-postgres-test-"
_READY_TIMEOUT_S = 30.0
# Three DIFFERENT strings on purpose: a password that happens to equal the user or database
# name would let a leak hide behind a coincidental substring match in the assertions below.
_POSTGRES_USER = "ingest_reader"
_POSTGRES_DB = "ingest_health_test"
_POSTGRES_PASSWORD = "do-not-leak-me"  # noqa: S105 - a throwaway container's password, not a secret

_skip_without_docker = pytest.mark.skipif(
    shutil.which("docker") is None, reason="docker not on PATH — see module docstring"
)


def _run_docker(*args: str) -> subprocess.CompletedProcess[str]:
    """Run one `docker` subcommand, capturing output for the caller to inspect on failure."""
    return subprocess.run(  # noqa: S603 — argv is a literal list, never shell-interpolated
        ["docker", *args], capture_output=True, text=True, timeout=60
    )


def _wait_until_ready(conninfo: str) -> psycopg.Connection:
    """Poll for the container to accept connections, refusing after `_READY_TIMEOUT_S`."""
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
def _postgres_host_port() -> Iterator[int]:
    """Start a throwaway, ALREADY-INITIALISED `timescale/timescaledb` container; yield its port.

    Initialising the schema here (via a direct `psycopg` connection) simulates what a collector
    (`T-02.4`) would already have done in production BEFORE the API ever answers `/ready` — this
    fixture proves `src.main`'s OWN composition, never the schema creation `T-02.6` does not own.
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
        host_port = int(port_output.stdout.strip().rsplit(":", maxsplit=1)[-1])
        conninfo = (
            f"host=127.0.0.1 port={host_port} dbname={_POSTGRES_DB} user={_POSTGRES_USER} "
            f"password={_POSTGRES_PASSWORD}"
        )
        connection = _wait_until_ready(conninfo)
        try:
            PostgresIngestRecordStore(connection).initialise()
        finally:
            connection.close()
        yield host_port
    finally:
        _run_docker("rm", "-f", "-v", name)


@contextmanager
def _served(app: FastAPI) -> Iterator[int]:
    """Run `app` on a real loopback socket, in-thread, and yield the port it bound.

    Same technique as `test_ready_route.py`'s `_served` — duplicated, not shared, matching that
    file's own precedent (no shared helper exists for it yet).
    """
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


def _get_ready(port: int) -> tuple[int, dict[str, object]]:
    """`GET /api/v1/ready`, returning `(status, parsed body)`."""
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    connection.request("GET", "/api/v1/ready")
    response = connection.getresponse()
    body = json.loads(response.read())
    connection.close()
    return response.status, body


@_skip_without_docker
def test_ready_reports_a_masked_dsn_and_true_schema_present_over_a_real_postgres(
    _postgres_host_port: int, monkeypatch: pytest.MonkeyPatch
) -> None:
    """`D2.7`'s literal command: `schema_present -> true`, `path` never carries the password."""
    monkeypatch.setenv("INGEST_RECORD_BACKEND", "postgres")
    monkeypatch.setenv("POSTGRES_HOST", "127.0.0.1")
    monkeypatch.setenv("POSTGRES_PORT", str(_postgres_host_port))
    monkeypatch.setenv("POSTGRES_DB", _POSTGRES_DB)
    monkeypatch.setenv("POSTGRES_USER", _POSTGRES_USER)
    monkeypatch.setenv("POSTGRES_PASSWORD", _POSTGRES_PASSWORD)

    with _served(create_app()) as port:
        status, body = _get_ready(port)

    assert status == 200
    store = body["store"]
    assert isinstance(store, dict)
    assert store["exists"] is True
    assert store["schema_present"] is True
    expected_path = f"postgresql://{_POSTGRES_USER}@127.0.0.1:{_postgres_host_port}/{_POSTGRES_DB}"
    assert store["path"] == expected_path
    assert _POSTGRES_PASSWORD not in str(store["path"])
