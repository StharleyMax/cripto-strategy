"""Symbol-to-partition sizing, dimensioned against ONE symbol's MEASURED throughput."""

# `T-07.6` (`CA-F3-7`, plan `07` item 7.8, DoD `D7.11`): "particionamento dimensionado contra a
# vazao medida" — the sizing has to be arithmetic over a measurement, not a guess. The
# measurement that exists is per SINGLE symbol: `docs/specs/PRD-001-plataforma-dados.md`
# `CA-F3-7` and `docs/plans/SPEC-001-plataforma-dados/07_aquisicao_em_regime.md` `D7.11` both
# publish the same five numbers over one symbol's `aggTrade` stream — p50 21, p95 204, p99 483,
# p99.9 1.251, max 3.224 msg/s `[MEDIDO]`.
#
# THE DIMENSIONING RULE, LITERAL FROM THE HANDOFF THIS TASK WAS BRIEFED WITH
# (`docs/context/plataforma-dados/handoff/T-07.6.md`): a partition's budget is spent as if EVERY
# symbol it holds could hit the measured `max` AT THE SAME TIME — "use o max 3.224 msg/s como
# orcamento por particao, nao o p50 — dimensionar pelo p50 sub-provisiona e derruba consumidor no
# pico real". So `n` symbols fit in one partition only when `n * max <= capacity`; `p50`/`p95`/
# `p99`/`p999` are NOT read by the sizing arithmetic below — they travel on `SingleSymbolThroughput`
# only so the whole measured ladder stays attached to `max` and cannot drift from `D7.11` without
# anything noticing, and so a future caller has the full percentile context on hand.
#
# `partition_capacity_msg_per_second` carries NO default. This module measures the SUPPLY side
# (how fast one symbol talks); it has never measured the DEMAND side (how many messages per
# second one partition's consumer can actually drain), and baking in a guessed capacity would be
# exactly the unlabelled number `CLAUDE.md`'s "nenhum numero sem o comando que o produziu"
# forbids. The caller supplies the capacity and is responsible for the command that produced it.

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Final

# The one measured fact this whole module is dimensioned against — cited, not just numbered, so
# a reader can walk to the source rather than trust a bare literal.
_SOURCE: Final[str] = (
    "docs/specs/PRD-001-plataforma-dados.md CA-F3-7 + "
    "docs/plans/SPEC-001-plataforma-dados/07_aquisicao_em_regime.md D7.11"
)


class InvalidThroughputError(ValueError):
    """A `SingleSymbolThroughput` whose percentiles contradict each other or go negative."""


class InfeasiblePartitionCapacityError(Exception):
    """`partition_capacity_msg_per_second` is below the measured single-symbol `max`.

    Below that floor, no partition size — not even one holding a single symbol — fits inside the
    declared capacity: the one symbol alone can outrun it. Refusing here is the deliverable, the
    same shape `clock_skew_tolerance.py` uses for a capacity the measurement cannot support.
    """


@dataclass(frozen=True)
class SingleSymbolThroughput:
    """One symbol's message-rate percentiles, in msg/s.

    `p50/p95/p99/p999/max` travel together, never as bare integers, so a caller reading
    `throughput.max` can still see it came from the same sample as the rest of the ladder — the
    same reason `ClockSkewTolerance` (`clock_skew_tolerance.py`) carries its evidence alongside
    the number it calibrated. Only `max` feeds the sizing arithmetic below (see module note).
    """

    p50: int
    p95: int
    p99: int
    p999: int
    max: int

    def __post_init__(self) -> None:
        """Reject a percentile ladder that is negative or not non-decreasing."""
        ordered = (self.p50, self.p95, self.p99, self.p999, self.max)
        if any(value < 0 for value in ordered):
            raise InvalidThroughputError(f"throughput percentiles cannot be negative: {ordered}")
        if list(ordered) != sorted(ordered):
            raise InvalidThroughputError(
                f"throughput percentiles must be non-decreasing "
                f"(p50<=p95<=p99<=p99.9<=max), got {ordered}"
            )


# `D7.11`, literal: p50 21, p95 204, p99 483, p99.9 1.251, max 3.224 msg/s, one symbol,
# `[MEDIDO]`.
MEASURED_SINGLE_SYMBOL_THROUGHPUT: Final[SingleSymbolThroughput] = SingleSymbolThroughput(
    p50=21, p95=204, p99=483, p999=1251, max=3224
)


def max_symbols_per_partition(
    partition_capacity_msg_per_second: int,
    throughput: SingleSymbolThroughput = MEASURED_SINGLE_SYMBOL_THROUGHPUT,
) -> int:
    """How many symbols one partition can hold under `partition_capacity_msg_per_second`.

    Every symbol in the partition is budgeted at the measured `throughput.max`, as if all of them
    could burst to it AT THE SAME TIME:

        n * max <= capacity   =>   n <= capacity // max

    This is deliberately more conservative than reserving `max` for only one "hot" symbol and
    `p50` for the rest: cross-symbol burst correlation was never measured, and the handoff this
    task was briefed with is explicit that sizing by anything softer than `max` "sub-provisiona e
    derruba consumidor no pico real" — a partition sized by `p50` or `p95` looks fine until every
    symbol it holds happens to spike together, which `D7.11` never rules out.

    Raises `InfeasiblePartitionCapacityError` when `partition_capacity_msg_per_second` is below
    `throughput.max` — not even one symbol fits inside a capacity that small.
    """
    if partition_capacity_msg_per_second < throughput.max:
        raise InfeasiblePartitionCapacityError(
            f"partition_capacity_msg_per_second={partition_capacity_msg_per_second} is below "
            f"the measured single-symbol max of {throughput.max} msg/s ({_SOURCE}); no "
            f"partition size fits inside this capacity, not even one holding a single symbol"
        )
    return partition_capacity_msg_per_second // throughput.max


def partition_count(
    symbol_count: int,
    partition_capacity_msg_per_second: int,
    throughput: SingleSymbolThroughput = MEASURED_SINGLE_SYMBOL_THROUGHPUT,
) -> int:
    """How many partitions `symbol_count` symbols need under `partition_capacity_msg_per_second`.

    `ceil(symbol_count / max_symbols_per_partition(...))` — the smallest number of partitions
    that still respects the same worst-case-simultaneous budget `max_symbols_per_partition`
    enforces. `symbol_count <= 0` needs zero partitions; it is not an error, since an empty
    universe is a valid (if uninteresting) input.
    """
    if symbol_count <= 0:
        return 0
    per_partition = max_symbols_per_partition(partition_capacity_msg_per_second, throughput)
    return math.ceil(symbol_count / per_partition)


def partition_symbols(
    symbols: Sequence[str], max_per_partition: int
) -> tuple[tuple[str, ...], ...]:
    """Split `symbols` into fixed-size partitions, preserving the caller's order.

    Order is never reshuffled: for a WS collector, which partition a symbol lands in is part of
    its reconnect identity (`ADR-004`), and resorting here would make that identity depend on
    this function's internals instead of the caller's own list.
    """
    if max_per_partition <= 0:
        raise ValueError(f"max_per_partition must be positive, got {max_per_partition}")
    return tuple(
        tuple(symbols[start : start + max_per_partition])
        for start in range(0, len(symbols), max_per_partition)
    )
