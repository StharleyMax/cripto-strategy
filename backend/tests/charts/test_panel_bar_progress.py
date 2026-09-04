"""`Bar` — `ADR-026/D3`: a bucket in formation has NO `high`/`low`/`close` field to misread."""

from __future__ import annotations

import dataclasses

import pytest

from src.modules.charts.domain.panel_bar_progress import FinalBar, InProgressBar, is_final


def test_final_bar_carries_high_low_close() -> None:
    """A closed bucket has definitive `high`/`low`/`close` fields."""
    candle = FinalBar(open=100.0, high=105.0, low=99.0, close=103.0)
    assert candle.high == 105.0
    assert candle.low == 99.0
    assert candle.close == 103.0


def test_falsifier_in_progress_bar_has_no_high_low_close_attribute() -> None:
    """`ADR-026` falsifier: the in-progress state structurally lacks `high`/`low`/`close`.

    This is the proof that `D3` holds by TYPE, not by a convention someone could forget:
    reading `.high` off an `InProgressBar` fails at attribute-access time.
    """
    forming = InProgressBar(open=100.0, high_so_far=104.0, low_so_far=99.5, last=102.0)
    assert not hasattr(forming, "high")
    assert not hasattr(forming, "low")
    assert not hasattr(forming, "close")
    assert forming.high_so_far == 104.0
    assert forming.low_so_far == 99.5
    assert forming.last == 102.0


def test_is_final_distinguishes_the_two_variants() -> None:
    """`is_final` is the one boolean question this module exposes, and only that one."""
    final = FinalBar(open=100.0, high=105.0, low=99.0, close=103.0)
    in_progress = InProgressBar(open=100.0, high_so_far=104.0, low_so_far=99.5, last=102.0)
    assert is_final(final) is True
    assert is_final(in_progress) is False


def test_final_bar_and_in_progress_bar_are_distinct_types() -> None:
    """The union has exactly two variants, and a value of one is never an instance of the other."""
    final = FinalBar(open=100.0, high=105.0, low=99.0, close=103.0)
    in_progress = InProgressBar(open=100.0, high_so_far=105.0, low_so_far=99.0, last=103.0)
    assert isinstance(final, FinalBar)
    assert not isinstance(final, InProgressBar)
    assert isinstance(in_progress, InProgressBar)
    assert not isinstance(in_progress, FinalBar)


def test_bars_are_frozen() -> None:
    """Both variants are immutable value types, same posture as the rest of `charts/domain`."""
    final = FinalBar(open=100.0, high=105.0, low=99.0, close=103.0)
    with pytest.raises(dataclasses.FrozenInstanceError):
        final.high = 999.0  # type: ignore[misc]
