"""`infra/ntp_skew_probe_cli.py` wired offline: fake network, REAL `SqliteIngestRecordStore`.

The composition root (`main`) is exercised only for its argument parsing and wiring; the actual
measurement runs through `run()` with injected ports, the same split `infra/quota_ramp_cli.py`
uses for its live network call.
"""

from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path
from typing import Any

import psycopg
import pytest

from src.modules.sentimento.domain.clock_skew import ServerTimeObservation
from src.modules.sentimento.infra import ntp_skew_probe_cli
from src.modules.sentimento.infra.postgres_ingest_record_store import PostgresIngestRecordStore
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore


class ScriptedServerTimeSource:
    """Hands back one canned `ServerTimeObservation`, no network involved."""

    def __init__(self, observation: ServerTimeObservation) -> None:
        """Take the canned observation to hand back on every call."""
        self._observation = observation

    def observe(self) -> ServerTimeObservation:
        """Return the canned observation."""
        return self._observation


class ScriptedWallClock:
    """Hands back readings from a queue, in order."""

    def __init__(self, readings: list[int]) -> None:
        """Take the queue of readings to hand back, oldest first."""
        self._readings = list(readings)

    def now_ms(self) -> int:
        """Pop and return the next reading."""
        return self._readings.pop(0)


def _args(tmp_path: Path, run_id: str | None = None) -> argparse.Namespace:
    argv = ["--store", str(tmp_path / "ingest.sqlite3")]
    if run_id is not None:
        argv += ["--run-id", run_id]
    return ntp_skew_probe_cli.build_parser().parse_args(argv)


def test_iso_ms_renders_utc_with_millisecond_precision() -> None:
    """`D3.10`'s row stores `started_at`/`ended_at` as text — pin the exact shape written."""
    assert ntp_skew_probe_cli.iso_ms(1_788_303_016_165) == "2026-09-01T22:50:16.165Z"


def test_build_parser_requires_a_store_path() -> None:
    """A measurement nobody persists is not what `D3.10` asks for — refuse to even parse."""
    with pytest.raises(SystemExit):
        ntp_skew_probe_cli.build_parser().parse_args([])


def test_run_persists_the_measured_skew_into_a_real_sqlite_store(tmp_path: Path) -> None:
    """End to end except the socket: the row a SECOND process would read back is checked here."""
    store_path = tmp_path / "ingest.sqlite3"
    store = SqliteIngestRecordStore(store_path)
    store.initialise()
    observation = ServerTimeObservation(
        server_time_ms=1_000, http_status=200, weight_used=2, body_sha256="d" * 64
    )
    source = ScriptedServerTimeSource(observation)
    clock = ScriptedWallClock([1_300, 1_300])
    args = _args(tmp_path, run_id="ntp-skew-test-0001")

    summary = ntp_skew_probe_cli.run(args, source, clock, store)

    assert summary["clock_skew_ms"] == 300
    reopened = SqliteIngestRecordStore(store_path)
    persisted = reopened.runs()
    assert len(persisted) == 1
    assert persisted[0].run_id == "ntp-skew-test-0001"
    assert persisted[0].clock_skew_ms == 300
    assert persisted[0].source == "binance-futures"
    assert persisted[0].endpoint == "/fapi/v1/time"


def test_run_generates_a_distinct_run_id_when_none_is_given(tmp_path: Path) -> None:
    """Two probes run without `--run-id` must not collide on the same primary key."""
    store_path = tmp_path / "ingest.sqlite3"
    store = SqliteIngestRecordStore(store_path)
    store.initialise()
    observation = ServerTimeObservation(
        server_time_ms=1, http_status=200, weight_used=1, body_sha256="e" * 64
    )

    first = ntp_skew_probe_cli.run(
        _args(tmp_path), ScriptedServerTimeSource(observation), ScriptedWallClock([1, 1]), store
    )
    second = ntp_skew_probe_cli.run(
        _args(tmp_path), ScriptedServerTimeSource(observation), ScriptedWallClock([1, 1]), store
    )

    assert first["run_id"] != second["run_id"]
    assert len(store.runs()) == 2


def _fake_postgres_connection() -> psycopg.Connection[Any]:
    """Trivial double — `compose_ingest_record_store` never calls a method on it (T-02.4)."""
    return object()  # type: ignore[return-value]


def test_compose_store_defaults_to_sqlite_at_the_store_flag_path(tmp_path: Path) -> None:
    """Unset `INGEST_RECORD_BACKEND` keeps this CLI's ORIGINAL behaviour, unchanged (`T-03.8`)."""
    args = _args(tmp_path)

    store = ntp_skew_probe_cli._compose_store(args, {})

    assert isinstance(store, SqliteIngestRecordStore)
    assert store.path == Path(args.store)


def test_compose_store_honours_explicit_sqlite_backend_too(tmp_path: Path) -> None:
    """`INGEST_RECORD_BACKEND=sqlite` (explicit) is the SAME path as unset (`ADR-031/D1`)."""
    args = _args(tmp_path)

    store = ntp_skew_probe_cli._compose_store(args, {"INGEST_RECORD_BACKEND": "sqlite"})

    assert isinstance(store, SqliteIngestRecordStore)
    assert store.path == Path(args.store)


def test_compose_store_picks_postgres_and_ignores_the_store_flag(tmp_path: Path) -> None:
    """`T-03.8`: `postgres` composes the SAME engine `deploy/compose.yml` wires — not sqlite.

    `--store` is still required to parse (`build_parser`'s own contract, "refuse to even
    parse"), but its VALUE is irrelevant here — the falsifier for this test is a store built
    at `args.store` instead of `PostgresIngestRecordStore`, which is exactly the defect
    `docs/context/captura-em-producao/gates/CA-E2E-local.md` measured before this fix.
    """
    seen_conninfo: list[str] = []

    def _connect(conninfo: str) -> psycopg.Connection[Any]:
        seen_conninfo.append(conninfo)
        return _fake_postgres_connection()

    args = _args(tmp_path)
    environ = {
        "INGEST_RECORD_BACKEND": "postgres",
        "POSTGRES_DB": "test",
        "POSTGRES_USER": "test",
        "POSTGRES_PASSWORD": "test",
    }

    store = ntp_skew_probe_cli._compose_store(args, environ, connect=_connect)

    assert isinstance(store, PostgresIngestRecordStore)
    assert len(seen_conninfo) == 1, "postgres composition must open exactly one connection"


def test_run_logs_exactly_one_json_line_with_the_summary(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """The product output this CLI promises: one parseable line, matching what `run()` returns."""
    store = SqliteIngestRecordStore(tmp_path / "ingest.sqlite3")
    store.initialise()
    observation = ServerTimeObservation(
        server_time_ms=500, http_status=200, weight_used=3, body_sha256="f" * 64
    )
    args = _args(tmp_path, run_id="ntp-skew-log-test")

    with caplog.at_level(logging.INFO, logger=ntp_skew_probe_cli.logger.name):
        summary = ntp_skew_probe_cli.run(
            args, ScriptedServerTimeSource(observation), ScriptedWallClock([500, 500]), store
        )

    assert len(caplog.messages) == 1
    assert json.loads(caplog.messages[0]) == summary
