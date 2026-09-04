"""`ADR-002/D6c`/`D6d`, `D8.10`: content_hash determinism, epoch increment, the three verdicts.

THE FALSIFIER FOR EACH OF THE THREE CASES `D8.10` NAMES lives in its own test below, named
after the case: `test_bit_identical_...`, `test_compaction_refuses_...`,
`test_anomaly_refuses_...`. Each proves the REFUSAL, not just the classification enum — for
`F-4` ("nunca número diferente em silêncio") a green "classified as compaction" would not be
enough; what has to be true is that `enforce_never_silent_number_change` never returns a
number to a caller who then treats silence as success.
"""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.partition_registry import (
    CONTENT_HASH_ORDER_KEYS,
    CompactionReconciliationRequiredError,
    ContentHashInputError,
    InvalidPartitionIdentityError,
    InvalidPartitionRegistryEntryError,
    PartitionAnomalyError,
    PartitionChangeClass,
    PartitionHashObservation,
    PartitionIdentity,
    PartitionRegistryEntry,
    ReproductionVerdict,
    apply_compaction,
    apply_write,
    classify_partition_change,
    classify_reproduction_attempt,
    compute_content_hash,
    enforce_never_silent_number_change,
    initial_partition_entry,
)

IDENTITY = PartitionIdentity(
    series_key_id="a" * 64,
    symbol="BTCUSDT",
    source="binance_daily_metrics",
    partition_key="2026-09",
)


def _row(event_time: int, observed_at: int, value: float) -> dict[str, object]:
    return {
        "event_time": event_time,
        "observed_at": observed_at,
        "source": IDENTITY.source,
        "symbol": IDENTITY.symbol,
        "sum_open_interest": value,
    }


# ── `PartitionIdentity` — a blank term collides two partitions ────────────────────────────


@pytest.mark.parametrize("field", ["series_key_id", "symbol", "source", "partition_key"])
def test_partition_identity_refuses_a_blank_term(field: str) -> None:
    """THE FALSIFIER: a blank term must raise, not silently become part of the identity."""
    kwargs = {
        "series_key_id": "a" * 64,
        "symbol": "BTCUSDT",
        "source": "binance_daily_metrics",
        "partition_key": "2026-09",
    }
    kwargs[field] = "   "
    with pytest.raises(InvalidPartitionIdentityError, match=field):
        PartitionIdentity(**kwargs)


# ── `compute_content_hash` — `D6c`'s explicit ORDER BY, never scan order ───────────────────


def test_content_hash_order_keys_are_the_four_d6c_names() -> None:
    """Pins the literal tuple `D6c` names, so a reorder here is caught by this test, not later."""
    assert CONTENT_HASH_ORDER_KEYS == ("event_time", "observed_at", "source", "symbol")


def test_content_hash_is_independent_of_input_order() -> None:
    """THE FALSIFIER for 'ordem de scan implícita': shuffled input, identical hash."""
    rows_in_scan_order = [_row(3, 30, 3.0), _row(1, 10, 1.0), _row(2, 20, 2.0)]
    rows_reversed = list(reversed(rows_in_scan_order))

    assert compute_content_hash(rows_in_scan_order) == compute_content_hash(rows_reversed)


def test_content_hash_is_independent_of_dict_key_construction_order() -> None:
    """A caller building the same row with keys in a different order gets the same hash."""
    row_a = {"event_time": 1, "observed_at": 10, "source": "s", "symbol": "BTCUSDT", "v": 1.0}
    row_b = {"v": 1.0, "symbol": "BTCUSDT", "source": "s", "observed_at": 10, "event_time": 1}

    assert compute_content_hash([row_a]) == compute_content_hash([row_b])


def test_content_hash_changes_when_a_value_changes() -> None:
    """A hash that never moves would not be a content hash — the negative side of determinism."""
    base = [_row(1, 10, 1.0)]
    changed = [_row(1, 10, 2.0)]

    assert compute_content_hash(base) != compute_content_hash(changed)


def test_content_hash_is_64_lowercase_hex_characters() -> None:
    """`sha256().hexdigest()`'s own contract, pinned so `PartitionRegistryEntry` can rely on it."""
    digest = compute_content_hash([_row(1, 10, 1.0)])
    assert len(digest) == 64
    assert all(c in "0123456789abcdef" for c in digest)


def test_content_hash_refuses_zero_rows() -> None:
    """An empty partition is not a partition this function has anything to hash."""
    with pytest.raises(ContentHashInputError):
        compute_content_hash([])


def test_content_hash_refuses_a_row_missing_an_order_key() -> None:
    """A row that cannot be placed in the total order cannot be hashed deterministically."""
    with pytest.raises(ContentHashInputError, match="observed_at"):
        compute_content_hash([{"event_time": 1, "source": "s", "symbol": "BTCUSDT"}])


# ── `PartitionRegistryEntry` — the shape `D6c` describes, refused otherwise ────────────────


def test_entry_refuses_a_negative_compaction_epoch() -> None:
    """`D6c` only ever increments the epoch — a negative one is a shape it never describes."""
    with pytest.raises(InvalidPartitionRegistryEntryError, match="compaction_epoch"):
        PartitionRegistryEntry(
            identity=IDENTITY,
            compaction_epoch=-1,
            content_hash="a" * 64,
            row_count=1,
            last_written_at=1,
            last_compacted_at=None,
            updated_at=1,
        )


def test_entry_refuses_a_malformed_content_hash() -> None:
    """A `content_hash` that is not 64 lowercase hex characters is refused at construction."""
    with pytest.raises(InvalidPartitionRegistryEntryError, match="content_hash"):
        initial_partition_entry(IDENTITY, content_hash="not-a-sha256", row_count=1, written_at=1)


# ── `apply_write` / `apply_compaction` — `D6c`: only compaction increments the epoch ───────


def test_initial_partition_entry_starts_at_epoch_zero() -> None:
    """`D6c`, literal: 'inteiro, começa em 0'."""
    entry = initial_partition_entry(IDENTITY, content_hash="a" * 64, row_count=10, written_at=100)
    assert entry.compaction_epoch == 0
    assert entry.last_compacted_at is None


def test_apply_write_never_changes_the_epoch() -> None:
    """THE FALSIFIER for 'apenas compactação incrementa': ten writes, epoch stays at 0."""
    entry = initial_partition_entry(IDENTITY, content_hash="a" * 64, row_count=1, written_at=1)
    for step in range(2, 11):
        entry = apply_write(entry, content_hash=f"{step:064x}", row_count=step, written_at=step)
    assert entry.compaction_epoch == 0
    assert entry.row_count == 10


def test_apply_compaction_increments_by_exactly_one() -> None:
    """`D6c`, literal: 'incrementado em exatamente 1'."""
    entry = initial_partition_entry(IDENTITY, content_hash="a" * 64, row_count=5, written_at=1)
    once = apply_compaction(entry, content_hash="b" * 64, compacted_at=2)
    twice = apply_compaction(once, content_hash="c" * 64, compacted_at=3)
    assert once.compaction_epoch == 1
    assert twice.compaction_epoch == 2


def test_apply_compaction_preserves_row_count_lossless() -> None:
    """`D6a`: compression is lossless — no row disappears, so `row_count` is untouched."""
    entry = initial_partition_entry(IDENTITY, content_hash="a" * 64, row_count=42, written_at=1)
    compacted = apply_compaction(entry, content_hash="b" * 64, compacted_at=2)
    assert compacted.row_count == 42


def test_apply_compaction_stamps_last_compacted_at() -> None:
    """`last_compacted_at`/`updated_at` move; `last_written_at` does not (`D6c`)."""
    entry = initial_partition_entry(IDENTITY, content_hash="a" * 64, row_count=1, written_at=1)
    compacted = apply_compaction(entry, content_hash="b" * 64, compacted_at=99)
    assert compacted.last_compacted_at == 99
    assert compacted.updated_at == 99
    assert compacted.last_written_at == 1


# ── `D6d` / `D8.10` — the three cases, EACH a refusal-or-return proof ──────────────────────


def _observation(
    *, epoch_snapshot: int, epoch_now: int, hash_snapshot: str, hash_now: str
) -> PartitionHashObservation:
    return PartitionHashObservation(
        identity=IDENTITY,
        compaction_epoch_at_snapshot=epoch_snapshot,
        compaction_epoch_now=epoch_now,
        content_hash_at_snapshot=hash_snapshot,
        content_hash_now=hash_now,
    )


def test_case_1_bit_identical_returns_none_silently() -> None:
    """`D8.10` case 1: hash unchanged. `D8.9`'s 'devolve o número' — no exception."""
    observations = [
        _observation(epoch_snapshot=3, epoch_now=3, hash_snapshot="a" * 64, hash_now="a" * 64)
    ]

    assert classify_reproduction_attempt(observations).verdict is ReproductionVerdict.BIT_IDENTICAL
    enforce_never_silent_number_change(observations)  # THE FALSIFIER: must not raise


def test_case_2_compaction_still_refuses_never_accepts_h2_silently() -> None:
    """`D8.10` case 2/`D6d`'s `[INFERRED]`: even the LEGITIMATE case is a hard refusal.

    THE FALSIFIER: proves the system does NOT quietly hand back the new hash just because the
    epoch grew on every touched partition — `F-4` names no exception for compaction.
    """
    observations = [
        _observation(epoch_snapshot=1, epoch_now=2, hash_snapshot="a" * 64, hash_now="b" * 64)
    ]

    assert classify_partition_change(observations[0]) is PartitionChangeClass.COMPACTION
    with pytest.raises(CompactionReconciliationRequiredError, match="2026-09"):
        enforce_never_silent_number_change(observations)


def test_case_3_anomaly_refuses_without_reconciliation_suggestion() -> None:
    """`D8.10` case 3: hash changed with NO epoch growth — the graver, unsuggested refusal.

    THE FALSIFIER: this must raise a DIFFERENT exception than the compaction case, so a caller
    catching `CompactionReconciliationRequiredError` specifically does not silently swallow an
    anomaly meant for a human, not an automated reconciliation flow.
    """
    observations = [
        _observation(epoch_snapshot=2, epoch_now=2, hash_snapshot="a" * 64, hash_now="b" * 64)
    ]

    assert classify_partition_change(observations[0]) is PartitionChangeClass.ANOMALY
    with pytest.raises(PartitionAnomalyError):
        enforce_never_silent_number_change(observations)
    with pytest.raises(PartitionAnomalyError):
        # THE NEGATIVE FALSIFIER: an anomaly must never be catchable as a compaction.
        try:
            enforce_never_silent_number_change(observations)
        except CompactionReconciliationRequiredError as exc:  # pragma: no cover - must not happen
            raise AssertionError("anomaly was misclassified as a reconcilable compaction") from exc


def test_anomaly_wins_over_compaction_when_both_are_touched() -> None:
    """`D6d`: anomaly is 'mais grave' — one anomalous partition darkens the whole verdict."""
    compaction_like = _observation(
        epoch_snapshot=1, epoch_now=2, hash_snapshot="a" * 64, hash_now="b" * 64
    )
    anomaly_like = _observation(
        epoch_snapshot=5, epoch_now=5, hash_snapshot="c" * 64, hash_now="d" * 64
    )

    classification = classify_reproduction_attempt([compaction_like, anomaly_like])

    assert classification.verdict is ReproductionVerdict.ANOMALY
    assert classification.changed_partitions == (anomaly_like,)
    with pytest.raises(PartitionAnomalyError):
        enforce_never_silent_number_change([compaction_like, anomaly_like])
