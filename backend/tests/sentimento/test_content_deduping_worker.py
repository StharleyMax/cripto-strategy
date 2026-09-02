"""`ContentDedupingWorker`: the decorator that wires `T-07.3`'s dedupe onto any `ItemWorker`."""

from __future__ import annotations

import hashlib
from collections.abc import Callable
from pathlib import Path

import pytest

from src.modules.sentimento.domain.checksum_manifest import ChecksumMissingError
from src.modules.sentimento.infra.content_dedupe_store import JsonlContentDedupeStore
from src.modules.sentimento.infra.content_deduping_worker import (
    ContentDedupingWorker,
    verified_digest_source,
)


class RecordingInnerWorker:
    """A fake `ItemWorker`: records every key it was actually asked to process."""

    def __init__(self) -> None:
        """Start with nothing processed."""
        self.calls: list[str] = []

    def process(self, key: str) -> None:
        """Log the call — no real publishing happens here."""
        self.calls.append(key)


def _digest_source(content_by_key: dict[str, str]) -> Callable[[str], str]:
    """Build a `digest_of` callable over an in-memory map — no filesystem needed for this suite."""

    def digest_of(key: str) -> str:
        return content_by_key[key]

    return digest_of


def test_a_new_digest_is_delegated_to_the_inner_worker(tmp_path: Path) -> None:
    """A key whose digest has never been seen is published through the inner worker."""
    inner = RecordingInnerWorker()
    worker = ContentDedupingWorker(
        inner,
        digest_of=_digest_source({"a.zip": "digest-a"}),
        store=JsonlContentDedupeStore(tmp_path / "content_dedupe.jsonl"),
    )

    worker.process("a.zip")

    assert inner.calls == ["a.zip"]


def test_a_second_key_with_the_same_digest_is_never_delegated(tmp_path: Path) -> None:
    """The SAME content under a DIFFERENT key is a duplicate — skipped, never republished."""
    inner = RecordingInnerWorker()
    worker = ContentDedupingWorker(
        inner,
        digest_of=_digest_source({"a.zip": "same-digest", "b.zip": "same-digest"}),
        store=JsonlContentDedupeStore(tmp_path / "content_dedupe.jsonl"),
    )

    worker.process("a.zip")
    worker.process("b.zip")

    assert inner.calls == ["a.zip"], "b.zip carrega o MESMO conteudo de a.zip: nunca republica"


def test_same_name_different_content_is_never_treated_as_a_duplicate(tmp_path: Path) -> None:
    """The DoD's counter-example: same key, different content, is delegated BOTH times."""
    inner = RecordingInnerWorker()
    digests = iter(["digest-original", "digest-corrigido"])
    worker = ContentDedupingWorker(
        inner,
        digest_of=lambda _key: next(digests),
        store=JsonlContentDedupeStore(tmp_path / "content_dedupe.jsonl"),
    )

    worker.process("dump.zip")
    worker.process("dump.zip")  # mesma chave, dump republicado com correcao

    assert inner.calls == ["dump.zip", "dump.zip"], "conteudo corrigido nunca e escondido"


def test_the_dedupe_ledger_survives_a_restart_via_the_durable_store(tmp_path: Path) -> None:
    """A NEW worker, backed by the SAME store, still remembers a digest across a restart."""
    store_path = tmp_path / "content_dedupe.jsonl"
    first_inner = RecordingInnerWorker()
    ContentDedupingWorker(
        first_inner,
        digest_of=_digest_source({"a.zip": "digest-a"}),
        store=JsonlContentDedupeStore(store_path),
    ).process("a.zip")

    second_inner = RecordingInnerWorker()
    ContentDedupingWorker(
        second_inner,
        digest_of=_digest_source({"b.zip": "digest-a"}),
        store=JsonlContentDedupeStore(store_path),
    ).process("b.zip")

    assert not second_inner.calls, "o restart tem de reconhecer o digest gravado por outra chave"


def test_verified_digest_source_confirms_content_against_the_sidecar(tmp_path: Path) -> None:
    """The digest returned is the ATTESTED one, and only after `observed == attested`."""
    mirror = tmp_path
    payload = b"conteudo real"
    (mirror / "a.zip").write_bytes(payload)
    digest = hashlib.sha256(payload).hexdigest()
    (mirror / "a.zip.CHECKSUM").write_text(f"{digest}  a.zip\n", encoding="utf-8")

    assert verified_digest_source(mirror)("a.zip") == digest


def test_verified_digest_source_reports_a_missing_sidecar_before_opening_the_payload(
    tmp_path: Path,
) -> None:
    """THE FIX: a hole in the bucket (object AND sidecar both gone) is `ChecksumMissingError`.

    A naive `lambda key: ChecksummedFilePayload(...).digest()` opens the payload FIRST and would
    raise `FileNotFoundError` here instead — which is exactly the regression `/qa`'s first pass
    over `T-07.3` measured: `tests/sentimento/test_dump_ingest_edge.py::
    test_a_hole_in_the_bucket_stops_the_drain_and_the_cost_is_named` expects `ChecksumRejectedError`
    (the family `ChecksumMissingError` belongs to), and the naive form broke it.
    """
    with pytest.raises(ChecksumMissingError):
        verified_digest_source(tmp_path)("never-written.zip")
