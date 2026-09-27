"""The four falsifiers of `ADR-045`, as pure verdicts over served `OiCandle`s and point readings."""

# `plano 03` item 3b.3 + `DoD-03b` 1-2, `T-03.10`. `ADR-045` §Falsificador names four numbers
# that can knock the projection down BEFORE a pixel is drawn, and this module is where each of
# them is computed, one function per falsifier, over data the route already serves:
#
#   1. CLOSE — in every closed bucket that has `p(T1)`, `OiCandle.close` equals the value the
#      route ALREADY serves for `(STOCK, POINT) = last` on the same TF (`rows[i].value`).
#   2. ANCHOR — `open(B_k) == close(B_(k-1))` whenever `open_at_ms == T0`.
#   3. POWER — in the anchored, hole-free buckets, a zero body (`close == open`) in MORE than
#      50% of them means the candle cannot say "contracts came in / went out", and the decision
#      goes back to the owner.
#   4. SAME QUANTITY — at the 5-minute instants where BOTH series have a point, the median of
#      `|poll(T) - hist(T)| / hist(T)` stays at or under 10 bp (`SPEC-009` §6.2, `[INFERRED]`).
#
# ── A DIVERGENCE FAILS WHATEVER THE `n`; `HELD` NEEDS THE FLOOR ──────────────────────────────
#
# The properties (1, 2) are exact: "uma divergência reprova" (`DoD-03b` 1). So one divergence is
# `FAILED` even in a universe below the floor, while `HELD` is only reachable at `n >= floor`. Below
# the floor with no divergence the verdict is `INCONCLUSIVE`, never `HELD`: a green over 40
# buckets reported as a green over 288 is the `rc=0` ambiguity `ADR-012` names. The two
# statistics (3, 4) have no single-element failure, so below their floor they are `INCONCLUSIVE`
# whatever the value.
#
# ── EACH PROPERTY IS MEASURED INSIDE ONE REGIME ─────────────────────────────────────────────────
#
# `ADR-045/D2-bis` serves one series per bucket, so two consecutive candles can come from two
# series: at the bucket where the capture starts, `open` is `p_poll(T0)` and the previous
# `close` is `p_hist(T0)`. Their difference is falsifier 4's quantity, not an anchor defect, so
# the anchor pairs are taken only between candles of the SAME `derived_from`, and the property
# is reported per regime (`DoD-03b` 1: "em cada regime").
#
# Nothing here reads a store, a clock or the network: the candles, the served rows and the
# readings arrive as arguments.

from __future__ import annotations

import statistics
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from enum import Enum
from typing import Final

from src.modules.sentimento.domain.oi_candle import OiCandle, OiCandleSource, OiReading

# `ADR-045` §Falsificador 1-2 and `DoD-03b` 1-2: 24 h of 5-minute buckets.
PROPERTY_MIN_BUCKETS: Final[int] = 288
# `ADR-045` §Falsificador 3: "nos buckets `5m` com âncora e sem buraco (`n ≥ 200`)".
POWER_MIN_BUCKETS: Final[int] = 200
# `ADR-045` §Falsificador 3: a zero body in MORE than 50% of the buckets knocks the decision down.
POWER_MAX_FLAT_SHARE: Final[float] = 0.5
# `ADR-045` §Falsificador 4 / `SPEC-009` §6.2: `n ≥ 288` shared instants.
SPREAD_MIN_INSTANTS: Final[int] = 288
# `ADR-045` §Falsificador 4 / `SPEC-009` §6.2, `[INFERRED: limiar]`.
SPREAD_MAX_MEDIAN_BP: Final[float] = 10.0
# The grid the two regimes share: the native grid of `openInterestHist` (`SPEC-009` §6.2).
SPREAD_GRID_MS: Final[int] = 300_000

_BASIS_POINTS: Final[float] = 10_000.0


class FalsifierOutcome(Enum):
    """The verdict of one falsifier: it held, it knocked the decision down, or `n` was short."""

    HELD = "held"
    FAILED = "failed"
    INCONCLUSIVE = "inconclusive"


class NonPositiveHistoryReadingError(Exception):
    """A `hist(T) <= 0` would divide the relative spread by zero or flip its sign.

    Open interest in contracts is never zero or negative on a listed perpetual, so such a reading
    is corrupt data, and it is refused by name instead of being skipped or turned into `inf`.
    """


@dataclass(frozen=True)
class PropertyDivergence:
    """One bucket where an exact property of `ADR-045` did not hold.

    `expected` is `None` when the reference value itself was absent (a closed bucket with
    `p(T1)` whose served `last` row carried no value is also a divergence).
    """

    bucket_end_ms: int
    expected: float | None
    observed: float


@dataclass(frozen=True)
class PropertyVerdict:
    """Falsifier 1 or 2 over ONE regime: how many buckets were checked and which diverged."""

    derived_from: OiCandleSource
    n: int
    divergences: tuple[PropertyDivergence, ...]

    @property
    def outcome(self) -> FalsifierOutcome:
        """`FAILED` on any divergence; otherwise `HELD` only at `n >= PROPERTY_MIN_BUCKETS`."""
        if self.divergences:
            return FalsifierOutcome.FAILED
        if self.n < PROPERTY_MIN_BUCKETS:
            return FalsifierOutcome.INCONCLUSIVE
        return FalsifierOutcome.HELD


@dataclass(frozen=True)
class PowerVerdict:
    """Falsifier 3 over ONE regime: the share of anchored, hole-free buckets with a zero body."""

    derived_from: OiCandleSource
    n: int
    flat: int

    @property
    def flat_share(self) -> float | None:
        """`flat / n`, or `None` over an empty universe (never a fabricated `0.0`)."""
        if self.n == 0:
            return None
        return self.flat / self.n

    @property
    def outcome(self) -> FalsifierOutcome:
        """`INCONCLUSIVE` below `POWER_MIN_BUCKETS`; `FAILED` above `POWER_MAX_FLAT_SHARE`."""
        share = self.flat_share
        if share is None or self.n < POWER_MIN_BUCKETS:
            return FalsifierOutcome.INCONCLUSIVE
        if share > POWER_MAX_FLAT_SHARE:
            return FalsifierOutcome.FAILED
        return FalsifierOutcome.HELD


@dataclass(frozen=True)
class SpreadVerdict:
    """Falsifier 4: the relative spread `|poll - hist| / hist` in bp, at the shared instants."""

    n: int
    median_bp: float | None
    p90_bp: float | None
    max_bp: float | None

    @property
    def outcome(self) -> FalsifierOutcome:
        """`INCONCLUSIVE` below `SPREAD_MIN_INSTANTS`; `FAILED` above `SPREAD_MAX_MEDIAN_BP`."""
        if self.median_bp is None or self.n < SPREAD_MIN_INSTANTS:
            return FalsifierOutcome.INCONCLUSIVE
        if self.median_bp > SPREAD_MAX_MEDIAN_BP:
            return FalsifierOutcome.FAILED
        return FalsifierOutcome.HELD


def _regime(candles: Sequence[OiCandle], derived_from: OiCandleSource) -> tuple[OiCandle, ...]:
    """Return the candles of one regime, in the order they were served."""
    return tuple(candle for candle in candles if candle.derived_from is derived_from)


def close_property(
    candles: Sequence[OiCandle],
    *,
    served_last: Mapping[int, str | None],
    derived_from: OiCandleSource,
) -> PropertyVerdict:
    """Falsifier 1: `close` equals the served `last` of its own series and TF, given `p(T1)`.

    `served_last` maps `rows[i].event_time` to `rows[i].value` of the SAME series the regime's
    candles were projected from (the route serves `rows` for the requested series only, so the
    caller asks once per series). The universe is every closed candle with `close_at_ms ==
    bucket_end_ms` — the ones that have `p(T1)`. The comparison is exact: the served string is
    read back as `float`, the same `float` the candle carries.
    """
    universe = [
        candle
        for candle in _regime(candles, derived_from)
        if candle.closed and candle.close_at_ms == candle.bucket_end_ms
    ]
    divergences: list[PropertyDivergence] = []
    for candle in universe:
        served = served_last.get(candle.bucket_end_ms)
        expected = float(served) if served is not None else None
        if expected != candle.close:
            divergences.append(
                PropertyDivergence(
                    bucket_end_ms=candle.bucket_end_ms, expected=expected, observed=candle.close
                )
            )
    return PropertyVerdict(
        derived_from=derived_from, n=len(universe), divergences=tuple(divergences)
    )


def anchor_property(
    candles: Sequence[OiCandle],
    *,
    bucket_ms: int,
    derived_from: OiCandleSource,
) -> PropertyVerdict:
    """Falsifier 2: `open(B_k) == close(B_(k-1))` whenever `open_at_ms == T0`, inside one regime.

    `bucket_ms` is the regime's EFFECTIVE bucket width (`OiCandleSourceDeclaration.
    bucket_interval_ms`), so `T0 = bucket_end_ms - bucket_ms`. The universe is every anchored
    candle whose previous bucket was served from the same series; an anchored candle whose
    previous bucket has no candle of this regime has nothing to be compared with and is left out
    (see the module note for why a previous candle of the OTHER series is not a comparison).
    """
    regime = _regime(candles, derived_from)
    by_end = {candle.bucket_end_ms: candle for candle in regime}
    divergences: list[PropertyDivergence] = []
    n = 0
    for candle in regime:
        anchor_ms = candle.bucket_end_ms - bucket_ms
        previous = by_end.get(anchor_ms)
        if candle.open_at_ms != anchor_ms or previous is None:
            continue
        n += 1
        if candle.open != previous.close:
            divergences.append(
                PropertyDivergence(
                    bucket_end_ms=candle.bucket_end_ms,
                    expected=previous.close,
                    observed=candle.open,
                )
            )
    return PropertyVerdict(derived_from=derived_from, n=n, divergences=tuple(divergences))


def power_property(
    candles: Sequence[OiCandle],
    *,
    bucket_ms: int,
    derived_from: OiCandleSource,
) -> PowerVerdict:
    """Falsifier 3: the share of zero bodies over the anchored, hole-free, closed buckets.

    "Com âncora" is `open_at_ms == T0`; "sem buraco" is `close_at_ms == bucket_end_ms` AND
    `samples.present == samples.expected` — every native slot of `(T0, T1]` has its reading.
    """
    universe = [
        candle
        for candle in _regime(candles, derived_from)
        if candle.closed
        and candle.open_at_ms == candle.bucket_end_ms - bucket_ms
        and candle.close_at_ms == candle.bucket_end_ms
        and candle.samples.present == candle.samples.expected
    ]
    flat = sum(1 for candle in universe if candle.close == candle.open)
    return PowerVerdict(derived_from=derived_from, n=len(universe), flat=flat)


def spread_property(
    poll: Sequence[OiReading],
    hist: Sequence[OiReading],
    *,
    grid_ms: int = SPREAD_GRID_MS,
) -> SpreadVerdict:
    """Falsifier 4: `|poll(T) - hist(T)| / hist(T)` in bp, at the `grid_ms` instants both have.

    Only instants on the shared grid count (`T % grid_ms == 0`), and only where BOTH series have
    a reading exactly at `T` — never a carried-forward value, which is what the readings of
    `use_cases/series_history.oi_point_readings` already guarantee.

    Raises:
        NonPositiveHistoryReadingError: a shared instant with `hist(T) <= 0`.

    """
    hist_at = {reading.instant_ms: reading.value for reading in hist}
    spreads_bp: list[float] = []
    for reading in poll:
        if reading.instant_ms % grid_ms != 0:
            continue
        reference = hist_at.get(reading.instant_ms)
        if reference is None:
            continue
        if reference <= 0:
            raise NonPositiveHistoryReadingError(
                f"hist({reading.instant_ms}) = {reference}: open interest in contracts is "
                f"never <= 0, so the relative spread of falsifier 4 cannot be computed"
            )
        spreads_bp.append(abs(reading.value - reference) / reference * _BASIS_POINTS)
    if not spreads_bp:
        return SpreadVerdict(n=0, median_bp=None, p90_bp=None, max_bp=None)
    ordered = sorted(spreads_bp)
    # Nearest-rank p90: the smallest value with at least 90% of the sample at or below it.
    nearest_rank_p90 = -(-9 * len(ordered) // 10)
    return SpreadVerdict(
        n=len(ordered),
        median_bp=statistics.median(ordered),
        p90_bp=ordered[nearest_rank_p90 - 1],
        max_bp=ordered[-1],
    )
