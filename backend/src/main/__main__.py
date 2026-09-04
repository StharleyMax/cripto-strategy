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
    """Bind loopback-only — `[DECISAO-OWNER: 2026-09-03]`: no public network exposure.

    The port is read from `APP_PORT`, defaulting to `8000` — the port the neighbor's compose
    maps as `127.0.0.1:8000:8000` (gate §7). This repository has no `deploy/` yet to impose
    loopback from outside the process, so the bind itself is the only thing enforcing it today.
    """
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("APP_PORT", "8000")))


if __name__ == "__main__":
    main()
