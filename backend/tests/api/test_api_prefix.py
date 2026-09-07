"""`API_PREFIX` (`M2`, `ADR-029/D2`): read ONCE at the composition root, every route under it.

Proved over a REAL loopback socket, same idiom as
`test_ingest_health_route_over_the_network.py` (`backend/tests/api/__init__.py`'s docstring:
never a `TestClient`, never a subprocess) — `httpx` is not declared in `backend/pyproject.toml`,
so `fastapi.testclient.TestClient` is not importable here anyway.

Three DoDs, three tests: the default prefix is `/api/v1` and a bare path 404s (never the root);
`API_PREFIX` moves `openapi.json`'s paths, proved through `_api_prefix_from_environment`, the
ONE function this module reads the env var through (`src.main` mirrors
`_store_path_from_environment`'s pattern); and absent the var, the default wins.
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

from src.main import _api_prefix_from_environment, create_app

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
    """One GET over the served socket; returns `(status, body)`."""
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    connection.request("GET", path)
    response = connection.getresponse()
    body = response.read()
    connection.close()
    return response.status, body


def test_default_prefix_is_api_v1_and_the_bare_path_404s(tmp_path: Path) -> None:
    """Absent `API_PREFIX` -> default `/api/v1`; a request without it matches NO route."""
    store_path = tmp_path / "ingest.sqlite3"

    with _served(create_app(store_path=store_path)) as port:
        status, _ = _get(port, "/api/v1/ingest-health")
        assert status == 200

        bare_status, _ = _get(port, "/ingest-health")
        assert bare_status == 404

        openapi_status, openapi_body = _get(port, "/openapi.json")
        assert openapi_status == 200
        paths = json.loads(openapi_body)["paths"]
        # `/ready` (`T-02.3`/`ADR-029/D3`) and `/collector-status` (`T-03.6`/`ADR-030`) joined
        # `/ingest-health` under the same prefix.
        assert set(paths) == {
            "/api/v1/ingest-health",
            "/api/v1/ready",
            "/api/v1/collector-status",
        }


def test_api_prefix_env_var_moves_every_openapi_path(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """`API_PREFIX=/x` (read through `_api_prefix_from_environment`) -> `openapi.json` paths.

    Paths begin with `/x`, and the route is reachable there — never under `/api/v1`.
    """
    monkeypatch.setenv("API_PREFIX", "/x")
    prefix = _api_prefix_from_environment()
    assert prefix == "/x"

    store_path = tmp_path / "ingest.sqlite3"

    with _served(create_app(store_path=store_path, api_prefix=prefix)) as port:
        status, _ = _get(port, "/x/ingest-health")
        assert status == 200

        openapi_status, openapi_body = _get(port, "/openapi.json")
        assert openapi_status == 200
        paths = json.loads(openapi_body)["paths"]
        assert set(paths) == {"/x/ingest-health", "/x/ready", "/x/collector-status"}
        assert all(path.startswith("/x") for path in paths)


def test_api_prefix_env_var_absent_falls_back_to_the_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """No `API_PREFIX` in the environment -> `_api_prefix_from_environment` returns `/api/v1`.

    Never the root (empty string).
    """
    monkeypatch.delenv("API_PREFIX", raising=False)
    assert _api_prefix_from_environment() == "/api/v1"
