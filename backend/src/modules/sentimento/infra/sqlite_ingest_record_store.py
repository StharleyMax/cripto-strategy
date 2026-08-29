"""Durable `md.ingest_run` / `md.ingest_gap` in SQLite: one commit per row, reread after a kill."""

from __future__ import annotations

import logging
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Final, cast

from src.modules.sentimento.domain.ingest_record import IngestGap, IngestRun

logger = logging.getLogger(__name__)

# THE DATABASE BOUNDARY IS UNTYPED BY NATURE — `sqlite3` hands back `Any`, and no `--strict`
# fixes that by reading the driver. The two tuples below are the shape this module ASSERTS the
# `SELECT` just underneath produces, and the single `cast` per row makes `mypy` check the
# ARITY and the order against the dataclass constructor. Twenty-four per-field casts would do
# the same job worse: each would be a separate assertion and none of them would count the
# columns. If the `SELECT` changes shape without these tuples changing, `mypy` fails.
_RunRow = tuple[
    str, str, str, str, int, int, int, str, int | None, str, int, str, str, int, str, str
]
_GapRow = tuple[str, str, str, str, str, int, str, str]

# ── THE ENGINE IS SQLite AND `ADR-002/D1` SAYS PostgreSQL — the divergence goes IN WRITING ─
#
# `ADR-002/D1` puts `md.ingest_run` and `md.ingest_gap` on the PostgreSQL "que ja esta de pe",
# and that ADR belongs to F4, carries status `proposto`, and its engine finalist is PENDING A
# SPIKE (`D4`). This repository TODAY declares `dependencies = []` in `backend/pyproject.toml`
# and the suite is offline by construction (`backend/scripts/test.sh`, "ZERO REDE"): there is
# no Postgres driver, no daemon, and `Q2` is not a requirement of this phase — plan 02 exists
# separately from 03 precisely because F0 does not depend on a host.
#
# What this module picks is the ADAPTER, not the decision: the engine is `ADR-002`'s to decide.
# THE QUESTION ("does F0 persist in SQLite until the spike of `ADR-002/D4`, or wait for
# Postgres?") is OPEN and addressed to the `quant-architect`; it was not answered here.
#
# ⚠️ AND THE COST OF SWAPPING IS NOT SYMMETRIC — the `/review` of 2026-08-29 measured it and
# the earlier claim of "one file" was wrong. `[MEDIDO 2026-08-29:
# `grep -rln "sqlite3\|SqliteIngestRecordStore" backend/src/` -> 2 arquivos]`: this module and
# `infra/ingest_health_cli.py`, which names the concrete store because it is the composition
# root and composing is its job.
#
# The asymmetry that decides whether the swap is really cheap: only the READ path has a port
# (`IngestRecordSource`, in `use_cases/ingest_health.py`). `initialise`, `record_run` and
# `record_gap` have NO port at all — a second engine would have to be introduced against the
# concrete class. That is deliberate for now (there is no production writer yet, and a port
# with no implementor is ceremony) and it has an owner: `T-03.8`, the first task that persists
# through `ingest_run` in production. It is written here so that whoever swaps the engine
# discovers it from the code and not from the compiler.
#
# SQLite HAS NO NAMED SCHEMA, so `md.ingest_run` becomes the table `md_ingest_run`. The point
# of the logical name survives in the prefix, and the projection the two consumers compare
# names no table at all — it names the 15 columns of `ADR-008/D3`.

# The table names are constants because the READ GUARD asks `sqlite_master` for them by name:
# a typo here would make the guard answer "no such table" forever and the record would report
# zero runs over a store full of them. They are referenced by `_fetch`, and
# `test_ingest_record_crash_borders.py` pins both directions.
_RUN_TABLE: Final[str] = "md_ingest_run"
_GAP_TABLE: Final[str] = "md_ingest_gap"

_SELECT_TABLE_PRESENCE: Final[str] = "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"

_DDL: Final[tuple[str, ...]] = (
    """
    CREATE TABLE IF NOT EXISTS md_ingest_run (
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
    CREATE TABLE IF NOT EXISTS md_ingest_gap (
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

_INSERT_RUN: Final[str] = (
    "INSERT OR REPLACE INTO md_ingest_run "
    '(run_id, source, endpoint, "window", n_expected, n_returned, n_written, verdict, '
    " api_code, src_sha256, weight_used, observer_id, observer_region, clock_skew_ms, "
    " started_at, ended_at) "
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
)

_INSERT_GAP: Final[str] = (
    "INSERT OR REPLACE INTO md_ingest_gap "
    "(source, symbol, series_key_id, from_ts, to_ts, n_missing, gap_class, detected_at) "
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
)

# A ORDENACAO E PARTE DA IMPRESSAO DIGITAL. `ADR-008/DoD-2` compara `sha256` de projecoes, e
# two reads of the SAME state coming back in different orders would give different hashes with
# nothing actually wrong — the falsifier would turn into noise. That is why the `ORDER BY` is
# TOTAL: it ends on a UNIQUE key in each table, never on a field that can tie. Both tie-breaks
# are pinned by `test_ingest_health_contract_guards.py`, which the `/qa` wrote after measuring
# that dropping either one changed no verdict.
_SELECT_RUNS: Final[str] = (
    'SELECT run_id, source, endpoint, "window", n_expected, n_returned, n_written, verdict, '
    "       api_code, src_sha256, weight_used, observer_id, observer_region, clock_skew_ms, "
    "       started_at, ended_at "
    "FROM md_ingest_run ORDER BY started_at, run_id"
)

_SELECT_GAPS: Final[str] = (
    "SELECT source, symbol, series_key_id, from_ts, to_ts, n_missing, gap_class, detected_at "
    "FROM md_ingest_gap ORDER BY detected_at, source, symbol, series_key_id, from_ts, to_ts"
)


class SqliteIngestRecordStore:
    """Persisted record — never a log — read back by `ingest_health_query`.

    WHAT `D2.9` MEASURES HERE, AND IT IS MEASURED AND NOT ASSERTED IN PROSE: a `SIGKILL` in
    the middle of a recording run leaves every COMMITTED row readable by a process that never
    shared memory with the dead one (`tests/sentimento/test_ingest_record_durability.py`).
    The falsifier lives in the same file: swapping this store for an in-memory one makes the
    restart come back EMPTY.

    WHAT IT DOES NOT MEASURE, said out loud for the same reason `JsonlCheckpoint` says it:
    POWER LOSS. `SIGKILL` kills the process and the kernel survives, so a committed page in
    the page cache survives with it. What buys survival across a power cut is SQLite's default
    `synchronous=FULL` on the rollback journal, and that is `[NAO MEDIDO]` — no test in this
    suite cuts power or inspects the block device.

    ONE CONNECTION PER CALL, opened and closed. It costs an `open(2)` per operation, which at
    the volume of an ingestion record is noise, and it buys two things that matter more:
    a reader in another process sees every committed row with no cache to invalidate, and a
    `SIGKILL` never leaves this object holding a handle whose state nobody can reason about.
    """

    def __init__(self, path: Path) -> None:
        """Bind the store to `path`; nothing is created or read until a method is called."""
        self._path = path

    @property
    def path(self) -> Path:
        """Return the database file this store reads and writes."""
        return self._path

    def initialise(self) -> None:
        """Create both tables if they are absent — idempotent, and safe to call on every run."""
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self._path)) as connection:
            for statement in _DDL:
                connection.execute(statement)
            connection.commit()

    def record_run(self, run: IngestRun) -> None:
        """Persist one `md.ingest_run` row and COMMIT before returning."""
        with closing(sqlite3.connect(self._path)) as connection:
            connection.execute(
                _INSERT_RUN,
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
            connection.commit()
        logger.debug("ingest_run_persisted", extra={"run_id": run.run_id})

    def record_gap(self, gap: IngestGap) -> None:
        """Persist one `md.ingest_gap` row and COMMIT before returning."""
        with closing(sqlite3.connect(self._path)) as connection:
            connection.execute(
                _INSERT_GAP,
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
            connection.commit()
        logger.debug("ingest_gap_persisted", extra={"source": gap.source, "symbol": gap.symbol})

    def runs(self) -> tuple[IngestRun, ...]:
        """Return every persisted run, in a total and therefore reproducible order."""
        rows = self._fetch(_SELECT_RUNS, _RUN_TABLE)
        return tuple(IngestRun(*cast(_RunRow, row)) for row in rows)

    def gaps(self) -> tuple[IngestGap, ...]:
        """Return every persisted gap, in a total and therefore reproducible order."""
        rows = self._fetch(_SELECT_GAPS, _GAP_TABLE)
        return tuple(IngestGap(*cast(_GapRow, row)) for row in rows)

    def _fetch(self, statement: str, table: str) -> list[tuple[object, ...]]:
        """Run a read statement, treating a record that does not exist YET as an empty record.

        A RECORD THAT DOES NOT EXIST YET HAS TWO SHAPES, AND ONLY ONE OF THEM WAS HANDLED
        UNTIL THE `/qa` OF 2026-08-29 MEASURED THE OTHER. The collector that has never run
        leaves NO FILE; the collector killed DURING startup leaves a file that exists, holds
        zero bytes, and has no schema — `sqlite3.connect` creates the file on open and the
        `CREATE TABLE` of `initialise()` only becomes visible at `COMMIT`, so a death between
        the two is an ordinary outcome and not an exotic one
        `[MEDIDO 2026-08-29 by the /qa: 6 of 40 SIGKILLs fired between 1 ms and 60 ms after the
         Popen leave exactly this file; over it the old guard raised
         `sqlite3.OperationalError: no such table: md_ingest_run`]`.

        The two are the SAME semantic case — nothing has been recorded — and the F0 record has
        to say "zero runs" for both, or the first thing it does is hide the very state it
        exists to show. The operational shape of the defect is the one that decides it: `cron`
        starts the collector, the host reboots during startup, and in the morning the raw
        record answers with a traceback exactly where the phase promised observability.

        ── AND THE GUARD MUST NOT BECOME BLANKET SILENCE, which is the easy wrong exit ─────

        Asking `sqlite_master` separates the two states WITHOUT catching anything, and that is
        why it is the guard chosen over `except sqlite3.DatabaseError: return []`
        `[MEDIDO 2026-08-29, n=2 states, private bench: a 0 B file -> the `sqlite_master` query
         returns `None`; a CORRUPTED file (truncated half + 16 null bytes) -> the SAME query
         raises `DatabaseError: database disk image is malformed`]`.

        A half-born store is a legitimate state of F0. A corrupted store is DATA LOSS, and
        `D2.8` exists in this same phase because a `200` with a truncated body already happened
        here. Swallowing both would trade a loud crash for a silent lie — and it would collide
        with `core.silent-except`, which is blocking in this repository. There is no `except`
        in this method, and that is the point: corruption propagates on its own.
        """
        if not self._path.exists():
            return []
        with closing(sqlite3.connect(self._path)) as connection:
            if connection.execute(_SELECT_TABLE_PRESENCE, (table,)).fetchone() is None:
                return []
            return list(connection.execute(statement).fetchall())
