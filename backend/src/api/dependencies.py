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
from src.modules.sentimento.use_cases.series_history import (
    GridMultipleClassifier,
    SeriesWindowReader,
)
from src.modules.sentimento.use_cases.series_live import LiveBucketSource
from src.modules.sentimento.use_cases.series_quarantine import QuarantineSource


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

    `path` is typed `Path | str`, not `Path` alone: `src.main` (`T-02.6`) wires a `postgres`
    engine here through a small adapter (`_PostgresReadiness`) whose `path` is a masked DSN
    string (`postgresql://<user>@<host>:<port>/<db>`, never the password), and routing that
    string through `pathlib.Path` would silently collapse its `//` right after the scheme
    (`Path("a://b")` -> `PosixPath('a:/b')`) — corrupting the one part of a DSN that cannot be
    lost. `ready.py`'s `str(source.path)` already handles both members identically.
    """

    @property
    def path(self) -> Path | str: ...  # noqa: D102

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


def get_series_quarantine_source() -> QuarantineSource:
    """Return the `QuarantineSource` the route reads — overridden by `src.main.create_app`.

    Raises:
        NotImplementedError: always, unless `src.main` has already replaced this callable via
            `app.dependency_overrides[get_series_quarantine_source]`. A request that reaches
            this body means the app was served without going through the composition root.

    """
    raise NotImplementedError(
        "get_series_quarantine_source has no default adapter; src.main.create_app must "
        "override it via app.dependency_overrides before serving a request."
    )


def get_series_window_reader_source() -> SeriesWindowReader:
    """Return the `SeriesWindowReader` `/series-history` reads — overridden by `src.main`.

    `ADR-034/D9`'s leitor de janela: `infra/postgres_series_window_reader.py` is the one real
    adapter, wired by `src.main.create_app` (`T-04.1`, `CST-190`) whenever the `postgres` engine
    is actually composed (`md.series` has no `sqlite` fallback, unlike the ingest-record store,
    so there is no default engine to fall back to when the process runs `sqlite`). A request
    that reaches this body means the app was served without that composition — either the
    `sqlite` engine (no adapter exists for it) or a boot that skipped `src.main` entirely — the
    same contract every other stub in this module states.

    Raises:
        NotImplementedError: always, until `src.main` overrides it via
            `app.dependency_overrides[get_series_window_reader_source]`.

    """
    raise NotImplementedError(
        "get_series_window_reader_source has no default adapter; src.main.create_app must "
        "override it via app.dependency_overrides before serving a request."
    )


def get_grid_multiple_classifier() -> GridMultipleClassifier:
    """Return the `GridMultipleClassifier` `/series-history` uses — overridden by `src.main`.

    `ADR-037/D4` puts `ADR-026/D1`'s grid-multiple verdict in the `/series-history` envelope,
    and `classify_grid_multiple` lives in `src.modules.charts` — the context
    `src.modules.sentimento` may not import (`backend/pyproject.toml`, "Fronteira de contexto").
    So the verdict crosses the boundary the way every other cross-layer fact in this module
    does: a port named here, an adapter wired by the composition root, which is the only layer
    that may see both contexts.

    Unlike `get_series_window_reader_source`, what `src.main` wires here has no connection and
    no per-environment variation — it is a pure function of two integers (`ADR-003/FR-1`). The
    stub still RAISES, for the reason every stub in this module does: a route that reached this
    body would mean the app was served without going through the composition root, and serving
    an unqualified staircase is precisely the silent failure `ADR-037/D4` exists to close.

    Raises:
        NotImplementedError: always, until `src.main` overrides it via
            `app.dependency_overrides[get_grid_multiple_classifier]`.

    """
    raise NotImplementedError(
        "get_grid_multiple_classifier has no default adapter; src.main.create_app must "
        "override it via app.dependency_overrides before serving a request."
    )


def get_live_bucket_source() -> LiveBucketSource:
    """Return the `LiveBucketSource` `/series-live` reads — overridden by `src.main`.

    No real adapter exists yet (`use_cases/series_live.py`'s own docstring: `ADR-034/D9` names
    only the history read path as new for F1) — this stub raises until a future task builds the
    trade-stream producer and wires it here, the same "declared port, no adapter yet" shape
    `get_series_catalog_source` used before `T-06.x` populated a real catalog.

    Raises:
        NotImplementedError: always, until `src.main` overrides it via
            `app.dependency_overrides[get_live_bucket_source]`.

    """
    raise NotImplementedError(
        "get_live_bucket_source has no default adapter; src.main.create_app must override it "
        "via app.dependency_overrides before serving a request."
    )
