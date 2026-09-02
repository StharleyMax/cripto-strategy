"""Durable content-dedupe ledger, append-only JSONL: `fsync` per line, `JsonlCheckpoint`'s shape."""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from src.modules.sentimento.domain.content_dedupe import ContentDedupeLedger, ContentDedupeVerdict

logger = logging.getLogger(__name__)


class CorruptedContentDedupeStoreError(Exception):
    """A COMPLETE line that cannot be read as `{"key": str, "digest": str}`: corruption."""


class DuplicateVerdictPersistedError(Exception):
    """A caller tried to persist a DUPLICATE verdict — there is no new digest to remember."""


class JsonlContentDedupeStore:
    """One line per digest FIRST accepted, with `flush` + `fsync` BEFORE `record` returns.

    Mirrors `infra/jsonl_checkpoint.py` on purpose: same durability contract (`flush` before
    `fsync`, truncated tail tolerated, a readable-but-wrong-shaped line refused by name rather
    than coerced), because this store answers the same question a checkpoint answers —
    "what has already happened" — for a different identity (digest, not key).
    """

    def __init__(self, path: Path) -> None:
        """Bind the store to `path`; nothing is read or written here."""
        self._path = path

    @property
    def path(self) -> Path:
        """Return the file this store appends to."""
        return self._path

    def ledger(self) -> ContentDedupeLedger:
        """Rebuild the ledger from every line recorded so far, first-key-wins per digest.

        Read ONCE by a caller that then keeps the returned value in memory and updates it with
        `ContentDedupeLedger.recording` — the same "load once, then append" shape `drain()`
        already uses for `JsonlCheckpoint.done()`, so a run of N items costs one read, not N.
        """
        if not self._path.exists():
            return ContentDedupeLedger.empty()
        raw = self._path.read_bytes()
        if not raw:
            return ContentDedupeLedger.empty()
        lines = raw.split(b"\n")
        tail = lines.pop()
        if tail:
            logger.warning(
                "content_dedupe_store_tail_truncated", extra={"bytes_discarded": len(tail)}
            )
        first_key_by_digest: dict[str, str] = {}
        for number, line in enumerate(lines, start=1):
            if not line.strip():
                continue
            key, digest = self._entry_of(line, number)
            first_key_by_digest.setdefault(digest, key)
        return ContentDedupeLedger(first_key_by_digest)

    def _entry_of(self, line: bytes, number: int) -> tuple[str, str]:
        """Decode one line into `(key, digest)`, refusing every shape that is not exactly that.

        Same discipline `JsonlCheckpoint._key_of` already fixed for this repository: no
        coercion. `str(None)` turning `null` into the four-character string `"None"` is the
        defect that made a silent bad record indistinguishable from a real one there, and the
        same coercion would do the same damage to a digest here.
        """
        try:
            payload = json.loads(line)
        except json.JSONDecodeError as exc:
            raise CorruptedContentDedupeStoreError(
                f"unreadable line {number} in {self._path}"
            ) from exc
        if not isinstance(payload, dict):
            raise CorruptedContentDedupeStoreError(
                f"line {number} of {self._path} is {type(payload).__name__}, not an object"
            )
        missing = sorted({"key", "digest"} - payload.keys())
        if missing:
            raise CorruptedContentDedupeStoreError(
                f"line {number} of {self._path} is missing field(s) {missing}: {sorted(payload)}"
            )
        key, digest = payload["key"], payload["digest"]
        if not isinstance(key, str) or not key:
            raise CorruptedContentDedupeStoreError(
                f"line {number} of {self._path} carries 'key' = {key!r} "
                f"({type(key).__name__}); only a non-empty string names a recorded key"
            )
        if not isinstance(digest, str) or not digest:
            raise CorruptedContentDedupeStoreError(
                f"line {number} of {self._path} carries 'digest' = {digest!r} "
                f"({type(digest).__name__}); only a non-empty string names a recorded digest"
            )
        return key, digest

    def record(self, verdict: ContentDedupeVerdict) -> None:
        """Append `verdict`'s `(key, digest)`, then `flush` and `fsync`.

        Raises:
            DuplicateVerdictPersistedError: `verdict.is_duplicate` is `True`. A duplicate
                carries no new digest to remember — persisting it would let a second key
                silently become the "first" owner of a digest that was never its own,
                corrupting the very mapping `duplicate_of` is supposed to report.

        """
        if verdict.is_duplicate:
            raise DuplicateVerdictPersistedError(
                f"{verdict.key!r} is a duplicate of {verdict.duplicate_of!r}; nothing new to record"
            )
        self._path.parent.mkdir(parents=True, exist_ok=True)
        line = json.dumps({"key": verdict.key, "digest": verdict.digest}, ensure_ascii=False) + "\n"
        with self._path.open("a", encoding="utf-8") as handle:
            handle.write(line)
            handle.flush()
            os.fsync(handle.fileno())
