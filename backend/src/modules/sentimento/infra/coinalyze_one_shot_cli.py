"""The bench for `T-02.2`: the only entry point that spends the Coinalyze one-shot for real."""

# Same shape and same warning as `infra/quota_ramp_cli.py`: `backend/scripts/test.sh` declares
# "ZERO REDE" and this file is exactly the exception that statement is about — a human runs it,
# by hand, once, and no gate calls it. What the suite owns is `capture_coinalyze_daily_series.py`,
# proven offline with a scripted fake transport
# (`tests/sentimento/test_coinalyze_one_shot_cli.py` drives THIS module's `dispatch`, same
# pattern as `test_quota_ramp_bench_offline.py`).
#
# ── SCOPE: THE SYMBOL LIST IS THE CALLER'S, NOT THIS MODULE'S ─────────────────────────────────
#
# Plano 02 items 2.3/2.4 are "capture OI + liquidation into quarantine, blind broker" — nothing
# in `CA-F0-13` or `avaliacao:A3` says this task owns discovering the ~570-symbol universe
# `docs/decisoes-do-owner.md` costs the sweep against. That is curation (`T-02.1`'s exchangeInfo
# snapshot, or a future catalog task), and depending on it here would make this task's DoD
# hostage to a sibling task's shape. `dispatch` therefore takes the symbol list as an argument,
# one per CLI token — a human (or a wrapper script) supplies it, sourced from whichever catalog
# is current at run time.
#
# ── ONE JSON OBJECT PER LINE, ON `stdout` ──────────────────────────────────────────────────────
#
# Same contract as `quota_ramp_cli.py` and `ingest_health_cli.py`: the bytes are the record.

from __future__ import annotations

import json
import logging
import os
import sys
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from typing import Final

from src.modules.sentimento.domain.local_quota_broker import LocalQuotaBroker
from src.modules.sentimento.infra.coinalyze_history_client import CoinalizeHistoryClient
from src.modules.sentimento.infra.sqlite_series_quarantine_store import (
    SqliteSeriesQuarantineStore,
)
from src.modules.sentimento.infra.system_ramp_clock import SystemRampClock
from src.modules.sentimento.use_cases.capture_coinalyze_daily_series import (
    CoinalizeHistorySource,
    OneShotClock,
    SeriesQuarantineSink,
    SymbolSeriesOutcome,
    capture_one_shot,
)

# `__spec__.name`, not `__name__` — same measured reason `quota_ramp_cli.py` carries: under
# `python -m`, `__name__` is `"__main__"` and deriving the logger from it would collapse the
# diagnostic and the product logger onto the same name, duplicating every emitted line.
_MODULE: Final[str] = __spec__.name if __spec__ is not None else __name__

logger = logging.getLogger(_MODULE)

_STABLE_FORMAT: Final[str] = "%(message)s"
_DIAGNOSTIC_FORMAT: Final[str] = "%(levelname)s %(name)s %(message)s"
_APPLICATION_LOGGER: Final[str] = _MODULE.split(".")[0]

_USAGE: Final[str] = (
    "uso: coinalyze_one_shot_cli run <db-path> <run-id> <received-at-iso> "
    "<from-epoch> <to-epoch> <symbol> [symbol ...]"
)

# 40 calls/minute per key, `[DOC]` per `docs/medicao-coinalyze.md` §3.1 / `avaliacao-
# discovery.md` — never confirmed by a `429` (`[NÃO MEDIDO]`), which is exactly why the pacing
# below is FIXED and conservative rather than an accelerating ramp: `domain/local_quota_broker.py`.
_CALLS_PER_WINDOW: Final[int] = 40
_WINDOW_SECONDS: Final[float] = 60.0

DEFAULT_BROKER: Final[LocalQuotaBroker] = LocalQuotaBroker(
    calls_per_window=_CALLS_PER_WINDOW, window_seconds=_WINDOW_SECONDS
)


def emit(payload: Mapping[str, object]) -> str:
    """Write one canonical JSON line and return it, so the caller can hash what was written."""
    line = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
    logger.info(line)
    return line


def _report_line(outcome: SymbolSeriesOutcome) -> dict[str, object]:
    """Project one outcome onto the record this CLI publishes for it."""
    return {
        "command": "run",
        "binance_symbol": outcome.binance_symbol,
        "series_kind": outcome.series_kind.value,
        "status": outcome.status,
        "transport_error": outcome.transport_error,
        "n_points": outcome.n_points,
        "requirement_met": outcome.requirement_met,
        "reasons": list(outcome.reasons),
        "stored": outcome.stored,
    }


def command_run(
    source: CoinalizeHistorySource,
    clock: OneShotClock,
    sink: SeriesQuarantineSink,
    run_id: str,
    received_at: str,
    from_epoch_seconds: int,
    to_epoch_seconds: int,
    symbols: Sequence[str],
) -> int:
    """Sweep every symbol for OI + liquidation, pacing through `DEFAULT_BROKER`, one line each."""
    outcomes = capture_one_shot(
        binance_symbols=symbols,
        broker=DEFAULT_BROKER,
        source=source,
        clock=clock,
        sink=sink,
        run_id=run_id,
        received_at=received_at,
        from_epoch_seconds=from_epoch_seconds,
        to_epoch_seconds=to_epoch_seconds,
    )
    for outcome in outcomes:
        emit(_report_line(outcome))
    stored = sum(1 for outcome in outcomes if outcome.stored)
    emit(
        {
            "command": "run_summary",
            "run_id": run_id,
            "n_symbols": len(symbols),
            "n_calls": len(outcomes),
            "n_stored": stored,
            "n_failed": len(outcomes) - stored,
            "interval_seconds": DEFAULT_BROKER.interval_seconds,
        }
    )
    return 0


def route_diagnostics_away_from_the_product_stream() -> None:
    """Send this application's diagnostics to `stderr`, so `stdout` is the record ALONE."""
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter(_DIAGNOSTIC_FORMAT))
    application = logging.getLogger(_APPLICATION_LOGGER)
    application.addHandler(handler)
    application.propagate = False


def _configure_product_stream() -> None:
    """Give the product logger `stdout` with the stable format, and stop it propagating."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(_STABLE_FORMAT))
    logger.setLevel(logging.INFO)
    logger.addHandler(handler)
    logger.propagate = False


SinkFactory = Callable[[Path], SeriesQuarantineSink]


def dispatch(
    argv: Sequence[str],
    source: CoinalizeHistorySource,
    clock: OneShotClock,
    sink_factory: SinkFactory,
) -> int:
    """Route the one command this CLI knows, refusing anything the usage line does not name."""
    if not argv or argv[0] != "run" or len(argv) < 7:
        raise SystemExit(_USAGE)
    _, db_path, run_id, received_at, from_raw, to_raw, *symbols = argv
    if not symbols:
        raise SystemExit(_USAGE)
    sink = sink_factory(Path(db_path))
    return command_run(
        source,
        clock,
        sink,
        run_id,
        received_at,
        int(from_raw),
        int(to_raw),
        symbols,
    )


def _real_sink_factory(path: Path) -> SqliteSeriesQuarantineStore:
    """Open (and initialise) the real SQLite store at `path`."""
    store = SqliteSeriesQuarantineStore(path)
    store.initialise()
    return store


def main(argv: Sequence[str]) -> int:
    """Compose the real transport, the real clock and the real store, then dispatch."""
    route_diagnostics_away_from_the_product_stream()
    _configure_product_stream()
    client = CoinalizeHistoryClient(environment=os.environ)
    try:
        return dispatch(argv, client, SystemRampClock(), _real_sink_factory)
    finally:
        client.close()


if __name__ == "__main__":  # pragma: no cover - composition root, run by hand and never by a gate
    raise SystemExit(main(sys.argv[1:]))
