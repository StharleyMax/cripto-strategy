"""One reading of `GET /fapi/v1/openInterest`: its `time` IS the event instant, never ours."""

# `SPEC-009` §6.1 (`T-03.1`, `RN-1`) fixes the collector's source as the "present open interest
# of a specific symbol" endpoint, whose body is `{openInterest, symbol, time}`. The one decision
# this module exists to make impossible to get wrong is WHICH instant the reading belongs to:
#
#     the `time` field of the RESPONSE is the `event_time`,
#     never the instant the request left this machine, nor the instant the answer arrived.
#
# The two are not interchangeable, and the difference is measured, not hypothetical:
# `[MEDIDO 2026-09-23, n=30, BTCUSDT: atraso de time em relacao ao pedido min 0,5 s · mediana
# 4,4 s · max 7,6 s]` (`SPEC-009` §6.1), and the capture this task's test replays shows it again
# (`time = 1790287793703` for a request sent at `1790287796821`: the reading is 3.1 s OLDER than
# the request). Stamped with the request instant, a reading Binance took at `T - 1 s` would be
# admitted into minute `T` by the `[T, T + 20 s]` window of `T-03.2`. That is why
# `parse_open_interest_snapshot` takes no clock and no request instant at all: there is no
# argument through which the wrong instant could enter.
#
# The value is kept as the EXACT decimal string the source sent (`ADR-034/D7`, `value_raw`), the
# same discipline `collector_series_mapping.open_interest_value_raw` applies to
# `openInterestHist` — never `float`. It is VALIDATED as a finite, non-negative decimal here,
# because a string that does not parse would otherwise reach `md.series` and fail far from the
# call that received it.

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from enum import Enum
from typing import Final

# `[DOC: developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/
# Open-Interest, lido 2026-09-23]` — "Request Weight: 1". Confirmed live by `SPEC-009` §6.1
# (`x-mbx-used-weight-1m` 16->17->18->19 over 4 back-to-back calls) and again by the capture of
# this task (`1` then `2` over two consecutive symbols, same minute).
OPEN_INTEREST_SNAPSHOT_ENDPOINT: Final[str] = "/fapi/v1/openInterest"
OPEN_INTEREST_SNAPSHOT_WEIGHT: Final[int] = 1

OPEN_INTEREST_SNAPSHOT_SYMBOL_FIELD: Final[str] = "symbol"
OPEN_INTEREST_SNAPSHOT_VALUE_FIELD: Final[str] = "openInterest"
OPEN_INTEREST_SNAPSHOT_TIME_FIELD: Final[str] = "time"


class InvalidOpenInterestSnapshotError(Exception):
    """A `200` body that is not a reading the collector can trust as `(symbol, value, time)`."""


@dataclass(frozen=True)
class OpenInterestSnapshot:
    """One open-interest reading, stamped with the SOURCE's own instant.

    `event_time_ms` is the response's `time` (epoch ms, UTC). There is deliberately no field for
    the request or reception instant: whoever needs those (the collector's `observed_at`) owns a
    clock, and keeping them out of this type is what stops them from being read as the event.
    `open_interest_raw` is in CONTRACTS of the base asset (`D-a`/`D-b`, `unit=BTC` for
    `BTCUSDT`), exactly as the source spelled it.
    """

    symbol: str
    open_interest_raw: str
    event_time_ms: int

    def __post_init__(self) -> None:
        """Refuse a reading whose three fields could not have come from a real answer."""
        if not self.symbol.strip():
            raise InvalidOpenInterestSnapshotError("a snapshot needs a non-blank symbol")
        if self.event_time_ms <= 0:
            raise InvalidOpenInterestSnapshotError(
                f"event_time_ms must be a positive epoch-ms instant, got {self.event_time_ms}"
            )
        try:
            value = Decimal(self.open_interest_raw)
        except InvalidOperation as malformed:
            raise InvalidOpenInterestSnapshotError(
                f"open_interest_raw is not a decimal string: {self.open_interest_raw!r}"
            ) from malformed
        if not value.is_finite() or value < 0:
            raise InvalidOpenInterestSnapshotError(
                "open_interest_raw must be a finite, non-negative contract count, got "
                f"{self.open_interest_raw!r}"
            )


def parse_open_interest_snapshot(payload: object, requested_symbol: str) -> OpenInterestSnapshot:
    """Read one decoded `200` body as the reading of `requested_symbol` at the source's `time`.

    Refuses, loudly, every shape that would otherwise be stored as data:

    - a body that is not an object (an array, a bare number);
    - an answer for ANOTHER symbol than the one asked — four symbols share one loop in the
      collector, and a crossed answer would put `ETHUSDT` contracts under `BTCUSDT`'s series;
    - an `openInterest` that is not a non-blank string (the source sends a string; a JSON number
      would already have lost digits to `float` on decode, `ADR-034/D7`);
    - a `time` that is not an integer (`bool` is refused explicitly: it IS an `int` in Python).
    """
    if not isinstance(payload, dict):
        raise InvalidOpenInterestSnapshotError(
            f"{OPEN_INTEREST_SNAPSHOT_ENDPOINT} body is not a JSON object: {payload!r}"
        )
    symbol = payload.get(OPEN_INTEREST_SNAPSHOT_SYMBOL_FIELD)
    if symbol != requested_symbol:
        raise InvalidOpenInterestSnapshotError(
            f"{OPEN_INTEREST_SNAPSHOT_ENDPOINT} answered for symbol {symbol!r}, "
            f"but {requested_symbol!r} was requested"
        )
    value_raw = payload.get(OPEN_INTEREST_SNAPSHOT_VALUE_FIELD)
    if not isinstance(value_raw, str) or not value_raw.strip():
        raise InvalidOpenInterestSnapshotError(
            f"{OPEN_INTEREST_SNAPSHOT_ENDPOINT} body has no non-blank string "
            f"{OPEN_INTEREST_SNAPSHOT_VALUE_FIELD!r}: {payload!r}"
        )
    event_time = payload.get(OPEN_INTEREST_SNAPSHOT_TIME_FIELD)
    if isinstance(event_time, bool) or not isinstance(event_time, int):
        raise InvalidOpenInterestSnapshotError(
            f"{OPEN_INTEREST_SNAPSHOT_ENDPOINT} body has no integer "
            f"{OPEN_INTEREST_SNAPSHOT_TIME_FIELD!r}: {payload!r}"
        )
    return OpenInterestSnapshot(
        symbol=requested_symbol, open_interest_raw=value_raw, event_time_ms=event_time
    )


class OpenInterestFetchOutcome(Enum):
    """Where one call stopped — a closed vocabulary, so "no data" never hides "never asked"."""

    READ = "READ"
    """`200` with a body `parse_open_interest_snapshot` accepted."""

    TRANSPORT = "TRANSPORT"
    """The request never reached Binance, or Binance never answered (no status exists)."""

    HTTP_STATUS = "HTTP_STATUS"
    """Binance answered with a status other than `200` (e.g. `400 {"code":-1121}`)."""

    PAYLOAD = "PAYLOAD"
    """`200`, but the body is not JSON or not a reading of the requested symbol."""


@dataclass(frozen=True)
class OpenInterestFetch:
    """The outcome of ONE `GET /fapi/v1/openInterest?symbol=…`, before any stamping on a grid.

    `weight_used` is the `x-mbx-used-weight-1m` the response carried, READ rather than assumed —
    `None` when the header was absent or not an integer, which is a different fact from "zero
    weight was spent" (the asymmetry `quota_bucket.py` draws between a blind bucket and one that
    reports zero). It is how the collector (`T-03.4`) proves the `DoD-2` quota of `03a`
    (`<= 4/min`) instead of multiplying `OPEN_INTEREST_SNAPSHOT_WEIGHT` by a call count.

    Exactly one of `snapshot`/`failure` is set, and `READ` is the only outcome with a snapshot.
    A `TRANSPORT` outcome has no status and no weight: nothing answered, so nothing was read.
    """

    symbol: str
    outcome: OpenInterestFetchOutcome
    status: int | None
    weight_used: int | None
    snapshot: OpenInterestSnapshot | None
    failure: str | None

    def __post_init__(self) -> None:
        """Reject a fetch whose fields contradict the outcome it declares."""
        read = self.outcome is OpenInterestFetchOutcome.READ
        if read != (self.snapshot is not None) or read == (self.failure is not None):
            raise ValueError(
                f"outcome {self.outcome.value} must carry a snapshot XOR a failure: "
                f"snapshot={self.snapshot!r}, failure={self.failure!r}"
            )
        transport = self.outcome is OpenInterestFetchOutcome.TRANSPORT
        if transport != (self.status is None):
            raise ValueError(
                f"outcome {self.outcome.value} is inconsistent with status={self.status!r}: "
                "only a TRANSPORT failure has no HTTP status"
            )
        if transport and self.weight_used is not None:
            raise ValueError("a TRANSPORT failure cannot carry a weight: nothing answered")
        if read and self.status != 200:
            raise ValueError(f"a READ outcome must have status 200, got {self.status!r}")
        if self.snapshot is not None and self.snapshot.symbol != self.symbol:
            raise ValueError(
                f"fetch for {self.symbol!r} carries a snapshot of {self.snapshot.symbol!r}"
            )


def read_used_weight(raw: str | None) -> int | None:
    """Parse an `x-mbx-used-weight-1m` value, refusing to coerce a non-integer into a number."""
    if raw is None:
        return None
    try:
        return int(raw.strip())
    except ValueError:
        return None
