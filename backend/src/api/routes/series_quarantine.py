"""`GET /series-quarantine`: every row of the quarantine table, `points_json` NEVER included.

`DoD D3.2` — RESTRICAO DURA, same shape as `ingest_health.py`'s: this handler calls
`series_quarantine_query(source)` (`use_cases/series_quarantine.py`) and nothing else touches
persistence. `QuarantineRow.to_wire()` is the single projection point (`SeriesQuarantineReport`,
`domain/series_quarantine_report.py`) — this module never touches a column name, and it cannot
leak `points_json` because `QuarantineRow` has no such field to read.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from starlette.responses import JSONResponse

from src.api.dependencies import get_series_quarantine_source
from src.modules.sentimento.use_cases.series_quarantine import (
    QuarantineSource,
    series_quarantine_query,
)

router = APIRouter()


@router.get("/series-quarantine")
def get_series_quarantine(
    source: QuarantineSource = Depends(get_series_quarantine_source),
) -> JSONResponse:
    """Return every quarantined row in the `{"query", "n_rows", "rows"}` envelope (`D3.2`).

    `source` is a port (`QuarantineSource`), injected — this function never knows which
    adapter answers it.
    """
    report = series_quarantine_query(source)
    return JSONResponse(content=report.to_envelope())
