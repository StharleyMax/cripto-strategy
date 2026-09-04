"""`md.partition_registry`: `compaction_epoch`/`content_hash` per partition, and `F-4` for it."""

# `ADR-002/D6` (Parquet-era) + the amendment "`D6` CONCRETIZADA para o candidato 4" (`T-08.3`/
# `CST-71`) concretize it for TimescaleDB (`ADR-002/D4`). This module carries three things, all
# pure — no file, no network, no clock (`Natureza`, `backend/pyproject.toml`):
#
# 1. `PartitionIdentity` / `PartitionRegistryEntry` — the shape of one row of the catalog table
#    (`D6c`): `(series_key_id, symbol, source, partition_key)` identity, DECOUPLED from
#    `chunk_time_interval` (`D6b`) — a chunk is a physical detail of the engine; a partition is
#    an application-declared calendar bucket, and the two do not have to coincide.
# 2. `compute_content_hash` — `sha256` over the canonical projection of a partition's rows, in an
#    EXPLICIT deterministic order (`D6c`: `ORDER BY event_time, observed_at, source, symbol` —
#    "nunca ordem de scan implícita"). A `compress_chunk` that recodes rows physically but
#    changes no logical value must not move this hash; if it does, that is `FA-3b`.
# 3. The `D6d` decision tree for the one case `ADR-002/D6` names as the danger this whole module
#    exists to close: `knowledge_time` UNCHANGED but `content_hash` CHANGED. `F-4` ("nunca número
#    diferente em silêncio") does not carve out an exception for a legitimate compaction — the
#    system still REFUSES, distinguishing `compaction` (every touched partition's epoch grew)
#    from `anomalia` (some touched partition's epoch did NOT grow, yet its hash did — the
#    signature of a bug, or a write outside the single writer). The `knowledge_time`-different
#    branch of `D6d` ("dado novo") is `T-08.4`'s (`backtest`/`run_registry`), not this module's —
#    this module only ever sees a set of partitions the caller has ALREADY confirmed share the
#    same `knowledge_time` as the run being reproduced.

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from enum import Enum
from typing import Final

# `D6c`, literal: "ORDER BY event_time, observed_at, source, symbol — nunca ordem de scan
# implícita". `symbol`/`source` are constant within one partition's identity (they are part of
# the identity tuple, `D6b`) — the order is kept exactly as the ADR states it anyway, rather
# than "optimized" down to the two keys that actually vary, because the ADR text is the
# contract and a reader who greps for these four names should find them in this order.
CONTENT_HASH_ORDER_KEYS: Final[tuple[str, str, str, str]] = (
    "event_time",
    "observed_at",
    "source",
    "symbol",
)

_CONTENT_HASH_HEX_LENGTH: Final[int] = 64


class InvalidPartitionIdentityError(Exception):
    """A term of `(series_key_id, symbol, source, partition_key)` that is missing or blank."""


class InvalidPartitionRegistryEntryError(Exception):
    """A `PartitionRegistryEntry` field that violates `D6c`'s shape before it is ever stored."""


class ContentHashInputError(Exception):
    """The rows handed to `compute_content_hash` cannot be ordered deterministically."""


@dataclass(frozen=True)
class PartitionIdentity:
    """`(series_key_id, symbol, source, partition_key)` — `D6b`'s unit of reproducibility.

    `partition_key` is the APPLICATION-DECLARED calendar bucket (today: month UTC, per `D6b`'s
    recommendation), never the physical chunk. Nothing here parses or validates the bucket
    shape — that is a decision for whoever builds the calendar bucketing function, and coupling
    it to this identity would make retuning the bucket a change to this module instead of a
    call-site concern.
    """

    series_key_id: str
    symbol: str
    source: str
    partition_key: str

    def __post_init__(self) -> None:
        """Refuse a blank identity term — a blank makes two different partitions collide."""
        for column in ("series_key_id", "symbol", "source", "partition_key"):
            if not getattr(self, column).strip():
                raise InvalidPartitionIdentityError(
                    f"column '{column}' is blank: a blank term of the partition identity makes "
                    f"two different partitions indistinguishable (`ADR-002/D6b`)"
                )


@dataclass(frozen=True)
class PartitionRegistryEntry:
    """One row of `md.partition_registry` (`D6c`).

    `compaction_epoch` starts at `0` (`D6c`, literal) and is incremented by EXACTLY ONE by the
    single writer for every operation of the compaction class — never read from the engine's own
    internal chunk id, which is not stable under `merge_chunks`/reparticionamento and is
    implementation detail of the engine (`D6c`: using it "violaria `D5`").
    """

    identity: PartitionIdentity
    compaction_epoch: int
    content_hash: str
    row_count: int
    last_written_at: int
    last_compacted_at: int | None
    updated_at: int

    def __post_init__(self) -> None:
        """Refuse a shape `D6c` never describes, at construction time rather than at the store."""
        if self.compaction_epoch < 0:
            raise InvalidPartitionRegistryEntryError(
                f"compaction_epoch = {self.compaction_epoch} is negative: `D6c` starts it at 0 "
                f"and only ever increments it"
            )
        if self.row_count < 0:
            raise InvalidPartitionRegistryEntryError(f"row_count = {self.row_count} is negative")
        if len(self.content_hash) != _CONTENT_HASH_HEX_LENGTH or not all(
            c in "0123456789abcdef" for c in self.content_hash
        ):
            raise InvalidPartitionRegistryEntryError(
                f"content_hash is not {_CONTENT_HASH_HEX_LENGTH} lowercase hex characters: "
                f"{self.content_hash!r}"
            )
        if self.last_compacted_at is not None and self.last_compacted_at < 0:
            raise InvalidPartitionRegistryEntryError(
                f"last_compacted_at = {self.last_compacted_at} is negative"
            )


def compute_content_hash(rows: Sequence[Mapping[str, object]]) -> str:
    """`sha256` over the canonical projection of `rows`, ordered per `D6c` — never scan order.

    Two determinism choices, both deliberate and both distinct from `canonical_json.py`
    (which this function does NOT reuse, on purpose):

    1. ROW order is `CONTENT_HASH_ORDER_KEYS`, applied here with an explicit `sorted(...)` —
       the ordering this function exists to make explicit, per `D6c`.
    2. Within one row, JSON KEY order is alphabetical (`sort_keys=True`). `canonical_json.py`
       deliberately does the OPPOSITE (`sort_keys=False`, "insertion order IS the field
       order") because it serializes a wire projection whose field order the SPEC fixes
       (`SeriesRow.provenance_projection`). A partition's rows arrive here as plain dicts
       built by whatever caller assembled the projection, with no SPEC-fixed key order to
       preserve — sorting keys is what makes the hash independent of how the caller happened
       to construct the dict, which `canonical_json`'s contract does not promise.

    Raises `ContentHashInputError` if any row is missing one of the four order keys — a
    partition that cannot be TOTALLY ordered cannot be hashed deterministically, and hashing
    it anyway would produce a number that depends on Python's stable-sort tie-break over
    whatever order the caller happened to hand rows in, which is exactly the "ordem de scan
    implícita" `D6c` forbids.
    """
    if not rows:
        raise ContentHashInputError(
            "cannot compute a content_hash over zero rows — an empty partition is not a "
            "partition `md.partition_registry` has anything to say about yet"
        )
    for index, row in enumerate(rows):
        missing = [key for key in CONTENT_HASH_ORDER_KEYS if key not in row]
        if missing:
            raise ContentHashInputError(
                f"row {index} is missing order key(s) {missing}: `D6c` requires an EXPLICIT "
                f"ORDER BY on {CONTENT_HASH_ORDER_KEYS}, and a row without them cannot be "
                f"placed in that order"
            )
    ordered = sorted(rows, key=lambda row: tuple(str(row[key]) for key in CONTENT_HASH_ORDER_KEYS))
    canonical_lines = [
        json.dumps(dict(row), ensure_ascii=True, separators=(",", ":"), sort_keys=True)
        for row in ordered
    ]
    canonical_payload = "\n".join(canonical_lines)
    return hashlib.sha256(canonical_payload.encode("utf-8")).hexdigest()


def initial_partition_entry(
    identity: PartitionIdentity, *, content_hash: str, row_count: int, written_at: int
) -> PartitionRegistryEntry:
    """Build the FIRST row for a partition — `compaction_epoch = 0` (`D6c`, literal)."""
    return PartitionRegistryEntry(
        identity=identity,
        compaction_epoch=0,
        content_hash=content_hash,
        row_count=row_count,
        last_written_at=written_at,
        last_compacted_at=None,
        updated_at=written_at,
    )


def apply_write(
    entry: PartitionRegistryEntry, *, content_hash: str, row_count: int, written_at: int
) -> PartitionRegistryEntry:
    """Apply an ORDINARY write (new rows land in the partition) — `compaction_epoch` UNCHANGED.

    `D6c` reserves the increment for "operação de classe compactação" only; an ordinary append
    changes `content_hash` and `row_count` (more rows landed) but is not the event this module
    exists to fence — `write_series_row.py` already gates what may land, and the epoch is
    silent on the difference between "the first row" and "the thousandth".
    """
    return PartitionRegistryEntry(
        identity=entry.identity,
        compaction_epoch=entry.compaction_epoch,
        content_hash=content_hash,
        row_count=row_count,
        last_written_at=written_at,
        last_compacted_at=entry.last_compacted_at,
        updated_at=written_at,
    )


def apply_compaction(
    entry: PartitionRegistryEntry, *, content_hash: str, compacted_at: int
) -> PartitionRegistryEntry:
    """Apply a compaction-class operation — `compaction_epoch` grows by EXACTLY 1.

    `row_count` is UNCHANGED: compression/recompression is lossless (`D6a`, "não deleta nem
    altera valor lógico de nenhuma linha") — a caller that observes a different row count after
    what it calls a compaction has observed something this function refuses to name a
    compaction; that is the caller's contract to enforce before calling this one, not this
    function's to infer.
    """
    return PartitionRegistryEntry(
        identity=entry.identity,
        compaction_epoch=entry.compaction_epoch + 1,
        content_hash=content_hash,
        row_count=entry.row_count,
        last_written_at=entry.last_written_at,
        last_compacted_at=compacted_at,
        updated_at=compacted_at,
    )


class PartitionChangeClass(Enum):
    """What one touched partition's `(epoch, hash)` pair says happened to it — `D6d`."""

    UNCHANGED = "UNCHANGED"
    """`content_hash` matches the snapshot: nothing this partition did affected the run."""

    COMPACTION = "COMPACTION"
    """`content_hash` differs AND `compaction_epoch` grew: the recorded, auditable case."""

    ANOMALY = "ANOMALY"
    """`content_hash` differs and `compaction_epoch` did NOT grow — "sintoma de bug no cálculo
    do hash, de uma escrita fora do escritor único, ou de corrupção" (`D6d`, literal)."""


@dataclass(frozen=True)
class PartitionHashObservation:
    """One touched partition's snapshot-vs-now `(epoch, hash)` pair, for `D6d`'s comparison.

    `knowledge_time` does not appear here on purpose: a caller only builds this observation for
    partitions it has ALREADY confirmed share `knowledge_time` with the run being reproduced —
    the `knowledge_time`-different branch of `D6d` is `T-08.4`'s to evaluate, before this
    module is ever consulted.
    """

    identity: PartitionIdentity
    compaction_epoch_at_snapshot: int
    compaction_epoch_now: int
    content_hash_at_snapshot: str
    content_hash_now: str


def classify_partition_change(observation: PartitionHashObservation) -> PartitionChangeClass:
    """One partition's verdict — the atom `classify_reproduction_attempt` aggregates over."""
    if observation.content_hash_now == observation.content_hash_at_snapshot:
        return PartitionChangeClass.UNCHANGED
    if observation.compaction_epoch_now > observation.compaction_epoch_at_snapshot:
        return PartitionChangeClass.COMPACTION
    return PartitionChangeClass.ANOMALY


class ReproductionVerdict(Enum):
    """The three outcomes `D6d` names for a `knowledge_time`-equal reproduction attempt."""

    BIT_IDENTICAL = "BIT_IDENTICAL"
    COMPACTION = "COMPACTION"
    ANOMALY = "ANOMALY"


@dataclass(frozen=True)
class ReproductionClassification:
    """The aggregate verdict over every partition a run touched, plus the ones that changed.

    `changed_partitions` is empty for `BIT_IDENTICAL` and non-empty for the other two — it is
    the list a refusal message cites (`D6d`: "a lista de `(partition_key, epoch_antigo →
    epoch_novo)`").
    """

    verdict: ReproductionVerdict
    changed_partitions: tuple[PartitionHashObservation, ...]


def classify_reproduction_attempt(
    observations: Sequence[PartitionHashObservation],
) -> ReproductionClassification:
    """`D6d`'s decision tree, for the `knowledge_time`-equal case only (see class docstrings).

    `ANOMALY` wins over `COMPACTION` whenever both appear among the touched partitions — `D6d`
    calls the anomaly case "mais grave" than compaction, so one anomalous partition among ten
    compacted ones still reports `ANOMALY`, never a softened "mostly compaction".
    """
    changed = [
        observation
        for observation in observations
        if classify_partition_change(observation) is not PartitionChangeClass.UNCHANGED
    ]
    if not changed:
        return ReproductionClassification(ReproductionVerdict.BIT_IDENTICAL, ())
    anomalies = tuple(
        observation
        for observation in changed
        if classify_partition_change(observation) is PartitionChangeClass.ANOMALY
    )
    if anomalies:
        return ReproductionClassification(ReproductionVerdict.ANOMALY, anomalies)
    return ReproductionClassification(ReproductionVerdict.COMPACTION, tuple(changed))


class ReproductionRefusedError(Exception):
    """`F-4`: the base of every refusal `enforce_never_silent_number_change` can raise.

    One base class so a caller can fail closed with a single `except` — splitting the two
    refusals into unrelated exceptions would let a caller catch one and forget the other, same
    reasoning as `ChecksumRejectedError` in `checksum_manifest.py`.
    """


class CompactionReconciliationRequiredError(ReproductionRefusedError):
    """The legitimate case — STILL a refusal (`D6d`: `F-4` opens no exception for compaction).

    Message cites every touched partition's `(partition_key, epoch_antigo -> epoch_novo)`, per
    `D6d`, so a caller reads the reconciliation surface off the exception instead of re-deriving
    it from a bare verdict enum.
    """


class PartitionAnomalyError(ReproductionRefusedError):
    """The graver case — hash changed with NO epoch growth: no reconciliation is suggested."""


def enforce_never_silent_number_change(
    observations: Sequence[PartitionHashObservation],
) -> None:
    """Raise unless every touched partition is `UNCHANGED` — never returns a verdict to ignore.

    This is `F-4` made a control-flow fact instead of a comment: a caller cannot proceed past
    this call while holding a changed `content_hash` it has not been forced to look at. Returns
    `None` (bit-identical, `D8.9`'s "devolve o número") — there is nothing else to return,
    because the alternative is one of the two exceptions below, not a value.
    """
    classification = classify_reproduction_attempt(observations)
    if classification.verdict is ReproductionVerdict.BIT_IDENTICAL:
        return
    epochs = ", ".join(
        f"{observation.identity.partition_key}: "
        f"{observation.compaction_epoch_at_snapshot} -> {observation.compaction_epoch_now}"
        for observation in classification.changed_partitions
    )
    if classification.verdict is ReproductionVerdict.COMPACTION:
        raise CompactionReconciliationRequiredError(
            f"content_hash changed on {len(classification.changed_partitions)} partition(s) "
            f"whose compaction_epoch grew — classified 'compaction' (`ADR-002/D6d`), and `F-4` "
            f"opens no exception for it: reconcile explicitly (new run_registry row, "
            f"superseded_by), never accept H2 in place. Epochs: {epochs}"
        )
    raise PartitionAnomalyError(
        f"content_hash changed on {len(classification.changed_partitions)} partition(s) whose "
        f"compaction_epoch did NOT grow — classified 'anomalia' (`ADR-002/D6d`): symptom of a "
        f"hash bug, a write outside the single writer, or corruption. No automatic "
        f"reconciliation is suggested. Epochs: {epochs}"
    )
