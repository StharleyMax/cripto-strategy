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

import os
from pathlib import Path
from typing import Final

from fastapi import FastAPI

from src.api import router as api_router
from src.api.dependencies import get_ingest_record_source
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore

# Where the process reads `md.ingest_run` / `md.ingest_gap` from, absent an override. Nothing
# in `docs/` fixes this path yet — the store itself lives under `data/`, this repository's
# generated/re-obtainable state (`CLAUDE.md`, "Dado bruto nao e versionado"), never committed.
_DEFAULT_STORE_PATH: Final[str] = "data/md/ingest_health.sqlite3"

# The env var name a deployment overrides to point this process at a different store — same
# shape as `APP_PORT` in `__main__.py`, read once, at the composition root, never inside a
# route or a use case.
_STORE_PATH_ENV_VAR: Final[str] = "INGEST_HEALTH_STORE_PATH"


def create_app(store_path: Path) -> FastAPI:
    """Build the FastAPI app, wiring the concrete `SqliteIngestRecordStore` at `store_path`.

    `store_path` is a PARAMETER, not read from the environment inside this function, so a
    test can point a fresh app at a `tmp_path` store without touching `os.environ` — the
    module-level `app` below is the only caller that resolves the path from the environment.
    """
    app = FastAPI()
    app.include_router(api_router)
    store = SqliteIngestRecordStore(store_path)
    app.dependency_overrides[get_ingest_record_source] = lambda: store
    return app


def _store_path_from_environment() -> Path:
    """Return the store path this process serves: `INGEST_HEALTH_STORE_PATH`, or the default."""
    return Path(os.environ.get(_STORE_PATH_ENV_VAR, _DEFAULT_STORE_PATH))


app = create_app(_store_path_from_environment())
