"""GET any `/futures/data/*` history endpoint — the endpoint is a PARAMETER, never a literal."""

# `SPEC-007` phase `04` item 4.2, `ADR-036/D3`.
#
# ── WHY THIS FILE IS GENERIC, AND WHY IT IS NOT A SECOND HTTP CLIENT ───────────────────────
#
# `T-04.3`'s own text forbids writing "a second HTTP client for `/futures/data/`". Two facts
# shaped what that means in practice, and both are measured rather than assumed:
#
#   * `[MEDIDO 2026-09-12 em `ff18811`]` `ls backend/src/modules/sentimento/infra/ | grep
#     futures_data` finds NOTHING, in this worktree and in the eight sibling worktrees of the
#     parallel wave. Phase `03`'s client does not exist at this task's base commit, so there is
#     no object to import; waiting for it would block a phase whose whole premise (`D17`) is
#     width.
#   * The ONE `/futures/data/*` client that does exist, `binance_oi_history_client.py`, is
#     specialised on `openInterestHist` in its class name, its module name and its signature (it
#     takes a `ClosedWindow`, which is `T-07.1`'s backfill contract and not a live tail's).
#     Phase `03` owns that file.
#
# So this module does the thing that makes "reuse" true in both directions: the SOCKET machinery
# is imported, not redeclared — `ConnectionFactory`, `HttpConnection`, `open_https_connection`
# come from `https_quota_probe.py`, exactly as `premium_index_http_client.py` already borrows
# them, which is the precedent `ADR-011/D3a` set for keeping socket-touching code rare and
# shared. And the ENDPOINT is an argument, so the open-interest collector can adopt this client
# by passing `"openInterestHist"` instead of gaining a fourth copy of `http.client`.
#
# ── WHAT THIS CLIENT REFUSES TO DECIDE ─────────────────────────────────────────────────────
#
# Nothing about verdicts, nothing about identity. It dispatches the request and translates the
# body into a type that is XOR by construction — a page of points, or the API error code that
# replaced it. `/futures/data/*` answers `200` with ZERO `x-mbx-*` headers
# (`domain/clock_skew.py`, `T-03.7`), so there is no weight to read here and none is invented.

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Final, cast
from urllib.parse import urlencode

from src.modules.sentimento.infra.https_quota_probe import (
    ConnectionFactory,
    HttpConnection,
    open_https_connection,
)

FUTURES_DATA_HOST: Final[str] = "fapi.binance.com"
FUTURES_DATA_PATH_PREFIX: Final[str] = "/futures/data/"

# `[MEDIDO 2026-09-12]`: `limit=500` on `globalLongShortAccountRatio` answers exactly 500 points;
# the endpoint family documents 500 as its ceiling. A fact of the provider, not a setting.
MAX_LIMIT: Final[int] = 500

DEFAULT_USER_AGENT: Final[str] = (
    "cripto-strategy/T-04.3-long-short-collector (coletor; contato via repo)"
)


class LimitOutOfRangeError(Exception):
    """The requested `limit` is outside `1..MAX_LIMIT`, which the endpoint would refuse anyway."""


class UnexpectedPayloadShapeError(Exception):
    """The body decoded to neither an error envelope (`dict` with `code`) nor a list of points."""


@dataclass(frozen=True, slots=True)
class FuturesDataPageResponse:
    """One page of `/futures/data/*` points, or the API error code that replaced it — never both.

    `points` is the VERBATIM list of objects the source sent, untouched: parsing which field of
    which object becomes a value is a mapping decision and lives in `use_cases`, not here.

    AN EMPTY `points` WITH `api_code=None` IS A REAL ANSWER AND NOT AN ERROR, and this is the
    exact shape `T-04.1` measured: `period=1m` and `period=3m` come back `HTTP 200` with `[]`.
    Collapsing "the source published nothing for this grid" into an exception would have hidden
    the very measurement that fixed `interval="5m"` in the identity.
    """

    status: int
    api_code: int | None
    points: tuple[Mapping[str, object], ...]


class BinanceFuturesDataClient:
    """One reused connection to `fapi.binance.com`, rebuilt whenever it breaks.

    Same connection lifecycle as `PremiumIndexHttpClient` (one connection per host, dropped and
    rebuilt on `OSError`), for the same reason that module states: a broken keep-alive connection
    must not silently poison every following call.
    """

    def __init__(
        self,
        connection_factory: ConnectionFactory = open_https_connection,
        host: str = FUTURES_DATA_HOST,
        user_agent: str = DEFAULT_USER_AGENT,
    ) -> None:
        """Wire the client to a host and a way of opening connections; nothing is sent here."""
        self._connection_factory = connection_factory
        self._host = host
        self._user_agent = user_agent
        self._connection: HttpConnection | None = None

    def _connection_now(self) -> HttpConnection:
        """Return the live connection, opening one the first time it is needed."""
        if self._connection is None:
            self._connection = self._connection_factory(self._host)
        return self._connection

    def _drop(self) -> None:
        """Forget the current connection so the next call opens a fresh one."""
        if self._connection is not None:
            self._connection.close()
            self._connection = None

    def history(
        self, endpoint: str, symbol: str, period: str, limit: int
    ) -> FuturesDataPageResponse:
        """`GET /futures/data/{endpoint}` for `symbol` at `period`, newest `limit` points.

        No `startTime`/`endTime`: this is the LIVE TAIL, and `/futures/data/*` answers the newest
        `limit` points when neither bound is sent. The windowed, paged read is a different call
        with a different contract (`binance_oi_history_client.BinanceOiHistoryClient`, which takes
        a `ClosedWindow` precisely so `startTime` can never travel without `endTime`).

        An `OSError` DROPS the connection and PROPAGATES, rather than becoming an empty page:
        the collector thread above already turns a transport failure into a run record with a
        verdict, and swallowing it here would hide a dead socket behind an empty page that reads
        exactly like the legitimate empty answer documented on `FuturesDataPageResponse`.
        """
        if not 1 <= limit <= MAX_LIMIT:
            raise LimitOutOfRangeError(f"limit must be between 1 and {MAX_LIMIT}, got {limit}")
        params = {"symbol": symbol, "period": period, "limit": str(limit)}
        path = f"{FUTURES_DATA_PATH_PREFIX}{endpoint}?{urlencode(params)}"
        headers = {"User-Agent": self._user_agent, "Accept": "application/json"}
        try:
            connection = self._connection_now()
            connection.request("GET", path, headers=headers)
            response = connection.getresponse()
            status = response.status
            body = response.read()
        except OSError:
            self._drop()
            raise
        payload = json.loads(body)
        if isinstance(payload, dict) and "code" in payload:
            return FuturesDataPageResponse(
                status=status, api_code=int(cast(int, payload["code"])), points=()
            )
        if isinstance(payload, list):
            return FuturesDataPageResponse(
                status=status,
                api_code=None,
                points=tuple(cast("list[Mapping[str, object]]", payload)),
            )
        raise UnexpectedPayloadShapeError(
            f"{self._host}{FUTURES_DATA_PATH_PREFIX}{endpoint} body is neither an error envelope "
            f"nor a list of points: {body[:200]!r}"
        )

    def close(self) -> None:
        """Close the connection, if one is open."""
        self._drop()
