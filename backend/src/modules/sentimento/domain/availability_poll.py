"""One poll attempt against one (endpoint, symbol), and the pure parse of a Binance body."""

# `ADR-016`: parsing already-fetched bytes into a timestamp is NOT a capability (nothing here
# opens a socket or reads a clock) — it is the same split `domain/coinalyze_daily_series.py`
# already makes for the Coinalyze side, applied here to the Binance side. `infra/
# availability_http_client.py` is the one place both a fetch and a parse happen together.
#
# `AvailabilityPollOutcome` mirrors `domain/ramp_ledger.py`'s `ProbeObservation` and `domain/
# coinalyze_daily_series.py`'s `CoinalizeHistoryResponse` on purpose: the same control — "a
# request that never reached the provider must never look like an empty answer" — applies here,
# and a third ad hoc encoding of it would be a third place that control could rot.

from __future__ import annotations

import json
from dataclasses import dataclass


class MalformedAvailabilityResponseError(Exception):
    """A Binance `200` whose body is not the shape this probe knows how to read.

    Raised instead of returning `None`, because "the provider changed its wire shape" and "the
    endpoint legitimately has zero buckets yet" are different facts — the first is a schema
    change this probe must not swallow, the second is `[]`, a normal answer, and returns `None`.
    """


@dataclass(frozen=True)
class AvailabilityPollOutcome:
    """What ONE poll produced: an HTTP status XOR a transport failure, plus the parsed timestamp.

    `latest_event_time_ms` is the epoch-millisecond `event_time` of the newest bucket the
    endpoint reported, or `None` when there was nothing to read (a non-`200`, a transport
    failure, or a legitimately empty `200`). It is NEVER populated alongside a transport error —
    there was no response to read a timestamp out of.
    """

    status: int | None = None
    transport_error: str | None = None
    latest_event_time_ms: int | None = None

    def __post_init__(self) -> None:
        """Reject an outcome that is neither a dispatch nor a failure to dispatch, or both."""
        if (self.status is None) == (self.transport_error is None):
            raise ValueError(
                "outcome tem de trazer status HTTP OU erro de transporte, nunca os dois nem nenhum"
            )
        if self.transport_error is not None and self.latest_event_time_ms is not None:
            raise ValueError(
                "erro de transporte nao pode carregar latest_event_time_ms: nao houve resposta "
                "para ler um timestamp"
            )

    @property
    def is_success(self) -> bool:
        """Return whether the provider answered `200` — the only status this probe reads."""
        return self.status == 200


@dataclass(frozen=True)
class AvailabilityPollAttempt:
    """One row of the probe's raw log — `D3.4` needs every one of these, not a sample."""

    source: str
    endpoint: str
    symbol: str
    observer_region: str
    polled_at_ms: int
    outcome: AvailabilityPollOutcome


def parse_binance_latest_event_time_ms(body: bytes) -> int | None:
    """Parse one `/futures/data/*?...&limit=1` body into its single bucket's `timestamp`.

    The wire shape is a JSON array of at most `limit` objects, newest LAST
    (`docs/medicao-coinalyze.md`-adjacent measurements of this same family already rely on this
    ordering). An empty array is a LEGITIMATE answer — the endpoint has nothing yet for this
    symbol — and returns `None`, never an error.
    """
    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError) as failure:
        raise MalformedAvailabilityResponseError(
            f"corpo nao e JSON valido: {type(failure).__name__}: {failure}"
        ) from failure
    if not isinstance(payload, list):
        raise MalformedAvailabilityResponseError(
            f"corpo esperado como lista, veio {type(payload).__name__}"
        )
    if not payload:
        return None
    newest = payload[-1]
    if not isinstance(newest, dict) or "timestamp" not in newest:
        shape = sorted(newest) if isinstance(newest, dict) else type(newest).__name__
        raise MalformedAvailabilityResponseError(f"elemento sem campo 'timestamp': {shape}")
    try:
        return int(newest["timestamp"])
    except (TypeError, ValueError) as failure:
        raise MalformedAvailabilityResponseError(
            f"'timestamp' nao e um inteiro: {newest['timestamp']!r}"
        ) from failure
