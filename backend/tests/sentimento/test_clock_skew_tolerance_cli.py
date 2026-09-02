"""`infra/clock_skew_tolerance_cli.py`: reports a calibration, or refuses, as one JSON line."""

from __future__ import annotations

import json
import logging
from pathlib import Path

import pytest

from src.modules.sentimento.domain.clock_skew import ClockSkewSample, ServerTimeObservation
from src.modules.sentimento.infra import clock_skew_tolerance_cli
from src.modules.sentimento.infra.clock_skew_tolerance_reader import IngestRunClockSkewSource
from src.modules.sentimento.infra.ntp_skew_probe_cli import iso_ms
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore
from src.modules.sentimento.use_cases.persist_ntp_skew_run import build_ntp_skew_run

_MS_PER_DAY = 24 * 60 * 60 * 1000


def _persist_run(
    store: SqliteIngestRecordStore, run_id: str, skew_ms: int, started_at_ms: int
) -> None:
    """Persist one `md.ingest_run` row whose `clock_skew_ms` is exactly `skew_ms`."""
    sample = ClockSkewSample(
        local_time_before_ms=started_at_ms,
        local_time_after_ms=started_at_ms + 400,
        server_time_ms=started_at_ms + 200 - skew_ms,
    )
    observation = ServerTimeObservation(
        server_time_ms=sample.server_time_ms,
        http_status=200,
        weight_used=1,
        body_sha256="b" * 64,
    )
    run = build_ntp_skew_run(
        run_id=run_id,
        sample=sample,
        observation=observation,
        started_at=iso_ms(started_at_ms),
        ended_at=iso_ms(started_at_ms + 400),
    )
    store.record_run(run)


def test_report_on_the_real_5_run_t038_store_refuses(tmp_path: Path) -> None:
    """Fed a store shaped like the 5 REAL `T-03.8` runs (~7s apart), the CLI REFUSES.

    This is the falsifier this task's DoD asks for by name: given the data that actually
    exists today, the mechanism must say "insufficient", not print a fabricated number.
    """
    store = SqliteIngestRecordStore(tmp_path / "ingest.sqlite3")
    store.initialise()
    base = 1_788_303_924_951
    for i, skew in enumerate((-69, -69, -73, -66, -23)):
        _persist_run(store, f"ntp-skew-real-{i}", skew, base + i * 1_700)

    summary = clock_skew_tolerance_cli.report(IngestRunClockSkewSource(store))

    assert summary["calibrated"] is False
    assert "day" in str(summary["reason"])


def test_report_on_a_simulated_8_day_spread_calibrates(tmp_path: Path) -> None:
    """SIMULATED: runs spread over 8 days calibrate a real `tolerance_ms`."""
    store = SqliteIngestRecordStore(tmp_path / "ingest.sqlite3")
    store.initialise()
    base = 1_788_000_000_000
    for i, skew in enumerate((-10, -20, -30, -40, -50)):
        _persist_run(store, f"ntp-skew-sim-{i}", skew, base + i * (8 * _MS_PER_DAY // 4))

    summary = clock_skew_tolerance_cli.report(IngestRunClockSkewSource(store))

    assert summary["calibrated"] is True
    assert summary["tolerance_ms"] == 50
    assert summary["sample_n"] == 5


def test_report_logs_exactly_one_json_line(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """The product output this CLI promises: one parseable line, matching what `report` returns."""
    store = SqliteIngestRecordStore(tmp_path / "ingest.sqlite3")
    store.initialise()

    with caplog.at_level(logging.INFO, logger=clock_skew_tolerance_cli.logger.name):
        summary = clock_skew_tolerance_cli.report(IngestRunClockSkewSource(store))

    assert len(caplog.messages) == 1
    assert json.loads(caplog.messages[0]) == summary
    assert summary["calibrated"] is False


def test_main_requires_exactly_one_argument() -> None:
    """No store path, or more than one, refuses to even run."""
    with pytest.raises(SystemExit):
        clock_skew_tolerance_cli.main([])


def test_main_runs_end_to_end_against_a_real_sqlite_store(tmp_path: Path) -> None:
    """Composition root wired for real: it initialises the store and returns `0`."""
    store_path = tmp_path / "ingest.sqlite3"

    exit_code = clock_skew_tolerance_cli.main([str(store_path)])

    assert exit_code == 0
    assert store_path.exists()
