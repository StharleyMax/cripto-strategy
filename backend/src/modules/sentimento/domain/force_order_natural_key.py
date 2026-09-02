"""ADR-004 B2 — the DECLARED dedupe key for `!forceOrder@arr`, never presumed."""
#
# `!forceOrder@arr` carries no sequence identifier (`ADR-004`, table in "Contexto"): there is no
# `agg_id`-equivalent a reconnection can key on. B2 fixes the key instead of leaving it to
# whatever a caller happens to hash: `(symbol, side, price, orig_qty, trade_time)`, read from the
# `o` object of the raw envelope. This module is the ONLY place that reads those five fields out
# of the raw text — the recorder (`force_order_raw_recorder.py`, `T-03.2`) never parses a single
# field of the payload, and this module does not change that: it reads the SAME untouched `raw`
# string for the reconnect policy's dedupe key alone, and returns a key, never a normalized
# liquidation event.

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Final

# THE ORDER IS PART OF THE CONTRACT, same reasoning as `FORCE_ORDER_ENVELOPE_COLUMNS`
# (`force_order_envelope.py`): a machine consumer of a published collision report reads this
# key by position or by name, and reordering it changes what it reads without a type check
# noticing.
FORCE_ORDER_NATURAL_KEY_FIELDS: Final[tuple[str, ...]] = (
    "symbol",
    "side",
    "price",
    "orig_qty",
    "trade_time",
)


@dataclass(frozen=True)
class ForceOrderNaturalKey:
    """ADR-004 B2's declared dedupe key: `(symbol, side, price, orig_qty, trade_time)`.

    `price` and `orig_qty` stay STRINGS, exactly as Binance sends them (e.g. `"78000.00"`).
    Comparing the decimal strings byte-for-byte is exact; parsing them to `float` would let two
    textual representations of the same value compare unequal, or let rounding make two
    different values compare equal — either would corrupt the exactness B2 declares this key to
    have.
    """

    symbol: str
    side: str
    price: str
    orig_qty: str
    trade_time: int


class ForceOrderKeyExtractionError(ValueError):
    """Raised when raw text is not a `forceOrder` envelope this key can be read from.

    Never swallowed by a caller: a message this module cannot key is a message the B3 collision
    accounting cannot dedupe, and silently dropping it would let the published rate under-count
    without anyone being told which raw line caused it (`core.silent-except`).
    """


def extract_force_order_natural_key(raw: str) -> ForceOrderNaturalKey:
    """Parse ONLY the five ADR-004 B2 fields out of one raw `!forceOrder@arr` message.

    Raises `ForceOrderKeyExtractionError`, chained from whatever stdlib exception the malformed
    text produced, so the caller sees both "this could not be keyed" and the specific reason.
    """
    try:
        payload = json.loads(raw)
        order = payload["o"]
        return ForceOrderNaturalKey(
            symbol=str(order["s"]),
            side=str(order["S"]),
            price=str(order["p"]),
            orig_qty=str(order["q"]),
            trade_time=int(order["T"]),
        )
    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as failure:
        raise ForceOrderKeyExtractionError(
            "raw !forceOrder@arr message does not have the five natural-key B2 fields "
            f"(symbol/side/price/orig_qty/trade_time) declared in ADR-004: {failure!r}"
        ) from failure


def trade_time_utc_date(trade_time_ms: int) -> str:
    """Compute the UTC calendar day (`YYYY-MM-DD`) of one `trade_time`, in epoch milliseconds.

    Deterministic given `trade_time_ms` — `tz=UTC` is passed explicitly so this never reads the
    machine's local timezone, the one way `datetime.fromtimestamp` would otherwise depend on
    WHERE it runs rather than on its argument (the same "value, not capacity" line `ADR-016/D1`
    draws for `domain/`: this is arithmetic on a given instant, not a clock read).
    """
    return datetime.fromtimestamp(trade_time_ms / 1000, tz=UTC).date().isoformat()
