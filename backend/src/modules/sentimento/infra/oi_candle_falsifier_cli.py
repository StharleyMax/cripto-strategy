"""The bench for `T-03.10`: measure `ADR-045`'s falsifiers on a read-only `md.series` export."""

# Same shape as `liquidation_reconciliation_cli.py`: a named logger owns `stdout`, one canonical
# JSON line per record, diagnostics routed to `stderr`. EVERYTHING it reads is one local CSV file
# (`infra/csv_series_window_reader.py` says how it is exported, read-only), so it opens no socket
# and holds no key. The instants are arguments, never a clock: `knowledge_time_ms` is the export's
# own "now", and the same export with the same arguments prints the same lines.
#
# Exit status is the gate's reading of the lines: `0` when every falsifier HELD, `1` when any
# FAILED (the trail stops and the number goes to `/architect`/owner, `plano 03` item 3b.3), `2`
# when none failed but some universe was short of its floor — never `0` over a short `n`.

from __future__ import annotations

import json
import logging
import sys
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Final

from src.modules.sentimento.domain.oi_candle_falsifiers import (
    FalsifierOutcome,
    PowerVerdict,
    PropertyVerdict,
)
from src.modules.sentimento.infra.csv_series_window_reader import CsvSeriesWindowReader
from src.modules.sentimento.use_cases.measure_oi_candle_falsifiers import (
    OiFalsifierMeasurement,
    measure_oi_candle_falsifiers,
)
from src.modules.sentimento.use_cases.series_catalog import list_pilot_series_catalog

# `__spec__.name`, not `__name__`: under `python -m`, `__name__` is `"__main__"`, and the product
# logger would collapse onto the diagnostic one (`coinalyze_one_shot_cli.py` measured it).
_MODULE: Final[str] = __spec__.name if __spec__ is not None else __name__

logger = logging.getLogger(_MODULE)

_STABLE_FORMAT: Final[str] = "%(message)s"
_DIAGNOSTIC_FORMAT: Final[str] = "%(levelname)s %(name)s %(message)s"
_APPLICATION_LOGGER: Final[str] = _MODULE.split(".")[0]

# Operator-facing usage line: microcopy, Portuguese (`CLAUDE.md` tabela de fronteira linha 8).
_USAGE: Final[str] = (
    "uso: oi_candle_falsifier_cli <export.csv> <SIMBOLO> <window_start_ms> <window_end_ms> "
    "<knowledge_time_ms>"
)

_EXIT_BY_WORST: Final[dict[FalsifierOutcome, int]] = {
    FalsifierOutcome.HELD: 0,
    FalsifierOutcome.FAILED: 1,
    FalsifierOutcome.INCONCLUSIVE: 2,
}

# Worst last: one FAILED outranks any number of INCONCLUSIVE, which outranks HELD.
_SEVERITY: Final[tuple[FalsifierOutcome, ...]] = (
    FalsifierOutcome.HELD,
    FalsifierOutcome.INCONCLUSIVE,
    FalsifierOutcome.FAILED,
)

# The divergences printed per verdict: enough to read the pattern, never the whole universe.
_MAX_DIVERGENCES_PRINTED: Final[int] = 5


def _property_line(verdict: PropertyVerdict) -> dict[str, object]:
    """Project a property verdict onto its JSON fields, with the first divergences."""
    return {
        "outcome": verdict.outcome.value,
        "n": verdict.n,
        "divergences": len(verdict.divergences),
        "first_divergences": [
            {"bucket_end_ms": d.bucket_end_ms, "expected": d.expected, "observed": d.observed}
            for d in verdict.divergences[:_MAX_DIVERGENCES_PRINTED]
        ],
    }


def _power_line(verdict: PowerVerdict) -> dict[str, object]:
    """Project a power verdict onto its JSON fields."""
    return {
        "outcome": verdict.outcome.value,
        "n": verdict.n,
        "flat": verdict.flat,
        "flat_share": verdict.flat_share,
    }


def _outcomes(measurement: OiFalsifierMeasurement) -> list[FalsifierOutcome]:
    """Every verdict of the measurement, in the order the lines are printed."""
    outcomes: list[FalsifierOutcome] = []
    for regime in measurement.regimes:
        outcomes.extend((regime.close.outcome, regime.anchor.outcome, regime.power.outcome))
    outcomes.append(measurement.spread.outcome)
    return outcomes


def emit(payload: dict[str, object]) -> str:
    """Write one canonical JSON line and return it."""
    line = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    logger.info(line)
    return line


ReaderFactory = Callable[[Path], CsvSeriesWindowReader]


def dispatch(argv: Sequence[str], reader_factory: ReaderFactory) -> int:
    """Measure the falsifiers for the symbol and window in `argv`; exit with the worst outcome."""
    if len(argv) != 5:
        raise SystemExit(_USAGE)
    export_path, symbol, *instants_raw = argv
    try:
        window_start_ms, window_end_ms, knowledge_time_ms = (int(item) for item in instants_raw)
    except ValueError as failure:
        raise SystemExit(f"instantes invalidos (ms inteiros): {instants_raw!r}") from failure
    reader = reader_factory(Path(export_path))
    measurement = measure_oi_candle_falsifiers(
        list_pilot_series_catalog(),
        reader,
        reader,
        symbol=symbol,
        window_start_ms=window_start_ms,
        window_end_ms=window_end_ms,
        knowledge_time_ms=knowledge_time_ms,
    )
    for regime in measurement.regimes:
        emit(
            {
                "command": "oi_candle_regime",
                "symbol": symbol,
                "interval": regime.interval,
                "derived_from": regime.derived_from.value,
                "bucket_ms": regime.bucket_ms,
                "close": _property_line(regime.close),
                "anchor": _property_line(regime.anchor),
                "power": _power_line(regime.power),
            }
        )
    spread = measurement.spread
    emit(
        {
            "command": "oi_candle_spread",
            "symbol": symbol,
            "outcome": spread.outcome.value,
            "n": spread.n,
            "median_bp": spread.median_bp,
            "p90_bp": spread.p90_bp,
            "max_bp": spread.max_bp,
        }
    )
    outcomes = _outcomes(measurement)
    worst = max(outcomes, key=_SEVERITY.index)
    emit(
        {
            "command": "oi_candle_falsifiers_summary",
            "symbol": symbol,
            "window_start_ms": window_start_ms,
            "window_end_ms": window_end_ms,
            "knowledge_time_ms": knowledge_time_ms,
            "verdicts": len(outcomes),
            "worst": worst.value,
        }
    )
    return _EXIT_BY_WORST[worst]


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


def main(argv: Sequence[str]) -> int:
    """Compose the CSV reader, then dispatch."""
    route_diagnostics_away_from_the_product_stream()
    _configure_product_stream()
    return dispatch(argv, CsvSeriesWindowReader.from_path)


if __name__ == "__main__":  # pragma: no cover - composition root, run by hand and never by a gate
    raise SystemExit(main(sys.argv[1:]))
