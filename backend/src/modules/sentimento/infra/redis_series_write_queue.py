"""Adapt `RedisStreamConsumerGroup` (`T-07.4`) to the `SeriesWriteQueue` port.

`decode` is injected rather than hard-coded to any one wire schema — this module never imports
`series_row_wire` itself, only the exception FAMILY (`SeriesRowWireError`) every wire decoder is
expected to raise on a poison message. `T-02.5` is the task that wires the first real `Decoder`
(`single_writer_cli._decode_wire_fields`, over `series_row_wire.decode`), and `SPEC-004` §5's
`B7` is what the paragraph below implements: a message that will never decode must not crash the
writer, must stay unacked in the Pending Entries List (`ADR-002/D5`'s single writer keeps
running), and the caller decides how to REPORT that (`on_rejected`) — this adapter only decides
that it must not propagate and stop the batch.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping

from src.modules.sentimento.domain.provenance import SeriesRow
from src.modules.sentimento.infra.redis_stream_bus import RedisStreamConsumerGroup, StreamMessage
from src.modules.sentimento.infra.series_row_wire import SeriesRowWireError
from src.modules.sentimento.use_cases.run_single_writer import QueuedSeriesRow

Decoder = Callable[[Mapping[bytes, bytes]], SeriesRow]
RejectedMessageHandler = Callable[[bytes, SeriesRowWireError], None]


def _ignore_rejected_message(_entry_id: bytes, _error: SeriesRowWireError) -> None:
    """Default `on_rejected`: a caller that cares about poison messages injects its own."""


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

    A `SeriesRowWireError` from `decode` is `B7`'s poison message: caught HERE, per entry, so
    ONE bad message never drops the good ones decoded before it out of the same batch and never
    stops `read_pending`/`read_new` from returning at all. The poisoned entry is simply absent
    from the returned tuple — `run_single_writer` never sees it, never calls `ack` for it, so it
    stays exactly where `B7` puts it: pending, in Redis, until `XCLAIM`/`XACK` (manual) or
    `REDIS_STREAM_MAXLEN` (automatic recycling) resolves it (`gates/F2-series-ddl.md` §7.2).
    """

    def __init__(
        self,
        group: RedisStreamConsumerGroup,
        decode: Decoder,
        *,
        on_rejected: RejectedMessageHandler = _ignore_rejected_message,
    ) -> None:
        """Bind to an already-constructed consumer group, the row decoder, and a rejection sink.

        `on_rejected` is how a caller learns of a poison message — the composition root's job,
        never this adapter's, e.g. `single_writer_cli` logs `writer_message_rejected{entry_id,
        reason}` (`SPEC-004` §3.7) with ITS OWN logger, so the event lands on the same stream
        (`stdout`) every other writer event does.
        """
        self._group = group
        self._decode = decode
        self._on_rejected = on_rejected

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
        decoded: list[QueuedSeriesRow] = []
        for message in messages:
            try:
                row = self._decode(message.fields)
            except SeriesRowWireError as error:
                self._on_rejected(message.entry_id, error)
                continue
            decoded.append(QueuedSeriesRow(entry_id=message.entry_id, row=row))
        return tuple(decoded)
