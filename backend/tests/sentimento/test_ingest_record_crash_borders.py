"""`D2.9` borders the happy kill does not reach: a crash before the first commit, and friends.

WHY A SECOND DURABILITY FILE EXISTS. `test_ingest_record_durability.py` kills the recorder
only AFTER ten rows are readable (`while len(observer.runs()) < 10`), so it measures the
window in which the schema is already committed. That is a real window and the test is a good
test — but "survives a restart" has more than one edge, and the one the plan names
(`D2.9`: *matar o processo e reler*) includes the process dying BEFORE it finished starting.

MEASURED, and this file exists because of the measurement, not the other way around
`[MEDIDO 2026-08-29, n=40 mortes com SIGKILL entre 1 ms e 60 ms apos o Popen: 6/40 deixaram
 um arquivo de 0 B; sobre ele, `SqliteIngestRecordStore.runs()` -> `sqlite3.OperationalError:
 no such table: md_ingest_run`, e `ingest_health_cli.report(path)` ESTOURA com o mesmo erro]`.
The tests below reproduce that state DETERMINISTICALLY instead of racing for it, because a
test that only fails 15% of the time is a test nobody can act on.
"""

from __future__ import annotations

import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

from src.modules.sentimento.infra import ingest_health_cli
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore
from src.modules.sentimento.use_cases.ingest_health import ingest_health_query
from tests.helpers.ingest_record_driver import build_run

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DRIVER = BACKEND_ROOT / "tests" / "helpers" / "ingest_record_driver.py"

# Three writers is enough to make the writers contend: SQLite serialises them on a file lock,
# and twelve rows each keeps the whole test around one second of wall clock.
CONCURRENT_WRITERS = 3
ROWS_PER_WRITER = 12


def _store_left_by_a_crash_before_the_first_commit(path: Path) -> Path:
    """Leave behind exactly what an early `SIGKILL` leaves: the file exists, the schema does not.

    `sqlite3.connect` creates the file on open, and the `CREATE TABLE` of `initialise()` only
    becomes visible to another process at `COMMIT`. A kill in between leaves 0 bytes on disk —
    which is what the 6/40 measurement in this module's docstring found, byte for byte.
    """
    sqlite3.connect(path).close()
    assert path.exists(), "o cenario exige o arquivo presente"
    assert path.stat().st_size == 0, "o cenario exige o arquivo VAZIO, como o SIGKILL o deixa"
    return path


def test_a_store_left_by_a_crash_before_the_first_commit_reads_as_an_empty_record(
    tmp_path: Path,
) -> None:
    """The named query must say ZERO RUNS over a half-born store — never raise over it.

    THIS IS THE CONTRACT THE MODULE WROTE FOR ITSELF, and it is quoted rather than invented:
    `SqliteIngestRecordStore._fetch` documents that "an ABSENT file is an empty record, not an
    error: the CLI report of a collector that has never run has to say 'zero runs' instead of
    blowing up, or the first thing the F0 record does is hide the very state it exists to
    show". The guard implementing that sentence tests `self._path.exists()`, and a collector
    killed during startup leaves a file that DOES exist and holds no schema — so the guard
    misses precisely the case `D2.9` is about.

    The operational shape of the defect: `cron` starts the collector, the host reboots or the
    OOM killer fires during startup, and the next morning the operator runs the CLI record and
    gets a traceback where the phase promised observability of a 14 h queue.
    """
    path = _store_left_by_a_crash_before_the_first_commit(tmp_path / "record.sqlite3")

    health = ingest_health_query(SqliteIngestRecordStore(path))

    assert health.runs == ()
    assert health.gaps == ()


def test_the_cli_report_over_a_store_left_by_a_crash_does_not_blow_up(tmp_path: Path) -> None:
    """The same defect at the surface the operator actually touches: the CLI report.

    Kept separate from the test above on purpose. They fail for one reason today, but they are
    two different promises — one is `ADR-008/D3` (the shared read path), the other is
    `ADR-008/D1` (the CLI record of F0) — and whoever fixes the store should see both go green
    in the same run rather than trust that one implies the other.
    """
    path = _store_left_by_a_crash_before_the_first_commit(tmp_path / "record.sqlite3")

    emitted = ingest_health_cli.report(path)

    assert '"n_runs":0' in emitted
    assert '"n_gaps":0' in emitted


def test_a_corrupted_store_file_keeps_failing_loudly(tmp_path: Path) -> None:
    """THE CONTROL for the two tests above: "reads as empty" must NOT become blanket silence.

    A half-born store is a legitimate state of F0 (nothing recorded yet). A CORRUPTED store is
    not — it is data loss, and `D2.8` exists in this same phase because a `200` with a
    truncated body already happened here. If the fix for the two failing tests above were
    `except sqlite3.DatabaseError: return []`, it would trade a loud crash for a silent lie
    AND it would collide with `core.silent-except`. This test is the tripwire on that fix.
    """
    path = tmp_path / "record.sqlite3"
    store = SqliteIngestRecordStore(path)
    store.initialise()
    store.record_run(build_run(0))
    raw = path.read_bytes()
    path.write_bytes(raw[: len(raw) // 2] + b"\x00" * 16)

    with pytest.raises(sqlite3.DatabaseError):
        SqliteIngestRecordStore(path).runs()


def test_concurrent_recorders_neither_lose_rows_nor_corrupt_the_file(tmp_path: Path) -> None:
    """Two collectors on one record file: no `database is locked`, no lost row, no corruption.

    `D2.9` says "persisted, not log", and a log is exactly what tolerates concurrent appenders
    without anybody thinking about it. A store does not: SQLite serialises writers on a file
    lock and gives up after `sqlite3.connect`'s default five second timeout, at which point a
    recorder would raise `OperationalError: database is locked` and the run it observed would
    be gone. This test is the reason to know that number instead of assuming it.

    Every writer records the SAME `run_id` sequence, so the converged state is
    `ROWS_PER_WRITER` rows and not a multiple of it — `INSERT OR REPLACE` makes the retry
    idempotent, and that property is the one being measured under contention.
    """
    path = tmp_path / "record.sqlite3"
    SqliteIngestRecordStore(path).initialise()
    environment = dict(os.environ, PYTHONPATH=str(BACKEND_ROOT))
    writers = [
        subprocess.Popen(
            [sys.executable, str(DRIVER), str(path), str(ROWS_PER_WRITER), "0.0"],
            cwd=str(BACKEND_ROOT),
            env=environment,
            stderr=subprocess.PIPE,
            text=True,
        )
        for _ in range(CONCURRENT_WRITERS)
    ]
    failures = []
    for writer in writers:
        _, stderr = writer.communicate(timeout=60)
        if writer.returncode != 0:
            failures.append(stderr.strip()[-200:])

    assert failures == [], f"escritor concorrente reprovou: {failures}"
    assert SqliteIngestRecordStore(path).runs() == tuple(
        build_run(index) for index in range(ROWS_PER_WRITER)
    )
    with sqlite3.connect(path) as connection:
        assert connection.execute("PRAGMA integrity_check").fetchone() == ("ok",)
