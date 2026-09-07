"""`GET /ingest-health`: the HTTP consumer of `ingest_health_query`, zero SQL of its own.

`DoD D5.13c` — RESTRICAO DURA: this handler calls `ingest_health_query(source)`
(`use_cases/ingest_health.py:32`) and nothing else touches persistence. A second SQL statement
written here would be the exact defect `ADR-008/D3` calls "F3 reimplementa o mesmo registro" —
this route's whole reason to exist is to be the SAME implementation as the CLI, not a sibling of
it. The envelope shape is not decided here either: `report.to_envelope()` is the single
projection point (`ADR-005/D6.1`, `domain/ingest_record.py`), so this module never touches a
column name.

`T-02.4` adds the `ETag`/`304` pair (`ADR-029/D4`, `SPEC-003` §3.4): the header's VALUE is
`IngestHealthReport.fingerprint()` — `sentimento`, already computed over the exact same
`canonical_projection()` the CLI's byte contract hashes (`ADR-008/DoD-2`) — never a new
domain computation. `ADR-005/D6.3` keeps the header OUTSIDE the hashed region: the fingerprint
is taken over the body only, and the header is attached to the response afterwards, so quoting
it never perturbs what `fingerprint()` measures. The 200 body (`report.to_envelope()`) is
untouched either way (`NG-9`) — the ETag is the only thing this task adds to the response.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from starlette.responses import JSONResponse, Response

from src.api.dependencies import get_ingest_record_source
from src.modules.sentimento.use_cases.ingest_health import (
    IngestRecordSource,
    ingest_health_query,
)

router = APIRouter()


@router.get("/ingest-health")
def get_ingest_health(
    request: Request,
    source: IngestRecordSource = Depends(get_ingest_record_source),
) -> Response:
    """Return the persisted ingest record, `ETag`-conditioned on its `fingerprint()`.

    `source` is a port (`IngestRecordSource`), injected — this function never knows which
    adapter answers it. `report.to_envelope()` is the ONLY place the shape of the response
    body is decided; this handler is a thin composition of "read", "project", and "condition
    on `If-None-Match`", nothing else.

    The `ETag` is a STRONG validator (`"<fingerprint>"`, never `W/"..."`) because
    `fingerprint()` is byte-exact over the canonical projection (`ADR-008/DoD-2`) — there is
    no weak-comparison case this response ever needs. When the request's `If-None-Match`
    equals that value exactly, the response is `304` with an empty body and the SAME `ETag`
    repeated (`RFC 7232` §4.1); any other value — including none — falls through to the full
    `200`, body untouched.
    """
    report = ingest_health_query(source)
    etag = f'"{report.fingerprint()}"'
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag})
    return JSONResponse(content=report.to_envelope(), headers={"ETag": etag})
