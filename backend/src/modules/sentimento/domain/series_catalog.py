"""`series_catalog` — the contract `SPEC-001` §3.3 names, and the one the tests read."""

# One row per `SeriesKey` (`T-04.2`, `series_key.py`) — this module does not redefine the
# fifteen terms, it wraps `SeriesKey` with the catalog-only fields §3.3 requires alongside it:
#
#   * `native_grid`      — a property of the SOURCE, resolved at runtime (`CA-F2-11`). It is a
#                          field on every row, never a module constant, because Coinalyze
#                          publishes `1min` and Binance's `daily/metrics` publishes `5min`: a
#                          constant here would silently mislabel whichever source is not the
#                          one the constant was written for.
#   * `max_staleness_ms` — how far a reader may `LOCF` this row on read (`SPEC-001` §3.2);
#                          required on every row, never inferred.
#   * `price_use`        — required only when the row is a price series (`SPEC-001` §3.7);
#                          `None` otherwise, which is what "quando aplicável" means as a type
#                          instead of a comment.
#   * `reconstructed_from` / `published_error` — a row that is a RECONSTRUCTION of another
#                          source (the `cvd_source` case `CA-F2-16` names) must carry the error
#                          that reconstruction measured — `(median, p99, n)`, `SPEC-001` §3.3's
#                          own words. A row that is not a reconstruction carries neither.
#
# `unit`, `denom`, `label_shift` and `verified_by` are NOT repeated as separate fields here:
# they are four of the fifteen terms already on `SeriesKey`, and `SeriesKey.__post_init__`
# already refuses a blank `unit`/`denom`/`verified_by` (`IncompleteSeriesKeyError`). Duplicating
# them on this dataclass would create a second place for the same fact to drift from the
# first — exactly the failure `series_key.py`'s own docstring names for `SERIES_KEY_TERMS` and
# the dataclass fields. Reading `entry.key.unit` IS reading the catalog's `unit` column.
#
# This task (`T-06.1`, plan `06` items 6.1+6.5+6.15) builds the CONTRACT — the type and its
# validation — not the quarantine mechanism (`T-06.6`, the three-term predicate in
# `quarantine_terms.py`) and not the production rows (`T-06.2`..`T-06.9` populate the real
# shifts, the four L/S series, funding, price and `cvd_source`). A catalog of zero or a
# handful of example rows is the expected shape of this module's tests.

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal

from src.modules.sentimento.domain.series_key import SeriesKey

# `SPEC-001` §3.7, transcribed verbatim: the closed set of USES a price series may serve.
# Declared here — not in `series_key.py`, `price_use` is not a term of identity — because
# `SPEC-001` §3.3 requires it "quando aplicável" as a CATALOG field, and `T-06.7` (price
# source per `price_use`) is the future consumer this enum exists to keep from inventing a
# second, slightly different, list of the same five strings.
PRICE_USES: frozenset[str] = frozenset(
    {"structure_detection", "liquidation_trigger", "funding", "execution", "cost"}
)


class InvalidPriceUseError(Exception):
    """`price_use` was given a value outside `SPEC-001` §3.7's closed set."""


class InvalidCatalogEntryError(Exception):
    """A `SeriesCatalogEntry` field that is required — by presence or by combination — is not.

    One exception for the whole entry, mirroring `IncompleteSeriesKeyError`'s own reasoning in
    `series_key.py`: every violation below fails the same way a reader of the catalog cares
    about — this row cannot be trusted as published — and the message always names which field.
    """


class DuplicateSeriesKeyError(Exception):
    """Two catalog rows share one `SeriesKey` — `SPEC-001` §3.3's "UMA linha por `SeriesKey`"."""


@dataclass(frozen=True)
class PublishedError:
    """`(median, p99, n)` — `SPEC-001` §3.3's own words for the error a reconstruction publishes.

    `SPEC-001` §3.3, literal: "registrar `cvd_source` sem `(mediana, p99, n)` reprova." This
    type is the minimum that recusa can check; a source that also wants to publish `máx` or a
    measurement date (the `coinalyze_bv` row does, in `CA-F2-16`) carries those on top, in the
    module that populates it (`T-06.9`) — this task fixes only the three fields §3.3 names as
    the ones that gate publication.

    `median_bp`/`p99_bp` are `Decimal`, matching the canonical arithmetic this module family
    already uses (`metrics_shift.py`, `series_key.py`'s own SPEC citations) — a `float` here
    would let a written value silently drift from the basis-point figure a discovery
    measurement actually reported.
    """

    median_bp: Decimal
    p99_bp: Decimal
    n: int

    def __post_init__(self) -> None:
        """Refuse a published error with a non-positive sample size or a negative percentile."""
        if self.n <= 0:
            raise InvalidCatalogEntryError(
                f"published_error.n = {self.n} must be positive: an error published over zero "
                f"or negative observations is not a measurement `SPEC-001` §3.3 accepts"
            )
        if self.median_bp < 0 or self.p99_bp < 0:
            raise InvalidCatalogEntryError(
                f"published_error median_bp={self.median_bp!r} / p99_bp={self.p99_bp!r} must "
                f"both be non-negative: a signed error is not the magnitude §3.3 asks for"
            )


@dataclass(frozen=True)
class SeriesCatalogEntry:
    """One row of `series_catalog` — the fifteen-term `key` plus the catalog-only fields.

    No field below has a default, with the deliberate exception of `price_use`,
    `reconstructed_from` and `published_error`: `SPEC-001` §3.3 asks for the first "quando
    aplicável" and the last two only "quando a série é reconstrução de outra fonte" — an
    always-required field would force every row that is neither a price series nor a
    reconstruction to carry a value that means nothing for it, which is the same objection
    `series_key.py` raises against a default on `reduction`.
    """

    key: SeriesKey
    native_grid: str
    max_staleness_ms: int
    price_use: str | None = None
    reconstructed_from: str | None = None
    published_error: PublishedError | None = None

    def __post_init__(self) -> None:
        """Refuse a row that is missing a required field or combines two fields inconsistently."""
        if not self.native_grid.strip():
            raise InvalidCatalogEntryError(
                "native_grid is blank: `CA-F2-11` requires it resolved from the source on "
                "every row, and a blank value is indistinguishable from 'never resolved'"
            )
        if self.max_staleness_ms <= 0:
            raise InvalidCatalogEntryError(
                f"max_staleness_ms = {self.max_staleness_ms} must be positive: `SPEC-001` §3.2 "
                f"reads it as how far a `LOCF` may reach, and a non-positive bound reads nothing"
            )
        if self.price_use is not None and self.price_use not in PRICE_USES:
            raise InvalidPriceUseError(
                f"price_use = {self.price_use!r} is outside `SPEC-001` §3.7's closed set "
                f"{sorted(PRICE_USES)!r}"
            )
        if self.reconstructed_from is not None and not self.reconstructed_from.strip():
            raise InvalidCatalogEntryError(
                "reconstructed_from is present but blank: a reconstruction with an empty "
                "origin name is not distinguishable from 'not a reconstruction' on read"
            )
        if self.reconstructed_from is not None and self.published_error is None:
            raise InvalidCatalogEntryError(
                f"series reconstructed from {self.reconstructed_from!r} has no published_error: "
                f"`SPEC-001` §3.3 refuses to publish a reconstruction without "
                f"(median, p99, n) — 'serve' and 'serve with p99 of N bp' are different claims"
            )
        if self.reconstructed_from is None and self.published_error is not None:
            raise InvalidCatalogEntryError(
                "published_error is set but reconstructed_from is None: an error is a claim "
                "about a RECONSTRUCTION, and this row does not declare being one"
            )


@dataclass(frozen=True)
class SeriesCatalog:
    """`series_catalog` itself — the rows, with `SPEC-001` §3.3's "UMA linha por `SeriesKey`".

    Construct through `build_series_catalog` in the ordinary case; this type's own
    `__post_init__` is what a caller building the tuple by hand still cannot bypass.
    """

    entries: tuple[SeriesCatalogEntry, ...]

    def __post_init__(self) -> None:
        """Refuse two rows that share a `series_key_id` — the catalog's own uniqueness."""
        seen: dict[str, int] = {}
        for index, entry in enumerate(self.entries):
            key_id = entry.key.series_key_id()
            if key_id in seen:
                raise DuplicateSeriesKeyError(
                    f"entries at index {seen[key_id]} and {index} share series_key_id "
                    f"{key_id}: `SPEC-001` §3.3 requires exactly one row per `SeriesKey`"
                )
            seen[key_id] = index

    def entry_for(self, key: SeriesKey) -> SeriesCatalogEntry | None:
        """Return the one row for `key`, or `None` if the series has no catalog row yet."""
        key_id = key.series_key_id()
        for entry in self.entries:
            if entry.key.series_key_id() == key_id:
                return entry
        return None


def build_series_catalog(entries: Sequence[SeriesCatalogEntry]) -> SeriesCatalog:
    """Build a `SeriesCatalog` from `entries`, validating uniqueness on the way in.

    A thin wrapper over the dataclass constructor — kept as a function so a caller that reads
    rows from a file or a store (`infra`, if one is ever built for this) has one call that
    reads the same as `label_and_sort_metrics_rows` in `metrics_shift.py`: one way in, and
    validation is not optional on that way.
    """
    return SeriesCatalog(tuple(entries))
