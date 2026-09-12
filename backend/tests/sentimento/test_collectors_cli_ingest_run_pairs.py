"""`D1.5`/`CA-F1-4`: one short session + one cycle produce >= 2 `(source, endpoint)` pairs.

Runs the REAL `collectors_cli` composition (via `collectors_cli_driver.py`, the same subprocess
driver `test_collectors_cli_shutdown.py` uses for `D1.8`) against a fresh `SqliteIngestRecordStore`
file, then queries that file with the LITERAL `sqlite3` command the plan's `D1.5` names — not the
Python store, so the DoD number is produced by the exact command a reviewer can rerun by hand.
`md_ingest_run` is the on-disk table name (SQLite has no schema, `sqlite_ingest_record_store.py`'s
own header: "`md.ingest_run` becomes the table `md_ingest_run`") — the plan's `ingest_run` is the
logical name, not a second table.
"""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from collections.abc import Callable
from pathlib import Path

from src.modules.sentimento.domain.ingest_record import KNOWN_VERDICTS
from src.modules.sentimento.domain.premium_index_batch import PREMIUM_INDEX_ENDPOINT
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore
from src.modules.sentimento.use_cases.collector_run_mapping import (
    FORCE_ORDER_ENDPOINT,
    KLINES_ENDPOINT,
    OPEN_INTEREST_HIST_ENDPOINT,
)

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


def test_one_session_plus_one_cycle_group_by_source_endpoint_gives_at_least_two_pairs(
    tmp_path: Path,
) -> None:
    """`D1.5`, literal: before running, the store has NOTHING; after, `>= 2` distinct pairs.

    Morde: the SAME query run against the store file BEFORE the driver starts (it does not
    exist yet) is the "so `/fapi/v1/time`" baseline the plan's falsifier names — here it is "no
    rows at all", which is the stricter version of the same claim (this store never held an
    `ntp-skew-probe-cli` run to begin with).
    """
    store_path = tmp_path / "record.sqlite3"
    assert not store_path.exists(), "the store must not pre-exist — D1.5's 'before' baseline"

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

    # The literal command `D1.5` names, against the REAL on-disk table.
    query = "select source,endpoint,count(*) from md_ingest_run group by 1,2"
    output = subprocess.run(
        ["sqlite3", str(store_path), query], capture_output=True, text=True, check=True
    ).stdout
    pairs = [line for line in output.splitlines() if line.strip()]
    assert len(pairs) >= 2, f"D1.5 wants >= 2 (source,endpoint) pairs, sqlite3 returned: {pairs!r}"
    endpoints = {line.split("|")[1] for line in pairs}
    # FOUR producers since `T-03.3` (`SPEC-007` phase `03` added
    # `/futures/data/openInterestHist`), and the assertion stays an EQUALITY rather than
    # loosening to `>=`: a FIFTH endpoint appearing here would mean a producer started
    # recording runs that no task declared, which is exactly what this shape is for.
    assert endpoints == {
        FORCE_ORDER_ENDPOINT,
        PREMIUM_INDEX_ENDPOINT,
        KLINES_ENDPOINT,
        OPEN_INTEREST_HIST_ENDPOINT,
    }, f"expected exactly the four producer endpoints, got {endpoints!r}"

    # `D1.5`'s second half, same literal shape: zero rows outside `KNOWN_VERDICTS`.
    # `KNOWN_VERDICTS` is this repository's own closed, hardcoded frozenset — never external
    # input — so the interpolation below is not the SQL-injection shape `S608` warns about.
    verdict_list = ",".join(f"'{verdict}'" for verdict in sorted(KNOWN_VERDICTS))
    unknown_query = f"select count(*) from md_ingest_run where verdict not in ({verdict_list})"  # noqa: S608
    unknown_count = subprocess.run(
        ["sqlite3", str(store_path), unknown_query], capture_output=True, text=True, check=True
    ).stdout.strip()
    assert unknown_count == "0", f"a verdict outside KNOWN_VERDICTS leaked through: {unknown_count}"
