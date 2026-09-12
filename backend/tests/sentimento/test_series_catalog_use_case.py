"""`list_series_catalog`/`series_catalog_envelope` — `T-03.2`, `SPEC-003` §3.4.

Two claims this suite exists to falsify, not merely illustrate:

  1. **The catalog is REAL, not collapsed** (`CA-F2-17`): concatenating the three source
     modules' own catalog-builder functions must yield every row those modules populate — a
     regression that silently drops one of the four Coinalyze open-interest reductions (the
     exact failure `CA-F2-17` forbids) fails `test_the_real_catalog_has_eleven_rows_not_seven`
     below, not merely `test_open_interest_catalog.py`'s own five-row check.
  2. **The wire matches `series-catalog.ts:134`'s field names, camelCase, exactly** — a
     regression that reverts to snake_case (or drops a field) fails the envelope shape tests.
  3. **`T-01.6`: `klines_volume` is REGISTERED in the catalog the route serves** (`SPEC-007`
     §4.5, `RF-2`) — and registration is proved where it BITES, at
     `build_series_history_report`, which is the function that raises `422
     UnknownSeriesKeyIdError` for an unregistered id. An assertion that only read
     `catalog.entry_for_id(...) is not None` would test `entry_for_id`, not the elo da fatia.
     The order falsifier for `RS-1` lives here too: content may change, form may not.
"""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path
from typing import Final

import pytest

from src.modules.charts.domain.panel_grid_enablement import classify_grid_multiple
from src.modules.sentimento.domain.as_of_accessor import BarPolicy, Observation
from src.modules.sentimento.domain.cvd_source_catalog import (
    CVD_SOURCE_METRIC,
    build_kline_takerbuy_entry,
)
from src.modules.sentimento.domain.klines_volume_catalog import (
    KLINES_VOLUME_MAX_STALENESS_MS,
    KLINES_VOLUME_METRIC,
    KLINES_VOLUME_NATIVE_GRID,
)
from src.modules.sentimento.domain.series_catalog import (
    DuplicateSeriesKeyError,
    PublishedError,
    SeriesCatalog,
    SeriesCatalogEntry,
)
from src.modules.sentimento.domain.series_history_report import PanelGridVerdict
from src.modules.sentimento.domain.series_key import (
    Nature,
    QuantityField,
    Reduction,
    SeriesKey,
    TsConvention,
)
from src.modules.sentimento.infra.binance_klines_client import KlineRow
from src.modules.sentimento.use_cases.collector_series_mapping import (
    INITIAL_SYMBOLS,
    build_klines_to_rows,
)
from src.modules.sentimento.use_cases.series_catalog import (
    PILOT_INSTRUMENT_IDS,
    SERIES_CATALOG_QUERY_NAME,
    list_pilot_series_catalog,
    list_series_catalog,
    series_catalog_envelope,
)
from src.modules.sentimento.use_cases.series_history import (
    UnknownSeriesKeyIdError,
    build_series_history_report,
)


def _classify_panel_grid(*, panel_grid_ms: int, native_grid_ms: int) -> PanelGridVerdict:
    """Satisfy the `GridMultipleClassifier` port with the REAL `charts` rule (`ADR-037/D4`)."""
    verdict = classify_grid_multiple(panel_grid_ms, native_grid_ms)
    return PanelGridVerdict(
        native_grid_ms=verdict.native_grid_ms,
        enabled=verdict.enabled,
        reason=verdict.reason.value,
        multiple=verdict.multiple,
    )


def test_the_real_catalog_has_twelve_rows_not_seven() -> None:
    """The measured, honest total: `3 cvd + 2 price + 5 oi + 1 volume + 1 cvd-from-klines = 12`.

    Was `10` until `T-01.6` appended `klines_volume` and `11` until `T-02.4` appended
    `cvd_source`/`kline_takerbuy` (`SPEC-007` §4, rows M1 and M5). The reasoning
    below is unchanged — the point of the test was never the digit, it is that `n_entries`
    counts what the route SERVES rather than what a grep of call sites suggests.

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

    assert len(catalog.entries) == 12
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
    """Every OTHER row — 11 of the 12 — carries `reconstructedFrom: null, publishedError: null`.

    Was 9 of 10 until `T-01.6` and 10 of 11 until `T-02.4`. Both `SPEC-007` rows join this side
    of the split rather than the reconstructed one, and for BOTH that is a claim rather than
    bookkeeping: the value is READ from the bucket `/fapi/v1/klines` publishes, so there is
    nothing reconstructed and no `(median, p99, n)` to declare (`D6.9`). For `kline_takerbuy` the
    claim was FALSIFIED before it was written — `T-02.1`, `n=4.320` buckets against the canonical
    `aggTrade` dump, zero divergent runs with a residual. A row that shipped a `publishedError`
    here would be asserting a reconstruction error for a number nobody reconstructed; `coinalyze_bv`
    stays the single row on the other side, and it is the one that really does reconstruct.
    """
    catalog = list_series_catalog()

    envelope = series_catalog_envelope(catalog)
    entries = envelope["entries"]
    assert isinstance(entries, list)
    not_reconstructed = [e for e in entries if e["reconstructedFrom"] is None]

    assert len(not_reconstructed) == 11
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
    return SeriesCatalogEntry(
        key=key, native_grid="5min", native_grid_ms=300_000, max_staleness_ms=600_000
    )


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
        key=key,
        native_grid="5min",
        native_grid_ms=300_000,
        max_staleness_ms=600_000,
        price_use="execution",
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
        native_grid_ms=60_000,
        max_staleness_ms=120_000,
        reconstructed_from="aggtrade_q",
        published_error=PublishedError(median_bp=Decimal("1.86"), p99_bp=Decimal("9.46"), n=1706),
    )
    catalog = SeriesCatalog((entry,))

    envelope = series_catalog_envelope(catalog)

    published_error = envelope["entries"][0]["publishedError"]  # type: ignore[index]
    assert published_error == {"medianBp": 1.86, "p99Bp": 9.46, "n": 1706}


# ── `T-01.6` — `klines_volume` REGISTRADA no catálogo servido (`SPEC-007` §4.5, `RF-2`) ─────
#
# `T-01.1` already proves the IDENTITY is correct term by term
# (`test_klines_volume_catalog.py`, 16 tests) — none of that is repeated here. What this block
# proves is the thing `T-01.1` deliberately could not: that the row reaches the list the ROUTE
# serves, and that `/api/v1/series-history` therefore stops refusing its id.


def _klines_volume_entry_of(catalog: SeriesCatalog) -> SeriesCatalogEntry:
    """Return the single served `klines_volume` row, failing loudly if it is not unique.

    Not a `next(... , None)`: "exactly one" is the assertion. Two rows would mean the append
    happened twice (or a second builder started emitting the same metric), and a lookup that
    silently took the first would hide it.
    """
    rows = [e for e in catalog.entries if e.key.metric == KLINES_VOLUME_METRIC]
    assert len(rows) == 1, f"expected exactly one {KLINES_VOLUME_METRIC} row, got {len(rows)}"
    return rows[0]


class _EmptyWindowReader:
    """`SeriesWindowReader` that has no observations — the catalog lookup is what is under test.

    Returning zero observations is deliberate: `build_series_history_report` reaches
    `catalog.entry_for_id` BEFORE it reads anything (`series_history.py:119`), so an empty
    store isolates the registration check from any question about stored data. A reader that
    returned rows would also pass, and would additionally be testing `as_of`.
    """

    def read_window(
        self,
        *,
        series_key_id: str,
        symbol: str,
        window_start_ms: int,
        window_end_ms: int,
        lookback_ms: int,
    ) -> tuple[Observation, ...]:
        return ()


def test_klines_volume_is_registered_in_the_catalog_the_route_serves() -> None:
    """`RF-2`: the identity `T-01.1` built is now a row of `list_series_catalog()`."""
    catalog = list_series_catalog()

    entry = _klines_volume_entry_of(catalog)

    assert entry.key.provider == "binance"
    assert entry.key.venue == "usdm_futures"
    assert entry.key.instrument_id == "BTCUSDT"
    assert entry.key.interval == "1m"
    assert entry.native_grid == KLINES_VOLUME_NATIVE_GRID
    assert entry.max_staleness_ms == KLINES_VOLUME_MAX_STALENESS_MS


def test_series_history_no_longer_refuses_the_klines_volume_id_with_unknown_series_key() -> None:
    """The DoD of `T-01.6`, asserted at the function that actually raises the `422`.

    `SPEC-007` §4.5: "reusar não é não fazer nada" — before this registration,
    `catalog.entry_for_id` returned `None` for this id and `build_series_history_report` raised
    `UnknownSeriesKeyIdError`, which the route maps to `422`. Asserting `entry_for_id is not
    None` would only test `entry_for_id`; this calls the real use case, through the real
    refusal branch.
    """
    catalog = list_series_catalog()
    series_key_id = _klines_volume_entry_of(catalog).key.series_key_id()

    report = build_series_history_report(
        catalog,
        _EmptyWindowReader(),
        _classify_panel_grid,
        series_key_id=series_key_id,
        symbol="BTCUSDT",
        interval="1m",
        window_start_ms=1_700_000_000_000,
        window_end_ms=1_700_000_060_000,
        knowledge_time_ms=1_700_000_120_000,
        bar_policy=BarPolicy.FINAL_ONLY,
    )

    assert report.panel_series_key_id == series_key_id
    assert report.panel_nature == Nature.FLOW.value


def test_an_unregistered_id_still_raises_unknown_series_key_id_error() -> None:
    """The companion that keeps the test above honest — the guard is still armed.

    Without this, `test_series_history_no_longer_refuses_…` would also pass if someone deleted
    the `entry_for_id is None` branch entirely: a use case that accepts EVERY id refuses none,
    including the one this task registered. This test is the reason the one above measures
    registration rather than the absence of a check.
    """
    catalog = list_series_catalog()

    with pytest.raises(UnknownSeriesKeyIdError):
        build_series_history_report(
            catalog,
            _EmptyWindowReader(),
            _classify_panel_grid,
            series_key_id="0" * 64,
            symbol="BTCUSDT",
            interval="1m",
            window_start_ms=1_700_000_000_000,
            window_end_ms=1_700_000_060_000,
            knowledge_time_ms=1_700_000_120_000,
            bar_policy=BarPolicy.FINAL_ONLY,
        )


def test_the_served_klines_volume_row_carries_the_verified_by_naming_a_real_test_file() -> None:
    """`verified_by` is the fifteenth IDENTITY term, so the served value decides the `sha256`.

    `T-01.6`'s refs are explicit that the value must be the test `T-01.1` created, not an
    invented name. The `Path` check makes the claim falsifiable on disk: a row that named a
    file nobody wrote would be a `verified_by` that verifies nothing, and the id it produces
    would still look perfectly well-formed.
    """
    entry = _klines_volume_entry_of(list_series_catalog())

    assert entry.key.verified_by == "test_klines_volume_catalog.py"
    named_test = Path(__file__).parent / entry.key.verified_by
    assert named_test.is_file(), f"verified_by names {named_test}, which does not exist"


def test_the_served_row_is_base_denominated_in_the_instruments_own_base_asset() -> None:
    """`denom="base"` ⇒ `unit` is the BASE asset, so `BTCUSDT` must serve `BTC`, never `USDT`.

    Index `[5]` of `/fapi/v1/klines` is base-denominated and index `[7]`
    (`quoteAssetVolume`) is the quote one — two different numbers from the same bucket. A row
    that shipped `unit="USDT"` with `denom="base"` would mislabel the axis of the very panel
    `T-01.7` is about to draw, and nothing downstream would contradict it.
    """
    entry = _klines_volume_entry_of(list_series_catalog())

    assert entry.key.denom == "base"
    assert entry.key.unit == "BTC"


def test_klines_volume_and_klines_last_are_served_as_two_rows_not_one() -> None:
    """`GA-1`, re-checked at the SERVED layer: volume did not displace or collide with price.

    `T-01.1` proved the two identities coexist in a hand-built `SeriesCatalog`. This proves it
    of the real one — `build_series_catalog` re-validates "UMA linha por `SeriesKey`"
    (`SPEC-001` §3.3) over the combined tuple, so a collision here would have raised
    `DuplicateSeriesKeyError` at `list_series_catalog()` rather than produced a short list.
    """
    catalog = list_series_catalog()

    volume = _klines_volume_entry_of(catalog)
    last = [e for e in catalog.entries if e.key.metric == "klines_last"]

    assert len(last) == 1
    assert volume.key.series_key_id() != last[0].key.series_key_id()
    assert (volume.key.nature, volume.key.reduction) == (Nature.FLOW, Reduction.SUM)
    assert (last[0].key.nature, last[0].key.reduction) == (Nature.STOCK, Reduction.LAST)


def test_registering_klines_volume_appended_and_did_not_reorder_the_pre_existing_rows() -> None:
    """`RS-1` falsifier: content changed, FORM did not — the ten old rows kept their indices.

    `RS-1` lets this task add an entry and forbids it from touching the envelope, the field
    names or the ORDER. Inserting `klines_volume` anywhere but the tail would shift every row
    after it, which no field of the response would report — the list would simply come back
    permuted. Pinning the tail position is what makes that permutation fail a test instead of
    silently reaching a consumer that reads by index.
    """
    catalog = list_series_catalog()
    metrics = [entry.key.metric for entry in catalog.entries]

    assert metrics[10] == KLINES_VOLUME_METRIC
    assert metrics[-1] == CVD_SOURCE_METRIC
    assert metrics[:10] == [
        "cvd_source",
        "cvd_source",
        "cvd_source",
        "klines_last",
        "price_mark_close",
        "sum_open_interest",
        "sum_open_interest",
        "sum_open_interest",
        "sum_open_interest",
        "sum_open_interest",
    ]


def test_the_envelope_serves_twelve_entries_without_changing_its_three_top_level_fields() -> None:
    """`RS-1` again, at the wire: `n_entries` moved 10 -> 11 -> 12 and nothing else moved."""
    envelope = series_catalog_envelope(list_series_catalog())

    assert list(envelope.keys()) == ["query", "n_entries", "entries"]
    assert envelope["query"] == "series_catalog"
    assert envelope["n_entries"] == 12
    entries = envelope["entries"]
    assert isinstance(entries, list)
    served_metrics = [entry["key"]["metric"] for entry in entries]
    assert served_metrics.count(KLINES_VOLUME_METRIC) == 1


# ── A1: `unit` IS DERIVED FROM THE INSTRUMENT, NOT A LITERAL `"BTC"` ────────────────────────


@pytest.mark.parametrize(
    ("instrument_id", "expected_unit"),
    [("BTCUSDT", "BTC"), ("ETHUSDT", "ETH"), ("SOLUSDT", "SOL"), ("LINKUSDT", "LINK")],
)
def test_base_denominated_rows_carry_the_instruments_own_base_asset(
    instrument_id: str, expected_unit: str
) -> None:
    """MORDE the defect this fix removes: `_BASE_ASSET_UNIT = "BTC"`, passed to every caller.

    Every row this catalog builds with `denom="base"` — the three `cvd_source`, the five
    `sum_open_interest` and `klines_volume` — is denominated in the INSTRUMENT's base asset.
    With the old module-level literal, `list_series_catalog("ETHUSDT")` returned nine rows
    labelled `unit="BTC"`, and because `unit` is the seventh term of `SeriesKey` those rows
    were not mislabelled, they were a DIFFERENT `series_key_id` — one nothing writes to.

    Restoring the literal fails this test for the three non-`BTC` instruments and passes for
    `BTCUSDT`, which is exactly why the assertion is parametrized over the pilot universe and
    not written against `BTCUSDT` alone.
    """
    catalog = list_series_catalog(instrument_id)

    base_rows = [entry for entry in catalog.entries if entry.key.denom == "base"]
    assert len(base_rows) == 10
    assert {entry.key.unit for entry in base_rows} == {expected_unit}


def test_quote_denominated_rows_are_untouched_by_the_derivation() -> None:
    """The two price rows stay `USDT` for every instrument — `denom="quote"`, not base.

    CALA: a derivation applied too widely would relabel `klines_last`/`price_mark_close` and
    move two `series_key_id`s that no defect asked to move.
    """
    for instrument_id in PILOT_INSTRUMENT_IDS:
        quote_rows = [
            entry
            for entry in list_series_catalog(instrument_id).entries
            if entry.key.denom == "quote"
        ]
        assert len(quote_rows) == 2
        assert {entry.key.unit for entry in quote_rows} == {"USDT"}


# The `klines_volume` `series_key_id`s that PRODUCTION `md.series` actually carries, one per
# pilot instrument, transcribed from the database — not recomputed from the code under test,
# which would make the assertion compare the code to itself:
#
#   docker exec deploy-postgres-1 psql -U cripto_strategy -d cripto_strategy -At -F'|' \
#     -c "select distinct series_key_id, symbol, source from md.series order by 2,3;"
#   -> 12 rows, n=12; the four below are the `/fapi/v1/klines` ones
#   `[MEDIDO 2026-09-11]`
_PRODUCTION_KLINES_VOLUME_IDS: Final[dict[str, str]] = {
    "BTCUSDT": "ef3033e6ad5a487330c9e669dd1ed3105a7a40ba274b78302b4d3eb624244e42",
    "ETHUSDT": "0d9f2632abaf2bd386b1a01a0b773cde2af43e97295ec6dd5ddca594da785435",
    "LINKUSDT": "24b0fc0624fd42bed59f07774d8069a2ec33dc9fc41fa15138590471d82a2ed7",
    "SOLUSDT": "9967eba05ce9cd2b76d03ff937b599ef637c26e115eb1e4acfe46579086871b6",
}


def test_the_btcusdt_row_keeps_the_series_key_id_production_already_wrote() -> None:
    """The derivation must be a NO-OP on `BTCUSDT`: `base_asset("BTCUSDT") == "BTC"`.

    This is the anti-regression half of A1. `BTCUSDT`'s `klines_volume` rows are ALREADY on
    disk under the id below, written before this change; if deriving the unit moved it, every
    chart that resolves today would start answering `422` with the data still sitting there.
    """
    volume_rows = [
        entry
        for entry in list_series_catalog("BTCUSDT").entries
        if entry.key.metric == KLINES_VOLUME_METRIC
    ]

    assert len(volume_rows) == 1
    assert volume_rows[0].key.series_key_id() == _PRODUCTION_KLINES_VOLUME_IDS["BTCUSDT"]


def test_the_served_catalog_resolves_every_klines_volume_id_on_disk() -> None:
    """A2, measured against production: 1 of these 4 resolved before the fix, 4 after.

    MORDE, and it is the whole point of the finding: `entry_for_id` returning `None` is what
    `/api/v1/series-history` turns into `422 UnknownSeriesKeyIdError` — for rows that ARE in
    `md.series`. Revert `list_pilot_series_catalog` to the single-instrument catalog and the
    three non-`BTC` assertions below fail, which is the shape the production bug had.
    """
    catalog = list_pilot_series_catalog()

    for instrument_id, series_key_id in _PRODUCTION_KLINES_VOLUME_IDS.items():
        entry = catalog.entry_for_id(series_key_id)
        assert entry is not None, f"{instrument_id} is on disk and unaddressable in the catalog"
        assert entry.key.instrument_id == instrument_id


# ── A2: THE SERVED CATALOG COVERS THE PILOT UNIVERSE, NOT ONE INSTRUMENT ────────────────────


def test_the_pilot_universe_is_the_four_symbols_the_collector_writes() -> None:
    """`PILOT_INSTRUMENT_IDS` is not a second list — it is the writer's own `INITIAL_SYMBOLS`.

    MORDE: declare the reader's universe by hand and the two sides drift the day a symbol is
    added to the collector, with the symptom being a chart that is simply absent.
    """
    assert set(PILOT_INSTRUMENT_IDS) == set(INITIAL_SYMBOLS)
    assert len(PILOT_INSTRUMENT_IDS) == len(INITIAL_SYMBOLS) == 4
    assert PILOT_INSTRUMENT_IDS[0] == "BTCUSDT"


def test_the_served_catalog_has_twelve_rows_per_pilot_instrument() -> None:
    """`12 x 4 = 48`, every id distinct — `instrument_id` is a term of the key."""
    catalog = list_pilot_series_catalog()

    assert len(catalog.entries) == 48
    ids = [entry.key.series_key_id() for entry in catalog.entries]
    assert len(set(ids)) == 48
    assert {entry.key.instrument_id for entry in catalog.entries} == set(PILOT_INSTRUMENT_IDS)


def test_the_pilot_catalog_appends_and_never_reorders_the_btcusdt_prefix() -> None:
    """`RS-1`: order is FORM. The twelve `BTCUSDT` rows keep the indices they already had."""
    served = [entry.key.series_key_id() for entry in list_pilot_series_catalog().entries]
    btcusdt = [entry.key.series_key_id() for entry in list_series_catalog("BTCUSDT").entries]

    assert served[: len(btcusdt)] == btcusdt


def test_a_repeated_instrument_is_refused_instead_of_publishing_the_row_twice() -> None:
    """MORDE: concatenating without re-validating would serve two rows under one id.

    `build_series_catalog` re-checks `SPEC-001` §3.3 over the CONCATENATION, so the duplicate
    surfaces as a raise at construction rather than as an envelope whose `n_entries` counts
    the same series twice.
    """
    with pytest.raises(DuplicateSeriesKeyError):
        list_pilot_series_catalog(("BTCUSDT", "BTCUSDT"))


# ── `T-02.4` (`SPEC-007` §4.5, `RF-2`): THE CVD ROW IS SERVED, NOT MERELY BUILT ────────────


def test_kline_takerbuy_is_registered_in_the_catalog_the_route_serves() -> None:
    """The row `T-02.2` built reaches the SERVED catalog, which is a different claim.

    A `SeriesCatalogEntry` that exists in `domain/` and is never concatenated here is
    unaddressable: `/api/v1/series-history` answers `422 UnknownSeriesKeyIdError` for its id
    while the collector happily writes its rows to `md.series`. This test is what makes
    `SPEC-007` §4.5's "reusar nao e nao fazer nada" a measurement instead of a slogan.
    """
    catalog = list_series_catalog()
    expected = build_kline_takerbuy_entry("BTCUSDT", unit="BTC")

    assert catalog.entry_for_id(expected.key.series_key_id()) == expected


def test_series_history_no_longer_refuses_the_kline_takerbuy_id() -> None:
    """`DoD 2`'s precondition, asserted at the function that actually raises the `422`.

    Morde: drop the append in `list_series_catalog` and this raises `UnknownSeriesKeyIdError`
    — which the route maps to `422`, and which a front end sees as an empty `CvdPane` with no
    explanation of why. `test_an_unregistered_id_still_raises_unknown_series_key_id_error`
    above is what keeps this from passing because the guard was deleted rather than satisfied.
    """
    catalog = list_series_catalog()
    series_key_id = build_kline_takerbuy_entry("BTCUSDT", unit="BTC").key.series_key_id()

    report = build_series_history_report(
        catalog,
        _EmptyWindowReader(),
        _classify_panel_grid,
        series_key_id=series_key_id,
        symbol="BTCUSDT",
        interval="1m",
        window_start_ms=1_700_000_000_000,
        window_end_ms=1_700_000_060_000,
        knowledge_time_ms=1_700_000_120_000,
        bar_policy=BarPolicy.FINAL_ONLY,
    )

    assert report.panel_series_key_id == series_key_id
    assert report.panel_nature == Nature.FLOW.value


def test_the_served_cvd_row_is_the_one_the_collector_writes_under() -> None:
    """Served id == written id, for all four pilot instruments — not only for `BTCUSDT`.

    `unit` is a term of the key and the writer derives it from the instrument (`base_asset`),
    so a served catalog that hardcoded one unit would resolve `BTCUSDT` and silently strand the
    other three — the failure `PILOT_INSTRUMENT_IDS` exists to have fixed, re-checked here for
    the identity phase `02` adds.
    """
    served = {entry.key.series_key_id() for entry in list_pilot_series_catalog().entries}
    bucket_open_ms = 1_700_000_000_000
    page = (
        KlineRow(
            raw=(
                bucket_open_ms,
                "1",
                "1",
                "1",
                "1",
                "10.0",
                bucket_open_ms + 59_999,
                "1",
                1,
                "7.5",
                "1",
                "0",
            )
        ),
    )

    for symbol in sorted(INITIAL_SYMBOLS):
        rows = build_klines_to_rows()(bucket_open_ms + 120_000, symbol, page)
        assert len(rows) == 2
        assert {row.series_key_id for row in rows} <= served
