"""`list_series_catalog`/`series_catalog_envelope` — `T-03.2`, `SPEC-003` §3.4.

Two claims this suite exists to falsify, not merely illustrate:

  1. **The catalog is REAL, not collapsed** (`CA-F2-17`): concatenating the three source
     modules' own catalog-builder functions must yield every row those modules populate — a
     regression that silently drops one of the four Coinalyze open-interest reductions (the
     exact failure `CA-F2-17` forbids) fails `test_the_real_catalog_has_ten_rows_not_seven`
     below, not merely `test_open_interest_catalog.py`'s own five-row check.
  2. **The wire matches `series-catalog.ts:134`'s field names, camelCase, exactly** — a
     regression that reverts to snake_case (or drops a field) fails the envelope shape tests.
"""

from __future__ import annotations

from decimal import Decimal

from src.modules.sentimento.domain.series_catalog import (
    PublishedError,
    SeriesCatalog,
    SeriesCatalogEntry,
)
from src.modules.sentimento.domain.series_key import (
    Nature,
    QuantityField,
    Reduction,
    SeriesKey,
    TsConvention,
)
from src.modules.sentimento.use_cases.series_catalog import (
    SERIES_CATALOG_QUERY_NAME,
    list_series_catalog,
    series_catalog_envelope,
)


def test_the_real_catalog_has_ten_rows_not_seven() -> None:
    """The measured, honest total: `3 (cvd) + 2 (price) + 5 (oi) = 10` — never `7`.

    `7` is the count of literal `SeriesCatalogEntry(` call SITES across the three modules
    (`grep -rn 'SeriesCatalogEntry(' backend/src --include='*.py' | grep -v test | wc -l`),
    which `SPEC-003`/`tasks.toml` equate with `n_entries`. `open_interest_catalog_entries`
    builds four of its five rows from ONE call site (a list comprehension over
    `Reduction.OPEN/HIGH/LOW/CLOSE`), so the two numbers are not the same measurement — this
    test is the falsifier: a change that collapsed the OI rows to match the literal-7 reading
    would pass the grep-based DoD in `tasks.toml` while failing THIS assertion, which is the
    one that actually counts what the route serves.
    """
    catalog = list_series_catalog()

    assert len(catalog.entries) == 10
    oi_reductions = {
        entry.key.reduction
        for entry in catalog.entries
        if entry.key.provider == "coinalyze" and entry.key.metric == "sum_open_interest"
    }
    assert oi_reductions == {Reduction.OPEN, Reduction.HIGH, Reduction.LOW, Reduction.CLOSE}


def test_the_catalog_has_no_duplicate_series_key_across_the_three_sources() -> None:
    """`SPEC-001` §3.3's "UMA linha por `SeriesKey`", re-checked over the COMBINED tuple."""
    catalog = list_series_catalog()

    ids = [entry.key.series_key_id() for entry in catalog.entries]
    assert len(ids) == len(set(ids))


def test_list_series_catalog_is_a_pure_function_of_instrument_id() -> None:
    """Same `instrument_id` in, same rows out — no hidden state, no I/O."""
    first = list_series_catalog("BTCUSDT")
    second = list_series_catalog("BTCUSDT")

    assert [e.key.series_key_id() for e in first.entries] == [
        e.key.series_key_id() for e in second.entries
    ]


def test_envelope_query_and_n_entries_match_the_entries_list_length() -> None:
    """`n_entries` is COMPUTED from `entries`, never a literal — the two can never drift."""
    catalog = list_series_catalog()

    envelope = series_catalog_envelope(catalog)

    assert envelope["query"] == SERIES_CATALOG_QUERY_NAME == "series_catalog"
    assert envelope["n_entries"] == len(catalog.entries) == len(envelope["entries"])  # type: ignore[arg-type]


def test_envelope_entry_field_names_are_camelcase_matching_series_catalog_ts_134() -> None:
    """Wire shape = `series-catalog.ts:134`'s `SeriesCatalogEntry` interface, field for field."""
    catalog = list_series_catalog()

    envelope = series_catalog_envelope(catalog)
    entries = envelope["entries"]
    assert isinstance(entries, list)
    entry = entries[0]

    assert set(entry) == {
        "key",
        "nativeGrid",
        "maxStalenessMs",
        "priceUse",
        "reconstructedFrom",
        "publishedError",
    }
    assert "native_grid" not in entry
    assert "max_staleness_ms" not in entry


def test_envelope_key_field_names_are_camelcase_matching_series_catalog_ts_67() -> None:
    """Wire shape = `series-catalog.ts:67-83`'s `SeriesKey` interface, field for field."""
    catalog = list_series_catalog()

    envelope = series_catalog_envelope(catalog)
    entries = envelope["entries"]
    assert isinstance(entries, list)
    key = entries[0]["key"]

    assert set(key) == {
        "provider",
        "venue",
        "instrumentId",
        "metric",
        "cohort",
        "interval",
        "unit",
        "denom",
        "nature",
        "tsConvention",
        "reduction",
        "quantityField",
        "labelShift",
        "aggregationScope",
        "verifiedBy",
    }
    assert "instrument_id" not in key
    assert "ts_convention" not in key


def test_envelope_never_carries_a_completeness_field() -> None:
    """`SPEC-003` §3.4, literal: "`Completeness` não vai no fio — o front preenche `unmeasured`"."""
    catalog = list_series_catalog()

    envelope = series_catalog_envelope(catalog)
    entries = envelope["entries"]
    assert isinstance(entries, list)

    assert "completeness" not in envelope
    for entry in entries:
        assert "completeness" not in entry
        assert "completeness" not in entry["key"]


def test_reconstructed_entry_projects_a_non_null_published_error_as_numbers() -> None:
    """`coinalyze_bv` is the one row with `reconstructed_from`/`published_error` set.

    `Decimal` projects as `float` on the wire, matching `series-catalog.ts:125-129`'s
    `number` fields.
    """
    catalog = list_series_catalog()

    envelope = series_catalog_envelope(catalog)
    entries = envelope["entries"]
    assert isinstance(entries, list)
    reconstructed = [e for e in entries if e["reconstructedFrom"] is not None]

    assert len(reconstructed) == 1
    entry = reconstructed[0]
    assert entry["reconstructedFrom"] == "aggtrade_q"
    published_error = entry["publishedError"]
    assert isinstance(published_error, dict)
    assert set(published_error) == {"medianBp", "p99Bp", "n"}
    assert isinstance(published_error["medianBp"], float)
    assert isinstance(published_error["p99Bp"], float)
    assert isinstance(published_error["n"], int)


def test_a_non_reconstructed_entry_projects_a_null_published_error() -> None:
    """Every OTHER row — 9 of the 10 — carries `reconstructedFrom: null, publishedError: null`."""
    catalog = list_series_catalog()

    envelope = series_catalog_envelope(catalog)
    entries = envelope["entries"]
    assert isinstance(entries, list)
    not_reconstructed = [e for e in entries if e["reconstructedFrom"] is None]

    assert len(not_reconstructed) == 9
    for entry in not_reconstructed:
        assert entry["publishedError"] is None


def _one_entry() -> SeriesCatalogEntry:
    """Build a single, deterministic, non-reconstructed `SeriesCatalogEntry` for the tests below."""
    key = SeriesKey(
        provider="binance",
        venue="usdm_futures",
        instrument_id="BTCUSDT",
        metric="klines_last",
        cohort="all",
        interval="5m",
        unit="USDT",
        denom="quote",
        nature=Nature.STOCK,
        ts_convention=TsConvention.POINT_AT_BUCKET_END,
        reduction=Reduction.LAST,
        quantity_field=QuantityField.NA,
        label_shift=0,
        aggregation_scope="Symbol",
        verified_by="test_series_catalog_use_case.py",
    )
    return SeriesCatalogEntry(key=key, native_grid="5min", max_staleness_ms=600_000)


def test_envelope_over_a_hand_built_single_entry_catalog_projects_every_field() -> None:
    """Direct field-by-field check over ONE hand-built entry, independent of production rows."""
    catalog = SeriesCatalog((_one_entry(),))

    envelope = series_catalog_envelope(catalog)

    assert envelope == {
        "query": "series_catalog",
        "n_entries": 1,
        "entries": [
            {
                "key": {
                    "provider": "binance",
                    "venue": "usdm_futures",
                    "instrumentId": "BTCUSDT",
                    "metric": "klines_last",
                    "cohort": "all",
                    "interval": "5m",
                    "unit": "USDT",
                    "denom": "quote",
                    "nature": "STOCK",
                    "tsConvention": "POINT_AT_BUCKET_END",
                    "reduction": "LAST",
                    "quantityField": "NA",
                    "labelShift": 0,
                    "aggregationScope": "Symbol",
                    "verifiedBy": "test_series_catalog_use_case.py",
                },
                "nativeGrid": "5min",
                "maxStalenessMs": 600_000,
                "priceUse": None,
                "reconstructedFrom": None,
                "publishedError": None,
            }
        ],
    }


def test_envelope_over_a_price_use_entry_carries_the_price_use_string() -> None:
    """`price_use` on a hand-built entry, independent of the real catalog.

    The real catalog's own two rows (`price_source_catalog.py`'s `klines_last`/
    `price_mark_close`, `T-04.2`) now set it too.
    """
    key = SeriesKey(
        provider="binance",
        venue="usdm_futures",
        instrument_id="BTCUSDT",
        metric="klines_last",
        cohort="all",
        interval="5m",
        unit="USDT",
        denom="quote",
        nature=Nature.STOCK,
        ts_convention=TsConvention.POINT_AT_BUCKET_END,
        reduction=Reduction.LAST,
        quantity_field=QuantityField.NA,
        label_shift=0,
        aggregation_scope="Symbol",
        verified_by="test_series_catalog_use_case.py",
    )
    entry = SeriesCatalogEntry(
        key=key, native_grid="5min", max_staleness_ms=600_000, price_use="execution"
    )
    catalog = SeriesCatalog((entry,))

    envelope = series_catalog_envelope(catalog)

    assert envelope["entries"][0]["priceUse"] == "execution"  # type: ignore[index]


def test_published_error_projection_matches_the_decimal_value_as_float() -> None:
    """`Decimal("1.86")`/`Decimal("9.46")` project as `1.86`/`9.46` — never a `Decimal`."""
    key = SeriesKey(
        provider="coinalyze",
        venue="usdm_futures",
        instrument_id="BTCUSDT",
        metric="cvd_source",
        cohort="all",
        interval="1m",
        unit="BTC",
        denom="base",
        nature=Nature.FLOW,
        ts_convention=TsConvention.AGGREGATE_OVER_BUCKET,
        reduction=Reduction.SUM,
        quantity_field=QuantityField.NA,
        label_shift=0,
        aggregation_scope="Symbol",
        verified_by="test_series_catalog_use_case.py",
    )
    entry = SeriesCatalogEntry(
        key=key,
        native_grid="1min",
        max_staleness_ms=120_000,
        reconstructed_from="aggtrade_q",
        published_error=PublishedError(median_bp=Decimal("1.86"), p99_bp=Decimal("9.46"), n=1706),
    )
    catalog = SeriesCatalog((entry,))

    envelope = series_catalog_envelope(catalog)

    published_error = envelope["entries"][0]["publishedError"]  # type: ignore[index]
    assert published_error == {"medianBp": 1.86, "p99Bp": 9.46, "n": 1706}
