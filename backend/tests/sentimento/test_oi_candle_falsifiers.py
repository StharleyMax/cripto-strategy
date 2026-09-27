"""The four falsifiers of `ADR-045` as pure verdicts — `T-03.10`, `plano 03` item 3b.3.

Every verdict here is exercised on BOTH sides: a universe it must hold on, and the smallest
change that must knock it down. The floors (`288`, `200`) are tested at the edge, because a
verdict that says `held` over a short universe is the `rc=0` ambiguity `ADR-012` names.
"""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.oi_candle import OiCandle, OiCandleSource, OiReading
from src.modules.sentimento.domain.oi_candle_falsifiers import (
    POWER_MIN_BUCKETS,
    PROPERTY_MIN_BUCKETS,
    SPREAD_GRID_MS,
    SPREAD_MIN_INSTANTS,
    FalsifierOutcome,
    NonPositiveHistoryReadingError,
    PowerVerdict,
    PropertyVerdict,
    SpreadVerdict,
    anchor_property,
    close_property,
    power_property,
    spread_property,
)
from src.modules.sentimento.domain.series_history_report import BucketCoverage

POLL = OiCandleSource.BINANCE_POLL_1M
HIST = OiCandleSource.BINANCE_POINT_5M
BUCKET_MS = 300_000
ORIGIN_MS = 1_789_200_000_000


def _candle(
    index: int,
    *,
    open_value: float,
    close_value: float,
    source: OiCandleSource = HIST,
    anchored: bool = True,
    hole_at_end: bool = False,
    present: int = 1,
    expected: int = 1,
    closed: bool = True,
) -> OiCandle:
    """Bucket `index` of a `BUCKET_MS` grid: `(ORIGIN + (index - 1) * B, ORIGIN + index * B]`."""
    bucket_end = ORIGIN_MS + index * BUCKET_MS
    t0 = bucket_end - BUCKET_MS
    return OiCandle(
        bucket_end_ms=bucket_end,
        open=open_value,
        high=max(open_value, close_value),
        low=min(open_value, close_value),
        close=close_value,
        open_at_ms=t0 if anchored else t0 + 60_000,
        close_at_ms=bucket_end - 60_000 if hole_at_end else bucket_end,
        samples=BucketCoverage(present=present, expected=expected),
        closed=closed,
        derived_from=source,
    )


def _chain(count: int, *, source: OiCandleSource = HIST, start: int = 1) -> list[OiCandle]:
    """`count` anchored, hole-free candles whose `open` is always the previous `close`."""
    return [
        _candle(index, open_value=1000.0 + index, close_value=1001.0 + index, source=source)
        for index in range(start, start + count)
    ]


def _served_last(candles: list[OiCandle]) -> dict[int, str | None]:
    return {candle.bucket_end_ms: str(candle.close) for candle in candles}


# ── falsifier 1: close == served last ─────────────────────────────────────────────────────────


def test_close_holds_at_the_floor_and_is_inconclusive_one_bucket_below_it() -> None:
    """`held` needs `n >= 288`; one bucket short is `inconclusive`."""
    at_floor = _chain(PROPERTY_MIN_BUCKETS)
    below = _chain(PROPERTY_MIN_BUCKETS - 1)

    held = close_property(at_floor, served_last=_served_last(at_floor), derived_from=HIST)
    short = close_property(below, served_last=_served_last(below), derived_from=HIST)

    assert (held.n, held.outcome) == (PROPERTY_MIN_BUCKETS, FalsifierOutcome.HELD)
    assert (short.n, short.outcome) == (PROPERTY_MIN_BUCKETS - 1, FalsifierOutcome.INCONCLUSIVE)


def test_one_close_divergence_fails_even_below_the_floor() -> None:
    """One divergence fails whatever the `n` (`DoD-03b` 1)."""
    candles = _chain(3)
    served = _served_last(candles)
    served[candles[1].bucket_end_ms] = str(candles[1].close + 0.001)

    verdict = close_property(candles, served_last=served, derived_from=HIST)

    assert verdict.outcome is FalsifierOutcome.FAILED
    assert [d.bucket_end_ms for d in verdict.divergences] == [candles[1].bucket_end_ms]
    assert verdict.divergences[0].observed == candles[1].close


def test_a_served_row_without_value_is_a_divergence_with_no_expected() -> None:
    """A bucket with `p(T1)` whose served `last` is missing or null diverges."""
    candles = _chain(2)
    served = _served_last(candles)
    served[candles[0].bucket_end_ms] = None
    del served[candles[1].bucket_end_ms]

    verdict = close_property(candles, served_last=served, derived_from=HIST)

    assert [d.expected for d in verdict.divergences] == [None, None]


def test_close_universe_is_closed_buckets_with_p_t1_of_the_asked_regime() -> None:
    """Open buckets, buckets without `p(T1)` and the other regime are outside the universe."""
    kept = _candle(1, open_value=1.0, close_value=2.0)
    candles = [
        kept,
        _candle(2, open_value=2.0, close_value=3.0, hole_at_end=True),
        _candle(3, open_value=3.0, close_value=4.0, closed=False),
        _candle(4, open_value=4.0, close_value=5.0, source=POLL),
    ]
    # Every excluded candle is served a WRONG value: counting any of them would diverge.
    served: dict[int, str | None] = {c.bucket_end_ms: "-1" for c in candles}
    served[kept.bucket_end_ms] = str(kept.close)

    verdict = close_property(candles, served_last=served, derived_from=HIST)

    assert (verdict.n, verdict.divergences) == (1, ())


# ── falsifier 2: open(B_k) == close(B_(k-1)) when anchored ───────────────────────────────────


def test_anchor_holds_on_a_chain_and_counts_every_pair_with_a_previous_candle() -> None:
    """Every anchored candle with a previous candle of its regime is one pair."""
    candles = _chain(PROPERTY_MIN_BUCKETS + 1)

    verdict = anchor_property(candles, bucket_ms=BUCKET_MS, derived_from=HIST)

    assert (verdict.n, verdict.outcome) == (PROPERTY_MIN_BUCKETS, FalsifierOutcome.HELD)


def test_an_anchor_that_reads_the_wrong_point_fails() -> None:
    """An `open` that is not the previous `close` is the anchor reading the wrong point."""
    candles = _chain(4)
    candles[2] = _candle(3, open_value=candles[1].close - 0.5, close_value=candles[2].close)

    verdict = anchor_property(candles, bucket_ms=BUCKET_MS, derived_from=HIST)

    assert verdict.outcome is FalsifierOutcome.FAILED
    (divergence,) = verdict.divergences
    assert (divergence.expected, divergence.observed) == (candles[1].close, candles[2].open)


def test_anchor_pairs_never_cross_regimes_and_need_both_the_anchor_and_the_previous() -> None:
    """A cross-regime pair, a missing previous or an unanchored open is not a pair."""
    candles = [
        _candle(1, open_value=1.0, close_value=2.0, source=HIST),
        # Capture starts: the polled anchor p_poll(T0) differs from p_hist(T0) — falsifier 4's
        # quantity, not an anchor defect.
        _candle(2, open_value=2.5, close_value=3.0, source=POLL),
        _candle(3, open_value=9.0, close_value=10.0, source=HIST),  # no HIST candle at index 2
        _candle(4, open_value=7.0, close_value=11.0, source=HIST, anchored=False),
    ]

    hist = anchor_property(candles, bucket_ms=BUCKET_MS, derived_from=HIST)
    poll = anchor_property(candles, bucket_ms=BUCKET_MS, derived_from=POLL)

    assert (hist.n, hist.divergences) == (0, ())
    assert (poll.n, poll.divergences) == (0, ())
    assert hist.outcome is FalsifierOutcome.INCONCLUSIVE


# ── falsifier 3: the decision's power ────────────────────────────────────────────────────────


def _flat_mix(total: int, flat: int) -> list[OiCandle]:
    return [
        _candle(index, open_value=5.0, close_value=5.0 if index <= flat else 6.0)
        for index in range(1, total + 1)
    ]


def test_power_fails_above_half_flat_and_holds_at_exactly_half() -> None:
    """`ADR-045` §Falsificador 3: MORE than 50% flat knocks it down; exactly 50% does not."""
    above = power_property(
        _flat_mix(POWER_MIN_BUCKETS, POWER_MIN_BUCKETS // 2 + 1),
        bucket_ms=BUCKET_MS,
        derived_from=HIST,
    )
    half = power_property(
        _flat_mix(POWER_MIN_BUCKETS, POWER_MIN_BUCKETS // 2),
        bucket_ms=BUCKET_MS,
        derived_from=HIST,
    )

    assert above.outcome is FalsifierOutcome.FAILED
    assert (half.flat_share, half.outcome) == (0.5, FalsifierOutcome.HELD)


def test_power_below_its_floor_is_inconclusive_even_when_every_body_is_flat() -> None:
    """Below `n = 200` the share is reported, but no verdict is drawn from it."""
    verdict = power_property(
        _flat_mix(POWER_MIN_BUCKETS - 1, POWER_MIN_BUCKETS - 1),
        bucket_ms=BUCKET_MS,
        derived_from=HIST,
    )

    assert (verdict.flat_share, verdict.outcome) == (1.0, FalsifierOutcome.INCONCLUSIVE)


def test_power_counts_only_closed_anchored_hole_free_buckets_of_the_regime() -> None:
    """With anchor, without hole, closed, of the asked regime — nothing else counts."""
    candles = [
        _candle(1, open_value=5.0, close_value=6.0, present=5, expected=5),
        _candle(2, open_value=5.0, close_value=5.0, anchored=False),
        _candle(3, open_value=5.0, close_value=5.0, hole_at_end=True),
        _candle(4, open_value=5.0, close_value=5.0, present=4, expected=5),
        _candle(5, open_value=5.0, close_value=5.0, closed=False),
        _candle(6, open_value=5.0, close_value=5.0, source=POLL),
    ]

    verdict = power_property(candles, bucket_ms=BUCKET_MS, derived_from=HIST)

    assert (verdict.n, verdict.flat) == (1, 0)


def test_an_empty_power_universe_has_no_share_rather_than_zero() -> None:
    """An empty universe has no share; `0.0` would claim every body moved."""
    verdict = PowerVerdict(derived_from=HIST, n=0, flat=0)

    assert (verdict.flat_share, verdict.outcome) == (None, FalsifierOutcome.INCONCLUSIVE)


# ── falsifier 4: the two regimes measure the same quantity ──────────────────────────────────


def _readings(values: dict[int, float]) -> list[OiReading]:
    return [OiReading(instant_ms=instant, value=value) for instant, value in sorted(values.items())]


def _grid(count: int) -> list[int]:
    return [ORIGIN_MS + index * SPREAD_GRID_MS for index in range(count)]


@pytest.mark.parametrize(
    ("spread_bp", "expected"),
    [
        (9.99, FalsifierOutcome.HELD),
        (10.0, FalsifierOutcome.HELD),
        (10.01, FalsifierOutcome.FAILED),
    ],
)
def test_spread_threshold_is_ten_bp_on_the_median(
    spread_bp: float, expected: FalsifierOutcome
) -> None:
    """The limit is `<= 10 bp` on the median, inclusive."""
    instants = _grid(SPREAD_MIN_INSTANTS)
    hist = _readings(dict.fromkeys(instants, 100_000.0))
    poll = _readings(dict.fromkeys(instants, 100_000.0 * (1 + spread_bp / 10_000)))

    verdict = spread_property(poll, hist)

    assert verdict.n == SPREAD_MIN_INSTANTS
    assert verdict.median_bp == pytest.approx(spread_bp)
    assert verdict.outcome is expected


def test_spread_is_relative_to_hist_and_absolute_in_sign() -> None:
    """`|poll - hist| / hist`: the sign of the difference does not matter."""
    instants = _grid(3)
    hist = _readings({instants[0]: 1000.0, instants[1]: 1000.0, instants[2]: 2000.0})
    poll = _readings({instants[0]: 1001.0, instants[1]: 999.0, instants[2]: 2004.0})

    verdict = spread_property(poll, hist)

    assert verdict.median_bp == pytest.approx(10.0)
    assert verdict.max_bp == pytest.approx(20.0)
    assert verdict.outcome is FalsifierOutcome.INCONCLUSIVE


def test_spread_joins_only_shared_grid_instants() -> None:
    """Only 5-minute instants where BOTH series have a point are compared."""
    on_grid = ORIGIN_MS
    off_grid = ORIGIN_MS + 60_000
    only_poll = ORIGIN_MS + SPREAD_GRID_MS
    hist = _readings({on_grid: 1000.0, off_grid: 1.0})
    poll = _readings({on_grid: 1000.0, off_grid: 1000.0, only_poll: 5.0})

    verdict = spread_property(poll, hist)

    assert (verdict.n, verdict.median_bp) == (1, 0.0)


def test_spread_p90_is_nearest_rank() -> None:
    """p90 is the nearest-rank value, one of the observed spreads."""
    instants = _grid(10)
    hist = _readings(dict.fromkeys(instants, 10_000.0))
    poll = _readings({t: 10_000.0 + index for index, t in enumerate(instants, start=1)})

    verdict = spread_property(poll, hist)

    assert verdict.p90_bp == pytest.approx(9.0)
    assert verdict.max_bp == pytest.approx(10.0)


def test_spread_without_shared_instants_has_no_median() -> None:
    """No shared instant means no median, and no verdict."""
    verdict = spread_property([], _readings({ORIGIN_MS: 1.0}))

    assert verdict == SpreadVerdict(n=0, median_bp=None, p90_bp=None, max_bp=None)
    assert verdict.outcome is FalsifierOutcome.INCONCLUSIVE


def test_a_non_positive_history_reading_is_refused_by_name() -> None:
    """`hist(T) <= 0` is corrupt data, refused rather than divided by."""
    with pytest.raises(NonPositiveHistoryReadingError, match="never <= 0"):
        spread_property(_readings({ORIGIN_MS: 1.0}), _readings({ORIGIN_MS: 0.0}))


def test_a_property_verdict_below_the_floor_is_never_held() -> None:
    """No divergence over a short universe is `inconclusive`, never `held`."""
    verdict = PropertyVerdict(derived_from=POLL, n=PROPERTY_MIN_BUCKETS - 1, divergences=())

    assert verdict.outcome is FalsifierOutcome.INCONCLUSIVE


def test_the_floors_are_the_literals_adr_045_writes() -> None:
    """The edge tests above move WITH the constants, so the literals are pinned here.

    `ADR-045` §Falsificador writes `n ≥ 288` (1, 2, 4) and `n ≥ 200` (3); a floor lowered to 1
    would keep every edge test green and turn a short universe into `held` (the `T-03.10`
    mutation bench measured exactly that mutant surviving before this pin existed).
    """
    assert (PROPERTY_MIN_BUCKETS, POWER_MIN_BUCKETS, SPREAD_MIN_INSTANTS) == (288, 200, 288)
