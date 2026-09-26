"""`T-03.4`: the seventh collector thread — grid-aligned calls at `T - 5 s`, one run per cycle.

Every test drives the REAL `collectors_cli._run_open_interest_poll_collector` with a scripted
client, a recording sink and a FAKE CLOCK: the `stop_event` handed to the loop advances that
clock by whatever the ticker asks it to wait, instead of sleeping. So the suite proves the
schedule (when each call goes out, how many a minute) by reading instants, never by waiting —
`backend/scripts/test.sh` forbids network, and a test that measured cadence by really sleeping
minutes would be slow, flaky, and green for the wrong reason (`grid_aligned_ticker.py`).
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable

import pytest

from src.modules.sentimento.domain.ingest_record import IngestRun
from src.modules.sentimento.domain.open_interest_grid_stamp import OPEN_INTEREST_GRID_MS
from src.modules.sentimento.domain.open_interest_snapshot import (
    OpenInterestFetch,
    OpenInterestFetchOutcome,
    OpenInterestSnapshot,
)
from src.modules.sentimento.domain.provenance import SeriesRow
from src.modules.sentimento.infra import collectors_cli
from src.modules.sentimento.infra.collectors_cli import (
    CollectorBootConfigurationError,
    _run_open_interest_poll_collector,
    resolve_boot_config,
)
from src.modules.sentimento.use_cases.collector_run_mapping import (
    N_WRITTEN_BEFORE_THE_WRITER_ACCOUNTS,
    OPEN_INTEREST_POLL_ENDPOINT,
)
from src.modules.sentimento.use_cases.collector_series_mapping import (
    build_open_interest_poll_to_rows,
)

_SYMBOLS = ("BTCUSDT", "ETHUSDT", "LINKUSDT", "SOLUSDT")
# An arbitrary boot instant, 17,25 s into a minute: the first call must still wait for `:55`.
# Quarter seconds on purpose: every instant the loop computes is then EXACT in binary floating
# point, so `int(now * 1000)` in the collector and the fake's own record never disagree by 1 ms.
_BOOT_S = 1_790_287_817.25
_ROUND_TRIP_S = 0.25
# The median lag of `time` behind the send, `[MEDIDO 2026-09-25, n=4.546]` (`Q-STAMP-1` §2).
_LAG_MS = 4_590


class _FakeClock:
    """A wall clock that only moves when told to."""

    def __init__(self, now_s: float) -> None:
        """Start at `now_s` (epoch seconds)."""
        self.now_s = now_s

    def __call__(self) -> float:
        """Answer the current fake instant."""
        return self.now_s


class _ClockDrivenStop(threading.Event):
    """A `stop_event` whose `wait(timeout)` ADVANCES the fake clock instead of sleeping.

    `GridAlignedTicker.wait` hands its computed sleep to `stop_event.wait`; advancing the clock
    by exactly that amount puts the loop at the ticker's target instant, which is the only
    instant a real sleep would have reached.
    """

    def __init__(self, clock: _FakeClock) -> None:
        """Bind the clock this event moves."""
        super().__init__()
        self._clock = clock

    def wait(self, timeout: float | None = None) -> bool:
        """Advance the clock by `timeout` seconds, then answer whether stop was requested."""
        if timeout is not None and not self.is_set():
            self._clock.now_s += timeout
        return self.is_set()


class _ScriptedPollClient:
    """Answers each call from `answer(symbol, sent_at_ms)`, recording when each call went out."""

    def __init__(
        self,
        clock: _FakeClock,
        answer: Callable[[str, int], OpenInterestFetch] | None = None,
    ) -> None:
        """Bind the clock and the answering rule; the default reads with the median lag."""
        self._clock = clock
        self._answer = answer or _read_with_median_lag
        self.calls: list[tuple[str, int]] = []
        self.closed = False

    def fetch(self, symbol: str) -> OpenInterestFetch:
        """Record the send instant, answer, and spend a round trip on the fake clock."""
        sent_at_ms = round(self._clock() * 1000)
        self.calls.append((symbol, sent_at_ms))
        self._clock.now_s += _ROUND_TRIP_S
        return self._answer(symbol, sent_at_ms)

    def close(self) -> None:
        """Remember that the thread closed its client."""
        self.closed = True


def _read(symbol: str, event_time_ms: int, weight: int = 1) -> OpenInterestFetch:
    """One `READ` outcome at `event_time_ms`."""
    return OpenInterestFetch(
        symbol=symbol,
        outcome=OpenInterestFetchOutcome.READ,
        status=200,
        weight_used=weight,
        snapshot=OpenInterestSnapshot(
            symbol=symbol, open_interest_raw="96012.544", event_time_ms=event_time_ms
        ),
        failure=None,
    )


def _read_with_median_lag(symbol: str, sent_at_ms: int) -> OpenInterestFetch:
    """Answer a reading whose `time` is the measured median lag behind the send."""
    return _read(symbol, sent_at_ms - _LAG_MS)


def _transport_failure(symbol: str) -> OpenInterestFetch:
    """Answer the outcome of a call that never reached Binance."""
    return OpenInterestFetch(
        symbol=symbol,
        outcome=OpenInterestFetchOutcome.TRANSPORT,
        status=None,
        weight_used=None,
        snapshot=None,
        failure="OSError: connection reset",
    )


class _RecordingSink:
    """Stand-in for `RedisStreamSeriesSink`: records each row with the `run_id` it carried."""

    def __init__(self) -> None:
        """Start with nothing accepted."""
        self.published: list[tuple[SeriesRow, str | None]] = []

    def accept(self, row: SeriesRow, *, run_id: str | None = None) -> None:
        """Record one publication."""
        self.published.append((row, run_id))


class _FailingSink:
    """A sink whose every publication dies the way a reset Redis connection does."""

    def accept(self, row: SeriesRow, *, run_id: str | None = None) -> None:
        """Raise a transport failure."""
        raise OSError("connection reset by peer")


def _run_cycles(
    cycles: int,
    *,
    answer: Callable[[str, int], OpenInterestFetch] | None = None,
    sink: _RecordingSink | _FailingSink | None = None,
    interval_s: float = 60.0,
) -> tuple[list[IngestRun], _ScriptedPollClient, _RecordingSink | _FailingSink, list[int]]:
    """Drive the loop for `cycles` cycles on the fake clock, stopping inside `record_run`."""
    clock = _FakeClock(_BOOT_S)
    stop = _ClockDrivenStop(clock)
    client = _ScriptedPollClient(clock, answer)
    sink_ = sink if sink is not None else _RecordingSink()
    runs: list[IngestRun] = []
    exit_code = [0]

    def _record(run: IngestRun) -> None:
        runs.append(run)
        if len(runs) >= cycles:
            stop.set()

    _run_open_interest_poll_collector(
        stop_event=stop,
        failure_event=threading.Event(),
        exit_code=exit_code,
        client_factory=lambda: client,
        sink=sink_,  # type: ignore[arg-type]
        to_rows=build_open_interest_poll_to_rows(),
        record_run=_record,
        symbols=_SYMBOLS,
        interval_s=interval_s,
        wall_clock_s=clock,
    )
    return runs, client, sink_, exit_code


# ── THE SCHEDULE: `T - 5 s`, ON THE WALL-CLOCK GRID ───────────────────────────────────────


def test_every_call_goes_out_five_seconds_before_a_minute() -> None:
    """Each cycle's FIRST call is sent at second `:55` of a minute, cycle after cycle.

    `[Q-STAMP-1]` §3 fixes `d = 5 s`. Morde: set the phase to `interval_s` minus zero (call AT
    `T`) and the sends land on `:00`; the fresh-side margin is then gone, and every stalled send
    (`Q-STAMP-1` §2, `L < 0`) becomes an absent minute. The assertion reads the send instants.
    """
    runs, client, _sink, _code = _run_cycles(5)

    assert len(runs) == 5
    first_sends = [sent for index, (_s, sent) in enumerate(client.calls) if index % 4 == 0]
    assert [sent % OPEN_INTEREST_GRID_MS for sent in first_sends] == [55_000] * 5
    # consecutive cycles are exactly one minute apart: no drift from the work's own latency
    assert {b - a for a, b in zip(first_sends, first_sends[1:], strict=False)} == {60_000}


def test_the_first_call_waits_for_the_grid_instead_of_firing_at_boot() -> None:
    """No boot pass: booted at `:17,3`, the first call is at the SAME minute's `:55`, not `:17`."""
    _runs, client, _sink, _code = _run_cycles(1)

    first_send_ms = client.calls[0][1]
    boot_ms = round(_BOOT_S * 1000)
    assert first_send_ms > boot_ms
    assert first_send_ms == (boot_ms // OPEN_INTEREST_GRID_MS) * OPEN_INTEREST_GRID_MS + 55_000


def test_the_collector_share_of_the_weight_stays_at_four_calls_per_minute() -> None:
    """`DoD-2` of `03a`: over five cycles, no rolling minute holds more than 4 calls.

    Morde: remove the aligned wait (the `ticker.wait(stop_event)` line) and the fake clock only
    advances by round trips, so all 20 calls fall inside ~6 s — the count per minute reaches 20.
    """
    _runs, client, _sink, _code = _run_cycles(5)

    sends = sorted(sent for _symbol, sent in client.calls)
    assert len(sends) == 20
    busiest_minute = max(
        sum(1 for other in sends if start <= other < start + 60_000) for start in sends
    )
    assert busiest_minute == 4


def test_a_cadence_of_two_minutes_still_calls_five_seconds_before_a_minute() -> None:
    """The phase is `interval - lead`, so any whole-minute cadence keeps the `T - 5 s` contract."""
    _runs, client, _sink, _code = _run_cycles(3, interval_s=120.0)

    first_sends = [sent for index, (_s, sent) in enumerate(client.calls) if index % 4 == 0]
    assert [sent % OPEN_INTEREST_GRID_MS for sent in first_sends] == [55_000] * 3
    assert {b - a for a, b in zip(first_sends, first_sends[1:], strict=False)} == {120_000}


# ── WHAT IS WRITTEN, AND UNDER WHICH RUN ──────────────────────────────────────────────────


def test_each_cycle_writes_one_row_per_symbol_on_the_next_minute_under_its_own_run() -> None:
    """Four rows per cycle, stamped on the minute after `:55`, each carrying its cycle's `run_id`.

    The `run_id` on the row is what lets the single writer credit `n_written` back onto the run
    (`ADR-035/D2`) — the per-cycle `n_written` of the task. Morde: publish without `run_id=`
    and every cycle's run stays at `n_written = 0` forever, with rows in `md.series`.
    """
    runs, client, sink, _code = _run_cycles(3)
    assert isinstance(sink, _RecordingSink)

    assert len(sink.published) == 12
    for cycle, run in enumerate(runs):
        rows = sink.published[cycle * 4 : cycle * 4 + 4]
        assert {run_id for _row, run_id in rows} == {run.run_id}
        expected_t = client.calls[cycle * 4][1] + 5_000
        assert {row.bucket_end for row, _ in rows} == {expected_t}
        assert sorted(row.symbol for row, _ in rows) == sorted(_SYMBOLS)
    assert len({run.run_id for run in runs}) == 3


def test_the_row_is_stamped_by_the_response_time_not_by_the_scheduler() -> None:
    """`event_time` is each response's `time`; staleness sits in `[0, 20 s]` on every row."""
    _runs, client, sink, _code = _run_cycles(2)
    assert isinstance(sink, _RecordingSink)

    sends = dict(zip(range(len(client.calls)), (sent for _s, sent in client.calls), strict=True))
    for index, (row, _run_id) in enumerate(sink.published):
        assert row.event_time == sends[index] - _LAG_MS
        assert 0 <= row.bucket_end - row.event_time <= 20_000


def test_the_run_of_a_clean_cycle_is_accepted_and_leaves_n_written_to_the_writer() -> None:
    """All four admitted ⇒ `ACCEPTED`, `n_expected = n_returned = 4`, `n_written` open."""
    runs, _client, _sink, _code = _run_cycles(1)

    (run,) = runs
    assert run.endpoint == OPEN_INTEREST_POLL_ENDPOINT
    assert run.verdict == "ACCEPTED"
    assert (run.n_expected, run.n_returned) == (4, 4)
    assert run.n_written == N_WRITTEN_BEFORE_THE_WRITER_ACCOUNTS
    assert run.weight_used == 1
    assert run.notes is None


def test_a_failed_call_leaves_the_minute_absent_and_warns_the_run() -> None:
    """Cycle 2 fails for `BTCUSDT`: no BTC row at that `T`, and last minute's value is NOT copied.

    `DoD-1`/`DoD-4` of `03a` in miniature: "absent is not carried". Morde: on a failed call,
    republish the symbol's previous row with the new `T` and a BTC row appears at `T2`.
    """
    call_count = {"n": 0}

    def _answer(symbol: str, sent_at_ms: int) -> OpenInterestFetch:
        call_count["n"] += 1
        if symbol == "BTCUSDT" and call_count["n"] > len(_SYMBOLS):
            return _transport_failure(symbol)
        return _read_with_median_lag(symbol, sent_at_ms)

    runs, client, sink, _code = _run_cycles(2, answer=_answer)
    assert isinstance(sink, _RecordingSink)

    second_t = client.calls[4][1] + 5_000
    btc_minutes = [row.bucket_end for row, _ in sink.published if row.symbol == "BTCUSDT"]
    assert second_t not in btc_minutes
    assert len(btc_minutes) == 1
    assert runs[1].verdict == "ACCEPTED_WITH_WARNING"
    assert runs[1].notes == "BTCUSDT: not_read (OSError: connection reset)"
    assert (runs[1].n_expected, runs[1].n_returned) == (4, 3)


def test_a_reading_already_written_is_not_written_twice_by_the_next_cycle() -> None:
    """A source that keeps serving the SAME snapshot does not produce a second row for one `T`.

    The second cycle's readings are stamped on the first cycle's minute (their `time` did not
    move), so they are `behind_watermark` and the run says so.
    """
    frozen: dict[str, int] = {}

    def _answer(symbol: str, sent_at_ms: int) -> OpenInterestFetch:
        frozen.setdefault(symbol, sent_at_ms - _LAG_MS)
        return _read(symbol, frozen[symbol])

    runs, _client, sink, _code = _run_cycles(2, answer=_answer)
    assert isinstance(sink, _RecordingSink)

    assert len(sink.published) == 4
    assert runs[1].verdict == "ACCEPTED_WITH_WARNING"
    assert runs[1].notes is not None
    assert runs[1].notes.count("behind_watermark") == 4


def test_one_log_line_per_call_carries_lag_staleness_and_fate(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """`Q-STAMP-1` §3 item 3: every call is logged with `lag_ms`, `staleness_ms` and its fate."""
    with caplog.at_level(logging.INFO, logger=collectors_cli.logger.name):
        runs, _client, _sink, _code = _run_cycles(1)

    lines = [record for record in caplog.records if record.msg == "open_interest_poll_call"]
    assert len(lines) == 4
    for record in lines:
        assert record.fate == "admitted"  # type: ignore[attr-defined]
        assert record.lag_ms == _LAG_MS  # type: ignore[attr-defined]
        staleness = record.grid_instant_ms - record.event_time_ms  # type: ignore[attr-defined]
        assert record.staleness_ms == staleness  # type: ignore[attr-defined]
        assert 0 <= staleness <= 20_000
        assert record.run_id == runs[0].run_id  # type: ignore[attr-defined]
    cycle = [record for record in caplog.records if record.msg == "collector_cycle_completed"]
    assert cycle[-1].n_calls == 4  # type: ignore[attr-defined]
    assert cycle[-1].n_published == 4  # type: ignore[attr-defined]


def test_a_publish_failure_rejects_the_cycle_and_takes_the_process_down() -> None:
    """`SPEC-004` §3.1: a dead Redis closes the cycle `REJECTED` with a reason, `exit_code = 1`."""
    runs, client, _sink, exit_code = _run_cycles(1, sink=_FailingSink())

    (run,) = runs
    assert run.verdict == "REJECTED"
    assert run.notes == "OSError: connection reset by peer"
    assert exit_code == [1]
    assert client.closed


def test_the_thread_closes_its_client_when_it_stops() -> None:
    """The keep-alive connection is closed on the way out, whatever ended the loop."""
    _runs, client, _sink, _code = _run_cycles(1)

    assert client.closed


# ── THE CADENCE IS CONFIGURATION, REFUSED AT BOOT WHEN IT WOULD SILENTLY WASTE CALLS ──────


def test_the_cadence_defaults_to_one_minute() -> None:
    """Unset ⇒ 60 s, `[Q-CAD-1]`."""
    assert resolve_boot_config({}).open_interest_poll_cycle_interval_s == 60.0


def test_a_whole_multiple_of_the_minute_is_accepted() -> None:
    """`120` keeps every call at `T - 5 s` of some minute."""
    config = resolve_boot_config({"OPEN_INTEREST_POLL_CYCLE_INTERVAL_S": "120"})

    assert config.open_interest_poll_cycle_interval_s == 120.0


@pytest.mark.parametrize("raw", ["30", "90", "60.5", "0", "-60", "nan", "inf", "sixty"])
def test_a_cadence_off_the_minute_grid_or_not_positive_is_refused_naming_the_variable(
    raw: str,
) -> None:
    """`30` would send every other call at `T + 25 s`, always out of window; it fails at boot."""
    with pytest.raises(CollectorBootConfigurationError) as refused:
        resolve_boot_config({"OPEN_INTEREST_POLL_CYCLE_INTERVAL_S": raw})

    assert refused.value.variable == "OPEN_INTEREST_POLL_CYCLE_INTERVAL_S"
