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
  `docker` stand-in on `PATH` that runs the `sh -c 'psql …'` the script hands to `docker exec`;
* B-1 of `W8-CODE-REVIEW`: `snapshot` and `delete` refuse (rc 2, before any `psql`) unless the
  pipeline is STOPPED — collectors and writer not running, and the writer group with lag 0 AND
  pending 0. `ingested_at` is the collector's `received_at` and `lag` excludes the PEL, so with the
  pipeline alive the "frozen" universe keeps growing and F-B fails AFTER the irreversible `DELETE`.

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

# A `docker` stand-in: logs every call; `context show` answers `default`; `inspect` answers the
# state written for that name in `$FAKE_DOCKER_STATES` (`name state` lines; absent name ⇒ rc 1);
# `ps` prints `$FAKE_DOCKER_PS` (the names of running compose collector/writer containers);
# `exec … redis-cli …` prints `$FAKE_XINFO`; any other `exec [-i] [-e K=V]… CONTAINER CMD…`
# exports the `-e` pairs and runs CMD on the host, where `psql` reaches the test database through
# the PG* variables the test sets. `FAKE_DOCKER_EXEC_FAILS=1` makes those psql `exec`s fail
# instead, for the tests that must stop before reaching any database.
_FAKE_DOCKER: Final = """#!/usr/bin/env bash
echo "$*" >> "$FAKE_DOCKER_CALLS"
case "$1" in
  context) echo default; exit 0 ;;
  inspect)
    name="${@: -1}"
    awk -v n="$name" '$1==n{print $2; f=1} END{exit !f}' "$FAKE_DOCKER_STATES"
    exit $?
    ;;
  ps) [[ -n "${FAKE_DOCKER_PS:-}" ]] && echo "$FAKE_DOCKER_PS"; exit 0 ;;
  exec)
    shift
    while [[ "$1" == -* ]]; do
      case "$1" in
        -e) export "$2"; shift 2 ;;
        *) shift ;;
      esac
    done
    shift
    if [[ "$1" == "redis-cli" ]]; then cat "$FAKE_XINFO"; exit 0; fi
    [[ "${FAKE_DOCKER_EXEC_FAILS:-0}" == "1" ]] && exit 99
    exec "$@"
    ;;
esac
exit 98
"""

_STOPPED: Final = {"deploy-collector-1": "exited", "deploy-writer-1": "exited"}


def _xinfo(*groups: tuple[str, str, str]) -> str:
    """`XINFO GROUPS` as `redis-cli` prints it without a TTY: one element per line."""
    lines: list[str] = []
    for name, lag, pending in groups:
        lines += ["name", name, "consumers", "1", "pending", pending]
        lines += ["last-delivered-id", "1-0", "entries-read", "7", "lag", lag]
    return "\n".join(lines) + "\n"


_DRAINED: Final = _xinfo(("audit", "5", "3"), ("single_writer", "0", "0"))


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


def _run(
    subcommand: str,
    out: Path,
    fake_docker: Path,
    *,
    confirm: bool,
    database: PostgresDatabase | None = None,
    states: dict[str, str] | None = None,
    running: str = "",
    xinfo: str = _DRAINED,
) -> tuple[subprocess.CompletedProcess[str], list[str]]:
    calls = out.parent / "docker-calls.log"
    calls.touch()
    states_file = out.parent / "docker-states.txt"
    states_file.write_text(
        "".join(f"{n} {st}\n" for n, st in (_STOPPED if states is None else states).items()),
        encoding="utf-8",
    )
    xinfo_file = out.parent / "xinfo.txt"
    xinfo_file.write_text(xinfo, encoding="utf-8")
    env = {
        "PATH": f"{fake_docker}{os.pathsep}{os.environ['PATH']}",
        "HOME": str(out.parent),
        "FAKE_DOCKER_CALLS": str(calls),
        "FAKE_DOCKER_STATES": str(states_file),
        "FAKE_DOCKER_PS": running,
        "FAKE_XINFO": str(xinfo_file),
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
        ["bash", str(_SCRIPT), subcommand, str(out)],
        capture_output=True,
        text=True,
        env=env,
        check=False,
        timeout=120,
    )
    return result, calls.read_text(encoding="utf-8").splitlines()


def _run_delete(
    out: Path,
    fake_docker: Path,
    *,
    confirm: bool,
    database: PostgresDatabase | None = None,
    states: dict[str, str] | None = None,
    running: str = "",
    xinfo: str = _DRAINED,
) -> tuple[subprocess.CompletedProcess[str], list[str]]:
    return _run(
        "delete",
        out,
        fake_docker,
        confirm=confirm,
        database=database,
        states=states,
        running=running,
        xinfo=xinfo,
    )


def _psql_calls(calls: list[str]) -> list[str]:
    return [c for c in calls if c.startswith("exec") and "psql" in c]


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

    assert _psql_calls(calls), "the gates should have let it through"
    assert result.returncode != 0, result.stdout + result.stderr
    assert "listar os chunks" in result.stderr


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


# B-1: one case per way the pipeline can still land a row with `ingested_at <= T_SNAP`, plus the
# fail-closed cases (cannot inspect, group not listed, nil lag). Each must refuse BEFORE any psql.
_NOT_STOPPED: Final = [
    pytest.param({}, "", _xinfo(("single_writer", "0", "4")), "pending", id="pending>0"),
    pytest.param({}, "", _xinfo(("single_writer", "12", "0")), "lag", id="lag>0"),
    pytest.param({}, "", _xinfo(("single_writer", "", "0")), "lag", id="lag-nil"),
    pytest.param(
        {"deploy-collector-1": "running"},
        "",
        _DRAINED,
        "deploy-collector-1",
        id="collector-running",
    ),
    pytest.param(
        {"deploy-writer-1": "running"}, "", _DRAINED, "deploy-writer-1", id="writer-running"
    ),
    pytest.param(
        {"deploy-writer-1": "paused"}, "", _DRAINED, "deploy-writer-1", id="writer-paused"
    ),
    pytest.param({}, "deploy-collector-2", _DRAINED, "deploy-collector-2", id="scaled-replica"),
    pytest.param({"deploy-writer-1": None}, "", _DRAINED, "não encontrado", id="writer-not-found"),
    pytest.param({}, "", _xinfo(("audit", "0", "0")), "ausente", id="group-missing"),
]


def _states(overrides: dict[str, str | None]) -> dict[str, str]:
    merged: dict[str, str | None] = {**_STOPPED, **overrides}
    return {name: state for name, state in merged.items() if state is not None}


@pytest.mark.parametrize(("overrides", "running", "xinfo", "reason"), _NOT_STOPPED)
def test_delete_with_the_pipeline_not_stopped_never_reaches_the_database(
    tmp_path: Path,
    fake_docker: Path,
    overrides: dict[str, str | None],
    running: str,
    xinfo: str,
    reason: str,
) -> None:
    """Token and both baselines present, pipeline alive ⇒ rc 2, the reason named, not one psql."""
    out = _out_dir(tmp_path, with_envelopes=True)

    result, calls = _run_delete(
        out, fake_docker, confirm=True, states=_states(overrides), running=running, xinfo=xinfo
    )

    assert result.returncode == 2, result.stdout + result.stderr
    assert reason in result.stderr
    assert not _psql_calls(calls)


@pytest.mark.parametrize(("overrides", "running", "xinfo", "reason"), _NOT_STOPPED)
def test_snapshot_with_the_pipeline_not_stopped_writes_no_t_snap(
    tmp_path: Path,
    fake_docker: Path,
    overrides: dict[str, str | None],
    running: str,
    xinfo: str,
    reason: str,
) -> None:
    """A `T_SNAP` taken with the pipeline alive is the B-1 universe that keeps growing."""
    out = tmp_path / "out"

    result, calls = _run(
        "snapshot",
        out,
        fake_docker,
        confirm=False,
        states=_states(overrides),
        running=running,
        xinfo=xinfo,
    )

    assert result.returncode == 2, result.stdout + result.stderr
    assert reason in result.stderr
    assert not _psql_calls(calls)
    assert not (out / "t_snap").exists()


@pytest.mark.skipif(shutil.which("psql") is None, reason="psql client not installed")
def test_snapshot_with_the_pipeline_stopped_writes_t_snap(
    tmp_path: Path, fake_docker: Path, postgres_database: PostgresDatabase
) -> None:
    """Positive control of the case above: same stand-in, pipeline stopped ⇒ rc 0 and a T_SNAP."""
    out = tmp_path / "out"

    result, _ = _run("snapshot", out, fake_docker, confirm=False, database=postgres_database)

    assert result.returncode == 0, result.stdout + result.stderr
    assert int((out / "t_snap").read_text(encoding="utf-8")) > 0


@pytest.mark.skipif(shutil.which("psql") is None, reason="psql client not installed")
def test_a_pending_batch_refuses_the_delete_and_leaves_every_row(
    tmp_path: Path,
    fake_docker: Path,
    seeded: psycopg.Connection,
    postgres_database: PostgresDatabase,
) -> None:
    """Against the real seed: with a PEL of 4 the `DELETE` that would remove rows removes none."""
    out = _out_dir(tmp_path, with_envelopes=True)
    before = _pks(seeded)
    assert _oracle(_seed()), "the seed must hold rows the DELETE would remove"

    result, calls = _run_delete(
        out,
        fake_docker,
        confirm=True,
        database=postgres_database,
        xinfo=_xinfo(("single_writer", "0", "4")),
    )

    assert result.returncode == 2, result.stdout + result.stderr
    assert "pending" in result.stderr
    assert not _psql_calls(calls)
    assert _pks(seeded) == before
