"""The ingestion edge: not one line reaches the sink before the digest matches."""

from __future__ import annotations

import logging
from collections.abc import Iterator
from typing import Protocol

from src.modules.sentimento.domain.checksum_manifest import (
    ChecksumManifest,
    ChecksumMissingError,
)

logger = logging.getLogger(__name__)

# ── THE ORDER IS THE CONTRACT, AND A TEST WATCHES IT ─────────────────────────────────────────
#
# `T-02.4a` states the contract literally — *"rejeita truncamento ANTES de qualquer linha
# entrar"*. That word decides the shape of this module and rules out the cheaper design: hashing
# while streaming and raising at the end would be a guard that reports the truncation AFTER the
# short series is already written, which is the defect, not the fix.
#
# So the order is fixed here and measured by a test that watches the ORDER of the calls
# (`tests/sentimento/test_checksum_at_the_ingestion_edge.py`):
#
#     checksum_text()  ->  parse  ->  digest()  ->  verify  ->  THEN, and only then, lines()
#
# `lines()` is not merely unread before the verdict; it is not even CALLED. That is a stricter
# statement than "the sink stayed empty", and it is the one that survives someone later making
# `lines()` eager.


# The three `noqa: D102` below follow the reason already written in `drain_etl_backlog.py`:
# giving a `Protocol` stub a docstring forces the `...` onto its own line, which ADDS a
# statement that the coverage default regex no longer excludes. The contract of each port is
# in the docstring of the CLASS, immediately above the stubs, so nothing is lost.


class VerifiablePayload(Protocol):
    """Payload port. Contract: `digest()` covers the WHOLE payload, `lines()` is lazy.

    `checksum_text()` returns the sidecar verbatim, or `None` when there is no sidecar — the
    port reports absence, it does not decide what absence means. Deciding is policy, and
    policy lives in `ingest_verified` below, where it can be read in one place.
    """

    def subject(self) -> str: ...  # noqa: D102

    def checksum_text(self) -> str | None: ...  # noqa: D102

    def digest(self) -> str: ...  # noqa: D102

    def lines(self) -> Iterator[bytes]: ...  # noqa: D102


class LineSink(Protocol):
    """Destination port. Reaching it at all is the event this module gates."""

    def accept(self, line: bytes) -> None: ...  # noqa: D102


def ingest_verified(payload: VerifiablePayload, sink: LineSink) -> int:
    """Verify at the edge, then stream; return how many lines were accepted.

    FAILS CLOSED, and the three ways it does so are the same `ChecksumRejectedError` family:
    a missing sidecar, a malformed one, and a digest that does not match all end with zero
    lines delivered. A missing sidecar refusing is a decision and not an oversight — "we could
    not check" and "we checked and it is fine" are different states, and letting the first one
    through under the name of the second is how a truncated month enters unnoticed.

    Raises:
        ChecksumRejectedError: any refusal at the edge. Nothing was written to `sink`.

    """
    subject = payload.subject()
    attested = payload.checksum_text()
    if attested is None:
        raise ChecksumMissingError(
            f"no .CHECKSUM beside {subject!r}: the payload cannot be verified, so it does "
            f"not enter. A 200 with a truncated body raises nothing on its own."
        )
    manifest = ChecksumManifest.parse(attested)
    manifest.verify(observed_digest=payload.digest(), observed_subject=subject)

    accepted = 0
    for line in payload.lines():
        sink.accept(line)
        accepted += 1
    logger.info(
        "ingestion_verified",
        extra={"subject": subject, "sha256": manifest.digest, "lines": accepted},
    )
    return accepted
