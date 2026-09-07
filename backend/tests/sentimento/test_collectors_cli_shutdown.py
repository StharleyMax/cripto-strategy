"""`T-01.5` / `D1.8`: `SIGTERM` closes the session and exits `0`; `SIGKILL` records nothing."""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import tempfile
import time
from collections.abc import Callable
from datetime import datetime
from pathlib import Path

from src.modules.sentimento.domain.premium_index_batch import PREMIUM_INDEX_ENDPOINT
from src.modules.sentimento.infra import collectors_cli
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DRIVER = BACKEND_ROOT / "tests" / "helpers" / "collectors_cli_driver.py"
_POLL_S = 0.02
_READY_DEADLINE_S = 20.0


def _wait_until(
    predicate: Callable[[], bool], deadline_s: float, process: subprocess.Popen[bytes]
) -> None:
    """Poll `predicate` until true, failing loud if the driver dies or the deadline passes."""
    deadline = time.monotonic() + deadline_s
    while not predicate():
        assert process.poll() is None, "the driver exited before the expected state was reached"
        assert time.monotonic() < deadline, "the driver made no progress before the deadline"
        time.sleep(_POLL_S)


def test_sigterm_closes_the_session_and_exits_zero_with_a_run_recorded(tmp_path: Path) -> None:
    """`SIGTERM` -> `rc=0`, and the `!forceOrder@arr` SESSION closes with a finite `ended_at`.

    The premium-index thread also completes ONE cycle immediately at start (its interval is set
    far larger than this test's window, `collectors_cli_driver.py`) — its `ACCEPTED` run is the
    READINESS signal this test polls for, so `SIGTERM` is sent only once both threads are
    demonstrably alive, never against a process still mid-boot.
    """
    store_path = tmp_path / "record.sqlite3"
    environment = dict(os.environ, PYTHONPATH=str(BACKEND_ROOT))
    process = subprocess.Popen(
        [sys.executable, str(DRIVER), str(store_path)],
        cwd=str(BACKEND_ROOT),
        env=environment,
    )
    observer = SqliteIngestRecordStore(store_path)
    try:
        _wait_until(
            lambda: any(run.endpoint == PREMIUM_INDEX_ENDPOINT for run in observer.runs()),
            _READY_DEADLINE_S,
            process,
        )
        process.send_signal(signal.SIGTERM)
        process.wait(timeout=30)
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=30)

    assert process.returncode == 0, f"SIGTERM must exit 0, got {process.returncode}"

    runs = SqliteIngestRecordStore(store_path).runs()
    force_order_runs = [run for run in runs if run.endpoint == collectors_cli.FORCE_ORDER_ENDPOINT]
    assert len(force_order_runs) == 1, (
        f"expected exactly one !forceOrder@arr session closed by SIGTERM, "
        f"got {len(force_order_runs)}"
    )
    closed = force_order_runs[0]
    # `ended_at` finite: it parses as a real ISO-8601 instant, not an empty or sentinel string.
    datetime.fromisoformat(closed.started_at)
    datetime.fromisoformat(closed.ended_at)
    assert closed.verdict in ("ACCEPTED", "ACCEPTED_WITH_WARNING", "REJECTED")
    assert closed.verdict == "ACCEPTED", "a clean SIGTERM close must not be REJECTED"


def test_sigkill_records_no_new_run() -> None:
    """`SIGKILL` cannot be caught: no shutdown code runs, so no session-close run is recorded.

    Morde: were `run()`'s `SIGTERM` handling to somehow fire on `SIGKILL` too (impossible in
    CPython, but this is the falsifier this test exists to make executable rather than assumed),
    a run would appear here and this assertion would catch it.
    """
    with tempfile.TemporaryDirectory() as tmp:
        store_path = Path(tmp) / "record.sqlite3"
        environment = dict(os.environ, PYTHONPATH=str(BACKEND_ROOT))
        process = subprocess.Popen(
            [sys.executable, str(DRIVER), str(store_path)],
            cwd=str(BACKEND_ROOT),
            env=environment,
        )
        try:
            process.kill()
        finally:
            process.wait(timeout=30)

        assert process.returncode != 0, "SIGKILL has to show up in the exit code"
        runs = SqliteIngestRecordStore(store_path).runs()
        assert runs == (), f"SIGKILL must leave no session-close run behind, found {len(runs)}"
