"""Whether a candidate row only REPEATS the fact its immediate predecessor already recorded.

`T-06.4` (`paineis-de-fluxo`, phase `06`): the single writer stops persisting an observation
that says nothing the store does not already say. The proof that dropping such a row leaves
every `as_of` answer unchanged is `docs/context/paineis-de-fluxo/handoff/T-06.4-prova.md` §1
(the dominance lemma over `domain/as_of_accessor.py`'s admission and `argmin` order); this
module is the predicate that proof licenses, and NOTHING wider.

THE THREE TERMS, AND WHAT EACH ONE IS FOR (`T-06.4-prova.md` §1.2, §1.5):

1. **same fact** — every column of `FACT_COLUMNS` equal, `None` equal to `None` (the
   `IS NOT DISTINCT FROM` of the SQL side). `value_raw` is IN the fact: a value revision is
   never a repeat, so it is always written (`§1.3`). The three observer columns are in it too:
   a second observer of the same value is corroboration, not repetition (`§1.5`).
2. **`predecessor.available_at <= candidate.available_at`** — without it the claim is FALSE:
   `e = (observed_at 10, available_at 100)`, `r = (20, 30)`, same value; at `K = 50` only `r`
   is admitted, so dropping `r` would change presence, bucket and projection (`§1.3`).
3. **the IMMEDIATE predecessor, not any earlier equal fact** — both forms are safe for
   `as_of`, but only this one keeps the order of every value change inside a bucket, so the
   `X, 0, X` pattern `T-05.2`'s falsifier `F-1` accuses stays accusable (`§1.5`). The caller
   supplies the predecessor; this function never searches for one.

`observed_at` strictly increasing is the dominance condition's first term; the port contract
(`ObservedLookup.immediate_predecessor`) already guarantees it, and it is re-checked here so a
port that broke its contract cannot turn a same-instant redelivery into a silent drop.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from src.modules.sentimento.domain.provenance import SeriesRow

# `T-06.4-prova.md` §1.5, "O fato, nas duas pontas" — 13 columns. The SAME list is the
# `DELETE`'s predicate (`scripts/md-series-compaction/selected.sql`), and
# `tests/sentimento/test_md_series_compaction_script.py` fails if the two ever diverge.
FACT_COLUMNS: Final[tuple[str, ...]] = (
    "series_key_id",
    "symbol",
    "source",
    "bucket_end",
    "event_time",
    "is_final",
    "value_raw",
    "provenance",
    "availability_source",
    "principal_id",
    "src_label_raw",
    "observer_id",
    "observer_region",
)


@dataclass(frozen=True)
class RecordedObservation:
    """A stored row as the predicate needs it: the fact, plus the two instants it orders by.

    Enums travel as their stored VALUE (`"OBSERVADO"`, `"OBSERVED"`) — the shape the store
    hands back — so a row read from `md.series` and a candidate built in memory compare by the
    same spelling instead of one side round-tripping through an enum constructor that could
    refuse a historical row.
    """

    series_key_id: str
    symbol: str
    source: str
    bucket_end: int
    event_time: int
    is_final: bool | None
    value_raw: str
    provenance: str
    availability_source: str
    principal_id: str | None
    src_label_raw: str
    observer_id: str
    observer_region: str
    observed_at: int
    available_at: int

    @classmethod
    def of(cls, row: SeriesRow) -> RecordedObservation:
        """Project a `SeriesRow` onto the predicate's shape (enums by value)."""
        return cls(
            series_key_id=row.series_key_id,
            symbol=row.symbol,
            source=row.source,
            bucket_end=row.bucket_end,
            event_time=row.event_time,
            is_final=row.is_final,
            value_raw=row.value_raw,
            provenance=row.provenance.value,
            availability_source=row.availability_source.value,
            principal_id=row.principal_id,
            src_label_raw=row.src_label_raw,
            observer_id=row.observer_id,
            observer_region=row.observer_region,
            observed_at=row.observed_at,
            available_at=row.available_at,
        )

    def fact(self) -> tuple[object, ...]:
        """Return the `FACT_COLUMNS` values, in order — the identity of what was observed."""
        return tuple(getattr(self, column) for column in FACT_COLUMNS)


def repeats_predecessor_fact(candidate: SeriesRow, predecessor: RecordedObservation | None) -> bool:
    """Answer whether `predecessor` dominates `candidate` with the same fact (`§1.2`).

    `predecessor` is the stored row of the same `(series_key_id, symbol, source, bucket_end)`
    with the greatest `observed_at` strictly below `candidate.observed_at`, or `None` when the
    bucket has no earlier row. `None` is never a repeat: the first observation of a bucket is
    the one `as_of` returns (`D4.13`), and it is always written.
    """
    if predecessor is None:
        return False
    if predecessor.observed_at >= candidate.observed_at:
        return False
    if predecessor.available_at > candidate.available_at:
        return False
    return predecessor.fact() == RecordedObservation.of(candidate).fact()
