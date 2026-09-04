"""An in-memory `RunRegistryStore` double — for `use_cases.record_run` tests only.

Mirrors `VolatileIngestRecordStore` (`tests/sentimento/test_ingest_record_durability.py`): a
counter-example kept in a list, never `backend.tests.helpers`' production code. It exists so
`record_run`'s G1/G2 logic (`ADR-021`) can be exercised without a Postgres connection — the
real store (`PostgresRunRegistryStore`) is exercised separately, over a real connection, in
`tests/backtest/test_postgres_run_registry_store.py`.
"""

from __future__ import annotations

from src.modules.backtest.domain.run_registry_entry import RunRegistryEntry


class FakeRunRegistryStore:
    """Records rows in memory and answers `find_by_triple` by scanning them, in order."""

    def __init__(self) -> None:
        """Start with no rows recorded."""
        self.rows: list[RunRegistryEntry] = []

    def find_by_triple(
        self, *, bundle_hash: str, window_from_ms: int, window_to_ms: int, knowledge_time: int
    ) -> RunRegistryEntry | None:
        """Return the first recorded row matching the triple, or `None`."""
        for row in self.rows:
            if (
                row.bundle_hash == bundle_hash
                and row.window_from_ms == window_from_ms
                and row.window_to_ms == window_to_ms
                and row.knowledge_time == knowledge_time
            ):
                return row
        return None

    def record(self, entry: RunRegistryEntry) -> None:
        """Append `entry` — no uniqueness enforced here, same as the real table's PK on `run_id`."""
        self.rows.append(entry)
