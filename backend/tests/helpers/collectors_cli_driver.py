"""Subprocess driver for `T-01.5`'s `D1.8` process test: `collectors_cli.run()`, fakes injected.

`D1.8` needs a REAL process to signal (`SIGTERM`, `SIGKILL`) — the same shape
`ingest_record_driver.py` already uses for `D2.9`. It calls `collectors_cli.run()` directly
rather than `main()`/`python -m ... collectors_cli`, so every network port is a fake and the
"ZERO REDE" rule of `backend/scripts/test.sh` still holds: the Redis side is a REAL, loopback-only
`fakeredis.TcpFakeServer` (same convention `test_redis_stream_series_sink.py` already uses), and
the `!forceOrder@arr`/`premiumIndex` sides are fakes that never touch a socket.
"""

from __future__ import annotations

import sys
import threading
from collections.abc import Iterable
from pathlib import Path

from fakeredis import TcpFakeServer

from src.modules.sentimento.domain.force_order_collision_accounting import (
    ForceOrderKeyObservation,
)
from src.modules.sentimento.domain.provenance import SeriesRow
from src.modules.sentimento.infra import collectors_cli
from src.modules.sentimento.infra.redis_resp_client import connect_resp2, open_tcp_socket
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore
from src.modules.sentimento.use_cases.collect_premium_index import (
    PremiumIndexFetcher,
    RawPremiumIndexFetch,
)


class _BlockingForceOrderSource:
    """A `MessageSource` fake that blocks until `close()` is called, then ends the read.

    Models a live `!forceOrder@arr` connection sitting idle: nothing to read, until `SIGTERM`
    forces the socket closed (`run()`'s handler calls `close()` on whatever `source_holder[0]`
    names), which is exactly what should unblock a real blocking `recv` too.
    """

    def __init__(self) -> None:
        """Start open (nothing has closed it yet)."""
        self._closed = threading.Event()

    def open(self) -> None:
        """No transport to open — this fake has none."""

    def close(self) -> None:
        """Signal the blocked reader to give up and end the iteration."""
        self._closed.set()

    def messages(self) -> _BlockingForceOrderSource:
        """Return self — this fake IS its own iterator."""
        return self

    def __iter__(self) -> _BlockingForceOrderSource:
        """Return self, so `next()` on the result of `messages()` reaches `__next__` below."""
        return self

    def __next__(self) -> str:
        """Block in short increments until `close()` runs, then end the iteration."""
        while not self._closed.wait(0.05):
            pass
        raise StopIteration


class _EmptyBatchFetcher:
    """A `PremiumIndexFetcher` fake that always answers one empty, valid batch."""

    def fetch(self) -> RawPremiumIndexFetch:
        """Return `status=200` and `body=b"[]"` — a valid, symbol-less batch."""
        return RawPremiumIndexFetch(status=200, headers={}, body=b"[]")


def _never_maps(
    _received_at: int, _observation: ForceOrderKeyObservation | object
) -> Iterable[SeriesRow]:
    """Return no rows — this scenario never derives a real one, but the port must exist."""
    return ()


def main(argv: list[str]) -> int:
    """Run the real `collectors_cli` composition with every network-touching port faked."""
    store_path = Path(argv[0])
    server = TcpFakeServer(("127.0.0.1", 0), server_type="redis")
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.socket.getsockname()

    config = collectors_cli.BootConfig(
        redis_host=host,
        redis_port=port,
        redis_stream="md.series.write",
        redis_stream_maxlen=100_000,
        ingest_record_backend="sqlite",
        ingest_health_store_path=store_path,
        # Large on purpose: the premium-index thread fires once at start, then must NOT fire
        # again before this driver's caller sends its signal.
        premium_index_cycle_interval_s=999_999.0,
    )
    connection = connect_resp2(open_tcp_socket(host, port))
    store = SqliteIngestRecordStore(store_path)
    store.initialise()

    def _fetcher_factory() -> PremiumIndexFetcher:
        return _EmptyBatchFetcher()

    try:
        return collectors_cli.run(
            config=config,
            connection=connection,
            store=store,
            force_order_source_factory=_BlockingForceOrderSource,
            premium_index_fetcher_factory=_fetcher_factory,
            premium_index_to_rows=_never_maps,
            force_order_to_rows=_never_maps,
        )
    finally:
        server.shutdown()
        thread.join(timeout=2.0)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
