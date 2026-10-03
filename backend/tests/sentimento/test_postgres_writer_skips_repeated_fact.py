"""`T-06.4` against a REAL TimescaleDB: the reboot that re-publishes a window adds no row.

Test 5 of `handoff/T-06.3-desenho.md` §4 ("T-06.4"), plus the two properties only the engine
can show: that `PostgresObservedLookup.immediate_predecessor` answers the IMMEDIATE predecessor
(`T-06.4-prova.md` §1.5, `ORDER BY observed_at DESC LIMIT 1`), and that a skipped row does not
leave the writer's connection `idle in transaction` (no `accept` follows to commit the read).
"""

from __future__ import annotations

import dataclasses
from collections.abc import Iterator

import psycopg
import pytest
from psycopg.pq import TransactionStatus

from src.modules.sentimento.domain.provenance import (
    UNKNOWN_OBSERVER_REGION,
    AvailabilitySource,
    Provenance,
    SeriesRow,
)
from src.modules.sentimento.domain.repeated_fact import RecordedObservation
from src.modules.sentimento.infra.postgres_series_sink import (
    PostgresObservedLookup,
    PostgresSeriesSink,
    ensure_schema,
)
from src.modules.sentimento.use_cases.write_series_row import WriteOutcome, write_series_row
from tests.helpers.postgres import PostgresDatabase

_BUCKET_MS = 1_787_443_499_999
_EVENT_MS = 1_787_443_500_000
_STEP_MS = 60_000
_REBOOT_MS = 7 * 24 * 3_600_000


@pytest.fixture
def connection(postgres_database: PostgresDatabase) -> Iterator[psycopg.Connection]:
    """One connection, schema applied — the lookup and the sink share it, as in `main()`."""
    with postgres_database.connect() as conn:
        ensure_schema(conn)
        yield conn


def _row(minute: int, **overrides: object) -> SeriesRow:
    columns: dict[str, object] = {
        "series_key_id": "a" * 64,
        "symbol": "BTCUSDT",
        "source": "coinalyze_liquidation",
        "bucket_end": _BUCKET_MS + minute * _STEP_MS,
        "event_time": _EVENT_MS + minute * _STEP_MS,
        "available_at": _EVENT_MS + minute * _STEP_MS + 30_000,
        "availability_source": AvailabilitySource.OBSERVED,
        "ingested_at": _EVENT_MS + minute * _STEP_MS + 31_000,
        "observed_at": _EVENT_MS + minute * _STEP_MS + 31_000,
        "provenance": Provenance.OBSERVED,
        "src_label_raw": "liquidation",
        "observer_id": "vps-01",
        "observer_region": UNKNOWN_OBSERVER_REGION,
        "is_final": None,
        "value_raw": str(minute),
    }
    columns.update(overrides)
    return SeriesRow(**columns)  # type: ignore[arg-type]


def _republished(row: SeriesRow, delta_ms: int, **overrides: object) -> SeriesRow:
    return dataclasses.replace(
        row,
        observed_at=row.observed_at + delta_ms,
        ingested_at=row.ingested_at + delta_ms,
        available_at=row.available_at + delta_ms,
        **overrides,  # type: ignore[arg-type]
    )


def _count(conn: psycopg.Connection) -> int:
    with conn.cursor() as cursor:
        cursor.execute("SELECT count(*) FROM md.series")
        (n,) = cursor.fetchone()  # type: ignore[misc]
    conn.commit()
    return int(n)


def _write(conn: psycopg.Connection, rows: list[SeriesRow]) -> list[WriteOutcome]:
    lookup = PostgresObservedLookup(conn)
    sink = PostgresSeriesSink(conn)
    return [write_series_row(r, lookup=lookup, sink=sink) for r in rows]


def test_a_reboot_republishing_the_same_window_adds_no_row(connection: psycopg.Connection) -> None:
    """Test 5: ten minutes written, then re-published twice (two boots) ⇒ `count(*)` unchanged."""
    window = [_row(m) for m in range(10)]
    assert _write(connection, window) == [WriteOutcome.ACCEPTED] * 10
    assert _count(connection) == 10

    for boot in (1, 2):
        again = [_republished(r, boot * _REBOOT_MS) for r in window]
        assert _write(connection, again) == [WriteOutcome.SKIPPED_IDENTICAL_FACT] * 10

    assert _count(connection) == 10


def test_a_revision_inside_the_republished_window_is_the_only_new_row(
    connection: psycopg.Connection,
) -> None:
    """The reboot that re-publishes ten minutes with ONE revised value adds exactly one row."""
    window = [_row(m) for m in range(10)]
    _write(connection, window)
    again = [_republished(r, _REBOOT_MS) for r in window]
    again[4] = _republished(window[4], _REBOOT_MS, value_raw="4.5")

    outcomes = _write(connection, again)

    assert outcomes.count(WriteOutcome.ACCEPTED) == 1
    assert outcomes[4] is WriteOutcome.ACCEPTED
    assert _count(connection) == 11


def test_the_lookup_answers_the_immediate_predecessor_so_x_zero_x_keeps_three_rows(
    connection: psycopg.Connection,
) -> None:
    """§1.5 on the engine: the 2nd `X`'s predecessor is the `0`, not the 1st `X`."""
    x = _row(0, value_raw="5")
    rows = [x, _republished(x, 300_000, value_raw="0"), _republished(x, 600_000)]

    assert _write(connection, rows) == [WriteOutcome.ACCEPTED] * 3
    assert _count(connection) == 3


def test_the_predecessor_read_back_is_the_fact_that_was_written(
    connection: psycopg.Connection,
) -> None:
    """Round trip of every fact column, `NULL` included, in the domain's shape."""
    first = _row(0, is_final=None, principal_id=None)
    _write(connection, [first])
    lookup = PostgresObservedLookup(connection)

    assert lookup.immediate_predecessor(_republished(first, 1)) == RecordedObservation.of(first)
    assert lookup.immediate_predecessor(first) is None


def test_a_skipped_row_leaves_the_connection_idle_not_idle_in_transaction(
    connection: psycopg.Connection,
) -> None:
    """No `accept` follows a skip, so the read must close its own transaction."""
    first = _row(0)
    _write(connection, [first])

    assert _write(connection, [_republished(first, 300_000)]) == [
        WriteOutcome.SKIPPED_IDENTICAL_FACT
    ]
    assert connection.info.transaction_status is TransactionStatus.IDLE
