"""`funding_settled` vs `funding_estimado`: two series, plus the grid and PK that separate them."""

# `SPEC-001` §3.4 / `CA-F2-7` / `PRD-001` §5.6 (correction R1 · D-10), plan `06` item 6.4.
#
# ── WHY TWO SERIES, NEVER ONE WITH AN OVERWRITE ──────────────────────────────────────────────
#
# `funding_settled` is what was actually charged — the historical `monthly/fundingRate` dump, one
# row per settlement that already happened. `funding_estimado` is the running prediction Binance
# publishes on `premiumIndex.lastFundingRate` before that settlement fires, and it can be sampled
# many times for the SAME upcoming settlement. Collapsing them into one series with the estimate
# overwritten by the settled value the moment it lands would destroy the very evidence a
# consumer needs to ask "how far off was the prediction" — reconciliation between the two is a
# CONSUMER'S question, never a filter this ingestion layer is allowed to apply on the way in.
#
# `PRD-001` §5.6 (correction R1 · D-10), literal:
#
#     PK funding = ( instrument_id, settle_bucket, source, observed_at )
#
# `source` is the axis this task's own DoD names directly: `funding_settled` or `funding_estimado`
# (`FundingSource` below) — WHICH of the two series this row belongs to. `settle_bucket` and
# `observed_at` are deliberately two different fields even though they carry the same value for
# every `SETTLED` row this task's fixture exercises: a `SETTLED` observation IS the settlement
# (there is only one wall-clock instant a settlement fires at), so `observed_at` is that instant
# and `settle_bucket` is the ideal grid slot it landed near. An `ESTIMATED` row observed hours
# before its settlement is the case that needs the two fields to differ, and that case is future
# work (`premiumIndex` polling) — this module's shape does not foreclose it.
#
# ── WHY `interval_hours_declared` IS A FIELD ON THE ROW, NOT A CONSTANT ──────────────────────
#
# `PRD-001` §5.6, measured: `1000XECUSDT` moved `8h -> 1h -> 4h` inside July 2026 alone, with the
# `1h -> 4h` transition producing a 3,0h delta between consecutive settlements. A schedule
# generated from "today's" interval would emit settlements that never existed on either side of a
# transition. `interval_hours_declared` is read off the SAME line the settlement it describes came
# from — never a global default, never the symbol's "current" value looked up separately.

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from enum import Enum
from typing import Final

MILLISECONDS_PER_HOUR: Final[int] = 3_600_000


class FundingSource(Enum):
    """Which of the two distinct funding series a row belongs to — the `source` PK term.

    `SPEC-001` §3.4 forbids a single series with the estimate overwritten by the settlement:
    the member VALUES match the two `metric` strings the plan and the SPEC write, so a
    `SeriesKey(metric=FundingSource.SETTLED.value, ...)` and this PK's `source` read the exact
    same word instead of two independently-spelled vocabularies for one fact.
    """

    SETTLED = "funding_settled"
    """What was actually charged — the historical `monthly/fundingRate` dump."""

    ESTIMATED = "funding_estimado"
    """The running prediction (`premiumIndex.lastFundingRate`) before settlement fires."""


class InvalidFundingIntervalError(Exception):
    """`interval_hours_declared` is not a positive number of hours.

    Zero or negative hours has no grid to align to — `compute_settlement_slot` would divide by
    zero or invert the floor, and a negative interval is not a reading `SPEC-001` §3.4
    recognizes for `fundingIntervalHours` on any observed row.
    """


class InvalidFundingRecordError(Exception):
    """A `FundingRecord` field that is required is missing, blank, or out of range."""


class ConflictingFundingRecordError(Exception):
    """Two records share a primary key but disagree on content.

    The same `(instrument_id, settle_bucket, source, observed_at)` seen twice with the SAME
    fields is the ordinary case `D6.12` exists to prove harmless: dedupe collapses it to one
    row. Seeing it twice with DIFFERENT `interval_hours_declared` or `funding_rate` is not that
    case — it is two truths claiming the same identity, and `deduplicate_funding_records`
    refuses instead of picking one silently.
    """


def compute_settlement_slot(observed_at_ms: int, interval_hours_declared: int) -> int:
    """Return the grid-aligned settlement slot for `observed_at_ms`, using THIS ROW'S interval.

    `D6.11`: the divisor is `funding_interval_hours * 3_600_000` FROM THE OWN LINE, never a
    global assumption. Measured on `1000XECUSDT-fundingRate-2026-07.csv` (`321` rows spanning
    the `8h -> 1h -> 4h` transitions): every row's residual against its OWN interval lands in
    `[0, 12]` ms and is never negative, while the same rows against a fixed `8h` assumption
    misplace `228` of `321` = `71,0%` outside `[0, 20]` ms
    (`tests/sentimento/test_funding_settlement.py::
    test_d6_11_the_old_fixed_interval_formula_misplaces_most_rows_the_per_line_one_does_not`).

    Floor division of two non-negative integers can never return a residual outside
    `[0, interval_ms)`, so "never negative" here is a property of the arithmetic, not a
    condition this function has to check separately.
    """
    if interval_hours_declared <= 0:
        raise InvalidFundingIntervalError(
            f"interval_hours_declared = {interval_hours_declared} must be positive: there is "
            f"no grid width to align a settlement to a non-positive interval"
        )
    if observed_at_ms < 0:
        raise InvalidFundingIntervalError(
            f"observed_at_ms = {observed_at_ms} is negative: no funding settlement in this "
            f"pipeline's universe predates the epoch"
        )
    grid_ms = interval_hours_declared * MILLISECONDS_PER_HOUR
    return (observed_at_ms // grid_ms) * grid_ms


def settlement_residual_ms(observed_at_ms: int, interval_hours_declared: int) -> int:
    """Return `observed_at_ms - compute_settlement_slot(...)` — the distance past the grid line.

    `D6.11` reads this on PAST settlements (a few ms of processing jitter after the ideal grid
    line). `D6.16` reads it on a scheduled FUTURE `nextFundingTime`, where it must be exactly
    `0`: a schedule published ahead of time has no jitter to absorb.
    """
    return observed_at_ms - compute_settlement_slot(observed_at_ms, interval_hours_declared)


@dataclass(frozen=True)
class FundingRecord:
    """One row of either funding series — `SPEC-001` §3.4's PK, plus the interval and the rate.

    `settle_bucket` is NOT re-derived silently from `observed_at`/`interval_hours_declared` on
    every read: it is computed ONCE, by `compute_settlement_slot`, at construction, and checked
    for grid alignment here — so a caller that hand-built a `settle_bucket` off-grid (the exact
    shape of the "fixed interval" bug `D6.11` measures) fails at the record's own boundary
    instead of silently entering the ledger.
    """

    instrument_id: str
    source: FundingSource
    settle_bucket: int
    observed_at: int
    interval_hours_declared: int
    funding_rate: Decimal

    def __post_init__(self) -> None:
        """Refuse a blank instrument, a non-positive interval, or a `settle_bucket` off-grid."""
        if not self.instrument_id.strip():
            raise InvalidFundingRecordError(
                "instrument_id is blank: a funding row with no instrument does not identify a "
                "settlement, which is the failure `SPEC-001` §3.4's PK exists to prevent"
            )
        if self.interval_hours_declared <= 0:
            raise InvalidFundingIntervalError(
                f"interval_hours_declared = {self.interval_hours_declared} must be positive"
            )
        expected_slot = compute_settlement_slot(self.observed_at, self.interval_hours_declared)
        if self.settle_bucket != expected_slot:
            raise InvalidFundingRecordError(
                f"settle_bucket = {self.settle_bucket} does not match "
                f"compute_settlement_slot(observed_at={self.observed_at}, "
                f"interval_hours_declared={self.interval_hours_declared}) = {expected_slot}: "
                f"`D6.11` requires the slot computed from THIS ROW'S OWN interval, never a "
                f"value assumed or carried over from elsewhere"
            )

    def settlement_residual_ms(self) -> int:
        """Return how far `observed_at` lands past its own `settle_bucket` grid line."""
        return self.observed_at - self.settle_bucket

    def primary_key(self) -> tuple[str, int, str, int]:
        """Return `(instrument_id, settle_bucket, source, observed_at)` — `SPEC-001` §3.4's PK.

        Field order matches `PRD-001` §5.6's own transcription of the PK, so a reader comparing
        this tuple against the PRD's `PK funding = (...)` line reads the same order both places.
        """
        return (self.instrument_id, self.settle_bucket, self.source.value, self.observed_at)


def build_funding_record(
    *,
    instrument_id: str,
    source: FundingSource,
    observed_at_ms: int,
    interval_hours_declared: int,
    funding_rate: Decimal,
) -> FundingRecord:
    """Build a `FundingRecord`, computing `settle_bucket` from `observed_at`/`interval` for it.

    The one sanctioned way to construct a record from a raw observation: a caller never writes
    `compute_settlement_slot` by hand and risks passing a stale or globally-assumed value where
    `FundingRecord.__post_init__` expects the one this row's own interval implies.
    """
    settle_bucket = compute_settlement_slot(observed_at_ms, interval_hours_declared)
    return FundingRecord(
        instrument_id=instrument_id,
        source=source,
        settle_bucket=settle_bucket,
        observed_at=observed_at_ms,
        interval_hours_declared=interval_hours_declared,
        funding_rate=funding_rate,
    )


def deduplicate_funding_records(
    records: Sequence[FundingRecord],
) -> tuple[FundingRecord, ...]:
    """Collapse `records` to one row per primary key — `D6.12`'s "ingerir duas vezes" guard.

    Ingesting the SAME file twice hands this function the same `321` records twice over (`642`
    total); every pair shares both a primary key AND every other field, so the second copy of
    each is dropped and the return value has exactly `321` entries
    (`tests/sentimento/test_funding_settlement.py::
    test_d6_12_ingesting_the_fixture_twice_still_yields_321_rows`). A primary key seen twice
    with DIFFERENT content raises `ConflictingFundingRecordError` instead of silently keeping
    the first or the last — two truths under one identity is corruption, not a duplicate.
    """
    by_key: dict[tuple[str, int, str, int], FundingRecord] = {}
    order: list[tuple[str, int, str, int]] = []
    for record in records:
        key = record.primary_key()
        existing = by_key.get(key)
        if existing is None:
            by_key[key] = record
            order.append(key)
        elif existing != record:
            raise ConflictingFundingRecordError(
                f"primary key {key} carries two different records: {existing!r} and "
                f"{record!r} — dedupe refuses to pick one silently"
            )
    return tuple(by_key[key] for key in order)
