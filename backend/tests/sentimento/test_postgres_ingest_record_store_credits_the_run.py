"""`ADR-035/D2` against a REAL Postgres: the writer closes the run and touches nothing else.

Same container idiom, same image and the same skip-not-fail rule as
`test_postgres_ingest_record_store_fingerprint_equivalence.py` — `ADR-031/D2` fixes
`timescale/timescaledb:2.17.2-pg15` as the only image this feature's Postgres was measured
against, and a machine without `docker` skips instead of reporting a defect it did not observe.

WHAT ONLY A REAL SERVER CAN PROVE, AND IT IS WHY THIS FILE EXISTS:

  * `DoD-4` of `ADR-035` — "the writer overwrites no field it did not measure". A fake creditor
    can only prove the writer CALLS one method; the SQL is what proves the other fifteen
    columns are still the collector's. The falsifier is planted below
    (`test_the_dod_4_guard_bites_...`): a subclass whose statement also sets `weight_used`
    makes the guard test fail, so a green `DoD-4` is evidence and not a tautology.
  * ADDITIVITY. One collector cycle reaches the writer over several batches
    (`WRITER_BATCH_SIZE` = 100 by default), so `n_written = EXCLUDED.n_written` — what
    `record_run`'s upsert does — would keep only the last batch. Two credits summing is the
    property, and it is a property of the statement, not of the caller.
  * THE UPGRADE PATH. `writer_accounted_at` is a column added AFTER the table shipped, so
    `CREATE TABLE IF NOT EXISTS` alone would silently leave production at 16 columns and every
    credit would fail on an unknown column. The test builds the OLD table by hand and proves
    `initialise()` migrates it.
  * `RS-2`/`NG-6`: the canonical projection must be byte-identical before and after this
    decision. `INGEST_HEALTH_RUN_COLUMNS` is untouched here and the `sha256` of `ADR-008/DoD-2`
    is compared across a credit to prove the change is invisible to every served route.
"""

from __future__ import annotations

import shutil
import subprocess
import time
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any, cast

import psycopg
import pytest

from src.modules.sentimento.domain.ingest_record import (
    INGEST_HEALTH_RUN_COLUMNS,
    IngestRun,
)
from src.modules.sentimento.infra.postgres_ingest_record_store import (
    NegativeWrittenCreditError,
    PostgresIngestRecordStore,
)
from src.modules.sentimento.use_cases.collector_status import collector_status_query
from src.modules.sentimento.use_cases.ingest_health import ingest_health_query

pytestmark = pytest.mark.skipif(
    shutil.which("docker") is None, reason="docker not on PATH — see module docstring"
)

_IMAGE = "timescale/timescaledb:2.17.2-pg15"
_CONTAINER_NAME_PREFIX = "t-01-4-run-credit-test-"
_READY_TIMEOUT_S = 30.0
_ACCOUNTED_AT = "2026-09-10T21:00:00.000Z"
_LATER = "2026-09-10T21:05:00.000Z"

# The OLD shape of `md.ingest_run`, transcribed as it stood before `ADR-035/D2` — sixteen
# columns, no `writer_accounted_at`. Written out rather than derived from `_DDL` so the
# migration test measures the REAL "before", not whatever the module currently says it is.
_PRE_ADR_035_DDL = """
    CREATE TABLE md.ingest_run (
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
"""


def _run_docker(*args: str) -> subprocess.CompletedProcess[str]:
    """Run one `docker` subcommand, capturing output for the caller to inspect on failure."""
    return subprocess.run(  # noqa: S603 — argv is a literal list, never shell-interpolated
        ["docker", *args], capture_output=True, text=True, timeout=60
    )


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


def _an_open_run(run_id: str = "run-0001") -> IngestRun:
    """One run exactly as a collector opens it: every field measured, `n_written` not yet known."""
    return IngestRun(
        run_id=run_id,
        source="binance-futures",
        endpoint="/fapi/v1/premiumIndex",
        window="2026-09-10T20:00:00Z/2026-09-10T20:01:00Z",
        n_expected=500,
        n_returned=500,
        n_written=0,
        verdict="ACCEPTED",
        api_code=200,
        src_sha256="c" * 64,
        weight_used=7,
        observer_id="premiumindex-collector",
        observer_region="sa-east-1",
        clock_skew_ms=-2_147_483_648,
        started_at="2026-09-10T20:00:00Z",
        ended_at="2026-09-10T20:01:00Z",
    )


def _store(connection: psycopg.Connection) -> PostgresIngestRecordStore:
    """Build the store and create the schema — the composition every test below starts from."""
    store = PostgresIngestRecordStore(connection)
    store.initialise()
    return store


def test_the_writer_credit_lands_on_the_run_the_collector_opened(
    postgres_connection: psycopg.Connection,
) -> None:
    """The decision in one line: `n_written` stops being `0` for a run that wrote rows."""
    store = _store(postgres_connection)
    store.record_run(_an_open_run())
    assert store.runs()[0].n_written == 0

    assert store.credit_written("run-0001", 137, _ACCOUNTED_AT) is True

    assert store.runs()[0].n_written == 137


def test_two_credits_for_one_run_add_up_instead_of_replacing_each_other(
    postgres_connection: psycopg.Connection,
) -> None:
    """One cycle spans several writer batches — a `SET` would report only the last one."""
    store = _store(postgres_connection)
    store.record_run(_an_open_run())
    store.credit_written("run-0001", 100, _ACCOUNTED_AT)
    store.credit_written("run-0001", 37, _LATER)
    assert store.runs()[0].n_written == 137


def test_the_credit_overwrites_no_field_the_writer_did_not_measure(
    postgres_connection: psycopg.Connection,
) -> None:
    """`ADR-035`'s `DoD-4`, and `RNF-3`: `weight_used` stays the COLLECTOR's number."""
    store = _store(postgres_connection)
    opened = _an_open_run()
    store.record_run(opened)
    store.credit_written("run-0001", 42, _ACCOUNTED_AT)

    credited = store.runs()[0]
    for name in (
        "run_id",
        "source",
        "endpoint",
        "window",
        "n_expected",
        "n_returned",
        "verdict",
        "api_code",
        "src_sha256",
        "weight_used",
        "observer_id",
        "observer_region",
        "clock_skew_ms",
        "started_at",
        "ended_at",
    ):
        assert getattr(credited, name) == getattr(opened, name), name


def test_the_dod_4_guard_bites_when_the_statement_also_sets_weight_used(
    postgres_connection: psycopg.Connection,
) -> None:
    """The falsifier ITSELF: plant the mutation `DoD-4` forbids and prove the guard turns red.

    Without this, "the writer overwrites nothing" would be a claim the previous test cannot
    distinguish from "nothing was written at all" — the `rc=0` ambiguity `ADR-012` names.
    """

    class _OverreachingStore(PostgresIngestRecordStore):
        """A writer that also stamps `weight_used` — exactly what `RNF-3` forbids."""

        def credit_written(self, run_id: str, n_written: int, accounted_at: str) -> bool:
            """Credit the run AND clobber a field this process never measured."""
            with self._connection.cursor() as cursor:  # noqa: SLF001
                cursor.execute(
                    "UPDATE md.ingest_run SET n_written = n_written + %s, "
                    "writer_accounted_at = %s, weight_used = 0 WHERE run_id = %s",
                    (n_written, accounted_at, run_id),
                )
                credited: bool = cursor.rowcount == 1
            self._connection.commit()  # noqa: SLF001
            return credited

    store = _OverreachingStore(postgres_connection)
    store.initialise()
    opened = _an_open_run()
    store.record_run(opened)
    store.credit_written("run-0001", 42, _ACCOUNTED_AT)
    assert store.runs()[0].weight_used != opened.weight_used


def test_a_credit_for_a_run_the_collector_has_not_recorded_yet_changes_nothing(
    postgres_connection: psycopg.Connection,
) -> None:
    """`False` is the signal the caller retries on — never an invented run row."""
    store = _store(postgres_connection)
    assert store.credit_written("run-that-does-not-exist", 9, _ACCOUNTED_AT) is False
    assert store.runs() == ()


def test_an_open_run_and_a_run_settled_at_zero_are_distinguishable(
    postgres_connection: psycopg.Connection,
) -> None:
    """Plan item 1.6: without this the fix trades one ambiguous `0` for another."""
    store = _store(postgres_connection)
    store.record_run(_an_open_run("run-open"))
    store.record_run(_an_open_run("run-settled-at-zero"))
    store.credit_written("run-settled-at-zero", 0, _ACCOUNTED_AT)

    assert store.writer_accounted_at("run-open") is None
    assert store.writer_accounted_at("run-settled-at-zero") == _ACCOUNTED_AT
    by_id = {run.run_id: run for run in store.runs()}
    assert by_id["run-open"].n_written == by_id["run-settled-at-zero"].n_written == 0


def test_the_writer_stamp_reaches_the_domain_object_the_uptime_formula_reads(
    postgres_connection: psycopg.Connection,
) -> None:
    """`_SELECT_RUNS`'s 17th column arrives, in the right slot — the READ side of `ADR-035/D2`.

    THE ONLY PRODUCTION PATH THAT CARRIES "closed" INTO `uptime_percent` IS THIS ONE, and until
    this test existed nothing exercised it: `store.writer_accounted_at(run_id)` is a different
    statement, the SQLite engine has no such column at all, and every `collector_status` test
    hands the use case a fake source it builds by hand. Measured as a surviving mutant during
    the `T-06.1`/`T-06.2` gate: replacing the column in `_SELECT_RUNS` with
    `NULL AS writer_accounted_at` left the whole suite green
    `[MEDIDO 2026-09-11: mutante N5, rc=0 sobre 4 arquivos de teste, 0 killers]` — and in
    production that mutant reads EVERY run as open, so `uptimePercent` serves `null` for every
    collector and the fix delivers nothing while the gate stays green.

    `_ACCOUNTED_AT` differs from both timestamps of `_an_open_run`, so a column read out of
    POSITION — the other way this `cast`-checked tuple can lie — cannot pass this assertion by
    coincidence either.
    """
    store = _store(postgres_connection)
    store.record_run(_an_open_run("run-open"))
    store.record_run(_an_open_run("run-closed"))
    store.credit_written("run-closed", 42, _ACCOUNTED_AT)

    by_id = {run.run_id: run for run in store.runs()}

    assert by_id["run-open"].writer_accounted_at is None
    assert by_id["run-closed"].writer_accounted_at == _ACCOUNTED_AT
    assert by_id["run-closed"].started_at == _an_open_run().started_at
    assert by_id["run-closed"].ended_at == _an_open_run().ended_at


def test_uptime_over_a_real_postgres_counts_the_closed_run_and_ignores_the_open_one(
    postgres_connection: psycopg.Connection,
) -> None:
    """`ADR-035/D1` amendment, end to end over the engine production actually runs.

    The formula is unit-tested against a fake source; what a fake source cannot prove is that
    the "closed" it reads is the one the DATABASE stored. Here the writer credits one of two
    runs of the same series and the percentage is `100.0` — the open run entering neither side —
    which is the same shape measured against the live stack
    `[MEDIDO 2026-09-11T12:55Z: premiumIndex 670/670 fechados com n_written > 0 -> 100,00,
      contra 0,42 da formula antiga, n = 1.431 runs na janela]`.
    """
    store = _store(postgres_connection)
    store.record_run(_an_open_run("run-open"))
    store.record_run(_an_open_run("run-closed"))
    store.credit_written("run-closed", 42, _ACCOUNTED_AT)

    row = (
        collector_status_query(store, now=datetime(2026, 9, 10, 21, 0, tzinfo=UTC))
        .rows[0]
        .to_dict()
    )

    assert row["uptimePercent"] == 100.0
    assert row["n_runs_in_window"] == 2
    assert row["statusDetail"] is None


def test_a_negative_credit_is_refused_instead_of_silently_subtracting(
    postgres_connection: psycopg.Connection,
) -> None:
    """A credit counts rows this process persisted; a negative one is a bug, not a measurement."""
    store = _store(postgres_connection)
    store.record_run(_an_open_run())
    with pytest.raises(NegativeWrittenCreditError, match="run-0001"):
        store.credit_written("run-0001", -1, _ACCOUNTED_AT)
    assert store.runs()[0].n_written == 0


def test_initialise_migrates_a_table_created_before_this_decision_existed(
    postgres_connection: psycopg.Connection,
) -> None:
    """`CREATE TABLE IF NOT EXISTS` is a no-op on a live table — the `ALTER` is what upgrades it."""
    with postgres_connection.cursor() as cursor:
        cursor.execute("CREATE SCHEMA IF NOT EXISTS md")
        cursor.execute(_PRE_ADR_035_DDL)
    postgres_connection.commit()

    store = PostgresIngestRecordStore(postgres_connection)
    store.initialise()
    store.record_run(_an_open_run())

    assert store.credit_written("run-0001", 5, _ACCOUNTED_AT) is True
    assert store.runs()[0].n_written == 5


def test_the_canonical_projection_fingerprint_ignores_the_new_column(
    postgres_connection: psycopg.Connection,
) -> None:
    """`RS-2`/`NG-6`: `writer_accounted_at` is TABLE-only, so `ADR-008/DoD-2` sees nothing new."""
    store = _store(postgres_connection)
    store.record_run(_an_open_run())
    store.credit_written("run-0001", 3, _ACCOUNTED_AT)
    first = ingest_health_query(store)
    store.credit_written("run-0001", 0, _LATER)
    second = ingest_health_query(store)

    assert first.fingerprint() == second.fingerprint()
    assert "writer_accounted_at" not in first.canonical_projection()


def test_the_column_is_absent_from_every_projected_run(
    postgres_connection: psycopg.Connection,
) -> None:
    """The shape `ADR-008/D3` fixes stays at its 15 names, credit or no credit."""
    store = _store(postgres_connection)
    store.record_run(_an_open_run())
    store.credit_written("run-0001", 3, _ACCOUNTED_AT)
    envelope = ingest_health_query(store).to_envelope()
    projected: dict[str, Any] = cast(list[dict[str, Any]], envelope["runs"])[0]
    assert projected["n_written"] == 3
    assert tuple(projected) == INGEST_HEALTH_RUN_COLUMNS
