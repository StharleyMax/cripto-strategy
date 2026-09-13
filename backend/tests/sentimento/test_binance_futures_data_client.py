"""`T-04.3`: the shared `/futures/data/*` client — path composition, XOR body, empty-is-real.

No socket is opened: the connection FACTORY is injected, the same shape every other Binance
client in this package already takes (`backend/scripts/test.sh`'s "ZERO REDE").
"""

from __future__ import annotations

import json
from collections.abc import Mapping

import pytest

from src.modules.sentimento.infra.binance_futures_data_client import (
    FUTURES_DATA_HOST,
    FUTURES_DATA_PATH_PREFIX,
    MAX_LIMIT,
    BinanceFuturesDataClient,
    LimitOutOfRangeError,
    UnexpectedPayloadShapeError,
)

_ENDPOINT = "globalLongShortAccountRatio"
# A verbatim point from a real body `[MEDIDO 2026-09-12]`.
_REAL_POINT: Mapping[str, object] = {
    "symbol": "BTCUSDT",
    "longAccount": "0.6217",
    "longShortRatio": "1.6434",
    "shortAccount": "0.3783",
    "timestamp": 1789209000000,
}


class _FakeResponse:
    """The two things the client reads off a response."""

    def __init__(self, status: int, body: bytes) -> None:
        """Bind the status line's code and the body bytes."""
        self.status = status
        self._body = body

    def read(self) -> bytes:
        """Drain the body."""
        return self._body


class _FakeConnection:
    """Records every request and answers a scripted body; counts its own closes."""

    def __init__(self, responses: list[_FakeResponse]) -> None:
        """Bind the responses this connection hands back, in order; the last one repeats."""
        self._responses = responses
        self.requests: list[tuple[str, str]] = []
        self.closes = 0

    def request(
        self, method: str, url: str, body: None = None, headers: Mapping[str, str] | None = None
    ) -> None:
        """Record the request line."""
        self.requests.append((method, url))

    def getresponse(self) -> _FakeResponse:
        """Answer the next scripted response."""
        index = min(len(self.requests) - 1, len(self._responses) - 1)
        return self._responses[index]

    def close(self) -> None:
        """Count the close."""
        self.closes += 1


class _BrokenConnection:
    """A connection whose every request is a dead socket."""

    def __init__(self) -> None:
        """Start with nothing closed."""
        self.closes = 0

    def request(
        self, method: str, url: str, body: None = None, headers: Mapping[str, str] | None = None
    ) -> None:
        """Raise the way a broken keep-alive connection does."""
        raise OSError("connection reset by peer")

    def getresponse(self) -> _FakeResponse:  # pragma: no cover - never reached
        """Unreachable: `request` always raises first."""
        raise AssertionError("getresponse must not be reached")

    def close(self) -> None:
        """Count the close."""
        self.closes += 1


def _client_over(connection: object) -> BinanceFuturesDataClient:
    """Build a client whose factory always hands back `connection`."""
    return BinanceFuturesDataClient(connection_factory=lambda _host: connection)  # type: ignore[arg-type,return-value]


def test_the_path_is_the_prefix_the_endpoint_and_the_three_query_parameters() -> None:
    """The endpoint is a PARAMETER — this is what makes the client shareable across the family.

    No `startTime`/`endTime`: this call is the LIVE TAIL, and sending a bound would silently
    turn it into a backfill with a contract (`ClosedWindow`) it does not carry.
    """
    connection = _FakeConnection([_FakeResponse(200, json.dumps([_REAL_POINT]).encode())])
    client = _client_over(connection)

    client.history(_ENDPOINT, "BTCUSDT", "5m", 500)

    method, url = connection.requests[0]
    assert method == "GET"
    assert url.startswith(f"{FUTURES_DATA_PATH_PREFIX}{_ENDPOINT}?")
    assert "symbol=BTCUSDT" in url
    assert "period=5m" in url
    assert "limit=500" in url
    assert "startTime" not in url
    assert "endTime" not in url


def test_a_list_body_comes_back_verbatim_with_no_api_code() -> None:
    """The points are handed on UNTOUCHED — which field becomes a value is a mapping decision."""
    connection = _FakeConnection([_FakeResponse(200, json.dumps([_REAL_POINT]).encode())])

    page = _client_over(connection).history(_ENDPOINT, "BTCUSDT", "5m", 500)

    assert page.status == 200
    assert page.api_code is None
    assert page.points == (_REAL_POINT,)


def test_an_empty_list_is_a_real_answer_and_not_an_error() -> None:
    """⛔ `HTTP 200` + `[]` is EXACTLY what `period=1m` returns `[MEDIDO 2026-09-12]`.

    Raising here would have destroyed the measurement that fixed `interval="5m"` in the identity:
    `T-04.1` learned the `5min` floor is Binance's own precisely BY reading this shape back.
    """
    connection = _FakeConnection([_FakeResponse(200, b"[]")])

    page = _client_over(connection).history(_ENDPOINT, "BTCUSDT", "1m", 30)

    assert (page.status, page.api_code, page.points) == (200, None, ())


def test_an_error_envelope_becomes_an_api_code_and_never_a_point() -> None:
    """XOR by construction: a body with `code` yields the code and zero points."""
    body = json.dumps({"code": -1130, "msg": "Data sent for parameter is not valid."}).encode()
    connection = _FakeConnection([_FakeResponse(400, body)])

    page = _client_over(connection).history(_ENDPOINT, "BTCUSDT", "5m", 500)

    assert page.api_code == -1130
    assert page.points == ()
    assert page.status == 400


def test_a_body_that_is_neither_shape_raises_instead_of_being_read_as_empty() -> None:
    """MORDE: a changed contract must be loud, never an empty page that looks legitimate."""
    connection = _FakeConnection([_FakeResponse(200, b'{"unexpected": true}')])

    with pytest.raises(UnexpectedPayloadShapeError):
        _client_over(connection).history(_ENDPOINT, "BTCUSDT", "5m", 500)


@pytest.mark.parametrize("limit", [0, -1, MAX_LIMIT + 1])
def test_a_limit_outside_the_endpoints_range_is_refused_before_a_request_is_sent(
    limit: int,
) -> None:
    """The ceiling is a fact of the provider — refusing locally costs no round trip to learn it."""
    connection = _FakeConnection([_FakeResponse(200, b"[]")])

    with pytest.raises(LimitOutOfRangeError):
        _client_over(connection).history(_ENDPOINT, "BTCUSDT", "5m", limit)

    assert connection.requests == []


def test_one_connection_is_reused_across_calls_and_dropped_when_it_breaks() -> None:
    """The lifecycle `PremiumIndexHttpClient` already uses: reuse, and rebuild on `OSError`.

    A broken keep-alive connection that is kept would poison every following call, which is the
    failure the reuse itself introduces and the drop is what closes.
    """
    reused = _FakeConnection([_FakeResponse(200, b"[]")])
    client = _client_over(reused)
    client.history(_ENDPOINT, "BTCUSDT", "5m", 10)
    client.history(_ENDPOINT, "ETHUSDT", "5m", 10)

    assert len(reused.requests) == 2
    assert reused.closes == 0

    broken = _BrokenConnection()
    breaking_client = _client_over(broken)
    with pytest.raises(OSError, match="connection reset"):
        breaking_client.history(_ENDPOINT, "BTCUSDT", "5m", 10)

    assert broken.closes == 1


def test_the_host_is_the_public_futures_api_and_needs_no_key() -> None:
    """`/futures/data/*` is public — no auth header is composed, so none can leak into a log."""
    assert FUTURES_DATA_HOST == "fapi.binance.com"
    assert FUTURES_DATA_PATH_PREFIX == "/futures/data/"
