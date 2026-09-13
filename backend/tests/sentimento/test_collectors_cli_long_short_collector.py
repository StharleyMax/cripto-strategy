"""`T-04.3`: the long/short thread — boot page, tail cadence, watermark, and its `IngestRun`.

Every test drives the REAL `collectors_cli._run_long_short_collector` with a scripted client and
a recording sink; no socket is opened (`backend/scripts/test.sh`'s "ZERO REDE"). What is measured
is the loop's arithmetic — how many calls it makes, which points it publishes and which it
refuses to publish twice, and what the run record says afterwards — because those are the
quantities `SPEC-007` phase `04`'s `DoD-1`/`DoD-4` are read off.
"""

from __future__ import annotations

import threading
from collections.abc import Mapping

from src.modules.sentimento.domain.ingest_record import IngestRun
from src.modules.sentimento.domain.long_short_catalog import count_long_short_ratio_key
from src.modules.sentimento.domain.provenance import SeriesRow
from src.modules.sentimento.infra.binance_futures_data_client import (
    MAX_LIMIT,
    FuturesDataPageResponse,
)
from src.modules.sentimento.infra.collectors_cli import (
    _long_short_tail_limit,
    _run_long_short_collector,
)
from src.modules.sentimento.use_cases.collector_run_mapping import (
    LONG_SHORT_DATA_ENDPOINT,
    LONG_SHORT_ENDPOINT,
    LONG_SHORT_OBSERVER_ID,
    N_WRITTEN_BEFORE_THE_WRITER_ACCOUNTS,
    WEIGHT_NOT_READABLE,
)
from src.modules.sentimento.use_cases.collector_series_mapping import build_long_short_to_rows

_SYMBOL = "BTCUSDT"
_BUCKET_MS = 300_000
# Far enough in the past that every scripted point is already settled at wall-clock `now`, so
# the anti-lookahead cut never fires here — it has its own test, in the mapping's suite.
_T0 = 1_700_000_000_000


def _point(timestamp_ms: int, ratio: str = "1.6434") -> Mapping[str, object]:
    """One point in the shape the endpoint publishes `[MEDIDO 2026-09-12]`."""
    return {
        "symbol": _SYMBOL,
        "longAccount": "0.6217",
        "longShortRatio": ratio,
        "shortAccount": "0.3783",
        "timestamp": timestamp_ms,
    }


def _page(
    points: tuple[Mapping[str, object], ...], api_code: int | None = None
) -> FuturesDataPageResponse:
    """One successful (or refused) page."""
    return FuturesDataPageResponse(status=200, api_code=api_code, points=points)


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


class _ScriptedFuturesDataClient:
    """Answers a scripted sequence of pages, recording the exact arguments of each call."""

    def __init__(self, pages: list[FuturesDataPageResponse]) -> None:
        """Bind the pages this client hands back, in order; the last one repeats."""
        self._pages = pages
        self.calls: list[tuple[str, str, str, int]] = []

    def history(
        self, endpoint: str, symbol: str, period: str, limit: int
    ) -> FuturesDataPageResponse:
        """Record the call and answer the next scripted page."""
        self.calls.append((endpoint, symbol, period, limit))
        index = min(len(self.calls) - 1, len(self._pages) - 1)
        return self._pages[index]


def _run_passes(
    client: _ScriptedFuturesDataClient,
    sink: _RecordingSink | _FailingSink,
    *,
    passes: int = 1,
    interval_s: float = 60.0,
    symbols: tuple[str, ...] = (_SYMBOL,),
) -> tuple[list[IngestRun], list[int]]:
    """Drive `_run_long_short_collector` for exactly `passes` passes, then stop it.

    The thread is stopped from inside `record_run` — the pass has completed by the time the run
    is recorded, so the LAST `stop_event.wait(interval_s)` returns at once. The waits BETWEEN
    passes are real, which is why every multi-pass caller passes a near-zero `interval_s`: the
    default 60 s would make a three-pass test sleep for two minutes to measure arithmetic.
    """
    stop = threading.Event()
    failure = threading.Event()
    exit_code = [0]
    runs: list[IngestRun] = []

    def _record(run: IngestRun) -> None:
        runs.append(run)
        if len(runs) >= passes:
            stop.set()

    _run_long_short_collector(
        stop_event=stop,
        failure_event=failure,
        exit_code=exit_code,
        client=client,
        sink=sink,  # type: ignore[arg-type]
        to_rows=build_long_short_to_rows(),
        record_run=_record,
        symbols=symbols,
        interval_s=interval_s,
    )
    return runs, exit_code


# ── THE BOOT PASS: THE ENDPOINT'S WHOLE CEILING, IN ONE CALL ───────────────────────────────


def test_the_boot_pass_asks_for_the_endpoints_ceiling_in_a_single_call() -> None:
    """ONE call at `limit=500` — never a paging walk, because the tail takes no window.

    500 points of 5 min is ~41,7 h, which is `DoD-3`'s "N >= 30 barras nativas" many times over
    on the FIRST pass. Morde: a boot pass that asked for the tail limit instead would publish 3
    points and leave the panel with a `SEM_PONTO` that is honest and useless.
    """
    points = tuple(_point(_T0 + i * _BUCKET_MS) for i in range(500))
    client = _ScriptedFuturesDataClient([_page(points)])
    sink = _RecordingSink()

    runs, _ = _run_passes(client, sink)

    assert len(client.calls) == 1
    assert client.calls[0] == (LONG_SHORT_DATA_ENDPOINT, _SYMBOL, "5m", MAX_LIMIT)
    assert len(sink.rows) == 500
    assert runs[0].n_returned == 500


def test_the_period_asked_of_the_source_is_the_interval_of_the_identity() -> None:
    """`5m` on the wire and `5m` in the key — `[MEDIDO 2026-09-12]`: `1m` answers `[]`.

    If these two ever diverge, the collector writes rows on one grid under an identity that
    claims another, and nothing raises: the panel just renders a series whose `interval` lies.
    """
    client = _ScriptedFuturesDataClient([_page((_point(_T0),))])

    _run_passes(client, _RecordingSink())

    _, _, period, _ = client.calls[0]
    assert period == "5m"
    assert count_long_short_ratio_key(_SYMBOL).interval == period


# ── THE TAIL: CADENCE-DERIVED, NEVER A CONSTANT IN CODE (`RS-3.5`) ─────────────────────────


def test_the_second_pass_asks_for_the_tail_not_the_ceiling_again() -> None:
    """The boot page is asked ONCE; every pass after it asks the cadence-derived tail."""
    points = tuple(_point(_T0 + i * _BUCKET_MS) for i in range(5))
    client = _ScriptedFuturesDataClient([_page(points)])

    _run_passes(client, _RecordingSink(), passes=2, interval_s=0.01)

    assert len(client.calls) == 2
    assert client.calls[0][3] == MAX_LIMIT
    assert client.calls[1][3] == _long_short_tail_limit(0.01)


def test_the_tail_limit_grows_with_the_configured_cadence() -> None:
    """MORDE (`RS-3.5`): a cadence of one hour must cover the twelve buckets that closed.

    A tail limit hardcoded at "the last few" would publish one bucket in twelve at that cadence
    and leave eleven permanent holes — a gap no error and no run record would ever report.
    """
    assert _long_short_tail_limit(60.0) == 2
    assert _long_short_tail_limit(300.0) == 3
    assert _long_short_tail_limit(3600.0) == 14
    assert _long_short_tail_limit(10_000_000.0) == MAX_LIMIT


# ── THE WATERMARK ──────────────────────────────────────────────────────────────────────────


def test_a_point_already_published_is_not_published_twice() -> None:
    """The overlap between the boot page and the tail is free — the watermark eats it."""
    points = tuple(_point(_T0 + i * _BUCKET_MS) for i in range(4))
    client = _ScriptedFuturesDataClient([_page(points)])
    sink = _RecordingSink()

    runs, _ = _run_passes(client, sink, passes=3, interval_s=0.01)

    assert len(sink.rows) == 4
    assert [run.n_returned for run in runs] == [4, 4, 4]


def test_a_newer_bucket_arriving_after_the_watermark_is_published() -> None:
    """MORDE: the watermark must not become a ceiling that freezes the series forever."""
    first = tuple(_point(_T0 + i * _BUCKET_MS, "1.10") for i in range(2))
    second = (*first, _point(_T0 + 2 * _BUCKET_MS, "1.20"))
    client = _ScriptedFuturesDataClient([_page(first), _page(second)])
    sink = _RecordingSink()

    _run_passes(client, sink, passes=2, interval_s=0.01)

    assert [row.value_raw for row in sink.rows] == ["1.10", "1.10", "1.20"]
    assert sink.rows[-1].bucket_end == _T0 + 2 * _BUCKET_MS


# ── THE RUN RECORD (`DoD-4`) ───────────────────────────────────────────────────────────────


def test_the_run_names_this_endpoint_this_observer_and_no_readable_weight() -> None:
    """`weight_used` is the sentinel, and that is MEASURED: `/futures/data/*` sends no header.

    `domain/clock_skew.py` (`T-03.7`) records that this endpoint family answers `200` with ZERO
    `x-mbx-*` headers, so a derived weight here would be a number with no command behind it —
    the opposite of what `KLINES_WEIGHT_PER_CALL` is.
    """
    client = _ScriptedFuturesDataClient([_page((_point(_T0),))])

    runs, exit_code = _run_passes(client, _RecordingSink())

    run = runs[0]
    assert run.endpoint == LONG_SHORT_ENDPOINT
    assert run.observer_id == LONG_SHORT_OBSERVER_ID
    assert run.weight_used == WEIGHT_NOT_READABLE
    assert run.n_written == N_WRITTEN_BEFORE_THE_WRITER_ACCOUNTS
    assert run.verdict == "ACCEPTED"
    assert exit_code == [0]


def test_every_published_row_carries_the_run_id_of_the_pass_that_opened_it() -> None:
    """`ADR-035/D2`: the collector OPENS the run, so the rows name it and the writer closes it."""
    points = tuple(_point(_T0 + i * _BUCKET_MS) for i in range(3))
    client = _ScriptedFuturesDataClient([_page(points)])
    sink = _RecordingSink()

    runs, _ = _run_passes(client, sink)

    assert set(sink.run_ids) == {runs[0].run_id}


def test_a_page_the_source_refused_closes_accepted_with_warning_and_publishes_nothing() -> None:
    """Trouble upstream at Binance is NOT trouble writing to our own queue — the two differ.

    An error envelope leaves the pass `ACCEPTED_WITH_WARNING` with `rc=0`: the collector keeps
    running, because a `-1130` on one symbol is not a reason to take a 24/7 process down.
    """
    client = _ScriptedFuturesDataClient([_page((), api_code=-1130)])
    sink = _RecordingSink()

    runs, exit_code = _run_passes(client, sink)

    assert runs[0].verdict == "ACCEPTED_WITH_WARNING"
    assert runs[0].api_code == -1130
    assert sink.rows == []
    assert exit_code == [0]


def test_a_publish_failure_closes_rejected_and_takes_the_process_down() -> None:
    """`SPEC-004` §3.1's "falha do Redis em regime" — `REJECTED`, `rc=1`, the other threads told."""
    client = _ScriptedFuturesDataClient([_page((_point(_T0),))])

    runs, exit_code = _run_passes(client, _FailingSink())

    assert runs[0].verdict == "REJECTED"
    assert exit_code == [1]


def test_the_pass_sweeps_every_symbol_once_and_folds_their_totals_into_one_run() -> None:
    """ONE `IngestRun` per PASS over the universe, never one per HTTP call (`Q3` §1.2)."""
    client = _ScriptedFuturesDataClient([_page((_point(_T0),))])
    sink = _RecordingSink()

    runs, _ = _run_passes(client, sink, symbols=("BTCUSDT", "ETHUSDT", "SOLUSDT", "LINKUSDT"))

    assert len(runs) == 1
    assert len(client.calls) == 4
    assert runs[0].n_returned == 4
    assert {call[1] for call in client.calls} == {
        "BTCUSDT",
        "ETHUSDT",
        "SOLUSDT",
        "LINKUSDT",
    }
