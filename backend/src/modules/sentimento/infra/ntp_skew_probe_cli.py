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
#
# ── THE STORE ENGINE IS `INGEST_RECORD_BACKEND`, NOT `--store` (`T-03.8`, `ADR-031/D1`) ────
#
# `_compose_store` reads the SAME variable every other composition root in this package reads
# (`ingest_record_store_composition.compose_ingest_record_store`) — `sqlite` (the default)
# keeps this CLI's original behaviour (`--store`'s path, untouched); `postgres` composes
# against the SAME engine `deploy/compose.yml`'s `api`/`writer`/`collector` use, so a run of
# this probe against the `postgres` target lands where `/collector-status` actually reads —
# `[MEDIDO 2026-09-08, T-03.8]`: before this, `main()` built a `SqliteIngestRecordStore`
# unconditionally, so a probe run under `INGEST_RECORD_BACKEND=postgres` wrote a file the API
# never opens, and the third `(source, endpoint)` `CA-E2E-1` needs to reach `n_rows >= 3`
# never arrived.

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import uuid
from collections.abc import Callable, Mapping, Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import psycopg

from src.modules.sentimento.infra.binance_server_time_probe import BinanceServerTimeProbe
from src.modules.sentimento.infra.ingest_health_cli import (
    build_stdout_handler,
    route_diagnostics_away_from_the_product_stream,
)
from src.modules.sentimento.infra.ingest_record_store_composition import (
    DEFAULT_INGEST_RECORD_BACKEND,
    INGEST_RECORD_BACKEND_VAR,
    IngestRecordStore,
    compose_ingest_record_store,
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
    It still names a SQLite path even when `INGEST_RECORD_BACKEND=postgres` picks the engine
    (`_compose_store` below) — the flag's job is "refuse to even parse a destination-less
    invocation", not "select the engine"; the engine is `INGEST_RECORD_BACKEND`, same as every
    other composition root in this package (`ADR-031/D1`).
    """
    parser = argparse.ArgumentParser(
        prog="ntp_skew_probe_cli",
        description=(
            "Mede o skew do relogio local contra /fapi/v1/time e persiste em md.ingest_run "
            "(D3.10). A tolerancia NAO se calibra aqui — T-07.10."
        ),
    )
    parser.add_argument(
        "--store",
        type=Path,
        required=True,
        help=(
            "caminho do arquivo SQLite de md.ingest_run — usado quando INGEST_RECORD_BACKEND "
            "e 'sqlite' (o default); ignorado quando e 'postgres' (T-03.8, ADR-031/D1)"
        ),
    )
    parser.add_argument("--run-id", default=None, help="default: um uuid4 novo por chamada")
    return parser


def _compose_store(
    args: argparse.Namespace,
    environ: Mapping[str, str],
    *,
    connect: Callable[[str], psycopg.Connection[Any]] = psycopg.connect,
) -> IngestRecordStore:
    """Pick the SAME engine every other composition root in this package picks (`ADR-031/D1`).

    `T-02.4`'s `compose_ingest_record_store` is the ONE function `collectors_cli`,
    `single_writer_cli` and `src.main` already call — this probe was the fourth composition
    root `ingest_record_store_composition.py`'s own docstring names as the risk ("a fourth
    composition root reading INGEST_RECORD_BACKEND slightly differently"): it read `--store`
    unconditionally and could only ever write `sqlite`, so a probe run against the `postgres`
    target (`deploy/compose.yml`, F3) landed in a file the API never reads — `T-03.8` measured
    exactly that (`docs/context/captura-em-producao/gates/CA-E2E-local.md`). `ADR-031`'s own
    text already assumed this was fixed: "o probe NTP (`ntp_skew_probe_cli.py:120`) **ja**
    grava o mesmo registro por um terceiro processo" — this function is what makes that true.

    `sqlite` (unset, or explicit) keeps the ORIGINAL, unchanged behaviour: `--store`'s path,
    nothing else touched — every existing test that calls `run()` directly is unaffected.
    """
    backend = environ.get(INGEST_RECORD_BACKEND_VAR, DEFAULT_INGEST_RECORD_BACKEND)
    if backend == DEFAULT_INGEST_RECORD_BACKEND:  # "sqlite" — this CLI's original, sole engine
        return SqliteIngestRecordStore(Path(args.store))
    return compose_ingest_record_store(environ, connect=connect)


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
    (`infra/ingest_health_cli.py` documents the defect this order fixes). The store is picked
    by `_compose_store` — `INGEST_RECORD_BACKEND` (`sqlite`|`postgres`), same variable and same
    default every other composition root in this package reads (`ADR-031/D1`).
    """
    args = build_parser().parse_args(list(argv))
    route_diagnostics_away_from_the_product_stream()
    logger.setLevel(logging.INFO)
    logger.addHandler(build_stdout_handler())
    logger.propagate = False
    store = _compose_store(args, os.environ)
    store.initialise()
    run(args, BinanceServerTimeProbe(), SystemWallClock(), store)
    return 0


if __name__ == "__main__":  # pragma: no cover - composition root, run by hand and never by a gate
    raise SystemExit(main(sys.argv[1:]))
