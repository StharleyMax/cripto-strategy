"""`RS-3.1`, `RS-3.4`, `RS-3.6`, `RS-3.7` and the request path — each one with a falsifier.

Every test here is a MUTATION test in the sense this repository means it: it names the wrong
behaviour first and requires the code to reject it. A test that only exercises the happy path
would pass against a collector that had none of these rules, which is precisely the `rc=0`
`ADR-012` refuses.
"""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.coinalyze_daily_series import (
    ENDPOINT_PATH_BY_KIND,
    DailyPoint,
    MalformedCoinalizeResponseError,
    SeriesKind,
)
from src.modules.sentimento.domain.liquidation_catalog import LONG, SHORT
from src.modules.sentimento.domain.liquidation_collection import (
    COHORT_BY_SIDE,
    LIQUIDATION_BUCKET_SECONDS,
    LIQUIDATION_HISTORY_PATH,
    QUOTA_CEILING,
    RETENTION_POINT_FLOOR,
    InvalidCadenceError,
    QuotaExhaustedError,
    RetryLedger,
    SlidingQuotaWindow,
    answered_symbols,
    first_whole_bucket_start,
    interleave_consulted_zeros,
    is_settled_bucket,
    liquidation_history_path,
    side_points,
    spread_interval_seconds,
    unanswered_symbols,
)
from src.modules.sentimento.domain.liquidation_zero_legitimacy import (
    LiquidationSide,
    NonMonotonicSidePointsError,
    SidePoint,
    classify_side_points,
)

_SYMBOL = "BTCUSDT_PERP.A"


# ── THE REQUEST PATH ──────────────────────────────────────────────────────────────────────


def test_the_path_always_asks_for_the_usd_notional() -> None:
    """`convert_to_usd=true` is present, because its absence is invisible in the response.

    The falsifier is not "the string contains the parameter" — it is the pairing: the provider's
    DEFAULT (`false`) returns BASE while `liquidation_catalog` labels the series `USD`/`quote`,
    and nothing in a `200` says which convention produced the digits
    `[MEDIDO 2026-09-12, gates/falsificador-denom-liquidacao.md: 0.003 vs 231.85, n=4 pares]`.
    """
    path = liquidation_history_path(_SYMBOL, 1_789_200_000, 1_789_210_000)
    assert "convert_to_usd=true" in path


def test_the_path_asks_the_one_minute_grid_and_one_symbol() -> None:
    """`interval=1min`, one symbol, and the window the caller asked for — nothing else."""
    path = liquidation_history_path(_SYMBOL, 1_789_200_000, 1_789_210_000)
    assert path.startswith(f"{LIQUIDATION_HISTORY_PATH}?symbols={_SYMBOL}")
    assert "interval=1min" in path
    assert "from=1789200000" in path
    assert "to=1789210000" in path
    assert path.count("symbols=") == 1


def test_the_path_prefix_matches_the_one_shot_endpoint_table() -> None:
    """The literal spelled here and the one the one-shot uses are the same endpoint.

    Two spellings of one path is the drift this pins: `LIQUIDATION_HISTORY_PATH` is written out
    rather than imported across a layer, so the pairing has to be executable or it is a comment.
    """
    assert ENDPOINT_PATH_BY_KIND[SeriesKind.LIQUIDATION] == LIQUIDATION_HISTORY_PATH


def test_an_inverted_window_is_refused_rather_than_sent() -> None:
    """A `from >= to` window requests no history, and a `200` for it would look like no data."""
    with pytest.raises(ValueError, match="inverted or empty window"):
        liquidation_history_path(_SYMBOL, 1_789_210_000, 1_789_200_000)


# ── `RS-3.1` — THE SLIDING WINDOW ─────────────────────────────────────────────────────────


def test_the_window_refuses_the_forty_first_call_inside_one_minute() -> None:
    """40 calls fit; the 41st is REFUSED, not logged — `DoD 6b`'s "recusa ultrapassar"."""
    window = SlidingQuotaWindow()
    for index in range(QUOTA_CEILING):
        window.spend(1_000.0 + index * 0.5)
    assert window.spent_in_window(1_020.0) == QUOTA_CEILING
    with pytest.raises(QuotaExhaustedError, match="41st call"):
        window.spend(1_020.0)


def test_a_tumbling_counter_would_have_allowed_eighty_in_one_minute_and_this_one_does_not() -> None:
    """THE MUTATION: the defect a per-minute reset counter would have, named and rejected.

    A tumbling counter resets on the minute boundary, so 40 calls at `t=59` and 40 more at
    `t=61` are both "within budget" while 80 landed inside one REAL 60-second window. This
    window expires timestamps individually, so at `t=61` it still remembers the 40 and refuses.
    """
    window = SlidingQuotaWindow()
    for index in range(QUOTA_CEILING):
        window.spend(59.0 + index * 0.01)
    assert window.spent_in_window(61.0) == QUOTA_CEILING
    with pytest.raises(QuotaExhaustedError):
        window.spend(61.0)


def test_the_window_frees_a_slot_exactly_when_the_oldest_call_slides_out() -> None:
    """The wait is COMPUTED from the oldest timestamp, never a fixed guess."""
    window = SlidingQuotaWindow(ceiling=2, window_seconds=60.0)
    window.spend(100.0)
    window.spend(110.0)
    assert window.seconds_until_room(120.0) == pytest.approx(40.0)
    assert not window.has_room(120.0)
    assert window.has_room(160.1)


def test_a_window_that_permits_no_call_is_refused_at_construction() -> None:
    """A ceiling below one paces nothing and would silently disable the collector."""
    with pytest.raises(ValueError, match="permits no call"):
        SlidingQuotaWindow(ceiling=0)
    with pytest.raises(ValueError, match="not a window"):
        SlidingQuotaWindow(window_seconds=0.0)


# ── `RS-3.6` — SPREAD, NEVER BURST ────────────────────────────────────────────────────────


def test_ten_calls_over_five_minutes_are_spread_not_bursted() -> None:
    """`300 s / 10 = 30 s` between calls — the SPEC's adopted cadence, spread.

    MÉDIA NÃO É PICO: at `0.0` the ten calls would all land in one sliding window, and the
    average of `2 u/min` would say nothing about it.
    """
    assert spread_interval_seconds(300.0, 10) == pytest.approx(30.0)


def test_the_spread_never_goes_below_the_blind_buckets_own_pace() -> None:
    """`60/40 = 1,5 s` is the floor — a cadence tighter than the bucket cannot be honoured."""
    assert spread_interval_seconds(10.0, 40) == pytest.approx(1.5)


def test_a_single_call_cycle_has_nothing_to_spread() -> None:
    """`n - 1` pauses for `n` calls: one call waits for nothing."""
    assert spread_interval_seconds(300.0, 1) == 0.0
    assert spread_interval_seconds(300.0, 0) == 0.0


def test_a_non_positive_cadence_is_refused() -> None:
    """A cadence of zero would make the cycle loop hammer a blind bucket immediately."""
    with pytest.raises(InvalidCadenceError):
        spread_interval_seconds(0.0, 10)
    with pytest.raises(InvalidCadenceError):
        spread_interval_seconds(300.0, -1)


# ── `RS-3.4` — THE NEWEST BUCKET IS PARTIAL ───────────────────────────────────────────────


def test_the_bucket_still_running_is_not_settled() -> None:
    """A bucket is final only once its END has passed — one millisecond before, it is not."""
    start = 1_789_200_660
    end_ms = (start + LIQUIDATION_BUCKET_SECONDS) * 1000
    assert is_settled_bucket(start, end_ms)
    assert not is_settled_bucket(start, end_ms - 1)


def test_writing_the_newest_bucket_would_be_the_lookahead_this_rejects() -> None:
    """THE MUTATION: the newest bucket of a response, read mid-bucket, is refused.

    `t` is the bucket START (measured: the `daily` series carried today's `t` while today was
    still running). So the newest `1min` bucket of any live response has not closed, and a
    collector that wrote it would publish a still-growing number as final — and because
    `as_of` returns `argmin(observed_at)`, the most truncated reading would be the permanent one.
    """
    now_ms = 1_789_200_690_000  # 30 s into the bucket that starts at 1_789_200_660
    assert not is_settled_bucket(1_789_200_660, now_ms)
    assert is_settled_bucket(1_789_200_600, now_ms)


# ── THE TWO SIDES ─────────────────────────────────────────────────────────────────────────


def test_the_cohort_of_each_wire_letter() -> None:
    """`l` is `long` and `s` is `short` — a swap produces a complete, plausible, wrong series."""
    assert COHORT_BY_SIDE[LiquidationSide.LONG] == LONG
    assert COHORT_BY_SIDE[LiquidationSide.SHORT] == SHORT
    assert LiquidationSide.LONG.value == "l"
    assert LiquidationSide.SHORT.value == "s"


def test_side_points_keeps_the_raw_digits_and_the_order() -> None:
    """One side's sequence, in `t` order, with the provider's digits untouched."""
    points = (
        DailyPoint(1_789_200_660, {"t": 1_789_200_660, "l": 231.85380000000004, "s": 0}),
        DailyPoint(1_789_202_220, {"t": 1_789_202_220, "l": 0, "s": 1468.8482}),
    )
    longs = side_points(points, LiquidationSide.LONG)
    assert [point.event_time for point in longs] == [1_789_200_660, 1_789_202_220]
    assert longs[0].raw_quantity == "231.85380000000004"
    shorts = side_points(points, LiquidationSide.SHORT)
    assert shorts[1].raw_quantity == "1468.8482"


def test_a_point_missing_a_side_letter_is_a_schema_change_not_an_empty_bucket() -> None:
    """A wire shape without `l` is a provider change, and swallowing it would hide it."""
    points = (DailyPoint(1_789_200_660, {"t": 1_789_200_660, "s": 5}),)
    with pytest.raises(MalformedCoinalizeResponseError, match="schema change"):
        side_points(points, LiquidationSide.LONG)


# ── `RS-3.7` — A SYMBOL ASKED FOR AND NOT ANSWERED ────────────────────────────────────────


def test_a_symbol_asked_for_and_not_answered_is_named() -> None:
    """The measured behaviour: 20 asked, 19 answered, and nothing in the response says so."""
    requested = [f"SYM{index}" for index in range(20)]
    answered = [symbol for symbol in requested if symbol != "SYM7"]
    assert unanswered_symbols(requested, answered) == ("SYM7",)


def test_every_symbol_answered_leaves_no_gap() -> None:
    """The instrument has to CALA as well as MORDE, or `rc=0` means nothing (`ADR-012`)."""
    requested = ["BTCUSDT", "ETHUSDT"]
    assert unanswered_symbols(requested, requested) == ()


def test_an_empty_history_is_not_an_unanswered_symbol() -> None:
    """THE MUTATION that a point count would get wrong, and it is 79,8% of this series.

    `[{"symbol": "X", "history": []}]` is the provider ANSWERING that this symbol had no
    liquidation in the window — the normal case in a series where only 20,2% of minutes carry
    one `[MEDIDO 2026-09-12, n=14.344 buckets]`. `[]` is the provider not answering at all.
    A collector reading `len(points)` calls both a gap, and then files 4 gaps per quiet cycle
    while the real dropped symbol is indistinguishable in the noise.
    """
    assert answered_symbols(b'[{"symbol": "BTCUSDT_PERP.A", "history": []}]') == ("BTCUSDT_PERP.A",)
    assert answered_symbols(b"[]") == ()


def test_a_body_that_is_not_an_array_is_refused_rather_than_read_as_empty() -> None:
    """Returning `()` for junk would report every symbol unanswered and bury the real one."""
    with pytest.raises(MalformedCoinalizeResponseError):
        answered_symbols(b'{"symbol": "X"}')
    with pytest.raises(MalformedCoinalizeResponseError):
        answered_symbols(b"not json")
    with pytest.raises(MalformedCoinalizeResponseError, match="missing 'symbol'"):
        answered_symbols(b'[{"history": []}]')


# ── `RS-3.3` — THE RETRY UNIT ─────────────────────────────────────────────────────────────


def test_the_retry_budget_is_spent_per_pair_and_not_shared() -> None:
    """One symbol exhausting its attempts leaves every other symbol's budget untouched.

    THE MUTATION this rejects is a cycle-level counter: with one, a single bad symbol would
    consume the budget of the whole sweep and the other nine would silently go unfetched.
    """
    ledger = RetryLedger(max_attempts=2)
    ledger.record_attempt("BTCUSDT", LIQUIDATION_HISTORY_PATH)
    ledger.record_attempt("BTCUSDT", LIQUIDATION_HISTORY_PATH)
    assert not ledger.may_retry("BTCUSDT", LIQUIDATION_HISTORY_PATH)
    assert ledger.may_retry("ETHUSDT", LIQUIDATION_HISTORY_PATH)
    assert ledger.attempts("ETHUSDT", LIQUIDATION_HISTORY_PATH) == 0


def test_the_ledger_forgets_between_cycles() -> None:
    """A pair that failed last cycle starts the next one with its full budget."""
    ledger = RetryLedger(max_attempts=1)
    ledger.record_attempt("BTCUSDT", LIQUIDATION_HISTORY_PATH)
    assert not ledger.may_retry("BTCUSDT", LIQUIDATION_HISTORY_PATH)
    ledger.reset()
    assert ledger.may_retry("BTCUSDT", LIQUIDATION_HISTORY_PATH)


def test_a_ledger_that_permits_no_attempt_is_refused() -> None:
    """`max_attempts=0` is a disabled collector wearing a retry policy's name."""
    with pytest.raises(ValueError, match="disabled collector"):
        RetryLedger(max_attempts=0)


# ── `T-05.2` — A CONSULTED, EMPTY MINUTE IS A CANDIDATE ZERO (`D3`, conditions 2–5) ───────────

# `m0` of the window: a whole minute (`1_789_200_600 / 60 = 29_820_010`).
_M0 = 1_789_200_600
# Ten closed minutes `m0..m9`; `m10` is in progress (`now = m10 + 30 s`).
_NOW_MS = (_M0 + 10 * LIQUIDATION_BUCKET_SECONDS + 30) * 1000


def _minute(index: int) -> int:
    """Return the start of minute `index` of the window."""
    return _M0 + index * LIQUIDATION_BUCKET_SECONDS


def _zero_times(points: tuple[SidePoint, ...]) -> list[int]:
    """Return the minutes that came back as a candidate `"0"`."""
    return [point.event_time for point in points if point.raw_quantity == "0"]


def test_every_settled_minute_without_a_point_becomes_a_candidate_zero() -> None:
    """Conditions 3 and 4: the nine empty closed minutes, and never the answered one."""
    settled = (SidePoint(event_time=_minute(3), raw_quantity="12.5"),)
    merged = interleave_consulted_zeros(
        settled, window_from_epoch_seconds=_M0, observed_at_ms=_NOW_MS, n_points_in_response=1
    )
    assert _zero_times(merged) == [_minute(i) for i in range(10) if i != 3]
    assert [point.event_time for point in merged] == [_minute(i) for i in range(10)]
    assert SidePoint(event_time=_minute(3), raw_quantity="12.5") in merged


def test_the_answered_minute_is_never_duplicated_by_a_candidate() -> None:
    """CALA: a wire zero at `m3` stays ONE point — a duplicate would trip the monotonic guard."""
    settled = (SidePoint(event_time=_minute(3), raw_quantity="0"),)
    merged = interleave_consulted_zeros(
        settled, window_from_epoch_seconds=_M0, observed_at_ms=_NOW_MS, n_points_in_response=1
    )
    assert [point.event_time for point in merged].count(_minute(3)) == 1
    classify_side_points(merged, seen_nonzero=True)  # strictly increasing, or this raises


def test_the_minute_in_progress_never_becomes_a_zero() -> None:
    """Condition 3 at its boundary: `m9` closes exactly at `m10`, and `m10` never qualifies.

    THE MUTATION: `<` for `<=` in `is_settled_bucket`, or a range one minute too long, moves
    the newest zero by one minute — and a zero published for a minute still running is the
    anti-lookahead rule inverted, frozen forever by `argmin(observed_at)`.
    """
    at_close = interleave_consulted_zeros(
        (),
        window_from_epoch_seconds=_M0,
        observed_at_ms=_minute(10) * 1000,
        n_points_in_response=0,
    )
    just_before = interleave_consulted_zeros(
        (),
        window_from_epoch_seconds=_M0,
        observed_at_ms=_minute(10) * 1000 - 1,
        n_points_in_response=0,
    )
    assert _zero_times(at_close)[-1] == _minute(9)
    assert _zero_times(just_before)[-1] == _minute(8)
    assert _minute(10) not in _zero_times(
        interleave_consulted_zeros(
            (), window_from_epoch_seconds=_M0, observed_at_ms=_NOW_MS, n_points_in_response=0
        )
    )


def test_a_misaligned_from_never_claims_the_minute_that_straddles_it() -> None:
    """Condition 2: `from = m0 + 1 s` starts the zeros at `m1`; `from = m0` starts them at `m0`.

    THE MUTATION: flooring instead of ceiling claims `m0`, whose first second the request may
    not have covered — the API's inclusivity of `from` is `[NÃO SEI]`.
    """
    misaligned = interleave_consulted_zeros(
        (), window_from_epoch_seconds=_M0 + 1, observed_at_ms=_NOW_MS, n_points_in_response=0
    )
    aligned = interleave_consulted_zeros(
        (), window_from_epoch_seconds=_M0, observed_at_ms=_NOW_MS, n_points_in_response=0
    )
    assert _zero_times(misaligned)[0] == _minute(1)
    assert _zero_times(aligned)[0] == _minute(0)
    assert first_whole_bucket_start(_M0 + 59) == _minute(1)
    assert first_whole_bucket_start(_M0) == _M0


def test_a_response_at_the_retention_floor_gets_no_zero_before_its_oldest_point() -> None:
    """Condition 5: `1.500` points may be a retention cut, `1.499` cannot be.

    THE MUTATION: without the guard, a re-population whose window outlived the provider's
    point-count retention `[DOC: docs/medicao-coinalyze.md §1.3]` would write `0` over minutes
    the provider had simply forgotten.
    """
    settled = (SidePoint(event_time=_minute(5), raw_quantity="3"),)
    at_floor = interleave_consulted_zeros(
        settled,
        window_from_epoch_seconds=_M0,
        observed_at_ms=_NOW_MS,
        n_points_in_response=RETENTION_POINT_FLOOR,
    )
    below_floor = interleave_consulted_zeros(
        settled,
        window_from_epoch_seconds=_M0,
        observed_at_ms=_NOW_MS,
        n_points_in_response=RETENTION_POINT_FLOOR - 1,
    )
    assert RETENTION_POINT_FLOOR == 1500
    assert _zero_times(at_floor) == [_minute(i) for i in range(6, 10)]
    assert _zero_times(below_floor) == [_minute(i) for i in range(10) if i != 5]


def test_a_response_at_the_floor_with_no_settled_point_gets_no_zero_at_all() -> None:
    """No oldest point to anchor on ⇒ the whole window may be past the retention cut."""
    assert (
        interleave_consulted_zeros(
            (),
            window_from_epoch_seconds=_M0,
            observed_at_ms=_NOW_MS,
            n_points_in_response=RETENTION_POINT_FLOOR,
        )
        == ()
    )


def test_a_disordered_wire_stays_disordered_so_the_monotonic_guard_still_fires() -> None:
    """A MERGE, not a sort: sorting here would repair the provider's order in silence."""
    settled = (
        SidePoint(event_time=_minute(4), raw_quantity="1"),
        SidePoint(event_time=_minute(2), raw_quantity="1"),
    )
    merged = interleave_consulted_zeros(
        settled, window_from_epoch_seconds=_M0, observed_at_ms=_NOW_MS, n_points_in_response=2
    )
    with pytest.raises(NonMonotonicSidePointsError):
        classify_side_points(merged, seen_nonzero=True)


def test_a_point_count_smaller_than_the_settled_points_is_refused() -> None:
    """The settled points are a subset of the response; fewer response points is a caller bug."""
    with pytest.raises(ValueError, match="subset of the response"):
        interleave_consulted_zeros(
            (SidePoint(event_time=_minute(1), raw_quantity="1"),),
            window_from_epoch_seconds=_M0,
            observed_at_ms=_NOW_MS,
            n_points_in_response=0,
        )
