"""Read `aggTrades` CSV dumps into `AggTradeTick` — the two columns `plano 04` item 4.3 needs."""

from __future__ import annotations

import csv
from collections.abc import Sequence
from pathlib import Path
from typing import Final

from src.modules.sentimento.domain.aggtrade_contiguity import AggTradeTick

# The seven columns Binance's monthly `aggTrades` dump ships, transcribed from the header this
# repository's own fixtures carry (`data/binance/aggtrades/*.csv`, catalogued in
# `data/MANIFEST.md`). Read the header in full so a drift REPROVES loudly instead of silently
# reading the wrong column by position.
AGGTRADE_CSV_COLUMNS: Final[tuple[str, ...]] = (
    "agg_trade_id",
    "price",
    "quantity",
    "first_trade_id",
    "last_trade_id",
    "transact_time",
    "is_buyer_maker",
)

_AGG_TRADE_ID_INDEX: Final[int] = AGGTRADE_CSV_COLUMNS.index("agg_trade_id")
_TRANSACT_TIME_INDEX: Final[int] = AGGTRADE_CSV_COLUMNS.index("transact_time")


def read_aggtrade_ticks(path: Path) -> tuple[AggTradeTick, ...]:
    """Read one `aggTrades` CSV file into `AggTradeTick`, in FILE order — unsorted.

    Reads only `agg_trade_id` and `transact_time`: `price`/`quantity`/`is_buyer_maker`/the
    trade-id range are outside `plano 04` item 4.3's scope (identity and contiguity only), and
    parsing them here would cost time on files with millions of rows for no consumer this task
    has. `csv.reader` (not `DictReader`) on purpose — the header is validated once, up front,
    and every data row after that is read by fixed position instead of paying a dict build per
    row on a file this large.
    """
    ticks: list[AggTradeTick] = []
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.reader(handle)
        header = tuple(next(reader))
        if header != AGGTRADE_CSV_COLUMNS:
            raise ValueError(
                f"{path}: header {header} does not match the seven declared columns "
                f"{AGGTRADE_CSV_COLUMNS}"
            )
        for record in reader:
            ticks.append(
                AggTradeTick(
                    agg_id=int(record[_AGG_TRADE_ID_INDEX]),
                    transact_time_ms=int(record[_TRANSACT_TIME_INDEX]),
                )
            )
    return tuple(ticks)


def read_aggtrade_ticks_from_many(paths: Sequence[Path]) -> tuple[AggTradeTick, ...]:
    """Concatenate several daily dumps IN THE ORDER GIVEN — no re-sort, no gap-filling.

    `D4.4`'s fixture spans three files with a known day fully absent between two of them
    (`2026-08-22`, never captured): concatenating in the caller-declared date order is what
    lets `detect_agg_id_gaps` see that hole as ONE discontinuity, instead of three
    independently-correct files that are never compared against each other.
    """
    combined: list[AggTradeTick] = []
    for path in paths:
        combined.extend(read_aggtrade_ticks(path))
    return tuple(combined)
