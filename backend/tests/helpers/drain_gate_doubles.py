"""Doubles for the klines walk's `BackfillDrainGate` (`T-05.3`): an open gate, and a capped stream.

`CappedStream` is the point of this module. It models the ONE property of a Redis Stream the
defect lives in: `XADD MAXLEN ~ N` drops the oldest entries past the cap whether or not the
consumer group has read them, and says nothing. Publishing goes in through `accept` (it is a
`RedisStreamSeriesSink` stand-in), the writer drains a fixed number of entries per poll, and
every entry the cap pushed out before the writer reached it lands in `trimmed_unread` — the
count production never sees. `gate()` hands out the `BackfillDrainGate` that reads THIS stream's
lag, so a test can run the real `_run_klines_collector` against it with or without waiting.
"""

from __future__ import annotations

import threading
from collections import deque

from src.modules.sentimento.domain.provenance import SeriesRow


class OpenGate:
    """A gate that never waits — for tests about something other than backpressure."""

    def __init__(self) -> None:
        """Start with no wait observed."""
        self.waits = 0

    def wait(self, stop_event: threading.Event) -> int | None:
        """Count the call and let the page through at once (unless the test is stopping)."""
        self.waits += 1
        return None if stop_event.is_set() else 0


class CappedStream:
    """A stream capped at `max_len` whose single consumer drains `drain_per_poll` per poll."""

    def __init__(self, *, max_len: int, drain_per_poll: int) -> None:
        """Start empty: nothing published, nothing written, nothing trimmed."""
        self._max_len = max_len
        self._drain_per_poll = drain_per_poll
        self._unread: deque[SeriesRow] = deque()
        self.written: list[SeriesRow] = []
        self.trimmed_unread = 0

    def accept(self, row: SeriesRow, *, run_id: str | None = None) -> None:
        """`XADD MAXLEN ~ max_len`: append, then trim the OLDEST unread past the cap, silently."""
        del run_id
        self._unread.append(row)
        while len(self._unread) > self._max_len:
            self._unread.popleft()
            self.trimmed_unread += 1

    def lag(self) -> int:
        """`XINFO GROUPS` → `lag`: entries published and not yet delivered to the writer."""
        return len(self._unread)

    def drain(self, entries: int | None = None) -> None:
        """Let the writer read `entries` (one poll's worth by default) off the front."""
        for _ in range(min(len(self._unread), entries or self._drain_per_poll)):
            self.written.append(self._unread.popleft())

    def drain_all(self) -> None:
        """Let the writer catch up completely — what happens once the producers go quiet."""
        self.drain(len(self._unread))

    def gate(self, max_lag: int) -> _CappedStreamGate:
        """Return the `BackfillDrainGate` that waits on THIS stream's lag."""
        return _CappedStreamGate(self, max_lag)


class _CappedStreamGate:
    """`StreamDrainGate`'s contract over a `CappedStream`: each poll is one writer drain."""

    def __init__(self, stream: CappedStream, max_lag: int) -> None:
        """Bind the stream and the ceiling the walk may leave unread."""
        self._stream = stream
        self._max_lag = max_lag
        self.polls = 0

    def wait(self, stop_event: threading.Event) -> int | None:
        """Drain one poll's worth at a time until the lag is at or below the ceiling."""
        while not stop_event.is_set():
            lag = self._stream.lag()
            if lag <= self._max_lag:
                return lag
            self.polls += 1
            self._stream.drain()
        return None
