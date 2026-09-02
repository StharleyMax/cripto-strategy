"""`run_single_writer`: pending THEN new, through the ONE writer, acking every entry.

`test_pending_is_drained_before_any_new_entry_is_even_read` is the falsifier for the `D7.10`
recovery order: a consumer that read `new` before `pending` would have delivered entries out of
the order a real restart requires, and this test watches the READ CALLS themselves, not just the
final tally, so a reordering fails here even if the totals happened to still add up.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from src.modules.sentimento.domain.provenance import (
    UNKNOWN_OBSERVER_REGION,
    AvailabilitySource,
    Provenance,
    SeriesRow,
)
from src.modules.sentimento.use_cases.run_single_writer import QueuedSeriesRow, run_single_writer
from src.modules.sentimento.use_cases.write_series_row import WriteOutcome

BUCKET_END_MS = 1_787_443_499_999
EVENT_TIME_MS = 1_787_443_500_000


def row(**overrides: object) -> SeriesRow:
    """Build one valid market-series row — mirrors `test_provenance_columns.py`'s helper."""
    columns: dict[str, object] = {
        "series_key_id": "a" * 64,
        "symbol": "BTCUSDT",
        "source": "binance_daily_metrics",
        "bucket_end": BUCKET_END_MS,
        "event_time": EVENT_TIME_MS,
        "available_at": EVENT_TIME_MS + 30_000,
        "availability_source": AvailabilitySource.OBSERVED,
        "ingested_at": EVENT_TIME_MS + 45_000,
        "observed_at": EVENT_TIME_MS + 46_000,
        "provenance": Provenance.OBSERVED,
        "src_label_raw": "2026-08-23 00:00:00",
        "observer_id": "vps-01",
        "observer_region": UNKNOWN_OBSERVER_REGION,
        "is_final": True,
    }
    columns.update(overrides)
    return SeriesRow(**columns)  # type: ignore[arg-type]


@dataclass
class FakeQueue:
    """`pending` and `new` are two fixed tuples; every call is logged so order is checkable."""

    pending: tuple[QueuedSeriesRow, ...]
    new: tuple[QueuedSeriesRow, ...]
    calls: list[str] = field(default_factory=list)
    acked: list[object] = field(default_factory=list)

    def read_pending(self, count: int) -> tuple[QueuedSeriesRow, ...]:
        """Log the call, then return the scripted `pending` tuple."""
        self.calls.append("pending")
        return self.pending

    def read_new(self, count: int) -> tuple[QueuedSeriesRow, ...]:
        """Log the call, then return the scripted `new` tuple."""
        self.calls.append("new")
        return self.new

    def ack(self, entry_id: object) -> None:
        """Record `entry_id` as acked, in call order."""
        self.acked.append(entry_id)


@dataclass
class FakeObservedLookup:
    """Answers `observed_already_present` with one fixed verdict, regardless of the row."""

    answer: bool = False

    def observed_already_present(self, row: SeriesRow) -> bool:
        """Return the fixed, scripted answer."""
        return self.answer


@dataclass
class FakeSeriesSink:
    """Records every row it accepts, so a test can prove it was — or was not — called."""

    accepted: list[SeriesRow] = field(default_factory=list)

    def accept(self, row: SeriesRow) -> None:
        """Append `row` to `accepted`."""
        self.accepted.append(row)


def test_pending_is_drained_before_any_new_entry_is_even_read() -> None:
    """The `D7.10` order, watched at the call level rather than trusted from the docstring."""
    queue = FakeQueue(
        pending=(QueuedSeriesRow(entry_id=b"1", row=row()),),
        new=(QueuedSeriesRow(entry_id=b"2", row=row()),),
    )

    run_single_writer(queue, FakeObservedLookup(), FakeSeriesSink(), batch_size=10)

    assert queue.calls == ["pending", "new"]


def test_every_entry_is_acked_regardless_of_accept_or_reject_verdict() -> None:
    """Both `WriteOutcome` members are terminal and durable, so both retire the queue entry."""
    accepted_candidate = QueuedSeriesRow(
        entry_id=b"accepted", row=row(provenance=Provenance.OBSERVED)
    )
    rejected_candidate = QueuedSeriesRow(
        entry_id=b"rejected", row=row(provenance=Provenance.MODELED)
    )
    queue = FakeQueue(pending=(), new=(accepted_candidate, rejected_candidate))
    lookup = FakeObservedLookup(answer=True)  # makes the MODELED candidate collide
    sink = FakeSeriesSink()

    outcomes = run_single_writer(queue, lookup, sink, batch_size=10)

    assert outcomes == (WriteOutcome.ACCEPTED, WriteOutcome.REJECTED_MODELED_OVER_OBSERVED)
    assert queue.acked == [b"accepted", b"rejected"]
    assert sink.accepted == [accepted_candidate.row]


def test_an_exception_between_write_and_ack_leaves_the_entry_unacked() -> None:
    """The recovery contract: a crash mid-batch must not ack an entry it never finished."""

    class ExplodingSink:
        """A sink that always fails, to simulate a crash mid-write."""

        def accept(self, row: SeriesRow) -> None:
            """Raise, unconditionally, before any durable effect."""
            raise RuntimeError("sink is down")

    queue = FakeQueue(
        pending=(),
        new=(QueuedSeriesRow(entry_id=b"1", row=row(provenance=Provenance.OBSERVED)),),
    )
    try:
        run_single_writer(queue, FakeObservedLookup(), ExplodingSink(), batch_size=10)
    except RuntimeError:
        pass
    else:
        raise AssertionError("expected the sink's RuntimeError to propagate")
    assert queue.acked == []


def test_an_empty_queue_produces_no_outcomes_and_no_acks() -> None:
    """The degenerate case: nothing pending, nothing new, nothing to do."""
    queue = FakeQueue(pending=(), new=())
    outcomes = run_single_writer(queue, FakeObservedLookup(), FakeSeriesSink(), batch_size=10)
    assert outcomes == ()
    assert queue.acked == []
