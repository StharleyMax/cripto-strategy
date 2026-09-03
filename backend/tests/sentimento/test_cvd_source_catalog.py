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
    REGISTERED_CVD_SOURCES,
    CvdSourceMeasurement,
    InvalidCvdSourceMeasurementError,
    RefutedTailHypothesis,
    TailCause,
    build_aggtrade_nq_entry,
    build_aggtrade_q_entry,
    build_coinalyze_bv_entry,
    build_cvd_source_catalog_entries,
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


def test_registered_cvd_sources_is_the_three_this_task_populates() -> None:
    """`T-06.9` registers exactly `aggtrade_q`, `aggtrade_nq`, `coinalyze_bv` — no more."""
    assert REGISTERED_CVD_SOURCES == frozenset({"aggtrade_q", "aggtrade_nq", "coinalyze_bv"})
    assert REGISTERED_CVD_SOURCES <= CVD_SOURCES


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


def test_build_cvd_source_catalog_entries_returns_the_three_registered_sources() -> None:
    """The three rows coexist in one catalog without a `DuplicateSeriesKeyError`."""
    entries = build_cvd_source_catalog_entries("BTCUSDT", unit="BTC", verified_by=_VERIFIED_BY)

    assert len(entries) == 3
    catalog = build_series_catalog(entries)
    assert len(catalog.entries) == 3


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
