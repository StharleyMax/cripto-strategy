"""`T-07.6`: partitioning sized against the one measured single-symbol throughput (`D7.11`)."""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.stream_partitioning import (
    MEASURED_SINGLE_SYMBOL_THROUGHPUT,
    InfeasiblePartitionCapacityError,
    InvalidThroughputError,
    SingleSymbolThroughput,
    max_symbols_per_partition,
    partition_count,
    partition_symbols,
)


def test_measured_constant_is_d7_11_verbatim() -> None:
    """The five numbers this module is dimensioned against, asserted rather than trusted."""
    assert MEASURED_SINGLE_SYMBOL_THROUGHPUT == SingleSymbolThroughput(
        p50=21, p95=204, p99=483, p999=1251, max=3224
    )


def test_capacity_below_the_measured_max_is_infeasible() -> None:
    """One symbol alone can outrun a capacity below `max` — no partition size fits."""
    with pytest.raises(InfeasiblePartitionCapacityError, match="3224"):
        max_symbols_per_partition(3223)


def test_capacity_exactly_at_the_measured_max_fits_exactly_one_symbol() -> None:
    """The boundary: capacity == max holds exactly one symbol at its worst-case peak."""
    assert max_symbols_per_partition(3224) == 1


def test_capacity_below_twice_the_max_still_fits_only_one_symbol() -> None:
    """Every symbol is budgeted at `max` simultaneously: one short of `2 * max` still means 1."""
    assert max_symbols_per_partition(3224 * 2 - 1) == 1


def test_capacity_at_exactly_twice_the_max_fits_two_symbols() -> None:
    """`n * max <= capacity` is exact arithmetic, not a rounded estimate."""
    assert max_symbols_per_partition(3224 * 2) == 2


def test_a_realistic_capacity_dimensions_a_multi_symbol_partition() -> None:
    """Arithmetic over the measured `max`, not a synthetic fixture: `10_000 // 3224 == 3`."""
    assert max_symbols_per_partition(10_000) == 3


def test_only_max_feeds_the_sizing_arithmetic() -> None:
    """`p50`/`p95`/`p99`/`p999` travel on the dataclass but never change the sizing decision.

    Two throughputs that agree on `max` and disagree on everything else must size identically —
    proving the handoff's explicit instruction ("nao o p50") is honored, not just asserted in a
    docstring.
    """
    lenient = SingleSymbolThroughput(p50=1, p95=1, p99=1, p999=1, max=3224)
    strict = SingleSymbolThroughput(p50=3000, p95=3100, p99=3200, p999=3223, max=3224)

    assert max_symbols_per_partition(10_000, lenient) == max_symbols_per_partition(10_000, strict)


def test_p50_based_sizing_would_overflow_capacity_under_simultaneous_peaks() -> None:
    """The falsifier the handoff names: p50-based sizing sub-provisions and blows the budget.

    The naive (WRONG) formula this task rejects — one hot symbol at `max`, every other symbol at
    steady `p50` — would pack `1 + (10_000 - 3224) // 21 == 323` symbols into one partition. If
    those 323 symbols ever spike TOGETHER (never ruled out by `D7.11`), the real load is
    `323 * 3224 = 1_041_352` msg/s — 104x the declared 10.000 msg/s capacity. The `max`-based
    `max_symbols_per_partition` this module actually uses caps the same partition at 3 symbols,
    whose simultaneous-peak load (`3 * 3224 = 9_672`) fits inside capacity with room to spare.
    """
    throughput = MEASURED_SINGLE_SYMBOL_THROUGHPUT
    capacity = 10_000
    p50_based_symbol_count = 1 + (capacity - throughput.max) // throughput.p50

    worst_case_load_under_p50_sizing = p50_based_symbol_count * throughput.max
    assert worst_case_load_under_p50_sizing > capacity  # the sub-provisioning this task refuses

    max_based_symbol_count = max_symbols_per_partition(capacity, throughput)
    worst_case_load_under_max_sizing = max_based_symbol_count * throughput.max
    assert worst_case_load_under_max_sizing <= capacity  # the guarantee this module gives


def test_throughput_percentiles_must_be_non_decreasing() -> None:
    """A ladder where p95 < p50 is not a measurement this module accepts silently."""
    with pytest.raises(InvalidThroughputError, match="non-decreasing"):
        SingleSymbolThroughput(p50=100, p95=10, p99=483, p999=1251, max=3224)


def test_throughput_percentiles_cannot_be_negative() -> None:
    """A negative message rate is not a throughput; it is a data-entry mistake."""
    with pytest.raises(InvalidThroughputError, match="cannot be negative"):
        SingleSymbolThroughput(p50=-1, p95=204, p99=483, p999=1251, max=3224)


def test_partition_count_of_an_empty_universe_is_zero() -> None:
    """No symbols to track needs zero partitions — not an error, not one empty partition."""
    assert partition_count(0, 10_000) == 0


def test_partition_count_rounds_up_a_remainder() -> None:
    """5 symbols at 3 per partition need 2 partitions, not 1 (which would drop 2 symbols)."""
    assert partition_count(5, 10_000) == 2


def test_partition_count_over_the_measured_universe() -> None:
    """570 perpetuals (`docs/specs/PRD-001-plataforma-dados.md` universe count) at 3/partition."""
    assert partition_count(570, 10_000) == 190


def test_partition_symbols_preserves_order_and_chunks_evenly() -> None:
    """Fixed-size, order-preserving chunks — the shape a WS collector's reconnect identity needs."""
    symbols = ("BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT")

    assert partition_symbols(symbols, 2) == (
        ("BTCUSDT", "ETHUSDT"),
        ("SOLUSDT", "BNBUSDT"),
        ("XRPUSDT",),
    )


def test_partition_symbols_never_drops_a_trailing_remainder() -> None:
    """The last partition can be smaller than `max_per_partition`, never absent."""
    symbols = ("A", "B", "C")

    assert partition_symbols(symbols, 10) == (("A", "B", "C"),)


def test_partition_symbols_of_empty_universe_is_empty() -> None:
    """No symbols in, no partitions out — not one empty partition."""
    assert not partition_symbols((), 10)


def test_partition_symbols_rejects_a_non_positive_partition_size() -> None:
    """A partition of size zero or less can never hold a symbol — refused, not silently empty."""
    with pytest.raises(ValueError, match="must be positive"):
        partition_symbols(("BTCUSDT",), 0)


def test_dimensioning_then_partitioning_composes_over_the_measured_universe() -> None:
    """The two functions together: size the partition, then actually split a universe with it.

    570 perpetuals under a capacity of 10.000 msg/s (`max_symbols_per_partition == 3`, proven
    above) needs 190 partitions of at most 3 symbols each — never one holding a simultaneous-peak
    load above capacity.
    """
    universe = tuple(f"SYM{i}USDT" for i in range(570))
    per_partition = max_symbols_per_partition(10_000)

    partitions = partition_symbols(universe, per_partition)

    assert per_partition == 3
    assert len(partitions) == partition_count(570, 10_000) == 190
    assert sum(len(partition) for partition in partitions) == 570
    assert all(len(partition) <= per_partition for partition in partitions)
    assert partitions[0][0] == "SYM0USDT"
    assert partitions[-1][-1] == "SYM569USDT"
