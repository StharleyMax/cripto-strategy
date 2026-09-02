"""Drain the durable queue `T-07.4` provides and hand every candidate to the single writer.

`ADR-002/D5`: "os coletores 24/7 produzem para fila durável; o escritor único é o único que toca
a série." This module is the loop that makes that literal: it is the only production caller of
`write_series_row` (`tests/sentimento/test_write_series_row_call_sites.py` proves the count), so
a second production writer would have to route around this file entirely, not merely call a
different function inside it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from src.modules.sentimento.domain.provenance import SeriesRow
from src.modules.sentimento.use_cases.write_series_row import (
    ObservedLookup,
    SeriesSink,
    WriteOutcome,
    write_series_row,
)


@dataclass(frozen=True)
class QueuedSeriesRow:
    """One durable-queue entry, already decoded into a write candidate.

    `entry_id` is opaque here — this module never compares or parses it, only hands it back to
    `queue.ack`. `RedisStreamConsumerGroup.entry_id` (`T-07.4`) is `bytes`; nothing about this
    dataclass assumes that shape beyond "whatever `ack` accepts".
    """

    entry_id: object
    row: SeriesRow


class SeriesWriteQueue(Protocol):
    """Durable-queue port, shaped after `RedisStreamConsumerGroup` (`T-07.4`) but naming no Redis.

    `read_pending` THEN `read_new` is `D7.10`'s recovery order, made a structural requirement of
    this port's two methods rather than a comment a caller could get backwards: a consumer that
    skips `read_pending` on restart loses every entry it claimed but never acked, permanently.
    """

    def read_pending(self, count: int) -> tuple[QueuedSeriesRow, ...]: ...  # noqa: D102

    def read_new(self, count: int) -> tuple[QueuedSeriesRow, ...]: ...  # noqa: D102

    def ack(self, entry_id: object) -> None: ...  # noqa: D102


def run_single_writer(
    queue: SeriesWriteQueue, lookup: ObservedLookup, sink: SeriesSink, *, batch_size: int
) -> tuple[WriteOutcome, ...]:
    """Drain pending entries, then new ones, writing each through the ONE writer; return outcomes.

    Every entry is `ack`ed right after `write_series_row` returns, whichever outcome it is:
    `ACCEPTED` and `REJECTED_MODELED_OVER_OBSERVED` are both a TERMINAL, DURABLE decision (the
    row is either in `sink` or logged as refused), so both retire the entry from the Pending
    Entries List the same way `RedisStreamConsumerGroup.ack`'s contract requires — "call only
    once its effect is durable". Only an exception raised BETWEEN `write_series_row` and `ack`
    leaves an entry unacked, which is exactly the case `read_pending` exists to recover on the
    next run: this function does not swallow such an exception, it lets it propagate and stop
    the batch, so the failed entry (and everything still queued behind it) stays pending rather
    than being acked on a guess.
    """
    outcomes: list[WriteOutcome] = []
    for batch in (queue.read_pending(batch_size), queue.read_new(batch_size)):
        for item in batch:
            outcome = write_series_row(item.row, lookup=lookup, sink=sink)
            queue.ack(item.entry_id)
            outcomes.append(outcome)
    return tuple(outcomes)
