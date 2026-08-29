"""`GAP G1` / `D2.8`: corrupt one byte and demand rejection — before any line enters.

TWO SIDES, ONE PASS, and the suite is worthless without both: `test_intact_file_...` is the
side that must stay SILENT on a legitimate file, and `test_one_corrupted_byte_...` is the side
that must BITE. A guard that only ever bites rejects everything; a guard that only ever stays
silent accepts everything. Neither is measured by the other.

UNIVERSE OF `D2.8`, and it is written here so no number travels without it:
  - **1 file** with **1 corrupted byte**, same length as the original (a length check alone
    would NOT catch it — only the digest does, and this suite asserts the length is equal);
  - **1 case of a `200` with a truncated body**, the failure mode `SPEC-001` §5.8 measured on
    `monthly/bookTicker` 2024-04: **200 with 37,7 MB** against **6,7 GB** the month before
    `[MEDIDO, SPEC-001 §5.8]`. The fixture here reproduces the RATIO, not the file: this suite
    fabricates every byte it uses and reads nothing from `data/`.

ZERO NETWORK: the "download" in this file is a local write. No Binance, no Bybit, no Coinalyze.
"""

from __future__ import annotations

import hashlib
import logging
import tracemalloc
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import pytest

from src.modules.sentimento.domain.checksum_manifest import (
    SHA256_HEX_LENGTH,
    ChecksumManifest,
    ChecksumMismatchError,
    ChecksumMissingError,
    ChecksumRejectedError,
    ChecksumSubjectMismatchError,
    MalformedChecksumError,
)
from src.modules.sentimento.infra.checksummed_file_payload import (
    READ_CHUNK_BYTES,
    ChecksummedFilePayload,
)
from src.modules.sentimento.use_cases.ingest_verified_payload import ingest_verified

# The month that answered 200 and the month before it, in bytes `[MEDIDO, SPEC-001 §5.8]`.
# Only their RATIO is used, to size the truncation of a fabricated fixture.
MEASURED_FULL_MONTH_BYTES = 6_700_000_000
MEASURED_TRUNCATED_MONTH_BYTES = 37_700_000

PAYLOAD_NAME = "BTCUSDT-15m-2026-08-23.csv"
LINE_COUNT = 40


def _body(lines: int = LINE_COUNT) -> bytes:
    """Build a deterministic CSV-shaped body of `lines` lines."""
    return b"".join(f"1690000000{n:03d},{n}.5,{n}.25\n".encode("ascii") for n in range(lines))


def _sidecar_text(body: bytes, subject: str, mode: str = " ") -> str:
    """Render the `sha256sum` line the vendor publishes beside the object."""
    return f"{hashlib.sha256(body).hexdigest()} {mode}{subject}\n"


def _publish(directory: Path, body: bytes, subject: str = PAYLOAD_NAME) -> Path:
    """Write payload + `.CHECKSUM` exactly as the bucket serves them, and return the payload."""
    directory.mkdir(parents=True, exist_ok=True)
    payload = directory / subject
    payload.write_bytes(body)
    payload.with_name(payload.name + ".CHECKSUM").write_text(
        _sidecar_text(body, subject), encoding="utf-8"
    )
    return payload


class RecordingSink:
    """Everything that got past the edge, so "not one line entered" is a measurement."""

    def __init__(self) -> None:
        """Start with nothing accepted."""
        self.accepted: list[bytes] = []

    def accept(self, line: bytes) -> None:
        """Record one line that the edge let through."""
        self.accepted.append(line)


class CallOrderSpy:
    """Wrap a payload port and record the ORDER in which the edge touches it.

    This is what turns "before any line enters" from prose into an assertion. The sink being
    empty proves no line was DELIVERED; `calls` proves `lines()` was never even CALLED, which
    still holds if someone later makes the iterator eager.
    """

    def __init__(self, target: ChecksummedFilePayload) -> None:
        """Wrap `target`, forwarding every call and remembering the sequence."""
        self._target = target
        self.calls: list[str] = []

    def subject(self) -> str:
        """Forward `subject`, recording the call."""
        self.calls.append("subject")
        return self._target.subject()

    def checksum_text(self) -> str | None:
        """Forward `checksum_text`, recording the call."""
        self.calls.append("checksum_text")
        return self._target.checksum_text()

    def digest(self) -> str:
        """Forward `digest`, recording the call."""
        self.calls.append("digest")
        return self._target.digest()

    def lines(self) -> Iterator[bytes]:
        """Forward `lines`, recording the call — the call this suite watches for."""
        self.calls.append("lines")
        return self._target.lines()


@dataclass(frozen=True)
class BucketResponse:
    """A vendor answer as `SPEC-001` §5.8 measured it: a status, and a body that may lie."""

    status: int
    body: bytes


# ── The two sides of the guard ────────────────────────────────────────────────────────────


def test_intact_file_is_accepted_and_every_line_reaches_the_sink(tmp_path: Path) -> None:
    """The SILENT side (`cala`): a legitimate file passes whole.

    Without it, "rejects" proves nothing — a guard that refuses everything would pass every
    other test in this file.
    """
    body = _body()
    payload = _publish(tmp_path, body)
    sink = RecordingSink()

    accepted = ingest_verified(ChecksummedFilePayload(payload), sink)

    assert accepted == LINE_COUNT
    assert b"".join(sink.accepted) == body


def test_one_corrupted_byte_is_rejected_and_not_one_line_enters(tmp_path: Path) -> None:
    """`D2.8`, universe = 1 file, 1 byte. Same LENGTH, so only the digest can catch it."""
    body = _body()
    payload = _publish(tmp_path, body)
    sidecar_before = payload.with_name(payload.name + ".CHECKSUM").read_bytes()

    middle = len(body) // 2
    corrupted = body[:middle] + bytes([body[middle] ^ 0x01]) + body[middle + 1 :]
    payload.write_bytes(corrupted)

    assert len(corrupted) == len(body), "the fixture must differ by content, not by size"
    assert corrupted != body
    # The sidecar is untouched: the file changed, the published digest did not — which is the
    # real situation, and the only one in which the digest is evidence.
    assert payload.with_name(payload.name + ".CHECKSUM").read_bytes() == sidecar_before

    sink = RecordingSink()
    with pytest.raises(ChecksumMismatchError):
        ingest_verified(ChecksummedFilePayload(payload), sink)

    assert sink.accepted == []


def test_lines_are_not_even_requested_when_the_digest_does_not_match(tmp_path: Path) -> None:
    """'Before any line enters' is about ORDER, and the order is asserted, not narrated."""
    body = _body()
    payload = _publish(tmp_path, body)
    payload.write_bytes(body[:-3] + b"XYZ")

    spy = CallOrderSpy(ChecksummedFilePayload(payload))
    sink = RecordingSink()
    with pytest.raises(ChecksumMismatchError):
        ingest_verified(spy, sink)

    assert "lines" not in spy.calls, f"the edge reached for the lines: {spy.calls}"
    assert sink.accepted == []


def test_on_the_happy_path_the_digest_is_computed_before_the_first_line(tmp_path: Path) -> None:
    """The same order holds when nothing is wrong — otherwise the guard is a coincidence."""
    payload = _publish(tmp_path, _body())
    spy = CallOrderSpy(ChecksummedFilePayload(payload))
    sink = RecordingSink()

    ingest_verified(spy, sink)

    assert spy.calls.index("digest") < spy.calls.index("lines")
    assert spy.calls.index("checksum_text") < spy.calls.index("lines")


# ── The case that motivated `G1`: a 200 that is not a witness of anything ─────────────────


def test_truncated_body_delivered_as_http_200_is_rejected(tmp_path: Path) -> None:
    """`D2.8`, second half: status 200, body short. The status raises nothing; the digest does.

    Scaled from the measurement in `SPEC-001` §5.8 (**37,7 MB served as 200 against 6,7 GB the
    month before**): the fixture keeps the RATIO and fabricates every byte. An ingestion that
    treats `status == 200` as evidence writes a SHORT SERIES and reports success.
    """
    full = _body(lines=600)
    published = _publish(tmp_path, full)

    kept = max(1, len(full) * MEASURED_TRUNCATED_MONTH_BYTES // MEASURED_FULL_MONTH_BYTES)
    response = BucketResponse(status=200, body=full[:kept])
    published.write_bytes(response.body)

    # Both halves of the trap, stated as assertions: the transport is happy, and the body is
    # short. Anything that reads only the first line lets this file in.
    assert response.status == 200
    assert len(response.body) < len(full)

    sink = RecordingSink()
    with pytest.raises(ChecksumMismatchError):
        ingest_verified(ChecksummedFilePayload(published), sink)

    assert sink.accepted == []


# ── Failing closed: unverifiable is not the same as verified ──────────────────────────────


def test_absent_sidecar_refuses_instead_of_assuming_the_file_is_fine(tmp_path: Path) -> None:
    """'We could not check' and 'we checked and it is fine' are different states."""
    payload = _publish(tmp_path, _body())
    payload.with_name(payload.name + ".CHECKSUM").unlink()

    sink = RecordingSink()
    with pytest.raises(ChecksumMissingError):
        ingest_verified(ChecksummedFilePayload(payload), sink)

    assert sink.accepted == []


def test_sidecar_that_is_a_directory_reads_as_absent(tmp_path: Path) -> None:
    """`is_file` and not `exists`: a directory named like the sidecar attests nothing."""
    payload = _publish(tmp_path, _body())
    sidecar = payload.with_name(payload.name + ".CHECKSUM")
    sidecar.unlink()
    sidecar.mkdir()

    with pytest.raises(ChecksumMissingError):
        ingest_verified(ChecksummedFilePayload(payload), RecordingSink())


def test_malformed_sidecar_refuses_instead_of_guessing(tmp_path: Path) -> None:
    """A sidecar that is not a manifest cannot attest anything, so nothing enters."""
    payload = _publish(tmp_path, _body())
    payload.with_name(payload.name + ".CHECKSUM").write_text("i am not a checksum\n")

    sink = RecordingSink()
    with pytest.raises(MalformedChecksumError):
        ingest_verified(ChecksummedFilePayload(payload), sink)

    assert sink.accepted == []


def test_sidecar_of_another_file_is_refused_even_though_it_is_internally_valid(
    tmp_path: Path,
) -> None:
    """A sidecar copied from a neighbouring object is consistent and proves nothing."""
    body = _body()
    payload = _publish(tmp_path, body)
    payload.with_name(payload.name + ".CHECKSUM").write_text(
        _sidecar_text(body, "BTCUSDT-15m-2026-08-22.csv"), encoding="utf-8"
    )

    sink = RecordingSink()
    with pytest.raises(ChecksumSubjectMismatchError):
        ingest_verified(ChecksummedFilePayload(payload), sink)

    assert sink.accepted == []


# ── The manifest itself (`domain`) ────────────────────────────────────────────────────────


@pytest.mark.parametrize("mode", [" ", "*"])
def test_parse_reads_both_sha256sum_modes(mode: str) -> None:
    """Text mode (two spaces) and binary mode (`*`) are both what `sha256sum` emits."""
    body = _body()
    manifest = ChecksumManifest.parse(_sidecar_text(body, PAYLOAD_NAME, mode=mode))

    assert manifest.digest == hashlib.sha256(body).hexdigest()
    assert manifest.subject == PAYLOAD_NAME


def test_parse_normalises_hex_case_because_case_carries_no_meaning() -> None:
    """Refusing an uppercase digest would reject a legitimate file and buy nothing."""
    digest = hashlib.sha256(b"x").hexdigest()
    manifest = ChecksumManifest.parse(f"{digest.upper()}  {PAYLOAD_NAME}\n")

    assert manifest.digest == digest


@pytest.mark.parametrize(
    "text",
    [
        "",
        "\n  \n",
        f"{'a' * 64}  a.csv\n{'b' * 64}  b.csv\n",
        f"{'a' * 63}  a.csv\n",
        f"{'z' * 64}  a.csv\n",
        f"{'a' * 64} a.csv\n",
        f"{'a' * 64}  \n",
        f"prefixo {'a' * 64}  a.csv\n",
    ],
    ids=[
        "empty",
        "blank-only",
        "two-entries",
        "digest-too-short",
        "digest-not-hex",
        "missing-mode-character",
        "empty-subject",
        "digest-not-at-the-start",
    ],
)
def test_parse_refuses_everything_that_is_not_exactly_one_entry(text: str) -> None:
    """Eight shapes, one verdict.

    `digest-not-at-the-start` is the case that keeps `fullmatch` honest: swap it for `search`
    and only this case fails. It is the one that separates "the sidecar IS a manifest" from
    "the sidecar CONTAINS something that looks like one".
    """
    with pytest.raises(MalformedChecksumError):
        ChecksumManifest.parse(text)


@pytest.mark.parametrize(
    ("digest", "subject"),
    [("a" * 63, "a.csv"), ("A" * 64, "a.csv"), ("a" * 64, "")],
    ids=["short-digest", "uppercase-digest", "empty-subject"],
)
def test_manifest_rejects_an_impossible_pair_at_construction(digest: str, subject: str) -> None:
    """The invariant lives in `__post_init__`, so a hand-built manifest is checked too."""
    with pytest.raises(MalformedChecksumError):
        ChecksumManifest(digest=digest, subject=subject)


def test_verify_stays_silent_when_the_pair_matches() -> None:
    """The silent side of the domain object — the call itself is the assertion.

    `verify` reports by RAISING, so a test that reaches its last line has measured the SILENT
    half. Written down because a suite in which every domain test expects an exception would
    pass just as well against a `verify` that rejects everything.
    """
    digest = hashlib.sha256(b"x").hexdigest()
    manifest = ChecksumManifest(digest=digest, subject=PAYLOAD_NAME)

    manifest.verify(observed_digest=digest.upper(), observed_subject=PAYLOAD_NAME)


# ── Reading the bytes (`infra`) ───────────────────────────────────────────────────────────


def test_digest_of_a_multi_chunk_file_matches_hashlib(tmp_path: Path) -> None:
    """The chunked loop is where a partial read would silently produce a WRONG digest.

    THE FIXTURE WAS INERT UNTIL 2026-08-29, AND THE DOCSTRING SAID OTHERWISE. It promised
    `2 * READ_CHUNK_BYTES + 7` bytes and delivered exactly `2 * READ_CHUNK_BYTES`: the
    material was `READ_CHUNK_BYTES // 8` repetitions of a 16-byte word — exactly 2 MiB — so
    the slice `[: 2 * R + 7]` cut NOTHING and the `+ 7` never existed
    `[MEDIDO 2026-08-29 pelo /review, n=1: len(body) = 2097152, len(body) % R = 0]`. Two full
    reads and a zero remainder, which means the case this test names — THE FINAL PARTIAL
    BLOCK, where a truncated `read()` would hide — was never exercised. The old guard
    (`len(body) > READ_CHUNK_BYTES`) could not catch it: 2 MiB > 1 MiB passes happily.

    So the material grew by one repetition and the assertion below now checks the REMAINDER,
    not the size. A fixture that silently stops exercising its own case is the same family as
    a comment crediting a guard to the wrong term.
    """
    body = (b"0123456789abcdef" * (READ_CHUNK_BYTES // 8 + 1))[: 2 * READ_CHUNK_BYTES + 7]
    payload = tmp_path / "big.bin"
    payload.write_bytes(body)

    assert len(body) == 2 * READ_CHUNK_BYTES + 7
    assert len(body) % READ_CHUNK_BYTES != 0, "the fixture needs a PARTIAL final block"
    assert ChecksummedFilePayload(payload).digest() == hashlib.sha256(body).hexdigest()


def test_sidecar_path_appends_to_the_full_name_including_the_extension(tmp_path: Path) -> None:
    """`with_suffix` would have produced `...-08-23.CHECKSUM` — a file that is not there."""
    payload = ChecksummedFilePayload(tmp_path / "BTCUSDT-15m-2026-08-23.zip")

    assert payload.checksum_path.name == "BTCUSDT-15m-2026-08-23.zip.CHECKSUM"
    assert payload.path.name == "BTCUSDT-15m-2026-08-23.zip"
    assert payload.subject() == "BTCUSDT-15m-2026-08-23.zip"


def test_lines_keeps_the_terminator_and_does_not_swallow_a_tail_without_newline(
    tmp_path: Path,
) -> None:
    """What the sink receives is what is on disk, byte for byte — including a truncated tail."""
    body = b"a,1\nb,2\nc,3"
    payload = _publish(tmp_path, body, subject="tail.csv")
    sink = RecordingSink()

    accepted = ingest_verified(ChecksummedFilePayload(payload), sink)

    assert accepted == 3
    assert sink.accepted == [b"a,1\n", b"b,2\n", b"c,3"]


# ── QA pass of `T-02.4a`: the promises this module WRITES DOWN, now measured ──────────────
#
# WHY THIS SECTION EXISTS, and the measurement that put it here. The suite above reaches
# 100,0% of lines and branches in all three layers, and a coverage number is not a defect
# count: an adversarial mutation bench of 16 mutations, run with bytecode DISABLED
# (`python -B` + `__pycache__` wiped) against the whole suite, left **7 alive**
# [MEDIDO 2026-08-29, n=16 mutacoes, universo `backend/tests/`, baseline 41 passed rc=0].
# Every survivor below was a sentence in a docstring of the production code that no
# assertion held to account. A guarantee that only exists in prose is a comment.
#
# The mutations these tests kill are named next to each one, so the next person can rerun
# the bench and see the count drop instead of taking this paragraph on faith.


class DiscardingSink:
    """A sink that counts and keeps nothing — so the MEASUREMENT is the edge, not the sink.

    `RecordingSink` holds every line, which is fine for the small fixtures above and useless
    for `test_the_whole_edge_stays_memory_bounded_...`: it would dominate the peak and the
    test would measure the test.
    """

    def __init__(self) -> None:
        """Start with nothing counted."""
        self.count = 0

    def accept(self, line: bytes) -> None:
        """Count one line and drop it."""
        self.count += 1


def test_every_refusal_is_reachable_by_one_except_of_the_family_exception() -> None:
    """The `ChecksumRejectedError` docstring makes this promise; nothing was checking it.

    Kills the mutation `class ChecksumMissingError(Exception)` (and the same for the other
    three), which the suite passed with rc=0 before this test existed
    [MEDIDO 2026-08-29: 41 passed com a hierarquia quebrada]. The docstring of the base
    class states the stake itself — *"splitting them into siblings would let a caller catch
    three and forget the fourth"* — so this is the assertion that keeps the sentence true.
    """
    refusals = (
        MalformedChecksumError,
        ChecksumMissingError,
        ChecksumMismatchError,
        ChecksumSubjectMismatchError,
    )

    assert len(refusals) == 4
    for refusal in refusals:
        assert issubclass(refusal, ChecksumRejectedError), refusal.__name__


def test_a_wrong_subject_is_named_as_such_even_when_the_digest_is_also_wrong() -> None:
    """`verify` documents that the SUBJECT is checked FIRST. This is that claim, measured.

    Every test above varies ONE of the two at a time — a foreign sidecar has the right
    digest, a corrupted payload has the right name — so swapping the two `if` blocks left
    the suite green [MEDIDO 2026-08-29: ordem invertida -> 41 passed, rc=0]. Only a payload
    that is wrong on BOTH axes can tell the order apart, and the order is what decides
    whether the log sends someone hunting a truncation that never happened.
    """
    manifest = ChecksumManifest(digest="a" * 64, subject="right.csv")

    with pytest.raises(ChecksumSubjectMismatchError):
        manifest.verify(observed_digest="b" * 64, observed_subject="wrong.csv")


def test_the_sidecar_suffix_is_a_live_seam_and_not_a_decorative_parameter(tmp_path: Path) -> None:
    """`checksum_suffix` was a constructor argument that no test ever passed.

    100% coverage covered the LINE (the default runs on every other test) and nothing
    asserted the parameter did anything: hardcoding `CHECKSUM_SUFFIX` in the body left the
    suite green [MEDIDO 2026-08-29: 41 passed, rc=0]. Asserted end to end, not just on the
    path property, so the seam is proven to reach the actual read.
    """
    body = _body()
    payload = tmp_path / "alt.csv"
    payload.write_bytes(body)
    (tmp_path / "alt.csv.sha256").write_text(_sidecar_text(body, "alt.csv"), encoding="utf-8")
    sink = RecordingSink()

    accepted = ingest_verified(ChecksummedFilePayload(payload, ".sha256"), sink)

    assert ChecksummedFilePayload(payload, ".sha256").checksum_path.name == "alt.csv.sha256"
    assert accepted == LINE_COUNT
    assert b"".join(sink.accepted) == body


def test_an_accepted_ingestion_records_subject_digest_and_line_count(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """The audit trail of what got IN, asserted — deleting the `logger.info` was invisible.

    A refusal is loud by construction: it raises. An acceptance is only ever visible in this
    record, and it is the record that answers *which* bytes were declared good on the day a
    series turns out short. Removing the call left the suite green
    [MEDIDO 2026-08-29: 41 passed, rc=0].
    """
    body = _body()
    payload = _publish(tmp_path, body)

    with caplog.at_level(logging.INFO):
        ingest_verified(ChecksummedFilePayload(payload), DiscardingSink())

    accepted_records = [r for r in caplog.records if r.message == "ingestion_verified"]
    assert len(accepted_records) == 1
    # `record.__dict__` and not `record.subject`: the `extra=` fields are attached at
    # runtime, so `LogRecord` has no static attribute to type-check against. Reading the
    # mapping asserts the same value and keeps `mypy --strict` honest instead of silenced.
    fields = accepted_records[0].__dict__
    assert fields["subject"] == PAYLOAD_NAME
    assert fields["sha256"] == hashlib.sha256(body).hexdigest()
    assert fields["lines"] == LINE_COUNT


def test_an_absent_sidecar_is_recorded_and_not_only_returned_as_none(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """A file refused for lack of a witness must leave a trace naming the file.

    `checksum_text` returns `None` and warns; the `None` is asserted by the refusal tests
    above, the WARNING was asserted by nothing, so deleting it left the suite green
    [MEDIDO 2026-08-29: 41 passed, rc=0]. A silent refusal at the edge is a series that
    stops arriving and nobody knows why.
    """
    payload = _publish(tmp_path, _body())
    payload.with_name(payload.name + ".CHECKSUM").unlink()

    with caplog.at_level(logging.WARNING), pytest.raises(ChecksumMissingError):
        ingest_verified(ChecksummedFilePayload(payload), DiscardingSink())

    warnings = [r for r in caplog.records if r.message == "checksum_sidecar_absent"]
    assert len(warnings) == 1
    assert warnings[0].__dict__["subject"] == PAYLOAD_NAME
    assert warnings[0].levelno == logging.WARNING


# ── Axis: "before any line enters" has to survive a file too big to hold ──────────────────


def test_lines_does_not_touch_the_file_until_the_first_item_is_pulled(tmp_path: Path) -> None:
    """`lines()` claims the body does not run until the first `next()`. Proven destructively.

    The file is UNLINKED between the call and the first `next()`. On Linux an already-open
    handle survives the unlink, so an eager `lines()` would still yield the content; a lazy
    one opens the file only at the first pull and cannot find it. The exception IS the proof
    — and it is what makes `assert "lines" not in spy.calls` above a statement about the
    file and not merely about a method name.
    """
    payload = tmp_path / "lazy.csv"
    payload.write_bytes(b"a,1\nb,2\n")

    stream = ChecksummedFilePayload(payload).lines()
    payload.unlink()

    with pytest.raises(FileNotFoundError):
        next(stream)


def test_the_whole_edge_stays_memory_bounded_on_a_file_larger_than_a_chunk(
    tmp_path: Path,
) -> None:
    """Two passes over 6,7 GB are only affordable if NEITHER pass holds the object.

    The contract of `T-02.4a` forces a whole-file digest BEFORE the first line, and the
    cheap way to get one is to read the file into memory — which passes every ordering test
    in this suite and dies in production on the objects `SPEC-001` §5.8 measured
    [MEDIDO: 6,7 GB]. So the bound is asserted, not assumed: peak allocation is compared
    against a constant number of CHUNKS, never against a fraction of the file, because a
    fraction would still grow with the file.

    Universe: 1 file of exactly 8 chunks; measured peak 2,01 chunks
    [MEDIDO 2026-08-29, `tracemalloc`, n=1]. The 3-chunk ceiling leaves room for one live
    chunk plus one being replaced, and still fails any implementation that buffers the file.
    """
    line = b"1690000000000,1.5,2.25,aaaaaaaaaaaaaaaa\n"
    body = line * (8 * READ_CHUNK_BYTES // len(line))
    payload = _publish(tmp_path, body, subject="big.csv")
    sink = DiscardingSink()

    tracemalloc.start()
    try:
        accepted = ingest_verified(ChecksummedFilePayload(payload), sink)
        _current, peak = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()

    assert len(body) > 7 * READ_CHUNK_BYTES
    assert accepted == len(body) // len(line)
    assert peak < 3 * READ_CHUNK_BYTES, (
        f"the edge held {peak} bytes for a {len(body)}-byte file: it is buffering, "
        f"and the ceiling is {3 * READ_CHUNK_BYTES}"
    )


# ── Axis: the sidecar is a PARSER, and every parser has a border ──────────────────────────


def test_a_sidecar_published_with_crlf_line_endings_is_still_read(tmp_path: Path) -> None:
    """A refusal here would reject a LEGITIMATE file, which costs as much as accepting a bad one.

    `.CHECKSUM` files travel through Windows tooling and object stores that normalise
    nothing. This is the SILENT side (`cala`) of the parser border: the suite above only asserts
    the parser REFUSING, and a parser that refuses everything passes all of those.
    """
    body = _body()
    payload = tmp_path / PAYLOAD_NAME
    payload.write_bytes(body)
    sidecar = f"{hashlib.sha256(body).hexdigest()}  {PAYLOAD_NAME}\r\n"
    payload.with_name(payload.name + ".CHECKSUM").write_bytes(sidecar.encode("ascii"))
    sink = RecordingSink()

    accepted = ingest_verified(ChecksummedFilePayload(payload), sink)

    assert accepted == LINE_COUNT
    assert b"".join(sink.accepted) == body


@pytest.mark.parametrize(
    "algorithm",
    ["md5", "sha1", "sha384", "sha512"],
)
def test_a_digest_of_another_algorithm_is_refused_instead_of_compared(algorithm: str) -> None:
    """A 32/40/96/128-hex digest is not a sha256, and comparing it would always mismatch.

    Refusing as MALFORMED and not as MISMATCH is the difference between *"this sidecar is
    not the format we verify"* and *"this file is corrupt"* — the second sends someone
    re-downloading a file that was never broken.
    """
    body = _body()
    digest = hashlib.new(algorithm, body).hexdigest()

    assert len(digest) != SHA256_HEX_LENGTH
    with pytest.raises(MalformedChecksumError):
        ChecksumManifest.parse(f"{digest}  {PAYLOAD_NAME}\n")


@pytest.mark.parametrize(
    "text",
    [
        "SHA256 (BTCUSDT-15m-2026-08-23.csv) = {d}\n",
        "  {d}  BTCUSDT-15m-2026-08-23.csv\n",
        "{d}\tBTCUSDT-15m-2026-08-23.csv\n",
        "{d}   BTCUSDT-15m-2026-08-23.csv\n",
    ],
    ids=[
        "bsd-style-tagged-output",
        "leading-whitespace-before-the-digest",
        "tab-instead-of-the-two-spaces",
        "three-spaces-so-the-subject-would-start-with-a-space",
    ],
)
def test_sidecar_shapes_that_are_not_the_gnu_format_are_refused(text: str) -> None:
    """Four more borders of the same parser, all of them fail-closed.

    None of these is exotic: `bsd-style-tagged-output` is what `shasum -a 256 --tag` and the
    BSD `sha256` emit, and it is a REAL sidecar for a real file — refusing it is a decision
    (this edge verifies the GNU form the vendor publishes and nothing else), not an accident.
    """
    digest = hashlib.sha256(_body()).hexdigest()

    with pytest.raises(MalformedChecksumError):
        ChecksumManifest.parse(text.format(d=digest))


# ── The gap this pass FOUND: a refusal that escapes the family ────────────────────────────


def test_a_payload_file_that_vanished_delivers_nothing(tmp_path: Path) -> None:
    """Sidecar present, payload gone: the edge must not deliver, and it does not.

    It raises `FileNotFoundError`, which is NOT a `ChecksumRejectedError` — recorded here as
    the behaviour that exists, not as the behaviour that is right. Arguably correct (a path
    that does not exist is a caller bug, not a corrupt file), and left pinned so that
    changing it becomes a decision instead of a drift.
    """
    sidecar_body = _body()
    payload = tmp_path / PAYLOAD_NAME
    payload.with_name(payload.name + ".CHECKSUM").write_text(
        _sidecar_text(sidecar_body, PAYLOAD_NAME), encoding="utf-8"
    )
    sink = RecordingSink()

    with pytest.raises(FileNotFoundError):
        ingest_verified(ChecksummedFilePayload(payload), sink)

    assert sink.accepted == []


def test_a_sidecar_that_is_not_utf8_is_refused_as_a_malformed_manifest(tmp_path: Path) -> None:
    """The most literally unreadable sidecar there is, and the family now covers it.

    DEFECT `T-02.4a/QA-1`, found by `/qa` and by `/review` independently, FIXED 2026-08-29.
    A truncated payload is the premise of this whole task; the sidecar travels the same wire
    and corrupts the same way. `checksum_text()` called `read_text(encoding="utf-8")` with no
    guard, so a single stray byte raised `UnicodeDecodeError` — a `ValueError`, OUTSIDE
    `ChecksumRejectedError`. A caller written against the documented contract
    (`except ChecksumRejectedError: skip_one_file()`) died on the whole batch instead of
    skipping one object, and the operator read a stack trace where the module promised a
    verdict.

    The security was never the problem — the exception propagated and nothing entered the
    sink. What was false was the PUBLISHED CONTRACT, which is the same defect as crediting a
    guard to a term that does not give it.

    This test arrived from `/qa` as `xfail(strict=True)`; the marker came off with the fix,
    which is what `strict=True` exists to force.
    """
    body = _body()
    payload = _publish(tmp_path, body)
    payload.with_name(payload.name + ".CHECKSUM").write_bytes(
        b"\xff\xfe" + _sidecar_text(body, PAYLOAD_NAME).encode("ascii")
    )
    sink = RecordingSink()

    with pytest.raises(ChecksumRejectedError):
        ingest_verified(ChecksummedFilePayload(payload), sink)

    assert sink.accepted == []


def test_the_subject_is_the_whole_remainder_of_the_line_and_never_its_first_character() -> None:
    r"""The assertion that separates `fullmatch` from `.match()`, stated on its own.

    `(?P<subject>\S.*?)` is LAZY. Under `.match()` — which anchors only the start — it stops
    at the first character it can and `\s*` happily matches nothing, so the manifest would
    attest `'B'` and compare that against the real file name. Under `fullmatch` the group is
    forced to swallow the rest of the line, spaces included, which is also the right reading
    of the GNU format: a file name may contain spaces.

    So a sidecar whose subject carries a stray trailing token PARSES, and is then refused
    where the refusal belongs — at `verify`, as a SUBJECT mismatch, not as a corrupt file.
    This is the same distinction `test_a_wrong_subject_is_named_as_such...` guards.
    """
    digest = hashlib.sha256(_body()).hexdigest()
    line = f"{digest}  {PAYLOAD_NAME} extra-token-that-is-not-the-name\n"

    manifest = ChecksumManifest.parse(line)

    assert manifest.subject == f"{PAYLOAD_NAME} extra-token-that-is-not-the-name"
    assert manifest.subject != PAYLOAD_NAME[:1]
    with pytest.raises(ChecksumSubjectMismatchError):
        manifest.verify(observed_digest=digest, observed_subject=PAYLOAD_NAME)


# ── QA re-check of the fix (2026-08-29): the two sentences the fix added, measured ─────────


class FailingMidStreamPayload:
    """A payload whose digest matches and whose stream dies after `break_after` lines.

    A real mid-stream `OSError` (a read error on the device) cannot be provoked from a test
    on a `tmp_path` file, and faking it at the PORT is the honest instrument anyway: the
    sentence under test lives in the docstring of `ingest_verified`, and it is about what the
    SINK holds when the port raises — not about how the device failed.
    """

    def __init__(self, body: bytes, break_after: int) -> None:
        """Bind the body the digest is taken over and how many lines survive."""
        self._body = body
        self._break_after = break_after

    def subject(self) -> str:
        """Return the name the manifest attests."""
        return PAYLOAD_NAME

    def checksum_text(self) -> str | None:
        """Return a sidecar that MATCHES, so the failure is reached after verification."""
        return _sidecar_text(self._body, PAYLOAD_NAME)

    def digest(self) -> str:
        """Return the digest the manifest attests — this payload passes verification."""
        return hashlib.sha256(self._body).hexdigest()

    def lines(self) -> Iterator[bytes]:
        """Yield `break_after` lines and then fail the way a device does."""
        yield from self._body.splitlines(keepends=True)[: self._break_after]
        raise OSError(5, "Input/output error")


def test_an_oserror_while_opening_leaves_the_sink_empty(tmp_path: Path) -> None:
    """First half of the asymmetry the `Raises:` block claims: opening fails, nothing entered.

    This is the COMMON case — a vanished path, a permission — and it fires before any line
    exists, so the sink is genuinely empty. Asserted separately from the second half because
    they are different statements, and the first draft of that docstring stated only this one
    and generalised it to all of `OSError`.
    """
    body = _body()
    payload = tmp_path / PAYLOAD_NAME
    payload.with_name(payload.name + ".CHECKSUM").write_text(
        _sidecar_text(body, PAYLOAD_NAME), encoding="utf-8"
    )
    sink = RecordingSink()

    with pytest.raises(OSError):
        ingest_verified(ChecksummedFilePayload(payload), sink)

    assert sink.accepted == []


def test_an_oserror_mid_stream_leaves_the_lines_already_accepted_in_the_sink() -> None:
    """Second half, and it is the one worth writing down: HALF THE FILE ENTERED.

    The zero-lines guarantee belongs to the `ChecksumRejectedError` family and to it alone.
    An `OSError` raised after the digest already matched has no such guarantee, and saying
    "nothing was written to `sink`" about all of `OSError` would have been false — measured
    here rather than trusted, because it is exactly the kind of sentence that reads true and
    is not.

    A caller that retries this object must therefore treat the sink as DIRTY. That is the
    operational consequence, and it is why the asymmetry is documented instead of smoothed.
    """
    body = _body()
    sink = RecordingSink()

    with pytest.raises(OSError):
        ingest_verified(FailingMidStreamPayload(body, break_after=3), sink)

    assert sink.accepted == body.splitlines(keepends=True)[:3]
    assert len(sink.accepted) == 3, "the guarantee that does not hold here is 'zero lines'"


def test_the_utf8_guard_fires_on_the_bytes_and_not_on_the_shape_of_the_text(
    tmp_path: Path,
) -> None:
    """The guard must refuse because the sidecar is not decodable, not because it looks odd.

    THE CASE THAT SEPARATES THEM, and the existing test could not: with the stray byte at
    position 0 the digest is no longer at the start, so the FORMAT check refuses too and the
    verdict comes out the same for the wrong reason. Here the bad byte sits INSIDE the
    subject name, where a lenient read would produce a perfectly well-formed manifest
    attesting a name with `U+FFFD` in it — and the edge would then report a SUBJECT
    MISMATCH, telling the operator *"this manifest was never about this file"* when the truth
    is *"this sidecar is unreadable"*. That is precisely the misdiagnosis `verify` orders its
    two checks to avoid.

    `__cause__` is the discriminator, and it is what makes this test bite: the chain exists
    only when a real `UnicodeDecodeError` was caught and re-raised `from exc`. Swapping the
    guard for `errors="replace"` raises no `UnicodeDecodeError` at all, so the chain is empty
    — a mutation that survived every other test in this file
    [MEDIDO 2026-08-29, bancada n=25 com bytecode desligado: `errors="replace"` -> 60 passed,
    rc=0, 0 reprovam].
    """
    body = _body()
    payload = tmp_path / PAYLOAD_NAME
    payload.write_bytes(body)
    payload.with_name(payload.name + ".CHECKSUM").write_bytes(
        hashlib.sha256(body).hexdigest().encode("ascii") + b"  BTCUSDT-15m\xff-2026-08-23.csv\n"
    )
    sink = RecordingSink()

    with pytest.raises(MalformedChecksumError) as refusal:
        ingest_verified(ChecksummedFilePayload(payload), sink)

    assert isinstance(refusal.value.__cause__, UnicodeDecodeError), (
        f"refused, but not because of the bytes: __cause__ is {refusal.value.__cause__!r}"
    )
    assert sink.accepted == []
