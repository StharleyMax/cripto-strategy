"""GET `/futures/data/openInterestHist`, always with BOTH `startTime` and `endTime` set."""

# Same connection shape as `binance_futures_snapshot_client.py`: `http.client` (never
# `urllib.request`), a connection FACTORY the test suite injects a fake into, one connection per
# call. The one thing this client's signature enforces beyond that precedent is `T-07.1`'s central
# rule: it takes a `ClosedWindow` (`domain/oi_history_paginator.py`), whose two bounds are BOTH
# required fields — there is no code path in this client that can send `startTime` without
# `endTime`, because there is no way to construct the window without giving it both.
#
# This client does not decide ACCEPTED/REJECTED — that is `classify_page`'s job in `domain`, kept
# there because it is a business rule and this file is `infra`. All this file does is dispatch the
# request and translate the JSON body into `OiHistoryPageResponse`, which is XOR by construction.

from __future__ import annotations

import http.client
import json
from collections.abc import Callable, Mapping
from typing import Final, Protocol, cast
from urllib.parse import urlencode

from src.modules.sentimento.domain.oi_history_paginator import ClosedWindow, OiHistoryPageResponse

FAPI_DATA_HOST: Final[str] = "fapi.binance.com"
OPEN_INTEREST_HIST_PATH: Final[str] = "/futures/data/openInterestHist"

DEFAULT_USER_AGENT: Final[str] = (
    "cripto-strategy/T-07.1-paginador-janela-fechada (backfill; contato via repo)"
)


class HttpResponseLike(Protocol):
    """The two things this client needs from a response."""

    @property
    def status(self) -> int:
        """Return the HTTP status line's code."""
        ...

    def read(self) -> bytes:
        """Drain the body, which MUST happen before the connection can be reused."""
        ...


class HttpConnectionLike(Protocol):
    """A connection to one host — the same shape `BinanceFuturesSnapshotClient` depends on."""

    def request(
        self,
        method: str,
        url: str,
        body: None = ...,
        headers: Mapping[str, str] = ...,
    ) -> None:
        """Send one request."""
        ...

    def getresponse(self) -> HttpResponseLike:
        """Read the response for the request just sent."""
        ...

    def close(self) -> None:
        """Drop the connection."""
        ...


ConnectionFactory = Callable[[str], HttpConnectionLike]


def open_https_connection(host: str) -> HttpConnectionLike:  # pragma: no cover - the socket itself
    """Open a real TLS connection to `host` — the only line here that touches the network."""
    return http.client.HTTPSConnection(host, timeout=20.0)


class UnexpectedPayloadShapeError(Exception):
    """The body decoded to neither an error envelope (`dict` with `code`) nor a list of points."""


class BinanceOiHistoryClient:
    """One connection per page, to the public `openInterestHist` endpoint."""

    def __init__(
        self,
        connection_factory: ConnectionFactory = open_https_connection,
        host: str = FAPI_DATA_HOST,
        user_agent: str = DEFAULT_USER_AGENT,
    ) -> None:
        """Wire the client to a host and a way of opening connections; nothing is sent here."""
        self._connection_factory = connection_factory
        self._host = host
        self._user_agent = user_agent

    def open_interest_history(
        self, symbol: str, period: str, window: ClosedWindow, limit: int
    ) -> OiHistoryPageResponse:
        """`GET openInterestHist` for `window`, sending `startTime` AND `endTime` together.

        `window` being a `ClosedWindow` is what makes the dangerous call `D7.3` measured
        (`startTime` alone) unrepresentable here — both bounds are required fields of that type.
        """
        params = {
            "symbol": symbol,
            "period": period,
            "startTime": str(window.start_time_ms),
            "endTime": str(window.end_time_ms),
            "limit": str(limit),
        }
        path = f"{OPEN_INTEREST_HIST_PATH}?{urlencode(params)}"
        connection = self._connection_factory(self._host)
        try:
            headers = {"User-Agent": self._user_agent, "Accept": "application/json"}
            connection.request("GET", path, headers=headers)
            response = connection.getresponse()
            body = response.read()
            payload = json.loads(body)
            if isinstance(payload, dict) and "code" in payload:
                return OiHistoryPageResponse(
                    status=response.status, api_code=int(cast(int, payload["code"])), points=()
                )
            if isinstance(payload, list):
                return OiHistoryPageResponse(
                    status=response.status,
                    api_code=None,
                    points=tuple(cast("list[Mapping[str, object]]", payload)),
                )
            raise UnexpectedPayloadShapeError(
                f"{self._host}{OPEN_INTEREST_HIST_PATH} body is neither an error envelope nor a "
                f"list of points: {body[:200]!r}"
            )
        finally:
            connection.close()
