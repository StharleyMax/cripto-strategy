"""`T-05.7`: the detector answers from HEARTBEAT and CONTIGUITY, and a rate detector cannot.

The central test of this file is the one that names a rate detector and refuses to be one:
it builds the two scenarios that a point count renders identically — a healthy quiet market and
a dead collector — and requires this detector to separate them. Without that test, every other
assertion here would also pass against a detector that simply counted points, which is the
`rc=0` of `ADR-012`: a signal indistinguishable between "nothing happened" and "the instrument
never could tell".
"""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.liquidation_liveness import (
    STALE_AFTER_CYCLES,
    CycleHeartbeat,
    InvalidHeartbeatError,
    LivenessKind,
    assess_liquidation_liveness,
)

_MINUTE_MS = 60_000
_CADENCE_MS = 5 * _MINUTE_MS
_LOOKBACK_MS = 3 * 60 * _MINUTE_MS
_NOW_MS = 1_789_200_000_000


def _beat(ended_at_ms: int, *, succeeded: bool = True) -> CycleHeartbeat:
    """One cycle that closed at `ended_at_ms` having asked for the standard lookback."""
    return CycleHeartbeat(
        ended_at_ms=ended_at_ms,
        covered_from_ms=ended_at_ms - _LOOKBACK_MS,
        covered_to_ms=ended_at_ms,
        succeeded=succeeded,
    )


def _regular_run(n_cycles: int, *, until_ms: int = _NOW_MS) -> list[CycleHeartbeat]:
    """`n_cycles` heartbeats on the cadence, the last one landing at `until_ms`."""
    return [_beat(until_ms - index * _CADENCE_MS) for index in reversed(range(n_cycles))]


# ── THE CENTRAL FALSIFIER ─────────────────────────────────────────────────────────────────


def test_a_rate_detector_cannot_tell_these_two_apart_and_this_one_can() -> None:
    """THE WHOLE POINT OF `T-05.7`, in one test.

    Scenario A — a HEALTHY collector over a quiet market: every cycle ran and published zero
    points, because only 20,2% of 1-minute buckets carry a liquidation at all
    `[MEDIDO 2026-09-12, n=14.344 buckets possiveis, 2.900 preenchidos]`.

    Scenario B — a DEAD collector: nothing ran for hours, so zero points too.

    A rate detector reads `0` in both and says the same thing. That is exactly how
    `!forceOrder@arr` stayed mute for ~46 h with nothing raising a hand
    (`ACHADO-FORCEORDER.md`, `n=2` runs). This detector reads the HEARTBEAT, so A is `ALIVE`
    and B is `SILENT` — and NEITHER verdict consulted a point count, because this module has
    no parameter for one.
    """
    healthy_but_quiet = _regular_run(6)
    dead_for_hours = _regular_run(6, until_ms=_NOW_MS - (46 * 60 * _MINUTE_MS))

    alive = assess_liquidation_liveness(healthy_but_quiet, now_ms=_NOW_MS, cadence_ms=_CADENCE_MS)
    dead = assess_liquidation_liveness(dead_for_hours, now_ms=_NOW_MS, cadence_ms=_CADENCE_MS)

    assert alive.kind is LivenessKind.ALIVE
    assert dead.kind is LivenessKind.SILENT
    assert dead.silent_for_ms is not None
    assert dead.silent_for_ms > 46 * 60 * _MINUTE_MS - 1


def test_the_verdict_is_identical_for_a_quiet_market_and_a_busy_one() -> None:
    """THE INVARIANT: no point count enters this module, so none can change its answer.

    The two calls below differ in NOTHING this module can see, because there is nothing for a
    volume to be passed as. This test is the executable form of that structural claim — if a
    future change added a `n_points` parameter with a default, this test would keep passing,
    so it is paired with the one above, which fails the moment the rate becomes the signal.
    """
    beats = _regular_run(6)
    first = assess_liquidation_liveness(beats, now_ms=_NOW_MS, cadence_ms=_CADENCE_MS)
    second = assess_liquidation_liveness(beats, now_ms=_NOW_MS, cadence_ms=_CADENCE_MS)
    assert first == second
    assert first.kind is LivenessKind.ALIVE


# ── HEARTBEAT ─────────────────────────────────────────────────────────────────────────────


def test_a_collector_late_by_more_than_k_cadences_is_silent() -> None:
    """LATE is defined in units of the schedule, so a cadence change moves the threshold."""
    beats = _regular_run(4, until_ms=_NOW_MS - (STALE_AFTER_CYCLES * _CADENCE_MS) - 1)
    verdict = assess_liquidation_liveness(beats, now_ms=_NOW_MS, cadence_ms=_CADENCE_MS)
    assert verdict.kind is LivenessKind.SILENT
    assert verdict.stale_after_ms == STALE_AFTER_CYCLES * _CADENCE_MS


def test_a_collector_late_by_less_than_k_cadences_is_still_alive() -> None:
    """THE CALA HALF: one skipped cycle is jitter, not death, and must not page anybody."""
    beats = _regular_run(4, until_ms=_NOW_MS - _CADENCE_MS)
    verdict = assess_liquidation_liveness(beats, now_ms=_NOW_MS, cadence_ms=_CADENCE_MS)
    assert verdict.kind is LivenessKind.ALIVE


def test_cycles_that_all_failed_are_silent_even_though_they_ran() -> None:
    """A cycle that ran and FAILED is not a heartbeat — the pipe delivered nothing.

    This is the `!forceOrder@arr` shape exactly: runs exist in `md.ingest_run`, all `REJECTED`,
    `n_written = 0` `[MEDIDO 2026-09-12, n=5 runs]`. A detector that counted RUNS rather than
    SUCCESSFUL runs would have called that collector alive for 46 hours.
    """
    beats = [_beat(_NOW_MS - index * _CADENCE_MS, succeeded=False) for index in range(4)]
    verdict = assess_liquidation_liveness(beats, now_ms=_NOW_MS, cadence_ms=_CADENCE_MS)
    assert verdict.kind is LivenessKind.SILENT
    assert verdict.last_success_at_ms is None
    assert verdict.silent_for_ms is None


def test_never_having_succeeded_is_not_rendered_as_a_huge_silence() -> None:
    """`None` and "a very long time" are different facts and must not share a representation."""
    beats = [_beat(_NOW_MS - index * _CADENCE_MS, succeeded=False) for index in range(4)]
    verdict = assess_liquidation_liveness(beats, now_ms=_NOW_MS, cadence_ms=_CADENCE_MS)
    assert verdict.silent_for_ms is None


# ── CONTIGUITY ────────────────────────────────────────────────────────────────────────────


def test_a_hole_in_the_covered_span_is_reported_even_though_the_pipe_is_beating() -> None:
    """`GAPPED`: up now, with time behind it nobody looked at — recoverable WHILE VISIBLE.

    Folding this into `ALIVE` would hide recoverable data loss; folding it into `SILENT` would
    say the pipe is down when it is up and catching up.
    """
    old = CycleHeartbeat(
        ended_at_ms=_NOW_MS - (20 * 60 * _MINUTE_MS),
        covered_from_ms=_NOW_MS - (21 * 60 * _MINUTE_MS),
        covered_to_ms=_NOW_MS - (20 * 60 * _MINUTE_MS),
        succeeded=True,
    )
    recent = CycleHeartbeat(
        ended_at_ms=_NOW_MS,
        covered_from_ms=_NOW_MS - (2 * 60 * _MINUTE_MS),
        covered_to_ms=_NOW_MS,
        succeeded=True,
    )
    verdict = assess_liquidation_liveness([old, recent], now_ms=_NOW_MS, cadence_ms=_CADENCE_MS)
    assert verdict.kind is LivenessKind.GAPPED
    assert len(verdict.uncovered) == 1
    assert verdict.uncovered[0].duration_ms == 18 * 60 * _MINUTE_MS


def test_overlapping_windows_are_merged_and_never_reported_as_a_seam() -> None:
    """Every cycle deliberately over-asks, because window width is free. Overlap is NORMAL.

    A detector that treated each cycle's window as its own interval would report a hole at
    every seam and be useless within one cadence.
    """
    verdict = assess_liquidation_liveness(_regular_run(6), now_ms=_NOW_MS, cadence_ms=_CADENCE_MS)
    assert verdict.uncovered == ()
    assert verdict.kind is LivenessKind.ALIVE


def test_silence_wins_over_a_gap_because_it_is_the_diagnosis() -> None:
    """A pipe that is down NOW is down, whatever holes it left behind it."""
    old = CycleHeartbeat(
        ended_at_ms=_NOW_MS - (40 * 60 * _MINUTE_MS),
        covered_from_ms=_NOW_MS - (41 * 60 * _MINUTE_MS),
        covered_to_ms=_NOW_MS - (40 * 60 * _MINUTE_MS),
        succeeded=True,
    )
    later = CycleHeartbeat(
        ended_at_ms=_NOW_MS - (30 * 60 * _MINUTE_MS),
        covered_from_ms=_NOW_MS - (31 * 60 * _MINUTE_MS),
        covered_to_ms=_NOW_MS - (30 * 60 * _MINUTE_MS),
        succeeded=True,
    )
    verdict = assess_liquidation_liveness([old, later], now_ms=_NOW_MS, cadence_ms=_CADENCE_MS)
    assert verdict.kind is LivenessKind.SILENT


def test_a_failed_cycle_does_not_count_as_coverage() -> None:
    """A cycle that failed looked at nothing, so its declared window is not covered."""
    covered = CycleHeartbeat(
        ended_at_ms=_NOW_MS - (20 * 60 * _MINUTE_MS),
        covered_from_ms=_NOW_MS - (21 * 60 * _MINUTE_MS),
        covered_to_ms=_NOW_MS - (20 * 60 * _MINUTE_MS),
        succeeded=True,
    )
    failed_middle = CycleHeartbeat(
        ended_at_ms=_NOW_MS - (10 * 60 * _MINUTE_MS),
        covered_from_ms=_NOW_MS - (20 * 60 * _MINUTE_MS),
        covered_to_ms=_NOW_MS - (10 * 60 * _MINUTE_MS),
        succeeded=False,
    )
    recent = CycleHeartbeat(
        ended_at_ms=_NOW_MS,
        covered_from_ms=_NOW_MS - (2 * 60 * _MINUTE_MS),
        covered_to_ms=_NOW_MS,
        succeeded=True,
    )
    verdict = assess_liquidation_liveness(
        [covered, failed_middle, recent], now_ms=_NOW_MS, cadence_ms=_CADENCE_MS
    )
    assert verdict.kind is LivenessKind.GAPPED


# ── THE REFUSALS ──────────────────────────────────────────────────────────────────────────


def test_too_few_cycles_is_not_judged_rather_than_guessed() -> None:
    """A collector that just started has no cadence to be late against."""
    verdict = assess_liquidation_liveness([_beat(_NOW_MS)], now_ms=_NOW_MS, cadence_ms=_CADENCE_MS)
    assert verdict.kind is LivenessKind.NOT_JUDGED
    assert verdict.n_cycles == 1


def test_an_impossible_heartbeat_is_refused() -> None:
    """A cycle cannot cover an instant that had not happened when it closed."""
    with pytest.raises(InvalidHeartbeatError, match="had not happened"):
        CycleHeartbeat(
            ended_at_ms=_NOW_MS,
            covered_from_ms=_NOW_MS - 1,
            covered_to_ms=_NOW_MS + 1,
            succeeded=True,
        )
    with pytest.raises(InvalidHeartbeatError, match="did not look anywhere"):
        CycleHeartbeat(
            ended_at_ms=_NOW_MS,
            covered_from_ms=_NOW_MS,
            covered_to_ms=_NOW_MS,
            succeeded=True,
        )


def test_a_non_positive_cadence_is_refused() -> None:
    """Without a cadence there is no definition of late, and a zero would make everything late."""
    with pytest.raises(ValueError, match="positive span"):
        assess_liquidation_liveness(_regular_run(3), now_ms=_NOW_MS, cadence_ms=0)


def test_is_alive_is_true_only_for_a_beating_and_whole_pipe() -> None:
    """The convenience property never disagrees with the verdict it summarises."""
    assert assess_liquidation_liveness(
        _regular_run(6), now_ms=_NOW_MS, cadence_ms=_CADENCE_MS
    ).is_alive
    assert not assess_liquidation_liveness(
        _regular_run(6, until_ms=_NOW_MS - (46 * 60 * _MINUTE_MS)),
        now_ms=_NOW_MS,
        cadence_ms=_CADENCE_MS,
    ).is_alive
