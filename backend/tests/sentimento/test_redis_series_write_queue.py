"""`RedisSeriesWriteQueue` over a REAL (fake) Redis Streams server: decode, then pass through.

Reuses `test_redis_stream_bus.py`'s transport (`fakeredis.TcpFakeServer`, loopback TCP, real
RESP2 protocol) so this test proves the adapter against the same server the transport itself is
proven against, rather than a second, hand-rolled double of Redis.
"""

from __future__ import annotations

import threading
from collections.abc import Iterator, Mapping

import pytest
from fakeredis import TcpFakeServer

from src.modules.sentimento.domain.provenance import (
    UNKNOWN_OBSERVER_REGION,
    AvailabilitySource,
    Provenance,
    SeriesRow,
)
from src.modules.sentimento.infra.redis_resp_client import connect_resp2, open_tcp_socket
from src.modules.sentimento.infra.redis_series_write_queue import (
    RedisSeriesWriteQueue,
    UnexpectedEntryIdTypeError,
)
from src.modules.sentimento.infra.redis_stream_bus import (
    RedisStreamConsumerGroup,
    RedisStreamPublisher,
)

STREAM = "series-candidates"
GROUP = "single-writer"
CONSUMER = "writer-1"
BUCKET_END_MS = 1_787_443_499_999
EVENT_TIME_MS = 1_787_443_500_000


@pytest.fixture
def redis_address() -> Iterator[tuple[str, int]]:
    """Start a real, loopback-only `fakeredis` Streams server and stop it after the test."""
    server = TcpFakeServer(("127.0.0.1", 0), server_type="redis")
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server.socket.getsockname()
    finally:
        server.shutdown()
        thread.join(timeout=2.0)


def _decode(fields: Mapping[bytes, bytes]) -> SeriesRow:
    """Decode a minimal test field mapping into a `SeriesRow`.

    A stand-in for the real decoder: this task injects `decode` rather than owning a wire
    schema, so this function only needs to be good enough to prove the adapter's pass-through.
    """
    return SeriesRow(
        series_key_id="a" * 64,
        symbol=fields[b"symbol"].decode("ascii"),
        source="binance_daily_metrics",
        bucket_end=BUCKET_END_MS,
        event_time=EVENT_TIME_MS,
        available_at=EVENT_TIME_MS + 30_000,
        availability_source=AvailabilitySource.OBSERVED,
        ingested_at=EVENT_TIME_MS + 45_000,
        observed_at=EVENT_TIME_MS + 46_000,
        provenance=Provenance.OBSERVED,
        src_label_raw="2026-08-23 00:00:00",
        observer_id="vps-01",
        observer_region=UNKNOWN_OBSERVER_REGION,
        is_final=True,
    )


def _queue(address: tuple[str, int], *, ensure_group: bool = True) -> RedisSeriesWriteQueue:
    """Build a `RedisSeriesWriteQueue` bound to a fresh connection.

    `ensure_group=False` is for a "restart" against a group a PRIOR `_queue(...)` call already
    provisioned: calling `ensure_group()` again right before `read_pending` on a NON-empty PEL
    corrupts this `fakeredis` double's reply stream `[MEASURED 2026-09-02: isolated script,
    raw `RedisStreamConsumerGroup`, no adapter code — a second `ensure_group()` immediately
    before `read_pending` raises `RedisProtocolError("connection closed...")`; the SAME sequence
    without the second `ensure_group()` call succeeds]`. `RedisStreamConsumerGroup`'s own
    idempotency test (`test_ensure_group_is_idempotent_across_restarts`,
    `test_redis_stream_bus.py`) never combines the repeated call with a following `read_pending`,
    so it does not see this. Production code never calls `ensure_group` from this adapter at all
    — the caller passes in an already-provisioned `RedisStreamConsumerGroup` — so this is a test
    fixture concern only, not a property of `RedisSeriesWriteQueue` or of `T-07.4`'s transport.
    """
    host, port = address
    connection = connect_resp2(open_tcp_socket(host, port))
    group = RedisStreamConsumerGroup(connection, STREAM, GROUP, CONSUMER)
    if ensure_group:
        group.ensure_group()
    return RedisSeriesWriteQueue(group, _decode)


def test_read_new_decodes_every_field_mapping_into_a_series_row(
    redis_address: tuple[str, int],
) -> None:
    """The adapter's happy path: publish one entry, read it back already decoded."""
    # `ensure_group("$")` only sees entries published AFTER it runs (`redis_stream_bus.py`'s own
    # `ensure_group` docstring family), so the queue — and the group it provisions — has to exist
    # BEFORE anything is published, exactly like `test_redis_stream_bus.py`'s fixtures do.
    queue = _queue(redis_address)
    host, port = redis_address
    publisher = RedisStreamPublisher(connect_resp2(open_tcp_socket(host, port)), STREAM)
    published_id = publisher.publish({"symbol": "ETHUSDT"})

    delivered = queue.read_new(10)

    assert len(delivered) == 1
    assert delivered[0].entry_id == published_id
    assert delivered[0].row.symbol == "ETHUSDT"


def test_read_pending_decodes_the_unacked_tail_after_a_restart(
    redis_address: tuple[str, int],
) -> None:
    """The `D7.10` recovery path, through the adapter: a non-empty PEL, decoded on the way out.

    Deliberately NOT the empty-PEL shape the ack test below documents as hanging against this
    `fakeredis` double — this test gives `read_pending` something real to redeliver, the same
    way `test_redis_stream_bus.py`'s own `read_pending` calls always do.
    """
    crashed = _queue(redis_address)
    host, port = redis_address
    publisher = RedisStreamPublisher(connect_resp2(open_tcp_socket(host, port)), STREAM)
    published_id = publisher.publish({"symbol": "SOLUSDT"})

    delivered = crashed.read_new(10)  # claimed, never acked — "crashed" mid-processing
    assert [item.entry_id for item in delivered] == [published_id]

    # Fresh connection, SAME (stream, group, consumer) — `ensure_group=False`, see `_queue`'s
    # docstring for why a repeated `ensure_group()` here would corrupt this specific double.
    restarted = _queue(redis_address, ensure_group=False)
    recovered = restarted.read_pending(10)

    assert len(recovered) == 1
    assert recovered[0].entry_id == published_id
    assert recovered[0].row.symbol == "SOLUSDT"


def test_ack_forwards_the_entry_id_unchanged_to_the_consumer_group(
    redis_address: tuple[str, int],
) -> None:
    """Prove the ack reached Redis via `XPENDING`, not via `read_pending` on an empty PEL.

    `read_pending` on an ALREADY-EMPTY Pending Entries List hangs against this `fakeredis`
    double `[MEASURED 2026-09-02: isolated script, `XREADGROUP ... STREAMS key 0` with nothing
    ever pending, times out — reproduced with the raw `RedisStreamConsumerGroup` from `T-07.4`,
    with no adapter code involved, so it is a property of the double, not of this task's code].
    `test_redis_stream_bus.py` never exercises that shape either — its own `read_pending` calls
    always have a non-empty PEL. So this test asks Redis directly, the same way
    `test_skipping_read_pending_loses_the_unacked_messages_forever` already does for the mirror
    case (a NON-empty PEL it wants to confirm rather than assume).
    """
    queue = _queue(redis_address)
    host, port = redis_address
    publisher = RedisStreamPublisher(connect_resp2(open_tcp_socket(host, port)), STREAM)
    publisher.publish({"symbol": "BTCUSDT"})

    [delivered] = queue.read_new(10)
    queue.ack(delivered.entry_id)

    inspection = connect_resp2(open_tcp_socket(host, port))
    pending_summary = inspection.command("XPENDING", STREAM, GROUP)
    assert isinstance(pending_summary, list)
    assert pending_summary[0] == 0, pending_summary


def test_ack_refuses_an_entry_id_that_is_not_bytes(redis_address: tuple[str, int]) -> None:
    """The narrowing check: a non-`bytes` id never reaches `RedisStreamConsumerGroup.ack`."""
    queue = _queue(redis_address)
    with pytest.raises(UnexpectedEntryIdTypeError):
        queue.ack("not-bytes")
