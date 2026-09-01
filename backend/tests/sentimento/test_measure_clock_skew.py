"""`measure_clock_skew` brackets one `observe()` with two clock readings — offline, both fakes."""

from __future__ import annotations

from src.modules.sentimento.domain.clock_skew import ServerTimeObservation
from src.modules.sentimento.use_cases.measure_clock_skew import measure_clock_skew


class ScriptedServerTimeSource:
    """Returns one canned observation and records that it was called exactly once."""

    def __init__(self, observation: ServerTimeObservation) -> None:
        """Take the canned observation to hand back on every call."""
        self._observation = observation
        self.calls = 0

    def observe(self) -> ServerTimeObservation:
        """Return the canned observation and count the call."""
        self.calls += 1
        return self._observation


class ScriptedWallClock:
    """Returns readings from a queue, in order — the bracket built one call at a time."""

    def __init__(self, readings: list[int]) -> None:
        """Take the queue of readings to hand back, oldest first."""
        self._readings = list(readings)
        self.calls = 0

    def now_ms(self) -> int:
        """Pop the next reading and count the call."""
        self.calls += 1
        return self._readings.pop(0)


def test_the_bracket_is_clock_then_network_then_clock() -> None:
    """The falsifier of the ordering: if the network call moved outside the bracket, this fails."""
    observation = ServerTimeObservation(
        server_time_ms=1_500, http_status=200, weight_used=2, body_sha256="f" * 64
    )
    source = ScriptedServerTimeSource(observation)
    clock = ScriptedWallClock([1_000, 1_080])

    sample, returned_observation = measure_clock_skew(source, clock)

    assert sample.local_time_before_ms == 1_000
    assert sample.local_time_after_ms == 1_080
    assert sample.server_time_ms == 1_500
    assert clock.calls == 2
    assert source.calls == 1
    assert returned_observation is observation


def test_the_returned_sample_computes_the_same_skew_a_caller_would() -> None:
    """No silent divergence between what this use case returns and the pure domain math."""
    observation = ServerTimeObservation(
        server_time_ms=1_000, http_status=200, weight_used=1, body_sha256="0" * 64
    )
    source = ScriptedServerTimeSource(observation)
    clock = ScriptedWallClock([1_100, 1_100])

    sample, _ = measure_clock_skew(source, clock)

    assert sample.skew_ms() == 100


def test_only_one_network_call_happens_per_measurement() -> None:
    """A second `observe()` would widen the bracket and re-spend the request for nothing."""
    observation = ServerTimeObservation(
        server_time_ms=1, http_status=200, weight_used=1, body_sha256="0" * 64
    )
    source = ScriptedServerTimeSource(observation)
    clock = ScriptedWallClock([1, 2])

    measure_clock_skew(source, clock)

    assert source.calls == 1
