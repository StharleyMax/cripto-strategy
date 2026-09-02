"""`BinanceOiHistoryClient` wired to a FAKE connection — no socket, per `test.sh`.

Same shape as `test_binance_futures_snapshot_client.py`'s `FakeConnection`/`FakeResponse`.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from urllib.parse import parse_qs, urlsplit

from src.modules.sentimento.domain.oi_history_paginator import ClosedWindow
from src.modules.sentimento.infra.binance_oi_history_client import (
    FAPI_DATA_HOST,
    OPEN_INTEREST_HIST_PATH,
    BinanceOiHistoryClient,
)


class FakeResponse:
    """A canned response, read exactly once."""

    def __init__(self, status: int, body: bytes) -> None:
        """Take the status line and the raw body to hand back."""
        self.status = status
        self._body = body

    def read(self) -> bytes:
        """Return the canned body."""
        return self._body


class FakeConnection:
    """Never opens a socket; replays one scripted response and records the request."""

    def __init__(self, host: str, response: FakeResponse) -> None:
        """Take the host it pretends to serve and the response to replay."""
        self.host = host
        self._response = response
        self.requests: list[tuple[str, str, Mapping[str, str]]] = []
        self.closed = False

    def request(
        self, method: str, url: str, body: None = None, headers: Mapping[str, str] | None = None
    ) -> None:
        """Record the request; the response was scripted at construction time."""
        self.requests.append((method, url, dict(headers or {})))

    def getresponse(self) -> FakeResponse:
        """Hand back the scripted response."""
        return self._response

    def close(self) -> None:
        """Mark the connection closed."""
        self.closed = True


def _client_for(status: int, body: object) -> tuple[BinanceOiHistoryClient, list[FakeConnection]]:
    """Build a client whose every connection replays `(status, json.dumps(body))`."""
    opened: list[FakeConnection] = []
    encoded = json.dumps(body).encode("utf-8")

    def factory(host: str) -> FakeConnection:
        connection = FakeConnection(host, FakeResponse(status, encoded))
        opened.append(connection)
        return connection

    return BinanceOiHistoryClient(connection_factory=factory), opened


WINDOW = ClosedWindow(start_time_ms=1_000, end_time_ms=2_000)


def test_the_request_carries_both_starttime_and_endtime_together() -> None:
    """The client can never send `startTime` alone — `window` requires both fields."""
    client, opened = _client_for(200, [])
    client.open_interest_history("BTCUSDT", "5m", WINDOW, limit=500)

    method, url, _ = opened[0].requests[0]
    assert method == "GET"
    assert opened[0].host == FAPI_DATA_HOST
    path, _, query = url.partition("?")
    assert path == OPEN_INTEREST_HIST_PATH
    params = parse_qs(query)
    assert params["symbol"] == ["BTCUSDT"]
    assert params["period"] == ["5m"]
    assert params["startTime"] == ["1000"]
    assert params["endTime"] == ["2000"]
    assert params["limit"] == ["500"]


def test_a_list_body_is_parsed_as_points_with_no_api_code() -> None:
    """A successful `[...]` body becomes `points`, `api_code=None`."""
    client, _ = _client_for(200, [{"timestamp": 1_000, "sumOpenInterest": "1.0"}])
    response = client.open_interest_history("BTCUSDT", "5m", WINDOW, limit=500)

    assert response.api_code is None
    assert response.points == ({"timestamp": 1_000, "sumOpenInterest": "1.0"},)


def test_d7_1_an_error_envelope_is_parsed_as_an_api_code_with_zero_points() -> None:
    """`{"code": -1130, "msg": ...}` becomes `api_code=-1130`, never a fake empty success."""
    client, _ = _client_for(400, {"code": -1130, "msg": "Data recording is not started"})
    response = client.open_interest_history("BTCUSDT", "5m", WINDOW, limit=500)

    assert response.api_code == -1130
    assert response.points == ()


def test_each_call_opens_and_closes_its_own_connection() -> None:
    """No pool to leak or to serve a stale response — one connection per page."""
    opened: list[FakeConnection] = []

    def factory(host: str) -> FakeConnection:
        connection = FakeConnection(host, FakeResponse(200, b"[]"))
        opened.append(connection)
        return connection

    client = BinanceOiHistoryClient(connection_factory=factory)
    client.open_interest_history("BTCUSDT", "5m", WINDOW, limit=500)
    client.open_interest_history("ETHUSDT", "5m", WINDOW, limit=500)

    assert len(opened) == 2
    assert all(connection.closed for connection in opened)


def test_user_agent_identifies_the_caller() -> None:
    """An honest `User-Agent`, same pattern as `BinanceFuturesSnapshotClient`."""
    client, opened = _client_for(200, [])
    client.open_interest_history("BTCUSDT", "5m", WINDOW, limit=500)

    user_agent = opened[0].requests[0][2]["User-Agent"]
    assert "T-07.1" in user_agent


def test_url_is_a_valid_url_with_the_expected_host_and_path() -> None:
    """Sanity-check the assembled path against `urlsplit`, not just string containment."""
    client, opened = _client_for(200, [])
    client.open_interest_history("BTCUSDT", "5m", WINDOW, limit=500)

    _, url, _ = opened[0].requests[0]
    split = urlsplit(f"https://{FAPI_DATA_HOST}{url}")
    assert split.path == OPEN_INTEREST_HIST_PATH
