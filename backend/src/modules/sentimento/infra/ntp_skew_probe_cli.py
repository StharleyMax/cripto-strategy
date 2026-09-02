"""The bench for `T-03.8`: measure host clock skew against `/fapi/v1/time`, then persist it."""

# ── THIS IS NOT A TEST, SAME REASON AS `infra/quota_ramp_cli.py` ──────────────────────────
#
# `backend/scripts/test.sh` declares "ZERO REDE" and the suite runs with `socket` amputated. A
# live call to Binance cannot live there: it is a measurement taken once, by a human, from a
# known host. What the suite owns is the logic this module wires together —
# `use_cases/measure_clock_skew.py` and `use_cases/persist_ntp_skew_run.py` — both exercised
# offline through injected ports, the same way `run_quota_ramp` is.
#
# ── OUTPUT: ONE JSON LINE ON `stdout`, DIAGNOSTICS ON `stderr` ─────────────────────────────
#
# Same contract as `infra/ingest_health_cli.py` and `infra/quota_ramp_cli.py`.

from __future__ import annotations

import argparse
import json
import logging
import sys
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path

from src.modules.sentimento.infra.binance_server_time_probe import BinanceServerTimeProbe
from src.modules.sentimento.infra.ingest_health_cli import (
    build_stdout_handler,
    route_diagnostics_away_from_the_product_stream,
)
from src.modules.sentimento.infra.sqlite_ingest_record_store import SqliteIngestRecordStore
from src.modules.sentimento.infra.system_wall_clock import SystemWallClock
from src.modules.sentimento.use_cases.measure_clock_skew import (
    ServerTimeSource,
    WallClock,
    measure_clock_skew,
)
from src.modules.sentimento.use_cases.persist_ntp_skew_run import (
    IngestRunRecorder,
    persist_ntp_skew_measurement,
)

logger = logging.getLogger(__name__)


def iso_ms(epoch_ms: int) -> str:
    """Render an epoch-millisecond reading as ISO-8601 UTC, millisecond precision kept."""
    microsecond_precision = datetime.fromtimestamp(epoch_ms / 1000, tz=UTC).strftime(
        "%Y-%m-%dT%H:%M:%S.%f"
    )
    return microsecond_precision[:-3] + "Z"


def build_parser() -> argparse.ArgumentParser:
    """Declare the command line.

    `--store` is required: a measurement that is not persisted is not what `D3.10` asks for.
    """
    parser = argparse.ArgumentParser(
        prog="ntp_skew_probe_cli",
        description=(
            "Mede o skew do relogio local contra /fapi/v1/time e persiste em md.ingest_run "
            "(D3.10). A tolerancia NAO se calibra aqui — T-07.10."
        ),
    )
    parser.add_argument(
        "--store", type=Path, required=True, help="caminho do arquivo SQLite de md.ingest_run"
    )
    parser.add_argument("--run-id", default=None, help="default: um uuid4 novo por chamada")
    return parser


def run(
    args: argparse.Namespace,
    source: ServerTimeSource,
    clock: WallClock,
    recorder: IngestRunRecorder,
) -> dict[str, object]:
    """Measure once, persist the row, log the summary, and return it for the caller to use."""
    sample, observation = measure_clock_skew(source, clock)
    started_at = iso_ms(sample.local_time_before_ms)
    ended_at = iso_ms(sample.local_time_after_ms)
    run_id = str(args.run_id) if args.run_id else f"ntp-skew-{uuid.uuid4()}"
    ingest_run = persist_ntp_skew_measurement(
        recorder,
        run_id=run_id,
        sample=sample,
        observation=observation,
        started_at=started_at,
        ended_at=ended_at,
    )
    summary: dict[str, object] = {
        "run_id": ingest_run.run_id,
        "clock_skew_ms": ingest_run.clock_skew_ms,
        "round_trip_ms": sample.round_trip_ms,
        "server_time_ms": observation.server_time_ms,
        "local_time_before_ms": sample.local_time_before_ms,
        "local_time_after_ms": sample.local_time_after_ms,
        "http_status": observation.http_status,
        "weight_used": observation.weight_used,
        "started_at": started_at,
        "ended_at": ended_at,
    }
    logger.info(json.dumps(summary, sort_keys=True))
    return summary


def main(argv: Sequence[str]) -> int:
    """Compose the real probe, the real clock and the real store, then measure and persist.

    This is the composition root, and the order matters: diagnostics are pushed off `stdout`
    BEFORE anything can log, and only then does the product logger take `stdout` over
    (`infra/ingest_health_cli.py` documents the defect this order fixes).
    """
    args = build_parser().parse_args(list(argv))
    route_diagnostics_away_from_the_product_stream()
    logger.setLevel(logging.INFO)
    logger.addHandler(build_stdout_handler())
    logger.propagate = False
    store = SqliteIngestRecordStore(Path(args.store))
    store.initialise()
    run(args, BinanceServerTimeProbe(), SystemWallClock(), store)
    return 0


if __name__ == "__main__":  # pragma: no cover - composition root, run by hand and never by a gate
    raise SystemExit(main(sys.argv[1:]))
