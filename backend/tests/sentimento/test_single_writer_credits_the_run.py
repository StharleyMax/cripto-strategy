"""`ADR-035/D2`, offline half: what the writer's LOOP does with the `run_id` it received.

The other half — that the credit actually lands in `md.ingest_run` without touching a field the
writer never measured — needs a real Postgres and lives in
`test_postgres_ingest_record_store_credits_the_run.py`. Split on purpose: everything provable
against a fake creditor is provable in 2 s, and only the SQL semantics pay for a container.

THE THREE PROPERTIES, AND WHY EACH IS A SEPARATE TEST:

  1. only ACCEPTED rows are credited. Crediting a `REJECTED_MODELED_OVER_OBSERVED` row would
     make `n_written` mean "rows offered", which is `n_returned`'s job — and `ADR-035/D1`'s
     whole argument is that collapsing the two makes `DoD-4` tautological.
  2. a credit whose run row does not exist yet is KEPT, not dropped. In production the writer
     drains the queue while the collector's cycle is still open, so this is the ORDINARY path;
     a version that dropped it would leave `n_written = 0` on exactly the runs that wrote most.
  3. rows carrying no `run_id` are counted and REPORTED separately. "No producer is wired yet"
     and "the wiring broke" have different owners, and a single silent zero hides both.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field

import pytest

from src.modules.sentimento.domain.provenance import (
    UNKNOWN_OBSERVER_REGION,
    AvailabilitySource,
    Provenance,
    SeriesRow,
)
from src.modules.sentimento.infra.single_writer_cli import run
from src.modules.sentimento.use_cases.run_single_writer import QueuedSeriesRow

BUCKET_END_MS = 1_787_443_499_999
EVENT_TIME_MS = 1_787_443_500_000
RUN_A = "run-a"
RUN_B = "run-b"
ACCOUNTED_AT = "2026-09-10T21:00:00.000Z"


def _row(bucket_end: int = BUCKET_END_MS, *, observed: bool = True) -> SeriesRow:
    """Build one valid row; `observed=False` makes it the candidate the lookup will refuse."""
    return SeriesRow(
        series_key_id="a" * 64,
        symbol="BTCUSDT",
        source="binance_daily_metrics",
        bucket_end=bucket_end,
        event_time=EVENT_TIME_MS,
        available_at=EVENT_TIME_MS + 30_000,
        availability_source=AvailabilitySource.OBSERVED,
        ingested_at=EVENT_TIME_MS + 45_000,
        observed_at=EVENT_TIME_MS + 46_000,
        provenance=Provenance.OBSERVED if observed else Provenance.MODELED,
        src_label_raw="2026-08-23 00:00:00",
        observer_id="vps-01",
        observer_region=UNKNOWN_OBSERVER_REGION,
        is_final=True,
        value_raw="1.0",
    )


@dataclass
class _FakeQueue:
    """A fixed script of batches, one per `run_single_writer` call."""

    batches: list[tuple[QueuedSeriesRow, ...]]
    acked: list[object] = field(default_factory=list)

    def read_pending(self, count: int) -> tuple[QueuedSeriesRow, ...]:  # noqa: ARG002
        """Pop the next scripted batch, or `()` once the script is exhausted."""
        if not self.batches:
            return ()
        return self.batches.pop(0)

    def read_new(self, count: int) -> tuple[QueuedSeriesRow, ...]:  # noqa: ARG002
        """`read_pending` alone carries the script."""
        return ()

    def ack(self, entry_id: object) -> None:
        """Record `entry_id` as acked."""
        self.acked.append(entry_id)


@dataclass
class _FakeLookup:
    """`observed_already_present` is `True` only for the bucket ends listed in `taken`."""

    taken: frozenset[int] = frozenset()

    def observed_already_present(self, row: SeriesRow) -> bool:
        """Answer from the scripted set of already-observed buckets."""
        return row.bucket_end in self.taken


@dataclass
class _FakeSink:
    """Records every row it accepts."""

    accepted: list[SeriesRow] = field(default_factory=list)

    def accept(self, row: SeriesRow) -> None:
        """Append `row` to `accepted`."""
        self.accepted.append(row)


@dataclass
class _FakeCreditor:
    """Accepts credits only for runs listed in `known`, recording every attempt in order."""

    known: set[str] = field(default_factory=set)
    calls: list[tuple[str, int, str]] = field(default_factory=list)

    def credit_written(self, run_id: str, n_written: int, accounted_at: str) -> bool:
        """Record the attempt; report whether the run row exists yet."""
        self.calls.append((run_id, n_written, accounted_at))
        return run_id in self.known


def _extra(record: logging.LogRecord, key: str) -> object:
    """Read one `extra={}` key off a captured `LogRecord`.

    Same helper, same reason as `test_single_writer_cli_run.py`: these attributes arrive only
    through `extra={}`, so `mypy --strict` has no static name to check without a stub.
    """
    return getattr(record, key)


class _StopAfter:
    """A `sleep` fake that stops the loop after `n` idle iterations."""

    def __init__(self, stop_event: threading.Event, n: int) -> None:
        """Remember the event to set and how many idle sleeps to allow."""
        self._stop_event = stop_event
        self._remaining = n

    def __call__(self, _seconds: float) -> None:
        """Count down; set the stop event once the budget is spent."""
        self._remaining -= 1
        if self._remaining <= 0:
            self._stop_event.set()


def _drain(
    batches: list[tuple[QueuedSeriesRow, ...]],
    creditor: _FakeCreditor | None,
    *,
    taken: frozenset[int] = frozenset(),
) -> _FakeSink:
    """Run the writer loop over `batches` until the script runs out, then stop it."""
    stop = threading.Event()
    sink = _FakeSink()
    run(
        queue=_FakeQueue(batches=batches),
        lookup=_FakeLookup(taken=taken),
        sink=sink,
        batch_size=10,
        poll_interval_s=0.0,
        creditor=creditor,
        stop_event=stop,
        sleep=_StopAfter(stop, 1),
        now=lambda: ACCOUNTED_AT,
    )
    return sink


def test_one_batch_credits_the_run_with_exactly_the_rows_it_persisted() -> None:
    """`ADR-035/D1`: `n_written` is rows PERSISTED, counted per run that produced them."""
    creditor = _FakeCreditor(known={RUN_A})
    _drain(
        [
            (
                QueuedSeriesRow(entry_id=b"1", row=_row(BUCKET_END_MS), run_id=RUN_A),
                QueuedSeriesRow(entry_id=b"2", row=_row(BUCKET_END_MS + 60_000), run_id=RUN_A),
            )
        ],
        creditor,
    )
    assert creditor.calls == [(RUN_A, 2, ACCOUNTED_AT)]


def test_two_runs_in_one_batch_are_credited_separately_never_summed_together() -> None:
    """Aggregation is BY `run_id` — a single total would credit rows to the wrong cycle."""
    creditor = _FakeCreditor(known={RUN_A, RUN_B})
    _drain(
        [
            (
                QueuedSeriesRow(entry_id=b"1", row=_row(BUCKET_END_MS), run_id=RUN_A),
                QueuedSeriesRow(entry_id=b"2", row=_row(BUCKET_END_MS + 60_000), run_id=RUN_B),
                QueuedSeriesRow(entry_id=b"3", row=_row(BUCKET_END_MS + 120_000), run_id=RUN_B),
            )
        ],
        creditor,
    )
    assert sorted(creditor.calls) == [(RUN_A, 1, ACCOUNTED_AT), (RUN_B, 2, ACCOUNTED_AT)]


def test_a_rejected_row_is_never_credited() -> None:
    """A row refused by `D7.16` was not persisted — crediting it would re-make `DoD-4` a no-op."""
    creditor = _FakeCreditor(known={RUN_A})
    sink = _drain(
        [
            (
                QueuedSeriesRow(
                    entry_id=b"1", row=_row(BUCKET_END_MS, observed=False), run_id=RUN_A
                ),
                QueuedSeriesRow(entry_id=b"2", row=_row(BUCKET_END_MS + 60_000), run_id=RUN_A),
            )
        ],
        creditor,
        taken=frozenset({BUCKET_END_MS}),
    )
    assert len(sink.accepted) == 1
    assert creditor.calls == [(RUN_A, 1, ACCOUNTED_AT)]


def test_a_credit_the_store_could_not_apply_is_retried_on_the_next_batch_and_only_once() -> None:
    """The ORDINARY production path: the writer beats the collector's cycle close.

    The falsifier this test IS: drop the deferred credit instead of keeping it, and the run
    that wrote the most rows is exactly the run that ends up with `n_written = 0` — which is
    the observation `ADR-035` names as proof the decision was wrong.
    """
    creditor = _FakeCreditor(known=set())
    batches: list[tuple[QueuedSeriesRow, ...]] = [
        (QueuedSeriesRow(entry_id=b"1", row=_row(BUCKET_END_MS), run_id=RUN_A),),
        (QueuedSeriesRow(entry_id=b"2", row=_row(BUCKET_END_MS + 60_000), run_id=RUN_A),),
    ]
    stop = threading.Event()
    queue = _FakeQueue(batches=batches)

    def apply_after_the_first_attempt(_seconds: float) -> None:
        creditor.known.add(RUN_A)
        stop.set()

    run(
        queue=queue,
        lookup=_FakeLookup(),
        sink=_FakeSink(),
        batch_size=10,
        poll_interval_s=0.0,
        creditor=creditor,
        stop_event=stop,
        sleep=apply_after_the_first_attempt,
        now=lambda: ACCOUNTED_AT,
    )
    # Batch 1 credits 1 and is refused; batch 2 carries the accumulated 2 and is accepted.
    assert creditor.calls == [(RUN_A, 1, ACCOUNTED_AT), (RUN_A, 2, ACCOUNTED_AT)]


def test_rows_without_a_run_id_are_counted_and_warned_about_never_credited(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A producer not wired to `ADR-035` must be VISIBLE, not indistinguishable from zero."""
    creditor = _FakeCreditor(known={RUN_A})
    with caplog.at_level(logging.INFO, logger="src.modules.sentimento.infra.single_writer_cli"):
        _drain(
            [
                (
                    QueuedSeriesRow(entry_id=b"1", row=_row(BUCKET_END_MS)),
                    QueuedSeriesRow(entry_id=b"2", row=_row(BUCKET_END_MS + 60_000), run_id=RUN_A),
                )
            ],
            creditor,
        )
    assert creditor.calls == [(RUN_A, 1, ACCOUNTED_AT)]
    warned = [r for r in caplog.records if r.message == "writer_rows_without_run_id"]
    assert len(warned) == 1
    # `LogRecord` carries no static `n_rows` attribute — it arrives only through `extra={}`, so
    # reading it needs a dynamic lookup that `mypy --strict` accepts without a stub we do not own.
    assert _extra(warned[0], "n_rows") == 1


def test_a_loop_composed_without_a_creditor_credits_nothing_and_still_writes() -> None:
    """No record store composed = no accounting, said out loud by doing nothing at all."""
    sink = _drain([(QueuedSeriesRow(entry_id=b"1", row=_row(BUCKET_END_MS), run_id=RUN_A),)], None)
    assert len(sink.accepted) == 1
