"""QA of the wave: EACH of the four collector threads, killed alone, must take the process down.

`test_collectors_cli_run_exit_code_subprocess.py::test_a_thread_that_dies_unhandled_takes_the_
whole_process_down` proves the supervisor for whichever thread reaches `record_run` first, and
`run()` wraps four threads in four separate `_supervised(...)` calls. One unwrapped call site is
invisible to a test that only needs ONE thread to die, and that is exactly the 18h45 outage's
shape: the process stays up and `restart: unless-stopped` never fires.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

from tests.helpers.collectors_cli_thread_kill_driver import THREAD_NAMES

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DRIVER = BACKEND_ROOT / "tests" / "helpers" / "collectors_cli_thread_kill_driver.py"
_TIMEOUT_S = 40.0


@pytest.mark.parametrize("thread_name", THREAD_NAMES)
def test_each_collector_thread_death_exits_the_process(thread_name: str, tmp_path: Path) -> None:
    """Kill one named thread with an unlisted exception; the process must exit `rc != 0`."""
    environment = dict(os.environ, PYTHONPATH=str(BACKEND_ROOT), PYTHONDONTWRITEBYTECODE="1")
    process = subprocess.Popen(
        [sys.executable, str(DRIVER), str(tmp_path / "record.sqlite3"), thread_name],
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
        f"{thread_name} died of an unhandled exception and the process was STILL ALIVE after "
        f"{_TIMEOUT_S}s — the 18h45 outage, for this thread"
    )
    assert process.returncode != 0, (
        f"{thread_name} died and the process exited {process.returncode}; the restart policy "
        "only fires on a non-zero exit"
    )
