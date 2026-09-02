"""Clock skew: local wall clock against a remote authority's reported time — pure arithmetic."""

# `ADR-016` splits reading a clock and calling an HTTPS endpoint (both CAPABILITIES) from the
# comparison itself: nothing in this module touches a socket or `time.time()`. It only takes
# already-observed millisecond readings and does the subtraction.
#
# `use_cases/measure_clock_skew.py` is the one place both capabilities meet;
# `infra/binance_server_time_probe.py` and `infra/system_wall_clock.py` are the adapters that
# produce the ints this module consumes. `SPEC-001` §5.9 (`CA-F0-8`, `[GAP G6]`) is the origin:
# NTP is a runtime dependency of F0, and F0's job is to MEASURE and PERSIST the skew per
# `ingest_run` — `T-07.10` is the one that later decides what magnitude is tolerable.

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ServerTimeObservation:
    """What one `GET /fapi/v1/time` produced, beyond the millisecond the skew sample needs.

    `weight_used` is `None` when the response carried no `x-mbx-used-weight-1m` header — a
    real possibility this project already measured on ANOTHER Binance family
    (`D3.12`, `T-03.7`: `/futures/data/*` answers `200` with ZERO `x-mbx-*` headers). `None`
    here is the same "the provider did not say" this repository writes everywhere else, never
    a guessed default.
    """

    server_time_ms: int
    http_status: int
    weight_used: int | None
    body_sha256: str


@dataclass(frozen=True)
class ClockSkewSample:
    """One measurement: local time bracketing a request, and what the remote reported.

    `local_time_before_ms` and `local_time_after_ms` bracket the network round trip that
    produced `server_time_ms`; the remote's reading was stamped somewhere inside that
    bracket. `skew_ms` reads the LOCAL side at the bracket's MIDPOINT — the least-biased
    estimate available without one-way latency, which this project has no way to measure:
    `/fapi/v1/time` reports only the server's clock, never a transmission-delay component
    (`SPEC-001` §5.9).
    """

    local_time_before_ms: int
    local_time_after_ms: int
    server_time_ms: int

    def __post_init__(self) -> None:
        """Refuse a bracket that runs backwards — a round trip cannot end before it starts."""
        if self.local_time_after_ms < self.local_time_before_ms:
            raise ValueError(
                f"local_time_after_ms ({self.local_time_after_ms}) precedes "
                f"local_time_before_ms ({self.local_time_before_ms}): a round trip cannot "
                f"finish before it starts"
            )

    @property
    def round_trip_ms(self) -> int:
        """Return the wall-clock cost of the request that produced this sample."""
        return self.local_time_after_ms - self.local_time_before_ms

    def skew_ms(self) -> int:
        """Return local-minus-server skew, local time read at the bracket's midpoint.

        Positive means the local clock runs AHEAD of the server; negative means BEHIND. This
        is the value `md.ingest_run.clock_skew_ms` stores (`ADR-008/D3`) — measured here,
        never judged: whether a given magnitude is acceptable is `T-07.10`'s decision, made
        once the distribution this column accumulates spans enough days (`D3.10`, `>= 7 dias`).
        """
        midpoint_ms = (self.local_time_before_ms + self.local_time_after_ms) // 2
        return midpoint_ms - self.server_time_ms
