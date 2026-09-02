"""Parse and validate one poll of Binance's batch `premiumIndex` — `CA-F0-1b`, plan item 3.3."""

# ── WHY THIS ENDPOINT HAS NO "SINCE" PARAMETER, AND WHY THAT IS STRUCTURAL HERE ────────────
#
# `GET /fapi/v1/premiumIndex` publishes the CURRENT estimated funding rate (`lastFundingRate`)
# and mark/index price for every instrument. Binance's own documentation names no `startTime`,
# `endTime` or `limit` parameter for it — there is no history to ask for, in any source, ever
# (`docs/decisoes-do-owner.md:65`, `tasks.toml` `T-03.5`, literal: "nao tem endpoint de
# historico em fonte nenhuma"). `PREMIUM_INDEX_ENDPOINT` below is a bare path with no query
# string, and no function in this module accepts a time argument to build one — the collector
# cannot ask for a day it was not running on, because the request that would ask for it cannot
# be constructed. A series built from this module exists FROM THE DAY THE COLLECTOR FIRST
# POLLS, and never before; backfill is not "not implemented", it is not expressible.
#
# ── THE MEASUREMENT THIS MODULE'S CONSTANT REPRODUCES ──────────────────────────────────────
#
# `docs/decisoes-do-owner.md:256`: "`premiumIndex` sem `symbol` = 875 simbolos por peso 10
# contra `REQUEST_WEIGHT 2400/min`" (header `x-mbx-used-weight-1m` 1 -> 11 on that measurement).
# Reproduced here `[MEDIDO 2026-09-01]`:
#
#   for i in 1 2; do curl -sS -D - -o /dev/null \
#     "https://fapi.binance.com/fapi/v1/premiumIndex" --max-time 15 \
#     | grep -i 'x-mbx-used-weight-1m\|^HTTP'; sleep 1; done
#   -> HTTP/2 200, x-mbx-used-weight-1m: 31
#   -> HTTP/2 200, x-mbx-used-weight-1m: 41
#
# Delta = 10 across 2 consecutive calls, n=2 chamadas — the weight is CONFIRMED. The symbol
# count on that same date was 888, not 875: the universe drifted, which is the SAME drift
# `docs/decisoes-do-owner.md:364` already documents between `exchangeInfo` and `premiumIndex`
# on one instant (872 vs 875). This module never hardcodes a symbol count as an invariant —
# only the STRUCTURE of one row and the ABSENCE of a duplicate symbol are checked, because the
# count is a fact of the day, not a contract.
#
# `infra/premium_index_probe_cli.py` is the reproducible command for this comment: it performs
# the same two-call measurement against the live endpoint (or an injected fake in the suite)
# and reports the delta rather than asking a reader to trust prose.

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Final

# The literal path Binance documents. No query string: see the module docstring above for why
# that absence is the enforcement, not an omission.
PREMIUM_INDEX_ENDPOINT: Final[str] = "/fapi/v1/premiumIndex"

# Binance API docs, reproduced by the probe above: the batch call (no `symbol`) costs this
# weight regardless of how many instruments come back. A caller with a `symbol` argument would
# cost 1 instead of 10 — this module only ever builds the symbol-less request, because that is
# "o jeito barato de pegar o universo inteiro numa chamada" (handoff, literal).
PREMIUM_INDEX_BATCH_WEIGHT_DECLARED: Final[int] = 10

_REQUIRED_STRING_FIELDS: Final[tuple[str, ...]] = (
    "symbol",
    "markPrice",
    "indexPrice",
    "estimatedSettlePrice",
    "lastFundingRate",
    "interestRate",
)
_REQUIRED_INT_FIELDS: Final[tuple[str, ...]] = ("nextFundingTime", "time")


class InvalidPremiumIndexPayloadError(Exception):
    """One entry of the batch does not have the shape this collector requires to store it.

    English on purpose (`CLAUDE.md` "A lacuna conhecida ... mensagem de exceção": the ratio of
    Portuguese to English exception strings in this repository is an open, watched number, and
    this module does not add to the Portuguese side of it).
    """


@dataclass(frozen=True)
class PremiumIndexReading:
    """One symbol's row from ONE poll of the batch endpoint.

    Every numeric Binance field is kept as the RAW STRING it arrived in, the same choice
    `binance_aggtrade_payload.py` makes for `q`/`nq`: `float` would introduce a binary rounding
    this collector has no mandate to introduce into market data, and later layers (phase `04`)
    are where a canonical numeric type gets decided. `source_time` is Binance's own `time`
    field — when THEY computed this row — kept separate from `received_at`, which is when THIS
    collector saw it; the two are never the same instant and collapsing them would erase the
    provenance distinction `SPEC-001` §3.1 exists to keep.
    """

    symbol: str
    mark_price_raw: str
    index_price_raw: str
    estimated_settle_price_raw: str
    last_funding_rate_raw: str
    interest_rate_raw: str
    next_funding_time: int
    source_time: int


def parse_premium_index_batch(raw: object) -> tuple[PremiumIndexReading, ...]:
    """Validate and parse one decoded JSON batch response into readings.

    `raw` is `object`, not `list[object]`, on purpose: the caller decoded untrusted bytes, and
    trusting the shape before checking it is exactly the class of bug `mypy --strict` cannot
    catch on its own. Refuses (rather than skips) a duplicate `symbol`: it is the natural key
    of this batch, and a caller that silently kept only one copy would under- or over-count the
    universe in the exact way `D2.3`/`D2.5` already measured this endpoint diverging from
    `exchangeInfo` — a defect this module should surface, never absorb.
    """
    if not isinstance(raw, list):
        raise InvalidPremiumIndexPayloadError(
            f"premiumIndex batch is not a list: got {type(raw).__name__}"
        )
    readings: list[PremiumIndexReading] = []
    seen: set[str] = set()
    for index, item in enumerate(raw):
        reading = _parse_one(item, index)
        if reading.symbol in seen:
            raise InvalidPremiumIndexPayloadError(
                f"symbol {reading.symbol!r} repeated in the batch at index {index}: the "
                "symbol is this endpoint's natural key, and a repeat would either under- or "
                "over-count the universe silently"
            )
        seen.add(reading.symbol)
        readings.append(reading)
    return tuple(readings)


def _parse_one(item: object, index: int) -> PremiumIndexReading:
    """Parse one entry, naming the index and the field that failed on any refusal."""
    if not isinstance(item, Mapping):
        raise InvalidPremiumIndexPayloadError(
            f"entry {index} is not an object: got {type(item).__name__}"
        )
    strings: dict[str, str] = {}
    for field_name in _REQUIRED_STRING_FIELDS:
        value = item.get(field_name)
        if not isinstance(value, str) or not value:
            raise InvalidPremiumIndexPayloadError(
                f"entry {index} field {field_name!r} is missing or not a non-empty string: "
                f"{value!r}"
            )
        strings[field_name] = value
    ints: dict[str, int] = {}
    for field_name in _REQUIRED_INT_FIELDS:
        value = item.get(field_name)
        # `bool` is an `int` subclass in Python; excluded explicitly so a stray `true`/`false`
        # cannot pass as a millisecond timestamp.
        if not isinstance(value, int) or isinstance(value, bool):
            raise InvalidPremiumIndexPayloadError(
                f"entry {index} field {field_name!r} is missing or not an integer: {value!r}"
            )
        ints[field_name] = value
    return PremiumIndexReading(
        symbol=strings["symbol"],
        mark_price_raw=strings["markPrice"],
        index_price_raw=strings["indexPrice"],
        estimated_settle_price_raw=strings["estimatedSettlePrice"],
        last_funding_rate_raw=strings["lastFundingRate"],
        interest_rate_raw=strings["interestRate"],
        next_funding_time=ints["nextFundingTime"],
        source_time=ints["time"],
    )
