"""Durable `md.partition_registry` in SQLite: one commit per row, reread after a kill."""

# SAME ENGINE CHOICE AS `md.ingest_run`/`md.ingest_gap` (`sqlite_ingest_record_store.py`), and
# for the SAME reason, not a new one: `D6c` puts `md.partition_registry` in "o mesmo schema
# (`md`), mesmo schema de `md.ingest_run`/`md.ingest_gap`" — same catalog family, same dona
# (`sentimento`, the single writer). `ADR-014/D1` keeps that family on SQLite until one of ITS
# three named triggers fires (`ADR-014/D1e`) — `G-A` (a Postgres dependency enters
# `backend/pyproject.toml`), `G-B` (a second process reads the record), `G-C` (already fired by
# `T-08.1`, but `D1f` is explicit that `T-08.1` does not decide `D1` — see that ADR). None of
# the three is this task's to resolve, and introducing `psycopg`/`sqlalchemy` here to reach the
# `postgres:15` instance `ADR-002/D4` names would BE `G-A` — a bigger architectural event than
# "implement one phase", owned by "quem abrir a PR que a introduz" (`ADR-014/D1e`), not by
# `T-08.3`. `docs/spike/T-08.1-motor-armazenamento/verify_compaction_epoch.py` is where the
# REAL TimescaleDB `compress_chunk` falsifier (`FA-3b`) lives instead — a standalone script, the
# same shape as the spike's own `verify_timescale.py`, run by hand and never by
# `backend/scripts/test.sh` (`ZERO REDE`).
#
# SQLite HAS NO NAMED SCHEMA (same note as the sibling store): `md.partition_registry` becomes
# the table `md_partition_registry`.
#
# CONCURRENCY (`D6c`: "o escritor único serializa `(escrever, compactar)` por partição com lock
# consultivo — nunca uma `compress_chunk` roda enquanto um write ... está em voo").
#
# ⚠️ ERRATUM: an earlier version of this comment claimed SQLite's own file lock was
# "sufficient" for this. It was not, and `tests/sentimento/
# test_partition_registry_concurrency.py::
# test_concurrent_write_racing_a_compaction_silently_reverts_the_epoch_increment` is the
# falsifier that caught it — MEASURED, not argued: a `get` (own connection, own transaction)
# followed later by an `upsert` (a SECOND connection, a SECOND transaction) leaves the WHOLE
# read-decide-write SEQUENCE unprotected even though each half is individually atomic. Forcing
# a compaction's `get` and a concurrent write's `get` to both observe the SAME pre-compaction
# state, then letting both `upsert`, reproduces exactly the silent revert `D6c` exists to
# forbid: the persisted `compaction_epoch` came back as if the compaction had a `row_count` of
# `1`, not the `2` the concurrent write actually landed — one operation clobbered the other,
# with no exception and no retry.
#
# THE FIX is `read_modify_write` below: ONE connection, ONE transaction, opened with `BEGIN
# IMMEDIATE` — which acquires SQLite's RESERVED lock BEFORE the read, not after the write. A
# second caller's `BEGIN IMMEDIATE` for the same database file BLOCKS (retried under
# `sqlite3.connect`'s `timeout=`, which sets `sqlite3_busy_timeout`) until the first
# transaction commits or rolls back — so the read the second caller performs is never stale
# with respect to a compaction that is still "in voo". `use_cases/
# maintain_partition_registry.py` calls this instead of separate `get`/`upsert`.
#
# `get`/`upsert` below are KEPT, unchanged, for callers that only need one half in isolation
# (`backtest`/`T-08.4`'s read-only consumption per `D6c`'s fronteira never mutates a row, so it
# has no read-decide-write sequence to protect). A real Postgres adapter, when `G-A` fires,
# gets the SAME property from `SELECT ... FOR UPDATE` inside one transaction, or
# `pg_advisory_xact_lock` keyed by `PartitionIdentity` — the SQL-level mechanism differs, the
# invariant (`get`-then-`upsert` is ONE unit, never two) does not.

from __future__ import annotations

import logging
import sqlite3
from collections.abc import Callable
from contextlib import closing
from pathlib import Path
from typing import Final, cast

from src.modules.sentimento.domain.partition_registry import (
    PartitionIdentity,
    PartitionRegistryEntry,
)

logger = logging.getLogger(__name__)

# `sqlite3.connect`'s default `timeout` is 5.0s — the same window
# `test_partition_registry_concurrency.py` budgets for its own thread joins. `read_modify_write`
# below uses a longer one: a real deployment may hold the transaction open across a slower
# `compute_content_hash` over a larger partition than any fixture exercises, and a caller that
# gives up after 5s under real contention would surface `sqlite3.OperationalError: database is
# locked` as if it were corruption, when it is only a queue.
_READ_MODIFY_WRITE_TIMEOUT_SECONDS: Final[float] = 30.0

# THE DATABASE BOUNDARY IS UNTYPED BY NATURE (same reasoning as `_RunRow`/`_GapRow` in the
# sibling store): `sqlite3` hands back `Any`, and this tuple is the shape this module ASSERTS
# the `SELECT` just underneath produces, checked by `mypy` on ARITY and ORDER via the single
# `cast` per row.
_EntryRow = tuple[str, str, str, str, int, str, int, int, int | None, int]

_TABLE: Final[str] = "md_partition_registry"

_SELECT_TABLE_PRESENCE: Final[str] = "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"

_DDL: Final[str] = """
CREATE TABLE IF NOT EXISTS md_partition_registry (
    series_key_id     TEXT NOT NULL,
    symbol            TEXT NOT NULL,
    source            TEXT NOT NULL,
    partition_key     TEXT NOT NULL,
    compaction_epoch  INTEGER NOT NULL,
    content_hash      TEXT NOT NULL,
    row_count         INTEGER NOT NULL,
    last_written_at   INTEGER NOT NULL,
    last_compacted_at INTEGER,
    updated_at        INTEGER NOT NULL,
    PRIMARY KEY (series_key_id, symbol, source, partition_key)
)
"""

_UPSERT: Final[str] = (
    "INSERT OR REPLACE INTO md_partition_registry "
    "(series_key_id, symbol, source, partition_key, compaction_epoch, content_hash, "
    " row_count, last_written_at, last_compacted_at, updated_at) "
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
)

_SELECT_ONE: Final[str] = (
    "SELECT series_key_id, symbol, source, partition_key, compaction_epoch, content_hash, "
    "       row_count, last_written_at, last_compacted_at, updated_at "
    "FROM md_partition_registry "
    "WHERE series_key_id = ? AND symbol = ? AND source = ? AND partition_key = ?"
)

# TOTAL ORDER, same discipline as `_SELECT_RUNS`/`_SELECT_GAPS` in the sibling store: the four
# identity columns are a full key, so `ORDER BY` on them can never tie.
_SELECT_ALL: Final[str] = (
    "SELECT series_key_id, symbol, source, partition_key, compaction_epoch, content_hash, "
    "       row_count, last_written_at, last_compacted_at, updated_at "
    "FROM md_partition_registry "
    "ORDER BY series_key_id, symbol, source, partition_key"
)


def _row_to_entry(row: _EntryRow) -> PartitionRegistryEntry:
    """Reassemble one fetched row into the domain shape — the inverse of `_entry_to_params`."""
    (
        series_key_id,
        symbol,
        source,
        partition_key,
        compaction_epoch,
        content_hash,
        row_count,
        last_written_at,
        last_compacted_at,
        updated_at,
    ) = row
    return PartitionRegistryEntry(
        identity=PartitionIdentity(
            series_key_id=series_key_id, symbol=symbol, source=source, partition_key=partition_key
        ),
        compaction_epoch=compaction_epoch,
        content_hash=content_hash,
        row_count=row_count,
        last_written_at=last_written_at,
        last_compacted_at=last_compacted_at,
        updated_at=updated_at,
    )


class SqlitePartitionRegistryStore:
    """Persisted `md.partition_registry` — one connection per call.

    Same durability shape as `SqliteIngestRecordStore`: a `SIGKILL` in the middle of a write
    leaves every COMMITTED row readable by a process that never shared memory with the dead
    one, and never leaves this object holding a handle whose state nobody can reason about.
    """

    def __init__(self, path: Path) -> None:
        """Bind the store to `path`; nothing is created or read until a method is called."""
        self._path = path

    @property
    def path(self) -> Path:
        """Return the database file this store reads and writes."""
        return self._path

    def initialise(self) -> None:
        """Create the table if absent — idempotent, safe to call on every run."""
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self._path)) as connection:
            connection.execute(_DDL)
            connection.commit()

    def upsert(self, entry: PartitionRegistryEntry) -> None:
        """Persist one `md.partition_registry` row and COMMIT before returning."""
        identity = entry.identity
        with closing(sqlite3.connect(self._path)) as connection:
            connection.execute(
                _UPSERT,
                (
                    identity.series_key_id,
                    identity.symbol,
                    identity.source,
                    identity.partition_key,
                    entry.compaction_epoch,
                    entry.content_hash,
                    entry.row_count,
                    entry.last_written_at,
                    entry.last_compacted_at,
                    entry.updated_at,
                ),
            )
            connection.commit()
        logger.debug(
            "partition_registry_entry_persisted",
            extra={
                "series_key_id": identity.series_key_id,
                "symbol": identity.symbol,
                "source": identity.source,
                "partition_key": identity.partition_key,
                "compaction_epoch": entry.compaction_epoch,
            },
        )

    def get(self, identity: PartitionIdentity) -> PartitionRegistryEntry | None:
        """Return the current entry for `identity`, or `None` if it has never been written.

        `None` is the ONLY absence this method returns — a corrupted store propagates its own
        `sqlite3.DatabaseError` rather than being folded into the same `None` (`core.silent-
        except` is blocking here, same reasoning as `_fetch` in the sibling store).
        """
        if not self._path.exists():
            return None
        with closing(sqlite3.connect(self._path)) as connection:
            if connection.execute(_SELECT_TABLE_PRESENCE, (_TABLE,)).fetchone() is None:
                return None
            row = connection.execute(
                _SELECT_ONE,
                (identity.series_key_id, identity.symbol, identity.source, identity.partition_key),
            ).fetchone()
        if row is None:
            return None
        return _row_to_entry(cast(_EntryRow, tuple(row)))

    def read_modify_write(
        self,
        identity: PartitionIdentity,
        mutate: Callable[[PartitionRegistryEntry | None], PartitionRegistryEntry],
    ) -> PartitionRegistryEntry:
        """Read the current entry (or `None`) and persist `mutate`'s result, as ONE transaction.

        `BEGIN IMMEDIATE` acquires SQLite's write lock BEFORE the `SELECT`, not after the
        `INSERT OR REPLACE` — a concurrent caller's own `BEGIN IMMEDIATE` for this same file
        blocks (via `sqlite3.connect`'s `timeout=`) until this transaction commits or rolls
        back. That is what makes the read `mutate` sees never stale with respect to another
        writer's in-flight compaction or write — the property the module comment above names
        as the fix for the race `test_partition_registry_concurrency.py` measured.

        `mutate` runs INSIDE the transaction; if it raises, the transaction rolls back and the
        exception propagates — no partial state is ever visible to another reader.
        """
        connection = sqlite3.connect(self._path, timeout=_READ_MODIFY_WRITE_TIMEOUT_SECONDS)
        try:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                _SELECT_ONE,
                (identity.series_key_id, identity.symbol, identity.source, identity.partition_key),
            ).fetchone()
            current = _row_to_entry(cast(_EntryRow, tuple(row))) if row is not None else None
            new_entry = mutate(current)
            new_identity = new_entry.identity
            connection.execute(
                _UPSERT,
                (
                    new_identity.series_key_id,
                    new_identity.symbol,
                    new_identity.source,
                    new_identity.partition_key,
                    new_entry.compaction_epoch,
                    new_entry.content_hash,
                    new_entry.row_count,
                    new_entry.last_written_at,
                    new_entry.last_compacted_at,
                    new_entry.updated_at,
                ),
            )
            connection.commit()
        except BaseException:
            connection.rollback()
            raise
        finally:
            connection.close()
        logger.debug(
            "partition_registry_entry_persisted",
            extra={
                "series_key_id": new_identity.series_key_id,
                "symbol": new_identity.symbol,
                "source": new_identity.source,
                "partition_key": new_identity.partition_key,
                "compaction_epoch": new_entry.compaction_epoch,
            },
        )
        return new_entry

    def all(self) -> tuple[PartitionRegistryEntry, ...]:
        """Return every persisted entry, in a total and therefore reproducible order."""
        if not self._path.exists():
            return ()
        with closing(sqlite3.connect(self._path)) as connection:
            if connection.execute(_SELECT_TABLE_PRESENCE, (_TABLE,)).fetchone() is None:
                return ()
            rows = connection.execute(_SELECT_ALL).fetchall()
        return tuple(_row_to_entry(cast(_EntryRow, tuple(row))) for row in rows)
