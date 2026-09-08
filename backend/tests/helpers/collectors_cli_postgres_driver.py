"""Subprocess driver for `T-02.8`'s `D2.8`: `collectors_cli.run()` against a REAL Postgres.

Same shape as `collectors_cli_driver.py` (fakes for Redis and both producers, `SIGTERM` closes
the session cleanly), but the record store is composed by `compose_ingest_record_store` (`T-02.4`)
reading `INGEST_RECORD_BACKEND=postgres` and the `POSTGRES_*` vars from the environment the parent
test process sets — the SAME function `collectors_cli.main()` itself calls, so this driver proves
the real composition root, not a shortcut around it. The Redis side stays a REAL, loopback-only
`fakeredis.TcpFakeServer` (no `!forceOrder@arr`/`premiumIndex` network either): `D2.8`'s point is
that the COLLECTOR and the API (`test_collector_status_dual_process_postgres.py`) read the same
external Postgres, not that this driver's Redis/HTTP transport is real.

The two fakes (`_BlockingForceOrderSource`, `_EmptyBatchFetcher`) and the no-op mapping
(`_never_maps`) are IMPORTED from `collectors_cli_driver`, not re-typed here — they carry no
sqlite-specific behaviour, and a second definition would be exactly the drift risk `T-02.4`'s own
docstring names for composition roots.
"""

from __future__ import annotations

import os
import sys
import threading
from pathlib import Path

from fakeredis import TcpFakeServer

from src.modules.sentimento.infra import collectors_cli
from src.modules.sentimento.infra.ingest_record_store_composition import (
    DEFAULT_INGEST_HEALTH_STORE_PATH,
    compose_ingest_record_store,
)
from src.modules.sentimento.infra.redis_resp_client import connect_resp2, open_tcp_socket
from tests.helpers.collectors_cli_driver import (
    _BlockingForceOrderSource,
    _EmptyBatchFetcher,
    _never_maps,
)


def main(_argv: list[str]) -> int:
    """Run the real `collectors_cli` composition with Redis faked, the record store real.

    No positional argv: every Postgres var travels through `os.environ`, exactly like the real
    `collectors_cli.main()` reads them via `compose_ingest_record_store`.
    """
    server = TcpFakeServer(("127.0.0.1", 0), server_type="redis")
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.socket.getsockname()

    config = collectors_cli.BootConfig(
        redis_host=host,
        redis_port=port,
        redis_stream="md.series.write",
        redis_stream_maxlen=100_000,
        ingest_record_backend="postgres",
        # Unused by `run()` for the `postgres` engine (`store` below is already composed) — kept
        # populated only because `BootConfig` is a single frozen shape every composition root
        # fills in full, same as `collectors_cli.resolve_boot_config` always does.
        ingest_health_store_path=Path(DEFAULT_INGEST_HEALTH_STORE_PATH),
        # Large on purpose: the premium-index thread fires once at start, then must NOT fire
        # again before this driver's caller sends `SIGTERM` (`collectors_cli_driver.py`'s own
        # comment, same reasoning).
        premium_index_cycle_interval_s=999_999.0,
    )
    connection = connect_resp2(open_tcp_socket(host, port))
    store = compose_ingest_record_store(os.environ)
    store.initialise()

    try:
        return collectors_cli.run(
            config=config,
            connection=connection,
            store=store,
            force_order_source_factory=_BlockingForceOrderSource,
            premium_index_fetcher_factory=_EmptyBatchFetcher,
            premium_index_to_rows=_never_maps,
            force_order_to_rows=_never_maps,
        )
    finally:
        server.shutdown()
        thread.join(timeout=2.0)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
