"""`T-03.1` infra: the client replays responses READ from Binance through a FAKE connection.

Zero socket (`backend/scripts/test.sh` amputates it). The status, headers and bodies replayed
below are the ones Binance actually answered — reading the origin is not seeding, and nothing
here touches any Postgres:

    date +%s%3N; curl -sS -D hdr.txt "https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT"
    -> 2026-09-24, request sent at epoch-ms 1790287796821
    -> HTTP/2 200 · x-mbx-used-weight-1m: 1 · date: Thu, 24 Sep 2026 22:09:57 GMT
    -> {"symbol":"BTCUSDT","openInterest":"96012.544","time":1790287793703}

    curl -sS -D hdr.txt "https://fapi.binance.com/fapi/v1/openInterest?symbol=NOSUCHUSDT"
    -> HTTP/2 400 · x-mbx-used-weight-1m: 1 · {"code":-1121,"msg":"Invalid symbol."}
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence

import pytest

from src.modules.sentimento.domain.open_interest_snapshot import (
    OPEN_INTEREST_SNAPSHOT_ENDPOINT,
    OpenInterestFetchOutcome,
)
from src.modules.sentimento.infra.binance_open_interest_client import (
    OPEN_INTEREST_HOST,
    BinanceOpenInterestClient,
)

REAL_BTC_BODY = b'{"symbol":"BTCUSDT","openInterest":"96012.544","time":1790287793703}'
REAL_BTC_TIME_MS = 1_790_287_793_703
REAL_BTC_REQUEST_SENT_MS = 1_790_287_796_821
# The `date` header of the same answer — the RECEPTION instant, to the second (22:09:57 UTC).
REAL_BTC_DATE_HEADER_MS = 1_790_287_797_000

# The header block of the real `200`, minus the CloudFront request id (a per-request nonce).
REAL_BTC_HEADERS: tuple[tuple[str, str], ...] = (
    ("content-type", "application/json"),
    ("content-length", "68"),
    ("date", "Thu, 24 Sep 2026 22:09:57 GMT"),
    ("server", "nginx"),
    ("x-mbx-used-weight-1m", "1"),
    ("x-response-time", "0ms"),
    ("cache-control", "no-cache, no-store, must-revalidate"),
    ("x-cache", "Miss from cloudfront"),
)

REAL_INVALID_SYMBOL_BODY = b'{"code":-1121,"msg":"Invalid symbol."}'
REAL_INVALID_SYMBOL_HEADERS: tuple[tuple[str, str], ...] = (
    ("content-type", "application/json"),
    ("x-mbx-used-weight-1m", "1"),
)


class FakeResponse:
    """A canned response; the shape `https_quota_probe.HttpResponse` declares."""

    def __init__(self, status: int, headers: Sequence[tuple[str, str]], body: bytes) -> None:
        """Take the status line, header pairs and body to hand back."""
        self.status = status
        self._headers = list(headers)
        self._body = body

    def getheaders(self) -> list[tuple[str, str]]:
        """Return the header pairs, repeats included."""
        return list(self._headers)

    def read(self) -> bytes:
        """Return the canned body."""
        return self._body


class FakeConnection:
    """Never opens a socket; replays scripted responses or raises scripted `OSError`s."""

    def __init__(self, host: str, responses: list[FakeResponse | OSError]) -> None:
        """Take the host it pretends to serve and the SHARED script of responses, in order.

        The list is consumed in place, not copied: a reconnect after a dead socket picks up the
        script where the broken connection left it.
        """
        self.host = host
        self._responses = responses
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


def _client_replaying(
    *responses: FakeResponse | OSError,
) -> tuple[BinanceOpenInterestClient, list[FakeConnection]]:
    """Build a client whose every connection replays `responses`, recording each connection."""
    connections: list[FakeConnection] = []
    remaining = list(responses)

    def factory(host: str) -> FakeConnection:
        connection = FakeConnection(host, remaining)
        connections.append(connection)
        return connection

    return BinanceOpenInterestClient(connection_factory=factory), connections


def test_the_real_answer_is_read_at_its_own_time_never_at_the_request_or_reception_instant() -> (
    None
):
    """MORDE: the `event_time` is the body's `time`, older than BOTH instants this side knows.

    `time` (…793703) < request sent (…796821) < `date` header (…797000). Any stamp taken from
    this side of the wire — the request instant, the reception instant, the `date` header — lands
    after the reading Binance actually took, and this assertion reprova each of them.
    """
    client, connections = _client_replaying(FakeResponse(200, REAL_BTC_HEADERS, REAL_BTC_BODY))

    fetch = client.fetch("BTCUSDT")

    assert fetch.outcome is OpenInterestFetchOutcome.READ
    assert fetch.snapshot is not None
    assert fetch.snapshot.event_time_ms == REAL_BTC_TIME_MS
    assert fetch.snapshot.event_time_ms not in {REAL_BTC_REQUEST_SENT_MS, REAL_BTC_DATE_HEADER_MS}
    assert fetch.snapshot.open_interest_raw == "96012.544"
    assert fetch.snapshot.symbol == "BTCUSDT"
    assert fetch.status == 200
    assert fetch.failure is None
    assert connections[0].host == OPEN_INTEREST_HOST


def test_the_used_weight_header_is_read_off_the_response() -> None:
    """`x-mbx-used-weight-1m` is READ, which is what lets `T-03.4` prove its `<= 4/min` share."""
    headers = tuple((n, "19" if n == "x-mbx-used-weight-1m" else v) for n, v in REAL_BTC_HEADERS)
    client, _ = _client_replaying(FakeResponse(200, headers, REAL_BTC_BODY))

    assert client.fetch("BTCUSDT").weight_used == 19


def test_the_weight_header_is_matched_regardless_of_case() -> None:
    """HTTP/2 lower-cases header names; `http.client` over HTTP/1.1 hands back the server's case."""
    client, _ = _client_replaying(FakeResponse(200, [("X-MBX-USED-WEIGHT-1M", "3")], REAL_BTC_BODY))

    assert client.fetch("BTCUSDT").weight_used == 3


def test_an_answer_without_the_weight_header_is_still_read_but_its_weight_is_unknown() -> None:
    """A missing counter is "not observed" (`None`), never a spend of zero."""
    client, _ = _client_replaying(FakeResponse(200, [], REAL_BTC_BODY))

    fetch = client.fetch("BTCUSDT")

    assert fetch.outcome is OpenInterestFetchOutcome.READ
    assert fetch.weight_used is None


def test_the_request_asks_for_exactly_one_symbol_on_the_present_value_endpoint() -> None:
    """One symbol, no `startTime`/`endTime`/`period`: this endpoint has no history to ask for."""
    client, connections = _client_replaying(FakeResponse(200, REAL_BTC_HEADERS, REAL_BTC_BODY))

    client.fetch("BTCUSDT")

    method, url, headers = connections[0].requests[0]
    assert method == "GET"
    assert url == f"{OPEN_INTEREST_SNAPSHOT_ENDPOINT}?symbol=BTCUSDT"
    assert headers["Accept"] == "application/json"
    assert "T-03.1" in headers["User-Agent"]


def test_the_real_invalid_symbol_answer_is_a_status_failure_that_still_reports_its_weight() -> None:
    """Binance charges a refused call too, so the weight of a `400` is read, not dropped."""
    client, _ = _client_replaying(
        FakeResponse(400, REAL_INVALID_SYMBOL_HEADERS, REAL_INVALID_SYMBOL_BODY)
    )

    fetch = client.fetch("NOSUCHUSDT")

    assert fetch.outcome is OpenInterestFetchOutcome.HTTP_STATUS
    assert fetch.status == 400
    assert fetch.weight_used == 1
    assert fetch.snapshot is None
    assert fetch.failure is not None
    assert "-1121" in fetch.failure


@pytest.mark.parametrize(
    ("body", "detail"),
    [
        (b"<html>502 Bad Gateway</html>", "JSONDecodeError"),
        (b"\x80abc", "UnicodeDecodeError"),
        (
            b'{"symbol":"ETHUSDT","openInterest":"2273930.468","time":1790287791035}',
            "InvalidOpenInterestSnapshotError",
        ),
    ],
    ids=["html-body", "undecodable-bytes", "another-symbols-real-answer"],
)
def test_a_200_that_is_not_a_reading_of_the_requested_symbol_is_a_payload_failure(
    body: bytes, detail: str
) -> None:
    """`200` is not enough: a body that is not this symbol's reading never becomes a snapshot."""
    client, _ = _client_replaying(FakeResponse(200, REAL_BTC_HEADERS, body))

    fetch = client.fetch("BTCUSDT")

    assert fetch.outcome is OpenInterestFetchOutcome.PAYLOAD
    assert fetch.snapshot is None
    assert fetch.weight_used == 1
    assert fetch.failure is not None
    assert detail in fetch.failure


def test_a_dead_socket_is_a_transport_failure_and_the_next_call_opens_a_fresh_connection() -> None:
    """`OSError` never escapes; a broken keep-alive is dropped, never poisoning the next call."""
    client, connections = _client_replaying(
        ConnectionResetError("peer closed"), FakeResponse(200, REAL_BTC_HEADERS, REAL_BTC_BODY)
    )

    first = client.fetch("BTCUSDT")
    second = client.fetch("BTCUSDT")

    assert first.outcome is OpenInterestFetchOutcome.TRANSPORT
    assert first.status is None
    assert first.weight_used is None
    assert first.failure == "ConnectionResetError: peer closed"
    assert connections[0].closed
    assert len(connections) == 2
    assert second.outcome is OpenInterestFetchOutcome.READ


def test_consecutive_calls_reuse_one_connection_until_closed() -> None:
    """Four calls a minute, forever: one keep-alive, closed only by `close()`."""
    client, connections = _client_replaying(
        FakeResponse(200, REAL_BTC_HEADERS, REAL_BTC_BODY),
        FakeResponse(200, REAL_BTC_HEADERS, REAL_BTC_BODY),
    )

    client.fetch("BTCUSDT")
    client.fetch("BTCUSDT")

    assert len(connections) == 1
    assert len(connections[0].requests) == 2
    assert not connections[0].closed
    client.close()
    assert connections[0].closed
    client.close()
