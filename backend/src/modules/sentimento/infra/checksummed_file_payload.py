"""A file plus the `.CHECKSUM` published beside it — read in TWO passes, on purpose."""

from __future__ import annotations

import hashlib
import logging
from collections.abc import Iterator
from pathlib import Path

from src.modules.sentimento.domain.checksum_manifest import MalformedChecksumError

logger = logging.getLogger(__name__)

CHECKSUM_SUFFIX = ".CHECKSUM"
READ_CHUNK_BYTES = 1 << 20  # 1 MiB


# ── WHY TWO PASSES, AND WHY NEITHER OF THEM LOADS THE FILE WHOLE ─────────────────────────────
#
# The two passes are the price of the contract, not an oversight. A whole-file digest is only
# known after the last byte, so any single-pass design must either hand lines out before the
# verdict exists (which is exactly what `T-02.4a` forbids) or buffer the whole object in memory
# — and the objects in question reach 6,7 GB `[MEDIDO, SPEC-001 §5.8]`. Reading twice costs one
# extra sequential scan and keeps the guarantee.
#
# Neither pass loads the file whole: `digest()` walks it in `READ_CHUNK_BYTES` blocks and
# `lines()` is a generator. Nothing here decides what a refusal means — that is `use_cases`.


class ChecksummedFilePayload:
    """Bind `path` to the sidecar `path + .CHECKSUM`, the layout the vendor publishes.

    The sidecar name is APPENDED to the full file name, suffix included
    (`BTCUSDT-15m-2026-08-23.zip.CHECKSUM`), which is what the bucket serves. Using
    `Path.with_suffix` would have produced `BTCUSDT-15m-2026-08-23.CHECKSUM` and looked for a
    file that does not exist — the sidecar would read as ABSENT, and absence is a refusal, so
    the mistake would have shown up as a rejected legitimate file rather than as an accepted
    corrupt one. Named because it is the reverse-facing half of the same error.
    """

    def __init__(self, path: Path, checksum_suffix: str = CHECKSUM_SUFFIX) -> None:
        """Bind the payload path and derive the sidecar path; nothing is read here."""
        self._path = path
        self._checksum_path = path.with_name(path.name + checksum_suffix)

    @property
    def path(self) -> Path:
        """Return the payload file this object verifies."""
        return self._path

    @property
    def checksum_path(self) -> Path:
        """Return the sidecar this object expects the digest to be published in."""
        return self._checksum_path

    def subject(self) -> str:
        """Return the payload file name — the name the manifest must attest."""
        return self._path.name

    def checksum_text(self) -> str | None:
        """Return the sidecar verbatim, or `None` when there is no sidecar.

        `None` is a report, not a verdict: `use_cases` decides that an unverifiable payload
        does not enter.

        BYTES THAT ARE NOT UTF-8 ARE A REFUSAL, NOT A CRASH, and this guard is the fix for
        the defect `T-02.4a/QA-1`. The sidecar travels the same wire as the payload and
        corrupts the same way; before the guard, one stray byte raised `UnicodeDecodeError`
        — a `ValueError`, OUTSIDE `ChecksumRejectedError` — so a caller written against the
        documented contract (`except ChecksumRejectedError: skip_one_file()`) died on the
        whole batch instead of skipping one object. The most literally unreadable sidecar
        there is was escaping the family whose docstring says *"cannot be read as a
        manifest"*.

        Re-raised WITH context (`from exc`), never swallowed: `core.silent-except`.
        """
        if not self._checksum_path.is_file():
            logger.warning("checksum_sidecar_absent", extra={"subject": self._path.name})
            return None
        try:
            return self._checksum_path.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            raise MalformedChecksumError(
                f"the sidecar of {self._path.name!r} is not UTF-8 "
                f"(byte {exc.object[exc.start]:#04x} at position {exc.start}): "
                f"it cannot be read as a manifest, so nothing enters"
            ) from exc

    def digest(self) -> str:
        """Return the sha256 of the WHOLE file, read in `READ_CHUNK_BYTES` blocks.

        NEVER LOADED WHOLE — which is the true statement, and not "never held in
        memory": one block IS in memory at a time, by construction. The bound is the
        block size, not zero, and writing zero would credit the guarantee to a term
        that does not give it.
        """
        hasher = hashlib.sha256()
        with self._path.open("rb") as handle:
            while chunk := handle.read(READ_CHUNK_BYTES):
                hasher.update(chunk)
        return hasher.hexdigest()

    def lines(self) -> Iterator[bytes]:
        """Yield the file line by line, lazily, with the line terminator kept.

        WHAT LAZINESS BUYS, AND WHAT IT DOES NOT. It does NOT buy the ordering guarantee: a
        caller that verifies first leaks nothing whether this is lazy or eager, and a caller
        that verifies last leaks either way. The order is owned by `ingest_verified`, and it
        is asserted there.

        What laziness buys is MEMORY — the file is never materialised — and one extra margin
        of safety on the order: hoisting `stream = payload.lines()` above the verification
        (the likeliest innocent refactor) still delivers nothing, because the body has not
        run yet. That margin is asserted too, by the `CallOrderSpy`, which watches the CALL
        and not the delivery.
        """
        with self._path.open("rb") as handle:
            yield from handle
