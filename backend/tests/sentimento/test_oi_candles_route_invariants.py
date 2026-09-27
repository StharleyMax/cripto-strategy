"""Route-level invariants of `oi_candles` on EVERY served timeframe — `W6-QA-BACK-r2`.

`test_series_history_oi_candles.py` fixes the use case at `5m` and `1m` on one hand-built
window. This file asks the same use case, over seeded random series with holes in both regimes
and window edges that are NOT aligned to any grid, three questions the plan implies for all of
`SUPPORTED_INTERVALS`:

1. **Either id, same candles** (`_oi_candle_report` docstring: "Requesting either series' id
   yields the same candles") — at `15m`, `1h` and `4h` too, where the requested series' readings
   come from the reaggregation read and the other one's from a second read.
2. **The reads lose nothing**: the served candles equal `project_one_series_per_bucket` applied
   to the stored readings of each series directly, restricted to the same bucket range. A read
   window or lookback that is one grid step short drops an anchor and shows up here.
3. **A bucket's candle does not depend on where the window starts**: a bucket that ends inside
   two windows is served identically by both. `use_cases/series_history.py:360-363` states the
   same principle for `rows` ("a wide bucket at the left edge of the window is never composed
   from a truncated slice of its own native facts"); the pager concatenates windows, so a
   candle that changes with the window is two answers for one bucket.

Then three pinned cases the random series do not reach: the `1m` left edge of `D2-bis` (strict
`xfail` — the defect `W6-QA-BACK-r2` D-1 proves), `closed` judged at the request's
`knowledge_time` rather than at the window end, and the falsifier thresholds at their exact edge.
"""

from __future__ import annotations

import random
from decimal import Decimal

import pytest

from src.modules.charts.domain.panel_grid_enablement import classify_grid_multiple
from src.modules.sentimento.domain.as_of_accessor import BarPolicy, Observation
from src.modules.sentimento.domain.oi_candle import (
    OiCandleSource,
    OiReading,
    effective_timeframe_ms,
)
from src.modules.sentimento.domain.oi_candle_falsifiers import (
    POWER_MAX_FLAT_SHARE,
    POWER_MIN_BUCKETS,
    SPREAD_MAX_MEDIAN_BP,
    SPREAD_MIN_INSTANTS,
    FalsifierOutcome,
    PowerVerdict,
    SpreadVerdict,
)
from src.modules.sentimento.domain.oi_candle_regimes import (
    OiRegimeReadings,
    project_one_series_per_bucket,
)
from src.modules.sentimento.domain.open_interest_catalog import (
    binance_open_interest_poll_entry,
    open_interest_catalog_entries,
)
from src.modules.sentimento.domain.provenance import (
    UNKNOWN_OBSERVER_REGION,
    AvailabilitySource,
    Provenance,
    SeriesRow,
)
from src.modules.sentimento.domain.series_catalog import SeriesCatalog, SeriesCatalogEntry
from src.modules.sentimento.domain.series_history_report import PanelGridVerdict
from src.modules.sentimento.use_cases.series_history import build_series_history_report

SYMBOL = "BTCUSDT"
MINUTE_MS = 60_000
DAY_MS = 24 * 60 * MINUTE_MS
DATA_DAYS = 3
ORIGIN_MS = 1_789_200_000_000 - (1_789_200_000_000 % DAY_MS)
INTERVALS = {"1m": 1, "5m": 5, "15m": 15, "1h": 60, "4h": 240}
HIST_LAG_MS = 35_000
POLL_LAG_MS = 1_000
SEEDS = range(6)


def _hist_entry() -> SeriesCatalogEntry:
    (entry,) = [
        e for e in open_interest_catalog_entries(SYMBOL).entries if e.key.provider == "binance"
    ]
    return entry


def _poll_entry() -> SeriesCatalogEntry:
    return binance_open_interest_poll_entry(SYMBOL)


def _classify(*, panel_grid_ms: int, native_grid_ms: int) -> PanelGridVerdict:
    verdict = classify_grid_multiple(panel_grid_ms, native_grid_ms)
    return PanelGridVerdict(
        native_grid_ms=verdict.native_grid_ms,
        enabled=verdict.enabled,
        reason=verdict.reason.value,
        multiple=verdict.multiple,
    )


def _observations(
    entry: SeriesCatalogEntry, values: dict[int, str], *, lag_ms: int
) -> tuple[Observation, ...]:
    return tuple(
        Observation(
            row=SeriesRow(
                series_key_id=entry.key.series_key_id(),
                symbol=SYMBOL,
                source="binance",
                bucket_end=instant,
                event_time=instant,
                available_at=instant + lag_ms,
                availability_source=AvailabilitySource.OBSERVED,
                ingested_at=instant + lag_ms,
                observed_at=instant + lag_ms,
                provenance=Provenance.OBSERVED,
                src_label_raw="openInterest",
                observer_id="qa",
                observer_region=UNKNOWN_OBSERVER_REGION,
                is_final=None,
                value_raw=raw,
            ),
            value=Decimal(raw),
        )
        for instant, raw in sorted(values.items())
    )


class _ReaderBySeries:
    """A `SeriesWindowReader` answering each id with its own rows in `[start - lookback, end]`."""

    def __init__(self, rows_by_id: dict[str, tuple[Observation, ...]]) -> None:
        self._rows_by_id = rows_by_id

    def read_window(
        self,
        *,
        series_key_id: str,
        symbol: str,
        window_start_ms: int,
        window_end_ms: int,
        lookback_ms: int,
    ) -> tuple[Observation, ...]:
        assert symbol == SYMBOL
        lower = window_start_ms - lookback_ms
        return tuple(
            o
            for o in self._rows_by_id.get(series_key_id, ())
            if lower <= o.row.bucket_end <= window_end_ms
        )


class _NoBounds:
    def read_bounds(self, *, series_key_id: str, symbol: str) -> tuple[int | None, int | None]:
        return (None, None)


def _random_values(
    rng: random.Random, *, grid_min: int, first_min: int, last_min: int, hole_p: float
) -> dict[int, str]:
    """Return a random walk on the grid, with isolated holes and one run of consecutive holes."""
    run_start = rng.randrange(first_min, last_min)
    run_len = rng.choice((grid_min * 2, grid_min * 5, grid_min * 13))
    level = 80_000.0 + rng.random() * 1_000
    values: dict[int, str] = {}
    for minute in range(first_min - first_min % grid_min, last_min + 1, grid_min):
        level += rng.choice((-1, 1)) * rng.random() * 5
        if minute < first_min or rng.random() < hole_p:
            continue
        if run_start <= minute < run_start + run_len:
            continue
        values[ORIGIN_MS + minute * MINUTE_MS] = f"{level:.3f}"
    return values


def _data(seed: int) -> tuple[dict[int, str], dict[int, str]]:
    rng = random.Random(seed)  # noqa: S311 (deterministic fixture)
    hist = _random_values(rng, grid_min=5, first_min=0, last_min=DATA_DAYS * 1440, hole_p=0.08)
    # Capture starts mid-series, on a minute that is NOT a 5-minute boundary most of the time.
    poll = _random_values(
        rng, grid_min=1, first_min=rng.randrange(300, 700), last_min=DATA_DAYS * 1440, hole_p=0.06
    )
    return hist, poll


def _served(
    hist: dict[int, str],
    poll: dict[int, str],
    *,
    requested: SeriesCatalogEntry,
    interval: str,
    window: tuple[int, int],
    knowledge_time_ms: int = ORIGIN_MS + (DATA_DAYS + 1) * DAY_MS,
) -> list[dict[str, object]]:
    h, p = _hist_entry(), _poll_entry()
    reader = _ReaderBySeries(
        {
            h.key.series_key_id(): _observations(h, hist, lag_ms=HIST_LAG_MS),
            p.key.series_key_id(): _observations(p, poll, lag_ms=POLL_LAG_MS),
        }
    )
    report = build_series_history_report(
        SeriesCatalog((h, p)),
        reader,
        _classify,
        _NoBounds(),
        series_key_id=requested.key.series_key_id(),
        symbol=SYMBOL,
        interval=interval,
        window_start_ms=window[0],
        window_end_ms=window[1],
        knowledge_time_ms=knowledge_time_ms,
        bar_policy=BarPolicy.FINAL_ONLY,
    )
    assert report.oi_candles is not None
    return [candle.to_wire() for candle in report.oi_candles.candles]


def _window(rng: random.Random, interval_min: int) -> tuple[int, int]:
    """Return a window of 8-40 buckets starting at an arbitrary millisecond inside the data."""
    room_ms = DATA_DAYS * DAY_MS - 2 * 60 * MINUTE_MS
    span = (
        rng.randrange(8, min(40, room_ms // (interval_min * MINUTE_MS)) + 1)
        * interval_min
        * MINUTE_MS
    )
    start = ORIGIN_MS + rng.randrange(60 * MINUTE_MS, room_ms - span)
    return start, start + span


def _oracle(
    hist: dict[int, str], poll: dict[int, str], *, interval: str, window: tuple[int, int]
) -> list[dict[str, object]]:
    """Return the domain projection over the STORED readings, cut to each series' bucket range."""
    tf_ms = INTERVALS[interval] * MINUTE_MS

    def regime(entry: SeriesCatalogEntry, values: dict[int, str]) -> OiRegimeReadings:
        bucket_ms = effective_timeframe_ms(tf_ms, entry.native_grid_ms)
        first_end = -(-window[0] // bucket_ms) * bucket_ms
        last_end = (window[1] // bucket_ms) * bucket_ms
        readings = tuple(
            OiReading(instant_ms=t, value=float(Decimal(raw)))
            for t, raw in sorted(values.items())
            if first_end - bucket_ms <= t <= last_end
        )
        return OiRegimeReadings(entry=entry, readings=readings)

    report = project_one_series_per_bucket(
        poll=regime(_poll_entry(), poll),
        hist=regime(_hist_entry(), hist),
        timeframe_ms=tf_ms,
        now_ms=ORIGIN_MS + (DATA_DAYS + 1) * DAY_MS,
    )
    return [candle.to_wire() for candle in report.candles]


@pytest.mark.parametrize("interval", list(INTERVALS))
@pytest.mark.parametrize("seed", SEEDS)
def test_either_requested_id_serves_the_same_candles(interval: str, seed: int) -> None:
    """Invariant 1 of the module docstring, on every `SUPPORTED_INTERVALS` member."""
    hist, poll = _data(seed)
    window = _window(random.Random(seed * 7919 + 1), INTERVALS[interval])  # noqa: S311

    by_hist = _served(hist, poll, requested=_hist_entry(), interval=interval, window=window)
    by_poll = _served(hist, poll, requested=_poll_entry(), interval=interval, window=window)

    assert by_poll == by_hist


@pytest.mark.parametrize("interval", list(INTERVALS))
@pytest.mark.parametrize("seed", SEEDS)
def test_the_route_reads_lose_no_reading_the_projection_would_use(interval: str, seed: int) -> None:
    """Invariant 2: the served candles are the domain projection of the stored readings."""
    hist, poll = _data(seed)
    window = _window(random.Random(seed * 7919 + 2), INTERVALS[interval])  # noqa: S311

    served = _served(hist, poll, requested=_hist_entry(), interval=interval, window=window)

    assert served == _oracle(hist, poll, interval=interval, window=window)


@pytest.mark.parametrize("interval", list(INTERVALS))
@pytest.mark.parametrize("seed", SEEDS)
def test_a_bucket_ending_inside_two_windows_gets_the_same_candle_from_both(
    interval: str, seed: int
) -> None:
    """Invariant 3: a bucket's candle does not depend on where the window starts."""
    hist, poll = _data(seed)
    rng = random.Random(seed * 7919 + 3)  # noqa: S311 (deterministic fixture)
    interval_ms = INTERVALS[interval] * MINUTE_MS
    wide = _window(rng, INTERVALS[interval])
    # The narrow window starts at an arbitrary millisecond strictly inside the wide one.
    narrow = (rng.randrange(wide[0] + 1, wide[0] + (wide[1] - wide[0]) // 2), wide[1])

    by_wide = {
        c["bucket_end_ms"]: c
        for c in _served(hist, poll, requested=_hist_entry(), interval=interval, window=wide)
    }
    by_narrow = {
        c["bucket_end_ms"]: c
        for c in _served(hist, poll, requested=_hist_entry(), interval=interval, window=narrow)
    }
    ends = {end for end in (*by_wide, *by_narrow) if isinstance(end, int)}
    both = sorted(end for end in ends if end >= narrow[0] + interval_ms)
    # Only buckets whose END is inside BOTH windows, and at least one TF past the narrow edge.
    assert [by_narrow.get(e) for e in both] == [by_wide.get(e) for e in both]


def _at(minute: int) -> int:
    return ORIGIN_MS + minute * MINUTE_MS


@pytest.mark.xfail(
    strict=True,
    reason="W6-QA-BACK-r2 D-1: in 1m the polled instants start at the WINDOW's first minute, not "
    "at T0 of the first history bucket, so a polled anchor left of the window is not seen and "
    "the history serves a bucket D2-bis gives to polling. Remove this marker with the fix.",
)
def test_in_1m_a_polled_anchor_left_of_the_window_still_owns_the_history_bucket() -> None:
    """`ADR-045/D2-bis` on the left edge of a `1m` window.

    Polling has `p(5)` and then a 4-minute hole (`6..9`); history has `p(0)`, `p(5)`, `p(10)`.
    The history bucket `(5, 10]` has a polling point at its `T0 = 5`, so by `D2-bis` it is NOT
    built from `openInterestHist` — the polled bucket `(5, 6]` has no sample, so no candle at all
    (`domain`: `test_in_1m_a_5_minute_history_candle_yields_to_any_polled_anchor_inside_it`).

    A window starting at minute 4 answers exactly that. A window starting at minute 7 — whose
    last 3 minute-buckets are the same `(5, 10]` — must answer the same for `bucket_end = 10`,
    which lies inside both windows.
    """
    hist = {_at(m): f"{1000 + m:.3f}" for m in (0, 5, 10, 15)}
    poll = {_at(m): f"{2000 + m:.3f}" for m in (5, *range(10, 16))}

    def at_10(start_minute: int) -> list[tuple[object, object]]:
        candles = _served(hist, poll, requested=_hist_entry(), interval="1m",
                          window=(_at(start_minute), _at(15)))  # fmt: skip
        return [(c["derived_from"], c["open_at_ms"]) for c in candles
                if c["bucket_end_ms"] == _at(10)]  # fmt: skip

    assert at_10(4) == []
    assert at_10(7) == at_10(4)


def test_the_in_progress_bucket_is_closed_false_by_the_request_s_knowledge_time() -> None:
    """`closed` is judged at `knowledge_time`, never at the window's end (`_oi_candle_report`).

    The window reaches minute 15, but the request knows only up to minute 13 (plus 2 s): the
    polled bucket `(10, 15]` is served from `p(10)` .. `p(13)` and its end has NOT arrived.
    """
    hist = {_at(m): f"{1000 + m:.3f}" for m in (0, 5, 10, 15)}
    poll = {_at(m): f"{2000 + m:.3f}" for m in range(7, 16)}

    candles = _served(hist, poll, requested=_hist_entry(), interval="5m",
                      window=(_at(5), _at(15)), knowledge_time_ms=_at(13) + 2_000)  # fmt: skip

    last = candles[-1]
    assert (last["bucket_end_ms"], last["close_at_ms"]) == (_at(15), _at(13))
    assert last["closed"] is False
    assert all(c["closed"] is True for c in candles[:-1])


def test_falsifier_thresholds_hold_exactly_at_their_declared_edge() -> None:
    """`ADR-045` §Falsificador: `n >= 288` / `>= 200`, share `> 50%` fails, median `<= 10 bp` holds.

    The edge value itself is the one a `<` / `>=` slip moves across; each is pinned here.
    """
    at_edge = SpreadVerdict(n=SPREAD_MIN_INSTANTS, median_bp=SPREAD_MAX_MEDIAN_BP,
                            p90_bp=SPREAD_MAX_MEDIAN_BP, max_bp=SPREAD_MAX_MEDIAN_BP)  # fmt: skip
    assert at_edge.outcome is FalsifierOutcome.HELD
    assert SpreadVerdict(n=SPREAD_MIN_INSTANTS - 1, median_bp=0.0, p90_bp=0.0,
                         max_bp=0.0).outcome is FalsifierOutcome.INCONCLUSIVE  # fmt: skip
    half = int(POWER_MIN_BUCKETS * POWER_MAX_FLAT_SHARE)
    assert PowerVerdict(derived_from=_hist_source(), n=POWER_MIN_BUCKETS,
                        flat=half).outcome is FalsifierOutcome.HELD  # fmt: skip
    assert PowerVerdict(derived_from=_hist_source(), n=POWER_MIN_BUCKETS - 1,
                        flat=0).outcome is FalsifierOutcome.INCONCLUSIVE  # fmt: skip


def _hist_source() -> OiCandleSource:
    return OiCandleSource.BINANCE_POINT_5M
