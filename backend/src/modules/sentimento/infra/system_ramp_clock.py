"""The real clock: `monotonic` for durations, wall clock for `Retry-After`, `sleep` for recoil."""

from __future__ import annotations

import time


class SystemRampClock:
    """`RampClock` backed by `time`, kept trivial so nothing here needs a test to be trusted.

    The two readings come from DIFFERENT sources on purpose. `time.monotonic()` cannot go
    backwards and is the only defensible basis for a duration; `time.time()` is wall clock and
    is the only thing an HTTP-date in `Retry-After` can be compared against. Serving both from
    one source would break exactly when NTP steps the clock — which, on this project, is a
    monitored event rather than a hypothetical (`plano 03` item 3.7).
    """

    def monotonic(self) -> float:
        """Return a monotonically increasing reading, in seconds."""
        return time.monotonic()

    def epoch(self) -> float:
        """Return wall-clock seconds since the Unix epoch."""
        return time.time()

    def sleep(self, seconds: float) -> None:
        """Block for `seconds`, refusing a negative pause rather than returning at once."""
        if seconds < 0:
            raise ValueError(f"pausa negativa: {seconds}")
        time.sleep(seconds)
