"""`T-01.5`: the ONE-SHOT klines backfill — its ceiling, its backpressure, and its ending.

Every test drives the REAL `klines_backfill_cli` with a scripted client, a recording sink and a
fake RESP connection; no socket is opened (`backend/scripts/test.sh`'s "ZERO REDE"). What is
measured here is what `SPEC-008`'s plan `01` item 1.6 + `DoD 5` are read off: that the job ENDS,
that `90` days is a refusal boundary and not a clamp, that a bucket already paid for is never
requested twice, and that the walk stops publishing while the single writer is behind.
"""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.ingest_record import IngestRun
from src.modules.sentimento.domain.klines_ohlc_catalog import build_klines_ohlc_entry
from src.modules.sentimento.domain.provenance import SeriesRow
from src.modules.sentimento.domain.series_key import Reduction
from src.modules.sentimento.infra.binance_klines_client import (
    MAX_LIMIT,
    KlineRow,
    KlinesPageResponse,
)
from src.modules.sentimento.infra.collectors_cli import CollectorBootConfigurationError
from src.modules.sentimento.infra.klines_backfill_cli import (
    MAX_BACKFILL_DAYS,
    MS_PER_DAY,
    BackfillConfig,
    StreamGroupMissingError,
    read_group_lag,
    resolve_backfill_days,
    run_backfill,
)
from src.modules.sentimento.use_cases.collector_run_mapping import KLINES_WEIGHT_PER_CALL
from src.modules.sentimento.use_cases.collector_series_mapping import (
    KLINES_BUCKET_WIDTH_MS,
    build_klines_to_rows,
)

_SYMBOL = "BTCUSDT"
_T0 = 1_788_000_000_000
_CLOSE_OFFSET_MS = KLINES_BUCKET_WIDTH_MS - 1
_STREAM = "md.series.write"
_GROUP = "single_writer"

# The four prices of every scripted bar, distinct on purpose: four EQUAL prices would let a
# reader that mixed up `HIGH` and `LOW` pass every assertion in this file.
_OPEN, _HIGH, _LOW, _CLOSE = "100.0", "101.0", "99.0", "100.5"


def _kline(open_time_ms: int) -> KlineRow:
    """One real 12-field `KlineRow` opening at `open_time_ms`."""
    return KlineRow(
        raw=(
            open_time_ms,
            _OPEN,
            _HIGH,
            _LOW,
            _CLOSE,
            "10.5",
            open_time_ms + _CLOSE_OFFSET_MS,
            "1000.0",
            7,
            "5.0",
            "500.0",
            "0",
        )
    )


def _page(rows: tuple[KlineRow, ...], api_code: int | None = None) -> KlinesPageResponse:
    """One successful (or refused) page."""
    return KlinesPageResponse(status=200, api_code=api_code, rows=rows)


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


class _RecordingSink:
    """Stand-in for `RedisStreamSeriesSink`: records the row and when it was accepted."""

    def __init__(self, journal: list[str] | None = None) -> None:
        """Start with nothing accepted; `journal` interleaves publishes with lag probes."""
        self.rows: list[SeriesRow] = []
        self._journal = journal if journal is not None else []

    def accept(self, row: SeriesRow, *, run_id: str | None = None) -> None:
        """Record one publication; never raises."""
        self.rows.append(row)
        self._journal.append("publish")


class _FailingSink:
    """A sink whose every publication is a genuine transport failure (`OSError`)."""

    def accept(self, row: SeriesRow, *, run_id: str | None = None) -> None:
        """Raise, the way a dead Redis connection does mid-write."""
        raise OSError("connection reset by peer")


class _FakeRespConnection:
    """Answers `XINFO GROUPS` from a scripted sequence of lags, recording every probe."""

    def __init__(
        self,
        lags: list[int] | None = None,
        *,
        group: str = _GROUP,
        journal: list[str] | None = None,
    ) -> None:
        """Bind the lags this connection reports, in order; the last one repeats."""
        self._lags = lags if lags is not None else [0]
        self._group = group
        self._journal = journal if journal is not None else []
        self.probes = 0

    def command(self, *args: str | bytes | int) -> object:
        """Answer the RESP2 shape of `XINFO GROUPS` — an array of flat field/value arrays."""
        assert args[0] == "XINFO"
        lag = self._lags[min(self.probes, len(self._lags) - 1)]
        self.probes += 1
        self._journal.append(f"probe:{lag}")
        return [
            [
                b"name",
                self._group.encode("utf-8"),
                b"consumers",
                1,
                b"pending",
                0,
                b"lag",
                lag,
            ]
        ]


def _config(
    *,
    days: int = 1,
    symbols: tuple[str, ...] = (_SYMBOL,),
    max_stream_lag: int = 20_000,
) -> BackfillConfig:
    """Build the resolved configuration the tests drive `run_backfill` with."""
    return BackfillConfig(
        days=days,
        symbols=symbols,
        stream=_STREAM,
        stream_group=_GROUP,
        max_stream_lag=max_stream_lag,
        lag_poll_interval_s=0.0001,
    )


def _drive(
    client: _ScriptedKlinesClient,
    sink: _RecordingSink | _FailingSink,
    *,
    config: BackfillConfig | None = None,
    connection: _FakeRespConnection | None = None,
    now: int = _T0 + 10 * MS_PER_DAY,
    slept: list[float] | None = None,
) -> tuple[list[IngestRun], int]:
    """Run the real `run_backfill` to completion and hand back its runs and exit code."""
    runs: list[IngestRun] = []
    recorder: list[float] = slept if slept is not None else []
    exit_code = run_backfill(
        config=config or _config(),
        client=client,
        connection=connection or _FakeRespConnection(),  # type: ignore[arg-type]
        sink=sink,  # type: ignore[arg-type]
        to_rows=build_klines_to_rows(),
        record_run=runs.append,
        now_ms=lambda: now,
        iso_now=lambda: "2026-09-19T00:00:00+00:00",
        sleep=recorder.append,
    )
    return runs, exit_code


# ── THE JOB ENDS. THAT IS THE TASK, AND IT IS ASSERTED BY THE TEST RETURNING ───────────────


def test_the_one_shot_returns_instead_of_becoming_a_service() -> None:
    """`run_backfill` completes and hands back an exit code — `ADR-027/D1`.

    Morde structurally: wrap the pass in the `while not stop_event.is_set()` the collector uses
    and this test never returns, because there is no stop event to set. A fourth long-lived
    process cannot pass a test that requires the function to come back.
    """
    client = _ScriptedKlinesClient([_page((_kline(_T0),))])

    runs, exit_code = _drive(client, _RecordingSink())

    assert exit_code == 0
    assert len(runs) == 1
    assert runs[0].verdict == "ACCEPTED"


# ── THE `D5` CEILING: 90 DAYS, REFUSED BY NAME, NEVER CLAMPED ──────────────────────────────


def test_ninety_days_is_accepted_and_is_the_default() -> None:
    """The owner's ceiling is also the default depth — `[DECISAO-OWNER: 2026-09-19]`."""
    assert MAX_BACKFILL_DAYS == 90
    assert resolve_backfill_days({}) == 90
    assert resolve_backfill_days({"KLINES_BACKFILL_ONE_SHOT_DAYS": "90"}) == 90


def test_one_day_past_the_ceiling_is_refused_naming_the_variable_never_clamped() -> None:
    """`91` raises at boot; it does NOT come back as `90`.

    Morde: replace the `raise` with `min(value, MAX_BACKFILL_DAYS)` and this fails. That
    mutation is the whole reason the test exists — a clamp answers "give me a year" with 90
    days of rows and no line saying so, and the shortfall reads as a gap in the SOURCE.
    """
    with pytest.raises(CollectorBootConfigurationError) as refusal:
        resolve_backfill_days({"KLINES_BACKFILL_ONE_SHOT_DAYS": "91"})

    assert refusal.value.variable == "KLINES_BACKFILL_ONE_SHOT_DAYS"
    assert "90" in str(refusal.value)


@pytest.mark.parametrize("value", ["0", "-1"])
def test_a_non_positive_depth_is_refused_rather_than_read_as_no_backfill(value: str) -> None:
    """`0` is indistinguishable from a typo, so it fails at boot instead of writing nothing."""
    with pytest.raises(CollectorBootConfigurationError):
        resolve_backfill_days({"KLINES_BACKFILL_ONE_SHOT_DAYS": value})


def test_the_walk_starts_the_configured_number_of_days_back() -> None:
    """`startTime` of the first call is `now - days * 86.400.000`, for the days configured.

    Morde: hardcode the depth and this fails for `days=3`, which is exactly the adjustment an
    operator makes to deepen a single symbol without a release.
    """
    now = _T0 + 10 * MS_PER_DAY
    client = _ScriptedKlinesClient([_page(())])

    _drive(client, _RecordingSink(), config=_config(days=3), now=now)

    assert client.calls[0][3] == now - 3 * MS_PER_DAY


# ── `DoD 5` (`RNF-4`): ZERO NEW NETWORK CALLS FOR THE CANDLE ───────────────────────────────


def test_every_closed_bar_publishes_six_rows_and_four_of_them_are_the_candle() -> None:
    """One array, six identities, and the four prices are read OFF IT — never re-requested.

    Morde two ways. (a) Make the job publish only `klines_volume` and the candle has no rows.
    (b) Read the wrong index and `HIGH` carries `99.0` — the four scripted prices are distinct
    precisely so a swapped accessor cannot pass.
    """
    client = _ScriptedKlinesClient([_page((_kline(_T0), _kline(_T0 + KLINES_BUCKET_WIDTH_MS)))])
    sink = _RecordingSink()

    _drive(client, sink)

    assert len(sink.rows) == 12
    by_key = {row.series_key_id: row.value_raw for row in sink.rows}
    for reduction, expected in (
        (Reduction.OPEN, _OPEN),
        (Reduction.HIGH, _HIGH),
        (Reduction.LOW, _LOW),
        (Reduction.CLOSE, _CLOSE),
    ):
        key_id = build_klines_ohlc_entry(
            reduction, instrument_id=_SYMBOL, verified_by="test_klines_ohlc_catalog.py"
        ).key.series_key_id()
        assert by_key[key_id] == expected


def test_no_bucket_is_ever_requested_twice_in_one_pass() -> None:
    """Each page resumes ONE bucket past the last bar of the previous one — strictly forward.

    This is `DoD 5` made mechanical: the second request for a bucket already paid for is what
    `RNF-4` forbids, and a cursor that did not advance (or advanced by zero) would re-ask for
    the same 1500 bars forever. Morde: drop the `+ KLINES_BUCKET_WIDTH_MS`.
    """
    full = tuple(_kline(_T0 + i * KLINES_BUCKET_WIDTH_MS) for i in range(MAX_LIMIT))
    tail_open = _T0 + MAX_LIMIT * KLINES_BUCKET_WIDTH_MS
    short = tuple(_kline(tail_open + i * KLINES_BUCKET_WIDTH_MS) for i in range(10))
    client = _ScriptedKlinesClient([_page(full), _page(short)])

    runs, _ = _drive(client, _RecordingSink())

    starts = [call[3] for call in client.calls]
    assert len(starts) == 2
    assert starts[1] == full[-1].open_time_ms + KLINES_BUCKET_WIDTH_MS
    assert len(set(starts)) == len(starts)
    assert runs[0].n_returned == MAX_LIMIT + len(short)
    assert runs[0].weight_used == 2 * KLINES_WEIGHT_PER_CALL


def test_the_in_progress_bucket_is_cut_by_the_same_predicate_the_collector_uses() -> None:
    """A bar that has not closed at `now` publishes NO row — the anti-lookahead cut, inherited.

    Morde: call a private copy of the mapping that skips `is_closed_bucket` and the newest bar
    is published with `is_final=True` while it is still moving.
    """
    now = _T0 + 2 * KLINES_BUCKET_WIDTH_MS
    closed = _kline(_T0)
    in_progress = _kline(now)
    client = _ScriptedKlinesClient([_page((closed, in_progress))])
    sink = _RecordingSink()

    runs, _ = _drive(client, sink, now=now)

    assert {row.bucket_end for row in sink.rows} == {_T0 + KLINES_BUCKET_WIDTH_MS}
    assert runs[0].n_returned == 2


# ── BACKPRESSURE: THE WALK WAITS FOR THE SINGLE WRITER, AND `XLEN` IS NOT THE PROBE ────────


def test_the_lag_of_the_named_group_is_what_is_read_not_the_first_group_listed() -> None:
    """`read_group_lag` matches the group BY NAME among the groups the server lists."""
    connection = _FakeRespConnection([7], group=_GROUP)

    assert read_group_lag(connection, _STREAM, _GROUP) == 7  # type: ignore[arg-type]


def test_a_missing_consumer_group_is_an_error_never_a_zero_lag() -> None:
    """Nothing draining the stream means every entry published would be trimmed unread.

    Morde: return `0` for an unknown group and the backpressure silently becomes decoration —
    the job publishes three million entries into a trimmer and reports `ACCEPTED`.
    """
    connection = _FakeRespConnection([0], group="somebody_else")

    with pytest.raises(StreamGroupMissingError):
        read_group_lag(connection, _STREAM, _GROUP)  # type: ignore[arg-type]


def test_the_walk_publishes_nothing_until_the_writer_has_drained_below_the_ceiling() -> None:
    """Every publish in the journal comes after a probe that read a lag at or below the ceiling.

    Morde: delete the `wait_for_drain` call at the top of the page loop and the journal opens
    with `publish` while the recorded lag is still `50.000` — which at the `D5` ceiling is how
    `MAXLEN ~` silently eats minutes the writer never read.
    """
    journal: list[str] = []
    connection = _FakeRespConnection([50_000, 30_000, 10_000], journal=journal)
    client = _ScriptedKlinesClient([_page((_kline(_T0),))])
    sink = _RecordingSink(journal)
    slept: list[float] = []

    _drive(
        client,
        sink,
        config=_config(max_stream_lag=20_000),
        connection=connection,
        slept=slept,
    )

    assert journal[:3] == ["probe:50000", "probe:30000", "probe:10000"]
    assert all(entry == "publish" for entry in journal[3:])
    assert len(slept) == 2


# ── THE RUN RECORD: OUR QUEUE FAILING IS NOT THE SOURCE REFUSING ───────────────────────────


def test_a_publish_failure_closes_the_run_rejected_and_returns_one() -> None:
    """`SPEC-004` §3.1's "falha do Redis em regime" — trouble writing to OUR OWN queue."""
    client = _ScriptedKlinesClient([_page((_kline(_T0),))])

    runs, exit_code = _drive(client, _FailingSink())

    assert exit_code == 1
    assert runs[0].verdict == "REJECTED"
    assert runs[0].notes is not None
    assert "OSError" in runs[0].notes


def test_a_refused_page_closes_the_run_accepted_with_warning_and_returns_zero() -> None:
    """An error envelope is trouble UPSTREAM at Binance, a different verdict from `REJECTED`.

    Morde: fold the two together and an operator reading `/api/v1/ingest-health` can no longer
    tell "the exchange said no" from "our queue is down", which are opposite repairs.
    """
    client = _ScriptedKlinesClient([_page((), api_code=-1130)])

    runs, exit_code = _drive(client, _RecordingSink())

    assert exit_code == 0
    assert runs[0].verdict == "ACCEPTED_WITH_WARNING"
    assert runs[0].api_code == -1130


def test_one_run_covers_the_whole_symbol_universe_never_one_per_page() -> None:
    """The run is the thing the operator schedules, the unit `build_klines_run` already fixes."""
    client = _ScriptedKlinesClient([_page((_kline(_T0),))])

    runs, _ = _drive(
        client, _RecordingSink(), config=_config(symbols=("BTCUSDT", "ETHUSDT", "SOLUSDT"))
    )

    assert len(runs) == 1
    assert len(client.calls) == 3
    assert runs[0].weight_used == 3 * KLINES_WEIGHT_PER_CALL
