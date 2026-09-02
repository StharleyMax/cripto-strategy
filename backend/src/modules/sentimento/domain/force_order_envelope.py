"""Envelope for one raw `!forceOrder@arr` message — the columns SPEC-001 requires ON output."""
#
# `SPEC-001` §5.10 registers a doc contradiction that no measurement resolves: the USDⓈ-M page
# says `!forceOrder@arr` pushes the `latest` order of each 1000 ms window; the COIN-M page and
# the changelog say `largest`. §8.5-A4 (the architect's "concordo e acrescento") turns that into
# a requirement: every statistic built over this series carries the label ON THE OUTPUT ITSELF,
# not only in a payload column or a comment — "rótulo em coluna de payload não chega ao
# consumidor de máquina; e é consumidor de máquina que calcula percentil". This module is where
# that requirement becomes a value instead of a sentence: the label rides on every envelope this
# collector writes.

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

# `SPEC-001` §5.10, literal contradiction between the two Binance doc pages. Fixed here as the
# label every machine consumer of this series must read before computing a percentile.
SUBSAMPLING_SEMANTICS_LABEL: Final[str] = "NAO_RESOLVIDA (latest|largest)"

# The date the two doc pages (USDⓈ-M and COIN-M) were read and found to disagree (`SPEC-001`
# §5.10). Fixed here as the snapshot that anchors the recorded contradiction — re-reading the
# doc is a command, never an import change.
DOC_SNAPSHOT_DATE: Final[str] = "2026-08-29"

STREAM_NAME: Final[str] = "!forceOrder@arr"

# THE ORDER IS PART OF THE CONTRACT, same reasoning as `INGEST_HEALTH_RUN_COLUMNS`
# (`ingest_record.py`): a machine consumer reads by position or by key, and reordering this
# tuple changes what it reads without a single type check noticing.
FORCE_ORDER_ENVELOPE_COLUMNS: Final[tuple[str, ...]] = (
    "received_at",
    "stream",
    "doc_snapshot_date",
    "subsampling_semantics_label",
    "raw",
)


@dataclass(frozen=True)
class ForceOrderEnvelope:
    """One raw `!forceOrder@arr` message, wrapped with the provenance `SPEC-001` §5.10 requires.

    `raw` is the message text EXACTLY as received — "grava cru, zero normalização" is the DoD
    line this dataclass exists to honor. Nothing here parses a single field of the liquidation
    order itself; the envelope only adds provenance AROUND the untouched bytes.
    """

    raw: str
    received_at: str
    stream: str = STREAM_NAME
    doc_snapshot_date: str = DOC_SNAPSHOT_DATE
    subsampling_semantics_label: str = SUBSAMPLING_SEMANTICS_LABEL

    def as_dict(self) -> dict[str, object]:
        """Project onto `FORCE_ORDER_ENVELOPE_COLUMNS`, in the fixed order."""
        values: dict[str, object] = {
            "received_at": self.received_at,
            "stream": self.stream,
            "doc_snapshot_date": self.doc_snapshot_date,
            "subsampling_semantics_label": self.subsampling_semantics_label,
            "raw": self.raw,
        }
        return {column: values[column] for column in FORCE_ORDER_ENVELOPE_COLUMNS}
