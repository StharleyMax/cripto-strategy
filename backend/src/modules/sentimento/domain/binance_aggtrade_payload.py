"""Shape of a Binance `aggTrade` payload, and the THREE states `ADR-001` refuses to merge."""
#
# `ADR-001` closes on a dependency it names as `[NAO MEDIDO]`: whether the WebSocket
# `<symbol>@aggTrade` carries `nq` (quantity EXCLUDING RPI orders). The REST endpoint carries it
# `[DOC: ADR-001, eight fields 'T a f l m nq p q']`; the S3 dump does NOT.
#
# WHY THREE STATES AND NOT A BOOLEAN. "Does the WS carry `nq`?" admits three answers that a
# boolean would collapse into one, and the collapse is the defect this module exists to prevent:
#
#   ABSENT  the key is not in the object at all
#   NULL    the key IS there and its value is `null`
#   VALUED  the key is there and carries a value
#
# `ABSENT` and `NULL` have OPPOSITE consequences for the collector of `T-03.4`: absence means the
# field must come from REST (weight, and a 48 h window); a null means the field is delivered but
# empty for this trade, and the aggregator must decide what an empty means. Answering "no" to both
# would hide that difference.

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from enum import Enum

# The two quantity fields of `ADR-001`. `q` is the canonical value of the decision path;
# `nq` is the parallel series that exists only from the first live capture onwards.
QUANTITY_FIELD_Q = "q"
QUANTITY_FIELD_NQ = "nq"


class FieldPresence(Enum):
    """The three states of one field. `ABSENT` and `NULL` are NOT the same answer."""

    ABSENT = "ABSENT"
    NULL = "NULL"
    VALUED = "VALUED"


class QuantityRelation(Enum):
    """How `nq` sits against `q` on ONE trade.

    `ADR-001` measured the deficit as UNIDIRECTIONAL over REST (`nq > q` in 0 of 1000). Its
    SECOND falsifier fires if `NQ_ABOVE_Q` appears even once: the deficit stops having a known
    direction and the `nq` series needs sign handling, not just isolation. This enum exists so
    that a violation is REPRESENTABLE and therefore countable — a comparison that could not
    express `NQ_ABOVE_Q` could never falsify the premise.
    """

    NQ_EQUALS_Q = "NQ_EQUALS_Q"
    NQ_BELOW_Q = "NQ_BELOW_Q"
    NQ_ABOVE_Q = "NQ_ABOVE_Q"
    UNCOMPARABLE = "UNCOMPARABLE"


def _presence_of(payload: Mapping[str, object], field: str) -> FieldPresence:
    """Separate "key missing" from "key present holding null"."""
    if field not in payload:
        return FieldPresence.ABSENT
    if payload[field] is None:
        return FieldPresence.NULL
    return FieldPresence.VALUED


def _as_decimal(value: object) -> Decimal | None:
    """Read a Binance quantity EXACTLY.

    Binance sends quantities as decimal STRINGS ("0.001"). `Decimal` reads the digits that were
    sent; `float` would introduce a binary rounding that this task has no mandate to introduce
    into market data. `None` means "not readable as a quantity", never "zero".
    """
    if not isinstance(value, str | int):
        return None
    try:
        return Decimal(value)
    except InvalidOperation:
        return None


@dataclass(frozen=True)
class AggTradeQuantityReading:
    """What ONE `aggTrade` message says about `q` and `nq`.

    `raw_q`/`raw_nq` keep the value AS SENT (the undecoded string) so that the evidence can be
    re-read without trusting this module's parsing.
    """

    symbol: str
    agg_trade_id: int | None
    q_presence: FieldPresence
    nq_presence: FieldPresence
    raw_q: str | None
    raw_nq: str | None
    relation: QuantityRelation
    raw_equal: bool

    @property
    def carries_nq_value(self) -> bool:
        """True only when `nq` is present AND holds a value — the question `D3.9` asks."""
        return self.nq_presence is FieldPresence.VALUED


def unwrap_stream_envelope(payload: Mapping[str, object]) -> Mapping[str, object]:
    """Strip the combined-stream envelope `{"stream": ..., "data": {...}}` when present.

    A single-stream endpoint (`/ws/<symbol>@aggTrade`) delivers the event bare; the combined
    endpoint (`/stream?streams=...`) wraps it. Reading the wrapper as if it were the event would
    report `q` and `nq` ABSENT on every message — a transport detail masquerading as the answer.
    """
    data = payload.get("data")
    if isinstance(data, Mapping):
        return {str(key): value for key, value in data.items()}
    return payload


def _relation_between(q: Decimal | None, nq: Decimal | None) -> QuantityRelation:
    """Order `nq` against `q`, refusing to guess when either side is unreadable."""
    if q is None or nq is None:
        return QuantityRelation.UNCOMPARABLE
    if nq == q:
        return QuantityRelation.NQ_EQUALS_Q
    if nq < q:
        return QuantityRelation.NQ_BELOW_Q
    return QuantityRelation.NQ_ABOVE_Q


def read_quantity_fields(payload: Mapping[str, object]) -> AggTradeQuantityReading:
    """Classify `q` and `nq` on one already-decoded `aggTrade` event.

    The envelope is stripped first. This function NEVER decides whether the stream "carries
    `nq`" — it describes ONE message. The verdict over a universe is built by the caller, which
    is the only place that knows how many messages and how many symbols were seen.
    """
    event = unwrap_stream_envelope(payload)
    raw_q = event.get(QUANTITY_FIELD_Q)
    raw_nq = event.get(QUANTITY_FIELD_NQ)
    agg_id = event.get("a")
    return AggTradeQuantityReading(
        symbol=str(event.get("s", "")),
        agg_trade_id=agg_id if isinstance(agg_id, int) else None,
        q_presence=_presence_of(event, QUANTITY_FIELD_Q),
        nq_presence=_presence_of(event, QUANTITY_FIELD_NQ),
        raw_q=raw_q if isinstance(raw_q, str) else None,
        raw_nq=raw_nq if isinstance(raw_nq, str) else None,
        relation=_relation_between(_as_decimal(raw_q), _as_decimal(raw_nq)),
        raw_equal=raw_q is not None and raw_q == raw_nq,
    )
