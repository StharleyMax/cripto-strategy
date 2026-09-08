"""`SPEC-004` §3.7: `collector_session_closed`/`collector_cycle_completed` carry a REAL `run_id`.

Before `T-01.6`, both completion events hardcoded `"run_id": None` in their `extra={}}` — the
event NAMED the field (`collector_session_closed{endpoint,n_published,verdict,run_id}`) but never
filled it with the `IngestRun.run_id` that `record_run` had just been given. These tests call the
two collector threads directly (same technique `test_collectors_cli_publish_failure.py` already
uses) and read the `LogRecord.run_id` attribute `caplog` exposes — the format string used at
runtime (`"%(message)s"`, `ingest_health_cli.build_stdout_handler`) never prints `extra={}` keys,
so only inspecting the record itself (not stdout text) can catch this regression.
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Iterable, Iterator

import pytest
from fakeredis import TcpFakeServer

from src.modules.sentimento.domain.force_order_collision_accounting import (
    ForceOrderKeyObservation,
)
from src.modules.sentimento.domain.ingest_record import IngestRun
from src.modules.sentimento.domain.premium_index_batch import PREMIUM_INDEX_ENDPOINT
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
from src.modules.sentimento.use_cases.collector_run_mapping import FORCE_ORDER_ENDPOINT
from src.modules.sentimento.use_cases.probe_stream_quantity_fields import MessageSource

STREAM = "md.series.write"
BUCKET_END_MS = 1_787_443_499_999
EVENT_TIME_MS = 1_787_443_500_000

FRAME_A = (
    '{"e":"forceOrder","E":0,"o":{"s":"BTCUSDT","S":"SELL","o":"LIMIT","f":"IOC","q":"0.010",'
    '"p":"78000.00","ap":"78006.30","X":"FILLED","l":"0.010","z":"0.010","T":0}}'
)
_VALID_PREMIUM_INDEX_BODY = (
    b'[{"symbol":"BTCUSDT","markPrice":"1","indexPrice":"1","estimatedSettlePrice":"1",'
    b'"lastFundingRate":"0.0001","interestRate":"0.0001","nextFundingTime":1,"time":1}]'
)


def _row() -> SeriesRow:
    return SeriesRow(
        series_key_id="a" * 64,
        symbol="BTCUSDT",
        source="binance_premium_index",
        bucket_end=BUCKET_END_MS,
        event_time=EVENT_TIME_MS,
        available_at=EVENT_TIME_MS + 30_000,
        availability_source=AvailabilitySource.OBSERVED,
        ingested_at=EVENT_TIME_MS + 45_000,
        observed_at=EVENT_TIME_MS + 46_000,
        provenance=Provenance.OBSERVED,
        src_label_raw="premiumIndex",
        observer_id="vps-01",
        observer_region=UNKNOWN_OBSERVER_REGION,
        is_final=True,
        value_raw="1.0",
    )


@pytest.fixture
def working_sink() -> Iterable[RedisStreamSeriesSink]:
    """Build a REAL, working `RedisStreamSeriesSink` over a loopback `fakeredis` server.

    Unlike `test_collectors_cli_publish_failure.py`'s `clobbered_sink`, this one's stream key is
    never `SET` to a non-stream value — every `XADD` here succeeds.
    """
    server = TcpFakeServer(("127.0.0.1", 0), server_type="redis")
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.socket.getsockname()
    try:
        yield RedisStreamSeriesSink(connect_resp2(open_tcp_socket(host, port)), STREAM)
    finally:
        server.shutdown()
        thread.join(timeout=2.0)


class _OneFrameThenClosedSource:
    """Yield exactly one raw frame, then set `stop_event` and end — a clean single-message session.

    Closed by ITSELF rather than by the caller pre-setting the flag: pre-setting it would make
    `_run_force_order_collector`'s `if stop_event.is_set(): break` discard the frame BEFORE
    publishing it, undercounting `n_published`.

    `path` declares this double models the RAW `!forceOrder@arr` shape (`FRAME_A` below is
    unenveloped) — never the combined per-symbol stream `_default_force_order_source` moved to
    (`docs/context/captura-em-producao/gates/forceorder-fix-qa.md`). `_run_force_order_collector`
    reads it (falling back to `FORCE_ORDER_ENDPOINT` for a double without one) to log/record the
    endpoint that was ACTUALLY connected, so this file's `endpoint` assertion below now exercises
    that mechanism instead of a hardcoded literal it never touched.
    """

    def __init__(self, frames: list[str], stop_event: threading.Event) -> None:
        """Script the frames to replay; hold the SAME `stop_event` the collector loop reads."""
        self._frames = list(frames)
        self._stop_event = stop_event
        self.path = FORCE_ORDER_ENDPOINT

    def open(self) -> None:
        """No transport to open."""

    def close(self) -> None:
        """Nothing to release."""

    def messages(self) -> Iterator[str]:
        """Yield the scripted frames, then set `stop_event` before ending the iteration."""
        yield from self._frames
        self._stop_event.set()


def _extra(record: logging.LogRecord, key: str) -> object:
    """Read one `extra={}` key off a captured `LogRecord`.

    `LogRecord` is not typed with these application-specific attributes (they arrive only via
    `extra={}` at the call site), so `getattr` is the honest way to reach them under
    `mypy --strict` — a bare `record.run_id` would need a stub this repository does not own.
    """
    return getattr(record, key)


class _OneShotPremiumIndexFetcher:
    """Returns one scripted, valid batch."""

    def __init__(self, body: bytes) -> None:
        """Bind the single response body this fetcher will hand back."""
        self._body = body

    def fetch(self) -> RawPremiumIndexFetch:
        """Return `status=200` with the scripted body."""
        return RawPremiumIndexFetch(status=200, body=self._body, headers={})


def test_collector_session_closed_event_carries_the_recorded_runs_run_id(
    working_sink: RedisStreamSeriesSink, caplog: pytest.LogCaptureFixture
) -> None:
    """The `collector_session_closed` INFO event's `run_id` extra equals the persisted run's.

    Morde: reverting to the pre-`T-01.6` `"run_id": None` literal makes this fail — `record.run_id`
    would be `None` while `recorded[0].run_id` is a real `uuid4()` string.
    """
    stop_event = threading.Event()
    failure_event = threading.Event()
    exit_code: list[int] = [0]
    recorded: list[IngestRun] = []
    source_holder: list[MessageSource | None] = [None]

    def _to_rows(_received_at: int, _observation: ForceOrderKeyObservation) -> Iterable[SeriesRow]:
        return (_row(),)

    with caplog.at_level(logging.INFO, logger=collectors_cli.__name__):
        collectors_cli._run_force_order_collector(
            stop_event=stop_event,
            failure_event=failure_event,
            exit_code=exit_code,
            open_source=lambda: _OneFrameThenClosedSource([FRAME_A], stop_event),
            sink=working_sink,
            to_rows=_to_rows,
            record_run=recorded.append,
            source_holder=source_holder,
        )

    assert exit_code == [0]
    assert len(recorded) == 1
    closed_events = [r for r in caplog.records if r.message == "collector_session_closed"]
    assert len(closed_events) == 1, f"expected exactly one event, got {len(closed_events)}"
    event = closed_events[0]
    assert _extra(event, "run_id") == recorded[0].run_id
    assert _extra(event, "run_id") is not None
    assert _extra(event, "endpoint") == FORCE_ORDER_ENDPOINT
    assert _extra(event, "n_published") == 1


def test_collector_cycle_completed_event_carries_the_recorded_runs_run_id(
    working_sink: RedisStreamSeriesSink, caplog: pytest.LogCaptureFixture
) -> None:
    """Same property, the OTHER producer: `collector_cycle_completed`'s `run_id` is the real one."""
    stop_event = threading.Event()
    failure_event = threading.Event()
    exit_code: list[int] = [0]
    recorded: list[IngestRun] = []

    def _to_rows(_received_at: int, _reading: object) -> Iterable[SeriesRow]:
        # Setting `stop_event` HERE (mid-cycle, before `record_run`/the log line run) means the
        # loop's `stop_event.wait(interval_s)` at the bottom returns immediately (an already-set
        # `Event` never blocks its `wait`), so exactly one cycle completes and is recorded/logged
        # before `while not stop_event.is_set()` ends the loop — no `Event.wait` monkeypatch
        # needed, which `mypy --strict` would reject as an incompatible reassignment anyway.
        stop_event.set()
        return (_row(),)

    with caplog.at_level(logging.INFO, logger=collectors_cli.__name__):
        collectors_cli._run_premium_index_collector(
            stop_event=stop_event,
            failure_event=failure_event,
            exit_code=exit_code,
            fetcher=_OneShotPremiumIndexFetcher(_VALID_PREMIUM_INDEX_BODY),
            sink=working_sink,
            to_rows=_to_rows,
            record_run=recorded.append,
            interval_s=0.0,
        )

    assert len(recorded) == 1
    completed_events = [r for r in caplog.records if r.message == "collector_cycle_completed"]
    assert len(completed_events) == 1, f"expected exactly one event, got {len(completed_events)}"
    event = completed_events[0]
    assert _extra(event, "run_id") == recorded[0].run_id
    assert _extra(event, "run_id") is not None
    assert _extra(event, "endpoint") == PREMIUM_INDEX_ENDPOINT
    assert _extra(event, "n_published") == 1
