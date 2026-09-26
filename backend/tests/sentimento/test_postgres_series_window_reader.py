"""`PostgresSeriesWindowReader` over a REAL, ephemeral TimescaleDB — `ADR-034/D9`, item 1.

Same idiom `test_postgres_series_sink.py` already uses for a throwaway container: skipped (not
failed) when `docker` is not on `PATH`, so an environment without Docker still gets a green,
meaningful suite — it only loses the tests that prove the `SELECT` against a real engine.
"""

from __future__ import annotations

from collections.abc import Iterator
from decimal import Decimal

import psycopg
import pytest

from src.modules.sentimento.domain.provenance import (
    UNKNOWN_OBSERVER_REGION,
    AvailabilitySource,
    Provenance,
    SeriesRow,
)
from src.modules.sentimento.infra.postgres_series_sink import PostgresSeriesSink, ensure_schema
from src.modules.sentimento.infra.postgres_series_window_reader import (
    InvalidLookbackError,
    PostgresSeriesWindowReader,
)
from tests.helpers.postgres import PostgresDatabase

SERIES_KEY_ID = "a" * 64
SYMBOL = "BTCUSDT"
BUCKET_END_MS = 1_620_000_000_000
GRID_MS = 60_000


@pytest.fixture
def postgres_connection(postgres_database: PostgresDatabase) -> Iterator[psycopg.Connection]:
    """One connection to this test's own database, with the `md.series` DDL already applied."""
    with postgres_database.connect() as connection:
        ensure_schema(connection)
        yield connection


def _row(**overrides: object) -> SeriesRow:
    """Build one valid market-series row, defaulting to `(SERIES_KEY_ID, SYMBOL)`."""
    columns: dict[str, object] = {
        "series_key_id": SERIES_KEY_ID,
        "symbol": SYMBOL,
        "source": "binance",
        "bucket_end": BUCKET_END_MS,
        "event_time": BUCKET_END_MS,
        "available_at": BUCKET_END_MS,
        "availability_source": AvailabilitySource.OBSERVED,
        "ingested_at": BUCKET_END_MS,
        "observed_at": BUCKET_END_MS,
        "provenance": Provenance.OBSERVED,
        "src_label_raw": "sumOpenInterest",
        "observer_id": "vps-01",
        "observer_region": UNKNOWN_OBSERVER_REGION,
        "is_final": True,
        "value_raw": "1234.56",
    }
    columns.update(overrides)
    return SeriesRow(**columns)  # type: ignore[arg-type]


def test_read_window_returns_the_row_inside_the_window_decoded_to_decimal(
    postgres_connection: psycopg.Connection,
) -> None:
    """One row landed via the real sink comes back as an `Observation` with `Decimal(value_raw)`."""
    PostgresSeriesSink(postgres_connection).accept(_row())
    reader = PostgresSeriesWindowReader(postgres_connection)

    observations = reader.read_window(
        series_key_id=SERIES_KEY_ID,
        symbol=SYMBOL,
        window_start_ms=BUCKET_END_MS,
        window_end_ms=BUCKET_END_MS,
        lookback_ms=GRID_MS,
    )

    assert len(observations) == 1
    assert observations[0].value == Decimal("1234.56")
    assert observations[0].row.bucket_end == BUCKET_END_MS
    assert observations[0].row.series_key_id == SERIES_KEY_ID


def test_read_window_excludes_a_row_before_the_lookback_horizon(
    postgres_connection: psycopg.Connection,
) -> None:
    """A row older than `window_start_ms - lookback_ms` is out of range — never returned."""
    too_old = _row(bucket_end=BUCKET_END_MS - 10 * GRID_MS, event_time=BUCKET_END_MS - 10 * GRID_MS)
    PostgresSeriesSink(postgres_connection).accept(too_old)
    reader = PostgresSeriesWindowReader(postgres_connection)

    observations = reader.read_window(
        series_key_id=SERIES_KEY_ID,
        symbol=SYMBOL,
        window_start_ms=BUCKET_END_MS,
        window_end_ms=BUCKET_END_MS,
        lookback_ms=GRID_MS,
    )

    assert observations == ()


def test_read_window_excludes_a_row_after_the_window_end(
    postgres_connection: psycopg.Connection,
) -> None:
    """A row past `window_end_ms` is out of range — never returned, even inside the lookback."""
    future = _row(bucket_end=BUCKET_END_MS + GRID_MS, event_time=BUCKET_END_MS + GRID_MS)
    PostgresSeriesSink(postgres_connection).accept(future)
    reader = PostgresSeriesWindowReader(postgres_connection)

    observations = reader.read_window(
        series_key_id=SERIES_KEY_ID,
        symbol=SYMBOL,
        window_start_ms=BUCKET_END_MS,
        window_end_ms=BUCKET_END_MS,
        lookback_ms=GRID_MS,
    )

    assert observations == ()


def test_read_window_filters_by_series_key_id_and_symbol(
    postgres_connection: psycopg.Connection,
) -> None:
    """A row for a DIFFERENT series or symbol never leaks into this window's answer."""
    PostgresSeriesSink(postgres_connection).accept(_row(series_key_id="b" * 64))
    PostgresSeriesSink(postgres_connection).accept(_row(symbol="ETHUSDT"))
    reader = PostgresSeriesWindowReader(postgres_connection)

    observations = reader.read_window(
        series_key_id=SERIES_KEY_ID,
        symbol=SYMBOL,
        window_start_ms=BUCKET_END_MS,
        window_end_ms=BUCKET_END_MS,
        lookback_ms=GRID_MS,
    )

    assert observations == ()


def test_read_bounds_is_none_none_on_an_empty_store(
    postgres_connection: psycopg.Connection,
) -> None:
    """`T-03.6`: no row at all for `(series_key_id, symbol)` — the honest answer is BOTH `None`.

    Never `(0, 0)`: `0` is a valid `bucket_end` (`1970-01-01T00:00:00Z` on the grid), and
    reporting it for "nothing stored" would collide with a real, if ancient, row.
    """
    reader = PostgresSeriesWindowReader(postgres_connection)

    earliest, latest = reader.read_bounds(series_key_id=SERIES_KEY_ID, symbol=SYMBOL)

    assert (earliest, latest) == (None, None)


def test_read_bounds_returns_min_and_max_bucket_end_across_the_whole_store(
    postgres_connection: psycopg.Connection,
) -> None:
    """`T-03.6`: the store's OWN extent — never the window a caller happens to ask about.

    Three rows land, ten grid steps apart each; `read_bounds` takes NO window argument at all,
    so this is the falsifier that it is a WHOLE-TABLE aggregate, not `read_window` renamed.
    """
    sink = PostgresSeriesSink(postgres_connection)
    earliest_end = BUCKET_END_MS - 20 * GRID_MS
    middle_end = BUCKET_END_MS - 10 * GRID_MS
    latest_end = BUCKET_END_MS
    for bucket_end in (earliest_end, middle_end, latest_end):
        sink.accept(_row(bucket_end=bucket_end, event_time=bucket_end))
    reader = PostgresSeriesWindowReader(postgres_connection)

    earliest, latest = reader.read_bounds(series_key_id=SERIES_KEY_ID, symbol=SYMBOL)

    assert (earliest, latest) == (earliest_end, latest_end)


def test_read_bounds_never_leaks_a_row_from_a_different_series_or_symbol(
    postgres_connection: psycopg.Connection,
) -> None:
    """A row for a DIFFERENT `series_key_id`/`symbol` must never widen `read_bounds`'s answer.

    `MORDE` if it does: a foreign row, far outside the fixture's own range, landing inside the
    reported extent would be silent cross-series contamination — the same class of leak
    `test_read_window_filters_by_series_key_id_and_symbol` already guards on the windowed read.
    """
    sink = PostgresSeriesSink(postgres_connection)
    sink.accept(_row(bucket_end=BUCKET_END_MS, event_time=BUCKET_END_MS))
    foreign_end = BUCKET_END_MS + 1_000 * GRID_MS
    sink.accept(_row(series_key_id="b" * 64, bucket_end=foreign_end, event_time=foreign_end))
    sink.accept(_row(symbol="ETHUSDT", bucket_end=foreign_end, event_time=foreign_end))
    reader = PostgresSeriesWindowReader(postgres_connection)

    earliest, latest = reader.read_bounds(series_key_id=SERIES_KEY_ID, symbol=SYMBOL)

    assert (earliest, latest) == (BUCKET_END_MS, BUCKET_END_MS)


class _UnreachableConnection:
    """A `psycopg.Connection` stand-in whose `cursor()` fails the test if ever called."""

    def cursor(self) -> object:
        raise AssertionError("read_window must refuse a negative lookback_ms before any query")


def test_read_window_refuses_a_negative_lookback_ms_before_touching_the_connection() -> None:
    """A negative `lookback_ms` can never satisfy `ADR-034/D9` — refused, no query attempted."""
    reader = PostgresSeriesWindowReader(_UnreachableConnection())  # type: ignore[arg-type]

    with pytest.raises(InvalidLookbackError, match="negative"):
        reader.read_window(
            series_key_id=SERIES_KEY_ID,
            symbol=SYMBOL,
            window_start_ms=BUCKET_END_MS,
            window_end_ms=BUCKET_END_MS,
            lookback_ms=-1,
        )
