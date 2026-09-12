"""The SIXTH collector thread, driven offline: it publishes, it records, and it files gaps.

ZERO REDE. `_run_liquidation_collector` is called directly with a scripted source, a fake sink
and in-memory recorders, and the `stop_event` is set from inside the recorder so the loop runs
exactly one cycle — the same technique the other collector-thread tests in this package use to
exercise a `while not stop_event.is_set()` body without a real cadence elapsing.
"""

from __future__ import annotations

import json
import threading
from typing import Any

from src.modules.sentimento.domain.ingest_record import IngestGap, IngestRun
from src.modules.sentimento.infra.collectors_cli import (
    UNANSWERED_SYMBOL_GAP_CLASS,
    _run_liquidation_collector,
)
from src.modules.sentimento.use_cases.collect_liquidation_history import LiquidationFetch
from src.modules.sentimento.use_cases.collector_run_mapping import (
    COINALYZE_SOURCE,
    LIQUIDATION_HISTORY_ENDPOINT,
)
from src.modules.sentimento.use_cases.collector_series_mapping import (
    build_liquidation_history_to_row,
)

# A bucket old enough that `RS-3.4` admits it whatever the wall clock says when the test runs.
_SETTLED_START = 1_600_000_020


class _FakeSink:
    """Collects what the thread would have published to Redis."""

    def __init__(self) -> None:
        """Start with nothing accepted."""
        self.rows: list[tuple[str, str]] = []

    def accept(self, row: Any, *, run_id: str) -> None:
        """Record the row's identity and the run it was attributed to."""
        self.rows.append((row.series_key_id, run_id))


class _FailingSink:
    """A sink that refuses every row — `SPEC-004` 3.1's "falha do Redis em regime"."""

    def accept(self, row: Any, *, run_id: str) -> None:
        """Fail the way a dead Redis connection does."""
        raise ConnectionResetError("redis went away")


class _ScriptedSource:
    """Answers each fetch from a queue, repeating the last answer when it runs out."""

    def __init__(self, answers: list[LiquidationFetch]) -> None:
        """Take the script."""
        self._answers = list(answers)
        self.calls = 0

    def fetch(self, path: str) -> LiquidationFetch:
        """Pop the next scripted answer."""
        self.calls += 1
        if len(self._answers) > 1:
            return self._answers.pop(0)
        return self._answers[0]


def _body(symbol: str, history: list[dict[str, object]]) -> bytes:
    """Render the provider's wire shape for ONE requested symbol."""
    return json.dumps([{"symbol": f"{symbol}_PERP.A", "history": history}]).encode("utf-8")


def _drive(
    *, answers: list[LiquidationFetch], sink: Any
) -> tuple[list[IngestRun], list[IngestGap], list[int]]:
    """Run exactly one cycle of the thread and return what it recorded."""
    stop = threading.Event()
    failure = threading.Event()
    exit_code = [0]
    runs: list[IngestRun] = []
    gaps: list[IngestGap] = []

    def _record_run(run: IngestRun) -> None:
        runs.append(run)
        stop.set()  # one cycle is enough; the loop re-checks this before waiting

    _run_liquidation_collector(
        stop_event=stop,
        failure_event=failure,
        exit_code=exit_code,
        source=_ScriptedSource(answers),
        sink=sink,
        to_row=build_liquidation_history_to_row(),
        record_run=_record_run,
        record_gap=gaps.append,
        symbols=["BTCUSDT"],
        interval_s=300.0,
    )
    return runs, gaps, exit_code


def test_one_cycle_publishes_both_cohorts_and_records_an_accepted_run() -> None:
    """The end-to-end shape of a healthy cycle, without one byte crossing the network."""
    sink = _FakeSink()
    body = _body("BTCUSDT", [{"t": _SETTLED_START, "l": 231.85, "s": 1468.84}])
    runs, gaps, exit_code = _drive(answers=[LiquidationFetch(status=200, body=body)], sink=sink)
    (run,) = runs
    assert run.verdict == "ACCEPTED"
    assert run.source == COINALYZE_SOURCE
    assert run.endpoint == LIQUIDATION_HISTORY_ENDPOINT
    assert run.notes is None
    assert len({series_key_id for series_key_id, _ in sink.rows}) == 2
    assert {run_id for _, run_id in sink.rows} == {run.run_id}
    assert gaps == []
    assert exit_code == [0]


def test_an_unanswered_symbol_files_one_gap_per_cohort() -> None:
    """`RS-3.7`: both series are accounted for, because they are two independent series."""
    runs, gaps, _ = _drive(answers=[LiquidationFetch(status=200, body=b"[]")], sink=_FakeSink())
    (run,) = runs
    assert run.verdict == "ACCEPTED_WITH_WARNING"
    assert run.notes is not None
    assert len(gaps) == 2
    assert {gap.gap_class for gap in gaps} == {UNANSWERED_SYMBOL_GAP_CLASS}
    assert {gap.source for gap in gaps} == {COINALYZE_SOURCE}
    assert len({gap.series_key_id for gap in gaps}) == 2


def test_a_quiet_symbol_files_no_gap_and_still_closes_accepted() -> None:
    """THE CALA HALF: 79,8% of cycles look like this and none of them is an incident."""
    runs, gaps, exit_code = _drive(
        answers=[LiquidationFetch(status=200, body=_body("BTCUSDT", []))], sink=_FakeSink()
    )
    (run,) = runs
    assert run.verdict == "ACCEPTED"
    assert run.notes is None
    assert gaps == []
    assert exit_code == [0]


def test_a_dead_queue_closes_the_run_rejected_and_names_the_reason() -> None:
    """`T-05.6` at the composition root: the thread CANNOT record a reasonless rejection.

    `build_liquidation_history_run` would raise if this path passed no `notes`, so the test
    that the reason is present is also the test that the thread does not crash — the two
    cannot be separated, which is exactly the property `require_rejection_reason` buys.
    """
    body = _body("BTCUSDT", [{"t": _SETTLED_START, "l": 1, "s": 0}])
    runs, _, exit_code = _drive(
        answers=[LiquidationFetch(status=200, body=body)], sink=_FailingSink()
    )
    (run,) = runs
    assert run.verdict == "REJECTED"
    assert run.api_code is None
    assert run.notes is not None
    assert "ConnectionResetError" in run.notes
    assert exit_code == [1]
