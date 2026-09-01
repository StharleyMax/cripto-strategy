"""`cvd_delta` as fact, `cvd_cum(anchor)` as view — `SPEC-001` §2.6, plan 04 item 4.8.

`D4.7`/`D4.8`, run against the real `aggTrades` dump the plan pins by `md5`. The three anchor
totals below were measured on this exact fixture by THIS test's own logic —
`[MEDIDO 2026-09-01]`, command: `bash backend/scripts/test.sh -k test_cvd` over
`data/binance/aggtrades/BTCUSDT-aggTrades-2026-08-23.csv` — and they match `SPEC-001` §2.6 /
`docs/plans/SPEC-001-plataforma-dados/04_contrato_temporal.md` D4.7, which cites the same
numbers as `[MEDIDO via Decimal]`.
"""

from __future__ import annotations

import csv
from decimal import Decimal
from pathlib import Path

import pytest

from src.modules.sentimento.domain.cvd import (
    CVD_BUCKET_WIDTH_MS,
    CvdCumPoint,
    CvdDeltaFact,
    CvdTrade,
    InvalidCvdQuantityError,
    MissingCvdAnchorError,
    cvd_cum,
    cvd_delta_by_bucket,
)
from tests.helpers.data_fixtures import require_fixture

_FIXTURE_2026_08_23 = "binance/aggtrades/BTCUSDT-aggTrades-2026-08-23.csv"
_MD5_2026_08_23 = "a68d9dbdfde1d7c0d25e78eae4d798bb"

# 2026-08-23T00:00:00Z in epoch ms — the file's first bucket, and the `00:00` anchor of `D4.7`.
_DAY_START_MS = 1_787_443_200_000
_ONE_HOUR_MS = 3_600_000


def _trade(agg_id: int, minute: int, quantity: str, *, is_buyer_maker: bool) -> CvdTrade:
    """Build one trade at a given MINUTE offset from epoch 0 — enough precision for unit tests."""
    return CvdTrade(
        agg_id=agg_id,
        transact_time_ms=minute * CVD_BUCKET_WIDTH_MS,
        raw_quantity=quantity,
        is_buyer_maker=is_buyer_maker,
    )


# ── unit: the sign convention and the bucket grid ───────────────────────────────────────────


def test_buyer_maker_true_is_negative_and_false_is_positive() -> None:
    """`SPEC-001` §2.6's own reference: `-q` when the buyer is the maker (seller is aggressor)."""
    (sell_bucket,) = cvd_delta_by_bucket([_trade(1, 0, "1.5", is_buyer_maker=True)])
    (buy_bucket,) = cvd_delta_by_bucket([_trade(1, 0, "1.5", is_buyer_maker=False)])
    assert sell_bucket.value == Decimal("-1.5")
    assert buy_bucket.value == Decimal("1.5")


def test_bucket_is_transact_time_floor_divided_by_60000_literally() -> None:
    """`D4.8`, literal: `transact_time // 60000` — ms 119_999 lands in bucket 1, not bucket 2."""
    trade = CvdTrade(agg_id=1, transact_time_ms=119_999, raw_quantity="1", is_buyer_maker=False)
    (fact,) = cvd_delta_by_bucket([trade])
    assert fact.bucket_start_ms == CVD_BUCKET_WIDTH_MS


def test_two_trades_in_the_same_bucket_sum_into_one_fact() -> None:
    """A bucket is a SUM over the trades that fall in it, not one row per trade."""
    trades = [
        _trade(1, 0, "1.0", is_buyer_maker=False),
        _trade(2, 0, "0.4", is_buyer_maker=True),
    ]
    (fact,) = cvd_delta_by_bucket(trades)
    assert fact.value == Decimal("0.6")


def test_facts_are_returned_in_ascending_bucket_order_regardless_of_input_order() -> None:
    """The fact table is read by time: an out-of-order input still returns ascending buckets."""
    trades = [
        _trade(3, 2, "1", is_buyer_maker=False),
        _trade(1, 0, "1", is_buyer_maker=False),
        _trade(2, 1, "1", is_buyer_maker=False),
    ]
    facts = cvd_delta_by_bucket(trades)
    bucket_starts = [fact.bucket_start_ms for fact in facts]
    assert bucket_starts == sorted(bucket_starts)


def test_result_is_order_independent_agg_id_sort_is_a_property_not_a_display_rule() -> None:
    """`D4.8` names summation order as part of the arithmetic.

    The VALUE is order-independent for exact `Decimal` addition (commutative, no precision
    overflow at BTC-quantity scale) —
    what a shuffled, unsorted input changes is auditability, never this assertion. Stated here
    so a reader does not mistake this test for proof that skipping the sort changes a total: it
    does not, and claiming otherwise would be a number without the mutation that produces it.
    """
    forward = [
        _trade(1, 0, "1.1", is_buyer_maker=False),
        _trade(2, 0, "0.4", is_buyer_maker=True),
        _trade(3, 1, "2.0", is_buyer_maker=False),
    ]
    shuffled = [forward[2], forward[0], forward[1]]
    assert cvd_delta_by_bucket(forward) == cvd_delta_by_bucket(shuffled)


def test_an_unparseable_quantity_string_is_refused_not_treated_as_zero() -> None:
    """`InvalidCvdQuantityError`, never a silent `0` that understates the bucket."""
    with pytest.raises(InvalidCvdQuantityError, match="agg_id 7"):
        cvd_delta_by_bucket([_trade(7, 0, "not-a-number", is_buyer_maker=False)])


# ── unit: `cvd_cum` requires an anchor, and never recomputes from raw trades ────────────────


def test_cvd_cum_without_the_keyword_argument_fails_before_the_body_runs() -> None:
    """Omitting `anchor_ms` entirely is a `TypeError` at the call site — no default exists."""
    with pytest.raises(TypeError, match="anchor_ms"):
        cvd_cum([])  # type: ignore[call-arg]


def test_cvd_cum_with_an_explicit_none_anchor_refuses_with_the_named_error() -> None:
    """`D4.7`: a caller that forwards an absent anchor from a boundary gets a named refusal."""
    deltas = [CvdDeltaFact(bucket_start_ms=0, value=Decimal("1"))]
    with pytest.raises(MissingCvdAnchorError, match="D4.7"):
        cvd_cum(deltas, anchor_ms=None)


def test_cvd_cum_excludes_buckets_before_the_anchor_entirely() -> None:
    """A bucket before the anchor is DROPPED, not zeroed — the mechanism behind `D4.7`'s flip."""
    deltas = (
        CvdDeltaFact(bucket_start_ms=0, value=Decimal("-10")),
        CvdDeltaFact(bucket_start_ms=CVD_BUCKET_WIDTH_MS, value=Decimal("3")),
    )
    points = cvd_cum(deltas, anchor_ms=CVD_BUCKET_WIDTH_MS)
    assert points == (
        CvdCumPoint(bucket_start_ms=CVD_BUCKET_WIDTH_MS, cumulative_value=Decimal("3")),
    )


def test_three_anchors_on_the_same_synthetic_cvd_delta_invert_the_sign() -> None:
    """`D4.7`'s claim, as a small hand-built case: same `cvd_delta`, three signs.

    Three buckets: a big sell, then two smaller buys. Anchored at bucket 0 the total is
    negative (the sell dominates); anchored at bucket 1 it is already positive.
    """
    deltas = (
        CvdDeltaFact(bucket_start_ms=0, value=Decimal("-10")),
        CvdDeltaFact(bucket_start_ms=CVD_BUCKET_WIDTH_MS, value=Decimal("4")),
        CvdDeltaFact(bucket_start_ms=2 * CVD_BUCKET_WIDTH_MS, value=Decimal("3")),
    )
    total_from_bucket_0 = cvd_cum(deltas, anchor_ms=0)[-1].cumulative_value
    total_from_bucket_1 = cvd_cum(deltas, anchor_ms=CVD_BUCKET_WIDTH_MS)[-1].cumulative_value
    assert total_from_bucket_0 < 0
    assert total_from_bucket_1 > 0


# ── D4.7 / D4.8 — the real fixture, `Decimal`, and the golden vector ────────────────────────


def _load_trades(path: Path, *, raw_quantity_field: str = "quantity") -> list[CvdTrade]:
    """Read one Binance `aggTrades` dump CSV into `CvdTrade`, keeping the string quantity RAW."""
    trades: list[CvdTrade] = []
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            trades.append(
                CvdTrade(
                    agg_id=int(row["agg_trade_id"]),
                    transact_time_ms=int(row["transact_time"]),
                    raw_quantity=row[raw_quantity_field],
                    is_buyer_maker=row["is_buyer_maker"] == "true",
                )
            )
    return trades


@pytest.fixture(scope="module")
def _real_day_deltas() -> tuple[CvdDeltaFact, ...]:
    """`cvd_delta` computed once over the whole real day — reused by the three anchor tests."""
    path = require_fixture(_FIXTURE_2026_08_23, expected_md5=_MD5_2026_08_23)
    trades = _load_trades(path)
    return cvd_delta_by_bucket(trades)


def test_d4_7_the_fixture_spans_exactly_one_utc_day_in_1440_one_minute_buckets(
    _real_day_deltas: tuple[CvdDeltaFact, ...],
) -> None:
    """`[MEDIDO]`: 1.440 buckets = 24h × 60min, none missing — the day these numbers cite."""
    assert len(_real_day_deltas) == 1_440
    assert _real_day_deltas[0].bucket_start_ms == _DAY_START_MS
    assert _real_day_deltas[-1].bucket_start_ms == _DAY_START_MS + 1_439 * CVD_BUCKET_WIDTH_MS


@pytest.mark.parametrize(
    ("anchor_hour", "golden"),
    [
        (0, "-1265.982"),
        (12, "399.745"),
        (20, "1598.508"),
    ],
)
def test_d4_7_cvd_cum_matches_the_golden_total_for_each_anchor(
    _real_day_deltas: tuple[CvdDeltaFact, ...], anchor_hour: int, golden: str
) -> None:
    """`D4.7`, literal: âncora 00:00/12:00/20:00 ⇒ −1265,982 / +399,745 / +1598,508 BTC.

    `[MEDIDO 2026-09-01]` by this test, over `BTCUSDT-aggTrades-2026-08-23.csv` (md5
    `a68d9dbdfde1d7c0d25e78eae4d798bb`), matching `SPEC-001` §2.6's published `[MEDIDO via
    Decimal]` figures.
    """
    anchor_ms = _DAY_START_MS + anchor_hour * _ONE_HOUR_MS
    points = cvd_cum(_real_day_deltas, anchor_ms=anchor_ms)
    assert points[-1].cumulative_value == Decimal(golden)


def test_d4_7_the_title_changes_across_the_three_anchors_the_sign_inverts(
    _real_day_deltas: tuple[CvdDeltaFact, ...],
) -> None:
    """`D4.7`: "e o título muda nas três" — the three totals are not the same sign."""
    totals = [
        cvd_cum(_real_day_deltas, anchor_ms=_DAY_START_MS + hour * _ONE_HOUR_MS)[
            -1
        ].cumulative_value
        for hour in (0, 12, 20)
    ]
    assert totals == [Decimal("-1265.982"), Decimal("399.745"), Decimal("1598.508")]
    assert len({value < 0 for value in totals}) == 2  # both signs appear


def test_d4_8_float_arithmetic_over_the_same_fixture_diverges_from_the_golden_total(
    _real_day_deltas: tuple[CvdDeltaFact, ...],
) -> None:
    """The falsifier `D4.8` names, run as a check this suite executes: `float` does not match.

    `[MEDIDO 2026-09-01]`: summing the SAME 1.314.556 raw quantity strings through `float`
    instead of `Decimal` lands on `-1265.9819999977815` — off from the published `-1265.982` in
    the 10th decimal. That is the case `cvd_delta_by_bucket`'s `Decimal`-over-the-raw-string
    rule (`D4.8`) rejects: a `float`-based reimplementation of the same bucketing is provably
    not this contract, even though the drift is far too small to notice by eye.
    """
    path = require_fixture(_FIXTURE_2026_08_23, expected_md5=_MD5_2026_08_23)
    trades = _load_trades(path)
    float_total = 0.0
    for trade in sorted(trades, key=lambda one_trade: one_trade.agg_id):
        signed = -float(trade.raw_quantity) if trade.is_buyer_maker else float(trade.raw_quantity)
        float_total += signed

    decimal_total = cvd_cum(_real_day_deltas, anchor_ms=_DAY_START_MS)[-1].cumulative_value
    assert decimal_total == Decimal("-1265.982")
    assert str(float_total) != str(decimal_total)
    divergence = abs(float_total - float(decimal_total))
    assert 0 < divergence < 1e-6  # real, but three orders of magnitude below a milli-BTC
