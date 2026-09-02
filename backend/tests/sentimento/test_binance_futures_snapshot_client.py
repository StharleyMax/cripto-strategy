"""`BinanceFuturesSnapshotClient` wired to a FAKE connection — no socket, per `test.sh`.

Same shape as `test_quota_ramp_bench_offline.py`'s `FakeConnection`: the client is exercised
through the SAME `connection_factory` seam a real run uses, only the factory differs.
"""

from __future__ import annotations

import json
from collections.abc import Mapping

import pytest

from src.modules.sentimento.infra.binance_futures_snapshot_client import (
    EXCHANGE_INFO_PATH,
    FAPI_HOST,
    FUNDING_INFO_PATH,
    PREMIUM_INDEX_PATH,
    BinanceFuturesSnapshotClient,
    UnexpectedStatusError,
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


def _client_for(
    status: int, body: object
) -> tuple[BinanceFuturesSnapshotClient, list[FakeConnection]]:
    """Build a client whose every connection replays `(status, json.dumps(body))`."""
    opened: list[FakeConnection] = []
    encoded = json.dumps(body).encode("utf-8")

    def factory(host: str) -> FakeConnection:
        connection = FakeConnection(host, FakeResponse(status, encoded))
        opened.append(connection)
        return connection

    return BinanceFuturesSnapshotClient(connection_factory=factory), opened


def test_exchange_info_gets_the_right_path_on_the_right_host() -> None:
    """`exchange_info()` calls `EXCHANGE_INFO_PATH` on `FAPI_HOST` and decodes the body."""
    client, opened = _client_for(200, {"symbols": []})
    result = client.exchange_info()

    assert result == {"symbols": []}
    assert len(opened) == 1
    assert opened[0].host == FAPI_HOST
    method, url, headers = opened[0].requests[0]
    assert method == "GET"
    assert url == EXCHANGE_INFO_PATH
    assert headers["Accept"] == "application/json"
    assert opened[0].closed  # the connection is closed after every call, success or not


def test_funding_info_gets_its_own_path() -> None:
    """`funding_info()` calls `FUNDING_INFO_PATH`, not `EXCHANGE_INFO_PATH`."""
    client, opened = _client_for(200, [{"symbol": "BTCUSDT", "fundingIntervalHours": 8}])
    result = client.funding_info()

    assert result == [{"symbol": "BTCUSDT", "fundingIntervalHours": 8}]
    assert opened[0].requests[0][1] == FUNDING_INFO_PATH


def test_premium_index_gets_its_own_path() -> None:
    """`premium_index()` calls `PREMIUM_INDEX_PATH`, not either of the other two."""
    client, opened = _client_for(200, [{"symbol": "BTCUSDT", "interestRate": "0.0001"}])
    result = client.premium_index()

    assert result == [{"symbol": "BTCUSDT", "interestRate": "0.0001"}]
    assert opened[0].requests[0][1] == PREMIUM_INDEX_PATH


@pytest.mark.parametrize("status", [429, 500, 503])
def test_a_non_200_status_refuses_instead_of_decoding_the_body_as_data(status: int) -> None:
    """A `429`/`500`/`503` body is never JSON worth trusting — the client refuses before parsing."""
    client, _ = _client_for(status, {"code": -1, "msg": "unwelcome"})

    with pytest.raises(UnexpectedStatusError, match=str(status)):
        client.exchange_info()


def test_each_call_opens_and_closes_its_own_connection() -> None:
    """Three calls open three connections — no pool to leak or to serve a stale response."""
    opened: list[FakeConnection] = []

    def factory(host: str) -> FakeConnection:
        connection = FakeConnection(host, FakeResponse(200, b"[]"))
        opened.append(connection)
        return connection

    client = BinanceFuturesSnapshotClient(connection_factory=factory)
    client.funding_info()
    client.premium_index()
    client.funding_info()

    assert len(opened) == 3
    assert all(connection.closed for connection in opened)


def test_user_agent_identifies_the_caller() -> None:
    """`SPEC-001`'s public endpoints ask for no key, but an honest `User-Agent` is not a key."""
    client, opened = _client_for(200, {"symbols": []})
    client.exchange_info()

    user_agent = opened[0].requests[0][2]["User-Agent"]
    assert "T-02.1" in user_agent
