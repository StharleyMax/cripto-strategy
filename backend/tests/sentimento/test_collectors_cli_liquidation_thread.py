"""The SIXTH collector thread, driven offline: it publishes, it records, and it files gaps.

ZERO REDE. `_run_liquidation_collector` is called directly with a scripted source, a fake sink
and in-memory recorders, and the `stop_event` is set from inside the recorder so the loop runs
exactly one cycle — the same technique the other collector-thread tests in this package use to
exercise a `while not stop_event.is_set()` body without a real cadence elapsing.
"""

from __future__ import annotations

import json
import threading
import time
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

# A cadence short enough that a MULTI-cycle test pays it for real between passes. The first
# cycle does not set the stop flag, so the loop genuinely waits this out — the 300 s default
# would hang the suite rather than test it.
_FAST_CADENCE_S = 0.05


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


class _RecordingStopEvent(threading.Event):
    """The real stop flag, plus a record of every timeout the thread asked to wait for.

    `RS-3.5` is a claim about the PERIOD, and the period is `cycle + final wait`. Only the
    argument handed to `wait` can tell a cadence that discounts the cycle from one that adds a
    whole cadence on top of it — the wall clock of a test that waits 0 s either way cannot.
    """

    def __init__(self) -> None:
        """Start unset, with nothing waited for yet."""
        super().__init__()
        self.waited: list[float | None] = []

    def wait(self, timeout: float | None = None) -> bool:
        """Record the timeout asked for, then behave exactly as the real flag does."""
        self.waited.append(timeout)
        return super().wait(timeout)


class _SlowSource(_ScriptedSource):
    """A source that burns a measurable slice of the cadence, the way a real request does."""

    def __init__(self, answers: list[LiquidationFetch], cost_seconds: float) -> None:
        """Take the script and how long each answer costs."""
        super().__init__(answers)
        self._cost_seconds = cost_seconds

    def fetch(self, path: str) -> LiquidationFetch:
        """Spend the cost, then answer from the script."""
        time.sleep(self._cost_seconds)
        return super().fetch(path)


def _drive(
    *,
    answers: list[LiquidationFetch],
    sink: Any,
    cycles: int = 1,
    interval_s: float = 300.0,
    stop: _RecordingStopEvent | None = None,
    source: Any = None,
) -> tuple[list[IngestRun], list[IngestGap], list[int]]:
    """Run exactly `cycles` cycles of the thread and return what it recorded."""
    stop = stop if stop is not None else _RecordingStopEvent()
    failure = threading.Event()
    exit_code = [0]
    runs: list[IngestRun] = []
    gaps: list[IngestGap] = []

    def _record_run(run: IngestRun) -> None:
        runs.append(run)
        if len(runs) >= cycles:
            stop.set()  # enough cycles; the loop re-checks this before waiting

    _run_liquidation_collector(
        stop_event=stop,
        failure_event=failure,
        exit_code=exit_code,
        source=source if source is not None else _ScriptedSource(answers),
        sink=sink,
        to_row=build_liquidation_history_to_row(),
        record_run=_record_run,
        record_gap=gaps.append,
        symbols=["BTCUSDT"],
        interval_s=interval_s,
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


# ── `T-05.7` PLUGGED IN: THE DETECTOR IS FED AND ASKED, AND IT BOTH MORDE AND CALA ─────────


def test_two_cycles_the_provider_never_answered_are_named_silent_in_the_run_record() -> None:
    """The `!forceOrder@arr` shape, caught this time — and caught WITHOUT reading a point count.

    Before the wiring, `assess_liquidation_liveness` had ZERO production callers and nothing
    anywhere built a `CycleHeartbeat` (`grep -rn ... backend/src` -> `rc=1`): a watchdog for a
    pipe dying in silence, itself dead in silence. This drives the exact failure it exists for
    — a provider that answers `200 []` and names no symbol at all — and requires the verdict to
    reach `md.ingest_run.notes`, which is the half that survives log rotation.

    ⛔ AND THE FIRST CYCLE MUST NOT BE ACCUSED. `MIN_CYCLES_FOR_A_VERDICT = 2`: two points do
    not establish a cadence, so a collector that has merely just started is `NOT_JUDGED` and
    says nothing about liveness. A detector that fired on cycle one would be unusable at boot.
    """
    runs, _, _ = _drive(
        answers=[LiquidationFetch(status=200, body=b"[]")],
        sink=_FakeSink(),
        cycles=2,
        interval_s=_FAST_CADENCE_S,
    )
    first, second = runs
    assert first.notes is not None
    assert "liveness" not in first.notes, (
        f"cycle 1 of 2 was judged with no cadence to judge against: {first.notes}"
    )
    assert second.notes is not None
    assert "liveness SILENT" in second.notes, (
        f"two cycles that covered nothing were not called SILENT: {second.notes}"
    )
    assert second.verdict == "ACCEPTED_WITH_WARNING"


def test_a_beating_pipe_is_not_accused_and_the_run_stays_accepted_with_no_liveness_note() -> None:
    """THE CALA HALF, and it is the half that makes the morde half worth anything.

    A detector that named every cycle would be a detector nobody reads. Both cycles here are
    answered, their requested windows overlap by construction (`DEFAULT_LOOKBACK_SECONDS` is
    three hours and the cadence is minutes), so the coverage has no hole and the verdict is
    `ALIVE` — which this asserts by its ABSENCE from `notes`, leaving the run `ACCEPTED`.
    """
    body = _body("BTCUSDT", [{"t": _SETTLED_START, "l": 231.85, "s": 1468.84}])
    runs, gaps, exit_code = _drive(
        answers=[LiquidationFetch(status=200, body=body)],
        sink=_FakeSink(),
        cycles=2,
        interval_s=_FAST_CADENCE_S,
    )
    assert [run.verdict for run in runs] == ["ACCEPTED", "ACCEPTED"]
    assert [run.notes for run in runs] == [None, None]
    assert gaps == []
    assert exit_code == [0]


# ── `RS-3.5`: THE CONFIGURED CADENCE IS THE PERIOD, NOT THE CADENCE PLUS THE CYCLE ─────────


def test_the_wait_between_cycles_discounts_the_time_the_cycle_already_spent() -> None:
    """The period was `1,75x`-`1,90x` the configured cadence, and the excess was not free.

    `assess_liquidation_liveness` is handed `cadence_ms` from the SAME configured number this
    loop waits on. A collector whose real period is `1,9x` its declared cadence is therefore
    only `1,58` real cycles from `stale_after_ms = 3 x cadence_ms` while being perfectly
    healthy — the detector right about the arithmetic and wrong about the pipe. Discounting
    what the cycle spent is what keeps the two numbers the same number.

    The instrument is the timeout ASKED FOR, not elapsed wall clock: with the flag already set
    the wait returns instantly either way, so a test that timed it would pass against both the
    defect and the fix.
    """
    interval_s = 0.5
    cost_s = 0.05
    stop = _RecordingStopEvent()
    body = _body("BTCUSDT", [{"t": _SETTLED_START, "l": 1, "s": 0}])
    runs, _, _ = _drive(
        answers=[],
        sink=_FakeSink(),
        interval_s=interval_s,
        stop=stop,
        source=_SlowSource([LiquidationFetch(status=200, body=body)], cost_seconds=cost_s),
    )
    assert len(runs) == 1
    (final_wait,) = [waited for waited in stop.waited if waited is not None]
    assert final_wait < interval_s, (
        f"the loop waited {final_wait} s on top of a cycle that had already spent "
        f"{cost_s} s of the {interval_s} s cadence — the real period is longer than the "
        f"configured one, which is the RS-3.5 divergence"
    )
    assert final_wait <= interval_s - cost_s
