"""QA (fase 03) — the wire path bypasses the `(RATIO, POINT)` allowlist gate `T-03.5` built.

`ADR-040/D4`, `series_reduction_gate.py`'s own docstring: *"`reduce_bucket_for_series(key,
values)` — the ONE call site allowed to ask for `(RATIO, POINT)`"* and the allowlist exists
BECAUSE `SeriesKey` has one `RATIO` member standing in for two behaviours — summing/serving a
FLOW-shaped ratio (e.g. `sum_taker_long_short_vol_ratio`) as `last()` inflates the read `3,3x`
(p50 `3,1809` vs `0,9707`, `[MEDIDO 2026-09-19]`).

`use_cases/series_history.py::_reaggregated_row` — the ONLY call site that reaches
`reduce_bucket` for a reaggregating request (`interval != "1m"`, `group_size > 1`) — imports
and calls `domain.series_reduction.reduce_bucket` directly
(`series_history.py:67,504`), NEVER `domain.series_reduction_gate.reduce_bucket_for_series`.
`reduce_bucket_for_series` and its `RATIO_POINT_METRIC_ALLOWLIST` are exercised ONLY by
`test_series_reduction_gate.py`, in isolation — `grep -rn
'reduce_bucket_for_series' backend/src backend/tests` has exactly one production caller-shaped
line (the gate module's own `def`) and one test file; `series_history.py` is not among them.

This test drives `build_series_history_report` — the real `GET /series-history` use case — with
a `(RATIO, POINT)` key whose `metric` is NOT `count_long_short_ratio` (the allowlist's one
element), at a reaggregating interval. `ADR-040/D4` says this MUST raise
`DisallowedRatioPointMetricError` before any arithmetic runs. It does not: `reduce_bucket` has
no `metric` parameter to gate on, so it silently reduces through `last` — the exact 3,3x
inflation the allowlist exists to refuse. **MORDE: currently RED**, proving the wiring gap; it
turns green only once `series_history.py` calls `reduce_bucket_for_series(entry.key, ...)`
(or an equivalent gate) instead of the ungated `reduce_bucket`.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from src.modules.charts.domain.panel_grid_enablement import classify_grid_multiple
from src.modules.sentimento.domain.as_of_accessor import BarPolicy, Observation
from src.modules.sentimento.domain.provenance import (
    UNKNOWN_OBSERVER_REGION,
    AvailabilitySource,
    Provenance,
    SeriesRow,
)
from src.modules.sentimento.domain.series_catalog import SeriesCatalog, SeriesCatalogEntry
from src.modules.sentimento.domain.series_history_report import PanelGridVerdict
from src.modules.sentimento.domain.series_key import (
    Nature,
    QuantityField,
    Reduction,
    SeriesKey,
    TsConvention,
)
from src.modules.sentimento.domain.series_reduction_gate import DisallowedRatioPointMetricError
from src.modules.sentimento.use_cases.series_history import build_series_history_report

_SYMBOL = "BTCUSDT"
_GRID_MS = 60_000
_ONE_HOUR_MS = 60 * _GRID_MS

# The metric `ADR-040/D4` names explicitly as the FLOW-shaped ratio the allowlist exists to
# keep OUT of `last()` — `long_short_ratio_series.SUM_TAKER_LONG_SHORT_VOL_RATIO`, transcribed
# rather than imported: this test must not depend on the production module agreeing with
# itself about the string, only on the wire behaviour with THIS literal name.
_DISALLOWED_METRIC = "sum_taker_long_short_vol_ratio"

_WINDOW_START_MS = 1_789_732_800_000  # aligned to `_GRID_MS`, same fixture epoch as its siblings


def _disallowed_ratio_key() -> SeriesKey:
    """A `(RATIO, POINT)` key whose `metric` is NOT in `RATIO_POINT_METRIC_ALLOWLIST`."""
    return SeriesKey(
        provider="binance",
        venue="usdm_futures",
        instrument_id=_SYMBOL,
        metric=_DISALLOWED_METRIC,
        cohort="all",
        interval="5m",
        unit="ratio",
        denom="none",
        nature=Nature.RATIO,
        ts_convention=TsConvention.POINT_AT_BUCKET_END,
        reduction=Reduction.POINT,
        quantity_field=QuantityField.NA,
        label_shift=0,
        aggregation_scope="Symbol",
        verified_by="test_series_history_ratio_point_gate_wiring.py",
    )


def _catalog_for(key: SeriesKey) -> SeriesCatalog:
    entry = SeriesCatalogEntry(
        key=key, native_grid="1min", native_grid_ms=_GRID_MS, max_staleness_ms=120_000
    )
    return SeriesCatalog((entry,))


def _lagged_row(key: SeriesKey, *, bucket_end: int, value_raw: str, lag_ms: int = 5_000) -> SeriesRow:
    return SeriesRow(
        series_key_id=key.series_key_id(),
        symbol=_SYMBOL,
        source="binance",
        bucket_end=bucket_end,
        event_time=bucket_end,
        available_at=bucket_end + lag_ms,
        availability_source=AvailabilitySource.OBSERVED,
        ingested_at=bucket_end + lag_ms,
        observed_at=bucket_end + lag_ms,
        provenance=Provenance.OBSERVED,
        src_label_raw="longShortRatio",
        observer_id="test",
        observer_region=UNKNOWN_OBSERVER_REGION,
        is_final=True,
        value_raw=value_raw,
    )


class _FakeReader:
    def __init__(self, observations: tuple[Observation, ...]) -> None:
        self._observations = observations

    def read_window(
        self,
        *,
        series_key_id: str,
        symbol: str,
        window_start_ms: int,
        window_end_ms: int,
        lookback_ms: int,
    ) -> tuple[Observation, ...]:
        return self._observations


class _FakeBoundsReader:
    def read_bounds(self, *, series_key_id: str, symbol: str) -> tuple[int | None, int | None]:
        return (None, None)


def _classify_panel_grid(*, panel_grid_ms: int, native_grid_ms: int) -> PanelGridVerdict:
    verdict = classify_grid_multiple(panel_grid_ms, native_grid_ms)
    return PanelGridVerdict(
        native_grid_ms=verdict.native_grid_ms,
        enabled=verdict.enabled,
        reason=verdict.reason.value,
        multiple=verdict.multiple,
    )


def test_reaggregating_a_disallowed_ratio_point_metric_must_refuse_not_reduce() -> None:
    """`ADR-040/D4` via the REAL wire use case — MORDE if it silently serves a value instead.

    A flow-shaped ratio reaching `(RATIO, POINT)` at a reaggregating interval (`1h`, so
    `group_size = 60 > 1` and `_reaggregated_row` is reached) must raise
    `DisallowedRatioPointMetricError` before any reduction runs — `series_reduction_gate.py`'s
    own contract. `[MEDIDO 2026-09-22]`: today it does not raise; `reduce_bucket` (ungated)
    returns `last(values)` instead, silently inflating a flow-shaped ratio the same way
    `ADR-040/D4`'s own measurement (`3,3x`, p50 `3,1809` vs `0,9707`) already condemned.
    """
    key = _disallowed_ratio_key()
    outer_bucket_end = _WINDOW_START_MS + _ONE_HOUR_MS
    first_native_instant = _WINDOW_START_MS + _GRID_MS
    rows = [
        _lagged_row(key, bucket_end=first_native_instant + i * _GRID_MS, value_raw=str(1.0 + i))
        for i in range(60)
    ]
    observations = tuple(Observation(row=row, value=Decimal(row.value_raw)) for row in rows)

    with pytest.raises(DisallowedRatioPointMetricError):
        build_series_history_report(
            _catalog_for(key),
            _FakeReader(observations),
            _classify_panel_grid,
            _FakeBoundsReader(),
            series_key_id=key.series_key_id(),
            symbol=_SYMBOL,
            interval="1h",
            window_start_ms=outer_bucket_end,
            window_end_ms=outer_bucket_end,
            knowledge_time_ms=outer_bucket_end + 10 * _GRID_MS,
            bar_policy=BarPolicy.FINAL_ONLY,
        )
