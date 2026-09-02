"""`T-03.11`: parse `!forceOrder@arr`, sum Coinalyze `l+s`, classify into the named verdicts."""

from __future__ import annotations

import json
from decimal import Decimal

import pytest

from src.modules.sentimento.domain.coinalyze_daily_series import (
    DailyPoint,
    MalformedCoinalizeResponseError,
)
from src.modules.sentimento.domain.liquidation_reconciliation import (
    HYPOTHESIS_SCREEN_LABEL,
    RECONCILIATION_CAVEAT,
    CapturedLiquidationOrder,
    CoinalizeStreamHypothesis,
    MalformedForceOrderMessageError,
    classify_daily_reconciliation,
    coinalyze_daily_liquidation_quantity,
    parse_force_order_message,
    reconcile_daily_liquidation,
)

# A real `!forceOrder@arr` frame shape, same literal fixture `test_force_order_collector.py`
# already exercises for the envelope — this file is the FIRST to read past the envelope, into
# `o`. `1788015474886` ms -> `2026-08-29T14:57:54.886Z` (UTC) `[MEDIDO:
# datetime.fromtimestamp(1788015474886/1000, tz=UTC)]`.
_RAW_SELL_LIQUIDATION = (
    '{"e":"forceOrder","E":1788015474886,"o":{"s":"BTCUSDT","S":"SELL","o":"LIMIT",'
    '"f":"IOC","q":"0.010","p":"78000.00","ap":"78006.30","X":"FILLED","l":"0.010",'
    '"z":"0.010","T":1788015474886}}'
)
_DAY = "2026-08-29"

# `2025-09-01T00:00:00Z` exactly — an arbitrary but day-ALIGNED epoch, so adding a few whole
# seconds to it (for order timestamps) never crosses a calendar-day boundary by accident.
_DAY_EPOCH_SECONDS = 1_756_684_800


def _liquidation_point(epoch_seconds: int, long_liq: str, short_liq: str) -> DailyPoint:
    """Build one Coinalyze `liquidation` `daily` point with `{t, l, s}`, same shape as the wire."""
    return DailyPoint(
        timestamp_epoch_seconds=epoch_seconds,
        raw={"t": epoch_seconds, "l": long_liq, "s": short_liq},
    )


def test_parse_reads_symbol_side_last_filled_quantity_and_transact_time() -> None:
    """The four fields reconciliation needs, read off the SAME frame the envelope test uses."""
    order = parse_force_order_message(_RAW_SELL_LIQUIDATION)
    assert order.symbol == "BTCUSDT"
    assert order.side == "SELL"
    assert order.last_filled_quantity == "0.010"
    assert order.transact_time_epoch_ms == 1788015474886


def test_parse_day_utc_is_derived_from_transact_time() -> None:
    """`day_utc` reads no clock — it is a pure function of `o.T`, already carried."""
    order = parse_force_order_message(_RAW_SELL_LIQUIDATION)
    assert order.day_utc.isoformat() == _DAY


def test_parse_reads_l_never_q_or_z_when_they_disagree() -> None:
    """`l` is the LAST FILLED increment; `q`/`z` are the full/running size and must not leak."""
    raw = (
        '{"e":"forceOrder","E":1,"o":{"s":"ETHUSDT","S":"BUY","o":"LIMIT","f":"IOC",'
        '"q":"9.000","p":"1","ap":"1","X":"PARTIALLY_FILLED","l":"1.500","z":"3.000",'
        '"T":1788015474886}}'
    )
    order = parse_force_order_message(raw)
    assert order.last_filled_quantity == "1.500"


def test_parse_invalid_json_raises() -> None:
    """A torn or non-JSON line is refused, never silently treated as zero liquidation."""
    with pytest.raises(MalformedForceOrderMessageError):
        parse_force_order_message("{not json")


def test_parse_missing_o_raises() -> None:
    """A `forceOrder` envelope with no order sub-object has nothing this module can read."""
    with pytest.raises(MalformedForceOrderMessageError):
        parse_force_order_message('{"e": "forceOrder"}')


def test_parse_o_not_an_object_raises() -> None:
    """`o` of the wrong shape is a defect, not a value to coerce."""
    with pytest.raises(MalformedForceOrderMessageError):
        parse_force_order_message('{"e": "forceOrder", "o": "not-an-object"}')


@pytest.mark.parametrize("missing_key", ["s", "S", "l", "T"])
def test_parse_missing_required_order_field_raises(missing_key: str) -> None:
    """Each of the four fields this module reads is required — none has a silent default."""
    order = {"s": "BTCUSDT", "S": "SELL", "l": "0.01", "T": 1}
    del order[missing_key]
    raw = json.dumps({"e": "forceOrder", "o": order})
    with pytest.raises(MalformedForceOrderMessageError):
        parse_force_order_message(raw)


def test_parse_non_integer_transact_time_raises() -> None:
    """`T` that does not read as an integer is refused before any grouping by day happens."""
    raw = '{"e":"forceOrder","o":{"s":"BTCUSDT","S":"SELL","l":"0.01","T":"nao-e-inteiro"}}'
    with pytest.raises(MalformedForceOrderMessageError):
        parse_force_order_message(raw)


def test_coinalyze_daily_liquidation_quantity_sums_l_and_s() -> None:
    """`docs/medicao-coinalyze.md` §2.1: the wire shape is `{t, l, s}`, and `l + s` is the total."""
    point = _liquidation_point(_DAY_EPOCH_SECONDS, "12.5", "7.5")
    assert coinalyze_daily_liquidation_quantity(point) == Decimal("20.0")


def test_coinalyze_daily_liquidation_quantity_missing_l_raises() -> None:
    """A point missing `l` is a wire-shape defect, not a symbol with zero long liquidation."""
    point = DailyPoint(timestamp_epoch_seconds=1, raw={"t": 1, "s": "1"})
    with pytest.raises(MalformedCoinalizeResponseError):
        coinalyze_daily_liquidation_quantity(point)


def test_coinalyze_daily_liquidation_quantity_missing_s_raises() -> None:
    """Symmetric to the missing-`l` case above."""
    point = DailyPoint(timestamp_epoch_seconds=1, raw={"t": 1, "l": "1"})
    with pytest.raises(MalformedCoinalizeResponseError):
        coinalyze_daily_liquidation_quantity(point)


def test_coinalyze_daily_liquidation_quantity_non_numeric_raises() -> None:
    """A non-numeric `l`/`s` is refused, never treated as zero (same rule `cvd.py` applies)."""
    point = DailyPoint(timestamp_epoch_seconds=1, raw={"t": 1, "l": "abacate", "s": "1"})
    with pytest.raises(MalformedCoinalizeResponseError):
        coinalyze_daily_liquidation_quantity(point)


def test_classify_both_zero_is_no_liquidation_either_side() -> None:
    """A day with nothing on either side is its own verdict, never folded into "inconclusive"."""
    ratio, hypothesis = classify_daily_reconciliation(
        captured_quantity=Decimal(0),
        coinalyze_quantity=Decimal(0),
        near_one_lower_bound=Decimal("0.8"),
        near_one_upper_bound=Decimal("1.2"),
    )
    assert ratio is None
    assert hypothesis == CoinalizeStreamHypothesis.NO_LIQUIDATION_EITHER_SIDE


def test_classify_coinalyze_zero_captured_nonzero_is_captured_exceeds() -> None:
    """Division by zero never happens — an absent Coinalyze side is its own named verdict."""
    ratio, hypothesis = classify_daily_reconciliation(
        captured_quantity=Decimal("5"),
        coinalyze_quantity=Decimal(0),
        near_one_lower_bound=Decimal("0.8"),
        near_one_upper_bound=Decimal("1.2"),
    )
    assert ratio is None
    assert hypothesis == CoinalizeStreamHypothesis.CAPTURED_EXCEEDS_COINALYZE


def test_classify_ratio_exactly_one_is_same_stream_inconclusive() -> None:
    """The handoff's first named case: ratio at 1 proves nothing about the real liquidation."""
    ratio, hypothesis = classify_daily_reconciliation(
        captured_quantity=Decimal("10"),
        coinalyze_quantity=Decimal("10"),
        near_one_lower_bound=Decimal("0.8"),
        near_one_upper_bound=Decimal("1.2"),
    )
    assert ratio == Decimal(1)
    assert hypothesis == CoinalizeStreamHypothesis.SAME_STREAM_INCONCLUSIVE


def test_classify_ratio_at_lower_boundary_is_inclusive() -> None:
    """The falsifier for a `<` vs `<=` mutation at the LOWER edge of the band."""
    ratio, hypothesis = classify_daily_reconciliation(
        captured_quantity=Decimal("8"),
        coinalyze_quantity=Decimal("10"),
        near_one_lower_bound=Decimal("0.8"),
        near_one_upper_bound=Decimal("1.2"),
    )
    assert ratio == Decimal("0.8")
    assert hypothesis == CoinalizeStreamHypothesis.SAME_STREAM_INCONCLUSIVE


def test_classify_ratio_just_below_lower_boundary_measures_loss() -> None:
    """One tick below the declared band: the handoff's second named case."""
    ratio, hypothesis = classify_daily_reconciliation(
        captured_quantity=Decimal("7.99"),
        coinalyze_quantity=Decimal("10"),
        near_one_lower_bound=Decimal("0.8"),
        near_one_upper_bound=Decimal("1.2"),
    )
    assert ratio == Decimal("0.799")
    assert hypothesis == CoinalizeStreamHypothesis.INDEPENDENT_STREAM_MEASURES_LOSS


def test_classify_ratio_at_upper_boundary_is_inclusive() -> None:
    """The falsifier for a `>` vs `>=` mutation at the UPPER edge of the band."""
    ratio, hypothesis = classify_daily_reconciliation(
        captured_quantity=Decimal("12"),
        coinalyze_quantity=Decimal("10"),
        near_one_lower_bound=Decimal("0.8"),
        near_one_upper_bound=Decimal("1.2"),
    )
    assert ratio == Decimal("1.2")
    assert hypothesis == CoinalizeStreamHypothesis.SAME_STREAM_INCONCLUSIVE


def test_classify_ratio_just_above_upper_boundary_is_captured_exceeds() -> None:
    """One tick above the declared band: the edge the handoff's binary framing never named."""
    ratio, hypothesis = classify_daily_reconciliation(
        captured_quantity=Decimal("12.01"),
        coinalyze_quantity=Decimal("10"),
        near_one_lower_bound=Decimal("0.8"),
        near_one_upper_bound=Decimal("1.2"),
    )
    assert ratio == Decimal("1.201")
    assert hypothesis == CoinalizeStreamHypothesis.CAPTURED_EXCEEDS_COINALYZE


def test_classify_negative_captured_quantity_raises() -> None:
    """Liquidation volume can never be negative — a defect upstream, not a value to accept."""
    with pytest.raises(ValueError, match="quantidade negativa"):
        classify_daily_reconciliation(
            captured_quantity=Decimal("-1"),
            coinalyze_quantity=Decimal("10"),
            near_one_lower_bound=Decimal("0.8"),
            near_one_upper_bound=Decimal("1.2"),
        )


def test_classify_negative_coinalyze_quantity_raises() -> None:
    """Symmetric to the negative-captured case above."""
    with pytest.raises(ValueError, match="quantidade negativa"):
        classify_daily_reconciliation(
            captured_quantity=Decimal("1"),
            coinalyze_quantity=Decimal("-10"),
            near_one_lower_bound=Decimal("0.8"),
            near_one_upper_bound=Decimal("1.2"),
        )


@pytest.mark.parametrize(
    ("lower", "upper"),
    [
        (Decimal("0"), Decimal("1.2")),
        (Decimal("1.1"), Decimal("1.2")),
        (Decimal("0.8"), Decimal("0.9")),
    ],
)
def test_classify_invalid_bound_raises(lower: Decimal, upper: Decimal) -> None:
    """`0 < lower <= 1 <= upper` is enforced — a band excluding 1 could never read inconclusive."""
    with pytest.raises(ValueError, match="faixa 'perto de 1' invalida"):
        classify_daily_reconciliation(
            captured_quantity=Decimal("1"),
            coinalyze_quantity=Decimal("1"),
            near_one_lower_bound=lower,
            near_one_upper_bound=upper,
        )


def test_every_hypothesis_has_a_screen_label() -> None:
    """The "tela diz qual" half of the handoff has a label for every possible verdict, no gaps."""
    assert set(HYPOTHESIS_SCREEN_LABEL) == set(CoinalizeStreamHypothesis)


def test_caveat_travels_regardless_of_hypothesis() -> None:
    """`RECONCILIATION_CAVEAT` is the SAME text no matter which case the ratio suggests."""
    rows = reconcile_daily_liquidation(
        symbol="BTCUSDT",
        captured_orders=(),
        coinalyze_points=(_liquidation_point(_DAY_EPOCH_SECONDS, "0", "0"),),
        near_one_lower_bound=Decimal("0.8"),
        near_one_upper_bound=Decimal("1.2"),
    )
    assert len(rows) == 1
    assert rows[0].caveat == RECONCILIATION_CAVEAT
    assert rows[0].hypothesis == CoinalizeStreamHypothesis.NO_LIQUIDATION_EITHER_SIDE
    assert rows[0].screen_label == HYPOTHESIS_SCREEN_LABEL[rows[0].hypothesis]


def test_reconcile_sums_multiple_orders_same_symbol_same_day() -> None:
    """`Σ(liquidação capturada no dia)` — the handoff's literal sum, over more than one order."""
    orders = (
        CapturedLiquidationOrder("BTCUSDT", "SELL", "1.0", _DAY_EPOCH_SECONDS * 1000 + 1_000),
        CapturedLiquidationOrder("BTCUSDT", "SELL", "0.5", _DAY_EPOCH_SECONDS * 1000 + 2_000),
    )
    point = _liquidation_point(_DAY_EPOCH_SECONDS, "3.0", "0")
    rows = reconcile_daily_liquidation(
        symbol="BTCUSDT",
        captured_orders=orders,
        coinalyze_points=(point,),
        near_one_lower_bound=Decimal("0.4"),
        near_one_upper_bound=Decimal("1.2"),
    )
    assert len(rows) == 1
    row = rows[0]
    assert row.captured_quantity == Decimal("1.5")
    assert row.coinalyze_quantity == Decimal("3.0")
    assert row.ratio == Decimal("0.5")
    assert row.hypothesis == CoinalizeStreamHypothesis.SAME_STREAM_INCONCLUSIVE


def test_reconcile_orders_of_another_symbol_are_ignored() -> None:
    """`!forceOrder@arr` is whole-market — filtering by `symbol` is this function's job."""
    orders = (
        CapturedLiquidationOrder("ETHUSDT", "SELL", "999", _DAY_EPOCH_SECONDS * 1000 + 1_000),
    )
    point = _liquidation_point(_DAY_EPOCH_SECONDS, "1", "1")
    rows = reconcile_daily_liquidation(
        symbol="BTCUSDT",
        captured_orders=orders,
        coinalyze_points=(point,),
        near_one_lower_bound=Decimal("0.01"),
        near_one_upper_bound=Decimal("100"),
    )
    assert len(rows) == 1
    assert rows[0].captured_quantity == Decimal(0)


def test_reconcile_day_with_no_captured_orders_is_a_true_zero() -> None:
    """No captured order that day is a true zero, not an absence — `LOCF`'s lesson applied here."""
    point = _liquidation_point(_DAY_EPOCH_SECONDS, "0", "0")
    rows = reconcile_daily_liquidation(
        symbol="BTCUSDT",
        captured_orders=(),
        coinalyze_points=(point,),
        near_one_lower_bound=Decimal("0.8"),
        near_one_upper_bound=Decimal("1.2"),
    )
    assert rows[0].captured_quantity == Decimal(0)
    assert rows[0].hypothesis == CoinalizeStreamHypothesis.NO_LIQUIDATION_EITHER_SIDE


def test_reconcile_captured_day_absent_from_coinalyze_calendar_produces_no_row() -> None:
    """Only days Coinalyze published a point for are reconciled — see the function's docstring."""
    captured_only_day_epoch_ms = _DAY_EPOCH_SECONDS * 1000 + 1_000
    orders = (CapturedLiquidationOrder("BTCUSDT", "SELL", "1", captured_only_day_epoch_ms),)
    rows = reconcile_daily_liquidation(
        symbol="BTCUSDT",
        captured_orders=orders,
        coinalyze_points=(),
        near_one_lower_bound=Decimal("0.8"),
        near_one_upper_bound=Decimal("1.2"),
    )
    assert rows == ()


def test_reconcile_results_are_sorted_by_day_regardless_of_input_order() -> None:
    """Deterministic output, mirroring `cvd.cvd_delta_by_bucket`'s own sorted-return contract."""
    day2 = _DAY_EPOCH_SECONDS + 86_400
    points = (_liquidation_point(day2, "1", "0"), _liquidation_point(_DAY_EPOCH_SECONDS, "1", "0"))
    rows = reconcile_daily_liquidation(
        symbol="BTCUSDT",
        captured_orders=(),
        coinalyze_points=points,
        near_one_lower_bound=Decimal("0.8"),
        near_one_upper_bound=Decimal("1.2"),
    )
    assert [row.day for row in rows] == sorted(row.day for row in rows)
    assert len(rows) == 2


def test_reconcile_duplicate_coinalyze_point_for_the_same_day_raises() -> None:
    """The `daily` endpoint is contracted to one point per day — two is a defect, not a sum."""
    points = (
        _liquidation_point(_DAY_EPOCH_SECONDS, "1", "0"),
        _liquidation_point(_DAY_EPOCH_SECONDS, "2", "0"),
    )
    with pytest.raises(MalformedCoinalizeResponseError, match="mesmo dia"):
        reconcile_daily_liquidation(
            symbol="BTCUSDT",
            captured_orders=(),
            coinalyze_points=points,
            near_one_lower_bound=Decimal("0.8"),
            near_one_upper_bound=Decimal("1.2"),
        )


def test_reconcile_unparseable_captured_quantity_raises() -> None:
    """A capture line whose `l` does not read as `Decimal` is refused, never treated as zero."""
    orders = (
        CapturedLiquidationOrder("BTCUSDT", "SELL", "nao-e-decimal", _DAY_EPOCH_SECONDS * 1000 + 1),
    )
    point = _liquidation_point(_DAY_EPOCH_SECONDS, "1", "0")
    with pytest.raises(MalformedForceOrderMessageError):
        reconcile_daily_liquidation(
            symbol="BTCUSDT",
            captured_orders=orders,
            coinalyze_points=(point,),
            near_one_lower_bound=Decimal("0.8"),
            near_one_upper_bound=Decimal("1.2"),
        )
