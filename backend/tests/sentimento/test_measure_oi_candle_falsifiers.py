"""`measure_oi_candle_falsifiers` runs `ADR-045`'s falsifiers on what the route serves — `T-03.10`.

The market is synthetic but the path is the production one: `build_series_history_report`
(the route's use case), the real pilot catalog, and the CSV reader the bench uses on real rows.
Each falsifier is shown to hold on a consistent market AND to fail on the one market it exists
to catch, with the others still holding — so a verdict cannot be green for the wrong reason.
"""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.oi_candle import OiCandleSource
from src.modules.sentimento.domain.oi_candle_falsifiers import (
    POWER_MIN_BUCKETS,
    PROPERTY_MIN_BUCKETS,
    SPREAD_MIN_INSTANTS,
    FalsifierOutcome,
)
from src.modules.sentimento.domain.oi_candle_regimes import OiCandleReport
from src.modules.sentimento.infra.csv_series_window_reader import CsvSeriesWindowReader
from src.modules.sentimento.use_cases.measure_oi_candle_falsifiers import (
    MissingOiRegimeError,
    OiCandleRequestsDisagreeError,
    OiFalsifierMeasurement,
    _one_candle_report,
    measure_oi_candle_falsifiers,
)
from src.modules.sentimento.use_cases.series_catalog import list_pilot_series_catalog
from tests.helpers.oi_market_export import at, moving_market, two_regime_records

POLL = OiCandleSource.BINANCE_POLL_1M
HIST = OiCandleSource.BINANCE_POINT_5M
# 289 history buckets of 5 min before capture, 289 polled buckets of 5 min after it.
CAPTURE_MINUTE = 1445
LAST_MINUTE = 2890


def _measure(records: list[dict[str, str]], *, symbol: str = "BTCUSDT") -> OiFalsifierMeasurement:
    reader = CsvSeriesWindowReader(records)
    return measure_oi_candle_falsifiers(
        list_pilot_series_catalog(),
        reader,
        reader,
        symbol=symbol,
        window_start_ms=at(0),
        window_end_ms=at(LAST_MINUTE),
        knowledge_time_ms=at(LAST_MINUTE + 10),
    )


def _market(**overrides: object) -> list[dict[str, str]]:
    return two_regime_records(
        last_minute=LAST_MINUTE,
        capture_minute=CAPTURE_MINUTE,
        **overrides,  # type: ignore[arg-type]
    )


def test_every_falsifier_holds_on_a_consistent_market_with_every_floor_reached() -> None:
    """Four regime x TF measurements, every verdict held, every universe at its floor."""
    measurement = _measure(_market())

    assert {(r.interval, r.derived_from) for r in measurement.regimes} == {
        ("1m", POLL),
        ("1m", HIST),
        ("5m", POLL),
        ("5m", HIST),
    }
    for regime in measurement.regimes:
        assert regime.close.outcome is FalsifierOutcome.HELD, regime
        assert regime.anchor.outcome is FalsifierOutcome.HELD, regime
        assert regime.power.outcome is FalsifierOutcome.HELD, regime
        assert regime.close.n >= PROPERTY_MIN_BUCKETS
        assert regime.power.n >= POWER_MIN_BUCKETS
    assert measurement.spread.outcome is FalsifierOutcome.HELD
    assert measurement.spread.n >= SPREAD_MIN_INSTANTS
    assert measurement.spread.median_bp == 0.0


def test_the_regimes_are_measured_at_their_effective_bucket_widths() -> None:
    """The history stays on 5 min even in TF `1m`; the polling follows the TF."""
    widths = {(r.interval, r.derived_from): r.bucket_ms for r in _measure(_market()).regimes}

    assert widths == {
        ("1m", POLL): 60_000,
        ("1m", HIST): 300_000,
        ("5m", POLL): 300_000,
        ("5m", HIST): 300_000,
    }


def test_a_polled_level_20_bp_above_the_history_fails_falsifier_4_only() -> None:
    """A level shift between the two series is falsifier 4's, and the properties still hold."""
    measurement = _measure(_market(poll_value=lambda minute: moving_market(minute) * 1.002))

    assert measurement.spread.outcome is FalsifierOutcome.FAILED
    assert measurement.spread.median_bp == pytest.approx(20.0, abs=0.01)
    for regime in measurement.regimes:
        assert regime.close.outcome is FalsifierOutcome.HELD
        assert regime.anchor.outcome is FalsifierOutcome.HELD


def test_a_market_that_never_moves_fails_falsifier_3_in_every_regime() -> None:
    """Constant OI makes every body flat: the candle cannot say contracts came in."""
    measurement = _measure(_market(hist_value=lambda _: 80_000.0, poll_value=lambda _: 80_000.0))

    assert {r.power.outcome for r in measurement.regimes} == {FalsifierOutcome.FAILED}
    assert {r.power.flat_share for r in measurement.regimes} == {1.0}
    assert measurement.spread.outcome is FalsifierOutcome.HELD


def test_a_symbol_without_both_regimes_in_the_catalog_is_refused() -> None:
    """Without both series there is nothing to compare, and the bench says so by name."""
    with pytest.raises(MissingOiRegimeError, match="DOGEUSDT"):
        _measure(_market(), symbol="DOGEUSDT")


def test_two_requests_serving_different_candles_are_refused() -> None:
    """`D2-bis`: either id serves the same candles; a disagreement is refused, never averaged."""
    empty = OiCandleReport(timeframe_ms=60_000, sources=(), candles=())
    other = OiCandleReport(timeframe_ms=300_000, sources=(), candles=())

    assert _one_candle_report(empty, empty, interval="1m") is empty
    with pytest.raises(OiCandleRequestsDisagreeError, match="D2-bis"):
        _one_candle_report(empty, other, interval="1m")
    with pytest.raises(OiCandleRequestsDisagreeError):
        _one_candle_report(None, empty, interval="1m")
