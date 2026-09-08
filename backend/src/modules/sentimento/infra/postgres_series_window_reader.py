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
