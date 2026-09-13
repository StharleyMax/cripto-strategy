"""`T-03.3`: the open-interest thread — a-priori paging, the window invariant, the watermark.

Every test here drives the REAL `collectors_cli._run_open_interest_collector` with a scripted
client and a recording sink; no socket is opened (`backend/scripts/test.sh`'s "ZERO REDE").
What the suite measures is the loop's arithmetic — WHICH windows it asks for, which points it
publishes, which it refuses to publish twice, and what the run record says afterwards — because
those are the quantities `SPEC-007` phase `03`'s `DoD-1`/`DoD-4` are read off.
"""

from __future__ import annotations

import threading

from src.modules.sentimento.domain.ingest_record import IngestRun
from src.modules.sentimento.domain.oi_history_paginator import (
    END_OF_HISTORY_API_CODE,
    ClosedWindow,
    OiHistoryPageResponse,
)
from src.modules.sentimento.domain.provenance import SeriesRow
from src.modules.sentimento.infra.collectors_cli import (
    _OPEN_INTEREST_PAGE_LIMIT,
    _OPEN_INTEREST_PERIOD,
    _open_interest_tail_span_ms,
    _run_open_interest_collector,
)
from src.modules.sentimento.use_cases.collector_run_mapping import (
    N_WRITTEN_BEFORE_THE_WRITER_ACCOUNTS,
    OPEN_INTEREST_HIST_ENDPOINT,
    OPEN_INTEREST_OBSERVER_ID,
    WEIGHT_NOT_READABLE,
)
from src.modules.sentimento.use_cases.collector_series_mapping import (
    OPEN_INTEREST_BUCKET_WIDTH_MS,
    build_open_interest_to_rows,
)

_SYMBOL = "BTCUSDT"


class _RecordingSink:
    """Stand-in for `RedisStreamSeriesSink`: records the row AND the `run_id` it carried."""

    def __init__(self) -> None:
        """Start with nothing accepted."""
        self.rows: list[SeriesRow] = []
        self.run_ids: list[str | None] = []

    def accept(self, row: SeriesRow, *, run_id: str | None = None) -> None:
        """Record one publication; never raises."""
        self.rows.append(row)
        self.run_ids.append(run_id)


class _FailingSink:
    """A sink whose every publication is a genuine transport failure (`OSError`)."""

    def accept(self, row: SeriesRow, *, run_id: str | None = None) -> None:
        """Raise, the way a dead Redis connection does mid-write."""
        raise OSError("connection reset by peer")


class _ScriptedOpenInterestClient:
    """Answers pages built from the window it was ASKED for, recording every call.

    Building the answer from the request is what makes the window invariant testable without
    hardcoding instants: by default every point lands inside the requested window (the honest
    source), and `points_outside_window` reproduces the measured pathology `classify_page`
    exists to refuse — `openInterestHist` answering a stale window with the tail of TODAY.
    """

    def __init__(
        self,
        *,
        points_per_page: int = 3,
        api_code: int | None = None,
        points_outside_window: bool = False,
    ) -> None:
        """Bind how this client answers; `calls` records `(symbol, period, window, limit)`."""
        self._points_per_page = points_per_page
        self._api_code = api_code
        self._points_outside_window = points_outside_window
        self.calls: list[tuple[str, str, ClosedWindow, int]] = []

    def open_interest_history(
        self, symbol: str, period: str, window: ClosedWindow, limit: int
    ) -> OiHistoryPageResponse:
        """Record the call and answer a page of points anchored on the requested window."""
        self.calls.append((symbol, period, window, limit))
        if self._api_code is not None:
            return OiHistoryPageResponse(status=400, api_code=self._api_code, points=())
        anchor = (
            window.end_time_ms + OPEN_INTEREST_BUCKET_WIDTH_MS
            if self._points_outside_window
            else window.start_time_ms
        )
        points = tuple(
            {
                "symbol": symbol,
                "sumOpenInterest": f"{100 + index}.0",
                "sumOpenInterestValue": "8000000000.0",
                "timestamp": anchor + index * OPEN_INTEREST_BUCKET_WIDTH_MS,
            }
            for index in range(self._points_per_page)
        )
        return OiHistoryPageResponse(status=200, api_code=None, points=points)


def _run_one_pass(
    client: _ScriptedOpenInterestClient,
    sink: _RecordingSink | _FailingSink,
    *,
    backfill_days: int = 1,
    symbols: tuple[str, ...] = (_SYMBOL,),
    interval_s: float = 60.0,
) -> tuple[list[IngestRun], list[int]]:
    """Drive `_run_open_interest_collector` for exactly ONE pass, then stop it.

    The thread is stopped from inside `record_run` — the pass has completed by the time the run
    is recorded, so `stop_event.wait(interval_s)` returns at once instead of the test having to
    sleep through a cadence. No polling, no wall clock.
    """
    stop = threading.Event()
    failure = threading.Event()
    exit_code = [0]
    runs: list[IngestRun] = []

    def _record(run: IngestRun) -> None:
        runs.append(run)
        stop.set()

    _run_open_interest_collector(
        stop_event=stop,
        failure_event=failure,
        exit_code=exit_code,
        client=client,
        sink=sink,  # type: ignore[arg-type]
        to_rows=build_open_interest_to_rows(),
        record_run=_record,
        symbols=symbols,
        interval_s=interval_s,
        backfill_days=backfill_days,
    )
    return runs, exit_code


# ── THE A-PRIORI ENUMERATION, WHICH IS THE WHOLE POINT OF REUSING THE PAGINATOR ─────────────


def test_every_request_carries_both_window_bounds_and_they_are_contiguous() -> None:
    """⛔ `startTime` ALONE is the measured corruption this collector must be unable to send.

    `[MEDIDO, `D7.3`]`: `openInterestHist` with `startTime` and no `endTime` answers the tail
    of TODAY at `HTTP 200`, silently. The defence is structural — `ClosedWindow` has no
    one-bound constructor — and this pins that the loop actually goes through it: consecutive
    windows abut exactly (`next.start == previous.end + 1`), which is only true of an
    enumeration computed from arithmetic, never of a cursor walked from a response.
    """
    client = _ScriptedOpenInterestClient()
    sink = _RecordingSink()

    _run_one_pass(client, sink, backfill_days=7)

    assert len(client.calls) >= 2
    windows = [window for _symbol, _period, window, _limit in client.calls]
    for previous, following in zip(windows, windows[1:], strict=False):
        assert following.start_time_ms == previous.end_time_ms + 1
    assert all(window.start_time_ms <= window.end_time_ms for window in windows)


def test_the_pass_asks_with_the_period_and_limit_this_module_declares() -> None:
    """`period="5m"` matches the `SeriesKey.interval` the catalog fixed; `limit` sizes the page."""
    client = _ScriptedOpenInterestClient()

    _run_one_pass(client, _RecordingSink())

    symbol, period, _window, limit = client.calls[0]
    assert (symbol, period, limit) == (_SYMBOL, _OPEN_INTEREST_PERIOD, _OPEN_INTEREST_PAGE_LIMIT)


def test_a_longer_backfill_enumerates_strictly_more_pages_than_a_shorter_one() -> None:
    """The horizon is CONFIGURATION (`RS-3.5`), not a constant this loop imposes.

    Morde: hardcode the span and a 7-day backfill asks for exactly what a 1-day backfill does,
    which `DoD-1` would not notice because both are `> 0`.
    """
    one_day = _ScriptedOpenInterestClient()
    seven_days = _ScriptedOpenInterestClient()

    _run_one_pass(one_day, _RecordingSink(), backfill_days=1)
    _run_one_pass(seven_days, _RecordingSink(), backfill_days=7)

    assert len(seven_days.calls) > len(one_day.calls)
    assert one_day.calls[0][2].end_time_ms - one_day.calls[0][2].start_time_ms > 0


def test_the_periodic_tail_span_grows_with_the_configured_cadence() -> None:
    """A cadence raised to 10 minutes must widen the tail, or nine buckets go unpublished.

    The width is free on this endpoint (`[MEDIDO 2026-09-12: nenhum header de weight, 60
    chamadas consecutivas sem 429]`), so the margin is deliberate self-healing rather than a
    cost — but it still has to MOVE with the cadence, which is what this pins.
    """
    assert _open_interest_tail_span_ms(600.0) > _open_interest_tail_span_ms(60.0)
    assert _open_interest_tail_span_ms(60.0) >= 2 * OPEN_INTEREST_BUCKET_WIDTH_MS


# ── THE WINDOW INVARIANT AND THE END OF HISTORY ────────────────────────────────────────────


def test_a_page_whose_points_fall_outside_the_requested_window_writes_zero_rows() -> None:
    """⛔ `D7.4`: `HTTP 200` with out-of-window points is REJECTED, not partially written.

    This is the measured pathology in full: the source answers with data from a different time
    than the one asked for, and no status code says so. Morde: publish what came back anyway
    and `md.series` gets rows whose `bucket_end` is a lie about when the value held.
    """
    client = _ScriptedOpenInterestClient(points_outside_window=True)
    sink = _RecordingSink()

    runs, exit_code = _run_one_pass(client, sink)

    assert sink.rows == []
    assert len(client.calls) == 1, "a rejected page ends the walk instead of paging on"
    assert runs[0].verdict == "ACCEPTED"
    assert exit_code == [0], "a source-side refusal is not a Redis failure"


def test_the_end_of_history_code_closes_the_pass_with_a_warning_and_no_rows() -> None:
    """`-1130` is ~30 days of retention reached — a FACT, never a transient error to retry.

    `[MEDIDO 2026-09-12: startTime de -30d -> HTTP 200 (12 pontos); -35d e -60d -> HTTP 400
    `{"msg":"parameter 'startTime' is invalid.","code":-1130}`]`.
    """
    client = _ScriptedOpenInterestClient(api_code=END_OF_HISTORY_API_CODE)
    sink = _RecordingSink()

    runs, exit_code = _run_one_pass(client, sink, backfill_days=7)

    assert sink.rows == []
    assert len(client.calls) == 1, "end of history stops the walk, it does not retry every page"
    assert runs[0].api_code == END_OF_HISTORY_API_CODE
    assert runs[0].verdict == "ACCEPTED_WITH_WARNING"
    assert exit_code == [0]


# ── THE WATERMARK, THE RUN RECORD, AND THE REDIS FAILURE ───────────────────────────────────


def test_the_pass_publishes_rows_under_the_run_id_it_opened_with() -> None:
    """`ADR-035/D2`: the rows carry the run the collector opened, so the writer can close it."""
    client = _ScriptedOpenInterestClient()
    sink = _RecordingSink()

    runs, _ = _run_one_pass(client, sink)

    assert sink.rows, "a pass over an answering source must publish something"
    assert set(sink.run_ids) == {runs[0].run_id}
    assert runs[0].n_written == N_WRITTEN_BEFORE_THE_WRITER_ACCOUNTS


def test_the_run_record_names_this_producer_and_prices_it_with_the_sentinel() -> None:
    """One run per PASS, with this endpoint's own `endpoint`/`observer_id`/`weight_used`."""
    runs, _ = _run_one_pass(_ScriptedOpenInterestClient(), _RecordingSink())

    assert len(runs) == 1
    assert runs[0].endpoint == OPEN_INTEREST_HIST_ENDPOINT
    assert runs[0].observer_id == OPEN_INTEREST_OBSERVER_ID
    assert runs[0].weight_used == WEIGHT_NOT_READABLE


def test_two_symbols_are_one_pass_and_one_run_not_two() -> None:
    """`Q3` §1.2's unit applied to a pager: the run is the sweep, never the HTTP call."""
    client = _ScriptedOpenInterestClient()
    sink = _RecordingSink()

    runs, _ = _run_one_pass(client, sink, symbols=(_SYMBOL, "ETHUSDT"))

    assert len(runs) == 1
    assert {symbol for symbol, _p, _w, _l in client.calls} == {_SYMBOL, "ETHUSDT"}
    assert {row.symbol for row in sink.rows} == {_SYMBOL, "ETHUSDT"}


def test_a_redis_failure_closes_the_pass_rejected_and_fails_the_process() -> None:
    """A dead sink is `SPEC-004` §3.1's "falha do Redis em regime" — `rc != 0`, run `REJECTED`.

    The distinction against the two source-side refusals above is the whole point: trouble at
    Binance closes `ACCEPTED`/`ACCEPTED_WITH_WARNING` and keeps the process alive; trouble
    writing to our OWN queue stops everything.
    """
    runs, exit_code = _run_one_pass(_ScriptedOpenInterestClient(), _FailingSink())

    assert runs[0].verdict == "REJECTED"
    assert exit_code == [1]
