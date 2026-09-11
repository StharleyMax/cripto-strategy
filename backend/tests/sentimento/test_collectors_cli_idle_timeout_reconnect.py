"""`ADR-004` Emenda D5/D6: idle-silence reconnects like `StopIteration`, never `REJECTED`.

The Reclassificação table (`ADR-004`, Emenda D5/D6) names this explicitly: a read timeout on an
ALREADY OPEN connection, accumulated past D5's threshold, must "reconecta pela MESMA rota de
`StopIteration`" — not fall into `_PUBLISH_FAILURE_EXCEPTIONS`'s generic `REJECTED` path, which is
where it landed before this emenda (`StreamTransportError` was, and still is, in that tuple; the
whole point of the new `StreamIdleTimeoutError` type is to be routed AROUND it). Nothing in the
existing suite drove `_run_force_order_collector`'s reconnect branch before this file — a
regression here (removing `StreamIdleTimeoutError` from the `except` clause, or leaving it only
in `_PUBLISH_FAILURE_EXCEPTIONS`) would have passed unnoticed.
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Iterable, Iterator
from typing import Any

import pytest

from src.modules.sentimento.domain.force_order_collision_accounting import (
    ForceOrderKeyObservation,
)
from src.modules.sentimento.domain.ingest_record import IngestRun
from src.modules.sentimento.domain.provenance import (
    UNKNOWN_OBSERVER_REGION,
    AvailabilitySource,
    Provenance,
    SeriesRow,
)
from src.modules.sentimento.domain.stream_probe_outcome import ProbeStage
from src.modules.sentimento.infra import collectors_cli
from src.modules.sentimento.infra.binance_stream_probe import StreamIdleTimeoutError
from src.modules.sentimento.use_cases.probe_stream_quantity_fields import MessageSource

# One raw `!forceOrder@arr` frame, B2-keyable (mirrors `test_force_order_reconnection.py`'s
# `FRAME_A`) — enough for `extract_force_order_natural_key` to succeed and reach the sink.
FRAME_A = (
    '{"e":"forceOrder","E":0,"o":{"s":"BTCUSDT","S":"SELL","o":"LIMIT","f":"IOC","q":"0.010",'
    '"p":"78000.00","ap":"78006.30","X":"FILLED","l":"0.010","z":"0.010","T":0}}'
)


def _row(**overrides: Any) -> SeriesRow:
    """Build one valid market-series row — mirrors `test_collectors_cli_publish_failure.py`."""
    columns: dict[str, Any] = {
        "series_key_id": "a" * 64,
        "symbol": "BTCUSDT",
        "source": "binance_force_order",
        "bucket_end": 1_787_443_499_999,
        "event_time": 1_787_443_500_000,
        "available_at": 1_787_443_530_000,
        "availability_source": AvailabilitySource.OBSERVED,
        "ingested_at": 1_787_443_545_000,
        "observed_at": 1_787_443_546_000,
        "provenance": Provenance.OBSERVED,
        "src_label_raw": "forceOrder",
        "observer_id": "vps-01",
        "observer_region": UNKNOWN_OBSERVER_REGION,
        "is_final": True,
        "value_raw": "1.0",
    }
    columns.update(overrides)
    return SeriesRow(**columns)


class _RecordingSink:
    """Duck-typed stand-in for `RedisStreamSeriesSink` — never fails, only records."""

    def __init__(self) -> None:
        """Start with no rows accepted."""
        self.accepted: list[SeriesRow] = []
        self.run_ids: list[str | None] = []

    def accept(self, row: SeriesRow, *, run_id: str | None = None) -> None:
        """Record the row AND the `ADR-035/D2` run id it was published under; never raises."""
        self.accepted.append(row)
        self.run_ids.append(run_id)


class _IdleThenGoneSource:
    """The OLD connection: its very first read is an idle-silence death (`ADR-004` D5).

    `open()` succeeds and is never re-called on this instance (D6: `perform_overlap_handoff`
    only calls it on the NEW source). `close()` is called exactly once, by the handoff.
    """

    def __init__(self) -> None:
        """Start unopened and unclosed."""
        self.opened = False
        self.closed = False
        self.path = "idle-old"

    def open(self) -> None:
        """Record that this (pre-existing, per the real caller's contract) source was opened."""
        self.opened = True

    def close(self) -> None:
        """Record the handoff closing this source — must happen exactly once."""
        self.closed = True

    def messages(self) -> Iterator[str]:
        """Raise `StreamIdleTimeoutError` on the very first `next()` — no frame ever arrives."""
        raise StreamIdleTimeoutError(
            ProbeStage.FRAME, "no frame of any kind for 300.0s (>= idle timeout 300.0s)"
        )
        yield ""  # pragma: no cover — unreachable; keeps this a generator function


class _OneFrameThenCleanCloseSource:
    """The NEW connection: handshake succeeds, yields ONE frame, then ends like `StopIteration`.

    Setting `stop_event` INSIDE the generator, after the yield resumes, models "the operator
    asked to stop right after this message" without a second, unwanted reconnect attempt.
    """

    def __init__(self, frame: str, stop_event: threading.Event) -> None:
        """Script the one frame to yield and the `stop_event` this source's end also sets."""
        self._frame = frame
        self._stop_event = stop_event
        self.opened = False
        self.closed = False
        self.path = "combined-new"

    def open(self) -> None:
        """Record the handshake D6 treats as full proof of life — no message required."""
        self.opened = True

    def close(self) -> None:
        """Record the final close, at the end of the run."""
        self.closed = True

    def messages(self) -> Iterator[str]:
        """Yield the one scripted frame, then end cleanly (no explicit `StopIteration`, PEP 479)."""
        yield self._frame
        self._stop_event.set()


def test_idle_silence_reconnects_through_the_stopiteration_route_never_rejected() -> None:
    """THE falsifier: `StreamIdleTimeoutError` on `old` must reconnect, not close `REJECTED`.

    Mutating `_run_force_order_collector`'s `except (StopIteration, StreamIdleTimeoutError):` back
    down to `except StopIteration:` alone (the pre-D6 shape) makes this test fail: the idle error
    would propagate uncaught by that branch, fall into `_PUBLISH_FAILURE_EXCEPTIONS` (which still
    lists the base `StreamTransportError`, D5/D6's `StreamIdleTimeoutError`'s parent), and close
    the session `REJECTED` with `exit_code[0] = 1` instead of reconnecting and publishing.
    """
    stop_event = threading.Event()
    failure_event = threading.Event()
    exit_code: list[int] = [0]
    recorded: list[IngestRun] = []
    source_holder: list[MessageSource | None] = [None]
    sink = _RecordingSink()

    old = _IdleThenGoneSource()
    new = _OneFrameThenCleanCloseSource(FRAME_A, stop_event)
    opened: list[object] = []

    def _open_source() -> MessageSource:
        source = old if not opened else new
        opened.append(source)
        return source

    def _to_rows(_received_at: int, _observation: ForceOrderKeyObservation) -> Iterable[SeriesRow]:
        return (_row(),)

    collectors_cli._run_force_order_collector(
        stop_event=stop_event,
        failure_event=failure_event,
        exit_code=exit_code,
        open_source=_open_source,
        sink=sink,  # type: ignore[arg-type]
        to_rows=_to_rows,
        record_run=recorded.append,
        source_holder=source_holder,
    )

    assert len(opened) == 2, "the idle timeout on `old` must trigger exactly ONE reconnect to `new`"
    assert old.opened and old.closed, (
        "the old source is opened by the caller and closed by D6's handoff"
    )
    assert new.opened and new.closed
    assert exit_code == [0], "idle-silence reconnection must NOT set exit_code[0] = 1"
    assert not failure_event.is_set(), "idle-silence reconnection must NOT signal the other thread"
    assert len(recorded) == 1, f"expected exactly one IngestRun recorded, got {len(recorded)}"
    assert recorded[0].verdict == "ACCEPTED", "idle-silence reconnection must NOT record REJECTED"
    assert len(sink.accepted) == 1, (
        "the new source's own frame must publish through the normal path"
    )


def test_idle_reconnect_and_receipt_are_observable_via_logs_under_one_session_id(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A reconnect and the frame that follows it must be traceable from `docker logs` alone.

    Before this test, `_run_force_order_collector`'s happy path was silent end to end: a
    reconnect triggered no log line at all, and a successfully keyed message logged nothing
    either — "is `forceOrder` really receiving data" could only be answered with an ad hoc
    raw-frame probe against the live container, never with `docker logs`. This pins the fix: one
    `session_id`, generated once per thread lifetime, threads through the reconnect log AND the
    message-received/published logs that follow it in the SAME session.
    """
    stop_event = threading.Event()
    failure_event = threading.Event()
    exit_code: list[int] = [0]
    recorded: list[IngestRun] = []
    source_holder: list[MessageSource | None] = [None]
    sink = _RecordingSink()

    old = _IdleThenGoneSource()
    new = _OneFrameThenCleanCloseSource(FRAME_A, stop_event)
    opened: list[object] = []

    def _open_source() -> MessageSource:
        source = old if not opened else new
        opened.append(source)
        return source

    def _to_rows(_received_at: int, _observation: ForceOrderKeyObservation) -> Iterable[SeriesRow]:
        return (_row(),)

    with caplog.at_level(logging.INFO, logger=collectors_cli.logger.name):
        collectors_cli._run_force_order_collector(
            stop_event=stop_event,
            failure_event=failure_event,
            exit_code=exit_code,
            open_source=_open_source,
            sink=sink,  # type: ignore[arg-type]
            to_rows=_to_rows,
            record_run=recorded.append,
            source_holder=source_holder,
        )

    by_event = {record.message: record for record in caplog.records}
    for event in (
        "force_order_session_reconnect",
        "force_order_message_received",
        "force_order_message_published",
        "collector_session_closed",
    ):
        assert event in by_event, f"expected a {event} log line, got {list(by_event)}"

    session_ids = {record.session_id for record in caplog.records}  # type: ignore[attr-defined]
    assert len(session_ids) == 1, (
        f"reconnect and message logs must share ONE session_id, got {session_ids}"
    )
    assert by_event["force_order_session_reconnect"].reason == "StreamIdleTimeoutError"  # type: ignore[attr-defined]
