"""The bench wired end to end offline: fake transport, fake clock, fake sink, real `dispatch`."""

from __future__ import annotations

import json
import logging
from collections.abc import Mapping
from pathlib import Path

import pytest

from src.modules.sentimento.domain.coinalyze_daily_series import SeriesKind
from src.modules.sentimento.domain.quarantined_series_entry import QuarantinedSeriesEntry
from src.modules.sentimento.infra import coinalyze_one_shot_cli
from src.modules.sentimento.infra.coinalyze_history_client import CoinalizeHistoryResponse


def _ok(n_points: int) -> CoinalizeHistoryResponse:
    """Build a successful response with `n_points` daily points starting 2020-01-01.

    Starting in 2020 means `n_points >= 2400` also satisfies the OI depth floor
    (`<= 2020-01-21`), so a single helper serves both series' requirement checks.
    """
    start = 1_577_836_800  # 2020-01-01T00:00:00Z
    history = [{"t": start + day * 86_400} for day in range(n_points)]
    body = json.dumps([{"symbol": "x", "history": history}]).encode("utf-8")
    return CoinalizeHistoryResponse(status=200, body=body)


class ScriptedSource:
    """Replays a fixed script of responses, one per `fetch()` call."""

    def __init__(self, script: list[CoinalizeHistoryResponse]) -> None:
        """Take the responses to hand out, in order."""
        self._script = list(script)

    def fetch(self, path: str) -> CoinalizeHistoryResponse:
        """Return the next scripted response."""
        return self._script.pop(0)


class NoopClock:
    """A clock that never actually sleeps — offline pacing, zero real seconds."""

    def sleep(self, seconds: float) -> None:
        """Do nothing."""


class RecordingSink:
    """Records every entry, standing in for the real SQLite store."""

    def __init__(self) -> None:
        """Start with an empty log."""
        self.recorded: list[QuarantinedSeriesEntry] = []

    def record(self, entry: QuarantinedSeriesEntry) -> None:
        """Append `entry` to the log."""
        self.recorded.append(entry)


def _capture_emitted(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Redirect `emit` to a list instead of the logger, returning that list."""
    lines: list[str] = []

    def capture(payload: Mapping[str, object]) -> str:
        line = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
        lines.append(line)
        return line

    monkeypatch.setattr(coinalyze_one_shot_cli, "emit", capture)
    return lines


def test_dispatch_run_emits_one_line_per_call_plus_a_summary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """2 symbols x 2 series = 4 report lines + 1 summary line."""
    lines = _capture_emitted(monkeypatch)
    source = ScriptedSource([_ok(2500), _ok(730), _ok(2500), _ok(730)])
    sink = RecordingSink()

    code = coinalyze_one_shot_cli.dispatch(
        ["run", "unused.sqlite3", "run-1", "2026-09-01T00:00:00Z", "0", "2000000000",
         "BTCUSDT", "ETHUSDT"],
        source,
        NoopClock(),
        lambda path: sink,
    )

    assert code == 0
    assert len(lines) == 5
    payloads = [json.loads(line) for line in lines]
    assert [p["command"] for p in payloads[:4]] == ["run"] * 4
    assert payloads[4]["command"] == "run_summary"
    assert payloads[4]["n_calls"] == 4
    assert payloads[4]["n_stored"] == 4
    assert payloads[4]["n_failed"] == 0
    assert payloads[4]["interval_seconds"] == 1.5


def test_dispatch_run_reports_requirement_met_per_call(monkeypatch: pytest.MonkeyPatch) -> None:
    """The line for each call carries whether `CA-F0-13`'s floor was met."""
    lines = _capture_emitted(monkeypatch)
    source = ScriptedSource([_ok(2500), _ok(730)])

    coinalyze_one_shot_cli.dispatch(
        ["run", "unused.sqlite3", "run-1", "2026-09-01T00:00:00Z", "0", "2000000000", "BTCUSDT"],
        source,
        NoopClock(),
        lambda path: RecordingSink(),
    )

    payloads = [json.loads(line) for line in lines]
    assert payloads[0]["requirement_met"] is True
    assert payloads[0]["series_kind"] == "open_interest"
    assert payloads[1]["requirement_met"] is True
    assert payloads[1]["series_kind"] == "liquidation"


def test_dispatch_refuses_a_command_it_does_not_declare() -> None:
    """An unknown verb, or too few arguments, prints the usage line instead of guessing."""
    for argv in ([], ["run"], ["run", "a", "b", "c", "d", "e"], ["nope", "a"]):
        with pytest.raises(SystemExit):
            coinalyze_one_shot_cli.dispatch(
                argv, ScriptedSource([]), NoopClock(), lambda path: RecordingSink()
            )


def test_dispatch_refuses_run_with_zero_symbols() -> None:
    """A run with no symbols would sweep nothing — refused rather than silently succeeding."""
    with pytest.raises(SystemExit):
        coinalyze_one_shot_cli.dispatch(
            ["run", "unused.sqlite3", "run-1", "2026-09-01T00:00:00Z", "0", "2000000000"],
            ScriptedSource([]),
            NoopClock(),
            lambda path: RecordingSink(),
        )


def test_the_sink_factory_receives_the_path_argument(tmp_path: Path) -> None:
    """The db path from `argv` reaches the sink factory unchanged."""
    seen: list[Path] = []

    def factory(path: Path) -> RecordingSink:
        seen.append(path)
        return RecordingSink()

    coinalyze_one_shot_cli.dispatch(
        ["run", str(tmp_path / "q.sqlite3"), "run-1", "2026-09-01T00:00:00Z", "0",
         "2000000000", "BTCUSDT"],
        ScriptedSource([_ok(0), _ok(0)]),
        NoopClock(),
        factory,
    )

    assert seen == [tmp_path / "q.sqlite3"]


def test_emit_writes_one_stable_line_and_returns_exactly_what_it_wrote(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """The bytes are the record: what the caller can hash IS what the logger emitted."""
    with caplog.at_level(logging.INFO, logger=coinalyze_one_shot_cli.logger.name):
        line = coinalyze_one_shot_cli.emit({"b": 2, "a": 1})

    assert line == '{"a": 1, "b": 2}'
    assert caplog.messages == [line]


def test_the_product_logger_is_never_the_same_logger_as_the_diagnostics_one() -> None:
    """Same measured defect `quota_ramp_cli.py` fixed: `__name__` under `-m` collapses loggers."""
    assert coinalyze_one_shot_cli.logger.name != coinalyze_one_shot_cli._APPLICATION_LOGGER
    assert coinalyze_one_shot_cli._APPLICATION_LOGGER == "src"
    assert coinalyze_one_shot_cli.logger.name.startswith(
        f"{coinalyze_one_shot_cli._APPLICATION_LOGGER}."
    )


def test_the_stream_wiring_keeps_diagnostics_off_the_product_stream() -> None:
    """A host that configured INFO on `stdout` must not contaminate the first JSON line."""
    application = logging.getLogger("src")
    before = list(application.handlers)
    propagate_before = application.propagate
    try:
        coinalyze_one_shot_cli.route_diagnostics_away_from_the_product_stream()
        assert application.propagate is False
        assert len(application.handlers) == len(before) + 1
    finally:
        application.handlers = before
        application.propagate = propagate_before


def test_main_wires_the_streams_and_refuses_an_unknown_command_offline() -> None:
    """`main` is reachable offline: the connection opens lazily, on the first real fetch."""
    application = logging.getLogger("src")
    handlers_before = list(application.handlers)
    propagate_before = application.propagate
    product_handlers_before = list(coinalyze_one_shot_cli.logger.handlers)
    product_propagate_before = coinalyze_one_shot_cli.logger.propagate
    try:
        with pytest.raises(SystemExit):
            coinalyze_one_shot_cli.main(["nao-existe"])
        assert application.propagate is False
        assert coinalyze_one_shot_cli.logger.propagate is False
    finally:
        application.handlers = handlers_before
        application.propagate = propagate_before
        coinalyze_one_shot_cli.logger.handlers = product_handlers_before
        coinalyze_one_shot_cli.logger.propagate = product_propagate_before


def test_the_real_sink_factory_initialises_the_store(tmp_path: Path) -> None:
    """The composition-root factory creates the schema before handing back the store."""
    path = tmp_path / "quarantine.sqlite3"

    store = coinalyze_one_shot_cli._real_sink_factory(path)

    assert path.exists()
    assert store.read_promoted(SeriesKind.OPEN_INTEREST, "BTCUSDT") == ()
