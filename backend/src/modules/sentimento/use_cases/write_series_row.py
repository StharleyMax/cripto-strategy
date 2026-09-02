"""The escritor único: the ONE code path with authority to persist a `SeriesRow`.

`ADR-002/D5`: every write path converges on a single writer process precisely so the
read-before-write logic `CA-F3-12`/`D7.16` requires has exactly one place to live, instead of
being reimplemented (or forgotten) at each of the five storage candidates. This module is that
place. `run_single_writer.py`, in this same package, is the only production caller — see
`tests/sentimento/test_write_series_row_call_sites.py` for the structural proof.
"""

from __future__ import annotations

import logging
from enum import Enum
from typing import Protocol

from src.modules.sentimento.domain.provenance import SeriesRow, modeled_write_overwrites_observed

logger = logging.getLogger(__name__)


class ObservedLookup(Protocol):
    """Read port: whether an OBSERVED point already landed for this candidate's bucket.

    The answer is keyed on `(series_key_id, symbol, source, bucket_end)` — never `observed_at`,
    because the question this port answers is "does the BUCKET already have a live capture",
    not "does this exact observation instant already exist". Which of `ADR-002`'s five storage
    candidates backs the answer is deliberately not this module's concern.
    """

    def observed_already_present(self, row: SeriesRow) -> bool: ...  # noqa: D102


class SeriesSink(Protocol):
    """Write port. `accept` is reached ONLY for a row `write_series_row` has cleared."""

    def accept(self, row: SeriesRow) -> None: ...  # noqa: D102


class WriteOutcome(Enum):
    """What happened to one candidate row — both members are TERMINAL and DURABLE.

    `REJECTED_MODELED_OVER_OBSERVED` is not an error: a backfill arriving after a live capture
    already claimed its bucket is an ordinary race between two legitimate producers, the same
    family of outcome `content_deduping_worker.py` logs for a duplicate rather than raising.
    """

    ACCEPTED = "ACCEPTED"
    REJECTED_MODELED_OVER_OBSERVED = "REJECTED_MODELED_OVER_OBSERVED"


def write_series_row(row: SeriesRow, *, lookup: ObservedLookup, sink: SeriesSink) -> WriteOutcome:
    """Apply `D7.16`, then either write `row` to `sink` or refuse it — never both, never neither.

    `lookup.observed_already_present` is called BEFORE `sink.accept`, and only its answer decides
    which of the two happens — this is the "ler antes de escrever" `ADR-002/D5` names, made
    literal in the order of these two lines rather than left as a claim in the docstring.
    """
    if modeled_write_overwrites_observed(
        row.provenance, observed_already_present=lookup.observed_already_present(row)
    ):
        logger.info(
            "series_write_rejected",
            extra={
                "series_key_id": row.series_key_id,
                "symbol": row.symbol,
                "source": row.source,
                "bucket_end": row.bucket_end,
                "reason": "modeled_over_observed",
            },
        )
        return WriteOutcome.REJECTED_MODELED_OVER_OBSERVED
    sink.accept(row)
    logger.info(
        "series_write_accepted",
        extra={
            "series_key_id": row.series_key_id,
            "symbol": row.symbol,
            "source": row.source,
            "bucket_end": row.bucket_end,
            "provenance": row.provenance.value,
        },
    )
    return WriteOutcome.ACCEPTED
