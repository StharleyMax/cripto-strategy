"""Durable `md.ingest_run` / `md.ingest_gap` in Postgres — the production engine (`ADR-031/D1`).

Same read/write surface as `SqliteIngestRecordStore` (`sqlite_ingest_record_store.py:176-271`):
`initialise()`, `record_run(IngestRun)`, `record_gap(IngestGap)`, `describe_readiness() ->
(bool, bool)`, `runs()`, `gaps()`. Neither `IngestRecordSource` (the read port,
`use_cases/ingest_health.py`) nor `ingest_health_query` know which of the two engines fed
them — `ADR-031/D1`'s whole point is that they never have to.

CONNECTION INJECTED, NEVER OPENED HERE — same shape as `PostgresRunRegistryStore`
(`backtest/infra/postgres_run_registry_store.py:104-114`, `ADR-021`). Composing a DSN into a
live connection is the composition root's job (`src.main`, `collectors_cli`), not this
adapter's; this class only knows how to speak the two tables' SQL.

RAW, NO COERCION — `ADR-031/D1`, literal: "os valores são gravados RAW, exatamente como
observados... nenhuma coerção no adaptador". `record_run`/`record_gap` bind every field
straight from the dataclass into the parameterised statement; `api_code: int | None` reaches
the database as `NULL` when it is `None`, never as a substituted `0` or any other sentinel.
The equivalence test this module exists for (`D2.6`) plants exactly that mutation to prove the
guard bites: coerce `None` to `0` here and the two engines' `fingerprint()` stop matching.

SCHEMA-QUALIFIED, NOT A NEW SCHEMA PER MODULE — `md` is the logical name `ADR-008/D3` already
uses for the projection; SQLite has no named schema and flattens it into the `md_ingest_run`
table prefix, and Postgres has schemas so `initialise()` uses the real one: `CREATE SCHEMA IF
NOT EXISTS md`, then `md.ingest_run` (16 columns, PK `run_id`) and `md.ingest_gap` (8 columns,
composite PK). Both statements are `IF NOT EXISTS` — `initialise()` is idempotent by
construction, safe to call on every process boot, same contract as the SQLite sibling.

UPSERT ON THE SAME KEY THE SQLite SIDE USES — `INSERT ... ON CONFLICT ... DO UPDATE` mirrors
`INSERT OR REPLACE` there: a collector that re-records the same `run_id` (or the same gap key)
overwrites rather than duplicates, on both engines alike. That symmetry is part of what the
equivalence test measures — divergent upsert semantics would make two "same" recordings
disagree on `n` before `fingerprint()` ever runs.

ORDER BY IS PART OF THE FINGERPRINT, same reasoning as the SQLite sibling's docstring: `ADR-
008/DoD-2` compares `sha256` of the canonical projection, and a projection whose row order
depends on engine internals would make two reads of the SAME state hash differently for no
real reason. Both `SELECT`s end on a key that cannot tie, and it is the SAME tie-break the
SQLite module uses — that is what makes the two engines' output byte-identical, not just
value-identical.

THIS MODULE IS THE ONLY PLACE IN `sentimento.infra` ALLOWED TO IMPORT `psycopg` FOR THE
RECORD — the import-linter contract "O motor de armazenamento nao vaza para fora de infra
(ADR-014/D1d)" (`backend/pyproject.toml`) forbids `psycopg` from `sentimento.domain` and
`sentimento.use_cases`; this file lives in `infra`, where the contract allows it.
"""

from __future__ import annotations

from typing import Any, cast

import psycopg

from src.modules.sentimento.domain.ingest_record import IngestGap, IngestRun

# THE DATABASE BOUNDARY IS UNTYPED BY NATURE — `psycopg` hands back `Any` per column, and no
# `--strict` fixes that by reading the driver. These two tuples are the shape `_SELECT_RUNS`/
# `_SELECT_GAPS` ASSERT the query produces, and the single `cast` per row (`runs`/`gaps` below)
# makes `mypy` check the ARITY and the ORDER against the dataclass constructor — same idiom as
# `sqlite_ingest_record_store.py:21-24`.
_RunRow = tuple[
    str, str, str, str, int, int, int, str, int | None, str, int, str, str, int, str, str
]
_GapRow = tuple[str, str, str, str, str, int, str, str]

_SCHEMA: Any = "md"
_RUN_TABLE: Any = "ingest_run"
_GAP_TABLE: Any = "ingest_gap"

_DDL: tuple[str, ...] = (
    "CREATE SCHEMA IF NOT EXISTS md",
    """
    CREATE TABLE IF NOT EXISTS md.ingest_run (
        run_id          TEXT PRIMARY KEY,
        source          TEXT NOT NULL,
        endpoint        TEXT NOT NULL,
        "window"        TEXT NOT NULL,
        n_expected      INTEGER NOT NULL,
        n_returned      INTEGER NOT NULL,
        n_written       INTEGER NOT NULL,
        verdict         TEXT NOT NULL,
        api_code        INTEGER,
        src_sha256      TEXT NOT NULL,
        weight_used     INTEGER NOT NULL,
        observer_id     TEXT NOT NULL,
        observer_region TEXT NOT NULL,
        clock_skew_ms   INTEGER NOT NULL,
        started_at      TEXT NOT NULL,
        ended_at        TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS md.ingest_gap (
        source        TEXT NOT NULL,
        symbol        TEXT NOT NULL,
        series_key_id TEXT NOT NULL,
        from_ts       TEXT NOT NULL,
        to_ts         TEXT NOT NULL,
        n_missing     INTEGER NOT NULL,
        gap_class     TEXT NOT NULL,
        detected_at   TEXT NOT NULL,
        PRIMARY KEY (source, symbol, series_key_id, from_ts, to_ts)
    )
    """,
)

_UPSERT_RUN = """
    INSERT INTO md.ingest_run
        (run_id, source, endpoint, "window", n_expected, n_returned, n_written, verdict,
         api_code, src_sha256, weight_used, observer_id, observer_region, clock_skew_ms,
         started_at, ended_at)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (run_id) DO UPDATE SET
        source = EXCLUDED.source,
        endpoint = EXCLUDED.endpoint,
        "window" = EXCLUDED."window",
        n_expected = EXCLUDED.n_expected,
        n_returned = EXCLUDED.n_returned,
        n_written = EXCLUDED.n_written,
        verdict = EXCLUDED.verdict,
        api_code = EXCLUDED.api_code,
        src_sha256 = EXCLUDED.src_sha256,
        weight_used = EXCLUDED.weight_used,
        observer_id = EXCLUDED.observer_id,
        observer_region = EXCLUDED.observer_region,
        clock_skew_ms = EXCLUDED.clock_skew_ms,
        started_at = EXCLUDED.started_at,
        ended_at = EXCLUDED.ended_at
"""

_UPSERT_GAP = """
    INSERT INTO md.ingest_gap
        (source, symbol, series_key_id, from_ts, to_ts, n_missing, gap_class, detected_at)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (source, symbol, series_key_id, from_ts, to_ts) DO UPDATE SET
        n_missing = EXCLUDED.n_missing,
        gap_class = EXCLUDED.gap_class,
        detected_at = EXCLUDED.detected_at
"""

# Same total order the SQLite sibling uses (`sqlite_ingest_record_store.py:142-152`) — both
# `SELECT`s end on a key that cannot tie, so a fingerprint comparison across engines is never
# an accident of row order.
_SELECT_RUNS = """
    SELECT run_id, source, endpoint, "window", n_expected, n_returned, n_written, verdict,
           api_code, src_sha256, weight_used, observer_id, observer_region, clock_skew_ms,
           started_at, ended_at
    FROM md.ingest_run ORDER BY started_at, run_id
"""

_SELECT_GAPS = """
    SELECT source, symbol, series_key_id, from_ts, to_ts, n_missing, gap_class, detected_at
    FROM md.ingest_gap ORDER BY detected_at, source, symbol, series_key_id, from_ts, to_ts
"""

_SELECT_SCHEMA_PRESENCE = "SELECT 1 FROM information_schema.schemata WHERE schema_name = %s"

_SELECT_TABLE_PRESENCE = (
    "SELECT 1 FROM information_schema.tables WHERE table_schema = %s AND table_name = %s"
)


class PostgresIngestRecordStore:
    """Reads and writes `md.ingest_run` / `md.ingest_gap` over one `psycopg.Connection`.

    Same shape and same guarantee as the SQLite sibling this replaces in production
    (`ADR-031/D1`): every recorded run and gap is COMMITTED before the call that wrote it
    returns, so a reader in another process — the API, `collector-status` — never observes a
    half-written row.
    """

    def __init__(self, connection: psycopg.Connection[Any]) -> None:
        """Wrap an already-open connection to the Postgres instance `ADR-031/D2` names."""
        self._connection = connection

    def initialise(self) -> None:
        """Create the `md` schema and both tables if they are absent — idempotent."""
        with self._connection.cursor() as cursor:
            for statement in _DDL:
                cursor.execute(statement)
        self._connection.commit()

    def record_run(self, run: IngestRun) -> None:
        """Persist one `md.ingest_run` row, RAW, and COMMIT before returning."""
        with self._connection.cursor() as cursor:
            cursor.execute(
                _UPSERT_RUN,
                (
                    run.run_id,
                    run.source,
                    run.endpoint,
                    run.window,
                    run.n_expected,
                    run.n_returned,
                    run.n_written,
                    run.verdict,
                    run.api_code,
                    run.src_sha256,
                    run.weight_used,
                    run.observer_id,
                    run.observer_region,
                    run.clock_skew_ms,
                    run.started_at,
                    run.ended_at,
                ),
            )
        self._connection.commit()

    def record_gap(self, gap: IngestGap) -> None:
        """Persist one `md.ingest_gap` row, RAW, and COMMIT before returning."""
        with self._connection.cursor() as cursor:
            cursor.execute(
                _UPSERT_GAP,
                (
                    gap.source,
                    gap.symbol,
                    gap.series_key_id,
                    gap.from_ts,
                    gap.to_ts,
                    gap.n_missing,
                    gap.gap_class,
                    gap.detected_at,
                ),
            )
        self._connection.commit()

    def describe_readiness(self) -> tuple[bool, bool]:
        """Return `(exists, schema_present)` — same two facts the SQLite sibling answers.

        `exists` mirrors "the file is there" for a schema-based engine: the `md` schema has
        been created at least once. `schema_present` requires BOTH tables to exist, because
        `initialise()` creates them together and a store with only one is exactly as half-born
        as a store with zero — same invariant as `sqlite_ingest_record_store.py:239-264`.
        """
        with self._connection.cursor() as cursor:
            cursor.execute(_SELECT_SCHEMA_PRESENCE, (_SCHEMA,))
            schema_exists = cursor.fetchone() is not None
        if not schema_exists:
            return False, False
        with self._connection.cursor() as cursor:
            cursor.execute(_SELECT_TABLE_PRESENCE, (_SCHEMA, _RUN_TABLE))
            run_present = cursor.fetchone() is not None
            cursor.execute(_SELECT_TABLE_PRESENCE, (_SCHEMA, _GAP_TABLE))
            gap_present = cursor.fetchone() is not None
        return True, run_present and gap_present

    def runs(self) -> tuple[IngestRun, ...]:
        """Return every persisted run, in a total and therefore reproducible order."""
        with self._connection.cursor() as cursor:
            cursor.execute(_SELECT_RUNS)
            rows = cursor.fetchall()
        return tuple(IngestRun(*cast(_RunRow, row)) for row in rows)

    def gaps(self) -> tuple[IngestGap, ...]:
        """Return every persisted gap, in a total and therefore reproducible order."""
        with self._connection.cursor() as cursor:
            cursor.execute(_SELECT_GAPS)
            rows = cursor.fetchall()
        return tuple(IngestGap(*cast(_GapRow, row)) for row in rows)
