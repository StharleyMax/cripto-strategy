"""The one-shot's orchestration, offline: a scripted source, a recording clock, a fake sink.

Same shape as `use_cases/run_quota_ramp.py`'s own tests: nothing here opens a socket or sleeps
for real — `ScriptedSource` and `RecordingSleepClock` replay canned responses and record pauses.
"""

from __future__ import annotations

import json

from src.modules.sentimento.domain.local_quota_broker import LocalQuotaBroker
from src.modules.sentimento.domain.quarantined_series_entry import QuarantinedSeriesEntry
from src.modules.sentimento.infra.coinalyze_history_client import CoinalizeHistoryResponse
from src.modules.sentimento.use_cases.capture_coinalyze_daily_series import (
    SERIES_KINDS,
    capture_one_shot,
)

_BROKER = LocalQuotaBroker(calls_per_window=40, window_seconds=60.0)


def _ok(history: list[dict[str, object]]) -> CoinalizeHistoryResponse:
    """Build a successful response carrying one symbol's history."""
    body = json.dumps([{"symbol": "x", "history": history}]).encode("utf-8")
    return CoinalizeHistoryResponse(status=200, body=body)


def _points(n: int, start: int = 1_600_000_000) -> list[dict[str, object]]:
    """Build `n` minimal daily points, one per day, starting at `start`."""
    return [{"t": start + day * 86_400} for day in range(n)]


class ScriptedSource:
    """Replays a fixed script of responses, one per `fetch()` call, in order."""

    def __init__(self, script: list[CoinalizeHistoryResponse]) -> None:
        """Take the responses to hand out, in order."""
        self._script = list(script)
        self.paths: list[str] = []

    def fetch(self, path: str) -> CoinalizeHistoryResponse:
        """Return the next scripted response, recording the path it was called with."""
        self.paths.append(path)
        if not self._script:
            raise AssertionError(
                f"pediu a chamada {len(self.paths)} e o roteiro tem {len(self.paths) - 1}"
            )
        return self._script.pop(0)


class RecordingSleepClock:
    """Records every pause instead of sleeping — makes pacing assertable without real time."""

    def __init__(self) -> None:
        """Start with an empty log of pauses."""
        self.slept: list[float] = []

    def sleep(self, seconds: float) -> None:
        """Record the pause without waiting."""
        self.slept.append(seconds)


class RecordingSink:
    """Records every entry passed to `record()`, in order — no SQLite, no disk."""

    def __init__(self) -> None:
        """Start with an empty log of recorded entries."""
        self.recorded: list[QuarantinedSeriesEntry] = []

    def record(self, entry: QuarantinedSeriesEntry) -> None:
        """Append `entry` to the log."""
        self.recorded.append(entry)


def test_one_symbol_sweeps_both_series_in_the_declared_order() -> None:
    """`SERIES_KINDS` fixes OI before liquidation, per symbol — this asserts the call order."""
    source = ScriptedSource([_ok(_points(2500)), _ok(_points(730, start=1_724_600_000))])
    sink = RecordingSink()

    outcomes = capture_one_shot(
        ["BTCUSDT"],
        _BROKER,
        source,
        RecordingSleepClock(),
        sink,
        run_id="r1",
        received_at="2026-09-01T00:00:00Z",
        from_epoch_seconds=0,
        to_epoch_seconds=2_000_000_000,
    )

    assert [outcome.series_kind for outcome in outcomes] == list(SERIES_KINDS)
    assert "open-interest-history" in source.paths[0]
    assert "liquidation-history" in source.paths[1]
    assert len(sink.recorded) == 2


def test_every_stored_entry_is_born_quarantined() -> None:
    """The falsifier this use case must never fail: `available_at` is `None` on every write."""
    source = ScriptedSource([_ok(_points(2500)), _ok(_points(730))])
    sink = RecordingSink()

    capture_one_shot(
        ["BTCUSDT"],
        _BROKER,
        source,
        RecordingSleepClock(),
        sink,
        run_id="r1",
        received_at="2026-09-01T00:00:00Z",
        from_epoch_seconds=0,
        to_epoch_seconds=2_000_000_000,
    )

    assert all(entry.available_at is None for entry in sink.recorded)
    assert all(entry.quarantine.is_quarantined for entry in sink.recorded)


def test_the_requirement_verdict_travels_with_the_stored_entry() -> None:
    """A symbol with too few points is still stored (grava cru), with `met=False` attached."""
    source = ScriptedSource([_ok(_points(3)), _ok(_points(2))])
    sink = RecordingSink()

    outcomes = capture_one_shot(
        ["ALTUSDT"],
        _BROKER,
        source,
        RecordingSleepClock(),
        sink,
        run_id="r1",
        received_at="2026-09-01T00:00:00Z",
        from_epoch_seconds=0,
        to_epoch_seconds=2_000_000_000,
    )

    assert outcomes[0].requirement_met is False
    assert outcomes[0].stored is True
    assert sink.recorded[0].requirement_verdict.met is False


def test_a_non_2xx_status_is_recorded_as_an_outcome_and_nothing_is_stored() -> None:
    """One bad symbol must not raise and must not lose the rest of the sweep."""
    source = ScriptedSource(
        [CoinalizeHistoryResponse(status=404, body=b"not found"), _ok(_points(730))]
    )
    sink = RecordingSink()

    outcomes = capture_one_shot(
        ["DELISTEDUSDT"],
        _BROKER,
        source,
        RecordingSleepClock(),
        sink,
        run_id="r1",
        received_at="2026-09-01T00:00:00Z",
        from_epoch_seconds=0,
        to_epoch_seconds=2_000_000_000,
    )

    assert outcomes[0].stored is False
    assert outcomes[0].status == 404
    assert len(sink.recorded) == 1  # only the liquidation call, which succeeded


def test_a_transport_failure_is_recorded_and_the_sweep_continues() -> None:
    """A dead connection for one call must not abort the remaining calls."""
    source = ScriptedSource(
        [
            CoinalizeHistoryResponse(transport_error="ConnectionResetError: reset"),
            _ok(_points(730)),
        ]
    )
    sink = RecordingSink()

    outcomes = capture_one_shot(
        ["BTCUSDT"],
        _BROKER,
        source,
        RecordingSleepClock(),
        sink,
        run_id="r1",
        received_at="2026-09-01T00:00:00Z",
        from_epoch_seconds=0,
        to_epoch_seconds=2_000_000_000,
    )

    assert outcomes[0].status is None
    assert outcomes[0].transport_error == "ConnectionResetError: reset"
    assert outcomes[1].stored is True


def test_a_malformed_body_is_recorded_as_an_outcome_and_nothing_is_stored() -> None:
    """A schema break on one symbol is data about that symbol, per `SPEC-001` §5.6's argument."""
    source = ScriptedSource(
        [CoinalizeHistoryResponse(status=200, body=b"not json"), _ok(_points(730))]
    )
    sink = RecordingSink()

    outcomes = capture_one_shot(
        ["BTCUSDT"],
        _BROKER,
        source,
        RecordingSleepClock(),
        sink,
        run_id="r1",
        received_at="2026-09-01T00:00:00Z",
        from_epoch_seconds=0,
        to_epoch_seconds=2_000_000_000,
    )

    assert outcomes[0].stored is False
    assert outcomes[0].status == 200
    assert outcomes[0].transport_error is not None


def test_the_sweep_paces_every_call_and_pauses_n_minus_one_times() -> None:
    """2 symbols x 2 series = 4 calls, and pacing must fire between EVERY pair — 3 pauses."""
    source = ScriptedSource([_ok([]) for _ in range(4)])
    clock = RecordingSleepClock()

    capture_one_shot(
        ["BTCUSDT", "ETHUSDT"],
        _BROKER,
        source,
        clock,
        RecordingSink(),
        run_id="r1",
        received_at="2026-09-01T00:00:00Z",
        from_epoch_seconds=0,
        to_epoch_seconds=2_000_000_000,
    )

    assert clock.slept == [1.5, 1.5, 1.5]


def test_the_sweep_does_not_pause_after_the_very_last_call() -> None:
    """One symbol, 2 calls (OI + liquidation), exactly ONE pause — never one after the last call.

    A mutant that dropped the `index < len(plan)` guard would pause after every call including
    the final one, turning this `1` into `2`.
    """
    clock = RecordingSleepClock()

    capture_one_shot(
        ["BTCUSDT"],
        _BROKER,
        ScriptedSource([_ok([]), _ok([])]),
        clock,
        RecordingSink(),
        run_id="r1",
        received_at="2026-09-01T00:00:00Z",
        from_epoch_seconds=0,
        to_epoch_seconds=2_000_000_000,
    )

    assert clock.slept == [1.5]


def test_binance_symbol_is_translated_before_the_path_is_built() -> None:
    """The path carries the Coinalyze namespace, never the bare Binance symbol."""
    source = ScriptedSource([_ok([]), _ok([])])

    capture_one_shot(
        ["BTCUSDT"],
        _BROKER,
        source,
        RecordingSleepClock(),
        RecordingSink(),
        run_id="r1",
        received_at="2026-09-01T00:00:00Z",
        from_epoch_seconds=0,
        to_epoch_seconds=2_000_000_000,
    )

    assert all("BTCUSDT_PERP.A" in path for path in source.paths)


def test_zero_symbols_makes_zero_calls_and_zero_pauses() -> None:
    """An empty symbol list is a legal (if useless) sweep — not a crash."""
    outcomes = capture_one_shot(
        [],
        _BROKER,
        ScriptedSource([]),
        RecordingSleepClock(),
        RecordingSink(),
        run_id="r1",
        received_at="2026-09-01T00:00:00Z",
        from_epoch_seconds=0,
        to_epoch_seconds=2_000_000_000,
    )

    assert outcomes == ()
