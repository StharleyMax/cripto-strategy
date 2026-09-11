"""`T-01.3`: the klines thread — boot backfill, periodic cycle, watermark, and its `IngestRun`.

Every test here drives the REAL `collectors_cli._run_klines_collector` with a scripted client
and a recording sink; no socket is opened (`backend/scripts/test.sh`'s "ZERO REDE"). What the
suite measures is the loop's arithmetic — how many calls it makes, which bars it publishes and
which it refuses to publish twice, and what the run record says afterwards — because those are
the quantities `SPEC-007` phase `01`'s `DoD-1`/`DoD-4` are read off.
"""

from __future__ import annotations

import threading
import time

from src.modules.sentimento.domain.ingest_record import IngestRun
from src.modules.sentimento.domain.provenance import SeriesRow
from src.modules.sentimento.infra.binance_klines_client import (
    MAX_LIMIT,
    KlineRow,
    KlinesPageResponse,
)
from src.modules.sentimento.infra.collectors_cli import (
    _run_klines_collector,
    _tail_limit,
)
from src.modules.sentimento.use_cases.collector_run_mapping import (
    KLINES_ENDPOINT,
    KLINES_OBSERVER_ID,
    KLINES_WEIGHT_PER_CALL,
    N_WRITTEN_BEFORE_THE_WRITER_ACCOUNTS,
)
from src.modules.sentimento.use_cases.collector_series_mapping import (
    KLINES_BUCKET_WIDTH_MS,
    build_klines_to_rows,
)

_SYMBOL = "BTCUSDT"
_T0 = 1_788_000_000_000
_CLOSE_OFFSET_MS = KLINES_BUCKET_WIDTH_MS - 1


def _kline(open_time_ms: int, volume: str = "10.5") -> KlineRow:
    """One real 12-field `KlineRow` at `open_time_ms`."""
    return KlineRow(
        raw=(
            open_time_ms,
            "100.0",
            "101.0",
            "99.0",
            "100.5",
            volume,
            open_time_ms + _CLOSE_OFFSET_MS,
            "1000.0",
            7,
            "5.0",
            "500.0",
            "0",
        )
    )


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


class _ScriptedKlinesClient:
    """Answers a scripted sequence of pages, recording the exact arguments of each call."""

    def __init__(self, pages: list[KlinesPageResponse]) -> None:
        """Bind the pages this client hands back, in order; the last one repeats."""
        self._pages = pages
        self.calls: list[tuple[str, str, int, int | None]] = []

    def klines(
        self,
        symbol: str,
        interval: str,
        limit: int,
        start_time_ms: int | None = None,
        end_time_ms: int | None = None,
    ) -> KlinesPageResponse:
        """Record the call and answer the next scripted page."""
        self.calls.append((symbol, interval, limit, start_time_ms))
        index = min(len(self.calls) - 1, len(self._pages) - 1)
        return self._pages[index]


def _page(rows: tuple[KlineRow, ...], api_code: int | None = None) -> KlinesPageResponse:
    """One successful (or refused) page."""
    return KlinesPageResponse(status=200, api_code=api_code, rows=rows)


def _run_one_pass(
    client: _ScriptedKlinesClient,
    sink: _RecordingSink | _FailingSink,
    *,
    backfill_days: int = 1,
    symbols: tuple[str, ...] = (_SYMBOL,),
) -> tuple[list[IngestRun], list[int]]:
    """Drive `_run_klines_collector` for exactly ONE pass, then stop it.

    The thread is stopped from inside `record_run`: the pass has completed by the time the run
    is recorded, and setting `stop_event` there means `stop_event.wait(interval_s)` returns at
    once instead of the test having to sleep through a cadence. No polling, no wall clock.
    """
    stop = threading.Event()
    failure = threading.Event()
    exit_code = [0]
    runs: list[IngestRun] = []

    def _record(run: IngestRun) -> None:
        runs.append(run)
        stop.set()

    _run_klines_collector(
        stop_event=stop,
        failure_event=failure,
        exit_code=exit_code,
        client=client,
        sink=sink,  # type: ignore[arg-type]
        to_rows=build_klines_to_rows(),
        record_run=_record,
        symbols=symbols,
        interval_s=60.0,
        backfill_days=backfill_days,
    )
    return runs, exit_code


# ── THE BOOT BACKFILL: SEVEN DAYS, PAGED ───────────────────────────────────────────────────


def test_the_boot_backfill_pages_forward_until_the_source_runs_short() -> None:
    """A FULL page is followed by another call; a SHORT page ends the walk.

    `/fapi/v1/klines` answers at most `MAX_LIMIT` bars, so "the page came back full" is the
    only signal that more history exists. Morde: end the walk on the first page and seven days
    of backfill collapse to 1500 bars — `DoD-1` (`>= 10.000` rows) fails, but nothing raises.
    """
    start = _T0
    full = tuple(_kline(start + i * KLINES_BUCKET_WIDTH_MS) for i in range(MAX_LIMIT))
    tail_start = start + MAX_LIMIT * KLINES_BUCKET_WIDTH_MS
    short = tuple(_kline(tail_start + i * KLINES_BUCKET_WIDTH_MS) for i in range(10))
    client = _ScriptedKlinesClient([_page(full), _page(short)])
    sink = _RecordingSink()

    runs, _ = _run_one_pass(client, sink, backfill_days=7)

    assert len(client.calls) == 2
    assert client.calls[0][2] == MAX_LIMIT
    # The second call resumes one bucket past the last bar of the first page — never at the
    # same bar (which would republish 1500 rows) and never with a gap.
    assert client.calls[1][3] == full[-1].open_time_ms + KLINES_BUCKET_WIDTH_MS
    assert runs[0].n_returned == MAX_LIMIT + len(short)


def test_the_backfill_asks_for_the_configured_number_of_days_not_a_hardcoded_seven() -> None:
    """`KLINES_BACKFILL_DAYS` moves the walk's start — `RS-3.5`, cadence is configuration.

    Morde: hardcode `7` and this fails for `backfill_days=2`, which is exactly the adjustment
    an operator makes without a release.
    """
    client = _ScriptedKlinesClient([_page(())])
    sink = _RecordingSink()
    _run_one_pass(client, sink, backfill_days=2)
    two_days_ms = 2 * 86_400_000
    requested_start = client.calls[0][3]
    assert requested_start is not None
    # Compared as a WINDOW, not an equality: the collector reads its own clock, which advances
    # between the call and this assertion.
    age_ms = int(time.time() * 1000) - requested_start
    assert two_days_ms <= age_ms < two_days_ms + 60_000


def test_the_backfill_runs_once_and_the_next_pass_asks_only_for_the_tail() -> None:
    """Boot pages with `startTime`; the cycle after it asks for the newest bars only.

    Morde: leave `backfill_from_ms` set and every cycle re-walks seven days — 10.080 bars a
    minute against a host whose premise is scarce resources.
    """
    bar = _kline(_T0)
    client = _ScriptedKlinesClient([_page((bar,))])
    sink = _RecordingSink()
    stop = threading.Event()
    runs: list[IngestRun] = []

    def _record(run: IngestRun) -> None:
        runs.append(run)
        if len(runs) == 2:
            stop.set()

    _run_klines_collector(
        stop_event=stop,
        failure_event=threading.Event(),
        exit_code=[0],
        client=client,
        sink=sink,  # type: ignore[arg-type]
        to_rows=build_klines_to_rows(),
        record_run=_record,
        symbols=(_SYMBOL,),
        interval_s=0.01,
        backfill_days=1,
    )

    assert len(runs) == 2
    assert client.calls[0][3] is not None, "the boot pass backfills from a startTime"
    assert client.calls[1][3] is None, "the periodic cycle asks for the tail, unbounded"
    assert client.calls[1][2] == _tail_limit(0.01)


# ── THE WATERMARK: A BAR IS PUBLISHED ONCE PER PROCESS ─────────────────────────────────────


def test_a_bar_already_published_is_not_published_again_by_the_next_cycle() -> None:
    """The overlap the tail window buys is free: the same bar reaches the stream once.

    `md.series`'s primary key includes `observed_at`, so a republished bar is an INSERT, not a
    conflict — `ON CONFLICT ... DO NOTHING` would not catch it. The watermark is what does.
    Morde: drop the watermark and this sees the same `bucket_end` twice.
    """
    bar = _kline(_T0)
    client = _ScriptedKlinesClient([_page((bar,))])
    sink = _RecordingSink()
    stop = threading.Event()
    runs: list[IngestRun] = []

    def _record(run: IngestRun) -> None:
        runs.append(run)
        if len(runs) == 3:
            stop.set()

    _run_klines_collector(
        stop_event=stop,
        failure_event=threading.Event(),
        exit_code=[0],
        client=client,
        sink=sink,  # type: ignore[arg-type]
        to_rows=build_klines_to_rows(),
        record_run=_record,
        symbols=(_SYMBOL,),
        interval_s=0.01,
        backfill_days=1,
    )

    assert len(sink.rows) == 1, "three passes over the same bar publish it exactly once"
    assert sink.rows[0].bucket_end == _T0 + KLINES_BUCKET_WIDTH_MS
    assert [run.n_returned for run in runs] == [1, 1, 1], "the source still RETURNED it thrice"


def test_the_watermark_is_per_symbol_so_one_symbol_does_not_mask_another() -> None:
    """Publishing `BTCUSDT`'s bar must not suppress the identical bar of `ETHUSDT`.

    Morde: make the watermark a single integer instead of a map and the second symbol of every
    pass goes silent — a defect that looks exactly like "the exchange had no data".
    """
    client = _ScriptedKlinesClient([_page((_kline(_T0),))])
    sink = _RecordingSink()
    _run_one_pass(client, sink, symbols=("BTCUSDT", "ETHUSDT"))
    assert {row.symbol for row in sink.rows} == {"BTCUSDT", "ETHUSDT"}
    assert len({row.series_key_id for row in sink.rows}) == 2


# ── THE `IngestRun` THIS PRODUCER OPENS (`ADR-035/D2`) ─────────────────────────────────────


def test_every_published_row_carries_the_run_id_of_the_pass_that_produced_it() -> None:
    """`ADR-035/D2`: the id is minted at pass OPEN and travels with each row.

    Morde: publish with `run_id=None` and the writer has nothing to credit — `n_written` stays
    `0` and `uptimePercent` stays `0.0`, which is the exact state `T-01.4` measured
    (`100%` of `2.910` runs) and left for this task to close.
    """
    client = _ScriptedKlinesClient([_page((_kline(_T0), _kline(_T0 + KLINES_BUCKET_WIDTH_MS)))])
    sink = _RecordingSink()
    runs, _ = _run_one_pass(client, sink)
    assert sink.run_ids, "the pass published at least one row"
    assert set(sink.run_ids) == {runs[0].run_id}


def test_the_run_records_the_endpoint_observer_and_a_weight_derived_from_the_calls() -> None:
    """One run per pass, priced at `KLINES_WEIGHT_PER_CALL` per call actually made."""
    full = tuple(_kline(_T0 + i * KLINES_BUCKET_WIDTH_MS) for i in range(MAX_LIMIT))
    client = _ScriptedKlinesClient([_page(full), _page((_kline(_T0),))])
    sink = _RecordingSink()
    runs, _ = _run_one_pass(client, sink, backfill_days=7)
    assert len(runs) == 1, "one IngestRun per PASS, never one per page"
    assert runs[0].endpoint == KLINES_ENDPOINT
    assert runs[0].observer_id == KLINES_OBSERVER_ID
    assert runs[0].weight_used == KLINES_WEIGHT_PER_CALL * len(client.calls)
    assert runs[0].verdict == "ACCEPTED"


def test_the_run_leaves_n_written_for_the_writer_to_close() -> None:
    """The collector OPENS the run; `n_written` is the single writer's to credit."""
    client = _ScriptedKlinesClient([_page((_kline(_T0),))])
    runs, _ = _run_one_pass(client, _RecordingSink())
    assert runs[0].n_written == N_WRITTEN_BEFORE_THE_WRITER_ACCOUNTS


def test_the_anti_lookahead_cut_stays_visible_in_the_gap_between_returned_and_published() -> None:
    """`n_returned` counts what the source sent; the log's `n_published` counts what survived.

    Morde: set `n_returned` to the published count and the size of the `RS-3.4` cut becomes
    unobservable in `/api/v1/ingest-health` — the one record an operator would consult to ask
    whether the cut is happening at all.
    """
    settled = _kline(_T0)
    in_progress = _kline(_T0 + 200 * 365 * 86_400_000)  # far in the future: still open
    client = _ScriptedKlinesClient([_page((settled, in_progress))])
    sink = _RecordingSink()
    runs, _ = _run_one_pass(client, sink)
    assert runs[0].n_returned == 2
    assert len(sink.rows) == 1
    assert sink.rows[0].bucket_end == _T0 + KLINES_BUCKET_WIDTH_MS


def test_a_page_the_source_refused_closes_the_pass_with_a_warning_not_a_rejection() -> None:
    """An API error envelope is trouble UPSTREAM — `ACCEPTED_WITH_WARNING`, `rc` unchanged.

    The same distinction `_run_premium_index_collector` already draws: `REJECTED` is reserved
    for a failure writing to OUR OWN queue (`SPEC-004` §3.1's "falha do Redis em regime"), and
    collapsing the two would make a Binance hiccup restart the container.
    """
    client = _ScriptedKlinesClient([_page((), api_code=-1121)])
    runs, exit_code = _run_one_pass(client, _RecordingSink())
    assert runs[0].verdict == "ACCEPTED_WITH_WARNING"
    assert runs[0].api_code == -1121
    assert exit_code[0] == 0


def test_a_publish_failure_rejects_the_pass_and_takes_the_process_down() -> None:
    """A dead queue IS `SPEC-004` §3.1's fatal case: `REJECTED`, `rc != 0`, siblings stopped.

    Morde: swallow the `OSError` and the collector keeps looping against a queue nobody is
    draining — silent data loss with a healthy-looking process, the failure class this
    repository punishes hardest.
    """
    stop = threading.Event()
    failure = threading.Event()
    exit_code = [0]
    runs: list[IngestRun] = []

    _run_klines_collector(
        stop_event=stop,
        failure_event=failure,
        exit_code=exit_code,
        client=_ScriptedKlinesClient([_page((_kline(_T0),))]),
        sink=_FailingSink(),  # type: ignore[arg-type]
        to_rows=build_klines_to_rows(),
        record_run=runs.append,
        symbols=(_SYMBOL,),
        interval_s=60.0,
        backfill_days=1,
    )

    assert exit_code[0] == 1
    assert failure.is_set()
    assert [run.verdict for run in runs] == ["REJECTED"]


# ── THE TAIL WINDOW IS DERIVED FROM THE CONFIGURED CADENCE ─────────────────────────────────


def test_the_tail_window_widens_with_the_configured_cadence() -> None:
    """A ten-minute cadence asks for ten bars plus margin, not two.

    Morde: fix the tail at two bars and raising `KLINES_CYCLE_INTERVAL_S` to 600 s publishes
    two bars out of every ten — an 80% hole that no error ever reports.
    """
    assert _tail_limit(60.0) == 3
    assert _tail_limit(600.0) == 12
    assert _tail_limit(10 * 86_400.0) == MAX_LIMIT, "never above the endpoint's own ceiling"
