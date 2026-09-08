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

import uvicorn

from src.main import app


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
    """
    uvicorn.run(
        app,
        host=os.environ.get("APP_HOST", "127.0.0.1"),
        port=int(os.environ.get("APP_PORT", "8000")),
    )


if __name__ == "__main__":
    main()
