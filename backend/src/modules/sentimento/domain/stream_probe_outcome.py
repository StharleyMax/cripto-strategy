"""The outcome of a stream probe, built so that "did not connect" CANNOT be read as "no field"."""
#
# THE DEFECT THIS MODULE EXISTS TO PREVENT, stated plainly: a probe that returns "`nq` absent"
# when the socket never opened is not measuring the stream — it is measuring itself. An empty
# result is not evidence of absence; it can equally be a host that refused, a handshake that was
# rejected, or a frame that never arrived.
#
# The guarantee here is STRUCTURAL, not a convention a caller has to remember: field readings live
# ONLY inside `ProbeMeasured`. `ProbeNotMeasured` has no field to hold them, so there is no value
# of this type that says "absent" without a message having actually been decoded. A caller cannot
# misreport a transport failure as a field verdict, because it cannot CONSTRUCT one.

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from enum import Enum

from src.modules.sentimento.domain.binance_aggtrade_payload import (
    AggTradeQuantityReading,
    FieldPresence,
    QuantityRelation,
)


class ProbeStage(Enum):
    """How far the probe got. The stage that FAILED is the whole content of a negative result.

    Ordered from first to last. A probe that fails at `TLS` and one that fails at `HTTP_UPGRADE`
    are different findings: the first says the host is unreachable, the second says the host is
    reachable and refused the stream we asked for.
    """

    DNS = "DNS"
    TCP = "TCP"
    TLS = "TLS"
    HTTP_UPGRADE = "HTTP_UPGRADE"
    FRAME = "FRAME"
    DECODE = "DECODE"
    MESSAGE = "MESSAGE"


class WindowEnd(Enum):
    """COMO a janela terminou. Sem isto, uma observacao de 2 s se apresenta como uma de 120 s.

    `DeclaredUniverse` guarda o que foi PEDIDO; este enum, com `observed_seconds`, guarda o que
    foi OBSERVADO. Os dois nao sao o mesmo objeto, e o defeito que esta enumeracao fecha era
    exatamente confundi-los: uma corrida que morria apos a primeira mensagem publicava
    `window_seconds: 120.0` e `rc=0`, sem nenhuma chave dizendo que fora interrompida — e essa e
    a trajetoria em que `D3.9` FECHARIA, porque o DoD pede "1 simbolo, 1 mensagem".
    """

    WINDOW_ELAPSED = "WINDOW_ELAPSED"
    MESSAGE_CAP = "MESSAGE_CAP"
    STREAM_ENDED = "STREAM_ENDED"
    INTERRUPTED = "INTERRUPTED"


class NqVerdict(Enum):
    """The answer to `D3.9` over a DECLARED universe — never over "whatever showed up"."""

    NOT_MEASURED = "NOT_MEASURED"
    VALUED_IN_ALL = "VALUED_IN_ALL"
    ABSENT_IN_ALL = "ABSENT_IN_ALL"
    NULL_IN_ALL = "NULL_IN_ALL"
    MIXED = "MIXED"


@dataclass(frozen=True)
class ProbeNotMeasured:
    """The probe did not deliver a message. It carries NO field reading, by construction."""

    failed_stage: ProbeStage
    detail: str

    @property
    def verdict(self) -> NqVerdict:
        """Always `NOT_MEASURED`: a transport failure is silent about the payload."""
        return NqVerdict.NOT_MEASURED


@dataclass(frozen=True)
class SymbolBreakdown:
    """Per-symbol counts: "carries `nq`" can be true for one symbol and false for another."""

    symbol: str
    messages: int
    nq_valued: int
    nq_null: int
    nq_absent: int
    nq_above_q: int
    nq_equal_q: int

    @property
    def verdict(self) -> NqVerdict:
        """Collapse this symbol's counts, keeping `MIXED` reachable."""
        return _verdict_from_counts(self.messages, self.nq_valued, self.nq_null, self.nq_absent)


def _verdict_from_counts(total: int, valued: int, null: int, absent: int) -> NqVerdict:
    """Return the all-or-nothing verdict, or `MIXED` when the states disagree."""
    if total == 0:
        return NqVerdict.NOT_MEASURED
    if valued == total:
        return NqVerdict.VALUED_IN_ALL
    if absent == total:
        return NqVerdict.ABSENT_IN_ALL
    if null == total:
        return NqVerdict.NULL_IN_ALL
    return NqVerdict.MIXED


@dataclass(frozen=True)
class ProbeMeasured:
    """At least one message was decoded. Only THIS type can speak about the field."""

    readings: tuple[AggTradeQuantityReading, ...]
    window_end: WindowEnd
    observed_seconds: float
    interrupted_at_stage: ProbeStage | None = None

    @property
    def window_complete(self) -> bool:
        """True so quando a janela fechou pelo criterio DECLARADO (tempo ou teto)."""
        return self.window_end in (WindowEnd.WINDOW_ELAPSED, WindowEnd.MESSAGE_CAP)

    @property
    def messages(self) -> int:
        """How many messages the verdict rests on — the `n` that travels with the number."""
        return len(self.readings)

    @property
    def verdict(self) -> NqVerdict:
        """The verdict over every message seen, across every symbol."""
        return _verdict_from_counts(
            self.messages,
            sum(1 for r in self.readings if r.nq_presence is FieldPresence.VALUED),
            sum(1 for r in self.readings if r.nq_presence is FieldPresence.NULL),
            sum(1 for r in self.readings if r.nq_presence is FieldPresence.ABSENT),
        )

    @property
    def nq_above_q_count(self) -> int:
        """Hits on the SECOND falsifier of `ADR-001`. One is enough to fire it."""
        return sum(1 for r in self.readings if r.relation is QuantityRelation.NQ_ABOVE_Q)

    def by_symbol(self) -> tuple[SymbolBreakdown, ...]:
        """Break the universe down per symbol, in declared-symbol order."""
        grouped: dict[str, list[AggTradeQuantityReading]] = {}
        for reading in self.readings:
            grouped.setdefault(reading.symbol, []).append(reading)
        return tuple(_breakdown_of(symbol, readings) for symbol, readings in grouped.items())


def _breakdown_of(symbol: str, readings: list[AggTradeQuantityReading]) -> SymbolBreakdown:
    """Count the states of one symbol's messages."""
    return SymbolBreakdown(
        symbol=symbol,
        messages=len(readings),
        nq_valued=sum(1 for r in readings if r.nq_presence is FieldPresence.VALUED),
        nq_null=sum(1 for r in readings if r.nq_presence is FieldPresence.NULL),
        nq_absent=sum(1 for r in readings if r.nq_presence is FieldPresence.ABSENT),
        nq_above_q=sum(1 for r in readings if r.relation is QuantityRelation.NQ_ABOVE_Q),
        nq_equal_q=sum(1 for r in readings if r.relation is QuantityRelation.NQ_EQUALS_Q),
    )


ProbeOutcome = ProbeNotMeasured | ProbeMeasured


@dataclass(frozen=True)
class DeclaredUniverse:
    """What was ASKED FOR, recorded next to what was OBSERVED.

    Kept separate from the outcome on purpose: a probe that asked for five symbols and heard
    from three has a result whose universe is three, and only a record of the REQUEST can make
    that gap visible. Without this, a silent symbol looks identical to a symbol never requested.
    """

    symbols: tuple[str, ...]
    window_seconds: float
    max_messages: int
    endpoint: str
    # WHICH event counts as a message. It is a parameter and not a constant because the NEGATIVE
    # CONTROL of `D3.9` runs this same probe against a stream that genuinely has no `nq`
    # (`bookTicker`): if the event type were hard-coded to `aggTrade`, the control would return
    # "no usable message" and be indistinguishable from a probe that never connected — the exact
    # collapse this whole module refuses.
    event_type: str = "aggTrade"

    def as_dict(self) -> Mapping[str, object]:
        """Flatten for the evidence file, so the universe travels WITH the number."""
        return {
            "symbols": list(self.symbols),
            "window_seconds": self.window_seconds,
            "max_messages": self.max_messages,
            "endpoint": self.endpoint,
            "event_type": self.event_type,
        }

    def silent_symbols(self, observed: Iterable[str]) -> tuple[str, ...]:
        """Return the requested symbols that produced no message, never rounding them away."""
        heard = set(observed)
        return tuple(symbol for symbol in self.symbols if symbol.upper() not in heard)
