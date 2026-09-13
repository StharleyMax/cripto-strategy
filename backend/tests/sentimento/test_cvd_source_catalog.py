"""`cvd_source` with a published error per source — plan `06` item 6.9, `CA-F2-16`, `ADR-001`/5.

`D6.9`'s central falsifier — "tentar registrar `cvd_source` sem `(mediana, p99, n)` reprova" —
is `series_catalog.py`'s own guard (`T-06.1`); this file proves it still fires on THIS module's
shape of the row, and pins the real `coinalyze_bv` numbers this task registers.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from src.modules.sentimento.domain.cvd_source_catalog import (
    COINALYZE_BV_MEASUREMENT,
    CVD_SOURCE_METRIC,
    CVD_SOURCES,
    KLINE_TAKERBUY_VERIFIED_BY,
    REGISTERED_CVD_SOURCES,
    CvdSourceMeasurement,
    InvalidCvdSourceMeasurementError,
    RefutedTailHypothesis,
    TailCause,
    build_aggtrade_nq_entry,
    build_aggtrade_q_entry,
    build_coinalyze_bv_entry,
    build_cvd_source_catalog_entries,
    build_kline_takerbuy_entry,
)
from src.modules.sentimento.domain.series_catalog import (
    InvalidCatalogEntryError,
    PublishedError,
    SeriesCatalogEntry,
    build_series_catalog,
)
from src.modules.sentimento.domain.series_key import (
    Nature,
    QuantityField,
    Reduction,
    SeriesKey,
    TsConvention,
)

_VERIFIED_BY = "test_cvd_source_catalog.py"


def test_cvd_sources_is_spec_001_section_3_7_closed_set() -> None:
    """The six `cvd_source` values, transcribed verbatim from `SPEC-001` §3.7."""
    assert CVD_SOURCES == frozenset(
        {
            "aggtrade_q",
            "aggtrade_nq",
            "kline_takerbuy",
            "rest_taker_vol",
            "metrics_ratio",
            "coinalyze_bv",
        }
    )


def test_registered_cvd_sources_is_the_four_populated_so_far() -> None:
    """`T-06.9` registered three; `T-02.2` adds `kline_takerbuy`. The other two stay OUT.

    `rest_taker_vol` and `metrics_ratio` are still `[NAO MEDIDO]` — this assertion is what
    stops a future task from quietly registering a row for a source nobody measured.
    """
    assert REGISTERED_CVD_SOURCES == frozenset(
        {"aggtrade_q", "aggtrade_nq", "coinalyze_bv", "kline_takerbuy"}
    )
    assert REGISTERED_CVD_SOURCES <= CVD_SOURCES
    assert "rest_taker_vol" not in REGISTERED_CVD_SOURCES
    assert "metrics_ratio" not in REGISTERED_CVD_SOURCES


# ── `aggtrade_q` / `aggtrade_nq` — direct reads, NOT reconstructions ────────────────────────


def test_aggtrade_q_is_not_a_reconstruction() -> None:
    """`ADR-001`/D2: `q` is the canonical reference, not an approximation of anything."""
    entry = build_aggtrade_q_entry("BTCUSDT", unit="BTC", verified_by=_VERIFIED_BY)

    assert entry.reconstructed_from is None
    assert entry.published_error is None
    assert entry.key.quantity_field is QuantityField.Q
    assert entry.key.metric == CVD_SOURCE_METRIC


def test_aggtrade_nq_is_not_a_reconstruction() -> None:
    """`ADR-001`/D3: `nq` is a parallel direct read, not a reconstruction of `q`."""
    entry = build_aggtrade_nq_entry("BTCUSDT", unit="BTC", verified_by=_VERIFIED_BY)

    assert entry.reconstructed_from is None
    assert entry.published_error is None
    assert entry.key.quantity_field is QuantityField.NQ


def test_aggtrade_q_and_aggtrade_nq_coexist_in_one_catalog() -> None:
    """Distinguished by `quantity_field` alone (`T-04.2`) — no `DuplicateSeriesKeyError`."""
    q_entry = build_aggtrade_q_entry("BTCUSDT", unit="BTC", verified_by=_VERIFIED_BY)
    nq_entry = build_aggtrade_nq_entry("BTCUSDT", unit="BTC", verified_by=_VERIFIED_BY)

    catalog = build_series_catalog((q_entry, nq_entry))
    assert len(catalog.entries) == 2


def test_unit_is_required_and_not_hardcoded_to_btc() -> None:
    """A non-`BTC` instrument gets its own base-asset unit, never a silent `BTC` default."""
    entry = build_aggtrade_q_entry("ETHUSDT", unit="ETH", verified_by=_VERIFIED_BY)
    assert entry.key.unit == "ETH"


# ── `coinalyze_bv` — a reconstruction, gated on its published error (`D6.9`) ────────────────


def test_coinalyze_bv_is_a_reconstruction_of_aggtrade_q() -> None:
    """`coinalyze_bv` derives from an endpoint that never sees `aggTrade` — a reconstruction."""
    entry = build_coinalyze_bv_entry("BTCUSDT", unit="BTC", verified_by=_VERIFIED_BY)

    assert entry.reconstructed_from == "aggtrade_q"
    assert entry.key.quantity_field is QuantityField.NA
    assert entry.key.provider == "coinalyze"


def test_coinalyze_bv_published_error_matches_the_measured_numbers() -> None:
    """`[MEDIDO 2026-08-24]`: median 0,0000 bp / p99 29,34 bp / n=699."""
    entry = build_coinalyze_bv_entry("BTCUSDT", unit="BTC", verified_by=_VERIFIED_BY)

    assert entry.published_error is not None
    assert entry.published_error.median_bp == Decimal("0.0000")
    assert entry.published_error.p99_bp == Decimal("29.34")
    assert entry.published_error.n == 699


def test_coinalyze_bv_measurement_records_max_date_and_undiagnosed_cause() -> None:
    """`[MEDIDO 2026-08-24]`: máx 1.955,80 bp, `causa_da_cauda = NÃO DIAGNOSTICADA`."""
    assert COINALYZE_BV_MEASUREMENT.max_bp == Decimal("1955.80")
    assert COINALYZE_BV_MEASUREMENT.measured_on == date(2026, 8, 24)
    assert COINALYZE_BV_MEASUREMENT.tail_cause is TailCause.NOT_DIAGNOSED


def test_coinalyze_bv_measurement_records_the_refuted_maker_hypothesis_without_asserting_it() -> (
    None
):
    """The maker hypothesis was tested and REFUTED at 2.584,87 bp — recorded, not adopted.

    `TailCause.NOT_DIAGNOSED` (asserted above) is the falsifier: if this module instead set
    `tail_cause` to a "maker" member, it would be restating a refuted hypothesis as the answer
    — exactly the defect `CLAUDE.md` names as already having happened once in this repository.
    """
    hypotheses = COINALYZE_BV_MEASUREMENT.refuted_hypotheses
    assert len(hypotheses) == 1
    assert hypotheses[0].refuted_at_bp == Decimal("2584.87")
    assert "maker" in hypotheses[0].description.lower()


def test_build_cvd_source_catalog_entries_returns_the_three_rows_t_06_9_registered() -> None:
    """The three rows coexist in one catalog without a `DuplicateSeriesKeyError`.

    ⛔ THE FOURTH SOURCE IS DELIBERATELY ABSENT FROM THIS TUPLE, and that is not an oversight:
    grouping `kline_takerbuy` with its three siblings would INSERT it at index 3 of the served
    catalog and shift the eight rows that follow. `RS-1` forbids this feature from changing the
    FORM of `"entries"`, and the order is form — so `T-02.4` appends it at the TAIL, in
    `use_cases/series_catalog.py`. The test that it is served lives there, next to the append.
    """
    entries = build_cvd_source_catalog_entries("BTCUSDT", unit="BTC", verified_by=_VERIFIED_BY)

    assert len(entries) == 3
    catalog = build_series_catalog(entries)
    assert len(catalog.entries) == 3


def test_the_fourth_source_coexists_with_the_three_without_colliding_with_any() -> None:
    """All four `cvd_source` rows live in ONE catalog — no two agree on all fifteen terms.

    This is the assertion the count cannot make: `build_series_catalog` re-validates
    `SPEC-001` §3.3's "UMA linha por `SeriesKey`" over the combined tuple, so a fourth row that
    accidentally collided would raise here instead of silently replacing one of the three.

    Morde: give `build_kline_takerbuy_entry` `quantity_field=Q` and it collides with
    `aggtrade_q`; give it `provider="coinalyze"` and it collides with `coinalyze_bv`. Either
    mutation raises `DuplicateSeriesKeyError` on the line below.
    """
    entries = (
        *build_cvd_source_catalog_entries("BTCUSDT", unit="BTC", verified_by=_VERIFIED_BY),
        build_kline_takerbuy_entry("BTCUSDT", unit="BTC"),
    )

    catalog = build_series_catalog(entries)
    assert len(catalog.entries) == 4
    assert len({entry.key.series_key_id() for entry in entries}) == 4


# ── `kline_takerbuy` (`T-02.2`) — the fourth source, and the one that is NOT a reconstruction


def test_kline_takerbuy_is_not_a_reconstruction_because_the_falsifier_said_so() -> None:
    """`reconstructed_from` and `published_error` are BOTH `None` — `T-02.1`'s verdict.

    This is not an omission dressed as a decision: the falsifier
    (`scripts/cvd-klines-falsifier/falsify_reconstructed_from.py`) compared the expression
    against `cvd.cvd_delta_by_bucket` of the canonical `aggTrade` dump over `n=4.320` buckets
    and found 276 runs of divergent buckets, ZERO with a residual `[MEDIDO 2026-09-12,
    `gates/T-02.1-falsificador-reconstructed-from.md`]`.

    Morde: declare `reconstructed_from="aggtrade_q"` here and `SeriesCatalogEntry.__post_init__`
    (`D6.9`) refuses the row outright for lacking a `published_error` — which is exactly the
    guard that makes this pair of `None`s a claim rather than a default.
    """
    entry = build_kline_takerbuy_entry("BTCUSDT", unit="BTC")

    assert entry.reconstructed_from is None
    assert entry.published_error is None


def test_kline_takerbuy_reads_from_the_origin_and_not_from_an_aggtrade_quantity() -> None:
    """`provider="binance"` with `quantity_field=NA` — the pair that makes it the fourth row.

    Against `aggtrade_q`/`aggtrade_nq` it is `quantity_field`; against `coinalyze_bv` it is
    `provider`. No single term separates it from all three, which is why both are asserted.
    """
    entry = build_kline_takerbuy_entry("BTCUSDT", unit="BTC")
    key = entry.key

    assert key.provider == "binance"
    assert key.quantity_field is QuantityField.NA
    assert key.metric == CVD_SOURCE_METRIC
    assert key.interval == "1m"
    assert key.denom == "base"
    assert key.nature is Nature.FLOW
    assert key.reduction is Reduction.SUM
    assert key.ts_convention is TsConvention.AGGREGATE_OVER_BUCKET
    assert entry.native_grid == "1min"
    assert entry.price_use is None


def test_kline_takerbuy_carries_the_instruments_own_base_asset_never_a_default() -> None:
    """`unit` is required; `ETHUSDT` is denominated in `ETH`, and the ids differ because of it.

    Morde: default `unit` to `"BTC"` in the builder and the two ids below collapse into one,
    merging two markets into a single series.
    """
    btc = build_kline_takerbuy_entry("BTCUSDT", unit="BTC").key
    eth = build_kline_takerbuy_entry("ETHUSDT", unit="ETH").key

    assert btc.unit == "BTC"
    assert eth.unit == "ETH"
    assert btc.series_key_id() != eth.series_key_id()


def test_the_verified_by_of_this_row_has_exactly_one_home() -> None:
    """The writer and the served catalog cannot drift, because neither one spells the string.

    `verified_by` is the fifteenth term of `SeriesKey`, so it enters `series_key_id()`. Two
    copies of it (the shape `klines_volume` took) can diverge and the failure is SILENT: `200`
    with `n_points = 0`. Here the builder hardcodes the constant and no caller may override it.

    Morde: add a `verified_by` parameter to the builder and this test stops compiling the
    guarantee it names — the id would then depend on a caller nobody can enumerate.
    """
    entry = build_kline_takerbuy_entry("BTCUSDT", unit="BTC")

    assert entry.key.verified_by == KLINE_TAKERBUY_VERIFIED_BY
    assert KLINE_TAKERBUY_VERIFIED_BY == "test_cvd_source_catalog.py"
    with pytest.raises(TypeError):
        build_kline_takerbuy_entry("BTCUSDT", unit="BTC", verified_by="other")  # type: ignore[call-arg]


# ── `D6.9` itself, reproduced against THIS module's row shape ──────────────────────────────


def test_registering_a_cvd_source_reconstruction_without_published_error_is_refused() -> None:
    """`D6.9`, literal: registering `cvd_source` without `(mediana, p99, n)` REPROVA.

    Built with the exact `SeriesKey` shape `build_coinalyze_bv_entry` uses, minus the
    `published_error` — proving the refusal reached by THIS module's own construction path,
    not only by `series_catalog.py`'s isolated suite (`test_series_catalog.py`'s own version of
    this test, with a different fixture).
    """
    key = SeriesKey(
        provider="coinalyze",
        venue="usdm_futures",
        instrument_id="BTCUSDT",
        metric=CVD_SOURCE_METRIC,
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
        verified_by=_VERIFIED_BY,
    )
    with pytest.raises(InvalidCatalogEntryError, match="published_error"):
        SeriesCatalogEntry(
            key=key,
            native_grid="1min",
            native_grid_ms=60_000,
            max_staleness_ms=120_000,
            reconstructed_from="aggtrade_q",
        )


# ── `CvdSourceMeasurement` / `RefutedTailHypothesis` — the extra fields' own invariants ─────


def test_measurement_refuses_a_max_bp_below_its_own_p99() -> None:
    """The maximum of a distribution cannot be below its own 99th percentile."""
    with pytest.raises(InvalidCvdSourceMeasurementError, match="max_bp"):
        CvdSourceMeasurement(
            published_error=PublishedError(median_bp=Decimal("0"), p99_bp=Decimal("29.34"), n=699),
            max_bp=Decimal("1"),
            measured_on=date(2026, 8, 24),
            tail_cause=TailCause.NOT_DIAGNOSED,
        )


def test_refuted_tail_hypothesis_refuses_a_blank_description() -> None:
    """A refuted hypothesis with no description cannot be told apart from another on read."""
    with pytest.raises(InvalidCvdSourceMeasurementError, match="description"):
        RefutedTailHypothesis(description="  ", refuted_at_bp=Decimal("2584.87"))


@pytest.mark.parametrize("bad_bp", [Decimal("0"), Decimal("-1")])
def test_refuted_tail_hypothesis_refuses_a_non_positive_threshold(bad_bp: Decimal) -> None:
    """A magnitude of bp at which a hypothesis failed cannot be zero or negative."""
    with pytest.raises(InvalidCvdSourceMeasurementError, match="refuted_at_bp"):
        RefutedTailHypothesis(description="maker side", refuted_at_bp=bad_bp)
