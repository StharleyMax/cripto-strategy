"""A synthetic two-regime open-interest market, spelled as a `psql` CSV export of `md.series`.

`T-03.10`: the falsifier bench reads REAL rows through `infra/csv_series_window_reader.py`, so
its tests feed it records in the very shape that export has — the sixteen `EXPORT_COLUMNS`, every
value a string, booleans as `t`/`f`, `NULL` as an empty field. The market is two regimes of one
instrument, keyed by the real catalog ids: the `openInterestHist` series on the 5-minute grid for
the whole span, and the polled series on the 1-minute grid from `capture_minute` on.
"""

from __future__ import annotations

import csv
import math
from collections.abc import Callable
from pathlib import Path

from src.modules.sentimento.domain.open_interest_catalog import (
    binance_open_interest_key,
    binance_open_interest_poll_key,
)
from src.modules.sentimento.infra.csv_series_window_reader import EXPORT_COLUMNS

MINUTE_MS = 60_000
ORIGIN_MS = 1_789_200_000_000 - (1_789_200_000_000 % (4 * 60 * MINUTE_MS))
HIST_LAG_MS = 35_000
POLL_LAG_MS = 1_000


def at(minute: int) -> int:
    """Return the epoch-ms instant `minute` minutes after `ORIGIN_MS`."""
    return ORIGIN_MS + minute * MINUTE_MS


def moving_market(minute: int) -> float:
    """Open interest that moves every minute, so no body is flat by accident."""
    return 80_000.0 + 50.0 * math.sin(minute / 7.0) + 0.5 * minute


def _record(
    series_key_id: str, symbol: str, source: str, minute: int, value: float, lag_ms: int
) -> dict[str, str]:
    bucket_end = at(minute)
    available_at = bucket_end + lag_ms
    fields = {
        "series_key_id": series_key_id,
        "symbol": symbol,
        "source": source,
        "bucket_end": str(bucket_end),
        "event_time": str(bucket_end),
        "available_at": str(available_at),
        "availability_source": "OBSERVED",
        "ingested_at": str(available_at),
        "observed_at": str(available_at),
        "provenance": "OBSERVADO",
        "src_label_raw": source,
        "observer_id": "test",
        "observer_region": "unknown",
        "is_final": "t",
        "principal_id": "",
        "value_raw": f"{value:.3f}",
    }
    assert tuple(fields) == EXPORT_COLUMNS
    return fields


def two_regime_records(
    *,
    symbol: str = "BTCUSDT",
    last_minute: int,
    capture_minute: int,
    hist_value: Callable[[int], float] = moving_market,
    poll_value: Callable[[int], float] = moving_market,
) -> list[dict[str, str]]:
    """History every 5 minutes on `[0, last_minute]`, polling every minute from `capture_minute`."""
    hist_id = binance_open_interest_key(instrument_id=symbol).series_key_id()
    poll_id = binance_open_interest_poll_key(instrument_id=symbol).series_key_id()
    records = [
        _record(
            hist_id,
            symbol,
            "/futures/data/openInterestHist",
            minute,
            hist_value(minute),
            HIST_LAG_MS,
        )
        for minute in range(0, last_minute + 1, 5)
    ]
    records.extend(
        _record(poll_id, symbol, "/fapi/v1/openInterest", minute, poll_value(minute), POLL_LAG_MS)
        for minute in range(capture_minute, last_minute + 1)
    )
    return records


def write_export(path: Path, records: list[dict[str, str]]) -> Path:
    """Write `records` as `psql` would: a header of `EXPORT_COLUMNS`, then one line per row."""
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=EXPORT_COLUMNS)
        writer.writeheader()
        writer.writerows(records)
    return path
