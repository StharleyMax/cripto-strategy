"""`GET /series-live` over a REAL loopback socket — `CA-F1-4`: `Content-Type: text/event-stream`.

Same idiom as `test_series_history_route.py`. `LiveBucketSource` has no real adapter yet
(`use_cases/series_live.py`'s own docstring), so every test here injects a finite fake — a real
production stream is open-ended by nature and out of a single HTTP response's test.
"""

from __future__ import annotations

import http.client
import json
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI

from src.api.dependencies import get_live_bucket_source
from src.main import create_app
from src.modules.sentimento.domain.live_bucket_envelope import LiveBucketEnvelope

_STARTUP_POLL_S = 0.005
_JOIN_TIMEOUT_S = 5.0


class _FiniteSource:
    """A `LiveBucketSource` fixture: yields exactly the envelopes it was built with, then stops."""

    def __init__(self, envelopes: tuple[LiveBucketEnvelope, ...]) -> None:
        self._envelopes = envelopes

    def stream(self, *, series_key_id: str, symbol: str) -> Iterator[LiveBucketEnvelope]:
        yield from self._envelopes


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


def test_series_live_responds_with_the_sse_content_type(tmp_path: Path) -> None:
    """`CA-F1-4`: `curl -sD - <rota> | grep -i text/event-stream` -> 1 line."""
    app = create_app(store_path=tmp_path / "ih.sqlite3")
    app.dependency_overrides[get_live_bucket_source] = lambda: _FiniteSource(())

    with _served(app) as port:
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        connection.request("GET", "/api/v1/series-live?series_key_id=x&symbol=BTCUSDT&interval=1m")
        response = connection.getresponse()
        content_type = response.getheader("content-type")
        response.read()
        connection.close()

    assert response.status == 200
    assert content_type is not None
    assert "text/event-stream" in content_type.lower()


def test_series_live_streams_the_bucket_envelope_unaltered(tmp_path: Path) -> None:
    """`ADR-005/D2` envelope reaches the wire verbatim — same 5 terms plus `is_final`."""
    envelope = LiveBucketEnvelope(
        bucket_open_ts="2026-09-08T00:00:00Z",
        cvd_delta_parcial="1.5",
        last_price="72998.8",
        n_trades=42,
        seq=7,
        is_final=False,
    )
    app = create_app(store_path=tmp_path / "ih.sqlite3")
    app.dependency_overrides[get_live_bucket_source] = lambda: _FiniteSource((envelope,))

    with _served(app) as port:
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        connection.request("GET", "/api/v1/series-live?series_key_id=x&symbol=BTCUSDT&interval=1m")
        response = connection.getresponse()
        body = response.read().decode("utf-8")
        connection.close()

    assert body.startswith("data: ")
    payload = json.loads(body.removeprefix("data: ").strip())
    assert payload == {
        "bucket_open_ts": "2026-09-08T00:00:00Z",
        "cvd_delta_parcial": "1.5",
        "last_price": "72998.8",
        "n_trades": 42,
        "seq": 7,
        "is_final": False,
    }


def test_series_live_refuses_an_interval_other_than_1m(tmp_path: Path) -> None:
    """Same restriction `series_history.py` applies — `ADR-034/D6` scopes F1 to the native grid."""
    app = create_app(store_path=tmp_path / "ih.sqlite3")
    app.dependency_overrides[get_live_bucket_source] = lambda: _FiniteSource(())

    with _served(app) as port:
        connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
        connection.request("GET", "/api/v1/series-live?series_key_id=x&symbol=BTCUSDT&interval=5m")
        response = connection.getresponse()
        response.read()
        connection.close()

    assert response.status == 422
