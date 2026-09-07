"""`GET /ready` over a REAL loopback socket — discriminates the three states `ADR-029/D3` names.

Same technique as `test_ingest_health_route_over_the_network.py`: `uvicorn.Server` on a daemon
thread, a REAL listener on `port=0` (OS-assigned), `http.client` (stdlib) as the client — the
only HTTP client this backend already speaks. `DoD D2.2`: 3 executions, each a distinct body;
`200 ⇔ exists ∧ schema_present`; nothing else in the body, ever. `DoD` "no chão": MORDE is the
port refusing the connection after teardown, never a `503` misread as though it were the error.
"""

from __future__ import annotations

import http.client
import json
import sqlite3
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import pytest
import uvicorn
from fastapi import FastAPI

from src.main import create_app
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore
from tests.helpers.ingest_record_driver import build_run

_STARTUP_POLL_S = 0.005
_JOIN_TIMEOUT_S = 5.0


@contextmanager
def _served(app: FastAPI) -> Iterator[int]:
    """Run `app` on a real loopback socket, in-thread, and yield the port it bound.

    Port `0` lets the OS assign a free port, so this test never collides with a parallel run.
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


def test_ready_is_503_with_exists_false_when_the_store_file_is_absent(tmp_path: Path) -> None:
    """State 1/3: no leaf file at all — `ADR-029/D3`'s "coletor nunca rodou", never `200`.

    The PARENT directory has to exist (`create_app` refuses otherwise, `T-02.1`/`D2.1`) — it is
    the LEAF file that is absent here, the state `/ready` exists to discriminate.
    """
    store_path = tmp_path / "store" / "ih.sqlite3"
    store_path.parent.mkdir(parents=True)

    with _served(create_app(store_path=store_path)) as port:
        status, body = _get_ready(port)

    assert status == 503
    assert body == {"store": {"path": str(store_path), "exists": False, "schema_present": False}}


def test_ready_is_503_with_schema_present_false_over_a_zero_byte_store(tmp_path: Path) -> None:
    """State 2/3: the file exists, the schema does not — the crash-before-first-commit border.

    `sqlite3.connect` creates the file on open; the `CREATE TABLE` of `initialise()` only
    becomes visible at `COMMIT` — a kill in between leaves exactly this: 0 bytes on disk
    (`test_ingest_record_crash_borders.py`, same technique).
    """
    store_path = tmp_path / "ih.sqlite3"
    sqlite3.connect(store_path).close()
    assert store_path.stat().st_size == 0, "o cenario exige o arquivo vazio"

    with _served(create_app(store_path=store_path)) as port:
        status, body = _get_ready(port)

    assert status == 503
    assert body == {"store": {"path": str(store_path), "exists": True, "schema_present": False}}


def test_ready_is_200_with_both_true_over_a_valid_store_and_nothing_else_in_the_body(
    tmp_path: Path,
) -> None:
    """State 3/3: an initialised store — `200`, both flags `True`, NO other field in the body."""
    store_path = tmp_path / "ih.sqlite3"
    store = SqliteIngestRecordStore(store_path)
    store.initialise()
    store.record_run(build_run(0))

    with _served(create_app(store_path=store_path)) as port:
        status, body = _get_ready(port)

    assert status == 200
    assert set(body) == {"store"}
    store_field = body["store"]
    assert isinstance(store_field, dict)
    assert set(store_field) == {"path", "exists", "schema_present"}
    assert body == {"store": {"path": str(store_path), "exists": True, "schema_present": True}}


def test_ready_propagates_a_database_error_as_500_over_a_corrupted_store(tmp_path: Path) -> None:
    """CORRUPTION is data loss, not a legitimate F0 state — `core.silent-except` forbids hiding it.

    Same corruption technique as `test_ingest_record_crash_borders.py`'s control: truncate a
    valid file to half its bytes plus 16 NUL bytes. `describe_readiness()` does not catch
    `sqlite3.DatabaseError` any more than `_fetch` does, so it reaches FastAPI's default error
    handling as a `500` — never a `503` that reads like an ordinary "not ready" state.
    """
    store_path = tmp_path / "ih.sqlite3"
    store = SqliteIngestRecordStore(store_path)
    store.initialise()
    store.record_run(build_run(0))
    raw = store_path.read_bytes()
    store_path.write_bytes(raw[: len(raw) // 2] + b"\x00" * 16)

    with _served(create_app(store_path=store_path)) as port:
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        connection.request("GET", "/api/v1/ready")
        response = connection.getresponse()
        response.read()
        connection.close()

    assert response.status == 500


def test_ready_refuses_the_connection_when_the_process_is_down(tmp_path: Path) -> None:
    """MORDE: the SAME port, after the process is torn down, refuses — no payload assertion.

    `DoD` "no chão": a pytest that instead asserted a `503` here would be reprovado por `503`,
    not por conexão — exactly the confusion this test exists to rule out.
    """
    store_path = tmp_path / "ih.sqlite3"

    with _served(create_app(store_path=store_path)) as port:
        pass  # the block exits here, tearing the server down before the request below

    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    with pytest.raises(ConnectionRefusedError):
        connection.request("GET", "/ready")
