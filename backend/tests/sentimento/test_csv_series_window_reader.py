"""`CsvSeriesWindowReader` answers a `psql` CSV export like the Postgres reader — `T-03.10`."""

from __future__ import annotations

import re
from decimal import Decimal
from pathlib import Path

import pytest

from src.modules.sentimento.domain.open_interest_catalog import binance_open_interest_poll_key
from src.modules.sentimento.infra import postgres_series_window_reader
from src.modules.sentimento.infra.csv_series_window_reader import (
    EXPORT_COLUMNS,
    CsvExportHeaderError,
    CsvExportValueError,
    CsvSeriesWindowReader,
)
from tests.helpers.oi_market_export import at, two_regime_records, write_export

POLL_ID = binance_open_interest_poll_key(instrument_id="BTCUSDT").series_key_id()


def _records() -> list[dict[str, str]]:
    return two_regime_records(last_minute=10, capture_minute=0)


def test_the_export_columns_are_the_postgres_readers_select_list_in_order() -> None:
    """The export is read by NAME, so its header must be the Postgres reader's SELECT, in order."""
    select = postgres_series_window_reader._SELECT_WINDOW_SQL
    match = re.match(r"SELECT (?P<columns>.+?) FROM md\.series", select)
    assert match is not None
    columns = tuple(column.strip() for column in match.group("columns").split(","))

    assert columns == EXPORT_COLUMNS


def test_a_window_read_is_inclusive_on_both_bounds_and_reaches_back_by_the_lookback(
    tmp_path: Path,
) -> None:
    """`[start - lookback, end]`, both ends included — the Postgres reader's own `WHERE`."""
    reader = CsvSeriesWindowReader.from_path(write_export(tmp_path / "x.csv", _records()))

    observations = reader.read_window(
        series_key_id=POLL_ID,
        symbol="BTCUSDT",
        window_start_ms=at(4),
        window_end_ms=at(7),
        lookback_ms=60_000,
    )

    assert [o.row.event_time for o in observations] == [at(m) for m in (3, 4, 5, 6, 7)]
    assert observations[0].value == Decimal(observations[0].row.value_raw)
    assert reader.read_bounds(series_key_id=POLL_ID, symbol="BTCUSDT") == (at(0), at(10))


def test_an_unknown_series_reads_as_empty_with_no_bounds() -> None:
    """A series or symbol absent from the export is empty, never another series' rows."""
    reader = CsvSeriesWindowReader(_records())

    assert (
        reader.read_window(
            series_key_id="nope",
            symbol="BTCUSDT",
            window_start_ms=0,
            window_end_ms=1,
            lookback_ms=0,
        )
        == ()
    )
    assert reader.read_bounds(series_key_id=POLL_ID, symbol="ETHUSDT") == (None, None)


def test_a_header_out_of_order_is_refused(tmp_path: Path) -> None:
    """A reordered export would be read by the wrong names, so it is refused."""
    path = tmp_path / "x.csv"
    path.write_text(",".join(reversed(EXPORT_COLUMNS)) + "\n", encoding="utf-8")

    with pytest.raises(CsvExportHeaderError, match="header"):
        CsvSeriesWindowReader.from_path(path)


@pytest.mark.parametrize(("text", "expected"), [("t", True), ("f", False), ("", None)])
def test_psql_booleans_and_null_are_read(text: str, expected: bool | None) -> None:
    """`psql` writes booleans as `t`/`f` and `NULL` as an empty field."""
    (record, *_) = _records()
    record["is_final"] = text
    record["principal_id"] = "p-1"

    (observation,) = CsvSeriesWindowReader([record]).read_window(
        series_key_id=record["series_key_id"],
        symbol="BTCUSDT",
        window_start_ms=0,
        window_end_ms=at(10),
        lookback_ms=0,
    )

    assert observation.row.is_final is expected
    assert observation.row.principal_id == "p-1"


def test_an_empty_principal_is_null() -> None:
    """An empty `principal_id` is `NULL` in the export, so it reads as `None`."""
    (record, *_) = _records()

    (observation,) = CsvSeriesWindowReader([record]).read_window(
        series_key_id=record["series_key_id"],
        symbol="BTCUSDT",
        window_start_ms=0,
        window_end_ms=at(10),
        lookback_ms=0,
    )

    assert observation.row.principal_id is None


@pytest.mark.parametrize(("column", "text"), [("is_final", "yes"), ("bucket_end", "12.5")])
def test_a_field_that_does_not_parse_is_refused_by_name(column: str, text: str) -> None:
    """A field that is not its column's type is refused, never coerced."""
    (record, *_) = _records()
    record[column] = text

    with pytest.raises(CsvExportValueError):
        CsvSeriesWindowReader([record])
