"""Read `aggTrades` CSV dumps into `AggTradeTick` — the two columns `plano 04` item 4.3 needs."""

from __future__ import annotations

import csv
import itertools
from collections.abc import Sequence
from pathlib import Path
from typing import Final

from src.modules.sentimento.domain.aggtrade_bucket_aggregate import AggTradeBucketTrade
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
_QUANTITY_INDEX: Final[int] = AGGTRADE_CSV_COLUMNS.index("quantity")
_TRANSACT_TIME_INDEX: Final[int] = AGGTRADE_CSV_COLUMNS.index("transact_time")
_IS_BUYER_MAKER_INDEX: Final[int] = AGGTRADE_CSV_COLUMNS.index("is_buyer_maker")


def read_aggtrade_ticks(path: Path) -> tuple[AggTradeTick, ...]:
    """Read one `aggTrades` CSV file into `AggTradeTick`, in FILE order — unsorted.

    Reads only `agg_trade_id` and `transact_time`: `price`/`quantity`/`is_buyer_maker`/the
    trade-id range are outside `plano 04` item 4.3's scope (identity and contiguity only).
    `plano 03` item 3.5 IS a consumer of `quantity`/`is_buyer_maker` — `read_aggtrade_bucket_
    trades` below reads them, as a SIBLING function rather than a widening of this one, so a
    caller that only needs identity-and-order still pays for two columns and not seven.
    `csv.reader` (not `DictReader`) on purpose — the header is validated once, up front, and
    every data row after that is read by fixed position instead of paying a dict build per row
    on a file this large.
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


def read_aggtrade_bucket_trades(
    path: Path,
    *,
    limit: int | None = None,
) -> tuple[AggTradeBucketTrade, ...]:
    """Read one `aggTrades` CSV dump into `AggTradeBucketTrade`, in FILE order — unsorted.

    `raw_nq` is ALWAYS `None`: the S3 dump's seven columns never include `nq` (`CL-5`,
    `ADR-001`) — this reader does not probe for an eighth column that this file format has
    never carried, it names the absence directly in every row it produces. A live capture
    (WS/REST, both fields present) needs a DIFFERENT reader over a different payload shape;
    this one is for the dump-replay half of `plano 03` item 3.5's mechanism proof.

    `is_buyer_maker` is the literal lowercase `"true"`/`"false"` the dump writes — parsed here,
    once, rather than handed to the domain layer as a string for it to interpret twice.

    `limit`, when given, stops after that many DATA rows. The full multi-million-row scale of
    `agg_id` contiguity is already proven, once, by `aggtrade_contiguity.py`'s own fixture test
    (8.873.078 rows, 0 internal gaps) — a caller proving THIS module's fold/refuse behaviour on
    real bytes does not need to re-pay that `Decimal`-parsing cost a second time to be honest
    about which file the numbers came from.
    """
    trades: list[AggTradeBucketTrade] = []
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.reader(handle)
        header = tuple(next(reader))
        if header != AGGTRADE_CSV_COLUMNS:
            raise ValueError(
                f"{path}: header {header} does not match the seven declared columns "
                f"{AGGTRADE_CSV_COLUMNS}"
            )
        rows = reader if limit is None else itertools.islice(reader, limit)
        for record in rows:
            trades.append(
                AggTradeBucketTrade(
                    agg_id=int(record[_AGG_TRADE_ID_INDEX]),
                    transact_time_ms=int(record[_TRANSACT_TIME_INDEX]),
                    raw_q=record[_QUANTITY_INDEX],
                    raw_nq=None,
                    is_buyer_maker=_parse_is_buyer_maker(record[_IS_BUYER_MAKER_INDEX], path=path),
                )
            )
    return tuple(trades)


def _parse_is_buyer_maker(raw: str, *, path: Path) -> bool:
    """Parse the dump's literal `"true"`/`"false"`, refusing anything else instead of guessing."""
    if raw == "true":
        return True
    if raw == "false":
        return False
    raise ValueError(f"{path}: is_buyer_maker {raw!r} is neither 'true' nor 'false'")
