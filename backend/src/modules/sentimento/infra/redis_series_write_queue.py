"""Adapt `RedisStreamConsumerGroup` (`T-07.4`) to the `SeriesWriteQueue` port.

`decode` is injected rather than hard-coded to any one wire schema: no producer publishes onto
this stream yet (`RedisStreamPublisher` has zero production callers as of this task — the same
grep `test_redis_series_write_queue.py` runs), so fixing a field layout here would be a decision
from premise, the exact mistake `ingest_verified_payload.py:32` names and refuses for a different
port. The owner of the wire schema is whichever task wires the first producer onto this stream.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping

from src.modules.sentimento.domain.provenance import SeriesRow
from src.modules.sentimento.infra.redis_stream_bus import RedisStreamConsumerGroup, StreamMessage
from src.modules.sentimento.use_cases.run_single_writer import QueuedSeriesRow

Decoder = Callable[[Mapping[bytes, bytes]], SeriesRow]


class UnexpectedEntryIdTypeError(TypeError):
    """`ack` received something other than the `bytes` id `RedisStreamConsumerGroup` mints.

    The `SeriesWriteQueue` port types `entry_id` as `object` on purpose — it is opaque to
    `run_single_writer`, which only ever hands back what a `read_*` call gave it. This adapter
    is the one place that narrows it back to the concrete `bytes` `RedisStreamConsumerGroup.ack`
    requires, and a value that fails the narrowing means a caller reached `ack` with an id this
    adapter never produced.
    """


class RedisSeriesWriteQueue:
    """`SeriesWriteQueue` backed by one `RedisStreamConsumerGroup` plus an injected `Decoder`.

    Structural, not incidental: this class's three methods are a direct pass-through to the
    consumer group's `read_pending`/`read_new`/`ack`, decoding each `StreamMessage` on the way
    out and never on the way back in — `ack` forwards `entry_id` unchanged, exactly the value
    `RedisStreamConsumerGroup.ack` already expects.
    """

    def __init__(self, group: RedisStreamConsumerGroup, decode: Decoder) -> None:
        """Bind to an already-constructed consumer group and the row decoder it should apply."""
        self._group = group
        self._decode = decode

    def read_pending(self, count: int) -> tuple[QueuedSeriesRow, ...]:
        """Re-deliver entries this consumer claimed but never acked, decoded into candidates."""
        return self._decode_all(self._group.read_pending(count))

    def read_new(self, count: int) -> tuple[QueuedSeriesRow, ...]:
        """Deliver entries this consumer has never seen before, decoded into candidates."""
        return self._decode_all(self._group.read_new(count))

    def ack(self, entry_id: object) -> None:
        """Retire `entry_id` from this consumer's Pending Entries List."""
        if not isinstance(entry_id, bytes):
            raise UnexpectedEntryIdTypeError(
                f"ack received {entry_id!r} of type {type(entry_id).__name__}, not the bytes "
                f"id this adapter's own read_pending/read_new ever hand out"
            )
        self._group.ack(entry_id)

    def _decode_all(self, messages: tuple[StreamMessage, ...]) -> tuple[QueuedSeriesRow, ...]:
        return tuple(
            QueuedSeriesRow(entry_id=message.entry_id, row=self._decode(message.fields))
            for message in messages
        )
