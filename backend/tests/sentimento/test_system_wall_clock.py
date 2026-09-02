"""The REAL clock, exercised for real — no socket involved, so `test.sh`'s ban does not apply."""

from __future__ import annotations

from src.modules.sentimento.infra.system_wall_clock import SystemWallClock

# 2026-08-29T00:00:00Z, well below any real reading this suite will ever take — a floor that
# proves `now_ms()` is reading an actual epoch clock and not returning a small counter.
_EPOCH_FLOOR_MS = 1_788_000_000_000


def test_the_real_clock_reads_a_plausible_epoch_millisecond() -> None:
    """A skew computed against a clock stuck at `0` would be meaningless, not just wrong."""
    reading = SystemWallClock().now_ms()

    assert isinstance(reading, int)
    assert reading > _EPOCH_FLOOR_MS


def test_the_real_clock_does_not_go_backwards_between_two_reads() -> None:
    """Two readings taken back to back must be non-decreasing — the bracket depends on this."""
    clock = SystemWallClock()

    first = clock.now_ms()
    second = clock.now_ms()

    assert second >= first
