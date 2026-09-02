"""ADR-004 B3 — the B2 natural-key collision rate, published per symbol and per day."""
#
# THE DIRECTION THIS MODULE MAKES MECHANICAL, not just documented (`ADR-004` B3, literal):
# "colisão não resolvida ⇒ subcontagem, nunca supercontagem". A repeated natural key can mean one
# of two things this module structurally CANNOT tell apart: (a) the SAME liquidation delivered
# twice by two overlapping connections during a reconnection (`ADR-004` B1's desired outcome), or
# (b) two GENUINELY DISTINCT liquidations that happen to share every field of the key. Either
# way, `count_daily_collisions` counts the second occurrence as a collision and never adds it a
# second time to `total_events` — an unresolved collision REMOVES one event from the total, it
# never adds a duplicate. That is what "subcontagem, nunca supercontagem" means as code: there is
# no branch here that could push a bucket's `total_events` past the number of distinct keys
# observed.
#
# `plano 03` `D3.6`: "não é medível em regime real hoje" — the universe this DoD needs (>= 30
# days x >= 20 symbols) requires days of live capture this repository does not have yet. This
# module is the MECHANICS that reading trivial once that capture exists: `count_daily_collisions`
# and `d3_6_universe_met` are exercised in the offline suite against a SIMULATED reconnection
# with a known overlap (`backend/tests/sentimento/test_force_order_reconnection.py`), so the day
# the real evidence file exists, publishing the real rate is a matter of feeding it through this
# same function — not writing new logic.

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Final

from src.modules.sentimento.domain.force_order_natural_key import ForceOrderNaturalKey

# ADR-004 B3, literal, carried verbatim so a report line can quote it instead of paraphrasing.
COLLISION_BIAS_DIRECTION: Final[str] = (
    "colisao nao resolvida => SUBCONTAGEM, nunca supercontagem (ADR-004 B3) — toda soma sobre "
    "esta serie e um LIMITE INFERIOR"
)

# `plano 03` D3.6's declared universe. Not a threshold this module enforces (a short offline
# simulation must not be forced to fabricate 30 days of data to run) — `d3_6_universe_met` only
# REPORTS whether a given set of daily counts already reaches it, so a caller can say, truthfully,
# whether today's publication is the D3.6 measurement or the mechanics rehearsal for it.
D3_6_REQUIRED_DAYS: Final[int] = 30
D3_6_REQUIRED_SYMBOLS: Final[int] = 20


@dataclass(frozen=True)
class ForceOrderKeyObservation:
    """One `!forceOrder@arr` message, reduced to what the daily accounting keys on.

    `day` is the UTC calendar day the accounting buckets by. It is supplied by the CALLER
    (typically `trade_time_utc_date` applied to the key's own `trade_time`) rather than derived
    inside this module, so a caller keying by a different clock (e.g. `received_at`) does not
    require this module to change.
    """

    key: ForceOrderNaturalKey
    day: str


@dataclass(frozen=True)
class DailyCollisionCount:
    """B3's published unit: how many of one symbol's events, on one day, collided on the B2 key."""

    symbol: str
    day: str
    total_events: int
    collisions: int

    @property
    def collision_rate(self) -> float:
        """`collisions / total_events` — `0.0` when nothing was observed, never a ZeroDivision."""
        if self.total_events == 0:
            return 0.0
        return self.collisions / self.total_events


def count_daily_collisions(
    observations: Sequence[ForceOrderKeyObservation],
) -> tuple[DailyCollisionCount, ...]:
    """Bucket `observations` by `(symbol, day)`; a key repeated within a bucket is a collision.

    Order of `observations` does not affect which `(symbol, day)` buckets exist or their final
    counts (the SET of distinct keys per bucket is what is counted), but it does decide which of
    two colliding raw messages is the one folded into `total_events` — callers must not read
    anything into which one "won", because B3 does not resolve that either.

    Returned in FIRST-SEEN order of `(symbol, day)`, so a report built from this tuple lists
    buckets in the order its input arrived, not an arbitrary dict order.
    """
    seen: set[tuple[str, ForceOrderNaturalKey]] = set()
    totals: dict[tuple[str, str], int] = {}
    collisions: dict[tuple[str, str], int] = {}
    bucket_order: list[tuple[str, str]] = []
    for observation in observations:
        bucket = (observation.key.symbol, observation.day)
        seen_key = (observation.day, observation.key)
        if seen_key in seen:
            collisions[bucket] = collisions.get(bucket, 0) + 1
            continue
        seen.add(seen_key)
        if bucket not in totals:
            bucket_order.append(bucket)
        totals[bucket] = totals.get(bucket, 0) + 1
    return tuple(
        DailyCollisionCount(
            symbol=symbol,
            day=day,
            total_events=totals[(symbol, day)],
            collisions=collisions.get((symbol, day), 0),
        )
        for symbol, day in bucket_order
    )


def d3_6_universe_met(counts: Sequence[DailyCollisionCount]) -> bool:
    """Whether `counts` already reaches D3.6's declared universe (`>= 30` days, `>= 20` symbols).

    A pure count of DISTINCT days and DISTINCT symbols across `counts` — it does not know or
    care whether the days are consecutive or the symbols are the ones `plano 03` names; a caller
    that needs that stronger claim states it separately, next to whatever the real evidence file
    proves.
    """
    distinct_days = {count.day for count in counts}
    distinct_symbols = {count.symbol for count in counts}
    has_enough_days = len(distinct_days) >= D3_6_REQUIRED_DAYS
    has_enough_symbols = len(distinct_symbols) >= D3_6_REQUIRED_SYMBOLS
    return has_enough_days and has_enough_symbols
