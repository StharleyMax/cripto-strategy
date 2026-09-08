"""`T-05.3`: the two collector threads, wired to the REAL `SeriesKey` mapping, publish for real.

Every other test of `_run_premium_index_collector`/`_run_force_order_collector`
(`test_collectors_cli_publish_failure.py`, `collectors_cli_driver.py`) injects a fabricated
`to_rows` double. This file is the one place the REAL
`use_cases/collector_series_mapping.py` builders run end to end against a real (fake) Redis
Streams server: one poll/one liquidation for an in-universe symbol reaches `md.series.write` as
the expected rows, and one for a non-universe symbol reaches it as none — proving the crash the
composition root used to hit (`SeriesRowMappingNotDecidedError`, `[MEDIDO 2026-09-08]`: 55
restarts/10min, `docs/context/captura-em-producao/medicoes/CA-F3-8-pegada.md` §1.1) cannot happen
here, with the REAL mapping doing the deciding, not a stand-in.
"""

from __future__ import annotations

import threading
from collections.abc import Iterator

import pytest
from fakeredis import TcpFakeServer

from src.modules.sentimento.domain.ingest_record import IngestRun
from src.modules.sentimento.infra import collectors_cli
from src.modules.sentimento.infra.redis_resp_client import connect_resp2, open_tcp_socket
from src.modules.sentimento.infra.redis_stream_bus import RedisStreamConsumerGroup
from src.modules.sentimento.infra.redis_stream_series_sink import RedisStreamSeriesSink
from src.modules.sentimento.infra.series_row_wire import decode
from src.modules.sentimento.use_cases.collect_premium_index import RawPremiumIndexFetch
from src.modules.sentimento.use_cases.collector_series_mapping import (
    build_force_order_to_rows,
    build_premium_index_to_rows,
)
from src.modules.sentimento.use_cases.probe_stream_quantity_fields import MessageSource

STREAM = "md.series.write"
GROUP = "test-real-mapping"
CONSUMER = "reader-1"

# Real `!forceOrder@arr` frame, B2-keyable, `BTCUSDT` — one of `INITIAL_SYMBOLS`.
_BTCUSDT_FRAME = (
    '{"e":"forceOrder","E":0,"o":{"s":"BTCUSDT","S":"SELL","o":"LIMIT","f":"IOC","q":"0.010",'
    '"p":"78000.00","ap":"78006.30","X":"FILLED","l":"0.010","z":"0.010","T":1788869519500}}'
)
# Same shape, `DOGEUSDT` — deliberately NOT in `INITIAL_SYMBOLS`.
_DOGEUSDT_FRAME = (
    '{"e":"forceOrder","E":0,"o":{"s":"DOGEUSDT","S":"BUY","o":"LIMIT","f":"IOC","q":"1000",'
    '"p":"0.40","ap":"0.40","X":"FILLED","l":"1000","z":"1000","T":1788869519500}}'
)

# Same `BTCUSDT` liquidation as `_BTCUSDT_FRAME`, wrapped in the combined-stream envelope
# `/stream?streams=btcusdt@forceOrder/...` sends (`{"stream": ..., "data": {...}}`) — the shape
# `collectors_cli._default_force_order_source` now reads LIVE, per
# `docs/context/captura-em-producao/gates/forceorder-fix-quant-architect.md`. This is the
# regression that pins `extract_force_order_natural_key`'s envelope unwrap end to end, not just
# at the unit level.
_BTCUSDT_COMBINED_ENVELOPE_FRAME = (
    '{"stream":"btcusdt@forceOrder","data":{"e":"forceOrder","E":0,"o":{"s":"BTCUSDT",'
    '"S":"SELL","o":"LIMIT","f":"IOC","q":"0.010","p":"78000.00","ap":"78006.30","X":"FILLED",'
    '"l":"0.010","z":"0.010","T":1788869519500}}}'
)

# Real `premiumIndex` batch bodies (`[MEDIDO 2026-09-08]`, quoted in
# `test_collector_series_mapping.py`'s module docstring) — one in-universe symbol, one not.
_BTCUSDT_BATCH_BODY = (
    b'[{"symbol":"BTCUSDT","markPrice":"78249.60000000","indexPrice":"78274.40021739",'
    b'"estimatedSettlePrice":"78379.99641129","lastFundingRate":"0.00009992",'
    b'"interestRate":"0.00010000","nextFundingTime":1788883200000,"time":1788869519000}]'
)
_DOGEUSDT_BATCH_BODY = (
    b'[{"symbol":"DOGEUSDT","markPrice":"0.40000000","indexPrice":"0.40010000",'
    b'"estimatedSettlePrice":"0.40005000","lastFundingRate":"0.00010000",'
    b'"interestRate":"0.00010000","nextFundingTime":1788883200000,"time":1788869519000}]'
)


@pytest.fixture
def redis_address() -> Iterator[tuple[str, int]]:
    """Start a real, loopback-only `fakeredis` Streams server, group provisioned before any publish.

    `ensure_group()` uses `XGROUP CREATE ... $` — it only sees entries published AFTER it runs
    (`test_redis_stream_series_sink.py`'s own `_provision_group` docstring). Doing it here, before
    any test's collector thread ever calls `sink.accept`, is what makes `_read_published_symbols`
    (called only AFTER the collector thread has published) see those rows at all.
    """
    server = TcpFakeServer(("127.0.0.1", 0), server_type="redis")
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        address = server.socket.getsockname()
        host, port = address
        connection = connect_resp2(open_tcp_socket(host, port))
        RedisStreamConsumerGroup(connection, STREAM, GROUP, CONSUMER).ensure_group()
        yield address
    finally:
        server.shutdown()
        thread.join(timeout=2.0)


def _sink(address: tuple[str, int]) -> RedisStreamSeriesSink:
    host, port = address
    return RedisStreamSeriesSink(connect_resp2(open_tcp_socket(host, port)), STREAM)


def _read_published_symbols(address: tuple[str, int]) -> tuple[str, ...]:
    host, port = address
    connection = connect_resp2(open_tcp_socket(host, port))
    group = RedisStreamConsumerGroup(connection, STREAM, GROUP, CONSUMER)
    messages = group.read_new(10)
    rows = tuple(
        decode({name.decode("ascii"): value.decode("ascii") for name, value in m.fields.items()})
        for m in messages
    )
    return tuple(row.symbol for row in rows)


class _OneFrameThenIdleSource:
    """Yields exactly the scripted frames, then blocks until `close()` (mirrors the QA-fix test)."""

    def __init__(self, frames: list[str]) -> None:
        """Script the frames to replay; nothing has closed this source yet."""
        self._frames = list(frames)
        self._closed = threading.Event()

    def open(self) -> None:
        """No transport to open — this fake has none."""

    def close(self) -> None:
        """Signal the (never-reached in the happy path) blocked reader to give up."""
        self._closed.set()

    def messages(self) -> Iterator[str]:
        """Yield the scripted frames, then block until `close()` runs, then end normally.

        NEVER `raise StopIteration` explicitly here (PEP 479: an explicit raise inside a
        generator's frame is converted to `RuntimeError`, which `_run_force_order_collector`'s
        `except StopIteration:` would NOT catch) — falling off the end of the function after the
        wait is the safe way to end a generator, and the interpreter raises the catchable
        `StopIteration` itself.
        """
        yield from self._frames
        while not self._closed.wait(0.05):
            pass


class _OneShotPremiumIndexFetcher:
    """Returns one scripted, valid batch body — enough to reach `WRITTEN`."""

    def __init__(self, body: bytes) -> None:
        """Bind the single response body this fetcher will hand back."""
        self._body = body

    def fetch(self) -> RawPremiumIndexFetch:
        """Return `status=200` with the scripted body."""
        return RawPremiumIndexFetch(status=200, body=self._body, headers={})


def test_a_liquidation_for_an_in_universe_symbol_really_publishes_via_the_real_mapping(
    redis_address: tuple[str, int],
) -> None:
    """The real mapping, no fabricated double: ONE `liquidation` row for the ONE frame.

    `_run_force_order_collector` + `build_force_order_to_rows()`: the ONE `BTCUSDT` liquidation
    frame reaches `md.series.write` as ONE `liquidation` row.
    """
    exit_code, failure_event, recorded = _run_force_order_session_to_completion(
        redis_address, frame=_BTCUSDT_FRAME
    )

    assert exit_code == [0], "the real mapping must not raise for an in-universe symbol"
    assert not failure_event.is_set()
    assert recorded[0].verdict == "ACCEPTED"
    assert _read_published_symbols(redis_address) == ("BTCUSDT",)


def test_a_liquidation_in_the_combined_stream_envelope_shape_also_publishes(
    redis_address: tuple[str, int],
) -> None:
    """The SAME `BTCUSDT` liquidation, wrapped in `{"stream": ..., "data": {...}}`, still keys.

    Pins the fix: the LIVE collector reads a per-symbol combined stream now (never
    `!forceOrder@arr`, which delivered zero events in production — see the gate doc cited next
    to `_BTCUSDT_COMBINED_ENVELOPE_FRAME`), and that endpoint wraps every event in this envelope.
    """
    exit_code, failure_event, recorded = _run_force_order_session_to_completion(
        redis_address, frame=_BTCUSDT_COMBINED_ENVELOPE_FRAME
    )

    assert exit_code == [0], "the combined-stream envelope must not raise"
    assert not failure_event.is_set()
    assert recorded[0].verdict == "ACCEPTED"
    assert _read_published_symbols(redis_address) == ("BTCUSDT",)


def test_a_liquidation_for_a_non_universe_symbol_publishes_nothing_and_does_not_crash(
    redis_address: tuple[str, int],
) -> None:
    """The SAME thread, a `DOGEUSDT` frame: zero rows published, no crash.

    No `SeriesRowMappingNotDecidedError` — session still closes clean.
    """
    exit_code, failure_event, recorded = _run_force_order_session_to_completion(
        redis_address, frame=_DOGEUSDT_FRAME
    )

    assert exit_code == [0], "a non-universe symbol must be a silent no-op, never a crash"
    assert not failure_event.is_set()
    assert recorded[0].verdict == "ACCEPTED"
    assert _read_published_symbols(redis_address) == ()


def _run_force_order_session_to_completion(
    redis_address: tuple[str, int], *, frame: str
) -> tuple[list[int], threading.Event, list[IngestRun]]:
    """Run `_run_force_order_collector` against ONE scripted frame, in a background thread.

    `_OneFrameThenIdleSource` blocks after its one frame (mirrors a live, idle
    `!forceOrder@arr` connection) — exactly the shape `run()`'s own `SIGTERM` handler unblocks
    by calling `close()` on `source_holder[0]` (`collectors_cli.py`'s `_handle_sigterm`). This
    helper does the SAME thing from a test thread once the one frame has had time to publish,
    instead of leaving the collector thread blocked forever.
    """
    stop_event = threading.Event()
    failure_event = threading.Event()
    exit_code: list[int] = [0]
    recorded: list[IngestRun] = []
    source_holder: list[MessageSource | None] = [None]

    thread = threading.Thread(
        target=collectors_cli._run_force_order_collector,
        kwargs={
            "stop_event": stop_event,
            "failure_event": failure_event,
            "exit_code": exit_code,
            "open_source": lambda: _OneFrameThenIdleSource([frame]),
            "sink": _sink(redis_address),
            "to_rows": build_force_order_to_rows(),
            "record_run": recorded.append,
            "source_holder": source_holder,
        },
    )
    thread.start()
    deadline = threading.Event()
    deadline.wait(0.2)  # bounded: enough for one in-process frame to be read and published
    stop_event.set()
    current = source_holder[0]
    if current is not None:
        current.close()
    thread.join(timeout=5.0)
    assert not thread.is_alive(), "the collector thread must close the session and return"
    return exit_code, failure_event, recorded


def test_a_premium_index_poll_for_an_in_universe_symbol_really_publishes_two_rows(
    redis_address: tuple[str, int],
) -> None:
    """The real mapping, no fabricated double: TWO rows for the ONE batch.

    `_run_premium_index_collector` + `build_premium_index_to_rows()`: the ONE `BTCUSDT` batch
    reaches `md.series.write` as TWO rows (`mark_price` + `funding_estimado`).
    """
    exit_code, failure_event, recorded = _run_premium_index_cycle_to_completion(
        redis_address, body=_BTCUSDT_BATCH_BODY
    )

    assert exit_code == [0], "the real mapping must not raise for an in-universe symbol"
    assert not failure_event.is_set()
    assert recorded[0].verdict == "ACCEPTED"
    assert _read_published_symbols(redis_address) == ("BTCUSDT", "BTCUSDT")


def test_a_premium_index_poll_for_a_non_universe_symbol_publishes_nothing(
    redis_address: tuple[str, int],
) -> None:
    """The SAME thread, a `DOGEUSDT` batch: zero rows published, cycle still `ACCEPTED`."""
    exit_code, failure_event, recorded = _run_premium_index_cycle_to_completion(
        redis_address, body=_DOGEUSDT_BATCH_BODY
    )

    assert exit_code == [0]
    assert not failure_event.is_set()
    assert recorded[0].verdict == "ACCEPTED"
    assert _read_published_symbols(redis_address) == ()


def _run_premium_index_cycle_to_completion(
    redis_address: tuple[str, int], *, body: bytes
) -> tuple[list[int], threading.Event, list[IngestRun]]:
    """Run `_run_premium_index_collector` for exactly ONE cycle, in a background thread.

    `interval_s=999_999.0` (mirrors `collectors_cli_driver.py`'s own reasoning) keeps the thread
    from firing a second cycle before this helper stops it: after the one scripted cycle
    completes and calls `stop_event.wait(interval_s)`, setting `stop_event` from here wakes that
    wait immediately — no real 999999-second wait is ever incurred, since `Event.wait` returns
    the instant the event is set.
    """
    stop_event = threading.Event()
    failure_event = threading.Event()
    exit_code: list[int] = [0]
    recorded: list[IngestRun] = []

    thread = threading.Thread(
        target=collectors_cli._run_premium_index_collector,
        kwargs={
            "stop_event": stop_event,
            "failure_event": failure_event,
            "exit_code": exit_code,
            "fetcher": _OneShotPremiumIndexFetcher(body),
            "sink": _sink(redis_address),
            "to_rows": build_premium_index_to_rows(interval_s=60.0),
            "record_run": recorded.append,
            "interval_s": 999_999.0,
        },
    )
    thread.start()
    # Bounded wait for the ONE cycle (a local fetch + local XADD, no real network) to complete
    # and reach `stop_event.wait(interval_s)` before this helper wakes it — polled, not a fixed
    # sleep, so the common case is fast and the bound only matters if something is unusually slow.
    for _ in range(100):
        if recorded:
            break
        threading.Event().wait(0.02)
    stop_event.set()
    thread.join(timeout=5.0)
    assert not thread.is_alive(), "the collector thread must close the cycle and return"
    return exit_code, failure_event, recorded
