"""`T-01.5` QA `NEEDS_FIX` (round 2): `run()`'s `return exit_code[0]` must reach the process `rc`.

The REAL process `returncode` a shell/systemd/supervisor actually observes — not just an
in-process return value. The QA gate that reopened this task falsified `run()` directly: mutating
`collectors_cli.py:627`'s `return exit_code[0]` to `return 0` passed all 17
`-k collectors_cli` tests unchanged, because `test_collectors_cli_publish_failure.py` calls
`_run_force_order_collector`/`_run_premium_index_collector` directly — it never calls `run()`
itself, so that mutation was invisible to it. `test_collectors_cli_shutdown.py` DOES run `run()`
as a real subprocess (via `collectors_cli_driver.py`), but only exercises the CLEAN `SIGTERM`/
`SIGKILL` paths, where `exit_code[0]` never leaves `0` — so it can't distinguish `return
exit_code[0]` from `return 0` either.

This test closes that gap: same real-`XADD`-failure technique as
`test_collectors_cli_publish_failure.py` (a real, loopback-only `fakeredis.TcpFakeServer`, its
stream key clobbered with `SET` before anything publishes, so `XADD` genuinely answers
`WRONGTYPE`) — but driven through `collectors_cli_driver.py`'s new `force-publish-failure` mode
as a REAL OS subprocess (`subprocess.Popen`), asserting `process.returncode`, not an in-process
observation.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from src.modules.sentimento.domain.premium_index_batch import PREMIUM_INDEX_ENDPOINT
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DRIVER = BACKEND_ROOT / "tests" / "helpers" / "collectors_cli_driver.py"
_TIMEOUT_S = 30.0


def test_a_real_xadd_failure_propagates_to_the_process_returncode(tmp_path: Path) -> None:
    """A genuine `WRONGTYPE` `XADD`, in a REAL subprocess, must exit with `returncode == 1`.

    Falsifier this test makes executable: mutate `collectors_cli.run()`'s
    `return exit_code[0]` (line 627) to `return 0` — every existing `-k collectors_cli` test
    stays green, because none of them observes a process's `returncode`; THIS test's
    `assert process.returncode != 0` fails, because the subprocess would now exit `0` on a
    publish failure it itself recorded as `REJECTED`.
    """
    store_path = tmp_path / "record.sqlite3"
    environment = dict(os.environ, PYTHONPATH=str(BACKEND_ROOT))
    process = subprocess.Popen(
        [sys.executable, str(DRIVER), str(store_path), "force-publish-failure"],
        cwd=str(BACKEND_ROOT),
        env=environment,
    )
    try:
        process.wait(timeout=_TIMEOUT_S)
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=_TIMEOUT_S)

    assert process.returncode is not None, "the driver must have exited on its own"
    assert process.returncode != 0, (
        f"a real XADD WRONGTYPE failure must exit the process with rc != 0, "
        f"got {process.returncode}"
    )
    assert process.returncode == 1, (
        f"`run()` sets exit_code[0] = 1 on a publish failure; the process returncode must be "
        f"that same 1, got {process.returncode}"
    )

    runs = SqliteIngestRecordStore(store_path).runs()
    premium_index_runs = [run for run in runs if run.endpoint == PREMIUM_INDEX_ENDPOINT]
    assert len(premium_index_runs) == 1, (
        f"expected exactly one premiumIndex cycle recorded, got {len(premium_index_runs)}"
    )
    assert premium_index_runs[0].verdict == "REJECTED", (
        "the real XADD failure must have closed the cycle REJECTED"
    )


def test_a_thread_that_dies_unhandled_takes_the_whole_process_down(tmp_path: Path) -> None:
    """A collector thread killed by an UNHANDLED exception must exit the process `rc != 0`.

    This is the `2026-09-11T19:53` outage, made executable. Postgres shut down
    (`AdminShutdown`), the next `record_run` raised `psycopg.OperationalError: the connection
    is closed` inside `collector-klines` and `collector-premium-index`, and because
    `OperationalError` is neither an `OSError` nor a `ValueError` it is NOT in
    `collectors_cli._PUBLISH_FAILURE_EXCEPTIONS` — so it escaped every `except` the runners
    have. Python's default `threading.excepthook` printed `Exception in thread
    collector-klines` and the thread died; `run()`'s main loop, which only watches
    `stop`/`failure`, kept sleeping. `docker inspect` reported `running=true`, `exit=0`,
    `restarts=0` for 18 h 45 min of collecting nothing, and `restart: unless-stopped` never
    fired because nothing ever exited.

    The assertion that matters is as much about TERMINATING as about the code: in the unfixed
    tree this subprocess never exits at all, so a `TimeoutExpired` here IS the defect
    reproducing, not flakiness — which is why the timeout is asserted explicitly instead of
    being allowed to raise as an error.

    Falsifier this test makes executable: delete the `failure_event.set()` / `exit_code[0] = 1`
    pair from `collectors_cli._supervised` and this test goes back to hanging until
    `_TIMEOUT_S` and then failing. It is the mutation that 18 h 45 min of silence could not
    detect.
    """
    store_path = tmp_path / "record.sqlite3"
    environment = dict(os.environ, PYTHONPATH=str(BACKEND_ROOT))
    process = subprocess.Popen(
        [sys.executable, str(DRIVER), str(store_path), "thread-dies-unhandled"],
        cwd=str(BACKEND_ROOT),
        env=environment,
    )
    timed_out = False
    try:
        process.wait(timeout=_TIMEOUT_S)
    except subprocess.TimeoutExpired:
        timed_out = True
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=_TIMEOUT_S)

    assert not timed_out, (
        "a collector thread died of an unhandled psycopg.OperationalError and the process was "
        f"STILL ALIVE after {_TIMEOUT_S}s — this is the 18h45 outage: the thread dies, the "
        "process stays up, and `restart: unless-stopped` never fires"
    )
    assert process.returncode != 0, (
        "a collector thread killed by an unhandled exception must take the process down with a "
        f"non-zero code so the restart policy fires, got {process.returncode}"
    )
