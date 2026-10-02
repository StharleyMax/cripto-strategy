"""`python -m src.main`: serve `app` in-process with `uvicorn` — the dev/prod launcher.

`uvicorn` bare (no `[standard]`) is the deliberate choice over the neighbor's Granian: the
DoD's network proof (`backend/tests/api/test_ingest_health_route_over_the_network.py`) has to
run the server IN THE TEST PROCESS'S OWN THREAD, and `uvicorn.Server` is built for exactly
that (`Config(..., install_signal_handlers=False)` + `Server.run()` on a `threading.Thread`).
This module is the OTHER caller of the same `uvicorn.Server`/`uvicorn.run`, so the process
started by a human and the process started by the test share one server implementation.
"""

from __future__ import annotations

import os
from typing import Final

import uvicorn

from src.main import app

# `T-06.3` (`handoff/T-06.3-desenho.md` §2): the import string uvicorn needs to spawn worker
# processes — it refuses `workers > 1` with an app OBJECT, since each child imports its own app.
_APP_IMPORT_STRING: Final[str] = "src.main:app"
# Recycling jitter as a fraction of `API_LIMIT_MAX_REQUESTS` (2000 -> 200, the design's number):
# without it, workers started together would all recycle on the same request and leave the
# screen with no worker for the ~1.6 s a worker takes to boot.
_JITTER_DIVISOR: Final[int] = 10


class InvalidWorkerCountError(ValueError):
    """`API_WORKERS` is below 1 — there is no server with zero processes to fall back to."""


def _worker_count() -> int:
    """`API_WORKERS`, default 1 (today's single in-process server)."""
    workers = int(os.environ.get("API_WORKERS", "1"))
    if workers < 1:
        raise InvalidWorkerCountError(f"API_WORKERS = {workers}: must be >= 1")
    return workers


def main() -> None:
    """Bind host is `APP_HOST`, defaulting to loopback — `[DECISAO-OWNER: 2026-09-08]`.

    The original `[DECISAO-OWNER: 2026-09-03]` bound `host="127.0.0.1"` unconditionally, which
    was correct before `deploy/` existed but broke once it did: `127.0.0.1` inside a container
    is THAT container's own loopback, unreachable from another container by service name and
    unreachable from the host through a published port. `CA-E2E-local.md` §2 measured exactly
    this gap — `web`→`api` failed with "Recv failure", the same failure the 2026-09-03 docstring
    predicted: "this repository has no `deploy/` yet ... so the bind itself is the only thing
    enforcing it today." `deploy/` exists now (`T-03.4`), so the owner reopened the decision and
    chose the env-var seam over a hardcoded flip: default stays `"127.0.0.1"` — whoever runs this
    OUTSIDE a container, with no compose network to reach it from, keeps today's no-exposure
    behavior unchanged — and `deploy/compose.yml`'s `api` service alone sets `APP_HOST=0.0.0.0`;
    never `writer`/`collector`, which never call `uvicorn.run` at all.

    The port is still read from `APP_PORT`, defaulting to `8000` — the port the neighbor's
    compose maps as `127.0.0.1:${APP_PORT}:${APP_PORT}` under the local overlay (gate §7).

    `T-06.3` (`ADR-027/D1` keeps its shape: same image, same `command:`, no new container):
    `API_WORKERS` (default 1) sets how many worker processes uvicorn's supervisor runs. One
    process serializes the screen's 10 parallel `series-history` calls behind one psycopg
    connection and the GIL (`T-06.3-desenho.md` §1.3), so only more PROCESSES help. With
    `API_WORKERS` unset or `1` the call below is exactly the pre-`T-06.3` one — the app object,
    no `workers` — so the in-thread network test keeps its single server. With more than one,
    uvicorn requires the import string, and `API_LIMIT_MAX_REQUESTS` (unset = never recycle)
    makes the supervisor replace a worker after that many requests: CPython keeps its arena
    high-water mark as resident memory (1,837 MB measured on the single worker), and a fresh
    worker starts at ~60 MB. Recycling is only honoured with a supervisor (`workers > 1`): a
    lone uvicorn server would simply EXIT after N requests, taking the API down.
    """
    host = os.environ.get("APP_HOST", "127.0.0.1")
    port = int(os.environ.get("APP_PORT", "8000"))
    workers = _worker_count()
    if workers == 1:
        uvicorn.run(app, host=host, port=port)
        return
    raw_limit = os.environ.get("API_LIMIT_MAX_REQUESTS")
    limit = int(raw_limit) if raw_limit else None
    uvicorn.run(
        _APP_IMPORT_STRING,
        host=host,
        port=port,
        workers=workers,
        limit_max_requests=limit,
        limit_max_requests_jitter=limit // _JITTER_DIVISOR if limit else 0,
    )


if __name__ == "__main__":
    main()
