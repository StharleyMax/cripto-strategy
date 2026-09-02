"""`ADR-001`/6 and `plano 03` item 3.5 as an executable contract, on synthetic trades."""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.aggtrade_bucket_aggregate import (
    BUCKET_WIDTH_MS,
    AggTradeBucketTrade,
    AggTradeGapError,
    BucketAggIdGap,
    InvalidBucketQuantityError,
    PartialNqBucketError,
    aggregate_by_bucket,
    detect_bucket_agg_id_gaps,
    require_contiguous,
)

SYMBOL = "BTCUSDT"


def _trade(
    agg_id: int,
    *,
    transact_time_ms: int,
    raw_q: str = "1",
    raw_nq: str | None = "1",
    is_buyer_maker: bool = False,
) -> AggTradeBucketTrade:
    return AggTradeBucketTrade(
        agg_id=agg_id,
        transact_time_ms=transact_time_ms,
        raw_q=raw_q,
        raw_nq=raw_nq,
        is_buyer_maker=is_buyer_maker,
    )


# ── `Σq_buy · Σq_sell · Σnq_buy · Σnq_sell · tx · btx · agg_id_min · agg_id_max` ────────────


def test_a_single_bucket_folds_the_eight_terms_of_adr_001_6() -> None:
    """Four trades, one bucket: every one of the eight published terms, by hand.

    `is_buyer_maker=False` is the BUY side (`cvd.py`'s own convention: the buyer being the
    MAKER means the SELLER was the aggressor) — two buys of `q=10`/`nq=9`, two sells of
    `q=4`/`nq=4`.
    """
    trades = [
        _trade(1, transact_time_ms=0, raw_q="10", raw_nq="9", is_buyer_maker=False),
        _trade(2, transact_time_ms=1_000, raw_q="10", raw_nq="9", is_buyer_maker=False),
        _trade(3, transact_time_ms=2_000, raw_q="4", raw_nq="4", is_buyer_maker=True),
        _trade(4, transact_time_ms=3_000, raw_q="4", raw_nq="4", is_buyer_maker=True),
    ]
    (bucket,) = aggregate_by_bucket(SYMBOL, trades)
    assert bucket.symbol == SYMBOL
    assert bucket.bucket_start_ms == 0
    assert bucket.sum_q_buy == 20
    assert bucket.sum_q_sell == 8
    assert bucket.sum_nq_buy == 18
    assert bucket.sum_nq_sell == 8
    assert bucket.nq_trade_count == 4
    assert bucket.tx == 4
    assert bucket.btx == 2
    assert bucket.agg_id_min == 1
    assert bucket.agg_id_max == 4


def test_two_trades_a_bucket_width_apart_land_in_two_different_buckets() -> None:
    """`transact_time // 60000` — the same floor `cvd.py` uses, applied here."""
    trades = [
        _trade(1, transact_time_ms=0),
        _trade(2, transact_time_ms=BUCKET_WIDTH_MS),
    ]
    buckets = aggregate_by_bucket(SYMBOL, trades)
    assert len(buckets) == 2
    assert buckets[0].bucket_start_ms == 0
    assert buckets[1].bucket_start_ms == BUCKET_WIDTH_MS
    assert buckets[0].tx == 1
    assert buckets[1].tx == 1


def test_buckets_come_back_sorted_by_bucket_start_even_from_a_later_bucket_first() -> None:
    """Grouping is by a `dict`; the return order must not depend on that iteration order."""
    trades = [
        _trade(1, transact_time_ms=BUCKET_WIDTH_MS),
        _trade(2, transact_time_ms=0),
    ]
    buckets = aggregate_by_bucket(SYMBOL, trades)
    assert [bucket.bucket_start_ms for bucket in buckets] == [0, BUCKET_WIDTH_MS]


def test_an_empty_sequence_folds_to_zero_buckets() -> None:
    """No trades, no buckets — not an error, and not a bucket of zeroes."""
    assert aggregate_by_bucket(SYMBOL, []) == ()


# ── dump replay: `nq` absent on every trade (`CL-5`) ────────────────────────────────────────


def test_a_bucket_with_no_nq_at_all_reports_none_not_zero() -> None:
    """The dump-replay case: `raw_nq=None` on every trade in the bucket.

    `sum_nq_buy`/`sum_nq_sell` are `None` — never `Decimal(0)` — because a bucket that never
    saw `nq` and a bucket that saw only zero-`nq` trades are different facts, and `LOCF`'s own
    rule in this repository (`as_of_accessor.py`) already refuses to let an absence read as a
    value.
    """
    trades = [
        _trade(1, transact_time_ms=0, raw_nq=None),
        _trade(2, transact_time_ms=1_000, raw_nq=None, is_buyer_maker=True),
    ]
    (bucket,) = aggregate_by_bucket(SYMBOL, trades)
    assert bucket.sum_nq_buy is None
    assert bucket.sum_nq_sell is None
    assert bucket.nq_trade_count == 0
    assert bucket.sum_q_buy == 1
    assert bucket.sum_q_sell == 1


def test_a_partial_bucket_refuses_instead_of_guessing_a_semantics() -> None:
    """Some trades of the bucket carry `nq`, some do not — refused, not averaged in silence.

    `docs/medicao-ws-aggtrade-nq.md`, "Decisões que não são desta task", item 1: what a
    null/absent `nq` becomes at the bucket level is a `quant-architect` question. This is the
    test that pins this module never answers it by accident.
    """
    trades = [
        _trade(1, transact_time_ms=0, raw_nq="1"),
        _trade(2, transact_time_ms=1_000, raw_nq=None),
    ]
    with pytest.raises(PartialNqBucketError, match="1/2 trades carry nq"):
        aggregate_by_bucket(SYMBOL, trades)


# ── quantidade que nao le como Decimal ──────────────────────────────────────────────────────


def test_an_unparseable_q_refuses_instead_of_folding_as_zero() -> None:
    """`SPEC-001` §2.6's own rule, one layer down: an unparseable quantity is refused, not 0."""
    trades = [_trade(1, transact_time_ms=0, raw_q="not-a-number")]
    with pytest.raises(InvalidBucketQuantityError, match="agg_id 1"):
        aggregate_by_bucket(SYMBOL, trades)


def test_an_unparseable_nq_refuses_instead_of_folding_as_zero() -> None:
    """Same refusal, on the `nq` side of the pair."""
    trades = [_trade(1, transact_time_ms=0, raw_nq="not-a-number")]
    with pytest.raises(InvalidBucketQuantityError, match="agg_id 1"):
        aggregate_by_bucket(SYMBOL, trades)


# ── `D3.5` — o detector de buraco e contiguidade, por DELEGACAO ────────────────────────────


def test_require_contiguous_accepts_a_fully_contiguous_sequence() -> None:
    """Two trades, `agg_id` 1 then 2: no gap, no raise."""
    trades = [_trade(1, transact_time_ms=0), _trade(2, transact_time_ms=1_000)]
    require_contiguous(trades)  # does not raise


def test_deleting_one_trade_from_the_middle_makes_require_contiguous_raise() -> None:
    """`D3.5`'s own falsifier, literal: "deletar 1 linha do fixture ⇒ reprova".

    Three contiguous trades pass; removing the MIDDLE one (never the first or last `agg_id` of
    a bucket — the case a bucket-level `min`/`max` check alone could never catch) makes the gap
    detector fire, because the check runs on every trade's own `agg_id`, not on a bucket's
    boundary.
    """
    trades = [
        _trade(1, transact_time_ms=0),
        _trade(2, transact_time_ms=1_000),
        _trade(3, transact_time_ms=2_000),
    ]
    require_contiguous(trades)  # does not raise

    with_deletion = [trades[0], trades[2]]
    with pytest.raises(AggTradeGapError, match="1 -> 3"):
        require_contiguous(with_deletion)


def test_aggregate_by_bucket_refuses_a_gap_before_summing_anything() -> None:
    """`aggregate_by_bucket` refuses the SAME gap `require_contiguous` names.

    It never folds across a hole into a bucket total that looks complete.
    """
    trades = [_trade(1, transact_time_ms=0), _trade(3, transact_time_ms=1_000)]
    with pytest.raises(AggTradeGapError, match="1 -> 3"):
        aggregate_by_bucket(SYMBOL, trades)


def test_a_duplicated_agg_id_refuses_the_same_way_a_gap_does() -> None:
    """`require_contiguous` also delegates unicidade — the other half of `plano 04` item 4.3."""
    trades = [_trade(1, transact_time_ms=0), _trade(1, transact_time_ms=1_000)]
    with pytest.raises(Exception, match="agg_id 1"):
        require_contiguous(trades)


# ── a costura ENTRE buckets (`detect_bucket_agg_id_gaps`) ───────────────────────────────────


def test_detect_bucket_agg_id_gaps_is_empty_when_buckets_connect_exactly() -> None:
    """Two 1-trade fixtures whose `agg_id`s are consecutive: no gap between them."""
    day_one = aggregate_by_bucket(SYMBOL, [_trade(1, transact_time_ms=0)])
    day_two = aggregate_by_bucket(SYMBOL, [_trade(2, transact_time_ms=0)])
    assert detect_bucket_agg_id_gaps(day_one + day_two) == ()


def test_detect_bucket_agg_id_gaps_names_the_missing_range_between_two_fixtures() -> None:
    """The bucket-grain analogue of `plano 04`'s `2026-08-22` hole: two fixtures, one gap."""
    day_one = aggregate_by_bucket(SYMBOL, [_trade(1, transact_time_ms=0)])
    day_three = aggregate_by_bucket(SYMBOL, [_trade(100, transact_time_ms=0)])
    (gap,) = detect_bucket_agg_id_gaps(day_one + day_three)
    assert gap == BucketAggIdGap(
        from_bucket_start_ms=0,
        to_bucket_start_ms=0,
        from_agg_id_max=1,
        to_agg_id_min=100,
        n_missing=99,
    )


def test_detect_bucket_agg_id_gaps_refuses_an_unsorted_input() -> None:
    """Mirrors `detect_agg_id_gaps`'s own refusal to guess at a caller's intended order."""
    day_one = aggregate_by_bucket(SYMBOL, [_trade(1, transact_time_ms=0)])
    day_three = aggregate_by_bucket(SYMBOL, [_trade(100, transact_time_ms=BUCKET_WIDTH_MS)])
    with pytest.raises(ValueError, match="not sorted by bucket_start_ms"):
        detect_bucket_agg_id_gaps(day_three + day_one)
