"""`SPEC-001` §3.3 as an executable contract: the catalog IS the source of truth for the rules.

The central falsifier this file exists to run, `SPEC-001` §3.3 literal: "the test reads the
catalog; catalog and test cannot diverge without failing." Every `pytest.raises` below calls
`src.modules.sentimento.domain.series_catalog` directly — never a value copied by hand into
this file — so weakening the production validation (dropping a check, loosening a comparison)
fails the test that exercises it instead of leaving the two to drift apart in silence.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

import pytest

from src.modules.sentimento.domain.series_catalog import (
    PRICE_USES,
    DuplicateSeriesKeyError,
    InvalidCatalogEntryError,
    InvalidPriceUseError,
    PublishedError,
    SeriesCatalogEntry,
    build_series_catalog,
)
from src.modules.sentimento.domain.series_key import (
    IncompleteSeriesKeyError,
    Nature,
    QuantityField,
    Reduction,
    SeriesKey,
    TsConvention,
)


def binance_oi_key(**overrides: Any) -> SeriesKey:
    """Build the Binance open-interest series key — same shape as `test_series_identity.py`'s.

    Rebuilt locally rather than imported from that file: a per-file fixture builder is this
    suite's own convention (`test_series_identity.py::binance_oi_key`), and cross-importing a
    `test_*` module would tie two test files' internals together for no reader's benefit.
    """
    terms: dict[str, Any] = {
        "provider": "binance",
        "venue": "usdm_futures",
        "instrument_id": "BTCUSDT",
        "metric": "sum_open_interest",
        "cohort": "all",
        "interval": "5m",
        "unit": "BTC",
        "denom": "base",
        "nature": Nature.STOCK,
        "ts_convention": TsConvention.POINT_AT_BUCKET_END,
        "reduction": Reduction.POINT,
        "quantity_field": QuantityField.NA,
        "label_shift": 300_000,
        "aggregation_scope": "Symbol",
        "verified_by": "test_series_catalog.py::test_a_complete_entry_builds",
    }
    terms.update(overrides)
    return SeriesKey(**terms)


def binance_oi_entry(**key_overrides: Any) -> SeriesCatalogEntry:
    """Build a complete, valid catalog row over `binance_oi_key` — the happy-path fixture."""
    return SeriesCatalogEntry(
        key=binance_oi_key(**key_overrides),
        native_grid="5min",
        max_staleness_ms=600_000,
    )


def test_a_complete_entry_builds_without_error() -> None:
    """The happy path: every required field present, nothing conditional triggered."""
    entry = binance_oi_entry()

    assert entry.key.unit == "BTC"
    assert entry.native_grid == "5min"
    assert entry.max_staleness_ms == 600_000
    assert entry.price_use is None
    assert entry.published_error is None


# ── `unit`/`denom`/`verified_by` — required THROUGH `SeriesKey`, not duplicated here ────────
#
# `SPEC-001` §3.3 lists these among the catalog's required fields; `T-04.2`/`series_key.py`
# already makes them three of the fifteen terms of identity, refusing a blank one
# (`IncompleteSeriesKeyError`). The catalog does not re-check them — it reuses the ONE type
# that owns them — so these tests prove the reuse actually gates a catalog row, not merely
# that `SeriesKey` gates itself in isolation.


@pytest.mark.parametrize("term", ["unit", "denom", "verified_by"])
def test_catalog_row_refuses_a_blank_identity_term_via_the_key(term: str) -> None:
    """A catalog row cannot exist over a `SeriesKey` with a blank `unit`/`denom`/`verified_by`."""
    with pytest.raises(IncompleteSeriesKeyError, match=term):
        binance_oi_entry(**{term: "   "})


def test_catalog_row_refuses_a_key_with_no_label_shift_witness() -> None:
    """`label_shift` without `verified_by` pointing at a test is refused by the key itself.

    `SPEC-001` §3.3, literal: "`label_shift` com `verified_by` apontando para um teste que
    mediu o shift" — `verified_by` is the REFERENCE, not a boolean, and an entry cannot be
    built while it is blank.
    """
    with pytest.raises(IncompleteSeriesKeyError, match="verified_by"):
        binance_oi_entry(verified_by="")


# ── `native_grid` / `max_staleness_ms` — required on the catalog row itself ─────────────────


def test_catalog_row_refuses_a_blank_native_grid() -> None:
    """`CA-F2-11`: `native_grid` is a required per-row field, and blank is not a grid."""
    with pytest.raises(InvalidCatalogEntryError, match="native_grid"):
        SeriesCatalogEntry(key=binance_oi_key(), native_grid="  ", max_staleness_ms=600_000)


@pytest.mark.parametrize("bad_staleness", [0, -1])
def test_catalog_row_refuses_a_non_positive_max_staleness_ms(bad_staleness: int) -> None:
    """`max_staleness_ms` gates how far a reader may `LOCF`; zero or negative reads nothing."""
    with pytest.raises(InvalidCatalogEntryError, match="max_staleness_ms"):
        SeriesCatalogEntry(key=binance_oi_key(), native_grid="5min", max_staleness_ms=bad_staleness)


def test_native_grid_is_a_per_row_field_not_a_shared_constant() -> None:
    """`CA-F2-11`, literal: `native_grid` is "propriedade da source, resolvida em runtime".

    Two rows from two different sources carry two different grids side by side in the SAME
    catalog — the falsifier for "not a module constant" is that nothing here forces them to
    agree.
    """
    coinalyze_entry = SeriesCatalogEntry(
        key=binance_oi_key(provider="coinalyze", ts_convention=TsConvention.OHLC_OVER_BUCKET),
        native_grid="1min",
        max_staleness_ms=120_000,
    )
    binance_entry = binance_oi_entry()

    assert coinalyze_entry.native_grid == "1min"
    assert binance_entry.native_grid == "5min"


# ── `price_use` — required only "quando aplicável" (`SPEC-001` §3.3), a closed set otherwise ──


def test_price_use_defaults_to_none_when_not_a_price_series() -> None:
    """A non-price series carries no `price_use` — "quando aplicável" as a type, not a comment."""
    assert binance_oi_entry().price_use is None


@pytest.mark.parametrize("use", sorted(PRICE_USES))
def test_price_use_accepts_every_member_of_the_closed_set(use: str) -> None:
    """`SPEC-001` §3.7's five values, transcribed — every one of them must be accepted."""
    entry = SeriesCatalogEntry(
        key=binance_oi_key(metric="price_mark_close"),
        native_grid="5min",
        max_staleness_ms=600_000,
        price_use=use,
    )
    assert entry.price_use == use


def test_price_use_outside_the_closed_set_is_refused() -> None:
    """A `price_use` the SPEC never named is refused, never accepted as a silent extension."""
    with pytest.raises(InvalidPriceUseError, match="unknown_use"):
        SeriesCatalogEntry(
            key=binance_oi_key(metric="price_mark_close"),
            native_grid="5min",
            max_staleness_ms=600_000,
            price_use="unknown_use",
        )


# ── published error — `SPEC-001` §3.3's own negative test, run against the real type ───────


def test_reconstruction_without_published_error_is_refused() -> None:
    """`SPEC-001` §3.3, literal: "registrar `cvd_source` sem `(mediana, p99, n)` reprova".

    `"bv` serve"` and `"bv` serve com p99 de 29,34 bp"` are different claims, and only the
    second lets a reader choose by use — so a row that declares itself a reconstruction
    (`reconstructed_from` set) with no `published_error` is refused, not merely undocumented.
    """
    with pytest.raises(InvalidCatalogEntryError, match="published_error"):
        SeriesCatalogEntry(
            key=binance_oi_key(metric="cvd_source", nature=Nature.FLOW),
            native_grid="5min",
            max_staleness_ms=600_000,
            reconstructed_from="aggtrade_q",
        )


def test_reconstruction_with_a_blank_origin_name_is_refused() -> None:
    """`reconstructed_from` present but blank is not distinguishable from "not set" on read."""
    with pytest.raises(InvalidCatalogEntryError, match="reconstructed_from"):
        SeriesCatalogEntry(
            key=binance_oi_key(metric="cvd_source", nature=Nature.FLOW),
            native_grid="5min",
            max_staleness_ms=600_000,
            reconstructed_from="   ",
            published_error=PublishedError(median_bp=Decimal("0"), p99_bp=Decimal("29.34"), n=699),
        )


def test_published_error_without_a_declared_reconstruction_is_refused() -> None:
    """The symmetric case: an error attached to a row that never claims to be a reconstruction."""
    with pytest.raises(InvalidCatalogEntryError, match="reconstructed_from"):
        SeriesCatalogEntry(
            key=binance_oi_key(),
            native_grid="5min",
            max_staleness_ms=600_000,
            published_error=PublishedError(median_bp=Decimal("0"), p99_bp=Decimal("29.34"), n=699),
        )


def test_a_reconstruction_with_its_published_error_builds() -> None:
    """`coinalyze_bv`'s own numbers (`CA-F2-16`, `[MEDIDO]`) as the fixture for the happy path."""
    entry = SeriesCatalogEntry(
        key=binance_oi_key(metric="cvd_source", provider="coinalyze", nature=Nature.FLOW),
        native_grid="1min",
        max_staleness_ms=120_000,
        reconstructed_from="aggtrade_q",
        published_error=PublishedError(median_bp=Decimal("0"), p99_bp=Decimal("29.34"), n=699),
    )

    assert entry.published_error is not None
    assert entry.published_error.n == 699


@pytest.mark.parametrize("bad_n", [0, -1])
def test_published_error_refuses_a_non_positive_sample_size(bad_n: int) -> None:
    """`n` observations of zero or fewer is not a measurement `SPEC-001` §3.3 accepts."""
    with pytest.raises(InvalidCatalogEntryError, match="n"):
        PublishedError(median_bp=Decimal("0"), p99_bp=Decimal("1"), n=bad_n)


@pytest.mark.parametrize(
    ("median_bp", "p99_bp"), [(Decimal("-1"), Decimal("1")), (Decimal("1"), Decimal("-1"))]
)
def test_published_error_refuses_a_negative_percentile(median_bp: Decimal, p99_bp: Decimal) -> None:
    """A signed error is not the magnitude `SPEC-001` §3.3 asks the catalog to publish."""
    with pytest.raises(InvalidCatalogEntryError):
        PublishedError(median_bp=median_bp, p99_bp=p99_bp, n=10)


# ── `SeriesCatalog` itself — "UMA linha por `SeriesKey`" ────────────────────────────────────


def test_build_series_catalog_accepts_two_distinct_series() -> None:
    """Two different `SeriesKey`s coexist in one catalog without conflict."""
    catalog = build_series_catalog(
        [
            binance_oi_entry(),
            binance_oi_entry(metric="sum_open_interest_value", unit="USDT", denom="quote"),
        ]
    )

    assert len(catalog.entries) == 2
    assert catalog.entry_for(binance_oi_key()) is not None


def test_build_series_catalog_refuses_two_rows_for_the_same_series_key() -> None:
    """The falsifier for "UMA linha por `SeriesKey`": a second row for an existing key reprova."""
    with pytest.raises(DuplicateSeriesKeyError):
        build_series_catalog([binance_oi_entry(), binance_oi_entry()])


def test_entry_for_returns_none_for_a_series_with_no_catalog_row() -> None:
    """A series the catalog never priced returns `None`, never a fabricated row."""
    catalog = build_series_catalog([binance_oi_entry()])

    absent = binance_oi_key(metric="sum_open_interest_value", unit="USDT", denom="quote")
    assert catalog.entry_for(absent) is None
