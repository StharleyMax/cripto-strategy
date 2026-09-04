"""`D6c`'s 'lock consultivo' claim, checked against real interleaving -- not just asserted.

`D6c`, literal: "o escritor único serializa `(escrever, compactar)` por partição com lock
consultivo — nunca uma `compress_chunk` roda enquanto um write para a mesma partição está em
voo, porque isso é a única forma real de o `content_hash` capturar um estado inconsistente".

`infra/sqlite_partition_registry_store.py`'s own module comment (lines 21-28) claims this is
"sufficient" today because "SQLite's OWN single-writer-at-a-time file lock already serializes
every write against every other write". That claim is about the `upsert` TRANSACTION alone --
it says nothing about the `get`-then-decide-then-`upsert` SEQUENCE that
`record_partition_write`/`record_partition_compaction` each perform across two SEPARATE
connections. No lock (advisory, file, or in-process) actually spans that sequence anywhere in
this codebase (`grep -n "Lock" infra/*.py use_cases/*.py` finds only the
comment naming a FUTURE Postgres lock, `G-A`, not-yet-fired).

This file forces the exact interleaving `D6c`'s lock is supposed to forbid, with
`threading.Event`s (no `time.sleep` guesswork, no flakiness): a compaction reads the partition,
an ordinary write for the SAME partition reads it too (before the compaction commits), the
compaction commits its epoch increment, and then the write -- carrying the STALE epoch it read
before the compaction ever happened -- commits last, silently reverting the increment. `D6c`'s
"incrementado em exatamente 1" is violated in silence: no exception, no retry, no detection.
"""

from __future__ import annotations

import threading
from pathlib import Path

from src.modules.sentimento.domain.partition_registry import (
    PartitionIdentity,
    PartitionRegistryEntry,
)
from src.modules.sentimento.infra.sqlite_partition_registry_store import (
    SqlitePartitionRegistryStore,
)
from src.modules.sentimento.use_cases.maintain_partition_registry import (
    record_partition_compaction,
    record_partition_write,
)

IDENTITY = PartitionIdentity(
    series_key_id="d" * 64,
    symbol="BTCUSDT",
    source="binance_daily_metrics",
    partition_key="2026-09",
)

_TIMEOUT_SECONDS = 5.0


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


class _CompactionReaderStore(SqlitePartitionRegistryStore):
    """The compaction side of the forced interleaving.

    Signals AFTER its own `get`, then waits for the write to commit first -- forcing the
    compaction's `upsert` to land BEFORE the write's, so the write's stale-epoch `upsert` is
    the one that overwrites last (`D6c`'s forbidden order).
    """

    def __init__(
        self,
        path: Path,
        *,
        compaction_read_done: threading.Event,
        write_committed: threading.Event,
    ) -> None:
        super().__init__(path)
        self._compaction_read_done = compaction_read_done
        self._write_committed = write_committed

    def get(self, identity: PartitionIdentity) -> PartitionRegistryEntry | None:
        """Read once (stale, pre-compaction state), then let the racing write go first."""
        entry = super().get(identity)
        self._compaction_read_done.set()
        self._write_committed.wait(timeout=_TIMEOUT_SECONDS)
        return entry


class _WriteReaderStore(SqlitePartitionRegistryStore):
    """The ordinary-write side of the forced interleaving.

    Reads only after the compaction has already read (so its own read is ALSO stale w.r.t.
    the compaction that is about to commit), then signals once its own `upsert` has landed.
    """

    def __init__(
        self,
        path: Path,
        *,
        compaction_read_done: threading.Event,
        write_committed: threading.Event,
    ) -> None:
        super().__init__(path)
        self._compaction_read_done = compaction_read_done
        self._write_committed = write_committed

    def get(self, identity: PartitionIdentity) -> PartitionRegistryEntry | None:
        """Wait for the compaction's read before reading.

        Both sides now hold the same stale state, exactly the situation `D6c`'s lock exists
        to make impossible.
        """
        self._compaction_read_done.wait(timeout=_TIMEOUT_SECONDS)
        return super().get(identity)

    def upsert(self, entry: PartitionRegistryEntry) -> None:
        """Commit, THEN signal.

        The compaction thread is blocked on this signal before its own `upsert`, guaranteeing
        this write's stale-epoch row lands LAST.
        """
        super().upsert(entry)
        self._write_committed.set()


def test_concurrent_write_racing_a_compaction_silently_reverts_the_epoch_increment(
    tmp_path: Path,
) -> None:
    """THE FALSIFIER for `D6c`'s 'lock consultivo': no such lock exists in this codebase today.

    Forced sequence:
      1. compaction reads the partition (epoch=0) -- `_CompactionReaderStore.get`
      2. ordinary write reads the SAME stale state (epoch=0) -- `_WriteReaderStore.get`
      3. ordinary write commits first: epoch stays 0 (an ordinary write never touches the
         epoch), `row_count` updated
      4. compaction commits LAST, using the entry it read in step 1: epoch becomes
         `0 + 1 = 1` over ITS stale read -- but this happens in a real deployment with the
         ordering reversed just as easily (nothing here PREVENTS either ordering), and the
         assertion below targets the ordering `D6c` most fears: a write landing after a
         compaction, carrying the pre-compaction epoch forward and reverting the increment.

    Given the actual event wiring below (compaction blocks on `write_committed` BEFORE its own
    `upsert`), the write's `upsert` (epoch untouched, still whatever it read) lands first and
    the compaction's `upsert` lands last. To exercise the direction `D6c` names explicitly --
    "nunca uma compress_chunk roda enquanto um write ... está em voo" -- this test asserts the
    invariant a correct lock would guarantee regardless of which side wins the race: the
    NUMBER OF COMPACTION OPERATIONS actually recorded (`compaction_epoch`) must equal the
    number of compaction calls that ran (`1`), with the write's `row_count` also reflected. Both
    cannot be true after this interleaving without a lock, which is exactly what this test
    demonstrates by failing.
    """
    path = tmp_path / "registry.sqlite3"
    bootstrap = SqlitePartitionRegistryStore(path)
    bootstrap.initialise()
    record_partition_write(bootstrap, IDENTITY, rows=_rows(1.0), row_count=1, written_at=1)

    compaction_read_done = threading.Event()
    write_committed = threading.Event()
    compaction_store = _CompactionReaderStore(
        path, compaction_read_done=compaction_read_done, write_committed=write_committed
    )
    write_store = _WriteReaderStore(
        path, compaction_read_done=compaction_read_done, write_committed=write_committed
    )

    compaction_thread = threading.Thread(
        target=lambda: record_partition_compaction(
            compaction_store, IDENTITY, rows_after=_rows(1.0), compacted_at=2
        )
    )
    write_thread = threading.Thread(
        target=lambda: record_partition_write(
            write_store, IDENTITY, rows=_rows(2.0), row_count=2, written_at=3
        )
    )
    compaction_thread.start()
    write_thread.start()
    compaction_thread.join(timeout=_TIMEOUT_SECONDS)
    write_thread.join(timeout=_TIMEOUT_SECONDS)
    assert not compaction_thread.is_alive(), "compaction thread deadlocked -- events never fired"
    assert not write_thread.is_alive(), "write thread deadlocked -- events never fired"

    final = SqlitePartitionRegistryStore(path).get(IDENTITY)
    assert final is not None
    # `D6c`: a compaction ran exactly once here (`compacted_at=2`), so the persisted state must
    # show epoch=1 AND the concurrent write's row_count=2 -- both, because `D6c`'s lock is
    # supposed to make the two operations serialize cleanly rather than clobber each other.
    # Without the lock (none exists in this codebase, see module docstring), one of the two
    # updates is silently lost. This assertion names both, so it fails no matter which one the
    # race happens to drop.
    assert (final.compaction_epoch, final.row_count) == (1, 2), (
        f"D6c's 'lock consultivo' is violated: after one compaction and one concurrent write "
        f"raced on the same partition, the persisted state is "
        f"(compaction_epoch={final.compaction_epoch}, row_count={final.row_count}) instead of "
        f"(1, 2) -- one of the two operations was silently clobbered by the other because "
        f"nothing in `record_partition_write`/`record_partition_compaction`/"
        f"`SqlitePartitionRegistryStore` actually serializes `get`-then-`upsert` across "
        f"concurrent callers. The 'sufficient' claim in "
        f"infra/sqlite_partition_registry_store.py:21-28 covers only the `upsert` TRANSACTION "
        f"in isolation, not this read-decide-write sequence."
    )
