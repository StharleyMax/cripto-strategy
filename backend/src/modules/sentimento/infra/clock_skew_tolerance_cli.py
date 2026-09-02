"""CLI: calibrate `clock_skew_tolerance_ms` from a real `md.ingest_run` store, or refuse."""

# Same stream contract as `infra/ingest_health_cli.py`: product on `stdout`, one JSON line,
# diagnostics on `stderr`. The refusal (`InsufficientClockSkewCalibrationDataError`) is NOT an
# error this CLI hides behind a traceback — `D7.18` explicitly wants the refusal to be visible
# and explicit ("dado insuficiente para calibracao real, ainda nao sao 7 dias"), so `main`
# catches it and reports it the same shape it would report a calibrated tolerance, distinguished
# by `"calibrated": false`. Exit code stays `0`: refusing is the mechanism doing its job
# correctly, not a fault the shell should treat as failure.

from __future__ import annotations

import json
import logging
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Final, TextIO

from src.modules.sentimento.domain.clock_skew_tolerance import (
    InsufficientClockSkewCalibrationDataError,
)
from src.modules.sentimento.infra.clock_skew_tolerance_reader import IngestRunClockSkewSource
from src.modules.sentimento.infra.ingest_health_cli import (
    build_stream_handler,
    route_diagnostics_away_from_the_product_stream,
)
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore
from src.modules.sentimento.use_cases.calibrate_clock_skew_tolerance import (
    ClockSkewHistorySource,
    calibrate_clock_skew_tolerance_from_history,
)

logger = logging.getLogger(__name__)

_STABLE_FORMAT: Final[str] = "%(message)s"
_USAGE: Final[str] = "uso: clock_skew_tolerance_cli <caminho-do-store>"


def build_stdout_handler(stream: TextIO | None = None) -> logging.StreamHandler[TextIO]:
    """Build the handler for the product line on `stdout` — same shape as `ingest_health_cli`."""
    return build_stream_handler(stream or sys.stdout, _STABLE_FORMAT)


def report(source: ClockSkewHistorySource) -> dict[str, object]:
    """Calibrate from `source`, log the one product line, and return it for the caller to hash.

    Returning the dict `run()`-style (`ntp_skew_probe_cli.run`) rather than only logging is what
    lets a test assert on the exact structure without capturing a stream.
    """
    try:
        tolerance = calibrate_clock_skew_tolerance_from_history(source)
    except InsufficientClockSkewCalibrationDataError as error:
        summary: dict[str, object] = {"calibrated": False, "reason": str(error)}
    else:
        summary = {
            "calibrated": True,
            "tolerance_ms": tolerance.tolerance_ms,
            "stat_name": tolerance.stat_name,
            "sample_n": tolerance.sample_n,
            "span_days": tolerance.span_days,
        }
    logger.info(json.dumps(summary, sort_keys=True))
    return summary


def main(argv: Sequence[str]) -> int:
    """Wire the real store and report the calibration (or the refusal) for it.

    Composition root: diagnostics move off `stdout` before anything can log, matching
    `infra/ingest_health_cli.py`'s ordering and the defect it documents.
    """
    if len(argv) != 1:
        raise SystemExit(_USAGE)
    route_diagnostics_away_from_the_product_stream()
    logger.setLevel(logging.INFO)
    logger.addHandler(build_stdout_handler())
    logger.propagate = False
    store = SqliteIngestRecordStore(Path(argv[0]))
    store.initialise()
    report(IngestRunClockSkewSource(store))
    return 0


if __name__ == "__main__":  # pragma: no cover - composition root, exercised by subprocess
    raise SystemExit(main(sys.argv[1:]))
