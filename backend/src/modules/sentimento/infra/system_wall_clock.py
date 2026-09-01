"""The real wall clock, read in whole epoch milliseconds — the local half of a skew sample."""

from __future__ import annotations

import time


class SystemWallClock:
    """`WallClock` (of `use_cases/measure_clock_skew.py`) backed by `time.time()`.

    Wall clock, deliberately — NOT `time.monotonic()`: the whole point of this reading is to
    compare the LOCAL notion of "now" against a remote authority's, and a monotonic clock has
    no fixed epoch to compare against (`infra/system_ramp_clock.py` documents the same split
    for the same reason, for a different use case).
    """

    def now_ms(self) -> int:
        """Return the local wall clock as whole milliseconds since the Unix epoch."""
        return int(time.time() * 1000)
