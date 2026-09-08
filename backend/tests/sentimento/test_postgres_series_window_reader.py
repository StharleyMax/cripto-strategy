"""`PostgresSeriesWindowReader` over a REAL, ephemeral TimescaleDB — `ADR-034/D9`, item 1.

Same idiom `test_postgres_series_sink.py` already uses for a throwaway container: skipped (not
failed) when `docker` is not on `PATH`, so an environment without Docker still gets a green,
meaningful suite — it only loses the tests that prove the `SELECT` against a real engine.
"""

from __future__ import annotations

import shutil
import subprocess
import time
import uuid
from collections.abc import Iterator
from decimal import Decimal

import psycopg
import pytest

from src.modules.sentimento.domain.provenance import (
    UNKNOWN_OBSERVER_REGION,
    AvailabilitySource,
    Provenance,
    SeriesRow,
)
from src.modules.sentimento.infra.postgres_series_sink import PostgresSeriesSink, ensure_schema
from src.modules.sentimento.infra.postgres_series_window_reader import (
    InvalidLookbackError,
    PostgresSeriesWindowReader,
)

pytestmark = pytest.mark.skipif(
    shutil.which("docker") is None, reason="docker not on PATH — see module docstring"
)

_IMAGE = "timescale/timescaledb:2.17.2-pg15"
_CONTAINER_NAME_PREFIX = "t-01-1-series-window-reader-test-"
_READY_TIMEOUT_S = 30.0

SERIES_KEY_ID = "a" * 64
SYMBOL = "BTCUSDT"
BUCKET_END_MS = 1_620_000_000_000
GRID_MS = 60_000


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
    """One connection to the throwaway container, with `md.series` already created."""
    connection = _wait_until_ready(postgres_conninfo)
    ensure_schema(connection)
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
    """Build one valid market-series row, defaulting to `(SERIES_KEY_ID, SYMBOL)`."""
    columns: dict[str, object] = {
        "series_key_id": SERIES_KEY_ID,
        "symbol": SYMBOL,
        "source": "binance",
        "bucket_end": BUCKET_END_MS,
        "event_time": BUCKET_END_MS,
        "available_at": BUCKET_END_MS,
        "availability_source": AvailabilitySource.OBSERVED,
        "ingested_at": BUCKET_END_MS,
        "observed_at": BUCKET_END_MS,
        "provenance": Provenance.OBSERVED,
        "src_label_raw": "sumOpenInterest",
        "observer_id": "vps-01",
        "observer_region": UNKNOWN_OBSERVER_REGION,
        "is_final": True,
        "value_raw": "1234.56",
    }
    columns.update(overrides)
    return SeriesRow(**columns)  # type: ignore[arg-type]


def test_read_window_returns_the_row_inside_the_window_decoded_to_decimal(
    postgres_connection: psycopg.Connection,
) -> None:
    """One row landed via the real sink comes back as an `Observation` with `Decimal(value_raw)`."""
    PostgresSeriesSink(postgres_connection).accept(_row())
    reader = PostgresSeriesWindowReader(postgres_connection)

    observations = reader.read_window(
        series_key_id=SERIES_KEY_ID,
        symbol=SYMBOL,
        window_start_ms=BUCKET_END_MS,
        window_end_ms=BUCKET_END_MS,
        lookback_ms=GRID_MS,
    )

    assert len(observations) == 1
    assert observations[0].value == Decimal("1234.56")
    assert observations[0].row.bucket_end == BUCKET_END_MS
    assert observations[0].row.series_key_id == SERIES_KEY_ID


def test_read_window_excludes_a_row_before_the_lookback_horizon(
    postgres_connection: psycopg.Connection,
) -> None:
    """A row older than `window_start_ms - lookback_ms` is out of range — never returned."""
    too_old = _row(bucket_end=BUCKET_END_MS - 10 * GRID_MS, event_time=BUCKET_END_MS - 10 * GRID_MS)
    PostgresSeriesSink(postgres_connection).accept(too_old)
    reader = PostgresSeriesWindowReader(postgres_connection)

    observations = reader.read_window(
        series_key_id=SERIES_KEY_ID,
        symbol=SYMBOL,
        window_start_ms=BUCKET_END_MS,
        window_end_ms=BUCKET_END_MS,
        lookback_ms=GRID_MS,
    )

    assert observations == ()


def test_read_window_excludes_a_row_after_the_window_end(
    postgres_connection: psycopg.Connection,
) -> None:
    """A row past `window_end_ms` is out of range — never returned, even inside the lookback."""
    future = _row(bucket_end=BUCKET_END_MS + GRID_MS, event_time=BUCKET_END_MS + GRID_MS)
    PostgresSeriesSink(postgres_connection).accept(future)
    reader = PostgresSeriesWindowReader(postgres_connection)

    observations = reader.read_window(
        series_key_id=SERIES_KEY_ID,
        symbol=SYMBOL,
        window_start_ms=BUCKET_END_MS,
        window_end_ms=BUCKET_END_MS,
        lookback_ms=GRID_MS,
    )

    assert observations == ()


def test_read_window_filters_by_series_key_id_and_symbol(
    postgres_connection: psycopg.Connection,
) -> None:
    """A row for a DIFFERENT series or symbol never leaks into this window's answer."""
    PostgresSeriesSink(postgres_connection).accept(_row(series_key_id="b" * 64))
    PostgresSeriesSink(postgres_connection).accept(_row(symbol="ETHUSDT"))
    reader = PostgresSeriesWindowReader(postgres_connection)

    observations = reader.read_window(
        series_key_id=SERIES_KEY_ID,
        symbol=SYMBOL,
        window_start_ms=BUCKET_END_MS,
        window_end_ms=BUCKET_END_MS,
        lookback_ms=GRID_MS,
    )

    assert observations == ()


class _UnreachableConnection:
    """A `psycopg.Connection` stand-in whose `cursor()` fails the test if ever called."""

    def cursor(self) -> object:
        raise AssertionError("read_window must refuse a negative lookback_ms before any query")


def test_read_window_refuses_a_negative_lookback_ms_before_touching_the_connection() -> None:
    """A negative `lookback_ms` can never satisfy `ADR-034/D9` — refused, no query attempted."""
    reader = PostgresSeriesWindowReader(_UnreachableConnection())  # type: ignore[arg-type]

    with pytest.raises(InvalidLookbackError, match="negative"):
        reader.read_window(
            series_key_id=SERIES_KEY_ID,
            symbol=SYMBOL,
            window_start_ms=BUCKET_END_MS,
            window_end_ms=BUCKET_END_MS,
            lookback_ms=-1,
        )
