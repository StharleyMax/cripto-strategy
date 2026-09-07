"""`src.main`: the composition root — the ONLY layer that wires a concrete adapter.

`[PREMISSA-OWNER: 2026-09-03]` puts the API layer as a consumer by dependency injection, and
`src.main` is where the injection happens: it is the one layer above `src.api` in the `layers`
contract `ADR-009/D6.3` fixes (`["main", "api | jobs", "modules"]`), so it is the only module
outside `src.modules.sentimento` allowed to import `src.modules.sentimento.infra`
(`T-05.13`'s `forbidden` contract (4) names `src.api`/`src.jobs`, never `src.main`, as the
forbidden source).

`app` is built at MODULE LEVEL so `uvicorn src.main:app` resolves it exactly like the
precedent (`anything_monorepo/backend/src/main/__init__.py`'s `create_app()`, gate §1/§4).
Building it costs no I/O: `SqliteIngestRecordStore.__init__` only binds a path
(`sqlite_ingest_record_store.py:176-178`), and the read methods already treat an absent file
or an absent table as "zero rows" (`_fetch`), so nothing needs to run at import time to make a
fresh store answer correctly.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Final

from fastapi import FastAPI

from src.api import router as api_router
from src.api.dependencies import (
    get_ingest_record_source,
    get_series_catalog_source,
    get_series_quarantine_source,
    get_store_readiness_source,
)
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore
from src.modules.sentimento.infra.sqlite_series_quarantine_store import (
    SqliteSeriesQuarantineStore,
)
from src.modules.sentimento.use_cases.series_catalog import list_series_catalog

logger = logging.getLogger(__name__)

# Where the process reads `md.ingest_run` / `md.ingest_gap` from, absent an override. Nothing
# in `docs/` fixes this path yet — the store itself lives under `data/`, this repository's
# generated/re-obtainable state (`CLAUDE.md`, "Dado bruto nao e versionado"), never committed.
_DEFAULT_STORE_PATH: Final[str] = "data/md/ingest_health.sqlite3"

# The env var name a deployment overrides to point this process at a different store — same
# shape as `APP_PORT` in `__main__.py`, read once, at the composition root, never inside a
# route or a use case.
_STORE_PATH_ENV_VAR: Final[str] = "INGEST_HEALTH_STORE_PATH"

# `T-03.4`, `SPEC-003` s3.5: the SECOND store this composition root wires, same default
# directory as the ingest store (`data/md/`) — prod's actual path is `[NAO SEI]` (`[Q8]`,
# `ADR-002`), out of this task's scope.
_DEFAULT_QUARANTINE_STORE_PATH: Final[str] = "data/md/series_quarantine.sqlite3"

# The env var name a deployment overrides to point this process at a different quarantine
# store — same shape as `_STORE_PATH_ENV_VAR`, one name, read once.
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
    store_path: Path,
    api_prefix: str = _DEFAULT_API_PREFIX,
    quarantine_store_path: Path | None = None,
) -> FastAPI:
    """Build the FastAPI app, wiring the concrete adapters for both stores this process serves.

    `store_path` is a PARAMETER, not read from the environment inside this function, so a
    test can point a fresh app at a `tmp_path` store without touching `os.environ` — the
    module-level `app` below is the only caller that resolves the path from the environment.

    Raises `StoreParentDirectoryMissingError` when `store_path.parent` is not a directory —
    checked here, not inside the store, so the failure happens at boot (`rc != 0`) rather than
    on the first request (`ADR-029/D3`).

    `api_prefix` is a PARAMETER for the same reason: `include_router(api_router, prefix=...)`
    is the ONE place every route this process serves gets mounted, so `openapi.json` reflects
    it for free and a request without the prefix matches no route (`404`), never the root.

    `quarantine_store_path` is DELIBERATELY different from `store_path`: when omitted (`None`),
    it falls back to `_quarantine_store_path_from_environment()` INSIDE this function, rather
    than requiring every caller to resolve and pass it — `T-03.4` adds a second store to a
    composition root several other tasks already call with only `store_path` set, and forcing
    every one of those call sites to learn about quarantine would be scope this task does not
    own. Passing it explicitly (as the network tests for `GET /series-quarantine` do) still
    works exactly like `store_path` — the env fallback only fires when the caller has no
    opinion.
    """
    _require_parent_directory(store_path, kind="ingest health")
    resolved_quarantine_path = (
        quarantine_store_path
        if quarantine_store_path is not None
        else _quarantine_store_path_from_environment()
    )
    _require_parent_directory(resolved_quarantine_path, kind="series quarantine")
    app = FastAPI()
    app.include_router(api_router, prefix=api_prefix)
    store = SqliteIngestRecordStore(store_path)
    app.dependency_overrides[get_ingest_record_source] = lambda: store
    app.dependency_overrides[get_store_readiness_source] = lambda: store
    # Built ONCE here, not inside the lambda: `list_series_catalog()` is a pure function of
    # domain constants (`T-06.x`), so there is no per-request reason to rebuild it — same
    # reasoning as `store` above, just without the I/O `SqliteIngestRecordStore.__init__` skips.
    catalog = list_series_catalog()
    app.dependency_overrides[get_series_catalog_source] = lambda: catalog
    quarantine_store = SqliteSeriesQuarantineStore(resolved_quarantine_path)
    app.dependency_overrides[get_series_quarantine_source] = lambda: quarantine_store
    return app


def _store_path_from_environment() -> Path:
    """Return the store path this process serves: `INGEST_HEALTH_STORE_PATH`, or the default."""
    return Path(os.environ.get(_STORE_PATH_ENV_VAR, _DEFAULT_STORE_PATH))


def _quarantine_store_path_from_environment() -> Path:
    """Return the quarantine store path: `QUARANTINE_STORE_PATH`, or the default (`T-03.4`)."""
    return Path(os.environ.get(_QUARANTINE_STORE_PATH_ENV_VAR, _DEFAULT_QUARANTINE_STORE_PATH))


def _api_prefix_from_environment() -> str:
    """Return the prefix every route mounts under: `API_PREFIX`, or the default — never root."""
    return os.environ.get(_API_PREFIX_ENV_VAR, _DEFAULT_API_PREFIX)


app = create_app(_store_path_from_environment(), _api_prefix_from_environment())
