"""`D7.10`/`CA-F3-8`: a stateful consumer restarting mid-sequence loses NOTHING, via Streams.

The central falsifier lives in `test_restart_recovers_every_pending_message_exactly_once`: it
publishes 10 entries, lets a consumer crash after PROCESSING 4 of them but ACKing only 2, then
proves a brand-new consumer instance (same group, same consumer name — the shape a real process
restart takes) recovers the other 2 via `read_pending` before it ever asks for new entries, and
that the resulting total matches an independently-computed ground truth exactly.

`test_skipping_read_pending_loses_the_unacked_messages_forever` is the MUTATION: the same crash,
but the recovering consumer skips `read_pending` and reads only `>` (new) — reproducing, on
purpose, the exact permanent loss `D7.10` forbids. A green first test proves nothing on its own;
this one is the case the fix is required to reject.

Transport: `fakeredis.TcpFakeServer` — a REAL loopback TCP listener speaking the real Streams +
consumer group protocol (`ADR-009/D2`'s reasoning is about Redis's own documented Pub/Sub
semantics, not something this fake reimplements), started on port `0` so parallel test runs never
collide over a fixed port. `backend/src/modules/sentimento/infra/redis_resp_client.py` is the
production RESP2 client under test; nothing here talks to Redis through a third-party client
library.
"""

from __future__ import annotations

import threading
from collections.abc import Iterator
from decimal import Decimal

import pytest
from fakeredis import TcpFakeServer

from src.modules.sentimento.infra.redis_resp_client import connect_resp2, open_tcp_socket
from src.modules.sentimento.infra.redis_stream_bus import (
    RedisStreamConsumerGroup,
    RedisStreamPublisher,
    StreamMessage,
)

STREAM = "cvd-deltas"
GROUP = "cvd-writers"
CONSUMER = "writer-1"
ENTRY_COUNT = 10


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


def _publisher(address: tuple[str, int]) -> RedisStreamPublisher:
    host, port = address
    return RedisStreamPublisher(connect_resp2(open_tcp_socket(host, port)), STREAM)


def _consumer_group(address: tuple[str, int]) -> RedisStreamConsumerGroup:
    """Build a FRESH connection bound to the same `(stream, group, consumer)` identity.

    A fresh connection with the SAME group/consumer name is what a process restart looks like
    from Redis's side: the Pending Entries List this function's caller inherits belongs to the
    NAME, not to the connection or process that read it.
    """
    host, port = address
    connection = connect_resp2(open_tcp_socket(host, port))
    return RedisStreamConsumerGroup(connection, STREAM, GROUP, CONSUMER)


def _publish_ten_deltas(address: tuple[str, int]) -> tuple[bytes, ...]:
    """Publish 10 CVD-delta entries (`value` 1..10) and return their ids in publish order."""
    publisher = _publisher(address)
    return tuple(publisher.publish({"value": str(value)}) for value in range(1, ENTRY_COUNT + 1))


def _sum_values(messages: tuple[StreamMessage, ...]) -> Decimal:
    values = (Decimal(message.fields[b"value"].decode("ascii")) for message in messages)
    return sum(values, Decimal(0))


def test_restart_recovers_every_pending_message_exactly_once(
    redis_address: tuple[str, int],
) -> None:
    """The positive case: `read_pending` after a restart delivers exactly the unacked tail.

    `crashed` reads all 4 of the first batch (simulating that it computed a partial accumulator
    over all 4) but only `ack`s the first 2 before "crashing" — everything it held in memory,
    including the running total over entries 3-4, is discarded along with the object itself,
    exactly as a process crash discards RAM. `durable_total` stands in for the only thing that
    survives a real crash: whatever was durably committed at the moment of the last `ack`.
    """
    crashed = _consumer_group(redis_address)
    crashed.ensure_group()  # the group is provisioned before anyone publishes, as in a real deploy
    published_ids = _publish_ten_deltas(redis_address)

    first_batch = crashed.read_new(4)
    assert [message.entry_id for message in first_batch] == list(published_ids[:4])
    crashed.ack(first_batch[0].entry_id)
    crashed.ack(first_batch[1].entry_id)
    durable_total = _sum_values(first_batch[:2])  # only what was committed before the crash

    # `crashed` and its in-memory total over entries 3-4 are gone — nothing here reuses them.
    restarted = _consumer_group(redis_address)

    recovered = restarted.read_pending(count=10)
    assert [message.entry_id for message in recovered] == [
        first_batch[2].entry_id,
        first_batch[3].entry_id,
    ]
    for message in recovered:
        restarted.ack(message.entry_id)
    running_total = durable_total + _sum_values(recovered)

    remaining = restarted.read_new(count=10)
    assert [message.entry_id for message in remaining] == list(published_ids[4:])
    for message in remaining:
        restarted.ack(message.entry_id)
    running_total += _sum_values(remaining)

    ground_truth = Decimal(sum(range(1, ENTRY_COUNT + 1)))  # 1+2+...+10, computed independently
    assert running_total == ground_truth
    assert restarted.read_new(count=10) == ()  # the stream is fully drained, nothing left behind


def test_skipping_read_pending_loses_the_unacked_messages_forever(
    redis_address: tuple[str, int],
) -> None:
    """The falsifier: a recovering consumer that reads ONLY `>` never sees entries 3-4 again.

    Same crash as the positive test — entries 3 and 4 were delivered once and never `ack`ed —
    but this consumer "forgets" to call `read_pending` on restart, which is exactly the bug
    `D7.10` exists to forbid. Redis Streams do not resurface an unacked entry through `>`, since
    `>` means "never handed to this consumer before" and these two already were: they stay
    invisible to `read_new` forever, and the total comes up short by their combined value. This
    is the case the fix in `test_restart_recovers_every_pending_message_exactly_once` is required
    to reject — a green run of that test alone would not prove `read_pending` was necessary.
    """
    crashed = _consumer_group(redis_address)
    crashed.ensure_group()
    published_ids = _publish_ten_deltas(redis_address)

    first_batch = crashed.read_new(4)
    crashed.ack(first_batch[0].entry_id)
    crashed.ack(first_batch[1].entry_id)
    durable_total = _sum_values(first_batch[:2])
    lost_ids = {first_batch[2].entry_id, first_batch[3].entry_id}

    restarted = _consumer_group(redis_address)
    # Deliberately buggy: no `restarted.read_pending(...)` call before reading new entries.
    remaining = restarted.read_new(count=10)
    for message in remaining:
        restarted.ack(message.entry_id)

    delivered_ids = {message.entry_id for message in remaining}
    assert lost_ids.isdisjoint(delivered_ids)  # entries 3-4 never come back through `>`
    assert delivered_ids == set(published_ids[4:])  # only 5..10 were ever seen again

    broken_total = durable_total + _sum_values(remaining)
    ground_truth = Decimal(sum(range(1, ENTRY_COUNT + 1)))
    assert broken_total != ground_truth
    assert ground_truth - broken_total == _sum_values(first_batch[2:4])  # short by exactly 3+4

    # The lost entries are not gone from Redis's bookkeeping — `XPENDING` still lists them under
    # this consumer, proving the loss is an APPLICATION bug (never `ack`ed, never re-read), not a
    # transport one. A future writer could still `XCLAIM` them; this consumer, as written, never
    # will, which is the whole point of the falsifier. A separate raw connection reads `XPENDING`
    # directly instead of reaching into `restarted`'s internals for a command this contract's
    # public surface has no reason to expose.
    host, port = redis_address
    inspection = connect_resp2(open_tcp_socket(host, port))
    pending_summary = inspection.command("XPENDING", STREAM, GROUP)
    assert pending_summary[0] == len(lost_ids)


def test_ensure_group_is_idempotent_across_restarts(redis_address: tuple[str, int]) -> None:
    """A restart calling `ensure_group` again must not raise on the pre-existing group.

    `RedisStreamConsumerGroup.ensure_group` swallows exactly `BUSYGROUP` and nothing else — this
    is the falsifier for that narrow catch: it proves a second `ensure_group` call (the shape
    every restart takes) succeeds instead of propagating the server's `-BUSYGROUP` error.
    """
    first = _consumer_group(redis_address)
    first.ensure_group()

    second = _consumer_group(redis_address)
    second.ensure_group()  # must not raise


def test_publish_returns_a_distinct_id_per_call(redis_address: tuple[str, int]) -> None:
    """`XADD`'s server-minted ids are strictly increasing — the ordering `read_new` depends on."""
    publisher = _publisher(redis_address)
    first_id = publisher.publish({"value": "1"})
    second_id = publisher.publish({"value": "2"})
    assert first_id != second_id
    assert first_id < second_id
