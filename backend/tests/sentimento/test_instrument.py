"""`domain/instrument.py::base_asset` — the reading that decides `unit`, and its refusal.

These three tests MOVED here from `test_collector_klines_mapping.py` together with the
function itself: while the reading lived in `use_cases/collector_series_mapping.py` it was
tested as a property of the WRITER, and `domain/open_interest_catalog.py` could not reuse it
at all (`domain` may not import `use_cases`). The behaviour asserted is unchanged; what
changed is which layer owns it — and the layer floor (`check-coverage-layers.sh`) measures
`domain` separately, so the move is visible there too.
"""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.instrument import SymbolNotQuotedInUsdtError, base_asset
from src.modules.sentimento.use_cases.collector_series_mapping import INITIAL_SYMBOLS


@pytest.mark.parametrize(
    ("symbol", "base"),
    [("BTCUSDT", "BTC"), ("ETHUSDT", "ETH"), ("SOLUSDT", "SOL"), ("LINKUSDT", "LINK")],
)
def test_the_base_asset_is_read_off_the_usd_m_naming_rule(symbol: str, base: str) -> None:
    """Every member of `INITIAL_SYMBOLS` resolves to its own base asset."""
    assert base_asset(symbol) == base


def test_every_symbol_of_the_initial_universe_has_a_readable_base_asset() -> None:
    """No member of the declared universe can reach a catalog builder and blow up on `unit`."""
    assert all(base_asset(symbol) for symbol in INITIAL_SYMBOLS)


@pytest.mark.parametrize("symbol", ["BTCBUSD", "USDT", "", "BTC"])
def test_a_symbol_whose_base_asset_cannot_be_read_is_refused_not_guessed(symbol: str) -> None:
    """Refusal, never a guess: a wrong `unit` is a silently DIFFERENT `series_key_id`.

    Morde: fall back to `"BTC"` (or to the symbol itself) and a `BTCBUSD` page would be
    published under an identity nobody declared, discoverable only by someone noticing a chart
    with two markets summed into it.
    """
    with pytest.raises(SymbolNotQuotedInUsdtError):
        base_asset(symbol)
