"""The real transport for the availability probe: fetch AND parse, in the one place both meet.

`ADR-016`: fetching is a CAPABILITY (`infra`); parsing an already-fetched body is not
(`domain/availability_poll.py`, `domain/coinalyze_daily_series.py`). This module is the seam —
same role `infra/binance_server_time_probe.py` plays for `measure_clock_skew`, extended to two
providers because this probe's `AvailabilityTransport` protocol needs one method per source.

Connection handling is `infra/https_quota_probe.py`'s, reused rather than re-derived: the same
`ConnectionFactory`/`HttpConnection` protocols, the same `authentication_headers(bucket, env)`
that already knows the Coinalyze key never touches this file directly (it is read from
`$COINALYZE_API_KEY` by that shared helper). `HttpsQuotaProbe` itself is not reused AS-IS
because it deliberately drains the body into nothing (`ProbeObservation` never carries one) —
this task is the first adapter in the package that needs the body AND two different hosts in
the same object, so the connection bookkeeping is duplicated in miniature rather than bent.
"""

from __future__ import annotations

import time
from collections.abc import Mapping
from typing import Final

from src.modules.sentimento.domain.availability_poll import (
    AvailabilityPollOutcome,
    parse_binance_latest_event_time_ms,
)
from src.modules.sentimento.domain.availability_probe_set import BinanceFuturesDataEndpoint
from src.modules.sentimento.domain.coinalyze_daily_series import (
    ENDPOINT_PATH_BY_KIND as COINALYZE_ENDPOINT_PATH_BY_KIND,
)
from src.modules.sentimento.domain.coinalyze_daily_series import (
    SeriesKind,
    parse_daily_points,
    to_coinalyze_symbol,
)
from src.modules.sentimento.domain.quota_bucket import BINANCE_FUTURES_DATA, COINALYZE, QuotaBucket
from src.modules.sentimento.infra.https_quota_probe import (
    ConnectionFactory,
    HttpConnection,
    authentication_headers,
    open_https_connection,
)

DEFAULT_USER_AGENT: Final[str] = (
    "cripto-strategy/T-03.6-availability-probe (medicao continua; contato via repo)"
)

# The cheapest request that still returns the single newest bucket
# (`infra/quota_ramp_cli.py` already measured this shape as the family's cheapest call).
_BINANCE_PATH_TEMPLATE: Final[str] = "/futures/data/{endpoint}?symbol={symbol}&period=5m&limit=1"

# `daily` (`T-02.2`'s own interval) would not move inside a several-minute proof run — this
# probe needs the FINEST interval Coinalyze publishes so a transition is observable at all
# (`docs/medicao-coinalyze.md` names `1min` as measured and available for OI and liquidation on
# this project's venue). The lookback window is generous on purpose: wide enough to guarantee
# the newest CLOSED bucket rides along even if the previous poll's window just missed it.
COINALYZE_HISTORY_INTERVAL: Final[str] = "1min"
COINALYZE_LOOKBACK_SECONDS: Final[int] = 900


def _fetch(
    connections: dict[str, HttpConnection],
    connection_factory: ConnectionFactory,
    environment: Mapping[str, str],
    user_agent: str,
    bucket: QuotaBucket,
    path: str,
) -> tuple[int | None, bytes, str | None]:
    """Issue one GET and return `(status, body, transport_error)` — never raising on a bad status.

    `OSError` is converted here, same control as `infra/https_quota_probe.py`'s `probe`: a
    request that never left the machine becomes a `transport_error`, and the connection for that
    host is dropped so the NEXT call opens a fresh one instead of retrying a dead socket.
    """
    headers = {"User-Agent": user_agent, "Accept": "application/json"}
    headers.update(authentication_headers(bucket, environment))
    try:
        if bucket.host not in connections:
            connections[bucket.host] = connection_factory(bucket.host)
        connection = connections[bucket.host]
        connection.request("GET", path, headers=headers)
        response = connection.getresponse()
        status = response.status
        body = response.read()
    except OSError as failure:
        stale = connections.pop(bucket.host, None)
        if stale is not None:
            stale.close()
        return None, b"", f"{type(failure).__name__}: {failure}"
    return status, body, None


class AvailabilityHttpClient:
    """`AvailabilityTransport` (of `use_cases/run_availability_probe.py`) against the real APIs.

    One keep-alive connection per host, reused across the whole continuous run and rebuilt
    whenever it breaks — the same discipline `infra/https_quota_probe.py`'s `HttpsQuotaProbe`
    already applies for the exact same reason: a probe meant to run "em regime" cannot afford to
    reopen a TCP+TLS handshake on every single call.
    """

    def __init__(
        self,
        environment: Mapping[str, str],
        connection_factory: ConnectionFactory = open_https_connection,
        user_agent: str = DEFAULT_USER_AGENT,
    ) -> None:
        """Wire the client to an environment (for the Coinalyze key) and a way of connecting."""
        self._environment = environment
        self._connection_factory = connection_factory
        self._user_agent = user_agent
        self._connections: dict[str, HttpConnection] = {}

    def poll_binance(
        self, endpoint: BinanceFuturesDataEndpoint, symbol: str
    ) -> AvailabilityPollOutcome:
        """Issue one Binance `/futures/data/*` call and return the parsed outcome."""
        path = _BINANCE_PATH_TEMPLATE.format(endpoint=endpoint.value, symbol=symbol)
        status, body, transport_error = _fetch(
            self._connections,
            self._connection_factory,
            self._environment,
            self._user_agent,
            BINANCE_FUTURES_DATA,
            path,
        )
        if transport_error is not None:
            return AvailabilityPollOutcome(transport_error=transport_error)
        if status != 200:
            return AvailabilityPollOutcome(status=status)
        latest = parse_binance_latest_event_time_ms(body)
        return AvailabilityPollOutcome(status=status, latest_event_time_ms=latest)

    def poll_coinalyze(self, kind: SeriesKind, symbol: str) -> AvailabilityPollOutcome:
        """Issue one Coinalyze history call, at the fine interval this probe needs, and parse it."""
        coinalyze_symbol = to_coinalyze_symbol(symbol)
        now_epoch_seconds = int(time.time())
        path = (
            f"{COINALYZE_ENDPOINT_PATH_BY_KIND[kind]}?symbols={coinalyze_symbol}"
            f"&interval={COINALYZE_HISTORY_INTERVAL}"
            f"&from={now_epoch_seconds - COINALYZE_LOOKBACK_SECONDS}&to={now_epoch_seconds}"
        )
        status, body, transport_error = _fetch(
            self._connections,
            self._connection_factory,
            self._environment,
            self._user_agent,
            COINALYZE,
            path,
        )
        if transport_error is not None:
            return AvailabilityPollOutcome(transport_error=transport_error)
        if status != 200:
            return AvailabilityPollOutcome(status=status)
        points = parse_daily_points(body)
        if not points:
            return AvailabilityPollOutcome(status=status)
        latest_epoch_seconds = max(point.timestamp_epoch_seconds for point in points)
        return AvailabilityPollOutcome(
            status=status, latest_event_time_ms=latest_epoch_seconds * 1000
        )

    def close(self) -> None:
        """Close every connection this client opened."""
        for host in list(self._connections):
            self._connections.pop(host).close()
