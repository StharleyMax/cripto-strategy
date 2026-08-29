"""`SPEC-001` §2.1 as an executable contract: fifteen terms, and every one of them load-bearing."""

from __future__ import annotations

from dataclasses import MISSING, fields
from decimal import Decimal
from typing import Any

import pytest

from src.modules.sentimento.domain.series_key import (
    SERIES_KEY_TERMS,
    IncompleteSeriesKeyError,
    Nature,
    QuantityField,
    Reduction,
    SeriesKey,
    TsConvention,
    series_key_field_names,
)

# ── THE TRANSCRIPTION IS BY HAND, AND THAT IS THE POINT ───────────────────────────────────
#
# Copied character by character out of `SPEC-001` §2.1. Comparing the module's tuple against
# an import of itself would prove nothing; comparing it against a second, independent
# transcription is what catches a term being dropped, renamed or reordered — and reordering
# alone re-identifies every series in the store, because the order feeds the `sha256`.
SPEC_001_2_1_TERMS: tuple[str, ...] = (
    "provider",
    "venue",
    "instrument_id",
    "metric",
    "cohort",
    "interval",
    "unit",
    "denom",
    "nature",
    "ts_convention",
    "reduction",
    "quantity_field",
    "label_shift",
    "aggregation_scope",
    "verified_by",
)


def binance_oi_key(**overrides: Any) -> SeriesKey:
    """Build the Binance open-interest series — ONE line, `POINT` at the close of the bucket."""
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
        "verified_by": "test_series_identity.py::test_label_shift_is_a_term_with_a_witness",
    }
    terms.update(overrides)
    return SeriesKey(**terms)


def coinalyze_oi_key(reduction: Reduction) -> SeriesKey:
    """Build ONE of the four Coinalyze open-interest series — OHLC over the bucket."""
    return binance_oi_key(
        provider="coinalyze",
        ts_convention=TsConvention.OHLC_OVER_BUCKET,
        reduction=reduction,
    )


def test_the_key_carries_the_fifteen_terms_spec_001_2_1_writes() -> None:
    """The module's tuple, the dataclass fields and the hand transcription are one list."""
    assert len(SPEC_001_2_1_TERMS) == 15
    assert SERIES_KEY_TERMS == SPEC_001_2_1_TERMS
    assert series_key_field_names() == SPEC_001_2_1_TERMS


def test_no_term_of_the_identity_has_a_default() -> None:
    """`CA-F2-17`: asking without a term is an ERROR, and a default is how that stops being true.

    A default on `reduction` would make "the Coinalyze OI" resolve to one of four series in
    silence; a default on `quantity_field` would re-weld the `q`/`nq` split `ADR-001` closed.
    Introspection instead of prose, so adding one later fails here.
    """
    with_defaults = [
        field.name
        for field in fields(SeriesKey)
        if field.default is not MISSING or field.default_factory is not MISSING
    ]
    assert with_defaults == []


def test_asking_for_the_coinalyze_oi_without_reduction_is_refused() -> None:
    """`CA-F2-17`, literally: no `reduction`, no key — never a silent default."""
    incomplete = {term: getattr(binance_oi_key(), term) for term in SERIES_KEY_TERMS}
    del incomplete["reduction"]
    with pytest.raises(TypeError, match="reduction"):
        SeriesKey(**incomplete)


def test_the_coinalyze_oi_is_four_identities_and_the_binance_one_is_one() -> None:
    """`CA-F2-17` / `T-06.5`: four OHLC readings of one bucket are four series, not one column.

    Measured, and it is why the count is four and not three: the Coinalyze `c` matches
    `sumOpenInterest` of the same `create_time` to 1,86 bp median / 9,46 bp p99 (n=1.706),
    while `o(t)` equals `c(t-300)` in only 6 of 2.141 pairs `[DOC: SPEC-001 §2.1]`.
    """
    coinalyze = [
        coinalyze_oi_key(reduction).series_key_id()
        for reduction in (Reduction.OPEN, Reduction.HIGH, Reduction.LOW, Reduction.CLOSE)
    ]
    assert len(set(coinalyze)) == 4
    assert binance_oi_key().series_key_id() not in coinalyze


def test_f2_two_series_that_differ_only_in_quantity_field_are_two_identities() -> None:
    """The SPEC's global falsifier `F-2`, run forwards over the numbers that produced it.

    `F-2` fires when two series share a `SeriesKey` and their `cvd_cum` diverge. Measured on
    DOGEUSDT: `cvd_delta(q) = 4.044.402` against `cvd_delta(nq) = 3.801.205`, a gap of
    `243.197` = **6,01%** of `|cvd_delta(q)|` `[DOC: SPEC-001 §1.1]`. So if these two keys
    collided, `F-2` would have fired on this very pair — which is the SPEC's own account of
    the defect a shorter key already caused.
    """
    cvd_delta_q = Decimal("4044402")
    cvd_delta_nq = Decimal("3801205")
    divergence = cvd_delta_q - cvd_delta_nq
    assert divergence == Decimal("243197")
    assert divergence / cvd_delta_q > Decimal("0.06")

    key_q = binance_oi_key(metric="cvd_cum", quantity_field=QuantityField.Q)
    key_nq = binance_oi_key(metric="cvd_cum", quantity_field=QuantityField.NQ)
    assert key_q.series_key_id() != key_nq.series_key_id()


@pytest.mark.parametrize(
    ("term", "other_value"),
    [
        ("provider", "coinalyze"),
        ("venue", "coinm_futures"),
        ("instrument_id", "ETHUSDT"),
        ("metric", "sum_open_interest_value"),
        ("cohort", "toptrader"),
        ("interval", "15m"),
        ("unit", "USDT"),
        ("denom", "quote"),
        ("nature", Nature.FLOW),
        ("ts_convention", TsConvention.AGGREGATE_OVER_BUCKET),
        ("reduction", Reduction.CLOSE),
        ("quantity_field", QuantityField.Q),
        ("label_shift", 0),
        ("aggregation_scope", "CrossSection"),
        ("verified_by", "test_something_else.py::test_other"),
    ],
)
def test_every_one_of_the_fifteen_terms_moves_the_identity(term: str, other_value: Any) -> None:
    """Change any single term and the `series_key_id` changes — no passenger terms.

    This is the test that would catch a term being dropped from the projection while still
    living on the dataclass: the field would exist, the key would look complete, and two
    different series would share an id. That is `F-2` waiting to happen.
    """
    base = binance_oi_key()
    assert getattr(base, term) != other_value
    assert base.series_key_id() != binance_oi_key(**{term: other_value}).series_key_id()


def test_verified_by_is_inside_the_identity_and_that_is_a_cost() -> None:
    """`verified_by` moves the id, per `SPEC-001` §2.1 — recorded here because it has a price.

    §2.1 lists `verified_by` among the fifteen terms and §3.3 requires it to point at a test
    that MEASURED `label_shift`. Taken literally — which is what this module does — renaming
    that test re-identifies the series, and every stored row keyed on the old id is orphaned.
    THIS IS NOT A DECISION THIS TASK MAY MAKE: `T-04.2` transcribes the identity, it does not
    amend it. Reported to the `/architect` as a possible SPEC defect; the test exists so the
    behaviour is deliberate rather than discovered during a migration.
    """
    renamed = binance_oi_key(verified_by="test_renamed.py::test_label_shift")
    assert renamed.series_key_id() != binance_oi_key().series_key_id()


def test_label_shift_is_a_term_with_a_witness() -> None:
    """`label_shift` is a number in milliseconds and `verified_by` names who measured it.

    `event_time = create_time + 300000` for `daily/metrics`, applied ONCE to the eight columns
    `[DOC: SPEC-001 §2.2, MAE 0,000000 against `openInterestHist`, 288 vs 288]`. The Coinalyze
    shift is `+interval` in the same direction, and NOT zero.
    """
    key = binance_oi_key()
    assert key.label_shift == 300_000
    assert key.verified_by.strip()
    assert coinalyze_oi_key(Reduction.CLOSE).label_shift == 300_000


def test_na_is_an_explicit_value_and_never_none() -> None:
    """`quantity_field = NA` is a member of the closed set — `NULL` in identity does not compare."""
    assert QuantityField.NA.value == "NA"
    assert {member.value for member in QuantityField} == {"q", "nq", "NA"}
    assert binance_oi_key().canonical_terms()["quantity_field"] == "NA"


@pytest.mark.parametrize("term", ["provider", "venue", "instrument_id", "metric", "verified_by"])
def test_a_blank_textual_term_is_refused(term: str) -> None:
    """A blank term does not distinguish two series, so the key refuses to exist."""
    with pytest.raises(IncompleteSeriesKeyError, match=term):
        binance_oi_key(**{term: "   "})


def test_implied_avg_price_is_refused_as_a_metric_name() -> None:
    """`SPEC-001` §3.1 bans the name: it is `price_mark_close`, one of the four price series."""
    with pytest.raises(IncompleteSeriesKeyError, match="implied_avg_price"):
        binance_oi_key(metric="implied_avg_price")


def test_the_canonical_projection_is_the_wire_shape_and_its_order_is_the_spec_order() -> None:
    """Enums project as values; the key order is `SPEC-001` §2.1 and the `sha256` needs it."""
    projected = binance_oi_key().canonical_terms()
    assert tuple(projected) == SPEC_001_2_1_TERMS
    assert projected["nature"] == "STOCK"
    assert projected["ts_convention"] == "POINT_AT_BUCKET_END"
    assert projected["reduction"] == "POINT"


def test_the_identity_is_stable_across_constructions() -> None:
    """Two equal keys hash the same, so an id is a function of the terms and nothing else."""
    assert binance_oi_key().series_key_id() == binance_oi_key().series_key_id()
    assert len(binance_oi_key().series_key_id()) == 64
