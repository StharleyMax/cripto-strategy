"""Subprocess driver for `T-01.5`'s `D1.8` process test: `collectors_cli.run()`, fakes injected.

`D1.8` needs a REAL process to signal (`SIGTERM`, `SIGKILL`) — the same shape
`ingest_record_driver.py` already uses for `D2.9`. It calls `collectors_cli.run()` directly
rather than `main()`/`python -m ... collectors_cli`, so every network port is a fake and the
"ZERO REDE" rule of `backend/scripts/test.sh` still holds: the Redis side is a REAL, loopback-only
`fakeredis.TcpFakeServer` (same convention `test_redis_stream_series_sink.py` already uses), and
the `!forceOrder@arr`/`premiumIndex` sides are fakes that never touch a socket.

`argv[1] == "force-publish-failure"` (added for `T-01.5` QA `NEEDS_FIX`, round 2) is a SECOND
mode this same driver can run in: the stream key is clobbered with `SET` before `run()` ever
connects, exactly like `test_collectors_cli_publish_failure.py`'s `clobbered_sink` fixture, so
every `XADD` this process attempts comes back a genuine `WRONGTYPE` `RedisCommandError`. That
test calls `_run_premium_index_collector`/`_run_force_order_collector` directly, never
`run()` — so `run()`'s own `return exit_code[0]` (`collectors_cli.py:627`) had no test proving it
reaches the REAL OS `returncode` a shell/systemd/supervisor observes. This mode makes that
reachable through a real subprocess: `test_collectors_cli_run_exit_code_subprocess.py` is the
caller.
"""

from __future__ import annotations

import sys
import threading
from collections.abc import Iterable
from pathlib import Path

import psycopg
from fakeredis import TcpFakeServer

from src.modules.sentimento.domain.force_order_collision_accounting import (
    ForceOrderKeyObservation,
)
from src.modules.sentimento.domain.ingest_record import IngestGap, IngestRun
from src.modules.sentimento.domain.oi_history_paginator import (
    ClosedWindow,
    OiHistoryPageResponse,
)
from src.modules.sentimento.domain.premium_index_batch import PremiumIndexReading
from src.modules.sentimento.domain.provenance import (
    UNKNOWN_OBSERVER_REGION,
    AvailabilitySource,
    Provenance,
    SeriesRow,
)
from src.modules.sentimento.infra import collectors_cli
from src.modules.sentimento.infra.binance_futures_data_client import FuturesDataPageResponse
from src.modules.sentimento.infra.binance_klines_client import KlinesPageResponse
from src.modules.sentimento.infra.ingest_record_store_composition import IngestRecordStore
from src.modules.sentimento.infra.redis_resp_client import connect_resp2, open_tcp_socket
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore
from src.modules.sentimento.use_cases.collect_liquidation_history import LiquidationFetch
from src.modules.sentimento.use_cases.collect_premium_index import (
    PremiumIndexFetcher,
    RawPremiumIndexFetch,
)

_BUCKET_END_MS = 1_787_443_499_999
_EVENT_TIME_MS = 1_787_443_500_000

# One valid, single-symbol premiumIndex batch (mirrors
# `test_collectors_cli_publish_failure.py`'s `_VALID_PREMIUM_INDEX_BODY`) — enough for
# `collect_premium_index_once` to reach `WRITTEN` and call the (clobbered) sink.
_VALID_PREMIUM_INDEX_BODY = (
    b'[{"symbol":"BTCUSDT","markPrice":"1","indexPrice":"1","estimatedSettlePrice":"1",'
    b'"lastFundingRate":"0.0001","interestRate":"0.0001","nextFundingTime":1,"time":1}]'
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


class _EmptyKlinesClient:
    """A `KlinesClient` fake that always answers one empty, successful page.

    The klines thread (`T-01.3`) is the THIRD thread `run()` starts, and it would otherwise
    reach `fapi.binance.com` from inside the offline suite — `backend/scripts/test.sh`'s "ZERO
    REDE" rule. An empty page ends both the boot backfill walk and the periodic cycle
    immediately, which is what keeps these shutdown/exit-code scenarios about the thing they
    were written to measure.
    """

    def klines(
        self,
        symbol: str,
        interval: str,
        limit: int,
        start_time_ms: int | None = None,
        end_time_ms: int | None = None,
    ) -> KlinesPageResponse:
        """Return `status=200` with no rows and no API error code."""
        return KlinesPageResponse(status=200, api_code=None, rows=())


class _EmptyOpenInterestClient:
    """An `OpenInterestHistoryClient` fake that always answers one empty, successful page.

    The open-interest thread (`T-03.3`) is the FOURTH thread `run()` starts, and it would
    otherwise reach `fapi.binance.com` from inside the offline suite — `backend/scripts/test.sh`'s
    "ZERO REDE" rule. An empty page is ACCEPTED by `classify_page` (no `api_code`, no point
    outside the window) and publishes nothing, which is what keeps these shutdown/exit-code
    scenarios about the thing they were written to measure.
    """

    def open_interest_history(
        self, symbol: str, period: str, window: ClosedWindow, limit: int
    ) -> OiHistoryPageResponse:
        """Return `status=200` with no points and no API error code."""
        return OiHistoryPageResponse(status=200, api_code=None, points=())


class _EmptyFuturesDataClient:
    """A `LongShortClient` fake that always answers one empty, successful page.

    The long/short thread (`T-04.3`) is the FIFTH thread `run()` starts, and it would otherwise
    reach `fapi.binance.com/futures/data/` from inside the offline suite —
    `backend/scripts/test.sh`'s "ZERO REDE" rule. An empty page is the SAME shape the real
    endpoint answers for an unsupported `period` (`[MEDIDO 2026-09-12]`: `HTTP 200` with `[]`),
    so this fake is not a shape the source could never produce.
    """

    def history(
        self, endpoint: str, symbol: str, period: str, limit: int
    ) -> FuturesDataPageResponse:
        """Return `status=200` with no points and no API error code."""
        return FuturesDataPageResponse(status=200, api_code=None, points=())


class _EmptyLiquidationSource:
    """A `LiquidationHistorySource` fake that always answers one empty, successful body.

    The liquidation thread (`T-05.5`) is the SIXTH thread `run()` starts, and it is the only one
    whose real default reaches a THIRD PARTY — `api.coinalyze.net` — from inside the offline
    suite, which `backend/scripts/test.sh`'s "ZERO REDE" rule forbids. Worse than slow: it would
    spend real quota on a blind bucket with a 40-per-sliding-minute ceiling, from a test run.

    `[]` is the SAME body the real endpoint returns for a symbol it does not recognise, so this
    is not a shape the source could never produce. It makes every symbol "unanswered"
    (`RS-3.7`), which is exactly what this driver wants: the cycle closes
    `ACCEPTED_WITH_WARNING` with a reason, writes nothing, and never blocks.
    """

    def fetch(self, path: str) -> LiquidationFetch:
        """Return `status=200` with an empty array, whatever was asked for."""
        return LiquidationFetch(status=200, body=b"[]")


class _OneShotPremiumIndexFetcher:
    """A `PremiumIndexFetcher` fake that answers one scripted, non-empty valid batch.

    Only used in `force-publish-failure` mode: the empty batch `_EmptyBatchFetcher` returns
    never reaches `WRITTEN`, so it would never call the (clobbered) sink at all.
    """

    def __init__(self, body: bytes) -> None:
        """Bind the single response body this fetcher will hand back."""
        self._body = body

    def fetch(self) -> RawPremiumIndexFetch:
        """Return `status=200` with the scripted body."""
        return RawPremiumIndexFetch(status=200, body=self._body, headers={})


def _never_maps(
    _received_at: int, _observation: ForceOrderKeyObservation | object
) -> Iterable[SeriesRow]:
    """Return no rows — this scenario never derives a real one, but the port must exist."""
    return ()


def _one_row_premium_index_mapping(
    _received_at: int, _reading: PremiumIndexReading
) -> Iterable[SeriesRow]:
    """Return exactly one valid row — enough for `RedisPremiumIndexSink` to call `sink.accept`.

    Only used in `force-publish-failure` mode, where the sink's stream key is clobbered: this
    is what makes the (otherwise never-exercised) `XADD` call happen at all.
    """
    return (
        SeriesRow(
            series_key_id="a" * 64,
            symbol="BTCUSDT",
            source="binance_premium_index",
            bucket_end=_BUCKET_END_MS,
            event_time=_EVENT_TIME_MS,
            available_at=_EVENT_TIME_MS + 30_000,
            availability_source=AvailabilitySource.OBSERVED,
            ingested_at=_EVENT_TIME_MS + 45_000,
            observed_at=_EVENT_TIME_MS + 46_000,
            provenance=Provenance.OBSERVED,
            src_label_raw="premiumIndex",
            observer_id="vps-01",
            observer_region=UNKNOWN_OBSERVER_REGION,
            is_final=True,
            value_raw="1.0",
        ),
    )


class _RecordRunRaisesOperationalError:
    """An ingest-record store whose `record_run` raises what PRODUCTION actually raised.

    Models the `2026-09-11T19:53` outage literally: Postgres went down (`AdminShutdown`), and
    the next `record_run` raised `psycopg.OperationalError: the connection is closed` from
    inside a collector thread. `OperationalError` descends from `psycopg.Error` -> `Exception`
    and is NEITHER an `OSError` NOR a `ValueError`, so it is not in
    `collectors_cli._PUBLISH_FAILURE_EXCEPTIONS` and escapes every `except` a collector runner
    has. Before the supervisor wrapper this driver's `thread-dies-unhandled` mode exists to
    pin, that killed the THREAD and left the PROCESS alive: `docker inspect` reported
    `running=true`, `exit=0`, `restarts=0` for 18 h 45 min while nothing was collected.

    Everything except `record_run` delegates to a real `SqliteIngestRecordStore`, so boot
    (`initialise`) still behaves exactly as it does in the other modes. All SIX methods of
    `IngestRecordStore` (`ADR-031/D1`) are delegated, not just the two this scenario calls:
    the Protocol is satisfied STRUCTURALLY, so a partial surface would be a `mypy` error here
    rather than a runtime surprise later.
    """

    def __init__(self, delegate: SqliteIngestRecordStore) -> None:
        """Bind the real store every non-raising call is forwarded to."""
        self._delegate = delegate

    def initialise(self) -> None:
        """Delegate — boot must succeed, so the failure happens in a THREAD, not at boot."""
        self._delegate.initialise()

    def record_run(self, run: IngestRun) -> None:
        """Raise the real production exception instead of recording the run."""
        raise psycopg.OperationalError("the connection is closed")

    def record_gap(self, gap: IngestGap) -> None:
        """Delegate — this scenario never records a gap, but the Protocol requires the method."""
        self._delegate.record_gap(gap)

    def describe_readiness(self) -> tuple[bool, bool]:
        """Delegate — boot reads this, and it must answer exactly as the real store does."""
        return self._delegate.describe_readiness()

    def runs(self) -> tuple[IngestRun, ...]:
        """Delegate — the caller reads recorded runs through a separate, real store."""
        return self._delegate.runs()

    def gaps(self) -> tuple[IngestGap, ...]:
        """Delegate — present for the Protocol; this scenario never reads gaps."""
        return self._delegate.gaps()


def main(argv: list[str]) -> int:
    """Run the real `collectors_cli` composition with every network-touching port faked.

    `argv[1] == "force-publish-failure"` clobbers the stream key with `SET` BEFORE `run()`
    connects, so every `XADD` this process attempts comes back a genuine `WRONGTYPE` — the
    premium-index thread reaches it (its cycle fires once immediately) since it is now fed a
    real batch and a real row mapping instead of the empty/never-maps pair the clean-shutdown
    scenario uses.
    """
    store_path = Path(argv[0])
    force_publish_failure = len(argv) > 1 and argv[1] == "force-publish-failure"
    thread_dies_unhandled = len(argv) > 1 and argv[1] == "thread-dies-unhandled"
    server = TcpFakeServer(("127.0.0.1", 0), server_type="redis")
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.socket.getsockname()

    stream_name = "md.series.write"
    config = collectors_cli.BootConfig(
        redis_host=host,
        redis_port=port,
        redis_stream=stream_name,
        redis_stream_maxlen=100_000,
        ingest_record_backend="sqlite",
        ingest_health_store_path=store_path,
        # Large on purpose: the premium-index thread fires once at start, then must NOT fire
        # again before this driver's caller sends its signal.
        premium_index_cycle_interval_s=999_999.0,
        # Same reasoning for the klines thread: one boot pass (empty, see
        # `_EmptyKlinesClient`) and then never again before the signal arrives.
        klines_cycle_interval_s=999_999.0,
        klines_backfill_days=1,
        # Same reasoning again for the open-interest thread (`T-03.3`): one boot pass (empty,
        # see `_EmptyOpenInterestClient`) and then never again before the signal arrives.
        open_interest_cycle_interval_s=999_999.0,
        open_interest_backfill_days=1,
        # And again for the long/short thread (`T-04.3`): one boot pass against
        # `_EmptyFuturesDataClient`, then a cadence no scenario here waits out.
        long_short_cycle_interval_s=999_999.0,
        # And once more for the liquidation thread (`T-05.5`): one pass against
        # `_EmptyLiquidationSource`, then a cadence no scenario here waits out. The cadence
        # is ALSO what spreads the calls (`RS-3.6`), so a small value here would make the
        # driver sleep between symbols for no reason.
        liquidation_cycle_interval_s=999_999.0,
    )
    if force_publish_failure:
        # Same real-server technique `test_collectors_cli_publish_failure.py`'s `clobbered_sink`
        # fixture uses: `SET` the stream key to a plain string BEFORE anything publishes, so the
        # (real, loopback-only) fake server answers every `XADD` against it with `WRONGTYPE`.
        setup = connect_resp2(open_tcp_socket(host, port))
        setup.command("SET", stream_name, "not-a-stream")
    connection = connect_resp2(open_tcp_socket(host, port))
    store: IngestRecordStore = SqliteIngestRecordStore(store_path)
    if thread_dies_unhandled:
        store = _RecordRunRaisesOperationalError(SqliteIngestRecordStore(store_path))
    store.initialise()

    def _fetcher_factory() -> PremiumIndexFetcher:
        if force_publish_failure:
            return _OneShotPremiumIndexFetcher(_VALID_PREMIUM_INDEX_BODY)
        return _EmptyBatchFetcher()

    premium_index_to_rows = _one_row_premium_index_mapping if force_publish_failure else _never_maps

    try:
        return collectors_cli.run(
            config=config,
            connection=connection,
            store=store,
            force_order_source_factory=_BlockingForceOrderSource,
            premium_index_fetcher_factory=_fetcher_factory,
            klines_client_factory=_EmptyKlinesClient,
            open_interest_client_factory=_EmptyOpenInterestClient,
            long_short_client_factory=_EmptyFuturesDataClient,
            liquidation_source_factory=_EmptyLiquidationSource,
            premium_index_to_rows=premium_index_to_rows,
            force_order_to_rows=_never_maps,
        )
    finally:
        server.shutdown()
        thread.join(timeout=2.0)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
