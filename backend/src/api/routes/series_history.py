"""`GET {API_PREFIX}/series-history`: the `as_of()` window, over the wire (`SPEC-006 §5.2`).

`ADR-034/D1`/`D5` fix the exact shape — snake_case, epoch-ms, the 3-level envelope of
`ADR-005/D3`. This handler is thin, same shape as `series_catalog.py`: it names the ONE use
case (`build_series_history_report`) and translates its typed refusals into the `422`/`500`
`SPEC-006 §5.2` names — no SQL, no `as_of` logic, nothing that could drift from
`use_cases/series_history.py`'s own behaviour.

`interval`/`bar_policy` are `Literal` types — FastAPI/Pydantic already answer `422` for a value
outside either closed set (`interval != "1m"`, or `bar_policy` missing/outside
`{"final_only", "intrabar"}`) before this function body ever runs, which is `CA-F1-3` and half
of `RN-8` for free, without a second hand-written check that could disagree with the first.
"""

from __future__ import annotations

import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from starlette.responses import JSONResponse

from src.api.dependencies import (
    get_grid_multiple_classifier,
    get_series_catalog_source,
    get_series_window_reader_source,
)
from src.modules.sentimento.domain.as_of_accessor import BarPolicy, DecisionReadRefusedError
from src.modules.sentimento.domain.series_catalog import SeriesCatalog
from src.modules.sentimento.use_cases.series_history import (
    GridMultipleClassifier,
    InvalidWindowError,
    SeriesWindowReader,
    UnknownSeriesKeyIdError,
    UnsupportedIntervalError,
    build_series_history_report,
)

router = APIRouter()


def _now_ms() -> int:
    """Read the wall clock, in epoch milliseconds — HERE, never in `domain`/`use_cases`.

    `backend/pyproject.toml`'s "Natureza" contract keeps `time` out of `domain`/`use_cases`;
    `src.api` carries no such restriction, and `session.server_now_ms` (`SPEC-006 §5.2`) is
    exactly the kind of value only this layer may produce.
    """
    return time.time_ns() // 1_000_000


@router.get("/series-history")
def get_series_history(
    series_key_id: str,
    symbol: str,
    interval: Literal["1m"],
    window_start_ms: int,
    window_end_ms: int,
    knowledge_time_ms: int,
    bar_policy: Literal["final_only", "intrabar"],
    catalog: SeriesCatalog = Depends(get_series_catalog_source),
    reader: SeriesWindowReader = Depends(get_series_window_reader_source),
    classify_grid: GridMultipleClassifier = Depends(get_grid_multiple_classifier),
) -> JSONResponse:
    """Serve one `SeriesHistoryReport` envelope, or a named `422`/`500` (`SPEC-006 §5.2`).

    `422`: `knowledge_time_ms` in the future relative to `server_now_ms`, or `series_key_id`
    unknown to the catalog, or an invalid window (`window_start_ms >= window_end_ms`) — none of
    these are expressible as a `Literal` type, so they are checked here, explicitly, each with
    its own named message. `500`: `as_of` refused the read (`RN-9`) — never served as `200`.
    """
    server_now_ms = _now_ms()
    if knowledge_time_ms > server_now_ms:
        raise HTTPException(
            status_code=422,
            detail=(
                f"knowledge_time_ms ({knowledge_time_ms}) is in the future relative to "
                f"server_now_ms ({server_now_ms})"
            ),
        )
    try:
        report = build_series_history_report(
            catalog,
            reader,
            classify_grid,
            series_key_id=series_key_id,
            symbol=symbol,
            interval=interval,
            window_start_ms=window_start_ms,
            window_end_ms=window_end_ms,
            knowledge_time_ms=knowledge_time_ms,
            bar_policy=BarPolicy(bar_policy),
        )
    except (UnsupportedIntervalError, UnknownSeriesKeyIdError, InvalidWindowError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except DecisionReadRefusedError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    return JSONResponse(content=report.to_envelope(principal_id=None, server_now_ms=server_now_ms))
