"""`GET {API_PREFIX}/series-live`: the SSE edge, `ADR-005/D2` envelope, unaltered.

`ADR-034/D1`/`D4`/`SPEC-006 §5.3`: no `bar_policy` on this route — the partial-bucket envelope
is structurally "always in formation, live" (`D4`'s own words), so there is no policy for a
consumer to declare here. `interval` stays restricted to `"1m"` for the same reason
`series_history.py` restricts it: F1 serves the native grid only (`ADR-034/D6`).

This handler formats `LiveBucketSource.stream()` as `text/event-stream` and does nothing else
— no aggregation, no filtering, no SQL. `Content-Type` is the one thing `CA-F1-4` checks.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Literal

from fastapi import APIRouter, Depends
from starlette.responses import StreamingResponse

from src.api.dependencies import get_live_bucket_source
from src.modules.sentimento.use_cases.series_live import LiveBucketSource

router = APIRouter()


def _format_sse(envelopes: Iterator[dict[str, object]]) -> Iterator[str]:
    r"""Turn an iterator of wire-ready dicts into `text/event-stream` frames, one per envelope.

    `data: <json>\n\n` is the whole SSE data-frame grammar this route needs — no `event:`/
    `id:` line, because `LiveBucketEnvelope.to_wire()` already carries `seq` INSIDE the payload
    (`ADR-005/D2`'s own gap-detection mechanism), so a second, transport-level id would be a
    second place for the same fact to drift from the first.
    """
    for envelope in envelopes:
        yield f"data: {json.dumps(envelope)}\n\n"


@router.get("/series-live")
def get_series_live(
    series_key_id: str,
    symbol: str,
    interval: Literal["1m"],
    source: LiveBucketSource = Depends(get_live_bucket_source),
) -> StreamingResponse:
    """Stream `LiveBucketEnvelope`s for `(series_key_id, symbol)` as `text/event-stream`.

    `interval` is accepted and validated (`Literal["1m"]`, `422` otherwise via FastAPI) but not
    otherwise used: `md.series`'s native grid IS 1 minute (`ADR-034/D6`), so there is nothing to
    resample on this edge — the parameter exists so a client's request shape matches
    `/series-history`'s, not because this handler branches on it.
    """
    envelopes = source.stream(series_key_id=series_key_id, symbol=symbol)
    wire_envelopes = (envelope.to_wire() for envelope in envelopes)
    return StreamingResponse(_format_sse(wire_envelopes), media_type="text/event-stream")
