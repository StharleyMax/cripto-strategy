"""`T-07.6`: partitioning decisions realized as actual `combined_stream_path` connections."""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.stream_partitioning import (
    InfeasiblePartitionCapacityError,
    SingleSymbolThroughput,
)
from src.modules.sentimento.infra.stream_partition_plan import plan_stream_connections


def test_a_universe_that_fits_in_one_partition_yields_one_connection() -> None:
    """Capacity for both symbols to peak simultaneously (`max_symbols_per_partition == 2`)."""
    paths = plan_stream_connections(
        ("BTCUSDT", "ETHUSDT"), partition_capacity_msg_per_second=3224 * 2
    )

    assert paths == ("/stream?streams=btcusdt@aggTrade/ethusdt@aggTrade",)


def test_a_universe_bigger_than_one_partition_yields_one_connection_per_partition() -> None:
    """At exactly `max` capacity, `max_symbols_per_partition == 1` — each symbol gets its own."""
    paths = plan_stream_connections(("BTCUSDT", "ETHUSDT"), partition_capacity_msg_per_second=3224)

    assert len(paths) == 2
    assert paths[0] == "/stream?streams=btcusdt@aggTrade"
    assert paths[1] == "/stream?streams=ethusdt@aggTrade"


def test_stream_name_is_forwarded_to_every_partition() -> None:
    """`stream` is not hardcoded to `aggTrade` — every connection path carries the same choice."""
    paths = plan_stream_connections(
        ("BTCUSDT",), partition_capacity_msg_per_second=3224, stream="bookTicker"
    )

    assert paths == ("/stream?streams=btcusdt@bookTicker",)


def test_capacity_below_the_measured_max_refuses_before_building_any_path() -> None:
    """The infeasibility check in `domain` fires here too — no partial plan is ever returned."""
    with pytest.raises(InfeasiblePartitionCapacityError):
        plan_stream_connections(("BTCUSDT",), partition_capacity_msg_per_second=100)


def test_a_generous_capacity_groups_many_symbols_into_one_connection() -> None:
    """With enough headroom, several symbols share ONE combined-stream connection."""
    paths = plan_stream_connections(
        ("BTCUSDT", "ETHUSDT", "SOLUSDT"), partition_capacity_msg_per_second=10_000
    )

    assert paths == ("/stream?streams=btcusdt@aggTrade/ethusdt@aggTrade/solusdt@aggTrade",)


def test_an_empty_universe_plans_zero_connections() -> None:
    """No symbols to track means no connection to open — not one connecting to nothing."""
    assert not plan_stream_connections((), partition_capacity_msg_per_second=10_000)


def test_injected_throughput_overrides_the_measured_default() -> None:
    """A caller declaring its own `SingleSymbolThroughput` is honored over `D7.11`'s default."""
    generous = SingleSymbolThroughput(p50=1, p95=1, p99=1, p999=1, max=1)

    paths = plan_stream_connections(
        ("BTCUSDT", "ETHUSDT", "SOLUSDT"),
        partition_capacity_msg_per_second=3,
        throughput=generous,
    )

    assert paths == ("/stream?streams=btcusdt@aggTrade/ethusdt@aggTrade/solusdt@aggTrade",)
