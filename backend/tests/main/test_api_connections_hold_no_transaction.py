"""The API's Postgres connections never sit `idle in transaction` — WI, `D-2` (2026-09-27).

The incident (`docs/context/candle-real-e-eixo-unico/gates/ESCALADO-api-idle-in-transaction.md`):
`create_app` opened its two long-lived `psycopg` connections with psycopg 3's default
`autocommit=False`, and no read method the API calls ever `commit`s. The FIRST `SELECT` opened
an implicit transaction that never closed, holding `AccessShareLock` on every relation it read
until the API restarted — and the collector's boot `ALTER TABLE` queued behind it, stalling
ingestion in silence. The fix is `connect=connect_autocommit` at both `create_app` call sites.

Each test below names the case it REJECTS:

- `test_served_api_leaves_no_session_idle_in_transaction` — the REAL composed `app` (no
  `dependency_overrides` written by hand), served over a real socket, after one request to
  every route that touches Postgres. Rejects: any app session left `idle in transaction`
  (measured on `pg_stat_activity`, with the universe asserted non-empty so `0` over no sessions
  cannot pass).
- `test_served_api_does_not_block_a_boot_alter` — same served app; rejects the damage itself:
  an `ALTER TABLE` on `md.series` / `md.ingest_run` under `lock_timeout = 2s` failing with
  `LockNotAvailable`.
- `test_default_composition_stays_transactional_for_writer_and_collector` — rejects someone
  "fixing" this by flipping the DEFAULT `connect` of the shared composition functions, which
  would hand `autocommit` to the writer and the collector (`D-2` excludes both).
- `test_pgoptions_reaches_a_composed_connection` — rejects a future `options=` in
  `_postgres_conninfo`, which would make libpq silently ignore the `PGOPTIONS` that
  `deploy/compose.yml` pins on the `api` service.

Ablation recorded in `docs/context/paineis-de-fluxo/gates/WI-builder.md`: removing
`connect=connect_autocommit` from either `create_app` call site makes the first test fail, and
the `ALTER` case of the table that call site's connection reads.
The Postgres is the suite's ephemeral container (`tests/helpers/postgres.py`), never a shared one.
"""

from __future__ import annotations

import http.client
import inspect
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Final

import psycopg
import pytest
import uvicorn
from fastapi import FastAPI
from psycopg import errors, pq

from src.main import create_app
from src.modules.sentimento.infra.ingest_record_store_composition import (
    compose_ingest_record_store,
    compose_postgres_connection,
    connect_autocommit,
)
from src.modules.sentimento.infra.postgres_ingest_record_store import PostgresIngestRecordStore
from src.modules.sentimento.infra.postgres_series_sink import ensure_schema
from src.modules.sentimento.use_cases.series_catalog import list_series_catalog
from tests.helpers.postgres import DatabaseFactory, PostgresDatabase

_STARTUP_POLL_S: Final[float] = 0.005
_JOIN_TIMEOUT_S: Final[float] = 5.0
_HTTP_TIMEOUT_S: Final[float] = 5.0

_POSTGRES_USER: Final[str] = "api_reader"
_POSTGRES_PASSWORD: Final[str] = "do-not-leak-me"  # noqa: S105 - throwaway role password

_KLINES_LAST_ENTRY = next(
    entry for entry in list_series_catalog().entries if entry.key.metric == "klines_last"
)
_SERIES_KEY_ID: Final[str] = _KLINES_LAST_ENTRY.key.series_key_id()
_BUCKET_END_MS: Final[int] = 1_757_339_400_000

_SERIES_HISTORY_PATH: Final[str] = (
    f"/api/v1/series-history?series_key_id={_SERIES_KEY_ID}&symbol=BTCUSDT&interval=1m"
    f"&window_start_ms={_BUCKET_END_MS}&window_end_ms={_BUCKET_END_MS}"
    f"&knowledge_time_ms={_BUCKET_END_MS + 100_000}&bar_policy=final_only"
)
# Every route `create_app` wires to a Postgres connection: `/ready` (information_schema, conn A),
# `/ingest-health` + `/collector-status` (`md.ingest_run`/`md.ingest_gap`, conn A),
# `/series-history` (`read_window` + `read_bounds` on `md.series`, conn B).
_POSTGRES_ROUTES: Final[tuple[str, ...]] = (
    "/api/v1/ready",
    "/api/v1/ingest-health",
    "/api/v1/collector-status",
    _SERIES_HISTORY_PATH,
)

_IDLE_IN_TRANSACTION_SQL: Final[str] = (
    "SELECT count(*), count(*) FILTER (WHERE state LIKE 'idle in transaction%%') "
    "FROM pg_stat_activity WHERE datname = %s AND pid <> pg_backend_pid()"
)


@pytest.fixture
def _database(
    monkeypatch: pytest.MonkeyPatch, postgres_database_factory: DatabaseFactory
) -> PostgresDatabase:
    """Create a fresh database with both schemas and point `create_app()`'s env at it."""
    database = postgres_database_factory(user=_POSTGRES_USER, password=_POSTGRES_PASSWORD)
    with database.connect() as connection:
        PostgresIngestRecordStore(connection).initialise()
        ensure_schema(connection)
    monkeypatch.setenv("INGEST_RECORD_BACKEND", "postgres")
    for variable, value in database.env().items():
        monkeypatch.setenv(variable, value)
    return database


@contextmanager
def _served(app: FastAPI) -> Iterator[int]:
    """Run `app` on a real loopback socket, in-thread, and yield the port it bound."""
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=0, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    while not server.started:
        time.sleep(_STARTUP_POLL_S)
    port = server.servers[0].sockets[0].getsockname()[1]
    try:
        yield port
    finally:
        server.should_exit = True
        thread.join(timeout=_JOIN_TIMEOUT_S)


def _get_status(port: int, path: str) -> int:
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=_HTTP_TIMEOUT_S)
    try:
        connection.request("GET", path)
        response = connection.getresponse()
        response.read()
        return response.status
    finally:
        connection.close()


def _admin(database: PostgresDatabase) -> psycopg.Connection:
    return psycopg.connect(database.conninfo, autocommit=True)


@contextmanager
def _api_after_every_postgres_route() -> Iterator[None]:
    """Serve the REAL composed `app`, hit every Postgres route once, and keep it running."""
    app = create_app()
    with _served(app) as port:
        statuses = {path: _get_status(port, path) for path in _POSTGRES_ROUTES}
        # A route that `500`s would prove nothing about the leak — every one must answer.
        assert all(status == 200 for status in statuses.values()), statuses
        yield


def test_served_api_leaves_no_session_idle_in_transaction(_database: PostgresDatabase) -> None:
    """After a request to every Postgres route, no app session holds a transaction open."""
    with _api_after_every_postgres_route(), _admin(_database) as admin:
        row = admin.execute(_IDLE_IN_TRANSACTION_SQL, (_database.dbname,)).fetchone()
    assert row is not None
    app_sessions, idle_in_transaction = row
    # `0` idle over an EMPTY universe is the ambiguous `rc=0`: both of `create_app`'s
    # connections (ingest store + window reader) must be there to be measured.
    assert app_sessions >= 2, f"expected >= 2 app sessions, saw {app_sessions}"
    assert idle_in_transaction == 0, (
        f"{idle_in_transaction} of {app_sessions} app sessions left idle in transaction"
    )


@pytest.mark.parametrize("table", ["md.series", "md.ingest_run"])
def test_served_api_does_not_block_a_boot_alter(_database: PostgresDatabase, table: str) -> None:
    """The damage, not only the state: the collector's boot `ALTER TABLE` must not queue."""
    with _api_after_every_postgres_route(), _admin(_database) as admin:
        admin.execute("SET lock_timeout = '2s'")
        try:
            admin.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS _wi_probe int")
        except errors.LockNotAvailable as error:
            pytest.fail(f"ALTER TABLE {table} queued behind an API session: {error}")


def test_default_composition_stays_transactional_for_writer_and_collector(
    _database: PostgresDatabase,
) -> None:
    """The shared functions' DEFAULT `connect` is still plain `psycopg.connect` (not autocommit)."""
    for function in (compose_postgres_connection, compose_ingest_record_store):
        default = inspect.signature(function).parameters["connect"].default
        assert default is psycopg.connect, f"{function.__name__} default connect changed"

    environ = _database.env()
    with compose_postgres_connection(environ) as default_connection:
        assert default_connection.autocommit is False
        default_connection.execute("SELECT 1").fetchone()
        assert default_connection.info.transaction_status is pq.TransactionStatus.INTRANS

    with compose_postgres_connection(environ, connect=connect_autocommit) as api_connection:
        assert api_connection.autocommit is True
        api_connection.execute("SELECT 1").fetchone()
        assert api_connection.info.transaction_status is pq.TransactionStatus.IDLE


def test_pgoptions_reaches_a_composed_connection(
    _database: PostgresDatabase, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Prove libpq applies `PGOPTIONS` — it would not if the conninfo carried `options=`."""
    monkeypatch.setenv("PGOPTIONS", "-c idle_in_transaction_session_timeout=30s")
    with compose_postgres_connection(_database.env(), connect=connect_autocommit) as connection:
        row = connection.execute("SHOW idle_in_transaction_session_timeout").fetchone()
    assert row == ("30s",)
