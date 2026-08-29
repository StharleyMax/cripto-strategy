r"""The seam between `curl -sI` (network, cron) and the offline classification of §5.8."""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Final

from src.modules.sentimento.domain.dump_window import DumpPartition
from src.modules.sentimento.domain.retention_probe import ProbeOutcome

logger = logging.getLogger(__name__)


# ── POR QUE EXISTE UM ARQUIVO NO MEIO, EM VEZ DE UMA CHAMADA DIRETA ───────────────────────────
#
# `SPEC-001` §5.8 mandates a MONTHLY `curl -sI`. Monthly means cron, and cron means the probe does
# not run inside the process that drains the queue. Putting the socket behind a file has three
# consequences, and all three are the point:
#
#   1. **The suite stays offline.** `backend/scripts/test.sh` states *"ZERO REDE"* and enforces it
#      by amputating `socket` through a `sitecustomize.py` that reaches the subprocess driver too.
#      A module that dialled out could not be tested by this repository at all.
#   2. **The observation is DATED and kept.** §5.8's whole value is discovering the loss *"em um
#      mes em vez de em dois anos"*, which requires comparing this month's probe against an older
#      one. A probe whose result lives only in a return value compares against nothing.
#   3. **The classification is falsifiable without a bucket.** Every case in `ADR-014`'s measured
#      table — including the `200`-then-`404` boundary — is reproducible as three lines of text.
#
# ── O FORMATO, E O COMANDO LITERAL QUE O PRODUZ ───────────────────────────────────────────────
#
# One JSON object per line: `{"object_key": ..., "status": ..., "content_length": ...}`.
# `content_length` is `null` on a `404`. The operator's monthly job is:
#
#     while read -r KEY; do
#       HEAD="$(curl -sI "https://data.binance.vision/$KEY")"
#       printf '%s\n' "$HEAD" | ...   # -> parse_head_response, below
#     done < targets.txt
#
# `parse_head_response` is the parser for the raw `curl -sI` text, so the shell half never has to
# grep a header itself. **Nenhuma chave, nenhum segredo**: this bucket is public and the probe
# carries no credential — `$COINALYZE_API_KEY` belongs to a different source entirely.
#
# ── A CAUDA TRUNCADA E TOLERADA; A LINHA COMPLETA ILEGIVEL NAO E ──────────────────────────────
#
# Same discipline as `JsonlCheckpoint`, and for the same reason: a job killed mid-write leaves a
# line with no newline, which is a known and harmless state, while a COMPLETE line that cannot be
# read means something wrote garbage and the file can no longer be trusted to say what was probed.

_STATUS_LINE = re.compile(r"^HTTP/[\d.]+\s+(?P<status>\d{3})\b", re.IGNORECASE | re.MULTILINE)
_CONTENT_LENGTH = re.compile(
    r"^content-length:\s*(?P<length>\d+)\s*$", re.IGNORECASE | re.MULTILINE
)

REQUIRED_FIELDS: Final[tuple[str, str]] = ("object_key", "status")


class CorruptedProbeLogError(Exception):
    """A COMPLETE line of the probe log that cannot be read as an observation."""


class UnreadableHeadResponseError(Exception):
    """`curl -sI` output with no status line — an empty body or a connection that never opened."""


def parse_head_response(text: str) -> tuple[int, int | None]:
    """Return `(status, content_length)` from raw `curl -sI` output.

    THE **LAST** STATUS LINE WINS, and that is not a detail: `curl -sI` follows nothing by
    default but a bucket in front of a CDN answers `HTTP/1.1 307` and then `HTTP/1.1 200`, and
    reading the FIRST status would classify a present object as a redirect and a `404` behind a
    redirect as success. Same for `content-length` — the one that matters is the one attached to
    the final response, and an early `content-length: 0` from a redirect would read as an empty
    object.
    """
    statuses = _STATUS_LINE.findall(text)
    if not statuses:
        raise UnreadableHeadResponseError(
            f"no HTTP status line in the response ({len(text)} B): a `curl -sI` that never "
            f"reached the host reports nothing, and nothing is not a `404`"
        )
    lengths = _CONTENT_LENGTH.findall(text)
    return int(statuses[-1]), int(lengths[-1]) if lengths else None


def read_probe_log(path: Path) -> tuple[dict[str, object], ...]:
    """Read the JSONL probe log, discarding a tail with no newline and refusing corruption.

    Returns raw records rather than `ProbeOutcome` because a record names a key as a STRING and
    only the caller knows which enumerated window that key belongs to. Resolving a name into a
    `DumpPartition` here would mean re-deriving the window from the file, and then the file — not
    the depth parameter — would be deciding what the work is.
    """
    if not path.exists():
        return ()
    raw = path.read_bytes()
    if not raw:
        return ()
    lines = raw.split(b"\n")
    tail = lines.pop()
    if tail:
        logger.warning("probe_log_truncated_tail", extra={"discarded_bytes": len(tail)})
    records: list[dict[str, object]] = []
    for number, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        records.append(_parse_record(line, number, path))
    return tuple(records)


def _parse_record(line: bytes, number: int, path: Path) -> dict[str, object]:
    """Read one complete line as an observation, or raise naming the line and the file."""
    try:
        payload = json.loads(line)
    except json.JSONDecodeError as exc:
        raise CorruptedProbeLogError(f"line {number} is unreadable in {path}") from exc
    if not isinstance(payload, dict):
        raise CorruptedProbeLogError(
            f"line {number} of {path} is a {type(payload).__name__}, not an object"
        )
    missing = [field for field in REQUIRED_FIELDS if field not in payload]
    if missing:
        raise CorruptedProbeLogError(f"line {number} of {path} is missing {missing}")
    return payload


def outcomes_for(
    partitions: tuple[DumpPartition, ...],
    records: tuple[dict[str, object], ...],
) -> tuple[ProbeOutcome, ...]:
    """Pair each partition with its observation, in the order the partitions were enumerated.

    ORDER IS PRESERVED FROM THE PARTITIONS AND NEVER FROM THE FILE, because `classify` decides
    `SUSPECT_LAST_BEFORE_ABSENT` by looking at the NEXT element. A log written by a shell loop
    can arrive in any order, and trusting it would make the neighbour rule answer confidently
    about the wrong neighbour.

    A partition with no observation is SKIPPED rather than defaulted. Defaulting to `200` would
    invent evidence of presence, and defaulting to `404` would invent evidence of loss; the
    honest report of "not probed" is its absence from the result.
    """
    by_key = {str(record["object_key"]): record for record in records}
    outcomes: list[ProbeOutcome] = []
    for partition in partitions:
        record = by_key.get(partition.object_key)
        if record is None:
            continue
        length = record.get("content_length")
        outcomes.append(
            ProbeOutcome(
                partition=partition,
                status=int(str(record["status"])),
                content_length=int(str(length)) if length is not None else None,
            )
        )
    return tuple(outcomes)
