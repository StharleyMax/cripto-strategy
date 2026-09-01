"""`persist_ntp_skew_run`: the row it builds, and the guard against a fabricated weight."""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.clock_skew import ClockSkewSample, ServerTimeObservation
from src.modules.sentimento.domain.ingest_record import KNOWN_VERDICTS, IngestRun
from src.modules.sentimento.domain.provenance import UNKNOWN_OBSERVER_REGION
from src.modules.sentimento.use_cases.persist_ntp_skew_run import (
    ENDPOINT,
    SOURCE,
    MissingUsedWeightError,
    build_ntp_skew_run,
    persist_ntp_skew_measurement,
)

_SAMPLE = ClockSkewSample(local_time_before_ms=1_000, local_time_after_ms=1_000, server_time_ms=700)
_OBSERVATION = ServerTimeObservation(
    server_time_ms=700, http_status=200, weight_used=2, body_sha256="a" * 64
)


class RecordingRecorder:
    """Records every `IngestRun` it was asked to persist, real store never involved."""

    def __init__(self) -> None:
        """Start with an empty record."""
        self.recorded: list[IngestRun] = []

    def record_run(self, run: IngestRun) -> None:
        """Append `run` to what was recorded."""
        self.recorded.append(run)


def test_the_built_run_carries_the_measured_skew_and_a_known_verdict() -> None:
    """The whole point of `T-03.8`: the persisted `clock_skew_ms` is the MEASURED one."""
    run = build_ntp_skew_run(
        run_id="ntp-skew-0001",
        sample=_SAMPLE,
        observation=_OBSERVATION,
        started_at="2026-09-01T00:00:00.000Z",
        ended_at="2026-09-01T00:00:00.010Z",
    )

    assert run.clock_skew_ms == _SAMPLE.skew_ms() == 300
    assert run.source == SOURCE == "binance-futures"
    assert run.endpoint == ENDPOINT == "/fapi/v1/time"
    assert run.verdict in KNOWN_VERDICTS
    assert run.observer_region == UNKNOWN_OBSERVER_REGION
    assert run.weight_used == 2
    assert run.api_code == 200
    assert run.src_sha256 == "a" * 64
    assert run.n_expected == run.n_returned == run.n_written == 1
    assert run.window == "2026-09-01T00:00:00.000Z/2026-09-01T00:00:00.010Z"


def test_a_missing_weight_header_refuses_the_row_instead_of_guessing_one() -> None:
    """The falsifier: `weight_used=None` must never become a made-up integer on the row."""
    unweighed = ServerTimeObservation(
        server_time_ms=700, http_status=200, weight_used=None, body_sha256="b" * 64
    )

    with pytest.raises(MissingUsedWeightError, match="refusing to persist a fabricated"):
        build_ntp_skew_run(
            run_id="ntp-skew-0002",
            sample=_SAMPLE,
            observation=unweighed,
            started_at="2026-09-01T00:00:00.000Z",
            ended_at="2026-09-01T00:00:00.010Z",
        )


def test_persist_writes_exactly_once_and_returns_the_written_row() -> None:
    """No double writes, and the caller gets back the SAME row that reached the recorder."""
    recorder = RecordingRecorder()

    written = persist_ntp_skew_measurement(
        recorder,
        run_id="ntp-skew-0003",
        sample=_SAMPLE,
        observation=_OBSERVATION,
        started_at="2026-09-01T00:00:00.000Z",
        ended_at="2026-09-01T00:00:00.010Z",
    )

    assert recorder.recorded == [written]
    assert written.run_id == "ntp-skew-0003"


def test_a_missing_weight_never_reaches_the_recorder() -> None:
    """The guard has to fire BEFORE the write, not after — a store must never see the bad row."""
    recorder = RecordingRecorder()
    unweighed = ServerTimeObservation(
        server_time_ms=700, http_status=200, weight_used=None, body_sha256="c" * 64
    )

    with pytest.raises(MissingUsedWeightError):
        persist_ntp_skew_measurement(
            recorder,
            run_id="ntp-skew-0004",
            sample=_SAMPLE,
            observation=unweighed,
            started_at="2026-09-01T00:00:00.000Z",
            ended_at="2026-09-01T00:00:00.010Z",
        )

    assert recorder.recorded == []
