"""`GET /collector-status`: the HTTP consumer of `collector_status_query`, zero SQL of its own.

Same discipline as `routes/ingest_health.py`: this handler calls `collector_status_query(source,
now)` and nothing else touches persistence, and `report.to_envelope()` is the single projection
point (`domain/collector_status.py`) — this module never touches a field name. The envelope is
DELIBERATELY separate from `/ingest-health`'s (`ADR-030` D5, `F-D6-2`/`NG-9`): this route shares
the SAME `IngestRecordSource` port and dependency override as `/ingest-health`, so no wiring
changes in `src/main.py`/`dependencies.py` are needed to serve it.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from starlette.responses import JSONResponse

from src.api.dependencies import get_ingest_record_source
from src.modules.sentimento.use_cases.collector_status import collector_status_query
from src.modules.sentimento.use_cases.ingest_health import IngestRecordSource

router = APIRouter()


@router.get("/collector-status")
def get_collector_status(
    source: IngestRecordSource = Depends(get_ingest_record_source),
) -> JSONResponse:
    """Return the per-series aggregate `ADR-030` defines, `as_of` the wall clock at request time.

    `now` is resolved HERE — the one place this route reads the wall clock — and passed into
    `collector_status_query` as a parameter (`ADR-030` D0), so the use case itself stays a pure
    function of `(source, now)` and every test can pin `now` instead of racing the clock.
    """
    report = collector_status_query(source, now=datetime.now(UTC))
    return JSONResponse(content=report.to_envelope())
