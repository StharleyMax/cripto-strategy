"""Offline proof of the `T-03.6` bench's logic: the guard, the call log and the three verdicts.

The bench itself spends Binance quota and needs its own Postgres (`scripts/oi-poll-capture-
bench.sh`), so it never runs here. What runs here is every decision it makes, each shown on the
case it must REJECT as well as the one it accepts — green alone proves nothing.
"""

from __future__ import annotations

import io
import json
import logging
from collections.abc import Sequence
from typing import Any, cast

import psycopg
import pytest

from src.modules.sentimento.domain.ingest_record import IngestRun
from src.modules.sentimento.infra.open_interest_poll_capture_bench_cli import (
    BENCH_NAME_PREFIX,
    BenchStackRefusedError,
    LagEnvelope,
    MinuteQuota,
    PollCall,
    PollCallJsonLog,
    PostgresBenchStore,
    Verdict,
    audit,
    expected_absent_minutes,
    judge_absence,
    judge_quota,
    lag_envelope,
    main,
    minute_quotas,
    parse_poll_calls,
    polled_series_ids,
    require_bench_stack,
)
from src.modules.sentimento.use_cases.collector_run_mapping import (
    OPEN_INTEREST_POLL_ENDPOINT,
    OPEN_INTEREST_POLL_OBSERVER_ID,
)

MINUTE_MS = 60_000
T0 = 1_790_000_040_000 - 1_790_000_040_000 % MINUTE_MS  # a grid minute
BENCH_ENV = {
    "POSTGRES_DB": f"{BENCH_NAME_PREFIX}_1",
    "REDIS_STREAM": f"{BENCH_NAME_PREFIX}.series.write",
    "INGEST_RECORD_BACKEND": "postgres",
}


def _cycle(t: int, first_weight: int | None = 11) -> list[PollCall]:
    """Four calls sent at `t - 5 s`, one per symbol, each charging weight 1."""
    return [
        PollCall(
            symbol=symbol,
            sent_at_ms=t - 5_000 + i * 80,
            used_weight_1m=None if first_weight is None else first_weight + i,
            lag_ms=5_000 + i,
        )
        for i, symbol in enumerate(sorted(polled_series_ids()))
    ]


# ── the guard (`D-g`) ─────────────────────────────────────────────────────────────────────


def test_the_bench_stack_is_accepted() -> None:
    """The names the bench script gives its own containers pass the guard."""
    require_bench_stack(BENCH_ENV)


@pytest.mark.parametrize(
    ("variable", "value"),
    [
        ("POSTGRES_DB", "cripto"),
        ("POSTGRES_DB", ""),
        ("REDIS_STREAM", "md.series.write"),
        ("INGEST_RECORD_BACKEND", "sqlite"),
    ],
)
def test_a_shared_database_stream_or_store_is_refused_naming_the_variable(
    variable: str, value: str
) -> None:
    """MORDE: any name the bench did not create is refused, naming the variable."""
    environ = {**BENCH_ENV, variable: value}
    with pytest.raises(BenchStackRefusedError) as refused:
        require_bench_stack(environ)
    assert refused.value.variable == variable


def test_main_refuses_the_shared_database_before_opening_anything() -> None:
    """`main` refuses with rc 2 and a JSON reason, before any socket."""
    out = io.StringIO()
    rc = main(["counts"], environ={**BENCH_ENV, "POSTGRES_DB": "cripto"}, out=out)
    assert rc == 2
    assert json.loads(out.getvalue())["refused"] == "POSTGRES_DB"


def test_main_refuses_an_unknown_command() -> None:
    """Only `collect`, `counts` and `audit` exist."""
    assert main(["seed"], environ=BENCH_ENV, out=io.StringIO()) == 2


# ── the call log ─────────────────────────────────────────────────────────────────────────


def test_only_the_per_call_line_is_written_and_it_round_trips() -> None:
    """The handler keeps `open_interest_poll_call` only, and `sent_at` is rebuilt from it."""
    stream = io.StringIO()
    handler = PollCallJsonLog(stream)
    probe = logging.getLogger("test_open_interest_poll_capture_bench.probe")
    probe.propagate = False
    probe.setLevel(logging.INFO)
    probe.addHandler(handler)
    try:
        probe.info("collector_cycle_completed", extra={"n_calls": 4})
        probe.info(
            "open_interest_poll_call",
            extra={
                "symbol": "BTCUSDT",
                "event_time_ms": T0 - 4_900,
                "lag_ms": -100,
                "used_weight_1m": 7,
                "fate": "admitted",
            },
        )
        probe.warning("open_interest_poll_call", extra={"symbol": "ETHUSDT", "fate": "not_read"})
    finally:
        probe.removeHandler(handler)
    lines = stream.getvalue().splitlines()
    assert len(lines) == 2
    calls = parse_poll_calls(lines)
    assert calls[0] == PollCall(
        symbol="BTCUSDT", sent_at_ms=T0 - 5_000, used_weight_1m=7, lag_ms=-100
    )
    assert calls[1].used_weight_1m is None
    assert calls[1].sent_at_ms == json.loads(lines[1])["logged_at_ms"]


def test_a_line_with_no_instant_is_refused_rather_than_placed_anywhere() -> None:
    """A call with no instant cannot be assigned a minute, so it is not guessed."""
    with pytest.raises(ValueError, match="no instant"):
        parse_poll_calls([json.dumps({"symbol": "BTCUSDT"}), ""])


# ── `DoD-2`: the quota, by the header ─────────────────────────────────────────────────────


def test_one_cycle_per_minute_passes_the_quota() -> None:
    """Four calls at `T - 5 s`, header growing by one each: the production shape passes."""
    calls = _cycle(T0) + _cycle(T0 + MINUTE_MS, first_weight=30) + _cycle(T0 + 2 * MINUTE_MS)
    verdict, evidence = judge_quota(minute_quotas(calls))
    assert verdict is Verdict.PASS
    assert evidence["max_calls_in_a_minute"] == 4
    assert evidence["max_header_span_in_a_minute"] == 4


def test_a_loop_without_wait_fails_the_quota() -> None:
    """MORDE: the no-wait loop — five cycles inside one minute."""
    calls = [
        PollCall(symbol="BTCUSDT", sent_at_ms=T0 + i * 200, used_weight_1m=3 + i) for i in range(20)
    ]
    verdict, evidence = judge_quota(minute_quotas(calls))
    assert verdict is Verdict.FAIL
    assert evidence["max_calls_in_a_minute"] == 20
    assert evidence["max_header_span_in_a_minute"] == 20


def test_a_header_span_above_four_fails_even_with_four_calls() -> None:
    """Four calls whose header grew by 6: something charged more than weight 1 each."""
    quotas = (MinuteQuota(minute_start_ms=T0, n_calls=4, header_span=6),)
    assert judge_quota(quotas)[0] is Verdict.FAIL


def test_no_header_at_all_is_inconclusive_not_a_pass() -> None:
    """Without a single header the check is not by the header, so it cannot pass."""
    verdict, evidence = judge_quota(minute_quotas(_cycle(T0, first_weight=None)))
    assert verdict is Verdict.INCONCLUSIVE
    assert evidence["minutes_without_header"] == 1


# ── `DoD-4`: absent is not carried ────────────────────────────────────────────────────────


ENVELOPE = LagEnvelope(min_lag_ms=-2_240, max_lag_ms=14_683)
"""`Q-STAMP-1`'s negative tail and the 14.7 s this task's first bench run measured."""


def test_the_expected_absent_minutes_exclude_both_admissible_edges() -> None:
    """Only minutes no pre-stop and no post-restart reading could reach are expected absent."""
    stopped_from = T0 + 2_000  # stopped just after the cycle of `T0`
    stopped_until = T0 + 152_000  # restarted 150 s later
    assert expected_absent_minutes(stopped_from, stopped_until, ENVELOPE) == (
        T0 + MINUTE_MS,
        T0 + 2 * MINUTE_MS,
    )


def test_a_host_clock_behind_binance_widens_the_edge_before_the_stop() -> None:
    """`time` may run 2.24 s past the stop: `T0 + 1 min` is reachable from a stop at `+38 s`."""
    assert expected_absent_minutes(T0 + 38_000, T0 + 152_000, ENVELOPE) == (T0 + 2 * MINUTE_MS,)
    no_skew = LagEnvelope(min_lag_ms=1_000, max_lag_ms=14_683)
    assert expected_absent_minutes(T0 + 38_000, T0 + 152_000, no_skew)[0] == T0 + MINUTE_MS


def test_a_stale_origin_snapshot_widens_the_edge_after_the_restart() -> None:
    """A snapshot 14.7 s old, read right after a restart at `+130 s`, may land on `T0 + 2 min`."""
    assert expected_absent_minutes(T0 + 2_000, T0 + 130_000, ENVELOPE) == (T0 + MINUTE_MS,)


def test_the_envelope_is_measured_from_the_calls_that_read_something() -> None:
    """Calls that read nothing carry no lag; a run with none of them has no envelope."""
    calls = [*_cycle(T0), PollCall(symbol="BTCUSDT", sent_at_ms=T0, used_weight_1m=None)]
    assert lag_envelope(calls) == LagEnvelope(min_lag_ms=5_000, max_lag_ms=5_003)
    assert lag_envelope([PollCall(symbol="BTCUSDT", sent_at_ms=T0, used_weight_1m=None)]) is None


def _instants(gap: Sequence[int] = ()) -> dict[str, tuple[int, ...]]:
    before = (T0 - MINUTE_MS, T0)
    after = (T0 + 3 * MINUTE_MS, T0 + 4 * MINUTE_MS)
    return {symbol: (*before, *gap, *after) for symbol in polled_series_ids()}


def test_no_row_in_the_stopped_minutes_passes() -> None:
    """Rows on both sides of the stop and none inside it: absent is not carried."""
    verdict, evidence = judge_absence(_instants(), T0 + 2_000, T0 + 152_000, ENVELOPE)
    assert verdict is Verdict.PASS
    assert evidence["rows_in_absent_minutes"] == []


def test_a_carried_forward_row_in_a_stopped_minute_fails() -> None:
    """MORDE: carry-forward writes the previous value into the minute the collector was down."""
    verdict, evidence = judge_absence(
        _instants(gap=(T0 + MINUTE_MS,)), T0 + 2_000, T0 + 152_000, ENVELOPE
    )
    assert verdict is Verdict.FAIL
    carried = evidence["rows_in_absent_minutes"]
    assert isinstance(carried, list)
    assert [symbol for symbol, _ in carried] == sorted(polled_series_ids())


def test_a_collector_that_never_wrote_is_inconclusive_not_a_pass() -> None:
    """No row in the gap is vacuous when there is no row anywhere."""
    empty: dict[str, tuple[int, ...]] = {symbol: () for symbol in polled_series_ids()}
    assert judge_absence(empty, T0 + 2_000, T0 + 152_000, ENVELOPE)[0] is Verdict.INCONCLUSIVE


def test_a_stop_too_short_to_leave_a_minute_absent_is_inconclusive() -> None:
    """With no expected-absent minute, there is nothing to have carried into."""
    verdict = judge_absence(_instants(), T0 + 31_000, T0 + 69_000, ENVELOPE)[0]
    assert verdict is Verdict.INCONCLUSIVE


def test_a_run_that_read_nothing_is_inconclusive() -> None:
    """Without a single reading there is no envelope, so no minute can be declared absent."""
    assert judge_absence(_instants(), T0 + 2_000, T0 + 152_000, None)[0] is Verdict.INCONCLUSIVE


# ── `DoD-1` and the whole audit, over a fake store ───────────────────────────────────────


class _FakeStore:
    def __init__(self, instants: dict[str, tuple[int, ...]], n_written: int) -> None:
        ids = polled_series_ids()
        self._by_id = {ids[symbol]: ts for symbol, ts in instants.items()}
        self._n_written = n_written

    def rows_by_series(self, series_ids: Sequence[str]) -> dict[str, int]:
        return {sid: len(ts) for sid, ts in self._by_id.items() if sid in series_ids and ts}

    def grid_instants_by_series(self, series_ids: Sequence[str]) -> dict[str, tuple[int, ...]]:
        return {sid: ts for sid, ts in self._by_id.items() if sid in series_ids and ts}

    def poll_runs(self) -> tuple[IngestRun, ...]:
        return (_run(n_written=self._n_written),)


def _run(*, n_written: int, endpoint: str = OPEN_INTEREST_POLL_ENDPOINT) -> IngestRun:
    return IngestRun(
        run_id="r-1",
        source="binance-futures-rest",
        endpoint=endpoint,
        window="1m",
        n_expected=4,
        n_returned=4,
        n_written=n_written,
        verdict="ACCEPTED",
        api_code=200,
        src_sha256="0" * 64,
        weight_used=11,
        observer_id=OPEN_INTEREST_POLL_OBSERVER_ID,
        observer_region="local",
        clock_skew_ms=0,
        started_at="2026-09-25T00:00:00Z",
        ended_at="2026-09-25T00:00:01Z",
    )


def _calls() -> list[PollCall]:
    return [c for t in (T0, T0 + 3 * MINUTE_MS, T0 + 4 * MINUTE_MS) for c in _cycle(t)]


def test_the_audit_passes_new_data_quota_and_absence_together() -> None:
    """The three verdicts over a store and a log shaped like a healthy run."""
    report = audit(_FakeStore(_instants(), n_written=16), _calls(), T0 + 2_000, T0 + 152_000)
    assert report["verdict"] == "PASS"
    new_data = report["dod_1_new_data"]
    assert isinstance(new_data, dict)
    assert new_data["rows_total"] == 16
    assert new_data["n_written_total"] == 16


def test_zero_n_written_fails_new_data_even_with_rows() -> None:
    """`ADR-035`: rows the writer never credited are the defect `DoD-4` of `SPEC-008` names."""
    report = audit(_FakeStore(_instants(), n_written=0), _calls(), T0 + 2_000, T0 + 152_000)
    assert report["verdict"] == "FAIL"
    new_data = report["dod_1_new_data"]
    assert isinstance(new_data, dict)
    assert new_data["verdict"] == "FAIL"


def test_a_symbol_with_no_row_fails_new_data() -> None:
    """`DoD-1` is per symbol: three of four series is not 0 -> > 0."""
    instants = {**_instants(), "LINKUSDT": ()}
    report = audit(_FakeStore(instants, n_written=12), _calls(), T0 + 2_000, T0 + 152_000)
    new_data = report["dod_1_new_data"]
    assert isinstance(new_data, dict)
    assert new_data["verdict"] == "FAIL"
    assert new_data["rows_by_symbol"] == {**{s: 4 for s in polled_series_ids()}, "LINKUSDT": 0}


def test_the_postgres_store_keeps_only_the_poll_collector_runs() -> None:
    """`n_written` of another endpoint never counts toward the poll collector."""
    store = PostgresBenchStore(
        connection=cast("psycopg.Connection[Any]", None),  # `poll_runs` never touches it
        runs=(_run(n_written=4), _run(n_written=9, endpoint="/fapi/v1/klines")),
    )
    assert [run.n_written for run in store.poll_runs()] == [4]


def test_the_four_polled_series_are_distinct_and_named_by_the_writer_s_identity() -> None:
    """One `series_key_id` per symbol, built by the function the writer path uses."""
    ids = polled_series_ids()
    assert sorted(ids) == ["BTCUSDT", "ETHUSDT", "LINKUSDT", "SOLUSDT"]
    assert len(set(ids.values())) == 4
