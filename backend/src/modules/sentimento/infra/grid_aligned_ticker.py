"""The collector cadence, anchored to the GRID instead of to the end of the previous cycle.

Why this module exists, with the number that produced it. The klines collector used to close
its loop with `stop_event.wait(interval_s)` AFTER the cycle's work, which makes the effective
period `interval_s + work_duration`, not `interval_s`. The phase therefore slides forward every
turn, and once it has slid a whole `interval_s` the poll lands one bucket late. Measured against
the live database: `105` of `4.289` klines readings arrived `>= 60.000 ms` after `bucket_end`
(`~2,4%` of the cycles, `4..8` per hour over `18 h`, `26..27` per symbol across all four), while
the twelve smallest observed delays were `12 · 15 · 40 · 46 · 83 · 105 · 129 · 143 · 151 · 152 ·
170 · 183` ms — so the endpoint itself publishes in `<= 12 ms` and essentially the whole
`p99 = 60.936 ms` was OUR scheduler's phase, not Binance's latency
`[MEDIDO 2026-09-11, docs/context/cinco-metricas-do-core/OPCOES-D16-ESTATISTICA-CONTRA-A-GRADE.md
F0/F2/F3]`.

The cure is to sleep UNTIL the next aligned instant rather than FOR a fixed duration: the period
becomes `interval_s` regardless of how long the work took, and the phase is a constant `offset_s`
instead of a random walk.

THE CLOCK LIVES HERE, IN `infra`, AND NOWHERE ELSE. `ADR-016/D4` forbids `domain` and `use_cases`
from reading a clock (`make natureza`), which is why the grid arithmetic is exposed as
`next_grid_instant_s(now_s, ...)` — a pure function of an instant it is HANDED — and only
`GridAlignedTicker` ever calls `time.time()`.

WHY WALL CLOCK AND NOT `time.monotonic()`. The grid this has to land on is the venue's bucket
grid, which is defined in epoch milliseconds; `time.monotonic()` has an arbitrary origin, so
aligning to it would remove the DRIFT but leave the PHASE an arbitrary constant anywhere in
`[0, interval_s)` — the `p99` would stay wherever the process happened to boot. The cost of the
wall clock is that an NTP step shifts the phase; that shift is a one-off of the size of the step,
it self-corrects on the next tick, and it is bounded by the same clock-skew tolerance every
`md.ingest_run` row already records (`ADR-008/D3`).
"""

from __future__ import annotations

import logging
import math
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class GridTick:
    """What one aligned wait did — the instant it aimed at, how long it slept, what it lost."""

    target_s: float
    """The aligned instant this wait aimed at, in epoch seconds. Always `> now` at entry."""

    slept_s: float
    """The duration actually handed to `Event.wait`. Never negative, never zero."""

    skipped_ticks: int
    """Grid points that passed unserved because the previous cycle's work outran the cadence."""


def next_grid_instant_s(now_s: float, interval_s: float, offset_s: float = 0.0) -> float:
    """Answer the first instant strictly after `now_s` on the `interval_s` grid plus `offset_s`.

    STRICTLY after, and that word is the whole contract for the case the naive fix gets wrong.
    A cycle whose work outran the cadence arrives here with `now_s` already past — sometimes far
    past — the grid point it was supposed to serve. Returning `last_target + interval_s` would
    then be a duration in the PAST: a negative sleep, which `Event.wait` treats as zero, which
    turns the collector into a tight loop against `/fapi/v1/klines` and gets the process banned
    by the venue. And returning the grid point `now_s` is exactly ON is no better: a zero-length
    sleep is the same tight loop, one iteration later. `floor(...) + 1` gives neither — the
    answer is always ahead of `now_s`, by at most `interval_s` and by more than zero, so work
    longer than a cadence SKIPS the ticks it could not serve and resumes ON the grid.

    Raises `ValueError` on a non-positive `interval_s`, for the reason `_positive_float` in
    `collectors_cli` already names: a cadence of zero is a typo whose symptom (an HTTP `418`,
    minutes later) never names its cause.
    """
    if interval_s <= 0:
        raise ValueError(f"interval_s must be greater than zero, got {interval_s!r}")
    periods_elapsed = math.floor((now_s - offset_s) / interval_s)
    return offset_s + (periods_elapsed + 1) * interval_s


class GridAlignedTicker:
    """Sleeps until the next aligned instant, so the cycle period is the cadence, not cadence+work.

    One instance per collector loop: it remembers the instant it last aimed at, which is the only
    way a skipped grid point can be told apart from a normal one. A skipped point is logged, in
    English, as `collector_tick_skipped` (`CLAUDE.md` line 10: a NEW log event is born in English).
    """

    def __init__(
        self,
        *,
        interval_s: float,
        offset_s: float = 0.0,
        endpoint: str,
        wall_clock_s: Callable[[], float] = time.time,
    ) -> None:
        """Bind the cadence, the phase, the endpoint the log line names, and the clock to read.

        `wall_clock_s` is a parameter and not a hard-wired `time.time` so the suite can prove the
        alignment property with an injected clock instead of by sleeping: `backend/scripts/test.sh`
        forbids network, and a test that measured cadence by really waiting minutes would be the
        same class of untrustworthy — slow, flaky, and green for the wrong reason.

        Raises `ValueError` if `offset_s` is not inside `[0, interval_s)`: an offset of a whole
        cadence or more is indistinguishable from an off-by-one in the caller, and it would move
        the poll onto a DIFFERENT bucket while still looking aligned.
        """
        if interval_s <= 0:
            raise ValueError(f"interval_s must be greater than zero, got {interval_s!r}")
        if not 0.0 <= offset_s < interval_s:
            raise ValueError(f"offset_s must be in [0, {interval_s!r}), got {offset_s!r}")
        self._interval_s = interval_s
        self._offset_s = offset_s
        self._endpoint = endpoint
        self._wall_clock_s = wall_clock_s
        self._last_target_s: float | None = None

    def wait(self, stop_event: threading.Event) -> GridTick:
        """Sleep until the next aligned instant, returning early if `stop_event` is set.

        The event is the same shutdown latch the loop's `while` reads, so an aligned sleep stays
        as interruptible as the fixed one it replaces — `SPEC-004` §3.1's `SIGTERM` path must not
        become `interval_s` slower because the cadence moved.
        """
        now_s = self._wall_clock_s()
        target_s = next_grid_instant_s(now_s, self._interval_s, self._offset_s)
        skipped_ticks = 0
        if self._last_target_s is not None:
            elapsed_periods = round((target_s - self._last_target_s) / self._interval_s)
            skipped_ticks = max(0, elapsed_periods - 1)
        self._last_target_s = target_s
        tick = GridTick(target_s=target_s, slept_s=target_s - now_s, skipped_ticks=skipped_ticks)
        if skipped_ticks:
            logger.warning(
                "collector_tick_skipped",
                extra={
                    "endpoint": self._endpoint,
                    "skipped_ticks": skipped_ticks,
                    "interval_s": self._interval_s,
                    "next_target_s": target_s,
                },
            )
        stop_event.wait(tick.slept_s)
        return tick
