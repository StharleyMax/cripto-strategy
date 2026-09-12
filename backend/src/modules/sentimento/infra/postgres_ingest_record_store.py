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
NOT EXISTS md`, then `md.ingest_run` (17 columns, PK `run_id` — the 16 `IngestRun` fields plus
the TABLE-only `writer_accounted_at` of `ADR-035/D2`) and `md.ingest_gap` (8 columns, composite
PK). Every statement is `IF NOT EXISTS` — `initialise()` is idempotent by construction, safe to
call on every process boot, same contract as the SQLite sibling.

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

── `ADR-035/D2`: THE WRITER CLOSES THE RUN THE COLLECTOR OPENED ──────────────────────────

`n_written` is "rows the WRITER persisted" (`ADR-035/D1`), and the writer is a different process
from the collector that opens the run. `credit_written` below is the writer's ONE door, and it
is deliberately NOT `record_run`:

  * `record_run` takes a whole 16-field `IngestRun` and its `ON CONFLICT DO UPDATE` overwrites
    all sixteen. A writer calling it would have to SUPPLY `window`, `src_sha256`, `weight_used`
    and `observer_id` — the four fields `ADR-035`'s own rejected-alternative table says a writer
    cannot honestly invent — and would overwrite the collector's measurements with them. The
    ADR's `DoD-4` ("prove the writer overwrites no field it did not measure") is unsatisfiable
    through that door; `credit_written` satisfies it STRUCTURALLY, by naming two columns in an
    `UPDATE` and being unable to name a third.
  * the accounting is ADDITIVE, and an upsert's `SET` cannot be. One collector cycle's rows
    reach the writer over SEVERAL batches (`WRITER_BATCH_SIZE` defaults to 100; one
    `premiumIndex` cycle publishes one row per symbol, and the phase `01` backfill publishes
    10.080), so `n_written = EXCLUDED.n_written` would keep only the LAST batch and under-report
    every run bigger than one batch.
  * the writer usually reaches a run's rows BEFORE the collector records the run at cycle close.
    `credit_written` therefore reports whether it found the row (`False` = not recorded yet) and
    changes nothing when it did not, so the caller can retry rather than INSERT a run nobody
    opened.

`writer_accounted_at` is a TABLE-only column — see the "TABLE only / QUERY only" split in
`domain/ingest_record.py`, which this column joins on the TABLE side. It is not in
`INGEST_HEALTH_RUN_COLUMNS` (`ADR-008/D3`, `RS-2`), so the canonical projection and its `sha256`
(`ADR-008/DoD-2`) are byte-identical before and after this change, and no served route changes
shape. It exists to answer the ONE question `n_written` alone cannot (`ADR-035/D2`, plan item
1.6): `NULL` means the writer has never accounted for this run (OPEN), a timestamp with
`n_written = 0` means the writer accounted for it and persisted NOTHING. Collapsing those two
into the same `0` would trade one ambiguous `rc=0` for another, which is the failure mode
`ADR-012` names.

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
# The 17th member is `writer_accounted_at` (`ADR-035/D2`), TABLE-only and nullable: `_SELECT_RUNS`
# reads it LAST so this positional `cast` keeps matching `IngestRun`'s field order, and
# `_UPSERT_RUN` still does not name it — the column is written by `credit_written` alone.
_RunRow = tuple[
    str,
    str,
    str,
    str,
    int,
    int,
    int,
    str,
    int | None,
    str,
    int,
    str,
    str,
    int,
    str,
    str,
    str | None,
    str | None,
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
        ended_at        TEXT NOT NULL,
        writer_accounted_at TEXT,
        notes               TEXT
    )
    """,
    # `CREATE TABLE IF NOT EXISTS` is a no-op on a database that already has the table, so a
    # column added after the first deployment needs its own idempotent statement — without this
    # line the production table (created before `ADR-035`) would silently keep 16 columns and
    # every `credit_written` would fail on an unknown column.
    "ALTER TABLE md.ingest_run ADD COLUMN IF NOT EXISTS writer_accounted_at TEXT",
    # `T-05.6`. Same idempotent-`ALTER` reason as the line above, and it is not
    # theoretical here: the production table was created before this column existed
    # (`information_schema.columns` listed 17 names, none of them `notes`
    # `[MEDIDO 2026-09-12]`), so without this statement every `record_run` carrying a
    # reason would fail on an unknown column — or, worse, the column would quietly stay
    # absent and `DoD 5` would keep being unsatisfiable while looking satisfied.
    "ALTER TABLE md.ingest_run ADD COLUMN IF NOT EXISTS notes TEXT",
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
         started_at, ended_at, notes)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
        ended_at = EXCLUDED.ended_at,
        notes = EXCLUDED.notes
"""

# `ADR-035/D2`. TWO columns in the SET clause and no third — that is the whole guarantee of
# `DoD-4`: this statement CANNOT overwrite `weight_used` (the collector's, `RNF-3`), `verdict`,
# `n_expected` or anything else, because it does not name them. `n_written + %s` is additive on
# purpose (see the module docstring), and the `WHERE` makes the statement a no-op — reported to
# the caller through `rowcount` — when the collector has not recorded the run yet.
_CREDIT_RUN_WRITTEN = """
    UPDATE md.ingest_run
       SET n_written = n_written + %s,
           writer_accounted_at = %s
     WHERE run_id = %s
"""

_SELECT_WRITER_ACCOUNTED_AT = "SELECT writer_accounted_at FROM md.ingest_run WHERE run_id = %s"

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
           started_at, ended_at, writer_accounted_at, notes
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


class NegativeWrittenCreditError(ValueError):
    """`credit_written` was handed a negative count — a bug upstream, never a real measurement."""


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
                    run.notes,
                ),
            )
        self._connection.commit()

    def credit_written(self, run_id: str, n_written: int, accounted_at: str) -> bool:
        """Add `n_written` rows to the run the collector opened, and stamp the accounting.

        Returns `True` when the run row was found and credited, `False` when no run with that
        `run_id` exists YET — the ordinary case in production, because the writer drains the
        queue while the collector's cycle is still running and the run is only recorded at
        cycle close. `False` is a fact for the caller to retry on, never an error and never a
        reason to insert a run this process did not open (`ADR-035/D2`).

        Refuses a negative credit: `n_written` counts rows this process persisted, so a
        negative would be a bug upstream, and silently adding it would corrupt the one number
        `DoD-4` reads.
        """
        if n_written < 0:
            raise NegativeWrittenCreditError(
                f"credit_written received n_written={n_written} for run_id={run_id!r}: a credit "
                f"counts rows this writer persisted and can never be negative"
            )
        with self._connection.cursor() as cursor:
            cursor.execute(_CREDIT_RUN_WRITTEN, (n_written, accounted_at, run_id))
            credited = cursor.rowcount == 1
        self._connection.commit()
        return credited

    def writer_accounted_at(self, run_id: str) -> str | None:
        """Return when the writer last accounted for `run_id`, or `None` if it never has.

        `None` for a run that EXISTS is `ADR-035/D2`'s "open" — the distinction from a run the
        writer settled at zero, which no amount of reading `n_written` can make. A `run_id` that
        does not exist at all also reads `None`; the caller that needs to tell those two apart
        reads `runs()`, which is the method that answers "does this run exist".
        """
        with self._connection.cursor() as cursor:
            cursor.execute(_SELECT_WRITER_ACCOUNTED_AT, (run_id,))
            row = cursor.fetchone()
        if row is None:
            return None
        return cast(str | None, row[0])

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
