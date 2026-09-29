"""Measure `ADR-045`'s four falsifiers on what `GET /series-history` would serve — `T-03.10`."""

# `plano 03` item 3b.3 + `DoD-03b` 1-2. The falsifiers compare the candle with what the route
# ALREADY serves (`close == last`), so this module does not re-derive either side: it calls
# `build_series_history_report` — the exact function behind the route — once per series and per
# TF, and hands the served `rows` and `oi_candles` to the pure verdicts of
# `domain/oi_candle_falsifiers.py`. Falsifier 4 reads the two regimes' points through
# `series_history.oi_point_readings`, the same extraction the candles are built from.
#
# ── WHY BOTH SERIES ARE REQUESTED ───────────────────────────────────────────────────────────────
#
# `rows` is served for the REQUESTED series only, while `oi_candles` carries both regimes
# (`ADR-045/D2-bis`). Falsifier 1 compares each candle with the `last` of ITS OWN series, so each
# series is requested once. The two requests must serve the same candles (`T-03.9` tests that on
# synthetic data); on real data a disagreement is refused by name here, never averaged over.
#
# ── THE GRID VERDICT IS NOT PART OF THIS MEASUREMENT ────────────────────────────────────────────
#
# `build_series_history_report` requires a `GridMultipleClassifier`, whose only real
# implementation lives in `charts` and reaches `sentimento` through the composition root
# (`src.main._classify_panel_grid`). The `backend/pyproject.toml` "Fronteira de contexto"
# contract forbids this module from importing `charts`, and importing `src.main` builds the whole
# app, so `_GRID_VERDICT_NOT_MEASURED` below stands in. It is not a default of the served use
# case: the report it lands in is discarded, and no falsifier reads `panel_grid`.

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from src.modules.sentimento.domain.as_of_accessor import BarPolicy
from src.modules.sentimento.domain.oi_candle import OiCandleSource, OiReading
from src.modules.sentimento.domain.oi_candle_falsifiers import (
    SPREAD_GRID_MS,
    PowerVerdict,
    PropertyVerdict,
    SpreadVerdict,
    anchor_property,
    close_property,
    power_property,
    spread_property,
)
from src.modules.sentimento.domain.oi_candle_regimes import OiCandleReport
from src.modules.sentimento.domain.open_interest_catalog import (
    binance_open_interest_key,
    binance_open_interest_poll_key,
)
from src.modules.sentimento.domain.series_catalog import SeriesCatalog, SeriesCatalogEntry
from src.modules.sentimento.domain.series_history_report import PanelGridVerdict
from src.modules.sentimento.use_cases.series_history import (
    SeriesStoreBoundsReader,
    SeriesWindowReader,
    build_series_history_report,
    oi_point_readings,
)

# The TFs measured: the polled series' native grid (`1m`, where `ADR-045` §Falsificador 3 says
# the power test runs for the polling regime) and the history's native grid (`5m`, the universe
# `ADR-045` §Falsificador 1-2 names).
MEASURED_INTERVALS: Final[tuple[str, ...]] = ("1m", "5m")

_GRID_VERDICT_NOT_MEASURED: Final[str] = "not-measured-by-the-falsifier-bench"


class MissingOiRegimeError(Exception):
    """The catalog lacks one of the two OI series of the symbol: no falsifier can compare them."""


class OiCandleRequestsDisagreeError(Exception):
    """Requesting the two series' ids served different candles, which `D2-bis` forbids."""


@dataclass(frozen=True)
class RegimeMeasurement:
    """Falsifiers 1-3 for ONE regime at ONE requested TF."""

    interval: str
    derived_from: OiCandleSource
    bucket_ms: int
    close: PropertyVerdict
    anchor: PropertyVerdict
    power: PowerVerdict


@dataclass(frozen=True)
class OiFalsifierMeasurement:
    """Everything `T-03.10` reports for one symbol over one window."""

    symbol: str
    window_start_ms: int
    window_end_ms: int
    knowledge_time_ms: int
    regimes: tuple[RegimeMeasurement, ...]
    spread: SpreadVerdict


def _grid_not_measured(*, panel_grid_ms: int, native_grid_ms: int) -> PanelGridVerdict:
    """Stand in for the `charts` classifier; see the module note for why it is not called."""
    del panel_grid_ms
    return PanelGridVerdict(
        native_grid_ms=native_grid_ms,
        enabled=False,
        reason=_GRID_VERDICT_NOT_MEASURED,
        multiple=None,
    )


def _regime_entries(
    catalog: SeriesCatalog, symbol: str
) -> dict[OiCandleSource, SeriesCatalogEntry]:
    """Resolve the history and the polled series of `symbol` from the catalog, both or none."""
    hist = catalog.entry_for(binance_open_interest_key(instrument_id=symbol))
    poll = catalog.entry_for(binance_open_interest_poll_key(instrument_id=symbol))
    if hist is None or poll is None:
        raise MissingOiRegimeError(
            f"{symbol!r}: history cataloged={hist is not None}, polling cataloged="
            f"{poll is not None} — falsifiers 1-4 of ADR-045 need both regimes"
        )
    return {OiCandleSource.BINANCE_POINT_5M: hist, OiCandleSource.BINANCE_POLL_1M: poll}


def measure_oi_candle_falsifiers(
    catalog: SeriesCatalog,
    reader: SeriesWindowReader,
    bounds_reader: SeriesStoreBoundsReader,
    *,
    symbol: str,
    window_start_ms: int,
    window_end_ms: int,
    knowledge_time_ms: int,
) -> OiFalsifierMeasurement:
    """Measure falsifiers 1-4 of `ADR-045` for `symbol` over `[window_start_ms, window_end_ms]`.

    Raises:
        MissingOiRegimeError: the catalog lacks the history or the polled series of `symbol`.
        OiCandleRequestsDisagreeError: the two series' requests served different `oi_candles`.

    """
    entries = _regime_entries(catalog, symbol)
    regimes: list[RegimeMeasurement] = []
    for interval in MEASURED_INTERVALS:
        reports = {
            source: build_series_history_report(
                catalog,
                reader,
                _grid_not_measured,
                bounds_reader,
                series_key_id=entry.key.series_key_id(),
                symbol=symbol,
                interval=interval,
                window_start_ms=window_start_ms,
                window_end_ms=window_end_ms,
                knowledge_time_ms=knowledge_time_ms,
                bar_policy=BarPolicy.FINAL_ONLY,
            )
            for source, entry in entries.items()
        }
        served = _one_candle_report(
            reports[OiCandleSource.BINANCE_POINT_5M].oi_candles,
            reports[OiCandleSource.BINANCE_POLL_1M].oi_candles,
            interval=interval,
        )
        for declaration in served.sources:
            source = declaration.derived_from
            served_last = {row.event_time: row.value for row in reports[source].rows}
            regimes.append(
                RegimeMeasurement(
                    interval=interval,
                    derived_from=source,
                    bucket_ms=declaration.bucket_interval_ms,
                    close=close_property(
                        served.candles, served_last=served_last, derived_from=source
                    ),
                    anchor=anchor_property(
                        served.candles,
                        bucket_ms=declaration.bucket_interval_ms,
                        derived_from=source,
                    ),
                    power=power_property(
                        served.candles,
                        bucket_ms=declaration.bucket_interval_ms,
                        derived_from=source,
                    ),
                )
            )
    return OiFalsifierMeasurement(
        symbol=symbol,
        window_start_ms=window_start_ms,
        window_end_ms=window_end_ms,
        knowledge_time_ms=knowledge_time_ms,
        regimes=tuple(regimes),
        spread=spread_property(
            _grid_readings(
                reader,
                entries[OiCandleSource.BINANCE_POLL_1M],
                symbol=symbol,
                window_start_ms=window_start_ms,
                window_end_ms=window_end_ms,
                knowledge_time_ms=knowledge_time_ms,
            ),
            _grid_readings(
                reader,
                entries[OiCandleSource.BINANCE_POINT_5M],
                symbol=symbol,
                window_start_ms=window_start_ms,
                window_end_ms=window_end_ms,
                knowledge_time_ms=knowledge_time_ms,
            ),
        ),
    )


def _one_candle_report(
    from_hist: OiCandleReport | None, from_poll: OiCandleReport | None, *, interval: str
) -> OiCandleReport:
    """Return the one `oi_candles` block both requests served, refusing if they differ."""
    if from_hist is None or from_poll is None or from_hist != from_poll:
        raise OiCandleRequestsDisagreeError(
            f"interval {interval!r}: requesting the history id and the polled id served "
            f"different oi_candles (ADR-045/D2-bis: either id yields the same candles)"
        )
    return from_hist


def _grid_readings(
    reader: SeriesWindowReader,
    entry: SeriesCatalogEntry,
    *,
    symbol: str,
    window_start_ms: int,
    window_end_ms: int,
    knowledge_time_ms: int,
) -> tuple[OiReading, ...]:
    """Read one series' point facts over the window, through the route's own extraction."""
    observations = reader.read_window(
        series_key_id=entry.key.series_key_id(),
        symbol=symbol,
        window_start_ms=window_start_ms,
        window_end_ms=window_end_ms,
        lookback_ms=max(SPREAD_GRID_MS, entry.native_grid_ms, entry.max_staleness_ms),
    )
    return oi_point_readings(
        entry,
        observations,
        symbol=symbol,
        interval_ms=SPREAD_GRID_MS,
        window_start_ms=window_start_ms,
        window_end_ms=window_end_ms,
        knowledge_time_ms=knowledge_time_ms,
    )
