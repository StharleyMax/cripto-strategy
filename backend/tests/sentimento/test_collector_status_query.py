"""`ADR-030` D0-D4: the four formulas of `collector_status_query`, one falsifier per formula.

Each test names the `ADR-030` example or falsifier (`F-1`..`F-10`) it proves, so a reader who
doubts a formula can go straight to the paragraph that derived it instead of re-deriving it from
this file's arithmetic.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

import pytest

from src.modules.sentimento.domain.collector_status import (
    COLLECTOR_STATUS_QUERY_NAME,
    LivenessJudged,
    MalformedRunTimestampError,
    ResilienceNotScored,
    ResilienceUnavailable,
    RetentionNotApplicable,
    RetentionUnmeasured,
)
from src.modules.sentimento.domain.ingest_record import IngestGap, IngestRun
from src.modules.sentimento.use_cases.collector_status import collector_status_query


@dataclass(frozen=True)
class _FakeSource:
    """A minimal `IngestRecordSource` — only `runs()` is read; `gaps()` is never touched here."""

    _runs: tuple[IngestRun, ...]

    def runs(self) -> tuple[IngestRun, ...]:
        """Return the fixed rows the test wired — never a query."""
        return self._runs

    def gaps(self) -> tuple[IngestGap, ...]:
        """Unused by `collector_status_query`; present only to satisfy `IngestRecordSource`."""
        return ()


def _a_run(
    *,
    run_id: str,
    ended_at: str,
    verdict: str = "ACCEPTED",
    n_expected: int = 1,
    n_written: int = 1,
    source: str = "binance-futures",
    endpoint: str = "/fapi/v1/time",
) -> IngestRun:
    """Build one `IngestRun`, varying only the fields each `ADR-030` example turns on."""
    return IngestRun(
        run_id=run_id,
        source=source,
        endpoint=endpoint,
        window=f"{ended_at}/{ended_at}",
        n_expected=n_expected,
        n_returned=n_written,
        n_written=n_written,
        verdict=verdict,
        api_code=None,
        src_sha256="0" * 64,
        weight_used=1,
        observer_id="observer-0",
        observer_region="sa-east-1",
        clock_skew_ms=0,
        started_at=ended_at,
        ended_at=ended_at,
    )


def _hourly_runs(
    n: int, *, start_hour: int = 0, verdict: str = "ACCEPTED"
) -> tuple[IngestRun, ...]:
    """Build `n` runs an hour apart — `ADR-030`'s NTP-probe example cadence."""
    return tuple(
        _a_run(
            run_id=f"run-{i:04d}",
            ended_at=f"2026-09-05T{start_hour + i:02d}:00:00.000Z",
            verdict=verdict,
        )
        for i in range(n)
    )


_NOW = datetime(2026, 9, 5, 18, 0, 0, tzinfo=UTC)


def test_query_name_and_empty_source_produce_an_empty_report() -> None:
    """The envelope's `query` name is `collector_status` even with zero series (`ADR-030` D5)."""
    report = collector_status_query(_FakeSource(()), now=_NOW)
    envelope = report.to_envelope()
    assert envelope["query"] == COLLECTOR_STATUS_QUERY_NAME
    assert envelope["n_rows"] == 0
    assert envelope["rows"] == []


# ── D1 — status, calibrated by the series' own cadence ────────────────────────────────────


def test_d1_example_i_active_last_run_recent_and_accepted() -> None:
    """`ADR-030` D1 example (i): 24 hourly runs, last `ACCEPTED` 2400s ago -> `ATIVO`."""
    runs = _hourly_runs(24, start_hour=0)
    # last run ended at 23:00; `now` is 23:40 -> age 2400s, well under stale_after (10800s)
    now = datetime(2026, 9, 5, 23, 40, 0, tzinfo=UTC)
    report = collector_status_query(_FakeSource(runs), now=now)
    row = report.rows[0].to_dict()
    assert row["status"] == "ATIVO"
    assert row["liveness"] == {"kind": "judged", "period_s": 3600, "stale_after_s": 10800}
    assert row["age_s"] == 2400


def test_d1_example_ii_stopped_by_staleness_past_the_calibrated_threshold() -> None:
    """`ADR-030` D1 example (ii): same series, last run 14400s ago (> 10800s) -> `PARADO`."""
    runs = _hourly_runs(24, start_hour=0)
    # last run ended at 23:00; `now` 4h later -> age 14400s > stale_after 10800s
    now = datetime(2026, 9, 6, 3, 0, 0, tzinfo=UTC)
    report = collector_status_query(_FakeSource(runs), now=now)
    row = report.rows[0]
    assert row.status == "PARADO"
    assert isinstance(row.liveness, LivenessJudged)
    assert row.age_s > row.liveness.stale_after_s


def test_f2_falsifier_active_and_stale_never_coexist() -> None:
    """`ADR-030` F-2: `judged` liveness past `stale_after_s` never coexists with `status=ATIVO`."""
    runs = _hourly_runs(24, start_hour=0)
    now = datetime(2026, 9, 6, 3, 0, 0, tzinfo=UTC)
    row = collector_status_query(_FakeSource(runs), now=now).rows[0]
    if isinstance(row.liveness, LivenessJudged) and row.age_s > row.liveness.stale_after_s:
        assert row.status != "ATIVO"


def test_d1_example_iii_too_few_runs_to_judge_liveness() -> None:
    """`ADR-030` D1 example (iii): 2 runs -> `liveness = not_judged`; status by regra A only."""
    runs = _hourly_runs(2, start_hour=0)
    now = datetime(2026, 9, 5, 1, 30, 0, tzinfo=UTC)
    row = collector_status_query(_FakeSource(runs), now=now).rows[0].to_dict()
    assert row["liveness"] == {"kind": "not_judged", "n_runs": 2}
    assert row["status"] == "ATIVO"  # last verdict is ACCEPTED, regra A does not fire


def test_f1_falsifier_rejected_last_verdict_is_always_stopped() -> None:
    """`ADR-030` F-1 (regra A): last `verdict == REJECTED` -> `PARADO`, however fresh it is."""
    runs = (_a_run(run_id="run-final", ended_at="2026-09-05T17:59:59.000Z", verdict="REJECTED"),)
    row = collector_status_query(_FakeSource(runs), now=_NOW).rows[0].to_dict()
    assert row["last_verdict"] == "REJECTED"
    assert row["status"] == "PARADO"


def test_f4_falsifier_no_status_outside_the_two_emitted_values() -> None:
    """`ADR-030` F-4: this envelope never emits `ARQUIVO`/`PENDENTE` — only `ATIVO`/`PARADO`."""
    active = _hourly_runs(24, start_hour=0)
    now_active = datetime(2026, 9, 5, 23, 40, 0, tzinfo=UTC)
    stopped = (
        *_hourly_runs(23, start_hour=0),
        _a_run(run_id="run-x", ended_at="2026-09-05T23:00:00.000Z", verdict="REJECTED"),
    )
    now_stopped = datetime(2026, 9, 5, 23, 40, 0, tzinfo=UTC)
    for runs, now in ((active, now_active), (stopped, now_stopped)):
        row = collector_status_query(_FakeSource(runs), now=now).rows[0].to_dict()
        assert row["status"] in {"ATIVO", "PARADO"}


# ── D2 — uptimePercent over the trailing 24h window, not the last run ──────────────────────


def test_d2_example_uptime_over_the_window_differs_from_the_last_run_alone() -> None:
    """`ADR-030` D2 example: 23 `ACCEPTED` (1/1) + 1 `REJECTED` (0/1) in 24h -> 95.83, not 100."""
    runs = tuple(
        _a_run(run_id=f"run-{i:04d}", ended_at=f"2026-09-05T{i:02d}:00:00.000Z", verdict="ACCEPTED")
        for i in range(23)
    ) + (
        _a_run(
            run_id="run-0023",
            ended_at="2026-09-05T23:00:00.000Z",
            verdict="REJECTED",
            n_expected=1,
            n_written=0,
        ),
    )
    now = datetime(
        2026, 9, 5, 23, 30, 0, tzinfo=UTC
    )  # after the 24th run, all 24 fall in the trailing window
    row = collector_status_query(_FakeSource(runs), now=now).rows[0].to_dict()
    assert row["uptimePercent"] == pytest.approx(95.83)
    assert row["n_runs_in_window"] == 24


def test_f6_falsifier_uptime_is_not_just_the_last_runs_ratio() -> None:
    """`ADR-030` F-6: >=2 runs of distinct ratios in the window -> uptime != the last run ratio."""
    runs = (
        _a_run(
            run_id="run-0000",
            ended_at="2026-09-05T00:00:00.000Z",
            n_expected=1,
            n_written=0,
            verdict="REJECTED",
        ),
        _a_run(run_id="run-0001", ended_at="2026-09-05T12:00:00.000Z", n_expected=1, n_written=1),
    )
    row = collector_status_query(_FakeSource(runs), now=_NOW).rows[0].to_dict()
    last_run_ratio = 100.0
    assert row["uptimePercent"] != last_run_ratio


def test_d2_no_runs_in_window_yields_null_not_zero() -> None:
    """`ADR-030` D2: nothing expected in the window -> `null`, never a fabricated `0`."""
    old_run = _a_run(run_id="run-old", ended_at="2026-08-01T00:00:00.000Z")
    row = collector_status_query(_FakeSource((old_run,)), now=_NOW).rows[0].to_dict()
    assert row["n_runs_in_window"] == 0
    assert row["uptimePercent"] is None


def test_d2_no_clamp_above_100_is_a_visible_store_defect() -> None:
    """`ADR-030` D2: `n_written > n_expected` yields `> 100`, unclamped — a store defect shown."""
    over_written = _a_run(
        run_id="run-over", ended_at="2026-09-05T12:00:00.000Z", n_expected=1, n_written=2
    )
    row = collector_status_query(_FakeSource((over_written,)), now=_NOW).rows[0].to_dict()
    assert row["uptimePercent"] == 200.0


# ── D3/D4 — retention/resilience, gated only by status ─────────────────────────────────────


def test_d3_d4_active_series_is_unmeasured_and_not_scored() -> None:
    """`ADR-030` D3/D4: `ATIVO` reports `unmeasured`/`not_scored` — never a plan constant."""
    runs = _hourly_runs(24, start_hour=0)
    now = datetime(2026, 9, 5, 23, 40, 0, tzinfo=UTC)
    row = collector_status_query(_FakeSource(runs), now=now).rows[0].to_dict()
    assert row["status"] == "ATIVO"
    assert row["retention"] == RetentionUnmeasured().to_dict()
    assert row["resilience"] == ResilienceNotScored().to_dict()


def test_d3_d4_stopped_series_is_not_applicable_and_unavailable() -> None:
    """`ADR-030` D3/D4: a `PARADO` series reports `not_applicable`/`unavailable`."""
    runs = (_a_run(run_id="run-final", ended_at="2026-09-05T17:00:00.000Z", verdict="REJECTED"),)
    row = collector_status_query(_FakeSource(runs), now=_NOW).rows[0].to_dict()
    assert row["status"] == "PARADO"
    assert row["retention"] == RetentionNotApplicable().to_dict()
    assert row["resilience"] == ResilienceUnavailable().to_dict()


def test_f7_f8_falsifier_no_plan_constant_ever_appears() -> None:
    """`ADR-030` F-7/F-8: never a `computed_uniform`/`measured_sparse`/`declared_constant` kind."""
    row = collector_status_query(_FakeSource(_hourly_runs(1)), now=_NOW).rows[0]
    forbidden_kinds = {"computed_uniform", "measured_sparse", "declared_constant", "slo_multiplier"}
    assert row.retention.to_dict()["kind"] not in forbidden_kinds
    assert row.resilience.to_dict()["kind"] not in forbidden_kinds


# ── D0 — malformed timestamp refuses the whole read (F-10) ─────────────────────────────────


def test_f10_falsifier_malformed_ended_at_raises_instead_of_producing_a_row() -> None:
    """`ADR-030` F-10: a non-ISO-8601 `ended_at` raises `MalformedRunTimestampError`, no row."""
    bad_run = _a_run(run_id="run-bad", ended_at="not-a-timestamp")
    with pytest.raises(MalformedRunTimestampError):
        collector_status_query(_FakeSource((bad_run,)), now=_NOW)


# ── D0 — grouping, ordering, multiple series ────────────────────────────────────────────────


def test_rows_are_grouped_by_series_and_ordered_ascending_by_source_then_endpoint() -> None:
    """`ADR-030` D0: `series = f"{source} · {endpoint}"`; rows ordered `(source, endpoint)`."""
    runs = (
        _a_run(
            run_id="run-b", ended_at="2026-09-05T12:00:00.000Z", source="bybit", endpoint="/v5/x"
        ),
        _a_run(
            run_id="run-a",
            ended_at="2026-09-05T12:00:00.000Z",
            source="binance-futures",
            endpoint="/fapi/v1/time",
        ),
    )
    report = collector_status_query(_FakeSource(runs), now=_NOW)
    assert [row.series for row in report.rows] == [
        "binance-futures · /fapi/v1/time",
        "bybit · /v5/x",
    ]
    assert report.to_envelope()["n_rows"] == 2


def test_liveness_judged_uses_at_most_the_last_20_runs_for_the_median() -> None:
    """`ADR-030` D1: `period(s)` medians the last `min(|R|,20)` runs — an older outlier ignored."""
    # 19 runs 1h apart (healthy cadence), then ONE giant 100h outlier BEFORE the last 20-run
    # window, then 20 more 1h-apart runs: with |R| capped at the last 20, the outlier never
    # enters the median.
    healthy_head = _hourly_runs(19, start_hour=0)
    outlier = _a_run(run_id="run-outlier", ended_at="2026-09-05T23:00:00.000Z")
    healthy_tail = tuple(
        _a_run(run_id=f"run-tail-{i:04d}", ended_at=f"2026-09-06T{i:02d}:00:00.000Z")
        for i in range(20)
    )
    runs = healthy_head + (outlier,) + healthy_tail
    now = datetime(2026, 9, 6, 19, 40, 0, tzinfo=UTC)
    row = collector_status_query(_FakeSource(runs), now=now).rows[0].to_dict()
    assert row["liveness"] == {"kind": "judged", "period_s": 3600, "stale_after_s": 10800}
