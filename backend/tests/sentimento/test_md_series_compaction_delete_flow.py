r"""`compact.sh delete` end to end: the gates BEFORE the `DELETE`, and the psql commit/rollback.

`test_md_series_compaction_script.py` runs the SQL text `print-sql` emits; it never runs the
`delete` SUBCOMMAND, so three properties of the script itself were unmeasured (QA of wave W8):

* the `COMPACT_CONFIRM` token is required before ANY database call;
* `T-06.4-prova.md` §4 makes BOTH baselines a precondition of the irreversible `DELETE` —
  F-B (`count OUT before`) AND F-A (`envelopes OUT before`, "Antes do DELETE: sha256 de cada
  JSON"). The script enforces F-B's file; without F-A's, `verify` can never pass again, and the
  rows are already gone (the owner accepted "sem o backup");
* a failing chunk listing must not read as "0 rows deleted, rc 0";
* the psql `\gset`/`\if` wrapper commits a chunk ONLY when selected == deleted, and rolls back
  otherwise — exercised here with a real `psql` against the throwaway TimescaleDB, through a
  `docker` stand-in on `PATH` that runs the `sh -c 'psql …'` the script hands to `docker exec`.

Never the shared database: `postgres_database` is a fresh database on the session container.
"""

from __future__ import annotations

import os
import shutil
import stat
import subprocess
from collections.abc import Iterator
from pathlib import Path
from typing import Final

import psycopg
import pytest

from src.modules.sentimento.infra.postgres_series_sink import PostgresSeriesSink, ensure_schema
from tests.helpers.postgres import PostgresDatabase
from tests.sentimento.test_md_series_compaction_script import _T_SNAP, _oracle, _seed

_SCRIPT: Final = Path(__file__).resolve().parents[3] / "scripts/md-series-compaction/compact.sh"
_TOKEN: Final = "delete-md-series-duplicates"  # noqa: S105 - a confirmation word, not a secret

# A `docker` stand-in: logs every call; `context show` answers `default`; `exec [-i] [-e K=V]…
# CONTAINER CMD…` exports the `-e` pairs and runs CMD on the host, where `psql` reaches the test
# database through the PG* variables the test sets. `FAKE_DOCKER_EXEC_FAILS=1` makes every
# `exec` fail instead, for the tests that must stop before reaching any database.
_FAKE_DOCKER: Final = """#!/usr/bin/env bash
echo "$*" >> "$FAKE_DOCKER_CALLS"
case "$1" in
  context) echo default; exit 0 ;;
  exec)
    [[ "${FAKE_DOCKER_EXEC_FAILS:-0}" == "1" ]] && exit 99
    shift
    while [[ "$1" == -* ]]; do
      case "$1" in
        -e) export "$2"; shift 2 ;;
        *) shift ;;
      esac
    done
    shift
    exec "$@"
    ;;
esac
exit 98
"""


@pytest.fixture
def fake_docker(tmp_path: Path) -> Path:
    """Write the `docker` stand-in into a directory to prepend to `PATH`."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    docker = bin_dir / "docker"
    docker.write_text(_FAKE_DOCKER, encoding="utf-8")
    docker.chmod(docker.stat().st_mode | stat.S_IXUSR)
    return bin_dir


@pytest.fixture
def seeded(postgres_database: PostgresDatabase) -> Iterator[psycopg.Connection]:
    """Yield a fresh hypertable holding the sibling test's legacy seed, via the production sink."""
    with postgres_database.connect() as conn:
        ensure_schema(conn)
        sink = PostgresSeriesSink(conn)
        for row in _seed():
            sink.accept(row)
        yield conn


def _out_dir(tmp_path: Path, *, with_envelopes: bool) -> Path:
    out = tmp_path / "out"
    out.mkdir()
    (out / "t_snap").write_text(f"{_T_SNAP}\n", encoding="utf-8")
    (out / "stats-before.tsv").write_text("source\tbinance_klines\t1\t1\t0\n", encoding="utf-8")
    if with_envelopes:
        (out / "envelopes-before.tsv").write_text("k\t200\tsha\t1\n", encoding="utf-8")
    return out


def _run_delete(
    out: Path,
    fake_docker: Path,
    *,
    confirm: bool,
    database: PostgresDatabase | None = None,
) -> tuple[subprocess.CompletedProcess[str], list[str]]:
    calls = out.parent / "docker-calls.log"
    calls.touch()
    env = {
        "PATH": f"{fake_docker}{os.pathsep}{os.environ['PATH']}",
        "HOME": str(out.parent),
        "FAKE_DOCKER_CALLS": str(calls),
    }
    if confirm:
        env["COMPACT_CONFIRM"] = _TOKEN
    if database is None:
        env["FAKE_DOCKER_EXEC_FAILS"] = "1"
    else:
        env |= {
            "PGHOST": database.host,
            "PGPORT": str(database.port),
            "PGPASSWORD": database.password,
            "POSTGRES_USER": database.user,
            "POSTGRES_DB": database.dbname,
        }
    result = subprocess.run(
        ["bash", str(_SCRIPT), "delete", str(out)],
        capture_output=True,
        text=True,
        env=env,
        check=False,
        timeout=120,
    )
    return result, calls.read_text(encoding="utf-8").splitlines()


def _count(conn: psycopg.Connection) -> int:
    with conn.cursor() as cursor:
        cursor.execute("SELECT count(*) FROM md.series")
        (n,) = cursor.fetchone() or (0,)
    conn.commit()
    return int(n)


def _pks(conn: psycopg.Connection) -> set[tuple[object, ...]]:
    with conn.cursor() as cursor:
        cursor.execute(
            "SELECT series_key_id, symbol, source, bucket_end, observed_at FROM md.series"
        )
        found = {tuple(r) for r in cursor.fetchall()}
    conn.commit()
    return found


def test_delete_without_the_confirmation_token_never_reaches_the_database(
    tmp_path: Path, fake_docker: Path
) -> None:
    """No `COMPACT_CONFIRM` ⇒ rc 2 and not one `docker exec`."""
    out = _out_dir(tmp_path, with_envelopes=True)

    result, calls = _run_delete(out, fake_docker, confirm=False)

    assert result.returncode == 2
    assert "COMPACT_CONFIRM" in result.stderr
    assert not [c for c in calls if c.startswith("exec")]


def test_delete_without_the_f_a_baseline_never_reaches_the_database(
    tmp_path: Path, fake_docker: Path
) -> None:
    """`T-06.4-prova.md` §4: F-A's "antes" is taken BEFORE the `DELETE`, or never.

    Token given, F-B's `stats-before.tsv` present, `envelopes-before.tsv` ABSENT: the script must
    refuse exactly as it refuses a missing `stats-before.tsv`, before any `docker exec`.
    """
    out = _out_dir(tmp_path, with_envelopes=False)

    result, calls = _run_delete(out, fake_docker, confirm=True)

    assert result.returncode == 2, result.stdout + result.stderr
    assert "envelopes" in result.stderr
    assert not [c for c in calls if c.startswith("exec")]


def test_a_chunk_listing_that_fails_is_not_reported_as_zero_rows_deleted(
    tmp_path: Path, fake_docker: Path
) -> None:
    """Every gate passed, then `docker exec` fails (wrong `PG_CONTAINER`, container down).

    The chunk list is read through `done < <(sql_chunks | psql_ro)`: a process substitution,
    whose exit status `set -e` never sees. The loop reads nothing and the script prints
    "apagadas no total: 0" with rc 0 — a failure indistinguishable from "nothing to delete".
    """
    out = _out_dir(tmp_path, with_envelopes=True)

    result, calls = _run_delete(out, fake_docker, confirm=True)

    assert [c for c in calls if c.startswith("exec")], "the gates should have let it through"
    assert result.returncode != 0, result.stdout + result.stderr


@pytest.mark.skipif(shutil.which("psql") is None, reason="psql client not installed")
def test_delete_commits_each_chunk_and_removes_exactly_the_selected_rows(
    tmp_path: Path,
    fake_docker: Path,
    seeded: psycopg.Connection,
    postgres_database: PostgresDatabase,
) -> None:
    r"""The real wrapper (`BEGIN`, `\gset`, `\if :ok COMMIT`) over the real seed."""
    out = _out_dir(tmp_path, with_envelopes=True)
    before = _pks(seeded)
    selected = _oracle(_seed())

    result, _ = _run_delete(out, fake_docker, confirm=True, database=postgres_database)

    assert result.returncode == 0, result.stdout + result.stderr
    assert result.stdout.count("COMMIT") == 2  # two chunks hold the seed
    assert "ROLLBACK" not in result.stdout
    assert f"apagadas no total: {len(selected)}" in result.stdout
    assert _pks(seeded) == before - selected


@pytest.mark.skipif(shutil.which("psql") is None, reason="psql client not installed")
def test_a_chunk_whose_deleted_count_differs_from_the_selected_is_rolled_back(
    tmp_path: Path,
    fake_docker: Path,
    seeded: psycopg.Connection,
    postgres_database: PostgresDatabase,
) -> None:
    """A trigger swallows one `DELETE` ⇒ selected ≠ deleted ⇒ ROLLBACK, rc 2, no row gone."""
    with seeded.cursor() as cursor:
        cursor.execute(
            "CREATE FUNCTION md.keep_one() RETURNS trigger LANGUAGE plpgsql AS $$ "
            "BEGIN IF OLD.value_raw = '0' THEN RETURN NULL; END IF; RETURN OLD; END $$"
        )
        cursor.execute(
            "CREATE TRIGGER keep_one BEFORE DELETE ON md.series "
            "FOR EACH ROW EXECUTE FUNCTION md.keep_one()"
        )
    seeded.commit()
    out = _out_dir(tmp_path, with_envelopes=True)
    n_before = _count(seeded)

    result, _ = _run_delete(out, fake_docker, confirm=True, database=postgres_database)

    assert result.returncode == 2, result.stdout + result.stderr
    assert "ROLLBACK" in result.stdout
    assert _count(seeded) == n_before
