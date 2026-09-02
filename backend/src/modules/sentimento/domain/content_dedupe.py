"""Dedupe by CONTENT HASH — never by key name, never by download timestamp."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

# ── THE DOD THIS MODULE EXISTS TO CLOSE, AND THE COUNTER-EXAMPLE IT MUST REJECT ──────────────
#
# `T-07.3` names the failure mode literally: two objects with the SAME bytes, downloaded at
# different times, under different names, are the SAME item for ETL purposes — one is a
# duplicate, never reprocessed. The identity this module compares is the digest ALONE.
#
# THE COUNTER-EXAMPLE THAT HAS TO SURVIVE, and it is the one a name-keyed or timestamp-keyed
# scheme gets wrong: two objects with the SAME key but DIFFERENT content (a dump re-published
# after a correction) are NOT duplicates. `decide` below never reads a clock and never compares
# keys to each other for equality of content — only digests are compared, so the counter-example
# is refused BY CONSTRUCTION rather than by a rule that has to remember to check it.
#
# This module is `domain`: it touches no file, no network and no clock. Computing the digest of
# bytes is `infra` (reading the bytes is I/O); comparing two already-computed digests is pure.


@dataclass(frozen=True)
class ContentDedupeVerdict:
    """The verdict for one `key` carrying `digest`: NEW, or a duplicate of an earlier key.

    `duplicate_of` names the FIRST key this digest was ever recorded under — `None` means this
    digest has never been seen, or it was only ever seen under this same `key` (redoing the
    same key is the checkpoint's concern, not this layer's).
    """

    key: str
    digest: str
    duplicate_of: str | None

    @property
    def is_duplicate(self) -> bool:
        """Return whether this verdict names ANOTHER key as the owner of this content."""
        return self.duplicate_of is not None


@dataclass(frozen=True)
class ContentDedupeLedger:
    """Immutable ledger of digests already accepted, and the FIRST key each one arrived under.

    Frozen and functional on purpose: `decide` never mutates state, and `recording` returns a
    NEW ledger rather than growing this one in place — the same shape `EtlBacklog` and
    `ChecksumManifest` already use in this codebase, so a caller can reason about one ledger
    value at a time instead of an object that changes under it.
    """

    first_key_by_digest: Mapping[str, str]

    @classmethod
    def empty(cls) -> ContentDedupeLedger:
        """Return a ledger that has recorded nothing yet."""
        return cls(first_key_by_digest={})

    def decide(self, key: str, digest: str) -> ContentDedupeVerdict:
        """Decide NEW vs DUPLICATE for `key` carrying `digest` — content is the ONLY input.

        A `key` resubmitted with the digest it was FIRST recorded under is NOT a duplicate
        here: it is the same item seen again, and "never reprocessed" for that case is the
        checkpoint's job (`JsonlCheckpoint`/`EtlBacklog.pending`), not this ledger's. This
        ledger only fires when a DIFFERENT key produced the same bytes.
        """
        existing = self.first_key_by_digest.get(digest)
        duplicate_of = existing if existing is not None and existing != key else None
        return ContentDedupeVerdict(key=key, digest=digest, duplicate_of=duplicate_of)

    def recording(self, verdict: ContentDedupeVerdict) -> ContentDedupeLedger:
        """Return a new ledger with `verdict` recorded, unless `verdict` was a duplicate.

        Recording a duplicate verdict is a no-op (`self` is returned unchanged): the ledger's
        job is to remember the FIRST key of a digest, and a duplicate carries no new digest to
        remember.
        """
        if verdict.is_duplicate:
            return self
        return ContentDedupeLedger({**self.first_key_by_digest, verdict.digest: verdict.key})
