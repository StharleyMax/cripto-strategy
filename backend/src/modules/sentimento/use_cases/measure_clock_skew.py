"""Bracket one server-time reading with local clock samples — the ONLY place both meet."""

# `ADR-016` puts reading a clock and calling `/fapi/v1/time` in CAPABILITY territory (`infra`);
# this module is the seam where both capabilities are used, one right after the other, so the
# bracket is as tight as this process can make it. `domain/clock_skew.py` does the arithmetic
# once both readings exist.

from __future__ import annotations

from typing import Protocol

from src.modules.sentimento.domain.clock_skew import ClockSkewSample, ServerTimeObservation


class ServerTimeSource(Protocol):
    """The one call this use case needs from a `/fapi/v1/time`-shaped endpoint."""

    def observe(self) -> ServerTimeObservation:
        """Issue the request and return what it produced, including the millisecond read."""
        ...


class WallClock(Protocol):
    """The one reading this use case needs from the local host."""

    def now_ms(self) -> int:
        """Return the local wall clock, in whole epoch milliseconds."""
        ...


def measure_clock_skew(
    source: ServerTimeSource, clock: WallClock
) -> tuple[ClockSkewSample, ServerTimeObservation]:
    """Take one clock-skew sample, bracketing `source.observe()` with two local readings.

    Returns BOTH the pure sample (what `domain/clock_skew.py` can reason about) and the raw
    `ServerTimeObservation` (what a caller building an `ingest_run` row needs beyond the
    millisecond — `http_status`, `weight_used`, `body_sha256`). Returning the pair instead of
    just the sample is what lets `infra/ntp_skew_probe_cli.py` persist a row whose `api_code`
    and `src_sha256` describe the SAME call this measured, never a second one.
    """
    before_ms = clock.now_ms()
    observation = source.observe()
    after_ms = clock.now_ms()
    sample = ClockSkewSample(
        local_time_before_ms=before_ms,
        local_time_after_ms=after_ms,
        server_time_ms=observation.server_time_ms,
    )
    return sample, observation
