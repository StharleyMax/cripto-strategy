"""`BinanceServerTimeProbe` wired to a FAKE connection — proving it needs no socket to be tested.

Same discipline as `tests/sentimento/test_quota_ramp_bench_offline.py`: the probe that runs the
live measurement is the SAME object exercised here, only the connection factory differs.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence

import pytest

from src.modules.sentimento.infra.binance_server_time_probe import (
    FAPI_HOST,
    SERVER_TIME_PATH,
    BinanceServerTimeProbe,
    MalformedServerTimeError,
)


class FakeResponse:
    """A canned response — must be `read()` before its bytes are visible, like the real one."""

    def __init__(self, status: int, headers: Sequence[tuple[str, str]], body: bytes) -> None:
        """Take the status line, the header pairs and the body to hand back."""
        self.status = status
        self._headers = list(headers)
        self._body = body

    def getheaders(self) -> list[tuple[str, str]]:
        """Return the header pairs."""
        return list(self._headers)

    def read(self) -> bytes:
        """Return the canned body."""
        return self._body


class FakeConnection:
    """Never opens a socket, and records the request and whether it was closed."""

    def __init__(self, host: str, response: FakeResponse) -> None:
        """Take the host it pretends to serve and the response to replay."""
        self.host = host
        self._response = response
        self.requests: list[tuple[str, str, Mapping[str, str]]] = []
        self.closed = False

    def request(
        self, method: str, url: str, body: None = None, headers: Mapping[str, str] | None = None
    ) -> None:
        """Record the request; the response is fixed at construction time."""
        self.requests.append((method, url, dict(headers or {})))

    def getresponse(self) -> FakeResponse:
        """Hand back the response for the request just recorded."""
        return self._response

    def close(self) -> None:
        """Mark the connection closed."""
        self.closed = True


def _probe_with(response: FakeResponse) -> tuple[BinanceServerTimeProbe, list[FakeConnection]]:
    opened: list[FakeConnection] = []

    def factory(host: str) -> FakeConnection:
        connection = FakeConnection(host, response)
        opened.append(connection)
        return connection

    return BinanceServerTimeProbe(connection_factory=factory), opened


def test_a_clean_response_yields_server_time_and_the_measured_weight() -> None:
    """The happy path: `serverTime` parsed, weight read from the header, not guessed."""
    body = json.dumps({"serverTime": 1_788_303_016_165}).encode("utf-8")
    response = FakeResponse(200, [("x-mbx-used-weight-1m", "2")], body)
    probe, opened = _probe_with(response)

    observation = probe.observe()

    assert observation.server_time_ms == 1_788_303_016_165
    assert observation.http_status == 200
    assert observation.weight_used == 2
    assert observation.body_sha256 == hashlib.sha256(body).hexdigest()
    assert opened[0].host == FAPI_HOST
    method, url, _headers = opened[0].requests[0]
    assert method == "GET"
    assert url == SERVER_TIME_PATH
    assert opened[0].closed is True


def test_a_response_with_no_weight_header_reports_weight_as_none() -> None:
    """`D3.12` already found a Binance family with zero `x-mbx-*` headers: this must not crash."""
    body = json.dumps({"serverTime": 1}).encode("utf-8")
    response = FakeResponse(200, [], body)
    probe, _ = _probe_with(response)

    observation = probe.observe()

    assert observation.weight_used is None


def test_the_weight_header_is_read_case_insensitively() -> None:
    """HTTP header names are case-insensitive; a strict-case read would silently miss it."""
    body = json.dumps({"serverTime": 1}).encode("utf-8")
    response = FakeResponse(200, [("X-MBX-USED-WEIGHT-1M", "7")], body)
    probe, _ = _probe_with(response)

    assert probe.observe().weight_used == 7


def test_a_non_integer_weight_header_becomes_none_rather_than_crashing() -> None:
    """A header the provider is free to change shape on must degrade to absence, not a traceback."""
    body = json.dumps({"serverTime": 1}).encode("utf-8")
    response = FakeResponse(200, [("x-mbx-used-weight-1m", "not-a-number")], body)
    probe, _ = _probe_with(response)

    assert probe.observe().weight_used is None


def test_a_non_200_status_is_refused_not_silently_accepted() -> None:
    """The falsifier: a `429`/`5xx` on this endpoint must never be read as a valid skew source."""
    response = FakeResponse(503, [], b"upstream unavailable")
    probe, opened = _probe_with(response)

    with pytest.raises(MalformedServerTimeError, match="503"):
        probe.observe()

    assert opened[0].closed is True


def test_a_body_without_json_is_refused() -> None:
    """Garbage on the wire must raise, never be silently interpreted as `serverTime=0`."""
    response = FakeResponse(200, [], b"not json at all")
    probe, _ = _probe_with(response)

    with pytest.raises(MalformedServerTimeError):
        probe.observe()


def test_a_body_missing_the_server_time_key_is_refused() -> None:
    """Valid JSON with the wrong shape is still a malformed answer for THIS probe's purpose."""
    response = FakeResponse(200, [], json.dumps({"unexpected": True}).encode("utf-8"))
    probe, _ = _probe_with(response)

    with pytest.raises(MalformedServerTimeError):
        probe.observe()


def test_the_connection_is_closed_even_when_the_body_is_malformed() -> None:
    """A parse failure after the socket opened must not leak the connection."""
    response = FakeResponse(200, [], b"{}")
    probe, opened = _probe_with(response)

    with pytest.raises(MalformedServerTimeError):
        probe.observe()

    assert opened[0].closed is True
