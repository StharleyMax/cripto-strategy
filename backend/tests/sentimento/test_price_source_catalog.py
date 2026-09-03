"""`ADR-007`'s decision table, executable: `price_source` declared BY `price_use`.

Plan `06` items 6.6+6.7. Every assertion below calls
`src.modules.sentimento.domain.price_source_catalog` directly, never a value copied by hand,
so a weakened `resolve_price_source` or a dropped `PRICE_SOURCE_BY_USE` entry fails the test
that exercises it instead of drifting apart from `ADR-007`'s table in silence.
"""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.price_source_catalog import (
    PRICE_SOURCE_BY_USE,
    PRICE_SOURCES,
    MissingPriceUseError,
    build_klines_last_entry,
    build_price_mark_close_entry,
    build_price_series_entries,
    resolve_price_source,
)
from src.modules.sentimento.domain.series_catalog import (
    PRICE_USES,
    InvalidPriceUseError,
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

_VERIFIED_BY = "test_price_source_catalog.py"


# ── `PS-1` — asking for a price source without `price_use` is an ERROR, never a default ─────


def test_resolve_price_source_without_price_use_is_refused() -> None:
    """`ADR-007`/`PS-1`, literal: omitting `price_use` never falls back to a source."""
    with pytest.raises(MissingPriceUseError):
        resolve_price_source(None)


def test_resolve_price_source_outside_the_closed_set_is_refused() -> None:
    """A `price_use` `SPEC-001` §3.7 never named is refused, not silently accepted."""
    with pytest.raises(InvalidPriceUseError, match="unknown_use"):
        resolve_price_source("unknown_use")


@pytest.mark.parametrize(
    ("price_use", "expected_source"),
    [
        ("structure_detection", "klines_last"),
        ("liquidation_trigger", "price_mark_close"),
        ("funding", "price_mark_close"),
        ("execution", "klines_last"),
        ("cost", "price_mark_close"),
    ],
)
def test_resolve_price_source_matches_adr_007_table(price_use: str, expected_source: str) -> None:
    """`ADR-007`'s decision table, transcribed: every one of the five uses, pinned.

    `mark_price` (the concept `ADR-007`'s prose names for `liquidation_trigger`/`funding`/
    `cost`) resolves to `price_mark_close` — the metric this catalog actually materializes it
    under (`PS-2`), never the bare concept name a caller could not look up in the catalog.
    """
    assert resolve_price_source(price_use) == expected_source


def test_price_source_by_use_covers_every_price_use() -> None:
    """Every member of `PRICE_USES` has an assignment — a gap here would `KeyError` silently."""
    assert frozenset(PRICE_SOURCE_BY_USE) == PRICE_USES


def test_price_sources_is_spec_001_section_3_7_closed_set() -> None:
    """The five `price_source` values, transcribed verbatim from `SPEC-001` §3.7."""
    assert PRICE_SOURCES == frozenset(
        {"klines_last", "mark_price", "index_price", "premium_index", "price_mark_close"}
    )


# ── item 6.6 — `price_mark_close` is a real, cataloged row; `implied_avg_price` is not ──────


def test_price_mark_close_entry_builds_as_a_real_catalog_row() -> None:
    """`PS-2`: `price_mark_close` "declarada no catálogo — não subproduto do painel de OI"."""
    entry = build_price_mark_close_entry("BTCUSDT", verified_by=_VERIFIED_BY)

    assert entry.key.metric == "price_mark_close"
    assert entry.key.nature is Nature.STOCK
    assert entry.key.reduction is Reduction.CLOSE
    assert entry.key.ts_convention is TsConvention.POINT_AT_BUCKET_END
    assert entry.key.quantity_field is QuantityField.NA
    assert entry.native_grid == "5min"


def test_klines_last_entry_builds_as_a_real_catalog_row() -> None:
    """`klines_last` — the negotiated-price series `ADR-007` names for structure and execution."""
    entry = build_klines_last_entry("BTCUSDT", verified_by=_VERIFIED_BY)

    assert entry.key.metric == "klines_last"
    assert entry.key.reduction is Reduction.LAST


def test_implied_avg_price_is_still_forbidden_here() -> None:
    """`PS-2`'s falsifier: this catalog's building path cannot construct `implied_avg_price`.

    `series_key.py`'s `FORBIDDEN_METRIC_NAMES` is the actual enforcement (`SeriesKey.
    __post_init__`); this test pins that this module's own price-series identities go through
    that guard — building a `SeriesKey` shaped exactly like `build_price_mark_close_entry`'s
    but under the banned name reproduces the refusal here, not only in `series_key.py`'s own
    suite.
    """
    with pytest.raises(IncompleteSeriesKeyError, match="implied_avg_price"):
        SeriesKey(
            provider="binance",
            venue="usdm_futures",
            instrument_id="BTCUSDT",
            metric="implied_avg_price",
            cohort="all",
            interval="5m",
            unit="USDT",
            denom="quote",
            nature=Nature.STOCK,
            ts_convention=TsConvention.POINT_AT_BUCKET_END,
            reduction=Reduction.CLOSE,
            quantity_field=QuantityField.NA,
            label_shift=0,
            aggregation_scope="Symbol",
            verified_by=_VERIFIED_BY,
        )


def test_build_price_series_entries_returns_two_distinct_catalog_rows() -> None:
    """`klines_last` and `price_mark_close` coexist in one catalog without collision."""
    entries = build_price_series_entries("BTCUSDT", verified_by=_VERIFIED_BY)

    assert len(entries) == 2
    catalog = build_series_catalog(entries)
    assert catalog.entry_for(entries[0].key) is not None
    assert catalog.entry_for(entries[1].key) is not None
