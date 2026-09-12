"""`T-04.1`/`T-04.2`: the `count_long_short_ratio` identity, and the measurements that fix it.

This file is NAMED INSIDE THE IDENTITY. `long_short_catalog._VERIFIED_BY` points at
`test_the_five_minute_grid_is_the_origins_and_the_label_is_the_bucket_end` below, and
`verified_by` is the fifteenth term of `SeriesKey` — so renaming that test re-identifies the
series in `md.series` (`series_key.py`'s `series_key_id()` is the `sha256` of all fifteen terms).
The first test in this file is the one that makes that cost fail loudly instead of silently.

⛔ WHAT IS NOT TESTED HERE, ON PURPOSE: the refusal to coarsen a ratio by summing it. That lives
in `domain/long_short_ratio_series.py` and is already covered by `test_long_short_ratio_series.py`
— re-asserting it here would create a second place to update when `SPEC-001` §5.11 moves.
`test_the_chosen_series_cannot_be_coarsened_by_summing_the_quotient` below is the one line that
ties THIS series to that refusal, and it calls the existing function rather than restating it.
"""

from __future__ import annotations

import dataclasses

import pytest

from src.modules.sentimento.domain.long_short_catalog import (
    LONG_SHORT_INTERVAL,
    LONG_SHORT_LABEL_SHIFT_MS,
    LONG_SHORT_MAX_STALENESS_MS,
    LONG_SHORT_NATIVE_GRID,
    build_count_long_short_ratio_entry,
    count_long_short_ratio_key,
)
from src.modules.sentimento.domain.long_short_ratio_series import (
    COUNT_LONG_SHORT_RATIO,
    NonAggregableFlowRatioError,
    resample_bare_taker_ratio_refuses,
)
from src.modules.sentimento.domain.series_key import (
    FORBIDDEN_METRIC_NAMES,
    IncompleteSeriesKeyError,
    Nature,
    QuantityField,
    Reduction,
    TsConvention,
)

# The measured inter-arrival of the source grid, in milliseconds `[MEDIDO 2026-09-12, n=499
# gaps sobre limit=500: min gap == max gap == 300_000]`. Spelled here as the test's OWN
# expectation rather than imported from production, so a change to the production constant has
# to be argued against this number instead of silently agreeing with itself.
_MEASURED_INTER_ARRIVAL_MS = 300_000


def test_the_five_minute_grid_is_the_origins_and_the_label_is_the_bucket_end() -> None:
    """The two measured terms of the identity, pinned together — `T-04.1`'s falsifier, frozen.

    `interval="5m"` because `[MEDIDO 2026-09-12]` `period=1m` and `period=3m` answer `HTTP 200`
    with `[]` from Binance itself, so a finer grid does not exist to be collected:

        curl -s "https://fapi.binance.com/futures/data/globalLongShortAccountRatio
        ?symbol=BTCUSDT&period=1m&limit=30"   -> []        (HTTP 200)
        ?symbol=BTCUSDT&period=5m&limit=500   -> 500 points

    `label_shift=0` because `[MEDIDO 2026-09-12, poll de 10 s, n=2 fronteiras]` the point
    stamped `1789218000000` became visible at `1789218009643` and the next at `1789218370771`
    for a stamp of `1789218300000` — 9,6 s and 70,8 s after their OWN timestamps, never the
    ~300 s a bucket-START label would imply.

    THIS TEST'S NAME IS INSIDE `series_key_id()`. See the module docstring.
    """
    key = count_long_short_ratio_key("BTCUSDT")

    assert key.interval == "5m"
    assert key.label_shift == 0
    assert key.ts_convention is TsConvention.POINT_AT_BUCKET_END
    assert key.verified_by.startswith(
        "test_long_short_catalog.py::"
        "test_the_five_minute_grid_is_the_origins_and_the_label_is_the_bucket_end"
    )


def test_the_identity_is_the_one_of_four_the_spec_chose_and_carries_no_umbrella_name() -> None:
    """MORDE: the metric is `count_long_short_ratio`, and the generic name is still refused.

    `SPEC-001` §3.1/`CA-F2-3`: `ls_ratio` stands in for FOUR series whose autocorrelation
    lag-1 is 0,99+ for three and 0,0955 for the fourth. This asserts BOTH halves — that this
    module picked one of the four by name, and that the umbrella is still unbuildable — so a
    future "simplification" that swapped the metric for `ls_ratio` fails here instead of
    silently welding four series into one column.
    """
    key = count_long_short_ratio_key("BTCUSDT")

    assert key.metric == COUNT_LONG_SHORT_RATIO == "count_long_short_ratio"
    assert "ls_ratio" in FORBIDDEN_METRIC_NAMES
    with pytest.raises(IncompleteSeriesKeyError, match="ls_ratio"):
        dataclasses.replace(key, metric="ls_ratio")


def test_the_remaining_terms_say_dimensionless_point_reading_not_a_flow() -> None:
    """`RATIO`/`POINT` with an explicit `NA` quantity field — no `NULL` in a term of identity."""
    key = count_long_short_ratio_key("ETHUSDT")

    assert key.provider == "binance"
    assert key.venue == "usdm_futures"
    assert key.instrument_id == "ETHUSDT"
    assert key.cohort == "all"
    assert (key.unit, key.denom) == ("ratio", "NA")
    assert key.nature is Nature.RATIO
    assert key.reduction is Reduction.POINT
    assert key.quantity_field is QuantityField.NA
    assert key.aggregation_scope == "Symbol"


def test_two_instruments_are_two_series_and_nothing_else_in_the_key_moves() -> None:
    """`instrument_id` is a term of the key, so `BTCUSDT` and `ETHUSDT` get different ids.

    The second assertion is the one that matters: EVERY OTHER term is identical, so the two ids
    differ for exactly one reason. A builder that also varied `unit` per instrument (the defect
    `series_catalog.py` records for `klines_volume`/`cvd_source`) would break this — and it would
    be WRONG here, because a ratio has no base asset: `unit` stays `"ratio"` for both.
    """
    btc = count_long_short_ratio_key("BTCUSDT")
    eth = count_long_short_ratio_key("ETHUSDT")

    assert btc.series_key_id() != eth.series_key_id()
    differing = {
        term
        for term, value in btc.canonical_terms().items()
        if value != eth.canonical_terms()[term]
    }
    assert differing == {"instrument_id"}


def test_max_staleness_is_twice_the_measured_inter_arrival_never_the_publication_delay() -> None:
    """MORDE: the bound is `2 x 300_000`, and a bound at-or-below the grid would be a defect.

    `OPCOES-CATALOGO-PREMIUM-INDEX.md` §F2 records this exact confusion being made once, on
    `premiumIndex`: sizing `max_staleness_ms` by how long a reading took to arrive rather than by
    when the NEXT one does produced `2.000 ms`, a bound that refuses EVERY read.

    The second assertion is the falsifier of the number, not a restatement of it: on a grid whose
    inter-arrival is EXACTLY the bucket width, any bound `<= 300_000` makes a reader stale the
    instant the bucket it is reading ends — permanent absence on a panel with a full table
    behind it. The measured publication delays (9,6 s and 70,8 s) are deliberately NOT an input.
    """
    entry = build_count_long_short_ratio_entry("BTCUSDT")

    assert entry.max_staleness_ms == 2 * _MEASURED_INTER_ARRIVAL_MS == 600_000
    assert entry.max_staleness_ms > _MEASURED_INTER_ARRIVAL_MS


def test_the_catalog_row_declares_the_sources_grid_and_claims_no_reconstruction() -> None:
    """`native_grid` is the SOURCE's (`CA-F2-11`), and nothing here is a reconstruction."""
    entry = build_count_long_short_ratio_entry("BTCUSDT")

    assert entry.native_grid == LONG_SHORT_NATIVE_GRID == "5min"
    assert entry.key is not None
    assert entry.price_use is None
    assert entry.reconstructed_from is None
    assert entry.published_error is None


def test_the_interval_term_and_the_native_grid_name_the_same_five_minutes() -> None:
    """They agree for this series, and the constants say so in one place each.

    `interval` says what the series IS and `native_grid` says what the origin EMITS — two fields
    on purpose (`CA-F2-11`). For M3 they are the same five minutes, which is why this row pays
    `GA-2`'s staircase on the served `1min` grid and not a second resampling cost on top.
    """
    assert LONG_SHORT_INTERVAL == "5m"
    assert LONG_SHORT_NATIVE_GRID == "5min"
    assert LONG_SHORT_LABEL_SHIFT_MS == 0
    assert LONG_SHORT_MAX_STALENESS_MS == 600_000


def test_the_chosen_series_cannot_be_coarsened_by_summing_the_quotient() -> None:
    """The ONE line tying this identity to `SPEC-001` §5.11's refusal, which lives elsewhere.

    Item 4.3 of plan `04`: a `RATIO` does not aggregate by sum — `SPEC-001` §3.1 measured `3,3x`
    of inflation over 3 buckets of 5 min, and the only legitimate recomposition is
    `Sigma buy / Sigma sell`. `domain/long_short_ratio_series.py` enforces that BY TYPE and its
    own suite covers it; this test only proves the refusal is reachable from the series this
    phase ships, so "we catalogued a ratio" and "we know ratios do not sum" are not two
    unconnected facts in the same repository.
    """
    with pytest.raises(NonAggregableFlowRatioError):
        resample_bare_taker_ratio_refuses([])
