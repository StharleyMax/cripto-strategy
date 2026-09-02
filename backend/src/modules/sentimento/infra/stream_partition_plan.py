"""Turn a symbol-partitioning decision into the WS connection paths that realize it."""

# `domain/stream_partitioning.py` (`T-07.6`) decides HOW MANY symbols one partition may hold and
# how the universe splits into partitions; this module is the composition that turns each group
# into the actual `/stream?streams=...` path `combined_stream_path` (`T-03.1`,
# `infra/binance_stream_probe.py`) already builds and this repository's probe CLI already proved
# live over a real handshake. `infra` may import both `use_cases` and `domain`
# (`ADR-011/D3a`'s layers contract: `infra > use_cases > domain`), so this composition belongs
# here — `domain` itself must stay free of the WS/transport concern `combined_stream_path`
# carries.

from __future__ import annotations

from collections.abc import Sequence

from src.modules.sentimento.domain.stream_partitioning import (
    MEASURED_SINGLE_SYMBOL_THROUGHPUT,
    SingleSymbolThroughput,
    max_symbols_per_partition,
    partition_symbols,
)
from src.modules.sentimento.infra.binance_stream_probe import combined_stream_path


def plan_stream_connections(
    symbols: Sequence[str],
    partition_capacity_msg_per_second: int,
    stream: str = "aggTrade",
    throughput: SingleSymbolThroughput = MEASURED_SINGLE_SYMBOL_THROUGHPUT,
) -> tuple[str, ...]:
    """One combined-stream connection path per partition, sized against `throughput` (`D7.11`).

    `symbols` keeps the caller's order end to end: `max_symbols_per_partition` decides the
    partition size, `partition_symbols` groups `symbols` into that many fixed-size, order
    preserving chunks, and this function's only job is handing each chunk to `combined_stream_path`
    unchanged — the same function `infra/aggtrade_nq_probe_cli.py` already calls for the probe.
    """
    per_partition = max_symbols_per_partition(partition_capacity_msg_per_second, throughput)
    groups = partition_symbols(symbols, per_partition)
    return tuple(combined_stream_path(group, stream) for group in groups)
