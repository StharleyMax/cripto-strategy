"""Record one backtest run into `run_registry`, refusing a silent reproducibility failure.

`ADR-021`/D4, last paragraph: reproducing a run means asking for the SAME
`(bundle_hash, window, knowledge_time)` triple back. Under an append-only store, that triple
has to return the same `partitions_content_hash` every time — if it does not, `ADR-021`
requires the engine to "RECUSA antes de publicar numero, citando qual partitions_content_hash
divergiu" (falsifier G1). `partitions_content_hash` itself is OPAQUE here, the same way
`bundle_hash` is opaque to the table (`ADR-021`/D3): this use case does not recompute it and
does not know whether a divergence is legitimate compaction or real new data — `ADR-002`/D6
(a `sentimento` decision, item 8.2) owns getting that value right before it ever reaches this
call. What THIS use case guarantees is that when the value it is HANDED differs from the one
already on file for the same triple, it never publishes a number under the appearance that
nothing changed (falsifier G2's other side: it also never refuses when the value handed in is
unchanged, which is what keeps a legitimate compaction — one that correctly reproduces the same
hash — from being treated as new data).
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol

from src.modules.backtest.domain.bundle_hash import bundle_hash
from src.modules.backtest.domain.intrabar_convention import IntrabarConvention
from src.modules.backtest.domain.knowledge_time import KnowledgeTimeMode, resolve_knowledge_time
from src.modules.backtest.domain.run_registry_entry import RunRegistryEntry


class RunRegistryDivergenceError(Exception):
    """The same `(bundle_hash, window, knowledge_time)` triple returned a new hash — G1.

    `ADR-021`/D4: under append-only storage this must never happen; if it does, it is either
    corruption or a caller that failed to account for `ADR-002`/D6 correctly, and either way
    the correct response is refusal, not a published number.
    """


class RunRegistryStore(Protocol):
    """The two operations `record_run` needs from a `run_registry` store."""

    def find_by_triple(
        self, *, bundle_hash: str, window_from_ms: int, window_to_ms: int, knowledge_time: int
    ) -> RunRegistryEntry | None:
        """Return the row already on file for this exact triple, or `None` if there is none."""
        ...

    def record(self, entry: RunRegistryEntry) -> None:
        """Persist `entry`, committed before returning."""
        ...


def record_run(
    store: RunRegistryStore,
    *,
    run_id: str,
    bundle: dict[str, object],
    window_from_ms: int,
    window_to_ms: int,
    knowledge_time_mode: KnowledgeTimeMode,
    observed_at_values: Sequence[int],
    pinned_knowledge_time: int | None,
    partitions_content_hash: str,
    commit: str,
    intrabar_convention: IntrabarConvention,
    intrabar_decided_count: int,
    principal_id: str,
) -> RunRegistryEntry:
    """Build, validate and persist one `run_registry` row for a finished backtest run.

    Order of operations follows `ADR-021`/D4 literally: `bundle_hash` and `knowledge_time` are
    derived first (never trusted from the caller as pre-computed for `knowledge_time`'s LIVE
    case), THEN the reproduction check (G1/G2) runs against whatever is already on file for
    that triple, and only after both pass is the row constructed — `RunRegistryEntry`'s own
    `__post_init__` is the last line of defense (G4/G5, types).
    """
    computed_bundle_hash = bundle_hash(bundle)
    knowledge_time = resolve_knowledge_time(
        mode=knowledge_time_mode,
        observed_at_values=observed_at_values,
        pinned_knowledge_time=pinned_knowledge_time,
    )
    existing = store.find_by_triple(
        bundle_hash=computed_bundle_hash,
        window_from_ms=window_from_ms,
        window_to_ms=window_to_ms,
        knowledge_time=knowledge_time,
    )
    if existing is not None and existing.partitions_content_hash != partitions_content_hash:
        raise RunRegistryDivergenceError(
            f"reproduction of bundle_hash={computed_bundle_hash} "
            f"window=({window_from_ms}, {window_to_ms}) knowledge_time={knowledge_time} "
            f"produced partitions_content_hash={partitions_content_hash}, but run "
            f"{existing.run_id} already on file for the same triple recorded "
            f"{existing.partitions_content_hash} — refusing before publishing a number "
            f"(`ADR-021` G1)"
        )
    entry = RunRegistryEntry(
        run_id=run_id,
        bundle_hash=computed_bundle_hash,
        window_from_ms=window_from_ms,
        window_to_ms=window_to_ms,
        knowledge_time=knowledge_time,
        partitions_content_hash=partitions_content_hash,
        commit=commit,
        intrabar_convention=intrabar_convention,
        intrabar_decided_count=intrabar_decided_count,
        principal_id=principal_id,
    )
    store.record(entry)
    return entry
