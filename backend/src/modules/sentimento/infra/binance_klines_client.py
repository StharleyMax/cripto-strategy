"""GET `/fapi/v1/klines`, keeping ALL TWELVE fields of every kline array."""

# Same connection shape as `binance_oi_history_client.py` and `binance_futures_snapshot_client.py`:
# `http.client` (never `urllib.request`), a connection FACTORY the test suite injects a fake into,
# one connection per call. The protocols below are the THIRD copy of that shape in this package —
# deliberate, and the same choice the two siblings already made: each network client in `infra/` is
# self-contained, so a change to one endpoint cannot reach another. Extracting a shared module is a
# change to those two files as well, and `T-01.2` is restricted to this file and its test.
#
# ⛔ WHAT THIS CLIENT MUST NOT DO, AND IT IS THE REASON THE TASK EXISTS: project the array down to
# the one field the caller of the day wants. `/fapi/v1/klines` answers with a 12-position array, and
# two of those positions are two different metrics of this feature — index [5] `volume` (phase `01`)
# and index [9] `takerBuyBaseVol` (phase `02`, CVD, `ADR-036/D5` re-decided by the finding in
# `docs/context/cinco-metricas-do-core/handoff/ACHADO-KLINES-CVD.md`). A client that kept only [5]
# would force phase `02` to repeat the HTTP call, and phase `02` exists precisely because it does
# not have to: `delta_cvd = 2 * takerBuyBaseVol - volume`, from the SAME response.
#
# So `KlineRow` stores the array verbatim and REFUSES to exist with any other arity: a row of 11 or
# 13 fields raises `KlineArityError` instead of being silently truncated or padded. The named
# accessors are conveniences over `raw`, never a replacement for it.
#
# This client does not decide series identity (that is `domain/`) and does not write to `md.series`
# (`RN-6`, single writer). All it does is dispatch the request and translate the JSON body into
# `KlinesPageResponse`, which is XOR by construction: either an API error code, or rows.
#
# Quota, as measured for this feature: weight 1 per call of up to 1500 candles against a ceiling of
# 2400 weight/min per IP `[MEDIDO 2026-09-10: sequencia 31->32->33]`; the source is deep, serving
# BTCUSDT since 2019-09-08 `[MEDIDO 2026-09-10, SPEC-007 §9.2]`. The 1500-bar ceiling itself is
# `[DOC: Binance public documentation; NAO MEDIDO neste repositorio]`.

from __future__ import annotations

import http.client
import json
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Final, Protocol, cast
from urllib.parse import urlencode

FAPI_HOST: Final[str] = "fapi.binance.com"
KLINES_PATH: Final[str] = "/fapi/v1/klines"

DEFAULT_USER_AGENT: Final[str] = "cripto-strategy/T-01.2-cliente-klines (coleta; contato via repo)"

# The twelve positions of the array, in the order the endpoint returns them. This tuple is the
# written form of the contract the whole file defends: its LENGTH is the arity every row must
# have, and its INDEXES are what the named accessors below quote instead of re-typing a literal.
KLINE_FIELD_NAMES: Final[tuple[str, ...]] = (
    "openTime",
    "open",
    "high",
    "low",
    "close",
    "volume",
    "closeTime",
    "quoteAssetVolume",
    "numberOfTrades",
    "takerBuyBaseVol",
    "takerBuyQuoteVol",
    "ignore",
)
KLINE_FIELD_COUNT: Final[int] = len(KLINE_FIELD_NAMES)

OPEN_TIME_INDEX: Final[int] = KLINE_FIELD_NAMES.index("openTime")
VOLUME_INDEX: Final[int] = KLINE_FIELD_NAMES.index("volume")
CLOSE_TIME_INDEX: Final[int] = KLINE_FIELD_NAMES.index("closeTime")
TAKER_BUY_BASE_VOLUME_INDEX: Final[int] = KLINE_FIELD_NAMES.index("takerBuyBaseVol")

# `limit` ceiling of the endpoint. Asking for more is a caller bug, not a server round trip.
MAX_LIMIT: Final[int] = 1500

# What a JSON kline array carries: integers for the two timestamps and the trade count, strings
# for every decimal (Binance never sends a float there, and neither do we — a float would lose
# the exact decimal the exchange quoted).
KlineField = int | str


class KlineArityError(Exception):
    """A kline array did not have exactly 12 fields, so the raw record cannot be preserved."""


class UnexpectedPayloadShapeError(Exception):
    """The body decoded to neither an error envelope (`dict` with `code`) nor a list of klines."""


class LimitOutOfRangeError(Exception):
    """The requested `limit` is outside `1..MAX_LIMIT`, which the endpoint would refuse anyway."""


@dataclass(frozen=True, slots=True)
class KlineRow:
    """One kline, stored as the WHOLE 12-field array exactly as the endpoint returned it."""

    raw: tuple[KlineField, ...]

    def __post_init__(self) -> None:
        """Refuse any arity but 12 — a truncated array must fail loudly, never silently."""
        if len(self.raw) != KLINE_FIELD_COUNT:
            raise KlineArityError(
                f"a kline array must carry exactly {KLINE_FIELD_COUNT} fields "
                f"({', '.join(KLINE_FIELD_NAMES)}), got {len(self.raw)}: {self.raw!r}"
            )

    @property
    def open_time_ms(self) -> int:
        """Return the bucket's opening timestamp in epoch milliseconds."""
        return int(self.raw[OPEN_TIME_INDEX])

    @property
    def close_time_ms(self) -> int:
        """Return the bucket's closing timestamp in epoch milliseconds."""
        return int(self.raw[CLOSE_TIME_INDEX])

    @property
    def volume(self) -> str:
        """Return index [5], base-asset volume, as the exact decimal string the exchange sent."""
        return str(self.raw[VOLUME_INDEX])

    @property
    def taker_buy_base_volume(self) -> str:
        """Return index [9], the aggressor-buy volume phase `02` builds CVD from."""
        return str(self.raw[TAKER_BUY_BASE_VOLUME_INDEX])


@dataclass(frozen=True, slots=True)
class KlinesPageResponse:
    """One page of klines, or the API error code that replaced it — never both."""

    status: int
    api_code: int | None
    rows: tuple[KlineRow, ...]


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
    """A connection to one host — the same shape the sibling Binance clients depend on."""

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


def parse_kline_rows(payload: Sequence[object]) -> tuple[KlineRow, ...]:
    """Turn the decoded JSON list into rows, preserving all 12 fields of each array."""
    rows: list[KlineRow] = []
    for entry in payload:
        if not isinstance(entry, list):
            raise UnexpectedPayloadShapeError(
                f"a kline must be a JSON array of {KLINE_FIELD_COUNT} fields, got {entry!r}"
            )
        rows.append(KlineRow(raw=tuple(_field(value) for value in cast("list[object]", entry))))
    return tuple(rows)


def _field(value: object) -> KlineField:
    """Accept a field verbatim, rejecting any JSON type this endpoint never sends."""
    if isinstance(value, bool) or not isinstance(value, int | str):
        raise UnexpectedPayloadShapeError(
            f"a kline field must be an integer or a decimal string, got {value!r}"
        )
    return value


class BinanceKlinesClient:
    """One connection per page, to the public `/fapi/v1/klines` endpoint."""

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

    def klines(
        self,
        symbol: str,
        interval: str,
        limit: int,
        start_time_ms: int | None = None,
        end_time_ms: int | None = None,
    ) -> KlinesPageResponse:
        """`GET /fapi/v1/klines` for one window, handing back every field of every row.

        `start_time_ms`/`end_time_ms` are optional because the periodic cycle wants the tail of
        the series and sends neither; the boot backfill walks the window and sends both.
        """
        if not 1 <= limit <= MAX_LIMIT:
            raise LimitOutOfRangeError(f"limit must be between 1 and {MAX_LIMIT}, got {limit}")
        params = self._params(symbol, interval, limit, start_time_ms, end_time_ms)
        path = f"{KLINES_PATH}?{urlencode(params)}"
        connection = self._connection_factory(self._host)
        try:
            headers = {"User-Agent": self._user_agent, "Accept": "application/json"}
            connection.request("GET", path, headers=headers)
            response = connection.getresponse()
            body = response.read()
            payload = json.loads(body)
            if isinstance(payload, dict) and "code" in payload:
                return KlinesPageResponse(
                    status=response.status, api_code=int(cast(int, payload["code"])), rows=()
                )
            if isinstance(payload, list):
                return KlinesPageResponse(
                    status=response.status,
                    api_code=None,
                    rows=parse_kline_rows(cast("list[object]", payload)),
                )
            raise UnexpectedPayloadShapeError(
                f"{self._host}{KLINES_PATH} body is neither an error envelope nor a list of "
                f"klines: {body[:200]!r}"
            )
        finally:
            connection.close()

    @staticmethod
    def _params(
        symbol: str,
        interval: str,
        limit: int,
        start_time_ms: int | None,
        end_time_ms: int | None,
    ) -> dict[str, str]:
        """Build the query string, omitting the bounds the caller did not ask for."""
        params = {"symbol": symbol, "interval": interval, "limit": str(limit)}
        if start_time_ms is not None:
            params["startTime"] = str(start_time_ms)
        if end_time_ms is not None:
            params["endTime"] = str(end_time_ms)
        return params
