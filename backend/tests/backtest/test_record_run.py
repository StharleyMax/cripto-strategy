"""`record_run` — `ADR-021` falsifiers G1 (refuses) and G2 (does not falsely refuse).

Also covers `ADR-025` falsifier G6 (`grid_version` divergence under identical data).
"""

from __future__ import annotations

import pytest

from src.modules.backtest.domain.intrabar_convention import IntrabarConvention
from src.modules.backtest.domain.knowledge_time import KnowledgeTimeMode
from src.modules.backtest.use_cases.record_run import (
    GridVersionDivergenceError,
    RunRegistryDivergenceError,
    record_run,
)
from tests.helpers.fake_run_registry_store import FakeRunRegistryStore

_BUNDLE = {"universe": ["BTCUSDT"], "window_days": 30}
_HASH_A = "a" * 64
_HASH_B = "b" * 64


def _record(
    store: FakeRunRegistryStore,
    *,
    run_id: str,
    partitions_content_hash: str,
    knowledge_time: int,
    grid_version: int = 1,
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
        grid_version=grid_version,
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
        grid_version=1,
    )
    assert entry.knowledge_time == 4_000


def test_g6_reproducing_the_same_triple_with_a_different_grid_version_is_refused() -> None:
    """G6 (`ADR-025`/D4): same triple, same `partitions_content_hash`, different `grid_version`.

    G1 must NOT fire here (the data is identical) — only the grid-version check does, and it
    must raise the DISTINCT `GridVersionDivergenceError`, never `RunRegistryDivergenceError`
    (`ADR-025`/H4).
    """
    store = FakeRunRegistryStore()
    _record(
        store,
        run_id="run-1",
        partitions_content_hash=_HASH_A,
        knowledge_time=5_000,
        grid_version=1,
    )
    with pytest.raises(GridVersionDivergenceError, match="run-1"):
        _record(
            store,
            run_id="run-2",
            partitions_content_hash=_HASH_A,
            knowledge_time=5_000,
            grid_version=2,
        )
    assert len(store.rows) == 1, "the divergent second row must never reach the store"


def test_g6_does_not_fire_when_grid_version_repeats() -> None:
    """The other half of G6: reproduction under the same `grid_version` never raises."""
    store = FakeRunRegistryStore()
    _record(
        store,
        run_id="run-1",
        partitions_content_hash=_HASH_A,
        knowledge_time=5_000,
        grid_version=1,
    )
    _record(
        store,
        run_id="run-2",
        partitions_content_hash=_HASH_A,
        knowledge_time=5_000,
        grid_version=1,
    )
    assert len(store.rows) == 2


def test_g1_takes_precedence_when_both_hash_and_grid_version_diverge() -> None:
    """When the data ALSO diverged, G1 (`RunRegistryDivergenceError`) fires, not G6.

    `record_run` checks `partitions_content_hash` first: a caller cannot mask a real data
    divergence by also changing `grid_version` in the same call.
    """
    store = FakeRunRegistryStore()
    _record(
        store,
        run_id="run-1",
        partitions_content_hash=_HASH_A,
        knowledge_time=5_000,
        grid_version=1,
    )
    with pytest.raises(RunRegistryDivergenceError, match="run-1"):
        _record(
            store,
            run_id="run-2",
            partitions_content_hash=_HASH_B,
            knowledge_time=5_000,
            grid_version=2,
        )
    assert len(store.rows) == 1
