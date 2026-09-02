"""Redis Streams + consumer group — the ONLY transport a stateful consumer may use here.

`ADR-009/D2`, `CA-F3-8`, `D7.10`: Redis Pub/Sub is at-most-once per subscriber — Redis's own
documentation says the published message "is forever lost" when no subscriber is connected at
publish time. A consumer that holds accumulated state (the running CVD total this DoD names) does
not recover from that: a lost message is a permanent, growing error in the accumulator, never
self-correcting. Streams do not have this failure mode because the server retains every entry
until a consumer group `XACK`s it, independent of who is connected when `XADD` runs.

This module names the WHOLE contract, not a memo about it: `RedisStreamPublisher.publish` is the
only way to `XADD`, and `RedisStreamConsumerGroup` is the only way to read a stream that carries
state, so a future consumer reaching for Pub/Sub would have to route around this module entirely
rather than merely choose a different function inside it.

Both classes take an already-`connect_resp2`'d `RespConnection` — this module never opens a
socket itself, matching `infra/https_quota_probe.py`'s connection-factory-is-injected shape.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Final

from src.modules.sentimento.infra.redis_resp_client import RedisCommandError, RespConnection

# `>` and `0` are RESP2 protocol literals (RESP `XREADGROUP` id argument), not this repository's
# own naming — see the Redis Streams command reference for `XREADGROUP`.
_NEW_ENTRIES: Final[str] = ">"
_PENDING_FROM_START: Final[str] = "0"
_BUSYGROUP_MARKER: Final[str] = "BUSYGROUP"


class UnexpectedStreamReplyError(Exception):
    """`XREADGROUP`/`XADD` answered with a shape this client's contract does not model."""


@dataclass(frozen=True)
class StreamMessage:
    """One delivered Streams entry: its id and the field/value pairs `XADD` stored with it."""

    entry_id: bytes
    fields: dict[bytes, bytes]


class RedisStreamPublisher:
    """`XADD` only — publishing a Stream entry never needs a consumer group."""

    def __init__(self, connection: RespConnection, stream: str) -> None:
        """Bind to one already-open `connection` and the one `stream` this publisher writes."""
        self._connection = connection
        self._stream = stream

    def publish(self, fields: Mapping[str, str]) -> bytes:
        """Append one entry with a server-minted id (`*`) and return that id.

        `fields` becomes the flat `field value field value ...` tail `XADD` expects; order is
        preserved from the mapping's own iteration order, which for a `dict` literal is
        insertion order — so a caller that cares about field order controls it the same way.
        """
        args: list[str] = ["XADD", self._stream, "*"]
        for key, value in fields.items():
            args.extend((key, value))
        entry_id = self._connection.command(*args)
        if not isinstance(entry_id, bytes):
            raise UnexpectedStreamReplyError(
                f"XADD {self._stream!r} answered {entry_id!r}, not the bulk-string id "
                f"the RESP2 reply contract for XADD guarantees"
            )
        return entry_id


class RedisStreamConsumerGroup:
    """One consumer identity inside one group.

    Recreating this object IS the "restart" `D7.10` exercises: Redis keys the Pending Entries
    List (PEL) by group + consumer NAME, not by process or connection, so a new instance
    constructed with the same `stream`/`group`/`consumer` after a crash sees exactly the PEL the
    crashed instance left behind. Nothing in this class holds process-local state that a restart
    would need to reconstruct.
    """

    def __init__(self, connection: RespConnection, stream: str, group: str, consumer: str) -> None:
        """Bind to one already-open `connection` and this consumer's `(stream, group, consumer)`."""
        self._connection = connection
        self._stream = stream
        self._group = group
        self._consumer = consumer

    def ensure_group(self) -> None:
        """Create the consumer group if absent; a pre-existing group (`BUSYGROUP`) is not an error.

        `MKSTREAM` creates the stream itself if it does not exist yet, so a fresh deployment does
        not need a separate "create the stream" step before its first consumer group can exist.
        """
        try:
            self._connection.command("XGROUP", "CREATE", self._stream, self._group, "$", "MKSTREAM")
        except RedisCommandError as error:
            if _BUSYGROUP_MARKER not in str(error):
                raise

    def read_pending(self, count: int) -> tuple[StreamMessage, ...]:
        """Re-deliver entries THIS consumer already claimed but never `ack`ed.

        This is the read that makes `D7.10` true. After a crash between "processed" and
        "`ack`ed", the entries in between are still in this consumer's PEL; `XREADGROUP ...
        STREAMS key 0` hands them back here, while `read_new` (which asks for `>`) would never
        see them again — they were already delivered once, so `>` treats them as history. A
        recovering consumer that skips this call and calls only `read_new` loses exactly the
        entries between its last `ack` and its crash — the failure mode `D7.10` forbids, and
        `tests/sentimento/test_redis_stream_bus.py` reproduces it on purpose to prove the point.
        """
        return self._read(_PENDING_FROM_START, count)

    def read_new(self, count: int) -> tuple[StreamMessage, ...]:
        """Read entries this consumer has never been handed before."""
        return self._read(_NEW_ENTRIES, count)

    def ack(self, entry_id: bytes) -> None:
        """Remove `entry_id` from this consumer's PEL — call only once its effect is durable."""
        self._connection.command("XACK", self._stream, self._group, entry_id)

    def _read(self, start: str, count: int) -> tuple[StreamMessage, ...]:
        reply = self._connection.command(
            "XREADGROUP",
            "GROUP",
            self._group,
            self._consumer,
            "COUNT",
            count,
            "STREAMS",
            self._stream,
            start,
        )
        if reply is None:
            return ()
        if not isinstance(reply, list) or len(reply) != 1:
            raise UnexpectedStreamReplyError(
                f"XREADGROUP for stream {self._stream!r} answered {reply!r}, not the "
                f"single-stream array this client always requests"
            )
        [stream_reply] = reply
        _stream_name, entries = stream_reply
        if not isinstance(entries, list):
            raise UnexpectedStreamReplyError(
                f"XREADGROUP for stream {self._stream!r} answered an entries list of "
                f"unexpected shape: {entries!r}"
            )
        return tuple(_to_message(entry) for entry in entries)


def _to_message(entry: Sequence[object]) -> StreamMessage:
    """Convert one raw `[id, [field, value, ...]]` RESP2 entry into a `StreamMessage`."""
    entry_id, flat_fields = entry
    if not isinstance(entry_id, bytes) or not isinstance(flat_fields, list):
        raise UnexpectedStreamReplyError(f"malformed stream entry: {entry!r}")
    fields = dict(zip(flat_fields[0::2], flat_fields[1::2], strict=True))
    return StreamMessage(entry_id=entry_id, fields=fields)
