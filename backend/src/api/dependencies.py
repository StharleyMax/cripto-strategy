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

`StoreReadinessSource` is a SEPARATE port from `IngestRecordSource`, deliberately: `GET /ready`
(`ADR-029/D3`) answers about the store's READINESS, never its rows, so its port names no
`runs()`/`gaps()` at all — a handler that only has this port physically cannot read a row, which
is the same shape of guarantee `IngestRecordSource` gives `/ingest-health` the other way round.
"""

from __future__ import annotations

from pathlib import Path
from typing import Protocol

from src.modules.sentimento.domain.series_catalog import SeriesCatalog
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


class StoreReadinessSource(Protocol):
    """Read port over the store's READINESS — `GET /ready`'s only dependency (`ADR-029/D3`).

    `SqliteIngestRecordStore` already satisfies this structurally (`path` property,
    `describe_readiness()` method) — no adapter class is written for it, the same way no
    adapter class exists solely to satisfy `IngestRecordSource`.
    """

    @property
    def path(self) -> Path: ...  # noqa: D102

    def describe_readiness(self) -> tuple[bool, bool]: ...  # noqa: D102


def get_store_readiness_source() -> StoreReadinessSource:
    """Return the `StoreReadinessSource` `/ready` reads — overridden by `src.main.create_app`.

    Raises:
        NotImplementedError: always, unless `src.main` has already replaced this callable via
            `app.dependency_overrides[get_store_readiness_source]`. A request that reaches this
            body means the app was served without going through the composition root.

    """
    raise NotImplementedError(
        "get_store_readiness_source has no default adapter; src.main.create_app must override "
        "it via app.dependency_overrides before serving a request."
    )


def get_series_catalog_source() -> SeriesCatalog:
    """Return the `SeriesCatalog` `/series-catalog` reads — overridden by `src.main.create_app`.

    Unlike `get_ingest_record_source`, what `src.main` wires here has no persistence and no
    per-environment variation — `list_series_catalog()` is a pure function of the domain
    constants `T-06.x` already populated. The stub still RAISES rather than calling that
    function itself, for the same reason every other function in this module does: a route
    that reached this body would mean the app was served without going through the composition
    root, and a test overriding this one dependency can inject a small catalog to exercise the
    route's envelope shape without depending on the real, ten-row production catalog.
    """
    raise NotImplementedError(
        "get_series_catalog_source has no default catalog; src.main.create_app must override "
        "it via app.dependency_overrides before serving a request."
    )
