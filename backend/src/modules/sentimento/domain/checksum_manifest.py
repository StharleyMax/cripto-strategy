"""`.CHECKSUM` manifest: the witness of integrity that an HTTP status code is not."""

from __future__ import annotations

import re
from dataclasses import dataclass

# ── WHY THIS MODULE EXISTS, AND THE MEASUREMENT THAT PUT IT HERE ─────────────────────────────
#
# `SPEC-001` §5.8 measured the failure mode this module exists to catch: `monthly/bookTicker`
# 2024-04 answered **200 with 37,7 MB** where the previous month weighed 6,7 GB `[MEDIDO,
# registered in the plan and in SPEC-001 §5.8]`. A truncated body raises NOTHING — no exception,
# no non-2xx status — so an ingestion that trusts the status code writes a SHORT SERIES and calls
# it complete. Only the digest published beside the object separates the two.
#
# FORM PARSED HERE, and it is the one the vendor publishes: GNU `sha256sum` output — 64 hex
# characters, one space, one mode character (` ` text / `*` binary), the subject name. Observed
# literally as `bcd2d2...  BTCUSDT-15m-2026-08-23.zip` `[DOC: docs/avaliacao-discovery.md:295]`.
#
# This module is `domain`: it touches no file, no network and no clock. Reading bytes is `infra`,
# ordering the edge is `use_cases`.


SHA256_HEX_LENGTH = 64

# ANCHORING LIVES IN `fullmatch`, NOT IN THE PATTERN — and the first draft of this module got
# that wrong in a way worth writing down, because it is the family of defect this repository
# hunts. It carried `^...$` in the pattern and a comment claiming the leading `^` was what kept
# a line that merely CONTAINS a digest from being read as a manifest. It was not: the call was
# `.match()`, which anchors at the start on its own, so deleting the `^` changed NOTHING
# [MEDIDO 2026-08-29, bancada de mutacao com bytecode desligado, n=8 mutacoes: `^` removido ->
# 27 passed, rc=0 — a mutacao nao foi detectada porque nao havia nada a detectar]. A comment
# that credits a guard to the wrong mechanism survives the day someone edits the mechanism.
#
# So the anchor is stated ONCE, at the call site, with `fullmatch`. The mutation that swaps it
# for `search` now BITES, on the `digest-not-at-the-start` case of the parametrized refusal
# test — which is what makes that case load-bearing instead of decorative.
#
# `[ *]` is the mode character of `sha256sum` (` ` text, `*` binary). It is not optional in
# that format, and accepting a missing one would silently widen what counts as a manifest.
_ENTRY = re.compile(r"(?P<digest>[0-9a-fA-F]{64}) (?P<mode>[ *])(?P<subject>\S.*?)\s*")


class ChecksumRejectedError(Exception):
    """The verdict of the ingestion edge: NOTHING from this payload may enter.

    Every refusal below inherits from this one so a caller can fail closed with a single
    `except`. Splitting them into siblings would let a caller catch three and forget the
    fourth, and the one it forgot would be the one that lets a truncated file through.
    """


class MalformedChecksumError(ChecksumRejectedError):
    """The sidecar itself cannot be read as a manifest — unverifiable, therefore refused."""


class ChecksumMissingError(ChecksumRejectedError):
    """No `.CHECKSUM` beside the payload. Absence of a witness is not a passing verdict."""


class ChecksumMismatchError(ChecksumRejectedError):
    """The digest observed on disk differs from the digest the manifest attests."""


class ChecksumSubjectMismatchError(ChecksumRejectedError):
    """The manifest attests ANOTHER name: a valid digest of the wrong file.

    A sidecar copied from a neighbouring month is internally consistent and still proves
    nothing about the file it now sits beside.
    """


@dataclass(frozen=True)
class ChecksumManifest:
    """One attested pair: the digest, and the subject name it is a digest OF."""

    digest: str
    subject: str

    def __post_init__(self) -> None:
        """Reject a manifest that could never attest anything, at construction time."""
        if len(self.digest) != SHA256_HEX_LENGTH or not re.fullmatch(r"[0-9a-f]+", self.digest):
            raise MalformedChecksumError(
                f"digest is not {SHA256_HEX_LENGTH} lowercase hex characters: {self.digest!r}"
            )
        if not self.subject:
            raise MalformedChecksumError("manifest attests an empty subject name")

    @classmethod
    def parse(cls, text: str) -> ChecksumManifest:
        """Read the single `sha256sum` entry the sidecar is expected to carry.

        EXACTLY ONE entry, and the count is checked instead of assumed: a sidecar with two
        entries is ambiguous about which one attests this payload, and picking the first would
        be a choice made by accident. Blank lines are tolerated; anything else is not.

        Hex case is normalised because it carries no meaning — refusing an uppercase digest
        would be a rejection of a legitimate file, which costs the same as accepting a
        corrupted one and buys nothing.
        """
        entries = [line for line in text.splitlines() if line.strip()]
        if len(entries) != 1:
            raise MalformedChecksumError(
                f"the sidecar must carry exactly 1 entry; it carries {len(entries)}"
            )
        found = _ENTRY.fullmatch(entries[0])
        if found is None:
            raise MalformedChecksumError(f"entry is not in `sha256sum` format: {entries[0][:80]!r}")
        return cls(digest=found["digest"].lower(), subject=found["subject"])

    def verify(self, *, observed_digest: str, observed_subject: str) -> None:
        """Raise unless the manifest attests THIS name with THIS digest; return `None` if it does.

        The subject is checked FIRST because it answers a different question: a digest
        mismatch says *this file is not what was published*, while a subject mismatch says
        *this manifest was never about this file*. Reporting the second as the first would
        send whoever reads the log hunting a truncation that did not happen.
        """
        if observed_subject != self.subject:
            raise ChecksumSubjectMismatchError(
                f"the sidecar attests {self.subject!r}, and the payload is {observed_subject!r}"
            )
        if observed_digest.lower() != self.digest:
            raise ChecksumMismatchError(
                f"{self.subject!r}: attested sha256 {self.digest}, "
                f"observed {observed_digest.lower()}"
            )
