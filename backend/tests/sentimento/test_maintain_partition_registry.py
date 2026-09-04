"""`record_partition_write`/`record_partition_compaction`: the use-case wiring over a fake store.

Uses a FAKE store (in-memory dict) rather than `SqlitePartitionRegistryStore` — the SQLite
store's own contract is `test_sqlite_partition_registry_store.py`'s job; this file's job is the
use case's DECISION (first write vs. subsequent write; refuse a compaction with no prior write),
which does not need a real database to falsify.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

import pytest

from src.modules.sentimento.domain.partition_registry import (
    PartitionIdentity,
    PartitionRegistryEntry,
)
from src.modules.sentimento.use_cases.maintain_partition_registry import (
    PartitionNotYetRegisteredError,
    record_partition_compaction,
    record_partition_write,
)

IDENTITY = PartitionIdentity(
    series_key_id="a" * 64,
    symbol="BTCUSDT",
    source="binance_daily_metrics",
    partition_key="2026-09",
)


@dataclass
class FakePartitionRegistryStore:
    """Records every `upsert`, keyed by identity — enough to prove call order and final state.

    `read_modify_write` is a single-threaded stand-in (no real transaction, no lock needed:
    this fake has no concurrent caller) — it only has to preserve the CONTRACT the use case
    relies on: read-then-mutate-then-persist as one call. The real concurrency property
    (`BEGIN IMMEDIATE` serializing two OS threads) is `SqlitePartitionRegistryStore`'s to prove,
    in `test_sqlite_partition_registry_store.py` / `test_partition_registry_concurrency.py`.
    """

    entries: dict[PartitionIdentity, PartitionRegistryEntry] = field(default_factory=dict)

    def get(self, identity: PartitionIdentity) -> PartitionRegistryEntry | None:
        """Return the last upserted entry for `identity`, or `None`."""
        return self.entries.get(identity)

    def upsert(self, entry: PartitionRegistryEntry) -> None:
        """Record `entry`, replacing whatever was there for its identity."""
        self.entries[entry.identity] = entry

    def read_modify_write(
        self,
        identity: PartitionIdentity,
        mutate: Callable[[PartitionRegistryEntry | None], PartitionRegistryEntry],
    ) -> PartitionRegistryEntry:
        """Read the current entry, hand it to `mutate`, persist and return the result."""
        entry = mutate(self.entries.get(identity))
        self.entries[entry.identity] = entry
        return entry


def _rows(value: float) -> list[dict[str, object]]:
    return [
        {
            "event_time": 1,
            "observed_at": 10,
            "source": IDENTITY.source,
            "symbol": IDENTITY.symbol,
            "sum_open_interest": value,
        }
    ]


def test_first_write_starts_the_entry_at_epoch_zero() -> None:
    """No prior entry ⇒ `record_partition_write` builds the FIRST row (`D6c`: epoch 0)."""
    store = FakePartitionRegistryStore()

    entry = record_partition_write(store, IDENTITY, rows=_rows(1.0), row_count=1, written_at=100)

    assert entry.compaction_epoch == 0
    assert store.get(IDENTITY) == entry


def test_second_write_carries_the_existing_epoch_forward() -> None:
    """THE FALSIFIER: a plain write never touches the epoch, even across two calls."""
    store = FakePartitionRegistryStore()
    record_partition_write(store, IDENTITY, rows=_rows(1.0), row_count=1, written_at=1)

    second = record_partition_write(store, IDENTITY, rows=_rows(2.0), row_count=2, written_at=2)

    assert second.compaction_epoch == 0
    assert second.row_count == 2


def test_write_reads_the_store_before_deciding_first_or_subsequent() -> None:
    """`ADR-002/D5`'s 'ler antes de escrever', observed as an ORDER and not just a claim.

    The read failure has to come from INSIDE `read_modify_write` (the one-transaction path,
    per the concurrency fix above) — never from a separate `get` the use case might call on
    its own, which is exactly the two-transaction shape that let a compaction and a write race.
    """

    class ExplodingStore:
        """A store whose `read_modify_write` fails before ever calling `mutate`.

        `get`/`upsert` are never called by `record_partition_write` — they exist only to
        satisfy the `PartitionRegistryStore` Protocol's shape under `mypy --strict`, and each
        fails loudly if that assumption ever stops holding.
        """

        def get(self, identity: PartitionIdentity) -> PartitionRegistryEntry | None:
            """Fail the test if ever reached — this path must go through `read_modify_write`."""
            raise AssertionError("get must not be called directly by record_partition_write")

        def upsert(self, entry: PartitionRegistryEntry) -> None:
            """Fail the test if ever reached — this path must go through `read_modify_write`."""
            raise AssertionError("upsert must not be called directly by record_partition_write")

        def read_modify_write(
            self,
            identity: PartitionIdentity,
            mutate: Callable[[PartitionRegistryEntry | None], PartitionRegistryEntry],
        ) -> PartitionRegistryEntry:
            """Raise before `mutate` (and therefore any decision) ever runs."""
            raise RuntimeError("read failed")

    with pytest.raises(RuntimeError, match="read failed"):
        record_partition_write(
            ExplodingStore(), IDENTITY, rows=_rows(1.0), row_count=1, written_at=1
        )


def test_compaction_refuses_when_the_partition_was_never_written() -> None:
    """THE FALSIFIER: `record_partition_compaction` must not invent an epoch to increment from."""
    store = FakePartitionRegistryStore()

    with pytest.raises(PartitionNotYetRegisteredError):
        record_partition_compaction(store, IDENTITY, rows_after=_rows(1.0), compacted_at=1)

    assert store.entries == {}


def test_compaction_after_a_write_increments_the_epoch_by_one() -> None:
    """The write/compaction sequence a real writer follows, end to end over the fake store."""
    store = FakePartitionRegistryStore()
    record_partition_write(store, IDENTITY, rows=_rows(1.0), row_count=1, written_at=1)

    compacted = record_partition_compaction(store, IDENTITY, rows_after=_rows(1.0), compacted_at=2)

    assert compacted.compaction_epoch == 1
    assert store.get(IDENTITY) == compacted


def test_two_compactions_in_a_row_increment_by_one_each_time() -> None:
    """`D6c`: 'incrementado em exatamente 1' — checked across repeated calls, not just once."""
    store = FakePartitionRegistryStore()
    record_partition_write(store, IDENTITY, rows=_rows(1.0), row_count=1, written_at=1)
    record_partition_compaction(store, IDENTITY, rows_after=_rows(1.0), compacted_at=2)

    twice = record_partition_compaction(store, IDENTITY, rows_after=_rows(1.0), compacted_at=3)

    assert twice.compaction_epoch == 2
