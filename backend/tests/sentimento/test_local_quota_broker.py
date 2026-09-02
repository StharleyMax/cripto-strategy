"""The blind broker's pacing arithmetic — pure, and matching the declared cost of the sweep."""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.local_quota_broker import (
    InvalidQuotaBrokerError,
    LocalQuotaBroker,
)


def test_the_declared_broker_paces_at_exactly_forty_per_minute() -> None:
    """`docs/medicao-coinalyze.md` §3.1: 40 calls/min per key — the interval is `60 / 40`."""
    broker = LocalQuotaBroker(calls_per_window=40, window_seconds=60.0)

    assert broker.interval_seconds == 1.5


def test_the_declared_broker_reproduces_the_published_cost_of_the_one_shot() -> None:
    """`docs/decisoes-do-owner.md`: "1.140 chamadas ~ 28,5 min" (`~`, not exact).

    The published napkin math is `1.140 x 1,5 s = 1.710 s` — `n x interval`, not `(n - 1) x
    interval`. This module counts PAUSES, not calls (`n` calls take `n - 1` pauses, same
    asymmetry `test_quota_ramp_bench_offline.py` names for the ramp's own load loop: a pause
    after the last call would delay a call that never comes). The one-interval difference
    (1.708,5 s against 1.710 s, 0,09%) is exactly that `~`, not a bug in either number.
    """
    broker = LocalQuotaBroker(calls_per_window=40, window_seconds=60.0)

    total_seconds = broker.total_seconds_for(1140)

    assert total_seconds == pytest.approx(1710.0, abs=broker.interval_seconds)
    assert total_seconds / 60.0 == pytest.approx(28.5, abs=0.03)


def test_total_seconds_for_pauses_n_minus_one_times_never_n() -> None:
    """A pause after the LAST call would delay nothing real — `n` calls take `n - 1` pauses."""
    broker = LocalQuotaBroker(calls_per_window=40, window_seconds=60.0)

    assert broker.total_seconds_for(1) == 0.0
    assert broker.total_seconds_for(0) == 0.0
    assert broker.total_seconds_for(2) == pytest.approx(1.5)


def test_total_seconds_for_refuses_a_negative_call_count() -> None:
    """A negative count of calls does not exist and must not silently become zero pauses."""
    broker = LocalQuotaBroker(calls_per_window=40, window_seconds=60.0)

    with pytest.raises(InvalidQuotaBrokerError, match="negative"):
        broker.total_seconds_for(-1)


@pytest.mark.parametrize("calls_per_window", [0, -1])
def test_a_broker_with_no_calls_per_window_is_refused(calls_per_window: int) -> None:
    """A window that paces zero (or negative) calls could not compute an interval."""
    with pytest.raises(InvalidQuotaBrokerError, match="calls_per_window"):
        LocalQuotaBroker(calls_per_window=calls_per_window, window_seconds=60.0)


@pytest.mark.parametrize("window_seconds", [0.0, -1.0])
def test_a_broker_with_a_non_positive_window_is_refused(window_seconds: float) -> None:
    """A non-positive window is not a window."""
    with pytest.raises(InvalidQuotaBrokerError, match="window_seconds"):
        LocalQuotaBroker(calls_per_window=40, window_seconds=window_seconds)


def test_a_more_conservative_broker_paces_slower_with_no_hidden_margin() -> None:
    """A caller wanting margin lowers `calls_per_window` — the module adds no hidden buffer."""
    conservative = LocalQuotaBroker(calls_per_window=30, window_seconds=60.0)

    assert conservative.interval_seconds == pytest.approx(2.0)
