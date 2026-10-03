"""`read_bounds` after `T-06.3`: same answer as the old `MIN`/`MAX`, without the pathological plan.

`handoff/T-06.3-desenho.md` §1.2 measured the cause on the local stack: `MIN(bucket_end)` became a
`LIMIT 1` walk over `bucket_end` with `series_key_id`/`symbol` as a filter, so a series born late
paid for every row of every other series in the earlier chunks. The fix rewrites only the `MIN`
(`DISTINCT ON (source) ... ORDER BY source, bucket_end`, a SkipScan on the primary key).

Two claims, both against a REAL TimescaleDB (`tests/helpers/postgres.py`, the production image):

1. CALA, equivalence — on every shape the design names, `read_bounds` returns exactly what the
   OLD statement (`_OLD_EXTENT_SQL`, kept here as the oracle) returns. MORDE: any rewrite that
   diverges — e.g. taking the first `source`'s minimum instead of the minimum over sources — fails
   the two-sources case.
2. MORDE, plan — for the late-born series, `EXPLAIN (ANALYZE, FORMAT JSON)` of the new statement
   removes < 1,000 rows by filter. The ablation runs in the same test: the OLD statement, over
   the same seeded data, removes >= 50,000, so the instrument provably sees the pathology.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any, Final

import psycopg
import pytest

from src.modules.sentimento.infra.postgres_series_sink import ensure_schema
from src.modules.sentimento.infra.postgres_series_window_reader import (
    _SELECT_EXTENT_SQL,
    PostgresSeriesWindowReader,
)
from tests.helpers.postgres import PostgresDatabase

# The pre-`T-06.3` statement, verbatim — the oracle the new one must agree with.
_OLD_EXTENT_SQL: Final[str] = (
    "SELECT MIN(bucket_end), MAX(bucket_end) FROM md.series "
    "WHERE series_key_id = %s AND symbol = %s"
)

_CHUNK_MS: Final[int] = 604_800_000  # `md.series`' `chunk_time_interval` (7 days)
_BASE_MS: Final[int] = _CHUNK_MS * 2_900  # chunk-aligned, so chunk 1 is [base, base + 7 d)
_SYMBOL: Final[str] = "BTCUSDT"
_EARLY_SERIES: Final[str] = "e" * 64
_LATE_SERIES: Final[str] = "l" * 64
_EARLY_ROWS: Final[int] = 50_000
_EARLY_STEP_MS: Final[int] = 12_000  # 50,000 x 12 s = 600,000 s < one 7-day chunk

# One row per `generate_series` step; every NOT NULL column of `md.series` filled.
_SEED_SQL: Final[str] = (
    "INSERT INTO md.series (series_key_id, symbol, source, bucket_end, event_time, available_at, "
    "availability_source, ingested_at, observed_at, provenance, src_label_raw, observer_id, "
    "observer_region, is_final, principal_id, value_raw) "
    "SELECT %(series)s, %(symbol)s, %(source)s, b, b, b, 'OBSERVED', b, b, 'OBSERVADO', "
    "'seed', 'test', 'unknown', TRUE, NULL, '1' "
    "FROM generate_series(%(first)s::bigint, %(last)s::bigint, %(step)s::bigint) AS b"
)


@pytest.fixture
def connection(postgres_database: PostgresDatabase) -> Iterator[psycopg.Connection]:
    """Yield a connection to the test database, with the `md.series` DDL applied."""
    with postgres_database.connect() as conn:
        ensure_schema(conn)
        yield conn


def _seed(
    conn: psycopg.Connection, *, series: str, source: str, first: int, count: int, step: int
) -> None:
    with conn.cursor() as cursor:
        cursor.execute(
            _SEED_SQL,
            {
                "series": series,
                "symbol": _SYMBOL,
                "source": source,
                "first": first,
                "last": first + (count - 1) * step,
                "step": step,
            },
        )
    conn.commit()


def _old_extent(conn: psycopg.Connection, series: str) -> tuple[int | None, int | None]:
    with conn.cursor() as cursor:
        cursor.execute(_OLD_EXTENT_SQL, (series, _SYMBOL))
        record = cursor.fetchone()
    assert record is not None
    return (record[0], record[1])


def _new_extent(conn: psycopg.Connection, series: str) -> tuple[int | None, int | None]:
    return PostgresSeriesWindowReader(conn).read_bounds(series_key_id=series, symbol=_SYMBOL)


def _seed_late_born(conn: psycopg.Connection) -> None:
    """>= 50,000 rows of another series fill chunk 1; the late series starts in chunk 2.

    The late series is as DENSE as the early one, like the production liquidation series: a
    sparse one makes the planner prefer aggregating its few primary-key rows, and the old
    statement then never shows the walk (measured: 0 rows removed with 100 late rows).
    """
    _seed(
        conn,
        series=_EARLY_SERIES,
        source="binance",
        first=_BASE_MS,
        count=_EARLY_ROWS,
        step=_EARLY_STEP_MS,
    )
    _seed(
        conn,
        series=_LATE_SERIES,
        source="binance",
        first=_BASE_MS + _CHUNK_MS,
        count=_EARLY_ROWS,
        step=_EARLY_STEP_MS,
    )
    with conn.cursor() as cursor:
        cursor.execute("ANALYZE md.series")
    conn.commit()


def test_empty_series_is_none_none_on_both_statements(connection: psycopg.Connection) -> None:
    """CALA: no row ⇒ `(None, None)`, exactly as the old aggregate answered."""
    assert _new_extent(connection, _LATE_SERIES) == _old_extent(connection, _LATE_SERIES)
    assert _new_extent(connection, _LATE_SERIES) == (None, None)


def test_single_chunk_series_matches_the_old_statement(connection: psycopg.Connection) -> None:
    """CALA: a series living in one chunk gets the same `(min, max)`."""
    _seed(
        connection,
        series=_LATE_SERIES,
        source="binance",
        first=_BASE_MS + 60_000,
        count=30,
        step=60_000,
    )
    expected = (_BASE_MS + 60_000, _BASE_MS + 30 * 60_000)
    assert _old_extent(connection, _LATE_SERIES) == expected
    assert _new_extent(connection, _LATE_SERIES) == expected


def test_late_born_series_matches_the_old_statement(connection: psycopg.Connection) -> None:
    """CALA: the series that starts in chunk 2, behind 50,000 rows of another, same answer."""
    _seed_late_born(connection)
    expected = (_BASE_MS + _CHUNK_MS, _BASE_MS + _CHUNK_MS + (_EARLY_ROWS - 1) * _EARLY_STEP_MS)
    assert _old_extent(connection, _LATE_SERIES) == expected
    assert _new_extent(connection, _LATE_SERIES) == expected
    assert _new_extent(connection, _EARLY_SERIES) == _old_extent(connection, _EARLY_SERIES)


def test_two_sources_with_different_minima_match_the_old_statement(
    connection: psycopg.Connection,
) -> None:
    """MORDE on a wrong rewrite: the minimum is over ALL sources, not the first one's.

    `binance` sorts first but starts LATER (chunk 2); `bybit` starts in chunk 1. A rewrite that
    kept only the first `DISTINCT ON` row would answer `binance`'s minimum and fail here.
    """
    _seed(
        connection,
        series=_LATE_SERIES,
        source="binance",
        first=_BASE_MS + _CHUNK_MS,
        count=10,
        step=60_000,
    )
    _seed(
        connection,
        series=_LATE_SERIES,
        source="bybit",
        first=_BASE_MS + 120_000,
        count=5,
        step=60_000,
    )
    expected = (_BASE_MS + 120_000, _BASE_MS + _CHUNK_MS + 9 * 60_000)
    assert _old_extent(connection, _LATE_SERIES) == expected
    assert _new_extent(connection, _LATE_SERIES) == expected


def test_another_symbol_of_the_same_series_never_widens_either_end(
    connection: psycopg.Connection,
) -> None:
    """MORDE on a lost `symbol` filter, in EITHER arm of the rewrite (QA of wave W8).

    The other seeds use one symbol, so dropping `symbol = %s` from the `DISTINCT ON` arm went
    unnoticed (measured: that mutation passed every extent test). Here `ETHUSDT`, under the same
    `series_key_id`, starts a chunk earlier AND ends later than `BTCUSDT`.
    """
    with connection.cursor() as cursor:
        cursor.execute(
            _SEED_SQL,
            {
                "series": _LATE_SERIES,
                "symbol": "ETHUSDT",
                "source": "binance",
                "first": _BASE_MS + 60_000,
                "last": _BASE_MS + 2 * _CHUNK_MS + 60_000,
                "step": _CHUNK_MS,
            },
        )
    connection.commit()
    _seed(
        connection,
        series=_LATE_SERIES,
        source="binance",
        first=_BASE_MS + _CHUNK_MS,
        count=10,
        step=60_000,
    )
    expected = (_BASE_MS + _CHUNK_MS, _BASE_MS + _CHUNK_MS + 9 * 60_000)
    assert _old_extent(connection, _LATE_SERIES) == expected
    assert _new_extent(connection, _LATE_SERIES) == expected


def _rows_removed_by_filter(node: dict[str, Any]) -> int:
    """Sum `Rows Removed by Filter` over a JSON plan node and all of its descendants."""
    own = int(node.get("Rows Removed by Filter", 0))
    return own + sum(_rows_removed_by_filter(child) for child in node.get("Plans", []))


def _explain_rows_removed(conn: psycopg.Connection, sql: str, params: tuple[str, ...]) -> int:
    with conn.cursor() as cursor:
        cursor.execute(f"EXPLAIN (ANALYZE, FORMAT JSON) {sql}", params)
        record = cursor.fetchone()
    assert record is not None
    document = record[0] if not isinstance(record[0], str) else json.loads(record[0])
    return _rows_removed_by_filter(document[0]["Plan"])


def test_new_extent_does_not_walk_the_other_series_and_the_old_one_does(
    connection: psycopg.Connection,
) -> None:
    """MORDE, plan: new < 1,000 rows removed by filter; ablation: the old statement >= 50,000."""
    _seed_late_born(connection)
    new_removed = _explain_rows_removed(
        connection, _SELECT_EXTENT_SQL, (_LATE_SERIES, _SYMBOL, _LATE_SERIES, _SYMBOL)
    )
    old_removed = _explain_rows_removed(connection, _OLD_EXTENT_SQL, (_LATE_SERIES, _SYMBOL))
    assert new_removed < 1_000, f"new extent removed {new_removed} rows by filter"
    assert old_removed >= _EARLY_ROWS, f"old extent removed only {old_removed} rows by filter"
