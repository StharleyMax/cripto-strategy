"""The real clock for the availability probe: monotonic for scheduling, wall clock for stamps."""

# Same split as `infra/system_ramp_clock.py`, for the same reason: a duration must never be
# read off a clock that can be stepped by NTP (`plano 03` item 3.7), and `available_at` must be
# the SAME wall clock a consumer would read `SPEC-001` §2.2 against — a monotonic reading, whose
# origin is arbitrary, cannot be that stamp.

from __future__ import annotations

import time


class SystemProbeClock:
    """`ProbeClock` (of `use_cases/run_availability_probe.py`) backed by `time`."""

    def monotonic(self) -> float:
        """Return a monotonically increasing reading, in seconds."""
        return time.monotonic()

    def now_ms(self) -> int:
        """Return the local wall clock, in whole epoch milliseconds."""
        return int(time.time() * 1000)

    def sleep(self, seconds: float) -> None:
        """Block for `seconds`, refusing a negative pause rather than returning at once."""
        if seconds < 0:
            raise ValueError(f"negative pause: {seconds}")
        time.sleep(seconds)
