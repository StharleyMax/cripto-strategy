"""`record_run` — `ADR-021` falsifiers G1 (refuses) and G2 (does not falsely refuse)."""

from __future__ import annotations

import pytest

from src.modules.backtest.domain.intrabar_convention import IntrabarConvention
from src.modules.backtest.domain.knowledge_time import KnowledgeTimeMode
from src.modules.backtest.use_cases.record_run import RunRegistryDivergenceError, record_run
from tests.helpers.fake_run_registry_store import FakeRunRegistryStore

_BUNDLE = {"universe": ["BTCUSDT"], "window_days": 30}
_HASH_A = "a" * 64
_HASH_B = "b" * 64


def _record(
    store: FakeRunRegistryStore, *, run_id: str, partitions_content_hash: str, knowledge_time: int
) -> None:
    """Call `record_run` with one fixed bundle/window and only the interesting fields varying."""
    record_run(
        store,
        run_id=run_id,
        bundle=_BUNDLE,
        window_from_ms=0,
        window_to_ms=1_000,
        knowledge_time_mode=KnowledgeTimeMode.PINNED,
        observed_at_values=[],
        pinned_knowledge_time=knowledge_time,
        partitions_content_hash=partitions_content_hash,
        commit="deadbeef",
        intrabar_convention=IntrabarConvention.PESSIMISTIC_STOP_FIRST,
        intrabar_decided_count=0,
        principal_id="stharley",
    )


def test_the_first_run_of_a_triple_is_recorded() -> None:
    """No prior row for the triple — nothing to compare against, so it just records."""
    store = FakeRunRegistryStore()
    _record(store, run_id="run-1", partitions_content_hash=_HASH_A, knowledge_time=5_000)
    assert len(store.rows) == 1
    assert store.rows[0].partitions_content_hash == _HASH_A


def test_g1_reproducing_the_same_triple_with_a_different_hash_is_refused() -> None:
    """G1: the falsifier itself — same triple, different `partitions_content_hash`, no refusal.

    This test proves the MECHANISM rejects exactly that case: `record_run` must raise before
    a second, divergent row reaches the store.
    """
    store = FakeRunRegistryStore()
    _record(store, run_id="run-1", partitions_content_hash=_HASH_A, knowledge_time=5_000)
    with pytest.raises(RunRegistryDivergenceError, match="run-1"):
        _record(store, run_id="run-2", partitions_content_hash=_HASH_B, knowledge_time=5_000)
    assert len(store.rows) == 1, "the divergent second row must never reach the store"


def test_g2_reproducing_the_same_triple_with_the_same_hash_is_not_refused() -> None:
    """G2: a legitimate reproduction must not be treated as new data.

    A compaction upstream is already accounted for by the time this call is made.
    `partitions_content_hash` is opaque here (`ADR-021`/D3's philosophy extended to this
    column): whether the SAME value across two calls represents "nothing changed" or "a
    compaction that correctly reproduced the prior hash" is `ADR-002`/D6's job, upstream of
    this call. What `record_run` guarantees is the other half of G2: it never refuses just
    because the triple repeats.
    """
    store = FakeRunRegistryStore()
    _record(store, run_id="run-1", partitions_content_hash=_HASH_A, knowledge_time=5_000)
    _record(store, run_id="run-2", partitions_content_hash=_HASH_A, knowledge_time=5_000)
    assert len(store.rows) == 2
    assert {row.run_id for row in store.rows} == {"run-1", "run-2"}


def test_a_different_knowledge_time_is_a_different_triple_never_a_refusal() -> None:
    """Two genuinely different `AO VIVO` runs get different `knowledge_time`s by construction.

    `ADR-021`/D4: that is a NEW triple, not a reproduction, so a differing hash is expected and
    must never raise.
    """
    store = FakeRunRegistryStore()
    _record(store, run_id="run-1", partitions_content_hash=_HASH_A, knowledge_time=5_000)
    _record(store, run_id="run-2", partitions_content_hash=_HASH_B, knowledge_time=6_000)
    assert len(store.rows) == 2


def test_knowledge_time_is_derived_not_trusted_from_the_caller() -> None:
    """`LIVE` mode ignores any caller-supplied shortcut and computes `max(observed_at)`."""
    store = FakeRunRegistryStore()
    entry = record_run(
        store,
        run_id="run-1",
        bundle=_BUNDLE,
        window_from_ms=0,
        window_to_ms=1_000,
        knowledge_time_mode=KnowledgeTimeMode.LIVE,
        observed_at_values=[1_000, 4_000, 2_000],
        pinned_knowledge_time=None,
        partitions_content_hash=_HASH_A,
        commit="deadbeef",
        intrabar_convention=IntrabarConvention.PESSIMISTIC_STOP_FIRST,
        intrabar_decided_count=0,
        principal_id="stharley",
    )
    assert entry.knowledge_time == 4_000
