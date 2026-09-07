"""`T-01.5` QA `NEEDS_FIX`: a real `XADD` failure closes the run `REJECTED` — BOTH threads.

`tasks.toml:114`'s own title ("XADD falho encerra a sessao com REJECTED... sai rc!=0") was
covered by NO test before this file: `test_collectors_cli_boot.py`/`test_collectors_cli_shutdown.py`
exercise boot and clean `SIGTERM`, never a publish failure. The QA gate falsified this directly —
mutating `verdict = "REJECTED"` -> `"ACCEPTED"`, and separately dropping `exit_code[0] = 1`, in
`_run_force_order_collector`'s `except` branch — and `pytest -k collectors_cli` passed unchanged
both times. These tests exist to make that mutation fail.

The failure is a REAL `XADD` refusal, not a fabricated double: like
`test_redis_stream_series_sink.py::test_a_failed_xadd_propagates_instead_of_being_swallowed`, a
real (loopback-only) `fakeredis.TcpFakeServer` has its stream key clobbered with `SET` BEFORE
anything publishes, so the server answers `XADD` with a genuine `WRONGTYPE` `RedisCommandError` —
exactly the class of failure `SPEC-004` §3.1 names ("falha do Redis em regime"). Both collector
threads are called directly (not through a subprocess), matching the QA gate's own suggestion —
observing `exit_code`/`failure_event`/the recorded `IngestRun` without a live process.
"""

from __future__ import annotations

import threading
from collections.abc import Iterable, Iterator
from typing import Any

import pytest
from fakeredis import TcpFakeServer

from src.modules.sentimento.domain.force_order_collision_accounting import (
    ForceOrderKeyObservation,
)
from src.modules.sentimento.domain.ingest_record import IngestRun
from src.modules.sentimento.domain.premium_index_batch import (
    PREMIUM_INDEX_ENDPOINT,
    PremiumIndexReading,
)
from src.modules.sentimento.domain.provenance import (
    UNKNOWN_OBSERVER_REGION,
    AvailabilitySource,
    Provenance,
    SeriesRow,
)
from src.modules.sentimento.infra import collectors_cli
from src.modules.sentimento.infra.redis_resp_client import connect_resp2, open_tcp_socket
from src.modules.sentimento.infra.redis_stream_series_sink import RedisStreamSeriesSink
from src.modules.sentimento.use_cases.collect_premium_index import RawPremiumIndexFetch
from src.modules.sentimento.use_cases.probe_stream_quantity_fields import MessageSource

STREAM = "md.series.write"
BUCKET_END_MS = 1_787_443_499_999
EVENT_TIME_MS = 1_787_443_500_000

# One raw `!forceOrder@arr` frame, B2-keyable (mirrors `test_force_order_reconnection.py`'s
# `FRAME_A`) — enough for `extract_force_order_natural_key` to succeed and reach the sink.
FRAME_A = (
    '{"e":"forceOrder","E":0,"o":{"s":"BTCUSDT","S":"SELL","o":"LIMIT","f":"IOC","q":"0.010",'
    '"p":"78000.00","ap":"78006.30","X":"FILLED","l":"0.010","z":"0.010","T":0}}'
)

# One valid, single-symbol premiumIndex batch (mirrors `test_collect_premium_index.py`'s
# `_VALID_BODY`) — enough for `collect_premium_index_once` to reach `WRITTEN`'s `sink.write`.
_VALID_PREMIUM_INDEX_BODY = (
    b'[{"symbol":"BTCUSDT","markPrice":"1","indexPrice":"1","estimatedSettlePrice":"1",'
    b'"lastFundingRate":"0.0001","interestRate":"0.0001","nextFundingTime":1,"time":1}]'
)


def _row(**overrides: Any) -> SeriesRow:
    """Build one valid market-series row — mirrors `test_redis_stream_series_sink.py`'s helper."""
    columns: dict[str, Any] = {
        "series_key_id": "a" * 64,
        "symbol": "BTCUSDT",
        "source": "binance_premium_index",
        "bucket_end": BUCKET_END_MS,
        "event_time": EVENT_TIME_MS,
        "available_at": EVENT_TIME_MS + 30_000,
        "availability_source": AvailabilitySource.OBSERVED,
        "ingested_at": EVENT_TIME_MS + 45_000,
        "observed_at": EVENT_TIME_MS + 46_000,
        "provenance": Provenance.OBSERVED,
        "src_label_raw": "premiumIndex",
        "observer_id": "vps-01",
        "observer_region": UNKNOWN_OBSERVER_REGION,
        "is_final": True,
    }
    columns.update(overrides)
    return SeriesRow(**columns)


@pytest.fixture
def clobbered_sink() -> Iterator[RedisStreamSeriesSink]:
    """Build a REAL `RedisStreamSeriesSink` whose stream key is clobbered — every `accept` raises.

    Same technique `test_redis_stream_series_sink.py` uses for its own XADD-failure falsifier:
    `SET` the stream key to a plain string BEFORE anything publishes, so `XADD` against it comes
    back `WRONGTYPE` — a genuine `RedisCommandError`, from a real (loopback-only) server.
    """
    server = TcpFakeServer(("127.0.0.1", 0), server_type="redis")
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.socket.getsockname()
    try:
        setup = connect_resp2(open_tcp_socket(host, port))
        setup.command("SET", STREAM, "not-a-stream")
        yield RedisStreamSeriesSink(connect_resp2(open_tcp_socket(host, port)), STREAM)
    finally:
        server.shutdown()
        thread.join(timeout=2.0)


class _OneFrameThenIdleSource:
    """Yields exactly ONE raw `!forceOrder@arr` frame, then blocks until `close()` runs.

    Mirrors `collectors_cli_driver.py`'s `_BlockingForceOrderSource`: nothing beyond the one
    scripted frame should ever be read — the block only matters if a regression kept the read
    loop running past the publish failure this test forces.
    """

    def __init__(self, frames: list[str]) -> None:
        """Script the frames to replay; nothing has closed this source yet."""
        self._frames = list(frames)
        self._closed = threading.Event()

    def open(self) -> None:
        """No transport to open — this fake has none."""

    def close(self) -> None:
        """Signal the (never-reached, in the happy path of this test) blocked reader to give up."""
        self._closed.set()

    def messages(self) -> Iterator[str]:
        """Yield the scripted frames, then block until `close()` runs."""
        yield from self._frames
        while not self._closed.wait(0.05):
            pass
        raise StopIteration


class _OneShotPremiumIndexFetcher:
    """Returns one scripted, valid batch — enough to reach `WRITTEN` and call the sink."""

    def __init__(self, body: bytes) -> None:
        """Bind the single response body this fetcher will hand back."""
        self._body = body

    def fetch(self) -> RawPremiumIndexFetch:
        """Return `status=200` with the scripted body."""
        return RawPremiumIndexFetch(status=200, body=self._body, headers={})


def test_force_order_collector_rejects_the_session_on_a_real_xadd_failure(
    clobbered_sink: RedisStreamSeriesSink,
) -> None:
    """A real `WRONGTYPE` `XADD` closes the SESSION `REJECTED`, `exit_code[0] = 1`, signals peers.

    Falsifier this test makes executable: mutating `verdict = "REJECTED"` -> `"ACCEPTED"`, or
    dropping `exit_code[0] = 1`, inside `_run_force_order_collector`'s
    `except _PUBLISH_FAILURE_EXCEPTIONS` branch must fail this test — the exact QA gate mutation.
    """
    stop_event = threading.Event()
    failure_event = threading.Event()
    exit_code: list[int] = [0]
    recorded: list[IngestRun] = []
    source_holder: list[MessageSource | None] = [None]

    def _to_rows(
        _received_at: int, _observation: ForceOrderKeyObservation
    ) -> Iterable[SeriesRow]:
        return (_row(),)

    collectors_cli._run_force_order_collector(
        stop_event=stop_event,
        failure_event=failure_event,
        exit_code=exit_code,
        open_source=lambda: _OneFrameThenIdleSource([FRAME_A]),
        sink=clobbered_sink,
        to_rows=_to_rows,
        record_run=recorded.append,
        source_holder=source_holder,
    )

    assert exit_code == [1], "a real XADD failure must set exit_code[0] = 1"
    assert failure_event.is_set(), "a real XADD failure must signal the OTHER thread to stop too"
    assert len(recorded) == 1, f"expected exactly one IngestRun recorded, got {len(recorded)}"
    assert recorded[0].verdict == "REJECTED", "XADD failure must record verdict=REJECTED"
    assert recorded[0].endpoint == collectors_cli.FORCE_ORDER_ENDPOINT


def test_premium_index_collector_rejects_the_cycle_on_a_real_xadd_failure(
    clobbered_sink: RedisStreamSeriesSink,
) -> None:
    """Same falsifier, the OTHER thread: a real `WRONGTYPE` closes the CYCLE `REJECTED` too.

    Before this test, only the `WRITTEN`/`ACCEPTED_WITH_WARNING` path of this thread had
    coverage (QA gate action 2) — the `except _PUBLISH_FAILURE_EXCEPTIONS` branch that closes
    the OTHER half of the process, and propagates the failure via `failure_event`, never ran.
    """
    stop_event = threading.Event()
    failure_event = threading.Event()
    exit_code: list[int] = [0]
    recorded: list[IngestRun] = []

    def _to_rows(_received_at: int, _reading: PremiumIndexReading) -> Iterable[SeriesRow]:
        return (_row(),)

    collectors_cli._run_premium_index_collector(
        stop_event=stop_event,
        failure_event=failure_event,
        exit_code=exit_code,
        fetcher=_OneShotPremiumIndexFetcher(_VALID_PREMIUM_INDEX_BODY),
        sink=clobbered_sink,
        to_rows=_to_rows,
        record_run=recorded.append,
        interval_s=999_999.0,
    )

    assert exit_code == [1], "a real XADD failure must set exit_code[0] = 1"
    assert failure_event.is_set(), "a real XADD failure must signal the OTHER thread to stop too"
    assert len(recorded) == 1, f"expected exactly one IngestRun recorded, got {len(recorded)}"
    assert recorded[0].verdict == "REJECTED", "XADD failure must record verdict=REJECTED"
    assert recorded[0].endpoint == PREMIUM_INDEX_ENDPOINT
