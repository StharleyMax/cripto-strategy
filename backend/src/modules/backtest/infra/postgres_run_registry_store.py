"""Postgres-backed `backtest.run_registry` — `ADR-021`/D1: Postgres, not `md.*`, not SQLite.

Schema and column types are `ADR-021`/D2, transcribed 1:1 into DDL. `ensure_schema()` is
idempotent (`CREATE SCHEMA IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`) rather than a
migration-framework step: this is the first table this backend writes to Postgres, and
`ADR-021` explicitly scopes "migracao SQL" as builder work, not a new tool to adopt.

This module is the ONLY place in `backtest` allowed to import `psycopg` — the import-linter
contract "O motor de armazenamento nao vaza para fora de infra (ADR-014/D1d)" makes that a
portao, not a convention, for `backtest.domain`/`backtest.use_cases`.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

import psycopg
from psycopg.rows import dict_row

from src.modules.backtest.domain.intrabar_convention import IntrabarConvention
from src.modules.backtest.domain.run_registry_entry import RunRegistryEntry

SCHEMA_SQL = """
CREATE SCHEMA IF NOT EXISTS backtest;

CREATE TABLE IF NOT EXISTS backtest.run_registry (
    run_id TEXT PRIMARY KEY,
    bundle_hash CHAR(64) NOT NULL,
    window_from_ms BIGINT NOT NULL,
    window_to_ms BIGINT NOT NULL,
    knowledge_time BIGINT NOT NULL,
    partitions_content_hash CHAR(64) NOT NULL,
    commit TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    intrabar_convention TEXT NOT NULL CHECK (intrabar_convention IN ('pessimistic_stop_first')),
    intrabar_decided_count INTEGER NOT NULL CHECK (intrabar_decided_count >= 0),
    principal_id TEXT NOT NULL,
    CHECK (window_from_ms <= window_to_ms)
);

CREATE INDEX IF NOT EXISTS run_registry_triple_idx
    ON backtest.run_registry (bundle_hash, window_from_ms, window_to_ms, knowledge_time);
"""

_SELECT_BY_TRIPLE_SQL = (
    "SELECT run_id, bundle_hash, window_from_ms, window_to_ms, knowledge_time, "
    "partitions_content_hash, commit, intrabar_convention, intrabar_decided_count, "
    "principal_id, created_at FROM backtest.run_registry "
    "WHERE bundle_hash = %s AND window_from_ms = %s AND window_to_ms = %s "
    "AND knowledge_time = %s ORDER BY created_at ASC LIMIT 1"
)

_SELECT_BY_RUN_ID_SQL = (
    "SELECT run_id, bundle_hash, window_from_ms, window_to_ms, knowledge_time, "
    "partitions_content_hash, commit, intrabar_convention, intrabar_decided_count, "
    "principal_id, created_at FROM backtest.run_registry WHERE run_id = %s"
)


@dataclass(frozen=True)
class StoredRunRegistryEntry:
    """A `run_registry` row as read back — `entry` plus the audit-only `created_at`.

    `created_at` is `int` epoch milliseconds, converted HERE from the `TIMESTAMPTZ` psycopg
    hands back: `domain`/`use_cases` never import `datetime` (contract "Natureza"), so this
    conversion belongs in `infra`, the one layer allowed to have read a clock's output.
    """

    entry: RunRegistryEntry
    created_at: int


def _row_to_entry(row: dict[str, object]) -> RunRegistryEntry:
    """Build a `RunRegistryEntry` from one `run_registry` row — pure, no I/O, easy to test."""
    return RunRegistryEntry(
        run_id=str(row["run_id"]),
        bundle_hash=str(row["bundle_hash"]),
        window_from_ms=int(row["window_from_ms"]),  # type: ignore[call-overload]
        window_to_ms=int(row["window_to_ms"]),  # type: ignore[call-overload]
        knowledge_time=int(row["knowledge_time"]),  # type: ignore[call-overload]
        partitions_content_hash=str(row["partitions_content_hash"]),
        commit=str(row["commit"]),
        intrabar_convention=IntrabarConvention(str(row["intrabar_convention"])),
        intrabar_decided_count=int(row["intrabar_decided_count"]),  # type: ignore[call-overload]
        principal_id=str(row["principal_id"]),
    )


def _row_created_at_ms(row: dict[str, object]) -> int:
    """Convert the `TIMESTAMPTZ` psycopg returns into epoch milliseconds."""
    created_at = row["created_at"]
    if not isinstance(created_at, datetime):
        raise TypeError(
            f"expected created_at to be a datetime (psycopg's TIMESTAMPTZ mapping), got "
            f"{type(created_at).__name__} — the row-factory contract changed underneath this"
        )
    return int(created_at.timestamp() * 1000)


class PostgresRunRegistryStore:
    """Reads and writes `backtest.run_registry` over one `psycopg.Connection`.

    The connection is INJECTED, never opened here: composition (which DSN, which pool) is the
    consumer's job (`ADR-009`/D6.6's same argument, one layer over) — this class only knows
    how to speak the table's SQL.
    """

    def __init__(self, connection: psycopg.Connection) -> None:
        """Wrap an already-open connection to the Postgres instance of `ADR-002`/D1."""
        self._connection = connection

    def ensure_schema(self) -> None:
        """Create the `backtest` schema and `run_registry` table if they do not exist yet."""
        with self._connection.cursor() as cursor:
            cursor.execute(SCHEMA_SQL)
        self._connection.commit()

    def find_by_triple(
        self, *, bundle_hash: str, window_from_ms: int, window_to_ms: int, knowledge_time: int
    ) -> RunRegistryEntry | None:
        """Return the row already on file for this exact triple, or `None` if there is none.

        `ORDER BY created_at ASC LIMIT 1`: under append-only storage every row on file for one
        triple is expected to carry the same `partitions_content_hash` (`ADR-021`/D4) — the
        first one recorded is as good a witness as any, and picking a fixed one makes the read
        deterministic rather than depending on the storage engine's row order.
        """
        with self._connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                _SELECT_BY_TRIPLE_SQL, (bundle_hash, window_from_ms, window_to_ms, knowledge_time)
            )
            row = cursor.fetchone()
        return None if row is None else _row_to_entry(row)

    def find_by_run_id(self, run_id: str) -> StoredRunRegistryEntry | None:
        """Return the one row for `run_id`, with its audit-only `created_at`, or `None`."""
        with self._connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(_SELECT_BY_RUN_ID_SQL, (run_id,))
            row = cursor.fetchone()
        if row is None:
            return None
        return StoredRunRegistryEntry(entry=_row_to_entry(row), created_at=_row_created_at_ms(row))

    def record(self, entry: RunRegistryEntry) -> None:
        """Insert `entry` as a new row, committed before returning."""
        query = (
            "INSERT INTO backtest.run_registry ("
            "run_id, bundle_hash, window_from_ms, window_to_ms, knowledge_time, "
            "partitions_content_hash, commit, intrabar_convention, intrabar_decided_count, "
            "principal_id"
            ") VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
        )
        with self._connection.cursor() as cursor:
            cursor.execute(
                query,
                (
                    entry.run_id,
                    entry.bundle_hash,
                    entry.window_from_ms,
                    entry.window_to_ms,
                    entry.knowledge_time,
                    entry.partitions_content_hash,
                    entry.commit,
                    entry.intrabar_convention.value,
                    entry.intrabar_decided_count,
                    entry.principal_id,
                ),
            )
        self._connection.commit()
