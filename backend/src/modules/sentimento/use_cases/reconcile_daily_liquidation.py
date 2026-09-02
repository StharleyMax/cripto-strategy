"""Sequence `T-03.11`'s reconciliation over raw text lines, tolerating a malformed one."""
#
# `_capture_one` (`capture_coinalyze_daily_series.py`) sets the precedent this module follows:
# "a malformed body… becomes a named outcome instead of an exception, because [aborting] would
# lose every call spent before it". The same argument applies here for a different reason — the
# evidence file this reads is a JSONL append log written line-by-line
# (`force_order_raw_recorder.py`), and a process killed mid-write can leave a torn last line. One
# torn line must not throw away every well-formed line that came before it.

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal

from src.modules.sentimento.domain.coinalyze_daily_series import DailyPoint
from src.modules.sentimento.domain.liquidation_reconciliation import (
    CapturedLiquidationOrder,
    DailyLiquidationReconciliation,
    MalformedForceOrderMessageError,
    parse_force_order_message,
    reconcile_daily_liquidation,
)


@dataclass(frozen=True)
class ReconciliationRun:
    """One symbol's reconciliation: the rows produced, and what was skipped along the way."""

    reconciliations: tuple[DailyLiquidationReconciliation, ...]
    skipped_malformed_messages: int


def run_daily_liquidation_reconciliation(
    *,
    symbol: str,
    raw_force_order_messages: Sequence[str],
    coinalyze_points: Sequence[DailyPoint],
    near_one_lower_bound: Decimal,
    near_one_upper_bound: Decimal,
) -> ReconciliationRun:
    """Parse every raw message, skip malformed ones, then reconcile `symbol`.

    `skipped_malformed_messages` is counted, never merely dropped — a run that silently discarded
    a torn line would understate `captured_quantity` without saying so, which is exactly the
    "número solto" defect `liquidation_reconciliation.py`'s module docstring names as the reason
    `hypothesis` never travels without a label. A caller that cares WHY a day's ratio reads low
    needs to know whether it is genuine subsampling loss or lines this run could not parse.
    """
    orders: list[CapturedLiquidationOrder] = []
    skipped = 0
    for raw in raw_force_order_messages:
        try:
            orders.append(parse_force_order_message(raw))
        except MalformedForceOrderMessageError:
            skipped += 1
            continue
    reconciliations = reconcile_daily_liquidation(
        symbol=symbol,
        captured_orders=orders,
        coinalyze_points=coinalyze_points,
        near_one_lower_bound=near_one_lower_bound,
        near_one_upper_bound=near_one_upper_bound,
    )
    return ReconciliationRun(
        reconciliations=reconciliations,
        skipped_malformed_messages=skipped,
    )
