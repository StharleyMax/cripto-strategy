"""`instrument_universe_diff_cli`: compare two ARCHIVED snapshots — `D2.2`, made runnable."""

# `D2.2` asks for a comparison across two captures "≥ 3 dias apart", which needs the collector
# to have RUN for that long — an operational fact this task's scope (`Q1`, 2026-09-01: code plus
# an offline/short-probe proof, not a continuous deploy) does not produce by itself. What this
# CLI delivers instead is the MECHANISM `D2.2` is measured with, exercised against whatever two
# dated files `daily_instrument_universe_snapshot_cli` has already written — a rerun of the same
# comparison next month, once real drift exists, needs no new code.
#
# Reads only; nothing here fetches or writes a snapshot. Same `stdout`/`stderr` split as the
# other CLIs of this task, for the same reason: one canonical line is the record.

from __future__ import annotations

import logging
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Final

from src.modules.sentimento.domain.canonical_json import canonical_json
from src.modules.sentimento.domain.instrument_universe_snapshot import (
    InstrumentUniverseSnapshot,
    build_instrument_rows,
    compare_symbol_sets,
    exchange_info_symbols,
    funding_info_symbols,
    funding_interval_hours_distribution,
    premium_index_symbols,
)
from src.modules.sentimento.infra.instrument_universe_snapshot_store import read_snapshot

_MODULE: Final[str] = __spec__.name if __spec__ is not None else __name__
logger = logging.getLogger(_MODULE)

_STABLE_FORMAT: Final[str] = "%(message)s"
_DIAGNOSTIC_FORMAT: Final[str] = "%(levelname)s %(name)s %(message)s"
_APPLICATION_LOGGER: Final[str] = _MODULE.split(".")[0]

_USAGE: Final[str] = "uso: instrument_universe_diff_cli <snapshot-1.json.gz> <snapshot-2.json.gz>"


def emit(payload: dict[str, object]) -> str:
    """Write one canonical-JSON line and return it, so a caller can hash what was written."""
    line = canonical_json(payload)
    logger.info(line)
    return line


def compare(path_first: Path, path_second: Path) -> str:
    """Compare two archived snapshots on the four axes `D2.2`-`D2.5` name, and report them.

    Each file is read from disk EXACTLY ONCE — `capture_first`/`capture_second` are reused for
    every derived quantity below, rather than re-decompressing the same `.json.gz` per metric.
    """
    capture_first = read_snapshot(path_first)
    capture_second = read_snapshot(path_second)

    rows_first = build_instrument_rows(
        capture_first["exchange_info"],
        capture_first["funding_info"],
        capture_first["premium_index"],
    )
    rows_second = build_instrument_rows(
        capture_second["exchange_info"],
        capture_second["funding_info"],
        capture_second["premium_index"],
    )
    first = InstrumentUniverseSnapshot(captured_on=capture_first["captured_on"], rows=rows_first)
    second = InstrumentUniverseSnapshot(captured_on=capture_second["captured_on"], rows=rows_second)

    ei_first = exchange_info_symbols(capture_first["exchange_info"])
    ei_second = exchange_info_symbols(capture_second["exchange_info"])
    fi_first = funding_info_symbols(capture_first["funding_info"])
    pi_first = premium_index_symbols(capture_first["premium_index"])

    dist_first = funding_interval_hours_distribution(rows_first)
    dist_second = funding_interval_hours_distribution(rows_second)

    return emit(
        {
            "report": "instrument_universe_snapshot_diff",
            "captured_on_first": first.captured_on,
            "captured_on_second": second.captured_on,
            "fingerprint_first": first.fingerprint(),
            "fingerprint_second": second.fingerprint(),
            "fingerprints_equal": first.fingerprint() == second.fingerprint(),
            # D2.2 — SPEC-001 §3.4: a distribuicao de fundingIntervalHours DIFERE entre capturas.
            "funding_interval_hours_distribution_first": dist_first,
            "funding_interval_hours_distribution_second": dist_second,
            "funding_interval_hours_distribution_differs": dist_first != dist_second,
            # D2.3 — exchangeInfo x premiumIndex, sobre a PRIMEIRA captura.
            "premium_index_extra_symbols_first": list(
                compare_symbol_sets(ei_first, pi_first).only_in_second
            ),
            # D2.4 — exchangeInfo x fundingInfo (COIN-M), sobre a PRIMEIRA captura.
            "funding_info_coin_m_symbols_first": list(
                compare_symbol_sets(ei_first, fi_first).only_in_second
            ),
            "exchange_info_symbol_set_changed": ei_first != ei_second,
        }
    )


def route_diagnostics_away_from_the_product_stream() -> None:
    """Send this application's diagnostics to `stderr`, so `stdout` is the report ALONE."""
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
    """Wire the streams and compare the two snapshots named in `argv`."""
    if len(argv) != 2:
        raise SystemExit(_USAGE)
    route_diagnostics_away_from_the_product_stream()
    _configure_product_stream()
    compare(Path(argv[0]), Path(argv[1]))
    return 0


if __name__ == "__main__":  # pragma: no cover - composition root, run by hand and never by a gate
    raise SystemExit(main(sys.argv[1:]))
