"""QA driver: kill ONE named collector thread with an unlisted exception, per invocation.

`collectors_cli_driver.py`'s `thread-dies-unhandled` mode proves the supervisor for WHICHEVER
thread reaches `record_run` first — it does not prove the other three are wrapped. This driver
takes the thread NAME as `argv[1]` and injects `psycopg.OperationalError` (the real production
exception of `2026-09-11T19:53`, and neither `OSError` nor `ValueError`, so it is outside
`collectors_cli._PUBLISH_FAILURE_EXCEPTIONS`) into the port that ONLY that thread calls:

    collector-force-order   -> the `open_source` factory, called inside the thread
    collector-premium-index -> `PremiumIndexFetcher.fetch`
    collector-klines        -> `KlinesClient.klines`
    collector-open-interest -> `OpenInterestHistoryClient.open_interest_history`

Every other port stays the empty/blocking fake `collectors_cli_driver.py` already uses, so the
only thing that can end the process is the death of the named thread.
"""

from __future__ import annotations

import sys
import threading
from collections.abc import Iterable
from pathlib import Path

import psycopg
from fakeredis import TcpFakeServer

from src.modules.sentimento.domain.oi_history_paginator import (
    ClosedWindow,
    OiHistoryPageResponse,
)
from src.modules.sentimento.domain.provenance import SeriesRow
from src.modules.sentimento.infra import collectors_cli
from src.modules.sentimento.infra.binance_klines_client import KlinesPageResponse
from src.modules.sentimento.infra.redis_resp_client import connect_resp2, open_tcp_socket
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore
from src.modules.sentimento.use_cases.collect_premium_index import RawPremiumIndexFetch
from tests.helpers.collectors_cli_driver import (
    _BlockingForceOrderSource,
    _EmptyBatchFetcher,
    _EmptyKlinesClient,
    _EmptyOpenInterestClient,
)

FORCE_ORDER = "collector-force-order"
PREMIUM_INDEX = "collector-premium-index"
KLINES = "collector-klines"
OPEN_INTEREST = "collector-open-interest"
THREAD_NAMES = (FORCE_ORDER, PREMIUM_INDEX, KLINES, OPEN_INTEREST)

_OUTAGE = "the connection is closed"

# `argv[2]`, optional: which exception class the rigged port raises. `operational` is the real
# production one; the other two answer the question a `except BaseException` handler raises —
# does the net swallow the two exceptions Python treats as "not an error"?
_KILLERS = {
    "operational": lambda: psycopg.OperationalError(_OUTAGE),
    "systemexit": lambda: SystemExit(7),
    "keyboardinterrupt": lambda: KeyboardInterrupt(),
}
_KILLER = ["operational"]


def _boom() -> None:
    """Raise the exact exception production raised, from inside whatever thread calls this."""
    raise _KILLERS[_KILLER[0]]()


class _DyingPremiumIndexFetcher:
    """A fetcher whose in-thread `fetch` dies of an exception no runner lists."""

    def fetch(self) -> RawPremiumIndexFetch:
        """Raise instead of answering a batch."""
        _boom()
        raise AssertionError("unreachable")


class _DyingKlinesClient:
    """A klines client whose in-thread `klines` dies of an exception no runner lists."""

    def klines(
        self,
        symbol: str,
        interval: str,
        limit: int,
        start_time_ms: int | None = None,
        end_time_ms: int | None = None,
    ) -> KlinesPageResponse:
        """Raise instead of answering a page."""
        _boom()
        raise AssertionError("unreachable")


class _DyingOpenInterestClient:
    """An OI client whose in-thread `open_interest_history` dies of an unlisted exception."""

    def open_interest_history(
        self, symbol: str, period: str, window: ClosedWindow, limit: int
    ) -> OiHistoryPageResponse:
        """Raise instead of answering a page."""
        _boom()
        raise AssertionError("unreachable")


def _never_maps(*_args: object, **_kwargs: object) -> Iterable[SeriesRow]:
    """Return no rows — no scenario here derives one."""
    return ()


def main(argv: list[str]) -> int:
    """Run `collectors_cli.run()` with exactly one thread's port rigged to raise."""
    store_path = Path(argv[0])
    target = argv[1]
    if target not in THREAD_NAMES:
        raise SystemExit(f"unknown thread name: {target}")
    if len(argv) > 2:
        _KILLER[0] = argv[2]
    server = TcpFakeServer(("127.0.0.1", 0), server_type="redis")
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    host, port = server.socket.getsockname()
    config = collectors_cli.BootConfig(
        redis_host=host,
        redis_port=port,
        redis_stream="md.series.write",
        redis_stream_maxlen=100_000,
        ingest_record_backend="sqlite",
        ingest_health_store_path=store_path,
        premium_index_cycle_interval_s=999_999.0,
        klines_cycle_interval_s=999_999.0,
        klines_backfill_days=1,
        open_interest_cycle_interval_s=999_999.0,
        open_interest_backfill_days=1,
    )
    connection = connect_resp2(open_tcp_socket(host, port))
    store = SqliteIngestRecordStore(store_path)
    store.initialise()

    def _force_order_factory() -> object:
        if target == FORCE_ORDER:
            _boom()
        return _BlockingForceOrderSource()

    try:
        return collectors_cli.run(
            config=config,
            connection=connection,
            store=store,
            force_order_source_factory=_force_order_factory,  # type: ignore[arg-type]
            premium_index_fetcher_factory=(
                _DyingPremiumIndexFetcher if target == PREMIUM_INDEX else _EmptyBatchFetcher
            ),
            klines_client_factory=(
                _DyingKlinesClient if target == KLINES else _EmptyKlinesClient
            ),
            open_interest_client_factory=(
                _DyingOpenInterestClient
                if target == OPEN_INTEREST
                else _EmptyOpenInterestClient
            ),
            premium_index_to_rows=_never_maps,
            force_order_to_rows=_never_maps,
        )
    finally:
        server.shutdown()
        server_thread.join(timeout=2.0)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
