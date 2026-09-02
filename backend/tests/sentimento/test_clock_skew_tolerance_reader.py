"""`parse_iso_ms`/`IngestRunClockSkewSource`: `md.ingest_run` rows to `ClockSkewObservation`s."""

from __future__ import annotations

from pathlib import Path

from src.modules.sentimento.domain.clock_skew import ClockSkewSample, ServerTimeObservation
from src.modules.sentimento.domain.clock_skew_tolerance import ClockSkewObservation
from src.modules.sentimento.infra.clock_skew_tolerance_reader import (
    IngestRunClockSkewSource,
    parse_iso_ms,
)
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore
from src.modules.sentimento.use_cases.persist_ntp_skew_run import build_ntp_skew_run


def test_parse_iso_ms_inverts_ntp_skew_probe_cli_iso_ms() -> None:
    """`parse_iso_ms` is the exact inverse of `ntp_skew_probe_cli.iso_ms` (pinned there too)."""
    assert parse_iso_ms("2026-09-01T22:50:16.165Z") == 1_788_303_016_165


def test_parse_iso_ms_round_trips_a_real_t038_reading() -> None:
    """Round-trip one of the 5 REAL `started_at` values `T-03.8` actually persisted."""
    assert parse_iso_ms("2026-09-01T23:05:24.951Z") == 1_788_303_924_951


def test_observations_reads_every_run_in_the_store(tmp_path: Path) -> None:
    """Every `md.ingest_run` row carries a `clock_skew_ms` — the adapter reads ALL of them."""
    store = SqliteIngestRecordStore(tmp_path / "ingest.sqlite3")
    store.initialise()
    sample = ClockSkewSample(
        local_time_before_ms=1_788_303_924_951,
        local_time_after_ms=1_788_303_925_356,
        server_time_ms=1_788_303_925_020,
    )
    observation = ServerTimeObservation(
        server_time_ms=1_788_303_925_020, http_status=200, weight_used=1, body_sha256="a" * 64
    )
    run = build_ntp_skew_run(
        run_id="ntp-skew-reader-test",
        sample=sample,
        observation=observation,
        started_at="2026-09-01T23:05:24.951Z",
        ended_at="2026-09-01T23:05:25.356Z",
    )
    store.record_run(run)

    observations = IngestRunClockSkewSource(store).observations()

    assert observations == (
        ClockSkewObservation(clock_skew_ms=sample.skew_ms(), observed_at_ms=1_788_303_924_951),
    )


def test_observations_of_an_empty_store_is_empty(tmp_path: Path) -> None:
    """No runs persisted yet -> no observations, never a fabricated placeholder."""
    store = SqliteIngestRecordStore(tmp_path / "ingest.sqlite3")
    store.initialise()

    assert IngestRunClockSkewSource(store).observations() == ()
