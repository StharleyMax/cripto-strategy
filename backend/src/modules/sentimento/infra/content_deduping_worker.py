"""Wrap an `ItemWorker` with the content-hash dedupe layer `T-07.3` requires."""

from __future__ import annotations

import logging
from collections.abc import Callable
from pathlib import Path

from src.modules.sentimento.domain.checksum_manifest import ChecksumManifest, ChecksumMissingError
from src.modules.sentimento.infra.checksummed_file_payload import ChecksummedFilePayload
from src.modules.sentimento.infra.content_dedupe_store import JsonlContentDedupeStore
from src.modules.sentimento.use_cases.drain_etl_backlog import ItemWorker

logger = logging.getLogger(__name__)


def verified_digest_source(mirror_dir: Path) -> Callable[[str], str]:
    """Build a `digest_of` callable that CONFIRMS content against the `.CHECKSUM` sidecar.

    An UNVERIFIED digest is a label, not a witness — `T-07.3`'s DoD is explicit that the hash
    has to be "byte-estável verificado". This reuses `ChecksumManifest`/`ChecksummedFilePayload`
    (the primitives `checksum_manifest.py` already publishes) instead of hashing independently,
    and — just as important — it reuses their ORDER: the sidecar is read FIRST, exactly like
    `ingest_verified_payload.ingest_verified` does, so a missing sidecar is reported as
    `ChecksumMissingError` before the payload is ever opened, and a vanished payload with a
    sidecar present still raises a raw `OSError` from `payload.digest()`. Wiring
    `ContentDedupingWorker` to a naive `lambda key: ChecksummedFilePayload(...).digest()` gets
    this order wrong — it opens the payload FIRST, so a hole in the bucket (both the object and
    its sidecar gone) surfaces as `FileNotFoundError` instead of the `ChecksumMissingError` every
    other caller of this edge already expects.

    NAMED COST, not hidden: for a key that is NOT a duplicate, this means the payload is hashed
    TWICE — once here, once again inside `ingest_verified` before the lines stream — because
    `T-07.3` decides duplicate-or-not BEFORE the wrapped worker runs, and the only way to decide
    that without reading the bytes is to trust an unconfirmed label, which the paragraph above
    rules out. Removing the second pass would mean changing `ingest_verified`'s return contract,
    which is watched by an AST call-order assertion and out of this task's scope.
    """

    def digest_of(key: str) -> str:
        payload = ChecksummedFilePayload(mirror_dir / key)
        attested = payload.checksum_text()
        if attested is None:
            raise ChecksumMissingError(
                f"no .CHECKSUM beside {payload.subject()!r}: content cannot be "
                f"confirmed, so it cannot be deduped either"
            )
        manifest = ChecksumManifest.parse(attested)
        manifest.verify(observed_digest=payload.digest(), observed_subject=payload.subject())
        return manifest.digest

    return digest_of


# ── WHY THIS IS A DECORATOR AROUND `ItemWorker`, AND NOT A CHANGE TO `drain()` ───────────────
#
# `drain()` already buys "never loses" (record only after publish) and delegates "never
# duplicates" to the worker's own idempotence contract. Content dedupe is the SAME family of
# concern — an item that must not be processed twice — except the identity it compares is the
# digest of the bytes, not the declared key. Wrapping the worker means `drain()` and
# `EtlBacklog` need NO CHANGE: they still see one `ItemWorker`, and this one happens to consult
# a second ledger before delegating. That is the instruction in the handoff taken literally —
# add the layer over what exists, don't invent a second pipeline.
#
# ── WHY THE LEDGER IS LOADED ONCE, NOT PER `process()` CALL ──────────────────────────────────
#
# `EtlBacklog.__post_init__` in this same tree carries a measured lesson about doing per-item
# work that is really O(window) done N times. Re-reading `JsonlContentDedupeStore` from disk on
# every `process()` call would be exactly that class of mistake: O(n) items each paying an O(n)
# read. The ledger is loaded ONCE, in `__init__`, exactly like `drain()` calls
# `checkpoint.done()` once before its loop rather than per key — and then kept in memory,
# updated by the pure `ContentDedupeLedger.recording()` after every NEW verdict.


class ContentDedupingWorker:
    """Compute the content digest of `key` and skip publishing it a second time under a new key.

    `digest_of` is the ONLY thing this class reads bytes through, and it is injected rather than
    hard-coded to `ChecksummedFilePayload` so a test can substitute a fake without touching a
    filesystem. Nothing here ever looks at a file name or a modification time — the sole input
    to the dedupe decision is the string `digest_of(key)` returns.
    """

    def __init__(
        self,
        inner: ItemWorker,
        digest_of: Callable[[str], str],
        store: JsonlContentDedupeStore,
    ) -> None:
        """Bind the wrapped worker, the digest source, and the durable store; load its ledger."""
        self._inner = inner
        self._digest_of = digest_of
        self._store = store
        self._ledger = store.ledger()

    def process(self, key: str) -> None:
        """Publish `key` through the wrapped worker, unless its content was already published.

        A DUPLICATE is logged and returned WITHOUT calling the inner worker — the whole point
        of this layer is that the second copy of the same bytes is never republished, no matter
        how different its key looks from the first one's.
        """
        digest = self._digest_of(key)
        verdict = self._ledger.decide(key, digest)
        if verdict.is_duplicate:
            logger.info(
                "etl_item_duplicate_content",
                extra={"etl_key": key, "sha256": digest, "duplicate_of": verdict.duplicate_of},
            )
            return
        self._inner.process(key)
        self._store.record(verdict)
        self._ledger = self._ledger.recording(verdict)
