"""Pure arithmetic of `domain/clock_skew.py`: no clock, no socket, only the three ints."""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.clock_skew import ClockSkewSample, ServerTimeObservation


def test_positive_skew_means_local_clock_is_ahead() -> None:
    """Local reads later than the server: the sign this project stores as `clock_skew_ms`."""
    sample = ClockSkewSample(
        local_time_before_ms=1_000, local_time_after_ms=1_000, server_time_ms=700
    )

    assert sample.skew_ms() == 300


def test_negative_skew_means_local_clock_is_behind() -> None:
    """The opposite direction has to come out negative, not clamped to zero."""
    sample = ClockSkewSample(local_time_before_ms=500, local_time_after_ms=500, server_time_ms=800)

    assert sample.skew_ms() == -300


def test_zero_skew_is_a_real_value_not_an_absence() -> None:
    """A perfectly synced clock produces `0`, and `0` is a measurement, never `None`."""
    sample = ClockSkewSample(local_time_before_ms=42, local_time_after_ms=42, server_time_ms=42)

    assert sample.skew_ms() == 0


def test_skew_reads_the_midpoint_of_the_bracket() -> None:
    """A slow round trip must not silently use only one end of the bracket."""
    sample = ClockSkewSample(
        local_time_before_ms=1_000, local_time_after_ms=2_000, server_time_ms=1_500
    )

    assert sample.skew_ms() == 0  # midpoint = 1500, server = 1500


def test_midpoint_floors_on_an_odd_bracket_sum() -> None:
    """Pin the rounding direction: an off-by-a-half must never round the OTHER way silently."""
    sample = ClockSkewSample(
        local_time_before_ms=1_000, local_time_after_ms=1_001, server_time_ms=0
    )

    # (1000 + 1001) // 2 == 1000, not 1000.5 rounded up to 1001.
    assert sample.skew_ms() == 1_000


def test_round_trip_ms_is_the_bracket_width() -> None:
    """`round_trip_ms` is the cost OF the request, independent of the skew it produced."""
    sample = ClockSkewSample(
        local_time_before_ms=1_000, local_time_after_ms=1_080, server_time_ms=1_000
    )

    assert sample.round_trip_ms == 80


def test_zero_width_bracket_is_allowed() -> None:
    """A round trip measured at `0 ms` (a clock with coarse resolution) is not an error."""
    sample = ClockSkewSample(
        local_time_before_ms=1_000, local_time_after_ms=1_000, server_time_ms=1_000
    )

    assert sample.round_trip_ms == 0


def test_a_bracket_running_backwards_is_refused() -> None:
    """The falsifier: a round trip that supposedly ended before it started must raise, not lie."""
    with pytest.raises(ValueError, match="cannot finish before it starts"):
        ClockSkewSample(local_time_before_ms=1_000, local_time_after_ms=999, server_time_ms=0)


def test_server_time_observation_is_a_plain_value() -> None:
    """The DTO the probe hands upward carries exactly what `D3.10`'s row needs, nothing derived."""
    observation = ServerTimeObservation(
        server_time_ms=1_788_303_016_165,
        http_status=200,
        weight_used=2,
        body_sha256="a" * 64,
    )

    assert observation.server_time_ms == 1_788_303_016_165
    assert observation.http_status == 200
    assert observation.weight_used == 2
    assert observation.body_sha256 == "a" * 64


def test_server_time_observation_allows_an_absent_weight() -> None:
    """`weight_used=None` is a legitimate value: `D3.12` proved a Binance family omits it."""
    observation = ServerTimeObservation(
        server_time_ms=1, http_status=200, weight_used=None, body_sha256="0" * 64
    )

    assert observation.weight_used is None
