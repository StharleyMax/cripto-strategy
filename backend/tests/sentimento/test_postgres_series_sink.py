"""`PostgresSeriesSink`/`PostgresObservedLookup` over a REAL, ephemeral TimescaleDB — `T-02.2`.

Same idiom `tests/backtest/test_postgres_run_registry_store.py` already uses for a throwaway
container (`ADR-031/D2` fixes the image for THIS module: `timescale/timescaledb:2.17.2-pg15`,
not `postgres:16-alpine` — `md.series` is a hypertable, and only the Timescale image ships the
extension `gates/F2-series-ddl.md` §2 requires).

Skipped (not failed) when `docker` is not on `PATH`, same reasoning as the sibling file: an
environment without Docker still gets a green, meaningful suite for the pure-domain tests
(`test_write_series_row.py`), it only loses the tests that prove the DDL and the upsert-noop
property against a real engine.
"""

from __future__ import annotations

import shutil
import subprocess
import time
import uuid
from collections.abc import Iterator

import psycopg
import pytest

from src.modules.sentimento.domain.provenance import (
    UNKNOWN_OBSERVER_REGION,
    AvailabilitySource,
    Provenance,
    SeriesRow,
)
from src.modules.sentimento.infra.postgres_series_sink import (
    PostgresObservedLookup,
    PostgresSeriesSink,
    ensure_schema,
)
from src.modules.sentimento.use_cases.write_series_row import WriteOutcome, write_series_row

pytestmark = pytest.mark.skipif(
    shutil.which("docker") is None, reason="docker not on PATH — see module docstring"
)

_IMAGE = "timescale/timescaledb:2.17.2-pg15"
_CONTAINER_NAME_PREFIX = "t-02-2-series-sink-test-"
_READY_TIMEOUT_S = 30.0

BUCKET_END_MS = 1_787_443_499_999
EVENT_TIME_MS = 1_787_443_500_000


def _run_docker(*args: str) -> subprocess.CompletedProcess[str]:
    """Run one `docker` subcommand, capturing output for the caller to inspect on failure."""
    return subprocess.run(  # noqa: S603 — argv is a literal list, never shell-interpolated
        ["docker", *args], capture_output=True, text=True, timeout=60
    )


@pytest.fixture
def postgres_conninfo() -> Iterator[str]:
    """Start a throwaway TimescaleDB container, yield its `psycopg` conninfo, then tear it down."""
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
        _wait_until_ready(conninfo).close()
        yield conninfo
    finally:
        _run_docker("rm", "-f", "-v", name)


@pytest.fixture
def postgres_connection(postgres_conninfo: str) -> Iterator[psycopg.Connection]:
    """One connection to the throwaway container — the sink/lookup under test use this one."""
    connection = _wait_until_ready(postgres_conninfo)
    try:
        yield connection
    finally:
        connection.close()


@pytest.fixture
def second_connection(postgres_conninfo: str) -> Iterator[psycopg.Connection]:
    """Open a SECOND, independent connection to the SAME container — for cross-connection reads."""
    connection = _wait_until_ready(postgres_conninfo)
    try:
        yield connection
    finally:
        connection.close()


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


def _row(**overrides: object) -> SeriesRow:
    """Build one valid market-series row — mirrors `test_write_series_row.py`'s helper."""
    columns: dict[str, object] = {
        "series_key_id": "a" * 64,
        "symbol": "BTCUSDT",
        "source": "binance_premium_index",
        "bucket_end": BUCKET_END_MS,
        "event_time": EVENT_TIME_MS,
        "available_at": EVENT_TIME_MS + 30_000,
        "availability_source": AvailabilitySource.OBSERVED,
        "ingested_at": EVENT_TIME_MS + 45_000,
        "observed_at": EVENT_TIME_MS + 46_000,
        "provenance": Provenance.OBSERVED,
        "src_label_raw": "2026-08-23 00:00:00",
        "observer_id": "vps-01",
        "observer_region": UNKNOWN_OBSERVER_REGION,
        "is_final": True,
        "value_raw": "78249.60000000",
    }
    columns.update(overrides)
    return SeriesRow(**columns)  # type: ignore[arg-type]


def _row_count(connection: psycopg.Connection) -> int:
    """`count(*)` over `md.series`, for tests that assert on how many rows landed."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT count(*) FROM md.series")
        (count,) = cursor.fetchone()  # type: ignore[misc]
        return int(count)


def test_ensure_schema_is_idempotent(postgres_connection: psycopg.Connection) -> None:
    """The DDL runs twice without error — `CREATE ... IF NOT EXISTS`, not a one-shot migration."""
    ensure_schema(postgres_connection)
    ensure_schema(postgres_connection)


def test_the_same_observed_row_delivered_twice_lands_once(
    postgres_connection: psycopg.Connection,
) -> None:
    """`D2.4`'s upsert-noop: two identical writes to the same key land as one row.

    `write_series_row` called twice with the IDENTICAL OBSERVED row (same `observed_at`, as a
    redelivered message would carry) leaves exactly one row — `ON CONFLICT (...) DO NOTHING` on
    the primary key, not a second insert.
    """
    ensure_schema(postgres_connection)
    lookup = PostgresObservedLookup(postgres_connection)
    sink = PostgresSeriesSink(postgres_connection)
    candidate = _row()

    first = write_series_row(candidate, lookup=lookup, sink=sink)
    second = write_series_row(candidate, lookup=lookup, sink=sink)

    assert first is WriteOutcome.ACCEPTED
    assert second is WriteOutcome.ACCEPTED
    assert _row_count(postgres_connection) == 1


def test_accept_commits_before_returning_so_a_second_connection_sees_it_immediately(
    postgres_connection: psycopg.Connection, second_connection: psycopg.Connection
) -> None:
    """`D2.3`: the commit lives INSIDE `accept`, not deferred to whoever calls it.

    `run_single_writer.py` only `ack`s the queue entry AFTER `write_series_row` returns, so the
    row must already be durable — visible to a wholly separate connection — the instant
    `accept` returns, well before any `ack` could run.
    """
    ensure_schema(postgres_connection)
    sink = PostgresSeriesSink(postgres_connection)
    candidate = _row()

    sink.accept(candidate)

    with second_connection.cursor() as cursor:
        cursor.execute(
            "SELECT count(*) FROM md.series WHERE series_key_id = %s AND symbol = %s "
            "AND source = %s AND bucket_end = %s AND observed_at = %s",
            (
                candidate.series_key_id,
                candidate.symbol,
                candidate.source,
                candidate.bucket_end,
                candidate.observed_at,
            ),
        )
        (count,) = cursor.fetchone()  # type: ignore[misc]
        assert count == 1


def test_observed_lookup_is_true_only_after_an_observed_row_lands(
    postgres_connection: psycopg.Connection,
) -> None:
    """`PostgresObservedLookup` flips from `False` to `True` once the write lands.

    Keyed on the bucket `(series_key_id, symbol, source, bucket_end)`, ignoring `observed_at`.
    """
    ensure_schema(postgres_connection)
    lookup = PostgresObservedLookup(postgres_connection)
    sink = PostgresSeriesSink(postgres_connection)
    candidate = _row()

    assert lookup.observed_already_present(candidate) is False

    sink.accept(candidate)

    later_observation = _row(observed_at=candidate.observed_at + 1)
    assert lookup.observed_already_present(later_observation) is True


def test_observed_lookup_ignores_a_modeled_row_for_the_same_bucket(
    postgres_connection: psycopg.Connection,
) -> None:
    """A `MODELADO` row landed for a bucket does NOT flip `observed_already_present`.

    Only an `OBSERVADO` row does (`use_cases/write_series_row.ObservedLookup` docstring).
    """
    ensure_schema(postgres_connection)
    lookup = PostgresObservedLookup(postgres_connection)
    sink = PostgresSeriesSink(postgres_connection)
    modeled = _row(
        provenance=Provenance.MODELED,
        availability_source=AvailabilitySource.MODELED,
        observed_at=EVENT_TIME_MS + 47_000,
    )

    sink.accept(modeled)

    assert lookup.observed_already_present(_row()) is False


_ALL_COLUMNS_SQL = (
    "SELECT series_key_id, symbol, source, bucket_end, event_time, available_at, "
    "availability_source, ingested_at, observed_at, provenance, src_label_raw, "
    "observer_id, observer_region, is_final, principal_id, value_raw FROM md.series "
    "WHERE series_key_id = %s AND symbol = %s AND source = %s AND bucket_end = %s "
    "AND observed_at = %s"
)


def test_accept_lands_every_one_of_the_16_columns_at_the_right_position(
    postgres_connection: psycopg.Connection,
) -> None:
    """Round-trip ALL 16 columns of `md.series`, not just the 5 that make up the key.

    `ADR-034/D7` added `value_raw` as the 16th. The other tests in this file only assert via
    `count(*)` or via the key columns
    (`series_key_id, symbol, source, bucket_end, observed_at`) — none of them reads back and
    compares the remaining 11 fields (`event_time`, `available_at`, `availability_source`,
    `ingested_at`, `src_label_raw`, `observer_id`, `observer_region`, `is_final`,
    `principal_id`, `value_raw`). A future refactor that reorders the `_INSERT_SQL` tuple in
    `PostgresSeriesSink.accept` (e.g. swapping `event_time`/`available_at`) would corrupt those
    columns silently — `T-01.6`/`ingest_health` and the future `T-07.12/13` consumer both read
    `event_time`/`available_at` from this table — while every other test here still passes.
    """
    ensure_schema(postgres_connection)
    sink = PostgresSeriesSink(postgres_connection)
    candidate = _row(is_final=False)

    sink.accept(candidate)

    with postgres_connection.cursor() as cursor:
        cursor.execute(
            _ALL_COLUMNS_SQL,
            (
                candidate.series_key_id,
                candidate.symbol,
                candidate.source,
                candidate.bucket_end,
                candidate.observed_at,
            ),
        )
        row = cursor.fetchone()

    assert row is not None
    (
        series_key_id,
        symbol,
        source,
        bucket_end,
        event_time,
        available_at,
        availability_source,
        ingested_at,
        observed_at,
        provenance,
        src_label_raw,
        observer_id,
        observer_region,
        is_final,
        principal_id,
        value_raw,
    ) = row

    assert series_key_id == candidate.series_key_id
    assert symbol == candidate.symbol
    assert source == candidate.source
    assert bucket_end == candidate.bucket_end
    assert event_time == candidate.event_time
    assert available_at == candidate.available_at
    assert availability_source == candidate.availability_source.value
    assert ingested_at == candidate.ingested_at
    assert observed_at == candidate.observed_at
    assert provenance == candidate.provenance.value
    assert src_label_raw == candidate.src_label_raw
    assert observer_id == candidate.observer_id
    assert observer_region == candidate.observer_region
    assert is_final == candidate.is_final
    assert principal_id == candidate.principal_id
    assert value_raw == candidate.value_raw


def test_the_provenance_check_constraint_bites_at_the_database(
    postgres_connection: psycopg.Connection,
) -> None:
    """The DDL's own `CHECK (provenance IN (...))` bites at the database.

    A defence at the boundary in case a row is ever inserted by something other than
    `PostgresSeriesSink`.
    """
    ensure_schema(postgres_connection)
    with (
        postgres_connection.cursor() as cursor,
        pytest.raises(psycopg.errors.CheckViolation),
    ):
        cursor.execute(
            "INSERT INTO md.series (series_key_id, symbol, source, bucket_end, event_time, "
            "available_at, availability_source, ingested_at, observed_at, provenance, "
            "src_label_raw, observer_id, observer_region, is_final, principal_id, value_raw) "
            "VALUES ('k', 'BTCUSDT', 'src', 1, 1, 1, 'OBSERVED', 1, 1, 'INVALIDO', 'lbl', "
            "'vps-01', 'unknown', true, NULL, '1.0')"
        )
    postgres_connection.rollback()


def test_a_human_row_without_principal_id_is_refused_by_the_database(
    postgres_connection: psycopg.Connection,
) -> None:
    """The DDL's `CHECK (provenance <> 'HUMANO' OR principal_id ...)` bites at the database.

    `SPEC-001` §4.4 enforced a second time at the storage boundary, not only in
    `SeriesRow.__post_init__`.
    """
    ensure_schema(postgres_connection)
    with (
        postgres_connection.cursor() as cursor,
        pytest.raises(psycopg.errors.CheckViolation),
    ):
        cursor.execute(
            "INSERT INTO md.series (series_key_id, symbol, source, bucket_end, event_time, "
            "available_at, availability_source, ingested_at, observed_at, provenance, "
            "src_label_raw, observer_id, observer_region, is_final, principal_id, value_raw) "
            "VALUES ('k', 'BTCUSDT', 'src', 1, 1, 1, 'OBSERVED', 1, 1, 'HUMANO', 'lbl', "
            "'vps-01', 'unknown', true, NULL, '1.0')"
        )
    postgres_connection.rollback()


def test_a_null_value_raw_is_refused_by_the_database(
    postgres_connection: psycopg.Connection,
) -> None:
    """`CA-F0-3`: `ADR-034/D7`'s `value_raw TEXT NOT NULL` bites at the database.

    A defence at the boundary, the same reasoning `test_the_provenance_check_constraint_bites_
    at_the_database` already applies to `provenance` — a row inserted by something other than
    `PostgresSeriesSink`/`SeriesRow` cannot land without a value.
    """
    ensure_schema(postgres_connection)
    with (
        postgres_connection.cursor() as cursor,
        pytest.raises(psycopg.errors.NotNullViolation),
    ):
        cursor.execute(
            "INSERT INTO md.series (series_key_id, symbol, source, bucket_end, event_time, "
            "available_at, availability_source, ingested_at, observed_at, provenance, "
            "src_label_raw, observer_id, observer_region, is_final, principal_id, value_raw) "
            "VALUES ('k', 'BTCUSDT', 'src', 1, 1, 1, 'OBSERVED', 1, 1, 'OBSERVADO', 'lbl', "
            "'vps-01', 'unknown', true, NULL, NULL)"
        )
    postgres_connection.rollback()
