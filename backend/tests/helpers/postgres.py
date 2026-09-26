"""One TimescaleDB per test SESSION, one fresh database per TEST — the suite's shared Postgres.

Until 2026-09-26 nine test files each ran `docker run` for a new container PER TEST (~3.3 s of
setup apiece, ~149 s of a 451 s suite) `[MEDIDO 2026-09-26: pytest --durations=60, n=2728]`,
with `_run_docker`/`_wait_until_ready` copied into every file. This module replaces all of it.

Isolation is per DATABASE, not per schema and not by `TRUNCATE`: production code hard-codes its
schema names (`md.*`, `backtest.*`), and some tests need the schema ABSENT before `initialise()`
runs (a readiness report of `(False, False)`, a pre-migration table the test creates itself).
A new database cloned from `template1` gives each test exactly what its own container used to:
the Timescale image installs the `timescaledb` extension into `template1` at init, so a fresh
database starts in the same state `POSTGRES_DB` did.

The image is the one `deploy/compose.yml` runs, so the engine under test is the production one.
"""

from __future__ import annotations

import shutil
import uuid
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field

import psycopg
import pytest
from psycopg import sql

IMAGE = "timescale/timescaledb:2.17.2-pg15"
_ADMIN = "test"


@dataclass(frozen=True)
class PostgresDatabase:
    """Coordinates of one throwaway database on the session's server."""

    host: str
    port: int
    dbname: str
    user: str
    password: str

    @property
    def conninfo(self) -> str:
        """Return the `psycopg` conninfo for this database."""
        return (
            f"host={self.host} port={self.port} dbname={self.dbname} "
            f"user={self.user} password={self.password}"
        )

    def env(self) -> dict[str, str]:
        """Return the `POSTGRES_*` variables production config reads, pointed at this database."""
        return {
            "POSTGRES_HOST": self.host,
            "POSTGRES_PORT": str(self.port),
            "POSTGRES_DB": self.dbname,
            "POSTGRES_USER": self.user,
            "POSTGRES_PASSWORD": self.password,
        }

    def connect(self) -> psycopg.Connection:
        """Open a new connection to this database."""
        return psycopg.connect(self.conninfo)


@dataclass
class PostgresServer:
    """The session's running container, reachable on a loopback port."""

    host: str
    port: int
    _created: list[tuple[str, str | None]] = field(default_factory=list)

    def _admin(self) -> psycopg.Connection:
        return psycopg.connect(
            f"host={self.host} port={self.port} dbname={_ADMIN} user={_ADMIN} password={_ADMIN}",
            autocommit=True,
        )

    def create_database(
        self, *, user: str | None = None, password: str | None = None
    ) -> PostgresDatabase:
        """Create an empty database, optionally owned by a new login role with these credentials."""
        dbname = f"t_{uuid.uuid4().hex[:12]}"
        with self._admin() as admin:
            owner = _ADMIN
            if user is not None:
                owner = user
                admin.execute(
                    sql.SQL("CREATE ROLE {} LOGIN SUPERUSER PASSWORD {}").format(
                        sql.Identifier(user), sql.Literal(password or "")
                    )
                )
            admin.execute(
                sql.SQL("CREATE DATABASE {} OWNER {}").format(
                    sql.Identifier(dbname), sql.Identifier(owner)
                )
            )
        self._created.append((dbname, user))
        return PostgresDatabase(
            host=self.host,
            port=self.port,
            dbname=dbname,
            user=owner,
            password=_ADMIN if user is None else (password or ""),
        )

    def drop_created(self) -> None:
        """Drop every database (and role) created since the last call."""
        with self._admin() as admin:
            while self._created:
                dbname, user = self._created.pop()
                admin.execute(
                    sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(
                        sql.Identifier(dbname)
                    )
                )
                if user is not None:
                    admin.execute(sql.SQL("DROP ROLE IF EXISTS {}").format(sql.Identifier(user)))


def start_server() -> Iterator[PostgresServer]:
    """Start the session's container, or skip when this host has no Docker."""
    if shutil.which("docker") is None:
        pytest.skip("docker not on PATH — Postgres-backed tests need the real engine")
    from testcontainers.community.postgres import PostgresContainer

    container = PostgresContainer(
        IMAGE, username=_ADMIN, password=_ADMIN, dbname=_ADMIN, driver=None
    )
    try:
        container.start()
    except Exception as error:  # noqa: BLE001 — any failure to start means "no engine here"
        pytest.skip(f"could not start {IMAGE}: {error}")
    try:
        yield PostgresServer(host="127.0.0.1", port=int(container.get_exposed_port(5432)))
    finally:
        container.stop()


DatabaseFactory = Callable[..., PostgresDatabase]
