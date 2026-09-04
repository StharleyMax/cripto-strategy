"""`GET /ingest-health`: the HTTP consumer of `ingest_health_query`, zero SQL of its own.

`DoD D5.13c` — RESTRICAO DURA: this handler calls `ingest_health_query(source)`
(`use_cases/ingest_health.py:32`) and nothing else touches persistence. A second SQL statement
written here would be the exact defect `ADR-008/D3` calls "F3 reimplementa o mesmo registro" —
this route's whole reason to exist is to be the SAME implementation as the CLI, not a sibling of
it. The envelope shape is not decided here either: `report.to_envelope()` is the single
projection point (`ADR-005/D6.1`, `domain/ingest_record.py`), so this module never touches a
column name.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from src.api.dependencies import get_ingest_record_source
from src.modules.sentimento.use_cases.ingest_health import (
    IngestRecordSource,
    ingest_health_query,
)

router = APIRouter()


@router.get("/ingest-health")
def get_ingest_health(
    source: IngestRecordSource = Depends(get_ingest_record_source),
) -> dict[str, object]:
    """Return the persisted ingest record as the envelope `ADR-005/D6.1` fixes.

    `source` is a port (`IngestRecordSource`), injected — this function never knows which
    adapter answers it. `report.to_envelope()` is the ONLY place the shape of the response is
    decided; this handler is a thin composition of "read" then "project", nothing else.
    """
    report = ingest_health_query(source)
    return report.to_envelope()
