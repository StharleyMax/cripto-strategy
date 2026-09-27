"""`project_one_series_per_bucket` against `ADR-045/D2-bis` — one candle, one series.

`T-03.9`, `plano 03` item 3b.2, DoD-5 of §03b: "No bucket em que a captura começa, `derived_from`
é um valor só, e `open_at_ms`/`close_at_ms` pertencem à mesma série. Morde: montar âncora do
histórico com amostras do polling."

The two series are given values in DIFFERENT THOUSANDS on purpose — the history around `1000`,
polling around `2000` — so a candle that mixes them cannot hide: its body would be ~1000
contracts of "difference between sources", the exact failure `D2-bis` names. Every expected
table below is written BY HAND from the ADR's text, never computed by the function under test.
"""

from __future__ import annotations

import dataclasses
import random

import pytest

from src.modules.sentimento.domain.oi_candle import (
    OiCandle,
    OiCandleSource,
    OiReading,
    effective_timeframe_ms,
    oi_candle_source_or_none,
    project_oi_candles,
)
from src.modules.sentimento.domain.oi_candle_regimes import (
    OiCandleReport,
    OiRegimeGridError,
    OiRegimeMismatchError,
    OiRegimeReadings,
    other_regime_key,
    project_one_series_per_bucket,
)
from src.modules.sentimento.domain.open_interest_catalog import (
    binance_open_interest_key,
    binance_open_interest_poll_entry,
    binance_open_interest_poll_key,
    coinalyze_open_interest_key,
    open_interest_catalog_entries,
)
from src.modules.sentimento.domain.series_catalog import SeriesCatalogEntry
from src.modules.sentimento.domain.series_history_report import BucketCoverage
from src.modules.sentimento.domain.series_key import Nature, Reduction

MINUTE_MS = 60_000
FIVE_MIN_MS = 5 * MINUTE_MS
ORIGIN_MS = 1_789_200_000_000 - (1_789_200_000_000 % (4 * 60 * MINUTE_MS))
FAR_FUTURE_MS = ORIGIN_MS + 10**12

POLL = OiCandleSource.BINANCE_POLL_1M
HIST = OiCandleSource.BINANCE_POINT_5M


def _hist_entry(instrument_id: str = "BTCUSDT") -> SeriesCatalogEntry:
    """Return the `openInterestHist` row — the ONE Binance `POINT` entry of the 5-min catalog."""
    (entry,) = [
        entry
        for entry in open_interest_catalog_entries(instrument_id).entries
        if entry.key.provider == "binance"
    ]
    return entry


def _poll_entry(instrument_id: str = "BTCUSDT") -> SeriesCatalogEntry:
    return binance_open_interest_poll_entry(instrument_id)


def _at(minute: int) -> int:
    return ORIGIN_MS + minute * MINUTE_MS


def _readings(values: dict[int, float]) -> tuple[OiReading, ...]:
    """Build readings at `ORIGIN_MS + minute` for the minutes given, ascending."""
    return tuple(OiReading(instant_ms=_at(m), value=values[m]) for m in sorted(values))


def _hist(values: dict[int, float]) -> OiRegimeReadings:
    return OiRegimeReadings(entry=_hist_entry(), readings=_readings(values))


def _poll(values: dict[int, float]) -> OiRegimeReadings:
    return OiRegimeReadings(entry=_poll_entry(), readings=_readings(values))


def _candle(  # noqa: PLR0913 — the ten fields of the contract, written out by hand
    *,
    end: int,
    o: float,
    h: float,
    lo: float,
    c: float,
    open_at: int,
    close_at: int,
    present: int,
    expected: int,
    source: OiCandleSource,
) -> OiCandle:
    return OiCandle(
        bucket_end_ms=_at(end),
        open=o,
        high=h,
        low=lo,
        close=c,
        open_at_ms=_at(open_at),
        close_at_ms=_at(close_at),
        samples=BucketCoverage(present=present, expected=expected),
        closed=True,
        derived_from=source,
    )


# History on the 5-minute grid, minutes 0..15; polling starts at minute 7 (MID-bucket).
HIST_0_TO_15 = {0: 1000.0, 5: 1010.0, 10: 1020.0, 15: 1030.0}
POLL_FROM_7 = {m: 2000.0 + m for m in range(7, 16)}


# ── DoD-5: the bucket where capture starts ────────────────────────────────────────────────


def test_the_bucket_where_capture_starts_mid_bucket_is_pure_history() -> None:
    """TF `5m`: bucket `(5, 10]` has polled samples but no `p_poll(5)` ⇒ ONLY the history.

    The mutant `D2-bis` names — the history's `p(5) = 1010` as open, polling's samples as the
    rest — would serve `open=1010, close=2010`: a body of 1000 contracts that is a difference
    between two endpoints, not contracts coming in.
    """
    report = project_one_series_per_bucket(
        poll=_poll(POLL_FROM_7),
        hist=_hist(HIST_0_TO_15),
        timeframe_ms=FIVE_MIN_MS,
        now_ms=FAR_FUTURE_MS,
    )

    assert report.candles == (
        _candle(end=5, o=1000, h=1010, lo=1000, c=1010, open_at=0, close_at=5,
                present=1, expected=1, source=HIST),
        _candle(end=10, o=1010, h=1020, lo=1010, c=1020, open_at=5, close_at=10,
                present=1, expected=1, source=HIST),
        # From here polling has `p(T0)`, so it owns the bucket even though the history has an
        # anchor too — "se o bucket do TF tem ponto de polling em T0, ... só com a série de
        # polling".
        _candle(end=15, o=2010, h=2015, lo=2010, c=2015, open_at=10, close_at=15,
                present=5, expected=5, source=POLL),
    )  # fmt: skip


def test_a_polled_anchor_with_no_polled_sample_is_no_candle_not_a_fallback() -> None:
    """`p_poll(5)` exists and `(5, 10]` holds no polled reading ⇒ NO candle at 10.

    "Só com a série de polling" leaves nothing to fall back to. Falling back to the history
    would make a bucket's source depend on the other series' contents.
    """
    report = project_one_series_per_bucket(
        poll=_poll({5: 2005.0}),
        hist=_hist(HIST_0_TO_15),
        timeframe_ms=FIVE_MIN_MS,
        now_ms=FAR_FUTURE_MS,
    )

    assert [(c.bucket_end_ms, c.derived_from) for c in report.candles] == [
        (_at(5), HIST),
        (_at(15), HIST),
    ]


def test_a_polled_candle_without_its_boundary_anchor_is_never_served() -> None:
    """A polling hole AT `T0` hands the bucket to the history, even with 4 polled samples.

    `project_oi_candles` alone would serve polling's "first reading of S" candle here
    (`ADR-045/D1`, `|S| >= 2`); under `D2-bis` that bucket belongs to the history.
    """
    polled = {m: 2000.0 + m for m in (6, 7, 8, 9, 10)}  # minute 5 is the hole
    alone = project_oi_candles(
        _poll_entry(), _readings(polled), timeframe_ms=FIVE_MIN_MS, now_ms=FAR_FUTURE_MS
    )
    assert [c.bucket_end_ms for c in alone] == [_at(10)], "the fixture must bite"

    report = project_one_series_per_bucket(
        poll=_poll(polled), hist=_hist(HIST_0_TO_15), timeframe_ms=FIVE_MIN_MS, now_ms=FAR_FUTURE_MS
    )

    ten = next(c for c in report.candles if c.bucket_end_ms == _at(10))
    assert ten == _candle(end=10, o=1010, h=1020, lo=1010, c=1020, open_at=5, close_at=10,
                          present=1, expected=1, source=HIST)  # fmt: skip


# ── TF `1m`: the two regimes have different widths ────────────────────────────────────────


def test_in_1m_a_5_minute_history_candle_yields_to_any_polled_anchor_inside_it() -> None:
    """TF `1m`: polling anchors minutes 7, 8, 9 ⇒ the history's `(5, 10]` candle is dropped.

    Without that, the served candles would overlap — polling's `(7, 8]`, `(8, 9]`, `(9, 10]`
    and the history's `(5, 10]` all claiming the same minutes, contracts counted twice.
    """
    report = project_one_series_per_bucket(
        poll=_poll({7: 2007.0, 8: 2008.0, 9: 2009.0, 10: 2010.0}),
        hist=_hist({0: 1000.0, 5: 1010.0, 10: 1020.0}),
        timeframe_ms=MINUTE_MS,
        now_ms=FAR_FUTURE_MS,
    )

    assert report.candles == (
        _candle(end=5, o=1000, h=1010, lo=1000, c=1010, open_at=0, close_at=5,
                present=1, expected=1, source=HIST),
        _candle(end=8, o=2007, h=2008, lo=2007, c=2008, open_at=7, close_at=8,
                present=1, expected=1, source=POLL),
        _candle(end=9, o=2008, h=2009, lo=2008, c=2009, open_at=8, close_at=9,
                present=1, expected=1, source=POLL),
        _candle(end=10, o=2009, h=2010, lo=2009, c=2010, open_at=9, close_at=10,
                present=1, expected=1, source=POLL),
    )  # fmt: skip


def test_in_1m_the_report_declares_each_regime_s_own_bucket_width() -> None:
    """`SPEC-009` §6.5: "declarando `bucket_interval_ms = 300000`" for the history in `1m`."""
    report = project_one_series_per_bucket(
        poll=_poll({}), hist=_hist({}), timeframe_ms=MINUTE_MS, now_ms=FAR_FUTURE_MS
    )

    assert report.to_wire() == {
        "timeframe_ms": MINUTE_MS,
        "sources": [
            {
                "derived_from": "binance_poll_1m",
                "series_key_id": _poll_entry().key.series_key_id(),
                "native_grid_ms": MINUTE_MS,
                "bucket_interval_ms": MINUTE_MS,
            },
            {
                "derived_from": "binance_point_5m",
                "series_key_id": _hist_entry().key.series_key_id(),
                "native_grid_ms": FIVE_MIN_MS,
                "bucket_interval_ms": FIVE_MIN_MS,
            },
        ],
        "candles": [],
    }


# ── The property, over random data ────────────────────────────────────────────────────────


def _random_regimes(rng: random.Random) -> tuple[dict[int, float], dict[int, float]]:
    """History on 5-min slots of 4 h with holes; polling from a random minute, with holes."""
    hist = {m: 1000.0 + rng.uniform(-50, 50) for m in range(0, 241, 5) if rng.random() > 0.15}
    capture_start = rng.randrange(0, 240)
    poll = {
        m: 2000.0 + rng.uniform(-50, 50) for m in range(capture_start, 241) if rng.random() > 0.1
    }
    return hist, poll


@pytest.mark.parametrize("timeframe_ms", [MINUTE_MS, FIVE_MIN_MS, 15 * MINUTE_MS, 60 * MINUTE_MS])
@pytest.mark.parametrize("seed", range(40))
def test_every_served_candle_is_one_series_and_the_intervals_never_overlap(
    seed: int, timeframe_ms: int
) -> None:
    """Over 160 random cases: each candle IS its own series' candle, and no two overlap.

    Stronger than checking `derived_from`: the served candle must be EQUAL to the candle the
    single-series projection of `derived_from`'s series gives for that bucket — so open, close,
    high, low and `samples` all come from that one series, and nothing was grafted on.
    """
    hist_values, poll_values = _random_regimes(random.Random(seed))  # noqa: S311 (deterministic fixture)
    poll, hist = _poll(poll_values), _hist(hist_values)
    report = project_one_series_per_bucket(
        poll=poll, hist=hist, timeframe_ms=timeframe_ms, now_ms=FAR_FUTURE_MS
    )

    alone = {
        POLL: {c.bucket_end_ms: c for c in project_oi_candles(
            poll.entry, poll.readings, timeframe_ms=timeframe_ms, now_ms=FAR_FUTURE_MS)},
        HIST: {c.bucket_end_ms: c for c in project_oi_candles(
            hist.entry, hist.readings, timeframe_ms=timeframe_ms, now_ms=FAR_FUTURE_MS)},
    }  # fmt: skip
    width = {s.derived_from: s.bucket_interval_ms for s in report.sources}
    poll_instants = {r.instant_ms for r in poll.readings}

    previous_end: int | None = None
    for candle in report.candles:
        assert alone[candle.derived_from][candle.bucket_end_ms] == candle
        start = candle.bucket_end_ms - width[candle.derived_from]
        if candle.derived_from is POLL:
            assert start in poll_instants, "polling served a bucket without p_poll(T0)"
        else:
            assert not any(
                t in poll_instants for t in range(start, candle.bucket_end_ms, width[POLL])
            ), "the history served a bucket polling anchors"
        if previous_end is not None:
            assert start >= previous_end, "two served candles overlap"
        previous_end = candle.bucket_end_ms


@pytest.mark.parametrize("timeframe_ms", [FIVE_MIN_MS, 15 * MINUTE_MS, 60 * MINUTE_MS])
@pytest.mark.parametrize("seed", range(40))
def test_with_equal_widths_nothing_either_series_could_serve_is_dropped(
    seed: int, timeframe_ms: int
) -> None:
    """The converse, for TF >= `5m`: the rule SELECTS, it does not merely filter to nothing.

    A bucket with `p_poll(T0)` serves polling's candle if polling has one; a bucket without it
    serves the history's candle if the history has one. An implementation that served nothing
    would pass the previous test.
    """
    hist_values, poll_values = _random_regimes(random.Random(1000 + seed))  # noqa: S311
    poll, hist = _poll(poll_values), _hist(hist_values)
    served = {
        c.bucket_end_ms: c
        for c in project_one_series_per_bucket(
            poll=poll, hist=hist, timeframe_ms=timeframe_ms, now_ms=FAR_FUTURE_MS
        ).candles
    }
    poll_instants = {r.instant_ms for r in poll.readings}
    expected: dict[int, OiCandle] = {}
    for candle in project_oi_candles(
        hist.entry, hist.readings, timeframe_ms=timeframe_ms, now_ms=FAR_FUTURE_MS
    ):
        if candle.bucket_end_ms - timeframe_ms not in poll_instants:
            expected[candle.bucket_end_ms] = candle
    for candle in project_oi_candles(
        poll.entry, poll.readings, timeframe_ms=timeframe_ms, now_ms=FAR_FUTURE_MS
    ):
        if candle.bucket_end_ms - timeframe_ms in poll_instants:
            expected[candle.bucket_end_ms] = candle

    assert served == expected
    assert served, "the random fixture produced no candle at all — the test would be vacuous"


# ── One regime only, and the slots ────────────────────────────────────────────────────────


def test_history_alone_is_exactly_the_single_series_projection() -> None:
    """A symbol whose polled series is not cataloged: the history's candles, untouched."""
    hist = _hist(HIST_0_TO_15)
    report = project_one_series_per_bucket(
        poll=None, hist=hist, timeframe_ms=FIVE_MIN_MS, now_ms=FAR_FUTURE_MS
    )

    assert report.candles == project_oi_candles(
        hist.entry, hist.readings, timeframe_ms=FIVE_MIN_MS, now_ms=FAR_FUTURE_MS
    )
    assert [s.derived_from for s in report.sources] == [HIST]


def test_polling_alone_serves_only_its_anchored_buckets() -> None:
    """Without the history there is no one to hand an unanchored bucket to: it has no candle."""
    report = project_one_series_per_bucket(
        poll=_poll({m: 2000.0 + m for m in (6, 7, 8, 9, 10, 11)}),
        hist=None,
        timeframe_ms=FIVE_MIN_MS,
        now_ms=FAR_FUTURE_MS,
    )

    assert report.candles == (
        _candle(end=15, o=2010, h=2011, lo=2010, c=2011, open_at=10, close_at=11,
                present=1, expected=5, source=POLL),
    )  # fmt: skip


def test_neither_series_is_refused() -> None:
    """Both slots empty is a call with nothing to choose from — refused, never an empty report."""
    with pytest.raises(OiRegimeMismatchError, match="neither"):
        project_one_series_per_bucket(
            poll=None, hist=None, timeframe_ms=FIVE_MIN_MS, now_ms=FAR_FUTURE_MS
        )


def test_swapped_slots_are_refused_by_name() -> None:
    """The history in the polling slot would invert the rule with no other symptom."""
    with pytest.raises(OiRegimeMismatchError, match="binance_poll_1m slot received"):
        project_one_series_per_bucket(
            poll=_hist({}), hist=None, timeframe_ms=FIVE_MIN_MS, now_ms=FAR_FUTURE_MS
        )
    with pytest.raises(OiRegimeMismatchError, match="binance_point_5m slot received"):
        project_one_series_per_bucket(
            poll=None, hist=_poll({}), timeframe_ms=FIVE_MIN_MS, now_ms=FAR_FUTURE_MS
        )


def test_two_instruments_are_refused() -> None:
    """One candle is one symbol's contracts: ETH polling against BTC history is refused."""
    with pytest.raises(OiRegimeMismatchError, match="ETHUSDT"):
        project_one_series_per_bucket(
            poll=OiRegimeReadings(entry=_poll_entry("ETHUSDT"), readings=()),
            hist=_hist({}),
            timeframe_ms=FIVE_MIN_MS,
            now_ms=FAR_FUTURE_MS,
        )


def test_a_history_bucket_that_does_not_tile_the_polled_one_is_refused() -> None:
    """A 90 s history against 60 s polling in `1m`: the two regimes cannot share an axis."""
    odd = dataclasses.replace(_hist_entry(), native_grid="90s", native_grid_ms=90_000)
    assert effective_timeframe_ms(MINUTE_MS, 90_000) == 90_000
    with pytest.raises(OiRegimeGridError, match="whole number"):
        project_one_series_per_bucket(
            poll=_poll({}),
            hist=OiRegimeReadings(entry=odd, readings=()),
            timeframe_ms=MINUTE_MS,
            now_ms=FAR_FUTURE_MS,
        )


# ── Resolving the other regime, and the non-raising source lookup ─────────────────────────


@pytest.mark.parametrize("instrument_id", ["BTCUSDT", "ETHUSDT"])
def test_other_regime_key_is_built_by_the_catalog_builders(instrument_id: str) -> None:
    """The sibling key comes from the SAME builders the writers use, for the same instrument."""
    hist_key = binance_open_interest_key(instrument_id=instrument_id)
    poll_key = binance_open_interest_poll_key(instrument_id=instrument_id)

    assert other_regime_key(hist_key) == (POLL, poll_key)
    assert other_regime_key(poll_key) == (HIST, hist_key)


def test_the_non_raising_lookup_names_only_the_two_sources() -> None:
    """`oi_candle_source_or_none`: the two OI sources by name, `None` for anything else."""
    hist_key = binance_open_interest_key(instrument_id="BTCUSDT")

    assert oi_candle_source_or_none(hist_key) is HIST
    assert oi_candle_source_or_none(binance_open_interest_poll_key(instrument_id="BTCUSDT")) is POLL
    # Wrong trio (Coinalyze OHLC), wrong nature, and right trio of an unknown source: all `None`.
    assert oi_candle_source_or_none(coinalyze_open_interest_key(Reduction.CLOSE)) is None
    assert oi_candle_source_or_none(dataclasses.replace(hist_key, nature=Nature.RATIO)) is None
    assert oi_candle_source_or_none(dataclasses.replace(hist_key, metric="other")) is None


def test_the_candle_wire_is_exactly_the_ten_fields_of_spec_009_6_4() -> None:
    """`OiCandle.to_wire` carries the ten names of §6.4, `samples` as `{present, expected}`."""
    candle = _candle(end=5, o=1000, h=1010, lo=990, c=1005, open_at=0, close_at=5,
                     present=1, expected=1, source=HIST)  # fmt: skip

    assert candle.to_wire() == {
        "bucket_end_ms": _at(5),
        "open": 1000,
        "high": 1010,
        "low": 990,
        "close": 1005,
        "open_at_ms": _at(0),
        "close_at_ms": _at(5),
        "samples": {"present": 1, "expected": 1},
        "closed": True,
        "derived_from": "binance_point_5m",
    }


def test_an_empty_report_projects_to_an_empty_candle_list() -> None:
    """No candle is `candles: []`, never `null` — `null` is reserved for a non-OI panel."""
    report = OiCandleReport(timeframe_ms=FIVE_MIN_MS, sources=(), candles=())
    assert report.to_wire() == {"timeframe_ms": FIVE_MIN_MS, "sources": [], "candles": []}
