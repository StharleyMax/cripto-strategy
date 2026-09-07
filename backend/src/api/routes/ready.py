"""`GET /ready`: the store's READINESS, discriminating three states — never process health.

`ADR-029/D3`: `GET /ingest-health` keeps answering `200 {"n_runs":0,...}` for a store that has
never run (`D6.1`, untouched by this route) — but a MISCONFIGURED deployment (a store whose
parent directory nobody created, or a half-born file left by a crash before the first commit)
must not look the same to whoever operates this as "the collector never ran yet". `/ready` is
the honest signal a load balancer or a human can poll: `200` only when the store both EXISTS and
has its SCHEMA, `503` for either missing state, and nothing else — it does not consult
PostgreSQL, and it is not a process health check (the store is the read side's only
dependency).

`source.describe_readiness()` is the ONE call this handler makes: no SQL statement of any shape
lives in this module (`D5.13c`, same restriction `get_ingest_health` already honours — its DoD
greps for the literal query keyword, and this paragraph avoids spelling it so the grep never
counts its own prose), and `sqlite3.DatabaseError` on a corrupted file propagates through it
unmodified, becoming FastAPI's `500` (`core.silent-except` forbids swallowing it here, same as
inside the store).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response

from src.api.dependencies import StoreReadinessSource, get_store_readiness_source

router = APIRouter()


@router.get("/ready")
def get_ready(
    response: Response,
    source: StoreReadinessSource = Depends(get_store_readiness_source),
) -> dict[str, object]:
    """Return `{"store": {"path", "exists", "schema_present"}}` — `200` iff both are `True`.

    `response.status_code` is set explicitly rather than raised as an `HTTPException`: `503`
    here is a REPORTED store state, not a request error, and the body carries the exact same
    three fields whether the process answers `200` or `503` — never a different shape for the
    failing case (`SPEC-003` §3.4: "nenhum outro campo").
    """
    exists, schema_present = source.describe_readiness()
    response.status_code = 200 if exists and schema_present else 503
    return {
        "store": {
            "path": str(source.path),
            "exists": exists,
            "schema_present": schema_present,
        }
    }
