"""`D3.3`: `5 x S x (60/periodo) <= 200`, and `periodo >= 60s` REPROVA on its own."""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.availability_probe_set import (
    AVAILABILITY_PROBE_SET,
    AVAILABILITY_PROBE_SYMBOLS,
    BINANCE_ENDPOINTS,
    COINALYZE_ENDPOINTS,
    AvailabilityProbeSet,
    BinanceFuturesDataEndpoint,
    InvalidProbeSetError,
)
from src.modules.sentimento.domain.coinalyze_daily_series import SeriesKind


def test_the_declared_set_matches_q19_exactly() -> None:
    """`docs/decisoes-do-owner.md` §Q19, literal: 4 symbols, 5 Binance endpoints at 10 s."""
    assert AVAILABILITY_PROBE_SYMBOLS == ("BTCUSDT", "ETHUSDT", "LINKUSDT", "SOLUSDT")
    assert len(BINANCE_ENDPOINTS) == 5
    assert AVAILABILITY_PROBE_SET.binance_period_seconds == 10.0


def test_the_declared_set_costs_exactly_120_binance_calls_per_minute() -> None:
    """`5 x 4 x (60/10) = 120` — 60% of the 200/min bucket, the owner's own arithmetic."""
    assert AVAILABILITY_PROBE_SET.binance_calls_per_sweep == 20
    assert AVAILABILITY_PROBE_SET.binance_requests_per_minute == pytest.approx(120.0)


def test_the_declared_set_costs_16_coinalyze_calls_per_minute_well_under_the_blind_budget() -> None:
    """`2 x 4 x (60/30) = 16` of 40/min — conservative, not copied from the Binance number."""
    assert AVAILABILITY_PROBE_SET.coinalyze_calls_per_sweep == 8
    assert AVAILABILITY_PROBE_SET.coinalyze_requests_per_minute == pytest.approx(16.0)


def test_total_endpoint_count_is_at_least_five() -> None:
    """`D3.2` needs `>= 5 endpoints`; Binance alone already provides them, Coinalyze adds two."""
    assert AVAILABILITY_PROBE_SET.total_endpoint_count == 7
    assert len(COINALYZE_ENDPOINTS) == 2


def test_the_binance_broker_paces_one_sweep_across_the_whole_period() -> None:
    """One call every `period/calls_per_sweep` seconds — never a burst (`T-02.2`'s pattern)."""
    broker = AVAILABILITY_PROBE_SET.binance_broker
    assert broker.interval_seconds == pytest.approx(0.5)


def test_the_coinalyze_broker_paces_one_sweep_across_its_own_period() -> None:
    """The Coinalyze broker paces one sweep across its own period."""
    broker = AVAILABILITY_PROBE_SET.coinalyze_broker
    assert broker.interval_seconds == pytest.approx(3.75)


def test_a_period_of_sixty_seconds_is_refused_regardless_of_budget() -> None:
    """`D3.3`: `periodo >= 60s` reprova on its own — coarser than the measured dispersion."""
    with pytest.raises(InvalidProbeSetError, match="reprova"):
        AvailabilityProbeSet(
            symbols=("BTCUSDT",), binance_period_seconds=60.0, coinalyze_period_seconds=30.0
        )


def test_a_period_that_blows_the_binance_budget_is_refused() -> None:
    """20 symbols x 5 endpoints at 10 s would be 600/min — over the 200/min bucket."""
    with pytest.raises(InvalidProbeSetError, match="futures/data"):
        AvailabilityProbeSet(
            symbols=tuple(f"SYM{i}USDT" for i in range(20)),
            binance_period_seconds=10.0,
            coinalyze_period_seconds=30.0,
        )


def test_a_period_that_blows_the_coinalyze_blind_budget_is_refused() -> None:
    """8 calls/sweep at 5 s = 96/min, over the blind bucket's 40/min."""
    with pytest.raises(InvalidProbeSetError, match="cego"):
        AvailabilityProbeSet(
            symbols=AVAILABILITY_PROBE_SYMBOLS,
            binance_period_seconds=10.0,
            coinalyze_period_seconds=5.0,
        )


@pytest.mark.parametrize(
    ("symbols", "binance_period", "coinalyze_period"),
    [
        ((), 10.0, 30.0),
        (("BTCUSDT",), 0.0, 30.0),
        (("BTCUSDT",), 10.0, 0.0),
        (("BTCUSDT",), -1.0, 30.0),
    ],
)
def test_a_degenerate_set_is_refused(
    symbols: tuple[str, ...], binance_period: float, coinalyze_period: float
) -> None:
    """A degenerate symbol or period is refused, in every parametrized shape."""
    with pytest.raises(InvalidProbeSetError):
        AvailabilityProbeSet(
            symbols=symbols,
            binance_period_seconds=binance_period,
            coinalyze_period_seconds=coinalyze_period,
        )


def test_duplicate_symbols_are_refused() -> None:
    """Duplicate symbols are refused."""
    with pytest.raises(InvalidProbeSetError, match="repetidos"):
        AvailabilityProbeSet(
            symbols=("BTCUSDT", "BTCUSDT"),
            binance_period_seconds=10.0,
            coinalyze_period_seconds=30.0,
        )


def test_duplicate_binance_endpoints_are_refused() -> None:
    """Duplicate Binance endpoints are refused."""
    with pytest.raises(InvalidProbeSetError, match="Binance repetidos"):
        AvailabilityProbeSet(
            symbols=("BTCUSDT",),
            binance_period_seconds=10.0,
            coinalyze_period_seconds=30.0,
            binance_endpoints=(
                BinanceFuturesDataEndpoint.OPEN_INTEREST_HIST,
                BinanceFuturesDataEndpoint.OPEN_INTEREST_HIST,
            ),
        )


def test_duplicate_coinalyze_endpoints_are_refused() -> None:
    """Duplicate Coinalyze endpoints are refused."""
    with pytest.raises(InvalidProbeSetError, match="Coinalyze repetidos"):
        AvailabilityProbeSet(
            symbols=("BTCUSDT",),
            binance_period_seconds=10.0,
            coinalyze_period_seconds=30.0,
            coinalyze_endpoints=(SeriesKind.OPEN_INTEREST, SeriesKind.OPEN_INTEREST),
        )


def test_an_empty_endpoint_tuple_is_refused_for_each_source() -> None:
    """An empty endpoint tuple is refused for each source, independently."""
    with pytest.raises(InvalidProbeSetError, match="Binance"):
        AvailabilityProbeSet(
            symbols=("BTCUSDT",),
            binance_period_seconds=10.0,
            coinalyze_period_seconds=30.0,
            binance_endpoints=(),
        )
    with pytest.raises(InvalidProbeSetError, match="Coinalyze"):
        AvailabilityProbeSet(
            symbols=("BTCUSDT",),
            binance_period_seconds=10.0,
            coinalyze_period_seconds=30.0,
            coinalyze_endpoints=(),
        )
