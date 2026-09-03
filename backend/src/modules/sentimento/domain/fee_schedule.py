"""`fee_schedule(venue, market, tier, maker_bps, taker_bps, effective_from, evidence_url)`."""

# Plan `06` item 6.8, `CA-F2-14`, `SPEC-001` §3.4. `PRD-001` §"custo de execução", literal:
# "`fee_schedule` é fato datado, e **hoje não existe nenhum**" — the schema ships with ZERO
# real entries, the same posture `instrument_alias.py` (`Q12`) already takes for this
# repository: build the mechanism correctly for zero, one or many rows, and let curation fill
# it in later.
#
# ── WHY "DATADA", AND WHY THE MECHANISM REFUSES INSTEAD OF DEFAULTING (`D6.13`) ─────────────
#
# `exchangeInfo` does **not** carry a fee field — the only fee-shaped field it exposes is
# `liquidationFee`, which is a DIFFERENT number (the penalty on forced liquidation, not the
# maker/taker cost of a normal fill) `[DOC: handoff T-06.9, PRD-001 CA-F2-14]`. The effective
# maker/taker rate depends on VIP tier, BNB-fee-discount enrollment and time-limited
# promotions, and **changes over time** — `PRD-001` names it "a mesma classe do
# `contract_multiplier`", which this project already resolved as a curated, dated table
# rather than a computed constant.
#
# `resolve` below is the enforcement of `D6.13`, literal: "nenhum resultado de backtest sem
# `(maker_bps, taker_bps, effective_from, evidence_url)`" — asking for a rate at a date the
# schedule does not cover **raises**, it never falls back to a most-recent-available rate or a
# hardcoded default. A silent fallback here would be the same class of defect `ADR-007` names
# for `price_source`: a default chooses a NUMBER the backtest bills as cost, and the choice
# would be invisible in the result.
#
# ── DOMAIN, NOT infra (`ADR-016`, `Natureza`) ───────────────────────────────────────────────
#
# No file, no socket. `date` is used as a VALUE type for pure calendar comparison
# (`effective_from <= at`), never `.today()`/`.now()` — the same use `instrument_alias.py` and
# `domain/dump_window.py` already make of `date`. Reading a curated file from disk and turning
# its text into a parsed structure is an `infra` concern this task does not build (none is
# asked for: `D6.13` is about the resolver refusing correctly, not about a file format).
#
# `maker_bps`/`taker_bps` are `Decimal`, matching `PublishedError`'s own reasoning in
# `series_catalog.py`: a `float` basis-point figure could silently drift from the value
# curated from the source, and a backtest cost is exactly the kind of number this project
# does not let drift.

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Final

# The exact 7 columns `SPEC-001` §3.4 declares for `fee_schedule` — transcribed here so a
# caller building a raw mapping (a future `infra` reader) has one name to check the shape
# against, the same role `REQUIRED_FIELDS` plays in `instrument_alias.py`.
FEE_SCHEDULE_COLUMNS: Final[tuple[str, ...]] = (
    "venue",
    "market",
    "tier",
    "maker_bps",
    "taker_bps",
    "effective_from",
    "evidence_url",
)

# `exchangeInfo`'s ONLY fee-shaped field — named here so a future caller greps this constant
# before reaching for `exchangeInfo` as a source of maker/taker rates, instead of rediscovering
# the confusion the handoff already measured. It is NOT a fee_schedule input; it is the
# distinct liquidation-penalty field this module is not about.
EXCHANGE_INFO_LIQUIDATION_FEE_FIELD: Final[str] = "liquidationFee"


class FeeScheduleRejectedError(Exception):
    """Base of every refusal below — a caller can fail closed with a single `except`."""


class MalformedFeeScheduleEntryError(FeeScheduleRejectedError):
    """One entry is not a valid `fee_schedule` row — a blank required text column."""


class MissingFeeEvidenceUrlError(FeeScheduleRejectedError):
    """A fee entry with no `evidence_url` — refused BY VALIDATION, `D6.13`'s own words.

    Its own type, mirroring `MissingEvidenceUrlError` in `instrument_alias.py`: a caller that
    wants to report specifically on missing evidence can catch this one without string-matching
    a message.
    """


class DuplicateFeeScheduleEntryError(FeeScheduleRejectedError):
    """Two entries share `(venue, market, tier, effective_from)` — `resolve` cannot pick one."""


class NoFeeScheduleAsOfError(FeeScheduleRejectedError):
    """No entry of `(venue, market, tier)` is in effect as of the requested date — `D6.13`.

    This IS the mechanism the DoD names: raised instead of returning the most recent entry, a
    hardcoded default, or `None` a caller might silently treat as "free". A backtest that
    catches this and substitutes a guess has reintroduced exactly the defect this type exists
    to make impossible to reach unnoticed.
    """


@dataclass(frozen=True)
class FeeScheduleEntry:
    """One curated row of `fee_schedule` — `SPEC-001` §3.4's seven columns, transcribed above.

    `maker_bps` is not constrained in sign: a maker REBATE (a venue paying the maker side) is a
    legitimate, real fee-schedule shape and is a negative `maker_bps`, not an invalid one — this
    type does not invent a "fees are never negative" rule the SPEC never states. `taker_bps`
    likewise carries whatever sign the curated evidence reports.
    """

    venue: str
    market: str
    tier: str
    maker_bps: Decimal
    taker_bps: Decimal
    effective_from: date
    evidence_url: str

    def __post_init__(self) -> None:
        """Refuse a row that could never be a curated fee entry, before it exists as one."""
        for field_name in ("venue", "market", "tier"):
            if not getattr(self, field_name).strip():
                raise MalformedFeeScheduleEntryError(
                    f"{field_name} is blank: `SPEC-001` §3.4 requires it on every row"
                )
        if not self.evidence_url.strip():
            raise MissingFeeEvidenceUrlError(
                f"fee_schedule entry for venue={self.venue!r} market={self.market!r} "
                f"tier={self.tier!r} (effective_from={self.effective_from}) has no "
                f"evidence_url: `D6.13` refuses a resolved rate the backtest cannot cite back "
                f"to its source, exactly as `contract_multiplier` already requires"
            )


@dataclass(frozen=True)
class FeeScheduleCatalog:
    """`fee_schedule` itself — the curated rows, resolvable as-of any date.

    `entries` is a plain tuple, not indexed by `(venue, market, tier)`: a promotion or a tier
    change legitimately produces a SECOND row for the same `(venue, market, tier)` with a later
    `effective_from`, so `resolve` picks the entry with the LATEST `effective_from` that is
    still `<= at`, at read time — the same shape `InstrumentAliasCatalog.resolve` already uses
    for `instrument_alias` (`Q12`).
    """

    entries: tuple[FeeScheduleEntry, ...]

    def __post_init__(self) -> None:
        """Refuse two entries sharing `(venue, market, tier, effective_from)`."""
        seen: set[tuple[str, str, str, date]] = set()
        for entry in self.entries:
            natural_key = (entry.venue, entry.market, entry.tier, entry.effective_from)
            if natural_key in seen:
                raise DuplicateFeeScheduleEntryError(
                    f"duplicate fee_schedule entry for venue={entry.venue!r} "
                    f"market={entry.market!r} tier={entry.tier!r} "
                    f"effective_from={entry.effective_from}: two entries would leave "
                    f"`resolve` choosing between them arbitrarily"
                )
            seen.add(natural_key)

    def resolve(self, *, venue: str, market: str, tier: str, at: date) -> FeeScheduleEntry:
        """Return the `FeeScheduleEntry` in effect for `(venue, market, tier)` as of `at`.

        `D6.13`, literal: "nenhum resultado de backtest sem `(maker_bps, taker_bps,
        effective_from, evidence_url)` resolvidos as-of a janela" — a caller that receives a
        return from this method already has all four, by construction (`FeeScheduleEntry.
        __post_init__` refuses a blank `evidence_url`). A caller for whom NO entry covers `at`
        gets `NoFeeScheduleAsOfError`, never a fabricated rate.
        """
        candidates = [
            entry
            for entry in self.entries
            if entry.venue == venue
            and entry.market == market
            and entry.tier == tier
            and entry.effective_from <= at
        ]
        if not candidates:
            raise NoFeeScheduleAsOfError(
                f"no fee_schedule entry for venue={venue!r} market={market!r} tier={tier!r} "
                f"is in effect as of {at}: `D6.13` refuses to resolve a cost from a schedule "
                f"that does not cover the requested date, rather than defaulting to zero or "
                f"to the nearest entry"
            )
        return max(candidates, key=lambda entry: entry.effective_from)


def build_fee_schedule_catalog(entries: tuple[FeeScheduleEntry, ...]) -> FeeScheduleCatalog:
    """Build a `FeeScheduleCatalog` from `entries`, validating uniqueness on the way in.

    Kept as a function, mirroring `build_series_catalog` in `series_catalog.py`: one call that
    reads the same way across this component's catalogs, validation never optional on the way
    in.
    """
    return FeeScheduleCatalog(entries)
