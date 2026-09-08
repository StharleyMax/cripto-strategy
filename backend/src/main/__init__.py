"""`src.main`: the composition root — the ONLY layer that wires a concrete adapter.

`[PREMISSA-OWNER: 2026-09-03]` puts the API layer as a consumer by dependency injection, and
`src.main` is where the injection happens: it is the one layer above `src.api` in the `layers`
contract `ADR-009/D6.3` fixes (`["main", "api | jobs", "modules"]`), so it is the only module
outside `src.modules.sentimento` allowed to import `src.modules.sentimento.infra`
(`T-05.13`'s `forbidden` contract (4) names `src.api`/`src.jobs`, never `src.main`, as the
forbidden source).

`app` is built at MODULE LEVEL so `uvicorn src.main:app` resolves it exactly like the
precedent (`anything_monorepo/backend/src/main/__init__.py`'s `create_app()`, gate §1/§4).
Building it costs no I/O for the `sqlite` engine (default, `INGEST_RECORD_BACKEND` unset):
`SqliteIngestRecordStore.__init__` only binds a path (`sqlite_ingest_record_store.py:176-178`),
and the read methods already treat an absent file or an absent table as "zero rows" (`_fetch`),
so nothing needs to run at import time to make a fresh store answer correctly. `postgres`
(`T-02.6`, `ADR-031/D1`) is the one case where building `app` DOES touch the network — exactly
once, via `compose_ingest_record_store` — because a deployment pointed at an unreachable
Postgres must fail at boot (`rc != 0`, `RN-4`), never on the first request.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Mapping
from pathlib import Path
from typing import Final, cast

from fastapi import FastAPI

from src.api import router as api_router
from src.api.dependencies import (
    StoreReadinessSource,
    get_ingest_record_source,
    get_series_catalog_source,
    get_series_quarantine_source,
    get_series_window_reader_source,
    get_store_readiness_source,
)
from src.modules.sentimento.infra.ingest_record_store_composition import (
    DEFAULT_INGEST_HEALTH_STORE_PATH,
    DEFAULT_INGEST_RECORD_BACKEND,
    DEFAULT_POSTGRES_HOST,
    DEFAULT_POSTGRES_PORT,
    INGEST_HEALTH_STORE_PATH_VAR,
    INGEST_RECORD_BACKEND_VAR,
    POSTGRES_DB_VAR,
    POSTGRES_HOST_VAR,
    POSTGRES_PORT_VAR,
    POSTGRES_USER_VAR,
    compose_ingest_record_store,
    compose_postgres_connection,
)
from src.modules.sentimento.infra.postgres_ingest_record_store import PostgresIngestRecordStore
from src.modules.sentimento.infra.postgres_series_window_reader import PostgresSeriesWindowReader
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore
from src.modules.sentimento.infra.sqlite_series_quarantine_store import (
    SqliteSeriesQuarantineStore,
)
from src.modules.sentimento.use_cases.series_catalog import list_series_catalog

logger = logging.getLogger(__name__)

# `T-03.4`, `SPEC-003` s3.5: the SECOND store this composition root wires, same default
# directory as the ingest store (`data/md/`) — prod's actual path is `[NAO SEI]` (`[Q8]`,
# `ADR-002`), out of this task's scope.
_DEFAULT_QUARANTINE_STORE_PATH: Final[str] = "data/md/series_quarantine.sqlite3"

# The env var name a deployment overrides to point this process at a different quarantine
# store — same shape as `INGEST_HEALTH_STORE_PATH_VAR` (`ingest_record_store_composition.py`),
# one name, read once.
_QUARANTINE_STORE_PATH_ENV_VAR: Final[str] = "QUARANTINE_STORE_PATH"

# `M2` (`ADR-029/D2`): every route this process serves lives under one prefix. Absent, this
# process defaults here — it NEVER mounts a route at the root. `[Q2]` (the definitive segment)
# stays open for the owner; reverting this default costs the two lines this constant and its
# one caller are (`SPEC-003` s3.4 header).
_DEFAULT_API_PREFIX: Final[str] = "/api/v1"


class StoreParentDirectoryMissingError(RuntimeError):
    """Raised by `create_app` when a store path's parent directory does not exist.

    `ADR-029/D3`: a missing parent directory is a MISCONFIGURATION — whoever pointed this
    process at a path nobody prepared — never "zero runs". It is caught here, at the
    composition root, precisely so it is NOT caught anywhere downstream: `_fetch` keeps
    treating an absent *file* (existing parent, missing leaf) as an empty record
    (`ADR-005/D6.1`, untouched by this check), and neither store is ever asked to tell the two
    situations apart.

    `T-03.4` reuses this SAME error for the quarantine store's parent (`SPEC-003` s3.5, "mesma
    regra de boot") — one exception type for one rule applied to two stores, not two near-
    identical exceptions.
    """


# The env var name a deployment overrides to move every route to a different prefix — the
# Caddy side of `ADR-029/D2` reads the SAME name (`T-02.7`), so the two sides move together.
_API_PREFIX_ENV_VAR: Final[str] = "API_PREFIX"


def _masked_postgres_dsn(environ: Mapping[str, str]) -> str:
    """Build the DSN `GET /ready` reports for the `postgres` backend — `SPEC-004` §3.5.

    `postgresql://<user>@<host>:<port>/<db>`, `POSTGRES_PASSWORD` NEVER included — `D2.7`'s
    falsifier greps the response for it and must find zero occurrences. Read the same var
    names and defaults `compose_ingest_record_store` (`T-02.4`) already validated before this
    function is ever reached (`create_app` only calls it once that composition succeeded), so
    `POSTGRES_USER`/`POSTGRES_DB` are guaranteed present here — this masks, it never revalidates.

    Deliberately NOT built with `pathlib.Path`: `Path("a://b")` collapses to `PosixPath('a:/b')`,
    silently dropping one of the two slashes right after the scheme — exactly the part of a DSN
    that cannot be lost. `StoreReadinessSource.path` (`src/api/dependencies.py`) is typed
    `Path | str` for this reason.
    """
    host = environ.get(POSTGRES_HOST_VAR, DEFAULT_POSTGRES_HOST)
    port = environ.get(POSTGRES_PORT_VAR, str(DEFAULT_POSTGRES_PORT))
    user = environ[POSTGRES_USER_VAR]
    database = environ[POSTGRES_DB_VAR]
    return f"postgresql://{user}@{host}:{port}/{database}"


class _PostgresReadiness:
    """Adapts a `PostgresIngestRecordStore` to `StoreReadinessSource` for `GET /ready` (`T-02.6`).

    `PostgresIngestRecordStore` (`T-02.4`) deliberately has no `path` property — it is one of
    the shared 6-method `IngestRecordStore` surface `ADR-031/D1` fixes for BOTH engines, and
    `path` is not one of the 6 (adding a 7th member there would widen a contract `T-02.4`
    already closed, for a concern — `/ready`'s masked DSN — only `src.main` has). This wrapper
    keeps that surface untouched and supplies the one extra field `/ready` needs, delegating
    `describe_readiness()` straight through to the wrapped store.
    """

    def __init__(self, store: PostgresIngestRecordStore, dsn: str) -> None:
        """Bind the already-composed `store` alongside the pre-masked `dsn` string."""
        self._store = store
        self._dsn = dsn

    @property
    def path(self) -> str:
        """Return the masked DSN — never the password (`_masked_postgres_dsn`)."""
        return self._dsn

    def describe_readiness(self) -> tuple[bool, bool]:
        """Delegate straight to the wrapped `PostgresIngestRecordStore`."""
        return self._store.describe_readiness()


def _require_parent_directory(path: Path, *, kind: str) -> None:
    """Refuse when `path.parent` is not a directory — the ONE check both stores share.

    `kind` names WHICH store failed in the log event and the message (`"ingest health"` or
    `"series quarantine"`) — one function, one `StoreParentDirectoryMissingError`, called twice
    with a different label, rather than the check (and its drift risk) written out twice.
    """
    parent = path.parent
    if not parent.is_dir():
        logger.error(
            "store_parent_missing",
            extra={"kind": kind, "path": str(parent)},
        )
        raise StoreParentDirectoryMissingError(
            f"{kind} store parent directory does not exist: {parent}"
        )


def create_app(
    store_path: Path | None = None,
    api_prefix: str = _DEFAULT_API_PREFIX,
    quarantine_store_path: Path | None = None,
) -> FastAPI:
    """Build the FastAPI app, wiring the concrete adapters for both stores this process serves.

    `store_path`, when given, PINS the ingest store to a `SqliteIngestRecordStore` at that exact
    path — the knob every test written before `T-02.6` already uses to point a fresh app at a
    `tmp_path` store without touching `os.environ`. When omitted (`None`, the module-level `app`
    below), the ingest store is instead resolved by `compose_ingest_record_store` (`T-02.4`)
    against `INGEST_RECORD_BACKEND` (`sqlite`|`postgres`, default `sqlite`) — the SAME function
    `collectors_cli` and `single_writer_cli` (`T-02.5`) call, so all three composition roots
    agree on `sqlite`|`postgres`, the defaults, and the refusal shape (`ADR-031/D1, D3`).

    Raises `StoreParentDirectoryMissingError` when the `sqlite` engine's store parent is not a
    directory — checked here, not inside the store, so the failure happens at boot (`rc != 0`)
    rather than on the first request (`ADR-029/D3`); an unreachable `postgres` or an unknown
    `INGEST_RECORD_BACKEND` propagates `compose_ingest_record_store`'s OWN exception
    (`IngestRecordStoreConnectionError`/`IngestRecordStoreConfigurationError`) uncaught, for the
    same reason — both name the offending variable in their message, so a crash at import time
    (`uvicorn src.main:app` never binds a socket) already satisfies `RN-4` without this function
    catching and re-wrapping them.

    `GET /ready`'s `path` field (`StoreReadinessSource`, `ADR-029/D3`) stays the sqlite file path
    for that engine, unchanged; for `postgres` it becomes the masked DSN
    `_masked_postgres_dsn` builds (`SPEC-004` §3.5) via the `_PostgresReadiness` adapter — never
    `POSTGRES_PASSWORD`.

    `api_prefix` is a PARAMETER for the same reason `store_path` is:
    `include_router(api_router, prefix=...)` is the ONE place every route this process serves
    gets mounted, so `openapi.json` reflects it for free and a request without the prefix
    matches no route (`404`), never the root.

    `quarantine_store_path` is DELIBERATELY different from `store_path`: when omitted (`None`),
    it falls back to `_quarantine_store_path_from_environment()` INSIDE this function, rather
    than requiring every caller to resolve and pass it — `T-03.4` adds a second store to a
    composition root several other tasks already call with only `store_path` set, and forcing
    every one of those call sites to learn about quarantine would be scope this task does not
    own. Passing it explicitly (as the network tests for `GET /series-quarantine` do) still
    works exactly like `store_path` — the env fallback only fires when the caller has no
    opinion.
    """
    ingest_store: SqliteIngestRecordStore | PostgresIngestRecordStore
    readiness_source: StoreReadinessSource
    # `md.series` has no `sqlite` fallback (`ADR-034/D9`, `get_series_window_reader_source`'s own
    # docstring) — `window_reader` stays `None` (the stub keeps raising `NotImplementedError` for
    # `/series-history`) unless the `postgres` engine is actually composed below. An explicit
    # `store_path` (every test written before `T-04.1`) always builds a `SqliteIngestRecordStore`
    # directly, never reaching `compose_ingest_record_store`, so it is UNAFFECTED by this — same
    # as today.
    window_reader: PostgresSeriesWindowReader | None = None
    if store_path is not None:
        _require_parent_directory(store_path, kind="ingest health")
        ingest_store = SqliteIngestRecordStore(store_path)
        readiness_source = ingest_store
    else:
        backend = os.environ.get(INGEST_RECORD_BACKEND_VAR, DEFAULT_INGEST_RECORD_BACKEND)
        if backend == DEFAULT_INGEST_RECORD_BACKEND:  # "sqlite" — the ONE engine with a file
            resolved_store_path = Path(
                os.environ.get(INGEST_HEALTH_STORE_PATH_VAR, DEFAULT_INGEST_HEALTH_STORE_PATH)
            )
            _require_parent_directory(resolved_store_path, kind="ingest health")
        # An unknown `backend` value skips the check above (there is no path to check) and
        # reaches `compose_ingest_record_store` regardless, which is what refuses it, naming
        # `INGEST_RECORD_BACKEND` — the ONE place that value is validated (`ADR-031/D3`).
        composed = compose_ingest_record_store(os.environ)
        # `compose_ingest_record_store` only ever returns one of these two concrete engines
        # (its own body constructs no other); narrowing back from its 6-method `IngestRecordStore`
        # Protocol return type is what lets `.path`/`_PostgresReadiness` below type-check without
        # adding a 7th member to a surface `T-02.4` already closed (`_PostgresReadiness`'s
        # docstring).
        ingest_store = cast("SqliteIngestRecordStore | PostgresIngestRecordStore", composed)
        if isinstance(ingest_store, PostgresIngestRecordStore):
            readiness_source = _PostgresReadiness(ingest_store, _masked_postgres_dsn(os.environ))
            # `T-04.1` (`ADR-034/D9` item 1, `CST-190`): a SECOND, dedicated connection to the
            # SAME Postgres — reusing `ingest_store`'s connection would mean reaching into its
            # private `_connection` (`postgres_ingest_record_store.py`), which stays unexposed on
            # purpose (`compose_postgres_connection`'s own docstring). Refuses at boot
            # (`ADR-029/D3`), same as `ingest_store`'s own connection just above: an unreachable
            # Postgres must fail `rc != 0` here, never on the first `/series-history` request.
            window_connection = compose_postgres_connection(os.environ)
            window_reader = PostgresSeriesWindowReader(window_connection)
        else:
            readiness_source = ingest_store

    resolved_quarantine_path = (
        quarantine_store_path
        if quarantine_store_path is not None
        else _quarantine_store_path_from_environment()
    )
    _require_parent_directory(resolved_quarantine_path, kind="series quarantine")
    app = FastAPI()
    app.include_router(api_router, prefix=api_prefix)
    app.dependency_overrides[get_ingest_record_source] = lambda: ingest_store
    app.dependency_overrides[get_store_readiness_source] = lambda: readiness_source
    # Built ONCE here, not inside the lambda: `list_series_catalog()` is a pure function of
    # domain constants (`T-06.x`), so there is no per-request reason to rebuild it — same
    # reasoning as `ingest_store` above, just without the I/O the `sqlite` engine skips.
    catalog = list_series_catalog()
    app.dependency_overrides[get_series_catalog_source] = lambda: catalog
    quarantine_store = SqliteSeriesQuarantineStore(resolved_quarantine_path)
    app.dependency_overrides[get_series_quarantine_source] = lambda: quarantine_store
    if window_reader is not None:
        app.dependency_overrides[get_series_window_reader_source] = lambda: window_reader
    return app


def _quarantine_store_path_from_environment() -> Path:
    """Return the quarantine store path: `QUARANTINE_STORE_PATH`, or the default (`T-03.4`)."""
    return Path(os.environ.get(_QUARANTINE_STORE_PATH_ENV_VAR, _DEFAULT_QUARANTINE_STORE_PATH))


def _api_prefix_from_environment() -> str:
    """Return the prefix every route mounts under: `API_PREFIX`, or the default — never root."""
    return os.environ.get(_API_PREFIX_ENV_VAR, _DEFAULT_API_PREFIX)


# `store_path` is OMITTED here (`T-02.6`): `create_app` resolves the ingest engine itself, by
# `INGEST_RECORD_BACKEND`, through `compose_ingest_record_store` — the same function
# `collectors_cli`/`single_writer_cli` call. Every test that needs a specific `sqlite` store
# still passes `store_path=` explicitly (unaffected by this).
app = create_app(api_prefix=_api_prefix_from_environment())
