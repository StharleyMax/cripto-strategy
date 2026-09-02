"""The bench for `T-03.11`: read the quarantine + the raw evidence, print the reconciliation."""

# Same shape as `ingest_health_cli.py` and `coinalyze_one_shot_cli.py`: a named logger owns
# `stdout`, one canonical JSON line per record, diagnostics routed to `stderr` before anything
# can log. Unlike those two, EVERYTHING this module touches is local disk — a SQLite file
# `T-02.2` already wrote, and JSONL evidence files `T-03.2`'s collector already wrote — so this
# CLI opens no socket and needs no live key, which is why `test_liquidation_reconciliation_cli.py`
# exercises `dispatch` against REAL files under `tmp_path`, not a scripted fake transport.

from __future__ import annotations

import json
import logging
import sys
from collections.abc import Callable, Sequence
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Final

from src.modules.sentimento.domain.coinalyze_daily_series import (
    SeriesKind,
    daily_points_from_stored_json,
)
from src.modules.sentimento.domain.liquidation_reconciliation import (
    DailyLiquidationReconciliation,
)
from src.modules.sentimento.infra.sqlite_series_quarantine_store import (
    SqliteSeriesQuarantineStore,
)
from src.modules.sentimento.use_cases.reconcile_daily_liquidation import (
    run_daily_liquidation_reconciliation,
)

# `__spec__.name`, not `__name__` — same measured reason `coinalyze_one_shot_cli.py` carries:
# under `python -m`, `__name__` is `"__main__"`, and deriving the logger from it would collapse
# the diagnostic and the product logger onto the same name, duplicating every emitted line.
_MODULE: Final[str] = __spec__.name if __spec__ is not None else __name__

logger = logging.getLogger(_MODULE)

_STABLE_FORMAT: Final[str] = "%(message)s"
_DIAGNOSTIC_FORMAT: Final[str] = "%(levelname)s %(name)s %(message)s"
_APPLICATION_LOGGER: Final[str] = _MODULE.split(".")[0]

# `uso: …` stays in Portuguese (`SPEC-001` §3.8 / `CLAUDE.md` tabela de fronteira linha 8):
# an operator-facing usage line is microcopy, same decision `ingest_health_cli.py` already made.
# `perto_de_1_inferior`/`perto_de_1_superior` are POSITIONAL and REQUIRED, never defaulted here:
# `liquidation_reconciliation.classify_daily_reconciliation`'s docstring names why — no measured
# distribution of real `(captured, coinalyze)` pairs exists yet to fit a tolerance to, so the
# only honest default is none, and the operator running this bench states the band out loud.
_USAGE: Final[str] = (
    "uso: liquidation_reconciliation_cli <db-quarentena> <SIMBOLO_BINANCE> "
    "<perto_de_1_inferior> <perto_de_1_superior> <evidencia.jsonl> [evidencia.jsonl ...]"
)


def read_captured_raw_messages(evidence_paths: Sequence[Path]) -> tuple[str, ...]:
    """Read every envelope JSONL line and return its `raw` field, in file-then-line order.

    A line that is not valid JSON, or carries no string `raw` key, is skipped — the same
    survivorship `run_daily_liquidation_reconciliation` applies to a message it CAN parse as
    JSON but not as a `!forceOrder@arr` shape, extended one layer earlier: a torn envelope line
    (`force_order_raw_recorder.py` appends one line per message; a process killed mid-write can
    leave the last one incomplete) never even reaches that parser.
    """
    raw_messages: list[str] = []
    for path in evidence_paths:
        with path.open(encoding="utf-8") as handle:
            for line in handle:
                stripped = line.strip()
                if not stripped:
                    continue
                try:
                    envelope = json.loads(stripped)
                except json.JSONDecodeError:
                    continue
                raw = envelope.get("raw") if isinstance(envelope, dict) else None
                if isinstance(raw, str):
                    raw_messages.append(raw)
    return tuple(raw_messages)


def _report_line(row: DailyLiquidationReconciliation) -> dict[str, object]:
    """Project one reconciliation row onto the record this CLI publishes for it."""
    return {
        "command": "reconcile",
        "symbol": row.symbol,
        "day": row.day,
        "captured_quantity": str(row.captured_quantity),
        "coinalyze_quantity": str(row.coinalyze_quantity),
        "ratio": str(row.ratio) if row.ratio is not None else None,
        "hypothesis": row.hypothesis.value,
        "screen_label": row.screen_label,
        "caveat": row.caveat,
    }


def emit(payload: dict[str, object]) -> str:
    """Write one canonical JSON line and return it, so the caller can hash what was written."""
    line = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    logger.info(line)
    return line


StoreFactory = Callable[[Path], SqliteSeriesQuarantineStore]


def dispatch(argv: Sequence[str], store_factory: StoreFactory) -> int:
    """Read the quarantine + the evidence files named in `argv`, and emit one line per day."""
    if len(argv) < 5:
        raise SystemExit(_USAGE)
    db_path, symbol, lower_raw, upper_raw, *evidence_raw = argv
    try:
        near_one_lower_bound = Decimal(lower_raw)
        near_one_upper_bound = Decimal(upper_raw)
    except InvalidOperation as failure:
        raise SystemExit(
            f"faixa 'perto de 1' invalida: {lower_raw!r}/{upper_raw!r} nao leem como Decimal"
        ) from failure
    store = store_factory(Path(db_path))
    row = store.read_latest(SeriesKind.LIQUIDATION, symbol)
    if row is None:
        raise SystemExit(
            f"nenhuma serie LIQUIDATION em quarentena para {symbol!r} — rode o one-shot da "
            f"Coinalyze (T-02.2) antes de reconciliar"
        )
    coinalyze_points = daily_points_from_stored_json(row[4])
    evidence_paths = tuple(Path(item) for item in evidence_raw)
    raw_messages = read_captured_raw_messages(evidence_paths)
    run = run_daily_liquidation_reconciliation(
        symbol=symbol,
        raw_force_order_messages=raw_messages,
        coinalyze_points=coinalyze_points,
        near_one_lower_bound=near_one_lower_bound,
        near_one_upper_bound=near_one_upper_bound,
    )
    for reconciliation in run.reconciliations:
        emit(_report_line(reconciliation))
    emit(
        {
            "command": "reconcile_summary",
            "symbol": symbol,
            "n_days": len(run.reconciliations),
            "n_captured_messages": len(raw_messages),
            "skipped_malformed_messages": run.skipped_malformed_messages,
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


def _real_store_factory(path: Path) -> SqliteSeriesQuarantineStore:
    """Open the real SQLite store at `path` — read-only in spirit, `initialise()` is idempotent."""
    store = SqliteSeriesQuarantineStore(path)
    store.initialise()
    return store


def main(argv: Sequence[str]) -> int:
    """Compose the real store, then dispatch."""
    route_diagnostics_away_from_the_product_stream()
    _configure_product_stream()
    return dispatch(argv, _real_store_factory)


if __name__ == "__main__":  # pragma: no cover - composition root, run by hand and never by a gate
    raise SystemExit(main(sys.argv[1:]))
