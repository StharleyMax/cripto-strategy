"""The climb itself: it accelerates, it stops at the FIRST 429, it recoils, it does not retry.

Every case runs against `ScriptedProbe` and `RecordingClock`, so nothing here opens a socket
and nothing here waits a real second — which is what lets the logic of a LIVE measurement be
regression-tested inside an offline suite.
"""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.quota_bucket import BINANCE_FUTURES_DATA
from src.modules.sentimento.domain.ramp_ledger import RampConclusion, RungOutcome
from src.modules.sentimento.domain.ramp_plan import InvalidRampPlanError, RampPlan
from src.modules.sentimento.domain.recoil_policy import RecoilPolicy, RecoilSource
from src.modules.sentimento.use_cases.run_quota_ramp import run_quota_ramp
from tests.helpers.quota_ramp_doubles import RecordingClock, ScriptedProbe, accepted, throttled

POLICY = RecoilPolicy(base_seconds=60.0, factor=2.0, cap_seconds=300.0)


def _plan(max_requests: int) -> RampPlan:
    """Build a ramp plan against the blind bucket, accelerating from 1 s down to 0,25 s."""
    return RampPlan(
        bucket=BINANCE_FUTURES_DATA,
        path="/futures/data/openInterestHist?symbol=BTCUSDT&period=5m&limit=1",
        max_requests=max_requests,
        initial_interval_seconds=1.0,
        interval_factor=0.5,
        min_interval_seconds=0.25,
    )


def test_the_ramp_stops_at_the_first_429_and_does_not_climb_again() -> None:
    """Stopping is not an optimisation: a second climb is a second measurement, not more `n`."""
    probe = ScriptedProbe([accepted(), accepted(), throttled({"retry-after": "30"}), accepted()])
    clock = RecordingClock()

    run = run_quota_ramp(_plan(max_requests=4), probe, clock, POLICY)

    assert len(probe.calls) == 3
    assert len(run.ledger.rungs) == 3
    verdict = run.ledger.verdict()
    assert verdict.conclusion is RampConclusion.THROTTLED
    # The ordinal of the refusal is 3; what FITS is 2. Asserting both is the point.
    assert verdict.throttled_at_request == 3
    assert verdict.accepted_before_throttle == 2


def test_the_ramp_recoils_exactly_once_and_for_the_declared_time() -> None:
    """The recoil is asserted on the RECORDED pause, so a run that forgot to wait is caught."""
    probe = ScriptedProbe([accepted(), throttled({"retry-after": "90"})])
    clock = RecordingClock()

    run = run_quota_ramp(_plan(max_requests=5), probe, clock, POLICY)

    assert run.recoiled is True
    assert run.recoil is not None
    assert run.recoil.seconds == 90.0
    assert run.recoil.source is RecoilSource.RETRY_AFTER
    # One climb pause (after rung 1) plus one recoil, and NOTHING after it.
    assert clock.slept == [1.0, 90.0]


def test_a_429_without_retry_after_still_recoils_and_records_the_absence() -> None:
    """Binance is not obliged to send the header, and the run must not treat mute as zero."""
    probe = ScriptedProbe([throttled()])
    clock = RecordingClock()

    run = run_quota_ramp(_plan(max_requests=3), probe, clock, POLICY)

    assert run.recoil is not None
    assert run.recoil.retry_after_present is False
    assert run.recoil.source is RecoilSource.POLICY_NO_RETRY_AFTER
    assert clock.slept == [60.0]


def test_a_clean_ramp_recoils_never_and_reports_a_lower_bound() -> None:
    """The other side of the recoil assertion: no `429`, no pause, no ceiling claimed."""
    probe = ScriptedProbe([accepted(), accepted(), accepted()])
    clock = RecordingClock()

    run = run_quota_ramp(_plan(max_requests=3), probe, clock, POLICY)

    verdict = run.ledger.verdict()
    assert run.recoiled is False
    assert verdict.conclusion is RampConclusion.CEILING_NOT_REACHED
    assert verdict.publishes_a_ceiling is False
    # Two climb pauses for three requests, and no recoil pause among them.
    assert clock.slept == [1.0, 0.5]


def test_a_dead_socket_stops_the_climb_instead_of_hammering_through_it() -> None:
    """And the pass becomes INCONCLUSIVE, never a lower bound built on requests that failed."""
    probe = ScriptedProbe([accepted(), ConnectionResetError("connection reset by peer")])
    clock = RecordingClock()

    run = run_quota_ramp(_plan(max_requests=10), probe, clock, POLICY)

    assert len(probe.calls) == 2
    assert run.ledger.rungs[-1].outcome is RungOutcome.NOT_DISPATCHED
    assert run.ledger.rungs[-1].detail is not None
    assert "ConnectionResetError" in run.ledger.rungs[-1].detail
    assert run.ledger.verdict().conclusion is RampConclusion.INCONCLUSIVE


def test_the_ramp_never_exceeds_its_declared_ceiling() -> None:
    """`ScriptedProbe` raises on the extra call, so a runaway fails LOUDLY instead of quietly."""
    probe = ScriptedProbe([accepted() for _ in range(3)])
    clock = RecordingClock()

    run = run_quota_ramp(_plan(max_requests=3), probe, clock, POLICY)

    assert len(probe.calls) == 3
    assert len(run.ledger.rungs) == 3


def test_the_interval_shrinks_so_the_rate_actually_climbs() -> None:
    """A "ramp" whose cadence never changes is a constant-rate hammer with a nicer name."""
    plan = _plan(max_requests=6)
    intervals = [plan.interval_after(done) for done in range(1, 6)]

    assert intervals == [1.0, 0.5, 0.25, 0.25, 0.25]
    assert intervals == sorted(intervals, reverse=True)
    assert min(intervals) == plan.min_interval_seconds


@pytest.mark.parametrize(
    ("max_requests", "initial", "factor", "minimum"),
    [
        (0, 1.0, 0.5, 0.25),
        (3, 1.0, 0.5, 0.0),
        (3, 0.1, 0.5, 0.25),
        (3, 1.0, 1.5, 0.25),
    ],
)
def test_a_plan_that_would_burst_or_never_stop_is_refused(
    max_requests: int, initial: float, factor: float, minimum: float
) -> None:
    """Every refusal here is a load this project promised a third party it would not send."""
    with pytest.raises(InvalidRampPlanError):
        RampPlan(
            bucket=BINANCE_FUTURES_DATA,
            path="/futures/data/openInterestHist",
            max_requests=max_requests,
            initial_interval_seconds=initial,
            interval_factor=factor,
            min_interval_seconds=minimum,
        )


@pytest.mark.parametrize("requests_done", [0, -1])
def test_the_pause_count_is_one_based_and_refuses_anything_below(requests_done: int) -> None:
    """`interval_after(1)` IS `initial_interval_seconds`; a zero-based caller must fail loudly.

    The off-by-one this guards is not cosmetic: read zero-based, the ramp would skip its own
    declared starting cadence and open one notch faster than the plan says — against somebody
    else's quota.
    """
    with pytest.raises(InvalidRampPlanError, match="starts at 1"):
        _plan(max_requests=3).interval_after(requests_done)


def test_the_first_pause_is_exactly_the_declared_initial_interval() -> None:
    """The other side of the same guard, stated as the value rather than as the refusal."""
    plan = _plan(max_requests=3)

    assert plan.interval_after(1) == plan.initial_interval_seconds == 1.0


def test_a_429_on_the_very_first_rung_recoils_and_reports_that_nothing_fit() -> None:
    """The window may already be spent when the ramp starts, and zero is a legal answer.

    The ordinal is 1 and what fits is 0 — the same two quantities the live pass confused, at
    the smallest `n` where they can still be told apart.
    """
    probe = ScriptedProbe([throttled({"retry-after": "45"}), accepted()])
    clock = RecordingClock()

    run = run_quota_ramp(_plan(max_requests=5), probe, clock, POLICY)

    verdict = run.ledger.verdict()
    assert len(probe.calls) == 1
    assert verdict.throttled_at_request == 1
    assert verdict.accepted_before_throttle == 0
    assert verdict.publishes_a_ceiling is True
    # `Retry-After: 45` is SHORTER than our 60 s escalation, so the policy raises it and says
    # so: waiting longer than asked is conservative, waiting less would be the violation.
    assert clock.slept == [60.0]
    assert run.recoil is not None
    assert run.recoil.source is RecoilSource.RETRY_AFTER_RAISED_BY_POLICY


def test_a_second_429_after_a_success_is_never_reached_because_the_ramp_stopped() -> None:
    """`429` -> `200` -> `429` scripted; only the FIRST is spent, and the rest is proof of that.

    `ScriptedProbe` raises if the ramp asks for more than the script holds, so the assertion
    that matters is the CALL COUNT: one request, one recoil, and two scripted steps left
    untouched.
    """
    probe = ScriptedProbe([throttled(), accepted(), throttled({"retry-after": "600"})])
    clock = RecordingClock()

    run = run_quota_ramp(_plan(max_requests=3), probe, clock, POLICY)

    assert len(probe.calls) == 1
    assert len(run.ledger.rungs) == 1
    assert run.recoil is not None
    assert run.recoil.source is RecoilSource.POLICY_NO_RETRY_AFTER
    assert clock.slept == [60.0]


def test_the_recoil_reads_an_http_date_retry_after_against_the_wall_clock() -> None:
    """The date form has to be resolved against `epoch()`, not against `monotonic()`.

    `RecordingClock` starts at epoch `1 800 000 000`, so a header naming 120 s later is
    `'Fri, 15 Jan 2027 08:02:00 GMT'` and MUST come out as a 120 s pause. Reading it against
    the monotonic reading (which starts at zero) would produce a 57-year wait.
    """
    probe = ScriptedProbe([accepted(), throttled({"Retry-After": "Fri, 15 Jan 2027 08:02:00 GMT"})])
    clock = RecordingClock()

    run = run_quota_ramp(_plan(max_requests=4), probe, clock, POLICY)

    assert run.recoil is not None
    assert run.recoil.source is RecoilSource.RETRY_AFTER
    assert 119.0 <= run.recoil.seconds <= 121.0
    assert run.ledger.rungs[1].retry_after_seconds is not None


def test_an_http_date_retry_after_already_in_the_past_falls_back_to_our_policy() -> None:
    """A clock-skewed provider must not shorten the back-off below our own escalation."""
    probe = ScriptedProbe([accepted(), throttled({"Retry-After": "Fri, 15 Jan 2027 07:55:00 GMT"})])
    clock = RecordingClock()

    run = run_quota_ramp(_plan(max_requests=4), probe, clock, POLICY)

    assert run.recoil is not None
    assert run.recoil.seconds == 60.0
    assert run.recoil.source is RecoilSource.RETRY_AFTER_RAISED_BY_POLICY
    assert run.recoil.retry_after_present is True
