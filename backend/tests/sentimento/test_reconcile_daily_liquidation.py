"""Sequencing test: a malformed raw message is skipped and counted, never dropped silently."""

from __future__ import annotations

from decimal import Decimal

from src.modules.sentimento.domain.coinalyze_daily_series import DailyPoint
from src.modules.sentimento.domain.liquidation_reconciliation import CoinalizeStreamHypothesis
from src.modules.sentimento.use_cases.reconcile_daily_liquidation import (
    run_daily_liquidation_reconciliation,
)

# `2025-09-01T00:00:00Z` exactly, day-aligned — same anchor `test_liquidation_reconciliation.py`
# uses, so a millisecond offset of a few seconds never crosses a calendar-day boundary.
_DAY_EPOCH_SECONDS = 1_756_684_800

_TRANSACT_TIME_MS = _DAY_EPOCH_SECONDS * 1000 + 1_000
_VALID_RAW = (
    '{"e":"forceOrder","E":1,"o":{"s":"BTCUSDT","S":"SELL","o":"LIMIT","f":"IOC",'
    '"q":"1.0","p":"1","ap":"1","X":"FILLED","l":"1.0","z":"1.0",'
    '"T":' + str(_TRANSACT_TIME_MS) + "}}"
)


def _liquidation_point(epoch_seconds: int, long_liq: str, short_liq: str) -> DailyPoint:
    """Build one Coinalyze `liquidation` `daily` point with `{t, l, s}`, same shape as the wire."""
    return DailyPoint(
        timestamp_epoch_seconds=epoch_seconds,
        raw={"t": epoch_seconds, "l": long_liq, "s": short_liq},
    )


def test_all_valid_messages_produce_the_expected_reconciliation() -> None:
    """No malformed line: `skipped_malformed_messages` reads zero, and the sum is exact."""
    run = run_daily_liquidation_reconciliation(
        symbol="BTCUSDT",
        raw_force_order_messages=(_VALID_RAW,),
        coinalyze_points=(_liquidation_point(_DAY_EPOCH_SECONDS, "2.0", "0"),),
        near_one_lower_bound=Decimal("0.4"),
        near_one_upper_bound=Decimal("1.2"),
    )
    assert run.skipped_malformed_messages == 0
    assert len(run.reconciliations) == 1
    row = run.reconciliations[0]
    assert row.captured_quantity == Decimal("1.0")
    assert row.ratio == Decimal("0.5")
    assert row.hypothesis == CoinalizeStreamHypothesis.SAME_STREAM_INCONCLUSIVE


def test_a_malformed_line_is_skipped_and_counted_not_dropped_silently() -> None:
    """A torn JSONL line must not understate `captured_quantity` without saying so."""
    run = run_daily_liquidation_reconciliation(
        symbol="BTCUSDT",
        raw_force_order_messages=(_VALID_RAW, "{torn line", '{"e": "forceOrder"}'),
        coinalyze_points=(_liquidation_point(_DAY_EPOCH_SECONDS, "2.0", "0"),),
        near_one_lower_bound=Decimal("0.4"),
        near_one_upper_bound=Decimal("1.2"),
    )
    assert run.skipped_malformed_messages == 2
    assert len(run.reconciliations) == 1
    assert run.reconciliations[0].captured_quantity == Decimal("1.0")


def test_no_messages_at_all_still_reconciles_against_the_coinalyze_calendar() -> None:
    """An empty evidence file is a legitimate input, not an error — zero captured, real number."""
    run = run_daily_liquidation_reconciliation(
        symbol="BTCUSDT",
        raw_force_order_messages=(),
        coinalyze_points=(_liquidation_point(_DAY_EPOCH_SECONDS, "0", "0"),),
        near_one_lower_bound=Decimal("0.8"),
        near_one_upper_bound=Decimal("1.2"),
    )
    assert run.skipped_malformed_messages == 0
    assert len(run.reconciliations) == 1
    assert run.reconciliations[0].hypothesis == CoinalizeStreamHypothesis.NO_LIQUIDATION_EITHER_SIDE
