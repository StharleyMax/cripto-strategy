"""The single writer's two entry points into `md.partition_registry` — `ADR-002/D6c`."""

# `record_partition_write` is called after an ORDINARY write lands (via `write_series_row.py`);
# `record_partition_compaction` is called after a compaction-class operation
# (`compress_chunk`/`decompress_chunk`/`recompress_chunk`, or a `chunk_time_interval` migration
# per `D6b`) touches a partition. Both converge on the SAME store port, `PartitionRegistryStore`
# below, so `backtest`/`T-08.4` reads through the identical shape this module writes — the
# fronteira the architect's gate names: "sentimento é dono ... backtest só lê".

from __future__ import annotations

import logging
from collections.abc import Callable, Mapping, Sequence
from typing import Protocol

from src.modules.sentimento.domain.partition_registry import (
    PartitionIdentity,
    PartitionRegistryEntry,
    apply_compaction,
    apply_write,
    compute_content_hash,
    initial_partition_entry,
)

logger = logging.getLogger(__name__)


class PartitionRegistryStore(Protocol):
    """Read/write port. `SqlitePartitionRegistryStore` (`infra/`) is the only implementor today.

    `sentimento` is the only writer (`ADR-002/D5`, `D6c`'s "sentimento é dono"); a future
    `backtest`/`T-08.4` reader consumes `get`/`all` directly and never `upsert`/
    `read_modify_write` — the fronteira of module is enforced by WHO IS WIRED to call the
    mutating methods, not by a second, weaker port, because a read-only Protocol duplicating
    this one's read methods would drift the moment either one gains a method the other does
    not need.

    `read_modify_write` is the ONLY method this module's two functions use to persist —
    `get`/`upsert` stay on the port for a reader that needs one half in isolation, but neither
    function below calls them separately, because doing so is exactly the defect
    `test_partition_registry_concurrency.py` measured: two SEPARATE transactions leave the
    read-decide-write SEQUENCE unprotected even though each half is individually atomic
    (`D6c`'s "lock consultivo" is about the sequence, not either half alone).
    """

    def get(self, identity: PartitionIdentity) -> PartitionRegistryEntry | None: ...  # noqa: D102

    def upsert(self, entry: PartitionRegistryEntry) -> None: ...  # noqa: D102

    def read_modify_write(  # noqa: D102
        self,
        identity: PartitionIdentity,
        mutate: Callable[[PartitionRegistryEntry | None], PartitionRegistryEntry],
    ) -> PartitionRegistryEntry: ...


class PartitionNotYetRegisteredError(Exception):
    """`record_partition_compaction` was called for a partition with no prior write.

    `D6c` starts `compaction_epoch` at `0` on the FIRST write; a compaction with nothing to
    increment from is a caller ordering bug, not a state this module has a number for.
    """


def record_partition_write(
    store: PartitionRegistryStore,
    identity: PartitionIdentity,
    *,
    rows: Sequence[Mapping[str, object]],
    row_count: int,
    written_at: int,
) -> PartitionRegistryEntry:
    """Recompute `content_hash` over `rows` and persist the ORDINARY-write shape (`D6c`).

    `compaction_epoch` is untouched — `apply_write`'s job, not this function's — this function
    only decides FIRST WRITE (`initial_partition_entry`, epoch 0) versus SUBSEQUENT WRITE
    (`apply_write`, carries the existing epoch forward). The decision and the persist are ONE
    `store.read_modify_write` call, never a separate `get` followed by a separate `upsert` —
    "ler antes de escrever" (`ADR-002/D5`) means the read and the write are one unit here, the
    same lesson `test_partition_registry_concurrency.py` forced into a test.
    """
    content_hash = compute_content_hash(rows)

    def mutate(current: PartitionRegistryEntry | None) -> PartitionRegistryEntry:
        if current is None:
            return initial_partition_entry(
                identity, content_hash=content_hash, row_count=row_count, written_at=written_at
            )
        return apply_write(
            current, content_hash=content_hash, row_count=row_count, written_at=written_at
        )

    entry = store.read_modify_write(identity, mutate)
    logger.info(
        "partition_write_recorded",
        extra={
            "series_key_id": identity.series_key_id,
            "symbol": identity.symbol,
            "source": identity.source,
            "partition_key": identity.partition_key,
            "compaction_epoch": entry.compaction_epoch,
            "row_count": entry.row_count,
        },
    )
    return entry


def record_partition_compaction(
    store: PartitionRegistryStore,
    identity: PartitionIdentity,
    *,
    rows_after: Sequence[Mapping[str, object]],
    compacted_at: int,
) -> PartitionRegistryEntry:
    """Recompute `content_hash` over the post-compaction rows and increment `compaction_epoch`.

    Raises `PartitionNotYetRegisteredError` if `identity` has never been written — see that
    class's docstring. This is the ONLY function in this module that increments the epoch, and
    it does so by exactly one (`apply_compaction`), regardless of how many rows the compaction
    touched — `D6c` counts OPERATIONS, not rows. The read that decides "has it been written"
    and the write that increments are ONE `store.read_modify_write` call, for the same
    concurrency reason `record_partition_write` above states.
    """
    content_hash = compute_content_hash(rows_after)
    previous_hash: list[str] = []

    def mutate(current: PartitionRegistryEntry | None) -> PartitionRegistryEntry:
        if current is None:
            raise PartitionNotYetRegisteredError(
                f"partition {identity} has no prior write: `D6c` starts compaction_epoch at 0 "
                f"on the first write, and there is no epoch here to increment from"
            )
        previous_hash.append(current.content_hash)
        return apply_compaction(current, content_hash=content_hash, compacted_at=compacted_at)

    entry = store.read_modify_write(identity, mutate)
    logger.info(
        "partition_compaction_recorded",
        extra={
            "series_key_id": identity.series_key_id,
            "symbol": identity.symbol,
            "source": identity.source,
            "partition_key": identity.partition_key,
            "compaction_epoch": entry.compaction_epoch,
            "hash_changed": content_hash != previous_hash[0],
        },
    )
    return entry
