"""`T-01.7`: the harness that fetches both sides, under an amputated socket.

Every test here runs with NO NETWORK — the two ports of `infra/candle_fidelity_cli.py` are
`Protocol`s, and the fakes below are what `backend/scripts/test.sh`'s "ZERO REDE" substitutes
for the real Binance client and the real `/api/v1/series-history`. What is under test is the
WIRING and the EXIT CODES, because those are what a gate reads; the judgement itself is pinned
offline in `test_candle_fidelity.py`.

⛔ THE TEST THIS FILE EXISTS FOR IS `test_a_window_with_no_stored_point_exits_three_never_zero`.
At the moment `T-01.7` was written the assert's own window held `0/240` points, and a harness
that answered `rc=0` there would have reported "nothing diverged" about a universe it never
looked at — `ADR-012`'s `rc=0` ambiguity, which is how an instrument stops measuring without a
single line changing.
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from decimal import Decimal
from typing import Final

import pytest

from src.modules.sentimento.domain.candle_fidelity import (
    CandleFidelityError,
    CandleFidelityReport,
    FidelityVerdict,
)
from src.modules.sentimento.domain.klines_ohlc_catalog import (
    KLINES_OHLC_NATIVE_GRID_MS,
    KLINES_OHLC_REDUCTIONS,
)
from src.modules.sentimento.domain.series_key import Reduction
from src.modules.sentimento.infra.binance_klines_client import (
    MAX_LIMIT,
    KlineRow,
    KlinesPageResponse,
)
from src.modules.sentimento.infra.candle_fidelity_cli import (
    BAR_POLICY,
    EXIT_FAITHFUL,
    EXIT_NOT_MEASURED,
    EXIT_REJECTED,
    HttpSeriesHistoryFetcher,
    format_report,
    klines_ohlc_key_ids,
    main,
    origin_candles,
    run,
    stored_reading_of,
)

_SYMBOL: Final[str] = "BTCUSDT"
_T0: Final[int] = 1_788_000_000_000
_WINDOW_BUCKETS: Final[int] = 5
_WINDOW_END: Final[int] = _T0 + _WINDOW_BUCKETS * KLINES_OHLC_NATIVE_GRID_MS
# Five DISTINCT quadruples, one per bucket, and the distinctness is load-bearing: a fixture
# that repeated one price on every bar would build a repeat run of five, which the harness
# rejects on purpose (it outlives the declared `LOCF` bound). A fixture must not trip the very
# finding the test around it is trying to isolate.
_PRICES_BY_BUCKET: Final[tuple[tuple[str, str, str, str], ...]] = (
    ("100.0", "104.0", "99.0", "103.0"),
    ("103.0", "106.5", "102.5", "104.0"),
    ("104.0", "104.8", "101.1", "101.9"),
    ("101.9", "107.2", "101.0", "106.6"),
    ("106.6", "108.0", "105.4", "105.9"),
)


def _kline(open_time_ms: int, prices: tuple[str, str, str, str]) -> KlineRow:
    """Build one real `KlineRow` with the twelve fields the endpoint returns."""
    return KlineRow(
        raw=(
            open_time_ms,
            *prices,
            "10.0",
            open_time_ms + KLINES_OHLC_NATIVE_GRID_MS - 1,
            "1000.0",
            42,
            "5.0",
            "500.0",
            "0",
        )
    )


class _FakeKlines:
    """A `/fapi/v1/klines` stand-in that answers one scripted page and remembers the calls."""

    def __init__(self, rows: Sequence[KlineRow], api_code: int | None = None) -> None:
        """Script the page this fake answers with."""
        self._rows = tuple(rows)
        self._api_code = api_code
        self.calls: list[tuple[object, ...]] = []

    def __call__(
        self,
        symbol: str,
        interval: str,
        limit: int,
        start_time_ms: int | None = None,
        end_time_ms: int | None = None,
    ) -> KlinesPageResponse:
        """Answer the scripted page, whatever was asked."""
        self.calls.append((symbol, interval, limit, start_time_ms, end_time_ms))
        return KlinesPageResponse(status=200, api_code=self._api_code, rows=self._rows)


class _FakeHistory:
    """A `/series-history` stand-in returning one `rows` array per `series_key_id`."""

    def __init__(self, rows_by_id: Mapping[str, Sequence[Mapping[str, object]]]) -> None:
        """Script the rows each id answers with; an unscripted id answers empty."""
        self._rows_by_id = dict(rows_by_id)
        self.queries: list[Mapping[str, object]] = []

    def rows(
        self,
        *,
        series_key_id: str,
        symbol: str,
        window_start_ms: int,
        window_end_ms: int,
        knowledge_time_ms: int,
    ) -> Sequence[Mapping[str, object]]:
        """Answer the scripted rows, remembering what was asked."""
        self.queries.append(
            {
                "series_key_id": series_key_id,
                "symbol": symbol,
                "window_start_ms": window_start_ms,
                "window_end_ms": window_end_ms,
                "knowledge_time_ms": knowledge_time_ms,
            }
        )
        return self._rows_by_id.get(series_key_id, ())


def _history_rows(
    quadruples: Sequence[tuple[str, str, str, str]] = _PRICES_BY_BUCKET,
) -> dict[str, list[dict[str, object]]]:
    """Build a served `rows` array per reduction, on the report grid, from one price per bar."""
    ids = klines_ohlc_key_ids(_SYMBOL)
    out: dict[str, list[dict[str, object]]] = {}
    for position, reduction in enumerate(KLINES_OHLC_REDUCTIONS):
        rows: list[dict[str, object]] = []
        for index, quadruple in enumerate(quadruples):
            event_time = _T0 + (index + 1) * KLINES_OHLC_NATIVE_GRID_MS
            rows.append(
                {
                    "event_time": event_time,
                    "available_at": event_time + 2_000,
                    "value": quadruple[position],
                    "absence": None,
                }
            )
        out[ids[reduction]] = rows
    return out


def _origin_page() -> tuple[KlineRow, ...]:
    """Return the five bars of the window, as the origin published them."""
    return tuple(
        _kline(_T0 + index * KLINES_OHLC_NATIVE_GRID_MS, quadruple)
        for index, quadruple in enumerate(_PRICES_BY_BUCKET)
    )


def _run(klines: _FakeKlines, history: _FakeHistory) -> CandleFidelityReport:
    """Run one comparison over the fixture window."""
    return run(
        symbol=_SYMBOL,
        window_start_ms=_T0,
        window_end_ms=_WINDOW_END,
        knowledge_time_ms=_WINDOW_END + KLINES_OHLC_NATIVE_GRID_MS,
        klines=klines,
        fetcher=history,
    )


# ── THE IDS COME FROM THE CATALOG THE API ITSELF SERVES ─────────────────────────────────────


def test_the_four_ids_are_read_off_the_served_catalog_and_not_rebuilt_here() -> None:
    """All four reductions resolve, to four DISTINCT ids.

    Morde: rebuild the keys in the harness with any other `verified_by` and the ids stop
    matching the rows the writer published — the harness would then read an empty series and
    report NOT MEASURED for a series that is full, a false negative shaped exactly like the
    true one this task expects.
    """
    ids = klines_ohlc_key_ids(_SYMBOL)
    assert set(ids) == set(KLINES_OHLC_REDUCTIONS)
    assert len(set(ids.values())) == 4


# ── THE EXIT CODES ──────────────────────────────────────────────────────────────────────────


def test_a_window_with_no_stored_point_exits_three_never_zero() -> None:
    """`0/240`, the state this task was written under: NOT MEASURED, and it is not green."""
    report = _run(_FakeKlines(_origin_page()), _FakeHistory({}))
    assert report.verdict is FidelityVerdict.NOT_MEASURED
    assert report.n_compared == 0
    assert EXIT_NOT_MEASURED == 3


def test_a_byte_faithful_window_is_faithful_over_a_universe_the_report_names() -> None:
    """Green, with `n` attached: 5 buckets x 4 readings = 20 comparisons."""
    report = _run(_FakeKlines(_origin_page()), _FakeHistory(_history_rows()))
    assert report.verdict is FidelityVerdict.FAITHFUL
    assert report.n_compared == 20
    assert "compared=20" in format_report(report)
    assert EXIT_FAITHFUL == 0


def test_a_truncated_wick_on_every_bucket_is_rejected_and_named_unilateral() -> None:
    """The `[M-9]` shape end to end through the harness: `HIGH` short on all five buckets."""
    poisoned = _history_rows(
        tuple(
            (quad[0], str(Decimal(quad[1]) - Decimal("0.5")), quad[2], quad[3])
            for quad in _PRICES_BY_BUCKET
        )
    )
    report = _run(_FakeKlines(_origin_page()), _FakeHistory(poisoned))
    assert report.verdict is FidelityVerdict.REJECTED
    assert report.biased_reductions == (Reduction.HIGH,)
    rendered = format_report(report)
    assert "UNILATERAL BIAS on HIGH" in rendered
    assert "writer traces behind the divergences: live_tail" in rendered
    assert EXIT_REJECTED == 1


def test_an_inverted_window_is_refused_instead_of_compared_over_nothing() -> None:
    """An empty window would make the universe empty by construction, so the run refuses."""
    with pytest.raises(CandleFidelityError, match="empty or inverted"):
        run(
            symbol=_SYMBOL,
            window_start_ms=_WINDOW_END,
            window_end_ms=_T0,
            knowledge_time_ms=_WINDOW_END,
            klines=_FakeKlines(()),
            fetcher=_FakeHistory({}),
        )


# ── THE ORIGIN WALK ─────────────────────────────────────────────────────────────────────────


def test_the_origin_walk_keeps_only_the_buckets_that_lie_inside_the_window() -> None:
    """The endpoint may answer past `endTime`; a bucket outside the window is not ground truth."""
    outside = (
        _kline(_T0 - KLINES_OHLC_NATIVE_GRID_MS, _PRICES_BY_BUCKET[0]),
        *_origin_page(),
        _kline(_WINDOW_END, _PRICES_BY_BUCKET[0]),
    )
    candles = origin_candles(
        _FakeKlines(outside), symbol=_SYMBOL, window_start_ms=_T0, window_end_ms=_WINDOW_END
    )
    assert len(candles) == _WINDOW_BUCKETS
    assert [c.open_time_ms for c in candles] == [
        _T0 + index * KLINES_OHLC_NATIVE_GRID_MS for index in range(_WINDOW_BUCKETS)
    ]


def test_an_origin_page_the_venue_refused_is_not_measured_and_never_compared() -> None:
    """No ground truth means no verdict — a refusal, never an empty-but-green comparison."""
    with pytest.raises(CandleFidelityError, match="GROUND TRUTH"):
        origin_candles(
            _FakeKlines((), api_code=-1121),
            symbol=_SYMBOL,
            window_start_ms=_T0,
            window_end_ms=_WINDOW_END,
        )


def test_an_empty_origin_page_stops_the_walk_instead_of_looping() -> None:
    """One of the four REAL ends of the walk, not a loop guard."""
    klines = _FakeKlines(())
    assert (
        origin_candles(klines, symbol=_SYMBOL, window_start_ms=_T0, window_end_ms=_WINDOW_END) == ()
    )
    assert len(klines.calls) == 1


# ── THE WIRE PROJECTION: `Decimal`, NEVER `float` ───────────────────────────────────────────


def test_a_served_value_is_carried_as_decimal_and_keeps_every_digit() -> None:
    """A price with more significant digits than a double can hold survives the projection.

    Morde: parse with `float` and this loses digits, so a zero-tolerance comparison would fail
    on the ARITHMETIC OF THE HARNESS and blame the writer for it.
    """
    exact = "81001.123456789012345678"
    reading = stored_reading_of(
        Reduction.OPEN,
        {"event_time": _T0, "available_at": _T0, "value": exact, "absence": None},
    )
    assert reading.value == Decimal(exact)
    assert str(reading.value) == exact
    assert reading.value != Decimal(str(float(exact)))


def test_an_absent_row_keeps_its_named_absence_and_carries_no_available_at() -> None:
    """`{"value": null, "absence": "SEM_PONTO"}` projects onto a hole, never onto a zero."""
    reading = stored_reading_of(
        Reduction.LOW,
        {"event_time": _T0, "available_at": None, "value": None, "absence": "SEM_PONTO"},
    )
    assert reading.value is None
    assert reading.absence == "SEM_PONTO"
    assert reading.available_at is None


def test_a_value_that_is_not_a_decimal_is_refused_rather_than_guessed() -> None:
    """Zero tolerance cannot afford a guess about what a malformed value meant."""
    with pytest.raises(CandleFidelityError, match="not a decimal number"):
        stored_reading_of(
            Reduction.OPEN,
            {"event_time": _T0, "available_at": _T0, "value": "n/a", "absence": None},
        )


# ── THE HTTP FETCHER: WHAT GOES ON THE WIRE ─────────────────────────────────────────────────


class _FakeResponse:
    """A minimal `http.client` response."""

    def __init__(self, status: int, body: bytes) -> None:
        """Hold the status and the body this response answers with."""
        self.status = status
        self._body = body

    def read(self) -> bytes:
        """Drain the body."""
        return self._body


class _FakeConnection:
    """A minimal `http.client` connection that records the path it was asked for."""

    def __init__(self, status: int = 200, body: bytes | None = None) -> None:
        """Script the response; `body` defaults to one empty `rows` array."""
        self.status = status
        self.body = body if body is not None else json.dumps({"rows": []}).encode("utf-8")
        self.paths: list[str] = []
        self.closed = False

    def request(self, method: str, url: str) -> None:
        """Record the request instead of sending it."""
        self.paths.append(f"{method} {url}")

    def getresponse(self) -> _FakeResponse:
        """Answer the scripted response."""
        return _FakeResponse(self.status, self.body)

    def close(self) -> None:
        """Record that the connection was closed."""
        self.closed = True


def test_the_read_goes_out_under_final_only_which_is_the_assert_itself() -> None:
    """`bar_policy=final_only`, never `intrabar`.

    Morde: read back under `intrabar` and the harness admits exactly the rows whose finality is
    in question — `[M-9]`'s hypothesis is that an intrabar snapshot is being STORED as final,
    so reading under the policy that tolerates partial bars hides the defect behind itself.
    """
    connection = _FakeConnection()
    fetcher = HttpSeriesHistoryFetcher(
        "127.0.0.1", 8000, connection_factory=lambda host, port: connection
    )
    assert (
        fetcher.rows(
            series_key_id="abc",
            symbol=_SYMBOL,
            window_start_ms=_T0,
            window_end_ms=_WINDOW_END,
            knowledge_time_ms=_WINDOW_END,
        )
        == []
    )
    assert BAR_POLICY == "final_only"
    assert f"bar_policy={BAR_POLICY}" in connection.paths[0]
    assert "series_key_id=abc" in connection.paths[0]
    assert connection.closed


def test_a_read_path_that_refused_is_not_measured_rather_than_faithful() -> None:
    """A `422` is the API refusing; no verdict can be drawn from a response it refused."""
    connection = _FakeConnection(status=422, body=b"{}")
    fetcher = HttpSeriesHistoryFetcher(
        "127.0.0.1", 8000, connection_factory=lambda host, port: connection
    )
    with pytest.raises(CandleFidelityError, match="answered HTTP 422"):
        fetcher.rows(
            series_key_id="abc",
            symbol=_SYMBOL,
            window_start_ms=_T0,
            window_end_ms=_WINDOW_END,
            knowledge_time_ms=_WINDOW_END,
        )
    assert connection.closed


def test_a_body_with_no_rows_array_is_refused_rather_than_read_as_an_empty_series() -> None:
    """An unexpected shape is a refusal; reading it as "no points" would be `NOT MEASURED` lying."""
    connection = _FakeConnection(body=json.dumps({"panel": {}}).encode("utf-8"))
    fetcher = HttpSeriesHistoryFetcher(
        "127.0.0.1", 8000, connection_factory=lambda host, port: connection
    )
    with pytest.raises(CandleFidelityError, match="no `rows` array"):
        fetcher.rows(
            series_key_id="abc",
            symbol=_SYMBOL,
            window_start_ms=_T0,
            window_end_ms=_WINDOW_END,
            knowledge_time_ms=_WINDOW_END,
        )


# ── THE VERDICT-TO-EXIT-CODE MAPPING, WHICH IS THE LINE A GATE ACTUALLY READS ───────────────


def _argv() -> list[str]:
    """Return the fixture window as command-line arguments."""
    return [
        "--symbol",
        _SYMBOL,
        "--window-start-ms",
        str(_T0),
        "--window-end-ms",
        str(_WINDOW_END),
        "--knowledge-time-ms",
        str(_WINDOW_END + KLINES_OHLC_NATIVE_GRID_MS),
    ]


def test_main_exits_zero_only_when_something_was_actually_compared() -> None:
    """A faithful window over a NON-EMPTY universe is the only `rc=0` this harness emits."""
    code = main(_argv(), klines=_FakeKlines(_origin_page()), fetcher=_FakeHistory(_history_rows()))
    assert code == EXIT_FAITHFUL


def test_main_exits_one_when_the_stored_candle_diverges_from_the_origin() -> None:
    """A divergence is `rc=1`, distinct from both the green and the refused case."""
    poisoned = _history_rows(
        tuple(
            (quad[0], quad[1], str(Decimal(quad[2]) + Decimal("0.5")), quad[3])
            for quad in _PRICES_BY_BUCKET
        )
    )
    code = main(_argv(), klines=_FakeKlines(_origin_page()), fetcher=_FakeHistory(poisoned))
    assert code == EXIT_REJECTED


def test_main_exits_three_on_an_empty_window_and_says_so_in_the_report(
    capsys: pytest.CaptureFixture[str],
) -> None:
    """⛔ The `0/240` case: `rc=3`, and the report SAYS it measured nothing.

    Morde: map `NOT_MEASURED` onto `EXIT_FAITHFUL` and this test fails on both halves — the
    code and the printed line — which is what keeps `ADR-012`'s ambiguity out of the one number
    an operator copies into a gate block.
    """
    code = main(_argv(), klines=_FakeKlines(_origin_page()), fetcher=_FakeHistory({}))
    assert code == EXIT_NOT_MEASURED
    assert "NOT MEASURED" in capsys.readouterr().out


def test_main_maps_a_refusal_onto_not_measured_rather_than_onto_a_verdict(
    capsys: pytest.CaptureFixture[str],
) -> None:
    """A refused comparison never becomes a green one, and the refusal goes to stderr."""
    inverted = [
        "--symbol",
        _SYMBOL,
        "--window-start-ms",
        str(_WINDOW_END),
        "--window-end-ms",
        str(_T0),
        "--knowledge-time-ms",
        str(_WINDOW_END),
    ]
    assert main(inverted, klines=_FakeKlines(()), fetcher=_FakeHistory({})) == EXIT_NOT_MEASURED
    assert "RECUSA" in capsys.readouterr().err


def test_the_origin_walk_pages_forward_while_the_source_keeps_answering_full_pages() -> None:
    """A window wider than `MAX_LIMIT` is walked by `startTime`, not truncated in silence.

    Morde: drop the cursor advance and the walk either loops for ever on the first page or
    stops after `MAX_LIMIT` bars — and a silently truncated ORIGIN would make the missing tail
    of the window look like "no origin bucket here", which is not compared and never reported.
    """
    pages = [
        tuple(
            _kline(_T0 + index * KLINES_OHLC_NATIVE_GRID_MS, _PRICES_BY_BUCKET[0])
            for index in range(MAX_LIMIT)
        ),
        (_kline(_T0 + MAX_LIMIT * KLINES_OHLC_NATIVE_GRID_MS, _PRICES_BY_BUCKET[1]),),
    ]
    served: list[tuple[KlineRow, ...]] = []

    def _klines(
        symbol: str,
        interval: str,
        limit: int,
        start_time_ms: int | None = None,
        end_time_ms: int | None = None,
    ) -> KlinesPageResponse:
        page = pages[len(served)] if len(served) < len(pages) else ()
        served.append(page)
        return KlinesPageResponse(status=200, api_code=None, rows=page)

    candles = origin_candles(
        _klines,
        symbol=_SYMBOL,
        window_start_ms=_T0,
        window_end_ms=_T0 + (MAX_LIMIT + 1) * KLINES_OHLC_NATIVE_GRID_MS,
    )
    assert len(served) == 2
    assert len(candles) == MAX_LIMIT + 1


def test_five_quiet_minutes_that_agree_on_a_price_are_not_reported_as_a_stuck_reader() -> None:
    """⛔ THE FALSE POSITIVE THE FIRST VERSION OF THIS HARNESS ACTUALLY EMITTED, pinned.

    Five DISTINCT observations — each with its own `available_at` — that happen to carry the
    same number are a flat market, not one reading answering five instants. Folding runs on the
    value alone reported exactly this as a finding on the live tail `[MEDIDO 2026-09-19: HIGH
    held 81044.90 across three instants stamped …422375 / …482346 / …542336]`, and an
    instrument that cries wolf on every quiet hour stops being read.
    """
    repeated = _history_rows((_PRICES_BY_BUCKET[0],) * _WINDOW_BUCKETS)
    report = _run(_FakeKlines(_origin_page()), _FakeHistory(repeated))
    assert report.repeat_runs == ()
    assert "LOCF RUN" not in format_report(report)


def test_the_report_names_a_locf_run_that_outlived_its_declared_bound() -> None:
    """ONE observation answering five instants — same value AND same stamp — is a finding."""
    stuck = _history_rows((_PRICES_BY_BUCKET[0],) * _WINDOW_BUCKETS)
    for rows in stuck.values():
        for row in rows:
            row["available_at"] = _T0 + KLINES_OHLC_NATIVE_GRID_MS + 2_000
    report = _run(_FakeKlines(_origin_page()), _FakeHistory(stuck))
    rendered = format_report(report)
    assert "LOCF RUN of 5" in rendered
    assert report.verdict is FidelityVerdict.REJECTED
