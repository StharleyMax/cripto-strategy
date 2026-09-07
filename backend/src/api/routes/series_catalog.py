"""`GET /series-catalog`: the HTTP consumer of `list_series_catalog`, zero SQL of its own.

Same restriction as `get_ingest_health` (`D5.13c`): this handler calls
`series_catalog_envelope(catalog)` and nothing else touches the catalog's shape — the envelope
is decided in `use_cases/series_catalog.py`, once, and this module is a thin composition of
"receive the injected catalog" and "serialize it".
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from starlette.responses import JSONResponse

from src.api.dependencies import get_series_catalog_source
from src.modules.sentimento.domain.series_catalog import SeriesCatalog
from src.modules.sentimento.use_cases.series_catalog import series_catalog_envelope

router = APIRouter()


@router.get("/series-catalog")
def get_series_catalog(
    catalog: SeriesCatalog = Depends(get_series_catalog_source),
) -> JSONResponse:
    """Return `{"query": "series_catalog", "n_entries", "entries": […]}` — `SPEC-003` §3.4.

    `catalog` is a port value (`SeriesCatalog`), injected — this function never knows whether
    it was built fresh or from a fixture a test wired in its place.
    """
    return JSONResponse(content=series_catalog_envelope(catalog))
