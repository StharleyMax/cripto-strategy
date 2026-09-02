"""One GET against the public batch `premiumIndex` endpoint — no key, no query string."""

# Reuses the connection machinery of `https_quota_probe.py` (`ConnectionFactory`,
# `HttpConnection`, `open_https_connection`, `flatten_headers`) instead of redeclaring the same
# `http.client` Protocol a second time: two modules that open a socket and describe the
# connection contract differently is the crack a future reviewer would have to notice by
# reading both, and `ADR-011/D3a`'s "Natureza" contract exists so socket-touching code is rare
# and shared, not so it multiplies quietly. The only NEW thing here is that the response BODY
# is kept — `HttpsQuotaProbe.probe()` drains and discards it, which is correct for a probe that
# only ever reads headers and wrong for a collector that has to parse the batch.
#
# `premiumIndex` needs no API key (public Binance Futures endpoint) and no `symbol` filter
# (that omission IS the batch call — see `domain/premium_index_batch.py`), so this client is
# simpler than `HttpsQuotaProbe`: one host, one path, no per-request auth headers.

from __future__ import annotations

from typing import Final

from src.modules.sentimento.domain.premium_index_batch import PREMIUM_INDEX_ENDPOINT
from src.modules.sentimento.infra.https_quota_probe import (
    ConnectionFactory,
    HttpConnection,
    flatten_headers,
    open_https_connection,
)
from src.modules.sentimento.use_cases.collect_premium_index import RawPremiumIndexFetch

PREMIUM_INDEX_HOST: Final[str] = "fapi.binance.com"

DEFAULT_USER_AGENT: Final[str] = "cripto-strategy/T-03.5-premium-index-collector (contato via repo)"


class PremiumIndexHttpClient:
    """One reused connection to `fapi.binance.com`, rebuilt whenever it breaks.

    Mirrors `HttpsQuotaProbe`'s connection lifecycle (one connection per host, dropped and
    rebuilt on `OSError`) because the failure mode is the same one that module already solved:
    a broken keep-alive connection must not silently poison every following call.
    """

    def __init__(
        self,
        connection_factory: ConnectionFactory = open_https_connection,
        user_agent: str = DEFAULT_USER_AGENT,
    ) -> None:
        """Wire the client to a way of opening connections, without opening one yet."""
        self._connection_factory = connection_factory
        self._user_agent = user_agent
        self._connection: HttpConnection | None = None

    def _connection_now(self) -> HttpConnection:
        """Return the live connection, opening one the first time it is needed."""
        if self._connection is None:
            self._connection = self._connection_factory(PREMIUM_INDEX_HOST)
        return self._connection

    def _drop(self) -> None:
        """Forget the current connection so the next call opens a fresh one."""
        if self._connection is not None:
            self._connection.close()
            self._connection = None

    def fetch(self) -> RawPremiumIndexFetch:
        """Issue one GET to the batch endpoint, never a query string that could ask for history.

        `OSError` becomes a `transport_error` rather than propagating, matching
        `HttpsQuotaProbe.probe()`: a caller of `collect_premium_index_once` reads one closed
        vocabulary of outcomes instead of catching sockets exceptions itself.
        """
        headers = {"User-Agent": self._user_agent, "Accept": "application/json"}
        try:
            connection = self._connection_now()
            connection.request("GET", PREMIUM_INDEX_ENDPOINT, headers=headers)
            response = connection.getresponse()
            status = response.status
            flat = flatten_headers(response.getheaders())
            body = response.read()
        except OSError as failure:
            self._drop()
            return RawPremiumIndexFetch(transport_error=f"{type(failure).__name__}: {failure}")
        return RawPremiumIndexFetch(status=status, headers=flat, body=body)

    def close(self) -> None:
        """Close the connection, if one is open."""
        self._drop()
