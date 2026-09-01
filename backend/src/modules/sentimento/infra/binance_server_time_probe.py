"""One HTTPS call to `GET /fapi/v1/time` — the only network this clock-skew probe needs."""

# `backend/scripts/test.sh` amputates `socket`, so nothing here contradicts "ZERO REDE": the
# connection is built by an INJECTED factory, and the suite injects a fake. The real factory —
# `http.client.HTTPSConnection` — is reached only from `infra/ntp_skew_probe_cli.py`, which a
# human runs by hand and which no gate calls. Same shape as `infra/https_quota_probe.py`, and
# for the same three reasons documented there: `http.client` surfaces a non-2xx status as DATA
# instead of an exception, never follows a redirect, and is HTTPS by construction (`ruff` `S310`).
#
# Zero API key: `/fapi/v1/time` is public (`T-03.8` handoff, `Q1`-independent).

from __future__ import annotations

import hashlib
import http.client
import json
from collections.abc import Callable, Mapping
from typing import Final, Protocol

from src.modules.sentimento.domain.clock_skew import ServerTimeObservation

FAPI_HOST: Final[str] = "fapi.binance.com"
SERVER_TIME_PATH: Final[str] = "/fapi/v1/time"

# Identifying the caller the same way `infra/https_quota_probe.py` does, and for the same
# reason: it is what lets Binance tell a measurement apart from an attack.
DEFAULT_USER_AGENT: Final[str] = (
    "cripto-strategy/T-03.8-ntp-skew (clock-skew probe; contact via repo)"
)

_WEIGHT_HEADER: Final[str] = "x-mbx-used-weight-1m"


class MalformedServerTimeError(Exception):
    """`/fapi/v1/time` answered, but not with a `serverTime` this probe can read."""


class HttpResponse(Protocol):
    """The three things this probe needs from a response."""

    @property
    def status(self) -> int:
        """Return the HTTP status line's code."""
        ...

    def getheaders(self) -> list[tuple[str, str]]:
        """Return every header as a pair."""
        ...

    def read(self) -> bytes:
        """Drain and return the body."""
        ...


class HttpConnection(Protocol):
    """A connection to one host, opened for exactly one request."""

    def request(
        self,
        method: str,
        url: str,
        body: None = ...,
        headers: Mapping[str, str] = ...,
    ) -> None:
        """Send one request."""
        ...

    def getresponse(self) -> HttpResponse:
        """Read the response for the request just sent."""
        ...

    def close(self) -> None:
        """Drop the connection."""
        ...


ConnectionFactory = Callable[[str], HttpConnection]


def open_https_connection(host: str) -> HttpConnection:  # pragma: no cover - the socket itself
    """Open a real TLS connection to `host` — the only line here that touches the network."""
    return http.client.HTTPSConnection(host, timeout=10.0)


def _weight_used(headers: Mapping[str, str]) -> int | None:
    """Read `x-mbx-used-weight-1m` case-insensitively; `None` when absent or unparseable.

    `D3.12` (`T-03.7`) already measured that a Binance family can answer `200` with ZERO
    `x-mbx-*` headers (`/futures/data/openInterestHist`). Reading the weight LIVE here, rather
    than hardcoding the value this project's own `curl` saw against `/fapi/v1/time` on
    2026-09-01 (`x-mbx-used-weight-1m: 2`), keeps the column truthful if Binance ever changes it.
    """
    for name, value in headers.items():
        if name.lower() == _WEIGHT_HEADER:
            try:
                return int(value)
            except ValueError:
                return None
    return None


class BinanceServerTimeProbe:
    """`ServerTimeSource` (of `use_cases/measure_clock_skew.py`) against the real endpoint."""

    def __init__(
        self,
        connection_factory: ConnectionFactory = open_https_connection,
        user_agent: str = DEFAULT_USER_AGENT,
    ) -> None:
        """Wire the probe to a way of opening connections, real by default."""
        self._connection_factory = connection_factory
        self._user_agent = user_agent

    def observe(self) -> ServerTimeObservation:
        """Issue one `GET /fapi/v1/time` and return the parsed `serverTime` plus its evidence.

        `OSError` (a dead socket, a timeout) is NOT caught here: `measure_clock_skew` has no
        sane fallback for "the network did not answer", and swallowing it here would be
        `core.silent-except` on the very capability this task exists to make trustworthy. The
        caller decides what a failed measurement means.
        """
        connection = self._connection_factory(FAPI_HOST)
        try:
            connection.request(
                "GET",
                SERVER_TIME_PATH,
                headers={"User-Agent": self._user_agent, "Accept": "application/json"},
            )
            response = connection.getresponse()
            status = response.status
            headers = {name.lower(): value for name, value in response.getheaders()}
            body = response.read()
        finally:
            connection.close()
        if status != 200:
            raise MalformedServerTimeError(
                f"GET {SERVER_TIME_PATH} returned {status}, expected 200: {body!r}"
            )
        try:
            payload = json.loads(body)
            server_time_ms = int(payload["serverTime"])
        except (json.JSONDecodeError, KeyError, TypeError, ValueError) as malformed:
            raise MalformedServerTimeError(
                f"GET {SERVER_TIME_PATH} returned a body without a usable 'serverTime': {body!r}"
            ) from malformed
        return ServerTimeObservation(
            server_time_ms=server_time_ms,
            http_status=status,
            weight_used=_weight_used(headers),
            body_sha256=hashlib.sha256(body).hexdigest(),
        )
