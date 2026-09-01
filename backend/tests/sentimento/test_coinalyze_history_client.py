"""`CoinalizeHistoryClient` exercised with a FAKE connection — no socket, mirrors T-03.7's pattern.

The same fakes `test_quota_ramp_bench_offline.py` wrote for `HttpsQuotaProbe` are reused here in
spirit (a `FakeConnection`/`FakeResponse` pair): the point of injecting `connection_factory` is
exactly to make this reachable without a socket, for the sibling client that returns bodies.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence

import pytest

from src.modules.sentimento.infra.coinalyze_history_client import (
    CoinalizeHistoryClient,
    CoinalizeHistoryResponse,
)
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
) -> tuple[CoinalizeHistoryClient, list[FakeConnection]]:
    """Build a client whose connection is a fake, handing back the fakes for assertions."""
    opened: list[FakeConnection] = []

    def factory(host: str) -> FakeConnection:
        connection = FakeConnection(host, responses)
        opened.append(connection)
        return connection

    return (
        CoinalizeHistoryClient(environment=environment or {}, connection_factory=factory),
        opened,
    )


def test_a_successful_fetch_returns_the_body_and_is_flagged_a_success() -> None:
    """The whole reason this client exists over `HttpsQuotaProbe`: the body comes back."""
    client, _ = _client_with([FakeResponse(200, b'[{"symbol": "x", "history": []}]')])

    response = client.fetch("/v1/open-interest-history?symbols=x&interval=daily&from=0&to=1")

    assert response.status == 200
    assert response.body == b'[{"symbol": "x", "history": []}]'
    assert response.transport_error is None
    assert response.is_success is True


def test_a_non_2xx_status_is_not_a_success_but_is_not_raised_either() -> None:
    """A `404`/`401`/`5xx` is DATA, same argument `https_quota_probe.py` makes for `429`."""
    client, _ = _client_with([FakeResponse(401, b"unauthorized")])

    response = client.fetch("/v1/open-interest-history?symbols=x&interval=daily&from=0&to=1")

    assert response.status == 401
    assert response.is_success is False


def test_a_transport_failure_becomes_a_response_and_drops_the_connection() -> None:
    """A dead send must not look like a `200` with empty history."""
    client, opened = _client_with([ConnectionResetError("reset")])

    response = client.fetch("/v1/liquidation-history?symbols=x&interval=daily&from=0&to=1")

    assert response.status is None
    assert response.transport_error is not None
    assert "ConnectionResetError" in response.transport_error
    assert opened[0].closed is True


def test_the_connection_is_reused_across_calls() -> None:
    """One connection serves the whole sweep — fewer TLS handshakes over ~1.140 calls."""
    client, opened = _client_with([FakeResponse(200, b"[]"), FakeResponse(200, b"[]")])

    client.fetch("/v1/open-interest-history?symbols=a&interval=daily&from=0&to=1")
    client.fetch("/v1/liquidation-history?symbols=a&interval=daily&from=0&to=1")

    assert len(opened) == 1
    assert len(opened[0].requests) == 2
    client.close()
    assert opened[0].closed is True


def test_the_body_is_always_drained_before_the_connection_is_reused() -> None:
    """An undrained response would desynchronise keep-alive on the next call."""
    response = FakeResponse(200, b"[]")
    client, _ = _client_with([response])

    client.fetch("/v1/open-interest-history?symbols=a&interval=daily&from=0&to=1")

    assert response.drained is True


def test_the_api_key_header_is_sent_when_present_in_the_environment() -> None:
    """The key never lives in this module — it is read from the injected environment."""
    client, opened = _client_with(
        [FakeResponse(200, b"[]")], environment={COINALYZE_KEY_VARIABLE: "secret-key"}
    )

    client.fetch("/v1/open-interest-history?symbols=a&interval=daily&from=0&to=1")

    assert opened[0].requests[0][2]["api_key"] == "secret-key"


def test_no_key_in_the_environment_sends_no_api_key_header() -> None:
    """A missing key is visible downstream as a `401`, never a crash at composition time."""
    client, opened = _client_with([FakeResponse(200, b"[]")], environment={})

    client.fetch("/v1/open-interest-history?symbols=a&interval=daily&from=0&to=1")

    assert "api_key" not in opened[0].requests[0][2]


def test_a_response_cannot_carry_both_a_status_and_a_transport_error() -> None:
    """The XOR the whole class is built on, checked directly at the type."""
    with pytest.raises(ValueError, match="OU"):
        CoinalizeHistoryResponse(status=200, transport_error="boom")


def test_a_response_must_carry_one_of_status_or_transport_error() -> None:
    """Neither present is the silent-collapse state this class exists to forbid."""
    with pytest.raises(ValueError, match="OU"):
        CoinalizeHistoryResponse()


def test_a_factory_that_cannot_even_open_is_reported_as_a_transport_failure() -> None:
    """`_drop` must survive a host that never made it into the connection slot."""

    def refusing_factory(host: str) -> FakeConnection:
        raise ConnectionRefusedError(f"connection refused: {host}")

    client = CoinalizeHistoryClient(environment={}, connection_factory=refusing_factory)

    response = client.fetch("/v1/open-interest-history?symbols=a&interval=daily&from=0&to=1")

    assert response.status is None
    assert "ConnectionRefusedError" in (response.transport_error or "")
    client.close()
