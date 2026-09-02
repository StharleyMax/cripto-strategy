"""`T-07.3`: dedupe decided by CONTENT HASH alone — never by key, never by a clock."""

from __future__ import annotations

import hashlib

from src.modules.sentimento.domain.content_dedupe import ContentDedupeLedger, ContentDedupeVerdict


def _sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def test_a_digest_never_seen_before_is_new() -> None:
    """An empty ledger has seen nothing: the first digest it is asked about is always NEW."""
    ledger = ContentDedupeLedger.empty()

    verdict = ledger.decide("a.zip", _sha256(b"conteudo"))

    assert verdict.is_duplicate is False
    assert verdict.duplicate_of is None


def test_two_different_keys_with_byte_identical_content_are_the_same_item() -> None:
    """`T-07.3`'s DoD, literally: same bytes under a different name/key is a DUPLICATE.

    THE FALSIFIER of "byte-stable verified": the digest of the same bytes, hashed twice
    (once per file), is IDENTICAL — that identity is what makes the second key collide with
    the first in the ledger. If `hashlib.sha256` ever produced two different digests for the
    same bytes, this assertion would be the one to catch it.
    """
    payload = b"BTCUSDT-15m-2026-08-23 conteudo identico byte a byte"
    digest_first_download = _sha256(payload)
    digest_second_download = _sha256(payload)
    assert digest_first_download == digest_second_download, "o hash tem de ser byte-estavel"

    ledger = ContentDedupeLedger.empty()
    first = ledger.decide("BTCUSDT-15m-2026-08-23.zip", digest_first_download)
    ledger = ledger.recording(first)
    # Re-downloaded later, saved under a DIFFERENT name — not the same key, not the same
    # timestamp, same bytes.
    second = ledger.decide("BTCUSDT-15m-2026-08-23-redownload.zip", digest_second_download)

    assert first.is_duplicate is False
    assert second.is_duplicate is True
    assert second.duplicate_of == "BTCUSDT-15m-2026-08-23.zip"


def test_a_single_differing_byte_produces_a_different_digest_and_is_not_a_duplicate() -> None:
    """The other half of the falsifier: content that differs by ONE byte is NOT a duplicate."""
    original = b"BTCUSDT-15m-2026-08-23,1000,close"
    corrected = b"BTCUSDT-15m-2026-08-23,1001,close"  # um digito trocado
    assert original != corrected

    ledger = ContentDedupeLedger.empty()
    first = ledger.decide("dump.csv", _sha256(original))
    ledger = ledger.recording(first)
    second = ledger.decide("dump.csv", _sha256(corrected))

    assert _sha256(original) != _sha256(corrected)
    assert second.is_duplicate is False


def test_the_counter_example_the_dod_names_same_key_different_content_is_not_a_duplicate() -> None:
    """A dump re-published under the SAME NAME with CORRECTED content is NOT a duplicate.

    This is the contra-exemplo the handoff requires rejected explicitly: a name-keyed dedupe
    would treat the two as identical because the key matches; this ledger never compares keys
    to each other, only digests, so the correction is preserved instead of hidden.
    """
    ledger = ContentDedupeLedger.empty()
    first = ledger.decide("BTCUSDT-2024-04.zip", _sha256(b"37,7 MB truncado"))
    ledger = ledger.recording(first)

    republished = ledger.decide("BTCUSDT-2024-04.zip", _sha256(b"6,7 GB corrigido"))

    assert republished.is_duplicate is False, "mesmo nome, conteudo diferente: NAO e duplicata"


def test_resubmitting_the_same_key_with_the_digest_it_was_first_recorded_under_is_not_flagged() -> (
    None
):
    """Redoing the SAME key (resumed run) is the checkpoint's job, not this ledger's fire.

    This ledger only fires when a DIFFERENT key produces the same content — a key seen again
    with its own original digest carries no new information for it to report.
    """
    ledger = ContentDedupeLedger.empty()
    first = ledger.decide("a.zip", _sha256(b"x"))
    ledger = ledger.recording(first)

    again = ledger.decide("a.zip", _sha256(b"x"))

    assert again.is_duplicate is False


def test_recording_a_duplicate_verdict_is_a_no_op() -> None:
    """Recording a DUPLICATE verdict changes nothing — there is no new digest to remember."""
    ledger = ContentDedupeLedger.empty()
    first = ledger.decide("a.zip", _sha256(b"x"))
    ledger = ledger.recording(first)
    duplicate = ledger.decide("b.zip", _sha256(b"x"))

    unchanged = ledger.recording(duplicate)

    assert unchanged.first_key_by_digest == ledger.first_key_by_digest


def test_the_ledger_is_immutable_recording_returns_a_new_value() -> None:
    """`recording` never mutates `self` — the caller keeps whichever value it wants."""
    empty = ContentDedupeLedger.empty()
    verdict = ContentDedupeVerdict(key="a.zip", digest=_sha256(b"x"), duplicate_of=None)

    grown = empty.recording(verdict)

    assert empty.first_key_by_digest == {}
    assert grown.first_key_by_digest == {verdict.digest: "a.zip"}
