"""`T-02.8`/`D2.8`: the collector and `GET /collector-status` read the SAME Postgres, for real.

`ADR-031/F2`'s falsifier: "n_rows nao cresce" — the property this test proves is that TWO
different composition roots (`collectors_cli`, `src.main`'s `create_app`), each opening its OWN
connection, land on and read back the SAME external `md.ingest_run` state. Neither side is ever
handed the other's Python object; the only thing they share is the database `_postgres`
creates on the session's shared `timescale/timescaledb` container. This is `T-02.4`
(composition) + `T-02.6` (`create_app` selects by env) + `T-01.6` (the mapping that gives
`collectors_cli` its two distinct `(source, endpoint)` pairs) wired together for the first time.

`test_collector_status_reports_at_least_two_rows_over_a_real_shared_postgres` is the DoD's literal
positive case (skipped absent `docker`): after ONE `!forceOrder@arr` SESSION closes and ONE
`premiumIndex` CYCLE completes — both against the shared container, via the real
`collectors_cli.run()` composition — `GET /api/v1/collector-status` answers `n_rows >= 2`
(`FORCE_ORDER_ENDPOINT` and `PREMIUM_INDEX_ENDPOINT` each become their own `(source, endpoint)`
row, `collector_run_mapping.py`).

`test_collector_status_reports_zero_rows_over_an_unrelated_sqlite_store` is the DoD's MORDE,
executable without docker: an API wired to a store the collector never touched (here, an empty
`sqlite` file — the exact backend named in the DoD's "API em sqlite" clause) answers `n_rows ==
0`, never inheriting rows from a different engine or a different database.
"""

from __future__ import annotations

import http.client
import json
import os
import signal
import subprocess
import sys
import threading
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path

import psycopg
import pytest
import uvicorn
from fastapi import FastAPI

from src.main import create_app
from src.modules.sentimento.domain.ingest_record import IngestRun
from src.modules.sentimento.domain.premium_index_batch import PREMIUM_INDEX_ENDPOINT
from src.modules.sentimento.infra.postgres_ingest_record_store import PostgresIngestRecordStore
from src.modules.sentimento.use_cases.collector_run_mapping import FORCE_ORDER_ENDPOINT
from tests.helpers.postgres import DatabaseFactory, PostgresDatabase

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DRIVER = BACKEND_ROOT / "tests" / "helpers" / "collectors_cli_postgres_driver.py"
_STARTUP_POLL_S = 0.005
_JOIN_TIMEOUT_S = 5.0
_READY_POLL_S = 0.02
_READY_DEADLINE_S = 20.0

# Three DIFFERENT strings on purpose — same reasoning as `test_create_app_selects_ingest_record_
# backend.py`: a leaked password could otherwise hide behind a coincidental substring match.
_POSTGRES_USER = "collector_and_api"
_POSTGRES_PASSWORD = "do-not-leak-me-either"  # noqa: S105 - throwaway role password


@pytest.fixture
def _postgres(postgres_database_factory: DatabaseFactory) -> PostgresDatabase:
    """Create an ALREADY-INITIALISED database on the session's shared server.

    Initialising the schema here simulates what the collector would already have done in
    production before the API ever answers `/collector-status`.
    """
    database = postgres_database_factory(user=_POSTGRES_USER, password=_POSTGRES_PASSWORD)
    with database.connect() as connection:
        PostgresIngestRecordStore(connection).initialise()
    return database


def _observed_runs(conninfo: str) -> tuple[IngestRun, ...]:
    """Read `md.ingest_run` over a FRESH connection — never the collector's or the API's own.

    A new connection per poll (rather than one kept open across polls) is what guarantees this
    observer sees whatever the OTHER two connections have committed, with no ambiguity about
    snapshot timing on a long-lived transaction.
    """
    connection = psycopg.connect(conninfo)
    try:
        return PostgresIngestRecordStore(connection).runs()
    finally:
        connection.close()


def _wait_until(
    predicate: Callable[[], bool], deadline_s: float, process: subprocess.Popen[bytes]
) -> None:
    """Poll `predicate` until true, failing loud if the driver dies or the deadline passes."""
    deadline = time.monotonic() + deadline_s
    while not predicate():
        assert process.poll() is None, "the driver exited before the expected state was reached"
        assert time.monotonic() < deadline, "the driver made no progress before the deadline"
        time.sleep(_READY_POLL_S)


@contextmanager
def _served(app: FastAPI) -> Iterator[int]:
    """Run `app` on a real loopback socket, in-thread, and yield the port it bound.

    Same technique as `test_create_app_selects_ingest_record_backend.py`'s `_served` — duplicated,
    not shared, matching that file's own precedent.
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


def _get_collector_status(port: int) -> tuple[int, dict[str, object]]:
    """`GET /api/v1/collector-status`, returning `(status, parsed body)`."""
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    connection.request("GET", "/api/v1/collector-status")
    response = connection.getresponse()
    body = json.loads(response.read())
    connection.close()
    return response.status, body


def test_collector_status_reports_at_least_two_rows_over_a_real_shared_postgres(
    _postgres: PostgresDatabase, monkeypatch: pytest.MonkeyPatch
) -> None:
    """`D2.8`'s literal command: `n_rows >= 2` after 1 session + 1 cycle, both on Postgres.

    The collector runs in a REAL subprocess (`collectors_cli.run()`, Redis faked, `SIGTERM` closes
    the `!forceOrder@arr` session cleanly — `collectors_cli_postgres_driver.py`, same shape as
    `test_collectors_cli_shutdown.py`'s own `SIGTERM` test); the API is `create_app()` invoked
    IN THIS test process, with no `store_path`, so it composes its OWN Postgres connection via
    `INGEST_RECORD_BACKEND`/`POSTGRES_*` (`T-02.6`) — never touching the collector's connection or
    store object.
    """
    conninfo = _postgres.conninfo
    driver_env = {
        **os.environ,
        "PYTHONPATH": str(BACKEND_ROOT),
        "INGEST_RECORD_BACKEND": "postgres",
        **_postgres.env(),
    }
    process = subprocess.Popen(
        [sys.executable, str(DRIVER)],
        cwd=str(BACKEND_ROOT),
        env=driver_env,
    )
    try:
        # Readiness signal: the premium-index thread completes its ONE cycle immediately at
        # start (its interval is far larger than this test's window) — once that run lands in
        # Postgres, both threads are demonstrably alive and `SIGTERM` is safe to send.
        _wait_until(
            lambda: any(run.endpoint == PREMIUM_INDEX_ENDPOINT for run in _observed_runs(conninfo)),
            _READY_DEADLINE_S,
            process,
        )
        process.send_signal(signal.SIGTERM)
        process.wait(timeout=30)
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=30)

    assert process.returncode == 0, f"SIGTERM must exit 0, got {process.returncode}"

    collector_side_runs = _observed_runs(conninfo)
    endpoints = {run.endpoint for run in collector_side_runs}
    assert {FORCE_ORDER_ENDPOINT, PREMIUM_INDEX_ENDPOINT} <= endpoints, (
        f"expected both endpoints recorded in Postgres before querying the API, got {endpoints}"
    )

    monkeypatch.setenv("INGEST_RECORD_BACKEND", "postgres")
    for variable, value in _postgres.env().items():
        monkeypatch.setenv(variable, value)

    with _served(create_app()) as port:
        status, body = _get_collector_status(port)

    assert status == 200
    assert isinstance(body["n_rows"], int)
    assert body["n_rows"] >= 2, f"expected n_rows >= 2 over the shared Postgres, got {body}"
    rows = body["rows"]
    assert isinstance(rows, list)
    row_endpoints = {row["endpoint"] for row in rows}
    assert {FORCE_ORDER_ENDPOINT, PREMIUM_INDEX_ENDPOINT} <= row_endpoints


def test_collector_status_reports_zero_rows_over_an_unrelated_sqlite_store(
    tmp_path: Path,
) -> None:
    """`D2.8`'s MORDE: an API on `sqlite`, never touched by any collector, answers `n_rows == 0`.

    No docker needed — this is the negative half of the same falsifier, run every time `make
    verify` does: the API never sees rows it did not itself read from ITS OWN configured store.
    """
    store_path = tmp_path / "ingest_health.sqlite3"

    with _served(create_app(store_path=store_path)) as port:
        status, body = _get_collector_status(port)

    assert status == 200
    assert body["n_rows"] == 0, (
        f"expected n_rows == 0 for a store no collector wrote to, got {body}"
    )
