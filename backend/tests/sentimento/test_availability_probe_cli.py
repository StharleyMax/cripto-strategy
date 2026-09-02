"""`infra/availability_probe_cli.py` wired offline: fake transport and clock, real domain logic.

Same split `test_ntp_skew_probe_cli.py` and `test_quota_ramp_climb.py` use: the composition root
(`main`) is exercised only for parsing; the actual sweep runs through `run()` with injected ports.
"""

from __future__ import annotations

import json
import logging

import pytest

from src.modules.sentimento.domain.availability_poll import AvailabilityPollOutcome
from src.modules.sentimento.domain.availability_probe_set import (
    AvailabilityProbeSet,
    BinanceFuturesDataEndpoint,
)
from src.modules.sentimento.domain.coinalyze_daily_series import SeriesKind
from src.modules.sentimento.infra import availability_probe_cli

_PROBE_SET = AvailabilityProbeSet(
    symbols=("BTCUSDT",),
    binance_period_seconds=10.0,
    coinalyze_period_seconds=30.0,
    binance_endpoints=(BinanceFuturesDataEndpoint.OPEN_INTEREST_HIST,),
    coinalyze_endpoints=(SeriesKind.OPEN_INTEREST,),
)


class ScriptedProbeClock:
    """Advances only when asked to `sleep`, and never waits a real second."""

    def __init__(self) -> None:
        """Start both readings at zero."""
        self._monotonic = 0.0

    def monotonic(self) -> float:
        """Return the fake monotonic reading."""
        return self._monotonic

    def now_ms(self) -> int:
        """Return the fake wall clock, derived from the same monotonic counter."""
        return int(self._monotonic * 1000)

    def sleep(self, seconds: float) -> None:
        """Advance the clock by `seconds`, without waiting."""
        self._monotonic += seconds


class ScriptedTransport:
    """Returns event times from a queue per source, looping on the last value once exhausted."""

    def __init__(self, binance_event_times_ms: list[int]) -> None:
        """Take the sequence of Binance `event_time`s to hand back, oldest first."""
        self._binance_event_times = list(binance_event_times_ms)

    def poll_binance(
        self, endpoint: BinanceFuturesDataEndpoint, symbol: str
    ) -> AvailabilityPollOutcome:
        """Return the next scripted Binance `event_time`, repeating the last once exhausted."""
        value = (
            self._binance_event_times.pop(0)
            if len(self._binance_event_times) > 1
            else (self._binance_event_times[0])
        )
        return AvailabilityPollOutcome(status=200, latest_event_time_ms=value)

    def poll_coinalyze(self, kind: SeriesKind, symbol: str) -> AvailabilityPollOutcome:
        """Return a `200` with nothing to read yet — Coinalyze is not this test's focus."""
        return AvailabilityPollOutcome(status=200)


def test_build_parser_requires_duration_seconds() -> None:
    """A run with no declared window measures nothing and is refused at parse time."""
    with pytest.raises(SystemExit):
        availability_probe_cli.build_parser().parse_args([])


def test_build_parser_defaults_observer_region_to_unknown() -> None:
    """`T-03.9` (VPS/`observer_region`) is out of scope — the default names that explicitly."""
    args = availability_probe_cli.build_parser().parse_args(["--duration-seconds", "10"])

    assert args.observer_region == "unknown"


def test_run_emits_a_header_every_attempt_line_and_a_summary_row(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """`D3.4`: every polled line has to appear, not a sample of them."""
    transport = ScriptedTransport(binance_event_times_ms=[0, 5_000])
    clock = ScriptedProbeClock()
    availability_probe_cli.logger.propagate = True

    with caplog.at_level(logging.INFO, logger=availability_probe_cli.logger.name):
        footer = availability_probe_cli.run(
            _PROBE_SET, transport, clock, duration_seconds=11.0, observer_region="unknown"
        )

    lines = [json.loads(message) for message in caplog.messages]
    assert lines[0]["line"] == "header"
    assert lines[0]["symbols"] == ["BTCUSDT"]
    attempt_lines = [line for line in lines if line["line"] == "attempt"]
    summary_lines = [line for line in lines if line["line"] == "summary"]
    footer_line = [line for line in lines if line["line"] == "footer"][0]

    assert footer_line == {**footer, "line": "footer"}
    assert len(attempt_lines) == footer["n_attempts"]
    assert len(summary_lines) == footer["n_summary_rows"]
    n_samples = footer["n_samples"]
    assert isinstance(n_samples, int)
    assert n_samples >= 1  # the scripted transition (0 -> 5_000) must be classified


def test_run_summary_rows_carry_p99_n_and_resolution_as_columns(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """`D3.2`: `lag_stat`/`lag_n`/`lag_resolution_s`/`lag_window_s` are columns, not a footnote."""
    transport = ScriptedTransport(binance_event_times_ms=[0, 5_000])
    clock = ScriptedProbeClock()
    availability_probe_cli.logger.propagate = True

    with caplog.at_level(logging.INFO, logger=availability_probe_cli.logger.name):
        availability_probe_cli.run(
            _PROBE_SET, transport, clock, duration_seconds=11.0, observer_region="unknown"
        )

    summary_lines = [
        json.loads(message)
        for message in caplog.messages
        if json.loads(message)["line"] == "summary"
    ]
    binance_endpoint = BinanceFuturesDataEndpoint.OPEN_INTEREST_HIST.value
    binance_row = next(row for row in summary_lines if row["endpoint"] == binance_endpoint)
    assert binance_row["lag_stat"] == "p99"
    assert binance_row["lag_n"] >= 1
    assert binance_row["lag_resolution_s"] == 10.0
    assert "observed_ratio" in binance_row
