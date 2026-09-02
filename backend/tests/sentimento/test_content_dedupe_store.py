"""`JsonlContentDedupeStore`: durable ledger of digests, same discipline as `JsonlCheckpoint`."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from src.modules.sentimento.domain.content_dedupe import ContentDedupeLedger, ContentDedupeVerdict
from src.modules.sentimento.infra.content_dedupe_store import (
    CorruptedContentDedupeStoreError,
    DuplicateVerdictPersistedError,
    JsonlContentDedupeStore,
)


def test_a_missing_store_returns_an_empty_ledger(tmp_path: Path) -> None:
    """No file yet means nothing has been recorded — the ledger starts empty, not an error."""
    store = JsonlContentDedupeStore(tmp_path / "nao-existe.jsonl")

    assert store.ledger() == ContentDedupeLedger.empty()


def test_record_then_ledger_round_trips_the_first_key_of_a_digest(tmp_path: Path) -> None:
    """A recorded verdict survives a reload: the digest maps back to the key that recorded it."""
    store = JsonlContentDedupeStore(tmp_path / "content_dedupe.jsonl")
    verdict = ContentDedupeVerdict(key="a.zip", digest="d" * 64, duplicate_of=None)

    store.record(verdict)
    reloaded = JsonlContentDedupeStore(store.path).ledger()

    assert reloaded.decide("b.zip", "d" * 64).duplicate_of == "a.zip"


def test_recording_a_duplicate_verdict_is_refused() -> None:
    """A DUPLICATE verdict carries no new digest — persisting it would corrupt the ledger."""
    store = JsonlContentDedupeStore(Path("unused.jsonl"))
    duplicate = ContentDedupeVerdict(key="b.zip", digest="d" * 64, duplicate_of="a.zip")

    with pytest.raises(DuplicateVerdictPersistedError):
        store.record(duplicate)


def test_the_store_fsyncs_and_the_line_is_already_in_the_file_when_it_happens(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """`flush` BEFORE, `fsync` AFTER — same contract `jsonl_checkpoint.py` already carries."""
    ledger_path = tmp_path / "content_dedupe.jsonl"
    calls: list[int] = []
    seen: list[bytes] = []
    original = os.fsync

    def spy(fd: int) -> None:
        calls.append(fd)
        seen.append(ledger_path.read_bytes())
        original(fd)

    monkeypatch.setattr(os, "fsync", spy)
    JsonlContentDedupeStore(ledger_path).record(
        ContentDedupeVerdict(key="a.zip", digest="e" * 64, duplicate_of=None)
    )

    assert len(calls) == 1, "record() tem de chamar os.fsync UMA vez por linha"
    assert seen == [f'{{"key": "a.zip", "digest": "{"e" * 64}"}}\n'.encode()]


def test_a_truncated_tail_is_discarded_and_the_rest_survives(tmp_path: Path) -> None:
    """Death mid-write leaves a tail with no newline: tolerated, and every complete line kept."""
    path = tmp_path / "content_dedupe.jsonl"
    store = JsonlContentDedupeStore(path)
    store.record(ContentDedupeVerdict(key="a.zip", digest="a" * 64, duplicate_of=None))
    with path.open("a", encoding="utf-8") as handle:
        handle.write('{"key": "b.zi')  # sem newline: escrita interrompida

    ledger = store.ledger()

    assert ledger.decide("x", "a" * 64).duplicate_of == "a.zip"
    assert ledger.decide("b.zip", "b" * 64).is_duplicate is False


def test_a_complete_unreadable_line_is_corruption_and_is_not_tolerated(tmp_path: Path) -> None:
    """A COMPLETE line that is not JSON at all is corruption, not noise to skip over."""
    path = tmp_path / "content_dedupe.jsonl"
    store = JsonlContentDedupeStore(path)
    store.record(ContentDedupeVerdict(key="a.zip", digest="a" * 64, duplicate_of=None))
    with path.open("a", encoding="utf-8") as handle:
        handle.write("nao-e-json\n")

    with pytest.raises(CorruptedContentDedupeStoreError):
        store.ledger()


@pytest.mark.parametrize(
    "payload",
    [
        '{"key": "a.zip"}',  # falta digest
        '{"digest": "d"}',  # falta key
        '{"key": null, "digest": "d"}',  # key nao-string: sem coercao
        '["a.zip", "d"]',  # nao e objeto
    ],
)
def test_every_wrong_shape_is_refused_by_name_not_coerced(tmp_path: Path, payload: str) -> None:
    """No shape besides `{"key": str, "digest": str}` is silently accepted or coerced."""
    path = tmp_path / "content_dedupe.jsonl"
    path.write_text(payload + "\n", encoding="utf-8")

    with pytest.raises(CorruptedContentDedupeStoreError):
        JsonlContentDedupeStore(path).ledger()
