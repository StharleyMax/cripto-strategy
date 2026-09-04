"""`_row_to_entry` / `_row_created_at_ms` — the pure row-mapping half of the Postgres store.

Offline and fast: a plain `dict` stands in for whatever `psycopg`'s `dict_row` factory would
hand back, so this file needs no connection and runs as part of the default suite.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from src.modules.backtest.domain.intrabar_convention import IntrabarConvention
from src.modules.backtest.infra.postgres_run_registry_store import (
    _row_created_at_ms,
    _row_to_entry,
)

_ROW: dict[str, object] = {
    "run_id": "run-1",
    "bundle_hash": "a" * 64,
    "window_from_ms": 0,
    "window_to_ms": 1_000,
    "knowledge_time": 1_000,
    "partitions_content_hash": "b" * 64,
    "commit": "deadbeef",
    "intrabar_convention": "pessimistic_stop_first",
    "intrabar_decided_count": 3,
    "principal_id": "stharley",
    "grid_version": 2,
    "created_at": datetime(2026, 9, 4, 12, 0, 0, tzinfo=UTC),
}


def test_row_to_entry_maps_every_column() -> None:
    """Every `ADR-021`/D2 column round-trips, including the enum conversion.

    Also covers `grid_version` (`ADR-025`/D4's amendment to `D2`).
    """
    entry = _row_to_entry(_ROW)
    assert entry.run_id == "run-1"
    assert entry.intrabar_convention is IntrabarConvention.PESSIMISTIC_STOP_FIRST
    assert entry.intrabar_decided_count == 3
    assert entry.window_from_ms == 0
    assert entry.window_to_ms == 1_000
    assert entry.grid_version == 2


def test_row_created_at_ms_converts_to_epoch_milliseconds() -> None:
    """`created_at` is read as `TIMESTAMPTZ` and converted to epoch ms.

    Never a `datetime` leaking into `domain`/`use_cases`.
    """
    assert _row_created_at_ms(_ROW) == 1_788_523_200_000


def test_row_created_at_ms_refuses_a_non_datetime_value() -> None:
    """A row-factory contract change would surface here loudly, not as a silent bad cast."""
    with pytest.raises(TypeError):
        _row_created_at_ms({**_ROW, "created_at": "not-a-datetime"})
