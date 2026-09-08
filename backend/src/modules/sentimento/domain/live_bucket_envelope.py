"""`LiveBucketEnvelope`: the partial-bucket envelope `ADR-005/D2` fixes, unchanged by `ADR-034`.

`ADR-034 §5.3`, literal: "Cada evento carrega o envelope de bucket parcial de `ADR-005/D2`, sem
alteração." So this type transcribes `ADR-005/D2` — `(bucket_open_ts, cvd_delta_parcial,
last_price, n_trades, seq)` plus `is_final` (`D4`: "final_only não recebe o bucket em
formação; intrabar recebe com is_final = false") — and does not invent a schema of its own.

`bucket_open_ts` stays an ISO 8601 STRING, not epoch-ms: `frontend/src/app/live-transport.ts`
(`T-08.11`, written against this same `D2`) already fixes the wire shape this way and `ADR-034`
never reopens it — only the two REQUEST-side transports (`T-01.5`) move to epoch-ms, because
`ADR-034/D1` only fixes the request key's names, never this envelope's.
"""

from __future__ import annotations

from dataclasses import dataclass


class InvalidLiveBucketEnvelopeError(Exception):
    """A `LiveBucketEnvelope` field violates `ADR-005/D2` — never negative, never tick-level."""


@dataclass(frozen=True)
class LiveBucketEnvelope:
    """One SSE message of `GET /series-live` — `ADR-005/D2`'s five terms plus `is_final`."""

    bucket_open_ts: str
    cvd_delta_parcial: str
    last_price: str
    n_trades: int
    seq: int
    is_final: bool

    def __post_init__(self) -> None:
        """Refuse a negative `n_trades`/`seq` — `D2`: `seq` is monotonic, never negative."""
        if self.n_trades < 0:
            raise InvalidLiveBucketEnvelopeError(
                f"n_trades = {self.n_trades} is negative: a trade count cannot be negative"
            )
        if self.seq < 0:
            raise InvalidLiveBucketEnvelopeError(
                f"seq = {self.seq} is negative: `ADR-005/D2` makes it a monotonic counter"
            )

    def to_wire(self) -> dict[str, object]:
        """Project onto the exact field names `ADR-005/D2` fixes, verbatim, never renamed."""
        return {
            "bucket_open_ts": self.bucket_open_ts,
            "cvd_delta_parcial": self.cvd_delta_parcial,
            "last_price": self.last_price,
            "n_trades": self.n_trades,
            "seq": self.seq,
            "is_final": self.is_final,
        }
