"""`O4`: the collector cadence is anchored to the GRID, and this is where that is PROVED.

The defect these tests close: `_run_klines_collector` used to end its loop with
`stop_event.wait(interval_s)` AFTER the cycle's work, so the real period was
`interval_s + work_duration` and the phase slid forward every turn. Once it had slid a whole
cadence the poll landed one bucket late — `105` of `4.289` live klines readings reached the
database `>= 60.000 ms` after `bucket_end`, at a steady `4..8` per hour for `18 h`
`[MEDIDO 2026-09-11: docs/context/cinco-metricas-do-core/OPCOES-D16-ESTATISTICA-CONTRA-A-GRADE.md
F0/F2]`, while the endpoint itself publishes in `<= 12 ms` (F3).

NO REAL CLOCK AND NO REAL SLEEP RUN HERE. The wall clock is injected (`_FakeWallClock`) and the
shutdown latch is a `threading.Event` whose `wait` advances that fake clock instead of blocking
(`_ClockAdvancingStopEvent`). A test that measured a 60 s cadence by really waiting would take
minutes, flake on a loaded host, and — worse — pass for a scheduler that drifts, because drift is
only visible over many turns.
"""

from __future__ import annotations

import threading

import pytest

from src.modules.sentimento.infra.binance_klines_client import KlineRow, KlinesPageResponse
from src.modules.sentimento.infra.collectors_cli import _run_klines_collector
from src.modules.sentimento.infra.grid_aligned_ticker import (
    GridAlignedTicker,
    next_grid_instant_s,
)
from src.modules.sentimento.use_cases.collector_series_mapping import (
    KLINES_BUCKET_WIDTH_MS,
    build_klines_to_rows,
)

_SYMBOL = "BTCUSDT"
_INTERVAL_S = 60.0
_OFFSET_S = 2.0
# `1_788_000_000` is divisible by 60, so the grid points of this test are exactly
# `1_788_000_000 + _OFFSET_S + 60k`. The start is deliberately 3,7 s OFF the grid: a scheduler
# that merely kept a fixed period would preserve that 3,7 s forever, and the first assertion
# below is that the very first wake SNAPS to the grid instead of inheriting the boot phase.
_GRID_ORIGIN_S = 1_788_000_000.0
_START_S = _GRID_ORIGIN_S + 3.7
_FIRST_TARGET_S = _GRID_ORIGIN_S + _OFFSET_S + _INTERVAL_S
_TOLERANCE_S = 1e-6


class _FakeWallClock:
    """An epoch-seconds clock that moves only when something says it moved."""

    def __init__(self, now_s: float) -> None:
        """Start the clock at `now_s`."""
        self.now_s = now_s

    def __call__(self) -> float:
        """Read the clock, the way `time.time` would be read."""
        return self.now_s

    def advance(self, seconds: float) -> None:
        """Move the clock forward — work taking time, or a sleep elapsing."""
        self.now_s += seconds


class _ClockAdvancingStopEvent(threading.Event):
    """A shutdown latch whose `wait` ELAPSES on the fake clock rather than blocking on the real one.

    This is the substitution that makes the cadence observable: every `wait` records the duration
    it was handed and the instant the sleeper woke at, which together are the whole evidence that
    the period is `interval_s` and not `interval_s + work`.
    """

    def __init__(self, clock: _FakeWallClock) -> None:
        """Bind the clock this latch advances, and start with nothing recorded."""
        super().__init__()
        self._clock = clock
        self.slept_s: list[float] = []
        self.woke_at_s: list[float] = []

    def wait(self, timeout: float | None = None) -> bool:
        """Record the requested sleep, elapse it on the fake clock, and answer the latch state."""
        assert timeout is not None, "the aligned ticker must always wait with a deadline"
        self.slept_s.append(timeout)
        self._clock.advance(timeout)
        self.woke_at_s.append(self._clock.now_s)
        return self.is_set()


class _WorkingKlinesClient:
    """Answers one page per call and CHARGES the fake clock a scripted amount of work for it."""

    def __init__(self, clock: _FakeWallClock, work_s: tuple[float, ...]) -> None:
        """Bind the clock to charge and the per-call work durations, which repeat cyclically."""
        self._clock = clock
        self._work_s = work_s
        self.calls = 0

    def klines(
        self,
        symbol: str,
        interval: str,
        limit: int,
        start_time_ms: int | None = None,
        end_time_ms: int | None = None,
    ) -> KlinesPageResponse:
        """Charge this call's work to the clock, then answer one already-closed bar."""
        self._clock.advance(self._work_s[self.calls % len(self._work_s)])
        self.calls += 1
        open_time_ms = int(_GRID_ORIGIN_S * 1000) - KLINES_BUCKET_WIDTH_MS
        return KlinesPageResponse(
            status=200,
            api_code=None,
            rows=(
                KlineRow(
                    raw=(
                        open_time_ms,
                        "100.0",
                        "101.0",
                        "99.0",
                        "100.5",
                        "10.5",
                        open_time_ms + KLINES_BUCKET_WIDTH_MS - 1,
                        "1000.0",
                        7,
                        "5.0",
                        "500.0",
                        "0",
                    )
                ),
            ),
        )


class _SilentSink:
    """Accepts every row without recording it — these tests measure TIME, not publication."""

    def accept(self, row: object, *, run_id: str | None = None) -> None:
        """Swallow the row; publication is covered by `test_collectors_cli_klines_collector`."""


def _drive(work_s: tuple[float, ...], passes: int) -> _ClockAdvancingStopEvent:
    """Run the real `_run_klines_collector` for `passes` cycles on the fake clock, then stop it."""
    clock = _FakeWallClock(_START_S)
    stop = _ClockAdvancingStopEvent(clock)
    runs = 0

    def _record(_run: object) -> None:
        nonlocal runs
        runs += 1
        if runs == passes:
            stop.set()

    _run_klines_collector(
        stop_event=stop,
        failure_event=threading.Event(),
        exit_code=[0],
        client=_WorkingKlinesClient(clock, work_s),
        sink=_SilentSink(),  # type: ignore[arg-type]
        to_rows=build_klines_to_rows(),
        record_run=_record,
        symbols=(_SYMBOL,),
        interval_s=_INTERVAL_S,
        offset_s=_OFFSET_S,
        backfill_days=1,
        wall_clock_s=clock,
    )
    return stop


# ── THE FALSIFIER: PUT `wait(interval_s)` BACK AND THIS FAILS, NAMING THE DRIFT ─────────────


def test_variable_work_does_not_move_the_wake_instants_off_the_cadence_grid() -> None:
    """Six cycles, six different work durations, six wake instants exactly `interval_s` apart.

    THIS IS THE FALSIFIER of the fix. Restore `stop_event.wait(interval_s)` after the work and
    this test fails on its first assertion: the wake instants become
    `start + Σ(work_i + interval)`, which is off the grid by the accumulated work — `3,7 s` of
    boot phase plus a growing sum, never `_GRID_ORIGIN_S + _OFFSET_S + 60k`.
    """
    work_s = (1.4, 0.3, 7.9, 2.1, 0.05, 31.0)
    stop = _drive(work_s, passes=6)

    expected = [_FIRST_TARGET_S + _INTERVAL_S * index for index in range(6)]
    assert stop.woke_at_s == pytest.approx(expected, abs=_TOLERANCE_S), (
        "DERIVA DO ESCALONADOR / SCHEDULER DRIFT: the cycle woke at "
        f"{stop.woke_at_s} instead of the grid instants {expected}. A fixed sleep taken AFTER "
        f"the work makes the real period `interval_s + work_duration` ({_INTERVAL_S}s + "
        f"{work_s}s here), so the phase slides forward every turn and eventually lands the poll "
        "a whole bucket late — the 105/4.289 readings >= 60.000 ms this fix exists to remove."
    )

    gaps = [
        later - earlier for earlier, later in zip(stop.woke_at_s, stop.woke_at_s[1:], strict=False)
    ]
    assert gaps == pytest.approx([_INTERVAL_S] * 5, abs=_TOLERANCE_S), (
        f"SCHEDULER DRIFT: consecutive cycles were {gaps}s apart, not {_INTERVAL_S}s. The "
        "period must be the cadence alone; any dependence on how long the work took IS the "
        "drift."
    )

    assert stop.slept_s == pytest.approx(
        [
            gap - work
            for gap, work in zip(
                [_FIRST_TARGET_S - _START_S] + [_INTERVAL_S] * 5, work_s, strict=True
            )
        ],
        abs=_TOLERANCE_S,
    ), "each sleep must ABSORB that cycle's work, which is what keeps the period constant"


def test_the_first_wake_snaps_to_the_grid_instead_of_inheriting_the_boot_phase() -> None:
    """A process booted 3,7 s off the grid is ON the grid from its very first cycle.

    Morde: anchor the cadence to `monotonic()` (or to the boot instant) and drift disappears but
    the PHASE stays wherever the container happened to start — the `p99` would then be an
    accident of the deploy, uniformly distributed over the whole minute, which is exactly the
    regime the measurement found.
    """
    stop = _drive((0.5,), passes=1)
    assert stop.woke_at_s[0] == pytest.approx(_FIRST_TARGET_S, abs=_TOLERANCE_S)
    assert (stop.woke_at_s[0] - _OFFSET_S) % _INTERVAL_S == pytest.approx(0.0, abs=_TOLERANCE_S)


# ── THE CASE THE NAIVE FIX GETS WRONG: WORK LONGER THAN THE CADENCE ────────────────────────


def test_work_longer_than_the_cadence_skips_ahead_and_never_sleeps_backwards() -> None:
    """DECLARED BEHAVIOUR: skip the grid points that could not be served; never sleep `<= 0`.

    `75 s` of work on a `60 s` cadence means the grid point the cycle was meant to serve is
    already in the past when it finishes. The naive `last_target + interval_s` would hand
    `Event.wait` a NEGATIVE duration, which it treats as zero — a tight loop against
    `/fapi/v1/klines`, i.e. a ban. This asserts the other choice: the next instant STRICTLY
    ahead, which is `+120 s` from the previous target, still on the grid, with a real `45 s`
    sleep and one tick declared lost.

    Morde: allow a zero-length sleep and this passes while the collector busy-loops.
    """
    stop = _drive((75.0,), passes=3)

    assert all(slept > 0.0 for slept in stop.slept_s), (
        f"a sleep of {stop.slept_s} contains a non-positive duration: work longer than the "
        "cadence must SKIP forward, never wait backwards"
    )
    # `75 s` of work from `_START_S` already overshoots the first grid point, so the FIRST wake
    # is `_GRID_ORIGIN_S + _OFFSET_S + 120` — one point skipped — and every wake after it is
    # `120 s` later, which is the cadence doubled, never the cadence plus the work.
    first = _GRID_ORIGIN_S + _OFFSET_S + 2 * _INTERVAL_S
    expected = [first, first + 2 * _INTERVAL_S, first + 4 * _INTERVAL_S]
    assert stop.woke_at_s == pytest.approx(expected, abs=_TOLERANCE_S), (
        "75s of work on a 60s cadence must land on every SECOND grid point — still aligned, "
        f"one tick skipped; got {stop.woke_at_s}"
    )
    assert stop.slept_s[1:] == pytest.approx([45.0, 45.0], abs=_TOLERANCE_S)


def test_a_skipped_grid_point_is_counted_and_a_served_one_is_not() -> None:
    """`GridTick.skipped_ticks` separates "late" from "lost", because the log line has to.

    Morde: return `0` always and an operator reading `collector_tick_skipped` cannot tell a
    cycle that ran long once from a collector that is permanently behind its own cadence.
    """
    clock = _FakeWallClock(_GRID_ORIGIN_S)
    ticker = GridAlignedTicker(
        interval_s=_INTERVAL_S, offset_s=_OFFSET_S, endpoint="/fapi/v1/klines", wall_clock_s=clock
    )
    stop = _ClockAdvancingStopEvent(clock)

    first = ticker.wait(stop)
    assert first.skipped_ticks == 0, "the first wait has no previous target to have missed"

    clock.advance(1.0)
    served = ticker.wait(stop)
    assert served.skipped_ticks == 0

    clock.advance(2 * _INTERVAL_S + 1.0)
    lost = ticker.wait(stop)
    assert lost.skipped_ticks == 2, "two whole grid points passed unserved"
    assert lost.target_s == pytest.approx(served.target_s + 3 * _INTERVAL_S, abs=_TOLERANCE_S)


# ── THE ARITHMETIC ITSELF ──────────────────────────────────────────────────────────────────


def test_an_instant_exactly_on_the_grid_answers_the_next_point_not_itself() -> None:
    """STRICTLY after: returning `now_s` itself is a zero-length sleep, i.e. the same tight loop.

    Morde: change `floor(...) + 1` to `ceil(...)` and this returns `now_s`, which reads as
    "aligned" and behaves as "no sleep at all".
    """
    on_grid = _GRID_ORIGIN_S + _OFFSET_S
    assert next_grid_instant_s(on_grid, _INTERVAL_S, _OFFSET_S) == pytest.approx(
        on_grid + _INTERVAL_S, abs=_TOLERANCE_S
    )


@pytest.mark.parametrize(
    "now_s",
    [_GRID_ORIGIN_S, _GRID_ORIGIN_S + 0.001, _GRID_ORIGIN_S + 59.999, _GRID_ORIGIN_S + 601.5],
)
def test_the_answer_is_always_ahead_by_more_than_zero_and_at_most_one_cadence(now_s: float) -> None:
    """The two bounds that together forbid both a negative sleep and a skipped-but-unaligned one."""
    target = next_grid_instant_s(now_s, _INTERVAL_S, _OFFSET_S)
    assert 0.0 < target - now_s <= _INTERVAL_S


def test_a_cadence_of_zero_is_refused_rather_than_turned_into_a_tight_loop() -> None:
    """`RN-4` fail-fast, same reasoning as `_positive_float` in `collectors_cli`."""
    with pytest.raises(ValueError, match="interval_s must be greater than zero"):
        next_grid_instant_s(_GRID_ORIGIN_S, 0.0)


def test_the_ticker_refuses_a_non_positive_cadence_too_not_only_the_bare_function() -> None:
    """The class guards its own constructor — it is reachable without the bare function.

    Morde: trust `collectors_cli`'s boot check alone and a caller composing the ticker directly
    (a future collector, a probe) gets a tight loop with no line naming the cadence.
    """
    with pytest.raises(ValueError, match="interval_s must be greater than zero"):
        GridAlignedTicker(interval_s=0.0, endpoint="/x")


def test_an_offset_of_a_whole_cadence_or_more_is_refused() -> None:
    """An offset of a whole cadence moves the poll onto ANOTHER bucket while looking aligned."""
    with pytest.raises(ValueError, match=r"offset_s must be in \[0, 60.0\)"):
        GridAlignedTicker(interval_s=_INTERVAL_S, offset_s=_INTERVAL_S, endpoint="/x")
    with pytest.raises(ValueError, match=r"offset_s must be in \[0, 60.0\)"):
        GridAlignedTicker(interval_s=_INTERVAL_S, offset_s=-0.1, endpoint="/x")
