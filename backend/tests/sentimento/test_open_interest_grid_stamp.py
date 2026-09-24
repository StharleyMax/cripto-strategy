"""`T-03.2`: a reading is stamped on minute `T` only if its `time` is in `[T, T + 20 s]`.

Outside the window the minute is ABSENT — no row, never the previous value carried forward
(`RN-2`, `SPEC-009` §6.1, `[Q-STAMP-1]`). Pure function, no clock, no Postgres.

The two "real" instants below are the `time` fields READ from Binance by `T-03.1` (see
`test_open_interest_snapshot.py`): reading the origin is not seeding, nothing is written anywhere.
"""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.open_interest_grid_stamp import (
    OPEN_INTEREST_ADMISSION_WINDOW_MS,
    OPEN_INTEREST_GRID_MS,
    InvalidOpenInterestStampError,
    StampedOpenInterest,
    admitted_grid_instant,
    stamp_open_interest_readings,
)
from src.modules.sentimento.domain.open_interest_snapshot import OpenInterestSnapshot

# `T-03.1` capture, 2026-09-24: `{"symbol":"BTCUSDT","openInterest":"96012.544",
# "time":1790287793703}` for a request sent at 1790287796821, and ETHUSDT `time` 1790287791035.
REAL_BTC_TIME_MS = 1_790_287_793_703
REAL_ETH_TIME_MS = 1_790_287_791_035
REAL_MINUTE_MS = 1_790_287_740_000  # the grid instant at or before both captures

T0 = 1_790_287_800_000
T1 = T0 + OPEN_INTEREST_GRID_MS
T2 = T1 + OPEN_INTEREST_GRID_MS


def _reading(
    event_time_ms: int, value: str = "96012.544", symbol: str = "BTCUSDT"
) -> OpenInterestSnapshot:
    """Build a snapshot as `parse_open_interest_snapshot` would hand it over."""
    return OpenInterestSnapshot(symbol=symbol, open_interest_raw=value, event_time_ms=event_time_ms)


def test_the_constants_are_the_ones_spec_009_fixes() -> None:
    """1-minute grid (the default TF) and a 20 s window (`[Q-STAMP-1]` default)."""
    assert OPEN_INTEREST_GRID_MS == 60_000
    assert OPEN_INTEREST_ADMISSION_WINDOW_MS == 20_000
    assert T0 % OPEN_INTEREST_GRID_MS == 0
    assert REAL_MINUTE_MS % OPEN_INTEREST_GRID_MS == 0


def test_a_reading_exactly_at_the_grid_instant_is_admitted() -> None:
    """Left edge `T` is inside the window: `[T, …`."""
    assert admitted_grid_instant(T0) == T0


def test_a_reading_exactly_twenty_seconds_after_is_admitted() -> None:
    """Right edge `T + 20 s` is inside the window too: `… T + 20 s]`, closed."""
    assert admitted_grid_instant(T0 + 20_000) == T0


def test_one_millisecond_past_the_window_leaves_the_minute_absent() -> None:
    """`T + 20 001 ms` belongs to no minute: not `T`, and not `T + 1 min` either."""
    assert admitted_grid_instant(T0 + 20_001) is None


def test_one_millisecond_before_the_grid_instant_is_not_pulled_forward() -> None:
    """`T - 1 ms` is offset 59 999 ms of the PREVIOUS minute: absent, never stamped at `T`.

    A nearest-instant rounding would call this "the value at `T`" although the source read it
    before `T`; the floor makes it belong to `T - 1 min`, whose window it misses.
    """
    assert admitted_grid_instant(T0 - 1) is None


def test_the_real_capture_of_t_03_1_lands_outside_every_window() -> None:
    """Both captured `time`s sit at 51–54 s into their minute: those readings are absent.

    This is a real case, not a constructed one: a request fired late in the minute returns a
    `time` late in the minute, which is no minute's reading. It is the evidence the collector
    (`T-03.4`) must schedule its call so that `time` lands in `[T, T + 20 s]`.
    """
    assert REAL_BTC_TIME_MS - REAL_MINUTE_MS == 53_703
    assert REAL_ETH_TIME_MS - REAL_MINUTE_MS == 51_035
    assert admitted_grid_instant(REAL_BTC_TIME_MS) is None
    assert admitted_grid_instant(REAL_ETH_TIME_MS) is None


def test_every_offset_of_a_minute_is_admitted_iff_it_is_at_most_twenty_seconds() -> None:
    """Sweep the whole minute at 1 ms resolution: the window is exactly `[0, 20 000]` ms."""
    admitted_offsets = [
        offset
        for offset in range(OPEN_INTEREST_GRID_MS)
        if admitted_grid_instant(T0 + offset) is not None
    ]
    assert admitted_offsets == list(range(OPEN_INTEREST_ADMISSION_WINDOW_MS + 1))
    assert all(admitted_grid_instant(T0 + offset) == T0 for offset in admitted_offsets)


def test_a_minute_without_an_admitted_reading_is_absent_and_never_carries_the_previous() -> None:
    """MORDE carry-forward (`RN-2`): `T1`'s only reading is late, so `T1` has NO row.

    Minutes `T0` and `T2` are read in-window; `T1` is read at `T1 + 35 s`. The output is the two
    real minutes and nothing at `T1` — in particular not `T0`'s value repeated at `T1`.
    """
    late = _reading(T1 + 35_000, value="96100.000")
    stamping = stamp_open_interest_readings(
        [
            _reading(T0 + 5_000, value="96000.000"),
            late,
            _reading(T2 + 4_000, value="96200.000"),
        ]
    )
    assert [(p.grid_instant_ms, p.open_interest_raw) for p in stamping.admitted] == [
        (T0, "96000.000"),
        (T2, "96200.000"),
    ]
    assert T1 not in {p.grid_instant_ms for p in stamping.admitted}
    assert stamping.out_of_window == (late,)


def test_a_minute_with_no_reading_at_all_is_absent() -> None:
    """A collector that did not run in `T1` leaves a hole; the stamp does not fill it."""
    stamping = stamp_open_interest_readings([_reading(T0 + 1_000), _reading(T2 + 1_000)])
    assert [p.grid_instant_ms for p in stamping.admitted] == [T0, T2]


def test_a_carried_value_cannot_even_be_represented_at_a_later_minute() -> None:
    """The structural guard: a stamp at `T1` whose reading was taken in `T0` refuses to exist."""
    with pytest.raises(InvalidOpenInterestStampError, match="outside"):
        StampedOpenInterest(
            symbol="BTCUSDT",
            grid_instant_ms=T1,
            open_interest_raw="96000.000",
            event_time_ms=T0 + 5_000,
        )


def test_a_stamp_off_the_one_minute_grid_is_refused() -> None:
    """`T` must be a grid instant; a stamp at `T + 30 s` is not a minute of the grid."""
    with pytest.raises(InvalidOpenInterestStampError, match="grid"):
        StampedOpenInterest(
            symbol="BTCUSDT",
            grid_instant_ms=T0 + 30_000,
            open_interest_raw="96000.000",
            event_time_ms=T0 + 30_000,
        )


def test_a_stamp_at_the_right_edge_of_its_own_window_is_accepted() -> None:
    """The guard does not refuse the legitimate edge `event_time = T + 20 s`."""
    stamp = StampedOpenInterest(
        symbol="BTCUSDT",
        grid_instant_ms=T0,
        open_interest_raw="96000.000",
        event_time_ms=T0 + 20_000,
    )
    assert stamp.event_time_ms - stamp.grid_instant_ms == OPEN_INTEREST_ADMISSION_WINDOW_MS


def test_the_first_in_window_call_wins_and_the_later_one_is_superseded() -> None:
    """Call order decides ("a primeira chamada"), not the later, fresher `time`."""
    first = _reading(T0 + 12_000, value="96000.000")
    second = _reading(T0 + 18_000, value="96050.000")
    stamping = stamp_open_interest_readings([first, second])
    assert [(p.grid_instant_ms, p.open_interest_raw) for p in stamping.admitted] == [
        (T0, "96000.000")
    ]
    assert stamping.superseded == (second,)


def test_symbols_are_stamped_independently_on_the_same_minute() -> None:
    """Four symbols share the collector loop; one symbol's slot never supersedes another's."""
    btc = _reading(T0 + 6_000, symbol="BTCUSDT")
    eth = _reading(T0 + 7_000, value="2273930.468", symbol="ETHUSDT")
    stamping = stamp_open_interest_readings([btc, eth])
    assert [(p.symbol, p.grid_instant_ms) for p in stamping.admitted] == [
        ("BTCUSDT", T0),
        ("ETHUSDT", T0),
    ]
    assert stamping.superseded == ()


def test_the_stamp_keeps_the_exact_value_string_and_the_event_time() -> None:
    """No `float`, no rewriting: `value_raw` travels as the source spelled it (`ADR-034/D7`)."""
    (stamp,) = stamp_open_interest_readings([_reading(T0 + 3_000, value="96012.5440")]).admitted
    assert stamp.open_interest_raw == "96012.5440"
    assert stamp.event_time_ms == T0 + 3_000


def test_every_reading_is_accounted_for_exactly_once() -> None:
    """The three fates sum to the input, so no reading disappears unreported."""
    readings = [
        _reading(T0 + 1_000),
        _reading(T0 + 2_000),
        _reading(T0 + 40_000),
        _reading(T1 + 20_001),
        _reading(T2),
    ]
    stamping = stamp_open_interest_readings(readings)
    assert len(stamping.admitted) == 2
    assert len(stamping.superseded) == 1
    assert len(stamping.out_of_window) == 2
    total = len(stamping.admitted) + len(stamping.superseded) + len(stamping.out_of_window)
    assert total == len(readings)


def test_no_readings_means_no_rows() -> None:
    """Empty in, empty out — the absence of data is not turned into anything."""
    stamping = stamp_open_interest_readings([])
    assert stamping.admitted == ()
    assert stamping.out_of_window == ()
    assert stamping.superseded == ()
