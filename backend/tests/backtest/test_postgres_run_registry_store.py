"""`PostgresRunRegistryStore` over a REAL, ephemeral Postgres — `ADR-021`/D1, not a mock.

Same idiom `tests/sentimento/test_redis_stream_bus.py` already uses for `fakeredis` ("a REAL
loopback listener... so the code under test exercises the exact code path it would against a
real server") — this backend has no equivalent in-process fake for the Postgres wire protocol,
so the closest real listener is a throwaway `postgres:16-alpine` container, exactly the image
`deploy/compose.yml` already runs and the one `T-08.1`'s spike (`docs/spike/
T-08.1-motor-armazenamento/`) used the same way. The container is started and torn down by
THIS file — it never touches `deploy/compose.yml` or the shared `.env`.

Skipped (not failed) when `docker` is not on `PATH`: the rest of the suite (`test_record_run.py`,
`test_run_registry_entry.py`, `test_postgres_row_mapping.py`) already covers every falsifier
this task owns without a real server, so an environment without Docker still gets a green,
meaningful suite — it only loses the one test that proves the DDL itself, byte for byte,
against a real engine.
"""

from __future__ import annotations

import shutil
import subprocess
import time
import uuid
from collections.abc import Iterator

import psycopg
import pytest

from src.modules.backtest.domain.intrabar_convention import IntrabarConvention
from src.modules.backtest.domain.run_registry_entry import RunRegistryEntry
from src.modules.backtest.infra.postgres_run_registry_store import PostgresRunRegistryStore

pytestmark = pytest.mark.skipif(
    shutil.which("docker") is None, reason="docker not on PATH — see module docstring"
)

_IMAGE = "postgres:16-alpine"
_CONTAINER_NAME_PREFIX = "t-08-4-run-registry-test-"
_READY_TIMEOUT_S = 30.0


def _run_docker(*args: str) -> subprocess.CompletedProcess[str]:
    """Run one `docker` subcommand, capturing output for the caller to inspect on failure."""
    return subprocess.run(  # noqa: S603 — argv is a literal list, never shell-interpolated
        ["docker", *args], capture_output=True, text=True, timeout=60
    )


@pytest.fixture
def postgres_connection() -> Iterator[psycopg.Connection]:
    """Start a throwaway Postgres container, yield a connection to it, then tear both down."""
    name = f"{_CONTAINER_NAME_PREFIX}{uuid.uuid4().hex[:8]}"
    started = _run_docker(
        "run",
        "-d",
        "--rm",
        "--name",
        name,
        "-e",
        "POSTGRES_PASSWORD=test",
        "-e",
        "POSTGRES_USER=test",
        "-e",
        "POSTGRES_DB=test",
        "-p",
        "127.0.0.1::5432",
        _IMAGE,
    )
    if started.returncode != 0:
        pytest.skip(f"could not start {_IMAGE}: {started.stderr.strip()}")
    try:
        port_output = _run_docker("port", name, "5432/tcp")
        host_port = port_output.stdout.strip().rsplit(":", maxsplit=1)[-1]
        conninfo = f"host=127.0.0.1 port={host_port} dbname=test user=test password=test"
        connection = _wait_until_ready(conninfo)
        try:
            yield connection
        finally:
            connection.close()
    finally:
        _run_docker("rm", "-f", name)


def _wait_until_ready(conninfo: str) -> psycopg.Connection:
    """Poll for the container to accept connections, refusing after `_READY_TIMEOUT_S`."""
    deadline = time.monotonic() + _READY_TIMEOUT_S
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            return psycopg.connect(conninfo)
        except psycopg.OperationalError as error:
            last_error = error
            time.sleep(0.5)
    raise TimeoutError(f"postgres did not become ready within {_READY_TIMEOUT_S}s") from last_error


def _entry(**overrides: object) -> RunRegistryEntry:
    """Build a valid `RunRegistryEntry`, with `overrides` replacing individual fields."""
    fields: dict[str, object] = {
        "run_id": "run-1",
        "bundle_hash": "a" * 64,
        "window_from_ms": 0,
        "window_to_ms": 1_000,
        "knowledge_time": 1_000,
        "partitions_content_hash": "b" * 64,
        "commit": "deadbeef",
        "intrabar_convention": IntrabarConvention.PESSIMISTIC_STOP_FIRST,
        "intrabar_decided_count": 0,
        "principal_id": "stharley",
    }
    fields.update(overrides)
    return RunRegistryEntry(**fields)  # type: ignore[arg-type]


def test_ensure_schema_is_idempotent(postgres_connection: psycopg.Connection) -> None:
    """The DDL runs twice without error — `CREATE ... IF NOT EXISTS`, not a one-shot migration."""
    store = PostgresRunRegistryStore(postgres_connection)
    store.ensure_schema()
    store.ensure_schema()


def test_record_then_find_by_triple_round_trips(postgres_connection: psycopg.Connection) -> None:
    """A recorded row comes back byte-identical through `find_by_triple` — the read half."""
    store = PostgresRunRegistryStore(postgres_connection)
    store.ensure_schema()
    entry = _entry()
    store.record(entry)

    found = store.find_by_triple(
        bundle_hash=entry.bundle_hash,
        window_from_ms=entry.window_from_ms,
        window_to_ms=entry.window_to_ms,
        knowledge_time=entry.knowledge_time,
    )
    assert found == entry


def test_find_by_triple_returns_none_for_an_unknown_triple(
    postgres_connection: psycopg.Connection,
) -> None:
    """No row on file — `None`, never an exception, never a fabricated row."""
    store = PostgresRunRegistryStore(postgres_connection)
    store.ensure_schema()
    assert (
        store.find_by_triple(
            bundle_hash="c" * 64, window_from_ms=0, window_to_ms=1, knowledge_time=1
        )
        is None
    )


def test_find_by_run_id_returns_created_at(postgres_connection: psycopg.Connection) -> None:
    """`find_by_run_id` is the by-identity read, and it carries the audit-only `created_at`."""
    store = PostgresRunRegistryStore(postgres_connection)
    store.ensure_schema()
    entry = _entry(run_id="run-2")
    store.record(entry)

    stored = store.find_by_run_id("run-2")
    assert stored is not None
    assert stored.entry == entry
    assert stored.created_at > 0


def test_the_window_check_constraint_bites_at_the_database(
    postgres_connection: psycopg.Connection,
) -> None:
    """The DDL's own `CHECK (window_from_ms <= window_to_ms)`.

    The domain check duplicated at the database boundary, in case a row is ever inserted by
    something other than this store.
    """
    store = PostgresRunRegistryStore(postgres_connection)
    store.ensure_schema()
    with postgres_connection.cursor() as cursor, pytest.raises(psycopg.errors.CheckViolation):
        cursor.execute(
            "INSERT INTO backtest.run_registry (run_id, bundle_hash, window_from_ms, "
            "window_to_ms, knowledge_time, partitions_content_hash, commit, "
            "intrabar_convention, intrabar_decided_count, principal_id) VALUES "
            "('bad-window', %s, 2000, 1000, 2000, %s, 'deadbeef', "
            "'pessimistic_stop_first', 0, 'stharley')",
            ("a" * 64, "b" * 64),
        )
    postgres_connection.rollback()


def test_the_intrabar_convention_check_constraint_bites_at_the_database(
    postgres_connection: psycopg.Connection,
) -> None:
    """An `intrabar_convention` outside the declared enum is refused by the database itself."""
    store = PostgresRunRegistryStore(postgres_connection)
    store.ensure_schema()
    with postgres_connection.cursor() as cursor, pytest.raises(psycopg.errors.CheckViolation):
        cursor.execute(
            "INSERT INTO backtest.run_registry (run_id, bundle_hash, window_from_ms, "
            "window_to_ms, knowledge_time, partitions_content_hash, commit, "
            "intrabar_convention, intrabar_decided_count, principal_id) VALUES "
            "('bad-convention', %s, 0, 1000, 1000, %s, 'deadbeef', "
            "'optimistic_target_first', 0, 'stharley')",
            ("a" * 64, "b" * 64),
        )
    postgres_connection.rollback()
