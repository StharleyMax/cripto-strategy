"""Postgres-backed `md.series`: `PostgresSeriesSink` and `PostgresObservedLookup`.

Ports `SeriesSink`/`ObservedLookup` (`use_cases/write_series_row.py`), over the DDL
`quant-architect` fixed and verified against a real engine in
`docs/context/captura-em-producao/gates/F2-series-ddl.md` §2.

`ADR-031/F5`: `psycopg` may only be imported from `infra` — `lint-imports` enforces the
contract already declared for `sentimento.domain`/`sentimento.use_cases` in
`backend/pyproject.toml:337-338,342`. This module is the only place these two adapters live,
and neither opens the connection itself: composition (which DSN, which pool) is the caller's
job, the same precedent `backtest/infra/postgres_run_registry_store.py` already sets one layer
over.

`accept()` commits BEFORE returning — the "commit dentro de `write_series_row`" the task title
names. `use_cases/run_single_writer.py` only `ack`s the durable-queue entry AFTER
`write_series_row` returns, so the commit inside `accept` is what makes the row durable before
the `ack` — `D2.3`'s ordering, and the reason a `kill -9` between the two can never lose an
already-accepted row. `ON CONFLICT (...) DO NOTHING` on the declared key
(`gates/F2-series-ddl.md` §3) turns redelivery of the identical row into a no-op instead of a
duplicate: the redelivered payload carries the SAME `observed_at` (it travels in the message,
never regenerated here), so it collides on the primary key rather than appending a second row —
`D2.4`'s restart-without-duplicate property.
"""

from __future__ import annotations

import psycopg

from src.modules.sentimento.domain.provenance import Provenance, SeriesRow

# Transcribed 1:1 from `gates/F2-series-ddl.md` §2 — that gate file is the artifact the
# `quant-architect` signed and verified against a real `timescale/timescaledb:2.17.2-pg15`
# container; a line changed here without a matching gate edit would be DDL drift the gate's
# own falsifier (§8.1) cannot catch, because it only re-runs the SQL quoted THERE.
SCHEMA_SQL = """
CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE SCHEMA IF NOT EXISTS md;

CREATE TABLE IF NOT EXISTS md.series (
    series_key_id       TEXT   NOT NULL,
    symbol              TEXT   NOT NULL,
    source              TEXT   NOT NULL,
    bucket_end          BIGINT NOT NULL,
    event_time          BIGINT NOT NULL,
    available_at        BIGINT NOT NULL,
    availability_source TEXT   NOT NULL CHECK (availability_source IN ('OBSERVED', 'MODELED')),
    ingested_at         BIGINT NOT NULL,
    observed_at         BIGINT NOT NULL,
    provenance          TEXT   NOT NULL
                         CHECK (provenance IN ('OBSERVADO', 'DERIVADO', 'MODELADO', 'HUMANO')),
    src_label_raw       TEXT   NOT NULL,
    observer_id         TEXT   NOT NULL,
    observer_region     TEXT   NOT NULL,
    is_final            BOOLEAN,
    principal_id        TEXT,
    value_raw           TEXT   NOT NULL,
    CHECK (provenance <> 'HUMANO' OR (principal_id IS NOT NULL AND btrim(principal_id) <> '')),
    PRIMARY KEY (series_key_id, symbol, source, bucket_end, observed_at)
);

SELECT create_hypertable(
    'md.series', 'bucket_end',
    chunk_time_interval => 604800000,  -- 7 days, ms; rationale/risk in gates/F2-series-ddl.md §5.1
    if_not_exists => TRUE
);
"""

_INSERT_SQL = (
    "INSERT INTO md.series ("
    "series_key_id, symbol, source, bucket_end, event_time, available_at, "
    "availability_source, ingested_at, observed_at, provenance, src_label_raw, "
    "observer_id, observer_region, is_final, principal_id, value_raw"
    ") VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) "
    "ON CONFLICT (series_key_id, symbol, source, bucket_end, observed_at) DO NOTHING"
)

_OBSERVED_ALREADY_PRESENT_SQL = (
    "SELECT 1 FROM md.series WHERE series_key_id = %s AND symbol = %s AND source = %s "
    "AND bucket_end = %s AND provenance = %s LIMIT 1"
)


def ensure_schema(connection: psycopg.Connection) -> None:
    """Create the `timescaledb` extension, the `md` schema and `md.series` if not there yet.

    Idempotent (`CREATE ... IF NOT EXISTS`, `create_hypertable(..., if_not_exists => TRUE)`),
    not a migration-framework step — the same choice `postgres_run_registry_store.ensure_schema`
    already made for `backtest.run_registry`, and for the same reason: this is DDL, run once per
    fresh database, not a schema that changes shape release over release.
    """
    with connection.cursor() as cursor:
        cursor.execute(SCHEMA_SQL)
    connection.commit()


class PostgresObservedLookup:
    """`ObservedLookup` over `md.series`: whether an `OBSERVADO` row already claimed this bucket.

    Keyed on `(series_key_id, symbol, source, bucket_end)` — never `observed_at` — exactly the
    question `use_cases/write_series_row.ObservedLookup` docstring names: "does the BUCKET
    already have a live capture", not "does this exact observation instant already exist".
    """

    def __init__(self, connection: psycopg.Connection) -> None:
        """Wrap an already-open connection; composition decides the DSN, not this class."""
        self._connection = connection

    def observed_already_present(self, row: SeriesRow) -> bool:
        """Read-only: `True` iff an `OBSERVADO` row already exists for `row`'s bucket."""
        with self._connection.cursor() as cursor:
            cursor.execute(
                _OBSERVED_ALREADY_PRESENT_SQL,
                (
                    row.series_key_id,
                    row.symbol,
                    row.source,
                    row.bucket_end,
                    Provenance.OBSERVED.value,
                ),
            )
            return cursor.fetchone() is not None


class PostgresSeriesSink:
    """`SeriesSink` over `md.series`.

    `accept` is reached only for a row `write_series_row` has already cleared against
    `ObservedLookup` (`ADR-002/D5`: the predicate lives in the use case, never here — this sink
    never re-checks it, never rejects on its own).

    The connection is INJECTED, never opened here: composition (which DSN, the ephemeral
    TimescaleDB container of `F2`, or the compose service of `F3`) is the caller's job.
    """

    def __init__(self, connection: psycopg.Connection) -> None:
        """Wrap an already-open connection to the Postgres of `ADR-031/D2`."""
        self._connection = connection

    def accept(self, row: SeriesRow) -> None:
        """Insert `row`, committed BEFORE returning — upsert-noop on identical redelivery.

        See the module docstring for why the commit lives here rather than being deferred to
        the caller: it is what makes `D2.4` ("restart sem perda nem duplicata") true even when
        the process is killed between this return and the queue's `ack`.
        """
        with self._connection.cursor() as cursor:
            cursor.execute(
                _INSERT_SQL,
                (
                    row.series_key_id,
                    row.symbol,
                    row.source,
                    row.bucket_end,
                    row.event_time,
                    row.available_at,
                    row.availability_source.value,
                    row.ingested_at,
                    row.observed_at,
                    row.provenance.value,
                    row.src_label_raw,
                    row.observer_id,
                    row.observer_region,
                    row.is_final,
                    row.principal_id,
                    row.value_raw,
                ),
            )
        self._connection.commit()
