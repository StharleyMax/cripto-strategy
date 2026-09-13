"""The safety net must be ARMED before it is REPORTED — a raising log cannot disarm it.

`collectors_cli._supervised` does two different things when a collector thread dies: it MUTATES
supervisor state (`exit_code[0] = 1`, `failure_event.set()`) and it REPORTS the death
(`logger.critical("collector_thread_died", ...)`). Only the mutation ends the process; the log is
a report of it. While the log came first, any raise from inside `logging` skipped the mutation
entirely and put the process straight back into the `2026-09-11T19:53` outage — thread dead,
`run()`'s main loop still sleeping on `stop`/`failure`, `docker inspect` still `running=true`,
`exit=0`, `restarts=0`, for 18 h 45 min, with `restart: unless-stopped` never firing.

That is not a hypothetical ordering worry, and this file exists because it already happened here:
the first version of the handler passed `extra={"thread": ...}`, `thread` is a RESERVED
`LogRecord` attribute, and `logging.makeRecord` answered with `KeyError: Attempt to overwrite
'thread' in LogRecord` — raised from INSIDE the last-resort net, killing the net with its own log
line. The key was renamed, but the rename only removed ONE way for that call to raise. `logging`
can still raise for reasons this module does not own: a handler whose stream is closed, an
operator's own filter or formatter, a `queue.Full` on a `QueueHandler`.

The test therefore rigs `logger.critical` to raise (a filter, not a handler — `Handler.emit`
failures are swallowed by `handleError` and never reach the caller) and asserts the only thing
that matters: the process still exits `rc != 0`.

Falsifier this test makes executable: put `logger.critical(...)` back ABOVE the
`exit_code[0] = 1` / `failure_event.set()` pair in `collectors_cli._supervised`. The whole rest
of the suite stays green — `test_collectors_cli_run_exit_code_subprocess.py` and
`test_collectors_cli_every_thread_death_exits.py` included, because their logging never raises —
and THIS test hangs until `_TIMEOUT_S` and fails, because the subprocess never exits at all.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from tests.helpers.collectors_cli_thread_kill_driver import BREAK_LOGGING, KLINES

BACKEND_ROOT = Path(__file__).resolve().parents[2]
DRIVER = BACKEND_ROOT / "tests" / "helpers" / "collectors_cli_thread_kill_driver.py"
_TIMEOUT_S = 40.0


def test_the_process_still_exits_when_the_critical_log_itself_raises(tmp_path: Path) -> None:
    """A thread dies AND the net's own `critical` call raises; the process must still exit 1."""
    environment = dict(os.environ, PYTHONPATH=str(BACKEND_ROOT), PYTHONDONTWRITEBYTECODE="1")
    process = subprocess.Popen(
        [
            sys.executable,
            str(DRIVER),
            str(tmp_path / "record.sqlite3"),
            KLINES,
            "operational",
            BREAK_LOGGING,
        ],
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
        "a collector thread died and `logger.critical` raised while reporting it, and the "
        f"process was STILL ALIVE after {_TIMEOUT_S}s — the net was reported before it was "
        "armed, which is the 18h45 outage with an extra step"
    )
    assert process.returncode != 0, (
        "the supervisor mutation must happen BEFORE the log, so a raising log cannot stop the "
        f"process from exiting non-zero; got {process.returncode}"
    )
    assert process.returncode == 1, (
        f"`_supervised` sets `exit_code[0] = 1`; the process rc must be that same 1, got "
        f"{process.returncode}"
    )
