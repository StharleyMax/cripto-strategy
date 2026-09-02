"""Jitter arithmetic — pure at the edges, and genuinely non-deterministic at the one real draw."""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.jitter import (
    InvalidJitterPolicyError,
    JitterPolicy,
    sample_uniform,
)


def test_a_sample_of_one_half_returns_the_base_interval_unjittered() -> None:
    """The midpoint of the jitter band is the base interval itself, whatever the spread."""
    policy = JitterPolicy(spread=0.2)

    assert policy.apply(base_seconds=10.0, sample=0.5) == pytest.approx(10.0)


def test_a_sample_of_zero_returns_the_low_edge() -> None:
    """`sample=0.0` is the low edge, `(1 - spread) * base`."""
    policy = JitterPolicy(spread=0.2)

    assert policy.apply(base_seconds=10.0, sample=0.0) == pytest.approx(8.0)


def test_a_sample_of_one_returns_the_high_edge() -> None:
    """`sample=1.0` is the high edge, `(1 + spread) * base`.

    Checked even though the contract documents the draw as `[0.0, 1.0)`, because the function
    itself does not refuse the closed edge and a caller must be able to see where it lands.
    """
    policy = JitterPolicy(spread=0.2)

    assert policy.apply(base_seconds=10.0, sample=1.0) == pytest.approx(12.0)


def test_zero_spread_never_jitters_regardless_of_sample() -> None:
    """A policy with `spread=0.0` is a deliberate no-op — every sample returns the base."""
    policy = JitterPolicy(spread=0.0)

    for sample in (0.0, 0.25, 0.5, 0.75, 1.0):
        assert policy.apply(base_seconds=7.0, sample=sample) == pytest.approx(7.0)


def test_full_spread_never_goes_negative_at_the_low_edge() -> None:
    """`spread=1.0` is the maximum allowed precisely because it still floors at zero, not below."""
    policy = JitterPolicy(spread=1.0)

    assert policy.apply(base_seconds=5.0, sample=0.0) == pytest.approx(0.0)
    assert policy.apply(base_seconds=5.0, sample=1.0) == pytest.approx(10.0)


@pytest.mark.parametrize("spread", [-0.01, 1.01])
def test_a_spread_outside_the_unit_interval_is_refused(spread: float) -> None:
    """A spread beyond `[0.0, 1.0]` could make the jittered pause negative — refused up front."""
    with pytest.raises(InvalidJitterPolicyError, match="spread"):
        JitterPolicy(spread=spread)


def test_a_negative_base_interval_is_refused() -> None:
    """A negative interval to jitter does not exist."""
    policy = JitterPolicy(spread=0.2)

    with pytest.raises(InvalidJitterPolicyError, match="base_seconds"):
        policy.apply(base_seconds=-1.0, sample=0.5)


@pytest.mark.parametrize("sample", [-0.01, 1.01])
def test_a_sample_outside_the_unit_interval_is_refused(sample: float) -> None:
    """A draw claimed uniform over `[0.0, 1.0]` that is not is a caller bug, not ours to hide."""
    policy = JitterPolicy(spread=0.2)

    with pytest.raises(InvalidJitterPolicyError, match="sample"):
        policy.apply(base_seconds=10.0, sample=sample)


# ── THE HANDOFF'S OWN REQUIREMENT: JITTER MUST REALLY VARY, NOT BE A HARDCODED CONSTANT ────


def test_the_real_random_source_is_not_hardcoded_to_the_same_value() -> None:
    """`sample_uniform()` draws real entropy: 50 draws landing on one value is not credible.

    This is the test the handoff asks for explicitly: "Teste que o jitter realmente varia
    entre chamadas (nao e hardcoded/mockado para sempre o mesmo valor)". A fixed/mocked
    source would fail this by construction; `random.random()` passes it with the same
    certainty an honest coin flip passes "not always heads" over 50 tosses.
    """
    draws = {sample_uniform() for _ in range(50)}

    assert len(draws) > 1


def test_the_real_random_source_stays_within_the_declared_bounds() -> None:
    """Every draw is a legal input to `JitterPolicy.apply` — `[0.0, 1.0)`, never outside it."""
    for _ in range(200):
        draw = sample_uniform()
        assert 0.0 <= draw < 1.0


def test_the_real_random_source_feeds_a_broker_pause_that_also_varies() -> None:
    """End to end: jittering a fixed base with real draws produces genuinely different pauses."""
    policy = JitterPolicy(spread=0.3)

    pauses = {policy.apply(base_seconds=1.5, sample=sample_uniform()) for _ in range(50)}

    assert len(pauses) > 1
    assert all(1.5 * 0.7 <= pause <= 1.5 * 1.3 for pause in pauses)
