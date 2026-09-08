"""`single_writer_cli.run`: one `run_single_writer` batch per iteration, event per outcome.

`run` takes its three `run_single_writer` collaborators already built (`SeriesWriteQueue`,
`ObservedLookup`, `SeriesSink`) — composing them against a live Redis/Postgres is `main()`'s
job (`build_queue`, `connect_redis`, `connect_postgres`), covered separately by
`test_single_writer_cli_boot.py` and `T-02.7`'s real-process test. This file proves the LOOP
itself: `writer_batch_acked{n_accepted, n_rejected}` counts outcomes correctly, an empty queue
sleeps `poll_interval_s` instead of spinning, and `_decode_wire_fields`/`_reject_message` behave
as `single_writer_cli.build_queue` wires them.
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
from src.modules.sentimento.infra import single_writer_cli
from src.modules.sentimento.infra.series_row_wire import (
    InvalidWireFieldValueError,
    MissingWireFieldError,
    encode,
)
from src.modules.sentimento.use_cases.run_single_writer import QueuedSeriesRow

BUCKET_END_MS = 1_787_443_499_999
EVENT_TIME_MS = 1_787_443_500_000


def _row(**overrides: object) -> SeriesRow:
    """Build one valid market-series row — mirrors `test_run_single_writer.py`'s own helper."""
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
        "value_raw": "1.0",
    }
    columns.update(overrides)
    return SeriesRow(**columns)  # type: ignore[arg-type]


@dataclass
class _FakeQueue:
    """`batches` is a fixed script of what each successive `run_single_writer` call reads."""

    pending_batches: list[tuple[QueuedSeriesRow, ...]]
    acked: list[object] = field(default_factory=list)

    def read_pending(self, count: int) -> tuple[QueuedSeriesRow, ...]:  # noqa: ARG002
        """Pop the next scripted batch, or `()` once the script is exhausted."""
        if not self.pending_batches:
            return ()
        return self.pending_batches.pop(0)

    def read_new(self, count: int) -> tuple[QueuedSeriesRow, ...]:  # noqa: ARG002
        """`read_pending` alone carries this test's script — `new` is always empty."""
        return ()

    def ack(self, entry_id: object) -> None:
        """Record `entry_id` as acked, in call order."""
        self.acked.append(entry_id)


@dataclass
class _FakeObservedLookup:
    """Answers `observed_already_present` with one fixed verdict, regardless of the row."""

    answer: bool = False

    def observed_already_present(self, row: SeriesRow) -> bool:
        """Return the fixed, scripted answer."""
        return self.answer


@dataclass
class _FakeSeriesSink:
    """Records every row it accepts."""

    accepted: list[SeriesRow] = field(default_factory=list)

    def accept(self, row: SeriesRow) -> None:
        """Append `row` to `accepted`."""
        self.accepted.append(row)


def _extra(record: logging.LogRecord, key: str) -> object:
    """Read one `extra={}` key off a captured `LogRecord` — see `test_collectors_cli_log_run_id`.

    `LogRecord` is not typed with these application-specific attributes (they arrive only via
    `extra={}` at the call site), so `getattr` is the honest way to reach them under
    `mypy --strict` — a bare `record.n_accepted` would need a stub this repository does not own.
    """
    return getattr(record, key)


class _StopAfter:
    """A `sleep` fake that sets `stop_event` after `n` calls — turns the loop finite."""

    def __init__(self, stop_event: threading.Event, n: int) -> None:
        """Remember the event to set and how many calls to allow before setting it."""
        self._stop_event = stop_event
        self._remaining = n

    def __call__(self, _seconds: float) -> None:
        """Count down; set the stop event once the budget is spent."""
        self._remaining -= 1
        if self._remaining <= 0:
            self._stop_event.set()


def test_a_full_batch_logs_writer_batch_acked_with_the_right_split(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """One `ACCEPTED` and one `REJECTED_MODELED_OVER_OBSERVED` -> `n_accepted=1, n_rejected=1`."""
    accepted_row = _row(series_key_id="a" * 64)
    rejected_row = _row(series_key_id="b" * 64, provenance=Provenance.MODELED)
    queue = _FakeQueue(
        pending_batches=[
            (
                QueuedSeriesRow(entry_id=b"1", row=accepted_row),
                QueuedSeriesRow(entry_id=b"2", row=rejected_row),
            )
        ]
    )
    stop = threading.Event()
    with caplog.at_level(logging.INFO, logger=single_writer_cli.__name__):
        single_writer_cli.run(
            queue=queue,
            lookup=_FakeObservedLookup(answer=True),
            sink=_FakeSeriesSink(),
            batch_size=10,
            poll_interval_s=0.0,
            stop_event=stop,
            sleep=_StopAfter(stop, n=1),
        )
    acked_records = [r for r in caplog.records if r.message == "writer_batch_acked"]
    assert len(acked_records) == 1, caplog.records
    assert _extra(acked_records[0], "n_accepted") == 1
    assert _extra(acked_records[0], "n_rejected") == 1
    assert queue.acked == [b"1", b"2"]


def test_an_empty_batch_sleeps_the_poll_interval_and_logs_nothing() -> None:
    """The queue is empty every iteration -> `sleep` is called, no `writer_batch_acked` event."""
    queue = _FakeQueue(pending_batches=[])
    stop = threading.Event()
    calls: list[float] = []

    def _sleep(seconds: float) -> None:
        calls.append(seconds)
        if len(calls) >= 3:
            stop.set()

    single_writer_cli.run(
        queue=queue,
        lookup=_FakeObservedLookup(),
        sink=_FakeSeriesSink(),
        batch_size=10,
        poll_interval_s=0.5,
        stop_event=stop,
        sleep=_sleep,
    )
    assert calls == [0.5, 0.5, 0.5]


def test_run_returns_zero_once_stopped() -> None:
    """A clean stop is `rc=0` — the loop never surfaces a nonzero exit on its own."""
    stop = threading.Event()
    stop.set()
    result = single_writer_cli.run(
        queue=_FakeQueue(pending_batches=[]),
        lookup=_FakeObservedLookup(),
        sink=_FakeSeriesSink(),
        batch_size=10,
        poll_interval_s=0.0,
        stop_event=stop,
    )
    assert result == 0


# ── `_decode_wire_fields` — bytes -> str, then `series_row_wire.decode` ─────────────────────


def _encoded_fields() -> dict[bytes, bytes]:
    """Build the 15-field wire mapping `series_row_wire.encode` produces, byte-keyed."""
    return {key.encode("utf-8"): value.encode("utf-8") for key, value in encode(_row()).items()}


def test_decode_wire_fields_round_trips_a_real_encoded_row() -> None:
    """The bytes-adapter recovers the same `SeriesRow` `series_row_wire.encode` was given."""
    decoded = single_writer_cli._decode_wire_fields(_encoded_fields())
    assert decoded == _row()


def test_decode_wire_fields_raises_the_wire_error_family_on_a_missing_field() -> None:
    """A field missing from the mapping surfaces as `series_row_wire`'s own typed error."""
    fields = _encoded_fields()
    del fields[b"symbol"]
    with pytest.raises(MissingWireFieldError):
        single_writer_cli._decode_wire_fields(fields)


def test_decode_wire_fields_raises_invalid_wire_field_value_on_bad_utf8() -> None:
    """A field that is not valid UTF-8 is the SAME poison-message family as a bad wire value."""
    fields = _encoded_fields()
    fields[b"symbol"] = b"\xff\xfe"
    with pytest.raises(InvalidWireFieldValueError):
        single_writer_cli._decode_wire_fields(fields)


# ── `_reject_message` — the `on_rejected` hook `build_queue` wires in ───────────────────────


def test_reject_message_logs_writer_message_rejected_with_entry_id_and_reason(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """`writer_message_rejected{entry_id, reason}` — `SPEC-004` §3.7, literal."""
    error = MissingWireFieldError("wire mapping is missing field(s) ['symbol']")
    with caplog.at_level(logging.WARNING, logger=single_writer_cli.__name__):
        single_writer_cli._reject_message(b"1730000000000-0", error)
    [record] = [r for r in caplog.records if r.message == "writer_message_rejected"]
    assert _extra(record, "entry_id") == "1730000000000-0"
    assert "symbol" in str(_extra(record, "reason"))
