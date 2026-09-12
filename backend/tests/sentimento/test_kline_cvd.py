"""`T-02.3`: `delta_cvd = 2 * takerBuyBaseVol - volume`, and the invariant that guards it.

⛔ WHY EVERY ASSERTION HERE NAMES A VALUE AND NOT A PROPERTY.

"the delta has the right sign" passes for `takerBuy - volume`, for `volume - 2*takerBuy` on the
half of the cases where the sign happens to agree, and for anything scaled by a constant. The
measured triple `[MEDIDO 2026-09-10, BTCUSDT 1m: v=29,757 / takerBuy=2,626 / delta=-24,505]` is
used below as a LITERAL expectation, taken from `handoff/ACHADO-KLINES-CVD.md` rather than
recomputed from whatever the code does, so a formula that is wrong in scale fails just as
loudly as one that is wrong in sign.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from src.modules.sentimento.domain.kline_cvd import (
    InvalidKlineQuantityError,
    TakerBuyExceedsVolumeError,
    kline_cvd_delta,
)


def test_the_measured_bucket_reproduces_the_published_delta_exactly() -> None:
    """The finding's own numbers, as the expectation — not as a comment beside a recomputation.

    Morde: `takerBuy - volume` gives `-27.131`; `volume - 2*takerBuy` gives `+24.505`; a `float`
    implementation gives `-24.505000000000003`. All three fail this one assertion.
    """
    assert kline_cvd_delta(volume="29.757", taker_buy_base_volume="2.626") == Decimal("-24.505")


def test_the_delta_is_taker_buy_minus_taker_sell_by_construction() -> None:
    """`2*bv - v` and `bv - (v - bv)` are the same expression, and both are asserted.

    This is the algebraic identity the formula rests on, checked on a bucket whose two halves
    are named separately — so a reader can see WHY the factor of two is there rather than
    taking it on faith.
    """
    volume, taker_buy = Decimal("100.0"), Decimal("62.5")
    taker_sell = volume - taker_buy

    assert kline_cvd_delta(volume=str(volume), taker_buy_base_volume=str(taker_buy)) == (
        taker_buy - taker_sell
    )


def test_a_perfectly_balanced_bucket_has_a_delta_of_zero() -> None:
    """`takerBuy == volume / 2` -> `0`. The fixed point, which pins the offset of the formula.

    Morde: any implementation with an additive constant (`2*bv - v + v/2`, say) still gets the
    sign and the extremes plausible, and fails HERE.
    """
    assert kline_cvd_delta(volume="10.0", taker_buy_base_volume="5.0") == Decimal("0.0")


def test_the_two_extremes_give_plus_and_minus_the_whole_volume() -> None:
    """All-aggressor-buy -> `+volume`; all-aggressor-sell -> `-volume`. The SCALE of the formula."""
    assert kline_cvd_delta(volume="8.5", taker_buy_base_volume="8.5") == Decimal("8.5")
    assert kline_cvd_delta(volume="8.5", taker_buy_base_volume="0") == Decimal("-8.5")


def test_an_empty_bucket_is_a_delta_of_zero_and_not_a_refusal() -> None:
    """`volume == takerBuy == 0` is a real, legal minute — a bar with no trades.

    The invariant is `0 <= takerBuy <= volume`, and the degenerate case satisfies it. Refusing
    it would make the collector crash on the quietest minute of the week.
    """
    assert kline_cvd_delta(volume="0", taker_buy_base_volume="0") == Decimal("0")


# ── THE INVARIANT (item 2.4), AND IT IS ASSERTED BY WHAT IT REJECTS ────────────────────────


def test_a_taker_buy_greater_than_volume_is_refused() -> None:
    """`takerBuy` is a PART of `volume`; above it, the payload has no reading.

    Morde: delete the guard and this pair publishes `11.0` as the delta of a bucket whose whole
    traded volume was `1.0` — a number larger than the bucket it describes, which looks like
    strong signal and is not.
    """
    with pytest.raises(TakerBuyExceedsVolumeError):
        kline_cvd_delta(volume="1.0", taker_buy_base_volume="6.0")


def test_the_boundary_where_taker_buy_equals_volume_is_accepted_not_refused() -> None:
    """`takerBuy == volume` is legal (every trade aggressor-buy) — the guard must not be `<`.

    Morde: write the invariant as `takerBuy < volume` and the most one-sided minute of a squeeze
    — exactly the minute an order-flow chart exists to show — becomes an exception.
    """
    assert kline_cvd_delta(volume="3.0", taker_buy_base_volume="3.0") == Decimal("3.0")


def test_a_negative_taker_buy_is_refused_by_the_same_guard() -> None:
    """`0 <= takerBuy` is the other end of one comparison chain, not a second rule."""
    with pytest.raises(TakerBuyExceedsVolumeError):
        kline_cvd_delta(volume="5.0", taker_buy_base_volume="-1.0")


def test_a_quantity_that_is_not_a_decimal_is_refused_never_read_as_zero() -> None:
    """A malformed field raises instead of silently understating the bucket (`cvd.py`'s rule)."""
    with pytest.raises(InvalidKlineQuantityError):
        kline_cvd_delta(volume="", taker_buy_base_volume="1.0")
    with pytest.raises(InvalidKlineQuantityError):
        kline_cvd_delta(volume="1.0", taker_buy_base_volume="n/a")


def test_the_exact_decimal_string_survives_the_arithmetic() -> None:
    """Eight decimal places, the depth Binance quotes — no `float` neighbour, no rounding.

    Morde: implement with `float` and `str(...)` reads `-0.30000000000000004`.
    """
    assert str(kline_cvd_delta(volume="0.50000000", taker_buy_base_volume="0.10000000")) == (
        "-0.30000000"
    )
