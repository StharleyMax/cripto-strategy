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

# ── THE SCOPE OF THE ORDERING GUARANTEE, AND A REFUSAL IN THE FORM `ADR-012` ESTABLISHED ─────
#
# THE ASSERTION WATCHES THIS FUNCTION AND NOTHING ELSE. Neither the type system nor
# `import-linter` stops a SECOND use case, written later, from calling `payload.lines()`
# before verifying — and it would pass all four gates. The `/review` of 2026-08-29 named it,
# and it is right.
#
# THE DESIGN THAT WOULD CLOSE IT, and why it is REFUSED here instead of deferred in silence:
# `verify` returning a `VerifiedPayload` that is the only object exposing `lines()`. Refused
# on the merits, and the argument is not "out of scope":
#
#   1. IT WOULD NOT BE STRUCTURAL. Python has no mechanism to stop a caller that already
#      holds the source object from calling `source.lines()` on it directly. The token moves
#      the happy path; it does not close the hole — a gate that LOOKS structural and is not,
#      which is the exact defect family this repository hunts. `import-linter` cannot help
#      either: it reads the IMPORT graph, and this is a method call.
#   2. IT FIXES A PORT SHAPE BEFORE THE FIRST PRODUCTION CALLER EXISTS. There is none today
#      (the trigger below measures it). Choosing the shape now decides from premise instead
#      of from measurement.
#
# OWNER OF THE GAP: `T-03.10` — the task that brings the first production caller, and the
# same owner already carrying achado `H` of `backend/README.md` ("there is no composition
# root"). It cannot defer the decision, because it is the one that has to build the wiring.
#
# OBSERVABLE REOPENING TRIGGER, and it counts CALL SITES from the AST rather than matching a
# regex over text — this repository has nine measured instances of "line regex vs structure":
#
#   cd backend && .venv/bin/python -c "$(cat <<EOF
#   import ast, pathlib
#   n = [f'{f}:{no.lineno}' for f in pathlib.Path('src').rglob('*.py')
#        for no in ast.walk(ast.parse(f.read_text()))
#        if isinstance(no, ast.Call) and isinstance(no.func, ast.Attribute)
#        and no.func.attr == 'lines' and not no.args]
#   print(len(n), n)
#   raise SystemExit(0 if len(n) <= 1 else 1)
#   EOF
#   )"
#
# MEASURED ON BOTH SIDES 2026-08-29, which is what makes it a trigger and not a wish:
#   the tree as it is           -> `1`, rc=0  (only the loop below)          [CALA]
#   plus one planted 2nd caller -> `2`, rc=1                                 [MORDE]
#
# The day that count reaches 2, this comment is the record of when the guarantee stopped
# covering the code.
#
# ⚠️ AND THIS SCANNER IS BLIND IN TWO WAYS — MEASURED BY `T-03.10`, 2026-08-29. The heading above
# says "OBSERVABLE REOPENING TRIGGER", and it is observable only for the form written literally
# as `payload.lines()`. Each evasion measured alone in an isolated tree `[python -B,
# PYTHONDONTWRITEBYTECODE=1, __pycache__ removed]`:
#
#     pull = payload.lines ; pull()      -> 0   [BLIND]
#     getattr(payload, "lines")()        -> 0   [BLIND]
#     payload.lines()                    -> 1   [SEEN]
#
# They are the SAME two evasions `[tool.importlinter]` already names in writing as its own
# inherited limit. **The fixed trigger is no longer a comment: it RUNS**, in
# `tests/sentimento/test_verified_edge_call_sites.py`, which sees all three and is falsified by
# the suite itself. What stays invisible, and is stated rather than papered over:
# `getattr(payload, name)()` with `name` computed at runtime. Prefer the test over the snippet
# above — the snippet is kept because it is what the reopening record cites.


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

    FAILS CLOSED, and every INTEGRITY verdict is the same `ChecksumRejectedError` family:
    a missing sidecar, a malformed one (non-UTF-8 bytes included), a digest that does not
    match, and a manifest that attests another name — all end with zero lines delivered. A
    missing sidecar refusing is a decision and not an oversight — "we could not check" and
    "we checked and it is fine" are different states, and letting the first one through under
    the name of the second is how a truncated month enters unnoticed.

    WHAT IS NOT IN THE FAMILY, NAMED INSTEAD OF IMPLIED. The first draft of this docstring
    said *"any refusal at the edge"*, and that was false in the same way the `^`/`.match()`
    comment was false: a guarantee credited to a term that does not give it. `OSError` and
    its subclasses propagate RAW — `FileNotFoundError` (payload gone, sidecar present),
    `PermissionError`, `IsADirectoryError`, a read error on the device.

    That is a DECISION, not a leftover: those are faults of the caller or of the machine, not
    verdicts about the integrity of an object. Wrapping `FileNotFoundError` as a checksum
    refusal would tell the operator *"this file is corrupt"* when the truth is *"the path you
    passed is not there"*, and the whole point of this module is that the two are different
    questions. The consequence is explicit: a batch caller written as
    `except ChecksumRejectedError: skip_one_file()` SKIPS corrupt objects and DIES on a
    vanished path — which is the behaviour a batch should have, because a payload that
    disappeared mid-run means the caller's view of the world is wrong.

    `test_a_payload_file_that_vanished_delivers_nothing` pins it, so changing it is a
    decision and not a drift.

    Raises:
        ChecksumRejectedError: every integrity verdict. Nothing was written to `sink`.
        OSError: the payload or the sidecar could not be read. Deliberately outside the
            family, for the reason written above. NOTE THE ASYMMETRY, because writing
            "nothing was written to `sink`" here would have been false: an `OSError` while
            OPENING (the common case — vanished path, permissions) fires on the first
            `next()`, before any line exists, so the sink stays empty; an `OSError` raised
            MID-STREAM, after the digest already matched, leaves the lines accepted so far
            in the sink. The integrity family carries the zero-lines guarantee; `OSError`
            does not, and pretending otherwise is the defect this module exists to name.

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
