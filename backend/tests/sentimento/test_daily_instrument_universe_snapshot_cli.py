"""`daily_instrument_universe_snapshot_cli`: the composition root, exercised with a FAKE client.

`test_binance_futures_snapshot_client.py` proves the HTTP half; `test_instrument_universe_
snapshot.py` proves the domain math on real data. This module proves the WIRING — that `run`
stores what it fetched, reports the fingerprint it computed, and that `main` refuses the wrong
number of arguments and reports (rather than crashes on) an unstable read.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Iterator
from pathlib import Path

import pytest

from src.modules.sentimento.domain.instrument_universe_snapshot import (
    ExchangeInfoPayload,
    FundingInfoEntry,
    PremiumIndexEntry,
)
from src.modules.sentimento.infra import daily_instrument_universe_snapshot_cli as cli
from src.modules.sentimento.infra.instrument_universe_snapshot_store import (
    dated_snapshots,
    read_snapshot,
)
from src.modules.sentimento.use_cases.capture_instrument_universe_snapshot import (
    UnstableExchangeInfoReadError,
)

_EXCHANGE_INFO: ExchangeInfoPayload = {
    "symbols": [
        {"symbol": "BTCUSDT", "underlyingSubType": ["PoW"]},
        {"symbol": "ETHUSDT", "underlyingSubType": []},
    ]
}
_FUNDING_INFO: list[FundingInfoEntry] = [
    {"symbol": "BTCUSDT", "fundingIntervalHours": 8},
    {"symbol": "BTCUSD_PERP", "fundingIntervalHours": 8},  # COIN-M, outside exchangeInfo
]
_PREMIUM_INDEX: list[PremiumIndexEntry] = [
    {"symbol": "BTCUSDT", "interestRate": "0.0001"},
    {"symbol": "ETHUSDT", "interestRate": "0.0001"},
    {"symbol": "EXTRAUSDT", "interestRate": "0.0001"},  # premiumIndex's own extra
]


class _StableFakeClient:
    """Returns the SAME `exchangeInfo` object on every call — the agreeing-reads path."""

    def exchange_info(self) -> ExchangeInfoPayload:
        """Return a fresh copy each time, but with identical content — a stable read."""
        return json.loads(json.dumps(_EXCHANGE_INFO))  # type: ignore[no-any-return]

    def funding_info(self) -> list[FundingInfoEntry]:
        """Return the fixed funding-info list."""
        return list(_FUNDING_INFO)

    def premium_index(self) -> list[PremiumIndexEntry]:
        """Return the fixed premium-index list."""
        return list(_PREMIUM_INDEX)


class _UnstableFakeClient:
    """Returns a DIFFERENT `exchangeInfo` on the second call — the refusal path."""

    def __init__(self) -> None:
        """Start the call counter at zero."""
        self._calls = 0

    def exchange_info(self) -> ExchangeInfoPayload:
        """Return the fixture on the first call, a mutated copy on the second."""
        self._calls += 1
        payload: ExchangeInfoPayload = json.loads(json.dumps(_EXCHANGE_INFO))
        if self._calls == 2:
            payload["symbols"][0]["underlyingSubType"] = ["MUTATED"]
        return payload

    def funding_info(self) -> list[FundingInfoEntry]:
        """Return the fixed funding-info list."""
        return list(_FUNDING_INFO)

    def premium_index(self) -> list[PremiumIndexEntry]:
        """Return the fixed premium-index list."""
        return list(_PREMIUM_INDEX)


@pytest.fixture(autouse=True)
def _reset_logger() -> Iterator[None]:
    """Undo `main`'s handler/propagation mutations so tests do not bleed into each other."""
    yield
    cli.logger.handlers.clear()
    cli.logger.propagate = True
    application = logging.getLogger(cli._APPLICATION_LOGGER)
    application.handlers.clear()
    application.propagate = True


def test_run_writes_the_snapshot_and_reports_the_expected_shape(tmp_path: Path) -> None:
    """`run` stores exactly what the (stable) client returned and reports its fingerprint."""
    line = cli.run(tmp_path, _StableFakeClient(), "2026-09-01", "2026-09-01T00:00:00+00:00")
    report = json.loads(line)

    assert report["report"] == "instrument_universe_snapshot_captured"
    assert report["captured_on"] == "2026-09-01"
    assert report["n_rows"] == 3  # BTCUSDT, ETHUSDT, BTCUSD_PERP: union of exchangeInfo+fundingInfo
    assert report["premium_index_extra_symbols"] == ["EXTRAUSDT"]
    assert report["funding_info_coin_m_symbols"] == ["BTCUSD_PERP"]
    assert len(report["fingerprint"]) == 64

    assert dated_snapshots(tmp_path) == ("2026-09-01",)
    stored = read_snapshot(tmp_path / "instrument-universe-2026-09-01.json.gz")
    assert stored["exchange_info"] == _EXCHANGE_INFO
    assert stored["funding_info"] == _FUNDING_INFO
    assert stored["premium_index"] == _PREMIUM_INDEX


def test_run_raises_on_an_unstable_exchange_info_read(tmp_path: Path) -> None:
    """An unstable pair of reads propagates out of `run` — `main` is what catches it."""
    with pytest.raises(UnstableExchangeInfoReadError):
        cli.run(tmp_path, _UnstableFakeClient(), "2026-09-01", "2026-09-01T00:00:00+00:00")

    assert not dated_snapshots(tmp_path)  # nothing partial was written


@pytest.mark.parametrize("argv", [[], ["a", "b"]])
def test_main_refuses_the_wrong_number_of_arguments(argv: list[str]) -> None:
    """Zero or two arguments are both refused — exactly one directory is expected."""
    with pytest.raises(SystemExit) as refusal:
        cli.main(argv)
    assert "uso: daily_instrument_universe_snapshot_cli" in str(refusal.value)
