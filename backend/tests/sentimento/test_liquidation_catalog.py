"""`T-05.3`: the `sum_liquidation` identity — two rows, and the terms that were MEASURED.

The test named in `verified_by` is INSIDE the identity (`SPEC-001` §2.1), so renaming it
re-identifies both series. That is a cost this file pays deliberately, the same way
`test_series_identity.py` does.
"""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.liquidation_catalog import (
    CONVERT_TO_USD_REQUIRED,
    LIQUIDATION_LABEL_SHIFT_MS,
    MAX_STALENESS_MS,
    NATIVE_GRID,
    UnknownLiquidationCohortError,
    coinalyze_liquidation_key,
    liquidation_catalog_entries,
)
from src.modules.sentimento.domain.series_key import (
    Nature,
    QuantityField,
    Reduction,
    TsConvention,
)


def test_the_catalog_has_two_rows_one_per_cohort_never_a_sum() -> None:
    """THE test `verified_by` names — two legs, and summing them would erase the signal."""
    catalog = liquidation_catalog_entries("BTCUSDT")
    assert len(catalog.entries) == 2
    assert sorted(entry.key.cohort for entry in catalog.entries) == ["long", "short"]
    assert all(entry.key.metric == "sum_liquidation" for entry in catalog.entries)


def test_the_two_cohorts_are_two_distinct_identities() -> None:
    """If both legs hashed to one `series_key_id`, the second would overwrite the first."""
    long_key = coinalyze_liquidation_key("long")
    short_key = coinalyze_liquidation_key("short")
    assert long_key.series_key_id() != short_key.series_key_id()
    # And they differ in EXACTLY one term, which is what makes them a cohort pair rather than
    # two unrelated series that happen to share a name.
    long_terms = long_key.canonical_terms()
    short_terms = short_key.canonical_terms()
    differing = [term for term in long_terms if long_terms[term] != short_terms[term]]
    assert differing == ["cohort"]


def test_cohort_has_no_default_so_a_leg_is_never_picked_in_silence() -> None:
    """A silent default would publish long liquidations as "the" liquidations."""
    with pytest.raises(TypeError):
        coinalyze_liquidation_key()  # type: ignore[call-arg]


def test_an_unknown_cohort_is_refused_and_the_message_names_the_two_that_exist() -> None:
    """`net` is the tempting wrong answer, so the refusal has to say what is right."""
    with pytest.raises(UnknownLiquidationCohortError, match="long"):
        coinalyze_liquidation_key("net")
    with pytest.raises(UnknownLiquidationCohortError, match="short"):
        coinalyze_liquidation_key("all")


# ── THE TERMS THAT CAME FROM A MEASUREMENT, PINNED SO THEY CANNOT DRIFT ────────────────────


def test_denom_is_quote_and_the_request_that_makes_it_true_is_pinned_with_it() -> None:
    """`T-05.1`: the provider's DEFAULT returns BASE — `denom=quote` is a lie without this."""
    key = coinalyze_liquidation_key("long")
    assert key.denom == "quote"
    assert key.unit == "USD"
    assert CONVERT_TO_USD_REQUIRED is True, (
        "denom='quote' is only true when the collector sends convert_to_usd=true; "
        "flipping this constant without re-identifying the series publishes BASE under a "
        "key labelled QUOTE"
    )


def test_the_series_is_a_flow_summed_over_the_bucket() -> None:
    """FLOW is what forbids carrying a value forward into a bucket that had no liquidation."""
    key = coinalyze_liquidation_key("short")
    assert key.nature is Nature.FLOW
    assert key.reduction is Reduction.SUM
    assert key.ts_convention is TsConvention.AGGREGATE_OVER_BUCKET
    assert key.quantity_field is QuantityField.NA


def test_label_shift_is_plus_one_interval_because_coinalyze_labels_the_bucket_start() -> None:
    """`T-05.2` measured it on THIS endpoint rather than borrowing `D6.8`'s proof."""
    assert LIQUIDATION_LABEL_SHIFT_MS == 60_000
    assert coinalyze_liquidation_key("long").label_shift == 60_000
    assert coinalyze_liquidation_key("short").label_shift == 60_000


def test_the_grid_and_the_staleness_bound_are_the_native_minute() -> None:
    """`native_grid` is a property of the SOURCE (`CA-F2-11`), spelled the provider's way."""
    assert NATIVE_GRID == "1min"
    assert MAX_STALENESS_MS == 120_000
    catalog = liquidation_catalog_entries("BTCUSDT")
    assert {entry.native_grid for entry in catalog.entries} == {"1min"}
    assert {entry.max_staleness_ms for entry in catalog.entries} == {120_000}


def test_published_error_is_absent_because_this_series_has_no_oracle() -> None:
    """The series has no oracle, so a published fidelity would be invented.

    `DoD 6c`: the only third-party series of the feature, and the only one without a second
    source. An invented `(median, p99, n)` would publish a fidelity nobody measured.
    """
    catalog = liquidation_catalog_entries("BTCUSDT")
    assert all(entry.published_error is None for entry in catalog.entries)


def test_the_identity_follows_the_instrument_and_does_not_stay_pinned_to_btc() -> None:
    """`open_interest_catalog.py` shipped `unit="BTC"` for ETH once; this pins the lesson.

    `unit` here is `USD` for every instrument BECAUSE `denom` is `quote` and the provider
    converts to USD — so, unlike open interest, it correctly does NOT follow the base asset.
    What must follow the instrument is `instrument_id`, and so must the identity.
    """
    btc = coinalyze_liquidation_key("long", instrument_id="BTCUSDT")
    eth = coinalyze_liquidation_key("long", instrument_id="ETHUSDT")
    assert btc.instrument_id == "BTCUSDT"
    assert eth.instrument_id == "ETHUSDT"
    assert btc.series_key_id() != eth.series_key_id()
    assert btc.unit == eth.unit == "USD"
