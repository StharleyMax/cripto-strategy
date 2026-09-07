"""`GET /series-quarantine` over a REAL loopback socket — `D3.2`, `points_json` never in `rows`.

Same technique as `test_ingest_health_route_over_the_network.py`: `uvicorn.Server` on a daemon
thread, a REAL listener on `port=0` (OS-assigned), `http.client` (stdlib) as the client. CALA is
a live process answering `200` with the `{"query", "n_rows", "rows"}` envelope, one row per
quarantined series, `"points_json"` absent from every row; MORDE is the SAME port, after the
process is torn down, refusing the connection.
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
from src.modules.sentimento.domain.coinalyze_daily_series import (
    LIQUIDATION_REQUIREMENT,
    DailyPoint,
    SeriesKind,
    evaluate_series_requirement,
)
from src.modules.sentimento.domain.quarantine_terms import COINALYZE_ONE_SHOT_TERMS
from src.modules.sentimento.domain.quarantined_series_entry import QuarantinedSeriesEntry
from src.modules.sentimento.infra.sqlite_series_quarantine_store import (
    SqliteSeriesQuarantineStore,
)

_STARTUP_POLL_S = 0.005
_JOIN_TIMEOUT_S = 5.0


def _a_quarantined_entry() -> QuarantinedSeriesEntry:
    """One deterministic, born-quarantined entry — real `points_json` bytes behind the row."""
    points = tuple(DailyPoint(1_600_000_000 + day * 86_400, {"t": day}) for day in range(730))
    return QuarantinedSeriesEntry(
        source="coinalyze",
        series_kind=SeriesKind.LIQUIDATION,
        binance_symbol="BTCUSDT",
        coinalyze_symbol="BTCUSDT_PERP.A",
        points=points,
        requirement_verdict=evaluate_series_requirement(LIQUIDATION_REQUIREMENT, points),
        quarantine=COINALYZE_ONE_SHOT_TERMS,
        received_at="2026-09-01T12:00:00Z",
        run_id="run-t-03.4-test",
    )


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


def test_get_series_quarantine_serves_rows_without_points_json(tmp_path: Path) -> None:
    """CALA: process up, one quarantined row persisted -> `200`, `points_json` absent."""
    ingest_store_path = tmp_path / "ingest.sqlite3"
    quarantine_store_path = tmp_path / "quarantine.sqlite3"
    quarantine_store = SqliteSeriesQuarantineStore(quarantine_store_path)
    quarantine_store.initialise()
    quarantine_store.record(_a_quarantined_entry())

    app = create_app(store_path=ingest_store_path, quarantine_store_path=quarantine_store_path)
    with _served(app) as port:
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        connection.request("GET", "/api/v1/series-quarantine")
        response = connection.getresponse()
        body = json.loads(response.read())
        connection.close()

    assert response.status == 200
    assert set(body) == {"query", "n_rows", "rows"}
    assert body["query"] == "series_quarantine"
    assert body["n_rows"] == 1

    row = body["rows"][0]
    assert "points_json" not in row
    assert row["source"] == "coinalyze"
    assert row["series_kind"] == "liquidation"
    assert row["binance_symbol"] == "BTCUSDT"
    assert row["coinalyze_symbol"] == "BTCUSDT_PERP.A"
    assert row["n_points"] == 730
    assert row["recorded_at"] == "2026-09-01T12:00:00Z"
    assert row["labelShiftPresent"] is True
    assert row["unitPresent"] is True
    assert row["availableAtPresent"] is False


def test_get_series_quarantine_serves_the_empty_envelope_when_the_store_never_ran(
    tmp_path: Path,
) -> None:
    """The store file never being written is a legitimate F0 state: `200`, zero rows.

    Never an error — the same "absence reads as empty" contract every other read here gives.
    """
    ingest_store_path = tmp_path / "ingest.sqlite3"
    quarantine_store_path = tmp_path / "never-written.sqlite3"

    app = create_app(store_path=ingest_store_path, quarantine_store_path=quarantine_store_path)
    with _served(app) as port:
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        connection.request("GET", "/api/v1/series-quarantine")
        response = connection.getresponse()
        body = json.loads(response.read())
        connection.close()

    assert response.status == 200
    assert body == {"query": "series_quarantine", "n_rows": 0, "rows": []}


def test_get_series_quarantine_refuses_the_connection_when_the_process_is_down(
    tmp_path: Path,
) -> None:
    """MORDE: the SAME port, after the process is torn down, refuses — no payload assertion."""
    ingest_store_path = tmp_path / "ingest.sqlite3"
    quarantine_store_path = tmp_path / "quarantine.sqlite3"

    app = create_app(store_path=ingest_store_path, quarantine_store_path=quarantine_store_path)
    with _served(app) as port:
        pass  # the block exits here, tearing the server down before the request below

    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    with pytest.raises(ConnectionRefusedError):
        connection.request("GET", "/series-quarantine")
