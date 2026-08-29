"""A file plus the `.CHECKSUM` published beside it — read in TWO passes, on purpose."""

from __future__ import annotations

import hashlib
import logging
from collections.abc import Iterator
from pathlib import Path

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
        """
        if not self._checksum_path.is_file():
            logger.warning("checksum_sidecar_absent", extra={"subject": self._path.name})
            return None
        return self._checksum_path.read_text(encoding="utf-8")

    def digest(self) -> str:
        """Return the sha256 of the WHOLE file, read in chunks and never held in memory."""
        hasher = hashlib.sha256()
        with self._path.open("rb") as handle:
            while chunk := handle.read(READ_CHUNK_BYTES):
                hasher.update(chunk)
        return hasher.hexdigest()

    def lines(self) -> Iterator[bytes]:
        """Yield the file line by line, lazily, with the line terminator kept.

        Being a generator matters to the contract: the body does not run until the first
        `next()`, so a caller that verifies first cannot leak a line by accident.
        """
        with self._path.open("rb") as handle:
            yield from handle
