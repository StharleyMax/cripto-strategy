"""ONE composition for `md.ingest_run`/`md.ingest_gap` by `INGEST_RECORD_BACKEND` (`ADR-031/D1`).

`T-02.4`'s whole point: `collectors_cli`, `single_writer_cli` (`T-02.5`) and `src.main`
(`T-02.6`) are three different composition roots, and each one used to be free to build a
`SqliteIngestRecordStore` its own way — a config drift waiting to happen, since a fourth
composition root reading `INGEST_RECORD_BACKEND` slightly differently is exactly how three
call sites agreeing today stop agreeing tomorrow, silently. This module is the ONE function
all three call, so `sqlite`|`postgres`, the defaults, and the refusal shape live in exactly
one place. Composing IS this module's job; opening a connection anywhere else is not (`ADR-
031/D1`, "conexao injetada, nunca aberta pelo adaptador" — the store adapters take an
already-open connection, and THIS module is what opens it for them).

`INGEST_RECORD_BACKEND` in {`sqlite`, `postgres`}, default `sqlite` — dev and the offline
suite never have to set it. `postgres` reads `POSTGRES_HOST`/`POSTGRES_PORT` (new here,
default `postgres`/`5432` — `postgres` is the compose service name, `deploy/compose.yml`,
so a process running IN that network needs no override) plus `POSTGRES_DB`/`POSTGRES_USER`/
`POSTGRES_PASSWORD`, already required by the same compose file (`ADR-031/D2`'s image).
`INGEST_HEALTH_STORE_PATH` is read ONLY for `sqlite` — present-but-unused under `postgres` is
NOT an error (`ADR-031` consequences: "a SPEC exige que a combinacao postgres +
INGEST_HEALTH_STORE_PATH presente NAO seja erro"), because the var is inherited unconditionally
from `.env.example` (`SPEC-003`) and every compose target sets `INGEST_RECORD_BACKEND=postgres`
without having to also delete it.

AN UNKNOWN VALUE OR AN UNREACHABLE POSTGRES BOTH REFUSE, NAMING THE VARIABLE, NEVER RETRYING —
`RN-4`/`ADR-029/D3`. `IngestRecordStoreConfigurationError` covers everything decidable without
touching the network (bad backend value, a malformed `POSTGRES_PORT`, a missing required
Postgres var); `IngestRecordStoreConnectionError` covers the one thing that DOES touch the
network (the `psycopg.connect` call itself failing). `connect` is injected (defaulting to
`psycopg.connect`) for the exact reason `collectors_cli.connect_redis` injects `open_socket`:
the offline suite proves the "no retry, no hang" contract by counting calls to a fake instead
of needing a live, unreachable Postgres on the wire (`tests/sentimento/
test_ingest_record_store_composition.py`). There is exactly ONE call to `connect` in the
`postgres` path below — no loop, no retry decorator — which is what keeps `timeout 10` a
falsifier that actually bites a regression instead of a property nothing enforces.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any, Final, Protocol

import psycopg

from src.modules.sentimento.domain.ingest_record import IngestGap, IngestRun
from src.modules.sentimento.infra.postgres_ingest_record_store import PostgresIngestRecordStore
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore

INGEST_RECORD_BACKEND_VAR: Final[str] = "INGEST_RECORD_BACKEND"
INGEST_HEALTH_STORE_PATH_VAR: Final[str] = "INGEST_HEALTH_STORE_PATH"
POSTGRES_HOST_VAR: Final[str] = "POSTGRES_HOST"
POSTGRES_PORT_VAR: Final[str] = "POSTGRES_PORT"
POSTGRES_DB_VAR: Final[str] = "POSTGRES_DB"
POSTGRES_USER_VAR: Final[str] = "POSTGRES_USER"
POSTGRES_PASSWORD_VAR: Final[str] = "POSTGRES_PASSWORD"  # noqa: S105 - a var NAME, not a secret

_SQLITE_BACKEND: Final[str] = "sqlite"
_POSTGRES_BACKEND: Final[str] = "postgres"

# The closed set every composition root validates `INGEST_RECORD_BACKEND` against — imported,
# never re-typed, by every caller (`collectors_cli.resolve_boot_config` included) so the set
# of accepted values can only drift by editing this one line.
KNOWN_INGEST_RECORD_BACKENDS: Final[frozenset[str]] = frozenset(
    {_SQLITE_BACKEND, _POSTGRES_BACKEND}
)

DEFAULT_INGEST_RECORD_BACKEND: Final[str] = _SQLITE_BACKEND
# Same default every composition root used before this module existed — one decision read
# twice, not two decisions (`collectors_cli.py`'s own comment on its now-removed duplicate).
DEFAULT_INGEST_HEALTH_STORE_PATH: Final[str] = "data/md/ingest_health.sqlite3"
DEFAULT_POSTGRES_HOST: Final[str] = "postgres"
DEFAULT_POSTGRES_PORT: Final[int] = 5432

# Bounds the ONE `psycopg.connect` attempt below — `D2.5`'s falsifier ("retry infinito -> timeout
# 10 devolve 124") needs the whole boot to resolve well inside a 10s outer timeout; this leaves
# margin for Redis's own `_REDIS_CONNECT_TIMEOUT_S` (3s, `collectors_cli.py`) to run first.
_POSTGRES_CONNECT_TIMEOUT_S: Final[int] = 5


class IngestRecordStoreConfigurationError(RuntimeError):
    """A value could be resolved WITHOUT touching the network, and it was invalid.

    Covers an `INGEST_RECORD_BACKEND` outside `KNOWN_INGEST_RECORD_BACKENDS`, a `POSTGRES_PORT`
    that does not parse as `int`, or a required Postgres var (`POSTGRES_DB`/`_USER`/`_PASSWORD`)
    left unset. `variable` names the exact offender, same contract as
    `collectors_cli.CollectorBootConfigurationError`.
    """

    def __init__(self, variable: str, message: str) -> None:
        """Bind the offending variable name alongside the human-readable `message`."""
        super().__init__(message)
        self.variable = variable


class IngestRecordStoreConnectionError(RuntimeError):
    """Postgres could not be reached — the ONE network-touching failure this module raises.

    Always names `POSTGRES_HOST`: that is the value an operator changes to point the process
    at a reachable instance, exactly like `CollectorBootConnectionError` always names
    `REDIS_HOST` regardless of which Redis step failed.
    """

    def __init__(self, variable: str, message: str) -> None:
        """Bind `variable` (always `POSTGRES_HOST`) alongside the human-readable `message`."""
        super().__init__(message)
        self.variable = variable


class IngestRecordStore(Protocol):
    """The 6-method surface `ADR-031/D1` requires of BOTH engines — no 7th method, no coercion.

    `SqliteIngestRecordStore` and `PostgresIngestRecordStore` satisfy this structurally; neither
    imports the other, and neither imports this module — a composition root asks for one of
    them by calling `compose_ingest_record_store` and types the result as this Protocol,
    exactly the way `IngestRecordSource` (`use_cases/ingest_health.py`) types the read-only
    half. Declaring it HERE, not in `use_cases`, keeps `psycopg` (imported transitively by
    `PostgresIngestRecordStore`, referenced by `compose_ingest_record_store` below) inside
    `infra` — the boundary `import-linter`'s "O motor de armazenamento nao vaza para fora de
    infra (ADR-014/D1d)" contract enforces as a gate, not a convention.
    """

    def initialise(self) -> None: ...  # noqa: D102 (Protocol methods carry no body to document)

    def record_run(self, run: IngestRun) -> None: ...  # noqa: D102

    def record_gap(self, gap: IngestGap) -> None: ...  # noqa: D102

    def describe_readiness(self) -> tuple[bool, bool]: ...  # noqa: D102

    def runs(self) -> tuple[IngestRun, ...]: ...  # noqa: D102

    def gaps(self) -> tuple[IngestGap, ...]: ...  # noqa: D102


def _require(environ: Mapping[str, str], variable: str) -> str:
    """Return `environ[variable]`, or refuse naming it — never a silent empty default.

    Used only for the three Postgres vars the compose file already requires (`POSTGRES_DB`,
    `_USER`, `_PASSWORD`): unlike `POSTGRES_HOST`/`_PORT`, these have no sensible default
    because a wrong guess would silently point at someone else's database.
    """
    value = environ.get(variable)
    if not value:
        raise IngestRecordStoreConfigurationError(
            variable, f"{variable} must be set to compose the postgres ingest record store"
        )
    return value


def _parse_postgres_port(environ: Mapping[str, str]) -> int:
    """Parse `POSTGRES_PORT`, defaulted to `DEFAULT_POSTGRES_PORT` — never silently truncated."""
    raw = environ.get(POSTGRES_PORT_VAR)
    if raw is None:
        return DEFAULT_POSTGRES_PORT
    try:
        return int(raw)
    except ValueError as error:
        raise IngestRecordStoreConfigurationError(
            POSTGRES_PORT_VAR, f"{POSTGRES_PORT_VAR} must be an integer, got {raw!r}"
        ) from error


def _postgres_conninfo(environ: Mapping[str, str]) -> str:
    """Build the `psycopg` conninfo string, resolving every var or refusing naming it.

    Every value is resolved here, BEFORE `compose_ingest_record_store` ever calls `connect` —
    a malformed `POSTGRES_PORT` or a missing `POSTGRES_PASSWORD` is a configuration mistake,
    not a network failure, and the two must never be reported under the same exception (same
    split `collectors_cli.py` already draws between `CollectorBootConfigurationError` and
    `CollectorBootConnectionError`).
    """
    host = environ.get(POSTGRES_HOST_VAR, DEFAULT_POSTGRES_HOST)
    port = _parse_postgres_port(environ)
    dbname = _require(environ, POSTGRES_DB_VAR)
    user = _require(environ, POSTGRES_USER_VAR)
    password = _require(environ, POSTGRES_PASSWORD_VAR)
    return (
        f"host={host} port={port} dbname={dbname} user={user} password={password} "
        f"connect_timeout={_POSTGRES_CONNECT_TIMEOUT_S}"
    )


def compose_postgres_connection(
    environ: Mapping[str, str],
    *,
    connect: Callable[[str], psycopg.Connection[Any]] = psycopg.connect,
) -> psycopg.Connection[Any]:
    """Open ONE `psycopg` connection to the Postgres this process's env vars name.

    `T-04.1` (`ADR-034/D9` item 1): `md.series` has no `sqlite` fallback, so
    `src.main.create_app`'s `PostgresSeriesWindowReader` wiring needs its OWN connection to the
    same Postgres `compose_ingest_record_store`'s `postgres` path already resolves — reusing
    `PostgresIngestRecordStore`'s connection would mean reaching into that class's private
    `_connection` (`postgres_ingest_record_store.py`), which stays unexposed on purpose. This
    function is the extracted primitive so a second consumer opens a SECOND, independent
    connection through the exact same conninfo (`_postgres_conninfo`) and the exact same
    "one attempt, no retry" contract, rather than duplicating either.
    """
    host = environ.get(POSTGRES_HOST_VAR, DEFAULT_POSTGRES_HOST)
    port = environ.get(POSTGRES_PORT_VAR, str(DEFAULT_POSTGRES_PORT))
    conninfo = _postgres_conninfo(environ)
    try:
        return connect(conninfo)
    except psycopg.OperationalError as error:
        raise IngestRecordStoreConnectionError(
            POSTGRES_HOST_VAR,
            f"cannot connect to Postgres at {POSTGRES_HOST_VAR}={host!r} "
            f"{POSTGRES_PORT_VAR}={port!r}: {error}",
        ) from error


def _compose_postgres_store(
    environ: Mapping[str, str],
    connect: Callable[[str], psycopg.Connection[Any]],
) -> PostgresIngestRecordStore:
    """Resolve every Postgres var, then make the ONE `connect` call — no loop, no retry."""
    connection = compose_postgres_connection(environ, connect=connect)
    return PostgresIngestRecordStore(connection)


def compose_ingest_record_store(
    environ: Mapping[str, str],
    *,
    connect: Callable[[str], psycopg.Connection[Any]] = psycopg.connect,
) -> IngestRecordStore:
    """Build the ONE `IngestRecordStore` this process's `INGEST_RECORD_BACKEND` names.

    `sqlite` (the default) never touches the network — it returns a `SqliteIngestRecordStore`
    bound to `INGEST_HEALTH_STORE_PATH` (or its default), same as every composition root built
    before this module existed. `postgres` resolves every `POSTGRES_*` var and opens exactly
    one connection through `connect` (defaulting to the real `psycopg.connect`); the offline
    suite injects a fake to prove both the configuration-only failures and the "exactly once,
    never retried" property without a live server.

    Raises `IngestRecordStoreConfigurationError` (naming `INGEST_RECORD_BACKEND` or the
    offending Postgres var) for anything decidable before the network, and
    `IngestRecordStoreConnectionError` (naming `POSTGRES_HOST`) for `connect` itself failing.
    Neither exception is caught here — the composition root (`collectors_cli.main`, `T-02.5`,
    `T-02.6`) decides how a refused boot becomes `rc != 0` and a logged event.
    """
    backend = environ.get(INGEST_RECORD_BACKEND_VAR, DEFAULT_INGEST_RECORD_BACKEND)
    if backend not in KNOWN_INGEST_RECORD_BACKENDS:
        raise IngestRecordStoreConfigurationError(
            INGEST_RECORD_BACKEND_VAR,
            f"{INGEST_RECORD_BACKEND_VAR}={backend!r} is not one of "
            f"{sorted(KNOWN_INGEST_RECORD_BACKENDS)}",
        )
    if backend == _SQLITE_BACKEND:
        path = Path(environ.get(INGEST_HEALTH_STORE_PATH_VAR, DEFAULT_INGEST_HEALTH_STORE_PATH))
        return SqliteIngestRecordStore(path)
    return _compose_postgres_store(environ, connect)
