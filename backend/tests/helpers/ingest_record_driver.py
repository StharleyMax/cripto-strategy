"""Subprocess driver: a REAL recorder, so the test can `SIGKILL` it halfway through."""

from __future__ import annotations

import sys
import time
from pathlib import Path

from src.modules.sentimento.domain.ingest_record import IngestRun
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore


def build_run(index: int) -> IngestRun:
    """Build run number `index` — deterministic, so a restart can be checked field by field."""
    return IngestRun(
        run_id=f"run-{index:04d}",
        source="binance-futures",
        endpoint="/fapi/v1/openInterestHist",
        window=f"2026-08-{(index % 28) + 1:02d}T00:00:00Z/2026-08-{(index % 28) + 1:02d}T01:00:00Z",
        n_expected=12,
        n_returned=12,
        n_written=12,
        verdict="ACCEPTED",
        api_code=None,
        src_sha256=f"{index:064x}",
        weight_used=1,
        observer_id="observer-0",
        observer_region="sa-east-1",
        clock_skew_ms=index,
        started_at=f"2026-08-29T00:{index // 60:02d}:{index % 60:02d}Z",
        ended_at=f"2026-08-29T00:{index // 60:02d}:{index % 60:02d}Z",
    )


def main(argv: list[str]) -> int:
    """Record `total` runs into the store, pausing between them; return 0 only at the end."""
    store_path, total, delay_s = argv
    store = SqliteIngestRecordStore(Path(store_path))
    store.initialise()
    for index in range(int(total)):
        store.record_run(build_run(index))
        time.sleep(float(delay_s))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
