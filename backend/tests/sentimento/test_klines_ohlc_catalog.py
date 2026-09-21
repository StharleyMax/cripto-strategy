"""`klines_ohlc` is a NEW identity of four rows, and this file is the one `verified_by` names.

Phase `01` items 1.1 + 1.2 (`SPEC-008` §3.4, `RF-2`, `D1`). The DoD is circular by design and
the circle is the point: `series_key_id()` is the `sha256` of all fifteen terms INCLUDING
`verified_by`, so the name of THIS FILE is part of what the four series ARE. Renaming the
series later is a migration of every stored id, which is why item 1.2 checks the name here,
before a single row exists, instead of after.

Every claim below is proven by a case that REJECTS, not by an assertion that the code agrees
with itself: the metric's suffix is DERIVED from the four reductions, the `FORBIDDEN_METRIC_
NAMES` guard is exercised with a name it must refuse, and `verified_by` is mutated to show the
identity moving.
"""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import pytest

from src.modules.sentimento.domain.instrument import SymbolNotQuotedInUsdtError
from src.modules.sentimento.domain.klines_ohlc_catalog import (
    KLINES_OHLC_INTERVAL,
    KLINES_OHLC_LABEL_SHIFT_MS,
    KLINES_OHLC_MAX_STALENESS_MS,
    KLINES_OHLC_METRIC,
    KLINES_OHLC_NATIVE_GRID,
    KLINES_OHLC_NATIVE_GRID_MS,
    KLINES_OHLC_REDUCTIONS,
    build_klines_ohlc_entry,
    build_klines_ohlc_key,
    klines_ohlc_catalog_entries,
    quote_asset,
)
from src.modules.sentimento.domain.klines_volume_catalog import build_klines_volume_entry
from src.modules.sentimento.domain.open_interest_catalog import open_interest_catalog_entries
from src.modules.sentimento.domain.price_source_catalog import (
    PRICE_SOURCES,
    build_klines_last_entry,
    build_price_mark_close_entry,
)
from src.modules.sentimento.domain.series_catalog import build_series_catalog
from src.modules.sentimento.domain.series_key import (
    FORBIDDEN_METRIC_NAMES,
    IncompleteSeriesKeyError,
    Nature,
    QuantityField,
    Reduction,
    TsConvention,
)

_VERIFIED_BY = "test_klines_ohlc_catalog.py"


# ── The normative row, term by term (`SPEC-008` §3.4) ───────────────────────────────────────


@pytest.mark.parametrize("reduction", KLINES_OHLC_REDUCTIONS)
def test_every_klines_ohlc_row_is_spec_008_section_3_4_transcribed(reduction: Reduction) -> None:
    """All fifteen terms plus the catalog-only fields, against the normative table.

    One assertion per term rather than a comparison against a prebuilt `SeriesKey`: a prebuilt
    expected key would be the same constructor call twice, and that passes even when both
    copies are wrong together.
    """
    entry = build_klines_ohlc_entry(reduction, instrument_id="BTCUSDT", verified_by=_VERIFIED_BY)
    key = entry.key

    assert key.provider == "binance"
    assert key.venue == "usdm_futures"
    assert key.instrument_id == "BTCUSDT"
    assert key.metric == "klines_ohlc"
    assert key.cohort == "all"
    assert key.interval == "1m"
    assert key.unit == "USDT"
    assert key.denom == "quote"
    assert key.nature is Nature.STOCK
    assert key.ts_convention is TsConvention.OHLC_OVER_BUCKET
    assert key.reduction is reduction
    assert key.quantity_field is QuantityField.NA
    assert key.label_shift == 0
    assert key.aggregation_scope == "Symbol"
    assert key.verified_by == _VERIFIED_BY

    assert entry.native_grid == "1min"
    assert entry.native_grid_ms == 60_000
    assert entry.max_staleness_ms == 120_000


def test_exported_constants_are_the_values_the_rows_carry() -> None:
    """The module constants are not a second, driftable copy of what the rows hold."""
    entry = build_klines_ohlc_entry(
        Reduction.HIGH, instrument_id="BTCUSDT", verified_by=_VERIFIED_BY
    )

    assert KLINES_OHLC_METRIC == entry.key.metric
    assert KLINES_OHLC_INTERVAL == entry.key.interval
    assert KLINES_OHLC_LABEL_SHIFT_MS == entry.key.label_shift
    assert KLINES_OHLC_NATIVE_GRID == entry.native_grid
    assert KLINES_OHLC_NATIVE_GRID_MS == entry.native_grid_ms
    assert KLINES_OHLC_MAX_STALENESS_MS == entry.max_staleness_ms
    assert KLINES_OHLC_MAX_STALENESS_MS == 2 * KLINES_OHLC_NATIVE_GRID_MS


# ── Item 1.2: the NAME, checked before any row is written ───────────────────────────────────


def test_the_metric_name_is_not_one_the_spec_forbids() -> None:
    """`FORBIDDEN_METRIC_NAMES` is the enforcement, and this row submits to it."""
    assert KLINES_OHLC_METRIC not in FORBIDDEN_METRIC_NAMES


@pytest.mark.parametrize("forbidden", sorted(FORBIDDEN_METRIC_NAMES))
def test_the_forbidden_name_guard_actually_rejects_and_is_not_decoration(forbidden: str) -> None:
    """THE CASE THAT REJECTS: the guard the row passes is one that really bites.

    `test_the_metric_name_is_not_one_the_spec_forbids` on its own would also pass if
    `FORBIDDEN_METRIC_NAMES` were empty or if `SeriesKey.__post_init__` had stopped consulting
    it — a green that measures nothing (`ADR-012`'s `rc=0` shape). This builds the SAME key
    this module builds, changing only `metric` to a forbidden name, and requires the refusal.
    """
    real = build_klines_ohlc_key(Reduction.OPEN, instrument_id="BTCUSDT", verified_by=_VERIFIED_BY)

    with pytest.raises(IncompleteSeriesKeyError, match=forbidden):
        replace(real, metric=forbidden)


def test_the_metric_follows_the_endpoint_field_convention_the_siblings_use() -> None:
    """`<endpoint>_<field/reduction>`, with the suffix DERIVED from the four reductions.

    The suffix is not compared against the literal `"ohlc"` typed a second time: it is built
    from `KLINES_OHLC_REDUCTIONS` itself, so dropping `LOW`, reordering the tuple, or adding a
    fifth reading makes the name and the identity disagree HERE — at the one moment renaming
    is still free, rather than after `series_key_id()` is stored on millions of rows.

    The prefix is the endpoint, the same one `klines_volume` and `klines_last` transcribe:
    `/fapi/v1/klines`. It is deliberately NOT `sum_…`, which in this repository transcribes a
    Binance field name (`sumOpenInterest`) that this endpoint does not publish.
    """
    suffix = "".join(reduction.value[0].lower() for reduction in KLINES_OHLC_REDUCTIONS)

    assert KLINES_OHLC_METRIC == f"klines_{suffix}"
    assert KLINES_OHLC_METRIC == "klines_ohlc"
    assert not KLINES_OHLC_METRIC.startswith("sum_")
    assert (
        KLINES_OHLC_METRIC.split("_")[0]
        == build_klines_volume_entry(
            "BTCUSDT", unit="BTC", verified_by=_VERIFIED_BY
        ).key.metric.split("_")[0]
    )


def test_one_metric_over_four_rows_is_not_the_ls_ratio_umbrella() -> None:
    """The near miss, made measurable: these four differ in exactly ONE term, `reduction`.

    `ls_ratio` is forbidden because one generic name stood in for four series that NO term of
    the fifteen separated. Here the separation IS a term, and the proof is pairwise: every two
    of the four rows differ in `reduction` and in nothing else, and all four enter a single
    `SeriesCatalog`, whose `__post_init__` raises `DuplicateSeriesKeyError` the day that stops
    being true.
    """
    keys = [
        build_klines_ohlc_key(reduction, instrument_id="BTCUSDT", verified_by=_VERIFIED_BY)
        for reduction in KLINES_OHLC_REDUCTIONS
    ]

    assert len({key.series_key_id() for key in keys}) == 4
    assert len({key.metric for key in keys}) == 1
    for left in keys:
        for right in keys:
            if left is right:
                continue
            differing = {
                term
                for term, value in left.canonical_terms().items()
                if value != right.canonical_terms()[term]
            }
            assert differing == {"reduction"}


def test_the_same_shape_is_already_in_production_for_open_interest() -> None:
    """The precedent is not cited, it is counted: `sum_open_interest` is four rows over one name.

    `SPEC-008` §3.2 rests `D1` on this fact ("a prova viva é o OI"), so the fact is measured
    here rather than believed — if the OI catalog ever collapses its four readings, the
    argument this module's docstring makes stops holding and this test says so.
    """
    oi_rows = [
        entry
        for entry in open_interest_catalog_entries("BTCUSDT").entries
        if entry.key.ts_convention is TsConvention.OHLC_OVER_BUCKET
    ]

    assert len(oi_rows) == 4
    assert {entry.key.metric for entry in oi_rows} == {"sum_open_interest"}
    assert {entry.key.reduction for entry in oi_rows} == set(KLINES_OHLC_REDUCTIONS)


# ── The four rows are four series, and they collide with nothing that already exists ────────


def test_the_four_rows_coexist_with_every_other_series_on_the_same_endpoint() -> None:
    """`klines_ohlc`, `klines_volume`, `klines_last` and `price_mark_close` in ONE catalog.

    `SeriesCatalog.__post_init__` refuses two rows over the same `SeriesKey`, so a catalog
    that accepts all seven is the proof that this task CREATED an identity rather than
    colliding with one already in production.
    """
    rows = [
        build_klines_ohlc_entry(reduction, instrument_id="BTCUSDT", verified_by=_VERIFIED_BY)
        for reduction in KLINES_OHLC_REDUCTIONS
    ]
    rows.append(build_klines_volume_entry("BTCUSDT", unit="BTC", verified_by=_VERIFIED_BY))
    rows.append(build_klines_last_entry("BTCUSDT", verified_by=_VERIFIED_BY))
    rows.append(build_price_mark_close_entry("BTCUSDT", verified_by=_VERIFIED_BY))

    catalog = build_series_catalog(rows)

    assert len(catalog.entries) == 7
    assert len({entry.key.series_key_id() for entry in catalog.entries}) == 7


def test_the_candle_is_sourced_from_klines_and_never_from_the_subsampled_mark_price() -> None:
    """`PRD-008`/`I-3`: the mark price undersamples the EXTREMES, which are `HIGH` and `LOW`.

    The mark price is read at `count=300` per bucket against a mean of 11.245 trades per
    bucket (`price_source_catalog.py`), so a wick built from it is short — and a short wick
    raises nothing, it just draws a smaller candle. The identity is what forbids the
    substitution: these rows carry `klines_ohlc`, never the `price_mark_close` metric.
    """
    high = build_klines_ohlc_key(Reduction.HIGH, instrument_id="BTCUSDT", verified_by=_VERIFIED_BY)
    mark = build_price_mark_close_entry("BTCUSDT", verified_by=_VERIFIED_BY).key

    assert high.metric == "klines_ohlc"
    assert mark.metric == "price_mark_close"
    assert high.series_key_id() != mark.series_key_id()


def test_a_price_level_is_a_stock_and_the_volume_off_the_same_array_is_not() -> None:
    """`STOCK` + `OHLC_OVER_BUCKET` is a claim about the READ path, not a label.

    Both series are read from the same 12-field array of the same bucket, and they take
    opposite readings on purpose: a price is a LEVEL, so `LOCF` over it is legitimate and a
    sum is a type error; traded volume is a FLOW, where `LOCF` invents trades that did not
    happen (`RN-1`). Declaring `FLOW` here would license the renderer to carry a candle
    forward across a gap instead of leaving whitespace (`SPEC-008` §3.5).
    """
    price = build_klines_ohlc_key(
        Reduction.CLOSE, instrument_id="BTCUSDT", verified_by=_VERIFIED_BY
    )
    volume = build_klines_volume_entry("BTCUSDT", unit="BTC", verified_by=_VERIFIED_BY).key

    assert price.nature is Nature.STOCK
    assert price.ts_convention is TsConvention.OHLC_OVER_BUCKET
    assert volume.nature is Nature.FLOW
    assert price.quantity_field is QuantityField.NA
    assert volume.quantity_field is QuantityField.NA


def test_klines_ohlc_is_not_a_price_source_and_declares_no_price_use() -> None:
    """`SPEC-001` §3.7's closed set has five names, and `SPEC-008` §2.1 does not reopen it.

    These rows exist so the panel can DRAW the body and the wick, not so a decision path can
    route a price question to them. A `price_use` claimed here would reopen `ADR-007`/`PS-1`
    through a side door — the choice of price grandeza "decides where the swing is".
    """
    entry = build_klines_ohlc_entry(
        Reduction.OPEN, instrument_id="BTCUSDT", verified_by=_VERIFIED_BY
    )

    assert KLINES_OHLC_METRIC not in PRICE_SOURCES
    assert entry.price_use is None


def test_interval_is_the_grid_series_history_serves_natively() -> None:
    """`interval == native_grid` is what exempts these rows from `RN-S1`'s staircase.

    `/api/v1/series-history` walks a 1-minute grid (`ADR-034/D6`). A `5m` series is served as
    the same bar repeated five times, which `RN-S1` forbids counting as distinct points — and
    for a CANDLE a repeated bar is worse than a staircase: it is four identical readings, the
    degenerate candle arriving through the data instead of through the view model.
    """
    entry = build_klines_ohlc_entry(
        Reduction.LOW, instrument_id="BTCUSDT", verified_by=_VERIFIED_BY
    )
    five_minute = build_klines_last_entry("BTCUSDT", verified_by=_VERIFIED_BY)

    assert entry.key.interval == "1m"
    assert entry.native_grid == "1min"
    assert entry.key.interval != five_minute.key.interval


def test_the_rows_are_read_from_the_origin_and_declare_no_reconstruction() -> None:
    """`reconstructed_from=None` ⇒ `published_error=None`, and the guard enforces the pair."""
    for reduction in KLINES_OHLC_REDUCTIONS:
        entry = build_klines_ohlc_entry(
            reduction, instrument_id="BTCUSDT", verified_by=_VERIFIED_BY
        )
        assert entry.reconstructed_from is None
        assert entry.published_error is None


# ── `unit`/`denom`: the quote asset is READ off the symbol, never assumed ───────────────────


def test_unit_is_the_quote_asset_and_a_symbol_that_does_not_declare_one_is_refused() -> None:
    """A `…USDC` pair labelled `USDT` would be a different `series_key_id`, not a typo.

    `unit` is one of the fifteen terms, so a wrong one silently points the series at an id
    nothing else writes to, and `/api/v1/series-history` answers it with zero points instead
    of an error (`instrument.py`'s own reading). The refusal is therefore part of building the
    row, not a later validation.
    """
    assert quote_asset("BTCUSDT") == "USDT"
    assert quote_asset("ETHUSDT") == "USDT"

    with pytest.raises(SymbolNotQuotedInUsdtError, match="BTCUSDC"):
        build_klines_ohlc_key(Reduction.OPEN, instrument_id="BTCUSDC", verified_by=_VERIFIED_BY)


def test_the_instrument_id_travels_into_the_identity() -> None:
    """Two symbols are two series: the same reduction over `ETHUSDT` is not the `BTCUSDT` row."""
    btc = build_klines_ohlc_key(Reduction.CLOSE, instrument_id="BTCUSDT", verified_by=_VERIFIED_BY)
    eth = build_klines_ohlc_key(Reduction.CLOSE, instrument_id="ETHUSDT", verified_by=_VERIFIED_BY)

    assert btc.series_key_id() != eth.series_key_id()
    assert eth.instrument_id == "ETHUSDT"
    assert eth.unit == "USDT"


# ── `reduction` has no default, and asking without it is an error ───────────────────────────


def test_asking_for_the_candle_without_saying_which_reading_is_a_type_error() -> None:
    """`CA-F2-17`/`D6.7` applied here: four answers, and none of them is the default.

    A defaulted `reduction` is how `HIGH` becomes `LOW` with nothing reproving — the caller
    believes it asked for "the candle" and got one of four readings picked in silence.
    """
    with pytest.raises(TypeError, match="reduction"):
        build_klines_ohlc_key(instrument_id="BTCUSDT", verified_by=_VERIFIED_BY)  # type: ignore[call-arg]


def test_the_catalog_builder_emits_exactly_the_four_readings() -> None:
    """`klines_ohlc_catalog_entries` is the whole set, validated by `build_series_catalog`."""
    catalog = klines_ohlc_catalog_entries("BTCUSDT", verified_by=_VERIFIED_BY)

    assert len(catalog.entries) == 4
    assert [entry.key.reduction for entry in catalog.entries] == list(KLINES_OHLC_REDUCTIONS)
    assert {entry.key.reduction for entry in catalog.entries} == {
        Reduction.OPEN,
        Reduction.HIGH,
        Reduction.LOW,
        Reduction.CLOSE,
    }


# ── `verified_by` — the DoD, proven by mutation rather than asserted ────────────────────────


@pytest.mark.parametrize("reduction", KLINES_OHLC_REDUCTIONS)
def test_verified_by_is_inside_the_identity_of_all_four_rows(reduction: Reduction) -> None:
    """THE MUTATION THAT REJECTS: change only the test name, and the series changes.

    This is the DoD of `T-01.1` in executable form — "o nome do teste entra no termo
    `verified_by` das 4 SeriesKey". Two rows identical in every other term must NOT share an
    id, and the differing set must be exactly `{"verified_by"}`: a weaker assertion (ids
    differ) would also pass if the builder had changed two terms at once.
    """
    real = build_klines_ohlc_key(reduction, instrument_id="BTCUSDT", verified_by=_VERIFIED_BY)
    mutated = build_klines_ohlc_key(
        reduction, instrument_id="BTCUSDT", verified_by="test_something_else.py"
    )

    assert real.series_key_id() != mutated.series_key_id()

    differing = {
        term
        for term, value in real.canonical_terms().items()
        if value != mutated.canonical_terms()[term]
    }
    assert differing == {"verified_by"}


def test_verified_by_names_a_file_that_actually_exists() -> None:
    """The name is a REFERENCE, and a reference that resolves to nothing verifies nothing.

    `SPEC-001` §3.3 reads `verified_by` as pointing AT a test. Renaming this file without
    updating the callers fails here, which is the cheapest place to catch it: the same rename
    silently re-identifies every row built with the old string.
    """
    assert Path(__file__).name == _VERIFIED_BY
    assert (Path(__file__).parent / _VERIFIED_BY).is_file()


@pytest.mark.parametrize("blank", ["", "   "])
def test_blank_verified_by_is_refused_by_the_identity_itself(blank: str) -> None:
    """A row cannot be built claiming verification by nobody — `SeriesKey.__post_init__`."""
    with pytest.raises(IncompleteSeriesKeyError, match="verified_by"):
        build_klines_ohlc_key(Reduction.OPEN, instrument_id="BTCUSDT", verified_by=blank)
