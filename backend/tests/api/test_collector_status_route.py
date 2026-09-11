"""`GET /collector-status` over a REAL loopback socket — `ADR-030` D5, `T-03.6`.

Same idiom as `test_ingest_health_route_over_the_network.py` (`uvicorn.Server` on a `daemon`
thread, `http.client`, `port=0`) — duplicated, not shared, matching that file's own precedent.

Two things this file proves that the pure-function tests in
`tests/sentimento/test_collector_status_query.py` cannot: the envelope actually reaches an HTTP
client with the query name `ADR-030` D5 fixes, and — the falsifier this task exists to satisfy
(`F-D6-2`/`NG-9`) — serving `/collector-status` never perturbs `/ingest-health`'s `sha256`
(`ADR-005/D6.1`, `ADR-008/DoD-2`) over the SAME store.
"""

from __future__ import annotations

import hashlib
import http.client
import json
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import replace
from datetime import UTC, datetime, timedelta
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

    Same technique as `test_ingest_health_route_over_the_network.py`'s `_served` — duplicated,
    not shared, matching that file's own precedent (no shared helper exists for it yet).
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


def _get(port: int, path: str) -> tuple[int, bytes]:
    """Issue one `GET` over loopback and return `(status, raw body)`."""
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    connection.request("GET", path)
    response = connection.getresponse()
    body = response.read()
    connection.close()
    return response.status, body


def test_get_collector_status_serves_the_adr_030_envelope_over_the_wire(tmp_path: Path) -> None:
    """CALA: process up -> `200`, `query == "collector_status"`, one row per series."""
    store_path = tmp_path / "ingest.sqlite3"
    store = SqliteIngestRecordStore(store_path)
    store.initialise()
    for index in range(3):
        store.record_run(build_run(index))

    with _served(create_app(store_path=store_path)) as port:
        status, raw = _get(port, "/api/v1/collector-status")

    body = json.loads(raw)
    assert status == 200
    assert body["query"] == "collector_status"
    assert body["window_hours"] == 24
    assert body["n_rows"] == 1  # `build_run` writes ONE (source, endpoint) pair
    row = body["rows"][0]
    assert row["series"] == "binance-futures · /fapi/v1/openInterestHist"
    assert row["status"] in {"ATIVO", "PARADO"}
    assert row["retention"]["kind"] in {"unmeasured", "not_applicable"}
    assert row["resilience"]["kind"] in {"not_scored", "unavailable"}
    # `ADR-030` D5: the 6 `CollectorRow`-verbatim fields never leak an `IngestRun`-only column.
    assert "started_at" not in row
    assert "ended_at" not in row


def test_the_two_null_uptimes_are_told_apart_on_the_wire(tmp_path: Path) -> None:
    """`CA-F6-5`: `uptimePercent: null` never arrives mute — over HTTP, not in a unit test.

    THE SQLITE ENGINE HAS NO `writer_accounted_at` COLUMN AND NO WRITER CREDITING IT, so every
    run it serves is OPEN by `ADR-035/D2`'s definition. That is not a gap in this test, it is
    exactly the state `forceOrder` is in against the live stack — 3 runs in the window, 0 closed
    `[MEDIDO 2026-09-11T11:26Z]` — reachable here without a Postgres.

    What must reach the operator is WHICH null it is, and it does so through two fields that
    were already on the wire before this task (`D7`: "sem campo novo e sem versao de rota"):
    `n_runs_in_window` separates "mute collector" from "nothing closed", and `statusDetail`
    names it in pt-BR (`SPEC-001` §3.8). A bare null for both would be `ADR-012`'s ambiguous
    `rc=0` wearing a percentage.
    """
    store_path = tmp_path / "ingest.sqlite3"
    store = SqliteIngestRecordStore(store_path)
    store.initialise()
    recent = datetime.now(UTC) - timedelta(minutes=5)
    stamp = recent.strftime("%Y-%m-%dT%H:%M:%S.") + f"{recent.microsecond // 1000:03d}Z"
    store.record_run(replace(build_run(0), started_at=stamp, ended_at=stamp))

    with _served(create_app(store_path=store_path)) as port:
        status, raw = _get(port, "/api/v1/collector-status")

    assert status == 200
    row = json.loads(raw)["rows"][0]
    assert row["uptimePercent"] is None
    assert row["n_runs_in_window"] == 1
    assert row["statusDetail"] == (
        "1 run(s) na janela, nenhum fechado pelo escritor: uptime não medível."
    )


def test_get_collector_status_refuses_the_connection_when_the_process_is_down(
    tmp_path: Path,
) -> None:
    """MORDE: the SAME port, after the process is torn down, refuses — no payload assertion."""
    store_path = tmp_path / "ingest.sqlite3"

    with _served(create_app(store_path=store_path)) as port:
        pass  # the block exits here, tearing the server down before the request below

    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    with pytest.raises(ConnectionRefusedError):
        connection.request("GET", "/collector-status")


def test_f9_falsifier_ingest_health_sha256_is_unchanged_by_the_new_route(
    tmp_path: Path,
) -> None:
    """`ADR-030` F-9 / plan `D3.3`: `/ingest-health`'s `sha256` is unchanged by the new route.

    Identical before and after `/collector-status` is served over the SAME store — the control
    that `NG-9` names.
    """
    store_path = tmp_path / "ingest.sqlite3"
    store = SqliteIngestRecordStore(store_path)
    store.initialise()
    for index in range(5):
        store.record_run(build_run(index))

    with _served(create_app(store_path=store_path)) as port:
        status_before, body_before = _get(port, "/api/v1/ingest-health")
        assert status_before == 200
        sha_before = hashlib.sha256(body_before).hexdigest()

        status_collector, _ = _get(port, "/api/v1/collector-status")
        assert status_collector == 200

        status_after, body_after = _get(port, "/api/v1/ingest-health")
        assert status_after == 200
        sha_after = hashlib.sha256(body_after).hexdigest()

    assert sha_after == sha_before
