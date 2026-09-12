"""`build_series_history_report` — `ADR-034/D9` item 2, `SPEC-006 §5.2` envelope, `CA-F1-2/3/5`."""

from __future__ import annotations

from decimal import Decimal

import pytest

from src.modules.charts.domain.panel_grid_enablement import classify_grid_multiple
from src.modules.sentimento.domain.as_of_accessor import BarPolicy, Observation
from src.modules.sentimento.domain.provenance import (
    UNKNOWN_OBSERVER_REGION,
    Absence,
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
from src.modules.sentimento.use_cases.series_history import (
    InvalidWindowError,
    UnknownSeriesKeyIdError,
    UnsupportedIntervalError,
    build_series_history_report,
)

GRID_MS = 60_000
"""1-minute native grid — `ADR-034/D6`, the only one F1 serves."""

SYMBOL = "BTCUSDT"


def classify_panel_grid(*, panel_grid_ms: int, native_grid_ms: int) -> PanelGridVerdict:
    """Satisfy the `GridMultipleClassifier` port with the REAL `charts` rule (`ADR-037/D4`).

    Not a stub returning a constant: `src.main._classify_panel_grid` is this same projection,
    and a test double that invented its own verdict would let the envelope say `upsampling`
    while `ADR-026/D1` said something else.
    """
    verdict = classify_grid_multiple(panel_grid_ms, native_grid_ms)
    return PanelGridVerdict(
        native_grid_ms=verdict.native_grid_ms,
        enabled=verdict.enabled,
        reason=verdict.reason.value,
        multiple=verdict.multiple,
    )


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
        (
            SeriesCatalogEntry(
                key=_oi_key(),
                native_grid="1min",
                native_grid_ms=60_000,
                max_staleness_ms=max_staleness_ms,
            ),
        )
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
        classify_panel_grid,
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
        classify_panel_grid,
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
        classify_panel_grid,
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

    first = build_series_history_report(catalog, reader, classify_panel_grid, **kwargs)  # type: ignore[arg-type]
    second = build_series_history_report(catalog, reader, classify_panel_grid, **kwargs)  # type: ignore[arg-type]

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
        classify_panel_grid,
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
            classify_panel_grid,
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
            classify_panel_grid,
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
            classify_panel_grid,
            series_key_id=_oi_key().series_key_id(),
            symbol=SYMBOL,
            interval="1m",
            window_start_ms=BUCKET_END + GRID_MS,
            window_end_ms=BUCKET_END,
            knowledge_time_ms=BUCKET_END + 100_000,
            bar_policy=BarPolicy.FINAL_ONLY,
        )


# ── PUBLICATION LAG: the fixture property every test above is missing ──────────────────────
#
# Every fixture above stamps `available_at == bucket_end` — a bucket readable AT THE VERY
# INSTANT it closes. No stored row is ever like that, and `SeriesReadPolicy.bucket_interval_ms`
# (`as_of_accessor.py`) says so in as many words: "a bucket becomes readable one lag AFTER it
# closes". The lag is what the tests below put back.
#
# `[MEDIDO 2026-09-11, docker exec -i deploy-postgres-1 psql -At -c "SELECT available_at -
# bucket_end FROM md.series WHERE series_key_id='ef3033e6...4e42' ORDER BY bucket_end DESC
# LIMIT 6"]` -> 47_183 / 48_461 / 49_772 / 51_082 / 52_376 / 53_677 ms (n=6). 50_000 is inside
# that spread and is the round number the fixtures use.
PUBLICATION_LAG_MS = 50_000


def _volume_key(**overrides: object) -> SeriesKey:
    """Build the `FLOW` series the defect was found on: `klines_volume`, BTCUSDT, 1m.

    Transcribed from the served catalog entry `[MEDIDO 2026-09-11, GET /api/v1/series-catalog]`,
    whose `series_key_id` is the one `md.series` holds 10.706 rows for.
    """
    terms: dict[str, object] = {
        "provider": "binance",
        "venue": "usdm_futures",
        "instrument_id": "BTCUSDT",
        "metric": "klines_volume",
        "cohort": "all",
        "interval": "1m",
        "unit": "BTC",
        "denom": "base",
        "nature": Nature.FLOW,
        "ts_convention": TsConvention.AGGREGATE_OVER_BUCKET,
        "reduction": Reduction.SUM,
        "quantity_field": QuantityField.NA,
        "label_shift": 0,
        "aggregation_scope": "Symbol",
        "verified_by": "test_series_history.py",
    }
    terms.update(overrides)
    return SeriesKey(**terms)  # type: ignore[arg-type]


def _catalog_for(key: SeriesKey, *, max_staleness_ms: int = 120_000) -> SeriesCatalog:
    """Build a one-entry catalog for `key` (`120_000` is the served `maxStalenessMs` of both)."""
    return SeriesCatalog(
        (
            SeriesCatalogEntry(
                key=key,
                native_grid="1min",
                native_grid_ms=60_000,
                max_staleness_ms=max_staleness_ms,
            ),
        )
    )


def _lagged_row(
    key: SeriesKey,
    *,
    bucket_end: int,
    value_raw: str,
    lag_ms: int = PUBLICATION_LAG_MS,
    is_final: bool | None = True,
) -> SeriesRow:
    """One row of `key`, readable `lag_ms` after its bucket closed — the real stored shape."""
    return SeriesRow(
        series_key_id=key.series_key_id(),
        symbol=SYMBOL,
        source="binance",
        bucket_end=bucket_end,
        event_time=bucket_end,
        available_at=bucket_end + lag_ms,
        availability_source=AvailabilitySource.OBSERVED,
        ingested_at=bucket_end + lag_ms,
        observed_at=bucket_end + lag_ms,
        provenance=Provenance.OBSERVED,
        src_label_raw="volume",
        observer_id="test",
        observer_region=UNKNOWN_OBSERVER_REGION,
        is_final=is_final,
        value_raw=value_raw,
    )


def _observations(*rows: SeriesRow) -> tuple[Observation, ...]:
    return tuple(Observation(row=row, value=Decimal(row.value_raw)) for row in rows)


def test_a_flow_series_with_publication_lag_serves_a_value_at_every_grid_instant() -> None:
    """THE REPRODUCER of `ACHADO-SERIES-HISTORY-SEM-PONTO.md`: 100% `SEM_PONTO` on a `FLOW`.

    Production served `180` rows, `0` with a value, `100%` `absence=SEM_PONTO`, while
    `md.series` held `10.706` complete rows for the same `series_key_id` `[MEDIDO 2026-09-11,
    GET /api/v1/series-history?series_key_id=ef3033e6...4e42&interval=1m]`. Two buckets and a
    real publication lag are the whole reproduction: a `FLOW` carries nothing forward
    (`CARRY_FORWARD_BY_NATURE[FLOW] is False`), so a bucket first reachable one grid step after
    it closed is already `age_ms >= bucket_interval_ms` — `SEM_PONTO`, every row, for ever.
    """
    key = _volume_key()
    first, second = BUCKET_END, BUCKET_END + GRID_MS
    reader = _FakeReader(
        _observations(
            _lagged_row(key, bucket_end=first, value_raw="72.068"),
            _lagged_row(key, bucket_end=second, value_raw="30.537"),
        )
    )

    report = build_series_history_report(
        _catalog_for(key),
        reader,
        classify_panel_grid,
        series_key_id=key.series_key_id(),
        symbol=SYMBOL,
        interval="1m",
        window_start_ms=first,
        window_end_ms=second,
        knowledge_time_ms=second + 10 * GRID_MS,
        bar_policy=BarPolicy.FINAL_ONLY,
    )

    assert [row.event_time for row in report.rows] == [first, second]
    assert [row.value for row in report.rows] == ["72.068", "30.537"]
    assert [row.absence for row in report.rows] == [None, None]


def test_a_stock_series_with_publication_lag_is_not_shifted_one_bucket_late() -> None:
    """The same root cause, silent instead of visible, on a carry-forward nature.

    `STOCK` carries forward, so the chart SHOWS a number — the PREVIOUS bucket's, drawn one
    whole minute late on every point, and an empty first point. Only a fixture with two
    DIFFERENT values can tell that apart from a correct chart, which is why each grid instant's
    value is asserted and not merely its presence.
    """
    key = _oi_key()
    first, second = BUCKET_END, BUCKET_END + GRID_MS
    reader = _FakeReader(
        _observations(
            _lagged_row(key, bucket_end=first, value_raw="10"),
            _lagged_row(key, bucket_end=second, value_raw="20"),
        )
    )

    report = build_series_history_report(
        _catalog_for(key),
        reader,
        classify_panel_grid,
        series_key_id=key.series_key_id(),
        symbol=SYMBOL,
        interval="1m",
        window_start_ms=first,
        window_end_ms=second,
        knowledge_time_ms=second + 10 * GRID_MS,
        bar_policy=BarPolicy.FINAL_ONLY,
    )

    assert [row.value for row in report.rows] == ["10", "20"]
    assert [row.available_at for row in report.rows] == [
        first + PUBLICATION_LAG_MS,
        second + PUBLICATION_LAG_MS,
    ]


def test_a_bucket_that_closes_after_the_grid_instant_is_never_served_at_it() -> None:
    """The anti-lookahead bound of the fix: reaching one WHOLE step forward is a defect.

    The next bucket is stamped with ZERO lag here on purpose — `available_at == bucket_end` is
    the one fixture shape R-1 cannot reject, so `bucket_end <= t` (R-2) is the single predicate
    left holding the line. A read instant of `grid + GRID_MS` instead of `grid + GRID_MS - 1`
    would serve `999` at `first`, which is data from AFTER `first`.
    """
    key = _volume_key()
    first, second = BUCKET_END, BUCKET_END + GRID_MS
    reader = _FakeReader(
        _observations(
            _lagged_row(key, bucket_end=first, value_raw="72.068"),
            _lagged_row(key, bucket_end=second, value_raw="999", lag_ms=0),
        )
    )

    report = build_series_history_report(
        _catalog_for(key),
        reader,
        classify_panel_grid,
        series_key_id=key.series_key_id(),
        symbol=SYMBOL,
        interval="1m",
        window_start_ms=first,
        window_end_ms=first,
        knowledge_time_ms=second + 10 * GRID_MS,
        bar_policy=BarPolicy.FINAL_ONLY,
    )

    assert [row.value for row in report.rows] == ["72.068"]


def test_the_knowledge_horizon_still_excludes_a_row_observed_after_it() -> None:
    """`CA-F4-25` is on `knowledge_time`, and widening the READ instant must not widen it.

    `knowledge_time_ms = first` is a caller asking "what did we know when this bucket closed?".
    The bucket's own row was observed one publication lag later, so the honest answer is an
    absence — and it stays an absence however far into the grid cell the read instant reaches,
    because `observed_at <= knowledge_time` does not mention `t`.
    """
    key = _volume_key()
    first = BUCKET_END
    reader = _FakeReader(_observations(_lagged_row(key, bucket_end=first, value_raw="72.068")))

    report = build_series_history_report(
        _catalog_for(key),
        reader,
        classify_panel_grid,
        series_key_id=key.series_key_id(),
        symbol=SYMBOL,
        interval="1m",
        window_start_ms=first,
        window_end_ms=first,
        knowledge_time_ms=first,
        bar_policy=BarPolicy.FINAL_ONLY,
    )

    assert report.rows[0].value is None
    assert report.rows[0].absence == Absence.NO_POINT.value


def test_intrabar_reads_at_the_grid_instant_and_never_the_next_bucket_partial() -> None:
    """`intrabar` keeps reading AT the grid instant, and the asymmetry is the point.

    Under `final_only` R-2 (`bucket_end <= t`) caps the winner at the bucket closing at the
    grid instant, so the read may safely reach the end of the grid cell. Under `intrabar` R-2 is
    WAIVED (`_r2_admits` returns `True`), so that same reach would let a PARTIAL of the bucket
    closing one step LATER win and be labelled with the earlier grid instant — data from after
    `t` drawn at `t`, the inversion `SPEC-001` §2.4 exists to stop.
    """
    key = _volume_key()
    first, second = BUCKET_END, BUCKET_END + GRID_MS
    reader = _FakeReader(
        _observations(
            _lagged_row(key, bucket_end=first, value_raw="60.0", lag_ms=-10_000, is_final=False),
            _lagged_row(key, bucket_end=first, value_raw="72.068"),
            _lagged_row(key, bucket_end=second, value_raw="999", lag_ms=-30_000, is_final=False),
        )
    )

    report = build_series_history_report(
        _catalog_for(key),
        reader,
        classify_panel_grid,
        series_key_id=key.series_key_id(),
        symbol=SYMBOL,
        interval="1m",
        window_start_ms=first,
        window_end_ms=first,
        knowledge_time_ms=second + 10 * GRID_MS,
        bar_policy=BarPolicy.INTRABAR,
    )

    assert [row.value for row in report.rows] == ["60.0"]


# ── `ADR-037` — `bucket_interval_ms` is the NATIVE grid, not the report step ────────────────
#
# The matrix over `as_of` itself lives in `test_series_history_native_grid.py`. What follows
# exercises the SAME decision one layer up, through the real use case, because that is the
# layer where the defect actually lived (`series_history.py:179`): a test that only measured
# `as_of` would stay green while the caller injected the wrong argument forever.

RATIO_LAG_MS = 66_712
"""`ADR-037`/M1: the minimum publication lag of `globalLongShortAccountRatio`, n=4.000 rows."""

FIVE_MINUTE_GRID_MS = 300_000
"""`ADR-037`/M2: the native grid of the 5-minute series, `p50 == max`, n=1.000 rows/symbol."""


def _ratio_key() -> SeriesKey:
    """Build a 5-minute series of a nature that is NOT carried forward (`False` in the table)."""
    return _oi_key(metric="count_long_short_ratio", nature=Nature.RATIO, unit="ratio", denom="none")


def _ratio_catalog(*, native_grid_ms: int) -> SeriesCatalog:
    """Build a one-row catalog whose declared width is the ONLY term these two tests vary."""
    return SeriesCatalog(
        (
            SeriesCatalogEntry(
                key=_ratio_key(),
                native_grid="5min",
                native_grid_ms=native_grid_ms,
                max_staleness_ms=600_000,
            ),
        )
    )


def _ratio_reader(*, window_end_ms: int) -> _FakeReader:
    """One LIVE bucket published `RATIO_LAG_MS` after it closed; every other row backfill.

    `ADR-037`/M5 measured exactly this: at most two buckets per symbol collected live, all the
    rest a backfill batch stamped long after the window and therefore invisible to `as_of`
    until `E1`/`D16` exists in code.
    """
    live_bucket = window_end_ms - FIVE_MINUTE_GRID_MS
    backfill_at = window_end_ms + 10 * GRID_MS
    key = _ratio_key()
    observations = []
    for index in range(16):
        bucket_end = window_end_ms - index * FIVE_MINUTE_GRID_MS
        available_at = bucket_end + RATIO_LAG_MS if bucket_end == live_bucket else backfill_at
        observations.append(
            Observation(
                row=SeriesRow(
                    series_key_id=key.series_key_id(),
                    symbol=SYMBOL,
                    source="binance",
                    bucket_end=bucket_end,
                    event_time=bucket_end,
                    available_at=available_at,
                    availability_source=AvailabilitySource.OBSERVED,
                    ingested_at=available_at,
                    observed_at=available_at,
                    provenance=Provenance.OBSERVED,
                    src_label_raw="longShortRatio",
                    observer_id="test",
                    observer_region=UNKNOWN_OBSERVER_REGION,
                    is_final=None,
                    value_raw="1.2345",
                ),
                value=Decimal("1.2345"),
            )
        )
    return _FakeReader(tuple(observations))


def _count_points(*, native_grid_ms: int) -> int:
    window_end_ms = BUCKET_END + 60 * GRID_MS
    window_start_ms = window_end_ms - 60 * GRID_MS
    report = build_series_history_report(
        _ratio_catalog(native_grid_ms=native_grid_ms),
        _ratio_reader(window_end_ms=window_end_ms),
        classify_panel_grid,
        series_key_id=_ratio_key().series_key_id(),
        symbol=SYMBOL,
        interval="1m",
        window_start_ms=window_start_ms,
        window_end_ms=window_end_ms,
        knowledge_time_ms=window_end_ms + 10 * GRID_MS,
        bar_policy=BarPolicy.FINAL_ONLY,
    )
    assert len(report.rows) == 61, "the window is the 61-slot hour ADR-037/M3 measured"
    return sum(1 for row in report.rows if row.value is not None)


def test_a_five_minute_non_carried_series_renders_through_the_real_use_case() -> None:
    """MORDE (`ADR-037` falsifier item 1): 4 of 61 slots carry a value, `RATIO` untouched.

    Four, not one: the readable window of a non-carry-forward bucket is
    `[bucket_end + lag, bucket_end + native_grid)` — 233.288 ms wide here, which covers four
    1-minute slots. This is `ADR-037`/M3's `4 / 61` cell, reproduced through
    `build_series_history_report` rather than through a direct `as_of` call.
    """
    assert _count_points(native_grid_ms=FIVE_MINUTE_GRID_MS) == 4


def test_injecting_the_report_step_as_the_width_vetoes_every_slot() -> None:
    """CALA (`ADR-037` falsifier item 2): the OLD value gives EXACTLY zero, on the same data.

    This is the mutation, written as a test instead of as a promise: `60_000` is precisely what
    `series_history.py:179` injected before `ADR-037`, and with it the series is unreadable at
    every one of the 61 slots — `HTTP 200` with `n_points = 0`, the `rc=0` silence `ADR-012`
    names. A change that put `_GRID_STEP_MS` back would make the test above fail; a test that
    passed under both widths would not be measuring this decision at all.
    """
    assert _count_points(native_grid_ms=GRID_MS) == 0


def test_the_one_minute_control_is_invariant_under_this_change() -> None:
    """THE CONTROL: `klines_volume` renders, and it renders for the same reason it always did.

    `ADR-037`/M4 is why this matters — of the 44 served catalog rows, 16 are `1min`/`FLOW`,
    where the report step COINCIDES with the native grid. For those rows `ADR-037` changes the
    argument's PROVENANCE and not its value, and the whole class had to stay byte-identical.
    The sibling `test_a_flow_series_with_publication_lag_serves_a_value_at_every_grid_instant`
    is the behavioural half of this control; this one pins the arithmetic premise it rests on.
    """
    entry = SeriesCatalogEntry(
        key=_volume_key(),
        native_grid="1min",
        native_grid_ms=60_000,
        max_staleness_ms=120_000,
    )
    assert entry.native_grid_ms == GRID_MS


def test_the_report_names_upsampling_when_the_native_grid_is_wider_than_the_panel() -> None:
    """`ADR-037/D4`: the envelope QUALIFIES the staircase instead of serving it unnamed.

    `classify_grid_multiple` had zero production callers when `ADR-037` was written
    (`M6`); this is the verdict reaching the wire through the injected port.
    """
    window_end_ms = BUCKET_END + 60 * GRID_MS
    report = build_series_history_report(
        _ratio_catalog(native_grid_ms=FIVE_MINUTE_GRID_MS),
        _ratio_reader(window_end_ms=window_end_ms),
        classify_panel_grid,
        series_key_id=_ratio_key().series_key_id(),
        symbol=SYMBOL,
        interval="1m",
        window_start_ms=window_end_ms,
        window_end_ms=window_end_ms,
        knowledge_time_ms=window_end_ms + 10 * GRID_MS,
        bar_policy=BarPolicy.FINAL_ONLY,
    )

    panel = report.to_envelope(principal_id=None, server_now_ms=window_end_ms)["panel"]
    assert panel["native_grid_ms"] == FIVE_MINUTE_GRID_MS  # type: ignore[index]
    assert panel["grid_multiple"] == {  # type: ignore[index]
        "enabled": False,
        "reason": "upsampling",
        "multiple": None,
    }


def test_a_series_whose_native_grid_equals_the_panel_grid_is_not_upsampling() -> None:
    """The other side of `ADR-037/D4`: a 1-minute series is a multiple of itself, `multiple=1`."""
    catalog = _catalog_with_one_entry()
    report = build_series_history_report(
        catalog,
        _FakeReader(()),
        classify_panel_grid,
        series_key_id=_oi_key().series_key_id(),
        symbol=SYMBOL,
        interval="1m",
        window_start_ms=BUCKET_END,
        window_end_ms=BUCKET_END,
        knowledge_time_ms=BUCKET_END + 10 * GRID_MS,
        bar_policy=BarPolicy.FINAL_ONLY,
    )

    panel = report.to_envelope(principal_id=None, server_now_ms=BUCKET_END)["panel"]
    assert panel["grid_multiple"] == {  # type: ignore[index]
        "enabled": True,
        "reason": "multiple_of_native",
        "multiple": 1,
    }
