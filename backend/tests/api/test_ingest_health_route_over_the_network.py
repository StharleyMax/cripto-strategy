"""`GET /ingest-health` over a REAL loopback socket — no `TestClient`, no subprocess.

`DoD D5.13`: proved by the network, MORDE/CALA. CALA is a live process answering `200` with
the exact envelope `ADR-005/D6.1` fixes; MORDE is the SAME port, after the process is torn
down, refusing the connection — never an assertion about a payload the process never sent.

Technique: `uvicorn.Server` run on a `daemon` `threading.Thread`, the same idiom this suite
already uses for `fakeredis.TcpFakeServer`
(`tests/sentimento/test_redis_stream_bus.py`) — a REAL listener on `port=0` (OS-assigned, so
parallel runs never collide), the bound port read back from
`server.servers[0].sockets[0].getsockname()`. `http.client` (stdlib) is the client: it is the
only HTTP client this backend already speaks (5 of 49 `infra/` modules import it), and neither
`httpx` nor `requests` is declared in `backend/pyproject.toml`.

`uvicorn` 0.52.4's `Server.capture_signals()` already detects a non-main thread and skips
installing signal handlers on its own — this pin does not need the `install_signal_handlers`
attribute the gate's precedent example set, because that attribute does not exist on this
version's `Config` (`[MEDIDO 2026-09-04: hasattr(uvicorn.Config(...), "install_signal_handlers")
-> False]`).
"""

from __future__ import annotations

import http.client
import json
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import pytest
import uvicorn
from fastapi import FastAPI

from src.main import create_app
from src.modules.sentimento.domain.ingest_record import (
    INGEST_HEALTH_GAP_COLUMNS,
    INGEST_HEALTH_RUN_COLUMNS,
    IngestGap,
)
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore
from tests.helpers.ingest_record_driver import build_run

_STARTUP_POLL_S = 0.005
_JOIN_TIMEOUT_S = 5.0


def _a_gap() -> IngestGap:
    """Build one deterministic `IngestGap`, mirroring `build_run`'s determinism for runs."""
    return IngestGap(
        source="binance-futures",
        symbol="BTCUSDT",
        series_key_id="binance-futures:BTCUSDT:openInterest",
        from_ts="2026-08-29T00:00:00Z",
        to_ts="2026-08-29T00:05:00Z",
        n_missing=5,
        gap_class="MISSING",
        detected_at="2026-08-29T00:06:00Z",
    )


@contextmanager
def _served(app: FastAPI) -> Iterator[int]:
    """Run `app` on a real loopback socket, in-thread, and yield the port it bound.

    Port `0` lets the OS assign a free port, so this test never collides with a parallel run.
    Teardown asks the server to exit and joins the thread — the caller sees a clean shutdown,
    which is exactly the state the MORDE test needs before it can prove the port refuses.
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


def test_get_ingest_health_serves_the_fixed_envelope_when_the_process_is_up(
    tmp_path: Path,
) -> None:
    """CALA: process up -> `200`, the exact `ADR-005/D6.1` envelope.

    Never `IngestRun`'s 17 raw table columns (`started_at`/`ended_at` are TABLE columns, not
    QUERY columns — `ADR-008/D3`), and never a tick-level field (`agg_id`, per-trade price or
    quantity) — the D5.8 falsifier, finally with a subject.
    """
    store_path = tmp_path / "ingest.sqlite3"
    store = SqliteIngestRecordStore(store_path)
    store.initialise()
    store.record_run(build_run(0))
    store.record_gap(_a_gap())

    with _served(create_app(store_path=store_path)) as port:
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        connection.request("GET", "/ingest-health")
        response = connection.getresponse()
        body = json.loads(response.read())
        connection.close()

    assert response.status == 200
    assert set(body) == {"query", "n_runs", "n_gaps", "runs", "gaps"}
    assert body["query"] == "ingest_health_query"
    assert body["n_runs"] == 1
    assert body["n_gaps"] == 1

    run = body["runs"][0]
    assert len(INGEST_HEALTH_RUN_COLUMNS) == 15
    assert set(run) == set(INGEST_HEALTH_RUN_COLUMNS)
    assert run["janela_de_perda"] is None
    assert "agg_id" not in run
    assert "price" not in run
    assert "qty" not in run
    assert "started_at" not in run
    assert "ended_at" not in run

    gap = body["gaps"][0]
    assert len(INGEST_HEALTH_GAP_COLUMNS) == 8
    assert set(gap) == set(INGEST_HEALTH_GAP_COLUMNS)
    assert gap["class"] == "MISSING"
    assert "gap_class" not in gap


def test_get_ingest_health_refuses_the_connection_when_the_process_is_down(
    tmp_path: Path,
) -> None:
    """MORDE: the SAME port, after the process is torn down, refuses — no payload assertion."""
    store_path = tmp_path / "ingest.sqlite3"

    with _served(create_app(store_path=store_path)) as port:
        pass  # the block exits here, tearing the server down before the request below

    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    with pytest.raises(ConnectionRefusedError):
        connection.request("GET", "/ingest-health")
