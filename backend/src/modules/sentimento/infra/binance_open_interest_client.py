"""`GET /fapi/v1/openInterest?symbol=…` — one call per symbol, the `time` of the answer kept."""

# Reuses the connection machinery of `https_quota_probe.py` (`ConnectionFactory`,
# `HttpConnection`, `open_https_connection`, `flatten_headers`), the same way
# `premium_index_http_client.py` does and for the same reason: socket-touching code in this
# package describes the connection contract ONCE (`ADR-011/D3a`). `backend/scripts/test.sh`
# amputates `socket`, so the suite injects a fake factory; the real one is reached only from the
# collector process.
#
# One keep-alive connection, rebuilt on `OSError` (`PremiumIndexHttpClient`'s lifecycle): the
# collector of `T-03.4` calls this four times a minute, forever, and a broken keep-alive must not
# poison every following call. No key: the endpoint is public (`SPEC-009` §6.1).
#
# What this file does NOT decide: which minute of the grid a reading belongs to (`T-03.2`, the
# `[T - 20 s, T]` admission window) and whether the quota share stays `<= 4/min` (`T-03.4`,
# `DoD-2` of `03a`). It hands both of them the two facts they need, READ off the response: the
# source's `time` (inside `OpenInterestSnapshot.event_time_ms`) and `x-mbx-used-weight-1m`.

from __future__ import annotations

import json
from typing import Final
from urllib.parse import urlencode

from src.modules.sentimento.domain.open_interest_snapshot import (
    OPEN_INTEREST_SNAPSHOT_ENDPOINT,
    InvalidOpenInterestSnapshotError,
    OpenInterestFetch,
    OpenInterestFetchOutcome,
    parse_open_interest_snapshot,
    read_used_weight,
)
from src.modules.sentimento.domain.quota_bucket import USED_WEIGHT_HEADER
from src.modules.sentimento.infra.https_quota_probe import (
    ConnectionFactory,
    HttpConnection,
    flatten_headers,
    open_https_connection,
)

OPEN_INTEREST_HOST: Final[str] = "fapi.binance.com"

DEFAULT_USER_AGENT: Final[str] = "cripto-strategy/T-03.1-open-interest-collector (contato via repo)"

# How much of a refused body travels in `failure`: enough to carry Binance's `{"code","msg"}`
# envelope (`{"code":-1121,"msg":"Invalid symbol."}` is 38 bytes), bounded so an HTML error page
# from a proxy cannot bloat a log line.
_FAILURE_BODY_PREVIEW_BYTES: Final[int] = 200


class BinanceOpenInterestClient:
    """One reused connection to `fapi.binance.com`, rebuilt whenever it breaks."""

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
            self._connection = self._connection_factory(OPEN_INTEREST_HOST)
        return self._connection

    def _drop(self) -> None:
        """Forget the current connection so the next call opens a fresh one."""
        if self._connection is not None:
            self._connection.close()
            self._connection = None

    def fetch(self, symbol: str) -> OpenInterestFetch:
        """Issue one GET for `symbol` and classify the answer into one closed outcome.

        `OSError` becomes `TRANSPORT` instead of propagating (the collector reads one vocabulary
        of outcomes, never socket exceptions); a non-`200` becomes `HTTP_STATUS` with the weight
        still read, because Binance charges a refused call too (`[MEDIDO 2026-09-24: 400
        {"code":-1121} com x-mbx-used-weight-1m: 1]`). Nothing here reads a clock: the reading's
        instant is the response's `time`, and only `parse_open_interest_snapshot` extracts it.
        """
        path = f"{OPEN_INTEREST_SNAPSHOT_ENDPOINT}?{urlencode({'symbol': symbol})}"
        headers = {"User-Agent": self._user_agent, "Accept": "application/json"}
        try:
            connection = self._connection_now()
            connection.request("GET", path, headers=headers)
            response = connection.getresponse()
            status = response.status
            flat = flatten_headers(response.getheaders())
            body = response.read()
        except OSError as failure:
            self._drop()
            return OpenInterestFetch(
                symbol=symbol,
                outcome=OpenInterestFetchOutcome.TRANSPORT,
                status=None,
                weight_used=None,
                snapshot=None,
                failure=f"{type(failure).__name__}: {failure}",
            )
        weight_used = read_used_weight(flat.get(USED_WEIGHT_HEADER))
        if status != 200:
            return OpenInterestFetch(
                symbol=symbol,
                outcome=OpenInterestFetchOutcome.HTTP_STATUS,
                status=status,
                weight_used=weight_used,
                snapshot=None,
                failure=f"status {status}: {body[:_FAILURE_BODY_PREVIEW_BYTES]!r}",
            )
        try:
            snapshot = parse_open_interest_snapshot(json.loads(body), symbol)
        except (json.JSONDecodeError, UnicodeDecodeError, InvalidOpenInterestSnapshotError) as bad:
            return OpenInterestFetch(
                symbol=symbol,
                outcome=OpenInterestFetchOutcome.PAYLOAD,
                status=status,
                weight_used=weight_used,
                snapshot=None,
                failure=f"{type(bad).__name__}: {bad}",
            )
        return OpenInterestFetch(
            symbol=symbol,
            outcome=OpenInterestFetchOutcome.READ,
            status=status,
            weight_used=weight_used,
            snapshot=snapshot,
            failure=None,
        )

    def close(self) -> None:
        """Close the connection, if one is open."""
        self._drop()
