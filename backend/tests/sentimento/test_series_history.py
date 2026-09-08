"""`build_series_history_report` — `ADR-034/D9` item 2, `SPEC-006 §5.2` envelope, `CA-F1-2/3/5`."""

from __future__ import annotations

from decimal import Decimal

import pytest

from src.modules.sentimento.domain.as_of_accessor import BarPolicy, Observation
from src.modules.sentimento.domain.provenance import (
    UNKNOWN_OBSERVER_REGION,
    Absence,
    AvailabilitySource,
    Provenance,
    SeriesRow,
)
from src.modules.sentimento.domain.series_catalog import SeriesCatalog, SeriesCatalogEntry
from src.modules.sentimento.domain.series_key import (
    Nature,
    QuantityField,
    Reduction,
    SeriesKey,
    TsConvention,
)
from src.modules.sentimento.use_cases.series_history import (
    InvalidWindowError,
    UnknownSeriesKeyIdError,
    UnsupportedIntervalError,
    build_series_history_report,
)

GRID_MS = 60_000
"""1-minute native grid — `ADR-034/D6`, the only one F1 serves."""

SYMBOL = "BTCUSDT"

BUCKET_END = 1_620_000_000_000
"""A `bucket_end` ALIGNED to `GRID_MS` (`1_620_000_000_000 / 60_000 = 27_000_000`, exact) — real
`md.series` rows are always stamped this way (`transact_time // 60000`, `cvd.py`'s bucketing
rule), and the use case's grid stepping starts at `window_start_ms` verbatim, so a fixture on
an arbitrary, unaligned millisecond would test a request shape no real caller ever sends."""


def _oi_key(**overrides: object) -> SeriesKey:
    """Build a `STOCK` series (open interest) — carry-forward applies, the simplest case to grid."""
    terms: dict[str, object] = {
        "provider": "binance",
        "venue": "usdm_futures",
        "instrument_id": "BTCUSDT",
        "metric": "sum_open_interest",
        "cohort": "all",
        "interval": "5m",
        "unit": "BTC",
        "denom": "base",
        "nature": Nature.STOCK,
        "ts_convention": TsConvention.POINT_AT_BUCKET_END,
        "reduction": Reduction.POINT,
        "quantity_field": QuantityField.NA,
        "label_shift": 0,
        "aggregation_scope": "Symbol",
        "verified_by": "test_series_history.py",
    }
    terms.update(overrides)
    return SeriesKey(**terms)  # type: ignore[arg-type]


def _catalog_with_one_entry(*, max_staleness_ms: int = 120_000) -> SeriesCatalog:
    return SeriesCatalog(
        (SeriesCatalogEntry(key=_oi_key(), native_grid="1min", max_staleness_ms=max_staleness_ms),)
    )


def _row(
    *, bucket_end: int, available_at: int, observed_at: int, value_raw: str = "42"
) -> SeriesRow:
    return SeriesRow(
        series_key_id=_oi_key().series_key_id(),
        symbol=SYMBOL,
        source="binance",
        bucket_end=bucket_end,
        event_time=bucket_end,
        available_at=available_at,
        availability_source=AvailabilitySource.OBSERVED,
        ingested_at=available_at,
        observed_at=observed_at,
        provenance=Provenance.OBSERVED,
        src_label_raw="sumOpenInterest",
        observer_id="test",
        observer_region=UNKNOWN_OBSERVER_REGION,
        is_final=None,
        value_raw=value_raw,
    )


class _FakeReader:
    """A `SeriesWindowReader` fixture: returns exactly the `Observation`s it was built with."""

    def __init__(self, observations: tuple[Observation, ...]) -> None:
        self._observations = observations
        self.calls: list[dict[str, object]] = []

    def read_window(
        self,
        *,
        series_key_id: str,
        symbol: str,
        window_start_ms: int,
        window_end_ms: int,
        lookback_ms: int,
    ) -> tuple[Observation, ...]:
        self.calls.append(
            {
                "series_key_id": series_key_id,
                "symbol": symbol,
                "window_start_ms": window_start_ms,
                "window_end_ms": window_end_ms,
                "lookback_ms": lookback_ms,
            }
        )
        return self._observations


def test_reports_one_row_per_grid_instant_with_a_value_present() -> None:
    """A window covering one bucket returns exactly one row, value decoded from `value_raw`."""
    catalog = _catalog_with_one_entry()
    bucket_end = BUCKET_END
    row = _row(bucket_end=bucket_end, available_at=bucket_end, observed_at=bucket_end)
    reader = _FakeReader((Observation(row=row, value=Decimal(row.value_raw)),))

    report = build_series_history_report(
        catalog,
        reader,
        series_key_id=_oi_key().series_key_id(),
        symbol=SYMBOL,
        interval="1m",
        window_start_ms=bucket_end,
        window_end_ms=bucket_end,
        knowledge_time_ms=bucket_end + 10_000,
        bar_policy=BarPolicy.FINAL_ONLY,
    )

    assert len(report.rows) == 1
    only_row = report.rows[0]
    assert only_row.event_time == bucket_end
    assert only_row.value == "42"
    assert only_row.absence is None
    assert only_row.available_at == bucket_end


def test_reports_absence_for_a_grid_instant_with_no_admitted_observation() -> None:
    """No observation at all in range -> `SEM_PONTO`, never a fabricated value."""
    catalog = _catalog_with_one_entry()
    reader = _FakeReader(())

    report = build_series_history_report(
        catalog,
        reader,
        series_key_id=_oi_key().series_key_id(),
        symbol=SYMBOL,
        interval="1m",
        window_start_ms=BUCKET_END,
        window_end_ms=BUCKET_END,
        knowledge_time_ms=BUCKET_END + 100_000,
        bar_policy=BarPolicy.FINAL_ONLY,
    )

    only_row = report.rows[0]
    assert only_row.value is None
    assert only_row.absence == Absence.NO_POINT.value


def test_panel_fields_come_from_the_catalog_entry() -> None:
    """`panel.source`/`nature`/`unit` are the catalog's own terms, not a literal."""
    catalog = _catalog_with_one_entry()
    reader = _FakeReader(())
    key_id = _oi_key().series_key_id()

    report = build_series_history_report(
        catalog,
        reader,
        series_key_id=key_id,
        symbol=SYMBOL,
        interval="1m",
        window_start_ms=BUCKET_END,
        window_end_ms=BUCKET_END,
        knowledge_time_ms=BUCKET_END + 100_000,
        bar_policy=BarPolicy.FINAL_ONLY,
    )

    assert report.panel_series_key_id == key_id
    assert report.panel_source == "binance"
    assert report.panel_nature == "STOCK"
    assert report.panel_unit == "BTC"


def test_calling_twice_with_the_same_key_produces_byte_identical_envelopes() -> None:
    """`CA-F1-2`: the report is a pure function of its inputs — content-addressable."""
    catalog = _catalog_with_one_entry()
    bucket_end = BUCKET_END
    row = _row(bucket_end=bucket_end, available_at=bucket_end, observed_at=bucket_end)
    reader = _FakeReader((Observation(row=row, value=Decimal(row.value_raw)),))
    kwargs: dict[str, object] = {
        "series_key_id": _oi_key().series_key_id(),
        "symbol": SYMBOL,
        "interval": "1m",
        "window_start_ms": bucket_end,
        "window_end_ms": bucket_end,
        "knowledge_time_ms": bucket_end + 10_000,
        "bar_policy": BarPolicy.FINAL_ONLY,
    }

    first = build_series_history_report(catalog, reader, **kwargs)  # type: ignore[arg-type]
    second = build_series_history_report(catalog, reader, **kwargs)  # type: ignore[arg-type]

    assert first.to_envelope(principal_id=None, server_now_ms=0) == second.to_envelope(
        principal_id=None, server_now_ms=0
    )


def test_lookback_ms_passed_to_the_reader_is_at_least_the_grid_and_the_staleness() -> None:
    """`ADR-034/D9`: `lookback_ms >= max(bucket_interval_ms, asof_max_staleness_ms)`."""
    catalog = _catalog_with_one_entry(max_staleness_ms=999_999)
    reader = _FakeReader(())

    build_series_history_report(
        catalog,
        reader,
        series_key_id=_oi_key().series_key_id(),
        symbol=SYMBOL,
        interval="1m",
        window_start_ms=BUCKET_END,
        window_end_ms=BUCKET_END,
        knowledge_time_ms=BUCKET_END + 100_000,
        bar_policy=BarPolicy.FINAL_ONLY,
    )

    assert reader.calls[0]["lookback_ms"] == max(GRID_MS, 999_999)


def test_refuses_an_interval_other_than_1m() -> None:
    """`ADR-034/D6`: never subestimate — refuse instead of aggregating a coarser interval."""
    catalog = _catalog_with_one_entry()
    reader = _FakeReader(())

    with pytest.raises(UnsupportedIntervalError, match="1m"):
        build_series_history_report(
            catalog,
            reader,
            series_key_id=_oi_key().series_key_id(),
            symbol=SYMBOL,
            interval="5m",
            window_start_ms=BUCKET_END,
            window_end_ms=BUCKET_END + GRID_MS,
            knowledge_time_ms=BUCKET_END + 100_000,
            bar_policy=BarPolicy.FINAL_ONLY,
        )


def test_refuses_an_unknown_series_key_id() -> None:
    """A `series_key_id` with no catalog row is a client error, named, never a `KeyError`."""
    catalog = _catalog_with_one_entry()
    reader = _FakeReader(())

    with pytest.raises(UnknownSeriesKeyIdError, match="does-not-exist"):
        build_series_history_report(
            catalog,
            reader,
            series_key_id="does-not-exist",
            symbol=SYMBOL,
            interval="1m",
            window_start_ms=BUCKET_END,
            window_end_ms=BUCKET_END + GRID_MS,
            knowledge_time_ms=BUCKET_END + 100_000,
            bar_policy=BarPolicy.FINAL_ONLY,
        )


def test_refuses_a_window_that_is_not_strictly_increasing() -> None:
    """`window_start_ms >= window_end_ms` has no grid to read — refused, not an empty report."""
    catalog = _catalog_with_one_entry()
    reader = _FakeReader(())

    with pytest.raises(InvalidWindowError):
        build_series_history_report(
            catalog,
            reader,
            series_key_id=_oi_key().series_key_id(),
            symbol=SYMBOL,
            interval="1m",
            window_start_ms=BUCKET_END + GRID_MS,
            window_end_ms=BUCKET_END,
            knowledge_time_ms=BUCKET_END + 100_000,
            bar_policy=BarPolicy.FINAL_ONLY,
        )
