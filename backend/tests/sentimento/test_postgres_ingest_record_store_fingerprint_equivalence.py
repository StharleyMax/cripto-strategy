"""`PostgresIngestRecordStore` over a REAL, ephemeral Postgres — `ADR-031/D1`, `T-02.3`.

Same idiom `tests/backtest/test_postgres_run_registry_store.py` already uses ("a REAL... so the
code under test exercises the exact code path it would against a real server"), with the ONE
difference `ADR-031/D2` fixes: the image is `timescale/timescaledb:2.17.2-pg15`, not the plain
`postgres:16-alpine` `test_postgres_run_registry_store.py` uses — it is the only image `ADR-002/
D4`'s five criteria were measured against, and this feature's Postgres target inherits it.
Skipped (not failed) when `docker` is not on `PATH`, same reasoning: the rest of the sentimento
suite already covers `PostgresIngestRecordStore`'s pure logic in isolation.

WHAT THIS FILE PROVES, AND IT IS THE ONLY THING `T-02.3` EXISTS TO PROVE (`ADR-031/D1`,
falsifier `F1`): recording the SAME runs and gaps into the SQLite store and into the Postgres
store, then reading each back through the SAME shared query (`ingest_health_query`), yields the
SAME `IngestHealthReport.fingerprint()`. The adapter is not allowed to invent — no coercion, no
reordering, no `NULL` turned into a sentinel. `test_fingerprint_diverges_if_the_adapter_coerces_
null_api_code_to_zero` is the falsifier ITSELF, not a description of one: it patches the exact
mutation `ADR-031/D1`/`D2.6` names ("coerção plantada (api_code None→0)") into a throwaway
subclass and asserts the two fingerprints STOP matching — proving the equivalence test above
actually bites, rather than passing by construction.
"""

from __future__ import annotations

import shutil
import subprocess
import time
import uuid
from collections.abc import Iterator
from dataclasses import replace
from pathlib import Path

import psycopg
import pytest

from src.modules.sentimento.domain.ingest_record import IngestGap, IngestRun
from src.modules.sentimento.infra.postgres_ingest_record_store import PostgresIngestRecordStore
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore
from src.modules.sentimento.use_cases.ingest_health import ingest_health_query
from tests.helpers.ingest_record_driver import build_run

pytestmark = pytest.mark.skipif(
    shutil.which("docker") is None, reason="docker not on PATH — see module docstring"
)

_IMAGE = "timescale/timescaledb:2.17.2-pg15"
_CONTAINER_NAME_PREFIX = "t-02-3-ingest-record-store-test-"
_READY_TIMEOUT_S = 30.0


def _run_docker(*args: str) -> subprocess.CompletedProcess[str]:
    """Run one `docker` subcommand, capturing output for the caller to inspect on failure."""
    return subprocess.run(  # noqa: S603 — argv is a literal list, never shell-interpolated
        ["docker", *args], capture_output=True, text=True, timeout=60
    )


@pytest.fixture
def postgres_connection() -> Iterator[psycopg.Connection]:
    """Start a throwaway `timescale/timescaledb` container, yield a connection, tear both down."""
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
        _run_docker("rm", "-f", "-v", name)


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


def _gaps() -> tuple[IngestGap, ...]:
    """Return the ≥ 1 gap `D2.6` requires — two, to exercise the composite-key upsert too."""
    return (
        IngestGap(
            source="binance-futures",
            symbol="MATICUSDT",
            series_key_id="oi-5m",
            from_ts="2026-08-12T11:45:00Z",
            to_ts="2026-08-12T12:05:00Z",
            n_missing=3,
            gap_class="SOURCE_GAP",
            detected_at="2026-08-29T02:00:00Z",
        ),
        IngestGap(
            source="bybit",
            symbol="BTCUSDT",
            series_key_id="oi-5m",
            from_ts="2026-08-13T00:00:00Z",
            to_ts="2026-08-13T00:20:00Z",
            n_missing=4,
            gap_class="COLLECTOR_DOWN",
            detected_at="2026-08-29T02:05:00Z",
        ),
    )


def _runs() -> tuple[IngestRun, ...]:
    """Return the ≥ 3 runs `D2.6` requires, one carrying a non-`None` `api_code`.

    `build_run` always leaves `api_code=None` — the `replace()` below adds the ONE run whose
    `api_code` is a real integer, so the mutation test further down has a non-`None` AND a
    `None` value in the same fixture to coerce.
    """
    return (build_run(0), build_run(1), replace(build_run(2), api_code=451))


def test_fingerprint_matches_between_sqlite_and_postgres(
    postgres_connection: psycopg.Connection, tmp_path: Path
) -> None:
    """Same runs/gaps recorded on both engines ⇒ `ingest_health_query(...).fingerprint()` equal.

    `ADR-031/D1`'s falsifier `F1`, run for real: this is the ONE test whose green is the claim
    that `PostgresIngestRecordStore` does not invent anything the SQLite store would not.
    """
    runs, gaps = _runs(), _gaps()

    sqlite_store = SqliteIngestRecordStore(tmp_path / "ingest_record.sqlite3")
    sqlite_store.initialise()
    for run in runs:
        sqlite_store.record_run(run)
    for gap in gaps:
        sqlite_store.record_gap(gap)

    postgres_store = PostgresIngestRecordStore(postgres_connection)
    postgres_store.initialise()
    for run in runs:
        postgres_store.record_run(run)
    for gap in gaps:
        postgres_store.record_gap(gap)

    sqlite_fingerprint = ingest_health_query(sqlite_store).fingerprint()
    postgres_fingerprint = ingest_health_query(postgres_store).fingerprint()

    assert postgres_fingerprint == sqlite_fingerprint
    assert len(postgres_store.runs()) == 3
    assert len(postgres_store.gaps()) == 2


def test_initialise_is_idempotent(postgres_connection: psycopg.Connection) -> None:
    """The DDL runs twice without error — `CREATE ... IF NOT EXISTS`, not a one-shot migration."""
    store = PostgresIngestRecordStore(postgres_connection)
    store.initialise()
    store.initialise()


def test_describe_readiness_before_and_after_initialise(
    postgres_connection: psycopg.Connection,
) -> None:
    """`(False, False)` before `initialise()`; `(True, True)` after — same shape as SQLite."""
    store = PostgresIngestRecordStore(postgres_connection)
    assert store.describe_readiness() == (False, False)
    store.initialise()
    assert store.describe_readiness() == (True, True)


def test_recording_the_same_run_id_twice_upserts_not_duplicates(
    postgres_connection: psycopg.Connection,
) -> None:
    """Re-recording a `run_id` overwrites the row — `INSERT OR REPLACE` parity with SQLite."""
    store = PostgresIngestRecordStore(postgres_connection)
    store.initialise()
    store.record_run(build_run(0))
    store.record_run(replace(build_run(0), verdict="REJECTED"))

    persisted = store.runs()
    assert len(persisted) == 1
    assert persisted[0].verdict == "REJECTED"


def test_fingerprint_diverges_if_the_adapter_coerces_null_api_code_to_zero(
    postgres_connection: psycopg.Connection, tmp_path: Path
) -> None:
    """The falsifier `D2.6` names, run for real: plant the exact mutation, watch it bite.

    A throwaway subclass overrides ONLY `record_run` to coerce `api_code is None -> 0` before
    binding it — the one mutation `ADR-031/D1` calls out by name. Recording the SAME fixture
    through the mutant instead of the real adapter must make `fingerprint()` DISAGREE with the
    SQLite side; if it still matched, the equivalence test above would be passing by
    construction rather than actually measuring anything.
    """

    class _CoercingPostgresIngestRecordStore(PostgresIngestRecordStore):
        def record_run(self, run: IngestRun) -> None:
            coerced_run = replace(run, api_code=0 if run.api_code is None else run.api_code)
            super().record_run(coerced_run)

    runs = _runs()
    assert any(run.api_code is None for run in runs), "fixture must contain a None api_code"

    sqlite_store = SqliteIngestRecordStore(tmp_path / "ingest_record.sqlite3")
    sqlite_store.initialise()
    for run in runs:
        sqlite_store.record_run(run)

    mutant_store = _CoercingPostgresIngestRecordStore(postgres_connection)
    mutant_store.initialise()
    for run in runs:
        mutant_store.record_run(run)

    sqlite_fingerprint = ingest_health_query(sqlite_store).fingerprint()
    mutant_fingerprint = ingest_health_query(mutant_store).fingerprint()

    assert mutant_fingerprint != sqlite_fingerprint
