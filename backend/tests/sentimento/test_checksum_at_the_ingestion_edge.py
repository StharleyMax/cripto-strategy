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
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import pytest

from src.modules.sentimento.domain.checksum_manifest import (
    ChecksumManifest,
    ChecksumMismatchError,
    ChecksumMissingError,
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
    """The `cala` side: a legitimate file passes whole. Without it, "rejects" proves nothing."""
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
    payload.with_name(payload.name + ".CHECKSUM").write_text("nao sou um checksum\n")

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

    `verify` reports by RAISING, so a test that reaches its last line has measured the `cala`
    half. Written down because a suite in which every domain test expects an exception would
    pass just as well against a `verify` that rejects everything.
    """
    digest = hashlib.sha256(b"x").hexdigest()
    manifest = ChecksumManifest(digest=digest, subject=PAYLOAD_NAME)

    manifest.verify(observed_digest=digest.upper(), observed_subject=PAYLOAD_NAME)


# ── Reading the bytes (`infra`) ───────────────────────────────────────────────────────────


def test_digest_of_a_multi_chunk_file_matches_hashlib(tmp_path: Path) -> None:
    """The chunked loop is where a partial read would silently produce a WRONG digest.

    A file of `2 * READ_CHUNK_BYTES + 7` bytes forces at least three reads, so a loop that
    hashed only the first block would disagree with `hashlib` over the whole content.
    """
    body = (b"0123456789abcdef" * (READ_CHUNK_BYTES // 8))[: 2 * READ_CHUNK_BYTES + 7]
    payload = tmp_path / "big.bin"
    payload.write_bytes(body)

    assert len(body) > READ_CHUNK_BYTES
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
