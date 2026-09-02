"""`calibrate_clock_skew_tolerance_from_history`: read the port, calibrate, propagate refusal."""

from __future__ import annotations

import logging

import pytest

from src.modules.sentimento.domain.clock_skew_tolerance import (
    ClockSkewObservation,
    InsufficientClockSkewCalibrationDataError,
)
from src.modules.sentimento.use_cases.calibrate_clock_skew_tolerance import (
    calibrate_clock_skew_tolerance_from_history,
)

_MS_PER_DAY = 24 * 60 * 60 * 1000


class _ScriptedHistorySource:
    """Hands back a canned tuple of observations, no store involved."""

    def __init__(self, observations: tuple[ClockSkewObservation, ...]) -> None:
        """Take the canned observations to hand back on every call."""
        self._observations = observations

    def observations(self) -> tuple[ClockSkewObservation, ...]:
        """Return the canned observations."""
        return self._observations


def test_calibrates_from_a_source_spanning_enough_days() -> None:
    """SIMULATED: a source reporting 8 days of history calibrates through the use case."""
    source = _ScriptedHistorySource(
        (
            ClockSkewObservation(clock_skew_ms=10, observed_at_ms=0),
            ClockSkewObservation(clock_skew_ms=-40, observed_at_ms=8 * _MS_PER_DAY),
        )
    )

    result = calibrate_clock_skew_tolerance_from_history(source)

    assert result.sample_n == 2
    assert result.tolerance_ms == 40


def test_lets_the_refusal_propagate_instead_of_swallowing_it() -> None:
    """A thin source's refusal reaches the caller unchanged — never caught into a default."""
    source = _ScriptedHistorySource((ClockSkewObservation(clock_skew_ms=10, observed_at_ms=0),))

    with pytest.raises(InsufficientClockSkewCalibrationDataError):
        calibrate_clock_skew_tolerance_from_history(source)


def test_logs_the_calibration_at_debug_not_info(caplog: pytest.LogCaptureFixture) -> None:
    """Diagnostics stay at DEBUG — `ingest_health_query`'s convention, off unless asked."""
    source = _ScriptedHistorySource(
        (
            ClockSkewObservation(clock_skew_ms=5, observed_at_ms=0),
            ClockSkewObservation(clock_skew_ms=5, observed_at_ms=7 * _MS_PER_DAY),
        )
    )

    with caplog.at_level(logging.DEBUG):
        calibrate_clock_skew_tolerance_from_history(source)

    matching = [r for r in caplog.records if r.message == "clock_skew_tolerance_calibrated"]
    assert len(matching) == 1
    assert matching[0].levelno == logging.DEBUG
    # `extra=` fields are attached at runtime, so read them from `__dict__` rather than a
    # static attribute — same idiom as `test_checksum_at_the_ingestion_edge.py`.
    fields = matching[0].__dict__
    assert fields["sample_n"] == 2
    assert fields["tolerance_ms"] == 5
