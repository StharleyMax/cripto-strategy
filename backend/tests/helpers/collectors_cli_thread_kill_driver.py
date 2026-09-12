"""QA driver: kill ONE named collector thread with an unlisted exception, per invocation.

`collectors_cli_driver.py`'s `thread-dies-unhandled` mode proves the supervisor for WHICHEVER
thread reaches `record_run` first — it does not prove the other four are wrapped. This driver
takes the thread NAME as `argv[1]` and injects `psycopg.OperationalError` (the real production
exception of `2026-09-11T19:53`, and neither `OSError` nor `ValueError`, so it is outside
`collectors_cli._PUBLISH_FAILURE_EXCEPTIONS`) into the port that ONLY that thread calls:

    collector-force-order   -> the `open_source` factory, called inside the thread
    collector-premium-index -> `PremiumIndexFetcher.fetch`
    collector-klines        -> `KlinesClient.klines`
    collector-open-interest -> `OpenInterestHistoryClient.open_interest_history`
    collector-long-short    -> `LongShortClient.history`

Every other port stays the empty/blocking fake `collectors_cli_driver.py` already uses, so the
only thing that can end the process is the death of the named thread.

⛔ EVERY port must be injected, including the ones no scenario kills — an OMITTED factory is not
a neutral default, it is the REAL network client, and it silently destroys this driver's only
reason to exist. `run()` resolves each factory as `X_client_factory or <RealClient>`, so leaving
`long_short_client_factory` out made the long/short thread build `BinanceFuturesDataClient`.
Offline that thread then died on its own, under its own (correct) `_supervised`, and the process
exited non-zero NO MATTER WHAT the named thread's supervisor did: a mutant with `_supervised`
stripped from `collector-klines` PASSED. `[MEDIDO 2026-09-12 em 6ee33cc: getaddrinfo(
'fapi.binance.com') = 1 por processo; mutante rc=1 (passa) offline, rc=124 (reprova) com rede —
o veredito dependia da REDE. Com a injecao: getaddrinfo = 0, mutante rc=124 nos dois casos]`

So the invariant this file must keep, and the one worth re-checking whenever `run()` grows a
thread: `THREAD_NAMES` lists EVERY thread `collectors_cli.run()` starts, and `main` passes a
fake for EVERY client factory `run()` accepts. Zero network, zero DNS.
"""

from __future__ import annotations

import logging
import sys
import threading
from collections.abc import Callable, Iterable, Mapping, Sequence
from pathlib import Path

import psycopg
from fakeredis import TcpFakeServer

from src.modules.sentimento.domain.oi_history_paginator import (
    ClosedWindow,
    OiHistoryPageResponse,
)
from src.modules.sentimento.domain.provenance import SeriesRow
from src.modules.sentimento.infra import collectors_cli
from src.modules.sentimento.infra.binance_futures_data_client import FuturesDataPageResponse
from src.modules.sentimento.infra.binance_klines_client import KlinesPageResponse
from src.modules.sentimento.infra.redis_resp_client import connect_resp2, open_tcp_socket
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore
from src.modules.sentimento.use_cases.collect_liquidation_history import LiquidationFetch
from src.modules.sentimento.use_cases.collect_premium_index import RawPremiumIndexFetch
from tests.helpers.collectors_cli_driver import (
    _BlockingForceOrderSource,
    _EmptyBatchFetcher,
    _EmptyFuturesDataClient,
    _EmptyKlinesClient,
    _EmptyLiquidationSource,
    _EmptyOpenInterestClient,
)

FORCE_ORDER = "collector-force-order"
PREMIUM_INDEX = "collector-premium-index"
KLINES = "collector-klines"
OPEN_INTEREST = "collector-open-interest"
LONG_SHORT = "collector-long-short"
# The SIXTH thread (`T-05.5`). It joins this tuple rather than being left out, because the
# tuple is what makes the guarantee COMPLETE: `_supervised` is a class of protection, and a
# thread missing from here would be a thread nobody ever proved brings the process down.
LIQUIDATION = "collector-liquidation"
THREAD_NAMES = (
    FORCE_ORDER,
    PREMIUM_INDEX,
    KLINES,
    OPEN_INTEREST,
    LONG_SHORT,
    LIQUIDATION,
)

_OUTAGE = "the connection is closed"

# `argv[2]`, optional: which exception class the rigged port raises. `operational` is the real
# production one; the other two answer the question a `except BaseException` handler raises —
# does the net swallow the two exceptions Python treats as "not an error"?
_KILLERS: dict[str, Callable[[], BaseException]] = {
    "operational": lambda: psycopg.OperationalError(_OUTAGE),
    "systemexit": lambda: SystemExit(7),
    "keyboardinterrupt": lambda: KeyboardInterrupt(),
}
_KILLER = ["operational"]

# `argv[3]`, optional. `break-logging` makes `logger.critical("collector_thread_died", ...)`
# ITSELF raise, from inside `_supervised`'s last-resort handler, so a test can ask the only
# question the handler's statement ORDER answers: is the net armed before it is reported?
BREAK_LOGGING = "break-logging"


class _CriticalLogThatRaises(logging.Filter):
    """A logger filter that turns the net's own `critical` call into a raise.

    NOT a raising `Handler`: `logging.Handler.emit` failures are swallowed by
    `Handler.handleError` and never reach the caller, so a handler cannot reproduce the defect.
    A filter CAN — `Logger.handle` calls `Filterer.filter` outside any `try`, so the exception
    propagates out of `logger.critical(...)` and back into `_supervised`, which is exactly the
    shape of the `KeyError: Attempt to overwrite 'thread' in LogRecord` that `logging`
    itself raised there during construction, and of the `queue.Full`/closed-stream/operator
    filter failures the module does not own.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        """Raise on the net's own record; let every other record through."""
        if record.msg == "collector_thread_died":
            raise RuntimeError("the critical log itself raised")
        return True


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


class _DyingLongShortClient:
    """A `LongShortClient` whose in-thread `history` dies of an exception no runner lists."""

    def history(
        self, endpoint: str, symbol: str, period: str, limit: int
    ) -> FuturesDataPageResponse:
        """Raise instead of answering a page."""
        _boom()
        raise AssertionError("unreachable")


def _never_maps_long_short(
    _n: int, _symbol: str, _points: Sequence[Mapping[str, object]]
) -> tuple[SeriesRow, ...]:
    """Return no rows — the long/short thread here exists only to be killed or to idle."""
    return ()


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
    if len(argv) > 3:
        if argv[3] != BREAK_LOGGING:
            raise SystemExit(f"unknown log mode: {argv[3]}")
        collectors_cli.logger.addFilter(_CriticalLogThatRaises())
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
        long_short_cycle_interval_s=999_999.0,
        liquidation_cycle_interval_s=999_999.0,
    )
    connection = connect_resp2(open_tcp_socket(host, port))
    store = SqliteIngestRecordStore(store_path)
    store.initialise()

    class _DyingLiquidationSource:
        """A liquidation source whose one port raises the rigged exception."""

        def fetch(self, path: str) -> LiquidationFetch:
            """Die the way a dead connection does, from inside the collector thread."""
            _boom()
            raise AssertionError("unreachable: _boom always raises")

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
            klines_client_factory=(_DyingKlinesClient if target == KLINES else _EmptyKlinesClient),
            open_interest_client_factory=(
                _DyingOpenInterestClient if target == OPEN_INTEREST else _EmptyOpenInterestClient
            ),
            long_short_client_factory=(
                _DyingLongShortClient if target == LONG_SHORT else _EmptyFuturesDataClient
            ),
            liquidation_source_factory=(
                _DyingLiquidationSource if target == LIQUIDATION else _EmptyLiquidationSource
            ),
            premium_index_to_rows=_never_maps,
            force_order_to_rows=_never_maps,
            long_short_to_rows=_never_maps_long_short,
            long_short_symbols=("BTCUSDT",),
            liquidation_symbols=("BTCUSDT",),
        )
    finally:
        server.shutdown()
        server_thread.join(timeout=2.0)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
