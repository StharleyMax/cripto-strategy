"""`resolve_knowledge_time` — the two `ADR-021`/D4 capture modes, and their refusals."""

from __future__ import annotations

import pytest

from src.modules.backtest.domain.knowledge_time import (
    KnowledgeTimeExceededError,
    KnowledgeTimeMode,
    MissingObservationsError,
    MissingPinnedKnowledgeTimeError,
    resolve_knowledge_time,
)


def test_live_mode_returns_the_maximum_observed_at() -> None:
    """`LIVE` never asks a clock — it is `max(observed_at)` over what was actually read."""
    result = resolve_knowledge_time(
        mode=KnowledgeTimeMode.LIVE,
        observed_at_values=[1_000, 3_000, 2_000],
        pinned_knowledge_time=None,
    )
    assert result == 3_000


def test_live_mode_refuses_an_empty_read() -> None:
    """A run that read zero observations has no achieved bound to record."""
    with pytest.raises(MissingObservationsError):
        resolve_knowledge_time(
            mode=KnowledgeTimeMode.LIVE, observed_at_values=[], pinned_knowledge_time=None
        )


def test_pinned_mode_returns_the_pinned_value_when_the_read_stays_inside_it() -> None:
    """`PINNED` records the requested horizon, not what happened to be read."""
    result = resolve_knowledge_time(
        mode=KnowledgeTimeMode.PINNED,
        observed_at_values=[1_000, 2_000],
        pinned_knowledge_time=5_000,
    )
    assert result == 5_000


def test_pinned_mode_accepts_an_empty_read() -> None:
    """A `PINNED` reproduction that reads nothing new still has a valid horizon to record."""
    result = resolve_knowledge_time(
        mode=KnowledgeTimeMode.PINNED, observed_at_values=[], pinned_knowledge_time=5_000
    )
    assert result == 5_000


def test_pinned_mode_without_a_pinned_value_refuses() -> None:
    """`PINNED` with no `pinned_knowledge_time` is a caller bug, not a valid call."""
    with pytest.raises(MissingPinnedKnowledgeTimeError):
        resolve_knowledge_time(
            mode=KnowledgeTimeMode.PINNED, observed_at_values=[1_000], pinned_knowledge_time=None
        )


def test_pinned_mode_refuses_a_read_that_exceeded_the_pin() -> None:
    """The `ADR-021`/D4 invariant, mechanically: `achieved <= pinned`, or refuse (`as_of` bug)."""
    with pytest.raises(KnowledgeTimeExceededError):
        resolve_knowledge_time(
            mode=KnowledgeTimeMode.PINNED,
            observed_at_values=[1_000, 9_000],
            pinned_knowledge_time=5_000,
        )
