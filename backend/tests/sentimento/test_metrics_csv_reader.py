"""`infra.metrics_csv_reader`: the boundary where a wall-clock string becomes an epoch int."""

from __future__ import annotations

from pathlib import Path

import pytest

from src.modules.sentimento.infra.metrics_csv_reader import (
    format_event_time_iso,
    parse_create_time_ms,
    read_raw_metrics_rows,
)

_HEADER = (
    "create_time,symbol,sum_open_interest,sum_open_interest_value,"
    "count_toptrader_long_short_ratio,sum_toptrader_long_short_ratio,"
    "count_long_short_ratio,sum_taker_long_short_vol_ratio"
)


def test_parse_create_time_ms_reads_the_wall_clock_string_as_utc() -> None:
    """`2026-08-12 00:00:00` is UTC midnight — `SPEC-001` §2.2's convention, made concrete."""
    assert parse_create_time_ms("2026-08-12 00:00:00") == 1_786_492_800_000


def test_format_event_time_iso_round_trips_the_parsed_instant() -> None:
    """Parse then format lands back on the same wall-clock string, with the `Z` suffix."""
    parsed = parse_create_time_ms("2026-08-12 00:00:00")
    assert format_event_time_iso(parsed) == "2026-08-12T00:00:00Z"


def test_read_raw_metrics_rows_reads_one_row_correctly(tmp_path: Path) -> None:
    """A minimal, well-formed file round-trips every one of the eight columns."""
    csv_path = tmp_path / "one-row.csv"
    csv_path.write_text(
        _HEADER + "\n2026-08-12 00:00:00,BTCUSDT,1.5,2.5,3.5,4.5,5.5,6.5\n",
        encoding="utf-8",
    )
    (row,) = read_raw_metrics_rows(csv_path)
    assert row.create_time_raw == "2026-08-12 00:00:00"
    assert row.symbol == "BTCUSDT"
    assert row.sum_taker_long_short_vol_ratio == pytest.approx(6.5)


def test_read_raw_metrics_rows_refuses_a_header_that_does_not_match(tmp_path: Path) -> None:
    """A reordered or truncated header REFUSES rather than silently misreading columns."""
    csv_path = tmp_path / "wrong-header.csv"
    csv_path.write_text("symbol,create_time\nBTCUSDT,2026-08-12 00:00:00\n", encoding="utf-8")
    with pytest.raises(ValueError, match="does not match the eight declared columns"):
        read_raw_metrics_rows(csv_path)
