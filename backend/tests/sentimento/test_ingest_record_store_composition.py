"""`T-02.4`: the ONE `compose_ingest_record_store` every composition root shares (`ADR-031/D1`)."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import psycopg
import pytest

from src.modules.sentimento.infra.ingest_record_store_composition import (
    IngestRecordStoreConfigurationError,
    IngestRecordStoreConnectionError,
    compose_ingest_record_store,
)
from src.modules.sentimento.infra.postgres_ingest_record_store import PostgresIngestRecordStore
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore

_REQUIRED_POSTGRES_ENVIRON = {
    "INGEST_RECORD_BACKEND": "postgres",
    "POSTGRES_DB": "test",
    "POSTGRES_USER": "test",
    "POSTGRES_PASSWORD": "test",
}


# ── `sqlite` (the default) — never touches the network ────────────────────────────────────


def test_default_backend_is_sqlite_over_the_default_path() -> None:
    """An empty environment composes `SqliteIngestRecordStore` at the documented default path."""
    store = compose_ingest_record_store({})
    assert isinstance(store, SqliteIngestRecordStore)
    assert store.path == Path("data/md/ingest_health.sqlite3")


def test_explicit_sqlite_backend_honours_ingest_health_store_path(tmp_path: Path) -> None:
    """`INGEST_HEALTH_STORE_PATH` is read for `sqlite`, never silently ignored."""
    custom = tmp_path / "custom.sqlite3"
    store = compose_ingest_record_store(
        {"INGEST_RECORD_BACKEND": "sqlite", "INGEST_HEALTH_STORE_PATH": str(custom)}
    )
    assert isinstance(store, SqliteIngestRecordStore)
    assert store.path == custom


# ── the closed set — an unknown value refuses, naming `INGEST_RECORD_BACKEND` ──────────────


def test_an_unknown_backend_refuses_naming_the_variable() -> None:
    """A value outside `{sqlite, postgres}` refuses before anything else is resolved."""
    with pytest.raises(IngestRecordStoreConfigurationError) as excinfo:
        compose_ingest_record_store({"INGEST_RECORD_BACKEND": "foo"})
    assert excinfo.value.variable == "INGEST_RECORD_BACKEND"
    assert "INGEST_RECORD_BACKEND" in str(excinfo.value)


# ── `postgres` — every var resolved BEFORE the one `connect` call ─────────────────────────


def _fake_connection() -> psycopg.Connection[Any]:
    """Return a trivial double — `compose_ingest_record_store` never calls a method on it."""
    return object()  # type: ignore[return-value]


def test_postgres_backend_composes_with_defaults_and_an_injected_connect() -> None:
    """`POSTGRES_HOST`/`_PORT` default to `postgres`/`5432` — the compose service name/port."""
    seen_conninfo: list[str] = []

    def _connect(conninfo: str) -> psycopg.Connection[Any]:
        seen_conninfo.append(conninfo)
        return _fake_connection()

    store = compose_ingest_record_store(_REQUIRED_POSTGRES_ENVIRON, connect=_connect)
    assert isinstance(store, PostgresIngestRecordStore)
    assert len(seen_conninfo) == 1
    assert "host=postgres" in seen_conninfo[0]
    assert "port=5432" in seen_conninfo[0]
    assert "dbname=test" in seen_conninfo[0]


def test_postgres_host_and_port_are_overridable() -> None:
    """An explicit `POSTGRES_HOST`/`POSTGRES_PORT` overrides the compose-network defaults."""
    seen_conninfo: list[str] = []
    environ = {
        **_REQUIRED_POSTGRES_ENVIRON,
        "POSTGRES_HOST": "db.internal",
        "POSTGRES_PORT": "6543",
    }

    def _connect(conninfo: str) -> psycopg.Connection[Any]:
        seen_conninfo.append(conninfo)
        return _fake_connection()

    compose_ingest_record_store(environ, connect=_connect)
    assert "host=db.internal" in seen_conninfo[0]
    assert "port=6543" in seen_conninfo[0]


@pytest.mark.parametrize("missing", ["POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD"])
def test_postgres_backend_refuses_a_missing_required_var_naming_it(missing: str) -> None:
    """`POSTGRES_DB`/`_USER`/`_PASSWORD` have no default — absent, they refuse naming themselves.

    Refused BEFORE `connect` is ever called (asserted below) — a missing credential is a
    configuration mistake, never a network failure.
    """
    environ = {k: v for k, v in _REQUIRED_POSTGRES_ENVIRON.items() if k != missing}
    calls: list[str] = []

    def _connect(conninfo: str) -> psycopg.Connection[Any]:
        calls.append(conninfo)
        return _fake_connection()

    with pytest.raises(IngestRecordStoreConfigurationError) as excinfo:
        compose_ingest_record_store(environ, connect=_connect)
    assert excinfo.value.variable == missing
    assert missing in str(excinfo.value)
    assert calls == [], "a missing credential must never reach `connect`"


def test_postgres_backend_refuses_an_unparseable_port_naming_it() -> None:
    """`POSTGRES_PORT` that does not parse as `int` refuses, never silently truncated."""
    environ = {**_REQUIRED_POSTGRES_ENVIRON, "POSTGRES_PORT": "not-a-port"}
    with pytest.raises(IngestRecordStoreConfigurationError) as excinfo:
        compose_ingest_record_store(environ)
    assert excinfo.value.variable == "POSTGRES_PORT"


def test_postgres_with_ingest_health_store_path_set_is_not_an_error() -> None:
    """`ADR-031` consequences: `postgres` + a present `INGEST_HEALTH_STORE_PATH` composes clean.

    The var is inherited unconditionally from `.env.example` (`SPEC-003`) and every compose
    target sets `INGEST_RECORD_BACKEND=postgres` without also deleting it — this proves the
    combination never raises, over the sqlite-only var it deliberately never reads.
    """
    environ = {**_REQUIRED_POSTGRES_ENVIRON, "INGEST_HEALTH_STORE_PATH": "/some/sqlite/path"}
    store = compose_ingest_record_store(environ, connect=lambda _conninfo: _fake_connection())
    assert isinstance(store, PostgresIngestRecordStore)


# ── the network-touching failure, and the falsifier that matters: NO retry ────────────────


class _CountingRefusingConnect:
    """A `connect` double that always fails, counting how many times it was called."""

    def __init__(self) -> None:
        """Start at zero calls."""
        self.call_count = 0

    def __call__(self, conninfo: str) -> psycopg.Connection[Any]:  # noqa: ARG002
        """Record the attempt, then refuse exactly like a real unreachable server would."""
        self.call_count += 1
        raise psycopg.OperationalError("simulated: connection refused")


def test_a_refused_postgres_connection_raises_naming_postgres_host() -> None:
    """`connect` failing surfaces as `IngestRecordStoreConnectionError`, naming `POSTGRES_HOST`."""
    connect = _CountingRefusingConnect()
    with pytest.raises(IngestRecordStoreConnectionError) as excinfo:
        compose_ingest_record_store(_REQUIRED_POSTGRES_ENVIRON, connect=connect)
    assert excinfo.value.variable == "POSTGRES_HOST"
    assert "POSTGRES_HOST" in str(excinfo.value)


def test_a_refused_postgres_connection_is_attempted_exactly_once_never_retried() -> None:
    """`D2.5` morde: a retry loop would call `connect` more than once — this pins it at 1.

    `timeout 10` killing a real subprocess with `rc=124` is the falsifier's PROCESS-level
    shape (`D2.5`); this is the same property proven at the unit level, without needing a
    live, unreachable Postgres on the wire — a naive `while True: connect()` would fail this
    assertion immediately (`call_count` would never settle at 1), and would also never return
    at all, which is exactly what a real `timeout 10` would then have to kill.
    """
    connect = _CountingRefusingConnect()
    started = time.monotonic()
    with pytest.raises(IngestRecordStoreConnectionError):
        compose_ingest_record_store(_REQUIRED_POSTGRES_ENVIRON, connect=connect)
    elapsed = time.monotonic() - started
    assert connect.call_count == 1, f"connect() was called {connect.call_count} times, not 1"
    assert elapsed < 1.0, f"a single failed call took {elapsed:.2f}s — no retry should be this slow"
