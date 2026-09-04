"""`src.api`: the read door, as a CONSUMER of bounded contexts, never a member of one.

`[PREMISSA-OWNER: 2026-09-03]`, literal: "e sim, precisa ser exposto uma camada de API, dai a
camada de api n pertence ao bounded-context, e o consumidor, usando de injecao de dependencias
dos modulos." This package holds the router; it imports use cases and ports by name, never a
context's `infra/` — the concrete adapter is wired by `src.main`, the one layer above `api` in
the `layers` contract (`ADR-009/D6.3`, `T-05.13`).

`APIRouter()` lives at module level so `src.main.create_app` can `include_router` it without
importing anything from `src.api.routes` directly — the router is the published surface.
"""

from __future__ import annotations

from fastapi import APIRouter

from src.api.routes.ingest_health import router as ingest_health_router

router = APIRouter()
router.include_router(ingest_health_router)
