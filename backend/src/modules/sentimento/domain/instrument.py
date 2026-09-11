"""`base_asset`: read an instrument's BASE asset off its own USDⓈ-M symbol.

── WHY THIS LIVES IN `domain/`, AND WHY IT MOVED HERE ──────────────────────────────────────

The function was born in `use_cases/collector_series_mapping.py` (`T-01.3`), because the
WRITER was the first side that needed it: `klines_volume` carries `denom="base"`, so its
`unit` has to be the instrument's own base asset — `BTC` for `BTCUSDT`, `ETH` for `ETHUSDT`.

It is not a use case. It is a reading of the venue's naming rule, it has no collaborator and
no I/O, and TWO other places need exactly the same reading:

  * `use_cases/series_catalog.py`, which until this module existed hardcoded
    `_BASE_ASSET_UNIT = "BTC"` and passed it to `build_cvd_source_catalog_entries` and
    `build_klines_volume_entry` — the exact literal those two builders refuse to default
    internally, reintroduced one layer up (`cvd_source_catalog.py:190`, and
    `klines_volume_catalog.py`'s own docstring: a hardcoded `"BTC"` "would silently mislabel
    every non-`BTC` instrument");
  * `domain/open_interest_catalog.py`, which hardcodes `unit="BTC"` on rows whose
    `instrument_id` is a free argument — and `domain` may not import `use_cases`
    (`[tool.importlinter]`'s `layers` contract), so as long as the reading lived in a use
    case that module structurally COULD NOT reuse it.

Both readings are the same fact about the same instrument, so it has one home, and the home
is the layer both callers may import.

── WHAT A WRONG ANSWER COSTS, WHICH IS WHY IT REFUSES INSTEAD OF GUESSING ──────────────────

`unit` is the seventh term of `SeriesKey`, and `series_key_id()` is the `sha256` of the
canonical projection of all fifteen (`series_key.py:226-234`). A wrong `unit` is therefore
not a wrong LABEL — it is a different series, under an id nothing else writes to, and
`/api/v1/series-history` answers it with `n_points = 0` instead of an error. That is the
`rc=0`-shaped silent break `ADR-012` names, so a symbol this rule cannot read is REFUSED.
"""

from __future__ import annotations

from typing import Final

# The quote asset of every symbol this repository collects today (`INITIAL_SYMBOLS`,
# `use_cases/collector_series_mapping.py`). On USDⓈ-M futures the quote asset IS the margin
# asset, so stripping this suffix reads the venue's own naming rule rather than keeping a
# hand-maintained table of base assets in sync.
USDT_QUOTE: Final[str] = "USDT"


class SymbolNotQuotedInUsdtError(ValueError):
    """A symbol's base asset cannot be read off its name because it is not a `…USDT` pair."""


def base_asset(symbol: str) -> str:
    """Return the BASE asset of a USDⓈ-M symbol — `BTCUSDT` -> `BTC`.

    A symbol that does not end in `USDT`, or that is nothing BUT the suffix, is refused
    rather than guessed at, for the reason this module's docstring measures: a wrong `unit`
    is a silently different `series_key_id`, and `SeriesKey` has no way to notice.
    """
    if not symbol.endswith(USDT_QUOTE) or len(symbol) <= len(USDT_QUOTE):
        raise SymbolNotQuotedInUsdtError(
            f"cannot read the base asset off {symbol!r}: this domain only knows USD-M pairs "
            f"quoted in {USDT_QUOTE!r}, and guessing the unit would change the series_key_id"
        )
    return symbol[: -len(USDT_QUOTE)]
