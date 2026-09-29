"""`project_oi_candles` against `ADR-045/D1`-`D2` and the `OiCandle` contract of `SPEC-009` §6.4.

`T-03.8`, `plano 03` item 3b.1. What this file has to prove, from the task's own refs:

* DoD: `low <= min(o, c) <= max(o, c) <= high`; no row with `open_at_ms == close_at_ms`;
  `samples.expected == TF / g`.
* MORDE: accepting another trio; stitching the anchor across a hole.

Every table of expected values below is written BY HAND from `ADR-045/D1`'s text, never computed
by calling the function under test — comparing the projection against itself proves nothing.
"""

from __future__ import annotations

import dataclasses
import itertools
import math
import random
from collections.abc import Callable

import pytest

from src.modules.sentimento.domain.oi_candle import (
    OI_CANDLE_TRIO,
    InvalidOiReadingsError,
    OiCandle,
    OiCandleSource,
    OiReading,
    TimeframeOffNativeGridError,
    UncoveredOiCandleTrioError,
    UnknownOiCandleSourceError,
    effective_timeframe_ms,
    oi_candle_source,
    project_oi_candles,
)
from src.modules.sentimento.domain.open_interest_catalog import (
    binance_open_interest_poll_entry,
    open_interest_catalog_entries,
)
from src.modules.sentimento.domain.series_catalog import SeriesCatalogEntry
from src.modules.sentimento.domain.series_history_report import BucketCoverage
from src.modules.sentimento.domain.series_key import Nature, Reduction, TsConvention
from src.modules.sentimento.domain.series_reduction import reduce_bucket

MINUTE_MS = 60_000
FIVE_MIN_MS = 5 * MINUTE_MS
FIFTEEN_MIN_MS = 15 * MINUTE_MS
# A UTC-aligned origin, a multiple of every TF `/series-history` serves (4 h included).
ORIGIN_MS = 1_789_200_000_000 - (1_789_200_000_000 % (4 * 60 * MINUTE_MS))
FAR_FUTURE_MS = ORIGIN_MS + 10**12


def _hist_entry() -> SeriesCatalogEntry:
    """Return the `openInterestHist` row — the ONE Binance `POINT` entry of the 5-min catalog."""
    entries = [
        entry
        for entry in open_interest_catalog_entries("BTCUSDT").entries
        if entry.key.provider == "binance"
    ]
    assert len(entries) == 1
    return entries[0]


def _poll_entry() -> SeriesCatalogEntry:
    """Return the polled row of `BTCUSDT` (`T-03.3`)."""
    return binance_open_interest_poll_entry("BTCUSDT")


def _readings(grid_ms: int, values: dict[int, float]) -> list[OiReading]:
    """Build readings at `ORIGIN_MS + slot * grid_ms` for the slots given (a hole is omitted)."""
    return [
        OiReading(instant_ms=ORIGIN_MS + slot * grid_ms, value=value)
        for slot, value in sorted(values.items())
    ]


# ── the grid `g` comes from the series, and the regimes are the two known entries ───────────


def test_both_known_entries_are_the_trio_and_carry_their_declared_grid() -> None:
    """The precondition of every test below: both regimes share the trio, and differ in `g`."""
    for entry in (_hist_entry(), _poll_entry()):
        assert (entry.key.nature, entry.key.reduction, entry.key.ts_convention) == OI_CANDLE_TRIO
    assert _hist_entry().native_grid_ms == FIVE_MIN_MS
    assert _poll_entry().native_grid_ms == MINUTE_MS


def test_derived_from_is_resolved_from_the_series_never_from_the_caller() -> None:
    """Each known series resolves to its own `derived_from`, for any symbol."""
    assert oi_candle_source(_poll_entry().key) is OiCandleSource.BINANCE_POLL_1M
    assert oi_candle_source(_hist_entry().key) is OiCandleSource.BINANCE_POINT_5M
    # Per symbol, the same answer: `instrument_id` is not part of the source identity.
    assert (
        oi_candle_source(binance_open_interest_poll_entry("ETHUSDT").key)
        is OiCandleSource.BINANCE_POLL_1M
    )


def test_derived_from_enum_is_the_closed_set_of_spec_009_6_4() -> None:
    """`coinalyze_ohlc_5m` left with `O-2`; the enum has exactly the two Binance sources."""
    assert {source.value for source in OiCandleSource} == {"binance_poll_1m", "binance_point_5m"}


def test_expected_is_tf_over_g_with_g_taken_from_the_entry() -> None:
    """Same readings, same TF, two entries: `expected` follows each entry's DECLARED grid."""
    readings = _readings(FIVE_MIN_MS, {0: 100.0, 1: 101.0, 2: 102.0, 3: 103.0})
    poll = project_oi_candles(
        _poll_entry(), readings, timeframe_ms=FIFTEEN_MIN_MS, now_ms=FAR_FUTURE_MS
    )
    hist = project_oi_candles(
        _hist_entry(), readings, timeframe_ms=FIFTEEN_MIN_MS, now_ms=FAR_FUTURE_MS
    )
    assert {candle.samples.expected for candle in poll} == {15}
    assert {candle.samples.expected for candle in hist} == {3}


def test_tf_below_the_native_grid_is_served_on_the_native_grid() -> None:
    """`SPEC-009` §6.5: TF `1m` over the 5-minute history → buckets of 300 000 ms, 1 slot in 5."""
    assert effective_timeframe_ms(MINUTE_MS, FIVE_MIN_MS) == FIVE_MIN_MS
    readings = _readings(FIVE_MIN_MS, {0: 100.0, 1: 101.0, 2: 99.0})
    candles = project_oi_candles(
        _hist_entry(), readings, timeframe_ms=MINUTE_MS, now_ms=FAR_FUTURE_MS
    )
    assert [candle.bucket_end_ms for candle in candles] == [
        ORIGIN_MS + FIVE_MIN_MS,
        ORIGIN_MS + 2 * FIVE_MIN_MS,
    ]
    assert {candle.samples.expected for candle in candles} == {1}


@pytest.mark.parametrize(
    ("timeframe_ms", "native_grid_ms"),
    [(7 * MINUTE_MS, FIVE_MIN_MS), (0, FIVE_MIN_MS), (-MINUTE_MS, MINUTE_MS), (MINUTE_MS, 0)],
)
def test_a_tf_that_splits_native_slots_or_is_not_positive_is_refused(
    timeframe_ms: int, native_grid_ms: int
) -> None:
    """A TF that is not a positive whole multiple of `g` (after `max(TF, g)`) raises."""
    with pytest.raises(TimeframeOffNativeGridError):
        effective_timeframe_ms(timeframe_ms, native_grid_ms)


# ── MORDE 1: any other trio fails high (`ADR-045/D2`) ───────────────────────────────────────


_OTHER_TRIOS = [
    trio for trio in itertools.product(Nature, Reduction, TsConvention) if trio != OI_CANDLE_TRIO
]


def test_the_other_trio_universe_is_every_combination_but_one() -> None:
    """Pin the universe the parametrised refusal runs over: 5 × 8 × 3 − 1."""
    assert len(_OTHER_TRIOS) == len(Nature) * len(Reduction) * len(TsConvention) - 1 == 119


@pytest.mark.parametrize(("nature", "reduction", "ts_convention"), _OTHER_TRIOS)
def test_every_other_trio_fails_high(
    nature: Nature, reduction: Reduction, ts_convention: TsConvention
) -> None:
    """MORDE: the hist entry with ANY other trio is refused, and the message names the trio."""
    entry = _hist_entry()
    wrong_key = dataclasses.replace(
        entry.key, nature=nature, reduction=reduction, ts_convention=ts_convention
    )
    wrong_entry = dataclasses.replace(entry, key=wrong_key)
    readings = _readings(FIVE_MIN_MS, {0: 100.0, 1: 101.0})
    with pytest.raises(UncoveredOiCandleTrioError) as refused:
        project_oi_candles(wrong_entry, readings, timeframe_ms=FIVE_MIN_MS, now_ms=FAR_FUTURE_MS)
    assert nature.value in str(refused.value)
    assert ts_convention.value in str(refused.value)


def test_the_coinalyze_ohlc_rows_are_refused_by_the_trio() -> None:
    """The concrete case the trio exists for: Coinalyze's `OPEN` is not `p(T0)`."""
    coinalyze = [
        entry
        for entry in open_interest_catalog_entries("BTCUSDT").entries
        if entry.key.provider == "coinalyze"
    ]
    assert len(coinalyze) == 4
    for entry in coinalyze:
        with pytest.raises(UncoveredOiCandleTrioError):
            project_oi_candles(entry, [], timeframe_ms=FIVE_MIN_MS, now_ms=FAR_FUTURE_MS)


def test_a_trio_valid_series_of_an_unknown_source_is_refused_not_labelled() -> None:
    """Right trio, unknown provider: refused by name, never given a guessed label."""
    entry = _hist_entry()
    foreign = dataclasses.replace(entry, key=dataclasses.replace(entry.key, provider="bybit"))
    with pytest.raises(UnknownOiCandleSourceError):
        project_oi_candles(foreign, [], timeframe_ms=FIVE_MIN_MS, now_ms=FAR_FUTURE_MS)


# ── `ADR-045/D1`, row by row, with hand-written expectations ────────────────────────────────


def test_anchor_row_open_is_p_t0_and_close_is_p_t1() -> None:
    """TF `5m` on `g = 5 min`: `|S| == 1`, and the anchor is what makes the body non-zero.

    This is the `RN-5` defect `ADR-045` replaces: `open` taken as "the first of S" would make
    every one of these candles `open == close`.
    """
    readings = _readings(FIVE_MIN_MS, {0: 100.0, 1: 104.0, 2: 101.0})
    candles = project_oi_candles(
        _hist_entry(), readings, timeframe_ms=FIVE_MIN_MS, now_ms=FAR_FUTURE_MS
    )
    assert candles == (
        OiCandle(
            bucket_end_ms=ORIGIN_MS + FIVE_MIN_MS,
            open=100.0,
            high=104.0,
            low=100.0,
            close=104.0,
            open_at_ms=ORIGIN_MS,
            close_at_ms=ORIGIN_MS + FIVE_MIN_MS,
            samples=BucketCoverage(present=1, expected=1),
            closed=True,
            derived_from=OiCandleSource.BINANCE_POINT_5M,
        ),
        OiCandle(
            bucket_end_ms=ORIGIN_MS + 2 * FIVE_MIN_MS,
            open=104.0,
            high=104.0,
            low=101.0,
            close=101.0,
            open_at_ms=ORIGIN_MS + FIVE_MIN_MS,
            close_at_ms=ORIGIN_MS + 2 * FIVE_MIN_MS,
            samples=BucketCoverage(present=1, expected=1),
            closed=True,
            derived_from=OiCandleSource.BINANCE_POINT_5M,
        ),
    )


def test_anchor_survives_holes_inside_the_bucket() -> None:
    """`p(T0)` exists, `T0 + 5 min` is a hole: the anchor still holds (the `gap == 300000` bug)."""
    # 15m buckets on g=5m: bucket (0, 3] has slots 1 (hole), 2, 3.
    readings = _readings(FIVE_MIN_MS, {0: 100.0, 2: 97.0, 3: 102.0})
    (candle,) = project_oi_candles(
        _hist_entry(), readings, timeframe_ms=FIFTEEN_MIN_MS, now_ms=FAR_FUTURE_MS
    )
    assert (candle.open, candle.high, candle.low, candle.close) == (100.0, 102.0, 97.0, 102.0)
    assert candle.open_at_ms == ORIGIN_MS
    assert candle.samples == BucketCoverage(present=2, expected=3)


def test_no_anchor_and_two_samples_opens_on_the_first_sample() -> None:
    """No `p(T0)` and `|S| >= 2`: `open` is the first reading of `S`, `open_at_ms > T0`."""
    readings = _readings(FIVE_MIN_MS, {4: 100.0, 5: 98.0, 6: 103.0})
    # bucket (3, 6] has no p(slot 3); S = slots 4, 5, 6.
    (candle,) = project_oi_candles(
        _hist_entry(), readings, timeframe_ms=FIFTEEN_MIN_MS, now_ms=FAR_FUTURE_MS
    )
    assert candle.bucket_end_ms == ORIGIN_MS + 6 * FIVE_MIN_MS
    assert (candle.open, candle.high, candle.low, candle.close) == (100.0, 103.0, 98.0, 103.0)
    assert candle.open_at_ms == ORIGIN_MS + 4 * FIVE_MIN_MS
    assert candle.open_at_ms > candle.bucket_end_ms - FIFTEEN_MIN_MS


def test_no_anchor_and_one_sample_is_no_candle() -> None:
    """A doji from one reading would be a zero fabricated out of absence (`RN-4`)."""
    readings = _readings(FIVE_MIN_MS, {4: 100.0})
    assert (
        project_oi_candles(
            _hist_entry(), readings, timeframe_ms=FIFTEEN_MIN_MS, now_ms=FAR_FUTURE_MS
        )
        == ()
    )


def test_missing_p_t1_closes_on_the_last_sample_with_close_at_before_t1() -> None:
    """No `p(T1)`: `close` is the last reading of `S` and `close_at_ms < T1` says so."""
    readings = _readings(FIVE_MIN_MS, {0: 100.0, 1: 106.0, 2: 99.0})
    # bucket (0, 3] — slot 3 (T1) is absent.
    (candle,) = project_oi_candles(
        _hist_entry(), readings, timeframe_ms=FIFTEEN_MIN_MS, now_ms=FAR_FUTURE_MS
    )
    assert candle.bucket_end_ms == ORIGIN_MS + 3 * FIVE_MIN_MS
    assert candle.close == 99.0
    assert candle.close_at_ms == ORIGIN_MS + 2 * FIVE_MIN_MS < candle.bucket_end_ms
    assert (candle.high, candle.low) == (106.0, 99.0)


def test_high_and_low_include_the_anchor() -> None:
    """`high`/`low` are over `{open} ∪ S`: an anchor above every sample IS the high."""
    readings = _readings(FIVE_MIN_MS, {0: 110.0, 1: 101.0, 2: 102.0, 3: 103.0})
    (candle,) = project_oi_candles(
        _hist_entry(), readings, timeframe_ms=FIFTEEN_MIN_MS, now_ms=FAR_FUTURE_MS
    )
    assert candle.high == 110.0
    assert candle.low == 101.0


def test_closed_is_false_only_for_the_bucket_whose_end_has_not_arrived() -> None:
    """`closed` is `bucket_end_ms <= now_ms`, and the in-progress bucket closes on its last."""
    readings = _readings(MINUTE_MS, {0: 100.0, 1: 101.0, 2: 102.0, 3: 103.0})
    now = ORIGIN_MS + 3 * MINUTE_MS + 1  # past the three 1m buckets, inside the 5m one
    candles = project_oi_candles(_poll_entry(), readings, timeframe_ms=MINUTE_MS, now_ms=now)
    assert [candle.closed for candle in candles] == [True, True, True]
    in_progress = project_oi_candles(_poll_entry(), readings, timeframe_ms=FIVE_MIN_MS, now_ms=now)
    assert [(candle.bucket_end_ms, candle.closed) for candle in in_progress] == [
        (ORIGIN_MS + FIVE_MIN_MS, False)
    ]
    assert in_progress[0].close_at_ms == ORIGIN_MS + 3 * MINUTE_MS
    # The boundary: at `now_ms == bucket_end_ms` the closing instant HAS arrived.
    at_the_end = project_oi_candles(
        _poll_entry(), readings, timeframe_ms=MINUTE_MS, now_ms=ORIGIN_MS + 3 * MINUTE_MS
    )
    assert at_the_end[-1].bucket_end_ms == ORIGIN_MS + 3 * MINUTE_MS
    assert at_the_end[-1].closed is True


# ── MORDE 2: the anchor is never stitched across a hole (`plano 03` §03b DoD-4) ─────────────


def test_the_first_bucket_after_a_hole_has_no_candle_in_the_historical_regime() -> None:
    """TF `5m` on the 5-minute history, readings at slots 0..2, a hole over 3..6, then 7..9.

    Stitching the anchor to "the last reading before T0" would draw bucket (6, 7] with
    `open = p(slot 2)` — a body spanning 25 minutes nobody observed.
    """
    readings = _readings(FIVE_MIN_MS, {0: 100.0, 1: 101.0, 2: 102.0, 7: 150.0, 8: 151.0, 9: 149.0})
    candles = project_oi_candles(
        _hist_entry(), readings, timeframe_ms=FIVE_MIN_MS, now_ms=FAR_FUTURE_MS
    )
    ends = [candle.bucket_end_ms for candle in candles]
    assert ends == [ORIGIN_MS + slot * FIVE_MIN_MS for slot in (1, 2, 8, 9)]
    hole_and_first_after = {ORIGIN_MS + slot * FIVE_MIN_MS for slot in range(3, 8)}
    assert hole_and_first_after.isdisjoint(ends)
    first_after = candles[2]
    assert first_after.open == 150.0
    assert first_after.open_at_ms == ORIGIN_MS + 7 * FIVE_MIN_MS


def test_a_wider_bucket_after_a_hole_opens_on_its_own_first_sample_not_before_the_hole() -> None:
    """A 15m bucket after a hole opens on its own first sample; the pre-hole value never enters."""
    readings = _readings(FIVE_MIN_MS, {0: 100.0, 1: 101.0, 5: 140.0, 6: 142.0})
    # 15m bucket (3, 6] has no p(slot 3), S = slots 5, 6.
    candles = project_oi_candles(
        _hist_entry(), readings, timeframe_ms=FIFTEEN_MIN_MS, now_ms=FAR_FUTURE_MS
    )
    after = [candle for candle in candles if candle.bucket_end_ms == ORIGIN_MS + 6 * FIVE_MIN_MS]
    assert len(after) == 1
    assert after[0].open == 140.0
    assert after[0].low == 140.0  # the pre-hole 101.0 never enters {open} ∪ S


# ── the input contract is refused, never repaired ───────────────────────────────────────────


@pytest.mark.parametrize(
    "readings",
    [
        [OiReading(ORIGIN_MS + FIVE_MIN_MS, 1.0), OiReading(ORIGIN_MS, 1.0)],
        [OiReading(ORIGIN_MS, 1.0), OiReading(ORIGIN_MS, 2.0)],
        [OiReading(ORIGIN_MS + 1, 1.0)],
        [OiReading(ORIGIN_MS + MINUTE_MS, 1.0)],
        [OiReading(ORIGIN_MS, math.nan)],
        [OiReading(ORIGIN_MS, math.inf)],
    ],
    ids=["descending", "duplicate", "off-grid-1ms", "off-5m-grid", "nan", "inf"],
)
def test_invalid_readings_are_refused(readings: list[OiReading]) -> None:
    """Unordered, duplicated, off-grid or non-finite readings raise; nothing is repaired."""
    with pytest.raises(InvalidOiReadingsError):
        project_oi_candles(_hist_entry(), readings, timeframe_ms=FIVE_MIN_MS, now_ms=0)


def test_the_contract_refuses_a_one_instant_candle_and_a_broken_ordering() -> None:
    """`OiCandle` itself refuses the two rules of `SPEC-009` §6.4, whoever builds it."""
    base = {
        "bucket_end_ms": ORIGIN_MS,
        "open": 100.0,
        "high": 101.0,
        "low": 99.0,
        "close": 100.5,
        "open_at_ms": ORIGIN_MS - MINUTE_MS,
        "close_at_ms": ORIGIN_MS,
        "samples": BucketCoverage(present=1, expected=1),
        "closed": True,
        "derived_from": OiCandleSource.BINANCE_POLL_1M,
    }
    OiCandle(**base)  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="open_at_ms == close_at_ms"):
        OiCandle(**{**base, "open_at_ms": ORIGIN_MS})  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="low <= min"):
        OiCandle(**{**base, "high": 100.2})  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="low <= min"):
        OiCandle(**{**base, "low": 100.2})  # type: ignore[arg-type]


# ── the DoD properties, over seeded random series with holes, in BOTH regimes ───────────────


def _random_series(rng: random.Random, grid_ms: int, slots: int) -> list[OiReading]:
    """Walk contracts randomly with ~15% of slots missing, some in runs (M3-like holes)."""
    readings: list[OiReading] = []
    value = 80_000.0
    slot = 0
    while slot < slots:
        if rng.random() < 0.03:
            slot += rng.randint(2, 12)  # a run of missing slots
            continue
        value += rng.choice([-1.0, 1.0]) * rng.random() * 40.0
        if rng.random() > 0.12:
            readings.append(OiReading(ORIGIN_MS + slot * grid_ms, round(value, 3)))
        slot += 1
    return readings


_REGIMES = [
    pytest.param(_poll_entry, (MINUTE_MS, FIVE_MIN_MS, FIFTEEN_MIN_MS, 60 * MINUTE_MS), id="poll"),
    pytest.param(
        _hist_entry,
        (MINUTE_MS, FIVE_MIN_MS, FIFTEEN_MIN_MS, 60 * MINUTE_MS, 240 * MINUTE_MS),
        id="hist",
    ),
]


@pytest.mark.parametrize(("entry_of", "timeframes"), _REGIMES)
def test_dod_properties_hold_on_every_candle_of_random_series(
    entry_of: Callable[[], SeriesCatalogEntry], timeframes: tuple[int, ...]
) -> None:
    """The DoD of `T-03.8` and `ADR-045` falsifiers 1-2, over every candle of a random series."""
    entry = entry_of()
    grid = entry.native_grid_ms
    rng = random.Random(20260927)  # noqa: S311 (deterministic test fixture, not crypto)
    readings = _random_series(rng, grid, slots=3_000)
    value_at = {reading.instant_ms: reading.value for reading in readings}
    checked = 0
    anchored = 0
    chained = 0
    for timeframe in timeframes:
        bucket_ms = max(timeframe, grid)
        candles = project_oi_candles(entry, readings, timeframe_ms=timeframe, now_ms=FAR_FUTURE_MS)
        by_end = {candle.bucket_end_ms: candle for candle in candles}
        for candle in candles:
            t0 = candle.bucket_end_ms - bucket_ms
            inside = [
                reading.value
                for reading in readings
                if t0 < reading.instant_ms <= candle.bucket_end_ms
            ]
            # DoD: ordering, one-instant rule, expected = TF / g.
            assert candle.low <= min(candle.open, candle.close)
            assert max(candle.open, candle.close) <= candle.high
            assert candle.open_at_ms != candle.close_at_ms
            assert candle.samples.expected == bucket_ms // grid
            assert candle.samples.present == len(inside) <= candle.samples.expected
            # ADR-045 falsifier 1: close == what `(STOCK, POINT) = last` serves for the bucket.
            assert candle.close == reduce_bucket(Nature.STOCK, Reduction.POINT, inside)
            # ADR-045 falsifier 2: open(B_k) == close(B_k-1) whenever the anchor was used.
            # (The previous bucket may itself have no candle — p(T0) alone, no anchor of its
            # own — and then there is no close(B_k-1) to compare against.)
            if candle.open_at_ms == t0:
                anchored += 1
                assert candle.open == value_at[t0]
                if t0 in by_end:
                    chained += 1
                    assert by_end[t0].close == candle.open
            else:
                assert candle.open_at_ms > t0
            checked += 1
    # The universe the properties ran over, so a vacuous pass cannot hide behind "all green".
    assert checked > 2_000
    assert anchored > 1_000
    assert chained > 1_000
