"""The single writer: the ONE code path with authority to persist a `SeriesRow`.

`ADR-002/D5`: every write path converges on a single writer process precisely so the
read-before-write logic `CA-F3-12`/`D7.16` requires has exactly one place to live, instead of
being reimplemented (or forgotten) at each of the five storage candidates. This module is that
place. `run_single_writer.py`, in this same package, is the only production caller — see
`tests/sentimento/test_single_writer_call_sites.py` for the structural proof.
"""

from __future__ import annotations

import logging
from enum import Enum
from typing import Protocol

from src.modules.sentimento.domain.provenance import SeriesRow, modeled_write_overwrites_observed
from src.modules.sentimento.domain.repeated_fact import (
    RecordedObservation,
    repeats_predecessor_fact,
)

logger = logging.getLogger(__name__)


class ObservedLookup(Protocol):
    """Read port: what the store already holds for this candidate's bucket — two questions.

    `observed_already_present` is keyed on `(series_key_id, symbol, source, bucket_end)` —
    never `observed_at`, because the question it answers is "does the BUCKET already have a
    live capture", not "does this exact observation instant already exist".

    `immediate_predecessor` (`T-06.4`) returns the stored row of the same bucket with the
    greatest `observed_at` STRICTLY BELOW `row.observed_at`, or `None`. Strictly below is what
    keeps a redelivery of the very same row (same `observed_at`, `D2.4`) out of the answer, so
    the redelivery still reaches the sink's `ON CONFLICT DO NOTHING` instead of being judged a
    repeat of itself. Which of `ADR-002`'s five storage candidates backs either answer is
    deliberately not this module's concern.
    """

    def observed_already_present(self, row: SeriesRow) -> bool: ...  # noqa: D102

    def immediate_predecessor(self, row: SeriesRow) -> RecordedObservation | None: ...  # noqa: D102


class SeriesSink(Protocol):
    """Write port. `accept` is reached ONLY for a row `write_series_row` has cleared."""

    def accept(self, row: SeriesRow) -> None: ...  # noqa: D102


class WriteOutcome(Enum):
    """What happened to one candidate row — every member is TERMINAL and DURABLE.

    `REJECTED_MODELED_OVER_OBSERVED` is not an error: a backfill arriving after a live capture
    already claimed its bucket is an ordinary race between two legitimate producers, the same
    family of outcome `content_deduping_worker.py` logs for a duplicate rather than raising.

    `SKIPPED_IDENTICAL_FACT` (`T-06.4`) is not an error either: the row repeats the fact its
    immediate predecessor already recorded, with `available_at` no earlier, so the store
    already answers every `as_of` the row could have answered (`T-06.4-prova.md` §1). It is
    NOT a persisted row, and `ADR-035/D1` keeps `n_written` meaning persisted rows: the loop
    counts it apart (`n_skipped_identical`), never as `ACCEPTED` (`T-06.4-prova.md` §2).
    """

    ACCEPTED = "ACCEPTED"
    REJECTED_MODELED_OVER_OBSERVED = "REJECTED_MODELED_OVER_OBSERVED"
    SKIPPED_IDENTICAL_FACT = "SKIPPED_IDENTICAL_FACT"


def write_series_row(row: SeriesRow, *, lookup: ObservedLookup, sink: SeriesSink) -> WriteOutcome:
    """Apply `D7.16`, then `T-06.4`, then write `row` to `sink` — or stop at the first refusal.

    Both lookups are called BEFORE `sink.accept`, and only their answers decide which outcome
    happens — this is the "ler antes de escrever" `ADR-002/D5` names, made literal in the order
    of these lines rather than left as a claim in the docstring. `D7.16` is checked first: a
    MODELED row over an OBSERVED bucket is refused for that reason even when it also repeats.
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
    if repeats_predecessor_fact(row, lookup.immediate_predecessor(row)):
        # DEBUG, not INFO: a re-poll repeats ~33x per liquidation bucket (`T-06.3-desenho.md`
        # §3.1), and the batch log already carries `n_skipped_identical`.
        logger.debug(
            "series_write_skipped",
            extra={
                "series_key_id": row.series_key_id,
                "symbol": row.symbol,
                "source": row.source,
                "bucket_end": row.bucket_end,
                "reason": "identical_fact",
            },
        )
        return WriteOutcome.SKIPPED_IDENTICAL_FACT
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
