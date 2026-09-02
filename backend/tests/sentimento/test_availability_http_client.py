"""`AvailabilityHttpClient` exercised with a FAKE connection — no socket, `T-03.7`'s pattern.

Same fakes `test_coinalyze_history_client.py` already wrote for the sibling client that returns
bodies (`CoinalizeHistoryClient`) — reused in spirit here because both clients solve the same
problem: fetch AND keep the body, over an injected `connection_factory`.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence

import pytest

from src.modules.sentimento.domain.availability_poll import MalformedAvailabilityResponseError
from src.modules.sentimento.domain.availability_probe_set import BinanceFuturesDataEndpoint
from src.modules.sentimento.domain.coinalyze_daily_series import (
    MalformedCoinalizeResponseError,
    SeriesKind,
)
from src.modules.sentimento.infra.availability_http_client import AvailabilityHttpClient
from src.modules.sentimento.infra.https_quota_probe import COINALYZE_KEY_VARIABLE


class FakeResponse:
    """A canned response that records whether it was drained."""

    def __init__(self, status: int, body: bytes) -> None:
        """Take the status and the body bytes to hand back."""
        self.status = status
        self._body = body
        self.drained = False

    def getheaders(self) -> list[tuple[str, str]]:
        """Return no headers — this client does not read any."""
        return []

    def read(self) -> bytes:
        """Drain the body and record that it happened."""
        self.drained = True
        return self._body


class FakeConnection:
    """Never opens a socket, and records every request it was given."""

    def __init__(self, host: str, responses: Sequence[FakeResponse | OSError]) -> None:
        """Take the host it pretends to serve and the responses to replay, in order."""
        self.host = host
        self._responses = list(responses)
        self.requests: list[tuple[str, str, Mapping[str, str]]] = []
        self.closed = False
        self._pending: FakeResponse | None = None

    def request(
        self, method: str, url: str, body: None = None, headers: Mapping[str, str] | None = None
    ) -> None:
        """Record the request, raising a scripted transport failure at send time."""
        self.requests.append((method, url, dict(headers or {})))
        step = self._responses.pop(0)
        if isinstance(step, OSError):
            raise step
        self._pending = step

    def getresponse(self) -> FakeResponse:
        """Hand back the response for the request just recorded."""
        assert self._pending is not None
        return self._pending

    def close(self) -> None:
        """Mark the connection closed."""
        self.closed = True


def _client_with(
    responses: Sequence[FakeResponse | OSError], environment: Mapping[str, str] | None = None
) -> tuple[AvailabilityHttpClient, dict[str, FakeConnection]]:
    """Build a client whose connections are fakes, handing back the fakes for assertions."""
    opened: dict[str, FakeConnection] = {}

    def factory(host: str) -> FakeConnection:
        connection = FakeConnection(host, responses)
        opened[host] = connection
        return connection

    return AvailabilityHttpClient(environment=environment or {}, connection_factory=factory), opened


def test_poll_binance_parses_the_newest_bucket_on_a_200() -> None:
    """The whole point of this client over `HttpsQuotaProbe`: the body is read, not drained."""
    body = b'[{"symbol": "BTCUSDT", "timestamp": 1700000000000}]'
    client, opened = _client_with([FakeResponse(200, body)])

    outcome = client.poll_binance(BinanceFuturesDataEndpoint.OPEN_INTEREST_HIST, "BTCUSDT")

    assert outcome.status == 200
    assert outcome.latest_event_time_ms == 1700000000000
    request = opened["fapi.binance.com"].requests[0]
    assert "symbol=BTCUSDT" in request[1]
    assert "openInterestHist" in request[1]


def test_poll_binance_on_a_non_200_reports_the_status_without_parsing() -> None:
    """A `429`/`4xx`/`5xx` is DATA, never raised — the caller decides what it means."""
    client, _ = _client_with([FakeResponse(429, b"rate limited")])

    outcome = client.poll_binance(BinanceFuturesDataEndpoint.OPEN_INTEREST_HIST, "BTCUSDT")

    assert outcome.status == 429
    assert outcome.latest_event_time_ms is None


def test_poll_binance_on_a_transport_failure_drops_the_connection() -> None:
    """A dead send must not look like a `200` with an empty bucket."""
    client, opened = _client_with([ConnectionResetError("reset")])

    outcome = client.poll_binance(BinanceFuturesDataEndpoint.OPEN_INTEREST_HIST, "BTCUSDT")

    assert outcome.status is None
    assert "ConnectionResetError" in (outcome.transport_error or "")
    assert opened["fapi.binance.com"].closed is True


def test_poll_binance_on_a_malformed_200_body_raises_rather_than_swallowing() -> None:
    """A malformed `200` is a real schema defect — never silently read as 'no data yet'."""
    client, _ = _client_with([FakeResponse(200, b"not json")])

    with pytest.raises(MalformedAvailabilityResponseError):
        client.poll_binance(BinanceFuturesDataEndpoint.OPEN_INTEREST_HIST, "BTCUSDT")


def test_poll_coinalyze_parses_the_newest_point_and_sends_the_api_key() -> None:
    """The Coinalyze key never lives in this module — it is read from the injected environment."""
    body = b'[{"symbol": "BTCUSDT_PERP.A", "history": [{"t": 1700000000, "v": 1}]}]'
    client, opened = _client_with(
        [FakeResponse(200, body)], environment={COINALYZE_KEY_VARIABLE: "secret"}
    )

    outcome = client.poll_coinalyze(SeriesKind.OPEN_INTEREST, "BTCUSDT")

    assert outcome.status == 200
    assert outcome.latest_event_time_ms == 1700000000000
    request = opened["api.coinalyze.net"].requests[0]
    assert request[2]["api_key"] == "secret"
    assert "open-interest-history" in request[1]
    assert "BTCUSDT_PERP.A" in request[1]


def test_poll_coinalyze_on_an_empty_history_reports_no_timestamp() -> None:
    """An empty `history` is a legitimate `200` — not yet a point to read a lag from."""
    body = b'[{"symbol": "BTCUSDT_PERP.A", "history": []}]'
    client, _ = _client_with([FakeResponse(200, body)])

    outcome = client.poll_coinalyze(SeriesKind.OPEN_INTEREST, "BTCUSDT")

    assert outcome.status == 200
    assert outcome.latest_event_time_ms is None


def test_poll_coinalyze_on_a_non_200_reports_the_status_without_parsing() -> None:
    """A missing/bad key surfaces as a `401`, never a crash at poll time."""
    client, _ = _client_with([FakeResponse(401, b"unauthorized")])

    outcome = client.poll_coinalyze(SeriesKind.LIQUIDATION, "BTCUSDT")

    assert outcome.status == 401
    assert outcome.latest_event_time_ms is None


def test_poll_coinalyze_on_a_transport_failure_drops_the_connection() -> None:
    """A dead send must not look like a `200` with an empty history."""
    client, opened = _client_with([ConnectionResetError("reset")])

    outcome = client.poll_coinalyze(SeriesKind.OPEN_INTEREST, "BTCUSDT")

    assert outcome.status is None
    assert "ConnectionResetError" in (outcome.transport_error or "")
    assert opened["api.coinalyze.net"].closed is True


def test_poll_coinalyze_on_a_malformed_200_body_raises() -> None:
    """Reused straight from `domain/coinalyze_daily_series.py` — the same refusal, not a copy."""
    client, _ = _client_with([FakeResponse(200, b"not json")])

    with pytest.raises(MalformedCoinalizeResponseError):
        client.poll_coinalyze(SeriesKind.OPEN_INTEREST, "BTCUSDT")


def test_each_host_gets_its_own_connection_reused_across_calls() -> None:
    """Binance and Coinalyze are different hosts — one connection each, not shared, not reopened.

    Each host gets its OWN response queue here, deliberately: `_client_with`'s single shared
    queue is copied whole into every new connection (`FakeConnection.__init__`), so a factory
    that must serve two DIFFERENT hosts needs one queue per host, not the pooled helper.
    """
    binance_body = b'[{"symbol": "BTCUSDT", "timestamp": 1}]'
    coinalyze_body = b'[{"symbol": "BTCUSDT_PERP.A", "history": []}]'
    responses_by_host = {
        "fapi.binance.com": [FakeResponse(200, binance_body), FakeResponse(200, binance_body)],
        "api.coinalyze.net": [FakeResponse(200, coinalyze_body)],
    }
    opened: dict[str, FakeConnection] = {}

    def factory(host: str) -> FakeConnection:
        connection = FakeConnection(host, responses_by_host[host])
        opened[host] = connection
        return connection

    client = AvailabilityHttpClient(environment={}, connection_factory=factory)

    client.poll_binance(BinanceFuturesDataEndpoint.OPEN_INTEREST_HIST, "BTCUSDT")
    client.poll_coinalyze(SeriesKind.OPEN_INTEREST, "BTCUSDT")
    client.poll_binance(BinanceFuturesDataEndpoint.OPEN_INTEREST_HIST, "ETHUSDT")

    assert len(opened) == 2
    assert len(opened["fapi.binance.com"].requests) == 2
    assert len(opened["api.coinalyze.net"].requests) == 1
    client.close()
    assert opened["fapi.binance.com"].closed is True
    assert opened["api.coinalyze.net"].closed is True


def test_a_factory_that_cannot_even_open_is_reported_as_a_transport_failure() -> None:
    """`_drop` must survive a host that never made it into the connection slot."""

    def refusing_factory(host: str) -> FakeConnection:
        raise ConnectionRefusedError(f"connection refused: {host}")

    client = AvailabilityHttpClient(environment={}, connection_factory=refusing_factory)

    outcome = client.poll_binance(BinanceFuturesDataEndpoint.OPEN_INTEREST_HIST, "BTCUSDT")

    assert outcome.status is None
    assert "ConnectionRefusedError" in (outcome.transport_error or "")
    client.close()
