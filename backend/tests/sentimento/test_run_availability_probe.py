"""The continuous sweep: two independently paced schedules, merged by "whichever is due first".

Every case runs against a scripted transport and a clock that only advances on `sleep()`, the
same trick `tests/sentimento/test_quota_ramp_climb.py` uses for the ramp — a multi-minute proof
run is driven in zero real seconds.
"""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.availability_poll import AvailabilityPollOutcome
from src.modules.sentimento.domain.availability_probe_set import (
    AvailabilityProbeSet,
    BinanceFuturesDataEndpoint,
)
from src.modules.sentimento.domain.coinalyze_daily_series import SeriesKind
from src.modules.sentimento.use_cases.run_availability_probe import (
    InvalidProbeRunError,
    run_availability_probe,
)

_PROBE_SET = AvailabilityProbeSet(
    symbols=("BTCUSDT",),
    binance_period_seconds=10.0,
    coinalyze_period_seconds=30.0,
    binance_endpoints=(BinanceFuturesDataEndpoint.OPEN_INTEREST_HIST,),
    coinalyze_endpoints=(SeriesKind.OPEN_INTEREST,),
)

_OUTCOME = AvailabilityPollOutcome(status=200, latest_event_time_ms=None)


class RecordingProbeClock:
    """Advances only when asked to `sleep`, and never waits a real second."""

    def __init__(self) -> None:
        """Start both readings at zero."""
        self._monotonic = 0.0
        self.slept: list[float] = []

    def monotonic(self) -> float:
        """Return the fake monotonic reading, unchanged since the last `sleep`."""
        return self._monotonic

    def now_ms(self) -> int:
        """Return the fake wall clock, derived from the same monotonic counter."""
        return int(self._monotonic * 1000)

    def sleep(self, seconds: float) -> None:
        """Record the pause and advance the clock by it — without waiting."""
        assert seconds >= 0
        self.slept.append(seconds)
        self._monotonic += seconds


class RecordingTransport:
    """Returns a fixed outcome for every call and records what it was asked for, in order."""

    def __init__(self, outcome: AvailabilityPollOutcome = _OUTCOME) -> None:
        """Take the outcome to hand back on every call."""
        self._outcome = outcome
        self.binance_calls: list[tuple[BinanceFuturesDataEndpoint, str]] = []
        self.coinalyze_calls: list[tuple[SeriesKind, str]] = []

    def poll_binance(
        self, endpoint: BinanceFuturesDataEndpoint, symbol: str
    ) -> AvailabilityPollOutcome:
        """Record the call and return the scripted outcome."""
        self.binance_calls.append((endpoint, symbol))
        return self._outcome

    def poll_coinalyze(self, kind: SeriesKind, symbol: str) -> AvailabilityPollOutcome:
        """Record the call and return the scripted outcome."""
        self.coinalyze_calls.append((kind, symbol))
        return self._outcome


def test_a_21_second_window_polls_binance_three_times_and_coinalyze_once() -> None:
    """Binance every 10 s (0, 10, 20), Coinalyze every 30 s (0 only) — `30 >= 21` stops it."""
    transport = RecordingTransport()
    clock = RecordingProbeClock()

    attempts = run_availability_probe(
        _PROBE_SET, transport, clock, total_duration_seconds=21.0, observer_region="unknown"
    )

    assert len(transport.binance_calls) == 3
    assert len(transport.coinalyze_calls) == 1
    assert len(attempts) == 4


def test_the_two_schedules_never_burst_they_wait_exactly_their_own_interval() -> None:
    """Each source waits exactly its own declared interval — never less, never a burst."""
    transport = RecordingTransport()
    clock = RecordingProbeClock()

    run_availability_probe(
        _PROBE_SET, transport, clock, total_duration_seconds=21.0, observer_region="unknown"
    )

    assert clock.slept == [10.0, 10.0]


def test_binance_attempts_are_stamped_ten_seconds_apart() -> None:
    """Binance's own attempts land exactly 10 s apart on the wall clock."""
    transport = RecordingTransport()
    clock = RecordingProbeClock()

    attempts = run_availability_probe(
        _PROBE_SET, transport, clock, total_duration_seconds=21.0, observer_region="unknown"
    )

    binance_source = _PROBE_SET.binance_bucket.identifier
    binance_stamps = [a.polled_at_ms for a in attempts if a.source == binance_source]
    assert binance_stamps == [0, 10_000, 20_000]


def test_every_attempt_carries_the_declared_observer_region_and_target_identity() -> None:
    """At `t=0` both schedules are due, and both poll before either's next due beats the deadline.

    Binance goes first (tie-break), coinalyze follows at the SAME instant — neither's next due
    (10 s / 30 s) beats a 5 s deadline, so the sweep ends there with one poll per source.
    """
    transport = RecordingTransport()
    clock = RecordingProbeClock()

    attempts = run_availability_probe(
        _PROBE_SET,
        transport,
        clock,
        total_duration_seconds=5.0,
        observer_region="sa-east-1-proxy",
    )

    assert len(attempts) == 2
    binance_attempt, coinalyze_attempt = attempts
    assert binance_attempt.observer_region == "sa-east-1-proxy"
    assert coinalyze_attempt.observer_region == "sa-east-1-proxy"
    assert binance_attempt.source == _PROBE_SET.binance_bucket.identifier
    assert binance_attempt.endpoint == BinanceFuturesDataEndpoint.OPEN_INTEREST_HIST.value
    assert binance_attempt.symbol == "BTCUSDT"
    assert binance_attempt.outcome is _OUTCOME
    assert coinalyze_attempt.source == _PROBE_SET.coinalyze_bucket.identifier
    assert coinalyze_attempt.endpoint == SeriesKind.OPEN_INTEREST.value


def test_a_non_positive_duration_is_refused() -> None:
    """A window of zero or negative seconds measures nothing and is refused."""
    transport = RecordingTransport()
    clock = RecordingProbeClock()

    with pytest.raises(InvalidProbeRunError):
        run_availability_probe(
            _PROBE_SET, transport, clock, total_duration_seconds=0.0, observer_region="unknown"
        )


def test_the_binance_transport_receives_the_declared_endpoint_and_symbol_types() -> None:
    """The protocol passes the ENUM member, not its `.value` string — the transport resolves it."""
    transport = RecordingTransport()
    clock = RecordingProbeClock()

    run_availability_probe(
        _PROBE_SET, transport, clock, total_duration_seconds=1.0, observer_region="unknown"
    )

    assert transport.binance_calls == [(BinanceFuturesDataEndpoint.OPEN_INTEREST_HIST, "BTCUSDT")]
