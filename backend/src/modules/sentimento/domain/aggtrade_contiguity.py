"""Identity and contiguity of the `aggTrades` tick stream: `agg_id`, never time, never trade_id."""
#
# `plano 04` (`docs/plans/SPEC-001-plataforma-dados/04_contrato_temporal.md`) item 4.3, literal:
# "Unicidade por `agg_id` com verificação de contiguidade — nunca por tempo, nunca `first`/`last
# trade_id`". Two candidate keys are refused by this module's SHAPE, not by a convention a caller
# has to remember to honour:
#
#   TIME       `D4.5` measures the reason directly on the real fixture: up to 184 `aggTrades`
#              share one millisecond, and 25,6% of the observed milliseconds carry more than one
#              trade (`data/binance/aggtrades/BTCUSDT-aggTrades-2026-08-20.csv`,
#              `[MEDIDO 2026-08-29]`) — a timestamp cannot be a key over data it does not
#              distinguish.
#   TRADE_ID   `first_trade_id`/`last_trade_id` describe the RAW trades one `aggTrade` folds
#              together, not the `aggTrade` itself. `AggTradeTick` below carries no field for
#              them: there is no value of this type a caller could key on to reconstruct the
#              forbidden scheme, the same structural argument `stream_probe_outcome.py` already
#              uses for "a transport failure cannot be reported as a field verdict".

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class AggTradeTick:
    """One `aggTrade` row, reduced to the two fields identity and contiguity need.

    Deliberately NOT the full CSV row (`price`, `quantity`, `is_buyer_maker`, the trade-id
    range): `plano 04` item 4.3 is about identity and order only, and a wider type would invite
    a second module to key on a field this one never vouches for.
    """

    agg_id: int
    transact_time_ms: int


class DuplicateAggIdError(ValueError):
    """Two ticks claim the SAME `agg_id` — the one collision this module refuses to ignore."""


def require_unique_agg_ids(ticks: Sequence[AggTradeTick]) -> None:
    """Raise the moment two ticks share an `agg_id` — the only identity this module trusts.

    Deliberately takes no `key=` parameter: `plano 04` item 4.3 forbids keying on time or on
    the trade-id range, and a knob here would reopen exactly that choice. Order-independent —
    unlike `detect_agg_id_gaps`, uniqueness is a property of the SET of ids, not of a walk.
    """
    seen: set[int] = set()
    for tick in ticks:
        if tick.agg_id in seen:
            raise DuplicateAggIdError(
                f"agg_id {tick.agg_id} repetido — a unicidade e por agg_id, nunca por tempo "
                f"nem por first/last trade_id (plano 04 item 4.3)"
            )
        seen.add(tick.agg_id)


@dataclass(frozen=True)
class AggIdGap:
    """One discontinuity in the `agg_id` sequence: `[from_agg_id, to_agg_id]`, never filled.

    `n_missing = to_agg_id - from_agg_id` — the WIDTH of the hole in id-space, matching the
    measured `D4.4` number over the real boundary this repository ships: `1.620.908` between
    `3420055157` (last of `BTCUSDT-aggTrades-2026-08-21.csv`) and `3421676065` (first of
    `BTCUSDT-aggTrades-2026-08-23.csv`), the missing day `2026-08-22`
    `[MEDIDO 2026-08-29, comando: bash backend/scripts/test.sh -k test_d4_4]`. This is `to -
    from`, ONE MORE than the count of integers strictly between the two IDs (`to - from - 1`,
    which would be `1.620.907`) — the plan's own D4.4 row states the larger number, and this
    type reports that one instead of inventing a second, incompatible convention next to it.
    """

    from_agg_id: int
    to_agg_id: int
    n_missing: int


def detect_agg_id_gaps(sorted_ticks: Sequence[AggTradeTick]) -> tuple[AggIdGap, ...]:
    """Find every place where consecutive `agg_id`s do not differ by exactly one.

    A gap is COUNTED, never filled — mirrors `metrics_shift.detect_gaps`'s guarantee for the
    grid case: `AggIdGap` has no slot to carry a manufactured row for the missing range, so
    "stitching" the hole is not a thing a caller of this function can even express.

    RAISES if `sorted_ticks` is not already in non-decreasing `agg_id` order: a gap count
    computed on an accidentally-unsorted sequence would depend on file order instead of on the
    data, exactly the failure `metrics_shift.detect_gaps` already refuses.
    """
    gaps: list[AggIdGap] = []
    for previous, current in zip(sorted_ticks, sorted_ticks[1:], strict=False):
        if current.agg_id < previous.agg_id:
            raise ValueError(
                f"ticks are not sorted by agg_id: {previous.agg_id} then {current.agg_id} — "
                f"detect_agg_id_gaps only reads an already-ordered sequence"
            )
        delta = current.agg_id - previous.agg_id
        if delta != 1:
            gaps.append(
                AggIdGap(from_agg_id=previous.agg_id, to_agg_id=current.agg_id, n_missing=delta)
            )
    return tuple(gaps)


def count_decreasing_timestamps(sorted_ticks: Sequence[AggTradeTick]) -> int:
    """Count adjacent pairs, walked in `agg_id` order, whose `transact_time_ms` goes BACKWARDS.

    `D4.4`'s "0 ts decrescente" is measured in `agg_id` order, never by re-sorting on time —
    this function reads the SAME sequence `detect_agg_id_gaps` reads, so the two checks
    describe one walk over the data, not two competing orderings that could disagree.
    """
    decreasing = 0
    for previous, current in zip(sorted_ticks, sorted_ticks[1:], strict=False):
        if current.transact_time_ms < previous.transact_time_ms:
            decreasing += 1
    return decreasing


@dataclass(frozen=True)
class MillisecondCollisionStats:
    """How many `aggTrades` share one `transact_time_ms` — the fact that rules out time as a key.

    `D4.5`, measured on `BTCUSDT-aggTrades-2026-08-20.csv`: up to 184 trades in one ms, 25,6%
    of the OBSERVED (distinct) milliseconds carry more than one trade.
    """

    distinct_timestamps: int
    colliding_timestamps: int
    max_trades_in_one_timestamp: int

    @property
    def collision_ratio(self) -> float:
        """Fraction of DISTINCT timestamps carrying more than one trade — `D4.5`'s "25,6%"."""
        if self.distinct_timestamps == 0:
            return 0.0
        return self.colliding_timestamps / self.distinct_timestamps


def measure_millisecond_collisions(ticks: Sequence[AggTradeTick]) -> MillisecondCollisionStats:
    """Count, per `transact_time_ms`, how many ticks land on it.

    Order-independent by design — unlike `detect_agg_id_gaps`/`count_decreasing_timestamps`,
    a collision count is a property of the MULTISET of timestamps, not of a walk order, so this
    accepts ticks in any order (file order is fine; sorting first buys nothing here).
    """
    counts: dict[int, int] = {}
    for tick in ticks:
        counts[tick.transact_time_ms] = counts.get(tick.transact_time_ms, 0) + 1
    distinct = len(counts)
    colliding = sum(1 for n in counts.values() if n > 1)
    maximum = max(counts.values(), default=0)
    return MillisecondCollisionStats(
        distinct_timestamps=distinct,
        colliding_timestamps=colliding,
        max_trades_in_one_timestamp=maximum,
    )
