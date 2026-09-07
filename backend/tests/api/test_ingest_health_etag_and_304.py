"""`ETag`/`304` on `GET /ingest-health` (`T-02.4`, `ADR-029/D4`, `ADR-005/D6.3`).

Proved over a REAL loopback socket, same idiom as
`test_ingest_health_route_over_the_network.py` and `test_api_prefix.py`
(`backend/tests/api/__init__.py`'s docstring: never a `TestClient`, never a subprocess) —
`httpx` is not declared in `backend/pyproject.toml`.

Four falsifiers, matching `T-02.4`'s DoD literally:

- the `ETag` is a STRONG validator (no `W/` prefix) whose value equals
  `IngestHealthReport.fingerprint()`, proved from the PYTHON side by reading the same store
  independently and computing the fingerprint again — never a number compared with itself
  (`ADR-005/D6` names that failure mode explicitly; the TS side is `T-02.5`).
- CONTROLE NEGATIVO: recording one more run into the SAME store changes the `ETag` — the
  falsifier this whole task exists to satisfy (an `ETag` that never changes would pass the
  equality test above by accident, always returning a constant).
- `If-None-Match` equal to the current `ETag` -> `304`, empty body, the SAME `ETag` repeated.
- `If-None-Match` with the WRONG value -> `200`, full body, unchanged shape (`NG-9`).
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
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore
from src.modules.sentimento.use_cases.ingest_health import ingest_health_query
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


def _get(port: int, path: str, if_none_match: str | None = None) -> tuple[int, bytes, str | None]:
    """One GET over the served socket; returns `(status, body, ETag header)`."""
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    headers = {"If-None-Match": if_none_match} if if_none_match is not None else {}
    connection.request("GET", path, headers=headers)
    response = connection.getresponse()
    body = response.read()
    etag = response.getheader("ETag")
    connection.close()
    return response.status, body, etag


def test_etag_is_the_strong_fingerprint_and_the_200_body_is_untouched(tmp_path: Path) -> None:
    """CALA: `ETag` is `"<fingerprint>"`, never `W/"..."`, and equals a fresh Python read."""
    store_path = tmp_path / "ingest.sqlite3"
    store = SqliteIngestRecordStore(store_path)
    store.initialise()
    store.record_run(build_run(0))

    with _served(create_app(store_path=store_path)) as port:
        status, body, etag = _get(port, "/api/v1/ingest-health")

    assert status == 200
    assert etag is not None
    assert not etag.startswith("W/")
    assert etag.startswith('"') and etag.endswith('"')

    # Independent Python-side read of the SAME store, computing the fingerprint again — the
    # equality this DoD demands, never the header compared with the same in-process value the
    # handler produced (`ADR-005/D6`'s "DoD-2 comparando um numero consigo mesmo").
    fresh_store = SqliteIngestRecordStore(store_path)
    expected_report = ingest_health_query(fresh_store)
    assert etag == f'"{expected_report.fingerprint()}"'

    envelope = json.loads(body)
    assert set(envelope) == {"query", "n_runs", "n_gaps", "runs", "gaps"}
    assert envelope["n_runs"] == 1


def test_etag_changes_when_one_more_run_is_recorded_into_the_same_store(
    tmp_path: Path,
) -> None:
    """CONTROLE NEGATIVO: an `ETag` that never moves would pass equality tests by accident."""
    store_path = tmp_path / "ingest.sqlite3"
    store = SqliteIngestRecordStore(store_path)
    store.initialise()
    store.record_run(build_run(0))

    with _served(create_app(store_path=store_path)) as port:
        _, _, etag_before = _get(port, "/api/v1/ingest-health")

        store.record_run(build_run(1))  # one more run, same store, same served process

        _, _, etag_after = _get(port, "/api/v1/ingest-health")

    assert etag_before != etag_after


def test_if_none_match_equal_etag_returns_304_with_empty_body_and_the_same_etag(
    tmp_path: Path,
) -> None:
    """`304` on an exact `If-None-Match` match: empty body, `ETag` repeated."""
    store_path = tmp_path / "ingest.sqlite3"
    store = SqliteIngestRecordStore(store_path)
    store.initialise()
    store.record_run(build_run(0))

    with _served(create_app(store_path=store_path)) as port:
        _, _, etag = _get(port, "/api/v1/ingest-health")
        assert etag is not None

        status, body, repeated_etag = _get(port, "/api/v1/ingest-health", if_none_match=etag)

    assert status == 304
    assert body == b""
    assert repeated_etag == etag


def test_if_none_match_with_the_wrong_etag_returns_200(tmp_path: Path) -> None:
    """A non-matching `If-None-Match` falls through to the full `200`, body unchanged."""
    store_path = tmp_path / "ingest.sqlite3"
    store = SqliteIngestRecordStore(store_path)
    store.initialise()
    store.record_run(build_run(0))

    with _served(create_app(store_path=store_path)) as port:
        status, body, etag = _get(
            port, "/api/v1/ingest-health", if_none_match='"not-the-real-fingerprint"'
        )

    assert status == 200
    assert etag is not None
    envelope = json.loads(body)
    assert envelope["n_runs"] == 1


def test_get_ingest_health_still_refuses_the_connection_when_the_process_is_down(
    tmp_path: Path,
) -> None:
    """MORDE: the ETag/304 change never turns a down process into anything but a refusal."""
    store_path = tmp_path / "ingest.sqlite3"

    with _served(create_app(store_path=store_path)) as port:
        pass  # the block exits here, tearing the server down before the request below

    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    with pytest.raises(ConnectionRefusedError):
        connection.request("GET", "/api/v1/ingest-health")
