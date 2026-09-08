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
