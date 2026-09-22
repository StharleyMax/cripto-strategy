"""`reduce_bucket_for_series(key, values)` — the call-site gate `T-03.5`/`ADR-040/D4` names.

`plano 03` item 3.5, `SPEC-008` §5.3, `SPEC-008/A-4`. Scope is THIS wrapper only:
`test_series_reduction.py` already proves `reduce_bucket` is total over the 8 pairs and fails
high outside them; this file proves the ONE refusal layered on top — `(RATIO, POINT)` is only
reachable for the allowlisted `metric` — and that every other pair passes through unchanged.
"""

from __future__ import annotations

import dataclasses

import pytest

from src.modules.sentimento.domain.long_short_catalog import count_long_short_ratio_key
from src.modules.sentimento.domain.long_short_ratio_series import (
    COUNT_LONG_SHORT_RATIO,
    COUNT_TOPTRADER_LONG_SHORT_RATIO,
    SUM_TAKER_LONG_SHORT_VOL_RATIO,
)
from src.modules.sentimento.domain.series_key import Nature, Reduction
from src.modules.sentimento.domain.series_reduction import (
    EmptyBucketError,
    UncoveredReductionPairError,
)
from src.modules.sentimento.domain.series_reduction_gate import (
    RATIO_POINT_METRIC_ALLOWLIST,
    DisallowedRatioPointMetricError,
    reduce_bucket_for_series,
)

_ALLOWED_KEY = count_long_short_ratio_key("BTCUSDT")


def test_the_allowlist_is_exactly_one_element_count_long_short_ratio() -> None:
    """`ADR-040/D4`, literal: allowlist de `metric` com 1 elemento — never `nature`."""
    assert RATIO_POINT_METRIC_ALLOWLIST == frozenset({COUNT_LONG_SHORT_RATIO})
    assert len(RATIO_POINT_METRIC_ALLOWLIST) == 1


def test_the_allowlisted_metric_reduces_to_last_the_closing_ratio() -> None:
    """`count_long_short_ratio` at `(RATIO, POINT)` still reduces via `last`, unchanged."""
    assert _ALLOWED_KEY.nature is Nature.RATIO
    assert _ALLOWED_KEY.reduction is Reduction.POINT

    assert reduce_bucket_for_series(_ALLOWED_KEY, [3.0, 1.0, 2.0]) == 2.0


# ── THE FALSIFIER: A DIFFERENT `metric` ON THE SAME `(RATIO, POINT)` PAIR IS REFUSED ────────
#
# `ADR-040/D4`'s own reasoning: `SeriesKey.nature` has ONE `RATIO` member for TWO behaviours, so
# a gate keyed on `nature` alone would let `last` run for every ratio the instant it carries
# `reduction=POINT`. These two cases hold `(nature, reduction)` FIXED at `(RATIO, POINT)` and
# vary ONLY `metric` — proving the refusal is keyed on the name, not on the pair, which is
# exactly what a gate-by-`nature` could not distinguish.


def test_a_second_stock_like_ratio_on_the_same_pair_is_still_refused() -> None:
    """`count_toptrader_long_short_ratio` is "RATIO de estoque" too, and still not allowlisted.

    Its own autocorrelation (0,99+, per `long_short_ratio_series.py`) makes it a PLAUSIBLE
    candidate for a future entry — which is exactly why it must not slip in by sharing `nature`
    with the one metric the julgamento actually measured. Growing the allowlist is a judgement
    call this module refuses to make for itself.
    """
    disallowed_key = dataclasses.replace(_ALLOWED_KEY, metric=COUNT_TOPTRADER_LONG_SHORT_RATIO)
    assert disallowed_key.nature is Nature.RATIO
    assert disallowed_key.reduction is Reduction.POINT

    with pytest.raises(DisallowedRatioPointMetricError) as excinfo:
        reduce_bucket_for_series(disallowed_key, [3.0, 1.0, 2.0])
    assert COUNT_TOPTRADER_LONG_SHORT_RATIO in str(excinfo.value)


def test_the_flow_shaped_ratio_on_the_same_pair_is_refused_before_any_arithmetic() -> None:
    """`sum_taker_long_short_vol_ratio` (RATIO de fluxo) MORDE — the 3,3x inflation case.

    `ADR-040/D4`: summing this metric across a bucket gives p50 `3,1809` against the true
    `0,9707`. This test never lets `reduce_bucket` compute `last` (or anything else) for it: the
    refusal happens before any arithmetic runs, on values that would otherwise SILENTLY produce
    `3.0` via `last` — a plausible-looking, still-wrong-for-a-flow-ratio number.
    """
    disallowed_key = dataclasses.replace(_ALLOWED_KEY, metric=SUM_TAKER_LONG_SHORT_VOL_RATIO)
    assert disallowed_key.nature is Nature.RATIO
    assert disallowed_key.reduction is Reduction.POINT

    with pytest.raises(DisallowedRatioPointMetricError) as excinfo:
        reduce_bucket_for_series(disallowed_key, [3.0, 1.0, 2.0])
    assert SUM_TAKER_LONG_SHORT_VOL_RATIO in str(excinfo.value)


def test_the_error_names_the_allowed_set_so_a_reader_does_not_have_to_open_the_module() -> None:
    """The message carries the metric that failed AND the set that would have passed."""
    disallowed_key = dataclasses.replace(_ALLOWED_KEY, metric=COUNT_TOPTRADER_LONG_SHORT_RATIO)

    with pytest.raises(DisallowedRatioPointMetricError) as excinfo:
        reduce_bucket_for_series(disallowed_key, [1.0])
    message = str(excinfo.value)
    assert COUNT_TOPTRADER_LONG_SHORT_RATIO in message
    assert COUNT_LONG_SHORT_RATIO in message
    assert excinfo.value.metric == COUNT_TOPTRADER_LONG_SHORT_RATIO


# ── EVERY OTHER PAIR PASSES THROUGH UNCHANGED — THIS IS A GATE, NOT A SECOND TABLE ──────────


def test_a_non_ratio_point_pair_is_never_gated_even_with_an_arbitrary_metric() -> None:
    """`(FLOW, SUM)` reduces normally regardless of `metric` — the gate is pair-specific."""
    flow_key = dataclasses.replace(
        _ALLOWED_KEY,
        metric="klines_volume",
        nature=Nature.FLOW,
        reduction=Reduction.SUM,
    )
    assert reduce_bucket_for_series(flow_key, [10.0, 20.0, 30.0]) == 60.0


def test_an_uncovered_pair_still_raises_the_underlying_error_unchanged() -> None:
    """`(STOCK, SUM)` is outside `REDUCTION_TABLE` — the gate does not swallow that failure."""
    uncovered_key = dataclasses.replace(
        _ALLOWED_KEY,
        metric="sum_open_interest",
        nature=Nature.STOCK,
        reduction=Reduction.SUM,
    )
    with pytest.raises(UncoveredReductionPairError):
        reduce_bucket_for_series(uncovered_key, [1.0, 2.0, 3.0])


def test_an_empty_bucket_still_raises_the_underlying_error_even_for_the_allowed_metric() -> None:
    """The gate runs before `reduce_bucket`, but `reduce_bucket`'s own refusals still surface."""
    with pytest.raises(EmptyBucketError):
        reduce_bucket_for_series(_ALLOWED_KEY, [])
