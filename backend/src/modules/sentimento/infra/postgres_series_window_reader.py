"""`PostgresSeriesWindowReader`: the window `SELECT` `md.series` never had (`ADR-034/D9`, item 1).

`postgres_series_sink.py` is write-only — no `SELECT` over a window exists anywhere in this
tree before this module (`ADR-034/D9`, measured: "`postgres_series_sink.py` e write-only,
nenhum `SELECT` de janela"). `as_of()` (`domain/as_of_accessor.py`) is a PURE function over
already-loaded `Observation`s; this class is the one piece of `infra` that loads them, so the
use case (`use_cases/series_history.py`) never sees `psycopg` (`ADR-031/F5`: the engine only
imports from `infra`).

`psycopg` may only be imported from `infra` — same `import-linter` contract
`postgres_series_sink.py` already cites (`backend/pyproject.toml`, "O motor de armazenamento nao
vaza para fora de infra"). The connection is INJECTED, never opened here — composition (which
DSN) is the caller's job, the same precedent `PostgresSeriesSink.__init__` sets.
"""

from __future__ import annotations

from decimal import Decimal
from typing import cast

import psycopg

from src.modules.sentimento.domain.as_of_accessor import Observation
from src.modules.sentimento.domain.provenance import AvailabilitySource, Provenance, SeriesRow

# The `psycopg` record shape `_SELECT_WINDOW_SQL` returns, by POSITION — same `cast` idiom
# `postgres_ingest_record_store.py`'s `_RunRow`/`_GapRow` already use to turn an untyped
# `fetchall()` row back into a typed tuple mypy can unpack.
_SeriesRowRecord = tuple[
    str, str, str, int, int, int, str, int, int, str, str, str, str, bool | None, str | None, str
]

# One row of `md.series`, in the exact column order `postgres_series_sink.SCHEMA_SQL` declares —
# transcribed here rather than imported, because a `SELECT *` would silently reorder the moment
# a column is added, and this list is what turns a `psycopg` row tuple back into a `SeriesRow`
# by POSITION.
_SELECT_WINDOW_SQL = (
    "SELECT series_key_id, symbol, source, bucket_end, event_time, available_at, "
    "availability_source, ingested_at, observed_at, provenance, src_label_raw, "
    "observer_id, observer_region, is_final, principal_id, value_raw "
    "FROM md.series "
    "WHERE series_key_id = %s AND symbol = %s AND bucket_end >= %s AND bucket_end <= %s"
)

# `T-03.6`, `D8`/`D-C3.7`: our own store's WHOLE extent for one series — never bounded by a
# request window (`_SELECT_WINDOW_SQL` above answers a different question). `MIN`/`MAX` over an
# empty match both come back `NULL`, which `psycopg` hands back as `None` — the honest "the
# store holds nothing for this series yet" answer, not a sentinel this module has to invent.
#
# `T-06.3` (`handoff/T-06.3-desenho.md` §1.2): the earliest end is NOT a plain `MIN(bucket_end)`.
# The planner rewrites that `MIN` as `LIMIT 1` over `series_bucket_end_idx (bucket_end DESC)` with
# `series_key_id`/`symbol` as a FILTER outside the index, so a series that started late walks
# every row of every other series from the oldest chunk forward before it finds its first one —
# measured on the local stack, 2026-10-02: 946 ms, 3,846,460 rows removed by filter, 1,167,369
# shared buffers for the long-liquidation series. The primary key `(series_key_id, symbol,
# source, bucket_end, observed_at)` already orders `bucket_end` INSIDE each `source`, so the
# first `bucket_end` per `source` (`DISTINCT ON (source) ... ORDER BY source, bucket_end`) is a
# TimescaleDB SkipScan on that key, per chunk: 1.08 ms, 109 rows removed, 186 buffers, no index
# added. The minimum of those per-source minima IS the series' minimum, so the answer is the
# same by construction (and measured equal on all 10 BTCUSDT series of the screen).
# The `MAX` stays a plain aggregate on purpose: `DISTINCT ON ... DESC` does not get a SkipScan
# and measured 850-1,060 ms (`T-06.3-desenho.md` §1.2). Declared risk: that `MAX` degrades in
# mirror image for a DEAD series (one that stopped writing many chunks ago); none of the 10 is.
_SELECT_EXTENT_SQL = (
    "SELECT "
    "(SELECT MIN(first_bucket_end) FROM ("
    "SELECT DISTINCT ON (source) bucket_end AS first_bucket_end FROM md.series "
    "WHERE series_key_id = %s AND symbol = %s ORDER BY source, bucket_end"
    ") AS first_per_source), "
    "(SELECT MAX(bucket_end) FROM md.series WHERE series_key_id = %s AND symbol = %s)"
)


class InvalidLookbackError(Exception):
    """`lookback_ms` is negative, and refuses rather than silently narrowing the window.

    A negative value could never satisfy `ADR-034/D9`'s own invariant (`lookback_ms >=
    max(bucket_interval_ms, asof_max_staleness_ms)`, both non-negative), so it is refused here
    instead of being handed to Postgres as a nonsensical lower bound.
    """


def _row_from_record(record: object) -> SeriesRow:
    """Build a `SeriesRow` from one `psycopg` record, by KEYWORD — never by attribute read.

    Keyword construction is what keeps this function out of `test_as_of_is_the_single_reader.py`'s
    `DECLARED_TOUCHERS` scan (the same shape `series_row_wire.decode()` already uses): the scan
    looks for `ast.Attribute` reads of `observed_at`/`available_at`/`bucket_end`, and a keyword
    argument is neither.
    """
    (
        series_key_id,
        symbol,
        source,
        bucket_end,
        event_time,
        available_at,
        availability_source,
        ingested_at,
        observed_at,
        provenance,
        src_label_raw,
        observer_id,
        observer_region,
        is_final,
        principal_id,
        value_raw,
    ) = cast(_SeriesRowRecord, record)
    return SeriesRow(
        series_key_id=series_key_id,
        symbol=symbol,
        source=source,
        bucket_end=bucket_end,
        event_time=event_time,
        available_at=available_at,
        availability_source=AvailabilitySource(availability_source),
        ingested_at=ingested_at,
        observed_at=observed_at,
        provenance=Provenance(provenance),
        src_label_raw=src_label_raw,
        observer_id=observer_id,
        observer_region=observer_region,
        is_final=is_final,
        value_raw=value_raw,
        principal_id=principal_id,
    )


class PostgresSeriesWindowReader:
    """The leitor de janela of `ADR-034/D9`, item 1: one `SELECT` over `md.series`.

    `read_window` returns `Observation`s (`domain/as_of_accessor.py`) — value already decoded to
    `Decimal(value_raw)` (`ADR-034/D7`: raw string, `Decimal` at the consumer, never `float`) —
    ready to hand to `as_of()` unmodified, so `use_cases/series_history.py` never touches
    `psycopg` or a raw record tuple.
    """

    def __init__(self, connection: psycopg.Connection) -> None:
        """Wrap an already-open connection to the Postgres of `ADR-031/D2`."""
        self._connection = connection

    def read_window(
        self,
        *,
        series_key_id: str,
        symbol: str,
        window_start_ms: int,
        window_end_ms: int,
        lookback_ms: int,
    ) -> tuple[Observation, ...]:
        """Return every observation with `bucket_end` in `[window_start - lookback, window_end]`.

        `lookback_ms` must already be `>= max(bucket_interval_ms, asof_max_staleness_ms)`
        (`ADR-034/D9`) — the CALLER's responsibility (`use_cases/series_history.py` computes it
        as exactly that `max`, so the invariant holds by construction); this method only refuses
        a negative value, which could never satisfy it.
        """
        if lookback_ms < 0:
            raise InvalidLookbackError(
                f"lookback_ms = {lookback_ms} is negative: `ADR-034/D9` requires it >= "
                f"max(bucket_interval_ms, asof_max_staleness_ms), which is never negative"
            )
        lower_bound = window_start_ms - lookback_ms
        with self._connection.cursor() as cursor:
            cursor.execute(
                _SELECT_WINDOW_SQL,
                (series_key_id, symbol, lower_bound, window_end_ms),
            )
            records = cursor.fetchall()
        rows = (_row_from_record(record) for record in records)
        return tuple(Observation(row=row, value=Decimal(row.value_raw)) for row in rows)

    def read_bounds(self, *, series_key_id: str, symbol: str) -> tuple[int | None, int | None]:
        """Return `(MIN(bucket_end), MAX(bucket_end))` for this series — `None`/`None` if empty.

        `T-03.6`, `D8`/`D-C3.7`: this is `SeriesStoreBoundsReader`'s adapter, over the SAME
        injected connection `read_window` above uses — no second connection opened for it. It
        aggregates over the WHOLE table for `(series_key_id, symbol)`, deliberately unbounded by
        any window: `use_cases/series_history.py` needs the store's own extent, not a slice of
        it, to tell `beyond-coverage` apart from `not-loaded`.
        """
        with self._connection.cursor() as cursor:
            cursor.execute(_SELECT_EXTENT_SQL, (series_key_id, symbol, series_key_id, symbol))
            record = cursor.fetchone()
        if record is None:
            return (None, None)
        earliest, latest = cast("tuple[int | None, int | None]", record)
        return (earliest, latest)
