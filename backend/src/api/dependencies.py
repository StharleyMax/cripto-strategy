"""Dependency-injection STUBS for `src.api` — the port, never the adapter.

`src.api` is a consumer by injection (`[PREMISSA-OWNER: 2026-09-03]`, see `src/api/__init__.py`):
it names the PORT (`IngestRecordSource`, from `use_cases/ingest_health.py`) and never the
concrete `SqliteIngestRecordStore`. Wiring the real adapter is `src.main.create_app`'s job via
`app.dependency_overrides` — the only layer above `api` in the `layers` contract
(`ADR-009/D6.3`), and the only module allowed to import `src.modules.sentimento.infra` outside
the bounded context itself (`T-05.13`'s `forbidden` contract (4): `source_modules = ["src.api",
"src.jobs"]`, `forbidden_modules = ["src.modules.sentimento.infra"]`).

Every function here RAISES if `src.main` never overrode it — a route that somehow ran without
composition would fail LOUD, not read from a `None` store in silence.
"""

from __future__ import annotations

from src.modules.sentimento.use_cases.ingest_health import IngestRecordSource


def get_ingest_record_source() -> IngestRecordSource:
    """Return the `IngestRecordSource` the route reads — overridden by `src.main.create_app`.

    Raises:
        NotImplementedError: always, unless `src.main` has already replaced this callable via
            `app.dependency_overrides[get_ingest_record_source]`. A request that reaches this
            body means the app was served without going through the composition root.

    """
    raise NotImplementedError(
        "get_ingest_record_source has no default adapter; src.main.create_app must override "
        "it via app.dependency_overrides before serving a request."
    )
