"""`T-03.2`: a reading is stamped on minute `T` only if its `time` is in `[T - 20 s, T]`.

`T` is the grid instant AT OR AFTER `time` (ceiling): the value at `T` is the freshest one read
UP TO `T`, never one read after it — staleness, never look-ahead (`quant-architect` verdict on
`[Q-STAMP-1]`, `docs/context/paineis-de-fluxo/handoff/Q-STAMP-1-quant-architect.md` §1, §4).
Outside the window the minute is ABSENT — no row, never the previous value carried forward
(`RN-2`). Pure function, no clock, no Postgres.

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
REAL_MINUTE_MS = 1_790_287_800_000  # the grid instant at or after both captures

T0 = 1_790_287_800_000
T1 = T0 + OPEN_INTEREST_GRID_MS
T2 = T1 + OPEN_INTEREST_GRID_MS


def _reading(
    event_time_ms: int, value: str = "96012.544", symbol: str = "BTCUSDT"
) -> OpenInterestSnapshot:
    """Build a snapshot as `parse_open_interest_snapshot` would hand it over."""
    return OpenInterestSnapshot(symbol=symbol, open_interest_raw=value, event_time_ms=event_time_ms)


def test_the_constants_are_the_ones_spec_009_fixes() -> None:
    """1-minute grid (the default TF) and a 20 s window (`[Q-STAMP-1]`, width kept by verdict)."""
    assert OPEN_INTEREST_GRID_MS == 60_000
    assert OPEN_INTEREST_ADMISSION_WINDOW_MS == 20_000
    assert T0 % OPEN_INTEREST_GRID_MS == 0
    assert REAL_MINUTE_MS == T0


def test_a_reading_exactly_at_the_grid_instant_is_admitted_with_zero_staleness() -> None:
    """Fresh edge `T` is inside the window: `…, T]`."""
    assert admitted_grid_instant(T0) == T0


def test_a_reading_exactly_twenty_seconds_before_is_admitted() -> None:
    """Stale edge `T - 20 s` is inside the window too: `[T - 20 s, …`, closed."""
    assert admitted_grid_instant(T0 - 20_000) == T0


def test_one_millisecond_older_than_the_window_leaves_the_minute_absent() -> None:
    """`T - 20 001 ms` belongs to no minute: not `T`, and not `T - 1 min` either."""
    assert admitted_grid_instant(T0 - 20_001) is None


def test_one_millisecond_after_the_grid_instant_is_never_pulled_back_to_it() -> None:
    """MORDE look-ahead: `T + 1 ms` goes to `T + 1 min` with staleness 59 999 ms, i.e. ABSENT.

    A floor would call this "the value at `T`" although the source read it AFTER `T` — the value
    of the candle closing at `T` would contain what happened after its close. The ceiling makes it
    belong to `T + 1 min`, whose window it misses.
    """
    assert admitted_grid_instant(T0 + 1) is None


def test_a_stalled_send_that_returns_a_time_after_t_is_absent_not_look_ahead() -> None:
    """The measured `L < 0` case (verdict §2, `XRPUSDT`, `time` 2,24 s after the logged send).

    A call scheduled at `T - 5 s` whose send stalls can return `time = T + 2,24 s`. It is a hole,
    never a point of `T`.
    """
    assert admitted_grid_instant(T0 + 2_240) is None


def test_the_real_capture_of_t_03_1_is_admitted_as_the_next_minutes_value() -> None:
    """Both captured `time`s sit 51–54 s into their minute: they are the value AS OF the next `T`.

    Real case, not a constructed one — the reading served 6,3 s and 9,0 s before the grid
    instant is exactly the "last open interest up to `T`" (verdict §4, item 5).
    """
    assert REAL_MINUTE_MS - REAL_BTC_TIME_MS == 6_297
    assert REAL_MINUTE_MS - REAL_ETH_TIME_MS == 8_965
    assert admitted_grid_instant(REAL_BTC_TIME_MS) == REAL_MINUTE_MS
    assert admitted_grid_instant(REAL_ETH_TIME_MS) == REAL_MINUTE_MS

    stamping = stamp_open_interest_readings(
        [
            _reading(REAL_BTC_TIME_MS, symbol="BTCUSDT"),
            _reading(REAL_ETH_TIME_MS, value="2273930.468", symbol="ETHUSDT"),
        ]
    )
    assert [
        (p.symbol, p.grid_instant_ms, p.grid_instant_ms - p.event_time_ms)
        for p in stamping.admitted
    ] == [("BTCUSDT", REAL_MINUTE_MS, 6_297), ("ETHUSDT", REAL_MINUTE_MS, 8_965)]
    assert stamping.out_of_window == ()


def test_every_offset_of_a_minute_is_admitted_iff_it_is_at_most_twenty_seconds_old() -> None:
    """Sweep one minute at 1 ms: admitted exactly at `{0} ∪ [40 000, 59 999]` (20 001 offsets).

    Offset `0` is `T0` itself; offsets `40 000..59 999` are the 20 s BEFORE `T1` and go to `T1`.
    """
    admitted = {
        offset: admitted_grid_instant(T0 + offset)
        for offset in range(OPEN_INTEREST_GRID_MS)
        if admitted_grid_instant(T0 + offset) is not None
    }
    assert sorted(admitted) == [0, *range(40_000, 60_000)]
    assert len(admitted) == OPEN_INTEREST_ADMISSION_WINDOW_MS + 1
    assert admitted[0] == T0
    assert all(admitted[offset] == T1 for offset in admitted if offset != 0)


def test_no_admitted_row_ever_carries_look_ahead() -> None:
    """The anti-look-ahead property (verdict §1): `0 <= grid_instant_ms - event_time_ms <= 20 000`.

    Three minutes of readings every 7 ms, one symbol per reading so none supersedes another: every
    admitted stamp is at or after its own reading, and at most 20 s after it.
    """
    readings = [
        _reading(T0 - 70_000 + step, symbol=f"S{index}")
        for index, step in enumerate(range(0, 3 * OPEN_INTEREST_GRID_MS, 7))
    ]
    stamping = stamp_open_interest_readings(readings)
    staleness = [p.grid_instant_ms - p.event_time_ms for p in stamping.admitted]
    assert len(staleness) > 0
    assert all(0 <= s <= OPEN_INTEREST_ADMISSION_WINDOW_MS for s in staleness)
    assert len(stamping.admitted) + len(stamping.out_of_window) == len(readings)


def test_a_minute_without_an_admitted_reading_is_absent_and_never_carries_the_previous() -> None:
    """MORDE carry-forward (`RN-2`): `T1`'s only reading is 35 s old at `T1`, so `T1` has NO row.

    Minutes `T0` and `T2` are read in-window; `T1`'s reading is too stale. The output is the two
    real minutes and nothing at `T1` — in particular not `T0`'s value repeated at `T1`.
    """
    late = _reading(T1 - 35_000, value="96100.000")
    stamping = stamp_open_interest_readings(
        [
            _reading(T0 - 5_000, value="96000.000"),
            late,
            _reading(T2 - 4_000, value="96200.000"),
        ]
    )
    assert [(p.grid_instant_ms, p.open_interest_raw) for p in stamping.admitted] == [
        (T0, "96000.000"),
        (T2, "96200.000"),
    ]
    assert T1 not in {p.grid_instant_ms for p in stamping.admitted}
    assert stamping.out_of_window == (late,)


def test_a_minute_with_no_reading_at_all_is_absent() -> None:
    """A collector that did not run before `T1` leaves a hole; the stamp does not fill it."""
    stamping = stamp_open_interest_readings([_reading(T0 - 1_000), _reading(T2 - 1_000)])
    assert [p.grid_instant_ms for p in stamping.admitted] == [T0, T2]


def test_a_carried_value_cannot_even_be_represented_at_a_later_minute() -> None:
    """The structural guard: a stamp at `T1` whose reading predates `T0` refuses to exist."""
    with pytest.raises(InvalidOpenInterestStampError, match="outside"):
        StampedOpenInterest(
            symbol="BTCUSDT",
            grid_instant_ms=T1,
            open_interest_raw="96000.000",
            event_time_ms=T0 - 5_000,
        )


def test_a_stamp_ahead_of_its_reading_by_a_look_ahead_cannot_be_represented() -> None:
    """The guard also refuses the floor's stamp: a reading at `T0 + 5 s` cannot be put at `T0`."""
    with pytest.raises(InvalidOpenInterestStampError, match="outside"):
        StampedOpenInterest(
            symbol="BTCUSDT",
            grid_instant_ms=T0,
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


def test_a_stamp_at_the_stale_edge_of_its_own_window_is_accepted() -> None:
    """The guard does not refuse the legitimate edge `event_time = T - 20 s`."""
    stamp = StampedOpenInterest(
        symbol="BTCUSDT",
        grid_instant_ms=T0,
        open_interest_raw="96000.000",
        event_time_ms=T0 - 20_000,
    )
    assert stamp.grid_instant_ms - stamp.event_time_ms == OPEN_INTEREST_ADMISSION_WINDOW_MS


def test_the_freshest_in_window_reading_wins_even_when_handed_in_last() -> None:
    """Freshest `time` decides ("as of `T`"), not call order: the older one is superseded."""
    older = _reading(T0 - 18_000, value="96000.000")
    fresher = _reading(T0 - 12_000, value="96050.000")
    stamping = stamp_open_interest_readings([older, fresher])
    assert [(p.grid_instant_ms, p.open_interest_raw) for p in stamping.admitted] == [
        (T0, "96050.000")
    ]
    assert stamping.superseded == (older,)


def test_the_freshest_in_window_reading_wins_even_when_handed_in_first() -> None:
    """Reverse order, same outcome: input order never picks the winner."""
    older = _reading(T0 - 18_000, value="96000.000")
    fresher = _reading(T0 - 12_000, value="96050.000")
    stamping = stamp_open_interest_readings([fresher, older])
    assert [(p.grid_instant_ms, p.open_interest_raw) for p in stamping.admitted] == [
        (T0, "96050.000")
    ]
    assert stamping.superseded == (older,)


def test_on_a_tie_of_time_the_first_reading_stays() -> None:
    """Binance serves the same snapshot to consecutive calls: same `time`, the first is kept."""
    first = _reading(T0 - 9_000, value="96000.000")
    repeat = _reading(T0 - 9_000, value="96000.000")
    stamping = stamp_open_interest_readings([first, repeat])
    assert len(stamping.admitted) == 1
    assert stamping.superseded == (repeat,)
    assert stamping.superseded[0] is repeat


def test_symbols_are_stamped_independently_on_the_same_minute() -> None:
    """Four symbols share the collector loop; one symbol's slot never supersedes another's."""
    btc = _reading(T0 - 6_000, symbol="BTCUSDT")
    eth = _reading(T0 - 7_000, value="2273930.468", symbol="ETHUSDT")
    stamping = stamp_open_interest_readings([btc, eth])
    assert [(p.symbol, p.grid_instant_ms) for p in stamping.admitted] == [
        ("BTCUSDT", T0),
        ("ETHUSDT", T0),
    ]
    assert stamping.superseded == ()


def test_the_stamp_keeps_the_exact_value_string_and_the_event_time() -> None:
    """No `float`, no rewriting: `value_raw` travels as the source spelled it (`ADR-034/D7`)."""
    (stamp,) = stamp_open_interest_readings([_reading(T0 - 3_000, value="96012.5440")]).admitted
    assert stamp.open_interest_raw == "96012.5440"
    assert stamp.event_time_ms == T0 - 3_000


def test_every_reading_is_accounted_for_exactly_once() -> None:
    """The three fates sum to the input, so no reading disappears unreported."""
    readings = [
        _reading(T0 - 2_000),
        _reading(T0 - 1_000),
        _reading(T0 - 40_000),
        _reading(T1 - 20_001),
        _reading(T2),
    ]
    stamping = stamp_open_interest_readings(readings)
    assert len(stamping.admitted) == 2
    assert stamping.superseded == (readings[0],)
    assert stamping.out_of_window == (readings[2], readings[3])
    total = len(stamping.admitted) + len(stamping.superseded) + len(stamping.out_of_window)
    assert total == len(readings)


def test_no_readings_means_no_rows() -> None:
    """Empty in, empty out — the absence of data is not turned into anything."""
    stamping = stamp_open_interest_readings([])
    assert stamping.admitted == ()
    assert stamping.out_of_window == ()
    assert stamping.superseded == ()
