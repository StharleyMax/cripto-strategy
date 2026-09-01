"""`instrument_universe_diff_cli`: `D2.2`, made runnable over two ARCHIVED snapshots.

Two small synthetic captures exercise the wiring here (which fields land in which report key);
`test_instrument_universe_snapshot.py` already proves the underlying math (`funding_interval_
hours_distribution`, `compare_symbol_sets`) against real 08-24/09-01 data.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Iterator
from pathlib import Path

import pytest

from src.modules.sentimento.domain.instrument_universe_snapshot import PremiumIndexEntry
from src.modules.sentimento.infra import instrument_universe_diff_cli as cli
from src.modules.sentimento.infra.instrument_universe_snapshot_store import (
    RawInstrumentUniverseCapture,
    write_snapshot,
)


def _capture(
    captured_on: str, funding_interval_hours: int, extra_premium_symbol: str | None = None
) -> RawInstrumentUniverseCapture:
    """Build one small, internally-consistent capture with a chosen funding interval."""
    premium_index: list[PremiumIndexEntry] = [{"symbol": "BTCUSDT", "interestRate": "0.0001"}]
    if extra_premium_symbol is not None:
        premium_index.append({"symbol": extra_premium_symbol, "interestRate": "0.0002"})
    return {
        "captured_on": captured_on,
        "received_at": f"{captured_on}T00:00:00+00:00",
        "exchange_info": {"symbols": [{"symbol": "BTCUSDT", "underlyingSubType": ["PoW"]}]},
        "funding_info": [
            {"symbol": "BTCUSDT", "fundingIntervalHours": funding_interval_hours},
            {"symbol": "BTCUSD_PERP", "fundingIntervalHours": 8},  # COIN-M
        ],
        "premium_index": premium_index,
    }


@pytest.fixture(autouse=True)
def _reset_logger() -> Iterator[None]:
    """Undo `main`'s handler/propagation mutations so tests do not bleed into each other."""
    yield
    cli.logger.handlers.clear()
    cli.logger.propagate = True
    application = logging.getLogger(cli._APPLICATION_LOGGER)
    application.handlers.clear()
    application.propagate = True


def test_compare_reports_the_distribution_divergence_and_both_fingerprints(tmp_path: Path) -> None:
    """A real interval change (8h -> 4h) between two dates is what `D2.2` asks to be detected."""
    path_first = write_snapshot(tmp_path, _capture("2026-08-24", funding_interval_hours=8))
    path_second = write_snapshot(tmp_path, _capture("2026-09-01", funding_interval_hours=4))

    line = cli.compare(path_first, path_second)
    report = json.loads(line)

    assert report["report"] == "instrument_universe_snapshot_diff"
    assert report["captured_on_first"] == "2026-08-24"
    assert report["captured_on_second"] == "2026-09-01"
    assert report["funding_interval_hours_distribution_first"] == {"8": 2}
    assert report["funding_interval_hours_distribution_second"] == {"4": 1, "8": 1}
    assert report["funding_interval_hours_distribution_differs"] is True
    assert report["fingerprint_first"] != report["fingerprint_second"]
    assert report["fingerprints_equal"] is False
    assert len(report["fingerprint_first"]) == 64


def test_compare_reports_identical_fingerprints_when_nothing_changed(tmp_path: Path) -> None:
    """Two identically-shaped captures on different dates still get DIFFERENT fingerprints.

    `InstrumentUniverseSnapshot.fingerprint` folds `captured_on` into the hash (`test_
    instrument_universe_snapshot.py::test_fingerprint_differs_when_captured_on_differs...`), so
    "nothing changed" is read off `funding_interval_hours_distribution_differs`, not off the
    fingerprints — this test pins that the report does not conflate the two.
    """
    path_first = write_snapshot(tmp_path, _capture("2026-08-24", funding_interval_hours=8))
    path_second = write_snapshot(tmp_path, _capture("2026-08-25", funding_interval_hours=8))

    report = json.loads(cli.compare(path_first, path_second))

    assert report["funding_interval_hours_distribution_differs"] is False
    assert report["fingerprint_first"] != report["fingerprint_second"]  # captured_on differs


def test_compare_reports_premium_index_and_funding_info_divergence_on_the_first_capture(
    tmp_path: Path,
) -> None:
    """`D2.3`/`D2.4`, read off the FIRST snapshot's own three sources."""
    path_first = write_snapshot(
        tmp_path, _capture("2026-08-24", funding_interval_hours=8, extra_premium_symbol="EXTRAUSDT")
    )
    path_second = write_snapshot(tmp_path, _capture("2026-09-01", funding_interval_hours=8))

    report = json.loads(cli.compare(path_first, path_second))

    assert report["premium_index_extra_symbols_first"] == ["EXTRAUSDT"]
    assert report["funding_info_coin_m_symbols_first"] == ["BTCUSD_PERP"]


@pytest.mark.parametrize("argv", [[], ["only-one"], ["a", "b", "c"]])
def test_main_refuses_the_wrong_number_of_arguments(argv: list[str]) -> None:
    """Exactly two snapshot paths are expected — never zero, one, or three."""
    with pytest.raises(SystemExit) as refusal:
        cli.main(argv)
    assert "uso: instrument_universe_diff_cli" in str(refusal.value)
