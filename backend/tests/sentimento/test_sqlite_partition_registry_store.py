"""`SqlitePartitionRegistryStore`: roundtrip, absence-before-initialise, total order of `all()`.

Mirrors the discipline of `test_ingest_record_durability.py`'s sibling suite at a lighter
weight: this table has no process-kill falsifier of its own because `D2.9`/`CA-F0-6` already
proved the ENGINE (SQLite, one-commit-per-call) survives a `SIGKILL` for `md.ingest_run` — the
mechanism is identical here (same connect-execute-commit-close shape), so re-running a full
subprocess kill against a second table would re-prove the engine, not this module's own logic.
What IS this module's own logic — reopening a fresh store object against the same path reads
back what a DIFFERENT object instance wrote — is exactly what `test_a_new_store_instance_reads_
what_another_instance_wrote` proves below.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from src.modules.sentimento.domain.partition_registry import (
    PartitionIdentity,
    apply_compaction,
    initial_partition_entry,
)
from src.modules.sentimento.infra.sqlite_partition_registry_store import (
    SqlitePartitionRegistryStore,
)

IDENTITY_A = PartitionIdentity(
    series_key_id="a" * 64,
    symbol="BTCUSDT",
    source="binance_daily_metrics",
    partition_key="2026-08",
)
IDENTITY_B = PartitionIdentity(
    series_key_id="b" * 64,
    symbol="ETHUSDT",
    source="binance_daily_metrics",
    partition_key="2026-01",
)


def test_get_before_initialise_returns_none_not_an_exception(tmp_path: Path) -> None:
    """A store nobody ever wrote to answers 'nothing here yet', never a raised `sqlite3` error.

    Same shape as `md.ingest_run`'s 'zero runs' for a collector that never ran.
    """
    store = SqlitePartitionRegistryStore(tmp_path / "registry.sqlite3")

    assert store.get(IDENTITY_A) is None
    assert store.all() == ()


def test_upsert_then_get_roundtrips_the_entry(tmp_path: Path) -> None:
    """THE FALSIFIER: what comes back is field-for-field what was written, not a lossy shape."""
    store = SqlitePartitionRegistryStore(tmp_path / "registry.sqlite3")
    store.initialise()
    entry = initial_partition_entry(IDENTITY_A, content_hash="a" * 64, row_count=100, written_at=1)

    store.upsert(entry)

    assert store.get(IDENTITY_A) == entry


def test_upsert_overwrites_the_prior_entry_for_the_same_identity(tmp_path: Path) -> None:
    """`INSERT OR REPLACE`: the second `upsert` for one identity replaces, never duplicates."""
    store = SqlitePartitionRegistryStore(tmp_path / "registry.sqlite3")
    store.initialise()
    first = initial_partition_entry(IDENTITY_A, content_hash="a" * 64, row_count=1, written_at=1)
    store.upsert(first)
    compacted = apply_compaction(first, content_hash="b" * 64, compacted_at=2)

    store.upsert(compacted)

    assert store.get(IDENTITY_A) == compacted
    assert len(store.all()) == 1


def test_a_new_store_instance_reads_what_another_instance_wrote(tmp_path: Path) -> None:
    """Durability across OBJECT instances — the property this module actually adds over a dict."""
    path = tmp_path / "registry.sqlite3"
    writer = SqlitePartitionRegistryStore(path)
    writer.initialise()
    entry = initial_partition_entry(IDENTITY_A, content_hash="a" * 64, row_count=7, written_at=1)
    writer.upsert(entry)

    reader = SqlitePartitionRegistryStore(path)

    assert reader.get(IDENTITY_A) == entry


def test_all_returns_every_entry_in_a_total_deterministic_order(tmp_path: Path) -> None:
    """`ORDER BY` on the full identity key never ties — order is reproducible across calls."""
    store = SqlitePartitionRegistryStore(tmp_path / "registry.sqlite3")
    store.initialise()
    entry_b = initial_partition_entry(IDENTITY_B, content_hash="b" * 64, row_count=1, written_at=1)
    entry_a = initial_partition_entry(IDENTITY_A, content_hash="a" * 64, row_count=1, written_at=1)
    # Written B-then-A on purpose: the read order must come from `ORDER BY`, not insertion order.
    store.upsert(entry_b)
    store.upsert(entry_a)

    assert store.all() == (entry_a, entry_b)


def test_get_returns_none_for_an_unknown_identity_after_initialise(tmp_path: Path) -> None:
    """A store that HAS other rows still answers `None`, not the wrong entry, for a stranger."""
    store = SqlitePartitionRegistryStore(tmp_path / "registry.sqlite3")
    store.initialise()
    store.upsert(
        initial_partition_entry(IDENTITY_A, content_hash="a" * 64, row_count=1, written_at=1)
    )

    assert store.get(IDENTITY_B) is None


def test_path_property_returns_the_bound_path(tmp_path: Path) -> None:
    """`.path` is the identity a caller binds at construction, read back unchanged."""
    path = tmp_path / "registry.sqlite3"
    assert SqlitePartitionRegistryStore(path).path == path


def _half_born_file(path: Path) -> Path:
    """Leave behind exactly what a `SIGKILL` before the first commit leaves: file, no schema.

    Same construction `test_ingest_record_crash_borders.py` uses for the sibling table:
    `sqlite3.connect` creates the file on open, and `initialise()`'s `CREATE TABLE` only
    becomes visible to another process at `COMMIT` — a kill in between leaves 0 bytes.
    """
    sqlite3.connect(path).close()
    return path


def test_get_over_a_half_born_file_returns_none_not_an_operational_error(tmp_path: Path) -> None:
    """The file-exists-but-no-schema state is 'nothing recorded yet', never a raised error."""
    path = _half_born_file(tmp_path / "registry.sqlite3")
    store = SqlitePartitionRegistryStore(path)

    assert store.get(IDENTITY_A) is None


def test_all_over_a_half_born_file_returns_empty_not_an_operational_error(tmp_path: Path) -> None:
    """Same half-born state, through `all()` instead of `get()`."""
    path = _half_born_file(tmp_path / "registry.sqlite3")
    store = SqlitePartitionRegistryStore(path)

    assert store.all() == ()


def test_initialise_is_idempotent(tmp_path: Path) -> None:
    """Calling `initialise` twice (every run does) must not wipe or duplicate the table."""
    store = SqlitePartitionRegistryStore(tmp_path / "registry.sqlite3")
    store.initialise()
    entry = initial_partition_entry(IDENTITY_A, content_hash="a" * 64, row_count=1, written_at=1)
    store.upsert(entry)

    store.initialise()

    assert store.get(IDENTITY_A) == entry
