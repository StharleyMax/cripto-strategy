"""GET the three public `fapi.binance.com` endpoints a daily instrument snapshot needs."""

# Same connection shape as `https_quota_probe.py`, for the same two reasons: `http.client`
# (never `urllib.request`, which hides the status and follows redirects), and a connection
# FACTORY the test suite injects a fake into — `backend/scripts/test.sh` amputates `socket`, so
# nothing in this file's test can open one.
#
# Unlike `https_quota_probe.py` this client reads the BODY and decodes it as JSON — that is the
# whole point of `exchangeInfo`/`fundingInfo`/`premiumIndex`, none of which publish anything
# useful in a header. No key is needed: all three endpoints are public (`SPEC-001` §3.4).

from __future__ import annotations

import http.client
import json
from collections.abc import Callable, Mapping
from typing import Final, Protocol, cast

from src.modules.sentimento.domain.instrument_universe_snapshot import (
    ExchangeInfoPayload,
    FundingInfoEntry,
    PremiumIndexEntry,
)

FAPI_HOST: Final[str] = "fapi.binance.com"

EXCHANGE_INFO_PATH: Final[str] = "/fapi/v1/exchangeInfo"
FUNDING_INFO_PATH: Final[str] = "/fapi/v1/fundingInfo"
PREMIUM_INDEX_PATH: Final[str] = "/fapi/v1/premiumIndex"

DEFAULT_USER_AGENT: Final[str] = (
    "cripto-strategy/T-02.1-snapshot-diario (captura diaria; contato via repo)"
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
    """A connection to one host — the same shape `https_quota_probe.py` depends on."""

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


class UnexpectedStatusError(Exception):
    """A snapshot endpoint answered something other than `200` — the capture refuses to guess.

    `SPEC-001` §5.3/§5.6 govern how an ABSENCE is read once it is stored; this exception is
    earlier than that — it stops a non-`200` from being decoded as if it were data at all.
    """


class BinanceFuturesSnapshotClient:
    """One connection per call, to the three public `fapi.binance.com` snapshot endpoints."""

    def __init__(
        self,
        connection_factory: ConnectionFactory = open_https_connection,
        host: str = FAPI_HOST,
        user_agent: str = DEFAULT_USER_AGENT,
    ) -> None:
        """Wire the client to a host and a way of opening connections; nothing is sent here."""
        self._connection_factory = connection_factory
        self._host = host
        self._user_agent = user_agent

    def _get_json(self, path: str) -> object:
        """`GET path`, decode the body as JSON, and always close the connection afterwards.

        A NEW connection per call, unlike `HttpsQuotaProbe`'s keep-alive pool — this client
        makes three or four calls total per run (never a ramp), so the extra handshake cost is
        not worth the complexity of a pool nothing else here would reuse.
        """
        connection = self._connection_factory(self._host)
        try:
            headers = {"User-Agent": self._user_agent, "Accept": "application/json"}
            connection.request("GET", path, headers=headers)
            response = connection.getresponse()
            body = response.read()
            if response.status != 200:
                raise UnexpectedStatusError(
                    f"{self._host}{path} respondeu {response.status}, esperado 200: {body[:200]!r}"
                )
            return json.loads(body)
        finally:
            connection.close()

    def exchange_info(self) -> ExchangeInfoPayload:
        """`GET /fapi/v1/exchangeInfo` — the USDⓈ-M side of the universe."""
        return cast(ExchangeInfoPayload, self._get_json(EXCHANGE_INFO_PATH))

    def funding_info(self) -> list[FundingInfoEntry]:
        """`GET /fapi/v1/fundingInfo` — USDⓈ-M plus the COIN-M entries it also carries."""
        return cast("list[FundingInfoEntry]", self._get_json(FUNDING_INFO_PATH))

    def premium_index(self) -> list[PremiumIndexEntry]:
        """`GET /fapi/v1/premiumIndex` — the second witness, and the source of `interestRate`."""
        return cast("list[PremiumIndexEntry]", self._get_json(PREMIUM_INDEX_PATH))
